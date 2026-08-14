"""Tests del Board Meeting V2: parser de votos, tally/consenso, routing fan-out,
reducer de votos y partial_refund del triage."""
import pytest

from app.application.board_v2 import (
    _parse_vote,
    _strip_vote_line,
    _tally,
    route_after_triage,
    route_analysis,
    route_after_consensus,
    route_after_rebuttal,
    BOARD_DIRECTORS,
)
from app.application.orchestrator import _merge_board_votes


# --- Parser de votos ---

def test_parse_vote_basico():
    assert _parse_vote("análisis...\n[VOTO] decision=SI confianza=85") == {"decision": "SI", "confidence": 85}


def test_parse_vote_condicional_minuscula():
    # case-insensitive en la etiqueta
    assert _parse_vote("[voto] decision=condicional confianza=40") == {"decision": "CONDICIONAL", "confidence": 40}


def test_parse_vote_clamp_confianza():
    assert _parse_vote("[VOTO] decision=NO confianza=150")["confidence"] == 100


def test_parse_vote_sin_linea():
    assert _parse_vote("texto sin voto") is None


def test_parse_vote_none_seguro():
    assert _parse_vote("") is None


def test_strip_vote_line_quita_voto():
    txt = "Mi análisis es sólido.\n\n[VOTO] decision=SI confianza=90"
    assert _strip_vote_line(txt) == "Mi análisis es sólido."


# --- Tally / consenso ---

def test_tally_unanime():
    votes = {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "SI", "confidence": 90}}
    t = _tally(votes, participants=["CTO", "CFO"])
    assert t["unanimous"] is True and t["winner"] == "SI" and t["avg_confidence"] == 85


def test_tally_dividido_no_unanime():
    votes = {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "NO", "confidence": 60}}
    t = _tally(votes, participants=["CTO", "CFO"])
    assert t["unanimous"] is False and t["total_decisivos"] == 2


def test_tally_ignora_sentinel():
    votes = {"__RESET__": True, "CTO": {"decision": "NO", "confidence": 70}}
    t = _tally(votes, participants=["CTO"])
    assert t["total_decisivos"] == 1 and t["counts"]["NO"] == 1


# --- Reducer de votos (acumulación paralela + reset) ---

def test_merge_votes_acumula():
    left = {"CTO": {"decision": "SI", "confidence": 80}}
    right = {"CFO": {"decision": "NO", "confidence": 60}}
    merged = _merge_board_votes(left, right)
    assert set(merged.keys()) == {"CTO", "CFO"}


def test_merge_votes_reset():
    left = {"CTO": {"decision": "SI", "confidence": 80}}
    assert _merge_board_votes(left, {"__RESET__": True}) == {}


# --- Routing ---

def test_route_after_triage_regenera_va_a_synthesis():
    assert route_after_triage({"board_regenerate": True}) == "synthesis"


def test_route_after_triage_normal_va_a_ceo():
    assert route_after_triage({"board_regenerate": False}) == "ceo_open"


def test_route_analysis_fanout_por_participantes():
    nodes = route_analysis({"board_participants": ["CTO", "CFO"]})
    assert sorted(nodes) == ["cfo_analysis", "cto_analysis"]


def test_route_analysis_default_full_board():
    nodes = route_analysis({})
    assert sorted(nodes) == sorted(f"{r.lower()}_analysis" for r in BOARD_DIRECTORS)


def test_route_after_consensus_early_exit_sin_devil():
    # unánime con confianza alta → salta réplicas, va a síntesis (sin devil)
    state = {
        "board_votes": {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "SI", "confidence": 90}},
        "board_participants": ["CTO", "CFO"],
        "board_devil": False,
    }
    assert route_after_consensus(state) == ["synthesis"]


def test_route_after_consensus_early_exit_con_devil():
    state = {
        "board_votes": {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "SI", "confidence": 90}},
        "board_participants": ["CTO", "CFO"],
        "board_devil": True,
    }
    assert route_after_consensus(state) == ["devil"]


def test_route_after_consensus_sin_consenso_va_a_replicas():
    state = {
        "board_votes": {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "NO", "confidence": 60}},
        "board_participants": ["CTO", "CFO"],
        "board_devil": False,
    }
    assert sorted(route_after_consensus(state)) == ["cfo_rebuttal", "cto_rebuttal"]


def test_route_after_rebuttal_devil_flag():
    assert route_after_rebuttal({"board_devil": True}) == "devil"
    assert route_after_rebuttal({"board_devil": False}) == "synthesis"


def test_board_v2_graph_compila():
    from app.application.board_v2 import board_workflow_v2
    # Compila sin checkpointer (valida estructura de nodos/edges/fan-out).
    assert board_workflow_v2.compile() is not None


# --- Ejecución end-to-end del grafo (agent_node y llm mockeados) ---

import json

from langchain_core.messages import AIMessage

import app.application.board_v2 as board_v2_module


class _FakeRouter:
    """Sustituye llm_router en el triage: siempre elige full board."""

    def __init__(self, participants):
        self._participants = participants

    async def ainvoke(self, prompt):
        payload = json.dumps({"participants": self._participants, "reason": "test"})
        return AIMessage(content=payload)


def _fake_agent_node(votes_by_role):
    """Simula agent_node con su contrato real de retorno (final_response,
    messages, tool_calls_remaining) y una línea de voto por rol."""

    async def fake(state):
        role = state.get("next_agent", "CEO")
        content = f"Intervención de {role} en fase {state.get('board_phase')}."
        vote = votes_by_role.get(role)
        if vote:
            content += f"\n[VOTO] decision={vote} confianza=90"
        return {
            "final_response": content,
            "messages": [AIMessage(content=content)],
            "tool_calls_remaining": 3,
        }

    return fake


async def _no_intervention(user_id, session_id):
    return None


def _initial_state(**overrides):
    state = {
        "messages": [],
        "next_agent": "CEO",
        "query": "¿Lanzamos el producto en Q3?",
        "final_response": "",
        "tool_calls_remaining": 3,
        "user_id": "u_test",
        "already_charged": True,
        "board_mode": True,
        "board_iteration": 0,
        "board_max_iterations": 1,
        "board_agents_done": ["CEO", "CTO"],  # residuo de un debate legacy previo
        "board_regenerate": False,
        "session_id": "s_test",
        "board_votes": {},
        "board_devil": False,
    }
    state.update(overrides)
    return state


@pytest.fixture
def board_v2_graph(monkeypatch):
    """Grafo V2 compilado sin checkpointer, con LLM/DB mockeados."""
    monkeypatch.setattr(board_v2_module, "llm_router", _FakeRouter(["CTO", "CFO", "CMO"]))
    monkeypatch.setattr(board_v2_module, "_pop_intervention", _no_intervention)
    return board_v2_module.build_board_v2_workflow().compile()


async def test_debate_paralelo_completo_sin_colision(monkeypatch, board_v2_graph):
    """3 directores analizan/replican en el mismo superstep: los canales sin
    reducer (final_response, tool_calls_remaining) no deben recibir escrituras
    paralelas (InvalidUpdateError)."""
    monkeypatch.setattr(
        board_v2_module,
        "agent_node",
        _fake_agent_node({"CTO": "SI", "CFO": "NO", "CMO": "CONDICIONAL"}),
    )
    result = await board_v2_graph.ainvoke(_initial_state())

    assert result["board_participants"] == ["CTO", "CFO", "CMO"]
    # Votos dividos → hubo réplicas: CEO + 3 análisis + 3 réplicas + síntesis.
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    assert len(ai_messages) == 8
    # El voto de cada director quedó registrado (re-voto de la réplica pisa al del análisis).
    assert set(result["board_votes"].keys()) == {"CTO", "CFO", "CMO"}
    # La síntesis es la respuesta final (única escritura de final_response que sobrevive).
    assert "synthesis" in result["final_response"]
    # El triage limpió el residuo legacy de board_agents_done.
    assert result["board_agents_done"] == []
    # La línea [VOTO] se elimina del contenido visible.
    assert not any("[VOTO]" in m.content for m in ai_messages if getattr(m, "additional_kwargs", {}).get("board_vote"))


async def test_debate_early_exit_salta_replicas(monkeypatch, board_v2_graph):
    """Voto unánime con confianza ≥70 → early-exit: no hay ronda de réplicas."""
    monkeypatch.setattr(
        board_v2_module,
        "agent_node",
        _fake_agent_node({"CTO": "SI", "CFO": "SI", "CMO": "SI"}),
    )
    result = await board_v2_graph.ainvoke(_initial_state())

    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    # CEO + 3 análisis + síntesis (sin réplicas).
    assert len(ai_messages) == 5
    phases = {m.additional_kwargs.get("board_phase") for m in ai_messages}
    assert "rebuttal" not in phases


async def test_debate_early_exit_con_devil(monkeypatch, board_v2_graph):
    """Early-exit con devil's advocate activado: el DEVIL ataca antes de la síntesis."""
    monkeypatch.setattr(
        board_v2_module,
        "agent_node",
        _fake_agent_node({"CTO": "SI", "CFO": "SI", "CMO": "SI"}),
    )
    result = await board_v2_graph.ainvoke(_initial_state(board_devil=True))

    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    # CEO + 3 análisis + devil + síntesis.
    assert len(ai_messages) == 6
    assert any(m.additional_kwargs.get("agent_role") == "DEVIL" for m in ai_messages)


async def test_intervencion_en_ventana_de_sintesis_early_exit(monkeypatch, board_v2_graph):
    """Con early-exit no hay rebuttal_join: una intervención llegada tras el
    consensus_gate debe consumirse en la ventana de la síntesis y quedar en el
    historial antes de la respuesta del CEO."""
    calls = iter([None, "Tened en cuenta el presupuesto de Q4"])

    async def queued_intervention(user_id, session_id):
        return next(calls, None)

    monkeypatch.setattr(board_v2_module, "_pop_intervention", queued_intervention)
    monkeypatch.setattr(
        board_v2_module,
        "agent_node",
        _fake_agent_node({"CTO": "SI", "CFO": "SI", "CMO": "SI"}),
    )
    result = await board_v2_graph.ainvoke(_initial_state())

    contents = [getattr(m, "content", "") for m in result["messages"]]
    injected = [c for c in contents if isinstance(c, str) and c.startswith("[INTERVENCIÓN DEL FUNDADOR")]
    assert len(injected) == 1
    assert "presupuesto de Q4" in injected[0]
    # La intervención precede a la síntesis del CEO en el historial.
    synthesis_idx = next(
        i for i, m in enumerate(result["messages"])
        if isinstance(m, AIMessage) and m.additional_kwargs.get("is_conclusion")
    )
    assert contents.index(injected[0]) < synthesis_idx


# --- partial_refund del CreditManager ---

def test_partial_refund_clamp_y_transaccion():
    from app.application.credit_manager import CreditManager, ChargeContext

    class FakeCol:
        def __init__(self):
            self.updates = []
            self.inserts = []
        def update_one(self, *a, **k):
            self.updates.append((a, k))
        def insert_one(self, doc):
            self.inserts.append(doc)

    cm = CreditManager.__new__(CreditManager)
    cm.users_collection = FakeCol()
    cm.transactions_collection = FakeCol()

    ctx = ChargeContext(tx_id="tx_x", user_id="u1", cost=5, source="plan", counted_as=5)
    cm.partial_refund(ctx, 2)
    # Devuelve 2 al bucket plan + registra transacción +2
    assert cm.users_collection.updates, "debe hacer $inc"
    assert cm.transactions_collection.inserts[0]["delta"] == 2
    assert cm.transactions_collection.inserts[0]["reason"] == "board_triage_reduced"


def test_partial_refund_clamp_no_devuelve_de_mas():
    from app.application.credit_manager import CreditManager, ChargeContext

    class FakeCol:
        def __init__(self):
            self.inserts = []
        def update_one(self, *a, **k):
            pass
        def insert_one(self, doc):
            self.inserts.append(doc)

    cm = CreditManager.__new__(CreditManager)
    cm.users_collection = FakeCol()
    cm.transactions_collection = FakeCol()
    ctx = ChargeContext(tx_id="tx_x", user_id="u1", cost=5, source="topup", counted_as=5)
    cm.partial_refund(ctx, 99)  # se clampa a 5
    assert cm.transactions_collection.inserts[0]["delta"] == 5


# ---------------------------------------------------------------------------
# lanzamiento-p0 — recuento con censo (specs/board-vote-tally)
# ---------------------------------------------------------------------------

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


# --- BVT-001: normalización del voto ---

@pytest.mark.parametrize(
    "linea, esperado",
    [
        pytest.param(
            "[VOTO] decision=SI, confianza=80",
            {"decision": "SI", "confidence": 80},
            id="coma",
        ),
        pytest.param(
            "**[voto] decision = CONDICIONAL ; confianza = 70**",
            {"decision": "CONDICIONAL", "confidence": 70},
            id="punto-y-coma",
        ),
        pytest.param(
            "[VOTO] decision=sí confianza=90",
            {"decision": "SI", "confidence": 90},
            id="si-con-tilde",
        ),
        pytest.param(
            "[VOTO] decision=SI confianza=150",
            {"decision": "SI", "confidence": 100},
            id="confianza-fuera-de-rango",
        ),
        pytest.param(
            "[VOTO] decision=NO confianza=55 (revisable)",
            {"decision": "NO", "confidence": 55},
            id="texto-tras-el-numero",
        ),
    ],
)
def test_normalizacion_del_voto(linea, esperado):
    """BVT-001. Puntuación, decoración markdown, tilde y texto tras el número.

    Los dos últimos casos ya pasaban antes del cambio: entran como regresión.
    """
    assert _parse_vote(f"Mi análisis ocupa varias líneas.\n\n{linea}") == esperado


def test_confianza_ilegible_asume_50():
    """BVT-001. Confianza ilegible con decisión válida → 50, y ese 50 bloquea
    el early-exit aunque los tres voten lo mismo."""
    assert _parse_vote("[VOTO] decision=SI confianza=alto") == {"decision": "SI", "confidence": 50}

    votes = {
        "CTO": {"decision": "SI", "confidence": 50},
        "CFO": {"decision": "SI", "confidence": 75},
        "CMO": {"decision": "SI", "confidence": 80},
    }
    tally = _tally(votes, participants=["CTO", "CFO", "CMO"])
    assert tally["unanimous"] is True
    assert tally["avg_confidence"] == 68
    assert tally["early_exit"] is False


# --- BVT-002: abstención explícita ---

def test_voto_irreconocible_es_abstencion():
    """BVT-002. El CFO vota QUIZÁS (no interpretable) y el CMO no escribe línea
    de voto: los dos figuran como abstención del censo, no como ausentes."""
    assert _parse_vote("Mi análisis.\n[VOTO] decision=QUIZÁS confianza=alto") is None

    votes = {
        "CTO": {"decision": "SI", "confidence": 90},
        # El nodo escribe la abstención explícita del CFO; el CMO no aparece.
        "CFO": {"decision": "ABSTENCION", "confidence": None},
    }
    tally = _tally(votes, participants=["CTO", "CFO", "CMO"])
    assert tally["counts"]["ABSTENCION"] == 2
    assert sorted(tally["abstentions"]) == ["CFO", "CMO"]
    assert tally["counts"] == {"SI": 1, "NO": 0, "CONDICIONAL": 0, "ABSTENCION": 2}
    assert tally["avg_confidence"] == 90  # la abstención no entra en la media


def _fake_agent_node_contenido(contenido: str):
    """agent_node que devuelve un contenido fijo (para probar el nodo director)."""

    async def fake(state):
        return {
            "final_response": contenido,
            "messages": [AIMessage(content=contenido)],
            "tool_calls_remaining": 3,
        }

    return fake


async def test_abstencion_se_escribe_en_board_votes(monkeypatch, caplog):
    """BVT-002. El voto que no parsea se escribe como ABSTENCION en el canal de
    estado (de ahí salen el SSE, la persistencia y el chip de la UI) y se loguea."""
    monkeypatch.setattr(
        board_v2_module,
        "agent_node",
        _fake_agent_node_contenido("Mi análisis.\n[VOTO] decision=QUIZÁS confianza=alto"),
    )
    monkeypatch.setattr(board_v2_module.logger, "propagate", True)

    node = board_v2_module.board_v2_node_factory("CTO", "analysis")
    with caplog.at_level(logging.WARNING, logger="sphere.checkpoint"):
        out = await node(_initial_state(next_agent="CTO"))

    assert out["board_votes"] == {"CTO": {"decision": "ABSTENCION", "confidence": None}}
    assert "CTO" in caplog.text and "ABSTENCION" in caplog.text


# --- BVT-003: unanimidad real ---

@pytest.mark.parametrize(
    "censo, votes, counts_esperados, expected_esperado, unanime_esperado",
    [
        pytest.param(
            ["CTO", "CFO", "CMO"],
            {
                "CTO": {"decision": "SI", "confidence": 90},
                "CFO": {"decision": "ABSTENCION", "confidence": None},
                "CMO": {"decision": "ABSTENCION", "confidence": None},
            },
            {"SI": 1, "NO": 0, "CONDICIONAL": 0, "ABSTENCION": 2},
            3,
            False,
            id="dos-malformados",
        ),
        pytest.param(
            ["CTO", "CFO", "CMO"],
            {
                "CTO": {"decision": "SI", "confidence": 90},
                "CFO": {"decision": "SI", "confidence": 80},
                "CMO": {"decision": "SI", "confidence": 85},
            },
            {"SI": 3, "NO": 0, "CONDICIONAL": 0, "ABSTENCION": 0},
            3,
            True,
            id="unanimidad-legitima",
        ),
        pytest.param(
            ["CTO", "CTO"],
            {"CTO": {"decision": "SI", "confidence": 90}},
            {"SI": 1, "NO": 0, "CONDICIONAL": 0, "ABSTENCION": 0},
            1,
            True,
            id="censo-duplicado",
        ),
    ],
)
def test_unanimidad_exige_censo_completo(
    censo, votes, counts_esperados, expected_esperado, unanime_esperado
):
    """BVT-003. `unanimous` exige un voto decisivo por cada votante del censo,
    y el censo se deduplica por rol."""
    tally = _tally(votes, participants=censo)
    assert tally["counts"] == counts_esperados
    assert tally["expected"] == expected_esperado
    assert tally["unanimous"] is unanime_esperado
    assert sum(counts_esperados.values()) == tally["expected"]


# --- BVT-004: empate declarado ---

def test_empate_se_declara():
    """BVT-004. 1-1-1 no tiene ganador, y sin votos decisivos tampoco."""
    empate = {
        "CTO": {"decision": "SI", "confidence": 80},
        "CFO": {"decision": "NO", "confidence": 70},
        "CMO": {"decision": "CONDICIONAL", "confidence": 60},
    }
    tally = _tally(empate)
    assert tally["outcome"] == "EMPATE"
    assert tally["winner"] is None
    assert tally["unanimous"] is False

    sin_votos = {r: {"decision": "ABSTENCION", "confidence": None} for r in BOARD_DIRECTORS}
    vacio = _tally(sin_votos)
    assert vacio["outcome"] == "SIN_VOTOS"
    assert vacio["winner"] is None


# --- BVT-005: invariante del enrutado ---

def test_early_exit_no_con_abstenciones():
    """BVT-005. Con una abstención no hay early-exit por alta que sea la
    confianza de los decisivos, y el grafo devuelve la ronda de réplicas."""
    votes = {
        "CTO": {"decision": "SI", "confidence": 95},
        "CFO": {"decision": "SI", "confidence": 95},
        "CMO": {"decision": "ABSTENCION", "confidence": None},
    }
    tally = _tally(votes)
    assert tally["early_exit"] is False
    assert tally["counts"]["ABSTENCION"] == 1
    assert tally["avg_confidence"] == 95

    state = {
        "board_votes": votes,
        "board_participants": ["CTO", "CFO", "CMO"],
        "board_devil": False,
    }
    assert sorted(route_after_consensus(state)) == [
        "cfo_rebuttal",
        "cmo_rebuttal",
        "cto_rebuttal",
    ]


# --- BVT-006 y CS-009: el stream (payload y reembolsos) ---

class _FakeOrchestrator:
    """Sustituye board_v2_app: emite eventos fijos y expone el estado acumulado."""

    def __init__(self, events, values):
        self._events = events
        self._values = values

    async def astream_events(self, initial_state, config=None, version=None):
        for event in self._events:
            yield event

    async def aget_state(self, config):
        return SimpleNamespace(values=self._values)


async def _drenar_stream(events, values, credit_manager=None, participants=None):
    """Ejecuta generate_chat_events con el grafo falso y devuelve los payloads SSE."""
    import app.presentation.api.v1.stream as stream_module
    from app.application.credit_manager import ChargeContext

    fake = _FakeOrchestrator(events, values)
    ctx = ChargeContext(tx_id="tx_test", user_id="u_test", cost=5, source="plan", counted_as=5)

    payloads = []
    with patch.object(stream_module, "board_v2_app", fake):
        async for chunk in stream_module.generate_chat_events(
            query="¿Lanzamos en Q3?",
            session_id="s_test",
            user_id="u_test",
            board_mode=True,
            board_v2=True,
            already_charged=True,
            charge_ctx=ctx,
            credit_manager=credit_manager,
        ):
            raw = chunk.removeprefix("data: ").strip()
            if raw and raw != "[DONE]":
                payloads.append(json.loads(raw))
    return payloads


async def test_payload_board_consensus():
    """BVT-006. El evento board_consensus lleva censo, abstenciones y resultado."""
    values = {
        "board_participants": ["CTO", "CFO", "CMO"],
        "board_votes": {
            "CTO": {"decision": "SI", "confidence": 90},
            "CFO": {"decision": "ABSTENCION", "confidence": None},
            "CMO": {"decision": "ABSTENCION", "confidence": None},
        },
    }
    events = [{"event": "on_chain_end", "name": "consensus_gate", "data": {"output": {}}}]
    payloads = await _drenar_stream(events, values)

    consenso = next(p for p in payloads if p["type"] == "board_consensus")
    assert consenso["expected"] == 3
    assert consenso["tally"]["ABSTENCION"] == 2
    assert consenso["outcome"] == "MAYORIA"
    assert consenso["winner"] == "SI"
    assert consenso["total_decisivos"] == 1
    assert consenso["unanimous"] is False
    assert consenso["early_exit"] is False


async def test_early_exit_no_reembolsa():
    """CS-009. El debate abreviado no abarata el precio: el único reembolso
    parcial es el del triaje, y con junta completa (5 créditos) no hay ninguno."""
    unanime = {
        "board_participants": ["CTO", "CFO", "CMO"],
        "board_votes": {
            "CTO": {"decision": "SI", "confidence": 90},
            "CFO": {"decision": "SI", "confidence": 95},
            "CMO": {"decision": "SI", "confidence": 92},
        },
    }
    events = [
        {
            "event": "on_chain_end",
            "name": "triage",
            "data": {"output": {"board_participants": ["CTO", "CFO", "CMO"]}},
        },
        {"event": "on_chain_end", "name": "consensus_gate", "data": {"output": {}}},
    ]
    cm = SimpleNamespace(apartial_refund=AsyncMock(), aadjust_after_completion=AsyncMock())
    payloads = await _drenar_stream(events, unanime, credit_manager=cm)

    plan = next(p for p in payloads if p["type"] == "board_plan")
    consenso = next(p for p in payloads if p["type"] == "board_consensus")
    assert plan["cost"] == 5
    assert consenso["early_exit"] is True  # el debate SÍ se abrevia
    assert cm.apartial_refund.await_count == 0  # y aun así no se reembolsa nada


async def test_junta_reducida_reembolsa_una_sola_vez():
    """CS-009 (triangulación). Con junta reducida el reembolso del triaje se
    emite exactamente una vez, y el consenso no añade un segundo."""
    unanime = {
        "board_participants": ["CTO", "CFO"],
        "board_votes": {
            "CTO": {"decision": "SI", "confidence": 90},
            "CFO": {"decision": "SI", "confidence": 95},
        },
    }
    events = [
        {
            "event": "on_chain_end",
            "name": "triage",
            "data": {"output": {"board_participants": ["CTO", "CFO"]}},
        },
        {"event": "on_chain_end", "name": "consensus_gate", "data": {"output": {}}},
    ]
    cm = SimpleNamespace(apartial_refund=AsyncMock(), aadjust_after_completion=AsyncMock())
    payloads = await _drenar_stream(events, unanime, credit_manager=cm)

    plan = next(p for p in payloads if p["type"] == "board_plan")
    assert plan["cost"] == 3
    assert cm.apartial_refund.await_count == 1
    assert cm.apartial_refund.await_args.args[1] == 2


# ---------------------------------------------------------------------------
# QA-2 (C): los nodos internos de decisión no escriben en el transcript
# ---------------------------------------------------------------------------


def _evento_token(node: str, texto: str):
    """Un `on_chat_model_stream` como los que emite LangGraph, con su nodo.

    `metadata.langgraph_node` es el único dato que dice QUIÉN emite el token:
    `stream.py` ya lo leía, pero sólo para etiquetar el rol que habla.
    """
    return {
        "event": "on_chat_model_stream",
        "data": {"chunk": SimpleNamespace(content=texto)},
        "metadata": {"langgraph_node": node},
    }


async def _drenar_stream_normal(events):
    """Como `_drenar_stream`, pero por el grafo del modo NORMAL (sin junta)."""
    import app.presentation.api.v1.stream as stream_module

    fake = _FakeOrchestrator(events, {})

    payloads = []
    with patch.object(stream_module, "orchestrator_app", fake):
        async for chunk in stream_module.generate_chat_events(
            query="¿Cuánto cuesta migrar a Postgres?",
            session_id="s_test",
            user_id="u_test",
            target_role="CTO",
            board_mode=False,
        ):
            raw = chunk.removeprefix("data: ").strip()
            if raw and raw != "[DONE]":
                payloads.append(json.loads(raw))
    return payloads


async def test_triage_no_escribe_en_el_transcript():
    """QA-2 (C). El nodo `triage` responde un JSON en una línea POR DISEÑO
    (`TRIAGE_PROMPT`: «Responde ÚNICAMENTE con un JSON válido en una línea»), y
    `llm_router` streamea. `stream.py` leía `langgraph_node` sólo para etiquetar
    el rol, nunca para descartar, así que ese JSON salía como tokens y el
    frontend lo pintaba en una burbuja del debate.

    El dato útil del triaje ya viaja estructurado por su propio canal
    (`board_plan`): en el transcript era fuga pura.
    """
    events = [
        _evento_token("triage", '{"participants": ["CTO", "CFO"], '),
        _evento_token("triage", '"reason": "pricing y viabilidad"}'),
    ]

    payloads = await _drenar_stream(events, {})

    assert [p for p in payloads if p["type"] == "token"] == []
    # Ni por el canal del token ni por ningún otro: el buffer se vuelca al
    # cerrar el stream y sin el guard también acabaría en el chat.
    assert not any("participants" in json.dumps(p) for p in payloads)


async def test_router_no_escribe_su_decision_en_el_transcript():
    """QA-2 (C), triangulación. El mismo agujero en el modo normal: el nodo
    `router` decide a qué director va la consulta y fuga su decisión ("CTO")
    como si fuera la respuesta del agente."""
    events = [_evento_token("router", "CTO")]

    payloads = await _drenar_stream_normal(events)

    assert [p for p in payloads if p["type"] == "token"] == []


async def test_un_nodo_normal_sigue_streameando_sus_tokens():
    """QA-2 (C), CONTROL. El guard es una lista cerrada de nodos de decisión, y
    tiene que serlo: un filtro del tipo «si el nodo no tiene rol de junta,
    descartar» dejaría mudo el modo normal entero, porque `expert_agent`
    tampoco tiene rol de junta. Este test es lo que impide esa sobre-corrección.
    """
    events = [
        _evento_token("expert_agent", "Migrar a Postgres "),
        _evento_token("expert_agent", "cuesta unas tres semanas."),
    ]

    payloads = await _drenar_stream_normal(events)

    assert [p["content"] for p in payloads if p["type"] == "token"] == [
        "Migrar a Postgres ",
        "cuesta unas tres semanas.",
    ]


async def test_un_director_sigue_streameando_con_su_rol():
    """QA-2 (C), CONTROL en junta. Los nodos que SÍ hablan al usuario siguen
    emitiendo, y con su rol: el guard no puede tocar el debate."""
    events = [_evento_token("cto_analysis", "Técnicamente es viable en Q3.")]

    payloads = await _drenar_stream(events, {})

    tokens = [p for p in payloads if p["type"] == "token"]
    assert [t["content"] for t in tokens] == ["Técnicamente es viable en Q3."]
    assert tokens[0]["role"] == "CTO"
