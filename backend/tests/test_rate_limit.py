"""
Integration tests for per-plan rate limiting (modelo single-plan: todos uniformes).
Verifica que:
- 60 requests pasan, 61st → rate-limited (429)
- Rate limiter no-op when Redis unavailable
"""
import pytest
from unittest.mock import patch, MagicMock


def _acquire_until_blocked(limiter, key: str, max_requests: int) -> int:
    """Cuenta cuántas adquisiciones pasan antes del rate limit."""
    count = 0
    for _ in range(max_requests):
        # blocking=False → retorna False en lugar de esperar
        if limiter.try_acquire(key, blocking=False):
            count += 1
        else:
            break
    return count


class TestRateLimitSinglePlan:
    """Integration tests — modelo single-plan: todos los planes tienen la misma tasa (60 req/min)."""

    def test_rate_limit_blocks_after_quota(self):
        """60 requests OK, 61st → blocked (429)."""
        from pyrate_limiter import Limiter, Rate, Duration
        from app.core.plan_limits import RATE_LIMIT_CHAT_BY_PLAN

        times, seconds = RATE_LIMIT_CHAT_BY_PLAN["free"]
        rate = Rate(times, Duration.SECOND * seconds)
        limiter = Limiter(rate)

        passed = _acquire_until_blocked(limiter, "test_quota_user", times + 5)
        assert passed == times, (
            f"User should get exactly {times} requests, got {passed}"
        )

        # La siguiente después del límite debe fallar
        assert not limiter.try_acquire("test_quota_user", blocking=False), (
            f"Request {times + 1} should be rate-limited (429)"
        )

    def test_rate_limit_allows_within_quota(self):
        """30 requests dentro del límite de 60 → todas pasan."""
        from pyrate_limiter import Limiter, Rate, Duration
        from app.core.plan_limits import RATE_LIMIT_CHAT_BY_PLAN

        times, seconds = RATE_LIMIT_CHAT_BY_PLAN["free"]
        rate = Rate(times, Duration.SECOND * seconds)
        limiter = Limiter(rate)

        passed = _acquire_until_blocked(limiter, "test_within_user", 30)
        assert passed == 30, (
            f"30 requests should all pass within {times}/min limit, got {passed}"
        )


class TestNonBlockingAcquire:
    """Verifica que try_acquire con blocking=False retorna inmediatamente.
    La migración de pyrate_limiter v4 cambió el default de blocking=False a blocking=True.
    """

    def test_try_acquire_returns_429_immediately_not_blocks(self):
        """Cuando el bucket está lleno, blocking=False retorna False en <500ms."""
        import time
        from pyrate_limiter import Limiter, Rate, Duration

        # Crear un limiter con 1 request por 60s — la segunda adquisición falla
        rate = Rate(1, Duration.SECOND * 60)
        limiter = Limiter(rate)
        test_key = f"test_blocking_false_{time.monotonic()}"

        # Primera adquisición: OK
        assert limiter.try_acquire(test_key, blocking=False) is True

        # Segunda adquisición: debe retornar False INMEDIATAMENTE (no bloquear)
        start = time.monotonic()
        result = limiter.try_acquire(test_key, blocking=False)
        elapsed = time.monotonic() - start

        assert result is False, (
            f"Expected False (rate limited), got {result}"
        )
        assert elapsed < 0.5, (
            f"blocking=False should return immediately, but took {elapsed:.3f}s. "
            f"Did you forget blocking=False?"
        )

    def test_try_acquire_blocking_false_never_hangs(self):
        """Triangulación: incluso con 10 intentos fallidos, cada uno retorna en <500ms."""
        import time
        from pyrate_limiter import Limiter, Rate, Duration

        rate = Rate(1, Duration.SECOND * 60)
        limiter = Limiter(rate)
        test_key = f"test_no_hang_{time.monotonic()}"

        # Llenar el bucket
        limiter.try_acquire(test_key, blocking=False)

        # 10 intentos fallidos deben ser instantáneos
        for i in range(10):
            start = time.monotonic()
            result = limiter.try_acquire(test_key, blocking=False)
            elapsed = time.monotonic() - start
            assert result is False, f"Attempt {i}: expected False"
            assert elapsed < 0.5, (
                f"Attempt {i}: blocking=False took {elapsed:.3f}s — must be immediate"
            )


class TestChatRateLimiterWiring:
    """Tests del servicio real que usa stream.py (app/core/rate_limit.py).

    El bug original tenía dos capas: el Limiter se recreaba por request (bucket
    vacío siempre → no limitaba) y aunque fuera singleton, SingleBucketFactory
    comparte UN bucket global entre todos los usuarios. Estas pruebas cubren
    ambas: el estado persiste entre llamadas y cada identidad tiene su cuota.
    """

    def _fresh(self):
        from app.core.rate_limit import ChatRateLimiter

        return ChatRateLimiter()

    def test_estado_persiste_entre_llamadas(self):
        """El historial acumula entre requests: con cuota 3, la 4ª se bloquea."""
        limiter = self._fresh()
        results = [limiter.try_acquire("user_a", 3, 60) for _ in range(4)]
        assert results == [True, True, True, False]

    def test_cuota_aislada_por_usuario(self):
        """Agotar la cuota de un usuario NO consume la de otro."""
        limiter = self._fresh()
        for _ in range(3):
            assert limiter.try_acquire("user_agotado", 3, 60)
        assert not limiter.try_acquire("user_agotado", 3, 60)
        # Otro usuario sigue teniendo su cuota íntegra.
        assert limiter.try_acquire("user_fresco", 3, 60)

    def test_singleton_de_modulo(self):
        """stream.py importa una instancia de módulo: debe ser la misma siempre."""
        from app.core.rate_limit import chat_rate_limiter as a
        from app.core.rate_limit import chat_rate_limiter as b

        assert a is b

    def test_tasas_distintas_no_comparten_historial(self):
        """Si el plan de un usuario cambia de tasa, arranca con bucket propio."""
        limiter = self._fresh()
        assert limiter.try_acquire("user_x", 1, 60)
        assert not limiter.try_acquire("user_x", 1, 60)
        # Nueva configuración de tasa → nuevo bucket, no hereda el bloqueo.
        assert limiter.try_acquire("user_x", 5, 60)

    def test_rate_limiter_config_matches_spec(self):
        """Los límites configurados coinciden con el modelo single-plan: todos uniformes."""
        from app.core.plan_limits import RATE_LIMIT_CHAT_BY_PLAN, RATE_LIMIT_GENERAL_BY_PLAN

        assert RATE_LIMIT_CHAT_BY_PLAN == {
            "free": (60, 60),
            "starter": (60, 60),
            "premium": (60, 60),
        }

        assert RATE_LIMIT_GENERAL_BY_PLAN == {
            "free": (120, 60),
            "starter": (120, 60),
            "premium": (120, 60),
        }
