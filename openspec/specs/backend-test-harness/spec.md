# backend-test-harness

> **Source**: backend-ci-verde (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

La suite de `backend/` debe observar la misma base que escribe la app, y negarse a correr fuera de
una base de test. Garantiza además que la cobertura sobre la ruta del dinero sea efectiva: un test
que no puede fallar no cuenta como cobertura.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TH-001 | Los tests síncronos MUST obtener el handle de Mongo de una fixture que resuelva `settings.DB_NAME`; ningún test MUST usar un literal | 2 |
| TH-002 | La suite MUST abortar en la configuración de pytest si `DB_NAME` no es una base de test | 3 |
| TH-003 | El test de SKU inválido MUST poder fallar, demostrado con una mutación deliberada de `validate_topup_tier` | 2 |

### TH-001: Resolución de la base síncrona vía configuración

Los tests que accedan a MongoDB de forma síncrona MUST obtener el handle de una fixture compartida
que resuelva `settings.DB_NAME`. Ningún test MUST usar un nombre de base literal.

- GIVEN `DB_NAME=sphere_test`
  WHEN un test pide la fixture de base síncrona
  THEN el handle es `sphere_test`, la misma base sobre la que escribe el webhook de Stripe

- GIVEN el árbol `backend/tests/`
  WHEN se buscan literales de nombre de base en accesos reales a Mongo
  THEN no aparece ninguno (solo mocks sin acceso real)

### TH-002: Pretil de aislamiento de base de datos

La suite MUST abortar si `DB_NAME` resuelve a una base que no es de test. El aborto MUST ocurrir en
la configuración de pytest, **antes** de recolectar o ejecutar test alguno y antes de abrir conexión
o escribir un documento.

- GIVEN `DB_NAME=sphere_db` (default de producción)
  WHEN se lanza `python -m pytest tests/ -q`
  THEN pytest termina con error de uso y código de salida distinto de 0 y de 1
  AND se ejecutan 0 tests y no se imprime resumen de tests
  AND el mensaje contiene el valor rechazado (`sphere_db`), el motivo (no es base de test) y el remedio exacto (`export DB_NAME=sphere_test`)
  AND ninguna colección de esa base ha sido leída ni modificada

- GIVEN `DB_NAME=sphere_test`
  WHEN se lanza la suite
  THEN la recolección procede sin emitir error de pretil

- GIVEN que `DB_NAME` no está en el entorno
  WHEN se lanza la suite
  THEN aplica un default de test seguro o aborta con el mismo mensaje remediable
  AND en ningún caso opera sobre la base de producción

### TH-003: Cobertura efectiva de la validación de SKU

El test que afirma que un SKU inválido no otorga créditos MUST poder fallar, y esa capacidad MUST
demostrarse con una mutación deliberada de `validate_topup_tier` que no se commitea.

- GIVEN el código de producción intacto
  WHEN se ejecuta `TestWebhookInvalidSKU::test_webhook_invalid_sku_grants_no_credits`
  THEN pasa, y sus aserciones leen la base de `settings.DB_NAME`

- **Mutación** (temporal, local): GIVEN se degrada `validate_topup_tier` para aceptar cualquier SKU
  WHEN se ejecuta ese mismo test
  THEN el test MUST fallar en la aserción de saldo o en el contador de transacciones de top-up
  AND si sigue verde, el requisito NO está cumplido
