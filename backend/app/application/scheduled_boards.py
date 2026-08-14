"""
Juntas programadas (F3).

Scheduler in-process (un único worker uvicorn en Railway) que ejecuta board
meetings recurrentes: cobra créditos, corre el grafo board_v2, y notifica el
resumen por Slack/WhatsApp.

Diseño testeable:
- `compute_next_run_at` es una función pura (tests sin Mongo).
- `process_job` orquesta helpers a nivel de módulo (`_charge_board`,
  `_run_board_meeting`, `_send_notification`) para poder mockearlos.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.logger import api_logger as logger
from app.core.tool_context import set_current_user_id

# Coste de un board meeting (créditos). Reexportado para no acoplar al import path.

CADENCE_DAILY = "daily"
CADENCE_WEEKLY = "weekly"
MAX_BOARDS_PER_USER = 3
_TICK_SECONDS = 60
_SUMMARY_MAX_CHARS = 900


def compute_next_run_at(
    cadence: str,
    hour_utc: int,
    weekday: Optional[int] = None,
    now: Optional[datetime] = None,
) -> datetime:
    """Calcula la próxima ejecución en UTC.

    - daily: hoy a `hour_utc` si aún no pasó, si no mañana.
    - weekly: próximo `weekday` (0=lunes..6=domingo, como datetime.weekday())
      a `hour_utc`.
    """
    now = now or datetime.now(timezone.utc)
    candidate = now.replace(hour=hour_utc, minute=0, second=0, microsecond=0)

    if cadence == CADENCE_DAILY:
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    if cadence == CADENCE_WEEKLY:
        if weekday is None:
            raise ValueError("weekly requiere weekday")
        days_ahead = (weekday - now.weekday()) % 7
        candidate += timedelta(days=days_ahead)
        if candidate <= now:
            candidate += timedelta(days=7)
        return candidate

    raise ValueError(f"cadencia no soportada: {cadence}")


def _summarize(final_response: str) -> str:
    text = (final_response or "").strip()
    if len(text) > _SUMMARY_MAX_CHARS:
        return text[:_SUMMARY_MAX_CHARS].rstrip() + "…"
    return text or "La junta finalizó sin un resumen disponible."


async def _charge_board(user_id: str):
    """Cobra el coste del board. Devuelve (credit_manager, charge_ctx).

    Lanza InsufficientCreditsError si no hay saldo.
    """
    from app.application.credit_manager import CreditManager
    from app.core.config import settings
    from app.infrastructure.database import db

    credit_manager = CreditManager(db.get_sync_client()[settings.DB_NAME])
    charge_ctx = await credit_manager.areserve_and_charge(
        user_id, "scheduled_board", "deepseek-v4-pro", is_board=True
    )
    return credit_manager, charge_ctx


async def _safe_refund(credit_manager, charge_ctx, user_id: str, reason: str) -> None:
    """Reembolso tolerante a fallos (equivalente al de stream.py)."""
    if not (credit_manager and charge_ctx):
        return
    try:
        await credit_manager.arefund(charge_ctx, reason=reason)
        logger.info(f"♻️ Crédito de junta programada reembolsado ({reason}): {user_id}")
    except Exception as e:
        logger.error(f"Refund de junta programada falló ({reason}) para {user_id}: {e}")


def _build_board_initial_state(query: str, session_id: str, user_id: str, board_devil: bool) -> dict:
    """Estado inicial para board_v2_app (equivalente al de stream.generate_chat_events)."""
    from langchain_core.messages import HumanMessage

    return {
        "query": query,
        "messages": [HumanMessage(content=query)],
        "target_role": None,
        "user_id": user_id,
        "session_id": session_id,
        "already_charged": True,  # el scheduler ya cobró; el grafo no re-cobra
        "board_mode": True,
        "board_iteration": 0,
        "board_max_iterations": 1,
        "board_iterations_pref": None,
        "board_regenerate": False,
        "board_devil": board_devil,
        "board_agents_done": [],
    }


async def _run_board_meeting(user_id: str, session_id: str, query: str, board_devil: bool) -> str:
    """Ejecuta el grafo board_v2 y devuelve el final_response."""
    from app.application.board_v2 import board_v2_app

    thread_id = f"{user_id}:{session_id}"
    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    state = await board_v2_app.ainvoke(
        _build_board_initial_state(query, session_id, user_id, board_devil), config=config
    )
    return (state or {}).get("final_response", "") if isinstance(state, dict) else ""


async def _send_notification(job: dict, text: str) -> None:
    """Envía el resumen por el canal configurado. Tolerante a fallos.

    IMPORTANTE: debe llamarse con set_current_user_id(user_id) ya activo si el
    canal es WhatsApp (inject_credentials_into_payload lee el ContextVar).
    """
    channel = job.get("channel", "none")
    target = job.get("channel_target")
    user_id = job["user_id"]
    if channel in (None, "none") or not target:
        return
    try:
        if channel == "slack":
            from app.core.credentials import credentials_service
            from app.infrastructure.tools.clients import slack_client

            token = await credentials_service.get_token(user_id, "slack")
            if token:
                await slack_client.post_message(token, target, text)
        elif channel == "whatsapp":
            from app.infrastructure.tools.credential_injector import (
                inject_credentials_into_payload,
            )
            from app.infrastructure.tools.n8n_client import n8n_client

            payload = {"group": target, "message": text}
            payload, creds = await inject_credentials_into_payload(payload, ["whatsapp"])
            await n8n_client.call_webhook(
                "shared/whatsapp-notify", payload, user_credentials=creds
            )
    except Exception as e:
        logger.warning(f"No se pudo notificar junta programada a {user_id} ({channel}): {e}")


async def process_job(job: dict, now: Optional[datetime] = None) -> str:
    """Procesa un job due: cobra, corre el board, notifica y recalcula next_run.

    Nunca lanza: cualquier error se captura y se refleja en last_status. Devuelve
    el last_status resultante (útil para tests).
    """
    from app.infrastructure.database import get_scheduled_boards_collection

    now = now or datetime.now(timezone.utc)
    col = get_scheduled_boards_collection()
    user_id = job["user_id"]

    next_run = compute_next_run_at(
        job["cadence"], job["hour_utc"], job.get("weekday"), now
    )
    base_update = {"last_run_at": now, "next_run_at": next_run}

    # 1. Cobro de créditos.
    try:
        credit_manager, charge_ctx = await _charge_board(user_id)
    except Exception as e:
        # Sin saldo (u otro fallo de cobro): no ejecutar, avisar si hay canal.
        from app.application.credit_manager import InsufficientCreditsError

        status = "sin créditos" if isinstance(e, InsufficientCreditsError) else f"error cobro: {e}"
        await col.update_one({"_id": job["_id"]}, {"$set": {**base_update, "last_status": status}})
        if isinstance(e, InsufficientCreditsError):
            set_current_user_id(user_id)
            try:
                await _send_notification(
                    job, "No pudimos ejecutar tu junta programada: te has quedado sin créditos."
                )
            finally:
                set_current_user_id(None)
        return status

    # 2. Crear sesión + 3. ejecutar grafo + 4. notificar.
    set_current_user_id(user_id)
    status = "ok"
    try:
        from app.presentation.api.v1.sessions import create_session_record

        title = (job.get("query") or "Junta programada")[:60]
        session = await create_session_record(user_id, f"[Auto] {title}")
        session_id = session["session_id"]

        final_response = await _run_board_meeting(
            user_id, session_id, job["query"], bool(job.get("board_devil", False))
        )
        await _send_notification(job, _summarize(final_response))
    except Exception as e:
        logger.error(f"Junta programada {job.get('_id')} falló: {e}")
        await _safe_refund(credit_manager, charge_ctx, user_id, "scheduled_board_failed")
        status = f"error: {e}"
    finally:
        set_current_user_id(None)

    await col.update_one({"_id": job["_id"]}, {"$set": {**base_update, "last_status": status}})
    return status


async def run_due_boards(now: Optional[datetime] = None) -> int:
    """Busca jobs due (enabled, next_run_at<=now) y los procesa. Devuelve nº procesados."""
    from app.infrastructure.database import get_scheduled_boards_collection

    now = now or datetime.now(timezone.utc)
    col = get_scheduled_boards_collection()
    cursor = col.find({"enabled": True, "next_run_at": {"$lte": now}})
    processed = 0
    async for job in cursor:
        try:
            await process_job(job, now)
        except Exception as e:
            # process_job ya es tolerante, pero blindamos el loop igualmente.
            logger.error(f"Error no controlado procesando junta {job.get('_id')}: {e}")
        processed += 1
    return processed


async def scheduler_loop() -> None:
    """Loop in-process: cada 60s procesa las juntas due. Nunca se cae por un job."""
    logger.info("Scheduler de juntas programadas iniciado (tick 60s)")
    while True:
        try:
            await run_due_boards()
        except asyncio.CancelledError:
            logger.info("Scheduler de juntas programadas detenido")
            raise
        except Exception as e:
            logger.error(f"Error en el tick del scheduler de juntas: {e}")
        await asyncio.sleep(_TICK_SECONDS)
