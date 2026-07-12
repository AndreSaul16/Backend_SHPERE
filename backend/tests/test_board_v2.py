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
    t = _tally(votes)
    assert t["unanimous"] is True and t["winner"] == "SI" and t["avg_confidence"] == 85


def test_tally_dividido_no_unanime():
    votes = {"CTO": {"decision": "SI", "confidence": 80}, "CFO": {"decision": "NO", "confidence": 60}}
    t = _tally(votes)
    assert t["unanimous"] is False and t["total"] == 2


def test_tally_ignora_sentinel():
    votes = {"__RESET__": True, "CTO": {"decision": "NO", "confidence": 70}}
    t = _tally(votes)
    assert t["total"] == 1 and t["counts"]["NO"] == 1


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
