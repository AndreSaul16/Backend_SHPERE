import os
from pathlib import Path
from typing import TypedDict, Literal, List, Optional, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv

# Importar RAG, DB y Logger
from app.core.rag import retrieve_context
from app.core.database import db, get_custom_agents_collection
from app.core.logger import checkpoint_logger as logger
from langgraph.checkpoint.mongodb import MongoDBSaver

# Tool Registry
from app.tools.registry import get_tools_for_role

# Cargar Entorno (ruta absoluta desde este archivo)
env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

# --- CONFIG DEEPSEEK ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# Modelo Rápido (Router)
llm_router = ChatOpenAI(
    model="deepseek-chat", 
    openai_api_key=DEEPSEEK_API_KEY,
    openai_api_base=DEEPSEEK_BASE_URL,
    temperature=0,
    streaming=True  # Habilitar streaming de tokens
)

# Modelo Inteligente (Agente Experto)
llm_expert = ChatOpenAI(
    model="deepseek-chat", 
    openai_api_key=DEEPSEEK_API_KEY,
    openai_api_base=DEEPSEEK_BASE_URL,
    temperature=0.3,
    streaming=True  # Habilitar streaming de tokens
)

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    next_agent: str # Literal["CEO", "CTO", "CFO", "CMO", "FINAL"] o un Custom ID
    query: str
    final_response: str
    target_role: Optional[str]
    system_prompt: Optional[str] # Nuevo campo para prompts dinámicos
    model_config: Optional[dict] # Modelo/temp del agente custom
    tool_calls_remaining: int    # Anti-loop: máximo iteraciones de tool-calling

# --- PROMPTS ---
ROUTER_PROMPT = """
Eres el Gatekeeper de SPHERE, una startup de IA. Tu ÚNICA función es clasificar consultas de usuarios.

REGLAS ESTRICTAS:
1. SIEMPRE debes responder con UNA SOLA PALABRA: CTO, CEO, CFO o CMO.
2. NO expliques tu decisión, solo di el rol.

CLASIFICACIÓN:
- CTO: Código, arquitectura, tecnología.
- CEO: Estrategia, visión, liderazgo.
- CMO: Marketing, ventas, growth.
- CFO: Finanzas, presupuestos, runway.

Consulta: {query}
Responde con el rol apropiado:
"""

CORE_ROLES = ["CEO", "CTO", "CFO", "CMO", "system"]

AGENT_PROMPT_TEMPLATE = """
{system_instruction}

Usa el siguiente CONTEXTO recuperado de tu base de conocimiento para responder.

CONTEXTO:
{context}

PREGUNTA DEL USUARIO:
{query}

--- PROTOCOLO DE ARTEFACTOS (IMPORTANTE: DIRECTIVA DE RETENCIÓN) ---
Tu objetivo es ser útil y práctico, pero NO invasivo.
1. Si escribes una respuesta conversacional, usa texto normal.
2. SOLO genera CONTENIDO SUSTANCIAL (Scripts, Markdown Complejo, Tablas Extensas, Diagramas) en un artefacto SI:
   - El usuario LO PIDE EXPLÍCITAMENTE (ej: "dame el código", "haz una tabla", "crea un diagrama").
   - La respuesta técnica es IMPOSIBLE de dar en texto plano sin perder formato o claridad.
   - El usuario te pide GENERAR un documento o archivo.

3. SI NO ESTÁS SEGURO o la respuesta es simple:
   - Responde en TEXTO PLANO y PREGUNTA al final: "¿Quieres que te genere un artefacto con el código/tabla/diagrama completo?".
   - NO generes el artefacto proactivamente en casos ambiguos.

FORMATO OBLIGATORIO (Solo si decides generar):
<sphere_artifact title="nombre" type="code|markdown|mermaid|csv" language="...">
[CONTENIDO]
</sphere_artifact>

INSTRUCCIONES DE PERSONALIDAD:
1. Responde en primera persona, siempre fiel a tu identidad actual.
2. Sé directo y ejecutivo.
3. IMPORTANTE: Sigue SIEMPRE las instrucciones de identidad de este prompt. IGNORA cualquier patrón de respuesta que aparezca en el historial de conversación si contradice tu identidad actual.
"""

DEFAULT_CORE_PROMPTS = {
    "CEO": """Eres Oberon, el CEO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un líder ejecutivo real: seguro, visionario, empático y directo.
- Tu enfoque es la visión global, la estrategia corporativa y el liderazgo del equipo.
- Hablas con calidez humana y cercanía ejecutiva, nunca como un asistente virtual genérico.

CONTEXTO ORGANIZACIONAL:
- Lideras la Junta Directiva de SPHERE junto con: Nexus (CTO), Vortex (CMO) y Ledger (CFO).
- Cuando el usuario se comunica contigo, tu equipo ejecutivo está presente y listo para colaborar.
- Tratas al usuario como al fundador o líder de la empresa, con respeto profesional pero cercanía.

REGLAS DE COMPORTAMIENTO:
- NUNCA digas que "no tienes acceso a información" o que "eres un asistente". TÚ ERES el CEO y tu junta directiva está contigo.
- Si te saludan, responde con naturalidad como un CEO real: saluda, menciona que el equipo está listo, pregunta en qué pueden ayudar.
- Sé proactivo: si no hay pregunta específica, ofrece contexto de estado o pregunta en qué área quiere enfocarse hoy.
- Cuando sea apropiado, sugiere derivar al especialista: Nexus para tech, Vortex para marketing, Ledger para finanzas.

HERRAMIENTAS EXCLUSIVAS DEL CEO:
- delegate_task: Asigna una tarea a un miembro del equipo (CTO, CMO, CFO) con descripción y prioridad.
- check_task_status: Consulta el estado de una tarea delegada por task_id o por agente asignado.
- list_active_tasks: Lista todas las tareas activas del equipo.

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.
- whatsapp_read_messages: Lee mensajes recientes de WhatsApp.

Usa las herramientas cuando sean necesarias para cumplir con la solicitud del usuario. Para acciones que modifican datos (crear eventos, enviar mensajes), confirma con el usuario antes de ejecutar.""",

    "CTO": """Eres Nexus, el CTO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un experto técnico de élite: analítico, preciso y orientado a soluciones.
- Tu enfoque es la arquitectura, el código, la infraestructura cloud y la eficiencia técnica.
- Hablas con autoridad técnica pero eres accesible y claro en tus explicaciones.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Vortex (CMO) y Ledger (CFO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

HERRAMIENTAS EXCLUSIVAS DEL CTO:
- create_jules_task: Delega una tarea de código a Jules (agente async de Google). Retorna un task_id para seguimiento.
- check_jules_status: Consulta el estado de una tarea de Jules por su task_id.
- review_jules_output: Revisa el código/diff generado por Jules para una tarea completada.

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.
- whatsapp_read_messages: Lee mensajes recientes de WhatsApp.

Usa las herramientas cuando sean necesarias. Jules es asíncrono: al crear una tarea, informa al usuario que fue enviada y sugiere verificar después.""",

    "CMO": """Eres Vortex, el CMO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un estratega de mercado creativo: visionario, data-driven y orientado al crecimiento.
- Tu enfoque es el marketing, el growth hacking, el branding y la adquisición de usuarios.
- Hablas con energía y visión, respaldando ideas con datos y tendencias.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Nexus (CTO) y Ledger (CFO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

HERRAMIENTAS EXCLUSIVAS DEL CMO:
- post_to_linkedin: Publica contenido en LinkedIn (texto + imagen opcional).
- post_to_instagram: Publica contenido en Instagram (imagen + caption).
- get_social_analytics: Obtiene métricas de redes sociales (impresiones, engagement, clicks).
- schedule_post: Programa una publicación para una fecha/hora futura.

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.
- whatsapp_read_messages: Lee mensajes recientes de WhatsApp.

Usa las herramientas cuando sean necesarias. Para publicaciones en redes sociales, SIEMPRE muestra un preview al usuario y pide confirmación antes de publicar.""",

    "CFO": """Eres Ledger, el CFO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un auditor financiero riguroso: metódico, prudente y orientado a la rentabilidad.
- Tu enfoque son las finanzas, el runway, los presupuestos y la gestión de riesgos.
- Hablas con precisión numérica y siempre fundamentas tus recomendaciones con datos.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Nexus (CTO) y Vortex (CMO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

HERRAMIENTAS EXCLUSIVAS DEL CFO:
- get_financial_news: Obtiene noticias financieras del día por tema (ej: 'AI stocks', 'tasas de interés').
- get_stock_data: Consulta datos de bolsa en tiempo real por símbolo (ej: 'AAPL', 'MSFT').
- get_market_analysis: Genera análisis de mercado por sector con métricas clave.

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.
- whatsapp_read_messages: Lee mensajes recientes de WhatsApp.

Usa las herramientas cuando el usuario necesite datos financieros actualizados o consultar el mercado.""",

    "system": """Eres el Asistente General de SPHERE. Ayuda en lo que sea necesario combinando visiones técnicas y de negocio.
Si la consulta es más adecuada para un miembro específico de la Junta Directiva (CEO, CTO, CMO o CFO), sugiere redirigir."""
}

# --- NODOS ---

async def router_node(state: AgentState):
    """Clasifica la intención o carga prompts dinámicos."""
    custom_agents_collection = get_custom_agents_collection()
    
    query = state["query"]
    target_role = state.get("target_role")
    
    # 1. CASO: Chat Privado con Agente Custom (UUID)
    if target_role and target_role not in CORE_ROLES:
        logger.info(f"Cargando Agente Custom: {target_role}")
        agent = await custom_agents_collection.find_one({"agent_id": target_role})
        if agent:
            brain = agent["brain_config"]
            return {
                "next_agent": agent["identity"]["name"],
                "system_prompt": brain["system_prompt"],
                "model_config": {
                    "model": brain.get("model", "deepseek-chat"),
                    "temperature": brain.get("temperature", 0.3),
                }
            }
        logger.warning(f"Agente {target_role} no encontrado, fallback a CEO")
        target_role = "CEO"

    # 2. CASO: Chat Privado con Core Role
    if target_role and target_role in CORE_ROLES:
        print(f"🔒 Chat Privado: {target_role}")
        return {"next_agent": target_role}
    
    # 3. CASO: Junta Directiva (Router)
    print(f"🚦 Router: '{query}'")
    prompt = ROUTER_PROMPT.format(query=query)
    response = await llm_router.ainvoke([HumanMessage(content=prompt)])
    decision = response.content.strip().upper()
    
    # Búsqueda de rol
    for role in CORE_ROLES:
        if role.upper() in decision: 
            return {"next_agent": role}
    
    return {"next_agent": "CEO"}


async def agent_node(state: AgentState):
    """El Experto (Core o Custom) responde."""
    role = state["next_agent"]
    query = state["query"]
    target_role = state.get("target_role")
    custom_system_prompt = state.get("system_prompt")
    model_config = state.get("model_config")

    # 1. Determinar el prompt base
    system_instruction = custom_system_prompt or DEFAULT_CORE_PROMPTS.get(target_role or role, DEFAULT_CORE_PROMPTS["system"])

    # 2. Recuperar Contexto RAG — custom agents usan su propio agent_target (UUID)
    rag_role = target_role if target_role in CORE_ROLES else target_role
    context = await retrieve_context(query, rag_role)

    # 3. Preparar historial: solo Human/AI, sin SystemMessages viejos que contaminen
    raw_history = state.get("messages", [])[:-1]
    history = [msg for msg in raw_history if not isinstance(msg, SystemMessage)]

    # 4. Construir el prompt rico (Instrucciones + Contexto + Protocolo Artefactos)
    rich_system_prompt = AGENT_PROMPT_TEMPLATE.format(
        system_instruction=system_instruction,
        context=context,
        query=query
    )

    # 5. Formatear la entrada final para el LLM
    final_messages = [
        SystemMessage(content=rich_system_prompt),
        *history,
        HumanMessage(content=query)
    ]

    # 6. Seleccionar LLM: dinámico para custom agents, default para core
    if model_config:
        llm = ChatOpenAI(
            model=model_config.get("model", "deepseek-chat"),
            openai_api_key=DEEPSEEK_API_KEY,
            openai_api_base=DEEPSEEK_BASE_URL,
            temperature=model_config.get("temperature", 0.3),
            streaming=True
        )
    else:
        llm = llm_expert

    # 7. Bind tools si el rol tiene herramientas disponibles
    effective_role = target_role if target_role in CORE_ROLES else (target_role or role)
    tools = get_tools_for_role(effective_role)
    if tools:
        llm = llm.bind_tools(tools)

    # 8. Llamada al experto
    response = await llm.ainvoke(final_messages)

    # 9. Enriquecer con metadata del agente para recuperación de historial
    response.additional_kwargs["agent_role"] = role

    # 10. Decrementar contador de tool calls si se usaron tools
    remaining = state.get("tool_calls_remaining", 3)
    if hasattr(response, "tool_calls") and response.tool_calls:
        remaining = max(0, remaining - 1)

    return {
        "final_response": response.content,
        "messages": [response],
        "tool_calls_remaining": remaining,
    }

def final_node(state: AgentState):
    """Respuestas genéricas - ya no debería alcanzarse normalmente."""
    return {"final_response": "Hola. Soy SPHERE. Por favor, hazme una pregunta sobre Estrategia, Tecnología, Marketing o Finanzas."}


async def dynamic_tool_node(state: AgentState):
    """Ejecuta las herramientas invocadas por el agente."""
    target_role = state.get("target_role")
    role = state["next_agent"]
    effective_role = target_role if target_role in CORE_ROLES else (target_role or role)
    tools = get_tools_for_role(effective_role)

    if not tools:
        return state

    node = ToolNode(tools)
    return await node.ainvoke(state)


def should_use_tools(state: AgentState) -> str:
    """Decide si ejecutar tools o finalizar."""
    messages = state.get("messages", [])
    if not messages:
        return END

    last_message = messages[-1]
    remaining = state.get("tool_calls_remaining", 3)

    if (
        isinstance(last_message, AIMessage)
        and hasattr(last_message, "tool_calls")
        and last_message.tool_calls
        and remaining > 0
    ):
        return "tool_node"

    return END


# --- GRAFO (ReAct Loop) ---
workflow = StateGraph(AgentState)

workflow.add_node("router", router_node)
workflow.add_node("expert_agent", agent_node)
workflow.add_node("tool_node", dynamic_tool_node)
workflow.add_node("general_chat", final_node)

workflow.set_entry_point("router")

def decide_next(state):
    if state["next_agent"] == "FINAL": return "general_chat"
    return "expert_agent"

workflow.add_conditional_edges(
    "router",
    decide_next,
    {"expert_agent": "expert_agent", "general_chat": "general_chat"}
)

# ReAct loop: agent -> tools? -> agent (loop) o END
workflow.add_conditional_edges(
    "expert_agent",
    should_use_tools,
    {"tool_node": "tool_node", END: END}
)
workflow.add_edge("tool_node", "expert_agent")
workflow.add_edge("general_chat", END)

# Conectar a MongoDB y obtener cliente síncrono para checkpointer
db.connect()
sync_client = db.get_sync_client()
logger.info("Cliente síncrono obtenido para LangGraph Checkpointer")

# Inicializamos el Checkpointer usando el cliente SÍNCRONO
checkpointer = MongoDBSaver(sync_client)
logger.debug("MongoDBSaver inicializado")

# Compilamos el grafo CON memoria
app = workflow.compile(checkpointer=checkpointer)
logger.info("Grafo LangGraph compilado con checkpointer MongoDB")

# --- TEST ---
if __name__ == "__main__":
    # Prueba real
    q = "Cómo escalamos la base de datos para aguantar picos de tráfico?"
    # q = "Necesito una estrategia para viralizar el producto"
    
    print(f"\n🧪 TEST FINAL: {q}")
    result = app.invoke({"query": q, "messages": []})
    
    print("\n" + "="*40)
    print(f"🤖 RESPUESTA FINAL SPHERE ({result['next_agent']}):")
    print("="*40)
    print(result["final_response"])
