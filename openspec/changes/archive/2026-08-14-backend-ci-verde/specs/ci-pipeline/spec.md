# ci-pipeline Specification

## Purpose

Contrato de disparo y de entorno de `.github/workflows/ci.yml`, en particular del job `test-backend`.

## Requirements

### Requirement: Contrato de entorno del job `test-backend`

El job MUST exportar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` con valores falsos, para que `settings.stripe_configured` sea verdadero y los endpoints de facturación no corten con 503 antes de los mocks. Los valores MUST NOT ser credenciales reales.

#### Scenario: Facturación alcanzable en CI

- GIVEN el bloque `env:` del job `test-backend`
- WHEN se ejecuta `tests/test_billing_api.py`
- THEN ningún test recibe 503 por Stripe no configurado
- AND los tests de SKU inválido reciben 403

#### Scenario: Claves falsas, no secretos

- GIVEN el bloque `env:`
- WHEN se inspeccionan los valores `STRIPE_*`
- THEN son ficticios, en claro, y no referencian secretos del repositorio

### Requirement: Intención de los triggers del workflow

El workflow MUST disparar en `pull_request` contra la rama por defecto (puerta de merge) y en `push` sobre al menos un patrón de ramas de trabajo (verificación continua). MUST NOT disparar en `push` sobre la rama por defecto: eso provocó los deploys SKIPPED de `1867ff4`.

El test que lo valida MUST expresar esa intención, no la forma literal del fichero: MUST resolver la rama por defecto real del repositorio en vez de codificar un nombre, y MUST seguir pasando si se añaden más patrones de ramas de trabajo.

#### Scenario: Puerta de merge presente

- GIVEN `ci.yml`
- WHEN se leen los triggers
- THEN `pull_request.branches` incluye la rama por defecto real
- AND el test no contiene el literal `main`

#### Scenario: Verificación continua

- GIVEN `ci.yml`
- WHEN se lee `push.branches`
- THEN contiene al menos un patrón de rama de trabajo

#### Scenario: La rama por defecto nunca dispara por push

- GIVEN `ci.yml`
- WHEN se compara `push.branches` con la rama por defecto
- THEN ningún elemento la nombra ni la cubre por patrón (`*`, `**` o equivalente)
- AND el test MUST fallar si alguien la añade

#### Scenario: Añadir otro patrón no rompe el test

- GIVEN un patrón adicional de ramas de trabajo en `push.branches`
- WHEN se ejecuta `tests/test_ci_infra.py`
- THEN sigue verde sin editar el test

### Requirement: El job `test-backend` termina en verde

La suite MUST terminar con 0 fallos en local y en CI, sin `skip` ni `xfail` añadidos para ocultar fallos.

#### Scenario: Suite completa sin fallos

- GIVEN el entorno de CI descrito arriba
- WHEN se ejecuta `python -m pytest tests/ -q` desde `backend/`
- THEN el resultado es `0 failed`
- AND el diff del cambio no toca ningún fichero bajo `backend/app/`
