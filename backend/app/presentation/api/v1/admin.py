"""
Panel de administración (F4 + F5).

- require_admin: solo emails en settings.ADMIN_EMAILS.
- Gestión de créditos: ver usuarios, ajustar saldo, ver transacciones.
- Métricas de coste/margen agregadas sobre credit_transactions.
"""
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.logger import api_logger as logger
from app.infrastructure.database import get_users_collection, db

router = APIRouter()


# --- Autorización admin ---


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Deja pasar solo a los emails configurados en ADMIN_EMAILS. 403 si no.

    Exige email verificado: el claim `email` de Firebase se rellena aunque el
    correo no esté verificado, así que sin este check un atacante podría
    registrar el email de un admin (sin verificarlo) y colarse en el panel.
    """
    email = (user.get("email") or "").strip().lower()
    if not email or email not in settings.admin_emails_list:
        raise HTTPException(status_code=403, detail="Sin acceso")
    if user.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Sin acceso")
    return user


def _transactions_col():
    return db.get_async_db()["credit_transactions"]


# --- F4: gestión de créditos ---


class AdminUser(BaseModel):
    uid: str
    email: Optional[str] = None
    plan: str = "free"
    pro_messages_balance: int = 0
    topup_messages_balance: int = 0


@router.get("/users", response_model=List[AdminUser])
async def list_users(
    q: Optional[str] = None,
    limit: int = 50,
    _admin: dict = Depends(require_admin),
):
    """Lista usuarios; filtra por email o uid con `q` (substring, case-insensitive)."""
    users_col = get_users_collection()
    query: dict = {}
    if q:
        rx = re.escape(q)
        query = {"$or": [
            {"email": {"$regex": rx, "$options": "i"}},
            {"firebase_uid": {"$regex": rx, "$options": "i"}},
        ]}

    cursor = users_col.find(query).limit(min(limit, 200))
    result = []
    async for doc in cursor:
        wallet = doc.get("wallet") or {}
        result.append(AdminUser(
            uid=doc.get("firebase_uid", ""),
            email=doc.get("email"),
            plan=(doc.get("subscription") or {}).get("plan_id", "free"),
            pro_messages_balance=wallet.get("pro_messages_balance", 0),
            topup_messages_balance=wallet.get("topup_messages_balance", 0),
        ))
    return result


class AdjustRequest(BaseModel):
    delta: int = Field(..., description="Créditos a sumar (positivo) o restar (negativo)")
    reason: str = Field(..., min_length=1, max_length=500)


@router.post("/users/{uid}/adjust")
async def adjust_user_credits(
    uid: str,
    body: AdjustRequest,
    admin: dict = Depends(require_admin),
):
    """Ajusta manualmente el saldo top-up del usuario y registra la transacción.

    Decisión por defecto: los ajustes manuales van a topup_messages_balance
    (no caduca), no al balance de plan.
    """
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="delta no puede ser 0")

    users_col = get_users_collection()
    # Un delta negativo mayor que el saldo dejaría el balance en negativo, y una
    # compra posterior (que hace $inc) "absorbería" esa deuda → el usuario perdería
    # créditos pagados. Para restar, exigir atómicamente saldo suficiente.
    query = {"firebase_uid": uid}
    if body.delta < 0:
        query["wallet.topup_messages_balance"] = {"$gte": -body.delta}
    result = await users_col.find_one_and_update(
        query,
        {"$inc": {"wallet.topup_messages_balance": body.delta}},
        return_document=True,
    )
    if not result:
        if body.delta < 0:
            # Distinguir "usuario no existe" de "saldo insuficiente para restar".
            exists = await users_col.find_one({"firebase_uid": uid}, {"_id": 1})
            if exists:
                raise HTTPException(
                    status_code=400,
                    detail="Saldo top-up insuficiente para restar esa cantidad",
                )
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    balance_after = (result.get("wallet") or {}).get("topup_messages_balance", 0)
    await _transactions_col().insert_one({
        "_id": f"tx_{uuid.uuid4().hex}",
        "user_id": uid,
        "delta": body.delta,
        "balance_after": balance_after,
        "balance_source": "topup",
        "reason": "manual_adjustment",
        "created_at": datetime.now(timezone.utc),
        "metadata": {"admin_email": admin.get("email"), "note": body.reason},
    })
    logger.info(
        f"ADMIN adjust: {admin.get('email')} ajustó {body.delta} a {uid} ({body.reason})"
    )
    return {"uid": uid, "delta": body.delta, "topup_messages_balance": balance_after}


@router.get("/transactions")
async def list_transactions(
    uid: Optional[str] = None,
    limit: int = 50,
    _admin: dict = Depends(require_admin),
):
    """Lista transacciones (opcionalmente de un usuario), más recientes primero."""
    query = {"user_id": uid} if uid else {}
    cursor = _transactions_col().find(query).sort("created_at", -1).limit(min(limit, 200))
    txs = []
    async for doc in cursor:
        doc["_id"] = str(doc.get("_id", ""))
        txs.append(doc)
    return {"transactions": txs}


# --- F5: métricas de coste/margen ---

# Clasificación de transacciones por `reason`.
_CONSUMPTION_REASONS = {"inference", "inference_extra_tokens"}
_REFUND_REASONS = {
    "inference_failed",
    "client_disconnected",
    "stream_setup_failed",
    "scheduled_board_failed",
    "board_triage_reduced",
}
_PURCHASE_REASONS = {"subscription_grant", "topup_purchase"}
# Un board meeting cuesta 5 créditos; lo usamos para distinguir debate de chat.
_BOARD_MESSAGES = 5


def _empty_bucket() -> dict:
    return {
        "credits_consumed": 0,
        "cost_usd_estimated": 0.0,
        "cost_usd_actual": 0.0,
        "debates": 0,
        "chats": 0,
        "refunds": 0,
    }


def aggregate_credit_metrics(transactions: list, days: int = 30) -> dict:
    """Agrega métricas por día y totales a partir de una lista de transacciones.

    Pura y testeable (sin Mongo): recibe los docs ya materializados.
    """
    by_day: dict[str, dict] = {}
    totals = _empty_bucket()
    totals["purchases_count"] = 0
    totals["credits_granted"] = 0

    for tx in transactions:
        created = tx.get("created_at")
        day = created.date().isoformat() if isinstance(created, datetime) else "unknown"
        bucket = by_day.setdefault(day, _empty_bucket())

        delta = tx.get("delta", 0) or 0
        reason = tx.get("reason", "")

        # Coste USD: se suma donde aparezca (estimado en el cargo, actual en el ajuste).
        est = tx.get("cost_usd_estimated") or 0.0
        act = tx.get("cost_usd_actual") or 0.0
        bucket["cost_usd_estimated"] += est
        bucket["cost_usd_actual"] += act
        totals["cost_usd_estimated"] += est
        totals["cost_usd_actual"] += act

        if reason in _CONSUMPTION_REASONS and delta < 0:
            consumed = -delta
            bucket["credits_consumed"] += consumed
            totals["credits_consumed"] += consumed
            if reason == "inference":
                if (tx.get("counted_as_messages") or 0) >= _BOARD_MESSAGES:
                    bucket["debates"] += 1
                    totals["debates"] += 1
                else:
                    bucket["chats"] += 1
                    totals["chats"] += 1
        elif reason in _REFUND_REASONS and delta > 0:
            bucket["refunds"] += delta
            totals["refunds"] += delta
        elif reason in _PURCHASE_REASONS and delta > 0:
            totals["purchases_count"] += 1
            totals["credits_granted"] += delta

    return {
        "days": days,
        "by_day": [{"date": d, **by_day[d]} for d in sorted(by_day.keys())],
        "totals": totals,
    }


@router.get("/metrics")
async def get_metrics(days: int = 30, _admin: dict = Depends(require_admin)):
    """Métricas de coste/margen de los últimos `days` días."""
    days = max(1, min(days, 365))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = _transactions_col().find({"created_at": {"$gte": cutoff}})
    txs = [doc async for doc in cursor]
    return aggregate_credit_metrics(txs, days)
