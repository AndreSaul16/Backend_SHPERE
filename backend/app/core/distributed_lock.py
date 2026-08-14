"""
Distributed lock por thread_id usando Redis.
Previene que dos requests concurrentes procesen el mismo chat simultáneamente.
"""
from typing import Optional

from app.infrastructure.redis_client import get_redis
from app.core.logger import api_logger as logger


class DistributedLock:
    """
    Lock distribuido con Redis SET NX EX.
    
    Usage:
        async with DistributedLock("checkpoint:user1:session1") as acquired:
            if acquired:
                # sección crítica
            else:
                # otro worker está procesando
    """

    def __init__(self, key: str, ttl_seconds: int = 60):
        self.key = f"lock:{key}"
        self.ttl = ttl_seconds
        self._token: Optional[str] = None

    async def acquire(self) -> bool:
        """Intenta adquirir el lock. Retorna True si se obtuvo."""
        import secrets
        redis_client = await get_redis()
        if not redis_client:
            # Redis no disponible: permitir sin lock (degradación graceful)
            return True

        self._token = secrets.token_urlsafe(16)
        try:
            result = await redis_client.set(
                self.key,
                self._token,
                nx=True,  # Solo si no existe
                ex=self.ttl,
            )
            acquired = result is True
            if not acquired:
                logger.debug(f"Lock no adquirido: {self.key}")
            return acquired
        except Exception as e:
            logger.warning(f"Error adquiriendo lock {self.key}: {e}")
            return True  # Degradación graceful

    async def release(self):
        """Libera el lock (solo si somos los dueños — verificación atómica)."""
        redis_client = await get_redis()
        if not redis_client or not self._token:
            return

        try:
            # Lua script para verificación atómica + delete
            # Evita race condition entre GET y DELETE
            lua_script = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
            """
            await redis_client.eval(lua_script, 1, self.key, self._token)
        except Exception as e:
            logger.warning(f"Error liberando lock {self.key}: {e}")

    async def __aenter__(self):
        return await self.acquire()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()
        return False


async def try_lock_or_409(user_id: str, session_id: str):
    """
    Intenta adquirir lock para un thread. Lanza 409 si ya está en uso.
    
    Returns:
        DistributedLock instance si se adquirió.
    Raises:
        HTTPException 409 si no se pudo adquirir.
    """
    from fastapi import HTTPException

    lock = DistributedLock(f"checkpoint:{user_id}:{session_id}", ttl_seconds=60)
    acquired = await lock.acquire()

    if not acquired:
        raise HTTPException(
            status_code=409,
            detail="Tu mensaje anterior aún se está procesando. Espera un momento e intenta de nuevo.",
        )

    return lock
