"""
API de Documentos por Agente - SPHERE Backend.
Upload, listado, status y eliminación de archivos para RAG personalizado.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
from pathlib import Path

from app.core.database import get_custom_agents_collection, get_gridfs_bucket
from app.core.document_processor import (
    ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, MAX_FILES_PER_AGENT,
    process_document, delete_document_vectors
)
from app.core.logger import api_logger as logger

router = APIRouter()


# --- Schemas ---

class DocumentResponse(BaseModel):
    file_id: str
    filename: str
    file_size_bytes: int
    content_type: str
    processing_status: str
    chunks_count: int
    uploaded_at: datetime


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total_count: int


# --- Endpoints ---

@router.post("/{agent_id}/documents", response_model=DocumentResponse)
async def upload_document(
    agent_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """Sube un documento a la knowledge base de un agente."""
    # 1. Verificar que el agente existe
    agents_col = get_custom_agents_collection()
    agent = await agents_col.find_one({"agent_id": agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    # 2. Validar extensión
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo {ext} no soportado. Permitidos: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 3. Leer contenido y validar tamaño
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Archivo muy grande. Máximo: {MAX_FILE_SIZE_MB}MB")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    # 4. Verificar límite de archivos por agente
    bucket = get_gridfs_bucket()
    existing_files = []
    async for f in bucket.find({"metadata.agent_id": agent_id}):
        existing_files.append(f)
    if len(existing_files) >= MAX_FILES_PER_AGENT:
        raise HTTPException(
            status_code=400,
            detail=f"El agente ya tiene {MAX_FILES_PER_AGENT} documentos. Elimina alguno primero."
        )

    # 5. Guardar en GridFS
    metadata = {
        "agent_id": agent_id,
        "owner_user_id": "default_user",
        "content_type": file.content_type or "application/octet-stream",
        "file_size_bytes": len(file_bytes),
        "processing_status": "pending",
        "chunks_count": 0,
        "uploaded_at": datetime.now(timezone.utc)
    }

    file_id = await bucket.upload_from_stream(
        file.filename,
        file_bytes,
        metadata=metadata
    )

    logger.info(f"Archivo '{file.filename}' subido a GridFS: {file_id} para agente {agent_id}")

    # 6. Lanzar procesamiento en background
    background_tasks.add_task(
        process_document,
        agent_id=agent_id,
        file_id=str(file_id),
        filename=file.filename,
        file_bytes=file_bytes,
    )

    return DocumentResponse(
        file_id=str(file_id),
        filename=file.filename,
        file_size_bytes=len(file_bytes),
        content_type=metadata["content_type"],
        processing_status="pending",
        chunks_count=0,
        uploaded_at=metadata["uploaded_at"]
    )


@router.get("/{agent_id}/documents", response_model=DocumentListResponse)
async def list_agent_documents(agent_id: str):
    """Lista todos los documentos de un agente."""
    bucket = get_gridfs_bucket()
    documents = []

    async for grid_file in bucket.find({"metadata.agent_id": agent_id}).sort("uploadDate", -1):
        meta = grid_file.metadata or {}
        documents.append(DocumentResponse(
            file_id=str(grid_file._id),
            filename=grid_file.filename,
            file_size_bytes=meta.get("file_size_bytes", grid_file.length),
            content_type=meta.get("content_type", "unknown"),
            processing_status=meta.get("processing_status", "unknown"),
            chunks_count=meta.get("chunks_count", 0),
            uploaded_at=meta.get("uploaded_at", grid_file.upload_date)
        ))

    return DocumentListResponse(documents=documents, total_count=len(documents))


@router.get("/{agent_id}/documents/{file_id}", response_model=DocumentResponse)
async def get_document_status(agent_id: str, file_id: str):
    """Obtiene el status de procesamiento de un documento (para polling)."""
    from bson import ObjectId
    bucket = get_gridfs_bucket()

    grid_file = await bucket._files.find_one({"_id": ObjectId(file_id)})
    if not grid_file:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    meta = grid_file.get("metadata", {})
    if meta.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="Documento no pertenece a este agente")

    return DocumentResponse(
        file_id=str(grid_file["_id"]),
        filename=grid_file["filename"],
        file_size_bytes=meta.get("file_size_bytes", grid_file.get("length", 0)),
        content_type=meta.get("content_type", "unknown"),
        processing_status=meta.get("processing_status", "unknown"),
        chunks_count=meta.get("chunks_count", 0),
        uploaded_at=meta.get("uploaded_at", grid_file.get("uploadDate"))
    )


@router.delete("/{agent_id}/documents/{file_id}")
async def delete_document(agent_id: str, file_id: str):
    """Elimina un documento y todos sus vectores."""
    from bson import ObjectId

    bucket = get_gridfs_bucket()

    # Verificar que existe y pertenece al agente
    grid_file = await bucket._files.find_one({"_id": ObjectId(file_id)})
    if not grid_file:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    meta = grid_file.get("metadata", {})
    if meta.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="Documento no pertenece a este agente")

    # Eliminar vectores
    deleted_vectors = await delete_document_vectors(agent_id, file_id)

    # Eliminar de GridFS
    await bucket.delete(ObjectId(file_id))

    # Decrementar documents_count
    agents_col = get_custom_agents_collection()
    await agents_col.update_one(
        {"agent_id": agent_id},
        {"$inc": {"documents_count": -1}}
    )

    logger.info(f"Documento {file_id} eliminado. Vectores: {deleted_vectors}")
    return {"status": "deleted", "file_id": file_id, "vectors_deleted": deleted_vectors}
