from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.orchestrator import app as orchestrator_app

router = APIRouter()

# 1. Definimos qué esperamos recibir (Schema)
class ChatRequest(BaseModel):
    query: str
    target_role: Optional[str] = None  # Si se especifica, forzar este agente

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
        print(f"📥 Request | query: {request.query[:50]}... | target_role: {request.target_role or 'Router'}")
        
        # Ejecutar el Grafo de LangGraph
        result = orchestrator_app.invoke({
            "query": request.query, 
            "messages": [],
            "target_role": request.target_role,  # Pasamos el rol objetivo al orquestador
        })
        
        return ChatResponse(
            role=result["next_agent"],
            response=result["final_response"]
        )
        
    except Exception as e:
        print(f"🔥 Error en el endpoint de chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

