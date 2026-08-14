# stream-failure-surfacing

> **Source**: lanzamiento-p0 (archived 2026-08-14)
> **TDD**: ACTIVE (vitest)

## Purpose

Cuando el stream falla, la app MUST decirlo. Hoy no: el `throw` del evento
`{"type":"error"}` (`frontend/src/services/api.ts:222`) cae dentro del `try` cuyo
`catch` lo registra como error de parseo (`:224`), el bucle sigue y `[DONE]` ejecuta
`onDone` (`:152`). Y si el cuerpo se cierra sin `[DONE]`, `if (done) break` (`:132`)
sale del bucle sin llamar a nada: spinner infinito.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| SFS-001 | Un evento SSE `error` MUST producir `onError` y MUST NOT producir `onDone` | 3 |
| SFS-002 | Un stream que termina sin `[DONE]` MUST producir `onError` | 4 |
| SFS-003 | El JSON corrupto MUST seguir tolerándose sin abortar el stream | 2 |
| SFS-004 | El fallo MUST cerrar el estado de carga en la UI | 2 |
| SFS-005 | El mensaje mostrado MUST ser presentable | 2 |

### SFS-001: El evento `error` se ve

Cuando el stream emite `{"type": "error", …}`, el cliente MUST invocar `onError`
exactamente una vez con el mensaje del servidor, y MUST NOT invocar `onDone` ni
ejecutar ninguna parte del camino de éxito, ni siquiera si después llega `[DONE]`.

- GIVEN el stream emite `{"type":"error","message":"El modelo no respondió"}` y a
  continuación `[DONE]`
  WHEN el cliente procesa el stream
  THEN `onError` se invoca una vez con ese mensaje
  AND `onDone` no se invoca ninguna vez

- GIVEN se han recibido varios `chunk` y luego un evento `error`
  WHEN el cliente procesa el stream
  THEN el texto ya recibido se conserva
  AND el turno queda marcado como fallido, no como terminado

- **Mutación**: GIVEN se restaura el `throw new Error(data.message …)` dentro del `try`
  cuyo `catch (parseError)` lo registra como error de parseo (`api.ts:221-226`)
  WHEN se ejecuta la suite de frontend
  THEN el test de «error seguido de `[DONE]`» MUST fallar, porque vuelve a darse
  `onError` no invocado y `onDone` invocado

### SFS-002: Fin de stream sin `[DONE]`

Si el cuerpo de la respuesta se cierra sin haber recibido el centinela `[DONE]` y sin
que se haya notificado ya un error, el cliente MUST invocar `onError` y MUST NOT
invocar `onDone`.

Las callbacks terminales MUST invocarse **como máximo una vez** por stream: recibido
`[DONE]`, el cierre posterior del cuerpo MUST NOT emitir un segundo aviso.

Un stream abortado por el usuario (navegación, cancelación) MUST NOT producir
`onError`: ese caso ya está contemplado y MUST conservarse.

- GIVEN el stream emite dos `chunk` y el cuerpo se cierra sin `[DONE]`
  WHEN el cliente termina de leer
  THEN `onError` se invoca una vez
  AND `onDone` no se invoca

- GIVEN el stream emite `[DONE]` y después se cierra el cuerpo
  WHEN el cliente termina de leer
  THEN `onDone` se invoca exactamente una vez y `onError` ninguna

- GIVEN el usuario navega a otra sesión y se aborta la petición
  WHEN el lector se cancela
  THEN no se invoca `onError`

- **Mutación**: GIVEN se restaura `if (done) break;` sin comprobación de terminación
  (`api.ts:132`)
  WHEN se ejecuta la suite
  THEN el test de corte limpio MUST fallar

### SFS-003: El JSON corrupto se sigue tolerando

Una línea `data:` que no sea JSON válido MUST seguir descartándose sin abortar el
stream: es el propósito legítimo del `catch`. Sacar el error del `try` MUST NOT
convertir un chunk corrupto en un fallo del turno.

- GIVEN el stream emite un `chunk` válido, luego `data: {no-es-json`, luego otro
  `chunk` válido y `[DONE]`
  WHEN el cliente procesa el stream
  THEN el texto de los dos chunks válidos se entrega
  AND `onDone` se invoca y `onError` no

- **Mutación**: GIVEN se elimina el `catch` que descarta el chunk ilegible
  WHEN se ejecuta la suite
  THEN el test de chunk ilegible MUST fallar

### SFS-004: El fallo cierra el estado de carga

Ante `onError`, la sesión MUST salir del conjunto de sesiones en streaming: el
indicador de generación MUST detenerse y el envío MUST volver a estar habilitado. La
UI MUST NOT quedarse en «generando…» tras un fallo.

- GIVEN una sesión en streaming
  WHEN el stream termina en error o se corta sin `[DONE]`
  THEN la sesión ya no figura como en streaming
  AND el botón de enviar vuelve a estar habilitado

- **Mutación**: GIVEN se elimina la salida del conjunto de sesiones en streaming dentro
  de `onError`
  WHEN se ejecuta la suite del store
  THEN el test del spinner MUST fallar

### SFS-005: Mensaje presentable

El texto que ve el usuario ante un fallo de stream MUST estar en español, MUST
explicar qué ha pasado con el turno, y MUST NOT ser un volcado técnico: MUST NOT
contener trazas de pila, `[object Object]`, `undefined` ni el nombre de una clase de
error como único contenido.

- GIVEN el evento `error` llega sin campo `message`
  WHEN se muestra el fallo
  THEN el usuario lee un texto en español que explica el corte
  AND el texto no contiene `[object Object]` ni `undefined`

- **Mutación**: GIVEN se sustituye el mensaje por `String(error)` de un objeto de error
  sin `message`
  WHEN se ejecuta la suite
  THEN el test del mensaje presentable MUST fallar
