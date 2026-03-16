"""
API de Agentes Personalizados - SPHERE Backend.
CRUD para gestionar agentes custom creados por el usuario.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from app.core.database import get_custom_agents_collection
from app.core.logger import api_logger as logger

router = APIRouter()


class AgentIdentity(BaseModel):
    name: str
    role: str = "specialist"
    color: str = "blue"
    avatar_style: Optional[str] = "cyberpunk"


class BrainConfig(BaseModel):
    model: str = "deepseek-r1"
    temperature: float = 0.3
    system_prompt: str


class CustomAgentCreate(BaseModel):
    owner_user_id: str = "default_user"
    is_public: bool = False
    identity: AgentIdentity
    brain_config: BrainConfig
    default_tools: List[str] = []
    knowledge_bases: List[str] = []


class CustomAgentResponse(BaseModel):
    agent_id: str
    owner_user_id: str
    is_public: bool
    identity: AgentIdentity
    brain_config: BrainConfig
    default_tools: List[str]
    knowledge_bases: List[str]
    created_at: datetime


@router.post("/", response_model=CustomAgentResponse)
async def create_custom_agent(agent_data: CustomAgentCreate):
    """Crea un nuevo agente con perfil de habilidades."""
    agent_id = str(uuid.uuid4())
    
    new_agent = {
        "agent_id": agent_id,
        "owner_user_id": agent_data.owner_user_id,
        "is_public": agent_data.is_public,
        "identity": agent_data.identity.dict(),
        "brain_config": agent_data.brain_config.dict(),
        "default_tools": agent_data.default_tools,
        "knowledge_bases": agent_data.knowledge_bases,
        "created_at": datetime.utcnow()
    }
    
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.info(f"Creando agente evolucionado: {agent_id} - '{agent_data.identity.name}'")
        
        result = await custom_agents_collection.insert_one(new_agent)
        logger.debug(f"Agente insertado con _id: {result.inserted_id}")
        
        return new_agent
        
    except Exception as e:
        logger.error(f"Error creando agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear agente: {str(e)}")


@router.get("/", response_model=List[CustomAgentResponse])
async def list_custom_agents():
    """Lista todos los agentes evolucionados."""
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.debug("Obteniendo lista de agentes evolucionados...")
        
        agents = []
        async for agent in custom_agents_collection.find().sort("created_at", -1):
            # Asegurar que el formato coincida con el modelo de respuesta
            if "_id" in agent:
                agent.pop("_id")
            agents.append(agent)
        
        logger.info(f"Devolviendo {len(agents)} agentes")
        return agents
        
    except Exception as e:
        logger.error(f"Error obteniendo agentes: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener agentes: {str(e)}")


@router.get("/{agent_id}", response_model=CustomAgentResponse)
async def get_custom_agent(agent_id: str):
    """Obtiene los detalles completos de un agente."""
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.debug(f"Buscando agente evolucionado: {agent_id}")
        
        agent = await custom_agents_collection.find_one({"agent_id": agent_id})
        
        if not agent:
            logger.warning(f"Agente no encontrado: {agent_id}")
            raise HTTPException(status_code=404, detail="Agente no encontrado")
        
        logger.info(f"Agente encontrado: {agent['identity']['name']}")
        
        if "_id" in agent:
            agent.pop("_id")
        return agent
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener agente: {str(e)}")


@router.delete("/{agent_id}")
async def delete_custom_agent(agent_id: str):
    """Elimina un agente personalizado."""
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.info(f"Eliminando agente: {agent_id}")
        
        result = await custom_agents_collection.delete_one({"agent_id": agent_id})
        
        if result.deleted_count == 0:
            logger.warning(f"Agente no encontrado: {agent_id}")
            raise HTTPException(status_code=404, detail="Agente no encontrado")
        
        logger.info(f"Agente {agent_id} eliminado correctamente")
        return {"status": "deleted", "agent_id": agent_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar agente: {str(e)}")
