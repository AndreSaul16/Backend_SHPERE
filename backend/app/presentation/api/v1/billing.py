from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.errors import ErrorCode, billing_error, app_error
from app.core.plan_limits import validate_topup_tier, get_user_plan
from app.core.config import settings
from app.infrastructure.stripe_client import StripeClient, purchasable_skus
from app.infrastructure.database import get_users_collection

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_id: str


@router.post("/checkout")
async def create_checkout_session(
    req: CheckoutRequest,
    user: dict = Depends(get_current_user),
):
    # Guard: si Stripe no está configurado, devolver 503 claro en vez de un 500 críptico.
    if not settings.stripe_configured:
        raise billing_error(
            ErrorCode.BILLING_STRIPE_ERROR,
            503,
            "Los pagos no están disponibles en este momento. Inténtalo más tarde.",
        )

    # Validación de catálogo: el SKU solicitado debe ser un pack/top-up comprable.
    if not validate_topup_tier(user, req.plan_id):
        raise app_error(
            ErrorCode.BILLING_TOPUP_NOT_ALLOWED,
            403,
            "Producto no disponible.",
            current_plan=get_user_plan(user),
            requested=req.plan_id,
        )

    user_id = user["firebase_uid"]
    email = user["email"]
    try:
        url = StripeClient.create_checkout_session(user_id, req.plan_id, email)
        return {"url": url}
    except ValueError as e:
        raise billing_error(
            ErrorCode.BILLING_INVALID_PLAN, 400, str(e), plan_id=req.plan_id
        )
    except Exception as e:
        raise billing_error(
            ErrorCode.BILLING_STRIPE_ERROR, 500, f"Stripe error: {e}"
        )


@router.post("/portal")
async def create_portal_session(user: dict = Depends(get_current_user)):
    if not settings.stripe_configured:
        raise billing_error(
            ErrorCode.BILLING_STRIPE_ERROR,
            503,
            "La gestión de suscripción no está disponible en este momento.",
        )
    user_id = user["firebase_uid"]
    # Leer fresco de Mongo: el customer_id puede haberse seteado vía webhook
    # entre el login y este request, por lo que el dict `user` puede estar desactualizado.
    users_col = get_users_collection()
    fresh = await users_col.find_one(
        {"firebase_uid": user_id},
        {"subscription.stripe_customer_id": 1},
    )
    stripe_customer_id = ((fresh or {}).get("subscription") or {}).get("stripe_customer_id")
    if not stripe_customer_id:
        # Mantener 404 sin body estructurado para compatibilidad con tests existentes.
        raise HTTPException(status_code=404, detail="No stripe customer found")
    try:
        url = StripeClient.create_billing_portal_session(stripe_customer_id)
        return {"url": url}
    except Exception as e:
        raise billing_error(
            ErrorCode.BILLING_STRIPE_ERROR, 500, f"Stripe error: {e}"
        )


@router.get("/me")
async def get_billing_info(user: dict = Depends(get_current_user)):
    user_id = user["firebase_uid"]
    # Leer fresco de Mongo: balance/limits cambian en cada inferencia.
    users_col = get_users_collection()
    fresh = await users_col.find_one({"firebase_uid": user_id})
    if not fresh:
        raise HTTPException(status_code=404, detail="User not found")

    sub = fresh.get("subscription") or {}
    wallet = fresh.get("wallet") or {}
    limits = fresh.get("limits") or {}
    return {
        "plan_id": sub.get("plan_id", "free"),
        "status": sub.get("status", "active"),
        "current_period_end": sub.get("current_period_end"),
        "cancel_at_period_end": sub.get("cancel_at_period_end", False),
        "pro_messages_balance": wallet.get("pro_messages_balance", 0),
        "topup_messages_balance": wallet.get("topup_messages_balance", 0),
        "rag_storage_bytes_used": limits.get("rag_storage_bytes_used", 0),
        "custom_agents_count": limits.get("custom_agents_count", 0),
        "stripe_configured": settings.stripe_configured,
        # QA-3: `stripe_configured` sólo mira la clave secreta, así que no dice
        # nada de si un SKU concreto tiene precio. Sin esto, la elegibilidad de
        # compra sólo se descubría con un 400 después de pulsar.
        "purchasable_skus": purchasable_skus(),
    }
