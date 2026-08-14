"""
Motor RAG multi-tenant con fix de seguridad.
El vector search filtra por user_id + agent_target para que
un usuario NUNCA pueda recuperar documentos de otro.
"""

import asyncio
import hashlib
import os
from pathlib import Path
from pymongo import MongoClient
from openai import OpenAI
import certifi
from dotenv import load_dotenv

from app.core.logger import db_logger as logger

# Cargar variables
env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "sphere_db")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Conexiones Globales
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]
collection = db["knowledge_base"]
openai_client = OpenAI(api_key=OPENAI_API_KEY)


def _make_cache_key(query: str, model: str) -> str:
    """Genera key de cache determinística para embeddings."""
    normalized = query.strip().lower()
    hash_val = hashlib.sha256(f"{normalized}:{model}".encode()).hexdigest()[:16]
    return f"embedding:{hash_val}"


def _retrieve_context_sync(
    query: str, role: str, user_id: str | None = None, limit: int = 3
) -> str:
    """
    Versión síncrona interna con aislamiento multi-tenant.
    Filtra por user_id + agent_target en el $vectorSearch.
    Usa caché de embeddings para evitar llamadas redundantes.
    """
    import json

    try:
        # 1. Buscar en caché de embeddings
        embedding_model = "text-embedding-3-small"
        cache_key = _make_cache_key(query, embedding_model)

        # Intentar lectura de Redis (skip si es async client — este código corre en thread)
        query_vector = None
        try:
            from app.infrastructure.redis_client import _redis_client
            import redis as redis_sync_lib

            if _redis_client and isinstance(_redis_client, redis_sync_lib.Redis):
                cached = _redis_client.get(cache_key)
                if cached:
                    query_vector = json.loads(cached)
        except Exception as exc:
            # Best-effort declarado: un miss de caché no es un incidente, se vectoriza abajo.
            logger.debug(f"No se pudo leer la caché de embeddings: {exc}")

        # 2. Si no hay cache hit, vectorizar con OpenAI
        if query_vector is None:
            query_vector = (
                openai_client.embeddings.create(input=[query], model=embedding_model)
                .data[0]
                .embedding
            )

            # Guardar en cache (best-effort, solo si Redis sync disponible)
            try:
                from app.infrastructure.redis_client import _redis_client
                import redis as redis_sync_lib

                if _redis_client and isinstance(_redis_client, redis_sync_lib.Redis):
                    _redis_client.setex(cache_key, 86400, json.dumps(query_vector))
            except Exception as exc:
                # Best-effort declarado: no poder cachear no degrada la respuesta, sólo su coste.
                logger.debug(f"No se pudo escribir la caché de embeddings: {exc}")

        # 2. Pipeline de búsqueda con filtro multi-tenant
        # CRÍTICO: filtrar por user_id + agent_target
        filter_conditions = []

        if user_id:
            filter_conditions.append({"user_id": {"$eq": user_id}})

        if role:
            filter_conditions.append({"agent_target": {"$in": [role, "all"]}})

        filter_dict = {"$and": filter_conditions} if filter_conditions else {}

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 100,
                    "limit": limit,
                    "filter": filter_dict,
                }
            },
            {"$project": {"_id": 0, "title": 1, "content_markdown": 1}},
        ]

        results = list(collection.aggregate(pipeline))

        # Fallback: si custom agent no tiene docs propios, buscar en "all" del mismo usuario
        if not results and role not in ("CEO", "CTO", "CFO", "CMO", "system", "all"):
            fallback_filter = {"agent_target": "all"}
            if user_id:
                fallback_filter["user_id"] = user_id

            pipeline[0]["$vectorSearch"]["filter"] = fallback_filter
            results = list(collection.aggregate(pipeline))

        if not results:
            return "No encontré información específica en mi base de conocimientos sobre este tema."

        # 3. Formatear contexto
        context_str = ""
        for doc in results:
            snippet = doc.get("content_markdown", "")[:2000]
            context_str += f"---\nFUENTE: {doc.get('title')}\nCONTENIDO: {snippet}\n\n"

        return context_str

    except Exception as e:
        error_str = str(e)

        # SEGURIDAD MULTI-TENANT: si el índice no soporta el filtro por user_id,
        # NO reintentamos sin filtro (eso leakearía documentos de otros usuarios al
        # LLM). Fail-closed: devolvemos un mensaje neutro y elevamos un log CRITICAL
        # para que el operador arregle la definición del índice en Atlas
        # (vector_index debe declarar user_id como filter field).
        if "needs to be indexed as filter" in error_str:
            logger.critical(
                "RAG MULTI-TENANT: el índice 'vector_index' no tiene 'user_id' como "
                "filter field. Búsqueda abortada para NO leakear documentos cross-user. "
                "Acción requerida: actualizar la definición del índice en Atlas "
                "(ver backend/scripts/vector_index_definition.json). user_id=%s",
                user_id,
            )
        else:
            logger.error(f"Error en RAG: {error_str}")

        return "Error recuperando contexto de la base de datos."


async def retrieve_context(
    query: str, role: str, user_id: str | None = None, limit: int = 3
) -> str:
    """
    Versión async: ejecuta la búsqueda síncrona en un thread del executor.

    Args:
        query: Pregunta del usuario
        role: Rol del agente (CEO, CTO, etc.) o UUID de custom agent
        user_id: ID del usuario para aislamiento multi-tenant (OBLIGATORIO en producción)
        limit: Número máximo de resultados
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _retrieve_context_sync, query, role, user_id, limit
    )


# Alias síncrono mantenido para compatibilidad
retrieve_context_sync = _retrieve_context_sync
