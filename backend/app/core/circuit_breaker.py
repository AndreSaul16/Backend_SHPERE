"""
Circuit breaker genérico con estado en Redis.
Protege contra servicios externos caídos (n8n, etc.).
Estados: closed → open → half_open → closed
"""
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Callable, Any

from app.infrastructure.redis_client import get_redis
from app.core.logger import api_logger as logger


class CircuitState(str, Enum):
    CLOSED = "closed"       # Normal: requests pasan
    OPEN = "open"           # Fallido: requests se rechazan inmediatamente
    HALF_OPEN = "half_open" # Prueba: un request pasa para verificar


class CircuitBreaker:
    """
    Circuit breaker con estado persistido en Redis.
    
    Args:
        name: Nombre del circuito (ej: "n8n")
        failure_threshold: Fallos consecutivos para abrir
        recovery_timeout: Segundos antes de pasar a half_open
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._key = f"circuit:{name}"

    async def _get_state(self) -> tuple[CircuitState, int]:
        """Lee el estado actual del circuito desde Redis."""
        redis_client = await get_redis()
        if not redis_client:
            return CircuitState.CLOSED, 0

        try:
            data = await redis_client.hgetall(self._key)
            if not data:
                return CircuitState.CLOSED, 0

            state = CircuitState(data.get("state", "closed"))
            failures = int(data.get("failures", 0))
            return state, failures
        except Exception:
            return CircuitState.CLOSED, 0

    async def _set_state(self, state: CircuitState, failures: int = 0):
        """Persiste el estado del circuito en Redis."""
        redis_client = await get_redis()
        if not redis_client:
            return

        try:
            await redis_client.hset(
                self._key,
                mapping={
                    "state": state.value,
                    "failures": str(failures),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            # TTL para auto-cleanup si el circuito queda huérfano
            await redis_client.expire(self._key, self.recovery_timeout * 10)
        except Exception as exc:
            # No cambia el flujo: la excepción se sigue tragando. Pero sin este aviso el
            # breaker degrada a «siempre cerrado» y nadie se entera.
            logger.warning(f"Circuit {self.name}: no se pudo persistir el estado en Redis: {exc}")

    async def can_execute(self) -> bool:
        """Verifica si un request puede ejecutarse."""
        state, failures = await self._get_state()

        if state == CircuitState.CLOSED:
            return True

        if state == CircuitState.OPEN:
            # Verificar si es hora de intentar half_open
            redis_client = await get_redis()
            if redis_client:
                try:
                    updated_at = await redis_client.hget(self._key, "updated_at")
                    if updated_at:
                        last_update = datetime.fromisoformat(updated_at)
                        if datetime.now(timezone.utc) - last_update > timedelta(seconds=self.recovery_timeout):
                            await self._set_state(CircuitState.HALF_OPEN, failures)
                            logger.info(f"Circuit {self.name}: OPEN → HALF_OPEN (probando)")
                            return True
                except Exception as exc:
                    # No cambia el flujo: se conserva el `return False` de abajo. Sin este
                    # aviso el circuito no pasa nunca a HALF_OPEN, o sea no se recupera.
                    logger.warning(
                        f"Circuit {self.name}: no se pudo evaluar la recuperación "
                        f"(updated_at ilegible): {exc}"
                    )
            return False

        # HALF_OPEN permite un request de prueba; cualquier otro estado, no
        return state == CircuitState.HALF_OPEN

    async def record_success(self):
        """Registra un request exitoso."""
        state, _ = await self._get_state()

        if state == CircuitState.HALF_OPEN:
            logger.info(f"Circuit {self.name}: HALF_OPEN → CLOSED (recuperado)")
            await self._set_state(CircuitState.CLOSED, 0)
        elif state == CircuitState.CLOSED:
            # Reset failures si había alguno
            await self._set_state(CircuitState.CLOSED, 0)

    async def record_failure(self):
        """Registra un fallo. Puede abrir el circuito."""
        state, failures = await self._get_state()

        new_failures = failures + 1

        if state == CircuitState.HALF_OPEN:
            # Fallo durante prueba → volver a OPEN
            logger.warning(f"Circuit {self.name}: HALF_OPEN → OPEN (fallo durante prueba)")
            await self._set_state(CircuitState.OPEN, new_failures)
        elif new_failures >= self.failure_threshold:
            logger.warning(
                f"Circuit {self.name}: CLOSED → OPEN "
                f"({new_failures} fallos >= umbral {self.failure_threshold})"
            )
            await self._set_state(CircuitState.OPEN, new_failures)
        else:
            await self._set_state(CircuitState.CLOSED, new_failures)

    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """
        Ejecuta una función a través del circuit breaker.
        
        Returns:
            El resultado de la función.
        Raises:
            CircuitOpenError si el circuito está abierto.
        """
        if not await self.can_execute():
            raise CircuitOpenError(
                f"Servicio {self.name} no disponible (circuit breaker abierto). "
                f"Intenta de nuevo en {self.recovery_timeout}s."
            )

        try:
            result = await func(*args, **kwargs)

            # Verificar si el resultado indica error
            if isinstance(result, dict) and result.get("error"):
                await self.record_failure()
            else:
                await self.record_success()

            return result

        except Exception:
            await self.record_failure()
            raise


class CircuitOpenError(Exception):
    """Se lanza cuando el circuit breaker está abierto."""
