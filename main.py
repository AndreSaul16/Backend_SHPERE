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
from app.api.v1 import health, chat, stream, sessions, agents


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida de la aplicación.
    - Startup: Conecta a MongoDB
    - Shutdown: Cierra conexiones
    """
    # Startup
    logger.info("Iniciando SPHERE Backend...")
    try:
        db.connect()
        logger.info("Conexión a MongoDB establecida")
    except Exception as e:
        logger.critical(f"No se pudo conectar a MongoDB: {e}")
        raise
    
    yield  # La aplicación corre aquí
    
    # Shutdown
    logger.info("Cerrando SPHERE Backend...")
    db.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS (Permitir que el Frontend hable con el Backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción esto se restringe
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


@app.get("/")
async def root():
    """Endpoint raíz."""
    return {
        "service": "SPHERE Backend",
        "version": "2.0",
        "docs": f"{settings.API_V1_STR}/openapi.json"
    }