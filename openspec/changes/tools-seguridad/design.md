# Design: tools-seguridad

> Base: `proposal.md` + las 4 delta specs (17 requisitos, 40 escenarios). Cada afirmación de
> este documento está verificada en `feat/lanzamiento-e2e`; lo no verificado se marca
> **[hipótesis]**. No se ejecutó ningún build.

## Technical Approach

Cinco commits (C1→C5). El hilo conductor es mover la garantía de «hay que acordarse» a «no
se puede olvidar»: el filtro de propiedad se hereda del único acceso posible (C1), los tres
estados salen de **una** función clasificadora (C2), el gate se aplica **al registrar** y no
dentro de cada herramienta (C3), la retirada es un dato de una línea (C4) y la paridad de
catálogo la vigila un test que lee las dos fuentes reales (C5).

Restricción rectora: **no se toca `dynamic_tool_node`** (`orchestrator.py:544-583`). Es la ruta
caliente de las 23 ejecuciones y es la razón por la que S6 se difirió; meter ahí el gate
contradiría esa decisión ya tomada.

---

## Architecture Decisions

### D1 — El gate de confirmación vive en el registro

**Choice**: módulo nuevo `backend/app/infrastructure/tools/confirmation.py` con
`apply_confirmation_gate(tool) -> BaseTool`, invocado desde `register_shared_tool` y
`register_role_tool` (`registry.py:19-28`). Si `tool.name ∈ DESTRUCTIVE_TOOLS` **y** su
`args_schema` no declara ya `confirmed`, devuelve un `StructuredTool` nuevo con:

1. `args_schema = create_model(f"{orig.__name__}Confirmable", __base__=orig, confirmed=(bool, Field(False, description=...)))`
2. una corrutina envoltorio `async def _gated(**kwargs)` que hace `kwargs.pop("confirmed", False)`,
   consulta `requires_confirmation(name)` y devuelve `_confirmation_required_error(...)` **antes**
   de llamar a la corrutina original.

Verificado en esta fase con el stack real (pydantic 2.13.4 · langchain-core 1.4.0):
`tool.args_schema` es la clase, `tool_call_schema` incluye `confirmed` (el LLM lo ve) y una
corrutina `**kwargs` se invoca correctamente por `ainvoke`. El límite del evento
`on_tool_start`/`on_tool_end` no cambia: mismo nombre, misma tarjeta.

Los resúmenes legibles viven en el mismo módulo, `CONFIRMATION_SUMMARIES: dict[str, Callable]`,
con entrada para las 4 nuevas. El fallback compone el resumen **solo con los argumentos**, nunca
con el identificador técnico (lo prohíbe TRI-004).

| Alternativa descartada | Por qué |
|---|---|
| Decorador por función | Sigue exigiendo editar las 9 herramientas **y** sus 9 `args_schema`. Olvidarse sigue siendo posible: es exactamente la forma del bug que se arregla |
| Comprobación en `dynamic_tool_node` | Dos fallos: (a) es la ruta caliente que S6 evitó tocar; (b) si el nodo corta antes de `ToolNode`, no hay `on_tool_start`/`on_tool_end` → **la tarjeta no aparece** y el usuario no ve nada que confirmar |
| Envolver siempre, incluidas las 5 en producción | Sustituiría sus resúmenes en castellano por uno genérico y pondría en riesgo 5 herramientas que hoy funcionan (`test_oauth_tools.py:101-105`), a días del lanzamiento. Saltarlas deja su diff en cero |

**Hueco residual, declarado**: una herramienta que declare `confirmed` y no lo consulte no la
caza la estructura. Lo cierra el test de TC-002, que recorre `DESTRUCTIVE_TOOLS` e invoca cada
una sin `confirmed`.

### D2 — El tercer estado viaja como cuarto marcador

El transporte real **no es el evento SSE**: `streamHandlers.ts:111-125` escribe marcadores de
texto en el contenido de la burbuja y `parseMessageParts.ts:50` los parsea con regex. Son 5
saltos, y hay que tocar los 5 o el estado se pierde por el camino.

```
tool devuelve JSON                                        (backend)
   │ {"error":"confirmation_required","action_summary":S}
   ▼
stream.py  _classify_tool_output(raw) → ("confirmation", S)
   │ SSE: {"type":"tool_confirmation","tool_name":N,"summary":S}
   ▼
api.ts     rama nueva → callbacks.onToolConfirmation?.({tool_name, summary})
   ▼
streamHandlers.ts  anadirALaActiva(`\n[TOOL_CONFIRM:${N}:${safeS}]\n`)
   ▼
parseMessageParts.ts  → { tipo:'utensilio', estado:'awaiting_confirmation', resumen:S }
   ▼
ToolExecutionCard.tsx  ni ✓ ni ✗ · sin «Reintentar» · muestra S
```

`_tool_error_message` (`stream.py:36-54`) se sustituye por `_classify_tool_output(raw) ->
tuple[Literal["result","error","confirmation"], str]`. Un único punto de decisión ⇒ ningún par
de estados puede compartir evento (TRI-001).

Detalles que no son opcionales:
- El saneado del resumen es el mismo que el de `TOOL_ERROR`: `replace(/[\]\n\r]/g, ' ')`. El
  regex de `parseMessageParts` usa `[^\]]*` para la carga y `[^:]+` para el nombre.
- `citaLlana.ts:25` **debe** incluir `TOOL_CONFIRM` en `MARCADORES` o el marcador se cuela
  crudo en las citas en texto llano.
- `ToolExecutionCardProps['status']` y `ParteDelTurno.estado` pasan de 3 a 4 valores. TypeScript
  estricto convierte cada consumidor no actualizado en error de compilación: eso es la red.

| Alternativa descartada | Por qué |
|---|---|
| Reutilizar `tool_error` con un flag `kind` | Cualquier consumidor que no lea el flag pinta rojo. Además `isFailed` se deriva de `status`, así que el flag habría que enhebrarlo por los mismos 4 saltos: mismo coste, peor contrato |
| Heurística sobre el texto (`error.startsWith('confirmation')`) | Prohibido explícitamente por TRI-001 |

### D3 — El puente entre lenguajes: un pytest que lee el `.tsx`

**Choice**: (a) extraer `TOOL_LABELS` de `ToolExecutionCard.tsx:14-41` a
`frontend/src/components/chat/toolLabels.ts` (diff de 2 líneas en el componente; hoy no se usa
en ningún otro sitio — verificado); (b) `backend/tests/test_tool_catalog.py` que:

1. `load_all_tools()` y compone `C` = nombres de `SHARED_TOOLS` ∪ todos los valores de
   `ROLE_TOOLS` (el registry real, no `get_tools_for_role` con roles escritos a mano).
2. Lee `toolLabels.ts` y extrae `L` con un regex de claves (`^\s*['"]?(\w+)['"]?\s*:`).
3. Asserta `C - L == ∅` **y** `L - C == ∅`, nombrando las herramientas que sobran o faltan.
4. **Auto-comprobación**: si el fichero no existe o se extraen 0 claves, **falla**. Nunca
   `pytest.skip` — un skip es justo el «test que no puede fallar» que rechaza TCAT-003.

**Coste de mantenimiento, dicho sin adornos**: un regex acoplado al formato de un fichero de
~30 líneas de un solo propósito. Si alguien lo reescribe como objeto calculado o lo mueve, el
test falla y hay que arreglar el regex. Ese es el precio; a cambio no hay paso de sincronización
que nadie pueda olvidar.

| Alternativa descartada | Por qué |
|---|---|
| Manifiesto JSON generado y commiteado | Inmune al formato, pero añade script generador + paso de sync + un modo de fallo nuevo («manifiesto obsoleto») que se arregla regenerando sin mirar. Tres artefactos que mantener en vez de uno |
| Test de frontend que lea el Python | Exigiría un parser de Python en TS o un subproceso; vitest/jsdom es el sitio equivocado |

**Guarda extra, mismo test, coste cero**: `SERVICE_CATALOG[*]["tools"]` (`auth.py:~300-345`) ⊆ `C`.
Es la tercera lista de nombres mantenida a mano y es la que se enseña en Settings → Connections.

### D4 — `owner_user_id` no se aplica: se hereda del único acceso posible

Se **borra** `_get_tasks_collection()` (`ceo_tools.py:16-17`). En su lugar:

```python
def _scoped_tasks(tool_name: str) -> tuple[Optional["_ScopedTasks"], Optional[str]]:
    uid = get_current_user_id()
    if not uid:                       # ANTES de db.get_async_db(): ATI-004 exige que no se
        return None, _user_context_missing_error(tool_name)   # abra consulta alguna
    return _ScopedTasks(db.get_async_db()["agent_tasks"], uid), None
```

`_ScopedTasks` expone solo `find(query)` —que devuelve `{**query, "owner_user_id": self.uid}`—
e `insert_one(doc)` —que sella `owner_user_id`—. Al no quedar ningún handle sin ámbito en el
módulo, una cuarta lectura futura **no puede** olvidar el filtro: no hay forma de obtener la
colección cruda. Escritura sellada por la misma vía: `_delegate_task` ya no construye el dueño.

**Gotcha para la fase apply**: en `_check_task_status`, la guarda `if not query:` (`:89-90`) debe
evaluarse sobre los argumentos del llamante **antes** de mezclar el dueño; si se evalúa después,
queda código muerto y el mensaje «Debes proporcionar task_id o assigned_to» no sale nunca.

`scripts/backfill_user_id.py:43-47`: `agent_tasks` pasa de la rama `user_id` a la de
`owner_user_id` (la misma que `custom_agents`). Sin backfill en despliegue (ATI-003/ATI-005).

| Alternativa descartada | Por qué |
|---|---|
| Añadir `"owner_user_id": uid` a las 2 queries | Es la forma exacta del bug que se arregla: funciona hasta que alguien escribe la tercera lectura |
| Filtro global en la capa Motor | Motor no ofrece hook por colección; exigiría subclasear toda la capa de base de datos |

### D5 — La retirada es un dato, no un comentario

`RETIRED_TOOLS: dict[str, str]` en `registry.py`, nombre → motivo en una línea (con referencia a
la auditoría). `register_shared_tool` y `register_role_tool` ignoran cualquier herramienta cuyo
nombre esté ahí. **Reactivar = borrar una línea.** El código de las herramientas, sus esquemas y
los JSON de n8n se quedan intactos (TCAT-001).

Lo que el skip-list **no** cubre y hay que editar aparte: los prompts de rol
(`orchestrator.py:181, 196-198, 206, 232, 249, 257`), `TOOL_LABELS` (−5) y
`SERVICE_CATALOG`: se borra el bloque `jules` entero y `whatsapp_read_messages` de la lista de
`whatsapp` (`auth.py`).

**Descartado**: comentar los bloques `register_*` → reactivar son 6 líneas, el motivo vive en un
comentario que nadie indexa y ningún test puede leer un comentario.

### D6 — Orden de commits y qué verifica cada uno

| # | Commit | Qué se verifica antes de pasar al siguiente |
|---|---|---|
| **C1** | `fix(tools): aislar por usuario las tareas delegadas del CEO` | Test nuevo en `test_tenant_isolation.py`: A no ve nada de B; huérfanas invisibles; sin contexto no se toca Mongo (espía sobre la colección). Los 3 escenarios de mutación deben romper la suite. Backend ≥ 338 + nuevos |
| **C2** | `fix(stream): un error de herramienta en string es un fallo` | Primer test de `_classify_tool_output` (hoy hay **cero**): string → `tool_error`, `True` → `tool_error`, `confirmation_required` → `tool_confirmation`. Frontend: `parseMessageParts` con `[TOOL_CONFIRM:…]`, `caracterizacionStream` con `onToolConfirmation`, tarjeta sin ✓, sin ✗ y sin «Reintentar». Es el instrumento: sin él C3 se ve verde |
| **C3** | `fix(tools): exigir confirmación en calendario y WhatsApp` | TC-002 recorriendo `DESTRUCTIVE_TOOLS` (9/9 devuelven `confirmation_required` sin `confirmed`); `calendar_delete_event` no llama a n8n; `confirmed=True` no abre la whitelist; los 5 de oauth/cmo siguen en verde sin cambios |
| **C4** | `fix(tools): retirar del catálogo las 5 herramientas rotas` | Catálogo = 23 nombres distintos; ningún rol (ni uno no declarado) recibe las 5; ningún prompt las nombra; Jules fuera de `SERVICE_CATALOG` |
| **C5** | `feat(chat): etiquetar las 7 herramientas OAuth` | `test_tool_catalog.py` en verde: `C == L` en los dos sentidos, con las 7 OAuth añadidas y las 5 retiradas fuera. Copy de `tool_confirmation_level` acotado (TC-004) |

C2 antes que C3 no es preferencia: sin C2, la petición de confirmación de C3 se pinta **verde**
(hoy `parsed.get("error") is True` la deja pasar como éxito) y no habría forma de ver el gate.

### D7 — El riesgo alto: qué se pone rojo, y qué revisar antes de una demo

**Corrección sobre la hipótesis intuitiva**: los fallos de n8n **ya se ven rojos** hoy —
`n8n_client.py:89, 98, 123, 175, 190` devuelve `{"error": True, "message": …}` y `is True` lo
detecta. Lo que hoy se ve **verde y no debería** es solo la familia de errores en string:

| Payload que hoy pinta ✓ verde | Herramientas afectadas |
|---|---|
| `{"error": "<servicio>_not_configured"}` (`credential_injector.py:65-73`) | calendario ×5, linkedin ×2, instagram ×2, jules ×3, financial ×3 |
| `{"error": "whatsapp_not_configured"}` (`shared_tools.py:261-274`) | whatsapp ×3 |
| `{"error": "contact_not_authorized"}` (`shared_tools.py:35-48`) | `whatsapp_send_message`, `whatsapp_send_notification`, `calendar_create_event` |
| `{"error": "missing_user_context"}` (`shared_tools.py:51-60`) | las 2 de whatsapp |
| errores de OAuth (`oauth_tools.py:44`) | las 7 de GitHub/Slack/Notion |
| `{"error": "confirmation_required"}` | las 5 con gate hoy, las 9 tras C3 |

**Qué se rompe visualmente**: la tarjeta pasa de fondo `surface-3` con ✓ verde y JSON desplegable
a fondo `oxblood-500/5`, borde rojo, ✗, el sufijo «— falló» y **un botón «Reintentar»**
(`ToolExecutionCard.tsx:130-168`). Un usuario sin credenciales conectadas verá un hilo lleno de
tarjetas rojas donde antes veía éxitos. Ese botón, además, envía un mensaje nuevo al agente:
gasta crédito y puede encadenar reintentos sobre un fallo permanente (falta de credencial).

**Segundo efecto, conductual, no visual**: con el valor por defecto `destructive_only`, tras C3
`calendar_create_event` y `calendar_delete_event` **preguntan antes**. Un guion de demo que diga
«crea la reunión de mañana» pasa de un turno a dos, con su llamada extra al LLM y su crédito.

**Revisar antes de enseñarlo** (no es opcional; es la razón de poner C2 pronto y no la víspera):
1. Recorrer las 23 con credenciales reales y anotar cuáles quedan rojas.
2. Confirmar que los webhooks de n8n del guion están registrados y responden.
3. Conectar Google y WhatsApp en la cuenta de demo, o retirar esas herramientas del guion.
4. Reescribir el guion incluyendo el «sí, confírmalo» de las destructivas.
5. Decidir si el botón «Reintentar» se oculta para errores no reintentables (`*_not_configured`)
   — **fuera de alcance de este cambio**, pero es la primera cosa que un espectador va a pulsar.

---

## File Changes

| Fichero | Acción | Qué cambia | Commit |
|---|---|---|---|
| `backend/app/infrastructure/tools/ceo_tools.py` | Modify | `_scoped_tasks` + `_ScopedTasks`; se borra `_get_tasks_collection` | C1 |
| `backend/scripts/backfill_user_id.py` | Modify | `agent_tasks` → rama `owner_user_id` | C1 |
| `backend/tests/test_tenant_isolation.py` | Modify | Casos de `agent_tasks` A/B, huérfanas y sin contexto | C1 |
| `backend/app/presentation/api/v1/stream.py` | Modify | `_tool_error_message` → `_classify_tool_output`; evento `tool_confirmation` | C2 |
| `backend/tests/test_stream_tool_events.py` | Create | Primeros tests de la clasificación | C2 |
| `frontend/src/services/api.ts` | Modify | `onToolConfirmation` + rama SSE | C2 |
| `frontend/src/store/chat/streamHandlers.ts` | Modify | Marcador `[TOOL_CONFIRM:…]` saneado | C2 |
| `frontend/src/utils/parseMessageParts.ts` | Modify | 5º grupo en el regex + `estado: 'awaiting_confirmation'` | C2 |
| `frontend/src/utils/citaLlana.ts` | Modify | `TOOL_CONFIRM` en `MARCADORES` | C2 |
| `frontend/src/components/chat/ToolExecutionCard.tsx` | Modify | 4º estado; sin ✓/✗ ni «Reintentar»; `TOOL_LABELS` sale del fichero | C2/C5 |
| `backend/app/infrastructure/tools/confirmation.py` | Create | `apply_confirmation_gate`, `_confirmation_required_error`, `CONFIRMATION_SUMMARIES` | C3 |
| `backend/app/infrastructure/tools/registry.py` | Modify | Llamada al gate en los 2 `register_*` + `RETIRED_TOOLS` | C3/C4 |
| `backend/app/application/orchestrator.py` | Modify | Prompts sin las 5 retiradas (7 menciones) | C4 |
| `backend/app/presentation/api/v1/auth.py` | Modify | Fuera `jules`; fuera `whatsapp_read_messages` | C4 |
| `frontend/src/components/chat/toolLabels.ts` | Create | `TOOL_LABELS`: +7 OAuth, −5 retiradas | C5 |
| `backend/tests/test_tool_catalog.py` | Create | Paridad `C == L` + `SERVICE_CATALOG ⊆ C` | C4/C5 |
| `frontend/src/pages/settings/…` (copy de `tool_confirmation_level`) | Modify | Alcance real, sin «todas» | C5 |

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit backend | Clasificación de los 3 estados; gate por registro; `_ScopedTasks` | pytest; `monkeypatch` sobre `n8n_client.call_webhook` para asertar «cero llamadas» |
| Integración backend | A/B sobre `agent_tasks` con Mongo real; `DESTRUCTIVE_TOOLS` completo | `test_tenant_isolation.py` (fixtures `authed_client_a/b`, `clean_test_data`) |
| Cross-stack | Paridad catálogo ↔ etiquetas | `test_tool_catalog.py` (registry real + parseo de `toolLabels.ts`) |
| Unit frontend | 4º marcador, saneado, 4º estado de la tarjeta | vitest desde `frontend/`: `tests/utils/parseMessageParts.test.ts`, `tests/store/caracterizacionStream.test.ts`, tarjeta nueva |
| E2E | No hay (`config.yaml: e2e: false`). Calendario/WhatsApp reales quedan en la revisión manual de D7 | — |

Los escenarios de mutación de las specs se ejecutan a mano en la fase verify (editar, correr,
revertir); ninguno se commitea.

## Migration / Rollout

Sin migración. C1 solo añade campo a documentos nuevos; el índice
`(owner_user_id, status, priority)` ya existe (`main.py:230-233`). Sin feature flags: los cinco
commits revierten limpio en orden inverso.

## Open Questions

- [ ] `SERVICE_CATALOG["jules"]` se borra: ¿qué pasa con las credenciales de Jules ya guardadas
      de algún usuario? **[hipótesis]** quedan huérfanas y sin UI para borrarlas. Decisión del
      dueño: dejarlas o añadir una purga. No bloquea el diseño.
- [ ] «Reintentar» sobre un error no reintentable (`*_not_configured`) gasta crédito y no puede
      funcionar. Fuera de alcance, pero es visible en la primera demo.
