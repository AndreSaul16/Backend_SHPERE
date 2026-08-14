# rate-limiting

> **Source**: production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)
> **Promoción retroactiva (2026-08-14)**: RL-005 y RL-006 se implementaron y sus tareas
> se cerraron al 100 % en el ciclo `production-readiness`, pero nunca se promovieron a
> esta spec. Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Purpose

Enforce per-plan API rate limits using a persistent singleton counter, replacing the current per-request Limiter instances that never accumulate.

> **Taxonomía de planes**: esta capacidad arrastra **dos vocabularios de plan muertos** —
> `free/pro/enterprise` (RL-002) y `Free/Starter/Premium` (RL-005, RL-006)—. Ninguno está
> vigente: el producto pivotó a **mono-plan de créditos** (`backend/PLAN_PAGOS.md:3-9`,
> SUPERSEDED 2026-07-12: un único plan `free` de 30 créditos/mes más compras puntuales;
> la fuente de verdad vigente es `app/core/config.py` y `app/core/plan_limits.py`).
> Los requisitos se conservan **sin reescribir** y marcados: la regla de fondo —umbrales
> distintos por identidad, acumulados en un contador que sobrevive entre peticiones—
> sigue vigente; sólo los nombres de plan están muertos.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| RL-001 | Limiter MUST be a module-level singleton (not created per request) | 1 |
| RL-002 | Per-plan rate thresholds MUST be enforced `[taxonomía obsoleta: mono-plan vigente]` | 1 |
| RL-003 | Limiter counter state MUST survive between requests in-process | 1 |
| RL-004 | Requests exceeding per-window threshold MUST return 429 | 1 |
| RL-005 | Tier-specific rate limits SHALL apply to chat/stream endpoints `[taxonomía obsoleta: mono-plan vigente]` | 4 |
| RL-006 | The test suite SHALL cover per-plan rate limiting behaviour `[taxonomía obsoleta: mono-plan vigente]` | 3 |

### RL-001: Singleton Limiter

- GIVEN two concurrent requests to the same endpoint
  WHEN both call `limiter.try_acquire()`
  THEN both observe the same Limiter instance and cumulative counter

### RL-002: Per-Plan Limits

> `[taxonomía obsoleta: mono-plan vigente]` — nombra `free`/`pro`/`enterprise`.

- GIVEN user on free plan
  WHEN request count within time window reaches free-tier limit
  THEN subsequent requests are rejected
  AND pro users have a higher threshold than free users

### RL-003: State Persistence Between Requests

- GIVEN request #1 consumes 1 quota unit from the singleton limiter
  WHEN request #2 arrives (same process)
  THEN the remaining quota reflects request #1's consumption

### RL-004: Threshold Enforcement

- GIVEN rate limit counter equals or exceeds plan threshold
  WHEN a new request arrives
  THEN response status is 429 Too Many Requests
  AND response body includes `Retry-After` header

### RL-005: Per-Plan Rate Limiting

> `[taxonomía obsoleta: mono-plan vigente]` — nombra `Free`/`Starter`/`Premium`.

The system SHALL apply tier-specific rate limits for chat/stream endpoints:
Free=10/min, Starter=30/min, Premium=60/min.

- GIVEN a Free user sends 11 requests in 60s
  WHEN the 11th request arrives
  THEN the response is HTTP 429 "Rate limit exceeded"

- GIVEN a Premium user sends 50 requests in 60s
  WHEN all 50 requests complete
  THEN all succeed (200 OK) with no 429

- GIVEN the Redis connection fails at startup
  WHEN the rate limiter initializes
  THEN rate limiting becomes a no-op and all requests pass

- GIVEN any authenticated user, regardless of plan
  WHEN `POST /billing/checkout` is called 6 times in 60s
  THEN the 6th request returns 429 from the general limit, not the chat limit

### RL-006: Rate Limit Tests

> `[taxonomía obsoleta: mono-plan vigente]` — nombra `free`/`starter`/`premium`.

The test suite SHALL include tests for per-plan rate limiting behavior.

- GIVEN a test fixture with `plan="free"`
  WHEN `test_rate_limit.py` executes
  THEN the free rate limit (10/min) is enforced

- GIVEN a test fixture with `plan="starter"`
  WHEN `test_rate_limit.py` executes
  THEN the starter rate limit (30/min) is enforced

- GIVEN a test fixture with `plan="premium"`
  WHEN `test_rate_limit.py` executes
  THEN the premium rate limit (60/min) is enforced
