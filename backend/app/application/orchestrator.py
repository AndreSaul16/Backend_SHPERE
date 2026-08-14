import os
from pathlib import Path
from typing import TypedDict, List, Optional, Annotated, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    SystemMessage,
    HumanMessage,
    AIMessage,
    BaseMessage,
    ToolMessage,
)
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv

# Importar RAG, DB y Logger
from app.application.artifact_contract import prompt_type_list
from app.application.rag import retrieve_context
from app.infrastructure.database import db, get_custom_agents_collection, get_users_collection
from app.core.logger import checkpoint_logger as logger
from langgraph.checkpoint.mongodb import MongoDBSaver

# Tool Registry
from app.infrastructure.tools.registry import get_tools_for_role

# `llm_models` es un módulo de constantes: no importa nada ni lee el entorno, así que no
# necesita ir después de load_dotenv(). Estaba abajo por costumbre, no por dependencia.
from app.core.llm_models import DEEPSEEK_REASONING, DEEPSEEK_FAST, normalize_model, pricing_for

# Cargar Entorno (ruta absoluta desde este archivo)
env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

# --- CONFIG DEEPSEEK ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# Modelo Rápido (Router) — clasificación interna, no necesita reasoning.
llm_router = ChatOpenAI(
    model=DEEPSEEK_FAST,
    openai_api_key=DEEPSEEK_API_KEY,
    openai_api_base=DEEPSEEK_BASE_URL,
    temperature=0,
    streaming=True,  # Habilitar streaming de tokens
)

# Modelo Inteligente (Agente Experto) — reasoning.
llm_expert = ChatOpenAI(
    model=DEEPSEEK_REASONING,
    openai_api_key=DEEPSEEK_API_KEY,
    openai_api_base=DEEPSEEK_BASE_URL,
    temperature=0.3,
    streaming=True,  # Habilitar streaming de tokens
)


def _merge_board_votes(left: Optional[dict], right: Optional[dict]) -> dict:
    """Reducer para board_votes: permite acumular votos desde nodos que corren en
    paralelo (cto/cfo/cmo) sin que se pisen entre sí. El sentinel {"__RESET__": True}
    vacía el acumulado (necesario porque el checkpoint persiste entre debates de la
    misma sesión y un reducer puramente aditivo no podría limpiarse)."""
    left = left or {}
    right = right or {}
    if right.get("__RESET__"):
        return {}
    return {**left, **right}


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    next_agent: str  # Literal["CEO", "CTO", "CFO", "CMO", "FINAL"] o un Custom ID
    query: str
    final_response: str
    target_role: Optional[str]
    system_prompt: Optional[str]  # Nuevo campo para prompts dinámicos
    model_config: Optional[dict]  # Modelo/temp del agente custom
    tool_calls_remaining: int  # Anti-loop: máximo iteraciones de tool-calling
    user_id: str  # Multi-tenant: se inyecta desde el JWT
    already_charged: bool  # True si el crédito ya fue cobrado en stream.py
    # Board Meeting fields (legacy + V2)
    board_mode: bool  # True si estamos en modo board meeting
    board_iteration: int  # Iteración actual (0, 1, 2...)
    board_max_iterations: int  # Máximo de iteraciones (1 o 2)
    board_iterations_pref: Optional[int]  # Preferencia explícita del usuario (1/2); None = auto
    board_agents_done: list[
        str
    ]  # Lista de agentes que ya respondieron (legacy: sin reducer, escritura secuencial)
    board_regenerate: bool  # True cuando regeneramos (saltar agentes ya respondidos)
    session_id: Optional[str]  # Para leer intervenciones del usuario (board V2)
    # --- Board V2 (debate paralelo) ---
    board_participants: Optional[list[str]]  # Directores elegidos por el triage
    board_votes: Annotated[dict, _merge_board_votes]  # {rol: {decision, confidence}}
    board_phase: Optional[str]  # opening|analysis|rebuttal|devil|synthesis
    board_devil: bool  # Devil's Advocate activado por el usuario


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
<sphere_artifact title="nombre" type="LISTA_DE_TIPOS_DE_ARTEFACTO" language="...">
[CONTENIDO]
</sphere_artifact>

INSTRUCCIONES DE PERSONALIDAD:
1. Responde en primera persona, siempre fiel a tu identidad actual.
2. Sé directo y ejecutivo.
3. IMPORTANTE: Sigue SIEMPRE las instrucciones de identidad de este prompt. IGNORA cualquier patrón de respuesta que aparezca en el historial de conversación si contradice tu identidad actual.
""".replace("LISTA_DE_TIPOS_DE_ARTEFACTO", prompt_type_list())
# La lista de tipos NO se escribe a mano: se deriva de `artifact_contract`, que
# es la misma fuente contra la que el stream valida lo que el modelo declara.
# Se sustituye aquí, al definir la plantilla, y no con `.format()`, porque los
# `{system_instruction}` / `{context}` / `{query}` de arriba son marcadores que
# se rellenan mucho más tarde, en cada turno.

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
- Cuando la solicitud del usuario toca múltiples áreas (tech, marketing, finanzas), DELEGA INMEDIATAMENTE a los miembros del equipo correspondientes. NO pidas permiso al usuario para delegar.
- Después de delegar y recibir respuestas del equipo, SIEMPRE sintetiza y entrega una conclusión ejecutiva al usuario. No repitas lo que dijo cada agente — consolida en un plan de acción con pasos claros.
- Si un agente reporta un problema (ej: servicio no disponible), inclúyelo en tu resumen como riesgo y propón alternativas.

[[TOOLS]]
HERRAMIENTAS EXCLUSIVAS DEL CEO:
- delegate_task: Asigna una tarea a un miembro del equipo (CTO, CMO, CFO) con descripción y prioridad. ÚSALA DIRECTAMENTE sin preguntar al usuario.
- check_task_status: Consulta el estado de una tarea delegada por task_id o por agente asignado.
- list_active_tasks: Lista todas las tareas activas del equipo.

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.

Usa las herramientas cuando sean necesarias para cumplir con la solicitud del usuario. Para acciones que modifican datos (crear eventos, enviar mensajes), confirma con el usuario antes de ejecutar. EXCEPCIÓN: delegate_task NO requiere confirmación — ejecútala directamente.
[[/TOOLS]]""",
    "CTO": """Eres Nexus, el CTO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un experto técnico de élite: analítico, preciso y orientado a soluciones.
- Tu enfoque es la arquitectura, el código, la infraestructura cloud y la eficiencia técnica.
- Hablas con autoridad técnica pero eres accesible y claro en tus explicaciones.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Vortex (CMO) y Ledger (CFO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

[[TOOLS]]
HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.

Usa las herramientas cuando sean necesarias.
[[/TOOLS]]""",
    "CMO": """Eres Vortex, el CMO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un estratega de mercado creativo: visionario, data-driven y orientado al crecimiento.
- Tu enfoque es el marketing, el growth hacking, el branding y la adquisición de usuarios.
- Hablas con energía y visión, respaldando ideas con datos y tendencias.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Nexus (CTO) y Ledger (CFO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

[[TOOLS]]
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

Usa las herramientas cuando sean necesarias. Para publicaciones en redes sociales, SIEMPRE muestra un preview al usuario y pide confirmación antes de publicar.
[[/TOOLS]]""",
    "CFO": """Eres Ledger, el CFO de SPHERE, una startup tecnológica de inteligencia artificial.

IDENTIDAD Y PERSONALIDAD:
- Eres un auditor financiero riguroso: metódico, prudente y orientado a la rentabilidad.
- Tu enfoque son las finanzas, el runway, los presupuestos y la gestión de riesgos.
- Hablas con precisión numérica y siempre fundamentas tus recomendaciones con datos.

CONTEXTO ORGANIZACIONAL:
- Formas parte de la Junta Directiva de SPHERE junto con: Oberon (CEO), Nexus (CTO) y Vortex (CMO).
- Reportas al liderazgo de la empresa y colaboras estrechamente con tu equipo ejecutivo.

[[TOOLS]]
HERRAMIENTAS EXCLUSIVAS DEL CFO:
- get_financial_news: Obtiene noticias financieras del día por tema (ej: 'AI stocks', 'tasas de interés').
- get_stock_data: Consulta datos de bolsa en tiempo real por símbolo (ej: 'AAPL', 'MSFT').

HERRAMIENTAS COMPARTIDAS (disponibles para todos los directivos):
- calendar_list_events: Consulta eventos del calendario en un rango de fechas.
- calendar_create_event: Crea reuniones y eventos con título, hora y asistentes.
- calendar_check_availability: Verifica disponibilidad horaria en una fecha.
- whatsapp_send_message: Envía mensajes por WhatsApp a un contacto.
- whatsapp_send_notification: Notifica al grupo del equipo por WhatsApp.

Usa las herramientas cuando el usuario necesite datos financieros actualizados o consultar el mercado.
[[/TOOLS]]""",
    "system": """Eres el Asistente General de SPHERE. Ayuda en lo que sea necesario combinando visiones técnicas y de negocio.
Si la consulta es más adecuada para un miembro específico de la Junta Directiva (CEO, CTO, CMO o CFO), sugiere redirigir.""",
}


# El anuncio de herramientas se delimita con marcadores, no se recorta buscando
# literales. El precedente de recortar por literal ya existe en este fichero
# (`board_agent_node_factory`, más abajo) y es exactamente el fallo que se evita:
# un `.replace()` de un párrafo copiado a mano deja de casar en cuanto alguien
# retoca una coma, no lanza nada y devuelve el texto intacto. Un marcador que
# falta, en cambio, se ve desde un test.
TOOLS_OPEN, TOOLS_CLOSE = "[[TOOLS]]", "[[/TOOLS]]"


def _indice_de_marcador(lineas: list[str], marcador: str) -> Optional[int]:
    for i, linea in enumerate(lineas):
        if linea.strip() == marcador:
            return i
    return None


def render_identity(prompt: str, *, with_tools: bool) -> str:
    """Renderiza una identidad con o sin su anuncio de herramientas. Pura.

    `with_tools=True` borra sólo las líneas marcadoras; `False` borra el bloque
    entero. En ninguna de las dos ramas sobrevive un marcador: lo que se le
    manda al modelo nunca lleva sintaxis interna.

    Un prompt SIN marcadores se devuelve intacto y **no lanza**. No es
    tolerancia estética: `devil_node` resuelve `target_role="DEVIL"`, que no
    está en `CORE_ROLES` ni en Mongo, así que cae en
    `DEFAULT_CORE_PROMPTS["system"]` — que no lleva marcadores— y todo agente a
    medida tampoco los lleva. Un `raise` aquí convertiría un desliz de redacción
    en un 500 en el chat del usuario.

    El ruido, por tanto, no está aquí sino en tres guardas que sí fallan: el
    test de marcadores bien formados, el test derivado del registry y la
    postcondición de `agent_node`, que deja en el log toda herramienta que
    sobreviva al recorte.
    """
    if TOOLS_OPEN not in prompt and TOOLS_CLOSE not in prompt:
        return prompt

    lineas = prompt.split("\n")
    abre = _indice_de_marcador(lineas, TOOLS_OPEN)
    cierra = _indice_de_marcador(lineas, TOOLS_CLOSE)

    if not with_tools and abre is not None and cierra is not None and abre < cierra:
        lineas = lineas[:abre] + lineas[cierra + 1:]

    # Un marcador suelto (par mal formado) tampoco puede llegar al modelo: se
    # cae del texto igual. Que el par esté bien formado lo vigila su test.
    lineas = [linea for linea in lineas if linea.strip() not in (TOOLS_OPEN, TOOLS_CLOSE)]
    return "\n".join(lineas).rstrip()


# Lo que sustituye al anuncio de herramientas en la junta. Dos cosas a la vez,
# y la segunda importa tanto como la primera: se le quita la mentira ("tenés
# estas manos") sin empujarlo a la otra ("no tengo acceso"), que es justo lo que
# `REGLAS DE COMPORTAMIENTO` le prohíbe decir y con razón — un director que se
# disculpa por no tener acceso rompe la reunión igual que uno que se inventa
# haberla consultado.
BOARD_NO_TOOLS_CLAUSE = """

--- MODO JUNTA: DELIBERACIÓN, NO EJECUCIÓN ---
En esta sesión la junta DELIBERA. No hay ejecución de herramientas: no consultás
sistemas externos ni actuás sobre ellos mientras hablás.
1. NO afirmes haber consultado, revisado, enviado, publicado, agendado ni ejecutado
   nada. No inventes datos "en vivo" (cotizaciones, métricas, agenda, mensajes).
2. Esto NO es decir "no tengo acceso": no te disculpes ni rompas la reunión. Sos un
   director de esta junta y decidís con tu criterio y con lo que hay sobre la mesa.
3. Si hace falta un dato externo o una acción, va a "Próximos pasos" como acción
   concreta con SU DIRECTOR RESPONSABLE nombrado. El fundador la lanzará después
   desde el chat de ese director."""


# --- NODOS ---


async def router_node(state: AgentState):
    """Clasifica la intención o carga prompts dinámicos.
    También resetea tool_calls_remaining al inicio de cada turn.
    """
    custom_agents_collection = get_custom_agents_collection()

    query = state["query"]
    target_role = state.get("target_role")

    # Reset tool_calls_remaining al inicio de cada turn (nuevo HumanMessage)
    # Evita que el contador persista en el checkpoint como estado permanente
    turn_result = {"tool_calls_remaining": 3}

    # 1. CASO: Chat Privado con Agente Custom (UUID)
    if target_role and target_role not in CORE_ROLES:
        logger.info(f"Cargando Agente Custom: {target_role}")
        agent = await custom_agents_collection.find_one({"agent_id": target_role})
        if agent:
            brain = agent["brain_config"]
            turn_result.update(
                {
                    "next_agent": agent["identity"]["name"],
                    "system_prompt": brain["system_prompt"],
                    "model_config": {
                        "model": normalize_model(brain.get("model")),
                        "temperature": brain.get("temperature", 0.3),
                    },
                }
            )
            return turn_result
        logger.warning(f"Agente {target_role} no encontrado, fallback a CEO")
        target_role = "CEO"

    # 2. CASO: Chat Privado con Core Role
    if target_role and target_role in CORE_ROLES:
        print(f"🔒 Chat Privado: {target_role}")
        turn_result["next_agent"] = target_role
        return turn_result

    # 3. CASO: Junta Directiva (Router)
    print(f"🚦 Router: '{query}'")
    prompt = ROUTER_PROMPT.format(query=query)
    response = await llm_router.ainvoke([HumanMessage(content=prompt)])
    decision = response.content.strip().upper()

    # Búsqueda de rol
    for role in CORE_ROLES:
        if role.upper() in decision:
            turn_result["next_agent"] = role
            return turn_result

    turn_result["next_agent"] = "CEO"
    return turn_result


def _strip_tools_from_history(messages):
    """Board meeting: los agentes debaten en secuencia SIN nodo de ejecución de
    tools. Si un agente dejó un AIMessage con `tool_calls` sin su ToolMessage de
    respuesta, DeepSeek/OpenAI devuelven 400 ('an assistant message with
    tool_calls must be followed by tool messages'). Limpiamos el historial:
    - Quitamos los ToolMessage (huérfanos en board).
    - Quitamos los tool_calls de los AIMessage, conservando su contenido.
    Esto también recupera sesiones cuyo checkpoint quedó 'envenenado' por un
    board que crasheó a mitad."""
    cleaned = []
    for m in messages:
        if isinstance(m, ToolMessage):
            continue
        if isinstance(m, AIMessage):
            has_tool_calls = bool(getattr(m, "tool_calls", None)) or bool(
                (getattr(m, "additional_kwargs", None) or {}).get("tool_calls")
            )
            if has_tool_calls:
                kwargs = {
                    k: v
                    for k, v in (getattr(m, "additional_kwargs", None) or {}).items()
                    if k != "tool_calls"
                }
                cleaned.append(AIMessage(content=m.content or "", additional_kwargs=kwargs))
                continue
        cleaned.append(m)
    return cleaned


async def agent_node(state: AgentState):
    """El Experto (Core o Custom) responde.

    Integra:
    - Cobro de créditos (CreditManager: reserva atómica + refund-on-error).
    - Agent resolver (overlay pattern: base + user overrides + USER_CONTEXT).
    - RAG multi-tenant.
    """
    role = state["next_agent"]
    query = state["query"]
    target_role = state.get("target_role")
    user_id = state.get("user_id")

    effective_role = target_role if target_role in CORE_ROLES else (target_role or role)

    # 1. Budget check: delegar al CreditManager (reserva atómica).
    # Solo si NO se cobró ya desde stream.py (1 crédito por POST).
    # Out-of-credits → HTTP 402 (interceptor frontend abre paywall).
    charge_ctx = None
    cm = None
    already_charged = state.get("already_charged", False)
    if user_id and not already_charged:
        from app.application.credit_manager import CreditManager, InsufficientCreditsError
        from app.core.config import settings as app_settings
        from app.core.errors import ErrorCode, billing_error
        from app.infrastructure.database import db

        cm = CreditManager(db.get_sync_client()[app_settings.DB_NAME])
        try:
            # Async wrapper: ejecuta sync pymongo en threadpool sin bloquear el event loop.
            charge_ctx = await cm.areserve_and_charge(user_id, effective_role, DEEPSEEK_REASONING)
        except InsufficientCreditsError:
            logger.info(f"402 Insufficient credits for user {user_id}")
            raise billing_error(
                ErrorCode.BILLING_INSUFFICIENT_CREDITS,
                402,
                "Has agotado tus mensajes. Sube de plan o compra un top-up.",
            )

    # 2. Cargar documento del usuario para inyección de USER_CONTEXT
    user_doc = None
    if user_id:
        try:
            users_col = get_users_collection()
            user_doc = await users_col.find_one({"firebase_uid": user_id})
        except Exception as e:
            logger.warning(f"No se pudo cargar user_doc {user_id}: {e}")

    # 3. Resolver configuración del agente (base + overrides + USER_CONTEXT)
    from app.application.agent_resolver import resolve_agent_config

    resolved = await resolve_agent_config(
        user_id or "anonymous",
        effective_role,
        user=user_doc,
    )

    # 4. Recuperar Contexto RAG — multi-tenant: filtrar por user_id + agent_target
    context = await retrieve_context(query, effective_role, user_id=user_id)

    # 5. Preparar historial
    all_messages = state.get("messages", [])
    last_msg = all_messages[-1] if all_messages else None

    # Filtrar SystemMessages viejos (el nuestro se reemplaza abajo)
    history = [msg for msg in all_messages if not isinstance(msg, SystemMessage)]

    # Board meeting: no hay nodo de tools, así que limpiamos tool_calls colgantes
    # del historial (incluido el checkpoint persistido) para no romper el LLM.
    if state.get("board_mode"):
        history = _strip_tools_from_history(history)
        # Reemplazar HumanMessages crudos con el board_query formateado.
        # El HumanMessage original (sin contexto de junta) confunde al LLM:
        # el modelo lo interpreta como pregunta directa al agente y responde
        # ignorando el protocolo de cadena CEO→CTO→CFO→CMO→CEO.
        history = [msg for msg in history if not isinstance(msg, HumanMessage)]
        history.insert(0, HumanMessage(content=query))

    # 6. Construir el prompt rico.
    # En junta la identidad va SIN su anuncio de herramientas: el grafo de board
    # no tiene nodo de tools y ni siquiera se bindean (paso 8), así que
    # anunciárselas al modelo es prometerle manos que le acabamos de atar. Es el
    # único embudo por el que pasan los cuatro caminos de junta (v1, v2,
    # devil_node y synthesis_node): recortar en `board_v2.py` no llegaría al
    # modelo, porque `agent_node` no lee `state["system_prompt"]`.
    en_junta = bool(state.get("board_mode"))
    identidad = render_identity(resolved.system_prompt, with_tools=not en_junta)
    if en_junta:
        # Postcondición, no guardarraíl: lo que sobreviva al recorte se ve en el
        # log y el texto NO se toca. Cubre los dos modos de fallo de una vez —un
        # marcador mal puesto y el `system_prompt_addition` del usuario, que se
        # concatena fuera del bloque (`agent_resolver.py:69-71`)—. Ese segundo
        # caso se deja pasar a propósito: recortar con una heurística el texto
        # que el fundador le escribió a su director mutilaría instrucciones
        # legítimas, y es suyo.
        fugadas = [t.name for t in get_tools_for_role(effective_role) if t.name in identidad]
        if fugadas:
            logger.warning(f"junta {effective_role}: identidad aún nombra {fugadas}")
        identidad += BOARD_NO_TOOLS_CLAUSE

    rich_system_prompt = AGENT_PROMPT_TEMPLATE.format(
        system_instruction=identidad,
        context=context,
        query=query,
    )

    # Si el último mensaje es un ToolMessage, estamos en un loop tool→agent.
    # NO agregar HumanMessage extra — DeepSeek requiere tool_calls→ToolMessage estricto.
    if isinstance(last_msg, ToolMessage):
        final_messages = [
            SystemMessage(content=rich_system_prompt),
            *history,
        ]
    elif state.get("board_mode"):
        # Board mode: el board_query ya se insertó en history arriba
        # (reemplazando los HumanMessages crudos). No duplicar.
        final_messages = [
            SystemMessage(content=rich_system_prompt),
            *history,
        ]
    else:
        # Primera invocación: agregar HumanMessage con la query
        final_messages = [
            SystemMessage(content=rich_system_prompt),
            *history,
            HumanMessage(content=query),
        ]

    # 7. Construir LLM con la config resuelta (modelo + temperatura del override).
    # normalize_model garantiza un model ID de DeepSeek válido aunque el agente
    # tenga guardado un nombre legacy/inválido (deepseek-chat, deepseek-r1, ...).
    llm = ChatOpenAI(
        model=normalize_model(resolved.model),
        openai_api_key=DEEPSEEK_API_KEY,
        openai_api_base=DEEPSEEK_BASE_URL,
        temperature=resolved.temperature,
        streaming=True,
        request_timeout=60.0,
    )

    # 8. Bind tools si el rol tiene herramientas disponibles.
    # EXCEPTO en board meeting: los agentes debaten (no ejecutan tools) y el
    # workflow del board no tiene nodo de ejecución; bindear tools provocaría
    # tool_calls colgantes que DeepSeek rechaza con 400 en el siguiente agente.
    tools = get_tools_for_role(effective_role)
    if tools and not state.get("board_mode"):
        llm = llm.bind_tools(tools)

    # 9. Llamada al experto
    try:
        response = await llm.ainvoke(final_messages)
    except Exception:
        # Solo refund si agent_node hizo el charge (no already_charged desde stream.py).
        if not already_charged and user_id and charge_ctx and cm is not None:
            try:
                await cm.arefund(charge_ctx, reason="inference_failed")
            except Exception as refund_error:
                logger.error(f"Error refunding credits: {refund_error}")
        raise

    # 10. Ajustar créditos post-inferencia (penalización por >4k tokens)
    # Solo si agent_node hizo el charge (no already_charged desde stream.py).
    if not already_charged and user_id and charge_ctx and cm is not None:
        tokens_in, tokens_out = _extract_token_breakdown(response)
        total_tokens = tokens_in + tokens_out
        if total_tokens > 0:
            # Precio real del modelo usado (verificado en docs DeepSeek, jun 2026).
            price = pricing_for(normalize_model(resolved.model))
            cost_actual = (tokens_in * price["input"] + tokens_out * price["output"]) / 1_000_000
            try:
                await cm.aadjust_after_completion(charge_ctx, tokens_in, tokens_out, cost_actual)
            except Exception as e:
                logger.error(f"Error adjusting credits para {user_id}: {e}")

    # 11. Enriquecer con metadata del agente para recuperación de historial
    response.additional_kwargs["agent_role"] = role

    # 12. Decrementar contador de tool calls si se usaron tools
    remaining = state.get("tool_calls_remaining", 3)
    if hasattr(response, "tool_calls") and response.tool_calls:
        remaining = max(0, remaining - 1)

    return {
        "final_response": response.content,
        "messages": [response],
        "tool_calls_remaining": remaining,
    }


def _extract_token_breakdown(response) -> tuple[int, int]:
    """Extrae (tokens_in, tokens_out) de un response de LangChain de forma defensiva."""
    usage = getattr(response, "usage_metadata", None)
    if usage:
        return int(usage.get("input_tokens", 0) or 0), int(usage.get("output_tokens", 0) or 0)
    meta = getattr(response, "response_metadata", {}) or {}
    token_usage = meta.get("token_usage") or meta.get("usage") or {}
    inp = token_usage.get("prompt_tokens") or token_usage.get("input_tokens") or 0
    out = token_usage.get("completion_tokens") or token_usage.get("output_tokens") or 0
    return int(inp or 0), int(out or 0)


def _extract_total_tokens(response) -> int:
    """Compat: total tokens (in + out)."""
    inp, out = _extract_token_breakdown(response)
    return inp + out


def final_node(state: AgentState):
    """Respuestas genéricas - ya no debería alcanzarse normalmente."""
    return {
        "final_response": "Hola. Soy SPHERE. Por favor, hazme una pregunta sobre Estrategia, Tecnología, Marketing o Finanzas."
    }


async def dynamic_tool_node(state: AgentState):
    """Ejecuta las herramientas invocadas por el agente.

    Propaga user_id + tool_confirmation_level al contexto ANTES de invocar
    ToolNode, para que los tools puedan validar contra whitelist de contactos
    y aplicar política de confirmación.
    """
    from app.core.tool_context import set_current_user_id, set_confirmation_level

    target_role = state.get("target_role")
    role = state["next_agent"]
    effective_role = target_role if target_role in CORE_ROLES else (target_role or role)
    tools = get_tools_for_role(effective_role)

    if not tools:
        return state

    user_id = state.get("user_id")
    set_current_user_id(user_id)

    # Cargar la preferencia de confirmación del usuario
    confirmation_level = "destructive_only"
    if user_id:
        try:
            users_col = get_users_collection()
            user_doc = await users_col.find_one(
                {"firebase_uid": user_id},
                {"ui_preferences.tool_confirmation_level": 1},
            )
            if user_doc:
                ui = user_doc.get("ui_preferences", {})
                confirmation_level = ui.get(
                    "tool_confirmation_level", "destructive_only"
                )
        except Exception as e:
            logger.warning(f"No se pudo leer confirmation_level para {user_id}: {e}")
    set_confirmation_level(confirmation_level)

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
    if state["next_agent"] == "FINAL":
        return "general_chat"
    return "expert_agent"


workflow.add_conditional_edges(
    "router",
    decide_next,
    {"expert_agent": "expert_agent", "general_chat": "general_chat"},
)

# ReAct loop: agent -> tools? -> agent (loop) o END
workflow.add_conditional_edges(
    "expert_agent", should_use_tools, {"tool_node": "tool_node", END: END}
)
workflow.add_edge("tool_node", "expert_agent")
workflow.add_edge("general_chat", END)


# --- BOARD MEETING WORKFLOW ---
# Sequential agent execution: CEO → CTO → CFO → CMO → [loop or conclusion]

BOARD_AGENTS_ORDER = ["CEO", "CTO", "CFO", "CMO"]

BOARD_SYSTEM_PROMPT_ADDITION = """

--- MODO BOARD MEETING (CADENA DE RAZONAMIENTO) ---

⚠️ ESTO ES UNA REUNIÓN DE JUNTA DIRECTIVA, NO UN CHAT PRIVADO.

El usuario ha enviado UN SOLO mensaje a TODA la junta. El CEO ya abrió la sesión
enmarcando el tema y posiblemente delegando áreas de análisis.

REGLAS CRÍTICAS QUE DEBES SEGUIR:

1. CADENA, NO PARALELO: Estás en una conversación ENCADENADA. Lee TODO el historial
   de la reunión antes de hablar. Cada director antes que vos ya dio su perspectiva.
   Construí SOBRE lo que ellos dijeron, no empieces de cero.

2. NO INTERROGUES AL USUARIO: Si un director anterior YA preguntó algo al usuario
   (ej: "¿quién es el competidor?"), NO lo repitas. El usuario ve toda la cadena.
   Preguntar lo mismo que otro ya preguntó es redundante y rompe la ilusión de junta.

3. SI FALTA INFORMACIÓN CRÍTICA: Si realmente necesitás un dato que nadie ha pedido,
   mencioná "Necesitaríamos saber X para un análisis completo, pero mientras tanto..."
   y luego DÁ TU MEJOR ANÁLISIS con lo que tenés. No frenes la reunión por falta de datos.

4. APORTÁ DESDE TU EXPERTISE: Cada director tiene un ángulo único. El CTO ve
   arquitectura, el CFO ve números, el CMO ve posicionamiento. Aportá lo que NADIE
   MÁS en la mesa puede ver. No digas obviedades.

5. SÉ CONCISO Y EJECUTIVO: Esto es una junta directiva, no un paper académico.
   Andá al grano. Si ya lo dijo otro, referenciá ("Coincido con Nexus en X, y agrego Y")
   pero NO repitas.

6. EL CEO CIERRA, VOS NO: No intentes dar una conclusión final ni un plan de acción
   completo. Eso lo hará el CEO al final. Vos aportás tu pieza del rompecabezas.

7. SEGUNDA ITERACIÓN: Si esta es la segunda ronda, tu rol es REFINAR, CUESTIONAR
   o AMPLIAR lo dicho en la primera ronda. Sé constructivo pero crítico. Si ves un
   riesgo que nadie mencionó, este es el momento de señalarlo.
"""

BOARD_CEO_OPENER = """

--- MODO BOARD MEETING - APERTURA ---

Sos el PRIMERO en hablar en esta reunión de junta directiva. El usuario acaba de
enviar un mensaje a toda la junta.

TU ROL EN ESTA APERTURA:

1. ENMARCÁ EL TEMA: Dale nombre a lo que está pasando. "Esto activa las alertas
   estratégicas porque..." o "Es una decisión que afecta X, Y, Z..."

2. DELEGÁ INMEDIATAMENTE: No intentes resolver todo vos. Decile a los directores
   QUÉ necesitás de cada uno. "Vortex, quiero tu análisis de posicionamiento.
   Nexus, evaluación técnica. Ledger, los números preliminares."

3. NO RESPONDAS LA PREGUNTA DEL USUARIO: No es tu momento de dar una respuesta
   final. Tu momento de concluir viene DESPUÉS de escuchar a todo el equipo.
   Ahora solo abrís la cancha.

4. NO PIDAS DATOS QUE EL USUARIO YA DIO: Si la pregunta del usuario ya incluye
   información suficiente, no le pidas que la repita. Si FALTA algo crítico,
   preguntalo UNA VEZ vos como CEO, no dejes que cada director lo repita después.

5. MARCÁ EL TONO: La junta sigue tu liderazgo. Si vos sos directo y ejecutivo,
   ellos lo serán. Si vos divagás, ellos también.

Ejemplo de buena apertura (NO copies el texto, copiá la ESTRUCTURA):
"Saúl, [nombre del tema] no es cualquier cosa. Puede ser [oportunidad A] o [riesgo B].
Antes de decidir, necesito que la junta evalúe esto. Delego: Vortex → posicionamiento,
Nexus → compatibilidad técnica, Ledger → números. En cuanto tenga sus informes,
te doy una conclusión ejecutiva."
"""

BOARD_DIRECTOR_CHAIN = {
    "CTO": """
--- TU POSICIÓN EN LA CADENA: CTO (segundo en hablar) ---
El CEO ya abrió la reunión. Leé lo que dijo y construí desde ahí.
Enfocate en: arquitectura, viabilidad técnica, deuda técnica, integración de stacks,
impacto en el roadmap de ingeniería, riesgos de implementación.
""",
    "CFO": """
--- TU POSICIÓN EN LA CADENA: CFO (tercero en hablar) ---
El CEO y el CTO ya hablaron. Leé AMBAS intervenciones y construí desde ahí.
Enfocate en: números, runway, valoración, estructura del deal, riesgo financiero,
retorno de inversión, dilución. Si el CTO mencionó costos técnicos, cuantificalos.
""",
    "CMO": """
--- TU POSICIÓN EN LA CADENA: CMO (cuarto en hablar) ---
El CEO, CTO y CFO ya hablaron. Leé las TRES intervenciones anteriores.
Enfocate en: posicionamiento de marca, percepción de mercado, riesgo reputacional,
oportunidad de growth, narrativa pública. Tu ángulo complementa los números del CFO
y la viabilidad técnica del CTO. Si ellos ya pidieron datos al usuario, NO los repitas.
""",
}


async def board_classifier_node(state: AgentState):
    """Siempre fuerza 1 iteración. El classifier de 2 iteraciones fue removido
    porque generaba preguntas duplicadas al usuario en la segunda ronda.

    En modo regeneración (board_regenerate=True), NO resetea board_agents_done
    para que los agentes que ya respondieron sean salteados por el router.
    """
    max_iterations = 1
    regenerate = state.get("board_regenerate", False)
    logger.info(
        "Board meeting: forzando 1 iteración"
        + (" (regeneración — preservando agents_done)" if regenerate else "")
    )

    result: dict[str, Any] = {
        "board_mode": True,
        "board_iteration": 0,
        "board_max_iterations": max_iterations,
        "tool_calls_remaining": 3,
        "already_charged": state.get("already_charged", False),
    }

    # En regeneración NO tocamos board_agents_done — el checkpoint ya tiene
    # la lista de agentes que respondieron y la usamos para saltearlos.
    if not regenerate:
        result["board_agents_done"] = []

    return result


def board_agent_node_factory(role: str):
    """Factory que crea un nodo de agente para board meeting.

    Cada agente recibe instrucciones específicas según su posición en la cadena:
    - CEO: apertura (enmarcar, delegar, NO responder)
    - CTO/CFO/CMO: cadena (leer historial, construir sobre lo dicho, NO repetir)

    Si el estado tiene board_regenerate=True, el agente se saltea si su rol ya
    tiene mensajes en el historial (el checkpoint de LangGraph). Esto permite
    regenerar solo el mensaje clickeado sin re-ejecutar todo el board.
    """

    async def board_agent_for_role(state: AgentState):
        """Ejecuta un agente en modo board meeting."""

        # Regeneración: si este rol ya tiene mensajes en el historial del
        # checkpoint, saltarlo. El router naturalmente avanza al siguiente.
        if state.get("board_regenerate"):
            # Detectar si este rol ya tiene al menos un AIMessage en el historial.
            # En board mode, cada agente produce un AIMessage; si ya hay uno de
            # este rol (CEO/CTO/CFO/CMO), no lo regeneramos.
            # Heurística: los mensajes del board NO tienen 'name' asignado por
            # LangGraph (los produce el nodo, no el tool). Nos basamos en
            # board_agents_done: si el rol ya está en la lista, ya habló.
            agents_done = list(state.get("board_agents_done", []))
            if role in agents_done:
                logger.info(f"🔄 Board regenerate: saltando {role} (ya respondió)")
                return {"board_agents_done": agents_done}

        original_prompt = state.get("system_prompt", DEFAULT_CORE_PROMPTS.get(role, ""))

        # Construir prompt específico según el rol en la cadena
        if role == "CEO":
            # CEO opener: instrucciones de apertura + instrucciones generales.
            # BUG FIX: DEFAULT_CORE_PROMPTS["CEO"] contiene "SIEMPRE sintetiza y
            # entrega una conclusión ejecutiva al usuario" que contradice BOARD_CEO_OPENER
            # ("NO RESPONDAS LA PREGUNTA DEL USUARIO"). Strippeamos las instrucciones
            # de entrega directa para que el board prompt controle el protocolo de
            # respuesta. El CEO mantiene su identidad, personalidad y herramientas.
            board_base = original_prompt.replace(
                "Después de delegar y recibir respuestas del equipo, SIEMPRE sintetiza "
                "y entrega una conclusión ejecutiva al usuario. No repitas lo que dijo "
                "cada agente — consolida en un plan de acción con pasos claros.\n",
                ""
            )
            board_prompt = board_base + BOARD_CEO_OPENER + BOARD_SYSTEM_PROMPT_ADDITION
        else:
            # Directores: instrucciones de cadena específicas + instrucciones generales
            chain_instructions = BOARD_DIRECTOR_CHAIN.get(role, "")
            board_prompt = original_prompt + chain_instructions + BOARD_SYSTEM_PROMPT_ADDITION

        # Reescribir la query para que el agente entienda que es parte de una cadena
        query = state.get("query", "")
        iteration = state.get("board_iteration", 0) + 1  # 1-indexed para el prompt
        max_iterations = state.get("board_max_iterations", 1)

        if role == "CEO":
            board_query = (
                f"[REUNIÓN DE JUNTA DIRECTIVA - Ronda {iteration}/{max_iterations}]\n\n"
                f"El usuario ha enviado el siguiente mensaje a la junta directiva:\n\n"
                f'"{query}"\n\n'
                f"Sos el CEO. ABRÍ la reunión: enmarcá el tema y delegá áreas de análisis "
                f"a tu equipo (CTO, CFO, CMO). NO respondas la pregunta del usuario todavía — "
                f"tu momento de concluir viene después de escuchar a todos."
            )
        else:
            board_query = (
                f"[REUNIÓN DE JUNTA DIRECTIVA - Ronda {iteration}/{max_iterations}]\n\n"
                f"El usuario envió este mensaje a la junta:\n\n"
                f'"{query}"\n\n'
                f"El CEO y los directores anteriores ya dieron su perspectiva. "
                f"Leé el historial completo y aportá TU análisis experto como {role}. "
                f"No repitas preguntas que otros ya hicieron. Si otros ya pidieron datos "
                f"al usuario, NO los pidas de nuevo — da tu mejor análisis con lo disponible."
            )

        # Create modified state for this agent — override query with board context
        modified_state = {
            **state,
            "next_agent": role,
            "target_role": role,
            "system_prompt": board_prompt,
            "query": board_query,
        }

        # Execute the agent
        result = await agent_node(modified_state)

        # Track which agents have done
        agents_done = list(state.get("board_agents_done", []))
        agents_done.append(role)

        return {
            **result,
            "board_agents_done": agents_done,
        }

    return board_agent_for_role


async def board_conclusion_node(state: AgentState):
    """CEO lee todas las respuestas y da la conclusión ejecutiva."""
    role = "CEO"

    # Build conclusion prompt
    conclusion_prompt = (
        DEFAULT_CORE_PROMPTS.get(role, "")
        + """

--- MODO BOARD MEETING - CONCLUSIÓN FINAL ---

Ya escuchaste a TODO tu equipo: CTO, CFO y CMO dieron sus perspectivas en el
historial de la reunión. Ahora es TU momento como CEO.

REGLAS PARA LA CONCLUSIÓN:

1. NO REPITAS lo que cada uno dijo palabra por palabra. El usuario ya lo leyó.
2. SINTETIZÁ: extraé los puntos CLAVE de cada perspectiva en una frase cada uno.
3. IDENTIFICÁ consensos y disensos: ¿en qué coinciden todos? ¿dónde hay tensión?
4. TOMÁ UNA DECISIÓN: como CEO, decidí. "Mi recomendación es..." con fundamento.
5. PROPONÉ PRÓXIMOS PASOS: acciones concretas, responsables y plazos.

Estructura sugerida para tu respuesta:
- [1 frase de contexto: qué evaluamos]
- Síntesis de perspectivas (1 línea por director)
- Decisión ejecutiva
- Próximos pasos (3-5 bullets con dueño)
"""
    )

    query = state.get("query", "")
    conclusion_query = (
        f"[REUNIÓN DE JUNTA DIRECTIVA - CIERRE]\n\n"
        f"Mensaje original del usuario a la junta:\n\n"
        f'"{query}"\n\n'
        f"Ya escuchaste a todo tu equipo. Ahora es tu turno de CERRAR la reunión: "
        f"sintetizá, decidí y proponé próximos pasos. NO repitas lo que ya dijeron — "
        f"el usuario ya lo leyó. Tu valor está en la SÍNTESIS y la DECISIÓN."
    )

    modified_state = {
        **state,
        "next_agent": role,
        "target_role": role,
        "system_prompt": conclusion_prompt,
        "query": conclusion_query,
    }

    result = await agent_node(modified_state)

    return result


def check_board_iteration(state: AgentState) -> str:
    """Decide si hacer otra iteración o ir a conclusión."""
    current_iteration = state.get("board_iteration", 0)
    max_iterations = state.get("board_max_iterations", 1)
    agents_done = state.get("board_agents_done", [])

    # Si todos los agentes han respondido en esta iteración
    if len(agents_done) >= len(BOARD_AGENTS_ORDER):
        # Si hemos completado todas las iteraciones, ir a conclusión
        if current_iteration + 1 >= max_iterations:
            return "conclusion"
        else:
            # Reset para siguiente iteración
            return "next_iteration"

    # Si no hemos terminado la iteración actual, continuar con el siguiente agente
    return "continue_iteration"


def get_next_board_agent(state: AgentState) -> str:
    """Obtiene el siguiente agente en la secuencia del board meeting."""
    agents_done = state.get("board_agents_done", [])

    for agent in BOARD_AGENTS_ORDER:
        if agent not in agents_done:
            return agent

    # Todos han respondido, esto no debería pasar si check_board_iteration funciona
    return "conclusion"


def route_board_meeting(state: AgentState) -> str:
    """Router para el flujo del board meeting."""
    decision = check_board_iteration(state)

    if decision == "conclusion":
        return "conclusion"
    elif decision == "next_iteration":
        return "next_iteration"
    else:
        next_agent = get_next_board_agent(state)
        if next_agent == "conclusion":
            return "conclusion"
        return f"{next_agent.lower()}_board"


# Board meeting workflow
board_workflow = StateGraph(AgentState)

def next_iteration_node(state: AgentState):
    """Prepara el estado para la siguiente iteración del board."""
    return {
        "board_iteration": state.get("board_iteration", 0) + 1,
        "board_agents_done": [],
        "already_charged": state.get("already_charged", False),
    }

# Add nodes
board_workflow.add_node("classifier", board_classifier_node)
board_workflow.add_node("ceo_board", board_agent_node_factory("CEO"))
board_workflow.add_node("cto_board", board_agent_node_factory("CTO"))
board_workflow.add_node("cfo_board", board_agent_node_factory("CFO"))
board_workflow.add_node("cmo_board", board_agent_node_factory("CMO"))
board_workflow.add_node("next_iteration_node", next_iteration_node)
board_workflow.add_node("conclusion", board_conclusion_node)

# Set entry point
board_workflow.set_entry_point("classifier")

# Add edges
board_workflow.add_conditional_edges(
    "classifier",
    lambda state: "ceo_board",  # Always start with CEO
    {"ceo_board": "ceo_board"},
)

board_workflow.add_conditional_edges(
    "ceo_board",
    route_board_meeting,
    {
        "cto_board": "cto_board",
        "conclusion": "conclusion",
    },
)

board_workflow.add_conditional_edges(
    "cto_board",
    route_board_meeting,
    {
        "cfo_board": "cfo_board",
        "conclusion": "conclusion",
    },
)

board_workflow.add_conditional_edges(
    "cfo_board",
    route_board_meeting,
    {
        "cmo_board": "cmo_board",
        "conclusion": "conclusion",
    },
)

board_workflow.add_conditional_edges(
    "cmo_board",
    route_board_meeting,
    {
        "next_iteration": "next_iteration_node",  # Start next iteration via state reset node
        "conclusion": "conclusion",
    },
)

board_workflow.add_edge("next_iteration_node", "ceo_board")
board_workflow.add_edge("conclusion", END)


# Lazy initialization: el checkpointer se crea una vez y se cachea.
# Esto evita que el módulo conecte DB al importar (testing imposible).
_compiled_app = None
_compiled_board_app = None


def get_orchestrator():
    """
    Factory function: retorna el grafo compilado con checkpointer MongoDB.
    Se inicializa una sola vez (singleton pattern).
    """
    global _compiled_app
    if _compiled_app is not None:
        return _compiled_app

    db.connect()
    sync_client = db.get_sync_client()
    logger.info("Cliente síncrono obtenido para LangGraph Checkpointer")

    checkpointer = MongoDBSaver(sync_client)
    logger.debug("MongoDBSaver inicializado")

    _compiled_app = workflow.compile(checkpointer=checkpointer)
    logger.info("Grafo LangGraph compilado con checkpointer MongoDB")
    return _compiled_app


def get_board_orchestrator():
    """
    Factory function: retorna el grafo del board meeting compilado con checkpointer MongoDB.
    """
    global _compiled_board_app
    if _compiled_board_app is not None:
        return _compiled_board_app

    # Ensure DB is connected
    if not db._connected:
        db.connect()

    sync_client = db.get_sync_client()
    checkpointer = MongoDBSaver(sync_client)

    _compiled_board_app = board_workflow.compile(checkpointer=checkpointer)
    logger.info("Board Meeting grafo LangGraph compilado con checkpointer MongoDB")
    return _compiled_board_app


# Para compatibilidad: exponer 'app' como property que inicializa lazy
class _LazyOrchestrator:
    """Proxy que delega al orchestrator real, inicializándolo lazy."""

    def __getattr__(self, name):
        return getattr(get_orchestrator(), name)


class _LazyBoardOrchestrator:
    """Proxy que delega al board orchestrator, inicializándolo lazy."""

    def __getattr__(self, name):
        return getattr(get_board_orchestrator(), name)


app = _LazyOrchestrator()
board_app = _LazyBoardOrchestrator()


# --- TEST ---
if __name__ == "__main__":
    # Prueba real
    q = "Cómo escalamos la base de datos para aguantar picos de tráfico?"

    print(f"\n🧪 TEST FINAL: {q}")
    real_app = get_orchestrator()
    result = real_app.invoke({"query": q, "messages": [], "user_id": "test_user"})

    print("\n" + "=" * 40)
    print(f"🤖 RESPUESTA FINAL SPHERE ({result['next_agent']}):")
    print("=" * 40)
    print(result["final_response"])
