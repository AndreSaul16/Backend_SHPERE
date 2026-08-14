# Delta for tool-result-integrity

Capacidad nueva: todo es ADDED. Alcance: `_tool_error_message` y los eventos SSE de
`stream.py`, `streamHandlers.ts`, `parseMessageParts.ts` y `ToolExecutionCard.tsx`.
Invariante rector: **lo que la tarjeta afirma coincide con lo que ocurrió**.

## ADDED Requirements

### Requirement: TRI-001 — Una ejecución tiene exactamente tres estados

Todo resultado de herramienta **MUST** clasificarse en uno y solo uno de estos estados, y el
cliente **MUST** poder distinguirlos sin heurísticas sobre el texto:

| Estado | Cuándo | Evento SSE | Lo que ve el usuario |
|---|---|---|---|
| Éxito | payload sin clave `error` | `tool_result` | ✓ verde, etiqueta humana, resultado desplegable |
| Fallo | `error` presente y distinto de `confirmation_required` | `tool_error` | ✗ oxblood, «<etiqueta> — falló», mensaje y botón «Reintentar» |
| Confirmación pendiente | `error == "confirmation_required"` | `tool_confirmation` | estado de espera, ni ✓ ni ✗, resumen de la acción, **sin** «Reintentar» |

#### Scenario: Los tres estados son distinguibles en el stream

- GIVEN tres ejecuciones que devuelven, respectivamente, `{"ok": true}`,
  `{"error": "notion_api_error"}` y `{"error": "confirmation_required", ...}`
- WHEN se consume el stream
- THEN se emiten exactamente `tool_result`, `tool_error` y `tool_confirmation`
- AND ningún par de estados comparte tipo de evento

### Requirement: TRI-002 — Un error en string es un fallo

Si el payload es un objeto con la clave `error` y un valor truthy distinto de
`confirmation_required`, el sistema **MUST** emitir `tool_error`. **MUST NOT** emitir
`tool_result`. El mensaje visible **MUST** salir de `message`, `hint` o, en su defecto, del
propio código de error. `{"error": true}` **MUST** seguir tratándose como fallo.

#### Scenario: Falta de credencial pinta rojo

- GIVEN una herramienta devuelve `{"error": "linkedin_not_configured", "hint": H}`
- WHEN se consume el stream
- THEN se emite `tool_error` con el mensaje derivado de `H`
- AND la tarjeta muestra ✗, el texto «— falló» y el botón «Reintentar»
- AND no se emite ningún `tool_result` para esa ejecución

#### Scenario: El caso booleano no regresiona

- GIVEN una herramienta devuelve `{"error": true, "message": M}`
- WHEN se consume el stream
- THEN se emite `tool_error` con `M`

#### Scenario: Mutación — volver a `is True` debe romper la suite

- GIVEN la detección vuelve a ser `parsed.get("error") is True`
- WHEN se ejecuta la suite
- THEN el primer escenario de este requisito **MUST** fallar
- AND si pasa, el test no observa nada y **MUST** reescribirse

### Requirement: TRI-003 — `confirmation_required` no es ni éxito ni fallo

Un payload con `error == "confirmation_required"` **MUST** emitirse como `tool_confirmation`.
**MUST NOT** emitirse como `tool_error` (sería una ✗ roja con «Reintentar» ante una simple
pregunta) ni como `tool_result` de éxito (sería un ✓ verde ante una acción que no ocurrió).
La tarjeta **MUST** mostrar el resumen de la acción pendiente y **MUST NOT** ofrecer
«Reintentar»: quien reintenta es el usuario respondiendo al agente.

#### Scenario: Pedir confirmación no pinta rojo

- GIVEN `whatsapp_send_message` sin `confirmed` devuelve
  `{"error": "confirmation_required", "tool": "whatsapp_send_message", "action_summary": S}`
- WHEN se consume el stream
- THEN se emite `tool_confirmation` con `S`
- AND la tarjeta no contiene el icono de fallo, ni el texto «— falló», ni el botón «Reintentar»

#### Scenario: Pedir confirmación tampoco pinta verde

- GIVEN el mismo payload
- WHEN se renderiza la tarjeta
- THEN no muestra el icono de éxito
- AND el usuario lee que la acción está pendiente de su confirmación, no que se hizo

#### Scenario: Mutación bidireccional — las dos formas de romperlo

- GIVEN se trata `confirmation_required` como un `error` string más
- WHEN se ejecuta la suite
- THEN el primer escenario **MUST** fallar
- AND GIVEN, en su lugar, se trata como `tool_result` de éxito
- THEN el segundo escenario **MUST** fallar

### Requirement: TRI-004 — La tarjeta nunca muestra el identificador crudo

En los tres estados, el texto visible **MUST** ser la etiqueta humana de la herramienta. El
identificador técnico (`slack_post_message`) **MUST NOT** aparecer en la cabecera, ni en el
mensaje de error, ni en el `title` del botón «Reintentar». La cobertura del catálogo por
`TOOL_LABELS` se especifica en TCAT-003.

#### Scenario: Herramienta OAuth con etiqueta

- GIVEN una ejecución de `slack_post_message` que falla
- WHEN se renderiza la tarjeta
- THEN el texto visible usa la etiqueta humana
- AND la cadena `slack_post_message` no aparece en el texto renderizado

#### Scenario: Mutación — quitar la etiqueta debe romper la suite

- GIVEN se elimina la entrada de `slack_post_message` de `TOOL_LABELS`
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar por caer al identificador crudo
