# session-history-integrity

> **Source**: artefactos-guardarrailes (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Garantiza que un fallo al leer el historial de una sesión se comunique como fallo
(`backend/app/presentation/api/v1/sessions.py`). `sessions.py:342-345` capturaba cualquier excepción y devolvía **200
con lista vacía**: el usuario abría su debate de ayer y veía un chat vacío, como si nunca hubiera existido. Una sesión
sin mensajes y una sesión ilegible dejan de ser indistinguibles.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| SH-001 | Un fallo de lectura del historial MUST responder 5xx y MUST NOT devolver 200 con lista de mensajes vacía | 2 |
| SH-002 | Una sesión sin mensajes MUST seguir siendo 200 con `messages: []`; autorización y existencia MUST NOT cambiar | 3 |
| SH-003 | La vista pública compartida (`sessions.py:561`) MUST conservar su comportamiento actual ante un fallo de lectura | 1 |

### SH-001: Un Fallo de Lectura se Comunica Como Fallo

Cuando la carga del historial de una sesión falla por un error de infraestructura o de datos, el endpoint
MUST responder con un estado de error (5xx) y MUST NOT responder 200.

El endpoint MUST NOT devolver una lista de mensajes vacía para representar un fallo.

El fallo MUST seguir registrándose en el log del servidor con el `session_id`, como hoy.

El mensaje de error devuelto al cliente MUST ser presentable en castellano y MUST NOT contener trazas de pila ni
detalles internos de la base de datos.

- GIVEN una sesión existente propiedad del usuario
  AND la lectura de sus mensajes lanza una excepción
  WHEN el cliente pide el historial
  THEN la respuesta MUST ser 5xx
  AND MUST NOT ser 200 con `messages: []`
  AND el log MUST contener el `session_id` y el motivo

- GIVEN el escenario anterior
  WHEN se inspecciona el cuerpo de la respuesta
  THEN MUST NOT contener trazas de pila, cadenas de conexión ni nombres de colección

### SH-002: Una Sesión Sin Mensajes Sigue Siendo un Caso Normal

El endpoint MUST responder 200 con `messages: []` cuando la sesión existe, pertenece al usuario y **no tiene
mensajes**. Ese caso MUST NOT confundirse con un fallo.

Los casos de autorización y de existencia MUST NOT cambiar: una sesión ajena o inexistente sigue produciendo el
mismo estado que hoy (`require_owner`, `sessions.py:322`), y ese camino MUST NOT quedar cubierto por SH-001.

- GIVEN una sesión del usuario sin ningún mensaje
  WHEN el cliente pide el historial
  THEN la respuesta MUST ser 200
  AND `messages` MUST ser una lista vacía
  AND MUST NOT registrarse ningún error

- GIVEN una sesión que pertenece a otro usuario
  WHEN el cliente pide el historial
  THEN la respuesta MUST ser la misma que antes de este cambio
  AND MUST NOT convertirse en un 5xx

- GIVEN una sesión cuyo agente personalizado ya no existe
  WHEN el cliente pide el historial
  THEN la respuesta MUST ser 200 con `warning: "agent_deleted"`, como hoy

### SH-003: La Vista Compartida No Hereda el Cambio a Ciegas

`_load_session_messages` tiene un segundo consumidor (`sessions.py:561`, vista pública compartida). Ese camino
MUST conservar su comportamiento actual frente a un fallo de lectura: una vista pública MUST NOT empezar a
exponer errores de infraestructura a un visitante anónimo.

- GIVEN una sesión compartida cuya lectura de mensajes falla
  WHEN un visitante anónimo la abre
  THEN MUST NOT exponerse un detalle de infraestructura
  AND el comportamiento MUST ser el mismo que antes de este cambio
