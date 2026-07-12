"""
Context propagation para tools ejecutadas por LangGraph.

LangGraph ToolNode no facilita la inyección directa de metadata cuando
usamos StructuredTool con args_schema (la schema es visible al LLM).
En su lugar, el orchestrator setea contextvars antes de ejecutar las
tools y éstas las leen internamente para aislamiento multi-tenant.
"""
from contextvars import ContextVar
from typing import Optional


_current_user_id: ContextVar[Optional[str]] = ContextVar(
    "current_user_id", default=None
)
_current_confirmation_level: ContextVar[str] = ContextVar(
    "current_confirmation_level", default="destructive_only"
)


# Tools marcadas como "destructivas" — acciones públicas o con impacto externo
# que requieren confirmación explícita del usuario.
DESTRUCTIVE_TOOLS: set[str] = {
    "post_to_linkedin",
    "post_to_instagram",
    "schedule_post",
    "whatsapp_send_message",
    "whatsapp_send_notification",
    "calendar_create_event",
    "calendar_delete_event",
    "github_create_repo",
    "slack_post_message",
}


def set_current_user_id(user_id: Optional[str]) -> None:
    """Setea el user_id del request actual (llamado por el orchestrator)."""
    _current_user_id.set(user_id)


def get_current_user_id() -> Optional[str]:
    """Obtiene el user_id del request actual. Retorna None si no está seteado."""
    return _current_user_id.get()


def require_current_user_id() -> str:
    """
    Versión estricta: lanza RuntimeError si no hay user_id en contexto.
    Útil para tools que NO deben ejecutarse anónimamente.
    """
    uid = _current_user_id.get()
    if not uid:
        raise RuntimeError(
            "Tool invoked without user context. "
            "This tool requires authenticated user_id to enforce tenant isolation."
        )
    return uid


def set_confirmation_level(level: str) -> None:
    """Setea el tool_confirmation_level del usuario actual (always|destructive_only|never)."""
    _current_confirmation_level.set(level or "destructive_only")


def get_confirmation_level() -> str:
    """Obtiene el tool_confirmation_level actual."""
    return _current_confirmation_level.get()


def requires_confirmation(tool_name: str) -> bool:
    """
    Determina si un tool requiere confirmación según la preferencia del usuario.

    - always: todas las tools
    - destructive_only: solo las marcadas como destructivas
    - never: ninguna
    """
    level = get_confirmation_level()
    if level == "always":
        return True
    if level == "never":
        return False
    return tool_name in DESTRUCTIVE_TOOLS
