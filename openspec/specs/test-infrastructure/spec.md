# test-infrastructure

> **Source**: production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)
> **Promoción retroactiva (2026-08-14)**: estos requisitos se implementaron y sus tareas
> se cerraron al 100 % en su ciclo, pero nunca se promovieron a las specs principales.
> Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Purpose

Keep the backend test fixtures varied enough that plan-dependent behaviour is exercised
by more than one shape of user.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TI-001 | Test fixtures SHALL support every plan tier with its wallet balance `[taxonomía obsoleta: mono-plan vigente]` | 3 |

### TI-001: Plan-Varied Test Fixtures

> `[taxonomía obsoleta: mono-plan vigente]` — este requisito nombra los tres tiers
> `free`/`starter`/`premium`, retirados en el pivote a **mono-plan de créditos**
> (`backend/PLAN_PAGOS.md:3-9`, SUPERSEDED 2026-07-12). El requisito se conserva **sin
> reescribir**: la exigencia de fondo —que los fixtures cubran las formas de usuario que
> el código distingue— sigue vigente; sólo su vocabulario de planes está muerto.

Test fixtures SHALL support all three plan tiers (free, starter, premium) with
appropriate wallet balances.

- GIVEN `make_profile(plan="free")` is called
  WHEN the fixture is created
  THEN `pro_messages_balance=5` and `subscription_tier="free"`

- GIVEN `make_profile(plan="starter")` is called
  WHEN the fixture is created
  THEN `pro_messages_balance=50` and `subscription_tier="starter"`

- GIVEN `make_profile(plan="premium")` is called
  WHEN the fixture is created
  THEN `pro_messages_balance=100` and `subscription_tier="premium"`
