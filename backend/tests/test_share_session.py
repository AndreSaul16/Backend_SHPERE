"""Contrato del share público read-only de sesiones (F1).

El endpoint público NUNCA debe filtrar campos sensibles (user_id, emails,
payloads de herramientas). Estos tests validan el sanitizado con mocks, sin
Mongo real.
"""
from types import SimpleNamespace

from app.presentation.api.v1.sessions import _sanitize_shared_messages


def _human(content, **kwargs):
    return SimpleNamespace(type="human", content=content, additional_kwargs=kwargs)


def _ai(content, **kwargs):
    return SimpleNamespace(type="ai", content=content, additional_kwargs=kwargs)


def _tool(content, **kwargs):
    return SimpleNamespace(type="tool", content=content, additional_kwargs=kwargs)


def test_solo_role_y_content_expuestos():
    msgs = [
        _human("Hola", agent_id="x", timestamp="2026-01-01", user_id="secreto"),
        _ai("Respuesta", agent_role="CEO", agent_id="ceo-1", user_email="a@b.com"),
    ]
    out = _sanitize_shared_messages(msgs)

    assert out[0] == {"role": "user", "content": "Hola"}
    assert out[1]["role"] == "assistant"
    assert out[1]["content"] == "Respuesta"
    assert out[1]["agent_role"] == "CEO"
    # Campos sensibles NUNCA presentes.
    for item in out:
        assert "user_id" not in item
        assert "user_email" not in item
        assert "agent_id" not in item
        assert "timestamp" not in item
        assert "additional_kwargs" not in item


def test_board_vote_se_conserva():
    vote = {"decision": "GO", "confidence": 80}
    out = _sanitize_shared_messages([_ai("Voto", board_vote=vote)])
    assert out[0]["board_vote"] == vote


def test_mensajes_tool_descartados():
    out = _sanitize_shared_messages([_tool("payload sensible", tool_name="github")])
    assert out == []


def test_mensajes_vacios_descartados():
    out = _sanitize_shared_messages([_ai(""), _ai("   "), _human("ok")])
    assert len(out) == 1
    assert out[0]["content"] == "ok"


def test_etiquetas_artifact_eliminadas():
    content = 'Intro\n<sphere_artifact type="markdown" title="Acta de la Junta"># Acta\nDetalle</sphere_artifact>\nFin'
    out = _sanitize_shared_messages([_ai(content, agent_role="CEO")])
    assert "<sphere_artifact" not in out[0]["content"]
    assert "</sphere_artifact>" not in out[0]["content"]
    assert "# Acta" in out[0]["content"]
    assert "Detalle" in out[0]["content"]


def test_acepta_mensajes_como_dict():
    msgs = [
        {"type": "human", "content": "Hola", "additional_kwargs": {"user_id": "x"}},
        {"type": "ai", "content": "Hey", "additional_kwargs": {"agent_role": "CTO"}},
    ]
    out = _sanitize_shared_messages(msgs)
    assert out[0] == {"role": "user", "content": "Hola"}
    assert out[1]["agent_role"] == "CTO"
