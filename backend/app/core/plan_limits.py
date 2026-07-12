"""
Límites por plan de suscripción.
Fuente única de verdad para caps de RAG, agentes custom, API access, etc.
"""
from typing import Iterable

from fastapi import Depends

from app.core.auth import get_current_user
from app.core.errors import ErrorCode, app_error


# Modelo solo-créditos: existe un único plan ("free"). La monetización es 100%
# por consumo de créditos, así que las entitlements de capacidad (RAG, agentes
# custom, API) son uniformes — no se gatean por tier (no hay tiers).
# Mantenemos las claves starter/premium por compatibilidad con documentos de
# usuario antiguos, pero ya no se asignan.

# Cuota de RAG en bytes por plan.
RAG_QUOTA_BYTES = {
    "free": 20 * 1024 * 1024,        # 20 MB
    "starter": 20 * 1024 * 1024,
    "premium": 20 * 1024 * 1024,
}

# Máximo de agentes custom por plan.
# 0 = no permite crear; -1 = ilimitado.
MAX_CUSTOM_AGENTS = {
    "free": -1,
    "starter": -1,
    "premium": -1,
}

# Planes que tienen acceso a la API.
API_ACCESS_PLANS = {"free", "starter", "premium"}

# Rate limiting por plan: (requests, seconds) para chat/stream.
RATE_LIMIT_CHAT_BY_PLAN = {
    "free": (60, 60),
    "starter": (60, 60),
    "premium": (60, 60),
}

# Rate limiting general (billing, sessions, agents): (requests, seconds).
RATE_LIMIT_GENERAL_BY_PLAN = {
    "free": (120, 60),
    "starter": (120, 60),
    "premium": (120, 60),
}

# SKUs de créditos que cada usuario puede comprar. Con un único plan, todos
# pueden comprar cualquier pack o top-up.
PURCHASABLE_SKUS: set[str] = {
    "executive",
    "director",
    "boardroom",
    "quick_meeting",
    "deep_dive",
}

def get_user_plan(user: dict) -> str:
    """Devuelve el plan_id del usuario desde el documento de MongoDB."""
    return (user.get("subscription") or {}).get("plan_id", "free")


def validate_topup_tier(user: dict, topup_plan_id: str) -> bool:
    """Valida que el SKU de créditos solicitado sea comprable.

    Modelo solo-créditos: ya no hay restricción por tier (un único plan), así que
    basta con que el SKU exista en el catálogo comprable. Se mantiene la firma
    (recibe `user`) por compatibilidad con sus llamadores.
    """
    return topup_plan_id in PURCHASABLE_SKUS


def get_plan_id(user: dict) -> str:
    return (user.get("subscription") or {}).get("plan_id", "free")


def get_rag_quota_bytes(plan_id: str) -> int:
    return RAG_QUOTA_BYTES.get(plan_id, RAG_QUOTA_BYTES["free"])


def get_max_custom_agents(plan_id: str) -> int:
    return MAX_CUSTOM_AGENTS.get(plan_id, 0)


def has_api_access(plan_id: str) -> bool:
    return plan_id in API_ACCESS_PLANS


def require_plan(allowed_plans: Iterable[str]):
    """
    FastAPI dependency: rechaza con 403 si el plan del usuario no está permitido.
    Uso:
        @router.get("/api-only", dependencies=[Depends(require_plan({"premium"}))])
    """
    allowed = set(allowed_plans)

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        plan_id = get_plan_id(user)
        if plan_id not in allowed:
            raise app_error(
                ErrorCode.PERM_PLAN_NOT_ALLOWED,
                403,
                "Tu plan no incluye esta funcionalidad.",
                current_plan=plan_id,
                allowed_plans=sorted(allowed),
            )
        return user

    return _check
