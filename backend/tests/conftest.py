"""
Fixtures compartidas para tests multi-tenant del backend SPHERE.

DISEÑO CLAVE:
- Motor client SIEMPRE se crea desde dentro de una función async (en el loop
  del test), nunca desde un contexto sync.
- Todos los authed_client_* comparten el mismo pool de DB.
"""
import pytest
import asyncio
from typing import AsyncGenerator
from unittest.mock import patch
import sys
from pathlib import Path
from datetime import datetime, timezone

# Añadir backend al path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Cargar .env
from dotenv import load_dotenv
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)




@pytest.fixture(scope="session")
def mongo_uri():
    """Obtiene la URI de MongoDB desde el entorno."""
    import os
    uri = os.getenv("MONGODB_URL")
    if not uri:
        pytest.skip("MONGODB_URL no configurada")
    return uri


@pytest.fixture(scope="function")
def db_instance():
    """Instancia de Database conectada para tests que solo necesitan sync."""
    from app.infrastructure.database import db
    db.connect()
    yield db
    db.close()


@pytest.fixture
def sync_db(db_instance):
    """Devuelve un CALLABLE que resuelve la base síncrona en el momento de uso.

    Nunca un handle plano: `_setup_db()` cierra y recrea `db.sync_client` en cada
    test async (pytest-asyncio da un loop nuevo por test), y PyMongo 4 prohíbe
    reutilizar un cliente cerrado. Resolver en el cuerpo del test elimina esa
    clase entera de fallos dependientes del orden de los parámetros.

    La base es la MISMA que escribe la app (`settings.DB_NAME`, webhooks.py):
    sin esto, los tests observarían una base que el producto nunca toca.
    """
    from app.core.config import settings

    return lambda: db_instance.get_sync_client()[settings.DB_NAME]


# --- PERFILES MULTI-TENANT ---

_NOW = datetime.now(timezone.utc)

MOCK_USER_A = {
    "uid": "test_user_a",
    "email": "usera@test.com",
    "name": "User A",
}

MOCK_USER_B = {
    "uid": "test_user_b",
    "email": "userb@test.com",
    "name": "User B",
}


# Plan wallet config — modelo single-plan: solo "free".
# Test balance es intencionalmente bajo (5) para velocidad y determinismo.
# El valor de producción es 30 (ver config.py plan_messages_map).
# Balances bajos hacen los tests de agotamiento de créditos rápidos y predecibles.
_PLAN_WALLETS = {
    "free": {"pro_messages_balance": 5, "pro_messages_granted_this_period": 5},
}


def _make_user_profile(
    firebase_claims: dict, plan_id: str = "free", email_verified: bool = True
) -> dict:
    """Genera un perfil de usuario completo compatible con UserResponse.

    Args:
        firebase_claims: Claims de Firebase (uid, email, name).
        plan_id: Tier del plan ("free", "starter", "premium"). Default "premium".
        email_verified: True para usuarios verificados (default), False para email_unverified.
    """
    wallet_cfg = _PLAN_WALLETS.get(plan_id, _PLAN_WALLETS["free"])
    status = "active" if email_verified else "email_unverified"
    pro_balance = wallet_cfg["pro_messages_balance"] if email_verified else 0
    return {
        "firebase_uid": firebase_claims["uid"],
        "email": firebase_claims["email"],
        "display_name": firebase_claims.get("name", firebase_claims["email"]),
        "created_at": _NOW,
        "last_login_at": _NOW,
        "ui_preferences": {},
        "professional_profile": {},
        "communication_style": {},
        "financial_preferences": {},
        "connected_providers": [],
        "feature_flags": [],
        "onboarding_completed": False,
        "personal_kb_enabled": True,
        "usage": {
            "token_budget_daily": 100_000,
            "tokens_used_today": 0,
            "tokens_reset_at": _NOW,
            "requests_in_current_window": 0,
        },
        "subscription": {
            "plan_id": plan_id,
            "status": status,
        },
        "wallet": {
            "pro_messages_balance": pro_balance,
            "pro_messages_granted_this_period": pro_balance,
            "last_period_reset": _NOW,
            "topup_messages_balance": 0,
        },
        "limits": {},
    }


# Fixtures para cada plan — modelo single-plan: solo free
@pytest.fixture
def free_user_profile() -> dict:
    """Perfil de usuario free plan (5 mensajes, sin top-ups)."""
    return _make_user_profile(MOCK_USER_A, plan_id="free")


@pytest.fixture
def unverified_user_profile() -> dict:
    """Perfil de usuario con email NO verificado (sin créditos, status email_unverified)."""
    return _make_user_profile(MOCK_USER_A, plan_id="free", email_verified=False)


PROFILE_A = _make_user_profile(MOCK_USER_A)
PROFILE_B = _make_user_profile(MOCK_USER_B)


async def _verify_token_dispatch(token: str) -> dict:
    """Mock de _verify_token que despacha según el token."""
    if token == "fake_token_a":
        return MOCK_USER_A
    elif token == "fake_token_b":
        return MOCK_USER_B
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Token inválido")


async def _auto_provision_dispatch(firebase_claims: dict) -> dict:
    """Mock de _auto_provision_user que despacha según uid."""
    if firebase_claims["uid"] == "test_user_a":
        return PROFILE_A
    elif firebase_claims["uid"] == "test_user_b":
        return PROFILE_B
    return PROFILE_A


async def _setup_db():
    """
    Configura la conexión a DB desde DENTRO del event loop del test.
    Motor AsyncIOMotorClient captura el loop actual al instanciarse,
    por lo que DEBE crearse desde una corutina.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from pymongo import MongoClient
    from app.infrastructure.database import db, MONGO_URI
    import certifi

    current_loop = asyncio.get_running_loop()

    # Si ya está conectado y Motor está en el loop correcto, no hacer nada
    if db._connected and db.client:
        try:
            motor_loop = db.client.get_io_loop()
            if motor_loop is current_loop:
                return
        except Exception:
            pass

    # Cerrar clientes existentes
    if db.client:
        db.client.close()
    if db.sync_client:
        db.sync_client.close()

    # Crear clientes nuevos — Motor captura el loop actual automáticamente
    kwargs = dict(db._client_kwargs)
    db.client = AsyncIOMotorClient(MONGO_URI, **kwargs)
    db.sync_client = MongoClient(MONGO_URI, **kwargs)
    db.sync_client.admin.command("ping")
    db._connected = True

    # Upsert test users
    users_col = db.get_async_db()["users"]
    await users_col.update_one(
        {"firebase_uid": "test_user_a"},
        {"$set": PROFILE_A},
        upsert=True,
    )
    await users_col.update_one(
        {"firebase_uid": "test_user_b"},
        {"$set": PROFILE_B},
        upsert=True,
    )


# ---------- CLIENTES HTTP ----------


@pytest.fixture(scope="function")
async def async_client() -> AsyncGenerator:
    """Cliente HTTP async sin auth."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await _setup_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_firebase_user_a():
    return MOCK_USER_A


@pytest.fixture
def mock_firebase_user_b():
    return MOCK_USER_B


@pytest.fixture
async def authed_client_a() -> AsyncGenerator:
    """Cliente HTTP autenticado como User A."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await _setup_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.core.auth._verify_token", side_effect=_verify_token_dispatch):
            with patch("app.core.auth._auto_provision_user", side_effect=_auto_provision_dispatch):
                client.headers["Authorization"] = "Bearer fake_token_a"
                yield client


@pytest.fixture
async def authed_client_b() -> AsyncGenerator:
    """Cliente HTTP autenticado como User B."""
    from httpx import AsyncClient, ASGITransport
    from main import app

    await _setup_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("app.core.auth._verify_token", side_effect=_verify_token_dispatch):
            with patch("app.core.auth._auto_provision_user", side_effect=_auto_provision_dispatch):
                client.headers["Authorization"] = "Bearer fake_token_b"
                yield client


@pytest.fixture
async def clean_test_data():
    """Limpia datos de test después de cada test."""
    from app.infrastructure.database import db as sphere_db

    yield

    # Cleanup
    try:
        async_db = sphere_db.get_async_db()
        for collection_name in [
            "sessions_metadata", "custom_agents", "knowledge_base",
            "message_ratings", "agent_tasks", "contacts",
            "user_agent_overrides", "oauth_credentials",
            "credit_transactions", "stripe_events_processed"
        ]:
            await async_db[collection_name].delete_many({
                "user_id": {"$in": ["test_user_a", "test_user_b"]}
            })
            await async_db[collection_name].delete_many({
                "owner_user_id": {"$in": ["test_user_a", "test_user_b"]}
            })
    except Exception as e:
        import warnings
        warnings.warn(f"Clean test data error (non-critical): {e}")
