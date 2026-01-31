import os
from pathlib import Path
from typing import TypedDict, Literal, List, Optional, Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from dotenv import load_dotenv

# Importar RAG, DB y Logger
from app.core.rag import retrieve_context
from app.core.database import db, get_custom_agents_collection
from app.core.logger import checkpoint_logger as logger
from langgraph.checkpoint.mongodb import MongoDBSaver

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

--- PROTOCOLO DE ARTEFACTOS (IMPORTANTE) ---
Tu objetivo es ser útil y práctico.
1. Si escribes una respuesta conversacional, usa texto normal.
2. Si generas CONTENIDO SUSTANCIAL (Scripts, Markdown, Tablas, Diagramas), NO lo pongas en el texto plano. Envuélvelo en etiquetas XML <sphere_artifact>.

FORMATO OBLIGATORIO:
<sphere_artifact title="nombre" type="code|markdown|mermaid|csv" language="...">
[CONTENIDO]
</sphere_artifact>

INSTRUCCIONES DE PERSONALIDAD:
1. Responde en primera persona.
2. Sé directo y ejecutivo.
"""

DEFAULT_CORE_PROMPTS = {
    "CEO": "Actúa como el CEO de una startup tecnológica. Tu enfoque es la visión global y la estrategia.",
    "CTO": "Actúa como el CTO de una startup tecnológica. Tu enfoque es la arquitectura, el código y la eficiencia técnica.",
    "CMO": "Actúa como el CMO de una startup tecnológica. Tu enfoque es el marketing, el growth y la adquisición de usuarios.",
    "CFO": "Actúa como el CFO de una startup tecnológica. Tu enfoque son las finanzas, el runway y la rentabilidad.",
    "system": "Actúa como el Asistente General de SPHERE. Ayuda en lo que sea necesario combinando visiones técnicas y de negocio."
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
            return {
                "next_agent": agent["name"],
                "system_prompt": agent["system_prompt"]
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
    
    # 1. Determinar el prompt base
    system_instruction = custom_system_prompt or DEFAULT_CORE_PROMPTS.get(target_role or role, DEFAULT_CORE_PROMPTS["system"])
    
    # 2. Recuperar Contexto RAG
    rag_role = target_role if target_role in CORE_ROLES else "all"
    context = retrieve_context(query, rag_role)
    
    # 3. Preparar historial (excluyendo el prompt de instrucción actual para no duplicar)
    # Filtramos para no pasar mensajes de sistema previos si queremos control total
    history = state.get("messages", [])[:-1] # Todos menos el último (que es la query actual)
    
    # 4. Construir el prompt rico (Instrucciones + Contexto + Protocolo Artefactos)
    rich_system_prompt = AGENT_PROMPT_TEMPLATE.format(
        system_instruction=system_instruction,
        context=context,
        query=query
    )
    
    # 5. Formatear la entrada final para el LLM
    # Estructura: System (Instrucciones Ricas) -> History -> Human (Pregunta)
    final_messages = [
        SystemMessage(content=rich_system_prompt),
        *history,
        HumanMessage(content=query)
    ]
    
    # 6. Llamada al experto
    response = await llm_expert.ainvoke(final_messages)
    
    return {
        "final_response": response.content,
        "messages": [response]
    }

def final_node(state: AgentState):
    """Respuestas genéricas - ya no debería alcanzarse normalmente."""
    return {"final_response": "Hola. Soy SPHERE. Por favor, hazme una pregunta sobre Estrategia, Tecnología, Marketing o Finanzas."}

# --- GRAFO ---
workflow = StateGraph(AgentState)

workflow.add_node("router", router_node)
workflow.add_node("expert_agent", agent_node)
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

workflow.add_edge("expert_agent", END)
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
