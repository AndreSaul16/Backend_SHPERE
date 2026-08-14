# agent-tool-isolation

> **Source**: tools-seguridad (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Garantiza que las 3 herramientas del CEO sobre `agent_tasks` (`ceo_tools.py`) nunca cruzan datos entre usuarios: toda lectura filtra por el dueño, toda escritura lo sella y, sin usuario en contexto, no se abre consulta alguna contra Mongo. Campo canónico: **`owner_user_id`** (el índice de `backend/main.py:230` ya es sobre él). `U_A`/`U_B` = dos usuarios distintos.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| ATI-001 | Toda consulta a `agent_tasks` MUST incluir `owner_user_id == <usuario en contexto>` en el filtro; ninguna herramienta MAY devolver, contar ni describir un documento de otro usuario, ni siquiera revelando su existencia | 3 |
| ATI-002 | `delegate_task` MUST escribir `owner_user_id` con el usuario en contexto; MUST NOT insertar un documento sin ese campo | 2 |
| ATI-003 | Un documento sin `owner_user_id` MUST quedar invisible para todos, incluido su autor; el sistema MUST NOT asignarlo por backfill automático ni relajar el filtro con `$exists: false`, y la ausencia de resultados MUST presentarse como lista vacía | 3 |
| ATI-004 | Sin usuario en contexto, las 3 herramientas MUST NOT abrir consulta contra Mongo y MUST devolver `{"error": "user_context_missing", ...}`; MUST NOT propagar una excepción sin capturar al stream | 2 |
| ATI-005 | `agent_tasks` MUST usar `owner_user_id` en escritura, lectura, índice y `scripts/backfill_user_id.py`; el script MUST NOT escribir `user_id` en esa colección y MUST NOT formar parte del despliegue (ejecutarlo es una acción explícita del operador) | 2 |

### ATI-001: Ninguna lectura de `agent_tasks` cruza de usuario

- GIVEN `U_A` tiene 2 tareas `pending` y `U_B` tiene 3 tareas `pending`
  WHEN el contexto es `U_A` y se invoca `list_active_tasks`
  THEN el JSON devuelto tiene `count == 2`
  AND ningún `task_id` ni `description` de las tareas de `U_B` aparece en la salida

- GIVEN una tarea de `U_B` con `task_id == T`
  WHEN el contexto es `U_A` y se invoca `check_task_status(task_id=T)`
  THEN la salida es `{"tasks": [], "count": 0}` sin clave `error`
  AND no distingue «no existe» de «no es tuya»

- **Mutación**: GIVEN se elimina `owner_user_id` del filtro de las dos lecturas
  WHEN se ejecuta la suite
  THEN los dos escenarios anteriores MUST fallar
  AND si pasan, el test no observa nada y MUST reescribirse

### ATI-002: Toda escritura sella el dueño

- GIVEN contexto `U_A`
  WHEN se invoca `delegate_task` y después `list_active_tasks`
  THEN la tarea creada aparece en la lista de `U_A`
  AND el documento en Mongo tiene `owner_user_id == U_A`

- **Mutación**: GIVEN se elimina `owner_user_id` del documento insertado
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar, porque la tarea recién creada queda invisible para su propio autor (por ATI-003)

### ATI-003: Documentos huérfanos: fallo cerrado, sin backfill

- GIVEN 3 documentos sin `owner_user_id` y 1 de `U_A`, todos `pending`
  WHEN el contexto es `U_A` y se invoca `list_active_tasks`
  THEN `count == 1` y el único `task_id` devuelto es el de `U_A`

- GIVEN solo hay documentos huérfanos
  WHEN el contexto es `U_A` y se invoca `list_active_tasks`
  THEN la salida es `{"tasks": [], "count": 0}` sin clave `error`
  AND la UI la pinta como éxito con resultado vacío, no como tarjeta roja

- **Mutación**: GIVEN el filtro pasa a `{"$or": [{"owner_user_id": uid}, {"owner_user_id": {"$exists": false}}]}`
  WHEN se ejecuta la suite
  THEN el primer escenario de este requisito MUST fallar

### ATI-004: Sin contexto de usuario no se consulta nada

- GIVEN el contextvar de usuario está sin setear
  WHEN se invoca `list_active_tasks`
  THEN la salida contiene `"error": "user_context_missing"`
  AND no se ha ejecutado ninguna operación sobre la colección `agent_tasks`
  AND la UI la pinta en rojo (por TRI-002)

- **Mutación**: GIVEN se elimina la comprobación de contexto
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar por haberse consultado la colección

### ATI-005: Un solo nombre de campo para `agent_tasks`

- GIVEN un documento huérfano en `agent_tasks`
  WHEN se ejecuta el backfill con `owner_uid == U_A`
  THEN el documento queda con `owner_user_id == U_A`
  AND no se le añade `user_id`

- **Mutación**: GIVEN el script vuelve a escribir `user_id` en `agent_tasks`
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar
