import pytest
import stripe
from httpx import AsyncClient
from types import SimpleNamespace
from unittest.mock import patch

@pytest.fixture
def mock_stripe_event():
    return {
        "id": "evt_test_123",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": "test_user_a",
                "customer": "cus_test",
                "subscription": "sub_test"
            }
        }
    }

@pytest.mark.asyncio
async def test_stripe_webhook_invalid_signature(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/webhooks/stripe", 
        json={"id": "evt_123"},
        headers={"stripe-signature": "invalid"}
    )
    # The construction will fail in stripe client if signature is invalid
    # Assuming the current implementation raises 400
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_stripe_webhook_idempotency_and_success(async_client: AsyncClient, mock_stripe_event, sync_db):
    # Limpieza de runs anteriores (idempotencia del propio test).
    events_col = sync_db()["stripe_events_processed"]
    events_col.delete_many({"_id": "evt_test_123"})

    with patch("stripe.Webhook.construct_event", return_value=mock_stripe_event):
        # 1. First request, should process
        response = await async_client.post(
            "/api/v1/webhooks/stripe",
            json=mock_stripe_event,
            headers={"stripe-signature": "valid"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

        # Check DB
        assert events_col.find_one({"_id": "evt_test_123"}) is not None

        # 2. Second request, same event, should be already processed
        response2 = await async_client.post(
            "/api/v1/webhooks/stripe",
            json=mock_stripe_event,
            headers={"stripe-signature": "valid"}
        )
        assert response2.status_code == 200
        assert response2.json()["status"] == "already processed"


# ── A2 (auditoría 2026-06-10): el grant NO se duplica aunque Stripe reintente
# un evento que quedó a medio procesar (estado "processing", sin marcar "done"). ──
@pytest.mark.asyncio
async def test_topup_grant_idempotent_on_retry(async_client: AsyncClient, sync_db):
    from app.core.config import settings

    dbc = sync_db()
    events_col = dbc["stripe_events_processed"]
    tx_col = dbc["credit_transactions"]
    users_col = dbc["users"]

    event_id = "evt_topup_idem_1"
    user_id = "test_topup_idem_user"
    sku = "deep_dive"
    expected = settings.topup_messages_map[sku]

    # Limpieza de runs anteriores ANTES de crear el índice: una corrida previa
    # pudo dejar el evento reclamado (y hasta duplicado, si el índice no llegó a
    # existir), y entonces create_index moriría con DuplicateKeyError en vez de
    # ejecutar el test.
    events_col.delete_many({"_id": event_id})
    tx_col.delete_many({"stripe_event_id": event_id})
    users_col.delete_many({"firebase_uid": user_id})

    # Índice único idempotente (en prod lo crea _ensure_indexes al arrancar).
    tx_col.create_index(
        [("stripe_event_id", 1)],
        unique=True,
        partialFilterExpression={"stripe_event_id": {"$exists": True}},
    )

    users_col.insert_one({
        "firebase_uid": user_id,
        "subscription": {"plan_id": "free"},
        "wallet": {"pro_messages_balance": 0, "topup_messages_balance": 0},
    })

    event = {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {"object": {
            "client_reference_id": user_id,
            "customer": "cus_x",
            "mode": "payment",
            "metadata": {"plan_id": sku},
        }},
    }

    try:
        with patch("stripe.Webhook.construct_event", return_value=event):
            # 1er envío: otorga los créditos
            r1 = await async_client.post(
                "/api/v1/webhooks/stripe", json=event,
                headers={"stripe-signature": "v"},
            )
            assert r1.status_code == 200
            bal1 = users_col.find_one({"firebase_uid": user_id})["wallet"]["topup_messages_balance"]
            assert bal1 == expected

            # Simular crash post-grant: el evento quedó "processing", no "done"
            events_col.update_one({"_id": event_id}, {"$set": {"status": "processing"}})

            # Retry de Stripe: re-entra pero el claim (índice único) evita doble-grant
            r2 = await async_client.post(
                "/api/v1/webhooks/stripe", json=event,
                headers={"stripe-signature": "v"},
            )
            assert r2.status_code == 200
            bal2 = users_col.find_one({"firebase_uid": user_id})["wallet"]["topup_messages_balance"]
            assert bal2 == expected  # ← clave: NO se duplicó
    finally:
        events_col.delete_many({"_id": event_id})
        tx_col.delete_many({"stripe_event_id": event_id})
        users_col.delete_many({"firebase_uid": user_id})


# ── A2: una compra con metadata corrupta no se pierde en silencio: queda en
# failed_payments y devolvemos 200 (no 500) para que Stripe no reintente eterno. ──
@pytest.mark.asyncio
async def test_malformed_checkout_goes_to_dead_letter(async_client: AsyncClient, sync_db):
    dbc = sync_db()
    events_col = dbc["stripe_events_processed"]
    failed_col = dbc["failed_payments"]

    event_id = "evt_malformed_1"
    events_col.delete_many({"_id": event_id})
    failed_col.delete_many({"event_id": event_id})

    # Sin client_reference_id ni metadata.plan_id
    event = {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_x", "customer": "cus_x"}},
    }

    try:
        with patch("stripe.Webhook.construct_event", return_value=event):
            r = await async_client.post(
                "/api/v1/webhooks/stripe", json=event,
                headers={"stripe-signature": "v"},
            )
            assert r.status_code == 200  # no 500 → Stripe no reintenta infinito
            assert failed_col.find_one({"event_id": event_id}) is not None
    finally:
        events_col.delete_many({"_id": event_id})
        failed_col.delete_many({"event_id": event_id})


# ═══════════════════════════════════════════════════════════════════════════
# Grant huérfano (PW-001..003): el pago entra y los créditos no.
#
# El perfil puede no existir cuando Stripe entrega el evento (alta a medias,
# borrado de cuenta). El webhook reclama el evento y "otorga" sobre cero
# documentos: el claim queda escrito, el wallet no cambia y el evento se marca
# "done", así que ni el replay lo arregla. Las aserciones son de ESTADO en
# Mongo (claims, balance, failed_payments), no del cuerpo HTTP.
# ═══════════════════════════════════════════════════════════════════════════

# current_period_end fijo: evita que los tests de suscripción salgan a la red
# real de Stripe (la app hace Subscription.retrieve para resolver el periodo).
_FAKE_PERIOD_END = {"current_period_end": 1893456000}


@pytest.fixture
def orphan_env(sync_db):
    """Entorno aislado para los tests de grant huérfano.

    Limpia las 4 colecciones implicadas ANTES y DESPUÉS. Sin la limpieza
    *previa*, un "done" dejado por una corrida rota deja PW-002 en rojo
    permanente y PW-005 contamina PW-002 (Mongo compartido en CI). Cada test
    pide su propio event_id, así que no pueden colisionar entre sí.
    """
    dbc = sync_db()
    env = SimpleNamespace(
        events=dbc["stripe_events_processed"],
        tx=dbc["credit_transactions"],
        users=dbc["users"],
        failed=dbc["failed_payments"],
    )
    registered: list[tuple[str, str]] = []

    def _purge():
        for event_id, user_id in registered:
            env.events.delete_many({"_id": event_id})
            env.tx.delete_many({"stripe_event_id": event_id})
            env.users.delete_many({"firebase_uid": user_id})
            env.failed.delete_many({"event_id": event_id})

    def _event(event_id: str, user_id: str, mode: str, plan_id: str) -> dict:
        """Construye el dict del evento UNA sola vez. Los tests reenvían este
        mismo objeto: no hay un segundo literal donde colar otro event_id."""
        registered.append((event_id, user_id))
        _purge()
        # Índice único (en prod lo crea _ensure_indexes al arrancar). Se crea
        # DESPUÉS de purgar: si una corrida previa dejó duplicados, create_index
        # moriría con DuplicateKeyError en vez de ejecutar el test. Sin él, los
        # count_documents({"stripe_event_id": E}) no significan nada.
        env.tx.create_index(
            [("stripe_event_id", 1)],
            unique=True,
            partialFilterExpression={"stripe_event_id": {"$exists": True}},
        )
        obj = {
            "id": f"cs_{event_id}",
            "client_reference_id": user_id,
            "customer": f"cus_{user_id}",
            "mode": mode,
            "metadata": {"plan_id": plan_id},
        }
        if mode == "subscription":
            obj["subscription"] = f"sub_{event_id}"
        return {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {"object": obj},
        }

    env.event = _event
    yield env
    _purge()


# ── PW-001: perfil ausente no otorga ni reclama ──────────────────────────────

@pytest.mark.asyncio
async def test_orphan_topup_no_grant_no_claim(async_client: AsyncClient, orphan_env):
    from app.presentation.api.v1 import webhooks as webhooks_mod

    E, U, SKU = "evt_pw001_topup", "usr_pw001_topup", "deep_dive"
    event = orphan_env.event(E, U, "payment", SKU)

    # Precondición explícita: mata el falso verde de "el perfil ya existía".
    assert orphan_env.users.find_one({"firebase_uid": U}) is None

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("app.presentation.api.v1.webhooks._claim_grant",
               wraps=webhooks_mod._claim_grant) as claim_spy:
        r = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    assert r.status_code == 200
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 0
    # El claim no se llega a INTENTAR. Sin esto el test lo pasaría también la
    # compensación de PW-003 (que inserta y borra), y la guarda de perfil dejaría
    # de estar observada: mismo estado final, distinto comportamiento.
    assert claim_spy.call_count == 0
    failed = orphan_env.failed.find_one({"event_id": E})
    assert failed is not None
    assert failed["reason"] == "user_profile_not_found"


@pytest.mark.asyncio
async def test_orphan_subscription_no_grant_no_claim(async_client: AsyncClient, orphan_env):
    from app.presentation.api.v1 import webhooks as webhooks_mod

    E, U, P = "evt_pw001_sub", "usr_pw001_sub", "free"
    event = orphan_env.event(E, U, "subscription", P)
    S = event["data"]["object"]["subscription"]

    assert orphan_env.users.find_one({"firebase_uid": U}) is None

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("stripe.Subscription.retrieve", return_value=_FAKE_PERIOD_END) as retrieve_spy, \
         patch("app.presentation.api.v1.webhooks._claim_grant",
               wraps=webhooks_mod._claim_grant) as claim_spy:
        r = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    assert r.status_code == 200
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 0
    assert claim_spy.call_count == 0
    # Un huérfano se corta antes del dispatch de `mode`: no gastamos una llamada
    # a la API de Stripe por un pago que no vamos a aplicar.
    assert retrieve_spy.call_count == 0
    assert orphan_env.users.count_documents({"subscription.stripe_subscription_id": S}) == 0
    failed = orphan_env.failed.find_one({"event_id": E})
    assert failed is not None
    assert failed["reason"] == "user_profile_not_found"


# ── PW-002: la entrega no queda consumida — el replay sí otorga ──────────────

@pytest.mark.asyncio
async def test_orphan_topup_replay_grants_after_profile_created(
    async_client: AsyncClient, orphan_env
):
    from app.core.config import settings

    E, U, SKU = "evt_pw002_topup", "usr_pw002_topup", "deep_dive"
    expected = settings.topup_messages_map[SKU]
    event = orphan_env.event(E, U, "payment", SKU)

    assert orphan_env.users.find_one({"firebase_uid": U}) is None

    with patch("stripe.Webhook.construct_event", return_value=event):
        r1 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        assert r1.status_code == 200
        # Si el evento se marca "done", el replay responde "already processed"
        # y los créditos se pierden para siempre.
        assert orphan_env.events.find_one({"_id": E})["status"] != "done"

        orphan_env.users.insert_one({
            "firebase_uid": U,
            "subscription": {"plan_id": "free"},
            "wallet": {"pro_messages_balance": 0, "topup_messages_balance": 0},
        })

        r2 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] != "already processed"

    doc = orphan_env.users.find_one({"firebase_uid": U})
    assert doc["wallet"]["topup_messages_balance"] == expected
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 1


@pytest.mark.asyncio
async def test_orphan_subscription_replay_grants_after_profile_created(
    async_client: AsyncClient, orphan_env
):
    from app.core.config import settings

    E, U, P = "evt_pw002_sub", "usr_pw002_sub", "free"
    expected = settings.plan_messages_map[P]
    event = orphan_env.event(E, U, "subscription", P)
    S = event["data"]["object"]["subscription"]

    assert orphan_env.users.find_one({"firebase_uid": U}) is None

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("stripe.Subscription.retrieve", return_value=_FAKE_PERIOD_END):
        r1 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        assert r1.status_code == 200
        assert orphan_env.events.find_one({"_id": E})["status"] != "done"

        # Perfil sin plan ni balance: que acabe en `free`/30 solo puede venir
        # del grant, no del documento que insertamos aquí.
        orphan_env.users.insert_one({
            "firebase_uid": U,
            "subscription": {},
            "wallet": {"pro_messages_balance": 0, "topup_messages_balance": 0},
        })

        r2 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] != "already processed"

    doc = orphan_env.users.find_one({"firebase_uid": U})
    assert doc["subscription"]["plan_id"] == P
    assert doc["subscription"]["stripe_subscription_id"] == S
    assert doc["wallet"]["pro_messages_balance"] == expected
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 1


# ── PW-007: failed_payments es un buzón, no un log ──────────────────────────
#
# Un huérfano deja el evento en "processing" y NO devuelve 500, así que la
# reentrega llega por timeout de red o por replay manual — que es justo el
# procedimiento de recuperación oficial (PW-002). Cada entrega escribía una fila
# nueva: N filas por un mismo pago invitan a compensarlo N veces.

@pytest.mark.asyncio
async def test_orphan_redelivery_writes_a_single_dead_letter_row(
    async_client: AsyncClient, orphan_env
):
    E, U, SKU = "evt_pw007_dedupe", "usr_pw007_dedupe", "deep_dive"
    event = orphan_env.event(E, U, "payment", SKU)

    assert orphan_env.users.find_one({"firebase_uid": U}) is None

    with patch("stripe.Webhook.construct_event", return_value=event):
        for _ in range(3):
            r = await async_client.post(
                "/api/v1/webhooks/stripe", json=event,
                headers={"stripe-signature": "v"},
            )
            assert r.status_code == 200
            assert r.json()["status"] == "user_profile_not_found"

    # Una fila por evento, no una por reintento: es lo que un humano lee para
    # devolver el dinero.
    assert orphan_env.failed.count_documents({"event_id": E}) == 1
    assert orphan_env.failed.find_one({"event_id": E})["reason"] == "user_profile_not_found"


@pytest.mark.asyncio
async def test_dead_letter_does_not_collapse_distinct_events(
    async_client: AsyncClient, orphan_env
):
    """La deduplicación es POR evento: dos pagos huérfanos distintos siguen
    siendo dos filas. Sin esto, un upsert por un filtro demasiado ancho
    escondería pagos reales."""
    E1, U1 = "evt_pw007_a", "usr_pw007_a"
    E2, U2 = "evt_pw007_b", "usr_pw007_b"
    SKU = "deep_dive"
    ev1 = orphan_env.event(E1, U1, "payment", SKU)
    ev2 = orphan_env.event(E2, U2, "payment", SKU)

    for event in (ev1, ev2):
        with patch("stripe.Webhook.construct_event", return_value=event):
            for _ in range(2):
                r = await async_client.post(
                    "/api/v1/webhooks/stripe", json=event,
                    headers={"stripe-signature": "v"},
                )
                assert r.status_code == 200

    assert orphan_env.failed.count_documents({"event_id": E1}) == 1
    assert orphan_env.failed.count_documents({"event_id": E2}) == 1
    assert orphan_env.failed.count_documents({"event_id": {"$in": [E1, E2]}}) == 2


# ── PW-003: el perfil desaparece entre la guarda y el grant ──────────────────

@pytest.mark.asyncio
async def test_topup_profile_deleted_after_claim_compensates(
    async_client: AsyncClient, orphan_env
):
    from app.presentation.api.v1 import webhooks as webhooks_mod

    E, U, SKU = "evt_pw003_topup", "usr_pw003_topup", "deep_dive"
    event = orphan_env.event(E, U, "payment", SKU)
    orphan_env.users.insert_one({
        "firebase_uid": U,
        "subscription": {"plan_id": "free"},
        "wallet": {"pro_messages_balance": 0, "topup_messages_balance": 0},
    })

    real_grant = webhooks_mod._grant_topup

    def _race(users_col, user_id, plan_id):
        # La cuenta se borra entre la guarda y el $inc; el helper REAL corre
        # después, así se ejerce el matched_count == 0 de verdad.
        users_col.delete_one({"firebase_uid": user_id})
        return real_grant(users_col, user_id, plan_id)

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("app.presentation.api.v1.webhooks._grant_topup", side_effect=_race):
        r = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    assert r.status_code == 200
    # El claim de ESTA petición se compensa: si no, el evento queda reclamado
    # sin créditos y ningún replay lo puede otorgar.
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 0
    failed = orphan_env.failed.find_one({"event_id": E})
    assert failed is not None
    assert failed["reason"] == "user_profile_not_found"


# ── PW-006: el grant LANZA (no devuelve matched_count == 0) ─────────────────
#
# No hace falta un crash de proceso: basta un WriteError corriente de Mongo.
# Si el claim queda escrito y `applied` conserva su inicial True, el reintento
# encuentra el evento ya reclamado, lo marca "done" y el resultado es cero
# créditos, cero filas en failed_payments y nada que ver para el auditor.
# El grant tiene que ser FAIL-CLOSED: si no se aplicó, se compensa.

@pytest.mark.asyncio
async def test_topup_grant_write_error_compensates_and_replay_grants(
    async_client: AsyncClient, orphan_env
):
    from app.core.config import settings

    E, U, SKU = "evt_pw006_topup", "usr_pw006_topup", "deep_dive"
    expected = settings.topup_messages_map[SKU]
    event = orphan_env.event(E, U, "payment", SKU)

    # topup_messages_balance de tipo string → el $inc del grant lanza WriteError.
    # El perfil SÍ existe: esto no lo detecta ni la guarda ni el script de auditoría.
    orphan_env.users.insert_one({
        "firebase_uid": U,
        "subscription": {"plan_id": "free"},
        "wallet": {"pro_messages_balance": 0, "topup_messages_balance": "0"},
    })

    with patch("stripe.Webhook.construct_event", return_value=event):
        r1 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        # Estado intermedio capturado aquí y afirmado abajo: primero la pérdida
        # de dinero, que es lo que de verdad importa, y después el mecanismo.
        after_r1 = {
            "status": r1.status_code,
            "claims": orphan_env.tx.count_documents({"stripe_event_id": E}),
            "failed": orphan_env.failed.count_documents({"event_id": E}),
            "event": orphan_env.events.find_one({"_id": E})["status"],
        }

        # Se repara el wallet y Stripe reentrega el mismo evento.
        orphan_env.users.update_one(
            {"firebase_uid": U}, {"$set": {"wallet.topup_messages_balance": 0}}
        )
        r2 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    doc = orphan_env.users.find_one({"firebase_uid": U})
    # La pérdida silenciosa: hoy el reintento responde 200 y otorga 0 créditos.
    assert doc["wallet"]["topup_messages_balance"] == expected
    assert r2.status_code == 200
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 1
    # Fail-closed: el claim no puede sobrevivir a un grant que no se aplicó.
    assert after_r1["claims"] == 0
    assert after_r1["failed"] == 1
    assert after_r1["status"] == 500
    assert after_r1["event"] != "done"
    assert orphan_env.failed.find_one({"event_id": E})["reason"] == "grant_write_failed"


@pytest.mark.asyncio
async def test_subscription_grant_write_error_compensates_and_replay_grants(
    async_client: AsyncClient, orphan_env
):
    from app.core.config import settings

    E, U, P = "evt_pw006_sub", "usr_pw006_sub", "free"
    expected = settings.plan_messages_map[P]
    event = orphan_env.event(E, U, "subscription", P)

    # wallet escalar → el $set sobre "wallet.pro_messages_balance" lanza
    # WriteError. Otro modo de fallo, misma clase: el grant lanza, no devuelve 0.
    orphan_env.users.insert_one({
        "firebase_uid": U,
        "subscription": {},
        "wallet": "corrupto",
    })

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("stripe.Subscription.retrieve", return_value=_FAKE_PERIOD_END):
        r1 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )
        after_r1 = {
            "status": r1.status_code,
            "claims": orphan_env.tx.count_documents({"stripe_event_id": E}),
            "failed": orphan_env.failed.count_documents({"event_id": E}),
        }

        orphan_env.users.update_one({"firebase_uid": U}, {"$set": {"wallet": {}}})
        r2 = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    doc = orphan_env.users.find_one({"firebase_uid": U})
    assert doc["wallet"]["pro_messages_balance"] == expected
    assert doc["subscription"]["plan_id"] == P
    assert r2.status_code == 200
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 1
    assert after_r1["claims"] == 0
    assert after_r1["failed"] == 1
    assert after_r1["status"] == 500


@pytest.mark.asyncio
async def test_subscription_profile_deleted_after_claim_compensates(
    async_client: AsyncClient, orphan_env
):
    from app.presentation.api.v1 import webhooks as webhooks_mod

    E, U, P = "evt_pw003_sub", "usr_pw003_sub", "free"
    event = orphan_env.event(E, U, "subscription", P)
    S = event["data"]["object"]["subscription"]
    orphan_env.users.insert_one({
        "firebase_uid": U,
        "subscription": {},
        "wallet": {"pro_messages_balance": 0, "topup_messages_balance": 0},
    })

    real_grant = webhooks_mod._grant_subscription

    def _race(users_col, user_id, plan_id, customer_id, subscription_id, period_end):
        users_col.delete_one({"firebase_uid": user_id})
        return real_grant(users_col, user_id, plan_id, customer_id,
                          subscription_id, period_end)

    with patch("stripe.Webhook.construct_event", return_value=event), \
         patch("stripe.Subscription.retrieve", return_value=_FAKE_PERIOD_END), \
         patch("app.presentation.api.v1.webhooks._grant_subscription", side_effect=_race):
        r = await async_client.post(
            "/api/v1/webhooks/stripe", json=event,
            headers={"stripe-signature": "v"},
        )

    assert r.status_code == 200
    # Aquí miramos primero la constancia del fallo: sin fila en failed_payments
    # el pago se pierde en silencio aunque el claim se haya compensado.
    failed = orphan_env.failed.find_one({"event_id": E})
    assert failed is not None
    assert failed["reason"] == "user_profile_not_found"
    assert orphan_env.tx.count_documents({"stripe_event_id": E}) == 0
    assert orphan_env.users.count_documents({"subscription.stripe_subscription_id": S}) == 0
