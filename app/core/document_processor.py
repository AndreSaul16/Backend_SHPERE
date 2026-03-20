"""
Pipeline de procesamiento de documentos para RAG personalizado.
Parse → Chunk → Embed → Store en knowledge_base.
"""
import os
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import List
from datetime import datetime, timezone

from app.core.logger import api_logger as logger

# --- Constantes ---
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
MAX_FILE_SIZE_MB = 20
MAX_FILES_PER_AGENT = 10
CHUNK_SIZE_TOKENS = 512
CHUNK_OVERLAP_TOKENS = 64


@dataclass
class DocumentChunk:
    content: str
    chunk_index: int
    source_file: str
    token_count: int


# --- PARSING ---

def parse_pdf(file_bytes: bytes) -> str:
    """Extrae texto de PDF usando pymupdf (fitz)."""
    import fitz
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n\n".join(text_parts)


def parse_docx(file_bytes: bytes) -> str:
    """Extrae texto de DOCX usando python-docx."""
    import io
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


def parse_text(file_bytes: bytes) -> str:
    """Decodifica bytes como UTF-8. Para TXT y MD."""
    return file_bytes.decode("utf-8", errors="replace")


def parse_document(file_bytes: bytes, filename: str) -> str:
    """Router: detecta extensión y delega al parser correcto."""
    ext = Path(filename).suffix.lower()
    parsers = {
        ".pdf": parse_pdf,
        ".docx": parse_docx,
        ".txt": parse_text,
        ".md": parse_text,
    }
    parser = parsers.get(ext)
    if not parser:
        raise ValueError(f"Extensión no soportada: {ext}")
    return parser(file_bytes)


# --- CHUNKING ---

def chunk_text(
    text: str,
    source_filename: str,
    chunk_size: int = CHUNK_SIZE_TOKENS,
    overlap: int = CHUNK_OVERLAP_TOKENS,
) -> List[DocumentChunk]:
    """Chunking con tiktoken (cl100k_base). Divide en párrafos y agrupa."""
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")

    # Dividir en párrafos
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    chunks: List[DocumentChunk] = []
    current_tokens: List[int] = []
    current_texts: List[str] = []
    chunk_index = 0

    for para in paragraphs:
        para_tokens = enc.encode(para)

        # Si un solo párrafo excede chunk_size, dividirlo por tokens
        if len(para_tokens) > chunk_size:
            # Flush current buffer first
            if current_tokens:
                chunks.append(DocumentChunk(
                    content="\n".join(current_texts),
                    chunk_index=chunk_index,
                    source_file=source_filename,
                    token_count=len(current_tokens)
                ))
                chunk_index += 1
                # Overlap: mantener últimos N tokens
                if overlap > 0 and len(current_tokens) > overlap:
                    overlap_text = enc.decode(current_tokens[-overlap:])
                    current_tokens = current_tokens[-overlap:]
                    current_texts = [overlap_text]
                else:
                    current_tokens = []
                    current_texts = []

            # Dividir párrafo largo en sub-chunks
            for i in range(0, len(para_tokens), chunk_size - overlap):
                sub_tokens = para_tokens[i:i + chunk_size]
                chunks.append(DocumentChunk(
                    content=enc.decode(sub_tokens),
                    chunk_index=chunk_index,
                    source_file=source_filename,
                    token_count=len(sub_tokens)
                ))
                chunk_index += 1
            current_tokens = []
            current_texts = []
            continue

        # Si añadir el párrafo excede el límite, flush
        if len(current_tokens) + len(para_tokens) > chunk_size:
            chunks.append(DocumentChunk(
                content="\n".join(current_texts),
                chunk_index=chunk_index,
                source_file=source_filename,
                token_count=len(current_tokens)
            ))
            chunk_index += 1
            # Overlap
            if overlap > 0 and len(current_tokens) > overlap:
                overlap_text = enc.decode(current_tokens[-overlap:])
                current_tokens = current_tokens[-overlap:]
                current_texts = [overlap_text]
            else:
                current_tokens = []
                current_texts = []

        current_tokens.extend(para_tokens)
        current_texts.append(para)

    # Flush remaining
    if current_tokens:
        chunks.append(DocumentChunk(
            content="\n".join(current_texts),
            chunk_index=chunk_index,
            source_file=source_filename,
            token_count=len(current_tokens)
        ))

    return chunks


# --- EMBEDDING ---

def embed_chunks_sync(chunks: List[DocumentChunk]) -> List[List[float]]:
    """Batch embedding con OpenAI text-embedding-3-small. Síncrono (para thread executor)."""
    from openai import OpenAI

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    embeddings = []
    batch_size = 20

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [c.content for c in batch]
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        for item in response.data:
            embeddings.append(item.embedding)

    return embeddings


# --- STORAGE ---

async def store_document_vectors(
    agent_id: str,
    file_id: str,
    filename: str,
    chunks: List[DocumentChunk],
    embeddings: List[List[float]],
) -> int:
    """Guarda chunks embebidos en knowledge_base con agent_target = agent_id."""
    from app.core.database import db
    collection = db.get_async_db()["knowledge_base"]

    docs = []
    for chunk, embedding in zip(chunks, embeddings):
        docs.append({
            "embedding": embedding,
            "agent_target": agent_id,
            "source_file_id": file_id,
            "source_filename": filename,
            "chunk_index": chunk.chunk_index,
            "title": f"{filename} (chunk {chunk.chunk_index})",
            "content_markdown": chunk.content,
            "token_count": chunk.token_count,
            "created_at": datetime.now(timezone.utc)
        })

    if docs:
        await collection.insert_many(docs)

    return len(docs)


# --- PIPELINE COMPLETO ---

async def process_document(
    agent_id: str,
    file_id: str,
    filename: str,
    file_bytes: bytes,
) -> dict:
    """Pipeline completo: parse → chunk → embed → store."""
    try:
        logger.info(f"Procesando documento: {filename} para agente {agent_id}")

        # 1. Parse
        text = parse_document(file_bytes, filename)
        if not text.strip():
            return {"status": "failed", "error": "Documento vacío o no se pudo extraer texto"}

        # 2. Chunk
        chunks = chunk_text(text, filename)
        logger.info(f"Documento dividido en {len(chunks)} chunks")

        # 3. Embed (en thread executor para no bloquear event loop)
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(None, embed_chunks_sync, chunks)

        # 4. Store
        stored = await store_document_vectors(agent_id, file_id, filename, chunks, embeddings)

        # 5. Actualizar metadata en GridFS
        from app.core.database import get_gridfs_bucket
        from bson import ObjectId
        bucket = get_gridfs_bucket()
        await bucket._files.update_one(
            {"_id": ObjectId(file_id)},
            {"$set": {
                "metadata.processing_status": "completed",
                "metadata.chunks_count": stored
            }}
        )

        # 6. Actualizar documents_count en el agente
        from app.core.database import get_custom_agents_collection
        agents_col = get_custom_agents_collection()
        await agents_col.update_one(
            {"agent_id": agent_id},
            {"$inc": {"documents_count": 1}}
        )

        logger.info(f"Documento {filename} procesado: {stored} chunks almacenados")
        return {"status": "completed", "chunks_stored": stored}

    except Exception as e:
        logger.error(f"Error procesando documento {filename}: {e}", exc_info=True)

        # Marcar como fallido en GridFS
        try:
            from app.core.database import get_gridfs_bucket
            from bson import ObjectId
            bucket = get_gridfs_bucket()
            await bucket._files.update_one(
                {"_id": ObjectId(file_id)},
                {"$set": {"metadata.processing_status": "failed"}}
            )
        except Exception:
            pass

        return {"status": "failed", "error": str(e)}


# --- CLEANUP ---

async def delete_document_vectors(agent_id: str, file_id: str) -> int:
    """Elimina todos los vectores de un archivo específico."""
    from app.core.database import db
    collection = db.get_async_db()["knowledge_base"]
    result = await collection.delete_many({
        "agent_target": agent_id,
        "source_file_id": file_id
    })
    return result.deleted_count


async def delete_agent_vectors(agent_id: str) -> int:
    """Elimina TODOS los vectores de un agente."""
    from app.core.database import db
    collection = db.get_async_db()["knowledge_base"]
    result = await collection.delete_many({"agent_target": agent_id})
    return result.deleted_count
