# billing-frontend

> **Source**: fix-platform-stability (archived 2026-05-14), production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (vitest)
> **Promoción retroactiva (2026-08-14)**: BF-005 y BF-006 se implementaron y sus tareas
> se cerraron al 100 % en el ciclo `production-readiness`, pero nunca se promovieron a
> esta spec. Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| BF-001 | `refresh()` MUST defer fetch until Firebase auth resolves, retry on failure | 2 |
| BF-002 | Balance UI MUST show loading state (not 0) while fetch is incomplete | 2 |
| BF-003 | FastAPI MUST validate Stripe config at startup, expose `stripe_configured` | 2 |
| BF-004 | Frontend MUST handle unavailable payments with user feedback | 2 |
| BF-005 | A visible navigation link to Billing/Settings SHALL exist for authenticated users | 3 |
| BF-006 | `CreditsIndicator` SHALL render in the ChatPanel header with remaining messages and tier | 3 |

### BF-001: Auth-Aware Refresh

- GIVEN Firebase auth initializing  WHEN `refresh()` called  THEN defer until `onAuthStateChanged`
- GIVEN `/billing/me` returns 401  WHEN `refresh()` fails  THEN retry 3x with backoff (1s, 2s, 4s)

### BF-002: Loading State

- GIVEN `loaded: false`  WHEN BillingPage renders balance  THEN show skeleton/spinner, NOT "0"
- GIVEN `loaded: true`, balance 3  WHEN rendered  THEN display numeric balance

### BF-003: Stripe Startup Check

- GIVEN `STRIPE_SECRET_KEY=""`  WHEN FastAPI boots  THEN log CRITICAL, disable Stripe, `stripe_configured: false`
- GIVEN `STRIPE_SECRET_KEY` is set  WHEN `/billing/me` called  THEN response includes `stripe_configured: true`

### BF-004: Stripe UX Degradation

- GIVEN `stripe_configured: false`  WHEN BillingPage renders  THEN hide buttons, show "Pagos no disponibles"
- GIVEN checkout returns 5xx  WHEN user clicks Subscribe  THEN show error toast (not just console.error)

### BF-005: Billing Page Navigation

The frontend SHALL include a visible navigation link to the Billing/Settings page for all
authenticated users.

- GIVEN an authenticated user
  WHEN the Sidebar renders
  THEN a "Facturación" or "Plan" link is visible in the nav

- GIVEN the user clicks the billing link
  WHEN the click event fires
  THEN the browser navigates to `/billing`

- GIVEN the user is on the billing page
  WHEN the page loads
  THEN the current plan tier and remaining credits are displayed

### BF-006: CreditsIndicator Integration

The `CreditsIndicator` component SHALL render in the ChatPanel header showing remaining
messages and plan tier.

- GIVEN a Free user with balance 3/5
  WHEN the ChatPanel header renders
  THEN it shows "3/5 Free"

- GIVEN `CreditsIndicator` is rendered
  WHEN the user clicks on it
  THEN the app navigates to `/billing`

- GIVEN any user with balance 0/5
  WHEN the ChatPanel header renders
  THEN it shows "0/5 — Recargar" with a call-to-action
