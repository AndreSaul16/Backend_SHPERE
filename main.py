"""
SPHERE Backend - FastAPI Application
Orquestador de agentes IA para startups.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import db
from app.core.logger import api_logger as logger
from app.api.v1 import health, chat, stream, sessions, agents, documents
from app.tools.n8n_client import N8NClient
import app.tools.n8n_client as n8n_module


async def _ensure_indexes():
    """Crea índices críticos de MongoDB si no existen."""
    from pymongo import ASCENDING, DESCENDING
    from app.core.database import get_sessions_collection, get_custom_agents_collection

    sessions_col = get_sessions_collection()
    await sessions_col.create_index([("session_id", ASCENDING)], unique=True, background=True)
    await sessions_col.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], background=True)

    agents_col = get_custom_agents_collection()
    await agents_col.create_index([("agent_id", ASCENDING)], unique=True, background=True)
    await agents_col.create_index([("owner_user_id", ASCENDING)], background=True)

    # Índices para knowledge_base (RAG personalizado)
    kb_col = db.get_async_db()["knowledge_base"]
    await kb_col.create_index([("agent_target", ASCENDING)], background=True)
    await kb_col.create_index([("source_file_id", ASCENDING)], background=True)

    # Índices para message_ratings (Fase 6)
    ratings_col = db.get_async_db()["message_ratings"]
    await ratings_col.create_index([("session_id", ASCENDING), ("message_id", ASCENDING)], background=True)

    # Índices para agent_tasks (delegación CEO)
    tasks_col = db.get_async_db()["agent_tasks"]
    await tasks_col.create_index([("task_id", ASCENDING)], unique=True, background=True)
    await tasks_col.create_index([("assigned_to", ASCENDING), ("status", ASCENDING)], background=True)
    await tasks_col.create_index([("created_by", ASCENDING)], background=True)

    # Índices para tool_audit_log
    audit_col = db.get_async_db()["tool_audit_log"]
    await audit_col.create_index([("session_id", ASCENDING), ("timestamp", DESCENDING)], background=True)

    logger.info("Índices de MongoDB verificados/creados")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida de la aplicación.
    - Startup: Conecta a MongoDB y crea índices
    - Shutdown: Cierra conexiones
    """
    # Startup
    logger.info("Iniciando SPHERE Backend...")
    try:
        db.connect()
        logger.info("Conexión a MongoDB establecida")
        await _ensure_indexes()
    except Exception as e:
        logger.critical(f"No se pudo conectar a MongoDB: {e}")
        raise

    # Inicializar N8N Client
    client = N8NClient(
        base_url=settings.N8N_BASE_URL,
        webhook_secret=settings.N8N_WEBHOOK_SECRET,
    )
    await client.start()
    n8n_module.n8n_client = client
    logger.info("N8N Client inicializado")

    # Cargar todas las herramientas de agentes
    from app.tools.registry import load_all_tools
    load_all_tools()
    logger.info("Tool registry cargado")

    yield  # La aplicación corre aquí

    # Shutdown
    logger.info("Cerrando SPHERE Backend...")
    await client.close()
    db.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS — orígenes explícitos (configurable via ALLOWED_ORIGINS en .env)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas
app.include_router(health.router, prefix=f"{settings.API_V1_STR}/health", tags=["Health"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat"])
app.include_router(stream.router, prefix=f"{settings.API_V1_STR}/stream", tags=["Stream"])
app.include_router(sessions.router, prefix=f"{settings.API_V1_STR}/sessions", tags=["Sessions"])
app.include_router(agents.router, prefix=f"{settings.API_V1_STR}/agents", tags=["Agents"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/agents", tags=["Documents"])


@app.get("/")
async def root():
    """Endpoint raíz."""
    return {
        "service": "SPHERE Backend",
        "version": "2.0",
        "docs": f"{settings.API_V1_STR}/openapi.json"
    }