"""
API de Documentos por Agente - SPHERE Backend.
Upload, listado, status y eliminación de archivos para RAG personalizado.
Multi-tenant: cada usuario solo ve sus propios documentos.
"""
import hashlib
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
from pathlib import Path

from app.infrastructure.database import get_custom_agents_collection, get_gridfs_bucket, get_users_collection
from app.core.auth import get_current_user
from app.core.tenant import require_owner
from app.application.document_processor import (
    ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, MAX_FILES_PER_AGENT,
    process_document, delete_document_vectors
)
from app.core.logger import api_logger as logger
from app.core.plan_limits import get_plan_id, get_rag_quota_bytes

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
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Sube un documento a la knowledge base de un agente. Multi-tenant."""
    user_id = user["firebase_uid"]

    # 1. Verificar que el agente existe y pertenece al usuario
    agents_col = get_custom_agents_collection()
    agent = await agents_col.find_one({"agent_id": agent_id})
    require_owner(agent, user_id, "Agente")

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

    # 4. Checksum para deduplicación
    content_hash = hashlib.sha256(file_bytes).hexdigest()

    # 5. Verificar duplicado
    bucket = get_gridfs_bucket()
    existing = await bucket._files.find_one({
        "metadata.user_id": user_id,
        "metadata.agent_id": agent_id,
        "metadata.content_hash": content_hash,
    })
    if existing:
        existing_meta = existing.get("metadata", {})
        return DocumentResponse(
            file_id=str(existing["_id"]),
            filename=existing["filename"],
            file_size_bytes=existing_meta.get("file_size_bytes", 0),
            content_type=existing_meta.get("content_type", "unknown"),
            processing_status=existing_meta.get("processing_status", "completed"),
            chunks_count=existing_meta.get("chunks_count", 0),
            uploaded_at=existing_meta.get("uploaded_at", existing.get("uploadDate")),
        )

    # 6. Verificar cuota por plan (RAG storage)
    from app.core.errors import ErrorCode, rag_error
    plan_id = get_plan_id(user)
    quota_bytes = get_rag_quota_bytes(plan_id)
    total_size = 0
    async for f in bucket.find({"metadata.user_id": user_id}):
        meta = f.metadata or {}
        total_size += meta.get("file_size_bytes", 0)

    if total_size + len(file_bytes) > quota_bytes:
        quota_mb = quota_bytes // (1024 * 1024)
        raise rag_error(
            ErrorCode.RAG_QUOTA_EXCEEDED,
            413,
            f"Has alcanzado el límite de RAG de tu plan ({quota_mb} MB). Sube de plan para más espacio.",
            plan_id=plan_id,
            quota_mb=quota_mb,
            used_bytes=total_size,
        )

    # 7. Verificar límite de archivos por agente
    existing_files = []
    async for f in bucket.find({"metadata.agent_id": agent_id, "metadata.user_id": user_id}):
        existing_files.append(f)
    if len(existing_files) >= MAX_FILES_PER_AGENT:
        raise HTTPException(
            status_code=400,
            detail=f"El agente ya tiene {MAX_FILES_PER_AGENT} documentos. Elimina alguno primero."
        )

    # 8. Guardar en GridFS
    metadata = {
        "agent_id": agent_id,
        "user_id": user_id,
        "owner_user_id": user_id,
        "content_type": file.content_type or "application/octet-stream",
        "file_size_bytes": len(file_bytes),
        "content_hash": content_hash,
        "processing_status": "pending",
        "chunks_count": 0,
        "uploaded_at": datetime.now(timezone.utc),
    }

    file_id = await bucket.upload_from_stream(
        file.filename,
        file_bytes,
        metadata=metadata,
    )

    # Mantener user.limits.rag_storage_bytes_used al día (display en /billing/me).
    users_col = get_users_collection()
    await users_col.update_one(
        {"firebase_uid": user_id},
        {"$inc": {"limits.rag_storage_bytes_used": len(file_bytes)}},
    )

    logger.info(f"Archivo '{file.filename}' subido: {file_id} por user {user_id} para agente {agent_id}")

    # 9. Lanzar procesamiento en background
    background_tasks.add_task(
        process_document,
        agent_id=agent_id,
        file_id=str(file_id),
        filename=file.filename,
        file_bytes=file_bytes,
        user_id=user_id,
    )

    return DocumentResponse(
        file_id=str(file_id),
        filename=file.filename,
        file_size_bytes=len(file_bytes),
        content_type=metadata["content_type"],
        processing_status="pending",
        chunks_count=0,
        uploaded_at=metadata["uploaded_at"],
    )


@router.get("/{agent_id}/documents", response_model=DocumentListResponse)
async def list_agent_documents(
    agent_id: str,
    user: dict = Depends(get_current_user),
):
    """Lista todos los documentos de un agente (solo del usuario autenticado)."""
    user_id = user["firebase_uid"]
    bucket = get_gridfs_bucket()
    documents = []

    async for grid_file in bucket.find(
        {"metadata.agent_id": agent_id, "metadata.user_id": user_id}
    ).sort("uploadDate", -1):
        meta = grid_file.metadata or {}
        documents.append(DocumentResponse(
            file_id=str(grid_file._id),
            filename=grid_file.filename,
            file_size_bytes=meta.get("file_size_bytes", grid_file.length),
            content_type=meta.get("content_type", "unknown"),
            processing_status=meta.get("processing_status", "unknown"),
            chunks_count=meta.get("chunks_count", 0),
            uploaded_at=meta.get("uploaded_at", grid_file.upload_date),
        ))

    return DocumentListResponse(documents=documents, total_count=len(documents))


@router.get("/{agent_id}/documents/{file_id}", response_model=DocumentResponse)
async def get_document_status(
    agent_id: str,
    file_id: str,
    user: dict = Depends(get_current_user),
):
    """Obtiene el status de procesamiento de un documento."""
    user_id = user["firebase_uid"]
    from bson import ObjectId
    bucket = get_gridfs_bucket()

    grid_file = await bucket._files.find_one({"_id": ObjectId(file_id)})
    if not grid_file:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    meta = grid_file.get("metadata", {})
    if meta.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="Documento no pertenece a este agente")
    if meta.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    return DocumentResponse(
        file_id=str(grid_file["_id"]),
        filename=grid_file["filename"],
        file_size_bytes=meta.get("file_size_bytes", grid_file.get("length", 0)),
        content_type=meta.get("content_type", "unknown"),
        processing_status=meta.get("processing_status", "unknown"),
        chunks_count=meta.get("chunks_count", 0),
        uploaded_at=meta.get("uploaded_at", grid_file.get("uploadDate")),
    )


@router.delete("/{agent_id}/documents/{file_id}")
async def delete_document(
    agent_id: str,
    file_id: str,
    user: dict = Depends(get_current_user),
):
    """Elimina un documento y todos sus vectores (solo el dueño)."""
    user_id = user["firebase_uid"]
    from bson import ObjectId

    bucket = get_gridfs_bucket()

    # Verificar que existe y pertenece al usuario
    grid_file = await bucket._files.find_one({"_id": ObjectId(file_id)})
    if not grid_file:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    meta = grid_file.get("metadata", {})
    if meta.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="Documento no pertenece a este agente")
    if meta.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    # Eliminar vectores
    deleted_vectors = await delete_document_vectors(agent_id, file_id)

    # Tamaño del archivo a restar del contador del usuario
    file_size = (grid_file.get("metadata") or {}).get(
        "file_size_bytes", grid_file.get("length", 0)
    )

    # Eliminar de GridFS
    await bucket.delete(ObjectId(file_id))

    # Decrementar documents_count
    agents_col = get_custom_agents_collection()
    await agents_col.update_one(
        {"agent_id": agent_id, "owner_user_id": user_id},
        {"$inc": {"documents_count": -1}},
    )

    # Decrementar uso de RAG del usuario (clamp a 0 si por alguna razón se desfasa).
    users_col = get_users_collection()
    await users_col.update_one(
        {"firebase_uid": user_id},
        {"$inc": {"limits.rag_storage_bytes_used": -int(file_size)}},
    )
    await users_col.update_one(
        {"firebase_uid": user_id, "limits.rag_storage_bytes_used": {"$lt": 0}},
        {"$set": {"limits.rag_storage_bytes_used": 0}},
    )

    logger.info(f"Documento {file_id} eliminado por {user_id}. Vectores: {deleted_vectors}")
    return {"status": "deleted", "file_id": file_id, "vectors_deleted": deleted_vectors}
