"""
API CRUD de juntas programadas (F3): /me/scheduled-boards.

Máximo 3 juntas por usuario. Cada junta consume 5 créditos por ejecución.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.core.auth import get_current_user
from app.infrastructure.database import get_scheduled_boards_collection
from app.application.scheduled_boards import (
    compute_next_run_at,
    MAX_BOARDS_PER_USER,
    CADENCE_DAILY,
    CADENCE_WEEKLY,
)
from app.core.logger import api_logger as logger

router = APIRouter()

_VALID_CADENCES = {CADENCE_DAILY, CADENCE_WEEKLY}
_VALID_CHANNELS = {"whatsapp", "slack", "none"}


class ScheduledBoardCreate(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    cadence: str = Field(..., description="daily | weekly")
    hour_utc: int = Field(..., ge=0, le=23)
    weekday: Optional[int] = Field(None, ge=0, le=6, description="0=lunes..6=domingo (solo weekly)")
    channel: str = "none"
    channel_target: Optional[str] = None
    enabled: bool = True

    @model_validator(mode="after")
    def _validate(self):
        if self.cadence not in _VALID_CADENCES:
            raise ValueError("cadence debe ser daily o weekly")
        if self.cadence == CADENCE_WEEKLY and self.weekday is None:
            raise ValueError("weekly requiere weekday (0-6)")
        if self.channel not in _VALID_CHANNELS:
            raise ValueError("channel debe ser whatsapp, slack o none")
        if self.channel != "none" and not (self.channel_target or "").strip():
            raise ValueError("channel_target es obligatorio si channel no es none")
        return self


class ScheduledBoardUpdate(BaseModel):
    query: Optional[str] = Field(None, min_length=1, max_length=2000)
    cadence: Optional[str] = None
    hour_utc: Optional[int] = Field(None, ge=0, le=23)
    weekday: Optional[int] = Field(None, ge=0, le=6)
    channel: Optional[str] = None
    channel_target: Optional[str] = None
    enabled: Optional[bool] = None


class ScheduledBoardResponse(BaseModel):
    id: str
    query: str
    cadence: str
    hour_utc: int
    weekday: Optional[int] = None
    channel: str
    channel_target: Optional[str] = None
    enabled: bool
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None


def _to_response(doc: dict) -> ScheduledBoardResponse:
    return ScheduledBoardResponse(
        id=doc["id"],
        query=doc["query"],
        cadence=doc["cadence"],
        hour_utc=doc["hour_utc"],
        weekday=doc.get("weekday"),
        channel=doc.get("channel", "none"),
        channel_target=doc.get("channel_target"),
        enabled=doc.get("enabled", True),
        next_run_at=doc.get("next_run_at"),
        last_run_at=doc.get("last_run_at"),
        last_status=doc.get("last_status"),
    )


@router.get("/me/scheduled-boards", response_model=List[ScheduledBoardResponse])
async def list_scheduled_boards(user: dict = Depends(get_current_user)):
    """Lista las juntas programadas del usuario."""
    col = get_scheduled_boards_collection()
    cursor = col.find({"user_id": user["firebase_uid"]}).sort("next_run_at", 1)
    return [_to_response(doc) async for doc in cursor]


@router.post("/me/scheduled-boards", response_model=ScheduledBoardResponse)
async def create_scheduled_board(
    body: ScheduledBoardCreate,
    user: dict = Depends(get_current_user),
):
    """Crea una junta programada. Máximo 3 por usuario."""
    user_id = user["firebase_uid"]
    col = get_scheduled_boards_collection()

    count = await col.count_documents({"user_id": user_id})
    if count >= MAX_BOARDS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_BOARDS_PER_USER} juntas programadas por usuario",
        )

    next_run = compute_next_run_at(body.cadence, body.hour_utc, body.weekday)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "query": body.query,
        "cadence": body.cadence,
        "hour_utc": body.hour_utc,
        "weekday": body.weekday,
        "channel": body.channel,
        "channel_target": body.channel_target,
        "enabled": body.enabled,
        "next_run_at": next_run,
        "last_run_at": None,
        "last_status": None,
    }
    await col.insert_one(doc)
    logger.info(f"Junta programada creada para {user_id}: {doc['id']}")
    return _to_response(doc)


@router.patch("/me/scheduled-boards/{board_id}", response_model=ScheduledBoardResponse)
async def update_scheduled_board(
    board_id: str,
    body: ScheduledBoardUpdate,
    user: dict = Depends(get_current_user),
):
    """Actualiza una junta programada; recalcula next_run_at si cambia el horario."""
    import pymongo

    user_id = user["firebase_uid"]
    col = get_scheduled_boards_collection()

    current = await col.find_one({"id": board_id, "user_id": user_id})
    if not current:
        raise HTTPException(status_code=404, detail="Junta programada no encontrada")

    update = {k: v for k, v in body.model_dump(exclude_unset=True).items()}

    # Validaciones cruzadas sobre el resultado final.
    cadence = update.get("cadence", current["cadence"])
    hour_utc = update.get("hour_utc", current["hour_utc"])
    weekday = update.get("weekday", current.get("weekday"))
    channel = update.get("channel", current.get("channel", "none"))
    channel_target = update.get("channel_target", current.get("channel_target"))

    if cadence not in _VALID_CADENCES:
        raise HTTPException(status_code=400, detail="cadence debe ser daily o weekly")
    if cadence == CADENCE_WEEKLY and weekday is None:
        raise HTTPException(status_code=400, detail="weekly requiere weekday (0-6)")
    if channel not in _VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="channel inválido")
    if channel != "none" and not (channel_target or "").strip():
        raise HTTPException(status_code=400, detail="channel_target obligatorio si channel no es none")

    # Recalcular next_run si cambió cadencia/hora/día.
    if any(k in update for k in ("cadence", "hour_utc", "weekday")):
        update["next_run_at"] = compute_next_run_at(cadence, hour_utc, weekday)

    result = await col.find_one_and_update(
        {"id": board_id, "user_id": user_id},
        {"$set": update},
        return_document=pymongo.ReturnDocument.AFTER,
    )
    return _to_response(result)


@router.delete("/me/scheduled-boards/{board_id}")
async def delete_scheduled_board(
    board_id: str,
    user: dict = Depends(get_current_user),
):
    """Elimina una junta programada."""
    col = get_scheduled_boards_collection()
    result = await col.delete_one({"id": board_id, "user_id": user["firebase_uid"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Junta programada no encontrada")
    return {"status": "deleted", "id": board_id}
