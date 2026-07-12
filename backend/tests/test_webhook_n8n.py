"""Verificación de firma del webhook n8n→backend (F9).

La firma usa la misma forma canónica que n8n_client._sign / canonical_sign.
"""
import pytest

from app.core.config import settings
from app.infrastructure.tools.n8n_client import canonical_sign
from app.presentation.api.v1.webhooks import verify_n8n_signature

SECRET = "s3cr3t-n8n"
PAYLOAD = {
    "type": "schedule_post_result",
    "user_id": "u1",
    "platform": "linkedin",
    "success": True,
    "detail": "OK",
}


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", SECRET)


def test_firma_valida_pasa():
    sig = canonical_sign(PAYLOAD, SECRET)
    assert verify_n8n_signature(PAYLOAD, sig) is True


def test_firma_invalida_falla():
    assert verify_n8n_signature(PAYLOAD, "deadbeef") is False


def test_firma_ausente_falla():
    assert verify_n8n_signature(PAYLOAD, None) is False
    assert verify_n8n_signature(PAYLOAD, "") is False


def test_payload_manipulado_invalida_la_firma():
    sig = canonical_sign(PAYLOAD, SECRET)
    tampered = {**PAYLOAD, "success": False}
    assert verify_n8n_signature(tampered, sig) is False


def test_canonical_sign_es_independiente_del_orden_de_claves():
    # sort_keys=True → el orden de inserción no cambia la firma.
    a = canonical_sign({"a": 1, "b": 2}, SECRET)
    b = canonical_sign({"b": 2, "a": 1}, SECRET)
    assert a == b


def test_firma_con_secreto_distinto_falla():
    sig = canonical_sign(PAYLOAD, "otro-secreto")
    assert verify_n8n_signature(PAYLOAD, sig) is False
