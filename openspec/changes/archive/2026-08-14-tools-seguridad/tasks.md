# Tasks: tools-seguridad

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~1.150 (C1 220 · C2 370 · C3 270 · C4 120 · C5 195) |
| Riesgo presupuesto 400 | High |
| PRs encadenadas | Sí |
| Reparto sugerido | PR1 = C1 · PR2 = C2 · PR3 = C3 · PR4 = C4+C5 |
| Delivery strategy | ask-on-risk (por defecto; no se recibió otra) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Work Units

| # | Entregable | PR | Base |
|---|---|---|---|
| 1 | `agent_tasks` aislado por dueño | PR1 | `feat/lanzamiento-e2e` (tracker) |
| 2 | Tres estados honestos extremo a extremo | PR2 | rama de PR1 |
| 3 | Gate de confirmación en el registro | PR3 | rama de PR2 |
| 4 | Catálogo de 23 + paridad de etiquetas | PR4 | rama de PR3 |

Recomendación: **feature-branch-chain** con `feat/lanzamiento-e2e` como tracker (es la rama activa y no se
cambia). Si se prefiere un solo PR, hace falta `size:exception` explícito del dueño.

## Convenciones de esta lista

- `strict_tdd`: toda tarea GREEN va precedida de su RED, **con la salida literal esperada**. Si el RED no
  imprime eso, el test no observa lo que dice observar y se reescribe antes de seguir.
- Mutación = 4 pasos: aplicar la edición → correr la suite → ver **esa** salida → `git checkout -- <fichero>`
  → `git status` limpio (sin restos). Ninguna mutación se commitea.
- Backend, desde `backend/`:
  `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci ./.venv/bin/python -m pytest tests/ -q`
- Frontend, desde `frontend/`: `./node_modules/.bin/vitest run`
- **Nunca ejecutar builds.** Commits convencionales, **sin atribución de IA**.
- Baselines a no bajar: backend 338 · frontend 827.

---

## Fase 1 — C1 `fix(tools): aislar por usuario las tareas delegadas del CEO`

Verifica: A no ve nada de B · huérfanas invisibles · sin contexto no se toca Mongo · el backfill escribe el
campo del índice.

### RED

- [x] 1.1 En `backend/tests/test_tenant_isolation.py`, test ATI-001: 2 tareas `pending` de `U_A` y 3 de `U_B`;
      contexto `U_A`; `_list_active_tasks()`. RED: `E   AssertionError: assert 5 == 2`
- [x] 1.2 Test ATI-001b: `_check_task_status(task_id=T)` con `T` de `U_B` desde contexto `U_A`.
      RED: `E   AssertionError: assert 1 == 0`
- [x] 1.3 Test ATI-002: `_delegate_task` y luego lectura directa del documento en Mongo.
      RED: `E   KeyError: 'owner_user_id'`
- [x] 1.4 Test ATI-003: 3 documentos sin `owner_user_id` + 1 de `U_A`, todos `pending`; contexto `U_A`.
      RED: `E   AssertionError: assert 4 == 1`
- [x] 1.5 Test ATI-004: contextvar sin setear + espía sobre `agent_tasks` (`monkeypatch` de `find`).
      RED: `E   AssertionError: assert 'user_context_missing' in '{"tasks": [], "count": 0}'`
      y el espía registra `['find']` donde se esperaba `[]`
- [x] 1.6 Test ATI-005 sobre `backend/scripts/backfill_user_id.py`: documento huérfano + backfill con `U_A`.
      RED: `E   KeyError: 'owner_user_id'` (hoy el script escribe `user_id` en esa colección)

### GREEN

- [x] 1.7 `backend/app/infrastructure/tools/ceo_tools.py`: añadir `_ScopedTasks` (solo `find(query)` que mezcla
      `owner_user_id` e `insert_one(doc)` que lo sella) y `_scoped_tasks(tool_name)` que devuelve
      `(None, error)` **antes** de `db.get_async_db()` si no hay uid
- [x] 1.8 `ceo_tools.py`: **borrar `_get_tasks_collection()`** (líneas 16-17) y migrar las 3 herramientas a
      `_scoped_tasks`. Esta tarea es la garantía estructural: sin handle crudo, una cuarta lectura futura no
      puede olvidar el filtro
- [x] 1.9 Verificar que no queda ningún acceso sin ámbito:
      `grep -n "agent_tasks\|get_async_db" backend/app/infrastructure/tools/ceo_tools.py` debe devolver
      **solo** la línea de `_scoped_tasks`. Cualquier otra coincidencia es un handle crudo superviviente
- [x] 1.10 `_check_task_status`: evaluar `if not query:` sobre los argumentos del llamante **antes** de mezclar
      el dueño. Si se evalúa después, el mensaje «Debes proporcionar task_id o assigned_to» queda muerto
- [x] 1.11 `backend/scripts/backfill_user_id.py:43-47`: mover `agent_tasks` a la rama `owner_user_id` (la de
      `custom_agents`). No añade `user_id`. No se ejecuta en despliegue

### Mutaciones (aplicar · rojo · revertir · `git status` limpio)

- [x] 1.12 MUT ATI-001 — quitar `owner_user_id` del filtro de las 2 lecturas → `E AssertionError: assert 5 == 2`
- [x] 1.13 MUT ATI-002 — quitar el sellado en `insert_one` → la tarea recién creada es invisible para su autor:
      `E AssertionError: assert 0 == 1`
- [x] 1.14 MUT ATI-003 — filtro a `{"$or": [{"owner_user_id": uid}, {"owner_user_id": {"$exists": false}}]}`
      → `E AssertionError: assert 4 == 1`
- [x] 1.15 MUT ATI-004 — borrar la guarda de contexto → el espía registra `['find']`:
      `E AssertionError: la colección agent_tasks recibió ['find']`
- [x] 1.16 MUT ATI-005 — el script vuelve a escribir `user_id` en `agent_tasks` → `E KeyError: 'owner_user_id'`
- [x] 1.17 Suite backend completa ≥ 338 + los 6 nuevos. Commit C1

---

## Fase 2 — C2 `fix(stream): un error de herramienta en string es un fallo`

**Va antes que C3 por necesidad, no por gusto**: sin C2, la petición de confirmación de C3 se pinta verde
(`parsed.get("error") is True` la deja pasar como éxito) y el gate sería invisible.

El transporte del tercer estado **no es el evento SSE**: son marcadores de texto en el contenido de la
burbuja. Son 5 ficheros y hay que tocar los 5 (2.6–2.10), o el estado se pierde por el camino.

### RED backend

- [x] 2.1 Crear `backend/tests/test_stream_tool_events.py` importando `_classify_tool_output`.
      RED: `E   ImportError: cannot import name '_classify_tool_output' from 'app.presentation.api.v1.stream'`
      (hoy hay **cero** tests sobre esta función)
- [x] 2.2 Casos: `{"ok":true}`→`result` · `{"error":true,"message":M}`→`error` ·
      `{"error":"linkedin_not_configured","hint":H}`→`error` con H · `{"error":"confirmation_required",...}`→
      `confirmation` con `action_summary`

### GREEN backend

- [x] 2.3 `backend/app/presentation/api/v1/stream.py:36-54`: sustituir `_tool_error_message` por
      `_classify_tool_output(raw) -> tuple[Literal["result","error","confirmation"], str]`. Un único punto de
      decisión ⇒ ningún par de estados puede compartir evento (TRI-001)
- [x] 2.4 `stream.py`: emitir `{"type":"tool_confirmation","tool_name":N,"summary":S}` en la rama nueva

### RED + GREEN frontend — un fichero por tarea

- [x] 2.5 RED `frontend/tests/utils/parseMessageParts.test.ts` con `[TOOL_CONFIRM:whatsapp_send_message:S]`:
      `AssertionError: expected 'texto' to be 'utensilio' // Object.is equality`
- [x] 2.6 `frontend/src/utils/parseMessageParts.ts`: 5º grupo en `MARCADORES`
      (`\[TOOL_CONFIRM:([^:]+):([^\]]*)\]`, misma asimetría que los otros) + `estado: 'awaiting_confirmation'`
      y `resumen` en `ParteDelTurno`
- [x] 2.7 RED `frontend/tests/utils/citaLlana.test.ts`: `citaLlana('a [TOOL_CONFIRM:x:y] b')`.
      RED: `AssertionError: expected 'a [TOOL_CONFIRM:x:y] b' to be 'a b' // Object.is equality`
- [x] 2.8 `frontend/src/utils/citaLlana.ts:25`: añadir `TOOL_CONFIRM` a `MARCADORES`. **Si se olvida, el
      marcador se cuela crudo en las citas del Palco**
- [x] 2.9 `frontend/src/services/api.ts`: `onToolConfirmation?: (data: {tool_name, summary}) => void` en el
      tipo de callbacks + rama `data.type === 'tool_confirmation'` junto a las de :206-217.
      RED previo: `AssertionError: expected "spy" to be called at least once`
- [x] 2.10 `frontend/src/store/chat/streamHandlers.ts`: `onToolConfirmation` →
      `anadirALaActiva(\`\n[TOOL_CONFIRM:${N}:${safeS}]\n\`)` con el **mismo** saneado que `onToolError`
      (`replace(/[\]\n\r]/g, ' ')`). RED previo en `frontend/tests/store/caracterizacionStream.test.ts`:
      `TypeError: handlers.onToolConfirmation is not a function`
- [x] 2.11 `frontend/src/components/chat/ToolExecutionCard.tsx`: `status` pasa a 4 valores con
      `awaiting_confirmation`; ni ✓ ni ✗, **sin botón «Reintentar»**, muestra el resumen. RED previo (test
      nuevo `frontend/tests/components/ToolExecutionCard.test.tsx`):
      `TestingLibraryElementError: Unable to find an element with the text: <resumen>`
- [x] 2.12 Recorrer los errores de `tsc` que produce el 4º valor de `ToolExecutionCardProps['status']` y
      `ParteDelTurno.estado`: **cada consumidor no actualizado es un error de compilación, y eso es la red**.
      Comprobar con `./node_modules/.bin/tsc -b --noEmit` desde `frontend/` (no es un build)

### Mutaciones

- [x] 2.13 MUT TRI-002 — volver a `parsed.get("error") is True` → el caso `linkedin_not_configured` se
      clasifica como éxito: `E AssertionError: assert 'result' == 'error'`
- [x] 2.14 MUT TRI-003a (**una de las dos direcciones**) — tratar `confirmation_required` como un `error`
      string más → `E AssertionError: assert 'error' == 'confirmation'`, y la tarjeta pinta ✗ + «Reintentar»
- [x] 2.15 MUT TRI-003b (**la otra dirección, tarea aparte**) — tratarlo como `tool_result` de éxito →
      `E AssertionError: assert 'result' == 'confirmation'`, y la tarjeta pinta ✓ ante una acción que no
      ocurrió. Una sola tarea no cubre las dos: cada mutación rompe un escenario distinto
- [x] 2.16 Suites completas. Commit C2

---

## Fase 3 — C3 `fix(tools): exigir confirmación en calendario y WhatsApp`

**No se toca `dynamic_tool_node`** (`orchestrator.py:544-583`): es la ruta caliente que S6 decidió no tocar, y
un corte allí dejaría al usuario sin tarjeta que confirmar.

### RED

- [x] 3.1 Crear `backend/tests/test_tool_confirmation.py` importando `apply_confirmation_gate`.
      RED: `E   ModuleNotFoundError: No module named 'app.infrastructure.tools.confirmation'`
- [x] 3.2 Test TC-002 que **recorre `DESTRUCTIVE_TOOLS` como fuente de verdad** (no una lista escrita a mano)
      e invoca cada una sin `confirmed`. RED con las 4 sin gate hoy:
      `E   AssertionError: sin gate: ['calendar_create_event', 'calendar_delete_event', 'whatsapp_send_message', 'whatsapp_send_notification']`
- [x] 3.3 Test TC-001: `calendar_delete_event(event_id=E)` sin `confirmed` con `monkeypatch` sobre
      `n8n_client.call_webhook`. RED: `E   AssertionError: assert 1 == 0` (llamadas a n8n)
- [x] 3.4 Test TC-003: `never` + destinatario fuera de whitelist + `confirmed=True`.
      RED/GREEN según el orden; asserta `"error": "contact_not_authorized"` y cero llamadas a n8n

### GREEN

- [x] 3.5 Crear `backend/app/infrastructure/tools/confirmation.py`: `apply_confirmation_gate(tool)`,
      `_confirmation_required_error(...)` y `CONFIRMATION_SUMMARIES` (entrada para las 4 nuevas). El fallback
      compone el resumen **solo con los argumentos**, nunca con el identificador técnico (TRI-004 lo prohíbe)
- [x] 3.6 `apply_confirmation_gate`: si `name ∈ DESTRUCTIVE_TOOLS` **y** su `args_schema` no declara ya
      `confirmed`, devolver `StructuredTool` con `create_model(..., __base__=orig, confirmed=(bool, Field(False)))`
      y corrutina envoltorio que hace `kwargs.pop("confirmed", False)` **antes** de llamar a la original
- [x] 3.7 `backend/app/infrastructure/tools/registry.py:19-28`: invocar el gate desde `register_shared_tool` y
      `register_role_tool`. Las 5 que ya lo consultan (linkedin, instagram, schedule_post, github_create_repo,
      slack_post_message) quedan con diff cero y conservan sus resúmenes en castellano

### Mutaciones

- [x] 3.8 MUT TC-001 — borrar la llamada a `requires_confirmation` de `calendar_delete_event` →
      `E AssertionError: assert 1 == 0` (se llamó a n8n)
- [x] 3.9 MUT TC-002 — quitar el gate de `whatsapp_send_notification` (excluirla en `apply_confirmation_gate`)
      → `E AssertionError: sin gate: ['whatsapp_send_notification']`
- [x] 3.10 MUT TC-003 — que la whitelist se compruebe solo cuando `confirmed` es `False` →
      `E AssertionError: assert 'contact_not_authorized' in '{"success": true, ...}'`
- [x] 3.11 `backend/tests/test_oauth_tools.py:101-105` sigue verde sin tocarlo. Commit C3

---

## Fase 4 — C4 `fix(tools): retirar del catálogo las 5 herramientas rotas`

Retiradas: `create_jules_task`, `check_jules_status`, `review_jules_output`, `get_market_analysis`,
`whatsapp_read_messages`. Catálogo resultante: **23**.

### RED

- [x] 4.1 Crear `backend/tests/test_tool_catalog.py` con TCAT-001: `load_all_tools()` y contar nombres
      distintos de `SHARED_TOOLS ∪ ROLE_TOOLS`. RED: `E   AssertionError: assert 28 == 23`
- [x] 4.2 TCAT-002: `get_tools_for_role` para CEO/CTO/CFO/CMO **y para un rol no declarado** (hereda las
      compartidas). RED: `E   AssertionError: rol 'CTO' recibe ['create_jules_task', 'check_jules_status', 'review_jules_output']`
- [x] 4.3 TCAT-004: los nombres citados en los prompts de rol ⊆ registry. Hoy pasa; se pone en rojo en 4.5

### GREEN

- [x] 4.4 `registry.py`: `RETIRED_TOOLS: dict[str, str]` (nombre → motivo en una línea con referencia a la
      auditoría); los 2 `register_*` ignoran lo que esté ahí. **Reactivar = borrar una línea.** No se borra
      código de herramientas, ni esquemas, ni JSON de n8n (TCAT-001)
- [x] 4.5 Correr la suite tras 4.4 y **antes** de tocar prompts: TCAT-004 debe ponerse rojo aquí:
      `E   AssertionError: prompts nombran herramientas no registradas: ['create_jules_task', 'check_jules_status', 'review_jules_output', 'get_market_analysis', 'whatsapp_read_messages']`
- [x] 4.6 `backend/app/application/orchestrator.py` (líneas 181, 196-198, 206, 232, 249, 257, dentro de
      `DEFAULT_CORE_PROMPTS`): quitar las 7 menciones. El skip-list no cubre los prompts
- [x] 4.7 `backend/app/presentation/api/v1/auth.py` (~300-345): borrar el bloque `jules` entero de
      `SERVICE_CATALOG` y `whatsapp_read_messages` de la lista de `whatsapp`
- [x] 4.8 `test_tool_catalog.py`: guarda extra de coste cero — `SERVICE_CATALOG[*]["tools"] ⊆ C`. Es la tercera
      lista mantenida a mano y es la que se enseña en Settings → Connections

### Mutaciones

- [x] 4.9 MUT TCAT-002 — volver a registrar `get_market_analysis` para el CFO (quitar su línea de
      `RETIRED_TOOLS`) → `E AssertionError: assert 24 == 23`
- [x] 4.10 MUT TCAT-004 — dejar `create_jules_task` en el prompt del CTO →
      `E AssertionError: prompts nombran herramientas no registradas: ['create_jules_task']`
- [x] 4.11 Suite backend. Commit C4

---

## Fase 5 — C5 `feat(chat): etiquetar las 7 herramientas OAuth`

Las 7: `github_create_repo`, `github_create_issue`, `github_comment_pr`, `slack_post_message`,
`slack_list_channels`, `notion_create_page`, `notion_update_page`.

### RED

- [x] 5.1 Ampliar `test_tool_catalog.py` con TCAT-003: leer
      `frontend/src/components/chat/toolLabels.ts` y extraer claves con `^\s*['"]?(\w+)['"]?\s*:`.
      RED: `E   FileNotFoundError: frontend/src/components/chat/toolLabels.ts`
- [x] 5.2 RED TRI-004 en `frontend/tests/components/ToolExecutionCard.test.tsx`: fallo de
      `slack_post_message`; la cadena cruda no debe aparecer en el texto renderizado.
      RED: `AssertionError: expected 'slack_post_message' not to be in the document` (hoy no tiene etiqueta y
      la tarjeta cae al identificador crudo)

### GREEN

- [x] 5.3 Crear `frontend/src/components/chat/toolLabels.ts` con `TOOL_LABELS` movido desde
      `ToolExecutionCard.tsx:14-41` (+7 OAuth, −5 retiradas). Verificado: hoy no se usa en ningún otro sitio
- [x] 5.4 `ToolExecutionCard.tsx`: sustituir el bloque por `import { TOOL_LABELS } from './toolLabels'`
      (diff de 2 líneas)
- [x] 5.5 `test_tool_catalog.py`: asserts `C - L == ∅` **y** `L - C == ∅`, nombrando las que sobran o faltan.
      RED intermedio esperado tras 5.3 si falta alguna:
      `E   AssertionError: en el catálogo pero sin etiqueta: ['github_comment_pr', 'github_create_issue', 'notion_update_page']`
- [x] 5.6 **Auto-comprobación del parser (tarea explícita, TCAT-003)**: renombrar `toolLabels.ts` a
      `toolLabels.ts.bak` y correr la suite. Debe salir `1 failed` con
      `E   FileNotFoundError: frontend/src/components/chat/toolLabels.ts`; **si sale `1 skipped`, el test está
      mal escrito y se reescribe**. Repetir vaciando el fichero: debe dar
      `E   AssertionError: toolLabels.ts: 0 claves extraídas`. Restaurar y comprobar `git status` limpio
- [x] 5.7 `frontend/src/pages/settings/ProfileSettings.tsx:349` y su texto de apoyo (TC-004): el copy nombra el
      alcance real —acciones con impacto externo— y **no** promete cobertura de las 23. Test de copy con RED
      previo. Aviso de la spec: es una aserción sobre copy, **no** cuenta como cobertura del gate

### Mutaciones

- [x] 5.8 MUT TCAT-003 — borrar la entrada `calendar_delete_event` de `toolLabels.ts` →
      `E AssertionError: en el catálogo pero sin etiqueta: ['calendar_delete_event']`
- [x] 5.9 MUT TCAT-003b «el test que no puede fallar» — sustituir temporalmente el cruce con el registry por
      una lista literal escrita en el test y registrar una herramienta nueva sin etiqueta. La suite **pasa**
      (`N passed`), y eso es el fallo: un test así **MUST** rechazarse en verify. Revertir ambos cambios
- [x] 5.10 MUT TRI-004 — borrar la entrada `slack_post_message` de `toolLabels.ts` →
      `AssertionError: expected 'slack_post_message' not to be in the document`
- [x] 5.11 Suites completas. Commit C5

---

## Fase 6 — Verificación final

- [x] 6.1 Backend desde `backend/`, con el entorno completo del bloque de Convenciones: **0 failed**
- [x] 6.2 Frontend desde `frontend/`: `./node_modules/.bin/vitest run` → **0 failed**
- [x] 6.3 **Repetir 6.1 y 6.2 una segunda vez seguida.** Criterio de cierre: 0 failed en las dos corridas de
      cada suite (descarta flakes de orden y de estado compartido en Mongo)
- [x] 6.4 `git status` limpio: ninguna mutación de las 16 anteriores sobrevive en el árbol
- [x] 6.5 `git log --oneline` muestra C1→C5 en orden, conventional commits, **sin atribución de IA**
- [ ] 6.6 Revisión manual de D7 antes de cualquier demo (fuera de la suite): recorrer las 23 con credenciales
      reales y anotar cuáles quedan rojas; confirmar webhooks n8n del guion; conectar Google y WhatsApp en la
      cuenta de demo; reescribir el guion incluyendo el «sí, confírmalo» de las destructivas
      > **NO COMPLETADA en apply, y no puede serlo aquí.** Exige credenciales reales de Google, WhatsApp,
      > LinkedIn, Instagram, GitHub, Slack y Notion, un n8n vivo con sus webhooks registrados y una cuenta de
      > demo. Nada de eso existe en el entorno de desarrollo (las suites lo sustituyen todo por dobles). Queda
      > como tarea del dueño ANTES de enseñar el producto: C2 hace que los fallos que hoy se ven verdes pasen a
      > verse rojos, así que el catálogo hay que recorrerlo a mano una vez.

---

## Entrega a `junta-honesta`

`junta-honesta` se aplica **después** y edita los mismos `DEFAULT_CORE_PROMPTS`
(`backend/app/application/orchestrator.py:149`) que toca la tarea 4.6. Estado que se le entrega:

- `DEFAULT_CORE_PROMPTS` **sin ninguna mención** a las 5 retiradas: 7 menciones borradas en las líneas
  181, 196-198, 206, 232, 249 y 257. El resto del texto de cada prompt queda intacto.
- Guarda activa que heredará: `backend/tests/test_tool_catalog.py` (TCAT-004) falla si un prompt nombra una
  herramienta no registrada. Cualquier nombre de herramienta que `junta-honesta` añada a un prompt debe
  existir en el registry o la suite se pondrá roja.
- Conflicto esperado en rebase: **medio**. Los cambios son borrados de líneas sueltas, no reescrituras de
  bloque. Si `junta-honesta` reescribe un prompt entero, gana su versión y basta con comprobar que TCAT-004
  sigue verde.
- Lo que **no** se toca y por tanto no genera conflicto: `dynamic_tool_node` (`orchestrator.py:544-583`).
