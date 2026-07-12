# Tasks: Production Ready de verdad — Second Production-Readiness Pass

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180–240 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (single PR; user preference) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 4 phases — rate limiter fix, email gate tests, billing fix, hygiene cleanup | Single PR | ~200 lines; all backend + 2 test files |

> ✅ Checklist auditado contra el código el 2026-07-12: todos los items estaban
> implementados (o quedaron cubiertos ese día). El fix de rate limiting fue más
> profundo que lo previsto en la Fase 1 — ver notas.

## Phase 1: P0 — Fix rate limiter availability

- [x] 1.1 Verify pyrate_limiter v4 `try_acquire(blocking=False)` API by checking installed version against PyPI docs. Confirm default changed from non-blocking to blocking in v4.
- [x] 1.2 Fix `stream.py:320` — change `limiter.try_acquire(user_id)` → `limiter.try_acquire(user_id, blocking=False)`. Add `pyrate_limiter` to `requirements.txt` (direct dependency, currently only transitive via fastapi-limiter).
  *Nota 2026-07-12: `blocking=False` no bastaba — el `Limiter` se recreaba por request (nunca acumulaba) y el `SingleBucketFactory` compartía un bucket global entre usuarios. Sustituido por `app/core/rate_limit.py`: singleton de proceso con bucket por identidad.*
- [x] 1.3 Add test `test_try_acquire_returns_429_immediately_not_blocks` in `backend/tests/test_rate_limit.py` — verify bucket-full returns False immediately (no sleep/hang).
  *Ampliado con `TestChatRateLimiterWiring`: persistencia entre requests, aislamiento por usuario y separación por tasa.*

## Phase 2: P1 — Email gate coverage

- [x] 2.1 Create `unverified_user_profile` fixture in `conftest.py` — extend `_make_user_profile` with `email_verified` parameter; set `subscription.status = "email_unverified"` and `pro_messages = 0` when False.
- [x] 2.2 Create `backend/tests/test_email_gate.py` with 5 tests: unverified user gets 0 balance, verified gets 5 credits, 403 on unverified stream POST, 200 on verified stream POST, dev-token bypasses email gate (always verified).

## Phase 3: P2 — Stream billing + token cap

- [x] 3.1 Add test in `test_stream_billing.py`: `board_classifier_node` propagates `already_charged` through board meeting graph.
- [x] 3.2 Add test in `test_stream_billing.py`: `next_iteration_node` propagates `already_charged` through board meeting graph.
- [x] 3.3 Add end-to-end test: stream POST charges exactly once — verify second agent_node call skips with `already_charged=True`.
- [x] 3.4 **CRITICAL** — Wire `cm.aadjust_after_completion()` in `stream.py` `generate_chat_events()` after the `astream_events` loop completes. *(Cableado en `stream.py` tras el loop; verificado 2026-07-12.)*

## Phase 4: Hygiene — Dead code removal + docs + token cap verify

### Decision A (A1): Delete legacy /chat
- [x] 4.1 Remove `/chat` router registration from `main.py`.
- [x] 4.2 Delete `backend/routes/chat.py` (no active callers — zero frontend consumers per exploration grep).
- [x] 4.3 Remove `RATE_LIMIT_CHAT_PER_MINUTE` from `config.py`.
- [x] 4.4 Remove dead `chatService.sendMessage()` from `frontend/src/services/api.ts` (0 component callers).

### Decision B (B1): Document low test balances
- [x] 4.5 Add comment in `conftest.py` above `_PLAN_WALLETS` explaining low test balances are intentional to make credit-exhaustion tests fast.

### Decision C (C1): Verify token cap
- [x] 4.6 Verify `credit_manager.py` token cap logic — confirm `TOKEN_CAP_PER_MESSAGE = 4000` and `_charge_extra` flow work correctly with stream path after Phase 3.4 fix.
- [x] 4.7 Add integration test: stream with 4k+ tokens triggers extra charge via `aadjust_after_completion`.
  *Cubierto a nivel unitario en `test_credit_manager.py` (4001→extra, 4000→no extra, sin saldo→outstanding) + wiring de `aadjust_after_completion` verificado en `test_stream_billing.py`. Limitación conocida: el recargo solo aplica a `counted_as == 1` — los board meetings (5 créditos) no reciben recargo por tokens (decisión pendiente de producto).*
