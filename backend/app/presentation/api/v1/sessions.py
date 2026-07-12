"""
API de Sesiones de Chat - SPHERE Backend.
CRUD multi-tenant para gestionar sesiones de conversación.
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import re
import secrets
import uuid

from app.infrastructure.database import get_sessions_collection, get_custom_agents_collection
from app.core.auth import get_current_user
from app.core.tenant import (
    scoped_find,
    scoped_insert,
    scoped_update,
    scoped_delete,
    require_owner,
    scoped_find_paginated,
)
from app.core.logger import api_logger as logger

# Roles de agentes core (no custom)
CORE_AGENT_IDS = {"CEO", "CTO", "CFO", "CMO", "system", "group-chat"}

router = APIRouter()


from enum import Enum


class SessionType(str, Enum):
    GROUP = "group"
    DIRECT = "direct"


class VisualConfig(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    color: Optional[str] = None
    theme: Optional[str] = None
    bubble_color: Optional[str] = None
    secondary_color: Optional[str] = None


class ContextFile(BaseModel):
    file_id: str
    name: str
    vector_index_id: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionBase(BaseModel):
    session_id: str
    user_id: str
    title: str
    base_agent_id: str = "CEO"
    agent_ref_type: str = "core"
    type: SessionType = SessionType.DIRECT
    visual_config: VisualConfig = VisualConfig()
    context_files: List[ContextFile] = []
    enabled_tools: List[str] = []
    members: List[str] = []
    created_at: datetime
    share_token: Optional[str] = None


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "Nueva Estrategia"
    base_agent_id: Optional[str] = "CEO"
    agent_ref_type: Optional[str] = None
    type: Optional[SessionType] = None
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None


@router.post("/", response_model=SessionBase)
async def create_session(
    request: CreateSessionRequest,
    user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Crea una nueva sesión. Multi-tenant: el user_id se obtiene del JWT.

    Atomicidad:
    - Con replica set / Atlas: la inserción de session + idempotency_key se hace
      dentro de una transacción Mongo.
    - Con Mongo standalone (dev): se cae a inserción secuencial con rollback manual
      si el segundo paso falla.
    """
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    # Idempotency check (read previo — siempre, incluso con transacción)
    if idempotency_key:
        from app.infrastructure.database import get_idempotency_keys_collection

        idem_col = get_idempotency_keys_collection()
        existing = await idem_col.find_one(
            {"user_id": user_id, "idempotency_key": idempotency_key}
        )
        if existing:
            session = await sessions_collection.find_one(
                {"session_id": existing["session_id"]}
            )
            if session:
                session.pop("_id", None)
                return SessionBase(**session)

    session_id = str(uuid.uuid4())

    # Infer session type
    session_type = request.type
    if not session_type:
        if request.base_agent_id == "group-chat" or (
            request.members and len(request.members) > 1
        ):
            session_type = SessionType.GROUP
        else:
            session_type = SessionType.DIRECT

    # Auto-detect agent_ref_type
    agent_ref_type = request.agent_ref_type
    if not agent_ref_type:
        agent_ref_type = "core" if request.base_agent_id in CORE_AGENT_IDS else "custom"

    visual_config = request.visual_config.model_dump() if request.visual_config else {}

    new_session = {
        "session_id": session_id,
        "user_id": user_id,
        "title": request.title,
        "base_agent_id": request.base_agent_id,
        "agent_ref_type": agent_ref_type,
        "type": session_type,
        "visual_config": visual_config,
        "context_files": [],
        "enabled_tools": request.enabled_tools or [],
        "members": request.members or [],
        "created_at": datetime.now(timezone.utc),
    }

    logger.info(f"Creando sesión: {session_id} - User: {user_id}")

    try:
        await _atomic_create_session_with_idem(
            sessions_collection, user_id, new_session, idempotency_key
        )
        new_session.pop("_id", None)
        return SessionBase(**new_session)

    except Exception as e:
        logger.error(f"Error creando sesión: {e}")
        raise HTTPException(status_code=500, detail="Error al crear sesión")


async def _atomic_create_session_with_idem(
    sessions_collection,
    user_id: str,
    new_session: dict,
    idempotency_key: Optional[str],
):
    """
    Inserta la sesión (+ idempotency key si aplica) atómicamente.

    Intenta con transacción Mongo (requiere replica set). Si no está disponible
    (standalone dev), hace inserción secuencial con rollback manual.
    """
    from app.infrastructure.database import db as sphere_db, get_idempotency_keys_collection
    from pymongo.errors import OperationFailure, PyMongoError

    idem_col = get_idempotency_keys_collection() if idempotency_key else None
    idem_doc = (
        {
            "user_id": user_id,
            "idempotency_key": idempotency_key,
            "session_id": new_session["session_id"],
            "created_at": datetime.now(timezone.utc),
        }
        if idempotency_key
        else None
    )

    # Intentar transacción (Atlas / replica set)
    async_client = sphere_db.client
    if async_client is not None:
        try:
            async with await async_client.start_session() as mongo_session:
                async with mongo_session.start_transaction():
                    await sessions_collection.insert_one(
                        new_session, session=mongo_session
                    )
                    if idem_doc is not None:
                        await idem_col.update_one(
                            {"user_id": user_id, "idempotency_key": idempotency_key},
                            {"$set": idem_doc},
                            upsert=True,
                            session=mongo_session,
                        )
            return
        except OperationFailure as e:
            # Transactions not supported → caer a fallback
            msg = str(e).lower()
            if "transaction" in msg or "replica" in msg or "standalone" in msg:
                logger.warning(
                    "Mongo no soporta transacciones (standalone). "
                    "Usando inserción secuencial con rollback manual."
                )
            else:
                raise

    # Fallback: insertar session, luego idem. Si idem falla, borrar session.
    await sessions_collection.insert_one(new_session)
    if idem_doc is not None:
        try:
            await idem_col.update_one(
                {"user_id": user_id, "idempotency_key": idempotency_key},
                {"$set": idem_doc},
                upsert=True,
            )
        except PyMongoError:
            # Rollback manual de la session
            await sessions_collection.delete_one(
                {"session_id": new_session["session_id"]}
            )
            raise


async def create_session_record(
    user_id: str,
    title: str,
    *,
    session_type: SessionType = SessionType.GROUP,
    base_agent_id: str = "group-chat",
    members: Optional[List[str]] = None,
) -> dict:
    """Crea e inserta una sesión (sin idempotency key).

    Reutilizable desde procesos server-side (p. ej. el scheduler de juntas
    programadas), donde no hay request HTTP ni Idempotency-Key.
    """
    session_id = str(uuid.uuid4())
    agent_ref_type = "core" if base_agent_id in CORE_AGENT_IDS else "custom"
    doc = {
        "session_id": session_id,
        "user_id": user_id,
        "title": title,
        "base_agent_id": base_agent_id,
        "agent_ref_type": agent_ref_type,
        "type": session_type,
        "visual_config": {},
        "context_files": [],
        "enabled_tools": [],
        "members": members or [],
        "created_at": datetime.now(timezone.utc),
    }
    await get_sessions_collection().insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/", response_model=List[SessionBase])
async def get_sessions(
    user: dict = Depends(get_current_user),
    limit: int = 50,
):
    """Devuelve las sesiones del usuario autenticado, paginadas."""
    try:
        sessions_collection = get_sessions_collection()
        user_id = user["firebase_uid"]
        logger.debug(f"Obteniendo sesiones para user: {user_id}")

        cursor = scoped_find(sessions_collection, user_id)
        cursor = cursor.sort("created_at", -1).limit(min(limit, 200))
        sessions = []

        async for doc in cursor:
            doc.pop("_id", None)
            sessions.append(SessionBase(**doc))

        logger.info(f"Devolviendo {len(sessions)} sesiones para user {user_id}")
        return sessions

    except Exception as e:
        logger.error(f"Error obteniendo sesiones: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener sesiones")


async def _load_session_messages(user_id: str, session_id: str):
    """Recupera (messages, final_response) de LangGraph para una sesión.

    Lógica compartida entre el historial autenticado y el share público:
    el checkpointer indexa por thread_id multi-tenant `user_id:session_id`.
    """
    from app.application.orchestrator import app as orchestrator_app

    thread_id = f"{user_id}:{session_id}"
    config = {"configurable": {"thread_id": thread_id}}
    state = await orchestrator_app.aget_state(config)

    messages = state.values.get("messages", []) if state.values else []
    final_response = state.values.get("final_response", "") if state.values else ""
    return messages, final_response


@router.get("/{session_id}/history")
async def get_session_history(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Obtiene los mensajes históricos de una sesión desde LangGraph."""
    user_id = user["firebase_uid"]
    logger.debug(f"Obteniendo historial para sesión: {session_id}")

    try:
        sessions_collection = get_sessions_collection()
        session_doc = await sessions_collection.find_one({"session_id": session_id})
        require_owner(session_doc, user_id, "Sesión")

        warning = None
        if session_doc.get("agent_ref_type") == "custom":
            agent_id = session_doc.get("base_agent_id")
            agents_col = get_custom_agents_collection()
            agent = await agents_col.find_one({"agent_id": agent_id})
            if not agent:
                warning = "agent_deleted"

        messages, final_response = await _load_session_messages(user_id, session_id)

        logger.info(f"Historial cargado: {len(messages)} mensajes")

        result = {"messages": messages, "final_response": final_response}
        if warning:
            result["warning"] = warning
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"No se pudo cargar historial para {session_id}: {e}")
        return {"messages": [], "final_response": ""}


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None
    folder: Optional[str] = None
    tags: Optional[List[str]] = None


@router.patch("/{session_id}", response_model=SessionBase)
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    user: dict = Depends(get_current_user),
):
    """Actualiza parcialmente una sesión de chat."""
    user_id = user["firebase_uid"]
    try:
        sessions_collection = get_sessions_collection()

        # Verificar ownership
        session_doc = await sessions_collection.find_one({"session_id": session_id})
        require_owner(session_doc, user_id, "Sesión")

        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.visual_config is not None:
            for field, value in request.visual_config.model_dump(
                exclude_unset=True
            ).items():
                update_data[f"visual_config.{field}"] = value
        if request.enabled_tools is not None:
            update_data["enabled_tools"] = request.enabled_tools
        if request.members is not None:
            update_data["members"] = request.members
        if request.folder is not None:
            update_data["folder"] = request.folder
        if request.tags is not None:
            update_data["tags"] = request.tags

        if not update_data:
            session_doc.pop("_id", None)
            return SessionBase(**session_doc)

        result = await sessions_collection.find_one_and_update(
            {"session_id": session_id, "user_id": user_id},
            {"$set": update_data},
            return_document=True,
        )

        if not result:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")

        result.pop("_id", None)
        return SessionBase(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando sesión {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar sesión")


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Elimina una sesión de chat y limpia sus checkpoints de LangGraph."""
    user_id = user["firebase_uid"]
    try:
        sessions_collection = get_sessions_collection()

        # Verificar ownership
        session_doc = await sessions_collection.find_one({"session_id": session_id})
        require_owner(session_doc, user_id, "Sesión")

        result = await sessions_collection.delete_one(
            {"session_id": session_id, "user_id": user_id}
        )

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")

        # Limpiar checkpoints multi-tenant
        from app.infrastructure.database import db

        async_db = db.get_async_db()
        thread_id = f"{user_id}:{session_id}"
        checkpoints_del = await async_db["checkpoints"].delete_many(
            {"thread_id": thread_id}
        )
        writes_del = await async_db["checkpoint_writes"].delete_many(
            {"thread_id": thread_id}
        )
        logger.info(
            f"Sesión {session_id} eliminada. "
            f"Checkpoints: {checkpoints_del.deleted_count}, writes: {writes_del.deleted_count}"
        )

        return {"status": "deleted", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando sesión: {e}")
        raise HTTPException(status_code=500, detail="Error al eliminar sesión")


# --- COMPARTIR SESIÓN (público read-only) ---

# Solo estos roles de additional_kwargs se exponen en el share público. Nada de
# user_id, emails ni payloads de herramientas.
_SHARE_ALLOWED_KWARGS = ("agent_role", "board_vote")
_ARTIFACT_OPEN_RE = re.compile(r"<sphere_artifact\b[^>]*>", re.IGNORECASE)
_ARTIFACT_CLOSE_RE = re.compile(r"</sphere_artifact>", re.IGNORECASE)


def _sanitize_shared_messages(messages: list) -> list:
    """Reduce los mensajes de LangGraph a lo mínimo público y seguro.

    - Solo mensajes human/ai (los tool traen payloads sensibles → se descartan).
    - Se conserva role + content + agent_role/board_vote; nunca additional_kwargs
      completo (contiene tokens, timestamps internos, tool_calls, etc.).
    - Se quitan las etiquetas <sphere_artifact> dejando el contenido interno.
    """
    sanitized = []
    for m in messages:
        # Los mensajes pueden ser objetos BaseMessage o dicts (según serialización).
        if isinstance(m, dict):
            mtype = m.get("type")
            content = m.get("content") or ""
            kwargs = m.get("additional_kwargs") or {}
        else:
            mtype = getattr(m, "type", None)
            content = getattr(m, "content", "") or ""
            kwargs = getattr(m, "additional_kwargs", {}) or {}

        if mtype not in ("human", "ai"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue

        content = _ARTIFACT_OPEN_RE.sub("", content)
        content = _ARTIFACT_CLOSE_RE.sub("", content)

        item = {"role": "user" if mtype == "human" else "assistant", "content": content}
        for key in _SHARE_ALLOWED_KWARGS:
            if kwargs.get(key) is not None:
                item[key] = kwargs[key]
        sanitized.append(item)
    return sanitized


@router.post("/{session_id}/share")
async def share_session(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Genera (o reutiliza) un token público read-only para la sesión."""
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    session_doc = await sessions_collection.find_one({"session_id": session_id})
    require_owner(session_doc, user_id, "Sesión")

    token = session_doc.get("share_token")
    if not token:
        token = secrets.token_urlsafe(24)
        await sessions_collection.update_one(
            {"session_id": session_id, "user_id": user_id},
            {"$set": {"share_token": token, "shared_at": datetime.now(timezone.utc)}},
        )
    return {"share_token": token}


@router.delete("/{session_id}/share")
async def unshare_session(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Revoca el enlace público de la sesión."""
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    session_doc = await sessions_collection.find_one({"session_id": session_id})
    require_owner(session_doc, user_id, "Sesión")

    await sessions_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$unset": {"share_token": "", "shared_at": ""}},
    )
    return {"status": "unshared"}


@router.get("/share/{token}")
async def get_shared_session(token: str):
    """Vista pública (sin auth) de una conversación compartida.

    Rate-limit ligero por token para no exponer un endpoint sin auth a abuso.
    """
    from app.core.rate_limit import chat_rate_limiter

    if not chat_rate_limiter.try_acquire(f"share:{token}", times=30, seconds=60):
        raise HTTPException(status_code=429, detail="Demasiadas peticiones")

    sessions_collection = get_sessions_collection()
    session_doc = await sessions_collection.find_one({"share_token": token})
    if not session_doc:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    try:
        messages, _ = await _load_session_messages(
            session_doc["user_id"], session_doc["session_id"]
        )
    except Exception as e:
        logger.warning(f"No se pudo cargar historial compartido {token}: {e}")
        messages = []

    return {
        "title": session_doc.get("title", "Conversación"),
        "messages": _sanitize_shared_messages(messages),
    }


# --- PINS ---


class PinRequest(BaseModel):
    message_id: str


@router.post("/{session_id}/pins")
async def pin_message(
    session_id: str,
    request: PinRequest,
    user: dict = Depends(get_current_user),
):
    """Pinea un mensaje en una sesión."""
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    session_doc = await sessions_collection.find_one({"session_id": session_id})
    require_owner(session_doc, user_id, "Sesión")

    result = await sessions_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$addToSet": {"pinned_messages": request.message_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return {"status": "pinned", "message_id": request.message_id}


@router.delete("/{session_id}/pins/{message_id}")
async def unpin_message(
    session_id: str,
    message_id: str,
    user: dict = Depends(get_current_user),
):
    """Despinea un mensaje."""
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    result = await sessions_collection.update_one(
        {"session_id": session_id, "user_id": user_id},
        {"$pull": {"pinned_messages": message_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return {"status": "unpinned", "message_id": message_id}


@router.get("/{session_id}/pins")
async def get_pins(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Lista los mensajes pineados de una sesión."""
    user_id = user["firebase_uid"]
    sessions_collection = get_sessions_collection()

    doc = await sessions_collection.find_one(
        {"session_id": session_id, "user_id": user_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return {"pinned_messages": doc.get("pinned_messages", [])}


# --- RATINGS ---


class RatingRequest(BaseModel):
    message_id: str
    rating: str
    feedback: Optional[str] = None


@router.post("/{session_id}/ratings")
async def rate_message(
    session_id: str,
    request: RatingRequest,
    user: dict = Depends(get_current_user),
):
    """Registra un rating (thumbs up/down) para un mensaje."""
    user_id = user["firebase_uid"]
    from app.infrastructure.database import db

    ratings_col = db.get_async_db()["message_ratings"]

    # Verificar que la sesión pertenece al usuario
    sessions_collection = get_sessions_collection()
    session_doc = await sessions_collection.find_one({"session_id": session_id})
    require_owner(session_doc, user_id, "Sesión")

    rating_doc = {
        "session_id": session_id,
        "message_id": request.message_id,
        "user_id": user_id,
        "rating": request.rating,
        "feedback": request.feedback,
        "created_at": datetime.now(timezone.utc),
    }

    await ratings_col.update_one(
        {
            "session_id": session_id,
            "message_id": request.message_id,
            "user_id": user_id,
        },
        {"$set": rating_doc},
        upsert=True,
    )

    return {
        "status": "rated",
        "message_id": request.message_id,
        "rating": request.rating,
    }
