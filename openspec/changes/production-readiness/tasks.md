# Tasks: Production Readiness Sprint

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320-380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Credit fix + rate limiting + email gate | PR 1 | Backend core (~115 lines) |
| 2 | Top-up validation + all backend tests | PR 2 | Depends on PR1 (~130 lines) |
| 3 | Frontend UI + ErrorBoundary | PR 3 | Independent of PR1/PR2 (~80 lines) |

## Phase 1: Credit Metering Fix (Critical Bug)

- [x] 1.1 Add `already_charged: bool` field to `AgentState` TypedDict in `orchestrator.py:53-69`
- [x] 1.2 Move `cm.areserve_and_charge()` from `agent_node` (L317-334) to `stream.py` L278 — charge once per POST, set `already_charged=True` in `initial_state`
- [x] 1.3 Skip charge in `agent_node` (L314-334) when `state.get("already_charged")` is True; keep refund logic (L405-409) for inference errors
- [x] 1.4 Move refund-on-error to `stream.py` `generate_chat_events()` — wrap `astream_events` loop in try/except with refund call; exception propagates to SSE error event

## Phase 2: Rate Limiting & Email Verification

- [x] 2.1 Add `RATE_LIMIT_CHAT_BY_PLAN` and `RATE_LIMIT_GENERAL_BY_PLAN` dicts to `plan_limits.py` (free=10/min, starter=30/min, premium=60/min; general: 30/60/120)
- [x] 2.2 Remove router-level `_optional_rate_limiter` from `main.py:362-367;` move rate limiter into `stream.py:278` handler after `get_current_user` — resolve plan from user dict, apply per-plan rate limit
- [x] 2.3 Gate wallet init on `firebase_claims.get("email_verified")` in `auth.py:147-159;` set balance=0 if False, add `email_verified` field to user doc; `dev-token` path defaults to True

## Phase 3: Top-Up Validation & Backend Tests

> ✅ Fase auditada contra el código el 2026-07-12. El producto pivotó a mono-plan
> de solo-créditos, así que el "gating por tier" se convirtió en validación de
> catálogo (`validate_topup_tier` contra `PURCHASABLE_SKUS`).

- [x] 3.1 ~~Add `ALLOWED_TOPUPS_BY_PLAN` to `plan_limits.py`~~ *Obsoleto por el pivote a mono-plan: la validación vive en `validate_topup_tier` (catálogo `PURCHASABLE_SKUS`); el mapa por tiers se eliminó por código muerto.*
- [x] 3.2 Validate `req.plan_id` against user allowed top-ups in `billing.py` — reject with 403 if tier mismatch *(hecho vía `validate_topup_tier` en el checkout)*
- [x] 3.3 Add defense-in-depth: validate top-up plan_id in `webhooks.py:_grant_topup` — log and reject if mismatch *(hecho: valida antes de otorgar, sin romper el webhook)*
- [x] 3.4 Refactor `conftest.py:_make_user_profile` → factory con balances por plan *(hecho: `_PLAN_WALLETS` + parámetro `email_verified`)*
- [x] 3.5 Create `tests/test_rate_limit.py` *(hecho; ampliado 2026-07-12 con tests del wiring real per-usuario)*
- [x] 3.6 Add top-up gating tests to `test_billing_api.py` *(hecho: `TestTopupSKUValidation` + `TestWebhookInvalidSKU` con la semántica mono-plan)*

## Phase 4: Frontend UI Integration

- [x] 4.1 Add `Link to="/billing"` labeled "Facturación" in Sidebar footer between profile and settings links (`Sidebar.tsx:274-281`)
- [x] 4.2 Import and render `<CreditsIndicator>` in ChatPanel header near search/pin buttons (`ChatPanel.tsx:279`); updated CreditsIndicator to show plan tier labels (Free/Starter/Premium)
- [x] 4.3 Replace hardcoded "Saúl"/"Admin" (`Sidebar.tsx:233-234`) with `user.displayName`/`user.email` from `useAuth()`; fallback to email if no displayName; `getInitials()` for avatar; logged-out state handled

## Phase 5: ErrorBoundary & Polish

- [x] 5.1 Create `frontend/src/components/shared/ErrorBoundary.tsx` — class component with `componentDidCatch`, fallback UI showing "Algo salió mal" message + retry button, error logging
- [x] 5.2 Wrap `<main>` content in `MainLayout.tsx` with `<ErrorBoundary>` (NOT entire App — sidebar/header survive as spec requires). 23 new frontend tests written (4 test files). Tests blocked by Node 26 + vitest incompatibility; verified with `npx tsc --noEmit`.
