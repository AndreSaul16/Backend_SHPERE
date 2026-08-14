# Tasks: artefactos-guardarrailes

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~1.320 (A1 90 · A2 420 · A3 200 · A4 120 · A5 90 · A6 130 · A7 150 · A8 120) |
| Riesgo presupuesto 400 | High |
| PRs encadenadas | Sí |
| Reparto sugerido | PR1 = A1+A2 · PR2 = A3+A4+A5 · PR3 = A6+A7 · PR4 = A8 |
| Delivery strategy | ask-on-risk (por defecto; no se recibió otra) |

Decision needed before apply: No — resuelta por el dueño antes de aplicar
Chained PRs recommended: No — anulado por decisión del dueño
Chain strategy: single-branch (`feat/lanzamiento-e2e`), commits acotados por fase, sin PRs encadenadas
400-line budget risk: High — `size:exception` **concedido** explícitamente por el dueño

> **Resolución del dueño, previa al apply**: rama única `feat/lanzamiento-e2e` (la activa), ocho commits A1→A8
> acotados por fase y **sin PRs encadenadas**. La tabla de Work Units y el reparto PR1-PR4 de abajo quedan como
> memoria del plan, no como entrega: se conservan porque las fases siguen agrupadas igual. `size:exception`
> concedido para el conjunto.

### Work Units

| # | Entregable | PR | Base |
|---|---|---|---|
| 1 | El contrato del artefacto en el generador | PR1 | `feat/lanzamiento-e2e` (tracker) |
| 2 | Los tres visores sin rutas muertas ni formatos que no aceptan | PR2 | rama de PR1 |
| 3 | Historial que no miente · una junta, un acta | PR3 | rama de PR2 |
| 4 | El diagrama probado contra el motor | PR4 | rama de PR3 |

Recomendación: **feature-branch-chain** con `feat/lanzamiento-e2e` como tracker (es la rama activa y no se cambia).
PR1 es la única que supera el presupuesto por sí sola (~510 líneas): si el dueño no acepta partirla en A1 / A2, hace
falta `size:exception` explícito.

## Precondición de arranque

- [x] 0.1 **`tools-seguridad` aplicado y commiteado.** Verificado: 5 commits en la rama (`e052d92`, `a3eadef`,
      `bb8d450`, `6fcdd3d`, `6823ebb`) y `git status --porcelain backend/app/presentation/api/v1/stream.py
      frontend/src/services/api.ts` → **vacío**
- [x] 0.2 **Re-localizar por símbolo, no por número.** Hecho. Posiciones reales en el árbol de trabajo al arrancar:
      `_classify_tool_output` `stream.py:41` (zona prohibida) · `OPEN_TAG_PATTERN` `:129` · `artifact_buffer` `:205`,
      `:429` · `is_inside_artifact` `:206`, `:428` · volcado final de `buffer` `:548` · `except GeneratorExit` `:572` ·
      `except Exception` `:577` · `finally` `:585` · `_save_acta` `board_v2.py:262` · `_load_prior_actas_context` `:281` ·
      llamada a `_save_acta` `:646` · `_load_session_messages` `sessions.py:293`, consumidores en `:332` (autenticado)
      y `:561` (vista pública) · `TIPOS_DE_ARTEFACTO` `streamHandlers.ts:16` e `historyMapper.ts` · prompt de artefactos
      `orchestrator.py:126-141`, lista de tipos en `:139`
- [x] 0.3 Líneas base medidas en este árbol, antes de tocar nada:
      **backend 401 passed** (era 358) · **frontend 892 passed / 106 ficheros** (era 875 / 103).
      **Ninguna fase puede bajarlas**

## Convenciones de esta lista

- `strict_tdd`: toda tarea GREEN va precedida de su RED, **con la salida literal esperada**. Si el RED no imprime eso,
  el test no observa lo que dice observar y se reescribe antes de seguir.
- Mutación = 4 pasos: aplicar la edición → correr la suite → ver **esa** salida → `git checkout -- <fichero>` →
  comprobar con `git status --porcelain <fichero>` que sale **vacío**. Ninguna mutación se commitea.
  **Acotar siempre al fichero**: `git status --porcelain` a secas nunca sale vacío en este repo (untracked permanentes).
- Backend, desde `backend/`:
  `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci SPHERE_DEFAULT_BRANCH=master ./.venv/bin/python -m pytest tests/ -q`
  **Nunca el `python3` del sistema**: pytest 9.1.1 revienta con este `pytest.ini`; el venv tiene 9.0.3.
- Frontend, desde `frontend/`: `./node_modules/.bin/vitest run`. Tipos: `./node_modules/.bin/tsc -b --noEmit`
  (**sin `-b` es un no-op**; `-b --noEmit` no es un build).
- **Nunca ejecutar builds.** Commits convencionales, **sin atribución de IA**.
- **No se toca `_classify_tool_output`** (`stream.py:41`) ni ninguna zona de utensilios: es de `tools-seguridad`.

---

## Fase 1 — A1 `fix(artifacts): un artefacto abierto siempre se cierra`

Cierra **#6**. Verifica: el artefacto truncado se cierra · el resto no se descarta · el turno siguiente no escribe
encima · la desconexión no emite nada.

### RED

- [x] 1.1 `backend/tests/test_stream_artifacts.py` creado con `_OrquestadorFalso` (sustituye `orchestrator_app` y emite
      `on_chat_model_stream`) + `_eventos()` que parsea el SSE. Test ART-001.
      RED real: `E AssertionError: no se emitió artifact_close: ['artifact_open', 'artifact_chunk', '[DONE]']`
      — **predicción casi exacta**; la lista acaba en `[DONE]`, no en `token` (el escenario no deja texto de chat suelto)
- [x] 1.2 Test ART-002: el cierre lleva `truncated: True` y `reason: "stream_ended"`.
      RED real: `E assert 0 == 1 / where 0 = len([])` (predicho `assert 'artifact_close' in []`; misma sustancia)
- [x] 1.2b Test ART-002b **añadido**: el resto retenido no se descarta. El último trozo acaba en `</`, prefijo de la
      etiqueta de cierre, así que `artifact_buffer` se queda esperando y hoy muere sin emitirse.
      RED real: `E AssertionError: assert '' == 'linea uno\nlinea dos</'`. Es la mitad de #6 que ningún otro test observa
- [x] 1.3 **Predicción FALSA de esta lista, documentada.** ART-003 no puede escribirse como estaba enunciado: el
      contenido del turno 2 **no** cae hoy en el artefacto del turno 1, porque `onArtifactOpen`
      (`streamHandlers.ts`) reasigna `streamingArtifactBySession` sin condiciones. Verificado: el test que replicaba la
      regla del cliente con dos turnos **pasaba en verde antes del GREEN** — o sea, era un test que no podía fallar.
      Se sustituye por las dos observaciones que sí son alcanzables:
      · **ART-003**: invariante puro de SSE — entre dos `artifact_open` tiene que haber un `artifact_close`.
        RED real: `E AssertionError: se abrió un artefacto con otro todavía abierto`
      · **ART-003b**: el turno termina con el canal vacío (el puntero del cliente no sobrevive al turno).
        RED real: `E AssertionError: el turno acabó con el artefacto 'Primero' todavía abierto en el cliente`
      El solapamiento real que quedaba descrito en #20 (`artifact_chunk` huérfano) está **fuera de alcance** y sigue
      sin ser alcanzable desde el backend: ningún camino emite `artifact_chunk` con `is_inside_artifact` en falso
- [x] 1.4 Test ART-004: la inferencia lanza a mitad de artefacto; el orden es `artifact_close` **antes** que `error`.
      RED real: `E AssertionError: assert ['error'] == ['artifact_close', 'error']`
      (predicho `['error', 'token']`; no hay `token` en este escenario)
- [x] 1.5 Test ART-005: `aclose()` inyecta `GeneratorExit` con el artefacto abierto. Hoy pasa (no se emite nada);
      su RED real llega en la mutación 1.13 y es literalmente `RuntimeError: async generator ignored GeneratorExit`

### GREEN

- [x] 1.6 `stream.py`: `_cierre_forzado(artifact_buffer, razon) -> list[str]`. **Devuelve, no emite.** Emite el resto
      retenido como `artifact_chunk` y luego `artifact_close` con `truncated: true` y `reason`
- [x] 1.7 Camino normal: cierre antes del volcado de `buffer`, y `is_inside_artifact = False`
- [x] 1.8 Rama `except Exception`: cierre **antes** del evento `error`
- [x] 1.9 Rama `except GeneratorExit`: no se toca; comentario explicando por qué no se emite.
      **Desviación menor del diseño**: `artifact_buffer` e `is_inside_artifact` se inicializan **fuera** del `try`.
      Sin eso, un fallo anterior al bucle haría que la rama `except Exception` leyera nombres sin definir
- [x] 1.10 `grep -n "finally" stream.py` → sólo el `finally` de `:637` que ya existía (más dos líneas del docstring de
      `_cierre_forzado` que hablan de él). Ningún `try/finally` nuevo alrededor del bucle

### Mutaciones

- [x] 1.11 MUT ART-001 — quitada la llamada del camino normal → 5 rojos, encabezados por
      `E AssertionError: no se emitió artifact_close: ['artifact_open', 'artifact_chunk', '[DONE]']`. Revertida
- [x] 1.12 MUT ART-004 — cierre movido **después** del evento `error` →
      `E AssertionError: assert ['error', 'artifact_close'] == ['artifact_close', 'error']`, **literal a la predicción**.
      Revertida
- [x] 1.13 MUT ART-005 «la forma obvia y mala» — las dos llamadas sustituidas por una emisión desde el `finally` que ya
      existe (la misma trampa que describe D2, con un diff de 6 líneas) → ART-005 revienta con
      `E RuntimeError: async generator ignored GeneratorExit` y ART-004 se desordena. **D2 queda demostrado, no
      afirmado.** Revertida
- [x] 1.14 Suite backend completa: **408 passed** (401 base + 7). Commit A1 `a87314e`.
      **Reordenado a propósito**: el commit va ANTES de las mutaciones, porque el paso «`git checkout -- <fichero>`»
      del protocolo sólo revierte a algo válido si el GREEN ya está en el índice. Las mutaciones no se commitean

## Fase 2 — A2 `feat(artifacts): lista blanca de tipos y presupuesto de tamaño`

Cierra **#14 + #15** y es el alcance mínimo de **#13**. Verifica: el tipo se normaliza y nunca se adivina · el
desconocido se declara · el tamaño se corta con aviso · la coherencia se juzga al cerrar · las tres fuentes no se
pueden separar.

**Va después de A1 por necesidad**: el veredicto de tamaño sale por `artifact_close`, y sin A1 no hay garantía de que
ese evento exista.

### RED — el módulo (funciones puras)

- [x] 2.1 `backend/tests/test_artifact_contract.py` creado.
      RED real: `E ModuleNotFoundError: No module named 'app.application.artifact_contract'` — **literal**
- [x] 2.2 AC-002a `normalize_type(" MarkDown ")`. Con el esqueleto en su sitio, RED real
      `E AssertionError: assert ('code', 'unknown') == ('markdown', 'ok')` — **literal**
- [x] 2.3 AC-002b: `normalize_type("markdwon") == ("code", "unknown")` + el gemelo `[0] != "markdown"`,
      extendido a `cvs`/`mermeid`. Añadido AC-002c: `type` ausente o vacío cae a `code` con veredicto **`ok`**
      (no es una declaración equivocada del modelo, es el default histórico de la etiqueta)
- [x] 2.4 AC-006 sobre los cinco tipos, con los cuatro separadores y las palabras clave de mermaid
- [x] 2.5 AC-006b: `check_content("markdown", …) == "unchecked"`, y su hermano `code`. Añadido: contenido vacío
      tampoco se juzga — un artefacto sin contenido no es incoherente con su tipo
- [x] 2.6 AC-001, el cruce de las tres fuentes: lista blanca ↔ `type="…"` del prompt ↔ claves de
      `TIPOS_DE_ARTEFACTO` leídas de los dos `.ts`.
      **Predicción corregida**: `svg` NO entra en la lista blanca en A2 —entra en A4 (tarea 4.6)—, así que el cruce
      queda verde al cerrar A2 con los cuatro tipos. Su valor en esta fase es la mutación 2.32; el de verdad llega
      en A4, donde impide añadir `svg` en un sitio y olvidarlo en otro.
      RED real medida con el esqueleto: `E AssertionError: el prompt ofrece {'code', 'csv', 'markdown', 'mermaid'} y la lista blanca set()`

### GREEN — el módulo

- [x] 2.7 `artifact_contract.py` con `ARTIFACT_TYPES`, `ARTIFACT_MAX_BYTES = 262144`, `normalize_type`,
      `check_content`, `prompt_type_list`. **Sin FastAPI y sin nada de `presentation/`** (sólo `typing`).
      **Añadido sobre el diseño**: `recortar_a_presupuesto(texto, ya_emitido)`, pura, con sus 4 tests. La aritmética
      de bytes del corte tenía que ser probable sin conducir el generador, y recortar en bytes puede partir un
      carácter multibyte por la mitad (hay test del `€`)
- [x] 2.8 `normalize_type`: sólo `strip` + `lower` + alias. El porqué de prohibir la corrección por parecido va
      **en el código**, no sólo aquí
- [x] 2.9 `orchestrator.py`: la lista de tipos de la etiqueta se deriva de `prompt_type_list()`.
      **Detalle**: `AGENT_PROMPT_TEMPLATE` es una plantilla de `.format()` (`{context}`, `{query}`), así que la
      sustitución se hace con `.replace()` al definirla y no con un marcador nuevo, que `.format()` reventaría.
      Verificado el texto que ve el modelo: `<sphere_artifact title="nombre" type="code|markdown|mermaid|csv" …>`

### RED — el generador

- [x] 2.10 AC-003 `type="markdwon"`. RED real: `E KeyError: 'type_status'` (predicho `assert 'type_status' in {…}`;
      misma sustancia, indexo directo). Añadidos: el contenido llega entero y el turno sigue · un tipo válido no
      lleva `declared_type`
- [x] 2.11 AC-005 con 300 KB. RED real: `E assert 307200 <= 262144` — **literal**
- [x] 2.12 AC-005b: el turno sobrevive al corte. **Reescrito**: tal como estaba pasaba en verde antes del GREEN
      (el cierre forzado de A1 también deja `[DONE]` al final). Lleva una precondición explícita —que exista un
      cierre con `reason='size_limit'`— para que hable del corte y no de otra cosa. Igual en «tras el corte no llega
      ni un trozo más»
- [x] 2.13 AC-006c `csv` con prosa. RED real: `E KeyError: 'content_status'`
- [x] 2.14 AC-006d: truncado ⇒ `unchecked`, por las dos razones (tamaño y fin de stream)

### GREEN — el generador

- [x] 2.15 Apertura: `normalize_type(...)` + `type_status` siempre y `declared_type` **sólo** cuando es desconocido
      (AC-003 dice que un tipo válido no lleva ruido). Log de aviso cuando el tipo no se reconoce
- [x] 2.16 Acumulación: presupuesto en bytes; al agotarse se corta el trozo, se cierra con `size_limit` y
      `limit_bytes`, y **el bucle sigue**. Mientras dura el artefacto cortado se sigue leyendo sin emitir y sin
      acumular (un modelo en bucle escribiría megas): sólo se conserva la cola que podría traer la etiqueta de cierre
- [x] 2.17 Cierre: `content_status` calculado con `check_content`, y `unchecked` si está truncado.
      **Defecto encontrado por los tests, no por lectura**: al cortar por presupuesto, `is_inside_artifact` seguía
      en alto y el cierre forzado de A1 emitía un **segundo** `artifact_close`
      (`['artifact_open','artifact_chunk','artifact_close','artifact_close','[DONE]']`). Arreglado con la bandera
      `artifact_cortado` en los dos sitios que cierran
- [x] 2.18 `grep -rn "262144\|262_144" backend/app/` → **sólo** `artifact_contract.py:43`

### RED + GREEN — el cliente

- [x] 2.19 RED `frontend/tests/services/artefactoVeredicto.test.ts` (5 casos, incluido «un backend viejo sin campos
      de veredicto no rompe el cierre»). RED real: 4 fallos con
      `AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]`
- [x] 2.20 `api.ts`: campos nuevos en los dos callbacks, **aditivo**. Las ramas `tool_confirmation` de
      `tools-seguridad` no se han tocado. Sin `type_status` se asume `ok`: un backend viejo no pinta avisos
- [x] 2.21 RED `frontend/tests/store/artefactoVeredicto.test.ts`.
      RED real: `AssertionError: expected undefined to be 'unknown' // Object.is equality` — **literal**
- [x] 2.22 `types/artifact.ts`: `declaredType?`, `typeStatus?`, `truncated?`, `truncatedReason?`, `contentStatus?`,
      más los tres alias de unión (`TypeStatus`, `TruncatedReason`, `ContentStatus`) que usa también `api.ts`
- [x] 2.23 `streamHandlers.ts`: los campos viajan al `Artifact` en la apertura y **`onArtifactClose` deja de ser un
      no-op sobre el artefacto**: lee el id del canal antes de soltarlo y escribe corte y veredicto
- [x] 2.24 RED `frontend/tests/components/BandaDeVeredicto.test.tsx` (11 casos).
      RED real: `TestingLibraryElementError: Unable to find an element by: [data-testid="banda-de-veredicto"]`
- [x] 2.25 La banda, **una sola**, encima del `ArtifactRenderer`, dentro del `RegionBoundary`. Los cinco visores no
      se enteran. **Desviación del diseño**: vive en su propio fichero `BandaDeVeredicto.tsx` en vez de dentro de
      `ArtifactPanel.tsx`; el sitio donde se PINTA sigue siendo uno solo, que es lo que exige D4, y separarla deja
      probable la decisión de cuándo se avisa (`veredictoDe`, función pura). Texto del dueño, literal.
      `role="status"`, no `alert`: esto habla de un documento, no de una caída
- [x] 2.26 Cuatro casos de «no lleva banda»: correcto, sin veredicto ninguno, `unchecked`, y una sola banda cuando
      coinciden dos veredictos. Más el de tono (`data-tono`), que AV-001 exige y la lista no pedía
- [x] 2.27 `./node_modules/.bin/tsc -b --noEmit` (borrando antes `node_modules/.tmp/*.tsbuildinfo` para que no fuese
      un no-op): **limpio, 0 errores**.
      **PREDICCIÓN FALSA CONFIRMADA**: «cada consumidor no actualizado es un error de compilación, y eso es la red».
      No lo es. Los cinco campos son opcionales a propósito, así que `tsc` no señala a nadie que se olvide de
      reenviarlos. Lo que `tsc` sí cazó: nada. Lo que no pudo cazar: exactamente el fallo de la mutación 2.29b —
      quitar `typeStatus`/`declaredType` de `streamHandlers` compila limpio y el aviso desaparece. La red real es
      el test de store 2.21; el de la banda (2.24) **tampoco** lo caza, porque construye el artefacto a mano

### Mutaciones

- [x] 2.28 MUT AC-002 «adivinar» (`difflib.get_close_matches`, cutoff 0.7) → `E AssertionError: assert 'markdown' == 'code'`
      — **literal**, más otros dos rojos. Revertida
- [x] 2.29 MUT AC-003, en sus dos mitades:
      · **a) backend** — quitado `type_status` del evento → `E KeyError: 'type_status'` ×2. Revertida
      · **b) cliente** — quitados `typeStatus`/`declaredType` del `Artifact` en `streamHandlers` →
        `AssertionError: expected undefined to be 'unknown'` **sólo en el test de store**; los 11 de la banda siguen
        verdes. Es la demostración de que la banda sola no es red. Revertida
- [x] 2.30 MUT AC-005 — presupuesto a 10 MB → `E assert 10485760 == 262144` y `E assert 307200 <= 262144`
      — **literal**, más los dos tests anclados al corte. Revertida
- [x] 2.31 MUT AC-006 — juzgar también el markdown (`mismatch` si no hay `#`) →
      `E AssertionError: assert 'mismatch' == 'unchecked'` — **literal**. No juzgar el markdown es una decisión, y
      ahora está fijada. Revertida
- [x] 2.32 MUT AC-001 **«el test que no puede fallar»** — el cruce sustituido por listas literales en el test **y**
      el prompt vuelto a escribir a mano sin `csv`. Resultado: **22 passed**. Verificado además el texto que vería
      el modelo: `<sphere_artifact title="nombre" type="code|markdown|mermaid" …>` — es decir, `csv` desaparece del
      prompt, que es **la única ruta que existe hacia `DataGrid`**, y la suite entera lo celebra en verde.
      **Ese pase es el fallo.** Un test así MUST rechazarse en verify. Revertidos los dos cambios
- [x] 2.33 Suites completas: backend **441 passed** (401 base), frontend **914 passed / 109 ficheros** (892 / 106).
      `check-dead-classes` y `check-product-pricing` verdes. Commit A2 `4f30afe`. **Fin de PR1**

## Fase 3 — A3 `fix(artifacts): la tabla de datos lee CSV de verdad`

Cierra **#8**. Verifica: CSV real con sus columnas · markdown sigue mandando · comillas · `;` · el mensaje de error deja
de mentir sobre el formato.

### RED

- [x] 3.1 AV-002a `Director,Voto,Confianza\nCTO,SI,90\nCFO,NO,60`.
      RED real: `AssertionError: expected [ 'Director,Voto,Confianza' ] to deeply equal [ 'Director', 'Voto', 'Confianza' ]`
      — **literal**
- [x] 3.2 AV-002b, **reescrito tras una predicción falsa**. La versión de esta lista —tabla markdown de cifras con
      separador de millares— **no discrimina**: el husmeo mira la PRIMERA línea, y la cabecera
      `| Concepto | Q1 | Q2 |` no lleva ni una coma. Lo demostró la mutación 3.12, que sobrevivió con 20 verdes.
      Sustituido por una cabecera donde las dos heurísticas de verdad discrepan —`| Métrica | Valores (Q1, Q2, Q3,
      Q4, Q5) |`, cuatro comas contra tres barras— y conservado el caso de los millares como guarda del cuerpo
- [x] 3.3 AV-002c comillas. RED real:
      `AssertionError: expected [ [ '"Coste, con impuestos",1200' ] ] to deeply equal [ [ 'Coste, con impuestos', '1200' ] ]`.
      Añadido AV-002c-bis: `""` dentro de un campo entrecomillado es una comilla literal
- [x] 3.4 AV-002d `A;B;C\n1;2;3`. RED real: `AssertionError: expected [ 'A;B;C' ] to deeply equal [ 'A', 'B', 'C' ]`
      — **literal**. Añadido el tabulador, que va antes que la coma
- [x] 3.5 AV-002e prosa de una línea → mensaje que **no** menciona markdown.
      RED real: `AssertionError: expected <div …(1)></div> to be null` (el mensaje viejo decía «no es una tabla markdown»).
      Añadido: en CSV una fila de guiones es un dato, no un adorno

### GREEN

- [x] 3.6 `detectarSeparador(linea)` con el orden fijo `|` → `\t` → `;` → `,` sobre la primera línea no vacía
- [x] 3.7 `trocearValoresSeparados(texto, sep)` con comillas dobles y `""`. **`splitCells` no se toca.**
      **Desviación del diseño, a favor de la spec**: no trocea línea a línea sino el contenido entero, porque
      AV-002 exige que un campo entrecomillado pueda contener saltos de línea — y partir por `\n` antes de mirar
      las comillas rompe justo lo que el entrecomillado protege
- [x] 3.8 `parseTabla` elige ruta y delega; `parseMarkdownTable` se conserva **con su nombre y su cuerpo intactos**
      (renombrarlo no aportaba nada y ensuciaba el diff). La fila de guiones sólo se busca en la ruta markdown
- [x] 3.9 El mensaje pasa a «La tabla no se ha podido leer: no se distinguen columnas en el contenido.»
- [x] 3.10 Los **10 tests de regresión D35 siguen verdes sin tocarlos**: el diff del fichero de tests es
      `85 insertions(+)` y **cero borrados**

### Mutaciones

- [x] 3.11 MUT AV-002a — devolver siempre `|` → 6 rojos, encabezados por
      `AssertionError: expected [ 'Director,Voto,Confianza' ] to deeply equal [ 'Director', 'Voto', 'Confianza' ]`.
      Revertida
- [x] 3.12 MUT AV-002b — separador por frecuencia. **Primera pasada: SOBREVIVIÓ (20 passed).** No era la
      implementación: era el test de 3.2, que no observaba lo que decía observar. Con el test corregido, muere:
      `AssertionError: expected [ '| Métrica | Valores (Q1', …(4) ] to deeply equal [ 'Métrica', …(1) ]` — cinco
      columnas donde hay dos. Revertida
- [x] 3.13 MUT AV-002c — ignorar las comillas → 2 rojos:
      `AssertionError: expected [ Array(1) ] to deeply equal [ [ 'Coste, con impuestos', '1200' ] ]`. Revertida
- [x] 3.14 Suite frontend completa: **923 passed / 109 ficheros**. `tsc -b --noEmit` limpio, `check-dead-classes`
      verde. Commit A3 `4684015`.
      **Aviso de método**: la primera tanda de mutaciones de esta fase se lanzó ANTES del commit y el
      `git checkout --` se llevó por delante el GREEN sin commitear. Se rehízo y desde aquí el commit va siempre
      antes de las mutaciones

## Fase 4 — A4 `feat(artifacts): el SVG llega al visor que lo sanea`

Cierra **#12**. Verifica: el store produce `svg` en las dos rutas · el saneador es la razón de que sea seguro · el
prompt lo anuncia.

### RED

- [x] 4.1 `frontend/tests/store/artefactoSvg.test.ts`, AV-003a (streaming).
      RED real: `AssertionError: expected 'code' to be 'svg' // Object.is equality` — **literal**
- [x] 4.2 AV-003b (historial, `mapSessionHistory` con la etiqueta persistida).
      RED real: la misma, y es **otro test distinto** — que es justo lo que la mutación 4.10 demuestra.
      Añadido: un tipo que sigue sin existir (`markdwon`) sigue cayendo a `code`; la lista no se abre de par en par
- [x] 4.3 `svg` en `ARTIFACT_TYPES` y en `prompt_type_list()`.
      RED real: `E AssertionError: assert 'svg' in {'code': 'code', 'csv': 'csv', 'markdown': 'markdown', 'mermaid': 'mermaid'}`

### GREEN

- [x] 4.4 `streamHandlers.ts`: `'svg': 'svg'` y el `Record` gana `'svg'`
- [x] 4.5 `historyMapper.ts`: lo mismo, en su propio mapa
- [x] 4.6 `artifact_contract.py`: `svg` en `ARTIFACT_TYPES`.
      **Los tres cambios van juntos por obligación**: el test AC-001 se pone rojo con cualquiera de ellos suelto
- [x] 4.7 El prompt lo anuncia por derivación, sin escribir la lista a mano. Verificado el texto real:
      `<sphere_artifact title="nombre" type="code|markdown|mermaid|csv|svg" language="...">`
- [x] 4.8 AC-001 verde con los cinco tipos en las cuatro fuentes

### Mutaciones

- [x] 4.9 MUT AV-003 **la que decide el commit** — borrada la llamada a `DOMPurify.sanitize` de `SvgViewer.tsx`
      (y su import) dejando `__html: artifact.content` → el test del `<script>` de `ArtifactRenderer.test.tsx` se
      pone **rojo**: `AssertionError: expected SVGElement{ …(1) } to be null`, es decir, el `<script>` sobrevive
      dentro del SVG del documento. **A4 entra.** Revertida
- [x] 4.10 MUT AV-003b — quitado `'svg'` **sólo** de `historyMapper` → rojo **únicamente** en el test del historial
      (`expected 'code' to be 'svg'`), el del streaming sigue verde. Y además salta el cruce del backend:
      `E AssertionError: historyMapper.ts traduce {'markdown', 'code', 'mermaid', 'csv'} y la lista blanca es
      {'markdown', 'mermaid', 'svg', 'code', 'csv'}`. Los dos mapas se prueban por separado y la desincronización
      se ve. Revertida
- [x] 4.11 Suites completas: backend **442 passed**, frontend **926 passed / 109 ficheros**. `tsc -b --noEmit`
      limpio. Commit A4 `289acf3`

## Fase 5 — A5 `fix(acta): el visor del acta sanea por decisión, no por defecto`

Cierra **#17**. Verifica: `<script>` neutralizado · `javascript:` neutralizado · las tablas del acta intactas · y —lo
único que de verdad importa— que añadir `rehypeRaw` rompe la suite.

### RED

- [x] 5.1 `frontend/tests/components/MarkdownViewer.test.tsx`, AV-004a con `<script>window.x=1</script>`.
      **Pasa hoy**, como estaba previsto: react-markdown 10.1.0 no pinta HTML crudo sin `rehypeRaw`. Caracterización
- [x] 5.2 AV-004b `[pincha](javascript:alert(1))`: el `href` no conserva el protocolo. También pasa hoy.
      Añadido un tercero: un `onerror` inyectado en una imagen tampoco sobrevive
- [x] 5.3 AV-004c tabla GFM de 4 columnas → 4 `<th>` dentro del `role="region"` con `tabIndex="0"` de `DocTable`.
      Pasa antes y después: es la guarda de que `rehypeSanitize` no rompe la tabla del acta

### GREEN

- [x] 5.4 `MarkdownViewer.tsx`: `rehypePlugins={[rehypeSanitize]}`, copiando `MessageBubble`
- [x] 5.5 5.3 sigue verde. **Aviso del entorno**: el comentario que explicaba el esquema github nombraba las
      etiquetas separadas por barras y `check-dead-classes.mjs` lo tomó por una clase de Tailwind muerta
      (`table/thead/tbody/tr/th/td (1)`). Reescrito el comentario; la puerta vuelve a 0 ✓

### Mutaciones

- [x] 5.6 MUT AV-004 — «alguien añade `rehypeRaw`» **con el saneador puesto**: **5 passed**.
      **PREDICCIÓN FALSA de esta lista**: se esperaba rojo (`expected null not to be null`). No lo es, y no puede
      serlo: `rehypeSanitize` elimina el `<script>` venga de donde venga, que es exactamente lo que A5 compra. El
      verde ES el resultado: el acta sobrevive al cambio de una línea que la auditoría predijo.
      **Nota de entorno**: `rehype-raw` no es dependencia del proyecto y no se ha añadido ninguna; se sustituyó por
      un complemento local mínimo que convierte los nodos `raw` —que react-markdown ya produce, porque pasa
      `allowDangerousHtml: true` a remark-rehype— en elementos de verdad. Es lo que hace `rehype-raw` para este caso
- [x] 5.7 MUT AV-004b — el mismo `rehypeRaw` **sin** `rehypeSanitize` (las dos ediciones a la vez, que es el estado
      anterior a A5 más el cambio de una línea) → **rojo**: `AssertionError: expected <script></script> to be null`.
      Es la prueba de que el saneador, y no la casualidad, es lo que neutraliza el script. Revertidas **las dos**
- [x] 5.8 Suite frontend completa: **929 passed / 110 ficheros**. `tsc -b --noEmit` limpio, `check-dead-classes`
      verde. Commit A5 `9b9fe4e`. **Fin de PR2**

## Fase 6 — A6 `fix(sessions): un historial que falla es un error, no una sesión vacía`

Cierra **#16**. Verifica: fallo → 5xx · vacío → 200 · ajena → igual que antes · vista pública → igual que antes.

**Es el commit de mayor riesgo de producto de este change**: convierte un 200 tolerado en un 5xx visible. Va en su
propia PR con A7 y se revierte solo si molesta.

### RED

- [x] 6.1 `backend/tests/test_sessions_history_integrity.py`, SH-001 con `monkeypatch` sobre `_load_session_messages`.
      RED real: `E assert 200 >= 500` (predicho `assert 200 == 500`; se asserta la familia 5xx, no un código exacto)
- [x] 6.2 SH-001b: el cuerpo no lleva ni lista de mensajes falsa, ni `mongodb://`, ni traza.
      RED real: `E AssertionError: assert 'messages' not in {'final_response': '', 'messages': []}` — **literal**
- [x] 6.2b SH-001c **añadido**: el `session_id` sigue en el log. **Trampa del entorno**: el logger de la casa lleva
      `propagate = False`, así que `caplog` no ve nada; se espía la llamada real a `logger.warning`
- [x] 6.3 SH-002: sesión sin mensajes → 200 con `messages: []`. Caracterización
- [x] 6.4 SH-002b: sesión ajena → 404, igual que antes. Más una hermana: sesión inexistente → 404
- [x] 6.5 SH-002c: agente borrado → 200 con `warning: "agent_deleted"`. Caracterización
- [x] 6.6 SH-003: la vista pública compartida con la lectura rota → 200, sin exponer infraestructura.
      **Aviso**: la ruta es `/sessions/share/{token}`, no `/shared/`

### GREEN

- [x] 6.7 `sessions.py`: el `except Exception` pasa a `raise HTTPException(500, …)` en castellano, sin trazas.
      Se conserva el `logger.warning` con el `session_id`
- [x] 6.8 El `except HTTPException: raise` sigue **antes**, con un comentario de por qué: autorización no es
      infraestructura
- [x] 6.9 `grep -n "_load_session_messages" sessions.py` → sigue habiendo **dos** llamadas (`:332` autenticada,
      `:572` pública) y sólo ha cambiado el manejo de errores de la primera

### Mutaciones

- [x] 6.10 MUT SH-001 — volver al `return {"messages": [], ...}` → `E assert 200 >= 500`. Revertida
- [x] 6.11 MUT SH-002 — que el 500 salte también con la sesión vacía → `E assert 500 == 200` — **literal**, en tres
      tests. «Vacío» y «roto» están de verdad separados. Revertida
- [x] 6.12 MUT SH-002b — quitado el `except HTTPException: raise` → `E assert 500 == 404` — **literal**. Revertida
- [x] 6.13 Suite backend completa: **450 passed**. Commit A6 `11b2a5f`

### Hallazgo grande de esta fase (no estaba en el plan)

- [x] 6.14 **El arreglo destapó un test que pasaba por el camino del error.** Con el 500 puesto, la suite completa
      empezó a fallar en `test_sh002` y `test_sh002c` con
      `Cannot use MongoClient after close`. Causa: los grafos de LangGraph se compilan **una vez** y se cachean con
      un `MongoDBSaver` que capturó `db.sync_client`; la fixture `_setup_db()` de `conftest.py` cierra ese cliente y
      crea otro, así que **cualquier lectura de checkpoint reventaba** — y hasta ahora no se veía porque el endpoint
      se tragaba la excepción y devolvía 200 con lista vacía.
      Consecuencia: `test_sessions.py::test_get_session_history_empty` llevaba tiempo pasando **por el camino del
      error**, no por el bueno: pedía 200 con lista vacía y el `except` se lo daba.
      Arreglo, en la fixture y no en el producto: `_setup_db()` invalida la caché de grafos compilados. En producción
      el cliente no se reemplaza en caliente, así que esto acerca el entorno de test a producción en vez de fabricar
      fallos que no existen

## Fase 7 — A7 `fix(board): una junta, un acta`

Cierra **#21**. Verifica: regenerar no acumula · un debate nuevo no pisa · las fechas · el aislamiento · el límite
declarado.

### RED

- [x] 7.1 BA-001 en `test_board_actas.py`. `FakeActasCol` pasa a comportarse como una colección de verdad para lo
      que hace falta: orden por `created_at`, `find_one` con `sort` y `find_one_and_replace` con `upsert`.
      RED real: `E AssertionError: assert 3 == 1` — **literal**
- [x] 7.2 BA-001b: el acta superviviente es la última. RED real: `E AssertionError: assert 'v3' in '# v1'`
- [x] 7.3 BA-001c: un debate nuevo (sin `regenerate`) no pisa al anterior. Caracterización
- [x] 7.4 BA-001d: `created_at` conservado, `updated_at` presente. RED real: `E KeyError: 'updated_at'` — **literal**
- [x] 7.5 BA-001e: dos usuarios y dos sesiones; regenerar en una no toca las demás.
      RED real: `E AssertionError: assert 4 == 3`
- [x] 7.6 BA-002: el contexto del CEO cita el acta vigente y no los borradores.
      RED real: `E AssertionError: assert 'borrador v1' not in '[ACTAS ANTE...acta vigente'` — **literal**
- [x] 7.7 BA-003, el límite declarado: regenerar desde el primero de dos debates reemplaza el acta del **segundo** y
      deja huérfana la del primero. Escrito para documentarlo, no para arreglarlo

### GREEN

- [x] 7.8 `_save_acta(user_id, session_id, content, regenerate=False)`. Con `regenerate`,
      `find_one_and_replace(filtro, doc, sort=[("created_at", -1)], upsert=True)`
- [x] 7.9 Se lee antes de reemplazar (`find_one` con el mismo `sort`) para conservar el `created_at` original, y se
      escribe `updated_at`.
      **La justificación del diseño para conservar `created_at` no se sostiene**, aunque el requisito sí: D8 decía
      que pisarlo haría que un acta regenerada «saltara por delante de debates posteriores» en
      `_load_prior_actas_context`. No puede pasar: la regla reemplaza siempre **la más reciente**, así que el
      documento tocado ya era el primero del orden y pisar su fecha no reordena nada. Lo que sí se pierde al pisarlo
      es la fecha del debate original, que es lo que BA-001 exige conservar y lo que el test fija
- [x] 7.10 La llamada de `synthesis_node` pasa `state.get("board_regenerate", False)`
- [x] 7.11 La tolerancia a fallos se conserva: el `try/except` sigue envolviendo la escritura y sigue registrando en
      el log sin romper el debate (test `test_save_acta_tolerante_a_fallo`, intacto)

### Mutaciones

- [x] 7.12 MUT BA-001 — `insert_one` incondicional → `E AssertionError: assert 3 == 1` — **literal**. Revertida
- [x] 7.13 MUT BA-001c — upsert siempre, ignorando `regenerate` → un debate nuevo pisa al anterior:
      `E AssertionError: assert 1 == 2` — **literal**. Revertida
- [x] 7.14 MUT BA-001d — pisar `created_at` → `E assert datetime(...22:57:04.240362) == datetime(...22:57:04.240353)`.
      Observado en el documento, que es donde está la causa; la consecuencia que predecía el diseño (reordenar el
      contexto) no es alcanzable — ver 7.9. Revertida
- [x] 7.15 MUT BA-001e — quitar `session_id` del filtro → `E KeyError: 'session_id'` y el test de aislamiento en
      rojo. Revertida
- [x] 7.16 Suite backend completa: **457 passed**. Commit A7 `14972b7`. **Fin de PR3**

## Fase 8 — A8 `test(artifacts): el diagrama se prueba contra el motor, no contra su doble`

Cierra lo que queda de **#18**. Los otros dos tests fantasma de la auditoría (`ArtifactRenderer`, `DataGrid`) **ya no lo
son** — ver §Correcciones del `proposal.md`. Sólo queda mermaid.

### RED

- [x] 8.1 AV-005a: doble de motor cuyo `render` **rechaza**. Panel de error + texto fuente visible.
      Hoy era imposible escribirlo: el doble siempre resolvía y la rama no corría nunca
- [x] 8.2 AV-005b: `securityLevel: 'strict'`. **Cambio de enfoque respecto al plan**: se dobla el **motor**
      (`vi.mock('mermaid')`) y NO la capa de tema, así que `aplicarTemaMermaid` corre de verdad y `initialize`
      recibe la configuración **real del producto**. Doblar el tema habría hecho que el test aserase sobre una
      configuración inventada en el propio test
- [x] 8.3 AV-005c contra el **motor real**, en `tests/components/mermaidMotorReal.test.ts` — fichero aparte porque
      `vi.mock` se iza al ámbito del módulo y en el otro fichero el motor está doblado.
      `mermaid.parse('esto no es un diagrama')` rechaza; `mermaid.parse('graph TD; A-->B;')` resuelve

### GREEN

- [x] 8.4 `MermaidDiagram.test.tsx` reescrito. Quedan dos `mockResolvedValue`: el del caso de inyección del SVG
      (el único que legítimamente necesita un doble que resuelva) y el de la **preparación** del caso que demuestra
      que el dibujo viejo se retira. Los demás rechazan
- [x] 8.5 **No hace falta recortar nada.** Medido, no supuesto: tres pasadas del motor real en jsdom, 2 passed en
      todas, 36-45 ms de tiempo de test. Estable y rápido; se queda
- [x] 8.6 `grep -n "mockResolvedValue|mockRejectedValue"` → 2 resolvés y 3 rechazos, cada uno justificado arriba

### Mutaciones

- [x] 8.7 MUT AV-005a — quitado el `setSvgContent('')` del `catch`. **Primera pasada: SOBREVIVIÓ (4 passed).**
      **PREDICCIÓN FALSA de esta lista**: se esperaba «queda en pantalla el `<svg>` del diagrama viejo». No puede
      quedar: cuando hay error el componente pinta el panel de error **en lugar** del contenedor, así que buscar un
      `<svg>` dentro de `.mermaid-container` no observa nada — el contenedor no existe. Lo que sí sobrevive al fallo
      si el SVG viejo no se limpia es el **botón de descarga**, que cuelga de `svgContent`: el usuario se bajaría el
      diagrama ANTERIOR creyendo que es el que tiene delante. Con el test corregido, muere:
      `AssertionError: expected <button …(2)>…(1)</button> to be null`. Revertida
- [x] 8.8 MUT AV-005b — `securityLevel` a `'loose'` en `mermaidTheme.ts` →
      `AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]`. El guardarraíl nº9
      de la auditoría pasa de creencia a contrato. Revertida
- [x] 8.9 Suite frontend completa: **933 passed / 111 ficheros**. Commit A8 `7f64dc7`. **Fin de PR4**

## Fase 9 — Verificación final

- [x] 9.1 Backend con el entorno completo: **457 passed, 0 failed** (línea base 401 + 56 nuevos)
- [x] 9.2 Frontend: **933 passed / 111 ficheros, 0 failed** (línea base 892 / 106 → +41 tests, +5 ficheros)
- [x] 9.3 `./node_modules/.bin/tsc -b --noEmit` desde `frontend/`: **limpio**, borrando antes los dos
      `node_modules/.tmp/*.tsbuildinfo` para que no fuese un no-op
- [x] 9.4 Segunda pasada seguida de las dos suites: **457** y **933 / 111**, 0 failed. Cuatro corridas, cero flakes
- [x] 9.5 `git status --porcelain backend/app frontend/src frontend/tests backend/tests` → **vacío**. Ninguna de las
      24 mutaciones sobrevive
- [x] 9.6 `grep -rn "max_retries\|with_structured_output\|OutputParser\|response_format" backend/app/` → **0**.
      Es lo esperado y está declarado en AC-007 y en `PRODUCT.md`: este cambio no añade reintentos del modelo
- [x] 9.7 `grep -rn "262144\|262_144" backend/app/` → **sólo** `artifact_contract.py:44`
- [x] 9.8 `git log --oneline`: A1 `a87314e` → A2 `4f30afe` → A3 `4684015` → A4 `289acf3` → A5 `9b9fe4e` →
      A6 `11b2a5f` → A7 `14972b7` → A8 `7f64dc7` → docs `7bf5ed1`. Conventional commits, **sin atribución de IA**.
      Árbol limpio en `--untracked-files=no`
- [x] 9.9 `PRODUCT.md`: añadida la línea de AC-007 —qué garantiza SPHERE (detección y aviso) y qué no (que el código
      compile, que los hechos sean ciertos, que un markdown sea válido, que haya reintentos)—.
      `node scripts/check-product-pricing.mjs` verde; `check-dead-classes.mjs` verde
- [ ] 9.10 **NO HECHO, y no lo puede hacer este agente.** Es una revisión visual en la aplicación real: forzar los
      tres veredictos (tipo desconocido, artefacto de 300 KB, `csv` con prosa) y mirar las bandas en los dos temas.
      Queda para el dueño antes de la demo. Lo que sí está cubierto por suite: el texto de las tres bandas, que sólo
      aparezca una, que no aparezca cuando no toca, `role="status"` (no `alert`) y la separación de tono
      (`data-tono`). Lo que NO puede cubrir la suite: si se leen bien y si alguna parece una caída de la aplicación

## Entrega a `junta-honesta`

`junta-honesta` se aplica **después** y edita `DEFAULT_CORE_PROMPTS` (`backend/app/application/orchestrator.py:149+`).
Estado que se le entrega:

- El bloque `PROTOCOLO DE ARTEFACTOS` (`orchestrator.py:126-141`) ya **no** contiene la lista de tipos escrita a mano:
  se deriva de `prompt_type_list()`. Si `junta-honesta` reescribe ese bloque, **debe seguir derivándola**.
- Guarda activa que heredará: el test AC-001 de `test_artifact_contract.py` falla si el prompt, la lista blanca y los
  dos `typeMap` del frontend se separan. Cualquier tipo nuevo que se anuncie tiene que existir en los cuatro sitios.
- Conflicto esperado en rebase: **bajo**. Los hunks de este change (`:139`) y los suyos (`:181` en adelante) están a
  más de 10 líneas: con 3 líneas de contexto de git no solapan.
- Lo que **no** se toca y por tanto no genera conflicto: `_classify_tool_output` (`stream.py:41`), `dynamic_tool_node`,
  `board_v2._parse_vote` / `_tally`, `actaParser.ts`.
