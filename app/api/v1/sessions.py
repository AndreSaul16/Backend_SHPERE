"""
API de Sesiones de Chat - SPHERE Backend.
CRUD para gestionar sesiones de conversación.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.core.database import get_sessions_collection
from app.core.logger import api_logger as logger

router = APIRouter()


from enum import Enum

class SessionType(str, Enum):
    GROUP = "group"
    DIRECT = "direct"


class VisualConfig(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    color: Optional[str] = None
    theme: Optional[str] = None         # For groups: Palette name
    bubble_color: Optional[str] = None  # For direct: Specific bubble color
    secondary_color: Optional[str] = None


class ContextFile(BaseModel):
    file_id: str
    name: str
    vector_index_id: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionBase(BaseModel):
    session_id: str
    user_id: str = "default_user"
    title: str
    base_agent_id: str = "CEO"
    type: SessionType = SessionType.DIRECT
    visual_config: VisualConfig = VisualConfig()
    context_files: List[ContextFile] = []
    enabled_tools: List[str] = []
    members: List[str] = []  # List of agent IDs in the group
    created_at: datetime


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "Nueva Estrategia"
    user_id: Optional[str] = "default_user"
    base_agent_id: Optional[str] = "CEO"
    type: Optional[SessionType] = None  # Explicit type or inferred
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None


@router.post("/", response_model=SessionBase)
async def create_session(request: CreateSessionRequest):
    """Crea una nueva sala de guerra evolucionada."""
    session_id = str(uuid.uuid4())
    
    # Infer session type if not provided
    session_type = request.type
    if not session_type:
        if request.base_agent_id == "group-chat" or (request.members and len(request.members) > 1):
            session_type = SessionType.GROUP
        else:
            session_type = SessionType.DIRECT

    # Visual overrides
    visual_config = request.visual_config.model_dump() if request.visual_config else {}
    
    new_session = {
        "session_id": session_id,
        "user_id": request.user_id,
        "title": request.title,
        "base_agent_id": request.base_agent_id,
        "type": session_type,
        "visual_config": visual_config,
        "context_files": [], 
        "enabled_tools": request.enabled_tools or [],
        "members": request.members or [],
        "created_at": datetime.now(timezone.utc)
    }
    
    try:
        sessions_collection = get_sessions_collection()
        logger.info(f"Creando sesión evolucionada: {session_id} - User: {request.user_id}")
        
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


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    visual_config: Optional[VisualConfig] = None
    enabled_tools: Optional[List[str]] = None
    members: Optional[List[str]] = None


@router.patch("/{session_id}", response_model=SessionBase)
async def update_session(session_id: str, request: UpdateSessionRequest):
    """Actualiza parcialmente una sesión de chat."""
    try:
        sessions_collection = get_sessions_collection()
        logger.info(f"Actualizando sesión: {session_id}")
        
        update_data = {}
        if request.title is not None:
            update_data["title"] = request.title
        if request.visual_config is not None:
            # Usar dot-notation para actualizar solo los campos enviados
            # sin borrar los que no vienen en la petición (ej: enviar solo color
            # no debe eliminar name, avatar, etc.)
            for field, value in request.visual_config.model_dump(exclude_unset=True).items():
                update_data[f"visual_config.{field}"] = value
        if request.enabled_tools is not None:
            update_data["enabled_tools"] = request.enabled_tools
        if request.members is not None:
            update_data["members"] = request.members
            
        if not update_data:
            # No hay cambios que aplicar
            doc = await sessions_collection.find_one({"session_id": session_id})
            if not doc:
                raise HTTPException(status_code=404, detail="Sesión no encontrada")
            doc.pop("_id", None)
            return SessionBase(**doc)
            
        result = await sessions_collection.find_one_and_update(
            {"session_id": session_id},
            {"$set": update_data},
            return_document=True
        )
        
        if not result:
            logger.warning(f"Sesión no encontrada para actualizar: {session_id}")
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
            
        result.pop("_id", None)
        return SessionBase(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando sesión {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar sesión: {str(e)}")


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
