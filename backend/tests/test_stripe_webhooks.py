import pytest
import stripe
from httpx import AsyncClient
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
