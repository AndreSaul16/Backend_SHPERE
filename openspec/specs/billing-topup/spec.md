# billing-topup

> **Source**: production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)
> **Promoción retroactiva (2026-08-14)**: estos requisitos se implementaron y sus tareas
> se cerraron al 100 % en su ciclo, pero nunca se promovieron a las specs principales.
> Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Purpose

Ensure a user cannot buy a top-up pack outside their own tier, validated twice: at
checkout and again when Stripe's webhook is processed.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| BT-001 | Top-up `plan_id` SHALL be validated against the user's tier at checkout AND at webhook processing `[taxonomía obsoleta: mono-plan vigente]` | 5 |

### BT-001: Top-Up Pack Tier Validation

> `[taxonomía obsoleta: mono-plan vigente]` — este requisito nombra los planes
> `Free`/`Starter`/`Premium`, retirados en el pivote a **mono-plan de créditos**
> (`backend/PLAN_PAGOS.md:3-9`, SUPERSEDED 2026-07-12: un único plan `free` de 30
> créditos/mes más compras puntuales; la fuente de verdad vigente es
> `app/core/config.py` y `app/core/plan_limits.py`). El requisito se conserva **sin
> reescribir**: la regla de fondo —validar el pack contra el tier del usuario en los dos
> puntos— sigue vigente; sólo su vocabulario de planes está muerto.

The system SHALL validate that the requested top-up `plan_id` corresponds to the user's
current subscription tier at checkout AND at webhook processing.

- GIVEN a Free user and the `topup_free_5k` pack
  WHEN `POST /billing/checkout` is called
  THEN the response is 200 OK and a checkout session is created

- GIVEN a Free user and the `topup_premium_10k` pack
  WHEN `POST /billing/checkout` is called
  THEN the response is 403 Forbidden with "Plan no disponible para tu tier"

- GIVEN a Starter user and the `topup_starter_10k` pack
  WHEN `POST /billing/checkout` is called
  THEN the response is 200 OK

- GIVEN a Premium user and any `topup_premium_*` pack
  WHEN `POST /billing/checkout` is called
  THEN the response is 200 OK

- GIVEN a Free user and Stripe sends a `topup_premium_10k` webhook event
  WHEN the webhook handler processes the event
  THEN the event is rejected
  AND no credit is granted
  AND the rejection is logged
