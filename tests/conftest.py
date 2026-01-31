"""
Fixtures compartidas para tests del backend SPHERE.
"""
import pytest
import asyncio
from typing import AsyncGenerator
import sys
from pathlib import Path

# Añadir backend al path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Cargar .env
from dotenv import load_dotenv
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)


@pytest.fixture(scope="session")
def event_loop():
    """Manual event loop fixture for session scope to match MongoDB connection scope."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def mongo_uri():
    """Obtiene la URI de MongoDB desde el entorno."""
    import os
    uri = os.getenv("MONGODB_URL")
    if not uri:
        pytest.skip("MONGODB_URL no configurada")
    return uri


@pytest.fixture(scope="function")
def db_instance():
    """Instancia de Database conectada para tests."""
    from app.core.database import db
    db.connect()
    yield db
    db.close()


@pytest.fixture(scope="function")
async def async_client() -> AsyncGenerator:
    """Cliente HTTP async para tests de API."""
    from httpx import AsyncClient, ASGITransport
    from main import app
    from app.core.database import db
    
    # Forzar reconexión para que el cliente async se una al loop actual
    db._connected = False
    db.connect()
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture(scope="function")
def sync_client():
    """Cliente HTTP síncrono para tests simples."""
    from fastapi.testclient import TestClient
    from main import app
    from app.core.database import db
    
    if not db._connected:
        db.connect()
    
    with TestClient(app) as client:
        yield client
