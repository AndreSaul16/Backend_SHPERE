# Delta for tool-confirmation

Capacidad nueva: todo es ADDED. Alcance: el gate conversacional (`requires_confirmation` +
`confirmed` en el `args_schema`), las 9 herramientas de `DESTRUCTIVE_TOOLS`
(`app/core/tool_context.py:23-32`) y el copy del ajuste `tool_confirmation_level`.
**No hay modal**: la confirmación se pide en la conversación y se concede reinvocando.

## ADDED Requirements

### Requirement: TC-001 — El gate es conversacional y no ejecuta en la primera llamada

Una herramienta con gate **MUST** exponer `confirmed: bool = False` en su `args_schema`.
Si la preferencia exige confirmación y `confirmed` no es `True`, la herramienta **MUST**
devolver `{"error": "confirmation_required", ...}` con un resumen legible de la acción y
**MUST NOT** producir ningún efecto externo: ni llamada a n8n, ni al proveedor, ni escritura.
Recibida la confirmación del usuario, el agente reinvoca con `confirmed=True` y **MUST**
ejecutarse entonces.

#### Scenario: `calendar_delete_event` no borra en la primera llamada

- GIVEN el usuario tiene `tool_confirmation_level == "always"`
- WHEN el agente invoca `calendar_delete_event(event_id=E)` sin `confirmed`
- THEN la salida contiene `"error": "confirmation_required"` y un resumen que nombra el evento
- AND no se ha realizado ninguna llamada al cliente n8n
- AND el evento `E` sigue existiendo

#### Scenario: Confirmado, se ejecuta

- GIVEN el mismo estado y que el usuario ha aceptado
- WHEN el agente reinvoca `calendar_delete_event(event_id=E, confirmed=True)`
- THEN se realiza exactamente una llamada al cliente n8n con `event_id == E`

#### Scenario: Mutación — quitar la comprobación debe romper la suite

- GIVEN se elimina la llamada a `requires_confirmation` de `calendar_delete_event`
- WHEN se ejecuta la suite
- THEN el primer escenario **MUST** fallar por haberse llamado a n8n
- AND si pasa, el test no observa nada y **MUST** reescribirse

### Requirement: TC-002 — Toda herramienta destructiva consulta la preferencia

Para **cada** nombre de `DESTRUCTIVE_TOOLS`, la herramienta registrada **MUST** aceptar
`confirmed` y **MUST** consultar la preferencia antes de actuar. Ninguna **MAY** quedar
declarada como destructiva sin gate. El test que lo comprueba **MUST** recorrer
`DESTRUCTIVE_TOOLS` como fuente de verdad, no una lista escrita a mano en el propio test.

#### Scenario: Recorrido del conjunto completo

- GIVEN `tool_confirmation_level == "destructive_only"`
- WHEN se invoca cada herramienta de `DESTRUCTIVE_TOOLS` con argumentos válidos y sin `confirmed`
- THEN todas devuelven `"error": "confirmation_required"`
- AND ninguna produce efecto externo observable

#### Scenario: Mutación — una sola herramienta sin gate rompe la suite

- GIVEN se elimina el gate de `whatsapp_send_notification`
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar en ese caso concreto

### Requirement: TC-003 — Qué significa cada nivel, y su límite declarado

`always` **MUST** exigir confirmación en toda herramienta que consulte el gate;
`destructive_only` **MUST** exigirla solo en `DESTRUCTIVE_TOOLS`; `never` **MUST NOT**
exigirla en ninguna. Ninguna preferencia **MAY** saltarse la whitelist de contactos: es una
defensa independiente y `confirmed=True` **MUST NOT** desactivarla.

#### Scenario: `never` ejecuta sin preguntar

- GIVEN `tool_confirmation_level == "never"`
- WHEN el agente invoca `calendar_delete_event(event_id=E)` sin `confirmed`
- THEN se ejecuta el borrado sin devolver `confirmation_required`

#### Scenario: Confirmar no abre la whitelist

- GIVEN `tool_confirmation_level == "never"` y un destinatario fuera de la whitelist
- WHEN el agente invoca `whatsapp_send_message(to=X, confirmed=True)`
- THEN la salida contiene `"error": "contact_not_authorized"`
- AND no se ha llamado a n8n

#### Scenario: Mutación — colar `confirmed` por delante de la whitelist

- GIVEN la comprobación de whitelist pasa a ejecutarse solo cuando `confirmed` es `False`
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar

### Requirement: TC-004 — El ajuste no promete más de lo que cumple

El gate cubre las 9 destructivas, no las 23 del catálogo. El copy de
`tool_confirmation_level` **MUST** nombrar ese alcance real y **MUST NOT** afirmar que se
pregunta antes de «todas» las herramientas.

#### Scenario: La opción «siempre» acota su alcance

- GIVEN el ajuste renderizado en el perfil
- WHEN se lee la opción de confirmación permanente y su texto de apoyo
- THEN describe que aplica a las acciones con impacto externo
- AND no contiene una promesa de cobertura total del catálogo

> Aviso de honestidad para las fases siguientes: este es el único escenario del cambio cuyo
> test es una aserción sobre copy. Es una guarda de regresión legítima, pero **no** demuestra
> comportamiento: no sustituye a TC-002 y **MUST NOT** contarse como cobertura del gate.
