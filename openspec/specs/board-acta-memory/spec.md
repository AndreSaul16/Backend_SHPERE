# board-acta-memory

> **Source**: artefactos-guardarrailes (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Garantiza que cada debate de la junta deje **un** acta vigente (`backend/app/application/board_v2.py`: `_save_acta`
`:262-278`, `_load_prior_actas_context` `:281-310`, llamada en `:646`). `_save_acta` hacía `insert_one`
incondicional: regenerar un debate tres veces dejaba **tres** actas y, como el CEO recibe «las 2 últimas de esta
junta» como contexto (`:295-300`), el debate siguiente arrancaba citando borradores descartados como si fueran
conclusiones firmes de la junta.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| BA-001 | Al cerrar un debate el sistema MUST persistir exactamente un acta vigente; una regeneración MUST reemplazar la más reciente de la sesión | 5 |
| BA-002 | `_load_prior_actas_context` MUST devolver como mucho las 2 actas vigentes más recientes de la misma sesión y usuario | 2 |
| BA-003 | El límite de regenerar desde un turno que no es el último MUST estar declarado y fijado por un test | 1 |

### BA-001: Un Debate, un Acta Vigente

Al cerrar un debate, el sistema MUST persistir exactamente **un** acta vigente por debate.

Cuando el debate es una **regeneración** (`board_regenerate` verdadero en el estado, `board_v2.py:316` y `:657-661`),
el sistema MUST reemplazar el acta más reciente de esa sesión en vez de insertar una nueva.

Cuando **no** es una regeneración, el sistema MUST insertar un acta nueva.

El documento reemplazado MUST conservar su `created_at` original y MUST registrar la fecha del reemplazo en un
campo `updated_at`.

El aislamiento estricto por `user_id` **y** `session_id` MUST mantenerse en la escritura y en la lectura.

La persistencia MUST seguir siendo tolerante a fallos: un error al guardar el acta MUST NOT romper el debate
(garantía actual, `:277-278`).

- GIVEN un debate cerrado que ha guardado su acta
  WHEN el usuario lo regenera dos veces más
  THEN la colección MUST contener exactamente un acta para esa sesión
  AND su contenido MUST ser el de la última regeneración

- GIVEN una sesión con un acta ya guardada de un debate anterior
  WHEN el usuario plantea una pregunta nueva a la junta y el debate se cierra
  THEN la colección MUST contener dos actas para esa sesión
  AND el acta anterior MUST conservar su contenido

- GIVEN un acta creada y luego regenerada
  WHEN se lee el documento
  THEN `created_at` MUST ser la de la creación original
  AND `updated_at` MUST ser la del reemplazo

- GIVEN dos usuarios con actas en sesiones distintas
  WHEN uno regenera su debate
  THEN MUST NOT verse afectada ninguna acta del otro usuario ni de otra sesión

- GIVEN una escritura de acta que lanza una excepción
  WHEN el nodo de síntesis termina
  THEN el debate MUST completarse
  AND el fallo MUST registrarse en el log

### BA-002: El Contexto del CEO Cita Actas Vigentes

`_load_prior_actas_context` MUST seguir devolviendo como mucho las 2 actas más recientes de la misma sesión, del
mismo usuario, acotadas a `max_chars`.

Tras BA-001, esas actas MUST ser actas vigentes: MUST NOT incluir borradores reemplazados por una regeneración.

El fallo al leer actas anteriores MUST seguir devolviendo contexto vacío sin romper el debate (garantía actual,
`:301-303`).

- GIVEN un debate regenerado dos veces en una sesión
  WHEN el usuario plantea una pregunta nueva a la junta
  THEN el contexto que recibe el CEO MUST citar el acta que quedó vigente
  AND MUST NOT citar ninguna de las versiones reemplazadas

- GIVEN una sesión sin actas
  WHEN se compone la apertura del CEO
  THEN el contexto de actas anteriores MUST ser vacío

### BA-003: Límite Declarado — Regeneración Desde un Turno Que No es el Último

La regla de BA-001 identifica el debate a reemplazar como **el acta más reciente de la sesión**.

Cuando el usuario regenera desde un turno de junta que **no** es el último —`regenerateFromId` trunca el hilo desde esa
burbuja (`frontend/src/store/chat/messagesSlice.ts:78-81`)— las actas de los debates descartados entre medias
**quedan huérfanas**: no se borran.

Este límite MUST estar declarado y MUST estar fijado por un test, para que sea una decisión conocida y no un
descubrimiento en producción. Cerrarlo por completo exige sellar un identificador de debate en el acta y en el
checkpoint, y MUST NOT hacerse en este cambio.

- GIVEN una sesión con dos debates cerrados y sus dos actas
  WHEN el usuario regenera desde el **primero** de los dos
  THEN el acta más reciente MUST haber sido reemplazada
  AND el acta del debate intermedio MAY quedar huérfana
  AND ese comportamiento MUST estar cubierto por un test que lo documente
