# backend-test-harness Specification

## Purpose

La suite de `backend/` debe observar la misma base que escribe la app, y negarse a correr fuera de una base de test.

## Requirements

### Requirement: Resolución de la base síncrona vía configuración

Los tests que accedan a MongoDB de forma síncrona MUST obtener el handle de una fixture compartida que resuelva `settings.DB_NAME`. Ningún test MUST usar un nombre de base literal.

#### Scenario: La fixture apunta a la base que usa la app

- GIVEN `DB_NAME=sphere_test`
- WHEN un test pide la fixture de base síncrona
- THEN el handle es `sphere_test`, la misma base sobre la que escribe el webhook de Stripe

#### Scenario: No quedan literales

- GIVEN el árbol `backend/tests/`
- WHEN se buscan literales de nombre de base en accesos reales a Mongo
- THEN no aparece ninguno (solo mocks sin acceso real)

### Requirement: Pretil de aislamiento de base de datos

La suite MUST abortar si `DB_NAME` resuelve a una base que no es de test. El aborto MUST ocurrir en la configuración de pytest, **antes** de recolectar o ejecutar test alguno y antes de abrir conexión o escribir un documento.

#### Scenario: Base de producción por defecto

- GIVEN `DB_NAME=sphere_db` (default de producción)
- WHEN se lanza `python -m pytest tests/ -q`
- THEN pytest termina con error de uso y código de salida distinto de 0 y de 1
- AND se ejecutan 0 tests y no se imprime resumen de tests
- AND el mensaje contiene el valor rechazado (`sphere_db`), el motivo (no es base de test) y el remedio exacto (`export DB_NAME=sphere_test`)
- AND ninguna colección de esa base ha sido leída ni modificada

#### Scenario: Base de test válida

- GIVEN `DB_NAME=sphere_test`
- WHEN se lanza la suite
- THEN la recolección procede sin emitir error de pretil

#### Scenario: Dev local sin `DB_NAME`

- GIVEN que `DB_NAME` no está en el entorno
- WHEN se lanza la suite
- THEN aplica un default de test seguro o aborta con el mismo mensaje remediable
- AND en ningún caso opera sobre la base de producción

### Requirement: Cobertura efectiva de la validación de SKU

El test que afirma que un SKU inválido no otorga créditos MUST poder fallar, y esa capacidad MUST demostrarse con una mutación deliberada de `validate_topup_tier` que no se commitea.

#### Scenario: Verde por el motivo correcto

- GIVEN el código de producción intacto
- WHEN se ejecuta `TestWebhookInvalidSKU::test_webhook_invalid_sku_grants_no_credits`
- THEN pasa, y sus aserciones leen la base de `settings.DB_NAME`

#### Scenario: Mutación — el test MUST ponerse rojo

- GIVEN que se degrada `validate_topup_tier` para aceptar cualquier SKU (mutación temporal, local)
- WHEN se ejecuta ese mismo test
- THEN el test MUST fallar en la aserción de saldo o en el contador de transacciones de top-up
- AND si sigue verde, el requisito NO está cumplido
