# billing-frontend

> **Source**: fix-platform-stability (archived 2026-05-14), production-readiness (archived 2026-08-14), qa-3-topups (2026-08-14)
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
| BF-007 | `/billing/me` SHALL expose `purchasable_skus`; the frontend MUST NOT offer a SKU absent from it | 4 |
| BF-008 | Every purchasable SKU SHALL have a verb CTA, and any reason it is blocked MUST be visible text | 3 |

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

### BF-007: Per-SKU Purchase Eligibility

`stripe_configured` (BF-003) only reflects `STRIPE_SECRET_KEY`. It says nothing about
whether a given SKU has a `STRIPE_PRICE_*` behind it, and those default to `""` and are
never validated at startup — so a deployment could advertise the whole catalogue and
answer every click with `400 BILLING_INVALID_PLAN`.

`GET /billing/me` SHALL therefore expose `purchasable_skus: list[str]` — the SKUs of
`PURCHASABLE_SKUS` whose environment price ID is non-empty — and the frontend MUST NOT
offer a SKU that is absent from it.

- GIVEN the five `STRIPE_PRICE_*` variables are configured
  WHEN `GET /billing/me` is called
  THEN `purchasable_skus` contains the five SKUs of `PURCHASABLE_SKUS`, sorted

- GIVEN `STRIPE_SECRET_KEY` is set but every `STRIPE_PRICE_*` is empty
  WHEN `GET /billing/me` is called
  THEN `purchasable_skus` is `[]` AND `stripe_configured` is `true`

- GIVEN a SKU absent from `purchasable_skus`
  WHEN BillingPage renders its card (pack or top-up)
  THEN the button is disabled AND "Pago no disponible temporalmente" is rendered as
  visible text, NOT as a `title` attribute

- GIVEN a `/billing/me` response with no `purchasable_skus` field (older backend)
  WHEN BillingPage renders the catalogue
  THEN no purchase is blocked for this reason — absence means "not stated", not "nothing
  is purchasable", because the two repos deploy independently

### BF-008: Purchase CTA Legibility

Every purchasable SKU SHALL present a CTA whose label is an action, styled with the
current DESIGN tokens, and any reason the CTA is blocked SHALL be visible text in the
same section — never a `title`, which browsers do not render on a disabled button.

- GIVEN the top-ups section renders
  WHEN a top-up card is displayed
  THEN its CTA reads "Comprar" AND its price is rendered outside the control

- GIVEN the EU consent checkbox is unchecked
  WHEN the top-ups section renders
  THEN it states in visible text that the consent must be accepted, with a control that
  moves focus to the checkbox

- GIVEN the EU consent checkbox is checked and the SKU is purchasable
  WHEN the user activates the CTA
  THEN `POST /billing/checkout` is called with that SKU's `plan_id`
