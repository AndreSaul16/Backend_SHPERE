"""
Health Check Endpoint - SPHERE Backend.
Verifica el estado del servicio y la conexión a MongoDB.
"""
from fastapi import APIRouter
from typing import Dict

from app.core.database import db
from app.core.logger import api_logger as logger

router = APIRouter()


@router.get("/health", tags=["Health"])
async def health_check() -> Dict:
    """
    Health Check mejorado.
    Verifica la conectividad real con MongoDB Atlas.
    
    Returns:
        Dict con estado del servicio, base de datos y latencia
    """
    logger.debug("Ejecutando health check...")
    
    # Obtener estado detallado de la conexión
    db_status = await db.health_check()
    
    response = {
        "status": "active",
        "service": "SPHERE Orchestrator",
        "database": db_status["status"],
        "latency_ms": db_status.get("latency_ms"),
        "collections": db_status.get("collections", [])
    }
    
    logger.info(f"Health check: {db_status['status']}")
    return response