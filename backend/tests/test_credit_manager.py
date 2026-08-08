import pytest
import asyncio
from datetime import datetime
from app.application.credit_manager import CreditManager, InsufficientCreditsError, ChargeContext
from pymongo import MongoClient

# `sync_db` viene de conftest.py: un callable que resuelve settings.DB_NAME.
# No redefinirlo aquí — una fixture local volvería a fijar el nombre de la base.

@pytest.fixture
def credit_manager(sync_db):
    return CreditManager(sync_db())

def setup_user(db, uid, pro_balance, topup_balance):
    # Limpiar tanto por firebase_uid como por el email único derivado,
    # para no chocar con índices únicos (email_1) de runs previos.
    email = f"{uid}@test.local"
    db["users"].delete_many({"$or": [{"firebase_uid": uid}, {"email": email}]})
    db["credit_transactions"].delete_many({"user_id": uid})
    db["users"].insert_one({
        "firebase_uid": uid,
        "email": email,
        "wallet": {
            "pro_messages_balance": pro_balance,
            "topup_messages_balance": topup_balance
        }
    })

def test_charge_from_plan(sync_db, credit_manager):
    setup_user(sync_db(), "test_user_a", pro_balance=5, topup_balance=0)
    
    ctx = credit_manager.reserve_and_charge("test_user_a", "agent_1", "deepseek-v4-pro")
    
    assert ctx.cost == 1
    assert ctx.source == "plan"
    
    user = sync_db()["users"].find_one({"firebase_uid": "test_user_a"})
    assert user["wallet"]["pro_messages_balance"] == 4
    assert user["wallet"]["topup_messages_balance"] == 0

    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["delta"] == -1
    assert tx["balance_source"] == "plan"

def test_charge_from_topup(sync_db, credit_manager):
    setup_user(sync_db(), "test_user_a", pro_balance=0, topup_balance=10)
    
    ctx = credit_manager.reserve_and_charge("test_user_a", "agent_1", "deepseek-v4-pro")
    
    assert ctx.source == "topup"
    
    user = sync_db()["users"].find_one({"firebase_uid": "test_user_a"})
    assert user["wallet"]["pro_messages_balance"] == 0
    assert user["wallet"]["topup_messages_balance"] == 9

def test_insufficient_credits(sync_db, credit_manager):
    setup_user(sync_db(), "test_user_a", pro_balance=0, topup_balance=0)
    
    with pytest.raises(InsufficientCreditsError):
        credit_manager.reserve_and_charge("test_user_a", "agent_1", "deepseek-v4-pro")

def test_refund(sync_db, credit_manager):
    setup_user(sync_db(), "test_user_a", pro_balance=5, topup_balance=0)
    
    ctx = credit_manager.reserve_and_charge("test_user_a", "agent_1", "deepseek-v4-pro")
    assert sync_db()["users"].find_one({"firebase_uid": "test_user_a"})["wallet"]["pro_messages_balance"] == 4
    
    credit_manager.refund(ctx, reason="inference_failed")
    
    assert sync_db()["users"].find_one({"firebase_uid": "test_user_a"})["wallet"]["pro_messages_balance"] == 5

def test_adjust_after_completion_extra_charge(sync_db, credit_manager):
    setup_user(sync_db(), "test_user_a", pro_balance=5, topup_balance=0)
    
    ctx = credit_manager.reserve_and_charge("test_user_a", "agent_1", "deepseek-v4-pro")
    # Simulate an expensive query > 4000 tokens total
    credit_manager.adjust_after_completion(ctx, tokens_in=3000, tokens_out=1500, cost_usd_actual=0.01)
    
    user = sync_db()["users"].find_one({"firebase_uid": "test_user_a"})
    # Original cost = 1, extra = 1, so balance should be 3
    assert user["wallet"]["pro_messages_balance"] == 3
    
    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["counted_as_messages"] == 2

@pytest.mark.asyncio
async def test_race_conditions_50_concurrent_requests(sync_db, credit_manager):
    """
    Test E2E de condiciones de carrera (Crítico).
    El usuario solo tiene 10 mensajes. Lanzamos 50 requests concurrentes.
    Al final, exactamente 10 deben tener éxito y 40 deben fallar, 
    y el balance debe ser exactamente 0 (nunca negativo).
    """
    uid = "test_race_user"
    setup_user(sync_db(), uid, pro_balance=10, topup_balance=0)
    
    async def attempt_charge():
        loop = asyncio.get_running_loop()
        try:
            # Execute sync block in threadpool
            ctx = await loop.run_in_executor(
                None, 
                credit_manager.reserve_and_charge, 
                uid, "agent_1", "deepseek-v4-pro"
            )
            return True
        except InsufficientCreditsError:
            return False

    # Fire 50 concurrent requests
    results = await asyncio.gather(*(attempt_charge() for _ in range(50)))
    
    successful = sum(1 for r in results if r is True)
    failed = sum(1 for r in results if r is False)
    
    assert successful == 10
    assert failed == 40
    
    user = sync_db()["users"].find_one({"firebase_uid": uid})
    assert user["wallet"]["pro_messages_balance"] == 0
    
    tx_count = sync_db()["credit_transactions"].count_documents({"user_id": uid, "delta": -1})
    assert tx_count == 10

def test_resolve_cost_always_one(credit_manager):
    """El modelo de cobro es SIEMPRE 1 crédito por mensaje humano,
    sin importar el agente ni el modelo."""
    assert credit_manager._resolve_cost("CEO", "deepseek-v4-pro") == 1
    assert credit_manager._resolve_cost("CTO", "deepseek-chat") == 1
    assert credit_manager._resolve_cost("CFO", "gpt-4") == 1
    assert credit_manager._resolve_cost("custom_agent_123", "any-model") == 1

def test_adjust_after_completion_under_cap_no_extra(sync_db, credit_manager):
    """Bajo el cap de 4000 tokens no se cobra crédito extra."""
    setup_user(sync_db(), "test_user_cap", pro_balance=5, topup_balance=0)
    ctx = credit_manager.reserve_and_charge("test_user_cap", "agent_1", "deepseek-v4-pro")
    # Query pequeña (< 4000 tokens total)
    credit_manager.adjust_after_completion(ctx, tokens_in=500, tokens_out=300, cost_usd_actual=0.001)
    user = sync_db()["users"].find_one({"firebase_uid": "test_user_cap"})
    assert user["wallet"]["pro_messages_balance"] == 4  # Solo 1 cobro
    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["counted_as_messages"] == 1  # Sin extra

def test_adjust_after_completion_insufficient_for_extra(sync_db, credit_manager):
    """Si >4000 tokens pero el usuario no tiene saldo para el extra,
    se marca como outstanding sin romper."""
    setup_user(sync_db(), "test_user_broke", pro_balance=1, topup_balance=0)
    ctx = credit_manager.reserve_and_charge("test_user_broke", "agent_1", "deepseek-v4-pro")
    # Consumió el único crédito, no puede pagar extra
    credit_manager.adjust_after_completion(ctx, tokens_in=3000, tokens_out=2000, cost_usd_actual=0.01)
    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["extra_charge_outstanding"] is True
    assert tx["counted_as_messages"] == 1  # No se pudo cobrar el extra


# ---------------------------------------------------------------------------
# Task 3.6 — Plan-varied fixture verification tests
# ---------------------------------------------------------------------------


class TestPlanFixtures:
    """Verifica que el fixture del plan único tenga los balances correctos."""

    def test_free_user_fixture_has_correct_balance(self, free_user_profile):
        """Free user: 5 mensajes, plan_id='free'."""
        assert free_user_profile["subscription"]["plan_id"] == "free"
        assert free_user_profile["wallet"]["pro_messages_balance"] == 5
        assert free_user_profile["wallet"]["topup_messages_balance"] == 0


# ── 4k Token Cap Boundary Tests ────────────────────────────────


def test_4k_token_cap_triggers_extra_charge(sync_db, credit_manager):
    """>4000 tokens total → extra charge (+1 crédito más)."""
    from app.application.credit_manager import TOKEN_CAP_PER_MESSAGE

    setup_user(sync_db(), "test_cap_trigger", pro_balance=5, topup_balance=0)
    ctx = credit_manager.reserve_and_charge("test_cap_trigger", "agent_1", "deepseek-v4-pro")

    # Justo encima del cap: 4001 tokens
    credit_manager.adjust_after_completion(
        ctx, tokens_in=2000, tokens_out=2001, cost_usd_actual=0.01
    )

    user = sync_db()["users"].find_one({"firebase_uid": "test_cap_trigger"})
    assert user["wallet"]["pro_messages_balance"] == 3, (
        f"Expected 3 (5 - 1 initial - 1 extra), got {user['wallet']['pro_messages_balance']}"
    )
    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["counted_as_messages"] == 2


def test_exactly_4k_tokens_no_extra_charge(sync_db, credit_manager):
    """Exactamente 4000 tokens NO disparan el extra (>4000, estricto)."""
    setup_user(sync_db(), "test_cap_exact", pro_balance=5, topup_balance=0)
    ctx = credit_manager.reserve_and_charge("test_cap_exact", "agent_1", "deepseek-v4-pro")

    # Exactamente en el cap: 4000 tokens
    credit_manager.adjust_after_completion(
        ctx, tokens_in=2000, tokens_out=2000, cost_usd_actual=0.008
    )

    user = sync_db()["users"].find_one({"firebase_uid": "test_cap_exact"})
    assert user["wallet"]["pro_messages_balance"] == 4, (
        f"Expected 4 (only initial charge), got {user['wallet']['pro_messages_balance']}"
    )
    tx = sync_db()["credit_transactions"].find_one({"_id": ctx.tx_id})
    assert tx["counted_as_messages"] == 1
    assert tx.get("extra_charge_outstanding") is not True
