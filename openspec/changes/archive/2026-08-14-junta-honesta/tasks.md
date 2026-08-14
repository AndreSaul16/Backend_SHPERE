# Tasks: junta-honesta

> **Orden de aplicación: ESTE CAMBIO VA EL ÚLTIMO.** Requiere `lanzamiento-p0`
> (reescribe `actaParser.ts` y `ActaActions.tsx:363`) y `tools-seguridad` **C4**
> (edita los mismos `DEFAULT_CORE_PROMPTS`) ya integrados en `feat/lanzamiento-e2e`.
> Al revés, C4 tendría que editar dentro de los marcadores.
>
> Rama única `feat/lanzamiento-e2e`, 5 commits acotados. `strict_tdd: true`: RED
> antes que GREEN, siempre. Nunca ejecutar builds. Commits convencionales, sin
> atribución de IA. `git status --porcelain` a secas nunca sale vacío en este repo:
> **acótalo siempre al fichero**.
>
> **Nota de firma**: BTH-009 cita `narracion_sospechosa(texto)`; el diseño (D4)
> cierra `narracion_sospechosa(texto: str, rol: str) -> list[str]`. **Prevalece el
> diseño** — el rol es necesario para derivar los nombres de `get_tools_for_role`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600-800 (≈120 producción, resto tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No — decisión cerrada del dueño |
| Suggested split | Rama única; el troceo es por **commit**, no por PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Commit | Notas |
|------|--------|-------|
| 1 | `fix(board): la identidad del director no anuncia herramientas en modo junta` | **F0-1 + F0-2 fusionados a propósito**: separados, `git revert` del commit del prompt —la palanca de emergencia declarada— dejaría en rojo los tests del commit siguiente |
| 2 | `feat(board): medir la narración de herramientas en la junta` | Separado para poder revertir la medición sin tocar el arreglo |
| 3 | `fix(board): el acta nombra al director responsable de cada próximo paso` | Antes que la unidad 4: el acta debe nombrar al responsable antes de que la UI se fíe del nombre |
| 4 | `feat(acta): ejecutar un próximo paso con su director` | |
| 5 | `docs(product): la junta delibera; la ejecución vive en el chat del director` | Al final: depende de C3 para cualquier promesa de confirmación |

## Phase 0: Reverificar las asunciones [H] — ANTES de escribir nada

- [x] 0.1 **[H1]** En `orchestrator.py`, confirmar para los 4 `DEFAULT_CORE_PROMPTS` que tras C4 el párrafo de uso de herramientas **sigue siendo lo último del prompt** (hoy `:183`, `:208`, `:234`, `:259`) y que no queda texto de identidad después. Si C4 reordenó: `[[TOOLS]]` va antes de la primera línea de anuncio que quede y `[[/TOOLS]]` sigue siendo la última línea; si sobrevive identidad al final, replantear colocación antes de continuar.
  → **CONFIRMADO, la colocación del diseño se sostiene.** Tras C4 el párrafo `Usa las herramientas…` sigue siendo la ÚLTIMA línea de los 4 prompts (`:188` CEO, `:207` CTO, `:232` CMO, `:255` CFO); no sobrevive identidad después. C4 dejó los prompts limpios: `grep 'jules|get_market_analysis|whatsapp_read_messages'` → 0. Primera línea `HERRAMIENTAS` por rol: `:176` CEO, `:200` CTO, `:219` CMO, `:244` CFO. `delegate_task` sigue viviendo en el párrafo final del CEO (`:188`) → confirma que `[[/TOOLS]]` debe ir al final, no antes del párrafo.
- [x] 0.2 **[H2]** Confirmar que `frontend/src/utils/actaParser.ts` sigue exportando `parseProximosPasos(md): ParsedIssue[]` con `{title, body}`. Si p0 cambió la forma, ajustar la unidad 4 antes de escribir sus tests.
  → **CONFIRMADO**: `ParsedIssue { title: string; body: string }` (`actaParser.ts:26`), `parseProximosPasos(markdown: string): ParsedIssue[]` (`:145`). Forma intacta.
- [x] 0.3 Anotar el baseline real de la rama: `338 passed` backend, `827 passed` frontend. Cualquier desvío se investiga ahora, no al final.
  → **Las cifras de tasks.md son de hace 3 cambios.** Baseline REAL medido: backend **457 passed**, frontend **933 passed / 111 ficheros**. Subconjunto de board (`test_board_v2.py` + `test_board_meeting.py`): **47 passed**, no 31 (p0 añadió tests de board). 47 es la referencia de «sin tocar» para 1.15 y 3.4.

## Phase 1: Commit 1 — identidad honesta (RED → GREEN)

- [x] 1.1 **RED** Crear `backend/tests/test_board_prompt.py` con V1 (BTH-001/002/003/004) derivando los nombres de `load_all_tools()` + `get_tools_for_role(rol)` — nunca a mano. Salida literal esperada:
  `E   ImportError: cannot import name 'render_identity' from 'app.application.orchestrator'`
- [x] 1.2 **RED** Añadir a ese fichero el test de marcadores bien formados (exactamente un `[[TOOLS]]` y un `[[/TOOLS]]`, en ese orden, por rol) y el de BTH-002 con la **intersección registry ∩ prompt** (enmienda D7).
- [x] 1.3 **GREEN** Añadir `TOOLS_OPEN/TOOLS_CLOSE` y `render_identity(prompt, *, with_tools) -> str` en `orchestrator.py`, justo tras `DEFAULT_CORE_PROMPTS`. Pura. `with_tools=True` borra sólo las líneas marcadoras; `False` borra el bloque entero.
- [x] 1.4 **GREEN** Test explícito: `render_identity` sobre un prompt **sin marcadores devuelve el texto intacto y NO lanza**. Motivo: `devil_node` resuelve `target_role="DEVIL"` → `DEFAULT_CORE_PROMPTS["system"]`, sin marcadores, igual que todo agente a medida (`agents.py:34`). Un `raise` sería un 500 en el chat del usuario.
- [x] 1.5 **GREEN** Insertar los marcadores en los 4 prompts: `[[TOOLS]]` en línea propia antes de la primera línea `HERRAMIENTAS …`; **`[[/TOOLS]]` como última línea del prompt**, no antes del párrafo final — en el CEO `delegate_task` vive en ese párrafo (`orchestrator.py:183`) y un bloque corto lo deja vivo → BTH-001 rojo.
- [x] 1.6 **RED** Test de integración BTH-005/BTH-006 en el mismo fichero: `board_v2_node_factory("CFO","analysis")` con `patch("app.application.orchestrator.ChatOpenAI")` (patrón de `tests/test_stream_billing.py:33-97`); afirmar sobre el texto concatenado de **todos** los mensajes de `ainvoke` y sobre `bind_tools.call_count == 0`. Salida literal esperada:
  `E   AssertionError: junta CFO: el prompt compuesto nombra ['get_stock_data', 'create_calendar_event']`
- [x] 1.7 **GREEN** Enganche en `agent_node` paso 6 (`orchestrator.py:429-434`), 5 líneas, **junto a** la rama `board_mode` de `:420-427`, no dentro: `en_junta = bool(state.get("board_mode"))`, `identidad = render_identity(resolved.system_prompt, with_tools=not en_junta)`, y `identidad += BOARD_NO_TOOLS_CLAUSE` si junta.
- [x] 1.8 **GREEN** Definir `BOARD_NO_TOOLS_CLAUSE` con el literal `"NO afirmes haber consultado, revisado, enviado, publicado, agendado ni ejecutado"`, y afirmarlo en el test **escrito a mano en el test**, nunca comparando la constante consigo misma (contraste con el `.replace` de `:808-813`).
- [x] 1.9 **GREEN** BTH-001 se afirma sobre `render_identity(..., with_tools=False)` **antes** de concatenar la cláusula, y la búsqueda de `HERRAMIENTAS` es **sensible a mayúsculas** — la cláusula dice «herramientas» en minúscula y un test insensible daría falso rojo.
- [x] 1.10 **GREEN** Postcondición en runtime: tras recortar, reejecutar la lista del registry sobre el texto ya recortado y `logger.warning(f"junta {effective_role}: identidad aún nombra {fugadas}")`. Es la única guarda que cubre **marcador perdido y `system_prompt_addition` del usuario** (no-cubierto #2); no modifica el texto.
- [x] 1.11 **Mutación M1 (BTH-001)** Borrar los marcadores de `DEFAULT_CORE_PROMPTS["CFO"]` → esperar rojo `E   AssertionError: CFO: la identidad de junta nombra [...]`. Revertir con `git checkout -- backend/app/application/orchestrator.py` y comprobar `git status --porcelain backend/app/application/orchestrator.py` **vacío**.
- [x] 1.12 **Mutación M2 (BTH-005)** Devolver `system_instruction=resolved.system_prompt` sin recortar → esperar rojo en el test de integración. Revertir y comprobar el fichero acotado.
- [x] 1.13 **Mutación M3 (BTH-002/D7)** Hacer que el recorte vacíe el bloque también con `with_tools=True` → esperar rojo `E   AssertionError: CMO: el prompt de chat directo dejó de anunciar [...]`. Revertir y comprobar.
- [x] 1.14 **Mutación M4 (BTH-006)** Quitar `and not state.get("board_mode")` de `orchestrator.py:475` → esperar rojo `E   AssertionError: bind_tools invocado 1 vez en board_mode (esperado 0)`. Revertir y comprobar.
- [x] 1.15 **BTH-007** Correr `test_board_v2.py` + `test_board_meeting.py` **sin tocarlos**: 31 verdes. Confirmar que el `HumanMessage` de `_board_query` (`board_v2.py:282-321`) no cambió.
- [x] 1.16 Commit 1 (F0-1 + F0-2 fusionados).

### Resultado Fase 1 — commit `b6d94d4`

**RED real vs predicho** (3 desviaciones, ninguna de fondo):

| Tarea | Predicho | Real | Resolución |
|---|---|---|---|
| 1.1 | `cannot import name 'render_identity'` | `cannot import name 'TOOLS_CLOSE'` | Mismo `ImportError`; Python nombra el **primer** símbolo ausente de la tupla de import, y `TOOLS_CLOSE` va antes por orden alfabético. Sin acción. |
| 1.6 | `nombra ['get_stock_data', 'create_calendar_event']` | `nombra ['calendar_check_availability', 'calendar_create_event', 'calendar_list_events', 'get_financial_news', 'get_stock_data', 'whatsapp_send_message', 'whatsapp_send_notification']` | `create_calendar_event` no existe en el registry: el nombre real es `calendar_create_event`. La predicción escribió a mano una lista que el test deriva. Es justo lo que la spec prohíbe hacer en el test, y el test no lo hace. |
| 1.14 | `bind_tools invocado 1 vez en board_mode` | idéntico salvo `1 vez/veces` | Cosmético (mi f-string). **Comprobado que NO está enmascarado**: aislado con `-k bth006`, la aserción de BTH-006 es la que falla. Los 8 rojos de `ainvoke ... hubo 0` que aparecían antes venían de los tests de BTH-005, que observan otra cosa. |

**Mutaciones M1-M4**: las cuatro rojas y revertidas; `git diff` del fichero vacío tras cada revert.
M1 tumbó además `test_sin_override_la_postcondicion_se_calla` — confirmación de que la postcondición de runtime (1.10) observa de verdad y no es un test fantasma.

**Desviación de diseño (D2)**: el diseño escribe la postcondición como `herramientas_nombradas(identidad, effective_role)`, función que D4 sitúa en `board_narracion.py` — módulo del **commit 2**. Importarla desde el commit 1 rompería la promesa de rollback («`git revert <sha>` deshace cada uno sin tocar los demás»): revertir el commit 1 borraría un fichero que el commit 2 modifica. La postcondición queda como derivación inline de 2 líneas sobre `get_tools_for_role`, ya importado en `orchestrator.py`. Mismo comportamiento, misma fuente de verdad, commits independientes.

**Cifras**: `test_board_prompt.py` 59 passed · suite backend **516 passed** (457 baseline + 59) · board 47 verdes sin tocar los ficheros.

## Phase 2: Commit 2 — medición (RED → GREEN)

- [x] 2.1 **RED** Crear `backend/tests/test_board_narracion.py`: positivo (nombre del registry + verbo consumado), negativo (condicional «habría que mirar la agenda» → `[]`), y **que el retorno es `list[str]`**. Salida literal esperada:
  `E   ModuleNotFoundError: No module named 'app.application.board_narracion'`
- [x] 2.2 **GREEN** Crear `backend/app/application/board_narracion.py` (~30 líneas, importa `registry`, nada del grafo) con `herramientas_nombradas(texto, rol) -> list[str]` y `narracion_sospechosa(texto, rol) -> list[str]` (formato `"get_stock_data|he consultado"`).
- [x] 2.3 **GREEN** Test estructural del termómetro: la firma devuelve `list[str]` y **nunca texto** — el llamante no tiene con qué reescribir la respuesta aunque quiera. Documentar en el módulo los falsos positivos del condicional, aceptados por escrito.
- [x] 2.4 **GREEN** Enganchar las 2 únicas llamadas (`board_v2_node_factory.node` y `synthesis_node`, después de `agent_node`) envueltas en `try/except Exception: pass`, escribiendo con `logger.info`; el `result` se retorna sin tocar. Nada al `state`, nada al SSE.
- [x] 2.5 Test de que un fallo dentro de la medición **no propaga error al grafo** ni altera el texto del director (BTH-009 escenario 3).
- [x] 2.6 Commit 2.

## Phase 3: Commit 3 — BTH-008 en la síntesis (RED → GREEN)

- [x] 3.1 **RED** Test sobre `SYNTHESIS_ADDITION` (`board_v2.py:483-484`): la sección «Próximos pasos» exige un **director responsable nombrado**, no la palabra genérica «responsable». Salida literal esperada:
  `E   AssertionError: SYNTHESIS_ADDITION no exige director nombrado: '- (acciones concretas con responsable)'`
- [x] 3.2 **GREEN** Reescribir esa línea para exigir el nombre del director responsable en cada paso.
- [x] 3.3 **Mutación M5** Revertir a «acciones concretas con responsable» → esperar el rojo de 3.1. Revertir con `git checkout -- backend/app/application/board_v2.py` y comprobar `git status --porcelain backend/app/application/board_v2.py` vacío.
- [x] 3.4 Correr los 31 tests de board: siguen verdes. Commit 3.

### Resultado Fases 2-3 — commits `3c8000f`, `8bf3aa1`

**Fase 2** — RED `ModuleNotFoundError: No module named 'app.application.board_narracion'`, literal exacto. GREEN 18 tests.
**Predicción falsa encontrada por el test, no por mí**: `test_la_sintesis_tambien_se_mide` afirmaba `get_stock_data|he consultado` sobre `synthesis_node`, que corre como **CEO** — y `get_stock_data` es del CFO, así que el termómetro se callaba **con razón**. Corregido el test para usar una herramienta compartida (`calendar_create_event`), que sí está en `get_tools_for_role("CEO")`. El código era correcto; la observación del test, no. Es exactamente el caso que la trampa #3 anticipa: se corrigió el test para que observara de verdad, no la expectativa para que cuadrara.

**Fase 3** — RED literal exacto: `AssertionError: SYNTHESIS_ADDITION no exige director nombrado: '## Próximos pasos\n- (acciones concretas con responsable)'`. **M5 roja y revertida.**

**Nota de localización**: `SYNTHESIS_ADDITION` estaba en `board_v2.py:594` (no `:483-484`) y el literal genérico en `:627`. Todos los números de línea de los documentos están corridos por p0 + `artefactos-guardarrailes`; se localizó siempre por símbolo.

**Cifras**: backend **534 passed** tras commit 2, **537 passed** tras commit 3. Board 47 verdes, ficheros intactos en los dos.

## Phase 4: Commit 4 — el acta abre el chat del director (RED → GREEN)

- [x] 4.1 **PRIMERO** Envolver `frontend/tests/components/ActaActions.test.tsx` en `<MemoryRouter>` (patrón de `SettingsPage.test.tsx:32-34` / `AgentSelectorModal.test.tsx:25-27`). **Hoy renderiza sin router** y en cuanto el componente use `useNavigate` revienta con:
  `Error: useNavigate() may be used only in the context of a <Router> component.`
  Verificar que los tests existentes siguen verdes tras envolver, antes de tocar el componente.
- [x] 4.2 **RED** Crear `frontend/tests/utils/directorDelPaso.test.ts` con los 6 casos de ASH-002 (rol suelto, nombre, «Responsable: CMO», `null`, `CTOS`/`director` no casan por límite de palabra, gana la primera aparición). Salida literal esperada:
  `Error: Failed to load url ../../src/utils/directorDelPaso ... Does the file exist?`
- [x] 4.3 **GREEN** Crear `frontend/src/utils/directorDelPaso.ts` con `DIRECTORES = [{rol:'CEO', nombre:'Oberon'}, …]`; resolución sobre texto sin tildes y en minúsculas, límite de palabra, `title` antes que `body`, `null` si no hay. `Némesis`/`DEVIL` **no están en la tabla** → `null` → CEO por construcción, no por `if` (ASH-004).
- [x] 4.4 **GREEN** Test de deriva: cada `nombre` de `DIRECTORES` aparece en el `name` de su agente en `MOCK_AGENTS` (`frontend/src/store/chat/agentCatalog.ts`) buscando por `role`; y el `agentId` resultante pertenece siempre a `MOCK_AGENTS`, nunca `BOARD_DEVIL_AGENT`.
- [x] 4.5 **RED** En `ActaActions.test.tsx`: la fila de un próximo paso ofrece «Ejecutar con Nexus», con `useNavigate` espiado. Salida literal esperada:
  `TestingLibraryElementError: Unable to find an element with the text: Ejecutar con Nexus`
- [x] 4.6 **GREEN** Botón por fila en `ActaActions.tsx` (`:287-329`): `createNewSession(agentId)` → `navigate('/chat/'+sessionId, { state: { plantilla } })`. Reutilizar **tal cual** el camino de `CommandPalette.tsx:203-210` → `ChatPanel.tsx:654-660`, **incluida la clave `plantilla`**. Diff de mecanismo en `ChatPanel`: **0 líneas** (sólo un comentario que documente el segundo productor).
- [x] 4.7 **GREEN** `InlineError` por fila (ASH-006): si `createNewSession` rechaza con `SessionError` (`sessionsSlice.ts:166-170`), error en la fila, **no se navega**, el resto de la lista sigue operativa.
- [x] 4.8 **GREEN** Paso sin responsable → «Ejecutar con Oberon (CEO)» y `aria-label` que explica por qué (es quien delega). La casilla de hecho y el botón de GitHub de la fila siguen funcionando.
- [x] 4.9 **GREEN** El texto precargado lleva título del paso, cuerpo y una línea de procedencia del acta; queda en el compositor **sin enviar** y el `state` se limpia (`navigate(pathname, {replace:true, state:null})` ya existente).
- [x] 4.10 **Mutación M6 (ASH-001/005)** Hacer que el botón además dispare el envío → esperar rojo por llamada de envío observada. Revertir y comprobar `git status --porcelain frontend/src/components/artifacts/ActaActions.tsx` vacío.
- [x] 4.11 **Mutación M7 (ASH-003)** Ocultar el botón cuando no hay responsable → esperar rojo `Unable to find an element with the text: Ejecutar con Oberon (CEO)`. Revertir y comprobar el fichero acotado.
- [x] 4.12 Commit 4.

## Phase 5: Commit 5 — copy (RED → GREEN)

- [x] 5.1 **RED** Tests de copy **sobre texto renderizado** (`getByText`/`textContent`), nunca contra la constante ni mirando el fichero donde vive el literal: `BoardActivationModal.tsx` (texto 1), bloque «Próximos pasos» de `ActaActions.tsx` (texto 4 + `aria-label`). Salida literal esperada:
  `TestingLibraryElementError: Unable to find an element with the text: La junta decide; el paso lo lanzas tú con su director.`
- [x] 5.2 **GREEN** Aplicar los 5 literales de ASH-007: `BoardActivationModal.tsx`, `ChatPanel.tsx` (bienvenida), `agentCatalog.ts:13` (saludo del canal Junta), `ActaActions.tsx`, `PRODUCT.md`.
- [x] 5.3 **GREEN** Test de afirmaciones prohibidas en las superficies cubiertas: «la junta ejecuta», «28 integraciones», «los directores consultan datos en tiempo real», «tus agentes actúan por ti mientras debaten».
- [x] 5.4 **Mutación M8 (ASH-007)** Reintroducir «tu junta con 28 integraciones» en una superficie cubierta → esperar rojo del test de 5.3. Revertir y comprobar el fichero acotado.
- [x] 5.5 Commit 5.

## Phase 6: Verificación final — 0 failed, dos corridas seguidas

- [x] 6.1 Backend, desde `backend/`: `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci ./.venv/bin/python -m pytest tests/ -q` → **0 failed**, ≥ 338 + nuevos.
- [x] 6.2 Frontend, desde `frontend/`: `./node_modules/.bin/vitest run` → **0 failed**, ≥ 827 + nuevos.
- [x] 6.3 Repetir 6.1 y 6.2 una segunda vez seguida: mismo resultado, 0 failed en ambas.
- [x] 6.4 Comprobar que `test_board_v2.py` y `test_board_meeting.py` no aparecen modificados: `git status --porcelain backend/tests/test_board_v2.py backend/tests/test_board_meeting.py` vacío.
- [x] 6.5 **Nunca ejecutar builds.** Confirmar que los 5 commits son convencionales y **sin atribución de IA**.

### Resultado Fases 4-6 — commits `44a0308`, `5110e85`

**Fase 4** — RED literales conformes: `Failed to resolve import "../../src/utils/directorDelPaso"` (tasks.md predecía «Failed to load url»; misma causa, Vite lo redacta distinto) y `Unable to find an element with the text: Ejecutar con Nexus`, exacto. **M6 y M7 rojas y revertidas.**

**Predicción falsa (la más cara del apply)**: la tarea 4.1 sólo contemplaba `ActaActions.test.tsx` como fichero sin router. Al montar la suite completa cayeron **otros dos**: `ActaLegible.test.tsx` y `ActaRecuperada.test.tsx` (4 tests), que montan `ArtifactPanel` → `ActaActions` y por tanto también necesitan `<Router>` en cuanto el componente usa `useNavigate`. Envueltos igual. Detectado por la suite completa, no por `tsc`: es el caso de la trampa #5 al revés — el fallo era de runtime, invisible a la compilación.

**`tsc` sí cazó uno real**: `motivoLegible()` devuelve `string | undefined` y el estado del error de fila lo tipaba `string`. Corregido haciendo `motivo` opcional, que es lo que `InlineError.reason` ya acepta.

**Fase 5** — RED literal exacto: `Unable to find an element with the text: La junta decide; el paso lo lanzas tú con su director.` **M8 roja en DOS superficies** (modal y PRODUCT.md) y revertida.
Dos correcciones durante el GREEN, ambas del test observando mal:
1. `isGroupChat` sale de `selectedAgentId` del store, no del `agentId` de la sesión: sin ponerlo, la bienvenida renderizaba la de chat privado y el test medía la pantalla equivocada.
2. El literal de PRODUCT.md quedaba partido por el ajuste de línea del markdown (`ninguna\n  herramienta`). Reflowed el párrafo para que la frase sea contigua, en vez de relajar el test.
`check-product-pricing.mjs` verde; la sección AC-007 de artefactos no se tocó.

**Fase 6 — las cuatro corridas, 0 failed**:

| Suite | Corrida 1 | Corrida 2 |
|---|---|---|
| Backend | **537 passed** | **537 passed** |
| Frontend | **967 passed / 113 ficheros** | **967 passed / 113 ficheros** |

Baseline de partida: 457 backend, 933/111 frontend → **+80 backend, +34 frontend**, 0 regresiones.
`tsc -b --noEmit` limpio · `check-dead-classes` 0 muertas · `check-product-pricing` verde · ningún build ejecutado.

**BTH-007 verificado en el diff completo del cambio**: `git diff b6d94d4~1..HEAD -- board_v2.py` toca 5 hunks (import, helper `_medir_narracion`, sus 2 llamadas y la línea de `SYNTHESIS_ADDITION`). Una sola línea eliminada en todo el fichero: la instrucción genérica de próximos pasos. `_board_query`, `_parse_vote`, `_tally` y `_save_acta` intactos. `test_board_v2.py` y `test_board_meeting.py` sin un solo byte cambiado en los 5 commits.

**Nota de flakiness**: en una corrida intermedia de la fase 4 el frontend dio `1 failed` sin que el fallo apareciera en la salida, y no se reprodujo en cinco corridas posteriores. No se identificó el test. Queda anotado, no resuelto.
