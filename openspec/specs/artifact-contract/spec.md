# artifact-contract

> **Source**: artefactos-guardarrailes (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Define el contrato del generador de artefactos (`backend/app/`): qué tipos existen, cómo se normaliza lo que el modelo
declara, qué se emite cuando el modelo se equivoca o no termina, y cuánto contenido se admite. Un artefacto siempre se
transmite y se etiqueta; nunca se corrige, se oculta ni se descarta. Lo que ocurre en pantalla vive en
`artifact-viewers`.

## Contexto

- **Declaración**: los atributos de la etiqueta de apertura `<sphere_artifact title="…" type="…" language="…">`,
  parseada en `stream.py:483-522` (bloque de `OPEN_TAG_PATTERN`; el default sin lista blanca estaba en `:503-505`).
  **Los números de línea son de la instantánea con C1-C2 de `tools-seguridad` en el árbol**; localizar por símbolo.
- **Lista blanca** (`ARTIFACT_TYPES`): el conjunto de tipos que SPHERE sabe pintar.
- **Veredicto**: el juicio del sistema sobre la declaración, transportado en los eventos SSE `artifact_open` y
  `artifact_close`. Un veredicto **nunca** oculta contenido; sólo lo etiqueta.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| AC-001 | Una única lista blanca `ARTIFACT_TYPES` en `artifact_contract.py` MUST alimentar prompt y validación; el conjunto SHALL ser `{code, markdown, mermaid, csv, svg}` | 2 |
| AC-002 | La normalización del tipo MUST ser determinista (recorte, minúsculas, alias) y MUST NOT corregir por semejanza | 2 |
| AC-003 | Un tipo fuera de la lista blanca MUST emitirse como `artifact_type: "code"` con `declared_type` y `type_status: "unknown"`, sin rechazar el artefacto | 2 |
| AC-004 | Todo artefacto abierto MUST cerrarse: volcado del buffer y `artifact_close` con `truncated: true` y `reason: "stream_ended"` | 3 |
| AC-005 | El contenido MUST respetar `ARTIFACT_MAX_BYTES = 262144` (256 KB) y cortarse con `reason: "size_limit"` sin abortar el turno | 3 |
| AC-006 | `artifact_close` MUST llevar `content_status` (`ok` / `mismatch` / `unchecked`) sin modificar ni ocultar el contenido | 5 |
| AC-007 | El producto MUST NOT prometer compilación, veracidad, markdown válido ni reintento del modelo | 1 |

### AC-001: Lista Blanca Única de Tipos

El sistema MUST mantener una única definición de los tipos de artefacto admitidos, en
`backend/app/application/artifact_contract.py`, y MUST derivar de ella tanto el texto del prompt
(`orchestrator.py:139`) como la validación del stream. El conjunto SHALL ser exactamente
`{code, markdown, mermaid, csv, svg}`.

Ninguna otra parte del backend MUST NOT declarar su propia lista de tipos.

- GIVEN la lista blanca `ARTIFACT_TYPES`
  WHEN se inspecciona el texto del protocolo de artefactos que recibe el modelo
  THEN los tipos ofrecidos en la etiqueta `type="…"` MUST ser exactamente los de la lista blanca, sin sobrantes ni ausencias

- GIVEN las claves de `TIPOS_DE_ARTEFACTO` en `frontend/src/store/chat/streamHandlers.ts` e `historyMapper.ts`
  WHEN se comparan con `ARTIFACT_TYPES`
  THEN MUST coincidir; una diferencia MUST hacer fallar la suite

> Nota de implementación: el cruce se hace desde un test, leyendo las tres fuentes. Es la guarda contra que un cambio
> posterior se lleve un tipo por delante al reescribir prompts.

### AC-002: Normalización Determinista, Sin Adivinar

El sistema MUST normalizar el tipo declarado aplicando **sólo**: recorte de espacios, minúsculas y los alias
documentados en la lista blanca.

El sistema MUST NOT corregir un tipo por semejanza, distancia de edición, ni ninguna otra heurística de parecido.

- GIVEN una declaración `type=" MarkDown "`
  WHEN el stream la normaliza
  THEN el tipo resultante MUST ser `markdown` y el veredicto MUST ser `ok`

- GIVEN una declaración `type="markdwon"`
  WHEN el stream la normaliza
  THEN el tipo efectivo MUST ser `code`
  AND el veredicto MUST ser `unknown`
  AND el tipo declarado original MUST conservarse literalmente como `markdwon`
  AND el sistema MUST NOT deducir `markdown`

### AC-003: Un Tipo Desconocido se Declara, No se Disimula

Cuando el tipo normalizado no pertenece a la lista blanca, el evento `artifact_open` MUST incluir
`artifact_type: "code"`, `declared_type: <el literal recibido>` y `type_status: "unknown"`.

El sistema MUST NOT rechazar el artefacto ni interrumpir el turno por un tipo desconocido.

- GIVEN un modelo que emite `<sphere_artifact title="Plan" type="markdwon">` seguido de contenido
  WHEN el stream procesa la apertura
  THEN MUST emitirse `artifact_open` con `type_status: "unknown"` y `declared_type: "markdwon"`
  AND el contenido MUST transmitirse íntegro por `artifact_chunk`
  AND el turno MUST continuar normalmente

- GIVEN una declaración `type="mermaid"`
  WHEN el stream procesa la apertura
  THEN `type_status` MUST ser `ok`
  AND `declared_type` MAY omitirse

### AC-004: Todo Artefacto Abierto se Cierra

Cuando el bucle de generación termina —por `[DONE]`, por excepción o por agotamiento del modelo— con un artefacto
abierto, el sistema MUST volcar el resto de `artifact_buffer` como `artifact_chunk` y MUST emitir `artifact_close`
con `truncated: true` y `reason: "stream_ended"`.

El sistema MUST NOT descartar `artifact_buffer` sin emitirlo.

En el caso de desconexión del cliente (`GeneratorExit`, `stream.py:572-576`) el sistema MUST NOT intentar emitir
eventos: el cliente ya no escucha, un `yield` tras `GeneratorExit` produce
`RuntimeError: async generator ignored GeneratorExit`, y `stopGeneration` ya limpia el canal en el navegador
(`frontend/src/store/chat/messagesSlice.ts:257`).

- GIVEN un modelo que emite `<sphere_artifact title="Acta" type="markdown">` y contenido, y termina **sin** `</sphere_artifact>`
  WHEN el generador llega al final del bucle
  THEN MUST emitirse el resto pendiente como `artifact_chunk`
  AND MUST emitirse `artifact_close` con `truncated: true` y `reason: "stream_ended"`

- GIVEN un turno que dejó un artefacto truncado y cerrado por AC-004
  WHEN un turno posterior abre un artefacto nuevo y emite `artifact_chunk`
  THEN el contenido nuevo MUST ir al artefacto nuevo
  AND el artefacto anterior MUST conservar su contenido intacto

- GIVEN un modelo que emite `</sphere_artifact>` correctamente
  WHEN el stream lo detecta
  THEN MUST emitirse `artifact_close` sin `truncated`
  AND el residuo posterior a la etiqueta MUST seguir emitiéndose como `token`

### AC-005: Presupuesto de Tamaño con Corte Visible

El sistema MUST definir un presupuesto único de contenido de artefacto, `ARTIFACT_MAX_BYTES = 262144` (256 KB),
en `artifact_contract.py`.

El presupuesto se mide sobre el contenido acumulado del artefacto, en el punto donde se acumula
(`artifact_buffer`, `stream.py:429`).

Cuando el contenido acumulado de un artefacto alcanza el presupuesto, el sistema MUST:

1. dejar de emitir `artifact_chunk` para ese artefacto;
2. emitir `artifact_close` con `truncated: true`, `reason: "size_limit"` y `limit_bytes: 262144`;
3. **continuar el turno**: los tokens de chat posteriores MUST seguir emitiéndose.

El sistema MUST NOT abortar el stream ni disparar reembolso por superar el presupuesto.

- GIVEN un modelo que emite 1 MB de contenido dentro de un artefacto
  WHEN el acumulado alcanza 262 144 bytes
  THEN MUST emitirse `artifact_close` con `reason: "size_limit"`
  AND MUST NOT emitirse ningún `artifact_chunk` más para ese artefacto
  AND el total transmitido para ese artefacto MUST ser ≤ 262 144 bytes

- GIVEN un artefacto cortado por presupuesto
  WHEN el modelo sigue escribiendo texto de chat tras cerrar el artefacto
  THEN ese texto MUST llegar como eventos `token`
  AND MUST emitirse `[DONE]` al final

- GIVEN un acta de 12 KB
  WHEN se transmite
  THEN MUST llegar completa y `artifact_close` MUST NOT llevar `truncated`

### AC-006: Coherencia entre el Tipo Declarado y el Contenido

En el cierre, el sistema MUST comprobar que el contenido es compatible con el tipo declarado, y MUST incluir
en `artifact_close` un campo `content_status` con valor `ok`, `mismatch` o `unchecked`.

Las comprobaciones SHALL ser exactamente estas:

| Tipo | Comprobación | Veredicto si falla |
|---|---|---|
| `csv` | El contenido contiene al menos un separador reconocido (`\|`, `\t`, `;`, `,`) en su primera línea no vacía | `mismatch` |
| `mermaid` | La primera línea no vacía empieza por una palabra clave de diagrama conocida | `mismatch` |
| `svg` | El contenido, recortado, contiene una raíz `<svg` | `mismatch` |
| `code` | Ninguna | `unchecked` |
| `markdown` | Ninguna — **cualquier texto es markdown válido**; comprobarlo sería fingir | `unchecked` |

El sistema MUST NOT modificar, reparar ni ocultar el contenido de un artefacto con veredicto `mismatch`.

El sistema MUST NOT aplicar estas comprobaciones a un artefacto ya truncado por AC-004 o AC-005: un contenido
incompleto no es un contenido incoherente. En ese caso `content_status` MUST ser `unchecked`.

- GIVEN un artefacto `type="csv"` cuyo contenido es un párrafo en prosa sin separadores
  WHEN el artefacto se cierra
  THEN `content_status` MUST ser `mismatch`
  AND el contenido MUST haberse transmitido íntegro

- GIVEN un artefacto `type="mermaid"` cuyo contenido empieza por `Aquí tienes el diagrama:`
  WHEN el artefacto se cierra
  THEN `content_status` MUST ser `mismatch`

- GIVEN un artefacto `type="mermaid"` cuyo contenido empieza por `graph TD;`
  WHEN el artefacto se cierra
  THEN `content_status` MUST ser `ok`

- GIVEN un artefacto `type="markdown"` con cualquier contenido
  WHEN el artefacto se cierra
  THEN `content_status` MUST ser `unchecked`

- GIVEN un artefacto `type="csv"` cortado por AC-005 en mitad de la primera línea
  WHEN el artefacto se cierra
  THEN `content_status` MUST ser `unchecked`
  AND `truncated` MUST ser `true`

### AC-007: Lo Que Este Contrato NO Garantiza

Esta sección es normativa: define los límites que MUST NOT afirmarse en producto ni en la comunicación al cliente.

El sistema MUST NOT afirmar, ni en `PRODUCT.md` ni en la UI, que:

- el código de un artefacto compila o parsea — **no se comprueba en ningún lenguaje**;
- el contenido de un artefacto es correcto, veraz o está bien citado — **no se comprueba nada de eso**;
- un artefacto `markdown` es válido — la afirmación es infalsificable y no se comprueba;
- existe reintento del modelo — **no lo hay en ningún punto del backend**.

- GIVEN el texto de producto que describe los guardarraíles de artefactos
  WHEN se contrasta con AC-001…AC-006
  THEN MUST NOT prometer validación semántica de código ni de hechos
  AND MUST decir que lo que se garantiza es la **detección y el aviso**, no la corrección
