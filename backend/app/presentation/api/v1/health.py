"""
Health Check Endpoints - SPHERE Backend.
Live (liveness) y Ready (readiness) probes.
"""
from fastapi import APIRouter
from typing import Dict

from app.infrastructure.database import db
from app.core.config import settings

router = APIRouter()


@router.get("/live", tags=["Health"])
async def liveness() -> Dict:
    """Liveness probe: el proceso está vivo."""
    return {"status": "alive"}


@router.get("/ready", tags=["Health"])
async def readiness() -> Dict:
    """
    Readiness probe: verifica que las dependencias críticas estén disponibles.
    - MongoDB ping
    - Redis ping (si está configurado)
    """
    checks = {}
    all_ready = True

    # MongoDB
    try:
        db_status = await db.health_check()
        mongo_ok = "connected" in db_status["status"]
        checks["mongodb"] = {
            "status": "ready" if mongo_ok else "not_ready",
            "latency_ms": db_status.get("latency_ms"),
        }
        if not mongo_ok:
            all_ready = False
    except Exception as e:
        checks["mongodb"] = {"status": "error", "error": str(e)}
        all_ready = False

    # Redis
    try:
        from app.infrastructure.redis_client import get_redis
        redis_client = await get_redis()
        if redis_client:
            await redis_client.ping()
            checks["redis"] = {"status": "ready"}
        else:
            checks["redis"] = {"status": "not_configured"}
    except Exception as e:
        checks["redis"] = {"status": "not_available", "error": str(e)}
        # Redis no es crítico, no marcar all_ready = False

    return {
        "status": "ready" if all_ready else "not_ready",
        "service": "SPHERE Orchestrator",
        "version": "3.0-multi-tenant",
        "checks": checks,
    }


# Mantener compatibilidad con el endpoint antiguo
@router.get("/health", tags=["Health"])
async def health_check() -> Dict:
    """Health check de compatibilidad."""
    return await readiness()


@router.get("/deploy", tags=["Health"])
async def deploy_status() -> Dict:
    """
    Deploy metadata: expone SHA del commit, timestamp del build,
    y estado del despliegue sin consultar base de datos.
    """
    commit_sha = settings.GIT_COMMIT_SHA or "unknown"
    build_timestamp = settings.BUILD_TIMESTAMP or ""
    is_live = bool(settings.GIT_COMMIT_SHA and settings.BUILD_TIMESTAMP)

    return {
        "commit_sha": commit_sha,
        "build_timestamp": build_timestamp,
        "deploy_status": "live" if is_live else "deploying",
        "service_name": "backend",
        "version": settings.PROJECT_NAME,
    }
