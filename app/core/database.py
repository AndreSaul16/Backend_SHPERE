"""
Configuración de conexión a MongoDB con Arquitectura Dual.

- AsyncIOMotorClient: Para FastAPI endpoints (async)
- MongoClient: Para LangGraph Checkpointer (sync)

⚠️ IMPORTANTE: No mezclar los clientes. Cada uno tiene su propósito específico.
"""
import os
import certifi
import asyncio
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from dotenv import load_dotenv

from app.core.logger import db_logger as logger

load_dotenv()

MONGO_URI = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "sphere_db")


class Database:
    """
    Manejador de conexiones a MongoDB con arquitectura dual.
    
    Attributes:
        client: Cliente asíncrono (Motor) para FastAPI
        sync_client: Cliente síncrono (PyMongo) para LangGraph
    """
    
    client: Optional[AsyncIOMotorClient] = None
    sync_client: Optional[MongoClient] = None
    db_name: str = DB_NAME
    _connected: bool = False
    
    # Configuración compartida
    _client_kwargs = {
        "serverSelectionTimeoutMS": 30000,
        "connectTimeoutMS": 30000,
    }

    def __init__(self):
        """Inicializa la configuración TLS si es necesario."""
        if MONGO_URI and ("mongodb+srv" in MONGO_URI or "tls=true" in MONGO_URI.lower()):
            self._client_kwargs.update({
                "tls": True,
                "tlsCAFile": certifi.where(),
                "tlsAllowInvalidCertificates": False,
            })
            logger.debug("TLS configurado para conexión Atlas")


    def connect(self) -> bool:
        """
        Establece conexiones a MongoDB (async y sync).
        """
        current_loop = None
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if self._connected:
            # Si estamos conectados pero el loop cambió, debemos reconectar el cliente async
            if current_loop and self.client and self.client.get_io_loop() != current_loop:
                logger.warning("🔄 Detectado cambio de Event Loop, reconectando cliente async...")
                if self.client:
                    self.client.close()
                self.client = AsyncIOMotorClient(MONGO_URI, **self._client_kwargs)
                return True
                
            logger.debug("Ya existe una conexión activa, reutilizando...")
            return True
            
        if not MONGO_URI:
            logger.critical("MONGODB_URL no está definida en el entorno")
            raise ValueError("MONGODB_URL environment variable is required")
        
        try:
            logger.info(f"Conectando a MongoDB: {DB_NAME}...")
            
            # 1. Cliente ASYNC (Motor) - Para FastAPI
            self.client = AsyncIOMotorClient(MONGO_URI, **self._client_kwargs)
            logger.debug("Cliente async (Motor) inicializado")
            
            # 2. Cliente SYNC (PyMongo) - Para LangGraph Checkpointer
            self.sync_client = MongoClient(MONGO_URI, **self._client_kwargs)
            logger.debug("Cliente sync (PyMongo) inicializado")
            
            # 3. Verificar conexión con ping síncrono
            self.sync_client.admin.command('ping')
            logger.info(f"✅ Conexión dual establecida (DB: {DB_NAME})")
            
            self._connected = True
            return True
            
        except ServerSelectionTimeoutError as e:
            logger.critical(f"Timeout conectando a MongoDB: {e}")
            raise ConnectionFailure(f"No se pudo conectar a MongoDB: {e}")
            
        except Exception as e:
            logger.critical(f"Error inesperado conectando a MongoDB: {e}")
            raise

    def get_async_db(self):
        """
        Obtiene la base de datos asíncrona para FastAPI.
        
        Returns:
            AsyncIOMotorDatabase: Base de datos para operaciones async
        """
        if not self.client:
            logger.error("Cliente async no inicializado, conectando...")
            self.connect()
        return self.client[self.db_name]

    def get_sync_client(self) -> MongoClient:
        """
        Obtiene el cliente síncrono para LangGraph Checkpointer.
        
        ⚠️ SOLO usar para el MongoDBSaver de LangGraph.
        
        Returns:
            MongoClient: Cliente síncrono de PyMongo
        """
        if not self.sync_client:
            logger.error("Cliente sync no inicializado, conectando...")
            self.connect()
        return self.sync_client

    async def health_check(self) -> dict:
        """
        Verifica el estado de la conexión a MongoDB.
        
        Returns:
            dict: Estado de la conexión con detalles
        """
        import time
        
        result = {
            "status": "unknown",
            "latency_ms": None,
            "database": self.db_name,
            "collections": [],
        }
        
        try:
            start = time.perf_counter()
            
            if self.client:
                await self.client.admin.command('ping')
                latency = (time.perf_counter() - start) * 1000
                
                # Listar colecciones
                db = self.client[self.db_name]
                collections = await db.list_collection_names()
                
                result.update({
                    "status": "connected 🟢",
                    "latency_ms": round(latency, 2),
                    "collections": collections,
                })
                logger.debug(f"Health check OK: {latency:.2f}ms")
            else:
                result["status"] = "disconnected 🔴 (client is None)"
                logger.warning("Health check: cliente no inicializado")
                
        except Exception as e:
            result["status"] = f"error 🔴: {str(e)}"
            logger.error(f"Health check falló: {e}")
            
        return result

    def close(self):
        """Cierra ambas conexiones a MongoDB."""
        if self.client:
            self.client.close()
            self.client = None
            logger.debug("Cliente async cerrado")
            
        if self.sync_client:
            self.sync_client.close()
            self.sync_client = None
            logger.debug("Cliente sync cerrado")
            
        self._connected = False
        logger.info("🔌 Conexiones a MongoDB cerradas")


# Instancia global
db = Database()

# Colecciones (se inicializan después de connect())
def get_sessions_collection():
    """Colección para metadatos de sesiones."""
    return db.get_async_db()["sessions_metadata"]

def get_checkpoints_collection():
    """Colección para checkpoints de LangGraph."""
    return db.get_async_db()["checkpoints"]

def get_custom_agents_collection():
    """Colección para agentes personalizados."""
    return db.get_async_db()["custom_agents"]


def get_gridfs_bucket():
    """Bucket GridFS para almacenamiento de archivos de agentes."""
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
    return AsyncIOMotorGridFSBucket(db.get_async_db(), bucket_name="agent_files")


# Aliases para compatibilidad con código existente
sessions_collection = property(lambda self: get_sessions_collection())
checkpoints_collection = property(lambda self: get_checkpoints_collection())
custom_agents_collection = property(lambda self: get_custom_agents_collection())
