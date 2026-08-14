"""
TER-001 — un concepto de error tiene exactamente un código.

`shared_tools.py` era el segundo emisor de la falta de contexto de usuario y no tenía
ningún test que assertara su literal: el renombrado podía quedarse a medias sin que nada
lo dijera. Este fichero cierra ese lado.
"""
import json

import pytest

import app.infrastructure.tools.shared_tools as shared_tools
from app.core.tool_context import _current_user_id


@pytest.fixture
def _sin_usuario():
    """Request sin usuario autenticado: el contexto está vacío."""
    token = _current_user_id.set(None)
    yield
    _current_user_id.reset(token)


@pytest.fixture
def _con_usuario():
    token = _current_user_id.set("u_test")
    yield
    _current_user_id.reset(token)


async def test_ter_001_whatsapp_sin_contexto_de_usuario_emite_user_context_missing(_sin_usuario):
    """GIVEN no hay usuario en contexto / THEN el código es `user_context_missing`."""
    result = json.loads(await shared_tools._whatsapp_send_message("+34600000000", "hola"))

    assert result["error"] == "user_context_missing"
    assert result["tool"] == "whatsapp_send_message"
    assert "usuario autenticado" in result["hint"]


async def test_ter_001_la_segunda_tool_de_whatsapp_emite_el_mismo_codigo(_sin_usuario):
    """Triangulación: el renombrado es del emisor compartido, no de una tool suelta."""
    result = json.loads(
        await shared_tools._whatsapp_send_notification("+34600000000", "aviso")
    )

    assert result["error"] == "user_context_missing"
    assert result["tool"] == "whatsapp_send_notification"


async def test_ter_001_con_usuario_en_contexto_el_fallo_ya_no_es_de_contexto(_con_usuario, monkeypatch):
    """Triangulación por el otro lado: con usuario, la guarda de contexto no salta.

    Sin whitelist el mensaje se rechaza por contacto no autorizado, que es otro código
    y otro remedio. Prueba que el primer test no pasa «porque siempre devuelve eso».
    """
    async def _no_autorizado(*args, **kwargs):
        return False

    monkeypatch.setattr(shared_tools, "is_authorized", _no_autorizado)
    result = json.loads(await shared_tools._whatsapp_send_message("+34600000000", "hola"))

    assert result["error"] != "user_context_missing"
    assert result["error"] == "contact_not_authorized"
