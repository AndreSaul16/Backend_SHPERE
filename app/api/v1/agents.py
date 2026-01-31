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


class CustomAgentCreate(BaseModel):
    name: str
    description: str
    system_prompt: str
    role: str = "specialist"
    color: str = "blue"


class CustomAgentResponse(BaseModel):
    agent_id: str
    name: str
    description: str
    role: str
    color: str
    created_at: datetime


@router.post("/", response_model=CustomAgentResponse)
async def create_custom_agent(agent_data: CustomAgentCreate):
    """Crea un nuevo agente personalizado."""
    agent_id = str(uuid.uuid4())
    
    new_agent = {
        "agent_id": agent_id,
        "name": agent_data.name,
        "description": agent_data.description,
        "system_prompt": agent_data.system_prompt,
        "role": agent_data.role,
        "color": agent_data.color,
        "created_at": datetime.utcnow()
    }
    
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.info(f"Creando agente: {agent_id} - '{agent_data.name}'")
        
        result = await custom_agents_collection.insert_one(new_agent)
        logger.debug(f"Agente insertado con _id: {result.inserted_id}")
        
        return new_agent
        
    except Exception as e:
        logger.error(f"Error creando agente: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear agente: {str(e)}")


@router.get("/", response_model=List[CustomAgentResponse])
async def list_custom_agents():
    """Lista todos los agentes personalizados creados por el usuario."""
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.debug("Obteniendo lista de agentes...")
        
        agents = []
        async for agent in custom_agents_collection.find().sort("created_at", -1):
            agents.append(agent)
        
        logger.info(f"Devolviendo {len(agents)} agentes")
        return agents
        
    except Exception as e:
        logger.error(f"Error obteniendo agentes: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener agentes: {str(e)}")


@router.get("/{agent_id}")
async def get_custom_agent(agent_id: str):
    """Obtiene los detalles de un agente personalizado (incluyendo el prompt)."""
    try:
        custom_agents_collection = get_custom_agents_collection()
        logger.debug(f"Buscando agente: {agent_id}")
        
        agent = await custom_agents_collection.find_one({"agent_id": agent_id})
        
        if not agent:
            logger.warning(f"Agente no encontrado: {agent_id}")
            raise HTTPException(status_code=404, detail="Agente no encontrado")
        
        logger.info(f"Agente encontrado: {agent['name']}")
        
        return {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "description": agent["description"],
            "system_prompt": agent["system_prompt"],
            "role": agent.get("role", "specialist"),
            "color": agent.get("color", "blue"),
            "created_at": agent["created_at"]
        }
        
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
