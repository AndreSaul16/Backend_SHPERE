# Proposal: artefactos-guardarrailes — que el artefacto sea lo que dice ser

> Base: `openspec/changes/lanzamiento-v1/auditoria-guardarrailes.md`, riesgos **#6, #8, #12, #13, #14, #15, #16, #17, #18, #21**.
> La auditoría ya verificó cada hallazgo ejecutando el código; **no se ha repetido**. Lo que sí se ha hecho es
> re-verificar el **estado actual** de cada uno contra `feat/lanzamiento-e2e` (7 commits de `lanzamiento-p0` ya dentro),
> porque tres de los diez han cambiado de forma desde que se escribió la auditoría. Ver §Correcciones a la auditoría.
>
> **Aviso sobre los números de línea.** `tools-seguridad` se estaba aplicando *durante* esta planificación:
> `stream.py` creció **+30 líneas** entre dos lecturas de esta misma sesión (`_tool_error_message` → `_classify_tool_output`,
> hoy en `:41`). Todas las referencias de este documento son de la instantánea con **C1 y C2 de `tools-seguridad` ya en
> el árbol**. Quien ejecute el plan **debe localizar por símbolo, no por número**: los símbolos citados (`artifact_buffer`,
> `is_inside_artifact`, `OPEN_TAG_PATTERN`, `_save_acta`, `TIPOS_DE_ARTEFACTO`) son estables; los números no.

## Intent

El dueño prometió a los inversores que los agentes «tenían guardarraíles para no equivocarse al generar artefactos».
La auditoría concluyó, textualmente, que *«lo que hay es contención de daños en el visor, no prevención en el generador»*:
14 guardarraíles reales y **todos de forma, ninguno de fondo**.

`lanzamiento-p0` arregló lo que **miente sobre el debate** (recuento, precio, el acta que volvía como bloque de código).
Este cambio ataca lo que queda: **nada valida que un artefacto sea lo que su etiqueta dice que es**. Hoy, cuando el
modelo se equivoca al declarar, al cerrar o al dimensionar un artefacto, el sistema **no lo detecta y no lo dice** —
degrada en silencio a algo creíble y falso: un documento pintado como código, un artefacto que se escribe encima del
anterior, una pestaña congelada, una tabla de unit economics en una sola columna.

La frase que este cambio hace verdadera no es «los agentes no se equivocan». Es: **«cuando el agente se equivoca al
generar un artefacto, SPHERE lo detecta y te lo dice, en vez de enseñarte algo equivocado con cara de correcto.»**

## Scope

### In Scope

| # | Commit | Qué cierra | Evidencia re-verificada |
|---|---|---|---|
| **A1** | `fix(artifacts): un artefacto abierto siempre se cierra` | **#6**. Si el bucle termina con `is_inside_artifact=True`, se vacía el resto y se emite `artifact_close` con `truncated` | `stream.py:548-549` sólo vuelca `buffer`; `artifact_buffer` (`:429`) se descarta; `artifact_close` sólo se emite en `:440` |
| **A2** | `feat(artifacts): lista blanca de tipos y presupuesto de tamaño` | **#14 + #15 + el mínimo honesto de #13**. Contrato de artefacto en el generador: tipo contra lista blanca, tamaño acotado, coherencia tipo↔contenido, y **veredicto visible** en los tres casos | `stream.py:503-505` (`type_match.group(1) if type_match else "code"`, sin lista blanca) · `grep max_retries\|with_structured_output\|OutputParser\|response_format backend/app/` → **0** (re-ejecutado hoy) · sin límite de artefacto en ningún punto |
| **A3** | `fix(artifacts): la tabla de datos lee CSV de verdad` | **#8**. `DataGrid` acepta CSV/TSV/`;` además de tablas markdown | `orchestrator.py:139` ofrece `type="csv"`; `DataGrid.tsx:14-30` sólo parte por `\|` |
| **A4** | `feat(artifacts): el SVG llega al visor que lo sanea` | **#12**. `'svg'` entra en los dos `typeMap` y en el prompt; el saneador deja de ser inalcanzable | `streamHandlers.ts:16-17` y `historyMapper.ts:37-38` no emiten `'svg'`, pero `ArtifactRenderer.tsx:71-72`, `SvgViewer.tsx`, `types/artifact.ts:3`, `getDownloadExtension` y `PRODUCT.md:86` **sí lo declaran** |
| **A5** | `fix(acta): el visor del acta sanea por decisión, no por defecto` | **#17**. `rehypeSanitize` en `MarkdownViewer`, igual que el resto de la app | `MarkdownViewer.tsx:68` sólo `remarkGfm`; `MessageBubble.tsx:242, :413` y `SharedSessionPage.tsx:255` sí lo llevan |
| **A6** | `fix(sessions): un historial que falla es un error, no una sesión vacía` | **#16**. El `except` deja de devolver 200 con lista vacía | `sessions.py:343-345` (`except Exception: return {"messages": [], "final_response": ""}`) |
| **A7** | `fix(board): una junta, un acta` | **#21**. Regenerar **reemplaza** el acta del debate en vez de añadir una | `board_v2.py:270` `insert_one` incondicional; `:295-300` relee las 2 últimas como contexto del CEO |
| **A8** | `test(artifacts): el diagrama se prueba contra el motor, no contra su doble` | **#18** (lo que queda de él) | `MermaidDiagram.test.tsx:7-12` mockea `mermaid` entero y `render` **siempre resuelve**: la rama de error —el mejor guardarraíl de la casa— nunca se ejecuta |

### Out of Scope

| Fuera | Por qué |
|---|---|
| **#20** — `artifact_chunk` huérfano descartado en silencio (`streamHandlers.ts:98-99`) | Con A1 deja de ocurrir por la causa real (el canal no se cierra); ese `return` es la defensa correcta y convertirlo en aviso pondría ruido en pantalla ante un evento que ya no llega |
| **#22** — rama muerta `except ValueError` en el parser de votos | Es código inalcanzable que no hace daño; borrarlo es limpieza, no guardarraíl, y toca el fichero que `lanzamiento-p0` acaba de reescribir |
| **`with_structured_output` / `max_retries` generalizados en `backend/app/`** | Ver §Decisión D1. Se declara qué NO cubre este cambio |
| Reintento del voto de cada director | Ver §Decisión D1. La abstención explícita de `lanzamiento-p0` ya convirtió ese fallo en honesto y visible |
| Reconexión SSE / `Last-Event-ID` | Sigue sin existir (`grep EventSource\|reconnect\|Last-Event-ID` → 0). Fuera desde `lanzamiento-p0` |
| Versionado de actas con historial navegable | Ver §Decisión D5: se elige upsert. El versionado exige esquema, migración y UI |
| Herramientas, tri-estado, catálogo | Es `tools-seguridad`, aplicándose ahora |

**No se toca**: esquema de Mongo (A7 sustituye documentos, no cambia campos salvo `updated_at` aditivo), auth, créditos,
rate limiting, nodos ni aristas de ningún grafo de LangGraph, `board_v2._parse_vote`/`_tally`, `actaParser.ts`, DESIGN.md,
`dynamic_tool_node`, ni ninguna herramienta.

---

## Correcciones a la auditoría (hallazgos nuevos de esta sesión)

La auditoría se hizo sobre `feat/grant-huerfano`. El rediseño y `lanzamiento-p0` ya están fusionados en la rama activa,
y **tres afirmaciones han caducado**. Se declaran porque cambian dos de las cinco decisiones:

| Afirmación de la auditoría | Estado real hoy en `feat/lanzamiento-e2e` |
|---|---|
| #18: «`ArtifactRenderer.test.tsx` mockea los cinco visores; no cubre la rama `svg` ni DOMPurify» | **Caducada.** Mockea **cuatro**. `SvgViewer` corre de verdad y hay un test (`ArtifactRenderer.test.tsx`, caso *«sanea el SVG en un trozo aparte»*) que le mete `<svg …><script>alert(1)</script></svg>` y asserta `document.querySelector('svg script') === null` con el DOMPurify real |
| #18: «`DataGrid.test.tsx` sólo con tabla perfecta» | **Caducada.** Son 197 líneas con 10 casos de regresión D35: hueco al principio/medio/final, varios seguidos, celda `-`, `\|` escapado en cabecera y en celda, fecha en la 2ª línea, fila de guiones con alineación, y el recuento del pie |
| #18: «`MermaidDiagram.test.tsx` mockea mermaid entero» | **Vigente.** 37 líneas, `render` siempre resuelve. **Es el único test fantasma que queda** de los tres |
| #12: «es un agujero armado esperando un one-liner» | **Matizada.** El one-liner ya está cubierto por test: la rama `dangerouslySetInnerHTML` está desarmada *por prueba*. Lo que queda no es un agujero, es una **capacidad declarada e inalcanzable** |
| #10: «una coma tira el voto, sin reintento» | **Cerrada por `0be7779`** en su mitad que importa: `_VOTE_MARKER_RE` + extractores independientes toleran puntuación y `:`; `SÍ` con acento; confianza ilegible ⇒ voto decisivo con `DEFAULT_VOTE_CONFIDENCE=50` (que bloquea el early-exit, umbral 70); no parseable ⇒ `ABSTENCION` explícita, visible en el war-room y contada contra el censo. Sigue sin haber reintento — y ése es justo el punto de D1 |

Lo que **sí** se ha confirmado sin cambios: **#13 sigue exactamente igual**. `grep -rn "max_retries\|with_structured_output\|OutputParser\|response_format" backend/app/` → **0 resultados** hoy. `tenacity` existe sólo en `infrastructure/tools/n8n_client.py:10, :133`.

---

## Decisión D1 — #13: el mínimo honesto es **el contrato del artefacto**, no un reintento del voto

**Rechazo la intuición del product owner, con evidencia.** El voto era el candidato nº1 *cuando se escribió la
auditoría*. `lanzamiento-p0` (`0be7779` + `1a8f953`) ya cambió el cálculo: un voto que no parsea hoy no desaparece,
**se declara abstención**, se pinta como chip en el war-room, cuenta contra el censo, y **bloquea** la unanimidad y el
early-exit. Es decir: el fallo del voto ya es *honesto, visible y conservador* — degrada hacia un debate más largo,
nunca hacia una conclusión falsa. Un reintento ahí compra un debate marginalmente mejor y **no arregla ninguna mentira**,
porque ya no queda ninguna.

Lo que sigue siendo una mentira es **el artefacto** — que es, literalmente, el sujeto de la promesa al inversor.

**Y aquí está la restricción que decide la forma del guardarraíl**: en una arquitectura de streaming **no se puede
reintentar lo que ya se ha enseñado**. El contenido del artefacto sale por `artifact_chunk` token a token
(`stream.py:438, :478, :522`). Cuando se sabe que el contenido traiciona a su etiqueta, ya está en pantalla. Por tanto,
un `with_structured_output` + `max_retries` sobre el turno que genera el artefacto **no es implementable sin dejar de
transmitirlo en vivo**.

| Alternativa | Coste | Por qué se descarta |
|---|---|---|
| Bufferizar el artefacto entero, validar, y sólo entonces emitirlo | Permite reintento real | **Mata el artefacto en vivo**, que es media demo: el panel deja de rellenarse mientras el director habla y aparece de golpe al final. Regresión de producto visible a cambio de un reintento que casi nunca se usará |
| `with_structured_output` en el turno de síntesis | Reescritura de `agent_node` | El acta **es** el turno; convertirlo en llamada estructurada elimina el streaming del entregable estrella |
| Un reintento en `triage_node` (`board_v2.py:330-347`, el único `json.loads` de salida de LLM que queda en `backend/app/`) | Bajo | Su fallo hoy es **conservador**: cae a junta completa (`:328`). El usuario paga 2 créditos de más, pero no se le miente. Es billing, y `lanzamiento-p0` ya cerró la honestidad del precio. Bajo valor por el precedente que sienta |
| Reintento del voto | Bajo | Ver arriba: ya no hay mentira que arreglar |

**Decisión**: el mínimo honesto es **un contrato de artefacto verificado en el generador**, con tres comprobaciones y
**un veredicto visible** en cada una:

1. **Declaración** (`artifact_open`, antes de emitir un solo byte de contenido): el `type` se normaliza y se contrasta
   con una lista blanca que es la **misma fuente** que anuncia el prompt. Un tipo desconocido no se adivina.
2. **Tamaño** (durante `artifact_chunk`): presupuesto en bytes; superarlo corta el artefacto, no la pestaña.
3. **Coherencia tipo↔contenido** (en `artifact_close`): la comprobación de **fondo** — que un `csv` tenga separador,
   que un `mermaid` empiece por una palabra clave de diagrama, que un `svg` tenga raíz `<svg`. Es la primera vez en todo
   el código que se comprueba **semántica** y no **forma**.

**Lo que este cambio explícitamente NO cubre** — y el dueño debe decirlo así:

- No verifica que el código **compile ni parsee**. Ningún lenguaje, ninguno.
- No verifica que un `markdown` sea correcto: *cualquier* texto es markdown válido. La afirmación es infalsificable y por
  eso **no se comprueba nada** en ese tipo, en vez de fingir que sí.
- No verifica **hechos, cifras ni citas**. Un acta con un número inventado pasa las tres comprobaciones.
- No hay **ningún reintento del modelo** en ningún punto. `grep max_retries backend/app/` seguirá devolviendo 0 después
  de este cambio, **a propósito**, y eso debe decirse en vez de maquillarse.
- No cubre el chat: sólo artefactos.

---

## Decisión D2 — #8: `DataGrid` aprende a leer CSV; `csv` **no** se quita del prompt

`PRODUCT.md:86` declara las tablas de datos ciudadanos de primera clase. Y hay un argumento más fuerte que ése:
**`csv` es la única ruta que existe hacia `DataGrid`** (`streamHandlers.ts:17`, `historyMapper.ts:38`: `'csv' → 'data_table'`).
Quitarlo del prompt no arregla el bug — **convierte `DataGrid` en el segundo visor muerto de la casa**, exactamente el
defecto que #12 describe. Se cambiaría un bug por el bug de al lado.

Y al revés: si el modelo **obedece** el prompt y emite CSV de verdad, hoy ve una tabla de unit economics en una sola
columna. Verificado sobre el parser actual: sin `|`, `parseRow` devuelve una celda, las guardas de `DataGrid.tsx:46-47`
exigen `cells.length > 1` y no recortan nada ⇒ una cabecera, una columna.

**Decisión**: `DataGrid` husmea el separador — `|` (markdown, prioridad), luego `\t`, `;`, `,` — con comillas al estilo
CSV (`"a,b"`, `""` escapado). No se renombra el tipo ni se toca el nombre `csv` del prompt: renombrar obligaría a migrar
el historial ya persistido y a tocar el mismo fichero que `tools-seguridad` está editando, a cambio de cero beneficio
visible. El mensaje de error del visor deja de decir «no es una tabla markdown» y pasa a ser agnóstico del formato.

## Decisión D3 — #12: se **enchufa** el SVG, no se borra el saneador

Se desarma el agujero **conectándolo**, no amputándolo. Cuatro hechos, todos verificados hoy:

- `SvgViewer.tsx` existe, en su propio chunk perezoso, con `DOMPurify.sanitize(…, {USE_PROFILES:{svg:true, svgFilters:true}})`.
- **Ya hay un test que ejerce esa rama con el DOMPurify real** y un `<script>` dentro (ver §Correcciones). No es código sin probar.
- `types/artifact.ts:3` incluye `'svg'` en `ArtifactType`, y `getDownloadExtension` devuelve `.svg`.
- `PRODUCT.md:86` promete SVG como artefacto de primera clase.

Borrar sería tirar un visor probado, partido en chunk y correcto, **y retirar una promesa de producto**, para arreglar
nada. Lo que hay no es un agujero: es una **capacidad declarada en cinco sitios y alcanzable en ninguno**.

**Decisión**: `'svg'` entra en los dos `typeMap` (`streamHandlers.ts:16-17`, `historyMapper.ts:37-38`), en la lista blanca
de A2 y en el prompt de `orchestrator.py:139` — porque enchufar el `typeMap` sin anunciarlo al modelo deja la capacidad
igual de inalcanzable, sólo que en otro sitio. **Condición innegociable**: como esto *activa* una ruta
`dangerouslySetInnerHTML` alimentada por salida de modelo, el commit no se acepta sin (a) un test que demuestre que el
**store** produce `type:'svg'` (hoy sólo está probado el renderer) y (b) una **mutación** que quite el `DOMPurify.sanitize`
y ponga el test en rojo. Sin la mutación, «está saneado» es una creencia, no un contrato.

## Decisión D4 — #14 + #15: normalizar sí, adivinar nunca; y nada se corta en silencio

Regla única: **SPHERE no pinta un artefacto bajo un tipo que no ha verificado, y no recorta nada sin decirlo.**

**Tipo desconocido (#14)** — hoy `type="markdwon"` se pinta como código sin una palabra.

- Normalización **determinista**: `strip` + minúsculas + alias documentados. Nada más.
- **No se corrige por parecido.** `markdwon → markdown` por distancia de edición 1 es tentador y es el mismo error que se
  arregla: una adivinanza que acierte el 90 % de las veces pinta el 10 % restante bajo un tipo que no es, y ahora con más
  confianza que antes. Se normaliza o se declara desconocido; no hay tercera vía.
- Un tipo fuera de la lista blanca ⇒ el artefacto **se abre como `code`** (texto sin formato, siempre seguro) y el evento
  `artifact_open` viaja con `declared_type: "markdwon"` y `type_status: "unknown"`.
- El panel muestra una banda visible: **«Este documento se declaró como `markdwon`, un tipo que SPHERE no reconoce. Se
  muestra como texto sin formato.»** El mensaje «Tipo de artefacto no soportado» de `ArtifactRenderer.tsx:73-80` —
  hoy inalcanzable desde el streaming, como dice la auditoría — deja de ser el sitio donde se cuenta esto.
- **Incoherencia tipo↔contenido** (mismo mecanismo, veredicto en `artifact_close`): banda distinta, en tono de aviso, no
  de error: **«Este documento se declaró como tabla y no se ha podido leer como tal. Se muestra tal cual llegó.»** El
  contenido **no se oculta nunca**: enseñarlo mal es el bug; esconderlo sería otro.

**Tamaño (#15)** — hoy un modelo en bucle congela la pestaña.

- Un presupuesto, en bytes de contenido de artefacto, en el punto donde se acumula (`stream.py:429`): **256 KB**.
  Escala: la *pregunta* está acotada a 10 000 caracteres (`stream.py:122`); un acta real ronda 4-15 KB; un artefacto de
  código grande, ~50 KB. 256 KB es ~10× el mayor artefacto legítimo y está muy por debajo de lo que atasca a
  `SyntaxHighlighter`, que tokeniza línea a línea en el hilo principal.
- Al superarlo: **dejan de emitirse `artifact_chunk`**, se emite `artifact_close` con `truncated: true`,
  `reason: "size_limit"`, `limit_bytes`. **El turno sigue vivo**: el resto de la conversación continúa. Matar el stream
  reabriría la ruta de reembolso (`_safe_refund`, `stream.py:84`, invocado en `:575` y `:581`) por un caso que no lo
  necesita, y perdería texto útil.
- El panel muestra el pie: **«Este documento superó el límite de 256 KB y se ha cortado aquí. Lo que ves está completo
  hasta ese punto.»** La descarga sigue disponible y baja lo recibido.
- **#6 usa el mismo canal**: fin de stream con artefacto abierto ⇒ `artifact_close` con `truncated: true`,
  `reason: "stream_ended"`. Es lo que devuelve `streamingArtifactBySession` a `null` (`streamHandlers.ts:108-110`) e impide
  que el siguiente artefacto se escriba encima del anterior.

## Decisión D5 — #21: **upsert por debate**, ni dedup ni versionado

| Opción | Veredicto |
|---|---|
| Dedup por contenido | **No.** Una regeneración produce texto distinto *a propósito* — es la razón de regenerar. No dedupla nada |
| Versionado (`superseded`, historial navegable) | **No ahora.** Es el modelo de datos honesto, pero exige campo de versión, regla de «cuál es la vigente», migración de los documentos ya escritos y UI que lo enseñe. No cabe en un lanzamiento y no resuelve nada que el usuario vea hoy |
| **Upsert: un debate, un acta vigente** | **Sí** |

El acta pertenece a **un debate**, no a una sesión: una sesión puede contener varios debates y cada debate tiene
exactamente un acta vigente. Y la señal que dice «esto es el mismo debate otra vez» ya existe y ya se lee en el nodo:
`state.get("board_regenerate")` (`board_v2.py:316`, `route_after_triage` `:657-661` la usa para saltar directo a
`synthesis`). Con regeneración, `_save_acta` **reemplaza** el acta más reciente de la sesión (`find_one_and_replace`
ordenado por `created_at` desc, `upsert=True`); sin ella, inserta. Cero campos nuevos salvo `updated_at`, aditivo.

**Qué ve el usuario que regenera tres veces**: en el panel, lo mismo que hoy — un acta, la última. La diferencia se ve en
el **debate siguiente de esa misma sesión**: hoy el CEO arranca citando dos borradores descartados como si fueran
conclusiones firmes de la junta (`board_v2.py:295-300`, «las 2 últimas»); tras el cambio arranca citando el acta que el
usuario se quedó. Y la cabecera del acta (`ActaHeader`, ya existente) muestra la fecha de la última regeneración, no la
de la primera.

**Límite declarado y probado**: si el usuario regenera desde un turno de junta que **no es el último**
(`regenerateFromId` trunca el hilo desde esa burbuja, `messagesSlice.ts:78-81`), sólo se reemplaza el acta más reciente;
las de los debates descartados entre medias quedan huérfanas. Cerrarlo bien exige un `debate_id` sellado en el acta y en
el checkpoint — trabajo posterior, no de este cambio. Se declara en la spec y se fija con un test.

---

## Colisiones y orden de aplicación

`tools-seguridad` se está aplicando **ahora mismo** sobre este mismo árbol y toca dos de nuestros ficheros.

**Estado observado al cerrar esta planificación** (`git status --porcelain`): C1 y **C2 ya están en el árbol de trabajo**
—`stream.py`, `api.ts`, `streamHandlers.ts`, `parseMessageParts.ts`, `citaLlana.ts`, `ToolExecutionCard.tsx` modificados,
más `test_stream_tool_events.py`, `ToolExecutionCard.test.tsx` y `streamToolConfirmation.test.ts` nuevos— sin commitear
todavía. C3, C4 y C5 aún no. Las líneas de la tabla son **posteriores** a C2.

| Fichero | Zona de `tools-seguridad` | Zona de este cambio | Conflicto esperado | Regla |
|---|---|---|---|---|
| `backend/app/presentation/api/v1/stream.py` | `_classify_tool_output` (`:41`, ya aplicado) + rama SSE `tool_confirmation` | A1 en `:428-479` y `:548-549`; A2 en `:429`, `:487-516` | **Ninguno textual** — 400+ líneas de separación, funciones distintas | Este cambio **se aplica después**. Rebase limpio esperado |
| `backend/app/application/orchestrator.py` | C4: quitar de `DEFAULT_CORE_PROMPTS` (`:149+`; borrados en `:181, :196-198, :206, :232, :249, :257` según su `tasks.md`) — **aún sin aplicar** | A4 y A2 en `:139`, dentro del bloque `PROTOCOLO DE ARTEFACTOS` (`:126-141`) | **Bajo.** Mismo fichero, hunks distintos separados por ≥10 líneas: con 3 líneas de contexto de git no solapan | Este cambio **se aplica después de C4**. Si `junta-honesta` reescribe prompts enteros, gana su versión y basta comprobar la guarda de A2 |
| `frontend/src/store/chat/streamHandlers.ts` | `onToolConfirmation` (zona de utensilios, tras `:110`) | A4 en `TIPOS_DE_ARTEFACTO` (`:16-17`) y A2 en `onArtifactOpen` (`:78-95`) | **Bajo**, hunks separados | Este cambio después |
| `frontend/src/services/api.ts` | `onToolConfirmation` en `StreamCallbacks` + rama `data.type` | A2 añade campos a `onArtifactOpen` (`:65`) / `onArtifactClose`, y a sus ramas (`:204-212`) | **Medio**: los dos editan el mismo `interface StreamCallbacks` y el mismo `switch` de `data.type` | Este cambio después. Resolución: **aditiva**, se conservan ambas ramas. Si el rebase marca conflicto, es de adyacencia, no semántico |
| `backend/tests/test_tenant_isolation.py` | C1 | No se toca | Ninguno | — |

**Orden global**: `lanzamiento-p0` (hecho) → `tools-seguridad` (en curso) → **`artefactos-guardarrailes`** → `junta-honesta`.
Motivo de ir después de `tools-seguridad` y no antes: sus cinco commits ya están planificados sobre `stream.py:36-54` y
`api.ts`; rebasar su plan sobre el nuestro les costaría más que a nosotros rebasar el nuestro sobre el suyo (nuestros
hunks son más pequeños y están más lejos).

**Guarda contra la desincronización**: A2 introduce un test que cruza **tres fuentes** — la lista blanca de Python, el
texto del prompt de `orchestrator.py:139` y las claves de los dos `typeMap` del frontend. Si `tools-seguridad` o
`junta-honesta` reescriben el prompt y se llevan por delante un tipo, la suite se pone roja en vez de fallar en silencio.

---

## Approach

Ocho commits en cuatro entregas. `strict_tdd`: cada uno entra con su RED, su GREEN y sus mutaciones.

| Orden | Commits | Por qué aquí |
|---|---|---|
| **PR1** | A1 → A2 | El contrato del backend. A1 antes que A2 porque A2 **usa** el `artifact_close` garantizado por A1 para llevar sus veredictos: sin A1 el veredicto de tamaño no tendría por dónde salir |
| **PR2** | A3 → A4 → A5 | Los tres visores. Independientes entre sí; van juntos porque comparten fichero de tests y revisor |
| **PR3** | A6 → A7 | Dos honestidades de backend sin relación con el streaming. Aisladas a propósito: A6 cambia un código HTTP y merece revisión propia |
| **PR4** | A8 | Sólo tests. Va al final porque no cambia producto y porque el mermaid real puede resultar frágil en jsdom: si lo es, se declara y se recorta sin bloquear nada |

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `backend/app/application/artifact_contract.py` | **New** | Lista blanca, normalización, presupuesto, comprobación de coherencia. Fuente única |
| `backend/app/presentation/api/v1/stream.py` | Modified | Cierre garantizado (A1); tres puntos de contrato (A2). **No se toca `_classify_tool_output` (`:41`)** |
| `backend/app/application/orchestrator.py` | Modified | `:139`: la lista de tipos del prompt pasa a derivarse de la lista blanca y gana `svg` |
| `backend/app/presentation/api/v1/sessions.py` | Modified | `:342-345`: el `except` propaga 5xx en vez de sesión vacía |
| `backend/app/application/board_v2.py` | Modified | `_save_acta` (`:262-278`) acepta `regenerate` y reemplaza; llamada en `:646` |
| `frontend/src/services/api.ts` | Modified | Campos nuevos en `onArtifactOpen` / `onArtifactClose` |
| `frontend/src/store/chat/{streamHandlers,historyMapper}.ts` | Modified | `'svg'` en el `typeMap`; veredictos al `Artifact` |
| `frontend/src/types/artifact.ts` | Modified | Campos de veredicto (opcionales, aditivos) |
| `frontend/src/components/artifacts/ArtifactPanel.tsx` | Modified | La banda de veredicto, una sola, sobre cualquier visor |
| `frontend/src/components/artifacts/DataGrid.tsx` | Modified | Husmeo de separador + comillas CSV |
| `frontend/src/components/artifacts/MarkdownViewer.tsx` | Modified | `rehypeSanitize` |
| `frontend/tests/components/MermaidDiagram.test.tsx` | Modified | Deja de probar el doble |
| `PRODUCT.md` | Modified | Una línea: qué garantiza y qué no garantiza SPHERE sobre un artefacto |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| La banda de veredicto aparece a menudo y ensucia la demo | Media | Es el objetivo: hoy esos casos existen y no se ven. Se recorre el guion de demo con las bandas activadas antes de enseñarlo. El tono está separado (error vs. aviso) justo para que un `csv` mal formado no parezca una caída |
| **A6 rompe la carga de historiales que hoy «funcionan» vacíos** | **Media-alta** | Es el riesgo real de este cambio. Un 5xx donde antes había 200 puede convertir un fallo tolerado en una pantalla de error. Mitigación: A6 distingue **sesión inexistente o vacía** (200 con lista vacía, correcto) de **fallo al leer** (5xx). Y el front ya tiene `ErrorBoundary`/`RegionBoundary` desde el rediseño (`MainLayout.tsx:216, :236, :294`) |
| El presupuesto de 256 KB corta un artefacto legítimo | Baja | ~10× el mayor observado. El corte es visible y descargable, no una pérdida silenciosa. El número vive en una constante, no repartido |
| Enchufar `svg` activa `dangerouslySetInnerHTML` sobre salida de modelo | Media | Condición de D3: test de store + **mutación** que quite DOMPurify y ponga el test en rojo. Sin eso, el commit no entra |
| `rehypeSanitize` en el acta rompe tablas o el `DocTable` | Baja | El esquema github incluye `table/thead/tbody/tr/th/td`, y `DocTable` sustituye el componente **después** del saneado. Se fija con un test de acta con tabla |
| Mermaid real en jsdom resulta lento o inestable | Media | A8 lo acota: el motor real sólo para el veredicto de validez; la degradación del componente se prueba con un doble que **rechaza** (que es lo que hoy no se prueba) |
| A7 reemplaza el acta equivocada al regenerar desde un turno antiguo | Baja | Límite declarado en la spec y **fijado con un test**, no descubierto en producción |
| El contrato del artefacto crece hasta querer validar código | Media | La spec enumera **qué no se comprueba**. Cualquier ampliación es otro change |

## Rollback Plan

Ocho commits independientes; `git revert <sha>` limpio en orden inverso. **Ninguno migra datos ni cambia el esquema de Mongo.**

- **A1/A2**: revertir devuelve el artefacto truncado y el tipo sin lista blanca. Los campos SSE nuevos son **aditivos**
  y opcionales en el frontend, así que un backend viejo con un frontend nuevo (o al revés) sigue funcionando: es la
  palanca de emergencia, un revert de backend sin tocar frontend.
- **A3/A4/A5**: sólo frontend, sin estado. A4 revertido devuelve los SVG a bloque de código —exactamente el
  comportamiento de hoy— y **no deja `dangerouslySetInnerHTML` activo**.
- **A6**: revertir devuelve la sesión vacía silenciosa. Es el único cambio de código HTTP: si en producción resulta
  ruidoso, se revierte solo, y su bandera es el propio `logger.warning` que ya existe en `sessions.py:344`.
- **A7**: revertir vuelve a `insert_one`. **Las actas ya reemplazadas no se recuperan** — es el único commit con pérdida
  de información posible, y por eso reemplaza sólo la más reciente y sólo en regeneración explícita.
- **A8**: sólo tests.

Orden de reversión si hay que deshacer todo: A8 → A7 → A6 → A5 → A4 → A3 → A2 → A1.

## Dependencies

- **`tools-seguridad` debe estar aplicado** antes de empezar (§Colisiones). No hay dependencia semántica, sí de rebase.
- Ninguna dependencia externa: sin librerías nuevas. `rehype-sanitize` y `dompurify` ya están en el proyecto y en uso.
- **Decisión de dueño pendiente, no bloqueante**: el texto exacto de las tres bandas de veredicto es copy de producto.
  Las frases de D4 son la propuesta; cambiarlas no cambia el código.

## Success Criteria

- [ ] Un stream que termina con el artefacto abierto emite `artifact_close` con `truncated: true`, y el `artifact_chunk` del mensaje siguiente **no** se escribe encima del artefacto anterior.
- [ ] `type="markdwon"` produce `type_status: "unknown"` con `declared_type` intacto, se pinta como texto sin formato y **el usuario lee por qué**.
- [ ] Ningún tipo se corrige por parecido: existe un test que lo prohíbe explícitamente.
- [ ] Un artefacto de más de 256 KB se corta con aviso visible; la pestaña sigue respondiendo y la descarga funciona.
- [ ] Un CSV real (`Director,Voto,Confianza`) se pinta con **tres** columnas, no con una.
- [ ] Un artefacto `type="svg"` llega al `SvgViewer` **desde el store** (streaming e historial), y una mutación que quite `DOMPurify` pone un test en rojo.
- [ ] El visor del acta neutraliza `<script>` **por decisión**: añadir `rehypeRaw` pone un test en rojo.
- [ ] Un fallo leyendo el historial devuelve error; una sesión sin mensajes sigue devolviendo 200 con lista vacía.
- [ ] Regenerar tres veces deja **un** acta en `board_actas` para ese debate, y el debate siguiente no cita borradores.
- [ ] `MermaidDiagram` demuestra su degradación con un motor que **rechaza**, y `securityLevel: 'strict'` está aserido.
- [ ] La lista blanca, el prompt y los dos `typeMap` están cruzados por un test que se pone rojo si se separan.
- [ ] Backend ≥ 358 y frontend ≥ 875 / 103 ficheros en verde, más los nuevos. (Las líneas base subirán con `tools-seguridad`; quien ejecute mide de nuevo.)

## Capabilities

### New Capabilities

- `artifact-contract`: qué declara un artefacto, qué se verifica de esa declaración (tipo, tamaño, coherencia con el contenido), qué **no** se verifica, y qué veredicto viaja al cliente en cada caso. Incluye la garantía de que todo artefacto abierto se cierra.
- `artifact-viewers`: qué acepta cada visor y cómo degrada — tablas en markdown **y** en CSV, SVG saneado y alcanzable, markdown del acta saneado por decisión, y la banda de veredicto común.
- `session-history-integrity`: un fallo al leer el historial se comunica como fallo; una sesión sin mensajes se comunica como sesión sin mensajes. Nunca se confunden.
- `board-acta-memory`: una junta, un acta vigente por debate; qué se relee como contexto y qué límite tiene la regla.

### Modified Capabilities

None — ninguna spec existente (`billing-frontend`, `core-agents-endpoint`, `credit-system`, `infrastructure`,
`model-provider-routing`, `rate-limiting`, `settings-page`) cubre artefactos, visores, historial de sesión ni actas.
