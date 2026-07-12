"""Tests de juntas programadas (F3).

Sin Mongo real: se testea la función pura compute_next_run_at, el guard de
máximo 3 (mockeando la colección) y el tick del scheduler con helpers mockeados.
"""
from datetime import datetime, timezone, timedelta

import pytest
from fastapi import HTTPException

from app.application import scheduled_boards as sb


# --- compute_next_run_at ---


def test_daily_hoy_si_no_paso_la_hora():
    now = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    nxt = sb.compute_next_run_at("daily", hour_utc=10, now=now)
    assert nxt == datetime(2026, 7, 12, 10, 0, tzinfo=timezone.utc)


def test_daily_manana_si_ya_paso_la_hora():
    now = datetime(2026, 7, 12, 11, 0, tzinfo=timezone.utc)
    nxt = sb.compute_next_run_at("daily", hour_utc=10, now=now)
    assert nxt == datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)


def test_weekly_proximo_dia_de_la_semana():
    # 2026-07-12 es domingo (weekday=6). Próximo martes (weekday=1).
    now = datetime(2026, 7, 12, 9, 0, tzinfo=timezone.utc)
    nxt = sb.compute_next_run_at("weekly", hour_utc=10, weekday=1, now=now)
    assert nxt.weekday() == 1
    assert nxt == datetime(2026, 7, 14, 10, 0, tzinfo=timezone.utc)


def test_weekly_mismo_dia_pero_hora_pasada_va_a_la_semana_siguiente():
    # domingo (weekday=6), hora ya pasada → +7 días.
    now = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
    nxt = sb.compute_next_run_at("weekly", hour_utc=10, weekday=6, now=now)
    assert nxt == datetime(2026, 7, 19, 10, 0, tzinfo=timezone.utc)


def test_weekly_sin_weekday_falla():
    with pytest.raises(ValueError):
        sb.compute_next_run_at("weekly", hour_utc=10, now=datetime.now(timezone.utc))


# --- Guard de máximo 3 ---


class FakeCol:
    def __init__(self, count=0):
        self._count = count
        self.inserted = []
        self.updates = []

    async def count_documents(self, query):
        return self._count

    async def insert_one(self, doc):
        self.inserted.append(doc)

    async def update_one(self, query, update):
        self.updates.append((query, update))


async def test_guard_maximo_3(monkeypatch):
    from app.presentation.api.v1 import scheduled_boards as router_mod
    from app.presentation.api.v1.scheduled_boards import (
        create_scheduled_board,
        ScheduledBoardCreate,
    )

    col = FakeCol(count=3)
    monkeypatch.setattr(router_mod, "get_scheduled_boards_collection", lambda: col)

    body = ScheduledBoardCreate(query="Revisión semanal", cadence="daily", hour_utc=9)
    with pytest.raises(HTTPException) as exc:
        await create_scheduled_board(body, user={"firebase_uid": "u1"})
    assert exc.value.status_code == 400
    assert "3" in exc.value.detail


async def test_create_ok_calcula_next_run(monkeypatch):
    from app.presentation.api.v1 import scheduled_boards as router_mod
    from app.presentation.api.v1.scheduled_boards import (
        create_scheduled_board,
        ScheduledBoardCreate,
    )

    col = FakeCol(count=1)
    monkeypatch.setattr(router_mod, "get_scheduled_boards_collection", lambda: col)

    body = ScheduledBoardCreate(
        query="Junta", cadence="weekly", hour_utc=9, weekday=0, channel="slack",
        channel_target="#general",
    )
    resp = await create_scheduled_board(body, user={"firebase_uid": "u1"})
    assert resp.next_run_at is not None
    assert resp.channel == "slack"
    assert len(col.inserted) == 1


# --- Tick del scheduler ---


class TickCol:
    """Colección mockeada: find() async-iterable + update_one registrando."""

    def __init__(self, jobs):
        self._jobs = jobs
        self.updates = []

    def find(self, query):
        async def _gen():
            for j in self._jobs:
                yield j
        return _gen()

    async def update_one(self, query, update):
        self.updates.append((query, update))


async def test_tick_ejecuta_board_y_notifica(monkeypatch):
    now = datetime(2026, 7, 12, 10, 0, tzinfo=timezone.utc)
    job = {
        "_id": "obj1",
        "user_id": "u1",
        "query": "¿Contratamos?",
        "cadence": "daily",
        "hour_utc": 10,
        "channel": "slack",
        "channel_target": "#board",
        "enabled": True,
    }
    col = TickCol([job])
    monkeypatch.setattr(sb, "get_scheduled_boards_collection", lambda: col, raising=False)
    # get_scheduled_boards_collection se importa dentro de run_due_boards/process_job.
    import app.infrastructure.database as dbmod
    monkeypatch.setattr(dbmod, "get_scheduled_boards_collection", lambda: col)

    charged = {}

    async def fake_charge(user_id):
        charged["user"] = user_id
        return object(), object()

    ran = {}

    async def fake_run(user_id, session_id, query, board_devil):
        ran.update(user_id=user_id, query=query)
        return "Resumen ejecutivo: adelante."

    notified = {}

    async def fake_notify(job, text):
        notified.update(text=text)

    async def fake_create_session(user_id, title, **kw):
        return {"session_id": "s-new"}

    monkeypatch.setattr(sb, "_charge_board", fake_charge)
    monkeypatch.setattr(sb, "_run_board_meeting", fake_run)
    monkeypatch.setattr(sb, "_send_notification", fake_notify)
    import app.presentation.api.v1.sessions as sessions_mod
    monkeypatch.setattr(sessions_mod, "create_session_record", fake_create_session)

    processed = await sb.run_due_boards(now)
    assert processed == 1
    assert charged["user"] == "u1"
    assert ran["query"] == "¿Contratamos?"
    assert "Resumen" in notified["text"]
    # Se actualizó el job con next_run_at y last_status=ok.
    assert col.updates
    _, update = col.updates[-1]
    assert update["$set"]["last_status"] == "ok"
    assert update["$set"]["next_run_at"] == datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)


async def test_tick_sin_creditos_marca_estado_y_no_ejecuta(monkeypatch):
    from app.application.credit_manager import InsufficientCreditsError

    now = datetime(2026, 7, 12, 10, 0, tzinfo=timezone.utc)
    job = {
        "_id": "obj2",
        "user_id": "u2",
        "query": "Q",
        "cadence": "daily",
        "hour_utc": 10,
        "channel": "none",
        "channel_target": None,
        "enabled": True,
    }
    col = TickCol([job])
    import app.infrastructure.database as dbmod
    monkeypatch.setattr(dbmod, "get_scheduled_boards_collection", lambda: col)

    async def fake_charge(user_id):
        raise InsufficientCreditsError("sin saldo")

    ran = {"called": False}

    async def fake_run(*a, **k):
        ran["called"] = True
        return "x"

    monkeypatch.setattr(sb, "_charge_board", fake_charge)
    monkeypatch.setattr(sb, "_run_board_meeting", fake_run)

    status = await sb.process_job(job, now)
    assert status == "sin créditos"
    assert ran["called"] is False
    _, update = col.updates[-1]
    assert update["$set"]["last_status"] == "sin créditos"
