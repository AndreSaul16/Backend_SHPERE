"""Contrato del injector de credenciales n8n.

Los workflows no son homogéneos: google-calendar/jules/cfo leen `creds.api_key`,
mientras whatsapp/linkedin/instagram leen `creds.access_token`. El injector debe
exponer el secreto bajo AMBAS claves; emitir solo `api_key` dejaba WhatsApp,
LinkedIn e Instagram permanentemente "no configurados".
"""
import pytest

from app.core.credentials import CredentialsService


@pytest.fixture
def service():
    svc = CredentialsService.__new__(CredentialsService)

    async def fake_sc(user_id, service_name):
        return {"key": "secreto-123", "metadata": {"phone_number_id": "999"}}

    async def fake_token(user_id, provider):
        return "tok-google"

    svc.get_service_credential_with_metadata = fake_sc
    svc.get_token = fake_token
    return svc


async def test_secreto_expuesto_como_api_key_y_access_token(service):
    creds = await service.load_credentials_for_n8n("u1", ["whatsapp"])
    w = creds["whatsapp"]
    assert w["api_key"] == "secreto-123"
    assert w["access_token"] == "secreto-123"
    assert w["phone_number_id"] == "999"


async def test_google_calendar_usa_token_oauth_con_ambos_alias(service):
    creds = await service.load_credentials_for_n8n("u1", ["google_calendar"])
    g = creds["google_calendar"]
    assert g["api_key"] == "tok-google"
    assert g["access_token"] == "tok-google"


async def test_metadata_explicito_sobreescribe_alias(service):
    async def sc_with_override(user_id, service_name):
        return {"key": "k", "metadata": {"access_token": "explicito"}}

    service.get_service_credential_with_metadata = sc_with_override
    creds = await service.load_credentials_for_n8n("u1", ["linkedin"])
    assert creds["linkedin"]["access_token"] == "explicito"
    assert creds["linkedin"]["api_key"] == "k"


def test_validacion_whatsapp_acepta_credencial_inyectada():
    from app.infrastructure.tools.shared_tools import _validate_whatsapp_credentials

    creds = {"whatsapp": {"api_key": "s", "access_token": "s", "phone_number_id": "1"}}
    assert _validate_whatsapp_credentials(creds, "whatsapp_send_message") is None


def test_validacion_whatsapp_rechaza_sin_access_token():
    from app.infrastructure.tools.shared_tools import _validate_whatsapp_credentials

    creds = {"whatsapp": {"phone_number_id": "1"}}
    assert _validate_whatsapp_credentials(creds, "whatsapp_send_message") is not None


# --- Pre-check genérico por servicio (llamar a n8n con credenciales vacías
# produce un 401 del proveedor → el usuario veía "n8n no disponible") ---

import json

from app.infrastructure.tools.credential_injector import missing_credential_error


def test_precheck_servicio_no_configurado():
    err = json.loads(missing_credential_error({}, "linkedin", "post_to_linkedin"))
    assert err["error"] == "linkedin_not_configured"
    assert "Settings" in err["hint"]


def test_precheck_linkedin_sin_urn_pide_probar_conexion():
    creds = {"linkedin": {"access_token": "tok"}}
    err = json.loads(missing_credential_error(creds, "linkedin", "post_to_linkedin"))
    assert err["missing"] == ["li_person_urn"]
    assert "Probar conexión" in err["hint"]


def test_precheck_credenciales_completas_devuelve_none():
    creds = {"linkedin": {"access_token": "tok", "li_person_urn": "abc123"}}
    assert missing_credential_error(creds, "linkedin", "post_to_linkedin") is None


def test_precheck_google_calendar_apunta_a_oauth():
    err = json.loads(missing_credential_error({}, "google_calendar", "calendar_list_events"))
    assert "OAuth" in err["hint"]


def test_precheck_financial_api():
    err = json.loads(missing_credential_error({}, "financial_api", "get_stock_data"))
    assert err["error"] == "financial_api_not_configured"


async def test_cfo_sin_credencial_no_llama_a_n8n(monkeypatch):
    """Las tools del CFO deben devolver un error accionable ANTES de tocar n8n."""
    import app.infrastructure.tools.cfo_tools as cfo

    async def fake_inject(payload, services):
        assert services == ["financial_api"]
        return payload, {}

    monkeypatch.setattr(cfo, "inject_credentials_into_payload", fake_inject)
    result = json.loads(await cfo._get_stock_data("AAPL"))
    assert result["error"] == "financial_api_not_configured"
    assert "Settings" in result["hint"]
