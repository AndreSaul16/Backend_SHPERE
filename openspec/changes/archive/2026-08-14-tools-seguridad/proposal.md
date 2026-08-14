# Proposal: tools-seguridad — cerrar la fuga entre clientes y dejar de mentir sobre las herramientas

> Base: `openspec/changes/lanzamiento-v1/auditoria-herramientas.md`. Cada afirmación re-verificada contra `feat/lanzamiento-e2e`.
> Baseline verificada en esta sesión: backend **338 passed** (9,5 s) y frontend **827 passed / 101 ficheros** (29 s).

## Intent

Los primeros usuarios deciden si invierten. Hoy el catálogo de 28 herramientas **filtra datos entre clientes**, **pinta ✅ verde cuando la acción no ocurrió** y **ejecuta borrados sin preguntar**. Ninguno es cosmético: los tres producen un resultado creíble y falso, y el primero es una brecha.

## Scope

### In Scope

| # | Commit | Qué cierra | Evidencia re-verificada |
|---|---|---|---|
| **C1** | `fix(tools): aislar por usuario las tareas delegadas del CEO` | S1. `owner_user_id` obligatorio al escribir y en **toda** lectura | `ceo_tools.py:52-62` no lo escribe; `:83-92` query `{}`; `:110-112` global. Índice `(owner_user_id, status, priority)` ya existe en `backend/main.py:230-233` |
| **C2** | `fix(stream): un error de herramienta en string es un fallo` | S2. Error string ⇒ tarjeta roja, salvo `confirmation_required` | `stream.py:52` `parsed.get("error") is True`; los errores reales son strings (`credential_injector.py:67`, `oauth_tools.py:44`) |
| **C3** | `fix(tools): exigir confirmación en calendario y WhatsApp` | S3. Gate en las 4 destructivas sin puerta | `shared_tools.py:24` importa solo `get_current_user_id`; `grep requires_confirmation` → solo `cmo_tools` (3) y `oauth_tools` (2) |
| **C4** | `fix(tools): retirar del catálogo las 5 herramientas rotas` | S4. 28 → 23 herramientas reales | `jules-*.json` → `api.jules.google`; `market-analysis.json:55` → `SECTOR`; `whatsapp-read.json:48` → `"method": "GET"` |
| **C5** | `feat(chat): etiquetar las 7 herramientas OAuth` | S5. Fin de `slack_post_message` en crudo | `ToolExecutionCard.tsx:14-41`: 0 entradas `github_*`/`slack_*`/`notion_*` |

### Out of Scope

- **S6 (`tool_audit_log`)**: no entra. Ver decisión abajo.
- **Herramientas en la Junta** (`tool_node` en ambos grafos): dependencia declarada, no se toca.
- Modal de confirmación, OAuth para WhatsApp/LinkedIn/Instagram, troceado de `notion_update_page`, normalización de `is_authorized`, parámetros decorativos (`period`, `date_range`).

**No se toca**: esquema de Mongo (C1 solo añade campo a documentos nuevos), auth, créditos, aristas del grafo de LangGraph, DESIGN.md, ni el flujo de la Junta.

## Decisión S3 — se restaura el modelo **conversacional**, no el modal

El gate que ya está en producción para 5 herramientas: `confirmed: bool` en el `args_schema` → `{"error": "confirmation_required", "hint": ...}` → el agente pregunta → el usuario acepta → reinvoca con `confirmed=True` (`cmo_tools.py:27-45,122`; `oauth_tools.py:56-70,153`). Cubierto por `test_oauth_tools.py:102-105`.

- Es el único modelo que existe de punta a punta. El modal exige evento SSE nuevo, estado pendiente en el store y reinvocación de un `tool_call` concreto: nada de eso existe hoy.
- **En la Junta el modal sería peor**: un diálogo bloqueando un debate de 4 agentes que nadie está mirando congela la función estrella.
- Hoy la pregunta ni siquiera se plantea en debate: **en la Junta no se ejecuta ninguna herramienta** (`orchestrator.py:475-476` `if tools and not state.get("board_mode")`; `board_v2.py` → 0 coincidencias de `bind_tools|ToolNode`). Por eso la decisión de la Junta es **dependencia, no bloqueo**.

**Límite conocido que se declara, no se oculta**: `tool_confirmation_level: "always"` seguirá sin cubrir las 23 herramientas — solo las que consultan el gate. C3 lo lleva de 5 a 9. El copy del ajuste debe dejar de prometer «todas».
**Precisión sobre la auditoría**: `docs/FUNCIONALIDADES.md:245` dice que la preferencia «nadie la lee». Es inexacto: `orchestrator.py:566-580` la lee y la inyecta en el contextvar. Lo que falla es que 19 de 28 herramientas no la consultan.

## Decisión S4 — retirar las cinco, ninguna se arregla ahora

| Herramienta | Recomendación | Por qué |
|---|---|---|
| `create_jules_task`, `check_jules_status`, `review_jules_output` | **Retirar** | Migrar a `jules.googleapis.com` es una integración nueva (auth + `v1alpha/sessions`) imposible de probar en días. Agrava que el «test de conexión» devuelve verde sin llamar a nada |
| `get_market_analysis` | **Retirar** | `function=SECTOR` está retirado por el proveedor; `sector`/`metrics` ni se envían. Sustituirlo es cambiar de endpoint y de contrato. `get_stock_data` (verificada OK) cubre la demo financiera |
| `whatsapp_read_messages` | **Retirar** | Los entrantes de Cloud API llegan por webhook, no por GET. Reimplementarlo es infraestructura de webhook + almacenamiento, no un parche |

Retirar = desregistrar + quitar de `TOOL_LABELS` + quitar de los prompts de rol + ocultar la credencial de Jules. Los JSON de n8n **se quedan en el repo**: reactivar es un revert, no una reescritura. Diferencia clave: retirar es un diff pequeño y reversible; arreglar es integración nueva sin forma de verificarla antes del lanzamiento.

## Decisión S1 — documentos huérfanos: **fallo cerrado, sin backfill**

Toda lectura llevará `owner_user_id`, así que los documentos ya escritos quedan **invisibles para todos**, incluido su autor. No se hace backfill a un dueño arbitrario: atribuiría datos de un cliente a otro. Purga opcional aparte — `delegate_task` no tiene consumidor (`grep agent_tasks` → solo `ceo_tools.py`, el índice, `conftest.py` y el backfill), así que esas tareas llevan en `pending` desde siempre y no valen nada.
**Incoherencia a corregir en C1**: `scripts/backfill_user_id.py:28` escribe `user_id` en `agent_tasks`, pero el índice de `backend/main.py:230` es sobre `owner_user_id`. Se unifica en `owner_user_id`.

## Decisión S6 — `tool_audit_log` va **después**, en su propio change

- Es la única de las seis que no arregla nada que el usuario pueda ver: es forense, no producto.
- Toca `dynamic_tool_node` (`orchestrator.py:544-582`), la ruta caliente de **toda** ejecución de herramienta, días antes del lanzamiento y sin un solo test hoy. Un fallo o una latencia ahí degrada las 23.
- El contraargumento honesto —«sin log no sabremos quién leyó qué»— no se sostiene: un log que empieza hoy no contiene el pasado, así que no ayuda a investigar la fuga que C1 cierra.
- Además arrastra una decisión sin cerrar: los argumentos incluyen contenido de mensajes y teléfonos. Guardarlos sin redacción crea un problema de datos personales. Eso merece su propio ciclo, no un apaño.

## Approach

Orden **C1 → C2 → C3 → C4 → C5**. C1 primero por ser seguridad. C2 antes que C3 porque es el instrumento: sin él, el estado de confirmación y cualquier fallo posterior se siguen viendo en verde. C2 debe tratar `confirmation_required` como estado propio, no como fallo — hoy se cuela solo porque el `is True` lo deja pasar; el arreglo ingenuo convertiría cada petición de confirmación en una ✗ roja con botón «Reintentar». C4 y C5 son diffs pequeños y de bajo riesgo, al final.

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `backend/app/infrastructure/tools/ceo_tools.py` | Modified | `owner_user_id` al escribir y en las dos lecturas |
| `backend/scripts/backfill_user_id.py` | Modified | `agent_tasks` pasa a `owner_user_id` |
| `backend/app/presentation/api/v1/stream.py` | Modified | `_tool_error_message` acepta error string; `confirmation_required` como estado propio |
| `backend/app/infrastructure/tools/shared_tools.py` | Modified | Gate + `confirmed` en las 4 destructivas |
| `backend/app/infrastructure/tools/{cto,cfo}_tools.py` | Removed | Desregistro de las 4 rotas (+ `whatsapp_read_messages` en `shared_tools.py`) |
| `backend/app/application/orchestrator.py` | Modified | Prompts de rol sin las herramientas retiradas |
| `frontend/src/components/chat/ToolExecutionCard.tsx` | Modified | +7 etiquetas OAuth, −5 retiradas, estado de confirmación |
| `frontend/src/store/chat/streamHandlers.ts` | Modified | Estado de confirmación en el placeholder |
| `backend/tests/test_tenant_isolation.py` | Modified | Caso de `agent_tasks` entre dos usuarios |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| C2 saca a la luz fallos que hoy se ven verdes: la demo puede llenarse de rojo | **Alta** | Es el objetivo, pero hay que recorrer el catálogo con credenciales reales antes de enseñarlo. Es la razón de poner C2 pronto y no la víspera |
| El LLM pone `confirmed=True` por su cuenta (prompt injection) | Media | Debilidad aceptada del modelo conversacional, ya vigente para las 5 en producción. El modal es el arreglo real, diferido |
| Retirar Jules deja al CTO sin herramientas propias salvo GitHub | Media | Las 3 de GitHub están verificadas y son mejor demo que un 404 |
| Documentos huérfanos invisibles alarman a alguien | Baja | Nadie los consumía; se documenta en el change |
| C1 rompe tests que asumen tareas sin dueño | Baja | Hoy no hay ni un test de las 3 del CEO — se escriben en C1 (`strict_tdd: true`) |

## Rollback Plan

Cinco commits independientes, `git revert` limpio en cualquier orden inverso. Sin migraciones, sin cambio de esquema (C1 solo añade campo a documentos nuevos), sin operación destructiva sobre datos. El índice de `owner_user_id` ya existe y es inocuo si se revierte. C4 no borra los workflows de n8n ni el código de las herramientas: solo desregistra, así que reactivar es revertir un commit. El de mayor alcance es C2 —cambia qué considera fallo toda la UI— y su reversión es una única función en `stream.py:36-54`.

## Dependencies

- **Bloqueante para cerrar el tema, no para este change**: decidir si la Junta debe ejecutar herramientas. Si sí, exige `tool_node` en los dos grafos (`orchestrator.py:969-1035`, `board_v2.py:584-647`) y una política de confirmación para un usuario que no está mirando. Mientras no se decida, queda bloqueado: cualquier UX de confirmación desatendida, y el copy honesto de producto («en junta los agentes deliberan; no actúan»). Lo que sí se cierra ya: el gate en 1-a-1, donde ocurre el 100 % de las ejecuciones reales de hoy.
- Verificación E2E de calendario/WhatsApp necesita n8n vivo y credenciales reales.

## Success Criteria

- [ ] Un test en `test_tenant_isolation.py` demuestra que el CEO de A no ve ninguna tarea de B (falla antes del arreglo).
- [ ] `whatsapp_send_message` sin `confirmed` devuelve `confirmation_required` y no llama a n8n.
- [ ] Una herramienta sin credencial pinta la tarjeta en rojo; una que pide confirmación **no** la pinta en rojo.
- [ ] `get_tools_for_role` no devuelve ninguna de las 5 retiradas, en ningún rol.
- [ ] Ninguna herramienta registrada carece de etiqueta en `TOOL_LABELS`.
- [ ] Backend ≥ 338 tests y frontend ≥ 827 en verde, más los nuevos.

## Capabilities

### New Capabilities
- `agent-tool-isolation`: toda herramienta que lee o escribe datos del usuario opera con `owner_user_id` obligatorio; sin contexto de usuario no devuelve nada.
- `tool-result-integrity`: lo que la UI afirma sobre una ejecución coincide con lo ocurrido — errores en string son fallos, `confirmation_required` es un estado propio, y toda herramienta registrada tiene etiqueta legible.
- `tool-confirmation`: qué herramientas exigen confirmación explícita, cómo se pide y qué significa cada nivel de `tool_confirmation_level`.
- `tool-catalog`: qué herramientas se registran, se anuncian en los prompts y se muestran; una herramienta que no puede funcionar no se registra.

### Modified Capabilities
None — ninguna spec existente (`billing-frontend`, `core-agents-endpoint`, `credit-system`, `infrastructure`, `model-provider-routing`, `rate-limiting`, `settings-page`) cubre herramientas ni aislamiento multi-tenant.
