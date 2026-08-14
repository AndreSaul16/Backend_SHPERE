# ci-pipeline

> **Source**: backend-ci-verde (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Contrato de disparo y de entorno de `.github/workflows/ci.yml`, en particular del job
`test-backend`. Fija qué eventos disparan el workflow, qué variables de entorno necesita el job para
que la facturación sea alcanzable en CI, y que la suite termine en verde sin ocultar fallos.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| CI-001 | El job MUST exportar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` con valores falsos; MUST NOT ser credenciales reales | 2 |
| CI-002 | El workflow MUST disparar en `pull_request` contra la rama por defecto y en `push` sobre ramas de trabajo; MUST NOT disparar en `push` sobre la rama por defecto | 4 |
| CI-003 | La suite MUST terminar con 0 fallos en local y en CI, sin `skip` ni `xfail` añadidos para ocultar fallos | 1 |

### CI-001: Contrato de entorno del job `test-backend`

El job MUST exportar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` con valores falsos, para que
`settings.stripe_configured` sea verdadero y los endpoints de facturación no corten con 503 antes de
los mocks. Los valores MUST NOT ser credenciales reales.

- GIVEN el bloque `env:` del job `test-backend`
  WHEN se ejecuta `tests/test_billing_api.py`
  THEN ningún test recibe 503 por Stripe no configurado
  AND los tests de SKU inválido reciben 403

- GIVEN el bloque `env:`
  WHEN se inspeccionan los valores `STRIPE_*`
  THEN son ficticios, en claro, y no referencian secretos del repositorio

### CI-002: Intención de los triggers del workflow

El workflow MUST disparar en `pull_request` contra la rama por defecto (puerta de merge) y en `push`
sobre al menos un patrón de ramas de trabajo (verificación continua). MUST NOT disparar en `push`
sobre la rama por defecto: eso provocó los deploys SKIPPED de `1867ff4`.

El test que lo valida MUST expresar esa intención, no la forma literal del fichero: MUST resolver la
rama por defecto real del repositorio en vez de codificar un nombre, y MUST seguir pasando si se
añaden más patrones de ramas de trabajo.

- GIVEN `ci.yml`
  WHEN se leen los triggers
  THEN `pull_request.branches` incluye la rama por defecto real
  AND el test no contiene el literal `main`

- GIVEN `ci.yml`
  WHEN se lee `push.branches`
  THEN contiene al menos un patrón de rama de trabajo

- GIVEN `ci.yml`
  WHEN se compara `push.branches` con la rama por defecto
  THEN ningún elemento la nombra ni la cubre por patrón (`*`, `**` o equivalente)
  AND el test MUST fallar si alguien la añade

- GIVEN un patrón adicional de ramas de trabajo en `push.branches`
  WHEN se ejecuta `tests/test_ci_infra.py`
  THEN sigue verde sin editar el test

### CI-003: El job `test-backend` termina en verde

La suite MUST terminar con 0 fallos en local y en CI, sin `skip` ni `xfail` añadidos para ocultar
fallos.

- GIVEN el entorno de CI descrito arriba
  WHEN se ejecuta `python -m pytest tests/ -q` desde `backend/`
  THEN el resultado es `0 failed`
  AND el diff del cambio no toca ningún fichero bajo `backend/app/`
