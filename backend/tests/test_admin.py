"""Tests del panel admin (F4: require_admin) y métricas (F5: agregación).

Sin Mongo real: require_admin se prueba con el user dict; la agregación con
una lista de transacciones materializada.
"""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.presentation.api.v1.admin import require_admin, aggregate_credit_metrics
from app.core.config import settings


# --- F4: require_admin ---


async def test_require_admin_email_en_lista(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@sphere.es, admin@sphere.es")
    user = {"firebase_uid": "u1", "email": "Admin@Sphere.es"}  # case-insensitive
    assert await require_admin(user=user) is user


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
