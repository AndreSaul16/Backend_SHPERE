# tool-result-integrity

> **Source**: tools-seguridad (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)

## Purpose

Garantiza el invariante rector **lo que la tarjeta afirma coincide con lo que ocurrió**: toda ejecución de herramienta cae en uno y solo uno de tres estados (éxito, fallo, confirmación pendiente), cada uno con su evento SSE propio y su presentación propia. Alcance: `_tool_error_message` y los eventos SSE de `stream.py`, `streamHandlers.ts`, `parseMessageParts.ts` y `ToolExecutionCard.tsx`.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TRI-001 | Todo resultado de herramienta MUST clasificarse en uno y solo uno de tres estados, y el cliente MUST poder distinguirlos sin heurísticas sobre el texto | 1 |
| TRI-002 | Un payload con clave `error` de valor truthy distinto de `confirmation_required` MUST emitir `tool_error` y MUST NOT emitir `tool_result`; el mensaje visible MUST salir de `message`, `hint` o del propio código de error, y `{"error": true}` MUST seguir tratándose como fallo | 3 |
| TRI-003 | `error == "confirmation_required"` MUST emitirse como `tool_confirmation`; MUST NOT emitirse como `tool_error` ni como `tool_result` de éxito, y la tarjeta MUST mostrar el resumen de la acción pendiente y MUST NOT ofrecer «Reintentar» | 3 |
| TRI-004 | En los tres estados el texto visible MUST ser la etiqueta humana; el identificador técnico MUST NOT aparecer en la cabecera, en el mensaje de error ni en el `title` del botón «Reintentar» | 2 |

### TRI-001: Una ejecución tiene exactamente tres estados

| Estado | Cuándo | Evento SSE | Lo que ve el usuario |
|---|---|---|---|
| Éxito | payload sin clave `error` | `tool_result` | ✓ verde, etiqueta humana, resultado desplegable |
| Fallo | `error` presente y distinto de `confirmation_required` | `tool_error` | ✗ oxblood, «<etiqueta> — falló», mensaje y botón «Reintentar» |
| Confirmación pendiente | `error == "confirmation_required"` | `tool_confirmation` | estado de espera, ni ✓ ni ✗, resumen de la acción, **sin** «Reintentar» |

- GIVEN tres ejecuciones que devuelven, respectivamente, `{"ok": true}`, `{"error": "notion_api_error"}` y `{"error": "confirmation_required", ...}`
  WHEN se consume el stream
  THEN se emiten exactamente `tool_result`, `tool_error` y `tool_confirmation`
  AND ningún par de estados comparte tipo de evento

### TRI-002: Un error en string es un fallo

- GIVEN una herramienta devuelve `{"error": "linkedin_not_configured", "hint": H}`
  WHEN se consume el stream
  THEN se emite `tool_error` con el mensaje derivado de `H`
  AND la tarjeta muestra ✗, el texto «— falló» y el botón «Reintentar»
  AND no se emite ningún `tool_result` para esa ejecución

- GIVEN una herramienta devuelve `{"error": true, "message": M}`
  WHEN se consume el stream
  THEN se emite `tool_error` con `M`

- **Mutación**: GIVEN la detección vuelve a ser `parsed.get("error") is True`
  WHEN se ejecuta la suite
  THEN el primer escenario de este requisito MUST fallar
  AND si pasa, el test no observa nada y MUST reescribirse

### TRI-003: `confirmation_required` no es ni éxito ni fallo

- GIVEN `whatsapp_send_message` sin `confirmed` devuelve `{"error": "confirmation_required", "tool": "whatsapp_send_message", "action_summary": S}`
  WHEN se consume el stream
  THEN se emite `tool_confirmation` con `S`
  AND la tarjeta no contiene el icono de fallo, ni el texto «— falló», ni el botón «Reintentar»

- GIVEN el mismo payload
  WHEN se renderiza la tarjeta
  THEN no muestra el icono de éxito
  AND el usuario lee que la acción está pendiente de su confirmación, no que se hizo

- **Mutación** (bidireccional): GIVEN se trata `confirmation_required` como un `error` string más
  WHEN se ejecuta la suite
  THEN el primer escenario MUST fallar
  AND GIVEN, en su lugar, se trata como `tool_result` de éxito
  THEN el segundo escenario MUST fallar

### TRI-004: La tarjeta nunca muestra el identificador crudo

> La cobertura del catálogo por `TOOL_LABELS` se especifica en TCAT-003.

- GIVEN una ejecución de `slack_post_message` que falla
  WHEN se renderiza la tarjeta
  THEN el texto visible usa la etiqueta humana
  AND la cadena `slack_post_message` no aparece en el texto renderizado

- **Mutación**: GIVEN se elimina la entrada de `slack_post_message` de `TOOL_LABELS`
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar por caer al identificador crudo
