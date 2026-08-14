# Tasks: lanzamiento-p0

Rama activa: `feat/lanzamiento-e2e` (no se cambia de rama). Baseline: backend **338 passed**,
frontend **827 passed**. `strict_tdd: true` → **el RED va antes que el GREEN y se ve fallar con la salida
escrita aquí**. Nunca se ejecuta un build. Commits convencionales, sin atribución de IA.

Las fases siguen el orden de commits de D8. La 2 es un commit que la tabla de D8 no contempla: sale de la
pregunta abierta ratificada (escribir `ABSTENCION` en `board_votes` llega a consumidores que nunca han
visto ese valor).

**Nota sobre `git status`**: el árbol lleva ficheros sin seguir (`VISUAL_CHECK*.md`, `openspec/changes/*`),
así que un `git status --porcelain` a secas nunca sale vacío. Toda comprobación de reversión va **acotada al
fichero mutado**: `git status --porcelain <fichero>` debe devolver cadena vacía.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1.100 – 1.400 (≈450 producción, ≈750 tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 (una por fase 1-6) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (decisión del dueño) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `fix(board): recuento con censo, abstenciones, unanimidad real y empate` | PR 1 | Sólo backend. El más arriesgado; fija el payload que consumen 2-6 |
| 2 | `fix(board): la abstención se lee en la UI` | PR 2 | Depende de PR 1 (el valor nace ahí) |
| 3 | `fix(stream): no reportar éxito cuando el stream falla o termina sin [DONE]` | PR 3 | Independiente. Es el instrumento con el que se validan 4 y 5 |
| 4 | `fix(artifacts): recuperar el acta del historial con su tipo real` | PR 4 | Depende de PR 3 para que un fallo no se lea como éxito |
| 5 | `fix(acta): parser de próximos pasos y previsualización de issues` | PR 5 | Depende de PR 3 |
| 6 | `docs(product)` + `feat(billing): mostrar el motivo del coste` | PR 6 | Independiente salvo «Empate», que lee el payload de PR 1 |

---

## Fase 1 — Commit 1 · Recuento con censo (backend)

Verifica al cerrar: `MONGODB_URL=… ./.venv/bin/python -m pytest tests/test_board_v2.py -q` en verde y el
test AST de unicidad pasando. Todos los RED se escriben en `backend/tests/test_board_v2.py`.

### RED

- [x] 1.1 RED · BVT-001 normalización. Test parametrizado con `[VOTO] decision=SI, confianza=80`,
  `**[voto] decision = CONDICIONAL ; confianza = 70**`, `[VOTO] decision=sí confianza=90`. Salida esperada:
  `FAILED tests/test_board_v2.py::test_normalizacion_del_voto[coma] - assert None == {'decision': 'SI', 'confidence': 80}`
  (ídem `[punto-y-coma]` y `[si-con-tilde]`). Los casos `confianza=150 → 100` y
  `[VOTO] decision=NO confianza=55 (revisable)` entran en el mismo test **ya en verde**: son regresión, no RED.
- [x] 1.2 RED · BVT-001 confianza ilegible (escenario ratificado). `[VOTO] decision=SI confianza=alto`.
  Salida: `FAILED …::test_confianza_ilegible_asume_50 - assert None == {'decision': 'SI', 'confidence': 50}`.
  Segundo assert del mismo test: con los tres directores votando `SI` y uno con confianza ilegible,
  `tally["early_exit"] is False`.
- [x] 1.3 RED · BVT-002 abstención. `_tally(votes, participants=["CTO","CFO","CMO"])` con el CFO en
  `[VOTO] decision=QUIZÁS confianza=alto` y el CMO sin línea de voto. Salida:
  `FAILED …::test_voto_irreconocible_es_abstencion - TypeError: _tally() got an unexpected keyword argument 'participants'`.
- [x] 1.4 RED · BVT-002 la abstención se escribe en el canal. Test del nodo: con voto irreconocible,
  `out["board_votes"] == {"CTO": {"decision": "ABSTENCION", "confidence": None}}`. Salida:
  `FAILED …::test_abstencion_se_escribe_en_board_votes - KeyError: 'board_votes'` (hoy el `if vote:` de
  `board_v2.py:357` no escribe nada). Segundo assert: `caplog` contiene el rol y el motivo.
- [x] 1.5 RED · BVT-003 unanimidad real. Tres escenarios: 3 directores con 2 malformados
  (`counts == {SI:1, NO:0, CONDICIONAL:0, ABSTENCION:2}`, `expected == 3`, `unanimous is False`);
  unanimidad legítima; censo `["CTO","CTO"]` → `expected == 1`. Salida:
  `FAILED …::test_unanimidad_exige_censo_completo[dos-malformados] - TypeError: _tally() got an unexpected keyword argument 'participants'`.
- [x] 1.6 RED · BVT-004 empate. 1-1-1 → `outcome == "EMPATE"`, `winner is None`; tres abstenciones →
  `outcome == "SIN_VOTOS"`. Salida: `FAILED …::test_empate_se_declara - KeyError: 'outcome'`.
- [x] 1.7 RED · BVT-005 invariante. `tally["early_exit"]` con `{SI:2, ABSTENCION:1}` y `avg_confidence 95`
  → `False`, y `route_after_consensus` devuelve las 3 réplicas. Salida:
  `FAILED …::test_early_exit_no_con_abstenciones - KeyError: 'early_exit'`.
- [x] 1.8 RED · BVT-005 unicidad por AST (**tarea delicada**). Nuevo
  `backend/tests/test_board_predicado_unico.py`: parsea `backend/app/application/board_v2.py` y
  `backend/app/presentation/api/v1/stream.py` con `ast.parse`, recorre los `ast.Compare` y afirma que
  **ninguna comparación fuera de la función `_tally` menciona `avg_confidence` ni `unanimous`**. Salida:
  `FAILED tests/test_board_predicado_unico.py::test_un_solo_predicado_de_early_exit - AssertionError: comparaciones del early-exit fuera de _tally: ['board_v2.py:381', 'board_v2.py:569', 'stream.py:297']`.
  El barrido cubre además los `ast.JoinedStr`, porque el log de `consensus_gate_node:382-385` interpola hoy
  `tally['unanimous']` y `tally['avg_confidence']`: si no se incluyen, la tarea 1.15 no queda protegida.
- [x] 1.9 RED · BVT-006 contrato SSE. Test del payload `board_consensus` con censo 3 y `{SI:1, ABSTENCION:2}`:
  `expected == 3`, `tally["ABSTENCION"] == 2`, `outcome == "MAYORIA"`, `unanimous is False`,
  `early_exit is False`. Salida: `FAILED …::test_payload_board_consensus - KeyError: 'expected'`.
- [x] 1.10 RED · CS-009 (spec credit-system, test de backend; vive aquí porque `early_exit` nace en este
  commit). Junta de 3 a 5 créditos con unanimidad: `credit_manager.apartial_refund` se invoca **una sola
  vez**, la del triaje. Salida esperada del RED: el test se escribe **en verde** contra el código actual y
  es una cerradura; su valor está en la mutación 1.20. Se marca como caracterización, no como RED.

### GREEN

- [x] 1.11 `board_v2.py:78-96` — `_VOTE_RE` deja de ser un mega-regex: localizador del marcador `[VOTO]` +
  `decision\s*[:=]\s*(S[IÍ]|NO|CONDICIONAL)` y `confianza\s*[:=]\s*(\d{1,3})` sobre la cola de la línea.
  `SÍ`→`SI`; confianza acotada 0-100; confianza ilegible con decisión válida → 50; decisión fuera del
  whitelist → `None`.
- [x] 1.12 `board_v2.py:99-105` — `_strip_vote_line` elimina **la línea entera** que contiene el marcador
  (hoy `_VOTE_RE.sub("", …)` dejaría `****` huérfano en la línea decorada).
- [x] 1.13 `board_v2.py:355-361` — invocar `_strip_vote_line` **siempre que haya marcador**, no sólo
  `if vote:`, y emitir `out["board_votes"] = {role: {"decision": "ABSTENCION", "confidence": None}}` cuando
  el voto no parsea.
- [x] 1.14 `board_v2.py:108-130` — `_tally(votes, participants=None)`. Censo = `dedup(participants) − {"CEO"}`,
  fallback `BOARD_DIRECTORS`. Devuelve `counts` (con `ABSTENCION`), `expected`, `total_decisivos`,
  `unanimous`, `avg_confidence` (sólo decisivos), `outcome`, `winner|None`, `early_exit`, `abstentions`.
  Constante de módulo `EARLY_EXIT_MIN_CONFIDENCE = 70`. Invariante `SI+NO+CONDICIONAL+ABSTENCION == expected`.
- [x] 1.15 `board_v2.py:381-385` — `consensus_gate_node` lee `tally["early_exit"]` y el log **vuelca el dict**
  (`f"Board V2 consensus: {tally}"`) más `tally["abstentions"]`, sin interpolar `unanimous` ni
  `avg_confidence` sueltos. Obligatorio para que pase 1.8.
- [x] 1.16 `board_v2.py:425`, `:495`, `:568` — los otros tres call sites pasan el censo;
  `route_after_consensus` lee `tally["early_exit"]`.
- [x] 1.17 `board_v2.py:428`, `:431`, `:507` — prompts de devil y síntesis: con `outcome == "EMPATE"` o
  `"SIN_VOTOS"` reciben «empate / sin mayoría», nunca una decisión que la junta no tomó.
- [x] 1.18 `board_v2.py:262-264` — dedup en `triage_node` **antes** del `len(chosen) >= 2`, o
  `route_analysis:563` seguirá devolviendo `["cto_analysis","cto_analysis"]` al fan-out.
- [x] 1.19 `stream.py:296-298` — `_tally` con los participantes de `snap.values`; payload aditivo con
  `expected`, `total_decisivos`, `outcome`, `winner` y `early_exit` leído del tally.
- [x] 1.20 `backend/tests/test_board_v2.py:48-57` — **actualizar**, no borrar, `test_tally_unanime` y
  `test_tally_dividido_no_unanime` para la firma nueva (`total` → `total_decisivos`, censo explícito).

### Mutaciones (aplicar → ver rojo → revertir → comprobar)

- [x] 1.21 MUT · BVT-001. Restaurar `_VOTE_RE` de `board_v2.py:78-81`. Rojo esperado:
  `FAILED …::test_normalizacion_del_voto[coma] - assert None == {'decision': 'SI', 'confidence': 80}`.
  Revertir con `git checkout -- backend/app/application/board_v2.py`; `git status --porcelain backend/app/application/board_v2.py` → vacío.
- [x] 1.22 MUT · BVT-002. Restaurar el `if vote:` sin `else` de `:355-361`. Rojo:
  `FAILED …::test_voto_irreconocible_es_abstencion - AssertionError: assert 0 == 1` (`counts['ABSTENCION']`).
  Revertir + `git status --porcelain` acotado → vacío.
- [x] 1.23 MUT · BVT-003. Restaurar `total = sum(counts.values())` y
  `unanimous = total > 0 and max(counts.values()) == total`. Rojo:
  `FAILED …::test_unanimidad_exige_censo_completo[dos-malformados] - assert True is False`. Revertir + comprobar.
- [x] 1.24 MUT · BVT-004. Restaurar `winner = max(counts, key=counts.get)`. Rojo:
  `FAILED …::test_empate_se_declara - AssertionError: assert 'SI' is None`. Revertir + comprobar.
- [x] 1.25 MUT · BVT-005. Copiar `tally["unanimous"] and tally["avg_confidence"] >= 70` en `stream.py:297`
  en lugar de leer el predicado. Rojo:
  `FAILED tests/test_board_predicado_unico.py::test_un_solo_predicado_de_early_exit - AssertionError: comparaciones del early-exit fuera de _tally: ['stream.py:297']`.
  Revertir con `git checkout -- backend/app/presentation/api/v1/stream.py` y comprobar acotado.
- [x] 1.26 MUT · BVT-006. Eliminar `expected` del payload de `stream.py:298`. Rojo:
  `FAILED …::test_payload_board_consensus - KeyError: 'expected'`. Revertir + comprobar.
- [x] 1.27 MUT · CS-009. Añadir un `await credit_manager.apartial_refund(charge_ctx, 2)` condicionado a
  `early_exit` en `stream.py`. Rojo:
  `FAILED …::test_early_exit_no_reembolsa - AssertionError: expected call not found` (2 llamadas frente a 1).
  Revertir + comprobar.
- [x] 1.28 Suite backend completa dos veces seguidas → `0 failed`. Commit
  `fix(board): recuento con censo, abstenciones, unanimidad real y empate`.

---

## Fase 2 — Commit 1b · La abstención se lee en la UI (**tarea delicada**)

`ABSTENCION` llega a tres consumidores que nunca lo han visto. Cada uno con su tarea, y ninguno se da por
bueno sin regresión.

- [x] 2.1 RED · `frontend/tests/components/GradoDeDesacuerdo.test.tsx` — dos votos `SI` (90 y 80) y uno
  `ABSTENCION`. Salida esperada: `AssertionError: expected 'Unanimidad' to be 'Mayoría'` y, en el mismo
  test, la media de confianza: `AssertionError: expected 57 to be 85`. La causa está en
  `desacuerdo.ts:64-69` y `:99-102`: `recuento` excluye la abstención pero `lista` no, así que
  `mayor === total` declara unanimidad y `lista.reduce(...) / total` divide 170 entre 2 tras sumar un 0.
- [x] 2.2 GREEN · `desacuerdo.ts` — filtrar las abstenciones de `lista` antes de calcular `disidentes`,
  `confianzaDelDisenso` y la media. La abstención no cuenta a favor de nadie ni entra en la media.
- [x] 2.3 RED · `frontend/tests/components/ChipDeVoto.test.tsx` — `<VoteChip decision="ABSTENCION" />`.
  Salida: `AssertionError: expected '~ CONDICIONAL' to be 'ABSTENCIÓN'`. Causa: `VoteChip.tsx:41`,
  `VOTE_CHIP[decision] ?? VOTE_CHIP.CONDICIONAL` pinta la abstención como un voto decisivo que nadie emitió.
- [x] 2.4 GREEN · `VoteChip.tsx:21-32` — entrada propia para `ABSTENCION` (neutra, sin cifra de confianza) y
  `frontend/src/types/index.ts:5` — `decision: 'SI' | 'NO' | 'CONDICIONAL' | 'ABSTENCION'`.
- [x] 2.5 RED · `frontend/tests/store/loadSessionJunta.test.ts` — historial con
  `additional_kwargs.board_vote = {decision: 'ABSTENCION', confidence: null}`. Salida:
  `AssertionError: expected undefined to be 'ABSTENCION'`. Lector: `historyMapper.ts:18` y `:145`.
- [x] 2.6 GREEN · `historyMapper.ts:18,145` — el voto recuperado conserva `ABSTENCION` y `confidence: null`,
  distinguible de «aún no ha votado» (ausencia de `board_vote`).
- [x] 2.7 Suite frontend dos veces → `0 failed`. Commit `fix(board): la abstención se lee en la UI`.

---

## Fase 3 — Commit 2 · El stream deja de mentir

Va antes que 4 y 5: sin él, cualquier fallo posterior se sigue viendo como éxito. Tests nuevos en
`frontend/tests/services/streamFailure.test.ts` con lector SSE simulado.

- [x] 3.1 RED · SFS-001 error seguido de `[DONE]`. Salida:
  `FAIL tests/services/streamFailure.test.ts > un evento error seguido de [DONE] avisa del fallo` /
  `AssertionError: expected "spy" to be called 1 times, but got 0 times` (`onError`), y el segundo assert
  `expected "spy" to be called 0 times, but got 1 times` (`onDone`).
- [x] 3.2 RED · SFS-001 error a mitad de generación: el texto ya recibido se conserva y el turno queda
  fallido. Mismo modo de fallo: `expected "spy" to be called 1 times, but got 0 times`.
- [x] 3.3 RED · SFS-002 corte limpio sin `[DONE]`. Salida:
  `AssertionError: expected "spy" to be called 1 times, but got 0 times` (`onError` tras `if (done) break`).
- [x] 3.4 Caracterización (verde de salida, no RED) · SFS-002 terminación normal (`onDone` una vez, `onError`
  ninguna) y cancelación del usuario (`signal.aborted` → sin `onError`). Se escriben para que no puedan
  romperse en silencio con 3.6.
- [x] 3.5 Caracterización (verde de salida) · SFS-003 chunk ilegible entre chunks buenos: los dos textos se
  entregan, `onDone` sí, `onError` no.
- [x] 3.6 GREEN · `api.ts:221-223` — la rama `data.type === 'error'` **anota** el mensaje en una variable del
  ámbito del bucle en vez de lanzar; el `throw` se hace inmediatamente **después** del `try/catch`. El
  `catch (parseError)` de `:224` no se toca: es SFS-003.
- [x] 3.7 GREEN · `api.ts:231-234` — llegar aquí significa, por construcción, cuerpo cerrado sin centinela
  (`[DONE]` en `:153` y la cancelación de `:128` hacen `return`): se lanza en lugar del `console.warn` del
  buffer residual. El `catch` exterior sigue comprobando `signal?.aborted` antes de `onError`.
- [x] 3.8 Caracterización (verde de salida) · SFS-004 y SFS-005 sobre `streamHandlers.ts:139-169`: la sesión
  sale de `streamingSessionIds` en `onError` y el texto es «*La respuesta se cortó aquí.*», sin
  `[object Object]` ni `undefined`. Sin cambio de producción.
- [x] 3.9 MUT · SFS-001. Devolver el `throw new Error(data.message …)` dentro del `try`. Rojo:
  `expected "spy" to be called 1 times, but got 0 times`. `git checkout -- frontend/src/services/api.ts`;
  `git status --porcelain frontend/src/services/api.ts` → vacío.
  **Ejecutada**: rojo en los 2 tests de SFS-001,
  `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` (vitest 5 beta imprime
  `"vi.fn()"` donde tasks.md escribió `"spy"`; misma aserción, mismo modo de fallo). Revertida, acotado vacío.
- [x] 3.10 MUT · SFS-002. Restaurar `if (done) break;` mudo. Rojo: mismo mensaje en el test de corte limpio.
  Revertir + comprobar acotado.
  **Ejecutada**: `FAIL … > un corte de conexión limpio avisa en vez de dejar el spinner colgado` /
  `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`. Revertida, acotado vacío.
- [x] 3.11 MUT · SFS-003. Eliminar el `catch` que descarta el chunk ilegible. Rojo:
  `SyntaxError: Unexpected token 'n', "{no-es-json" is not valid JSON`. Revertir + comprobar.
  **Ejecutada, y la predicción de tasks.md era imposible**: el `catch` exterior de `api.ts:247` atrapa el
  `SyntaxError` y lo entrega a `callbacks.onError` (`:265`), así que nunca escapa de `streamChat` ni puede
  ser el fallo del test. El rojo real es el primer assert del test, el del recuento de tokens:
  `FAIL … > un chunk ilegible entre chunks buenos no aborta el turno` /
  `AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times` (`streamFailure.test.ts:143`).
  La mutación cumple su cometido —el test detecta la regresión—; lo que estaba mal era el mensaje predicho.
  Ni el test ni la mutación se han tocado. Revertida, acotado vacío.
- [x] 3.12 MUT · SFS-004. Quitar la salida de `streamingSessionIds` dentro de `onError` en
  `streamHandlers.ts`. Rojo: `AssertionError: expected [ 's1' ] to not contain 's1'`. Revertir + comprobar.
  **Ejecutada**: `AssertionError: expected [ 's1' ] to not include 's1'` (vitest dice `include`, no
  `contain`). Revertida, acotado vacío.
- [x] 3.13 MUT · SFS-005. Sustituir el mensaje por `String(error)` de un error sin `message`. Rojo:
  `AssertionError: expected '[object Object]' not to contain '[object Object]'`. Revertir + comprobar.
  **Ejecutada**: cae antes el assert de la línea 103 que el de la 104 que predecía tasks.md —
  `AssertionError: expected 'La caja aguanta \n\n[object Object]' to contain 'La respuesta se cortó aquí.'`—
  con el `[object Object]` literal en el diff. Mismo test, mismo fichero. Revertida, acotado vacío.
- [x] 3.14 Suite frontend dos veces → `0 failed`. Commit
  `fix(stream): no reportar éxito cuando el stream falla o termina sin [DONE]`.
  Commit ya existente: `da66a52`. Las dos corridas seguidas se hacen en la fase 7 (7.2/7.3), que es el
  criterio de aceptación real; aquí se confirmó una corrida limpia tras revertir las cinco mutaciones.

---

## Fase 4 — Commit 3 · El acta sobrevive a la recarga (**tarea delicada**)

Los cuatro fixtures defienden el bug: son las **únicas** apariciones de `artifact_type=` como atributo XML
en el repositorio, todas en tests de frontend, ninguna en `backend/`. Por eso 827 tests en verde nunca lo
vieron.

- [x] 4.1 RED · AD-001 en `frontend/tests/store/loadSessionJunta.test.ts`: historial con
  `<sphere_artifact type="markdown" title="Acta de la Junta">`. Salida:
  `AssertionError: expected 'code' to be 'markdown' // Object.is equality`. Dos escenarios más en el mismo
  test: comillas escapadas (`type=\"markdown\"`) y `type="mermaid"` → mismo fallo con `'mermaid'`.
  **Rojo obtenido, literal**: los 3 escenarios en `AD-001 — el artefacto recuperado conserva su tipo real`,
  con `expected 'code' to be 'markdown'` y `expected 'code' to be 'mermaid'`.
- [x] 4.2 RED · AD-001 acciones del acta: tras recargar, `ActaActions` monta «Enviar a Notion» y «Crear
  issues en GitHub». Salida:
  `TestingLibraryElementError: Unable to find an element with the text: Crear issues en GitHub`.
  **Rojo obtenido, literal**, en `frontend/tests/components/ActaRecuperada.test.tsx` (fichero nuevo: 4.1 vive
  en un `.ts` y este test necesita JSX). Renderiza `ArtifactPanel` tras `loadSession`; no hace falta router,
  el árbol de `components/artifacts/` no usa ninguno. En el volcado se ve el icono `lucide-file-code`: el
  acta degradada a bloque de código.
- [x] 4.3 Caracterización (verde de salida) · AD-002 backend: `assert 'type="markdown"' in SYNTHESIS_ADDITION`
  sobre `board_v2.py:466`, con el literal **idéntico** al del test de frontend. Es una cerradura; su valor
  está en la mutación 4.9.
  **Hecho en `backend/tests/test_board_actas.py`, con DOS tests, y el segundo no es opcional** (ver 4.9).
- [x] 4.4 GREEN · `frontend/src/store/chat/historyMapper.ts:119` — `artifact_type=` → `/\btype=\\?"([^\\"]+)\\?"/`.
  El `\b` no casa dentro de `artifact_type=` porque `_` es carácter de palabra. No se toca el escritor ni el
  evento SSE `artifact_open` (`streamHandlers.ts:83` lee otro espacio de nombres y funciona).
- [x] 4.5 Fixture · `frontend/tests/mocks/handlers.ts:33` → `type="code"`.
- [x] 4.6 Fixture · `frontend/tests/store/hydration.test.ts:12` y `:44` → `type="code"`. Pasaban por accidente
  antes y después (`code` es el default); se corrigen igual, porque un fixture que miente sobre el formato
  del backend es el mecanismo que dejó pasar esto.
- [x] 4.7 Fixture · `frontend/tests/store/caracterizacionStore.test.ts:358-359` → `type="markdown"` y
  `type="csv"`. Es el **único test que se pone rojo** con 4.4:
  `FAIL tests/store/caracterizacionStore.test.ts > varios artefactos en un mismo turno se extraen todos, en orden` /
  `AssertionError: expected [ 'code', 'code' ] to deeply equal [ 'markdown', 'data_table' ]`.
  Lo que se corrige es **su fixture (`:358-359`), no su aserción (`:363`)**: la aserción es correcta y el
  fixture codificaba el bug.
  **Comprobado corriendo la suite entera con 4.4 aplicado y los fixtures sin tocar: 1 failed | 847 passed.**
  Exactamente el test predicho y exactamente el mensaje predicho. La aserción no se ha tocado.
- [x] 4.8 `VISUAL_CHECK_2.md:26` — corregir el formato falso documentado como «es como el backend los
  persiste».
- [x] 4.9 MUT · AD-002. Cambiar la plantilla de `board_v2.py:466` a `artifact_type="markdown"`. Rojo:
  `FAILED tests/test_board_actas.py::test_plantilla_del_acta_emite_type_markdown - assert 'type="markdown"' in '…'`.
  Revertir + `git status --porcelain backend/app/application/board_v2.py` → vacío.
  **Ejecutada, y la predicción de tasks.md era falsa**: `test_plantilla_del_acta_emite_type_markdown`
  **NO falla** con la mutación, porque `type="markdown"` es subcadena de `artifact_type="markdown"`. El
  `assert … in …` que tasks.md daba por suficiente no distingue los dos atributos. Quien caza la mutación es
  el test hermano añadido en 4.3:
  `FAILED tests/test_board_actas.py::test_plantilla_del_acta_usa_la_etiqueta_completa_del_contrato`
  (afirma la etiqueta completa `<sphere_artifact type="markdown" title="Acta de la Junta">` y la ausencia de
  `artifact_type=`). Sin él, AD-002 —«un cambio en un lado sin el otro MUST romper una suite»— no se cumplía.
  Revertida, acotado vacío.
- [x] 4.10 MUT · AD-001. Restaurar `artifact_type=\\?"([^\\"]+)\\?"` en `historyMapper.ts:119`. Rojo:
  `AssertionError: expected 'code' to be 'markdown' // Object.is equality`. Revertir + comprobar acotado.
  **Ejecutada**: rojo literal, y ahora lo cazan 5 tests (los 3 de 4.1, el de 4.2 y el fixture corregido de
  4.7), no uno. Revertida, acotado vacío.
  **Trampa encontrada**: `git checkout --` revierte a HEAD, no al estado de trabajo. Con el GREEN sin
  commitear, la reversión de la mutación se llevó también el arreglo. Desde aquí, el GREEN de cada fase se
  commitea ANTES de mutar, que es lo que hacían las fases 1-3.
- [x] 4.11 Ambas suites dos veces → `0 failed`. Commit
  `fix(artifacts): recuperar el acta del historial con su tipo real`.
  Commit `0071bbc`. Backend **358 passed**, frontend **848 passed / 103 ficheros**. Las dos corridas seguidas
  de cada suite se hacen en la fase 7 (7.1-7.3).

---

## Fase 5 — Commit 4 · Parser de próximos pasos y previsualización

- [x] 5.1 RED · AD-003 en `frontend/tests/utils/actaParser.test.ts`, parametrizado con los 14 formatos.
  Los 1-7 quedan verdes (regresión). Salida de los 8-14:
  `FAIL tests/utils/actaParser.test.ts > los 14 formatos > 8 · Next steps` /
  `AssertionError: expected [] to have a length of 1 but got +0` (ídem 9 · Plan de acción, 10 · Acciones
  inmediatas, 11 · negrita sin `#`, 12 · tabla, 13 · párrafo, 14 · sub-encabezados).
  **Rojo obtenido, literal, en los 7 casos. Los 1-7 en verde.**
- [x] 5.2 RED · AD-003 sub-encabezados: `## Próximos pasos` + `### Corto plazo` (2 bullets) +
  `### Largo plazo` (1) + `## Riesgos` (3) → exactamente 3 items y ninguno de Riesgos. Salida:
  `AssertionError: expected [] to have a length of 3 but got +0` (hoy corta en cualquier encabezado,
  `actaParser.ts:55`).
  **Rojo obtenido, literal.** Con tres tests hermanos más (negrita cerrada por encabezado real, tabla de dos
  filas con el resto de celdas al `body`, y párrafo multilínea frente a bullets): triangulación de las
  reglas 2, 3 y 4, que con un solo caso cada una se podían falsear.
- [x] 5.3 Caracterización (verde de salida) · AD-003 acta sin la sección → `[]`, y la UI muestra el aviso.
  Las dos mitades: `AD-003 — sin sección no se inventa nada` (parser) y el tercer test de AD-004 (la UI).
- [x] 5.4 GREEN · `actaParser.ts` — nivel del encabezado (`n` = nº de `#`; la variante en negrita sin `#`
  toma `n = 6`), corte en el primer encabezado de nivel `<= n`, regla de tabla (cabecera + `|---|`; título =
  primera celda no vacía, resto al `body`) y regla de párrafo **sólo** si no hubo bullets ni tabla. Títulos
  8-11 en `isProximosPasosHeading`. Las líneas de continuación indentadas siguen yendo al `body` anterior.
- [x] 5.5 RED · AD-004 en `frontend/tests/components/ActaActions.test.tsx`: acta con 6 pasos, abrir «Crear
  issues en GitHub» y ver los 6 títulos literales antes de confirmar. Salida:
  `TestingLibraryElementError: Unable to find an element with the text: Migrar el índice a Postgres`.
  Segundo assert: el recuento anunciado dice 6.
  **La salida predicha era imposible en el RED, y por un motivo que importa**: el componente ya pinta la
  lista de pasos FUERA del diálogo (`:285-330`), así que una búsqueda global de ese texto lo encuentra y el
  test pasaría sin que el diálogo enseñe nada — un verde que no prueba lo que dice probar. Las aserciones
  van acotadas al diálogo con `within`, y el RED real es
  `TestingLibraryElementError: Unable to find an accessible element with the role "group" and name /Crear issues en GitHub/i`.
  La salida literal que predecía tasks.md sí aparece, y donde de verdad vale: en la mutación 5.9.
- [x] 5.6 RED · AD-004 cero pasos: no se ofrece crear nada y se explica que no se encontró la sección.
  Verde de salida contra `ActaActions.tsx:356-359`; se escribe para fijarlo.
- [x] 5.7 GREEN · `ActaActions.tsx:363` — reusar dentro del modal la lista de títulos que el componente ya
  pinta en `:285-330`, no construir una segunda. `parsedIssues.length` y los títulos salen del mismo array,
  así que el recuento no puede divergir. La lista debe poder recorrerse entera, sin «y N más».
  Hecho con `<ul>` sobre el mismo `parsedIssues` y `max-h-48 overflow-y-auto`: se recorre entera con scroll.
- [x] 5.8 MUT · AD-003. Restaurar el `break` incondicional ante `HEADING_RE` en `actaParser.ts:55`. Rojo:
  `AssertionError: expected [] to have a length of 3 but got +0`. Revertir
  (`git checkout -- frontend/src/utils/actaParser.ts`) + comprobar acotado.
  **Ejecutada**: rojo literal, en el test dedicado y en el formato 14. Revertida, acotado vacío.
- [x] 5.9 MUT · AD-004. Sustituir la lista por «Se crearán {N} issues». Rojo:
  `TestingLibraryElementError: Unable to find an element with the text: Migrar el índice a Postgres`.
  Revertir + comprobar.
  **Ejecutada**: rojo literal, exactamente el mensaje predicho. Revertida, acotado vacío.
- [x] 5.10 Suite frontend dos veces → `0 failed`. Commit
  `fix(acta): parser de próximos pasos y previsualización de issues`.
  Commit `2ed9401`. Frontend **870 passed / 103 ficheros**. Las dos corridas seguidas se hacen en la fase 7.
  **Orden corregido respecto a la fase 4**: el GREEN se commitea ANTES de mutar, porque `git checkout --`
  revierte a HEAD y con el arreglo sin commitear se lo lleva por delante.

---

## Fase 6 — Commit 5 · PRODUCT.md y el motivo del coste

- [x] 6.1 RED · CS-008. Ejecutar `node scripts/check-product-pricing.mjs` desde `frontend/`. Salida:
  `Error: Cannot find module '/home/jarvis/code/SPHERE/Frontend_SPHERE/frontend/scripts/check-product-pricing.mjs'`.
  **Rojo obtenido, literal**, con `exit 1`.
- [x] 6.2 GREEN · crear `frontend/scripts/check-product-pricing.mjs` en la línea de `check-dead-classes.mjs`,
  leyendo `../PRODUCT.md`. Dos reglas: (a) falla si aparece cualquier patrón que ate consenso, unanimidad o
  early-exit a créditos; (b) falla también si **desaparece** la frase del triaje —si no, borrar las dos
  reglas pasaría la puerta—. Segundo RED, ya con el script y `PRODUCT.md` sin tocar:
  `check-product-pricing: PRODUCT.md ata el precio al consenso — «el debate se abrevia y cuesta menos (3 créditos en vez de 5)»`
  y `exit 1`.
  **Segundo rojo obtenido**, citando la frase entera y su línea (47), con `exit 1`. La búsqueda va por
  ORACIÓN dentro de cada párrafo reunido: la frase infractora estaba partida en tres líneas a 80 columnas y
  línea a línea no la ve nadie; y por oración, no por párrafo, para que dos frases vecinas —una del mecanismo
  y otra del precio del triaje— no salten en falso.
- [x] 6.3 GREEN · `PRODUCT.md:53-55` — gana la redacción del triaje (`:66-68`), que es la que coincide con
  `stream.py:276-278`. El early-exit se queda descrito como **mecanismo de debate** (se abrevia), sin
  ninguna afirmación de precio. La puerta pasa: `exit 0`.
- [x] 6.4 `.github/workflows/ci.yml` — paso propio en `test-frontend` junto a «Clases muertas»
  (`:113-115`), `working-directory: frontend`, `run: node scripts/check-product-pricing.mjs`.
- [x] 6.5 RED · CS-010 en `frontend/tests/components/BoardWarRoom.test.tsx`: `board_plan` con
  `participants: ["CTO","CFO"]` y `cost: 3`. Salida:
  `TestingLibraryElementError: Unable to find an element with the text: /junta reducida a 2 directores/`.
  Segundo caso: 3 participantes y `cost: 5` → «5 créditos» sin mensaje de descuento.
  **Rojo obtenido, literal.** Tercer test: el motivo no puede mencionar consenso ni unanimidad ni siquiera
  cuando `unanimous` y `earlyExit` son `true` — que es justo el caso donde se colaría la promesa vieja.
- [x] 6.6 GREEN · `BoardWarRoom.tsx:125-127` — el importe y su motivo, en el mismo sitio y a la vez, derivado
  de `board.participants` (no del consenso).
- [x] 6.7 RED+GREEN · BVT-004 en la UI: con `outcome == "EMPATE"` el war-room dice «Empate» y **no** dice
  «consenso». Salida del RED:
  `AssertionError: expected 'La junta votó 1 a favor · 1 en contra · 1 condicional' to contain 'Empate'`.
  GREEN en el veredicto de `BoardWarRoom.tsx:56` / `desacuerdo.ts`.
  **Rojo obtenido, literal.** El empate se detecta en `desacuerdo.ts` por `decisionMayoritaria.length > 1`
  (ninguna decisión gana), no leyendo `outcome`: ese campo viaja en el SSE pero `onBoardConsensus`
  (`api.ts:186-190`) no lo guarda en el store, y plumbarlo entero era ampliar el alcance. Cambia la
  **etiqueta**, no el **nivel**: el nivel se queda en `dividida`, con lo que la severidad y el color de la
  barra no se mueven y los cuatro tests existentes que afirman `nivel === 'dividida'`
  (`GradoDeDesacuerdo.test.tsx:54-78`, `ActaPresentacion.test.tsx:153`) siguen verdes sin tocarlos.
  Triangulado con el caso contrario: una mayoría 2-1 sigue sin llamarse empate.
- [x] 6.8 MUT · CS-008. Restaurar en `PRODUCT.md` «si el consejo está de acuerdo pronto, el debate se abrevia
  y cuesta menos (3 créditos en vez de 5)». Rojo: la puerta sale con `exit 1` y el mensaje de 6.2. Revertir
  con `git checkout -- PRODUCT.md`; `git status --porcelain PRODUCT.md` → vacío.
  **Ejecutada**: `exit 1` con el mensaje predicho. Revertida, acotado vacío, puerta de nuevo en `exit 0`.
- [x] 6.9 MUT · CS-010. Dejar sólo `{board.cost} créditos` en `BoardWarRoom.tsx:126`. Rojo:
  `TestingLibraryElementError: Unable to find an element with the text: /junta reducida a 2 directores/`.
  Revertir + comprobar acotado.
  **Ejecutada**: rojo literal en los dos tests del motivo. Revertida, acotado vacío.
- [x] 6.10 Commits `docs(product): una sola regla de precio del debate` y
  `feat(billing): mostrar el motivo del coste`.
  `cd3562a` y `48bdce1`. Frontend **875 passed / 103 ficheros** antes de mutar.

---

## Fase 7 — Verificación final

- [x] 7.1 Backend, desde `backend/`:
  `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci ./.venv/bin/python -m pytest tests/ -q`
  → **0 failed**, con el total ≥ 338 (baseline) más los tests nuevos.
  **358 passed, 0 failed.**
- [x] 7.2 Frontend, desde `frontend/`: `./node_modules/.bin/vitest run` → **0 failed**, total ≥ 827.
  **875 passed / 103 ficheros, 0 failed.**
- [x] 7.3 Repetir 7.1 y 7.2 **una segunda vez seguida**: 0 failed en ambas. Dos pasadas idénticas, o el
  resultado no cuenta (los tests de stream usan temporizadores y lectores simulados).
  **Segunda pasada idéntica: backend 358 passed, frontend 875 passed / 103 ficheros. 0 failed en las cuatro.**
- [x] 7.4 `node scripts/check-product-pricing.mjs` y `node scripts/check-dead-classes.mjs` desde `frontend/`
  → `exit 0`. **Las dos en `exit 0`.**
- [x] 7.5 `git status --porcelain` — comprobar que ninguna mutación quedó viva: los únicos cambios son los
  ficheros de las seis unidades de trabajo, y no hay ficheros seguidos modificados fuera de esa lista.
  **`git status --porcelain --untracked-files=no` sale VACÍO**: las once mutaciones están revertidas y todo
  lo demás está commiteado. Sin seguir quedan `VISUAL_CHECK.md` y `openspec/changes/*`, que ya estaban.
- [x] 7.6 Ningún test **quitado** respecto a la baseline: `caracterizacionStore.test.ts:356` sigue existiendo
  con su aserción original y el fixture corregido.
  **Comprobado en todo el árbol de tests**: `git diff master -- frontend/tests backend/tests | grep -E '^-\s*(it|test|def test)'` no devuelve nada.
  En `caracterizacionStore.test.ts` las dos ÚNICAS líneas eliminadas son las del fixture (`:358-359`); la
  aserción `toEqual(['markdown','data_table'])` está intacta.

---

## Resultado

Baseline real de partida (medida, no la de la cabecera): backend **356**, frontend **844 / 102 ficheros**.
Cierre: backend **358**, frontend **875 / 103 ficheros**, 0 failed en dos pasadas seguidas de cada una.

Siete commits sobre `feat/lanzamiento-e2e`, uno por unidad de trabajo (la 6 en dos, `docs` y `feat`):

| Commit | Asunto |
|---|---|
| `0be7779` | fix(board): recuento con censo, abstenciones, unanimidad real y empate |
| `1a8f953` | fix(board): la abstención se lee en la UI |
| `da66a52` | fix(stream): no reportar éxito cuando el stream falla o termina sin [DONE] |
| `0071bbc` | fix(artifacts): recuperar el acta del historial con su tipo real |
| `2ed9401` | fix(acta): parser de próximos pasos y previsualización de issues |
| `cd3562a` | docs(product): una sola regla de precio del debate |
| `48bdce1` | feat(billing): mostrar el motivo del coste |

### Tres predicciones de `tasks.md` que resultaron falsas

Ninguna se resolvió ajustando la expectativa: las tres están documentadas en su tarea.

1. **4.9** — `assert 'type="markdown"' in SYNTHESIS_ADDITION` **no** detecta la mutación a
   `artifact_type="markdown"`, porque es subcadena suya. AD-002 quedaba sin cumplir. Lo caza el test hermano
   de la etiqueta completa, añadido en 4.3.
2. **3.11** — el `SyntaxError` del chunk ilegible no puede ser el fallo del test: el `catch` exterior de
   `api.ts:247` lo entrega a `onError`. El rojo real es el recuento de tokens.
3. **5.5** — la salida predicha era inalcanzable en el RED porque el componente ya pinta los títulos fuera
   del diálogo; una búsqueda global habría dado un verde falso. Acotado con `within`, y la salida literal
   aparece donde vale: en la mutación 5.9.
