import pytest
import os
from unittest.mock import patch, MagicMock
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Fixtures: plan-varied profiles
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_billing_info(authed_client_a: AsyncClient, db_instance):
    # Setup test user wallet
    db = db_instance.get_async_db()
    await db["users"].update_one(
        {"firebase_uid": "test_user_a"},
        {"$set": {
            "wallet": {"pro_messages_balance": 150, "topup_messages_balance": 50},
            "subscription": {"plan_id": "free"}
        }}
    )
    
    response = await authed_client_a.get("/api/v1/billing/me")
    
    assert response.status_code == 200
    data = response.json()
    assert data["plan_id"] == "free"
    assert data["pro_messages_balance"] == 150
    assert data["topup_messages_balance"] == 50


@pytest.mark.asyncio
async def test_create_checkout_session(authed_client_a: AsyncClient):
    with patch("app.infrastructure.stripe_client.StripeClient.create_checkout_session") as mock_stripe:
        mock_stripe.return_value = "https://checkout.stripe.com/test"
        
        response = await authed_client_a.post("/api/v1/billing/checkout", json={"plan_id": "executive"})
        
        assert response.status_code == 200
        assert response.json()["url"] == "https://checkout.stripe.com/test"
        mock_stripe.assert_called_once_with("test_user_a", "executive", "usera@test.com")


@pytest.mark.asyncio
async def test_create_portal_session(authed_client_a: AsyncClient, db_instance):
    db = db_instance.get_async_db()
    await db["users"].update_one(
        {"firebase_uid": "test_user_a"},
        {"$set": {"subscription": {"stripe_customer_id": "cus_123"}}}
    )

    with patch("app.infrastructure.stripe_client.StripeClient.create_billing_portal_session") as mock_stripe:
        mock_stripe.return_value = "https://billing.stripe.com/test"
        
        response = await authed_client_a.post("/api/v1/billing/portal")
        
        assert response.status_code == 200
        assert response.json()["url"] == "https://billing.stripe.com/test"
        mock_stripe.assert_called_once_with("cus_123")


# ---------------------------------------------------------------------------
# Task 3.1 / 3.3 — Validación de SKU comprable (modelo single-plan)
# ---------------------------------------------------------------------------


class TestTopupSKUValidation:
    """Verifica que solo los SKUs del catálogo sean comprables."""

    def test_purchasable_skus_are_correct(self):
        """PURCHASABLE_SKUS debe contener los 5 packs y top-ups reales."""
        from app.core.plan_limits import PURCHASABLE_SKUS

        assert PURCHASABLE_SKUS == {
            "executive",
            "director",
            "boardroom",
            "quick_meeting",
            "deep_dive",
        }

    @pytest.mark.asyncio
    async def test_user_can_purchase_valid_sku_executive(
        self, authed_client_a: AsyncClient, db_instance
    ):
        """Cualquier usuario puede comprar el SKU 'executive' → 200 OK."""
        from tests.conftest import _make_user_profile, MOCK_USER_A

        free_profile = _make_user_profile(MOCK_USER_A, plan_id="free")

        with patch("app.core.auth._auto_provision_user", return_value=free_profile):
            with patch("app.infrastructure.stripe_client.StripeClient.create_checkout_session") as mock_stripe:
                mock_stripe.return_value = "https://checkout.stripe.com/test"
                response = await authed_client_a.post(
                    "/api/v1/billing/checkout", json={"plan_id": "executive"}
                )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_user_can_purchase_valid_sku_director(
        self, authed_client_a: AsyncClient, db_instance
    ):
        """Cualquier usuario puede comprar el SKU 'director' → 200 OK."""
        from tests.conftest import _make_user_profile, MOCK_USER_A

        free_profile = _make_user_profile(MOCK_USER_A, plan_id="free")

        with patch("app.core.auth._auto_provision_user", return_value=free_profile):
            with patch("app.infrastructure.stripe_client.StripeClient.create_checkout_session") as mock_stripe:
                mock_stripe.return_value = "https://checkout.stripe.com/test"
                response = await authed_client_a.post(
                    "/api/v1/billing/checkout", json={"plan_id": "director"}
                )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_user_cannot_purchase_invalid_sku(
        self, authed_client_a: AsyncClient, db_instance
    ):
        """SKU inexistente ('super_mega_pack') → 403 Forbidden."""
        from tests.conftest import _make_user_profile, MOCK_USER_A

        free_profile = _make_user_profile(MOCK_USER_A, plan_id="free")

        with patch("app.core.auth._auto_provision_user", return_value=free_profile):
            response = await authed_client_a.post(
                "/api/v1/billing/checkout", json={"plan_id": "super_mega_pack"}
            )

        assert response.status_code == 403
        data = response.json()
        assert data["detail"]["error"] == "billing.topup_not_allowed"

    @pytest.mark.asyncio
    async def test_legacy_sku_topup_premium_rejected(
        self, authed_client_a: AsyncClient, db_instance
    ):
        """Viejo SKU tier-gateado ('topup_premium_10k') → 403 (no está en catálogo)."""
        from tests.conftest import _make_user_profile, MOCK_USER_A

        free_profile = _make_user_profile(MOCK_USER_A, plan_id="free")

        with patch("app.core.auth._auto_provision_user", return_value=free_profile):
            response = await authed_client_a.post(
                "/api/v1/billing/checkout", json={"plan_id": "topup_premium_10k"}
            )

        assert response.status_code == 403
        data = response.json()
        assert data["detail"]["error"] == "billing.topup_not_allowed"


# ---------------------------------------------------------------------------
# Webhook defense-in-depth: SKU inválido no otorga créditos
# ---------------------------------------------------------------------------


class TestWebhookInvalidSKU:
    """Verifica que el webhook NO otorga créditos si el SKU no existe en el catálogo."""

    @pytest.mark.asyncio
    async def test_webhook_invalid_sku_grants_no_credits(
        self, async_client: AsyncClient, sync_db
    ):
        """Usuario free recibe webhook con SKU 'topup_premium_10k' → 200 OK, 0 créditos."""
        db_sync = sync_db()
        event_id = "evt_invalid_sku_topup"

        # Configurar usuario free
        db_sync["users"].delete_many({"firebase_uid": "test_user_a"})
        db_sync["users"].insert_one({
            "firebase_uid": "test_user_a",
            "email": "usera@test.com",
            "subscription": {"plan_id": "free", "status": "active"},
            "wallet": {
                "pro_messages_balance": 5,
                "topup_messages_balance": 0,
            },
        })

        # Limpieza previa: idempotencia y claim de este evento. Sin esto, una
        # ejecución anterior (p. ej. la verificación por mutación) dejaría el
        # evento reclamado y esta corrida saldría verde/roja por el motivo
        # equivocado.
        db_sync["stripe_events_processed"].delete_many({"_id": event_id})
        db_sync["credit_transactions"].delete_many({"stripe_event_id": event_id})

        import stripe as stripe_lib
        event = {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": "test_user_a",
                    "customer": "cus_test",
                    "mode": "payment",
                    "metadata": {"plan_id": "topup_premium_10k"},
                }
            },
        }

        try:
            with patch.object(stripe_lib.Webhook, "construct_event", return_value=event):
                response = await async_client.post(
                    "/api/v1/webhooks/stripe",
                    json=event,
                    headers={"stripe-signature": "valid"},
                )

            # Webhook no debe romper — Stripe reintentaría por siempre
            assert response.status_code == 200

            # No deben haberse otorgado créditos de top-up
            user = db_sync["users"].find_one({"firebase_uid": "test_user_a"})
            assert user["wallet"]["topup_messages_balance"] == 0

            # Verificar que este evento NO reclamó ningún grant.
            # Se filtra por stripe_event_id, no por (user_id, balance_source):
            # el filtro amplio da rojo por transacciones que dejan otros tests
            # sobre test_user_a en la base compartida, y —más grave— el saldo
            # por sí solo NO detecta una regresión de validate_topup_tier,
            # porque un segundo guard en _grant_topup corta el $inc. El claim
            # del evento es el único hecho observable de esta ruta.
            tx_count = db_sync["credit_transactions"].count_documents({
                "stripe_event_id": event_id,
            })
            assert tx_count == 0, (
                f"Se crearon {tx_count} transacciones de top-up inesperadas "
                f"para el evento {event_id}: el SKU inválido reclamó un grant"
            )
        finally:
            db_sync["stripe_events_processed"].delete_many({"_id": event_id})
            db_sync["credit_transactions"].delete_many({"stripe_event_id": event_id})


# ---------------------------------------------------------------------------
# BF-003: Stripe config flag tests
# ---------------------------------------------------------------------------


class TestStripeConfiguredFlag:
    """Tests para stripe_configured: flag computado desde STRIPE_SECRET_KEY."""

    def test_stripe_configured_true_when_key_present(self):
        """BF-003: STRIPE_SECRET_KEY no vacío → stripe_configured=True."""
        from app.core.config import Settings
        s = Settings(STRIPE_SECRET_KEY="sk_test_valid", MONGODB_URL="mongodb://localhost")
        assert s.stripe_configured is True

    def test_stripe_configured_false_when_key_empty(self):
        """BF-003: STRIPE_SECRET_KEY vacío → stripe_configured=False."""
        from app.core.config import Settings
        s = Settings(STRIPE_SECRET_KEY="", MONGODB_URL="mongodb://localhost")
        assert s.stripe_configured is False

    def test_stripe_configured_false_when_key_whitespace(self):
        """BF-003: STRIPE_SECRET_KEY solo espacios → stripe_configured=False."""
        from app.core.config import Settings
        s = Settings(STRIPE_SECRET_KEY="   ", MONGODB_URL="mongodb://localhost")
        assert s.stripe_configured is False

    def test_stripe_configured_true_with_surrounding_whitespace(self):
        """BF-003: STRIPE_SECRET_KEY con espacios alrededor → stripe_configured=True."""
        from app.core.config import Settings
        s = Settings(STRIPE_SECRET_KEY="  sk_test_abc  ", MONGODB_URL="mongodb://localhost")
        assert s.stripe_configured is True


class TestBillingMeStripeConfigured:
    """Tests de integración: GET /billing/me incluye stripe_configured."""

    @pytest.mark.asyncio
    async def test_billing_me_includes_stripe_configured(self, authed_client_a, db_instance):
        """BF-003: GET /billing/me debe incluir el campo stripe_configured."""
        db = db_instance.get_async_db()
        await db["users"].update_one(
            {"firebase_uid": "test_user_a"},
            {"$set": {
                "wallet": {"pro_messages_balance": 5, "topup_messages_balance": 0},
                "subscription": {"plan_id": "free", "status": "active"},
            }}
        )

        response = await authed_client_a.get("/api/v1/billing/me")
        assert response.status_code == 200
        data = response.json()
        assert "stripe_configured" in data, (
            f"El response debe tener el campo stripe_configured. Keys: {list(data.keys())}"
        )
        assert isinstance(data["stripe_configured"], bool), (
            f"stripe_configured debe ser bool, es {type(data['stripe_configured'])}"
        )


# ---------------------------------------------------------------------------
# QA-3: elegibilidad de compra visible ANTES del clic
# ---------------------------------------------------------------------------
#
# `stripe_configured` sólo mira `STRIPE_SECRET_KEY`, así que un despliegue con
# la clave puesta y los `STRIPE_PRICE_*` sin poner —exactamente lo que hay hoy
# en Railway— pintaba el catálogo entero como comprable y devolvía 400
# BILLING_INVALID_PLAN en el clic. El precio de un SKU no configurado se
# descubría con un pago fallido; ahora se dice por SKU en `/billing/me`.

# Cada SKU del catálogo comprable con la variable de entorno que lo habilita.
# Es el mismo mapa de `stripe_client._price_map()`, escrito aquí a mano a
# propósito: si alguien renombra una variable, este test tiene que enterarse.
PRICE_ENV_POR_SKU = {
    "executive": "STRIPE_PRICE_EXECUTIVE",
    "director": "STRIPE_PRICE_DIRECTOR",
    "boardroom": "STRIPE_PRICE_BOARDROOM",
    "quick_meeting": "STRIPE_PRICE_QUICK_MEETING",
    "deep_dive": "STRIPE_PRICE_DEEP_DIVE",
}

TODOS_LOS_PRICE_IDS = {
    "executive": "price_exec_test",
    "director": "price_dir_test",
    "boardroom": "price_board_test",
    "quick_meeting": "price_quick_test",
    "deep_dive": "price_deep_test",
}


def _fijar_price_ids(monkeypatch, **por_sku):
    """Fija los 5 price IDs sobre el `settings` vivo; lo que no se nombre, vacío.

    Se toca el objeto, no el entorno del proceso: `settings` es un singleton ya
    construido y un `os.environ` tardío no lo cambiaría.
    """
    from app.core.config import settings

    for sku, var in PRICE_ENV_POR_SKU.items():
        monkeypatch.setattr(settings, var, por_sku.get(sku, ""))


class TestPurchasableSkus:
    """`purchasable_skus()`: qué SKUs tienen de verdad un price ID detrás."""

    def test_sin_price_ids_no_hay_nada_comprable(self, monkeypatch):
        """Los 5 vacíos —el Railway de hoy— → catálogo comprable vacío."""
        from app.infrastructure.stripe_client import purchasable_skus

        _fijar_price_ids(monkeypatch)
        assert purchasable_skus() == []

    def test_con_los_cinco_price_ids_todo_el_catalogo_es_comprable(self, monkeypatch):
        """Los 5 configurados → los 5 SKUs de PURCHASABLE_SKUS, en orden estable."""
        from app.infrastructure.stripe_client import purchasable_skus

        _fijar_price_ids(monkeypatch, **TODOS_LOS_PRICE_IDS)
        assert purchasable_skus() == [
            "boardroom",
            "deep_dive",
            "director",
            "executive",
            "quick_meeting",
        ]

    def test_solo_se_listan_los_skus_configurados(self, monkeypatch):
        """Configuración a medias: sólo sale lo que tiene price ID."""
        from app.infrastructure.stripe_client import purchasable_skus

        _fijar_price_ids(monkeypatch, quick_meeting="price_quick_test", executive="price_exec_test")
        assert purchasable_skus() == ["executive", "quick_meeting"]

    def test_un_price_id_en_blanco_no_cuenta_como_configurado(self, monkeypatch):
        """Espacios no son un price ID: Stripe daría el mismo 400 que con vacío."""
        from app.infrastructure.stripe_client import purchasable_skus

        _fijar_price_ids(monkeypatch, deep_dive="   ", director="price_dir_test")
        assert purchasable_skus() == ["director"]

    def test_sin_stripe_secret_key_no_se_promete_ninguna_compra(self, monkeypatch):
        """Con los 5 price IDs pero sin clave, `/checkout` devuelve 503: no prometas."""
        from app.core.config import settings
        from app.infrastructure.stripe_client import purchasable_skus

        _fijar_price_ids(monkeypatch, **TODOS_LOS_PRICE_IDS)
        monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "")
        assert purchasable_skus() == []


class TestBillingMePurchasableSkus:
    """Integración: GET /billing/me publica la elegibilidad por SKU."""

    @staticmethod
    async def _preparar_usuario(db_instance):
        db = db_instance.get_async_db()
        await db["users"].update_one(
            {"firebase_uid": "test_user_a"},
            {"$set": {
                "wallet": {"pro_messages_balance": 5, "topup_messages_balance": 0},
                "subscription": {"plan_id": "free", "status": "active"},
            }}
        )

    @pytest.mark.asyncio
    async def test_billing_me_lista_los_skus_con_price_id(
        self, authed_client_a, db_instance, monkeypatch
    ):
        """Los 5 price IDs puestos → los top-ups aparecen como comprables."""
        await self._preparar_usuario(db_instance)
        _fijar_price_ids(monkeypatch, **TODOS_LOS_PRICE_IDS)

        response = await authed_client_a.get("/api/v1/billing/me")

        assert response.status_code == 200
        data = response.json()
        assert "quick_meeting" in data["purchasable_skus"]
        assert "deep_dive" in data["purchasable_skus"]
        assert sorted(data["purchasable_skus"]) == [
            "boardroom",
            "deep_dive",
            "director",
            "executive",
            "quick_meeting",
        ]

    @pytest.mark.asyncio
    async def test_billing_me_sin_price_ids_no_promete_ninguna_compra(
        self, authed_client_a, db_instance, monkeypatch
    ):
        """Sin price IDs, la lista va vacía aunque `stripe_configured` sea True.

        Ésta es la mentira que el defecto dejaba pasar: la clave puesta y los
        precios sin poner, y el frontend pintando cinco botones comprables.
        """
        await self._preparar_usuario(db_instance)
        _fijar_price_ids(monkeypatch)

        response = await authed_client_a.get("/api/v1/billing/me")

        assert response.status_code == 200
        data = response.json()
        assert data["purchasable_skus"] == []
        assert data["stripe_configured"] is True

    @pytest.mark.asyncio
    async def test_billing_me_conserva_el_contrato_anterior(
        self, authed_client_a, db_instance, monkeypatch
    ):
        """El campo nuevo se AÑADE: ningún consumidor existente pierde su clave."""
        await self._preparar_usuario(db_instance)
        _fijar_price_ids(monkeypatch, **TODOS_LOS_PRICE_IDS)

        response = await authed_client_a.get("/api/v1/billing/me")

        assert response.status_code == 200
        data = response.json()
        assert set(data) == {
            "plan_id",
            "status",
            "current_period_end",
            "cancel_at_period_end",
            "pro_messages_balance",
            "topup_messages_balance",
            "rag_storage_bytes_used",
            "custom_agents_count",
            "stripe_configured",
            "purchasable_skus",
        }
        assert data["plan_id"] == "free"
        assert data["pro_messages_balance"] == 5
        assert isinstance(data["purchasable_skus"], list)
