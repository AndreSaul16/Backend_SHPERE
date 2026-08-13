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


# Herramientas retiradas del catálogo: nombre → por qué.
#
# Estar aquí significa que no se registran, así que ningún rol las recibe y su
# esquema no se le bindea al LLM. NO significa borrarlas: el código de cada
# tool, su esquema y los workflows de n8n siguen en el repositorio, de modo que
# reactivar una es borrar su línea de este diccionario.
#
# Las cinco vienen de la auditoría de herramientas: su endpoint externo ya no
# responde a lo que la tool le pide, y arreglarlas es una integración nueva, no
# un parche. Ofrecerlas mientras tanto es prometer algo que falla al usarse.
RETIRED_TOOLS: dict[str, str] = {
    "create_jules_task": "El endpoint es api.jules.google; migrar a jules.googleapis.com es una integración nueva (auth + v1alpha/sessions).",
    "check_jules_status": "Mismo endpoint retirado que create_jules_task.",
    "review_jules_output": "Mismo endpoint retirado que create_jules_task.",
    "get_market_analysis": "El proveedor retiró `function=SECTOR`; get_stock_data cubre la demanda financiera.",
    "whatsapp_read_messages": "Los mensajes entrantes de Cloud API llegan por webhook, no por GET: reimplementarlo es infraestructura, no un parche.",
}


def register_shared_tool(tool: BaseTool):
    """Registra una herramienta disponible para todos los agentes."""
    if tool.name in RETIRED_TOOLS:
        return
    SHARED_TOOLS.append(apply_confirmation_gate(tool))


def register_role_tool(role: str, tool: BaseTool):
    """Registra una herramienta específica para un rol."""
    if tool.name in RETIRED_TOOLS:
        return
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
