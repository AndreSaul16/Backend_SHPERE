# Nota de archivo — promoción retroactiva

**Archivado**: 2026-08-14 · **Sufijo `-retroactivo` a propósito.**

Este ciclo se implementó y cerró sus 18 tareas al 100 %, pero **sus requisitos nunca se
promovieron a `openspec/specs/`**. Durante meses la fuente de verdad no contuvo 10 SHALL
y 36 escenarios que sí estaban vivos en el código. Esa deuda se cierra hoy: la promoción
es **retroactiva**, no nueva, y así queda anotada en cada capacidad de destino.

## Dónde ha ido cada requisito

| Dominio original (`spec.md`) | Requisito | Capacidad destino | ID asignado | Esc. |
|---|---|---|---|---|
| credit-metering | One Charge Per Human Message | `credit-system` | CS-011 | 5 |
| rate-limiting | Per-Plan Rate Limiting | `rate-limiting` | RL-005 | 4 |
| rate-limiting | Rate Limit Tests | `rate-limiting` | RL-006 | 3 |
| user-provisioning | Email Verification Gate for Free Credits | `user-provisioning` (nueva) | UP-001 | 4 |
| user-provisioning | Sidebar Dynamic User Info | `user-provisioning` (nueva) | UP-002 | 3 |
| billing-topup | Top-Up Pack Tier Validation | `billing-topup` (nueva) | BT-001 | 5 |
| billing-ui | Billing Page Navigation | `billing-frontend` | BF-005 | 3 |
| billing-ui | CreditsIndicator Integration | `billing-frontend` | BF-006 | 3 |
| error-handling | ErrorBoundary | `error-handling` (nueva) | EH-001 | 3 |
| test-infrastructure | Plan-Varied Test Fixtures | `test-infrastructure` (nueva) | TI-001 | 3 |

**Total: 10 requisitos, 36 escenarios** — coincide exactamente con el «Coverage Summary»
del `spec.md` original. Ninguno se descartó, ninguno se reescribió.

## Taxonomía de planes: marcada, no corregida

Tres taxonomías de plan conviven en los documentos del repositorio
(`free/pro/enterprise`, `Free/Starter/Premium`, y mono-plan). **La vigente es el
mono-plan de créditos**: `backend/PLAN_PAGOS.md:3-9` declara SUPERSEDED (2026-07-12) el
modelo de 3 tiers con suscripción; hoy hay un único plan `free` de 30 créditos/mes más
compras puntuales, y la fuente de verdad es `app/core/config.py` y
`app/core/plan_limits.py`.

Los requisitos que nombran planes muertos (RL-005, RL-006, BT-001, TI-001 — y RL-002, que
ya estaba en la spec principal con la *tercera* taxonomía) se han marcado
`[taxonomía obsoleta: mono-plan vigente]` **sin reescribirlos**. Motivo: la regla de fondo
de cada uno sigue vigente; lo muerto es su vocabulario de planes. Inventarles una
reescritura habría sido sustituir un requisito verificado por una suposición.

Reescribirlos al vocabulario mono-plan es trabajo de otro ciclo, con su propia medición.
