# Design: artefactos-guardarrailes

> Base: `proposal.md` + las 4 delta specs (18 requisitos, 53 escenarios). Cada afirmación está verificada contra
> `feat/lanzamiento-e2e` en esta sesión; lo no verificado va marcado **[hipótesis]**. **No se ejecutó ningún build.**
> Los números de línea son de la instantánea con **C1-C2 de `tools-seguridad` en el árbol de trabajo**; `stream.py`
> creció +30 líneas *durante* esta planificación. **Localizar por símbolo, no por número.**

## Technical Approach

Ocho commits (A1→A8). El hilo conductor es el mismo que el del cambio hermano `tools-seguridad`, aplicado a otro
objeto: **mover la garantía de «hay que acordarse» a «no se puede olvidar»**.

- El tipo de artefacto sale de **una** lista blanca, de la que se derivan el prompt y la validación, y a la que un test
  ata los dos `typeMap` del frontend (A2). Nadie puede volver a inventarse un tipo en un sitio y olvidarlo en otro.
- El cierre del artefacto deja de depender de que el modelo escriba la etiqueta: lo garantiza el generador (A1).
- El veredicto viaja **con el artefacto**, en los eventos que ya existen, y el panel lo pinta en **un** sitio (A2).
- Los tres visores dejan de tener rutas muertas o formatos que no aceptan (A3, A4, A5).
- Las dos honestidades de backend sin relación con el streaming van aparte (A6, A7).

**Restricción rectora nº1**: en streaming **no se puede reintentar lo ya emitido**. Todo el diseño se organiza alrededor
de esto — ver D1 del `proposal.md`. La consecuencia práctica: las comprobaciones se reparten entre **antes de emitir**
(tipo), **mientras se emite** (tamaño) y **al cerrar** (coherencia), y ninguna intenta reparar contenido.

**Restricción rectora nº2**: **no se toca `_classify_tool_output`** (`stream.py:41`) ni ninguna zona de utensilios.
Es de `tools-seguridad`, se está aplicando ahora, y tocarla nos pone en su camino sin necesidad.

---

## Architecture Decisions

### D1 — El contrato vive en un módulo de aplicación, no en la capa de presentación

**Choice**: módulo nuevo `backend/app/application/artifact_contract.py`, sin dependencias de FastAPI ni de SSE.

```python
ARTIFACT_TYPES: dict[str, str]        # alias -> tipo canónico. Fuente ÚNICA.
ARTIFACT_MAX_BYTES: int = 262_144

def normalize_type(raw: str) -> tuple[str, str]:   # -> (tipo_efectivo, type_status)
def check_content(tipo: str, contenido: str) -> str:  # -> "ok" | "mismatch" | "unchecked"
def prompt_type_list() -> str:        # "code|markdown|mermaid|csv|svg" para orchestrator.py:139
```

**Por qué en `application/` y no en `presentation/api/v1/`**: `orchestrator.py` (que construye el prompt) es de
`application/`. Si el contrato viviera en `presentation/`, el prompt importaría hacia arriba y se rompería la dirección
de capas que `config.yaml` declara (`presentation → application → domain → infrastructure`). Además es lo que hace el
módulo **testeable sin levantar el stream**: los 20 escenarios de `artifact-contract` se ejecutan sobre funciones puras.

**Por qué `prompt_type_list()` y no una constante pegada en el prompt**: es la mitad de la guarda de AC-001. La otra
mitad es el test que cruza las tres fuentes.

| Alternativa descartada | Por qué |
|---|---|
| Constantes sueltas dentro de `stream.py` | Es exactamente la forma del bug #14: la verdad repartida. Y deja el prompt sin forma de derivarse |
| Validación con Pydantic sobre un modelo de artefacto | El artefacto no es un objeto: es un estado de una máquina que se recorre token a token. No hay un momento en que exista entero antes de emitirse |
| Un `Enum` en vez de `dict` de alias | El `dict` es lo que permite normalizar sin adivinar (AC-002): `csv → csv` y `CSV → csv` sin abrir la puerta a `markdwon → markdown` |

### D2 — El cierre garantizado NO va en un `finally`

**Este es el error que hay que no cometer.** La forma obvia —envolver el bucle en `try/finally` y emitir
`artifact_close` en el `finally`— **está mal** en un generador asíncrono: el `finally` también corre cuando el cliente
se desconecta, y un `yield` después de `GeneratorExit` produce
`RuntimeError: async generator ignored GeneratorExit`.

La estructura actual ya distingue los tres caminos (`stream.py:572` `except GeneratorExit` → `return` sin emitir;
`:577` `except Exception` → sí emite `error` + `[DONE]`; camino normal → `[DONE]`). El diseño **respeta esa forma**:

```python
def _cierre_forzado(artifact_buffer: str, razon: str) -> list[str]:
    """Eventos SSE que cierran un artefacto abierto. Devuelve, NO emite."""
```

Se llama desde **dos** sitios, ambos con `yield` legal:

1. camino normal, justo antes del volcado de `buffer` (`stream.py:548`);
2. rama `except Exception` (`:577`), **antes** del evento `error`, para que el panel cierre el artefacto y sólo después
   pinte el fallo.

En `except GeneratorExit` **no se llama**: el cliente ya no escucha y `stopGeneration` limpia
`streamingArtifactBySession` en el navegador (`messagesSlice.ts:257`) — verificado.

| Alternativa descartada | Por qué |
|---|---|
| `try/finally` alrededor del bucle | `RuntimeError` en la desconexión, que es el caso **más frecuente** de los tres |
| Emitir el cierre desde el `finally` sólo si no hubo `GeneratorExit` (bandera) | Funciona, pero la bandera es un estado más que mantener sincronizado, y el `finally` de `:585` ya existe con otra responsabilidad |
| Cerrar sólo en el camino normal | Deja el artefacto abierto cuando la inferencia lanza — que es justo cuando más probable es que esté truncado |

### D3 — Los veredictos viajan en los eventos que ya existen

**Choice**: no hay eventos SSE nuevos. Se añaden campos a `artifact_open` y `artifact_close`.

```
artifact_open  += declared_type?: str, type_status: "ok" | "unknown"
artifact_close += truncated?: bool, reason?: "size_limit" | "stream_ended",
                  limit_bytes?: int, content_status: "ok" | "mismatch" | "unchecked"
```

Todos **aditivos y opcionales**. Verificado que esto es seguro en las dos direcciones: `api.ts:204-212` construye el
objeto de `artifact_open` campo a campo con defaults y despacha `artifact_close` sin payload, así que un backend nuevo
con un frontend viejo no rompe nada; y un frontend nuevo con un backend viejo ve `type_status` ausente, que se trata
como `"ok"`. **Es lo que hace que el rollback de A2 sea un revert de backend sin tocar frontend.**

**Por qué no un evento `artifact_verdict` propio**: llegaría *después* de `artifact_close`, y el panel ya habría pintado
el artefacto sin banda; habría un fotograma con el artefacto en su estado equivocado. Colgar el veredicto del evento que
ya marca el momento correcto elimina esa ventana.

### D4 — Una sola banda de veredicto, en el panel, no en cada visor

**Choice**: la banda se pinta en `ArtifactPanel.tsx`, encima del `ArtifactRenderer`, leyendo campos del propio
`Artifact`. Los cinco visores **no se enteran** de que existe.

Motivo: hay cinco visores y tres veredictos. Repartirlos daría quince sitios donde olvidarse de uno — y el olvido es
exactamente la clase de bug que este cambio arregla. Además `ArtifactPanel` ya es el sitio donde se decide qué se monta
alrededor del visor (`ActaActions` sólo con `type === 'markdown'`, `RegionBoundary` en `:191-197`).

Los campos de veredicto entran en `types/artifact.ts` como **opcionales**: un `Artifact` construido a mano en un test
existente sigue compilando. Verificado que hay muchos (`makeArtifact` en al menos 4 ficheros de test).

### D5 — El husmeo de separador de `DataGrid` es determinista y prioriza markdown

**Choice**: una función `detectarSeparador(primeraLineaNoVacia) -> '|' | '\t' | ';' | ','` con ese orden fijo, y dos
troceadores: el actual `splitCells` (markdown, con `\|` escapado) y uno nuevo con comillas al estilo CSV.

**Por qué markdown primero y no «el que más aparezca»**: la heurística de frecuencia se equivoca justo en el caso caro
—una tabla markdown de cifras con separador de millares (`| Ingresos | 1,200 | 3,400 |`) tiene más comas que barras— y
el error produce columnas creíbles y falsas, que es la clase de daño que #7 ya causó una vez.

**Por qué el orden `\t`, `;`, `,` después**: el tabulador no aparece por accidente dentro de una celda; el `;` es el CSV
de locale español (y este producto es español) y casi nunca aparece en prosa; la coma es la última porque es la más
ambigua.

Lo que **no** cambia: `parseRow`, `isSeparatorRow`, el relleno por la derecha y los 10 tests de regresión D35 de
`DataGrid.test.tsx`. La ruta markdown queda intacta byte a byte.

### D6 — `svg` se enchufa en tres sitios, y la mutación es el contrato

**Choice**: `'svg': 'svg'` en `streamHandlers.ts:16-17` y `historyMapper.ts:37-38`, `svg` en `ARTIFACT_TYPES`, y `svg`
en la lista del prompt (`orchestrator.py:139`).

El detalle que hace esto seguro no es el código, es la prueba. Hoy existe un test que ejerce `SvgViewer` con un
`<script>` dentro y el DOMPurify **real** (`ArtifactRenderer.test.tsx`, caso «sanea el SVG en un trozo aparte»). Lo que
falta y A4 añade:

1. un test de **store** (hoy nadie comprueba que el store llegue a producir `type: 'svg'`);
2. una **mutación** que quite `DOMPurify.sanitize` de `SvgViewer.tsx` y ponga el test del `<script>` en rojo.

Sin (2), «está saneado» es una creencia sobre una línea que cualquiera puede borrar en un refactor.

**[hipótesis]** No se ha verificado que ningún modelo emita hoy `type="svg"` (el prompt no lo ofrecía). El primero que
lo haga después de A4 será el primero en ejercer la ruta en producción. Por eso la mutación no es opcional.

### D7 — `rehypeSanitize` en el acta: el valor está en la mutación inversa

`MarkdownViewer.tsx:68` pasa a `rehypePlugins={[rehypeSanitize]}`, copiando literalmente `MessageBubble.tsx:413`.

Hoy el acta ya es segura: react-markdown 10.1.0 no renderiza HTML crudo sin `rehypeRaw` y su `defaultUrlTransform`
neutraliza `javascript:` — la auditoría lo verificó. **Así que el commit no cierra un agujero abierto: cierra el camino
por el que se abriría.** El valor entero está en la mutación de A5: **añadir `rehypeRaw`** —el cambio de una línea que
alguien hará el día que quiera «que se vean las tablas HTML del acta»— y comprobar que el test se pone rojo.

Riesgo comprobado: el esquema por defecto de `rehype-sanitize` (github) admite `table/thead/tbody/tr/th/td`, y
`DocTable` sustituye el componente `table` **después** del saneado, así que la tabla del acta y su contenedor
desplazable siguen intactos. Se fija con un escenario propio (AV-004).

### D8 — El upsert del acta se apoya en la señal que ya existe

`_save_acta` gana un parámetro `regenerate: bool`, que la llamada de `board_v2.py:646` toma de
`state.get("board_regenerate")` — la misma señal que `route_after_triage` (`:657-661`) ya usa para saltar a síntesis.

```python
if regenerate:
    await col.find_one_and_replace(
        {"user_id": user_id, "session_id": session_id},
        doc, sort=[("created_at", -1)], upsert=True,
    )
else:
    await col.insert_one(doc)
```

**Por qué `find_one_and_replace` con `sort` y no `update_one`**: `update_one` sin `sort` toca un documento arbitrario del
filtro. El `sort` por `created_at` descendente es lo que hace que «la más reciente» sea una regla y no una casualidad.

**Por qué se conserva `created_at` y se añade `updated_at`**: `_load_prior_actas_context` ordena por `created_at`
(`:295-299`). Si el reemplazo lo pisara, un acta regenerada saltaría por delante de debates posteriores en el contexto
del CEO — se arreglaría #21 introduciendo un desorden nuevo.

Límite declarado en BA-003 y **fijado con test**: regenerar desde un turno que no es el último deja huérfanas las actas
intermedias. El cierre limpio pide un `debate_id` sellado en el acta y en el checkpoint; no cabe aquí.

### D9 — A6 distingue «vacío» de «roto», y no toca la vista pública

El `except Exception` de `sessions.py:342-345` se convierte en `raise HTTPException(500, …)` con mensaje presentable.

Tres cosas que **no** cambian, y hay que comprobarlo tarea a tarea porque es donde está el riesgo del commit:

1. `require_owner` (`:322`) lanza `HTTPException` y se re-lanza en `:341-342` **antes** — el camino de autorización no
   entra por el nuevo 500.
2. Sesión existente sin mensajes → sigue siendo 200 con `messages: []`. Es un camino distinto: no pasa por el `except`.
3. `_load_session_messages` tiene un **segundo consumidor**, la vista pública compartida (`sessions.py:561`). Ese camino
   **no se toca** (SH-003): un visitante anónimo no debe empezar a ver errores de infraestructura.

---

## Diagrama de secuencia — el artefacto y su veredicto

`config.yaml` exige diagrama para flujos con SSE. Este es el camino completo, con los tres puntos de comprobación:

```
Modelo            stream.py                    api.ts        streamHandlers.ts     ArtifactPanel
  │                   │                           │                 │                   │
  │ <sphere_artifact  │                           │                 │                   │
  │  type="markdwon"> │                           │                 │                   │
  ├──────────────────►│                           │                 │                   │
  │                   │ (1) normalize_type()      │                 │                   │
  │                   │     → ("code","unknown")  │                 │                   │
  │                   │  artifact_open{           │                 │                   │
  │                   │    artifact_type:"code",  │                 │                   │
  │                   │    declared_type:"markdwon",                │                   │
  │                   │    type_status:"unknown"} │                 │                   │
  │                   ├──────────────────────────►│  onArtifactOpen ├─ addArtifact ─────►│
  │                   │                           │                 │   type:'code'     │ banda:
  │                   │                           │                 │   typeStatus:     │ «se declaró
  │                   │                           │                 │   'unknown'       │  markdwon…»
  │ …contenido…       │                           │                 │                   │
  ├──────────────────►│ (2) len(acc) < 256 KB ?   │                 │                   │
  │                   │  artifact_chunk           │                 │                   │
  │                   ├──────────────────────────►│  onArtifactChunk├─ append ─────────►│
  │                   │                           │                 │                   │
  │ [se corta: sin    │ (3) fin de bucle con      │                 │                   │
  │  </sphere_artifact>]    is_inside_artifact    │                 │                   │
  ├──────────────────►│  _cierre_forzado():       │                 │                   │
  │                   │   artifact_chunk (resto)  │                 │                   │
  │                   │   artifact_close{         │                 │                   │
  │                   │     truncated:true,       │                 │                   │
  │                   │     reason:"stream_ended",│                 │                   │
  │                   │     content_status:       │                 │                   │
  │                   │       "unchecked"}        │                 │                   │
  │                   ├──────────────────────────►│  onArtifactClose├─ streamingArtifact│
  │                   │                           │                 │   BySession=null  │ pie:
  │                   │  [DONE]                   │                 │                   │ «terminó antes
  │                   ├──────────────────────────►│                 │                   │  de cerrar»
```

**El paso (3) es #6 entero.** Hoy no existe: `artifact_close` no se emite, `streamingArtifactBySession` se queda con el
id viejo (`streamHandlers.ts:94`), y el primer `artifact_chunk` del turno siguiente entra por `:97-106` y se concatena
**al artefacto anterior**. Cerrar es lo que rompe esa cadena.

Los tres puntos numerados son, literalmente, D1 del `proposal.md`: (1) antes de emitir nada, (2) mientras se emite,
(3) al cerrar. No hay un cuarto punto donde un reintento quepa.

---

## Flujo de datos de A7 — una junta, un acta

```
synthesis_node (board_v2.py:646)
   │  acta_content = result["final_response"]
   │  regenerate = state.get("board_regenerate")
   ▼
_save_acta(user_id, session_id, content, regenerate)
   │
   ├── regenerate=False ──► insert_one({user_id, session_id, created_at, summary, acta_md})
   │
   └── regenerate=True  ──► find_one_and_replace(
                              {user_id, session_id}, sort=[("created_at",-1)], upsert=True)
                              conserva created_at · añade updated_at
   ▼
_load_prior_actas_context(user_id, session_id, limit=2)   ← debate SIGUIENTE
   │  find({user_id, session_id}).sort(created_at,-1).limit(2)
   ▼
opener del CEO (board_v2.py:375-380)
```

Antes: tres regeneraciones ⇒ tres documentos ⇒ el `limit(2)` devuelve **dos borradores descartados**.
Después: un documento por debate ⇒ el `limit(2)` devuelve las conclusiones de los dos debates anteriores reales.

---

## Estructura de ficheros

```
backend/app/application/
  artifact_contract.py                    NUEVO  — lista blanca, normalización, presupuesto, coherencia
  orchestrator.py                         MOD    — :139 deriva del contrato + svg
  board_v2.py                             MOD    — _save_acta(…, regenerate) + llamada en :646
backend/app/presentation/api/v1/
  stream.py                               MOD    — _cierre_forzado + 3 puntos de contrato
  sessions.py                             MOD    — :342-345 propaga el fallo
backend/tests/
  test_artifact_contract.py               NUEVO  — AC-001…AC-007 sobre funciones puras
  test_stream_artifacts.py                NUEVO  — AC-003…AC-006 sobre el generador
  test_sessions_history_integrity.py      NUEVO  — SH-001…SH-003
  test_board_actas.py                     MOD    — BA-001…BA-003

frontend/src/
  types/artifact.ts                       MOD    — campos de veredicto, opcionales
  services/api.ts                         MOD    — campos nuevos en los dos callbacks
  store/chat/streamHandlers.ts            MOD    — 'svg' + veredictos → Artifact
  store/chat/historyMapper.ts             MOD    — 'svg'
  components/artifacts/ArtifactPanel.tsx  MOD    — la banda, única
  components/artifacts/DataGrid.tsx       MOD    — husmeo de separador + comillas CSV
  components/artifacts/MarkdownViewer.tsx MOD    — rehypeSanitize
frontend/tests/
  components/BandaDeVeredicto.test.tsx    NUEVO  — AV-001
  components/DataGrid.test.tsx            MOD    — AV-002 (los 10 de D35 intactos)
  components/MarkdownViewer.test.tsx      NUEVO  — AV-004
  components/MermaidDiagram.test.tsx      MOD    — AV-005
  store/artefactoSvg.test.ts              NUEVO  — AV-003 (store, las dos rutas)
```

---

## Verificación y mutaciones

`strict_tdd: true`. Cada requisito de comportamiento lleva su mutación en `tasks.md`. Las cinco que importan:

| Mutación | Qué demuestra |
|---|---|
| Quitar `DOMPurify.sanitize` de `SvgViewer` | Que el saneado es lo que hace segura la ruta `dangerouslySetInnerHTML` que A4 **activa** |
| Añadir `rehypeRaw` a `MarkdownViewer` | Que el acta está protegida contra el cambio de una línea que la auditoría predijo |
| Devolver `insert_one` incondicional en `_save_acta` | Que el upsert es lo que impide que el CEO cite borradores |
| Sustituir el cruce de las tres fuentes por una lista literal en el test | **El test que no puede fallar**: la suite pasa, y ese pase es el fallo. Se rechaza en verify |
| Corregir `markdwon → markdown` por distancia de edición | Que AC-002 prohíbe adivinar, y no sólo lo recomienda |

Comandos, entorno y líneas base van en `tasks.md`. **Nunca se ejecuta un build.**

---

## Riesgos de diseño no resueltos

| Cuestión | Estado |
|---|---|
| Un `debate_id` sellado en acta y checkpoint cerraría BA-003 del todo | **Diferido, declarado y probado.** Exige tocar el estado del grafo |
| El presupuesto de 256 KB es un número elegido por escala, no medido en producción | **[hipótesis]**. Vive en una constante única para poder moverlo con un diff de una línea |
| Mermaid real en jsdom puede ser lento o inestable (AV-005, tercer escenario) | Acotado a A8 y a un solo escenario. Si resulta inestable, **se declara en el change**; no se sustituye por un doble que siempre resuelve |
| `content_status: "mismatch"` en `csv` puede dispararse con una tabla de una sola columna legítima | Aceptado: el veredicto es un **aviso**, no un bloqueo, y el contenido se enseña igual |
