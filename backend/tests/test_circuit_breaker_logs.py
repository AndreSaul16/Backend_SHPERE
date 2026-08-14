"""
BLG-005 — un `except` silencioso registra por qué.

Los dos `try/except/pass` de `circuit_breaker.py` son los únicos S110 del backend con
consecuencia operativa: si se tragan la excepción sin decir nada, el breaker degrada a
«siempre cerrado» o no se recupera nunca, y nadie se entera. Estos tests observan el
registro, no el flujo: el flujo NO cambia y también se asserta.

Nota de fontanería: `api_logger` se crea en `core/logger.py` con `propagate = False`,
así que sus registros no llegan al root y `caplog` no los ve por su cuenta. El helper
`_capturar_logs_del_circuito` le engancha el handler de caplog directamente. Sin él, el
test estaría siempre en verde vacío, que es justo el test que este repo rechaza.
"""
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.core.circuit_breaker import CircuitBreaker, CircuitState

NOMBRE_DEL_LOGGER = "sphere.api"


@contextmanager
def _capturar_logs_del_circuito(caplog):
    logger = logging.getLogger(NOMBRE_DEL_LOGGER)
    nivel_previo = logger.level
    logger.addHandler(caplog.handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield
    finally:
        logger.removeHandler(caplog.handler)
        logger.setLevel(nivel_previo)


def _avisos(caplog):
    return [r for r in caplog.records if r.levelno == logging.WARNING]


class RedisQueFallaAlEscribir:
    """Redis que responde a todo menos a `hset`: el estado no se persiste."""

    async def hgetall(self, key):
        return {}

    async def hset(self, *args, **kwargs):
        raise ConnectionError("Redis no responde al persistir el estado")

    async def expire(self, *args, **kwargs):
        return True


class RedisQueEscribe:
    """Redis que funciona. Registra lo escrito para poder assertarlo."""

    def __init__(self):
        self.escrito = {}

    async def hgetall(self, key):
        return dict(self.escrito)

    async def hset(self, key, mapping=None, **kwargs):
        self.escrito.update(mapping or {})
        return len(mapping or {})

    async def expire(self, *args, **kwargs):
        return True


class RedisAbiertoSinFecha:
    """Circuito en OPEN cuyo `updated_at` no puede leerse: no se sabe si toca HALF_OPEN."""

    async def hgetall(self, key):
        return {"state": "open", "failures": "5"}

    async def hget(self, key, field):
        raise ConnectionError("Redis no responde al leer updated_at")

    async def hset(self, *args, **kwargs):
        return 1

    async def expire(self, *args, **kwargs):
        return True


class RedisAbiertoConFechaVieja:
    """Circuito en OPEN con `updated_at` lo bastante antiguo para pasar a HALF_OPEN."""

    def __init__(self, antiguedad_segundos: int):
        self.updated_at = (
            datetime.now(timezone.utc) - timedelta(seconds=antiguedad_segundos)
        ).isoformat()

    async def hgetall(self, key):
        return {"state": "open", "failures": "5", "updated_at": self.updated_at}

    async def hget(self, key, field):
        return self.updated_at

    async def hset(self, *args, **kwargs):
        return 1

    async def expire(self, *args, **kwargs):
        return True


# --- BLG-005a: la persistencia del estado del circuito ---------------------------------


async def test_blg_005a_el_fallo_al_persistir_el_estado_del_circuito_se_registra(caplog):
    """GIVEN Redis no responde al persistir el estado / THEN se emite un warning."""
    cb = CircuitBreaker("blg005a", failure_threshold=3, recovery_timeout=30)

    with patch("app.core.circuit_breaker.get_redis", return_value=RedisQueFallaAlEscribir()):
        with _capturar_logs_del_circuito(caplog):
            resultado = await cb._set_state(CircuitState.OPEN, 3)

    assert _avisos(caplog), (
        f"el fallo de persistencia del circuito no se registró: caplog.records == {caplog.records}"
    )
    mensaje = _avisos(caplog)[0].getMessage()
    assert "blg005a" in mensaje, f"el registro no nombra el circuito afectado: {mensaje!r}"
    assert "Redis no responde al persistir el estado" in mensaje, (
        f"el registro no lleva la excepción original: {mensaje!r}"
    )
    assert resultado is None, "el flujo cambió: _set_state dejó de devolver None"


async def test_blg_005a_triangulacion_una_escritura_correcta_no_registra_nada(caplog):
    """Triangulación: sin fallo no hay warning, y el estado sí se persiste."""
    cb = CircuitBreaker("blg005a_ok", failure_threshold=3, recovery_timeout=30)
    redis = RedisQueEscribe()

    with patch("app.core.circuit_breaker.get_redis", return_value=redis):
        with _capturar_logs_del_circuito(caplog):
            await cb._set_state(CircuitState.OPEN, 3)

    assert redis.escrito["state"] == "open"
    assert redis.escrito["failures"] == "3"
    assert _avisos(caplog) == [], (
        f"una persistencia correcta registró un aviso: {[r.getMessage() for r in _avisos(caplog)]}"
    )


# --- BLG-005b: la evaluación de la recuperación ----------------------------------------


async def test_blg_005b_el_circuito_que_no_puede_evaluar_su_recuperacion_lo_registra(caplog):
    """GIVEN OPEN y `updated_at` ilegible / THEN warning, y `can_execute()` sigue en False."""
    cb = CircuitBreaker("blg005b", failure_threshold=1, recovery_timeout=30)

    with patch("app.core.circuit_breaker.get_redis", return_value=RedisAbiertoSinFecha()):
        with _capturar_logs_del_circuito(caplog):
            permitido = await cb.can_execute()

    assert _avisos(caplog), (
        f"el circuito no pudo evaluar la recuperación y no lo registró: caplog.records == {caplog.records}"
    )
    mensaje = _avisos(caplog)[0].getMessage()
    assert "blg005b" in mensaje, f"el registro no nombra el circuito afectado: {mensaje!r}"
    assert "Redis no responde al leer updated_at" in mensaje, (
        f"el registro no lleva la excepción original: {mensaje!r}"
    )
    assert permitido is False, "el flujo cambió: can_execute dejó de devolver False con el circuito OPEN"


async def test_blg_005b_triangulacion_una_recuperacion_evaluable_no_registra_aviso(caplog):
    """Triangulación: con `updated_at` legible y vencido pasa a HALF_OPEN sin ningún aviso."""
    cb = CircuitBreaker("blg005b_ok", failure_threshold=1, recovery_timeout=30)

    with patch(
        "app.core.circuit_breaker.get_redis",
        return_value=RedisAbiertoConFechaVieja(antiguedad_segundos=120),
    ):
        with _capturar_logs_del_circuito(caplog):
            permitido = await cb.can_execute()

    assert permitido is True, "con el timeout vencido el circuito debe permitir el request de prueba"
    assert _avisos(caplog) == [], (
        f"una evaluación correcta registró un aviso: {[r.getMessage() for r in _avisos(caplog)]}"
    )
