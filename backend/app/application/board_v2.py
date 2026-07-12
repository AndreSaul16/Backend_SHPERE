"""Board Meeting V2 — debate paralelo de frontera.

Flujo:
    triage (v4-flash, elige 2-4 directores)
      → ceo_open (CEO enmarca y delega)
      → análisis EN PARALELO (cto/cfo/cmo, topología dispersa: no se leen entre sí)
      → consensus_gate (tally de votos; early-exit si consenso; inyecta intervención)
      → réplicas EN PARALELO (cada director rebate a los demás, re-vota)  [si no hubo early-exit]
      → rebuttal_join → devil (opcional) → synthesis (acta como artefacto)

Mantiene el checkpointer MongoDB compartido y es compatible con `regenerate`
(re-ejecuta solo la síntesis leyendo el checkpoint).

Diseño basado en el SOTA de multi-agent debate: rondas paralelas con topología
dispersa, réplicas con disenso explícito (anti-sycophancy), voto estructurado +
early-exit por consenso, devil's advocate y síntesis por "juez" (CEO) separado.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.mongodb import MongoDBSaver

from app.application.orchestrator import (
    AgentState,
    agent_node,
    llm_router,
    BOARD_SYSTEM_PROMPT_ADDITION,
    BOARD_CEO_OPENER,
)
from app.infrastructure.database import db, get_board_actas_collection
from app.core.logger import checkpoint_logger as logger

# Directores que pueden sentarse a debatir (el CEO siempre abre y cierra).
BOARD_DIRECTORS = ["CTO", "CFO", "CMO"]

# Mapa nodo→rol para que stream.py etiquete tokens/eventos por agente.
BOARD_NODE_ROLES_V2 = {
    "ceo_open": "CEO",
    "cto_analysis": "CTO",
    "cfo_analysis": "CFO",
    "cmo_analysis": "CMO",
    "cto_rebuttal": "CTO",
    "cfo_rebuttal": "CFO",
    "cmo_rebuttal": "CMO",
    "devil": "DEVIL",
    "synthesis": "CEO",
}

# Nodos que abren burbuja de agente en la UI, con su fase.
BOARD_NODE_PHASES_V2 = {
    "ceo_open": "opening",
    "cto_analysis": "analysis",
    "cfo_analysis": "analysis",
    "cmo_analysis": "analysis",
    "cto_rebuttal": "rebuttal",
    "cfo_rebuttal": "rebuttal",
    "cmo_rebuttal": "rebuttal",
    "devil": "devil",
    "synthesis": "synthesis",
}

# IMPORTANTE: agent_node IGNORA state["system_prompt"] (usa la identidad resuelta por
# resolve_agent_config) — todo el protocolo del board debe viajar en el `query`
# (que agent_node inserta como HumanMessage). Por eso las instrucciones de fase y el
# voto se construyen dentro de _board_query, NO en un system prompt.
VOTE_INSTRUCTION = (
    "\n\nTermina tu intervención SIEMPRE con una última línea EXACTAMENTE en este formato "
    "(sin markdown, sin negritas, sin nada después):\n"
    "[VOTO] decision=SI|NO|CONDICIONAL confianza=NN\n"
    "Donde NN es tu confianza de 0 a 100. Ejemplo: [VOTO] decision=CONDICIONAL confianza=70"
)

_VOTE_RE = re.compile(
    r"\[VOTO\]\s*decision\s*=\s*(SI|NO|CONDICIONAL)\s*confianza\s*=\s*(\d{1,3})",
    re.IGNORECASE,
)


def _parse_vote(content: str) -> Optional[dict]:
    """Extrae {decision, confidence} de la línea [VOTO] del contenido."""
    if not content:
        return None
    m = _VOTE_RE.search(content)
    if not m:
        return None
    decision = m.group(1).upper()
    try:
        confidence = max(0, min(100, int(m.group(2))))
    except ValueError:
        confidence = 50
    return {"decision": decision, "confidence": confidence}


def _strip_vote_line(content: str) -> str:
    """Elimina la línea [VOTO] del contenido visible (se muestra como chip aparte)."""
    if not content:
        return content
    cleaned = _VOTE_RE.sub("", content)
    # Limpiar líneas vacías sobrantes al final.
    return cleaned.rstrip()


def _tally(votes: dict) -> dict:
    """Cuenta votos (ignora el sentinel) y calcula consenso/confianza media."""
    real = {k: v for k, v in (votes or {}).items() if k != "__RESET__" and isinstance(v, dict)}
    counts = {"SI": 0, "NO": 0, "CONDICIONAL": 0}
    confs = []
    for v in real.values():
        d = v.get("decision")
        if d in counts:
            counts[d] += 1
        c = v.get("confidence")
        if isinstance(c, (int, float)):
            confs.append(c)
    total = sum(counts.values())
    unanimous = total > 0 and max(counts.values()) == total
    avg_conf = sum(confs) / len(confs) if confs else 0
    winner = max(counts, key=counts.get) if total else "CONDICIONAL"
    return {
        "counts": counts,
        "total": total,
        "unanimous": unanimous,
        "avg_confidence": round(avg_conf),
        "winner": winner,
    }


async def _pop_intervention(user_id: str, session_id: Optional[str]) -> Optional[str]:
    """Lee y consume (marca consumida) la primera intervención pendiente del usuario
    para esta sesión. Las intervenciones se encolan vía POST /stream/intervene."""
    if not user_id or not session_id:
        return None
    try:
        col = db.get_async_db()["board_interventions"]
        doc = await col.find_one_and_update(
            {"user_id": user_id, "session_id": session_id, "consumed": False},
            {"$set": {"consumed": True}},
            sort=[("created_at", 1)],
        )
        if doc and doc.get("text"):
            return str(doc["text"])[:1000]
    except Exception as e:
        logger.warning(f"No se pudo leer board_interventions: {e}")
    return None


# ---------------------------------------------------------------------------
# Nodos
# ---------------------------------------------------------------------------

TRIAGE_PROMPT = """Eres el coordinador de una junta directiva de IA. Tu trabajo es decidir
qué directores deben participar en el debate de esta consulta del fundador.

Directores disponibles:
- CTO: tecnología, arquitectura, viabilidad técnica, producto.
- CFO: finanzas, números, runway, pricing, unit economics.
- CMO: marketing, posicionamiento, growth, percepción de marca.

Reglas:
1. El CEO SIEMPRE abre y cierra (no lo incluyas en la lista).
2. Elige entre 2 y 3 directores, SOLO los que aporten valor real a ESTA consulta.
3. Para preguntas simples o muy enfocadas, elige 2. Para decisiones estratégicas
   amplias, elige los 3.

Responde ÚNICAMENTE con un JSON válido en una línea, sin markdown:
{{"participants": ["CTO", "CFO"], "reason": "breve motivo"}}

Consulta del fundador:
"{query}"
"""


# ---------------------------------------------------------------------------
# Memoria ejecutiva (F8): persistir el acta y recuperar las anteriores.
# Aislamiento estricto: SIEMPRE se filtra por user_id Y session_id.
# ---------------------------------------------------------------------------

_ACTA_ARTIFACT_RE = re.compile(
    r"<sphere_artifact\b[^>]*>(.*?)</sphere_artifact>", re.IGNORECASE | re.DOTALL
)


async def _save_acta(user_id: Optional[str], session_id: Optional[str], content: str) -> None:
    """Guarda el acta del debate. Tolerante a fallos: nunca rompe el debate."""
    if not (user_id and session_id and content):
        return
    try:
        m = _ACTA_ARTIFACT_RE.search(content)
        acta_md = m.group(1).strip() if m else content.strip()
        summary_text = _ACTA_ARTIFACT_RE.sub("", content).strip()
        await get_board_actas_collection().insert_one({
            "user_id": user_id,
            "session_id": session_id,
            "created_at": datetime.now(timezone.utc),
            "summary": summary_text[:500],
            "acta_md": acta_md,
        })
    except Exception as e:
        logger.warning(f"No se pudo guardar el acta (session={session_id}): {e}")


async def _load_prior_actas_context(
    user_id: Optional[str],
    session_id: Optional[str],
    limit: int = 2,
    max_chars: int = 1500,
) -> str:
    """Recupera las últimas `limit` actas de ESTA sesión como contexto breve.

    Devuelve "" si no hay actas o si algo falla. Sin vectores: solo find ordenado.
    """
    if not (user_id and session_id):
        return ""
    try:
        cursor = (
            get_board_actas_collection()
            .find({"user_id": user_id, "session_id": session_id})
            .sort("created_at", -1)
            .limit(limit)
        )
        actas = [doc async for doc in cursor]
    except Exception as e:
        logger.warning(f"No se pudieron leer actas anteriores (session={session_id}): {e}")
        return ""

    parts = [f"- {(a.get('summary') or '').strip()}" for a in actas if (a.get("summary") or "").strip()]
    if not parts:
        return ""
    ctx = "[ACTAS ANTERIORES DE ESTA JUNTA]\n" + "\n".join(parts)
    return ctx[:max_chars]


async def triage_node(state: AgentState):
    """Elige los directores participantes con el modelo rápido (v4-flash).
    En regeneración, preserva los del checkpoint."""
    regenerate = state.get("board_regenerate", False)

    if regenerate:
        participants = state.get("board_participants") or BOARD_DIRECTORS
        logger.info(f"Board V2: regeneración — participantes del checkpoint: {participants}")
        return {
            "board_participants": participants,
            "board_phase": "synthesis",
            "board_mode": True,
        }

    query = state.get("query", "")
    participants = BOARD_DIRECTORS  # fallback seguro
    reason = "Debate completo"
    try:
        resp = await llm_router.ainvoke(TRIAGE_PROMPT.format(query=query))
        raw = (resp.content or "").strip()
        # Extraer el primer objeto JSON del texto.
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(raw[start : end + 1])
            chosen = [r.upper() for r in data.get("participants", []) if r.upper() in BOARD_DIRECTORS]
            if len(chosen) >= 2:
                participants = chosen
                reason = str(data.get("reason", ""))[:200]
    except Exception as e:
        logger.warning(f"Board V2 triage falló, usando full board: {e}")

    logger.info(f"Board V2 triage: participantes={participants} ({reason})")
    return {
        "board_participants": participants,
        "board_phase": "opening",
        "board_mode": True,
        # Reset del acumulado de votos para este debate (sentinel del reducer).
        "board_votes": {"__RESET__": True},
        # Limpia residuos del board legacy en el mismo checkpoint. El triage es
        # el único escritor de este canal en V2, por eso no necesita reducer.
        "board_agents_done": [],
    }


def _board_query(role: str, phase: str, query: str, participants: list[str], prior_actas: str = "") -> str:
    """Construye el `query` (HumanMessage) con TODO el protocolo de la fase. agent_node
    ignora system_prompt, así que aquí va todo lo que el modelo debe seguir este turno."""
    if role == "CEO":
        delega = ", ".join(participants)
        opener = (
            BOARD_CEO_OPENER
            + f"\n\n[REUNIÓN DE JUNTA DIRECTIVA — APERTURA]\n\n"
            f'El fundador ha enviado a la junta:\n\n"{query}"\n\n'
            f"Sos el CEO. Abrí la reunión: enmarcá el tema y delegá áreas de análisis "
            f"EXCLUSIVAMENTE a estos directores presentes hoy: {delega}. "
            f"No menciones a directores fuera de esa lista. NO respondas la pregunta todavía."
        )
        # Memoria ejecutiva (F8): contexto de actas anteriores de esta misma junta.
        if prior_actas:
            opener += (
                f"\n\n{prior_actas}\n"
                "Tené en cuenta estas conclusiones previas para dar continuidad a la junta."
            )
        return opener
    if phase == "analysis":
        return (
            BOARD_SYSTEM_PROMPT_ADDITION
            + f"\n\n[REUNIÓN DE JUNTA — RONDA DE ANÁLISIS]\n\n"
            f'Consulta del fundador:\n\n"{query}"\n\n'
            f"Sos el {role}. El CEO ya abrió la reunión. Aportá TU análisis experto desde tu "
            f"ángulo. En esta ronda los directores analizan EN PARALELO: todavía NO has leído "
            f"a los demás, así que céntrate en tu dominio y sé contundente, sin asumir lo que "
            f"dirán los otros." + VOTE_INSTRUCTION
        )
    return (
        BOARD_SYSTEM_PROMPT_ADDITION
        + f"\n\n[REUNIÓN DE JUNTA — RONDA DE RÉPLICAS]\n\n"
        f'Consulta del fundador:\n\n"{query}"\n\n'
        f"Sos el {role}. Ya podés leer en el historial los análisis del resto de directores. "
        f"Tu valor ahora está en lo que los demás NO vieron: señalá disensos, riesgos que "
        f"nadie mencionó o ajustes a su razonamiento. Sé conciso (máximo ~150 palabras). "
        f"Si coincidís y no tenés nada que añadir, decí 'Sin objeciones' y votá. NO repitas "
        f"tu análisis anterior." + VOTE_INSTRUCTION
    )


def board_v2_node_factory(role: str, phase: str):
    """Crea un nodo de director para análisis o réplica. Parsea el voto."""

    async def node(state: AgentState):
        participants = state.get("board_participants") or BOARD_DIRECTORS
        board_query = _board_query(
            role, phase, state.get("query", ""), participants, state.get("board_prior_actas", "")
        )

        modified_state = {
            **state,
            "next_agent": role,
            "target_role": role,
            "query": board_query,
            "board_mode": True,
        }
        result = await agent_node(modified_state)

        # Estos nodos corren EN PARALELO dentro del superstep (análisis/réplicas):
        # solo pueden escribir canales con reducer (messages, board_votes).
        # Propagar final_response/tool_calls_remaining (LastValue) haría colisionar
        # las escrituras de los directores del mismo step (InvalidUpdateError).
        # final_response lo escribe únicamente synthesis al cerrar el debate.
        msgs = result.get("messages") or []
        out: dict[str, Any] = {"messages": msgs}
        if msgs:
            msg = msgs[0]
            ak = getattr(msg, "additional_kwargs", None)
            if isinstance(ak, dict):
                ak["agent_role"] = role
                ak["board_phase"] = phase
            if role != "CEO":
                vote = _parse_vote(getattr(msg, "content", "") or "")
                if vote:
                    msg.content = _strip_vote_line(msg.content)
                    if isinstance(ak, dict):
                        ak["board_vote"] = vote
                    out["board_votes"] = {role: vote}
        return out

    return node


async def ceo_open_node(state: AgentState):
    # Memoria ejecutiva (F8): en el camino fresh (no regeneración) recuperamos las
    # últimas actas de ESTA sesión y las pasamos como contexto al CEO.
    factory = board_v2_node_factory("CEO", "opening")
    if not state.get("board_regenerate"):
        prior = await _load_prior_actas_context(state.get("user_id"), state.get("session_id"))
        if prior:
            return await factory({**state, "board_prior_actas": prior})
    return await factory(state)


async def consensus_gate_node(state: AgentState):
    """Join tras la ronda de análisis: calcula consenso e inyecta intervención."""
    tally = _tally(state.get("board_votes", {}))
    early_exit = tally["unanimous"] and tally["avg_confidence"] >= 70
    logger.info(
        f"Board V2 consensus: tally={tally['counts']} unanimous={tally['unanimous']} "
        f"avg_conf={tally['avg_confidence']} early_exit={early_exit}"
    )

    updates: dict[str, Any] = {"board_phase": "rebuttal" if not early_exit else "synthesis"}

    intervention = await _pop_intervention(state.get("user_id"), state.get("session_id"))
    if intervention:
        logger.info("Board V2: inyectando intervención del fundador antes de réplicas")
        updates["messages"] = [
            HumanMessage(content=f"[INTERVENCIÓN DEL FUNDADOR DURANTE EL DEBATE] {intervention}")
        ]
    return updates


async def rebuttal_join_node(state: AgentState):
    """Join tras réplicas: segunda ventana de intervención antes de síntesis."""
    updates: dict[str, Any] = {"board_phase": "synthesis"}
    intervention = await _pop_intervention(state.get("user_id"), state.get("session_id"))
    if intervention:
        updates["messages"] = [
            HumanMessage(content=f"[INTERVENCIÓN DEL FUNDADOR DURANTE EL DEBATE] {intervention}")
        ]
    return updates


DEVIL_PROMPT = """Sos el ABOGADO DEL DIABLO de la junta directiva de SPHERE. Tu único
trabajo es estresar la decisión que la mayoría de la junta está tomando.

NO eres negativo por deporte: tu valor es encontrar el fallo que el consenso está
ignorando. Lee todo el debate y la dirección hacia la que se inclina la junta
(decisión mayoritaria: {winner}).

Ataca esa decisión con el mejor contraargumento honesto que tengas: ¿qué supuesto
es frágil? ¿qué riesgo se está subestimando? ¿qué pasaría en el peor escenario?
Sé concreto y conciso (máximo ~200 palabras). No propongas la decisión final —
solo siembra la duda productiva que el CEO debe resolver al cerrar.
"""


async def devil_node(state: AgentState):
    """Devil's Advocate: ataca la opción ganadora antes de la síntesis."""
    tally = _tally(state.get("board_votes", {}))
    query = state.get("query", "")
    devil_query = (
        DEVIL_PROMPT.format(winner=tally["winner"])
        + f"\n\n[REUNIÓN DE JUNTA — ABOGADO DEL DIABLO]\n\n"
        f'Consulta del fundador:\n\n"{query}"\n\n'
        f"La junta se inclina por: {tally['winner']}. Atacá esa decisión con tu mejor "
        f"contraargumento honesto."
    )
    modified_state = {
        **state,
        "next_agent": "DEVIL",
        "target_role": "DEVIL",
        "query": devil_query,
        "board_mode": True,
    }
    result = await agent_node(modified_state)
    msgs = result.get("messages") or []
    if msgs:
        ak = getattr(msgs[0], "additional_kwargs", None)
        if isinstance(ak, dict):
            ak["agent_role"] = "DEVIL"
            ak["board_phase"] = "devil"
    return result


SYNTHESIS_ADDITION = """

--- MODO BOARD MEETING — CIERRE Y ACTA ---

Ya escuchaste a toda la junta (análisis, réplicas y, si la hubo, la objeción del
Abogado del Diablo). Ahora cerrás vos como CEO.

Tu respuesta tiene DOS partes:

PARTE 1 (texto normal, 2-3 líneas): un resumen ejecutivo brevísimo de tu decisión
para que el fundador lo lea de un vistazo en el chat.

PARTE 2 (un artefacto): el ACTA formal de la reunión. Envolvela EXACTAMENTE así
(respetá las etiquetas literalmente):

<sphere_artifact type="markdown" title="Acta de la Junta">
# Acta de la Junta Directiva

## Contexto y pregunta
(1-2 frases sobre qué se evaluó)

## Votación
| Director | Voto | Confianza |
|----------|------|-----------|
(una fila por director con su voto real SI/NO/CONDICIONAL y su confianza)

## Decisión ejecutiva
(tu decisión clara como CEO, con fundamento)

## Riesgos clave
- (riesgos identificados, incluida la objeción del Abogado del Diablo si la hubo)

## Próximos pasos
- (acciones concretas con responsable)
</sphere_artifact>

No repitas literalmente lo que dijo cada uno: SINTETIZÁ. La tabla de votación debe
reflejar los votos reales de los directores.
"""


async def synthesis_node(state: AgentState):
    """CEO cierra el debate y emite el acta como artefacto."""
    role = "CEO"
    tally = _tally(state.get("board_votes", {}))
    votes_summary = ", ".join(
        f"{r}={v.get('decision')}({v.get('confidence')})"
        for r, v in (state.get("board_votes") or {}).items()
        if r != "__RESET__" and isinstance(v, dict)
    )
    query = state.get("query", "")
    conclusion_query = (
        SYNTHESIS_ADDITION
        + f"\n\n[REUNIÓN DE JUNTA — CIERRE]\n\n"
        f'Consulta original del fundador:\n\n"{query}"\n\n'
        f"Votos de la junta: {votes_summary or 'sin votos registrados'}. "
        f"Tendencia: {tally['winner']} (confianza media {tally['avg_confidence']}). "
        f"Cerrá la reunión con tu resumen ejecutivo + el acta como artefacto, usando los "
        f"votos reales en la tabla de votación."
    )
    # Última ventana de intervención: cubre el camino early-exit (que salta
    # rebuttal_join) y las intervenciones llegadas durante el devil's advocate.
    intervention = await _pop_intervention(state.get("user_id"), state.get("session_id"))
    if intervention:
        logger.info("Board V2: inyectando intervención del fundador antes de la síntesis")
        conclusion_query += (
            f"\n\n[INTERVENCIÓN DEL FUNDADOR DURANTE EL DEBATE] {intervention}\n"
            f"Incorporá esta intervención a tu decisión final."
        )
    modified_state = {
        **state,
        "next_agent": role,
        "target_role": role,
        "query": conclusion_query,
        "board_mode": True,
    }
    result = await agent_node(modified_state)
    msgs = result.get("messages") or []
    if msgs:
        ak = getattr(msgs[0], "additional_kwargs", None)
        if isinstance(ak, dict):
            ak["agent_role"] = "CEO"
            ak["board_phase"] = "synthesis"
            ak["is_conclusion"] = True
    if intervention:
        # Registrar la intervención en el historial ANTES de la respuesta del CEO
        # (mismo formato que consensus_gate/rebuttal_join; stream.py la ecoa a la UI).
        result["messages"] = [
            HumanMessage(content=f"[INTERVENCIÓN DEL FUNDADOR DURANTE EL DEBATE] {intervention}")
        ] + msgs

    # Memoria ejecutiva (F8): persistir el acta de este debate (tolerante a fallos).
    acta_content = result.get("final_response") or (msgs[0].content if msgs else "")
    await _save_acta(state.get("user_id"), state.get("session_id"), acta_content)

    return result


# ---------------------------------------------------------------------------
# Routers (fan-out paralelo)
# ---------------------------------------------------------------------------

def route_after_triage(state: AgentState) -> str:
    """Regeneración salta directo a la síntesis."""
    if state.get("board_regenerate"):
        return "synthesis"
    return "ceo_open"


def route_analysis(state: AgentState) -> list[str]:
    """Fan-out: devuelve la lista de nodos de análisis a ejecutar en paralelo."""
    participants = state.get("board_participants") or BOARD_DIRECTORS
    return [f"{r.lower()}_analysis" for r in participants]


def route_after_consensus(state: AgentState):
    """Tras el análisis: réplicas en paralelo, o saltar a devil/síntesis si hubo early-exit."""
    tally = _tally(state.get("board_votes", {}))
    early_exit = tally["unanimous"] and tally["avg_confidence"] >= 70
    if early_exit:
        return ["devil"] if state.get("board_devil") else ["synthesis"]
    participants = state.get("board_participants") or BOARD_DIRECTORS
    return [f"{r.lower()}_rebuttal" for r in participants]


def route_after_rebuttal(state: AgentState) -> str:
    return "devil" if state.get("board_devil") else "synthesis"


# ---------------------------------------------------------------------------
# Construcción del grafo
# ---------------------------------------------------------------------------

def build_board_v2_workflow() -> StateGraph:
    wf = StateGraph(AgentState)

    wf.add_node("triage", triage_node)
    wf.add_node("ceo_open", ceo_open_node)
    wf.add_node("cto_analysis", board_v2_node_factory("CTO", "analysis"))
    wf.add_node("cfo_analysis", board_v2_node_factory("CFO", "analysis"))
    wf.add_node("cmo_analysis", board_v2_node_factory("CMO", "analysis"))
    wf.add_node("consensus_gate", consensus_gate_node)
    wf.add_node("cto_rebuttal", board_v2_node_factory("CTO", "rebuttal"))
    wf.add_node("cfo_rebuttal", board_v2_node_factory("CFO", "rebuttal"))
    wf.add_node("cmo_rebuttal", board_v2_node_factory("CMO", "rebuttal"))
    wf.add_node("rebuttal_join", rebuttal_join_node)
    wf.add_node("devil", devil_node)
    wf.add_node("synthesis", synthesis_node)

    wf.set_entry_point("triage")

    wf.add_conditional_edges(
        "triage",
        route_after_triage,
        {"ceo_open": "ceo_open", "synthesis": "synthesis"},
    )

    # CEO → análisis paralelo
    wf.add_conditional_edges(
        "ceo_open",
        route_analysis,
        {
            "cto_analysis": "cto_analysis",
            "cfo_analysis": "cfo_analysis",
            "cmo_analysis": "cmo_analysis",
        },
    )

    # Análisis → join (barrera natural de LangGraph)
    for n in ("cto_analysis", "cfo_analysis", "cmo_analysis"):
        wf.add_edge(n, "consensus_gate")

    # Join → réplicas paralelas o salto
    wf.add_conditional_edges(
        "consensus_gate",
        route_after_consensus,
        {
            "cto_rebuttal": "cto_rebuttal",
            "cfo_rebuttal": "cfo_rebuttal",
            "cmo_rebuttal": "cmo_rebuttal",
            "devil": "devil",
            "synthesis": "synthesis",
        },
    )

    # Réplicas → join
    for n in ("cto_rebuttal", "cfo_rebuttal", "cmo_rebuttal"):
        wf.add_edge(n, "rebuttal_join")

    wf.add_conditional_edges(
        "rebuttal_join",
        route_after_rebuttal,
        {"devil": "devil", "synthesis": "synthesis"},
    )

    wf.add_edge("devil", "synthesis")
    wf.add_edge("synthesis", END)
    return wf


board_workflow_v2 = build_board_v2_workflow()

# Lazy compile con checkpointer compartido (mismo patrón que orchestrator.py).
_compiled_board_v2 = None


def get_board_v2_orchestrator():
    global _compiled_board_v2
    if _compiled_board_v2 is not None:
        return _compiled_board_v2
    if not db._connected:
        db.connect()
    sync_client = db.get_sync_client()
    checkpointer = MongoDBSaver(sync_client)
    _compiled_board_v2 = board_workflow_v2.compile(checkpointer=checkpointer)
    logger.info("Board V2 grafo LangGraph compilado con checkpointer MongoDB")
    return _compiled_board_v2


class _LazyBoardV2Orchestrator:
    def __getattr__(self, name):
        return getattr(get_board_v2_orchestrator(), name)


board_v2_app = _LazyBoardV2Orchestrator()
