"""Contrato observable de `POST /api/v1/webhooks/n8n` (NWI-001/003/004) vía ASGI.

La única superficie de SPHERE alcanzable desde internet sin autenticación. Hasta
ahora sólo se ejercitaba la función pura `verify_n8n_signature`; el endpoint tenía
cero tests.
"""
import hashlib
import hmac
import json

import pytest

from app.core.config import settings
from app.presentation.api.v1 import webhooks

RUTA = "/api/v1/webhooks/n8n"
SECRET = "s3cr3t-n8n"
PAYLOAD = {
    "type": "schedule_post_result",
    "user_id": "test_user_a",
    "platform": "linkedin",
    "success": True,
    "detail": "OK",
}


def _firma_cruda(payload: dict, secret: str) -> str:
    """Firma canónica calculada SIN pasar por el producto (vista del atacante).

    El producto se niega a firmar con secreto vacío (NWI-001), así que la firma
    forjada con clave vacía tiene que construirse aquí a mano.
    """
    canonical = json.dumps(
        payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    return hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def _sin_rate_limit_previo():
    """El endpoint limita a 60/min por IP y todos los tests comparten IP bajo
    ASGITransport: sin esto, el fichero se auto-envenenaría al crecer."""
    from app.core.rate_limit import chat_rate_limiter

    chat_rate_limiter._limiters.clear()
    yield
    chat_rate_limiter._limiters.clear()


@pytest.fixture
def espia_notificacion(monkeypatch):
    """Sustituye la notificación por un espía. Devuelve la lista de payloads."""
    llamadas: list[dict] = []

    async def _espia(payload: dict) -> None:
        llamadas.append(payload)

    monkeypatch.setattr(webhooks, "_notify_schedule_post_result", _espia)
    return llamadas


async def _post(client, payload: dict, firma: str | None):
    headers = {"Content-Type": "application/json"}
    if firma is not None:
        headers["X-Webhook-Signature"] = firma
    return await client.post(RUTA, content=json.dumps(payload), headers=headers)


# ── NWI-001: secreto vacío ⇒ ninguna firma vale ───────────────────────


async def test_firma_con_clave_vacia_es_401(async_client, monkeypatch, espia_notificacion):
    """Sin secreto configurado, la firma que un atacante puede calcular (clave
    vacía, esquema canónico público) NO se acepta."""
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", "")
    forjada = _firma_cruda(PAYLOAD, "")

    r = await _post(async_client, PAYLOAD, forjada)

    assert r.status_code == 401
    assert espia_notificacion == []


async def test_firma_valida_con_secreto_es_200(async_client, monkeypatch, espia_notificacion):
    """Triangulación del anterior: el 401 no es indiscriminado."""
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", SECRET)

    r = await _post(async_client, PAYLOAD, _firma_cruda(PAYLOAD, SECRET))

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert len(espia_notificacion) == 1
    assert espia_notificacion[0]["platform"] == "linkedin"


# ── NWI-003: contrato observable del endpoint público ────────────────


@pytest.fixture
def con_secreto(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", SECRET)
    return SECRET


async def test_body_no_parseable_es_400(async_client, con_secreto, espia_notificacion):
    r = await async_client.post(
        RUTA,
        content=b"{esto no es json",
        headers={"X-Webhook-Signature": _firma_cruda(PAYLOAD, SECRET)},
    )
    assert r.status_code == 400
    assert espia_notificacion == []


async def test_body_que_no_es_dict_es_400(async_client, con_secreto, espia_notificacion):
    """JSON válido pero que no parsea a objeto: `[]` no tiene `type` ni `user_id`."""
    r = await async_client.post(
        RUTA,
        content=b"[]",
        headers={"X-Webhook-Signature": _firma_cruda(PAYLOAD, SECRET)},
    )
    assert r.status_code == 400
    assert espia_notificacion == []


async def test_firma_ausente_es_401(async_client, con_secreto, espia_notificacion):
    r = await _post(async_client, PAYLOAD, None)
    assert r.status_code == 401
    assert espia_notificacion == []


async def test_firma_invalida_es_401(async_client, con_secreto, espia_notificacion):
    r = await _post(async_client, PAYLOAD, "deadbeef" * 8)
    assert r.status_code == 401
    assert espia_notificacion == []


async def test_tipo_desconocido_es_200_sin_efecto(async_client, con_secreto, espia_notificacion):
    payload = {**PAYLOAD, "type": "tipo_que_no_existe"}
    r = await _post(async_client, payload, _firma_cruda(payload, SECRET))
    assert r.status_code == 200
    assert espia_notificacion == [], "un tipo desconocido no dispara ninguna notificación"


@pytest.fixture
def espias_de_salida(monkeypatch):
    """Espía las DOS salidas de `_notify_schedule_post_result`: lectura de
    credenciales y llamada saliente a n8n."""
    inyecciones: list[tuple] = []
    llamadas: list[str] = []

    async def _inyectar(base, providers):
        inyecciones.append((base, providers))
        return base, {"whatsapp": {"access_token": "t0k", "notify_to": "+34600000000"}}

    class _ClienteFalso:
        async def call_webhook(self, path, payload, user_credentials=None):
            llamadas.append(path)
            return {"ok": True}

    monkeypatch.setattr(
        "app.infrastructure.tools.credential_injector.inject_credentials_into_payload",
        _inyectar,
    )
    monkeypatch.setattr("app.infrastructure.tools.n8n_client._client", _ClienteFalso())
    return inyecciones, llamadas


async def test_user_id_no_string_no_llega_a_mongo(async_client, con_secreto, espias_de_salida):
    """`{"$ne": null}` acabaría en una query Mongo como operador."""
    inyecciones, llamadas = espias_de_salida
    payload = {**PAYLOAD, "user_id": {"$ne": None}}

    r = await _post(async_client, payload, _firma_cruda(payload, SECRET))

    assert r.status_code == 200
    assert inyecciones == [], "se leyeron credenciales con un user_id no string"
    assert llamadas == [], "se llamó a n8n con un user_id no string"


async def test_user_id_string_si_procesa(async_client, con_secreto, espias_de_salida):
    """Triangulación: con `user_id` legítimo el camino SÍ se recorre entero —
    si no, el test anterior pasaría por vacío."""
    inyecciones, llamadas = espias_de_salida

    r = await _post(async_client, PAYLOAD, _firma_cruda(PAYLOAD, SECRET))

    assert r.status_code == 200
    assert len(inyecciones) == 1
    assert llamadas == ["shared/whatsapp-notify"]
