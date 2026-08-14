"""Tests del panel admin (F4: require_admin) y métricas (F5: agregación).

require_admin se prueba con el user dict y la agregación con una lista de
transacciones materializada, ambos sin Mongo. El endpoint de reparación de
wallet (CS-003) sí usa Mongo: es una ruta HTTP que persiste, y probarla contra
la función suelta no demostraría que la ruta existe — que es justo lo que
faltaba.
"""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.presentation.api.v1.admin import require_admin, aggregate_credit_metrics
from app.core.auth import es_admin
from app.core.config import settings
from app.infrastructure.database import get_users_collection


# --- QA-4: el predicado admin es UNO solo ---
#
# `require_admin` (la guarda de los endpoints /admin) y el campo `is_admin` que
# GET /me le da al frontend tienen que contestar EXACTAMENTE lo mismo. Si
# divergen sale uno de estos dos defectos, los dos malos:
#
#   - /me dice «sí» y la guarda dice «no» → pintamos el enlace del panel a
#     alguien que al entrar se come un 403.
#   - /me dice «no» y la guarda dice «sí» → a un administrador de verdad le
#     escondemos su propio panel.
#
# Por eso el predicado vive en UN sitio (`es_admin`) y los dos lo consumen.
# La tabla de casos se comparte entre el test del predicado y el de la guarda:
# así no se puede añadir un caso a uno y olvidarlo en el otro.

CASOS_DE_ADMIN = [
    # (email, email_verified, ADMIN_EMAILS, es_admin?, por qué)
    ("admin@sphere.es", True, "admin@sphere.es", True, "en la lista y verificado"),
    ("Admin@Sphere.ES", True, "admin@sphere.es", True, "el correo no distingue mayúsculas"),
    ("  admin@sphere.es  ", True, "admin@sphere.es", True, "los espacios de sobra no cuentan"),
    ("boss@sphere.es", True, "boss@sphere.es, admin@sphere.es", True, "lista de varios"),
    ("admin@sphere.es", False, "admin@sphere.es", False, "en la lista pero sin verificar"),
    ("admin@sphere.es", None, "admin@sphere.es", False, "el claim no es True"),
    ("admin@sphere.es", "true", "admin@sphere.es", False, "la cadena 'true' no es True"),
    ("otro@x.com", True, "admin@sphere.es", False, "fuera de la lista"),
    (None, True, "admin@sphere.es", False, "sin correo"),
    ("", True, "admin@sphere.es", False, "correo vacío"),
    ("admin@sphere.es", True, "", False, "lista vacía: no hay admins"),
]


@pytest.mark.parametrize("email, verificado, lista, esperado, motivo", CASOS_DE_ADMIN)
def test_es_admin(monkeypatch, email, verificado, lista, esperado, motivo):
    """El predicado, a solas: sin FastAPI, sin Mongo, sin HTTP."""
    monkeypatch.setattr(settings, "ADMIN_EMAILS", lista)
    user = {"firebase_uid": "u1", "email": email, "email_verified": verificado}
    assert es_admin(user) is esperado, motivo


def test_es_admin_sin_claim_de_verificacion(monkeypatch):
    """Falta la clave entera (documento antiguo): no basta con estar en la lista."""
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "admin@sphere.es")
    assert es_admin({"firebase_uid": "u1", "email": "admin@sphere.es"}) is False


@pytest.mark.parametrize("email, verificado, lista, esperado, motivo", CASOS_DE_ADMIN)
async def test_require_admin_no_puede_divergir_de_es_admin(
    monkeypatch, email, verificado, lista, esperado, motivo
):
    """La guarda deja pasar exactamente a quien `es_admin` dice que sí."""
    monkeypatch.setattr(settings, "ADMIN_EMAILS", lista)
    user = {"firebase_uid": "u1", "email": email, "email_verified": verificado}
    if esperado:
        assert await require_admin(user=user) is user, motivo
    else:
        with pytest.raises(HTTPException) as exc:
            await require_admin(user=user)
        assert exc.value.status_code == 403, motivo


# --- F4: require_admin ---


async def test_require_admin_email_en_lista(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@sphere.es, admin@sphere.es")
    user = {"firebase_uid": "u1", "email": "Admin@Sphere.es", "email_verified": True}  # case-insensitive
    assert await require_admin(user=user) is user


async def test_require_admin_email_sin_verificar_bloquea(monkeypatch):
    # Defensa: el claim `email` se rellena aunque no esté verificado.
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "admin@sphere.es")
    with pytest.raises(HTTPException) as exc:
        await require_admin(user={"firebase_uid": "u1", "email": "admin@sphere.es", "email_verified": False})
    assert exc.value.status_code == 403


async def test_require_admin_email_fuera_de_lista(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@sphere.es")
    with pytest.raises(HTTPException) as exc:
        await require_admin(user={"firebase_uid": "u2", "email": "otro@x.com"})
    assert exc.value.status_code == 403


async def test_require_admin_lista_vacia_bloquea_a_todos(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "")
    with pytest.raises(HTTPException) as exc:
        await require_admin(user={"firebase_uid": "u3", "email": "cualquiera@x.com"})
    assert exc.value.status_code == 403


async def test_require_admin_sin_email_bloquea(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@sphere.es")
    with pytest.raises(HTTPException):
        await require_admin(user={"firebase_uid": "u4", "email": None})


# --- F5: agregación de métricas ---


def _tx(delta, reason, day, **extra):
    return {
        "delta": delta,
        "reason": reason,
        "created_at": datetime(2026, 7, day, 12, 0, tzinfo=timezone.utc),
        **extra,
    }


def test_aggregate_separa_debates_y_chats():
    txs = [
        _tx(-1, "inference", 10, counted_as_messages=1, cost_usd_estimated=0.01),
        _tx(-5, "inference", 10, counted_as_messages=5, cost_usd_estimated=0.05),
        _tx(-1, "inference", 11, counted_as_messages=1, cost_usd_estimated=0.01),
    ]
    m = aggregate_credit_metrics(txs, days=30)
    assert m["totals"]["chats"] == 2
    assert m["totals"]["debates"] == 1
    assert m["totals"]["credits_consumed"] == 7
    assert round(m["totals"]["cost_usd_estimated"], 2) == 0.07
    # Agrupación por día.
    assert len(m["by_day"]) == 2


def test_aggregate_refunds_y_compras():
    txs = [
        _tx(5, "inference_failed", 10),          # refund
        _tx(30, "subscription_grant", 10),        # compra/grant
        _tx(150, "topup_purchase", 11),           # compra
        _tx(30, "period_reset", 11),              # ni refund ni compra
    ]
    m = aggregate_credit_metrics(txs, days=30)
    assert m["totals"]["refunds"] == 5
    assert m["totals"]["purchases_count"] == 2
    assert m["totals"]["credits_granted"] == 180


def test_aggregate_suma_cost_usd_actual():
    txs = [
        _tx(-1, "inference", 10, cost_usd_estimated=0.02, counted_as_messages=1),
        _tx(-1, "token_cap_adjustment", 10, cost_usd_actual=0.03),
    ]
    m = aggregate_credit_metrics(txs, days=7)
    assert round(m["totals"]["cost_usd_actual"], 2) == 0.03
    assert m["days"] == 7


def test_aggregate_vacio():
    m = aggregate_credit_metrics([], days=30)
    assert m["totals"]["credits_consumed"] == 0
    assert m["by_day"] == []


# --- CS-003: POST /admin/users/{uid}/repair-wallet ---

_ADMIN_EMAIL = "admin@sphere.es"
# Créditos que otorga el plan free (settings.plan_messages_map["free"]).
_CREDITOS_FREE = 30


def _ruta(uid: str) -> str:
    return f"/api/v1/admin/users/{uid}/repair-wallet"


def _identidad(email: str) -> dict:
    """Documento de usuario tal y como lo devuelve get_current_user."""
    return {"firebase_uid": f"uid_{email}", "email": email, "email_verified": True}


@pytest.fixture
def como(monkeypatch):
    """Suplanta la identidad autenticada dejando `require_admin` intacto.

    Se sobreescribe get_current_user, no require_admin: la guarda de admin es
    parte de lo que se prueba, así que tiene que ejecutarse de verdad.
    """
    from main import app
    from app.core.auth import get_current_user

    monkeypatch.setattr(settings, "ADMIN_EMAILS", _ADMIN_EMAIL)

    def _usar(email: str):
        async def _override():
            return _identidad(email)

        app.dependency_overrides[get_current_user] = _override

    yield _usar
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
async def sembrar(async_client):
    """Inserta usuarios de prueba en Mongo y los borra al terminar.

    Depende de async_client porque es quien deja la conexión Motor montada en
    el loop del test.
    """
    creados: list[str] = []

    async def _sembrar(uid: str, wallet) -> None:
        await get_users_collection().delete_many({"firebase_uid": uid})
        await get_users_collection().insert_one({
            "firebase_uid": uid,
            "email": f"{uid}@test.com",
            "wallet": wallet,
        })
        creados.append(uid)

    yield _sembrar

    for uid in creados:
        await get_users_collection().delete_many({"firebase_uid": uid})


async def _wallet_en_mongo(uid: str) -> dict:
    doc = await get_users_collection().find_one({"firebase_uid": uid})
    assert doc is not None, f"el usuario {uid} debería seguir existiendo"
    return doc["wallet"]


async def test_repair_wallet_repara_wallet_vacio(async_client, como, sembrar):
    """CS-003: wallet {} → se repara, se persiste y se devuelve reparado."""
    como(_ADMIN_EMAIL)
    await sembrar("u_wallet_vacio", {})

    r = await async_client.post(_ruta("u_wallet_vacio"))

    assert r.status_code == 200
    body = r.json()
    assert body["repaired"] is True
    assert body["wallet"]["pro_messages_balance"] == _CREDITOS_FREE
    # Persistido en Mongo, no solo en la respuesta.
    assert (await _wallet_en_mongo("u_wallet_vacio"))["pro_messages_balance"] == _CREDITOS_FREE


async def test_repair_wallet_repara_wallet_null(async_client, como, sembrar):
    """CS-001/CS-003: wallet null → se repara igual que {}.

    Mongo rechaza `$set` de rutas con punto sobre un `wallet: null` (WriteError
    code 28: no se pueden crear subcampos dentro de un null), así que para esa
    forma la reparación escribe el subdocumento `wallet` entero.
    """
    como(_ADMIN_EMAIL)
    await sembrar("u_wallet_null", None)

    r = await async_client.post(_ruta("u_wallet_null"))

    assert r.status_code == 200
    assert r.json()["repaired"] is True
    assert (await _wallet_en_mongo("u_wallet_null"))["pro_messages_balance"] == _CREDITOS_FREE


async def test_repair_wallet_repara_wallet_sin_la_clave(async_client, como, sembrar):
    """CS-003 (triangulación): un dict sin pro_messages_balance también es inválido."""
    como(_ADMIN_EMAIL)
    await sembrar("u_wallet_sin_clave", {"topup_messages_balance": 7})

    r = await async_client.post(_ruta("u_wallet_sin_clave"))

    assert r.status_code == 200
    assert r.json()["repaired"] is True
    assert (await _wallet_en_mongo("u_wallet_sin_clave"))["pro_messages_balance"] == _CREDITOS_FREE


async def test_repair_wallet_no_toca_wallet_valido(async_client, como, sembrar):
    """CS-002: un wallet válido no se sobreescribe; la respuesta lo dice."""
    valido = {"pro_messages_balance": 3, "topup_messages_balance": 0}
    como(_ADMIN_EMAIL)
    await sembrar("u_wallet_valido", dict(valido))

    r = await async_client.post(_ruta("u_wallet_valido"))

    assert r.status_code == 200
    body = r.json()
    assert body["repaired"] is False
    assert body["wallet"]["pro_messages_balance"] == 3
    # Intacto en Mongo: ni el saldo cambia ni aparecen claves nuevas.
    assert await _wallet_en_mongo("u_wallet_valido") == valido


async def test_repair_wallet_usuario_inexistente(async_client, como):
    """Mismo 404 que la ruta hermana POST /users/{uid}/adjust."""
    como(_ADMIN_EMAIL)

    r = await async_client.post(_ruta("u_que_no_existe"))

    assert r.status_code == 404
    assert r.json()["detail"] == "Usuario no encontrado"


async def test_repair_wallet_rechaza_no_admin(async_client, como, sembrar):
    """Mismo 403 que las rutas hermanas, y sin llegar a escribir."""
    como("pepe@test.com")
    await sembrar("u_objetivo_no_admin", {})

    r = await async_client.post(_ruta("u_objetivo_no_admin"))

    assert r.status_code == 403
    assert r.json()["detail"] == "Sin acceso"
    # La guarda corta antes de cualquier escritura.
    assert await _wallet_en_mongo("u_objetivo_no_admin") == {}
