"""
API de Sesiones de Chat - SPHERE Backend.
CRUD para gestionar sesiones de conversación.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from app.core.database import get_sessions_collection
from app.core.logger import api_logger as logger

router = APIRouter()


class SessionMetadata(BaseModel):
    override_name: Optional[str] = None
    override_avatar: Optional[str] = None
    override_color: Optional[str] = None
    override_role_label: Optional[str] = None


class SessionBase(BaseModel):
    session_id: str
    title: str
    base_agent_id: str = "CEO"
    created_at: datetime
    metadata: SessionMetadata = SessionMetadata()


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "Nueva Estrategia"
    base_agent_id: Optional[str] = "CEO"
    metadata: Optional[SessionMetadata] = None


@router.post("/", response_model=SessionBase)
async def create_session(request: CreateSessionRequest):
    """Crea una nueva sala de guerra vacía."""
    session_id = str(uuid.uuid4())
    
    new_session = {
        "session_id": session_id,
        "title": request.title,
        "base_agent_id": request.base_agent_id,
        "created_at": datetime.utcnow(),
        "metadata": request.metadata.dict() if request.metadata else {}
    }
    
    try:
        sessions_collection = get_sessions_collection()
        logger.info(f"Creando sesión: {session_id} - '{request.title}' | Base: {request.base_agent_id}")
        
        result = await sessions_collection.insert_one(new_session)
        logger.debug(f"Sesión insertada con _id: {result.inserted_id}")
        
        return new_session
        
    except Exception as e:
        logger.error(f"Error creando sesión: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear sesión: {str(e)}")


@router.get("/", response_model=List[SessionBase])
async def get_sessions():
    """Devuelve todas las sesiones ordenadas por fecha."""
    try:
        sessions_collection = get_sessions_collection()
        logger.debug("Obteniendo lista de sesiones...")
        
        cursor = sessions_collection.find().sort("created_at", -1)
        sessions = []
        
        async for doc in cursor:
            doc.pop("_id", None)
            sessions.append(SessionBase(**doc))
        
        logger.info(f"Devolviendo {len(sessions)} sesiones")
        return sessions
        
    except Exception as e:
        logger.error(f"Error obteniendo sesiones: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener sesiones: {str(e)}")


@router.get("/{session_id}/history")
async def get_session_history(session_id: str):
    """Obtiene los mensajes históricos de una sesión desde LangGraph."""
    logger.debug(f"Obteniendo historial para sesión: {session_id}")
    
    try:
        from app.core.orchestrator import app as orchestrator_app
        
        config = {"configurable": {"thread_id": session_id}}
        state = await orchestrator_app.aget_state(config)
        
        # Extraer mensajes del estado
        messages = state.values.get("messages", []) if state.values else []
        final_response = state.values.get("final_response", "") if state.values else ""
        
        logger.info(f"Historial cargado: {len(messages)} mensajes")
        
        return {
            "messages": messages,
            "final_response": final_response
        }
        
    except Exception as e:
        # Devolver respuesta vacía en lugar de crashear (para nuevas sesiones sin historial)
        logger.warning(f"No se pudo cargar historial para {session_id}: {e}")
        return {
            "messages": [],
            "final_response": ""
        }


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Elimina una sesión de chat."""
    try:
        sessions_collection = get_sessions_collection()
        logger.info(f"Eliminando sesión: {session_id}")
        
        result = await sessions_collection.delete_one({"session_id": session_id})
        
        if result.deleted_count == 0:
            logger.warning(f"Sesión no encontrada: {session_id}")
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        
        logger.info(f"Sesión {session_id} eliminada correctamente")
        return {"status": "deleted", "session_id": session_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando sesión: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar sesión: {str(e)}")
