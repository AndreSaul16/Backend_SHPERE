import hmac
import json
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.logger import api_logger as logger
from app.core.plan_limits import validate_topup_tier, get_user_plan
from app.infrastructure.database import db
from app.infrastructure.tools.n8n_client import canonical_sign

router = APIRouter()

stripe.api_key = settings.STRIPE_SECRET_KEY


def _claim_grant(transactions_col, tx_doc: dict) -> bool:
    """Reclama un grant ligado a un evento Stripe insertando su registro de
    transacción (único por stripe_event_id). Devuelve True si se reclamó (hay que
    aplicar el grant al wallet) o False si ya estaba aplicado (idempotente).

    Orden deliberado: SIEMPRE reclamar antes de mutar el wallet. Así un retry del
    webhook nunca duplica créditos; en el peor caso (crash entre claim y mutación)
    queda un registro de transacción sin aplicar, detectable y compensable —
    preferible a un doble cobro silencioso.
    """
    try:
        transactions_col.insert_one(tx_doc)
        return True
    except DuplicateKeyError:
        logger.info(
            f"Grant para evento {tx_doc.get('stripe_event_id')} ya aplicado; "
            "skip idempotente."
        )
        return False


def _ts_to_dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


def _resolve_plan_from_metadata(obj) -> str | None:
    """Lee plan_id de la metadata del objeto Stripe (session/subscription)."""
    md = obj.get("metadata") or {}
    return md.get("plan_id")


def _grant_subscription(users_col, user_id: str, plan_id: str, customer_id: str,
                        subscription_id: str | None, period_end: datetime | None):
    """Asigna plan, otorga balance del periodo y actualiza datos Stripe."""
    plan_messages = settings.plan_messages_map.get(plan_id, 0)
    update = {
        "$set": {
            "subscription.plan_id": plan_id,
            "subscription.status": "active",
            "subscription.stripe_customer_id": customer_id,
            "subscription.stripe_subscription_id": subscription_id,
            "subscription.current_period_end": period_end,
            "subscription.cancel_at_period_end": False,
            "wallet.pro_messages_balance": plan_messages,
            "wallet.pro_messages_granted_this_period": plan_messages,
            "wallet.last_period_reset": datetime.now(timezone.utc),
        }
    }
    users_col.update_one({"firebase_uid": user_id}, update)


def _grant_topup(users_col, user_id: str, plan_id: str):
    """Suma mensajes de top-up al wallet del usuario."""
    topup_messages = settings.topup_messages_map.get(plan_id, 0)
    if topup_messages <= 0:
        logger.warning(f"Top-up plan_id desconocido: {plan_id}")
        return
    users_col.update_one(
        {"firebase_uid": user_id},
        {"$inc": {"wallet.topup_messages_balance": topup_messages}},
    )


@router.post("/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    # construct_event valida firma + secret. En tests se mockea esta función.
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET or ""
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        # Cualquier otro error de construct_event = firma inválida.
        logger.warning(f"Stripe webhook construct_event failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    db_client = db.get_sync_client()[settings.DB_NAME]
    events_col = db_client["stripe_events_processed"]
    users_col = db_client["users"]
    transactions_col = db_client["credit_transactions"]
    failed_col = db_client["failed_payments"]

    event_id = event["id"]
    event_type = event["type"]
    obj = event["data"]["object"]

    # Idempotencia atómica (A2): reclamamos el evento ANTES de procesar.
    # El _id único hace de lock natural. find_one_and_update con upsert nos dice si
    # ya existía y en qué estado:
    #   - None  → primer intento, lo acabamos de marcar "processing".
    #   - doc con status "done"       → ya procesado, salimos.
    #   - doc con status "processing" → un intento previo crasheó a mitad; reintentamos
    #     de forma idempotente (los grants se protegen con el índice único en
    #     credit_transactions.stripe_event_id, así que no hay doble-grant).
    existing = events_col.find_one_and_update(
        {"_id": event_id},
        {"$setOnInsert": {
            "type": event_type,
            "status": "processing",
            "received_at": datetime.now(timezone.utc),
        }},
        upsert=True,
        return_document=ReturnDocument.BEFORE,
    )
    if existing is not None:
        if existing.get("status") == "done":
            return {"status": "already processed"}
        logger.warning(
            f"Webhook {event_id} estaba en '{existing.get('status')}' — reintento "
            "idempotente (un intento previo no terminó)."
        )

    logger.info(f"Stripe webhook: {event_type} ({event_id})")

    try:
        if event_type == "checkout.session.completed":
            user_id = obj.get("client_reference_id")
            customer_id = obj.get("customer")
            mode = obj.get("mode")  # "subscription" | "payment"
            plan_id = _resolve_plan_from_metadata(obj)

            if not user_id or not plan_id:
                logger.error(f"checkout.session.completed sin user_id/plan_id: {obj.get('id')}")
                # A2: NO perdemos la compra en silencio. La registramos para que
                # soporte pueda compensar, y devolvemos 200 (marcando done abajo)
                # para que Stripe no reintente eternamente.
                failed_col.insert_one({
                    "event_id": event_id,
                    "type": event_type,
                    "reason": "missing_user_id_or_plan_id",
                    "stripe_object": obj,
                    "created_at": datetime.now(timezone.utc),
                })
            elif mode == "subscription":
                subscription_id = obj.get("subscription")
                # Resolver period_end consultando la subscripción (session no lo trae siempre).
                period_end = None
                if subscription_id:
                    try:
                        sub = stripe.Subscription.retrieve(subscription_id)
                        period_end = _ts_to_dt(sub.get("current_period_end"))
                    except Exception as e:
                        logger.warning(f"No pude leer subscription {subscription_id}: {e}")
                # Claim idempotente antes de mutar el wallet (A2).
                if _claim_grant(transactions_col, {
                    "user_id": user_id,
                    "delta": settings.plan_messages_map.get(plan_id, 0),
                    "balance_source": "plan",
                    "reason": "subscription_grant",
                    "stripe_event_id": event_id,
                    "created_at": datetime.now(timezone.utc),
                }):
                    _grant_subscription(users_col, user_id, plan_id, customer_id, subscription_id, period_end)
            elif mode == "payment":  # top-up
                # Defense-in-depth: validar que el top-up corresponde al tier del usuario
                user_doc = users_col.find_one({"firebase_uid": user_id})
                if user_doc and not validate_topup_tier(user_doc, plan_id):
                    logger.warning(
                        f"WEBHOOK SECURITY: cross-tier top-up rechazado. "
                        f"user={user_id} tier={get_user_plan(user_doc)} "
                        f"topup={plan_id} event={event_id}"
                    )
                    # No otorgamos créditos pero NO rompemos el webhook
                    # (Stripe reintentaría por siempre)
                else:
                    # Claim idempotente antes del $inc (A2).
                    if _claim_grant(transactions_col, {
                        "user_id": user_id,
                        "delta": settings.topup_messages_map.get(plan_id, 0),
                        "balance_source": "topup",
                        "reason": "topup_purchase",
                        "stripe_event_id": event_id,
                        "created_at": datetime.now(timezone.utc),
                    }):
                        _grant_topup(users_col, user_id, plan_id)

        elif event_type == "invoice.payment_succeeded":
            # Renovación de suscripción → reset del balance del periodo.
            customer_id = obj.get("customer")
            subscription_id = obj.get("subscription")
            if subscription_id:
                user = users_col.find_one({"subscription.stripe_subscription_id": subscription_id})
                if user:
                    plan_id = (user.get("subscription") or {}).get("plan_id", "free")
                    plan_messages = settings.plan_messages_map.get(plan_id, 0)
                    period_end = None
                    try:
                        sub = stripe.Subscription.retrieve(subscription_id)
                        period_end = _ts_to_dt(sub.get("current_period_end"))
                    except Exception as sub_err:
                        logger.error(
                            f"No se pudo obtener current_period_end para suscripción "
                            f"{subscription_id}: {sub_err}. El campo quedará como None."
                        )
                    # Claim idempotente: si este evento ya reseteó el periodo, no
                    # repetimos el $set (inofensivo) ni duplicamos la transacción.
                    if _claim_grant(transactions_col, {
                        "user_id": user.get("firebase_uid"),
                        "delta": plan_messages,
                        "balance_source": "plan",
                        "reason": "period_reset",
                        "stripe_event_id": event_id,
                        "created_at": datetime.now(timezone.utc),
                    }):
                        users_col.update_one(
                            {"_id": user["_id"]},
                            {"$set": {
                                "subscription.status": "active",
                                "subscription.current_period_end": period_end,
                                "wallet.pro_messages_balance": plan_messages,
                                "wallet.pro_messages_granted_this_period": plan_messages,
                                "wallet.last_period_reset": datetime.now(timezone.utc),
                            }},
                        )

        elif event_type == "invoice.payment_failed":
            subscription_id = obj.get("subscription")
            if subscription_id:
                users_col.update_one(
                    {"subscription.stripe_subscription_id": subscription_id},
                    {"$set": {"subscription.status": "past_due"}},
                )

        elif event_type == "customer.subscription.updated":
            subscription_id = obj.get("id")
            period_end = _ts_to_dt(obj.get("current_period_end"))
            cancel_at_period_end = obj.get("cancel_at_period_end", False)
            status = obj.get("status", "active")
            users_col.update_one(
                {"subscription.stripe_subscription_id": subscription_id},
                {"$set": {
                    "subscription.current_period_end": period_end,
                    "subscription.cancel_at_period_end": cancel_at_period_end,
                    "subscription.status": status,
                }},
            )

        elif event_type == "customer.subscription.deleted":
            subscription_id = obj.get("id")
            # El plan ha terminado. Bajamos a free, conservamos top-ups.
            users_col.update_one(
                {"subscription.stripe_subscription_id": subscription_id},
                {"$set": {
                    "subscription.plan_id": "free",
                    "subscription.status": "canceled",
                    "subscription.stripe_subscription_id": None,
                    "subscription.cancel_at_period_end": False,
                    "wallet.pro_messages_balance": settings.plan_messages_map["free"],
                    "wallet.pro_messages_granted_this_period": settings.plan_messages_map["free"],
                    "wallet.last_period_reset": datetime.now(timezone.utc),
                }},
            )

        else:
            logger.info(f"Stripe event no manejado: {event_type}")

    except Exception as e:
        logger.error(f"Error procesando webhook {event_type}: {e}")
        # Dejamos el evento en estado "processing" (no lo marcamos done) → Stripe
        # reintentará y el reintento re-entra de forma idempotente.
        raise HTTPException(status_code=500, detail="webhook_processing_error")

    # Éxito: marcamos el evento como procesado definitivamente.
    events_col.update_one(
        {"_id": event_id},
        {"$set": {"status": "done", "processed_at": datetime.now(timezone.utc)}},
    )
    return {"status": "success"}


# ---------------------------------------------------------------------------
# Webhook n8n → backend (F9)
# ---------------------------------------------------------------------------


def verify_n8n_signature(payload: dict, signature: str | None) -> bool:
    """Verifica la firma HMAC del webhook n8n→backend.

    Usa canonical_sign (misma forma canónica que n8n_client._sign) y comparación
    en tiempo constante. Firma ausente → False.
    """
    if not signature:
        return False
    secret = (settings.N8N_WEBHOOK_SECRET or "").strip()
    if not secret:
        # Sin secreto configurado la firma se calcularía con clave vacía y sería
        # trivialmente falsificable (el esquema canónico es público). Rechazar
        # todo en vez de aceptar firmas forjables.
        logger.warning("Webhook n8n rechazado: N8N_WEBHOOK_SECRET no configurado")
        return False
    expected = canonical_sign(payload, secret)
    return hmac.compare_digest(expected, signature)


async def _notify_schedule_post_result(payload: dict) -> None:
    """Notifica por WhatsApp el resultado de una publicación programada (best-effort).

    Decisión por defecto: el destino se toma de la credencial WhatsApp del usuario
    (metadata `notify_to`). Si no está configurado, solo se registra en logs.
    """
    from app.core.tool_context import set_current_user_id
    from app.infrastructure.tools.credential_injector import inject_credentials_into_payload
    from app.infrastructure.tools.n8n_client import n8n_client

    user_id = payload.get("user_id")
    platform = payload.get("platform", "?")
    success = bool(payload.get("success"))
    detail = payload.get("detail", "")

    # user_id DEBE ser string: si llega un dict (p. ej. {"$ne": null}) acabaría en
    # una query Mongo como operador. Defensa en profundidad tras la firma HMAC.
    if not user_id or not isinstance(user_id, str):
        return

    set_current_user_id(user_id)
    try:
        estado = "se publicó correctamente" if success else "falló"
        message = f"Tu publicación programada en {platform} {estado}. {detail}".strip()
        base, creds = await inject_credentials_into_payload({"message": message}, ["whatsapp"])
        wa = (creds or {}).get("whatsapp") or {}
        target = wa.get("notify_to")
        if wa.get("access_token") and target:
            base["group"] = target
            await n8n_client.call_webhook("shared/whatsapp-notify", base, user_credentials=creds)
            logger.info(f"Webhook n8n: notificado a {user_id} por WhatsApp ({platform})")
        else:
            logger.info(
                f"Webhook n8n: WhatsApp no configurado o sin destino para {user_id}; solo log."
            )
    except Exception as e:
        logger.warning(f"No se pudo notificar schedule_post_result a {user_id}: {e}")
    finally:
        set_current_user_id(None)


@router.post("/n8n")
async def n8n_webhook(request: Request):
    """Recibe eventos de n8n (p. ej. resultado de una publicación programada).

    Verifica la firma HMAC (X-Webhook-Signature) antes de procesar. Siempre loguea.
    """
    # Rate-limit por IP: endpoint sin auth, evita enumeración/abuso de user_id.
    from app.core.rate_limit import chat_rate_limiter

    client_ip = request.client.host if request.client else "unknown"
    if not chat_rate_limiter.try_acquire(f"n8n-webhook:{client_ip}", times=60, seconds=60):
        raise HTTPException(status_code=429, detail="Demasiadas peticiones")

    raw = await request.body()
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload inválido")

    signature = request.headers.get("X-Webhook-Signature")
    if not verify_n8n_signature(payload, signature):
        logger.warning("Webhook n8n rechazado: firma inválida o ausente")
        raise HTTPException(status_code=401, detail="Firma inválida")

    event_type = payload.get("type")
    logger.info(f"Webhook n8n recibido: type={event_type} user={payload.get('user_id')}")

    if event_type == "schedule_post_result":
        await _notify_schedule_post_result(payload)
    else:
        logger.info(f"Webhook n8n: tipo no manejado '{event_type}'")

    return {"status": "ok"}
