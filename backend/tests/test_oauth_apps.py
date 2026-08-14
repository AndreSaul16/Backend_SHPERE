"""
Tests de OAuth BYO (cada usuario su propia OAuth app).

Cubre: registro/listado/borrado de la app, que el secret nunca se expone ni se
guarda en claro, que `connect` exige app registrada (400) y emite la authorize_url
con el client_id del usuario, y aislamiento multi-tenant.
"""
import pytest

PROVIDER = "github"
BASE = "/api/v1/integrations"


@pytest.fixture
async def _cleanup_oauth_apps():
    """Limpia user_oauth_apps + oauth_credentials de los usuarios de test."""
    yield
    from app.infrastructure.database import db
    test_ids = {"$in": ["test_user_a", "test_user_b"]}
    for coll in ("user_oauth_apps", "oauth_credentials"):
        await db.get_async_db()[coll].delete_many({"user_id": test_ids})


async def test_register_list_delete_app(authed_client_a, _cleanup_oauth_apps):
    # Registrar
    r = await authed_client_a.put(
        f"{BASE}/{PROVIDER}/app",
        json={"client_id": "cid_123", "client_secret": "sek_abc"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == PROVIDER
    assert body["callback_url"].endswith(f"/{PROVIDER}/callback")

    # Listar — sin exponer el secret
    r = await authed_client_a.get(f"{BASE}/apps")
    assert r.status_code == 200
    data = r.json()
    assert any(
        a["provider"] == PROVIDER and a["client_id"] == "cid_123" for a in data["apps"]
    )
    assert "sek_abc" not in r.text  # el secret NUNCA aparece en la respuesta
    assert PROVIDER in data["callback_urls"]

    # Borrar
    r = await authed_client_a.delete(f"{BASE}/{PROVIDER}/app")
    assert r.status_code == 200

    # Ya no aparece
    r = await authed_client_a.get(f"{BASE}/apps")
    assert not any(a["provider"] == PROVIDER for a in r.json()["apps"])


async def test_delete_unregistered_returns_404(authed_client_a, _cleanup_oauth_apps):
    r = await authed_client_a.delete(f"{BASE}/{PROVIDER}/app")
    assert r.status_code == 404


async def test_connect_requires_registered_app(
    authed_client_a, _cleanup_oauth_apps, monkeypatch
):
    # El state se firma con el secreto compartido: sin él, `/connect` responde
    # 503 y no persiste nada (NWI-001). Aquí interesa la otra condición —tener
    # app registrada—, así que el secreto se configura explícitamente.
    from app.core.config import settings

    monkeypatch.setattr(settings, "N8N_WEBHOOK_SECRET", "s3cr3t-para-el-state")

    # Sin app -> 400
    r = await authed_client_a.get(f"{BASE}/{PROVIDER}/connect")
    assert r.status_code == 400

    # Con app -> authorize_url con el client_id del usuario
    await authed_client_a.put(
        f"{BASE}/{PROVIDER}/app",
        json={"client_id": "cid_999", "client_secret": "s"},
    )
    r = await authed_client_a.get(f"{BASE}/{PROVIDER}/connect")
    assert r.status_code == 200, r.text
    url = r.json()["authorize_url"]
    assert "client_id=cid_999" in url
    assert "state=" in url
    assert f"/{PROVIDER}/callback" in url  # redirect_uri global


async def test_secret_roundtrip_via_service(authed_client_a, _cleanup_oauth_apps):
    """store (HTTP) -> get (service) devuelve el secret original. Siempre."""
    await authed_client_a.put(
        f"{BASE}/{PROVIDER}/app",
        json={"client_id": "cid_x", "client_secret": "PLAINTEXT_SECRET"},
    )
    from app.core.credentials import credentials_service

    app = await credentials_service.get_oauth_app("test_user_a", PROVIDER)
    assert app["client_id"] == "cid_x"
    assert app["client_secret"] == "PLAINTEXT_SECRET"

    # Si FERNET_KEY está configurada, el secret NO debe estar en claro en la DB.
    # (En el .env local de dev puede no estarlo -> modo sin cifrado, documentado.)
    if credentials_service._fernet is not None:
        from app.infrastructure.database import db

        doc = await db.get_async_db()["user_oauth_apps"].find_one(
            {"user_id": "test_user_a", "provider": PROVIDER}
        )
        enc = doc["client_secret_enc"]
        raw = bytes(enc) if isinstance(enc, (bytes, bytearray)) else str(enc).encode()
        assert b"PLAINTEXT_SECRET" not in raw


def test_fernet_encryption_path():
    """El client_secret se cifra y descifra correctamente cuando hay FERNET_KEY.
    Independiente del entorno: genera su propia clave."""
    from cryptography.fernet import Fernet
    from app.core.credentials import CredentialsService

    svc = CredentialsService.__new__(CredentialsService)
    svc._fernet = Fernet(Fernet.generate_key())

    enc = svc._encrypt("PLAINTEXT_SECRET")
    assert b"PLAINTEXT_SECRET" not in enc  # cifrado
    assert svc._decrypt(enc) == "PLAINTEXT_SECRET"  # round-trip


async def test_tenant_isolation(authed_client_a, _cleanup_oauth_apps):
    from app.core.credentials import credentials_service

    await credentials_service.store_oauth_app(
        "test_user_a", PROVIDER, "cid_a", "secret_a"
    )
    # User B no ve la app de A
    assert await credentials_service.get_oauth_app("test_user_b", PROVIDER) is None
    a = await credentials_service.get_oauth_app("test_user_a", PROVIDER)
    assert a["client_id"] == "cid_a"
