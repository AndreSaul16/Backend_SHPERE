# Delta for agent-tool-isolation

Capacidad nueva: todo es ADDED. Alcance: las 3 herramientas del CEO sobre `agent_tasks`
(`ceo_tools.py`) y el campo de propiedad. `U_A`/`U_B` = dos usuarios distintos.
Campo canónico: **`owner_user_id`** (el índice de `backend/main.py:230` ya es sobre él).

## ADDED Requirements

### Requirement: ATI-001 — Ninguna lectura de `agent_tasks` cruza de usuario

Toda consulta a `agent_tasks` **MUST** incluir `owner_user_id == <usuario en contexto>` en el
filtro enviado a Mongo. Ninguna herramienta **MAY** devolver, contar ni describir un documento
de otro usuario, ni siquiera revelando su existencia.

#### Scenario: El CEO de A no ve ninguna tarea de B

- GIVEN `U_A` tiene 2 tareas `pending` y `U_B` tiene 3 tareas `pending`
- WHEN el contexto es `U_A` y se invoca `list_active_tasks`
- THEN el JSON devuelto tiene `count == 2`
- AND ningún `task_id` ni `description` de las tareas de `U_B` aparece en la salida

#### Scenario: `task_id` ajeno no confirma ni desmiente

- GIVEN una tarea de `U_B` con `task_id == T`
- WHEN el contexto es `U_A` y se invoca `check_task_status(task_id=T)`
- THEN la salida es `{"tasks": [], "count": 0}` sin clave `error`
- AND no distingue «no existe» de «no es tuya»

#### Scenario: Mutación — el filtro debe ser observable

- GIVEN se elimina `owner_user_id` del filtro de las dos lecturas
- WHEN se ejecuta la suite
- THEN los dos escenarios anteriores **MUST** fallar
- AND si pasan, el test no observa nada y **MUST** reescribirse

### Requirement: ATI-002 — Toda escritura sella el dueño

`delegate_task` **MUST** escribir `owner_user_id` con el usuario en contexto en el documento
insertado. **MUST NOT** insertar un documento sin ese campo.

#### Scenario: Ida y vuelta dentro del mismo usuario

- GIVEN contexto `U_A`
- WHEN se invoca `delegate_task` y después `list_active_tasks`
- THEN la tarea creada aparece en la lista de `U_A`
- AND el documento en Mongo tiene `owner_user_id == U_A`

#### Scenario: Mutación — quitar el sellado rompe la ida y vuelta

- GIVEN se elimina `owner_user_id` del documento insertado
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar, porque la tarea recién creada queda invisible
  para su propio autor (por ATI-003)

### Requirement: ATI-003 — Documentos huérfanos: fallo cerrado, sin backfill

Un documento de `agent_tasks` sin `owner_user_id` **MUST** quedar invisible para todos los
usuarios, incluido su autor. El sistema **MUST NOT** asignarlo a un dueño, ni por backfill
automático, ni relajando el filtro con `$exists: false`. La ausencia de resultados **MUST**
presentarse como lista vacía, no como error.

#### Scenario: Huérfanas invisibles junto a tareas con dueño

- GIVEN 3 documentos sin `owner_user_id` y 1 de `U_A`, todos `pending`
- WHEN el contexto es `U_A` y se invoca `list_active_tasks`
- THEN `count == 1` y el único `task_id` devuelto es el de `U_A`

#### Scenario: El usuario ve vacío, no un fallo

- GIVEN solo hay documentos huérfanos
- WHEN el contexto es `U_A` y se invoca `list_active_tasks`
- THEN la salida es `{"tasks": [], "count": 0}` sin clave `error`
- AND la UI la pinta como éxito con resultado vacío, no como tarjeta roja

#### Scenario: Mutación — relajar el filtro debe romper la suite

- GIVEN el filtro pasa a `{"$or": [{"owner_user_id": uid}, {"owner_user_id": {"$exists": false}}]}`
- WHEN se ejecuta la suite
- THEN el primer escenario de este requisito **MUST** fallar

### Requirement: ATI-004 — Sin contexto de usuario no se consulta nada

Si no hay usuario en el contexto de ejecución, las 3 herramientas del CEO **MUST NOT** abrir
consulta alguna contra Mongo y **MUST** devolver `{"error": "user_context_missing", ...}`.
**MUST NOT** propagar una excepción sin capturar al stream.

#### Scenario: Contexto vacío no toca la base

- GIVEN el contextvar de usuario está sin setear
- WHEN se invoca `list_active_tasks`
- THEN la salida contiene `"error": "user_context_missing"`
- AND no se ha ejecutado ninguna operación sobre la colección `agent_tasks`
- AND la UI la pinta en rojo (por TRI-002)

#### Scenario: Mutación — quitar la guarda debe romper la suite

- GIVEN se elimina la comprobación de contexto
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar por haberse consultado la colección

### Requirement: ATI-005 — Un solo nombre de campo para `agent_tasks`

`agent_tasks` **MUST** usar `owner_user_id` en escritura, lectura, índice y en
`scripts/backfill_user_id.py`. El script **MUST NOT** escribir `user_id` en esa colección.
Ejecutarlo es una acción explícita del operador; **MUST NOT** formar parte del despliegue.

#### Scenario: El script unifica en el campo del índice

- GIVEN un documento huérfano en `agent_tasks`
- WHEN se ejecuta el backfill con `owner_uid == U_A`
- THEN el documento queda con `owner_user_id == U_A`
- AND no se le añade `user_id`

#### Scenario: Mutación — volver a `user_id` deja el documento invisible

- GIVEN el script vuelve a escribir `user_id` en `agent_tasks`
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar
