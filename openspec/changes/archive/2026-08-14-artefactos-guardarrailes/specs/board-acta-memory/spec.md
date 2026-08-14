# Spec (delta): board-acta-memory

> Capacidad **nueva**. Cubre el riesgo **#21**.
> Ámbito: `backend/app/application/board_v2.py` (`_save_acta` `:262-278`, `_load_prior_actas_context` `:281-310`,
> llamada en `:646`).
> RFC 2119. Escenarios en Given/When/Then.

## El defecto que se cierra

`_save_acta` hace `insert_one` incondicional. Regenerar un debate tres veces deja **tres** actas. Como el CEO recibe
«las 2 últimas de esta junta» como contexto (`:295-300`), el debate siguiente arranca citando borradores descartados
como si fueran conclusiones firmes de la junta.

---

## BA-001 — Un debate, un acta vigente

Al cerrar un debate, el sistema **MUST** persistir exactamente **un** acta vigente por debate.

Cuando el debate es una **regeneración** (`board_regenerate` verdadero en el estado, `board_v2.py:316` y `:657-661`),
el sistema **MUST** reemplazar el acta más reciente de esa sesión en vez de insertar una nueva.

Cuando **no** es una regeneración, el sistema **MUST** insertar un acta nueva.

El documento reemplazado **MUST** conservar su `created_at` original y **MUST** registrar la fecha del reemplazo en un
campo `updated_at`.

El aislamiento estricto por `user_id` **y** `session_id` **MUST** mantenerse en la escritura y en la lectura.

La persistencia **MUST** seguir siendo tolerante a fallos: un error al guardar el acta **MUST NOT** romper el debate
(garantía actual, `:277-278`).

#### Escenario: regenerar tres veces deja un acta

- **Given** un debate cerrado que ha guardado su acta
- **When** el usuario lo regenera dos veces más
- **Then** la colección **MUST** contener exactamente un acta para esa sesión
- **And** su contenido **MUST** ser el de la última regeneración

#### Escenario: un debate nuevo no pisa al anterior

- **Given** una sesión con un acta ya guardada de un debate anterior
- **When** el usuario plantea una pregunta nueva a la junta y el debate se cierra
- **Then** la colección **MUST** contener dos actas para esa sesión
- **And** el acta anterior **MUST** conservar su contenido

#### Escenario: la fecha refleja la última regeneración

- **Given** un acta creada y luego regenerada
- **When** se lee el documento
- **Then** `created_at` **MUST** ser la de la creación original
- **And** `updated_at` **MUST** ser la del reemplazo

#### Escenario: el aislamiento no se rompe

- **Given** dos usuarios con actas en sesiones distintas
- **When** uno regenera su debate
- **Then** **MUST NOT** verse afectada ninguna acta del otro usuario ni de otra sesión

#### Escenario: un fallo al guardar no rompe el debate

- **Given** una escritura de acta que lanza una excepción
- **When** el nodo de síntesis termina
- **Then** el debate **MUST** completarse
- **And** el fallo **MUST** registrarse en el log

---

## BA-002 — El contexto del CEO cita actas vigentes

`_load_prior_actas_context` **MUST** seguir devolviendo como mucho las 2 actas más recientes de la misma sesión, del
mismo usuario, acotadas a `max_chars`.

Tras BA-001, esas actas **MUST** ser actas vigentes: **MUST NOT** incluir borradores reemplazados por una regeneración.

El fallo al leer actas anteriores **MUST** seguir devolviendo contexto vacío sin romper el debate (garantía actual,
`:301-303`).

#### Escenario: el debate siguiente no cita borradores

- **Given** un debate regenerado dos veces en una sesión
- **When** el usuario plantea una pregunta nueva a la junta
- **Then** el contexto que recibe el CEO **MUST** citar el acta que quedó vigente
- **And** **MUST NOT** citar ninguna de las versiones reemplazadas

#### Escenario: sin actas previas no hay contexto

- **Given** una sesión sin actas
- **When** se compone la apertura del CEO
- **Then** el contexto de actas anteriores **MUST** ser vacío

---

## BA-003 — Límite declarado: regeneración desde un turno que no es el último

La regla de BA-001 identifica el debate a reemplazar como **el acta más reciente de la sesión**.

Cuando el usuario regenera desde un turno de junta que **no** es el último —`regenerateFromId` trunca el hilo desde esa
burbuja (`frontend/src/store/chat/messagesSlice.ts:78-81`)— las actas de los debates descartados entre medias
**quedan huérfanas**: no se borran.

Este límite **MUST** estar declarado y **MUST** estar fijado por un test, para que sea una decisión conocida y no un
descubrimiento en producción. Cerrarlo por completo exige sellar un identificador de debate en el acta y en el
checkpoint, y **MUST NOT** hacerse en este cambio.

#### Escenario: el límite es conocido y está fijado

- **Given** una sesión con dos debates cerrados y sus dos actas
- **When** el usuario regenera desde el **primero** de los dos
- **Then** el acta más reciente **MUST** haber sido reemplazada
- **And** el acta del debate intermedio **MAY** quedar huérfana
- **And** ese comportamiento **MUST** estar cubierto por un test que lo documente
