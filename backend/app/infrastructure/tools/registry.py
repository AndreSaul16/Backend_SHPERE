"""
Tool Registry: mapea roles de agentes a sus herramientas disponibles.
Shared tools (Calendar, WhatsApp) se agregan a todos los roles.
"""
from langchain_core.tools import BaseTool

from app.infrastructure.tools.confirmation import apply_confirmation_gate

# Tools compartidas (se llenan al importar shared_tools)
SHARED_TOOLS: list[BaseTool] = []

# Tools específicas por rol (se llenan al importar cada módulo)
ROLE_TOOLS: dict[str, list[BaseTool]] = {
    "CEO": [],
    "CTO": [],
    "CFO": [],
    "CMO": [],
}


def register_shared_tool(tool: BaseTool):
    """Registra una herramienta disponible para todos los agentes."""
    SHARED_TOOLS.append(apply_confirmation_gate(tool))


def register_role_tool(role: str, tool: BaseTool):
    """Registra una herramienta específica para un rol."""
    if role not in ROLE_TOOLS:
        ROLE_TOOLS[role] = []
    ROLE_TOOLS[role].append(apply_confirmation_gate(tool))


def get_tools_for_role(role: str) -> list[BaseTool]:
    """
    Retorna todas las herramientas disponibles para un rol:
    shared tools + role-specific tools.

    Retorna lista vacía para roles sin tools (custom agents, etc.)
    """
    role_specific = ROLE_TOOLS.get(role, [])
    return SHARED_TOOLS + role_specific


def load_all_tools():
    """
    Importa todos los módulos de tools para activar sus registros.
    Llamar una vez al inicio de la aplicación.
    """
    import app.infrastructure.tools.shared_tools   # noqa: F401
    import app.infrastructure.tools.ceo_tools      # noqa: F401
    import app.infrastructure.tools.cfo_tools      # noqa: F401
    import app.infrastructure.tools.cmo_tools      # noqa: F401
    import app.infrastructure.tools.cto_tools      # noqa: F401
    import app.infrastructure.tools.oauth_tools    # noqa: F401
