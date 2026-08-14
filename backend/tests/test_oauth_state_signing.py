"""NWI-001 / NWI-002 — el secreto n8n se lee en un solo sitio y el state OAuth no se trunca.

Cubre `app/core/signing.py` (accesor del secreto + comparación en tiempo constante)
y sus cuatro superficies: `_generate_state`, `_verify_state`, el endpoint `/connect`
y `N8NClient.call_webhook`.
"""
import hashlib
import hmac
import json
import re

import httpx
import pytest

from app.core.config import settings
from app.core.signing import N8NSecretMissing, constant_time_equals, n8n_secret
from app.presentation.api.v1 import integrations

SECRET = "s3cr3t-n8n"


def _firma_cruda(payload: dict, secret: str) -> str:
    """Firma canónica calculada SIN pasar por el producto.

    El producto se niega a firmar con secreto vacío (NWI-001); un atacante no.
    Este helper es la vista del atacante: reproduce la forma canónica a mano para
    poder forjar la firma que el producto debe rechazar.
    """
    canonical = json.dumps(
        payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    return hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()


@pytest.fixture
def con_secreto(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", SECRET)
    return SECRET


@pytest.fixture
def sin_secreto(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", "")


# ── NWI-001: el accesor ────────────────────────────────────────────────


@pytest.mark.parametrize("valor", ["", "   ", None])
def test_n8n_secret_lanza_sin_secreto(monkeypatch, valor):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", valor)
    with pytest.raises(N8NSecretMissing):
        n8n_secret()


def test_n8n_secret_devuelve_el_valor_configurado(con_secreto):
    assert n8n_secret() == SECRET


def test_n8n_secret_recorta_espacios(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", f"  {SECRET}  ")
    assert n8n_secret() == SECRET


# ── NWI-002: comparación en tiempo constante que no revienta ───────────


def test_constant_time_equals_no_ascii_es_false():
    assert constant_time_equals("abc", "ñ") is False


def test_constant_time_equals_iguales_es_true():
    assert constant_time_equals("a" * 64, "a" * 64) is True


def test_constant_time_equals_distintos_es_false():
    assert constant_time_equals("a" * 64, "b" * 64) is False


# ── NWI-002: el state se firma completo ───────────────────────────────


def test_state_firma_de_64_hex(con_secreto):
    _, _, sig = integrations._generate_state("u1").split(":")
    assert len(sig) == 64
    assert re.fullmatch(r"[0-9a-f]{64}", sig), f"firma no hexadecimal: {sig!r}"


def test_state_completo_se_acepta(con_secreto):
    state = integrations._generate_state("u1")
    assert integrations._verify_state(state, "u1") is True


def test_state_truncado_se_rechaza(con_secreto):
    nonce, timestamp, sig = integrations._generate_state("u1").split(":")
    truncado = f"{nonce}:{timestamp}:{sig[:16]}"
    assert integrations._verify_state(truncado, "u1") is False


def test_state_de_otro_usuario_se_rechaza(con_secreto):
    state = integrations._generate_state("u1")
    assert integrations._verify_state(state, "u2") is False


def test_state_no_ascii_no_revienta(con_secreto):
    assert integrations._verify_state("abc:1700000000:ñ", "u1") is False


# ── NWI-001: sin secreto no se emite ni se acepta state ───────────────


def test_sin_secreto_no_se_emite_state(sin_secreto):
    with pytest.raises(N8NSecretMissing):
        integrations._generate_state("u1")


def test_sin_secreto_verify_state_es_false(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", SECRET)
    state = integrations._generate_state("u1")
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", "")
    assert integrations._verify_state(state, "u1") is False


async def test_connect_sin_secreto_es_503(authed_client_a, monkeypatch, sin_secreto):
    """`/connect` no persiste state ni redirige cuando falta el secreto."""

    async def _app_falsa(user_id: str, provider: str):
        return {"client_id": "cid_test", "client_secret": "sek_test"}

    monkeypatch.setattr(integrations, "_resolve_oauth_app", _app_falsa)

    from app.infrastructure.database import db

    estados = db.get_async_db()["oauth_states"]
    antes = await estados.count_documents({"user_id": "test_user_a"})
    r = await authed_client_a.get("/api/v1/integrations/github/connect")
    despues = await estados.count_documents({"user_id": "test_user_a"})

    assert r.status_code == 503, r.text
    assert despues == antes, "se persistió un state sin secreto configurado"


# ── NWI-001: no se emite material firmado con clave vacía ─────────────


def test_canonical_sign_rechaza_secreto_vacio():
    from app.infrastructure.tools.n8n_client import canonical_sign

    for vacio in ("", "   "):
        with pytest.raises(N8NSecretMissing):
            canonical_sign({"a": 1}, vacio)


def test_canonical_sign_firma_con_secreto():
    from app.infrastructure.tools.n8n_client import canonical_sign

    assert canonical_sign({"a": 1}, SECRET) == _firma_cruda({"a": 1}, SECRET)


# ── NWI-001: el cliente no envía sin secreto ──────────────────────────


async def _llamar_webhook(secret: str) -> tuple[list[str], list[str], dict]:
    """Ejecuta call_webhook con transporte simulado. Devuelve (rutas, firmas, resultado)."""
    from app.infrastructure.tools.n8n_client import N8NClient

    rutas: list[str] = []
    firmas: list[str] = []

    def _handler(request: httpx.Request) -> httpx.Response:
        rutas.append(request.url.path)
        firmas.append(request.headers.get("X-Webhook-Signature", ""))
        return httpx.Response(200, json={"ok": True})

    cliente = N8NClient(base_url="http://n8n.test", webhook_secret=secret)
    cliente._client = httpx.AsyncClient(
        transport=httpx.MockTransport(_handler), base_url="http://n8n.test"
    )
    try:
        resultado = await cliente.call_webhook("shared/whatsapp-notify", {"message": "hola"})
    finally:
        await cliente._client.aclose()
    return rutas, firmas, resultado


async def test_cliente_no_envia_sin_secreto():
    rutas, _, resultado = await _llamar_webhook("")
    assert len(rutas) == 0, f"peticiones emitidas sin secreto: {rutas}"
    assert resultado["error"] is True
    assert resultado["service"] == "n8n"


async def test_cliente_envia_y_firma_con_secreto():
    rutas, firmas, resultado = await _llamar_webhook(SECRET)
    assert rutas == ["/webhook/shared/whatsapp-notify"]
    assert firmas[0] == _firma_cruda({"message": "hola"}, SECRET)
    assert resultado == {"ok": True}
