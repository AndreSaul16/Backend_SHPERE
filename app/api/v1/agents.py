"""
API de Agentes Personalizados - SPHERE Backend.
CRUD completo para gestionar agentes custom creados por el usuario.
Incluye endpoints de templates para creación guiada.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.core.database import get_custom_agents_collection
from app.core.logger import api_logger as logger

router = APIRouter()

# --- Constantes ---
ALLOWED_MODELS = {"deepseek-chat", "deepseek-r1", "gpt-4o", "gpt-4o-mini"}


# --- Schemas ---

class AgentIdentity(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "specialist"
    color: str = "blue"
    avatar_style: Optional[str] = "cyberpunk"
    description: Optional[str] = Field(None, max_length=500)


class BrainConfig(BaseModel):
    model: str = "deepseek-chat"
    temperature: float = Field(0.3, ge=0.0, le=2.0)
    system_prompt: str = Field(..., min_length=10, max_length=10000)

    @field_validator('model')
    @classmethod
    def validate_model(cls, v):
        if v not in ALLOWED_MODELS:
            raise ValueError(f"Modelo debe ser uno de: {ALLOWED_MODELS}")
        return v


class CustomAgentCreate(BaseModel):
    owner_user_id: str = "default_user"
    is_public: bool = False
    identity: AgentIdentity
    brain_config: BrainConfig
    default_tools: List[str] = []
    knowledge_bases: List[str] = []


class CustomAgentUpdate(BaseModel):
    """Schema de actualización parcial - todos los campos opcionales."""
    identity: Optional[AgentIdentity] = None
    brain_config: Optional[BrainConfig] = None
    default_tools: Optional[List[str]] = None
    knowledge_bases: Optional[List[str]] = None
    is_public: Optional[bool] = None


class CustomAgentResponse(BaseModel):
    agent_id: str
    owner_user_id: str
    is_public: bool
    identity: AgentIdentity
    brain_config: BrainConfig
    default_tools: List[str]
    knowledge_bases: List[str]
    documents_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None


# --- Templates Endpoints (ANTES de /{agent_id} para evitar colisión) ---

@router.get("/templates")
async def list_agent_templates(category: Optional[str] = None):
    """Lista todos los templates de agentes disponibles."""
    from app.core.templates import get_all_templates, get_templates_by_category
    if category:
        return get_templates_by_category(category)
    return get_all_templates()


@router.get("/templates/{template_id}")
async def get_agent_template(template_id: str):
    """Obtiene un template específico por ID."""
    from app.core.templates import get_template_by_id
    template = get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template no encontrado")
    return template


# --- Agent CRUD ---

@router.post("/", response_model=CustomAgentResponse)
async def create_custom_agent(agent_data: CustomAgentCreate):
    """Crea un nuevo agente con perfil de habilidades."""
    agent_id = str(uuid.uuid4())

    new_agent = {
        "agent_id": agent_id,
        "owner_user_id": agent_data.owner_user_id,
        "is_public": agent_data.is_public,
        "identity": agent_data.identity.model_dump(),
        "brain_config": agent_data.brain_config.model_dump(),
        "default_tools": agent_data.default_tools,
        "knowledge_bases": agent_data.knowledge_bases,
        "documents_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }

    try:
        collection = get_custom_agents_collection()
        logger.info(f"Creando agente: {agent_id} - '{agent_data.identity.name}'")
        await collection.insert_one(new_agent)
        return new_agent
    except Exception as e:
        logger.error(f"Error creando agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear agente: {str(e)}")


@router.get("/", response_model=List[CustomAgentResponse])
async def list_custom_agents():
    """Lista todos los agentes."""
    try:
        collection = get_custom_agents_collection()
        agents = []
        async for agent in collection.find().sort("created_at", -1):
            agent.pop("_id", None)
            # Asegurar campos nuevos para docs legacy
            agent.setdefault("documents_count", 0)
            agent.setdefault("updated_at", agent.get("created_at"))
            agents.append(agent)
        return agents
    except Exception as e:
        logger.error(f"Error obteniendo agentes: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener agentes: {str(e)}")


@router.get("/{agent_id}", response_model=CustomAgentResponse)
async def get_custom_agent(agent_id: str):
    """Obtiene los detalles completos de un agente."""
    try:
        collection = get_custom_agents_collection()
        agent = await collection.find_one({"agent_id": agent_id})
        if not agent:
            raise HTTPException(status_code=404, detail="Agente no encontrado")
        agent.pop("_id", None)
        agent.setdefault("documents_count", 0)
        agent.setdefault("updated_at", agent.get("created_at"))
        return agent
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener agente: {str(e)}")


@router.patch("/{agent_id}", response_model=CustomAgentResponse)
async def update_custom_agent(agent_id: str, updates: CustomAgentUpdate):
    """Actualización parcial de un agente personalizado."""
    try:
        collection = get_custom_agents_collection()

        update_data = {"updated_at": datetime.now(timezone.utc)}

        if updates.identity is not None:
            for field, value in updates.identity.model_dump(exclude_unset=True).items():
                update_data[f"identity.{field}"] = value
        if updates.brain_config is not None:
            for field, value in updates.brain_config.model_dump(exclude_unset=True).items():
                update_data[f"brain_config.{field}"] = value
        if updates.default_tools is not None:
            update_data["default_tools"] = updates.default_tools
        if updates.knowledge_bases is not None:
            update_data["knowledge_bases"] = updates.knowledge_bases
        if updates.is_public is not None:
            update_data["is_public"] = updates.is_public

        result = await collection.find_one_and_update(
            {"agent_id": agent_id},
            {"$set": update_data},
            return_document=True
        )

        if not result:
            raise HTTPException(status_code=404, detail="Agente no encontrado")

        result.pop("_id", None)
        result.setdefault("documents_count", 0)
        logger.info(f"Agente {agent_id} actualizado")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando agente {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar agente: {str(e)}")


@router.delete("/{agent_id}")
async def delete_custom_agent(agent_id: str):
    """Elimina un agente y toda su knowledge base asociada."""
    try:
        collection = get_custom_agents_collection()
        result = await collection.delete_one({"agent_id": agent_id})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Agente no encontrado")

        # Limpiar vectores de knowledge_base asociados
        from app.core.database import db
        async_db = db.get_async_db()
        kb_del = await async_db["knowledge_base"].delete_many({"agent_target": agent_id})

        # Limpiar archivos de GridFS asociados
        try:
            from app.core.database import get_gridfs_bucket
            bucket = get_gridfs_bucket()
            async for grid_file in bucket.find({"metadata.agent_id": agent_id}):
                await bucket.delete(grid_file._id)
        except Exception:
            pass  # GridFS puede no existir aún si no se han subido archivos

        logger.info(f"Agente {agent_id} eliminado. Vectores limpiados: {kb_del.deleted_count}")
        return {"status": "deleted", "agent_id": agent_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar agente: {str(e)}")
