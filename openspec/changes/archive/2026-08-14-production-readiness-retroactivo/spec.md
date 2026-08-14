# Delta Specs: Production Readiness Sprint

## credit-metering

### ADDED Requirements

### Requirement: Credit Metering — One Charge Per Human Message

The system SHALL charge exactly 1 message credit per human POST to `/stream`, regardless of agent invocations or tool loops.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Normal chat, no tools | User has balance=5, sends "Hola" | Stream completes without tool calls | Balance = 4 (1 credit consumed) |
| 2 | Normal chat with tools | User has balance=5, query triggers tool call + follow-up | Agent invokes tool, generates response | Balance = 4 (1 credit consumed, not 2) |
| 3 | Board meeting (5-10 agents) | User has balance=1, board meeting enabled, 5 agents collaborate | POST to /stream triggers full board meeting | Balance = 0 (1 credit consumed, not 5-10) |
| 4 | Concurrent streams | User has balance=3, sends 2 messages simultaneously | Both streams process concurrently | Balance = 1 (2 credits consumed, no double-charge) |
| 5 | Refund on inference error | User has balance=2, stream starts, inference fails mid-response | Backend raises inference error before response completes | Balance = 2 (credit refunded; 0 consumed) |

## rate-limiting

### ADDED Requirements

### Requirement: Per-Plan Rate Limiting

The system SHALL apply tier-specific rate limits for chat/stream endpoints: Free=10/min, Starter=30/min, Premium=60/min.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Free user exceeds limit | Free user sends 11 requests in 60s | 11th request arrives | HTTP 429, "Rate limit exceeded" |
| 2 | Premium user within limit | Premium user sends 50 requests in 60s | All 50 requests complete | All succeed (200 OK), no 429 |
| 3 | Redis unavailable fast-path | Redis connection fails at startup | Rate limiter initializes | Rate limiting becomes no-op (all requests pass) |
| 4 | General rate limit on billing | Any authenticated user (regardless of plan) | POST /billing/checkout 6 times in 60s | 6th request returns 429 (general limit, not chat limit) |

### Requirement: Rate Limit Tests

The test suite SHALL include tests for per-plan rate limiting behavior.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Free plan rate limit tested | Test fixture with `plan="free"` | `test_rate_limit.py` executes | Free rate limit (10/min) enforced |
| 2 | Starter plan rate limit tested | Test fixture with `plan="starter"` | `test_rate_limit.py` executes | Starter rate limit (30/min) enforced |
| 3 | Premium plan rate limit tested | Test fixture with `plan="premium"` | `test_rate_limit.py` executes | Premium rate limit (60/min) enforced |

## user-provisioning

### ADDED Requirements

### Requirement: Email Verification Gate for Free Credits

The system SHALL verify the user's email via Firebase Auth `email_verified` claim before granting free plan message credits.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Verified email signup | New Firebase user, `email_verified=true` | User completes onboarding | Wallet = 5 free messages |
| 2 | Unverified email signup | New Firebase user, `email_verified=false` | User completes onboarding | Wallet = 0 messages; UI shows "Verifica tu email" |
| 3 | Existing verified user, no change | Existing user with verified email, balance=3 | User logs in | Balance unchanged; no wallet reset |
| 4 | Dev-token bypass | `ENV=development`, dev token used | Auth bypasses Firebase verification | `email_verified` defaults to `true`; wallet initialized normally |

### Requirement: Sidebar Dynamic User Info

The Sidebar SHALL display the authenticated user's display name and email from auth context instead of hardcoded values.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Authenticated user renders | User "María García" logged in | Sidebar renders | "María García" shown; avatar shows initials "MG" |
| 2 | Logged out state | No authenticated user | Sidebar renders | No user info displayed |
| 3 | User with no display name | User has email but no display name | Sidebar renders | Email address shown as fallback |

## billing-topup

### ADDED Requirements

### Requirement: Top-Up Pack Tier Validation

The system SHALL validate that the requested top-up `plan_id` corresponds to the user's current subscription tier at checkout AND at webhook processing.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Free user buys free top-up | Free user, `topup_free_5k` pack | POST /billing/checkout | 200 OK, checkout session created |
| 2 | Free user attempts premium top-up | Free user, `topup_premium_10k` pack | POST /billing/checkout | 403 Forbidden, "Plan no disponible para tu tier" |
| 3 | Starter user buys starter top-up | Starter user, `topup_starter_10k` pack | POST /billing/checkout | 200 OK |
| 4 | Premium user buys any premium top-up | Premium user, any `topup_premium_*` pack | POST /billing/checkout | 200 OK |
| 5 | Webhook defense-in-depth | Free user; Stripe sends `topup_premium_10k` webhook event | Webhook handler processes event | Event rejected; credit NOT granted; error logged |

## billing-ui

### ADDED Requirements

### Requirement: Billing Page Navigation

The frontend SHALL include a visible navigation link to the Billing/Settings page for all authenticated users.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Sidebar nav link visible | Authenticated user | Sidebar renders | "Facturación" or "Plan" link visible in nav |
| 2 | Navigation to billing | User clicks billing link | Click event fires | Browser navigates to /billing |
| 3 | Current plan and credits visible | User on billing page | Page loads | Current plan tier and remaining credits displayed |

### Requirement: CreditsIndicator Integration

The CreditsIndicator component SHALL render in the ChatPanel header showing remaining messages and plan tier.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Free user with remaining messages | Free user, balance=3/5 | ChatPanel header renders | Shows "3/5 Free" |
| 2 | User clicks indicator | CreditsIndicator rendered | User clicks on it | Navigates to /billing |
| 3 | Zero messages remaining | Any user, balance=0/5 | ChatPanel header renders | Shows "0/5 — Recargar" with call-to-action |

## error-handling

### ADDED Requirements

### Requirement: ErrorBoundary

The application SHALL wrap the component tree in a React ErrorBoundary that displays a graceful error UI instead of a blank white screen.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Render error caught | Component throws unhandled error during render | React renders component tree | ErrorBoundary catches error; fallback UI displayed |
| 2 | Fallback UI content | ErrorBoundary catches an error | Fallback renders | "Algo salió mal" message displayed with retry button |
| 3 | Error logged | ErrorBoundary catches render error | Fallback renders | Error details logged to console (production: sanitized) |

## test-infrastructure

### ADDED Requirements

### Requirement: Plan-Varied Test Fixtures

Test fixtures SHALL support all three plan tiers (free, starter, premium) with appropriate wallet balances.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Free fixture | `make_profile(plan="free")` called | Fixture created | `pro_messages_balance=5`, `subscription_tier="free"` |
| 2 | Starter fixture | `make_profile(plan="starter")` called | Fixture created | `pro_messages_balance=50`, `subscription_tier="starter"` |
| 3 | Premium fixture | `make_profile(plan="premium")` called | Fixture created | `pro_messages_balance=100`, `subscription_tier="premium"` |

## Coverage Summary

| Domain | Requirements | Scenarios |
|--------|-------------|-----------|
| credit-metering | 1 | 5 |
| rate-limiting | 2 | 7 |
| user-provisioning | 2 | 7 |
| billing-topup | 1 | 5 |
| billing-ui | 2 | 6 |
| error-handling | 1 | 3 |
| test-infrastructure | 1 | 3 |

**Total**: 10 requirements, 36 scenarios across 7 domains.
