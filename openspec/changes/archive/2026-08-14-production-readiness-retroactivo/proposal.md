# Proposal: Production Readiness Sprint

## Intent

Fix all production-blocking issues in SPHERE's billing, credit, UX, and test infrastructure. 3 billing audit bugs block revenue integrity; a critical credit-overcharge bug charges users per agent invocation instead of per user message; UX gaps make billing invisible; test fixtures are plan-rigid preventing free/starter testing.

## Scope

### In Scope

- **Bug 0 — Credit overcharge (NEW)**: `agent_node` (orchestrator.py:317-330) charges 1 credit per invocation. ReAct loop charges 2× for tool calls. Board meeting charges 4–10× per user message. Fix: charge ONCE at stream endpoint, remove deduction from agent_node.
- **Bug 1 — Flat rate limits** (main.py:326-344, config.py:46-47): All plans get 10/min chat. Add per-plan rate maps to plan_limits.py, refactor `_optional_rate_limiter` to accept a callable resolving rate from user plan.
- **Bug 2 — No email verification** (auth.py:145-159, 92-117): Free credits granted without checking `firebase_claims.email_verified`. Gate wallet init on `email_verified == True`.
- **Bug 3 — Top-up tier bypass** (billing.py:16-33): Any plan can purchase any top-up pack. Add `ALLOWED_TOPUPS_BY_PLAN` to plan_limits.py, validate in checkout endpoint.
- **UX 1 — Billing unreachable** (Sidebar.tsx:218-248): No nav link to /billing. Add link between Profile and Settings.
- **UX 2 — CreditsIndicator unrendered**: Import and render in ChatPanel header (ChatPanel.tsx:278).
- **UX 3 — No ErrorBoundary**: Wrap App.tsx with React ErrorBoundary.
- **UX 4 — Hardcoded user info** (Sidebar.tsx:233-234): Replace "Saúl"/"Admin" with data from auth context.
- **Test 1 — Plan-rigid fixtures** (conftest.py:64-120): Only premium mock. Add `make_profile(plan)` factory.
- **Test 2 — Missing rate-limit tests**: Create test_rate_limit.py.
- **Test 3 — Top-up validation tests**: Add to test_billing_api.py.

### Out of Scope

- Token budget billing integration (TokenUsageBar disconnected from billing store)
- Billing page loading/error states (separate polish pass)
- Stripe webhook defense-in-depth (webhook already validates prices)
- Billing as a Settings tab (can be added later)

## Capabilities

### Modified Capabilities
- `credit-metering`: Credit deduction moves from per-agent-invocation to per-user-message (stream endpoint level). `agent_node` keeps safety check only.
- `rate-limiting`: Rate limits become per-plan configurable instead of flat constants.
- `user-provisioning`: Email verification gates free credit grant.
- `billing-topup`: Top-up packs are tier-validated server-side.

### New Capabilities
None

## Approach

**Credit fix (critical)**: Move `cm.areserve_and_charge()` from `agent_node` to stream.py endpoint (one charge per POST). Add `already_charged: bool` to AgentState for board meeting agents to skip redundant charging. This ensures 1 human message = 1 credit regardless of ReAct loops or board meeting agent count.

**Rate limits**: Extend plan_limits.py with `RATE_LIMIT_CHAT_BY_PLAN`/`RATE_LIMIT_GENERAL_BY_PLAN` dicts. Change `_optional_rate_limiter` signature to accept a callable `fn(user) → (times, seconds)`. Chain with `get_current_user` as FastAPI dependency.

**Email verification**: Read `firebase_claims.get("email_verified", False)` at auth.py:127. If `False`, set `pro_messages_balance=0` and `pro_messages_granted_this_period=0`.

**Top-up validation**: Add `ALLOWED_TOPUPS_BY_PLAN` set in plan_limits.py. In billing.py:17, after `get_current_user`, check `req.plan_id` against user's allowed set.

**Frontend**: Add `<Link to="/billing">` in Sidebar footer. Import `<CreditsIndicator>` in ChatPanel header. Create `<ErrorBoundary>` wrapping App.tsx. Read user display name/role from `useAuth()`.

**Tests**: Factory `make_profile(plan="free")` in conftest.py. Test rate limits per plan. Test free user rejected for topup_premium_10k.

## Affected Areas

| Area | Impact | Files |
|------|--------|-------|
| Credit metering | Modified | `orchestrator.py`, `stream.py`, `AgentState` |
| Rate limiting | Modified | `main.py`, `config.py`, `plan_limits.py` |
| Auth/Provisioning | Modified | `auth.py:120-159, 92-117` |
| Billing validation | Modified | `billing.py:17-33`, `plan_limits.py` |
| Sidebar nav | Modified | `Sidebar.tsx:218-248` |
| ChatPanel header | Modified | `ChatPanel.tsx:278` |
| ErrorBoundary | New | `frontend/src/components/ErrorBoundary.tsx` |
| App.tsx | Modified | Wrap with ErrorBoundary |
| Test fixtures | Modified | `conftest.py:64-120` |
| Rate limit tests | New | `test_rate_limit.py` |
| Billing tests | Modified | `test_billing_api.py` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Credit charge location change breaks board meeting flow | Med | Add `already_charged` boolean to AgentState; board agents skip charge if set. Test board meeting with free user (balance=1, 5 agents). |
| Rate limiter dependency chaining breaks with Redis down | Low | Keep `_redis_client is None` fast-path. Dependency chain falls back to no-op if no Redis. |
| Email_verified not in Firebase token | Low | Default `False` — safer to deny than grant. Log warning for debugging. |

## Rollback Plan

Git revert the merge commit. Credit system: previous behavior restored (per-agent charge). Rate limits: revert to flat constants. Tests remain valid regardless.

## Dependencies

- Firebase Admin SDK must include `email_verified` in ID token claims (verified: standard Firebase behavior)
- Redis optional (rate limiting degrades gracefully without it)

## Success Criteria

- [ ] Free user with 1 credit and 4-agent board meeting enabled → consumes exactly 1 credit
- [ ] Free user gets 10/min chat, starter 30/min, premium 60/min (via Redis)
- [ ] Unverified email user gets 0 free messages, verified gets 5
- [ ] Free user POST /billing/checkout with topup_premium_10k → 400
- [ ] Sidebar renders "Facturación" link that navigates to /billing
- [ ] CreditsIndicator visible in ChatPanel header
- [ ] JSX crash renders ErrorBoundary fallback UI (not blank screen)
- [ ] Sidebar shows real user name from auth context
- [ ] `make_profile(plan="free")` creates a 5-message wallet
- [ ] `test_rate_limit.py` passes for all 3 plans
- [ ] `test_billing_api.py` includes top-up gating tests
