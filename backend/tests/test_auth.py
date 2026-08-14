"""
Tests de autenticación: verificación de token, auto-provisioning, 401,
hardening de wallet (CS-001, CS-002).
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_no_auth_returns_401(async_client):
    """Un request sin Authorization header devuelve 401."""
    # El endpoint legacy /chat se eliminó; el endpoint de chat actual es /stream.
    resp = await async_client.post("/api/v1/stream/", json={"query": "hola", "session_id": "s1"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_returns_401(async_client):
    """Un token inválido devuelve 401."""
    from fastapi import HTTPException
    with patch("app.core.auth._verify_token", side_effect=HTTPException(status_code=401, detail="Token inválido")):
        async_client.headers["Authorization"] = "Bearer invalid_token"
        resp = await async_client.post("/api/v1/stream/", json={"query": "hola", "session_id": "s1"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_with_valid_token(authed_client_a):
    """GET /me devuelve el perfil del usuario autenticado."""
    resp = await authed_client_a.get("/api/v1/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["firebase_uid"] == "test_user_a"
    assert data["email"] == "usera@test.com"


# --- QA-4: is_admin en el perfil ---
#
# El frontend preguntaba «¿soy admin?» sondeando GET /admin/users y contando el
# 403 como un «no». Como la sonda no se cacheaba y el shell se remonta al
# navegar, eso eran ~11 peticiones fallidas por sesión pintando la consola de
# rojo a todo usuario normal. El dato ya lo sabe el backend: se dice en /me y se
# acabó la sonda. El predicado es el MISMO que usa require_admin (`es_admin`),
# no una copia — ver tests/test_admin.py.


@pytest.mark.asyncio
async def test_get_me_dice_is_admin_falso_a_un_usuario_normal(authed_client_a, monkeypatch):
    """El campo viaja SIEMPRE: sin él el frontend no puede dejar de sondear."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "otro@sphere.es")
    resp = await authed_client_a.get("/api/v1/me")
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is False


@pytest.mark.asyncio
async def test_get_me_dice_is_admin_cierto_a_un_admin_verificado(authed_client_a, monkeypatch):
    from app.core.config import settings
    from tests.conftest import PROFILE_A

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "usera@test.com")
    monkeypatch.setitem(PROFILE_A, "email_verified", True)
    resp = await authed_client_a.get("/api/v1/me")
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True


@pytest.mark.asyncio
async def test_get_me_no_da_is_admin_sin_email_verificado(authed_client_a, monkeypatch):
    """Estar en ADMIN_EMAILS no basta, igual que en require_admin.

    Sin este check el frontend pintaría el enlace del panel a quien la guarda
    del backend va a rechazar con un 403.
    """
    from app.core.config import settings
    from tests.conftest import PROFILE_A

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "usera@test.com")
    monkeypatch.setitem(PROFILE_A, "email_verified", False)
    resp = await authed_client_a.get("/api/v1/me")
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is False


@pytest.mark.asyncio
async def test_patch_me_updates_profile(authed_client_a):
    """PATCH /me actualiza el perfil del usuario."""
    resp = await authed_client_a.patch("/api/v1/me", json={
        "display_name": "Nuevo Nombre",
        "professional_profile": {
            "role": "CTO",
            "industry": "SaaS",
        }
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_onboarding_complete(authed_client_a):
    """POST /me/onboarding/complete marca onboarding como completado."""
    resp = await authed_client_a.post("/api/v1/me/onboarding/complete")
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_completed"] is True


@pytest.mark.asyncio
async def test_sessions_require_auth(async_client):
    """GET /sessions/ sin auth devuelve 401."""
    resp = await async_client.get("/api/v1/sessions/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_agents_require_auth(async_client):
    """GET /agents/ sin auth devuelve 401."""
    resp = await async_client.get("/api/v1/agents/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_session_injects_user_id(authed_client_a):
    """POST /sessions/ inyecta el user_id del JWT, no del body."""
    resp = await authed_client_a.post("/api/v1/sessions/", json={
        "title": "Test Session",
        "base_agent_id": "CEO",
    })
    assert resp.status_code == 200
    data = resp.json()
    # El user_id debe venir del JWT, no del body
    assert data["user_id"] == "test_user_a"


# ---------------------------------------------------------------------------
# CS-001 / CS-002: Wallet hardening — _ensure_wallet unit tests
# ---------------------------------------------------------------------------


class TestEnsureWallet:
    """Tests para _ensure_wallet: detección y reparación de wallets inválidos."""

    @pytest.mark.asyncio
    async def test_ensure_wallet_with_empty_dict_reinitializes(self):
        """CS-001: wallet={} → debe re-inicializarse con 30 créditos."""
        from app.core.auth import _ensure_wallet
        from datetime import datetime, timezone

        user_doc = {
            "firebase_uid": "user_empty_wallet",
            "email": "test@sphere.local",
            "email_verified": True,
            "wallet": {},
        }

        mock_collection = AsyncMock()
        mock_collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _ensure_wallet("user_empty_wallet", user_doc)

        # Debe haber llamado a update_one para persistir el wallet reparado
        mock_collection.update_one.assert_called_once()
        call_args = mock_collection.update_one.call_args
        update_filter = call_args[0][0]
        update_operation = call_args[0][1]

        assert update_filter == {"firebase_uid": "user_empty_wallet"}
        assert "$set" in update_operation
        # El wallet reparado debe tener pro_messages_balance = 30 (plan free)
        assert update_operation["$set"]["wallet.pro_messages_balance"] == 30
        # El resultado debe incluir el wallet reparado
        assert "wallet" in result
        assert result["wallet"]["pro_messages_balance"] == 30

    @pytest.mark.asyncio
    async def test_ensure_wallet_with_none_wallet_reinitializes(self):
        """CS-001: wallet=None → debe re-inicializarse con 30 créditos.

        Sobre un null se escribe el subdocumento `wallet` entero, no rutas con
        punto: Mongo rechaza crear subcampos dentro de un null (WriteError code
        28). El contrato observable no cambia — cambia la forma de la escritura.
        """
        from app.core.auth import _ensure_wallet

        user_doc = {
            "firebase_uid": "user_none_wallet",
            "email": "test@sphere.local",
            "email_verified": True,
            "wallet": None,
        }

        mock_collection = AsyncMock()
        mock_collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _ensure_wallet("user_none_wallet", user_doc)

        mock_collection.update_one.assert_called_once()
        call_args = mock_collection.update_one.call_args
        update_operation = call_args[0][1]
        assert update_operation["$set"]["wallet"]["pro_messages_balance"] == 30
        # Ninguna ruta con punto: eso es justo lo que Mongo rechazaría.
        assert not any(k.startswith("wallet.") for k in update_operation["$set"])
        assert result["wallet"]["pro_messages_balance"] == 30

    @pytest.mark.asyncio
    async def test_ensure_wallet_with_valid_wallet_passes_through(self):
        """CS-002: wallet válido con pro_messages_balance → no modificar."""
        from app.core.auth import _ensure_wallet

        valid_wallet = {
            "pro_messages_balance": 3,
            "topup_messages_balance": 0,
            "pro_messages_granted_this_period": 5,
            "last_period_reset": "2024-01-01T00:00:00Z",
        }
        user_doc = {
            "firebase_uid": "user_valid_wallet",
            "email": "test@sphere.local",
            "email_verified": True,
            "wallet": valid_wallet,
        }

        mock_collection = AsyncMock()
        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _ensure_wallet("user_valid_wallet", user_doc)

        # No debe llamar a update_one — wallet ya es válido
        mock_collection.update_one.assert_not_called()
        # El wallet debe volver intacto
        assert result["wallet"] == valid_wallet

    @pytest.mark.asyncio
    async def test_ensure_wallet_missing_pro_key_reinitializes(self):
        """CS-001: wallet sin pro_messages_balance → debe re-inicializarse."""
        from app.core.auth import _ensure_wallet

        user_doc = {
            "firebase_uid": "user_missing_key",
            "email": "test@sphere.local",
            "email_verified": True,
            "wallet": {"topup_messages_balance": 0},
        }

        mock_collection = AsyncMock()
        mock_collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _ensure_wallet("user_missing_key", user_doc)

        mock_collection.update_one.assert_called_once()
        call_args = mock_collection.update_one.call_args
        update_operation = call_args[0][1]
        assert update_operation["$set"]["wallet.pro_messages_balance"] == 30
        assert result["wallet"]["pro_messages_balance"] == 30
        assert result["wallet"]["topup_messages_balance"] == 0


# ---------------------------------------------------------------------------
# CS-001 / CS-002: _ensure_wallet contra Mongo real
#
# Los tests de arriba mockean la colección con AsyncMock: ven la llamada, no
# lo que Mongo hace con ella. Y lo que Mongo hace con
# `{"$set": {"wallet.pro_messages_balance": ...}}` sobre un documento con
# `wallet: null` es rechazarla (WriteError, code 28): no se pueden crear
# subcampos dentro de un null. Estos van contra Mongo de verdad.
# ---------------------------------------------------------------------------


@pytest.fixture
async def sembrar_usuario(async_client):
    """Inserta usuarios de prueba en Mongo y los borra al terminar.

    Depende de async_client porque es quien deja la conexión Motor montada en
    el loop del test (mismo patrón que `sembrar` en test_admin.py).
    """
    from app.infrastructure.database import get_users_collection

    creados: list[str] = []

    async def _sembrar(uid: str, wallet) -> dict:
        doc = {
            "firebase_uid": uid,
            "email": f"{uid}@test.com",
            "email_verified": True,
            "wallet": wallet,
        }
        await get_users_collection().delete_many({"firebase_uid": uid})
        await get_users_collection().insert_one(dict(doc))
        creados.append(uid)
        return doc

    yield _sembrar

    for uid in creados:
        await get_users_collection().delete_many({"firebase_uid": uid})


async def _wallet_persistido(uid: str) -> dict:
    from app.infrastructure.database import get_users_collection

    doc = await get_users_collection().find_one({"firebase_uid": uid})
    assert doc is not None, f"el usuario {uid} debería seguir existiendo"
    return doc["wallet"]


class TestEnsureWalletMongoReal:
    """CS-001/CS-002 con escrituras reales: la reparación tiene que ser aceptada."""

    @pytest.mark.asyncio
    async def test_ensure_wallet_repara_wallet_null(self, sembrar_usuario):
        """CS-001: wallet null → se repara y queda persistido, sin WriteError."""
        from app.core.auth import _ensure_wallet

        user_doc = await sembrar_usuario("u_ensure_null", None)

        result = await _ensure_wallet("u_ensure_null", user_doc)

        assert result["wallet"]["pro_messages_balance"] == 30
        persistido = await _wallet_persistido("u_ensure_null")
        assert persistido["pro_messages_balance"] == 30
        assert persistido["topup_messages_balance"] == 0

    @pytest.mark.asyncio
    async def test_ensure_wallet_dict_incompleto_fusiona_sin_borrar(self, sembrar_usuario):
        """CS-002: reparar un dict incompleto es una fusión, no un reemplazo.

        Las cuatro claves de WalletInfo se reescriben; cualquier otra que el
        documento ya tuviera sobrevive. Es la diferencia observable entre
        escribir con rutas con punto y escribir el subdocumento entero, y por
        eso el arreglo del caso null NO puede generalizarse a los dicts.
        """
        from app.core.auth import _ensure_wallet

        user_doc = await sembrar_usuario(
            "u_ensure_incompleto",
            {"topup_messages_balance": 7, "creditos_promo_legacy": 12},
        )

        await _ensure_wallet("u_ensure_incompleto", user_doc)

        persistido = await _wallet_persistido("u_ensure_incompleto")
        assert persistido["pro_messages_balance"] == 30
        # La reparación reescribe las claves del esquema...
        assert persistido["topup_messages_balance"] == 0
        # ...y no toca lo que no le corresponde.
        assert persistido["creditos_promo_legacy"] == 12


# ---------------------------------------------------------------------------
# CS-003: _repair_wallet unit tests
# ---------------------------------------------------------------------------


class TestRepairWallet:
    """Tests para _repair_wallet: idempotencia y reparación de wallets."""

    @pytest.mark.asyncio
    async def test_repair_wallet_fixes_invalid_wallet(self):
        """CS-003: wallet inválido → _repair_wallet lo inicializa con 30 créditos."""
        from app.core.auth import _repair_wallet

        user_doc = {
            "firebase_uid": "user_repair",
            "email": "test@sphere.local",
            "wallet": {},
        }

        mock_collection = AsyncMock()
        mock_collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _repair_wallet("user_repair", user_doc)

        mock_collection.update_one.assert_called_once()
        call_args = mock_collection.update_one.call_args
        assert call_args[0][0] == {"firebase_uid": "user_repair"}
        assert call_args[0][1]["$set"]["wallet.pro_messages_balance"] == 30
        assert result["wallet"]["pro_messages_balance"] == 30

    @pytest.mark.asyncio
    async def test_repair_wallet_preserves_valid_wallet(self):
        """CS-002 / CS-003: wallet válido → _repair_wallet NO lo modifica."""
        from app.core.auth import _repair_wallet

        valid_wallet = {
            "pro_messages_balance": 3,
            "topup_messages_balance": 50,
        }
        user_doc = {
            "firebase_uid": "user_valid_repair",
            "email": "test@sphere.local",
            "wallet": valid_wallet,
        }

        mock_collection = AsyncMock()
        with patch("app.core.auth.get_users_collection", return_value=mock_collection):
            result = await _repair_wallet("user_valid_repair", user_doc)

        mock_collection.update_one.assert_not_called()
        assert result["wallet"] == valid_wallet
