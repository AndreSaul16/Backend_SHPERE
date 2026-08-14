# tool-confirmation

> **Source**: tools-seguridad (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)

## Purpose

Garantiza que las acciones con impacto externo se confirman antes de ejecutarse: el gate es conversacional (`requires_confirmation` + `confirmed` en el `args_schema`), cubre las 9 herramientas de `DESTRUCTIVE_TOOLS` (`app/core/tool_context.py:23-32`) y su alcance real se refleja en el copy del ajuste `tool_confirmation_level`. **No hay modal**: la confirmación se pide en la conversación y se concede reinvocando.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TC-001 | Una herramienta con gate MUST exponer `confirmed: bool = False` en su `args_schema`, MUST devolver `{"error": "confirmation_required", ...}` con resumen legible y MUST NOT producir efecto externo alguno; reinvocada con `confirmed=True` MUST ejecutarse | 3 |
| TC-002 | Para cada nombre de `DESTRUCTIVE_TOOLS`, la herramienta registrada MUST aceptar `confirmed` y MUST consultar la preferencia antes de actuar; ninguna MAY quedar declarada destructiva sin gate, y el test MUST recorrer `DESTRUCTIVE_TOOLS` como fuente de verdad | 2 |
| TC-003 | `always` MUST exigir confirmación en toda herramienta que consulte el gate, `destructive_only` MUST exigirla solo en `DESTRUCTIVE_TOOLS`, `never` MUST NOT exigirla en ninguna; ninguna preferencia MAY saltarse la whitelist de contactos y `confirmed=True` MUST NOT desactivarla | 3 |
| TC-005 | La autorización del destinatario MUST decidirse ANTES de pedir confirmación: si no está autorizado el gate MUST devolver `contact_not_authorized` y MUST NOT pedir confirmación; la comprobación dentro de la tool MUST conservarse | 4 |
| TC-004 | El copy de `tool_confirmation_level` MUST nombrar el alcance real —las 9 destructivas, no las 23 del catálogo— y MUST NOT afirmar que se pregunta antes de «todas» las herramientas | 1 |

### TC-001: El gate es conversacional y no ejecuta en la primera llamada

- GIVEN el usuario tiene `tool_confirmation_level == "always"`
  WHEN el agente invoca `calendar_delete_event(event_id=E)` sin `confirmed`
  THEN la salida contiene `"error": "confirmation_required"` y un resumen que nombra el evento
  AND no se ha realizado ninguna llamada al cliente n8n
  AND el evento `E` sigue existiendo

- GIVEN el mismo estado y que el usuario ha aceptado
  WHEN el agente reinvoca `calendar_delete_event(event_id=E, confirmed=True)`
  THEN se realiza exactamente una llamada al cliente n8n con `event_id == E`

- **Mutación**: GIVEN se elimina la llamada a `requires_confirmation` de `calendar_delete_event`
  WHEN se ejecuta la suite
  THEN el primer escenario MUST fallar por haberse llamado a n8n
  AND si pasa, el test no observa nada y MUST reescribirse

### TC-002: Toda herramienta destructiva consulta la preferencia

- GIVEN `tool_confirmation_level == "destructive_only"`
  WHEN se invoca cada herramienta de `DESTRUCTIVE_TOOLS` con argumentos válidos y sin `confirmed`
  THEN todas devuelven `"error": "confirmation_required"`
  AND ninguna produce efecto externo observable

- **Mutación**: GIVEN se elimina el gate de `whatsapp_send_notification`
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar en ese caso concreto

### TC-003: Qué significa cada nivel, y su límite declarado

- GIVEN `tool_confirmation_level == "never"`
  WHEN el agente invoca `calendar_delete_event(event_id=E)` sin `confirmed`
  THEN se ejecuta el borrado sin devolver `confirmation_required`

- GIVEN `tool_confirmation_level == "never"` y un destinatario fuera de la whitelist
  WHEN el agente invoca `whatsapp_send_message(to=X, confirmed=True)`
  THEN la salida contiene `"error": "contact_not_authorized"`
  AND no se ha llamado a n8n

- **Mutación**: GIVEN la comprobación de whitelist pasa a ejecutarse solo cuando `confirmed` es `False`
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar

### TC-005: No se pide permiso para algo que no se puede hacer

El gate **MUST** decidir la autorización del destinatario **antes** de pedir confirmación. Si el
destinatario no está en la whitelist, **MUST** devolver el mismo error `contact_not_authorized` que
devolvería la herramienta y **MUST NOT** pedir confirmación en ningún caso.

Lo observado en QA: el agente pidió permiso para mandar un WhatsApp a un contacto que la whitelist
iba a rechazar de todas formas. El usuario confirmó —gastando su turno— y sólo entonces se enteró de
que la acción era imposible. Preguntar antes de saber si la acción puede ocurrir enseña una acción
que no va a ocurrir.

El mapa de destinatarios (`TOOL_RECIPIENT_ARGS`) **MUST** contener **sólo** herramientas que ya
comprueban la whitelist dentro de su implementación: el gate **adelanta** una comprobación
existente y **MUST NOT** inventarle autorización a ninguna herramienta que hoy no la haga. La
comprobación dentro de la herramienta **MUST** conservarse como defensa en profundidad: por los
caminos que no piden confirmación (`never`, o ya confirmado) es la única que actúa.

- GIVEN `tool_confirmation_level == "destructive_only"` y un destinatario fuera de la whitelist
  WHEN el agente invoca `whatsapp_send_message(to=X)` sin `confirmed`
  THEN la salida contiene `"error": "contact_not_authorized"` y el valor `X` buscado
  AND no contiene `confirmation_required`
  AND no se ha llamado a n8n

- GIVEN el mismo nivel y un destinatario **sí** autorizado
  WHEN el agente invoca `whatsapp_send_message(to=X)` sin `confirmed`
  THEN se pide confirmación igual que siempre
  AND no se ha llamado a n8n

- GIVEN una destructiva sin destinatario (`calendar_delete_event`), que no consulta la whitelist
  WHEN se invoca sin `confirmed`
  THEN se pide confirmación y no se consulta autorización alguna

- **Mutación**: GIVEN el gate vuelve a evaluar la confirmación antes que la autorización
  WHEN se ejecuta la suite
  THEN el primer escenario **MUST** fallar por recibir `confirmation_required`

### TC-004: El ajuste no promete más de lo que cumple

- GIVEN el ajuste renderizado en el perfil
  WHEN se lee la opción de confirmación permanente y su texto de apoyo
  THEN describe que aplica a las acciones con impacto externo
  AND no contiene una promesa de cobertura total del catálogo

> Aviso de honestidad: este es el único escenario del cambio cuyo test es una aserción sobre copy.
> Es una guarda de regresión legítima, pero **no** demuestra comportamiento: no sustituye a TC-002 y
> **MUST NOT** contarse como cobertura del gate.
