"""Rate limiting por usuario para el endpoint de chat.

Dos requisitos que la integración anterior no cumplía:

1. El Limiter debe vivir a nivel de PROCESO. Un ``Limiter`` recreado en cada
   request estrena bucket vacío y nunca acumula historial → no limita nada.
2. El bucket debe ser POR IDENTIDAD. ``Limiter(rate)`` usa SingleBucketFactory,
   que comparte un único bucket global: el tráfico de un usuario consumiría la
   cuota de todos los demás.

Implementación in-memory por proceso: el deploy actual corre un único worker
uvicorn (ver Dockerfile/Procfile), donde el límite es exacto. Con N workers el
límite efectivo sería N×tasa — degradación acotada; si el deploy escala a
multi-worker, sustituir InMemoryBucket por RedisBucket en `_bucket_for`.
"""

import threading
from collections import OrderedDict

from pyrate_limiter import BucketFactory, Duration, InMemoryBucket, Limiter, Rate, RateItem
from pyrate_limiter.abstracts.bucket import AbstractBucket

from app.core.logger import api_logger as logger


class _PerIdentityBucketFactory(BucketFactory):
    """Un InMemoryBucket por identidad, con LRU acotado y Leaker compartido."""

    def __init__(self, rates: list[Rate], max_identities: int = 10_000):
        self._rates = rates
        self._max = max_identities
        self._buckets: OrderedDict[str, AbstractBucket] = OrderedDict()
        self._buckets_lock = threading.Lock()

    def _bucket_for(self, name: str) -> AbstractBucket:
        with self._buckets_lock:
            bucket = self._buckets.get(name)
            if bucket is not None:
                self._buckets.move_to_end(name)
                return bucket
            bucket = InMemoryBucket(list(self._rates))
            self.schedule_leak(bucket)
            self._buckets[name] = bucket
            while len(self._buckets) > self._max:
                _, evicted = self._buckets.popitem(last=False)
                self._forget(evicted)
            return bucket

    def _forget(self, bucket: AbstractBucket) -> None:
        """Al desalojar un bucket, quitarlo del Leaker para no retenerlo."""
        leaker = getattr(self, "_leaker", None)
        if leaker is not None and hasattr(leaker, "deregister"):
            try:
                leaker.deregister(bucket)
            except Exception as exc:
                # Best-effort: si el Leaker no suelta el bucket sólo se retiene memoria.
                # Molesto, no visible; por eso debug y no warning.
                logger.debug(f"No se pudo dar de baja el bucket en el Leaker: {exc}")

    def wrap_item(self, name: str, weight: int = 1) -> RateItem:
        return RateItem(name, self._bucket_for(name).now(), weight=weight)

    def get(self, item: RateItem) -> AbstractBucket:
        return self._bucket_for(item.name)


class ChatRateLimiter:
    """Fachada de rate limiting: un Limiter singleton por configuración de tasa.

    En la práctica hay una sola tasa (todos los planes comparten 60/min), pero
    si los planes divergen cada (times, seconds) obtiene su propio Limiter con
    factory per-identity, así el cambio de plan de un usuario no arrastra el
    historial de la tasa anterior.
    """

    def __init__(self):
        self._limiters: dict[tuple[int, int], Limiter] = {}
        self._lock = threading.Lock()

    def try_acquire(self, identity: str, times: int, seconds: int) -> bool:
        """True si la request cabe en la cuota; False → responder 429."""
        key = (times, seconds)
        limiter = self._limiters.get(key)
        if limiter is None:
            with self._lock:
                limiter = self._limiters.get(key)
                if limiter is None:
                    rates = [Rate(times, Duration.SECOND * seconds)]
                    limiter = Limiter(_PerIdentityBucketFactory(rates))
                    self._limiters[key] = limiter
        return bool(limiter.try_acquire(identity, blocking=False))


# Singleton de proceso — el estado del rate limit debe sobrevivir entre requests.
chat_rate_limiter = ChatRateLimiter()
