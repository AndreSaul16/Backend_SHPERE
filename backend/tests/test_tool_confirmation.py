"""El gate de confirmación, aplicado al registrar y no dentro de cada tool.

Por qué al registrar: el bug que se cierra es «alguien escribió una tool
destructiva y se olvidó de consultar la preferencia». Un decorador por función
exige acordarse en cada una —la misma forma del bug—, así que la comprobación
vive en `register_*` y ninguna destructiva puede entrar al catálogo sin ella.

El hueco que la estructura NO cierra —una tool que declare `confirmed` y no lo
consulte— lo cierra TC-002, que recorre `DESTRUCTIVE_TOOLS` e invoca cada una.
"""
import json
from typing import Literal, get_args, get_origin

import pytest

import app.infrastructure.tools.oauth_tools as oauth_tools
import app.infrastructure.tools.shared_tools as shared_tools
from app.core.tool_context import (
    DESTRUCTIVE_TOOLS,
    _current_confirmation_level,
    _current_user_id,
)
from app.infrastructure.tools.confirmation import apply_confirmation_gate
from app.infrastructure.tools.registry import ROLE_TOOLS, SHARED_TOOLS, load_all_tools


# ---------------------------------------------------------------- utilidades


def _catalogo() -> dict:
    """Todas las tools registradas, por nombre. El registry real."""
    load_all_tools()
    todas = {t.name: t for t in SHARED_TOOLS}
    for tools_del_rol in ROLE_TOOLS.values():
        for t in tools_del_rol:
            todas[t.name] = t
    return todas


def _valor_para(anotacion):
    if get_origin(anotacion) is Literal:
        return get_args(anotacion)[0]
    if anotacion is bool:
        return False
    if anotacion is int:
        return 1
    if get_origin(anotacion) is list:
        return ["prueba"]
    return "prueba"


def _argumentos_validos(schema) -> dict:
    """Rellena los campos obligatorios del esquema, sin tocar `confirmed`.

    Se derivan del propio `args_schema` en vez de escribirlos a mano: así una
    tool destructiva nueva entra en el recorrido sin editar este fichero.
    """
    return {
        nombre: _valor_para(campo.annotation)
        for nombre, campo in schema.model_fields.items()
        if campo.is_required()
    }


# ----------------------------------------------------------------- fixtures


@pytest.fixture(autouse=True)
def _contexto():
    t1 = _current_user_id.set("u_test")
    t2 = _current_confirmation_level.set("destructive_only")
    yield
    _current_user_id.reset(t1)
    _current_confirmation_level.reset(t2)


@pytest.fixture
def n8n_espia():
    """Registra toda llamada a n8n. Vacío = ningún efecto externo.

    `n8n_client` es un proxy que resuelve la instancia real en tiempo de
    llamada, así que el sitio por donde se sustituye es `set_client`, no un
    atributo del proxy.
    """
    from app.infrastructure.tools import n8n_client as modulo

    llamadas: list[tuple] = []

    class _N8NDeMentira:
        async def call_webhook(self, webhook, payload=None, **kwargs):
            llamadas.append((webhook, payload))
            return {"success": True}

    modulo.set_client(_N8NDeMentira())
    yield llamadas
    modulo.set_client(None)


@pytest.fixture(autouse=True)
def _sin_dependencias_externas(monkeypatch):
    """Credenciales y whitelist resueltas en memoria.

    Sin esto las tools se pararían antes del gate por falta de credencial y el
    recorrido de TC-002 no probaría nada.
    """
    async def _creds(payload, servicios):
        # Los campos son los que exige `REQUIRED_CREDENTIAL_FIELDS`: con menos,
        # las tools se pararían en el guardián de credenciales y el recorrido
        # de TC-002 no llegaría a probar el gate.
        return payload, {
            "google_calendar": {"api_key": "tok"},
            "whatsapp": {"phone_number_id": "pn", "access_token": "tok"},
        }

    async def _autorizado(*args, **kwargs):
        return True

    async def _token(user_id, provider):
        return "tok"

    monkeypatch.setattr(shared_tools, "inject_credentials_into_payload", _creds)
    monkeypatch.setattr(shared_tools, "is_authorized", _autorizado)
    monkeypatch.setattr(oauth_tools.credentials_service, "get_token", _token)


# ------------------------------------------------- TC-002: el recorrido completo


async def test_tc_002_toda_destructiva_consulta_la_preferencia(n8n_espia):
    catalogo = _catalogo()
    sin_gate = []

    for nombre in sorted(DESTRUCTIVE_TOOLS):
        tool = catalogo[nombre]
        salida = json.loads(await tool.ainvoke(_argumentos_validos(tool.args_schema)))
        if salida.get("error") != "confirmation_required":
            sin_gate.append(nombre)

    assert sin_gate == [], f"sin gate: {sin_gate}"
    assert n8n_espia == []


async def test_tc_002b_toda_destructiva_acepta_confirmed_en_su_esquema():
    catalogo = _catalogo()

    sin_campo = sorted(
        nombre for nombre in DESTRUCTIVE_TOOLS
        if "confirmed" not in catalogo[nombre].args_schema.model_fields
    )

    assert sin_campo == [], f"sin `confirmed` en el esquema: {sin_campo}"


# ------------------------------------------ TC-001: no ejecutar en la primera llamada


async def test_tc_001_borrar_evento_no_toca_n8n_sin_confirmar(n8n_espia):
    _current_confirmation_level.set("always")
    tool = _catalogo()["calendar_delete_event"]

    salida = json.loads(await tool.ainvoke({"event_id": "evt_42"}))

    assert len(n8n_espia) == 0
    assert salida["error"] == "confirmation_required"
    assert "evt_42" in json.dumps(salida, ensure_ascii=False)


async def test_tc_001b_confirmado_ejecuta_exactamente_una_vez(n8n_espia):
    _current_confirmation_level.set("always")
    tool = _catalogo()["calendar_delete_event"]

    await tool.ainvoke({"event_id": "evt_42", "confirmed": True})

    assert len(n8n_espia) == 1
    assert n8n_espia[0][1]["event_id"] == "evt_42"


async def test_tc_003_nivel_never_ejecuta_sin_preguntar(n8n_espia):
    _current_confirmation_level.set("never")
    tool = _catalogo()["calendar_delete_event"]

    salida = json.loads(await tool.ainvoke({"event_id": "evt_42"}))

    assert salida.get("error") != "confirmation_required"
    assert len(n8n_espia) == 1


# --------------------------------- TC-003: confirmar no desactiva la whitelist


async def test_tc_003b_confirmar_no_abre_la_whitelist(n8n_espia, monkeypatch):
    # Defensa independiente: la whitelist NO es una confirmación más, así que
    # `confirmed=True` no puede colarse por delante de ella.
    async def _no_autorizado(*args, **kwargs):
        return False

    monkeypatch.setattr(shared_tools, "is_authorized", _no_autorizado)
    _current_confirmation_level.set("never")
    tool = _catalogo()["whatsapp_send_message"]

    # Se asserta sobre la salida CRUDA: si la whitelist se saltara, el payload
    # no tendría clave `error` y un acceso por clave moriría con KeyError en vez
    # de decir qué se envió.
    salida = await tool.ainvoke({"to": "+34600999888", "message": "hola", "confirmed": True})

    assert "contact_not_authorized" in salida
    assert n8n_espia == []


# ------------------------------------------------ el gate en sí, sin registry


def test_una_tool_no_destructiva_pasa_intacta():
    catalogo = _catalogo()
    lectura = catalogo["calendar_list_events"]

    assert apply_confirmation_gate(lectura) is lectura


def test_las_que_ya_declaran_confirmed_no_se_envuelven():
    # Las 5 que ya tenían gate conservan su resumen en castellano: si se
    # envolvieran, lo perderían por uno genérico.
    catalogo = _catalogo()
    ya_gateada = catalogo["slack_post_message"]

    assert apply_confirmation_gate(ya_gateada) is ya_gateada


async def test_el_resumen_no_nombra_el_identificador_tecnico(n8n_espia):
    # TRI-004: lo que se le enseña al usuario se compone con los argumentos.
    _current_confirmation_level.set("always")
    tool = _catalogo()["whatsapp_send_notification"]

    salida = json.loads(
        await tool.ainvoke({"group": "Dirección", "message": "reunión a las 9"})
    )

    assert "Dirección" in salida["action_summary"]
    assert "whatsapp_send_notification" not in salida["action_summary"]
