# user-provisioning

> **Source**: production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)
> **Promoción retroactiva (2026-08-14)**: estos requisitos se implementaron y sus tareas
> se cerraron al 100 % en su ciclo, pero nunca se promovieron a las specs principales.
> Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Purpose

Govern what a new user receives on first contact with the platform — free message
credits gated behind a verified email — and ensure the shell renders the real
authenticated identity instead of hardcoded placeholder values.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| UP-001 | Free plan credits SHALL be granted only after Firebase `email_verified` | 4 |
| UP-002 | Sidebar SHALL render the authenticated user's real name and email | 3 |

### UP-001: Email Verification Gate for Free Credits

The system SHALL verify the user's email via the Firebase Auth `email_verified` claim
before granting free plan message credits.

- GIVEN a new Firebase user with `email_verified=true`
  WHEN the user completes onboarding
  THEN the wallet is initialized with 5 free messages

- GIVEN a new Firebase user with `email_verified=false`
  WHEN the user completes onboarding
  THEN the wallet holds 0 messages
  AND the UI shows "Verifica tu email"

- GIVEN an existing user with a verified email and balance 3
  WHEN the user logs in
  THEN the balance is unchanged
  AND no wallet reset occurs

- GIVEN `ENV=development` and a dev token
  WHEN auth bypasses Firebase verification
  THEN `email_verified` defaults to `true`
  AND the wallet is initialized normally

### UP-002: Sidebar Dynamic User Info

The Sidebar SHALL display the authenticated user's display name and email from the auth
context instead of hardcoded values.

- GIVEN the user "María García" is logged in
  WHEN the Sidebar renders
  THEN "María García" is shown
  AND the avatar shows the initials "MG"

- GIVEN no authenticated user
  WHEN the Sidebar renders
  THEN no user info is displayed

- GIVEN a user with an email but no display name
  WHEN the Sidebar renders
  THEN the email address is shown as fallback
