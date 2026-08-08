# Proposal: backend-ci-verde

> Fase SDD: propose. Base: `exploration.md` (mismo directorio). Rama: `master`.

## Intent

El job `test-backend` da **10 failed / 307 passed**. Los 10 son de test o de entorno de CI (probado con EXP-1/2/3). Además hay **cobertura fantasma sobre la ruta del dinero**: `TestWebhookInvalidSKU` lee `sphere_db` mientras el webhook escribe en `settings.DB_NAME`, así que no puede fallar nunca. Objetivo: CI en verde **sin tocar código de producción** y con la señal recuperada.

## Scope

### In Scope
1. Fixture `sync_db` en `backend/tests/conftest.py` → `get_sync_client()[settings.DB_NAME]`; sustituir el literal `"sphere_db"` en los 5 puntos (`test_stripe_webhooks.py:34,66,137`, `test_credit_manager.py:10`, `test_billing_api.py:168`). **Va primero**: hasta que no esté, cualquier test nuevo sobre Stripe nace ciego.
2. Verificar que `TestWebhookInvalidSKU` pasa *por el motivo correcto* (mutación temporal de `validate_topup_tier` → debe ponerse rojo; la mutación no se commitea).
3. `STRIPE_SECRET_KEY: sk_test_ci` y `STRIPE_WEBHOOK_SECRET: whsec_ci` en el `env:` de `test-backend` (`.github/workflows/ci.yml`).
4. Reescribir `test_ci_infra.py::test_ci_yml_triggers_on_push_and_pr_to_main` contra la intención documentada (PR a `master` = puerta de merge; push a ramas de trabajo = verificación continua). Sin literal `main`.
5. Pretil de aislamiento: la suite **aborta** si `DB_NAME` resuelve a una base que no es de test (`sphere_db` es el default de producción → R1).

### Out of Scope
- **Bug del grant huérfano** (`webhooks.py:182-203`; `_grant_topup` ignora `matched_count`). Cambio SDD aparte con TDD estricto: es el único punto que toca la ruta de dinero en producción, y este cambio debe poder desplegarse solo y revertirse solo. Dependencia de orden: requiere el punto 1 hecho.
- Mover la validación de catálogo (403) antes del guard de Stripe (503) — cambia un endpoint de pago.
- R2 (`/ready` filtra `str(e)`), R3 (el test de idempotencia recorre dead-letter), R6 (`pytest.ini` con `PytestRemovedIn9Warning`).
- **No se toca `ci.yml` para disparar en `main`/push a `master`**: reintroduciría los deploys SKIPPED de `1867ff4`.

## Capabilities

### New Capabilities
- `backend-test-harness`: la suite resuelve la base vía `settings.DB_NAME` y se niega a correr fuera de una base de test.
- `ci-pipeline`: triggers del workflow y contrato de variables de entorno del job `test-backend`.

### Modified Capabilities
- None (ningún requisito de producto cambia).

## Approach — 4 commits independientes

| # | Commit | Ficheros |
|---|---|---|
| 1 | `test(backend): resolver la base de test vía settings.DB_NAME` | `tests/conftest.py`, 5 tests |
| 2 | `test(backend): abortar la suite fuera de una base de test` | `tests/conftest.py` |
| 3 | `ci: exportar credenciales Stripe falsas en test-backend` | `.github/workflows/ci.yml` |
| 4 | `test(ci): validar la intención de los triggers, no el literal main` | `tests/test_ci_infra.py` |

Esperado: −3 fallos (1), −6 (3), −1 (4) → **0 failed**.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/tests/conftest.py` | Modified | Fixture `sync_db` + pretil de base de test |
| `backend/tests/{test_stripe_webhooks,test_credit_manager,test_billing_api}.py` | Modified | Literal → fixture |
| `backend/tests/test_ci_infra.py` | Modified | Aserción por intención |
| `.github/workflows/ci.yml` | Modified | Solo bloque `env:` de `test-backend` |
| `backend/app/**` | **Sin tocar** | El artefacto desplegado no cambia |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Rebote: tests que hoy pasan por coincidencia contra `sphere_db` se ponen rojos (candidato `test_credit_manager.py`) | Media | Es señal legítima recuperada, no regresión: arreglar el test, nunca volver al literal |
| Contaminación entre tests al unificar todo en `sphere_test` (limpieza es opt-in) | Media | Limpieza por fixture si aparece dependencia de orden |
| El pretil bloquea a un dev local sin `DB_NAME` exportada | Media | Default seguro en `conftest` + mensaje de error que diga qué exportar |
| Alguien "arregla" el grupo B tocando `ci.yml` | Baja | Motivo escrito en la cabecera de `ci.yml` y en este documento |
| Un test futuro llame a Stripe de verdad y falle con clave falsa | Baja | Comportamiento deseado; todas las llamadas están mockeadas hoy |

**Hipótesis pendientes** (no verificadas desde el repo): frecuencia real del grant huérfano en producción; configuración de Railway respecto a checks de GitHub.

## Rollback Plan

- Cada commit es autónomo y reversible con `git revert <sha>` sin tocar los demás.
- No hay artefacto de producción implicado: `backend/app/**` no cambia, no hay migración de datos ni cambio de configuración de despliegue.
- Revertir el commit 3 solo devuelve los 6 rojos de Stripe; revertir el 1 devuelve la cobertura fantasma (preferible revertir 2/3/4 antes que el 1).
- El pretil (commit 2) es el único que puede bloquear ejecuciones locales: revertirlo es un `git revert` aislado, sin efectos en el resto.

## Dependencies

- Ninguna externa. El cambio `webhook-grant-huerfano` (futuro) depende del commit 1 de este.

## Success Criteria

- [ ] `python -m pytest tests/ -q` desde `backend/`: **0 failed** (317 passed esperados) en local y en el job `test-backend`.
- [ ] Ningún fichero bajo `backend/app/` aparece en el diff.
- [ ] `grep -rn '"sphere_db"' backend/tests/` no devuelve accesos reales a base (solo mocks de `test_stream_billing.py`).
- [ ] `TestWebhookInvalidSKU` se ha visto en **rojo** con `validate_topup_tier` roto a propósito.
- [ ] La suite aborta con mensaje explícito si `DB_NAME=sphere_db`.
- [ ] `ci.yml` conserva `pull_request: [master]` + `push: ['feat/**']` sin cambios en los triggers.
