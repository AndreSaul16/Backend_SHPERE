"""
Endpoint SSE para streaming de tokens en tiempo real.
Usa astream_events de LangGraph para capturar cada token del LLM.

ARTIFACTS 2.0 STREAMING: Implementa una máquina de estados de baja latencia
que transmite el contenido del artefacto en tiempo real (no lo bufferiza).

Eventos:
- artifact_open: Abre una tarjeta nueva en el frontend
- artifact_chunk: Envía contenido progresivamente (efecto hacker)
- artifact_close: Finaliza el artefacto y habilita descarga
"""
import json
import re
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.core.orchestrator import app as orchestrator_app
from app.core.logger import stream_logger as logger

router = APIRouter()

class StreamRequest(BaseModel):
    query: str
    session_id: str  # <--- OBLIGATORIO AHORA
    target_role: Optional[str] = None  # Para chats privados

# Regex para validar y parsear la etiqueta de apertura
OPEN_TAG_PATTERN = re.compile(r'<sphere_artifact\s+([^>]+)>')

async def generate_chat_events(query: str, session_id: str, target_role: Optional[str] = None):
    """
    Generador asíncrono que escucha los eventos del grafo 
    y envía chunks formateados para SSE.
    """
    try:
        logger.info(f"Iniciando stream para sesión: {session_id} | Query: '{query[:50]}...'")
        
        # Configuración del thread para memoria (LangGraph Checkpointer)
        config = {"configurable": {"thread_id": session_id, "checkpoint_ns": ""}}
        
        # 1. Preparar el nuevo mensaje humano
        from langchain_core.messages import HumanMessage
        new_message = HumanMessage(content=query)
        
        # 2. Estado inicial. LangGraph añadirá new_message al historial
        # gracias a Annotated[List, add_messages] en AgentState.
        initial_state = {
            "query": query, 
            "messages": [new_message],
            "target_role": target_role
        }
        
        # Variables de estado para el parser de baja latencia
        buffer = ""
        artifact_buffer = ""  # Buffer específico para contenido dentro de artefactos
        is_inside_artifact = False

        # Escuchar eventos del grafo (v1 es la API estable de eventos)
        async for event in orchestrator_app.astream_events(
            initial_state, 
            config=config, # <--- LA CLAVE DE LA MEMORIA
            version="v1"
        ):
            kind = event["event"]
            
            # --- A. DETECCIÓN DE ROL (Router) ---
            if kind == "on_chain_end" and event.get("name") == "router":
                output = event.get('data', {}).get('output')
                if output and 'next_agent' in output:
                    role = output['next_agent']
                    logger.debug(f"Router detectó agente: {role}")
                    yield f"data: {json.dumps({'type': 'meta', 'role': role})}\n\n"

            # --- B. STREAMING DE TOKENS ---
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, 'content'):
                    content = chunk.content
                    if not content:
                        continue
                    
                    # CASO A: Estamos DENTRO del artefacto
                    if is_inside_artifact:
                        artifact_buffer += content
                        
                        if "</sphere_artifact>" in artifact_buffer:
                            logger.debug(f"🔒 Cierre de artefacto detectado")
                            artifact_content, chat_residue = artifact_buffer.split("</sphere_artifact>", 1)
                            
                            if artifact_content:
                                yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': artifact_content})}\n\n"
                            
                            yield f"data: {json.dumps({'type': 'artifact_close'})}\n\n"
                            is_inside_artifact = False
                            artifact_buffer = ""
                            
                            if chat_residue:
                                yield f"data: {json.dumps({'type': 'token', 'content': chat_residue})}\n\n"
                            
                            buffer = ""
                        else:
                            close_prefixes = ["<", "</", "</s", "</sp", "</sph", "</sphe", "</spher", 
                                            "</sphere", "</sphere_", "</sphere_a", "</sphere_ar",
                                            "</sphere_art", "</sphere_arti", "</sphere_artif",
                                            "</sphere_artifa", "</sphere_artifac", "</sphere_artifact"]
                            
                            if not any(artifact_buffer.endswith(p) for p in close_prefixes):
                                if artifact_buffer:
                                    yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': artifact_buffer})}\n\n"
                                    artifact_buffer = ""
                    
                    # CASO B: Estamos FUERA
                    else:
                        buffer += content
                        if "<sphere_artifact" in buffer:
                            tag_start = buffer.find("<sphere_artifact")
                            tag_section = buffer[tag_start:]
                            if ">" in tag_section:
                                match = OPEN_TAG_PATTERN.search(buffer)
                                if match:
                                    attrs_str = match.group(1)
                                    title_match = re.search(r'title="([^"]+)"', attrs_str)
                                    type_match = re.search(r'type="([^"]+)"', attrs_str)
                                    lang_match = re.search(r'language="([^"]*)"', attrs_str)
                                    
                                    title = title_match.group(1) if title_match else "untitled"
                                    artifact_type = type_match.group(1) if type_match else "code"
                                    language = lang_match.group(1) if lang_match else ""
                                    
                                    logger.info(f"📦 Abriendo artefacto: '{title}' ({artifact_type})")
                                    
                                    pre_tag = buffer[:tag_start]
                                    if pre_tag.strip():
                                        yield f"data: {json.dumps({'type': 'token', 'content': pre_tag})}\n\n"
                                    
                                    yield f"data: {json.dumps({
                                        'type': 'artifact_open',
                                        'title': title,
                                        'artifact_type': artifact_type,
                                        'language': language
                                    })}\n\n"
                                    
                                    is_inside_artifact = True
                                    tag_end = tag_section.find(">")
                                    residue = tag_section[tag_end + 1:]
                                    if residue:
                                        yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': residue})}\n\n"
                                    
                                    buffer = ""
                        else:
                            partial_tags = ["<s", "<sp", "<sph", "<sphe", "<spher", "<sphere", "<sphere_", "<sphere_a", 
                                           "<sphere_ar", "<sphere_art", "<sphere_arti", "<sphere_artif", 
                                           "<sphere_artifa", "<sphere_artifac", "<sphere_artifact"]
                            
                            if not any(buffer.endswith(p) for p in partial_tags):
                                yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
                                buffer = ""
        
        if buffer.strip():
            yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
        
        yield "data: [DONE]\n\n"
        logger.info(f"Stream finalizado para sesión: {session_id}")
        
    except Exception as e:
        logger.error(f"🔥 Error en streaming: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

@router.post("/")
async def chat_stream_endpoint(request: StreamRequest):
    """Endpoint SSE para streaming de respuestas."""
    try:
        return StreamingResponse(
            generate_chat_events(request.query, request.session_id, request.target_role),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except Exception as e:
        logger.error(f"🔥 Error iniciando stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))
