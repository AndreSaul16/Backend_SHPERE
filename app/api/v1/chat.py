from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from app.core.orchestrator import app as orchestrator_app
from app.core.logger import api_logger as logger

router = APIRouter()

# 1. Definimos qué esperamos recibir (Schema)
class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=10_000)
    target_role: Optional[str] = None  # Si se especifica, forzar este agente

    @field_validator('query')
    @classmethod
    def query_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('Query cannot be blank or whitespace only')
        return v.strip()

# 2. Definimos qué vamos a responder
class ChatResponse(BaseModel):
    role: str
    response: str

@router.post("/", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Endpoint principal para hablar con SPHERE.
    - Si target_role == None: El Router decide quién responde (Junta Directiva)
    - Si target_role == "CEO/CTO/...": Forzar respuesta de ese agente (Chat Privado)
    """
    try:
        logger.info(f"📥 Request | query: {request.query[:50]}... | target_role: {request.target_role or 'Router'}")

        # Ejecutar el Grafo de LangGraph
        result = await orchestrator_app.ainvoke({
            "query": request.query,
            "messages": [],
            "target_role": request.target_role,
        })

        return ChatResponse(
            role=result["next_agent"],
            response=result["final_response"]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en el endpoint de chat: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

