# Spec (delta): artifact-contract

> Capacidad **nueva**. Cubre riesgos **#6, #13 (alcance mínimo), #14, #15** de `auditoria-guardarrailes.md`.
> Ámbito: el generador (`backend/app/`), no el visor. Lo que ocurre en pantalla vive en `artifact-viewers`.
> RFC 2119. Escenarios en Given/When/Then.

## Contexto y vocabulario

- **Declaración**: los atributos de la etiqueta de apertura `<sphere_artifact title="…" type="…" language="…">`,
  parseada hoy en `stream.py:483-522` (bloque de `OPEN_TAG_PATTERN`; el default sin lista blanca está en `:503-505`).
  **Los números de línea son de la instantánea con C1-C2 de `tools-seguridad` en el árbol**; localizar por símbolo.
- **Lista blanca** (`ARTIFACT_TYPES`): el conjunto de tipos que SPHERE sabe pintar.
- **Veredicto**: el juicio del sistema sobre la declaración, transportado en los eventos SSE `artifact_open` y
  `artifact_close`. Un veredicto **nunca** oculta contenido; sólo lo etiqueta.

---

## AC-001 — Lista blanca única de tipos de artefacto

El sistema **MUST** mantener una única definición de los tipos de artefacto admitidos, en
`backend/app/application/artifact_contract.py`, y **MUST** derivar de ella tanto el texto del prompt
(`orchestrator.py:139`) como la validación del stream. El conjunto **SHALL** ser exactamente
`{code, markdown, mermaid, csv, svg}`.

Ninguna otra parte del backend **MUST NOT** declarar su propia lista de tipos.

#### Escenario: el prompt anuncia exactamente lo que el sistema acepta

- **Given** la lista blanca `ARTIFACT_TYPES`
- **When** se inspecciona el texto del protocolo de artefactos que recibe el modelo
- **Then** los tipos ofrecidos en la etiqueta `type="…"` **MUST** ser exactamente los de la lista blanca, sin sobrantes ni ausencias

#### Escenario: la lista blanca y los visores del cliente no pueden separarse

- **Given** las claves de `TIPOS_DE_ARTEFACTO` en `frontend/src/store/chat/streamHandlers.ts` e `historyMapper.ts`
- **When** se comparan con `ARTIFACT_TYPES`
- **Then** **MUST** coincidir; una diferencia **MUST** hacer fallar la suite

> Nota de implementación: el cruce se hace desde un test, leyendo las tres fuentes. Es la guarda declarada en
> §Colisiones del `proposal.md` contra que `tools-seguridad` o `junta-honesta` se lleven un tipo por delante al
> reescribir prompts.

---

## AC-002 — Normalización determinista, sin adivinar

El sistema **MUST** normalizar el tipo declarado aplicando **sólo**: recorte de espacios, minúsculas y los alias
documentados en la lista blanca.

El sistema **MUST NOT** corregir un tipo por semejanza, distancia de edición, ni ninguna otra heurística de parecido.

#### Escenario: variaciones de caja y espacios se aceptan

- **Given** una declaración `type=" MarkDown "`
- **When** el stream la normaliza
- **Then** el tipo resultante **MUST** ser `markdown` y el veredicto **MUST** ser `ok`

#### Escenario: un tipo mal escrito NO se corrige

- **Given** una declaración `type="markdwon"`
- **When** el stream la normaliza
- **Then** el tipo efectivo **MUST** ser `code`
- **And** el veredicto **MUST** ser `unknown`
- **And** el tipo declarado original **MUST** conservarse literalmente como `markdwon`
- **And** el sistema **MUST NOT** deducir `markdown`

---

## AC-003 — Un tipo desconocido se declara, no se disimula

Cuando el tipo normalizado no pertenece a la lista blanca, el evento `artifact_open` **MUST** incluir
`artifact_type: "code"`, `declared_type: <el literal recibido>` y `type_status: "unknown"`.

El sistema **MUST NOT** rechazar el artefacto ni interrumpir el turno por un tipo desconocido.

#### Escenario: el artefacto se abre igualmente, etiquetado

- **Given** un modelo que emite `<sphere_artifact title="Plan" type="markdwon">` seguido de contenido
- **When** el stream procesa la apertura
- **Then** **MUST** emitirse `artifact_open` con `type_status: "unknown"` y `declared_type: "markdwon"`
- **And** el contenido **MUST** transmitirse íntegro por `artifact_chunk`
- **And** el turno **MUST** continuar normalmente

#### Escenario: un tipo válido no lleva ruido

- **Given** una declaración `type="mermaid"`
- **When** el stream procesa la apertura
- **Then** `type_status` **MUST** ser `ok`
- **And** `declared_type` **MAY** omitirse

---

## AC-004 — Todo artefacto abierto se cierra

Cuando el bucle de generación termina —por `[DONE]`, por excepción o por agotamiento del modelo— con un artefacto
abierto, el sistema **MUST** volcar el resto de `artifact_buffer` como `artifact_chunk` y **MUST** emitir
`artifact_close` con `truncated: true` y `reason: "stream_ended"`.

El sistema **MUST NOT** descartar `artifact_buffer` sin emitirlo.

En el caso de desconexión del cliente (`GeneratorExit`, `stream.py:572-576`) el sistema **MUST NOT** intentar emitir
eventos: el cliente ya no escucha, un `yield` tras `GeneratorExit` produce
`RuntimeError: async generator ignored GeneratorExit`, y `stopGeneration` ya limpia el canal en el navegador
(`frontend/src/store/chat/messagesSlice.ts:257`).

#### Escenario: el modelo no emite la etiqueta de cierre

- **Given** un modelo que emite `<sphere_artifact title="Acta" type="markdown">` y contenido, y termina **sin** `</sphere_artifact>`
- **When** el generador llega al final del bucle
- **Then** **MUST** emitirse el resto pendiente como `artifact_chunk`
- **And** **MUST** emitirse `artifact_close` con `truncated: true` y `reason: "stream_ended"`

#### Escenario: el artefacto siguiente no se escribe encima del anterior

- **Given** un turno que dejó un artefacto truncado y cerrado por AC-004
- **When** un turno posterior abre un artefacto nuevo y emite `artifact_chunk`
- **Then** el contenido nuevo **MUST** ir al artefacto nuevo
- **And** el artefacto anterior **MUST** conservar su contenido intacto

#### Escenario: el cierre normal no cambia

- **Given** un modelo que emite `</sphere_artifact>` correctamente
- **When** el stream lo detecta
- **Then** **MUST** emitirse `artifact_close` sin `truncated`
- **And** el residuo posterior a la etiqueta **MUST** seguir emitiéndose como `token`

---

## AC-005 — Presupuesto de tamaño con corte visible

El sistema **MUST** definir un presupuesto único de contenido de artefacto, `ARTIFACT_MAX_BYTES = 262144` (256 KB),
en `artifact_contract.py`.

El presupuesto se mide sobre el contenido acumulado del artefacto, en el punto donde hoy se acumula
(`artifact_buffer`, `stream.py:429`).

Cuando el contenido acumulado de un artefacto alcanza el presupuesto, el sistema **MUST**:

1. dejar de emitir `artifact_chunk` para ese artefacto;
2. emitir `artifact_close` con `truncated: true`, `reason: "size_limit"` y `limit_bytes: 262144`;
3. **continuar el turno**: los tokens de chat posteriores **MUST** seguir emitiéndose.

El sistema **MUST NOT** abortar el stream ni disparar reembolso por superar el presupuesto.

#### Escenario: un modelo en bucle no congela la pestaña

- **Given** un modelo que emite 1 MB de contenido dentro de un artefacto
- **When** el acumulado alcanza 262 144 bytes
- **Then** **MUST** emitirse `artifact_close` con `reason: "size_limit"`
- **And** **MUST NOT** emitirse ningún `artifact_chunk` más para ese artefacto
- **And** el total transmitido para ese artefacto **MUST** ser ≤ 262 144 bytes

#### Escenario: el turno sobrevive al corte

- **Given** un artefacto cortado por presupuesto
- **When** el modelo sigue escribiendo texto de chat tras cerrar el artefacto
- **Then** ese texto **MUST** llegar como eventos `token`
- **And** **MUST** emitirse `[DONE]` al final

#### Escenario: un artefacto normal no se toca

- **Given** un acta de 12 KB
- **When** se transmite
- **Then** **MUST** llegar completa y `artifact_close` **MUST NOT** llevar `truncated`

---

## AC-006 — Coherencia entre el tipo declarado y el contenido

En el cierre, el sistema **MUST** comprobar que el contenido es compatible con el tipo declarado, y **MUST** incluir
en `artifact_close` un campo `content_status` con valor `ok`, `mismatch` o `unchecked`.

Las comprobaciones **SHALL** ser exactamente estas:

| Tipo | Comprobación | Veredicto si falla |
|---|---|---|
| `csv` | El contenido contiene al menos un separador reconocido (`\|`, `\t`, `;`, `,`) en su primera línea no vacía | `mismatch` |
| `mermaid` | La primera línea no vacía empieza por una palabra clave de diagrama conocida | `mismatch` |
| `svg` | El contenido, recortado, contiene una raíz `<svg` | `mismatch` |
| `code` | Ninguna | `unchecked` |
| `markdown` | Ninguna — **cualquier texto es markdown válido**; comprobarlo sería fingir | `unchecked` |

El sistema **MUST NOT** modificar, reparar ni ocultar el contenido de un artefacto con veredicto `mismatch`.

El sistema **MUST NOT** aplicar estas comprobaciones a un artefacto ya truncado por AC-004 o AC-005: un contenido
incompleto no es un contenido incoherente. En ese caso `content_status` **MUST** ser `unchecked`.

#### Escenario: un CSV que no es una tabla

- **Given** un artefacto `type="csv"` cuyo contenido es un párrafo en prosa sin separadores
- **When** el artefacto se cierra
- **Then** `content_status` **MUST** ser `mismatch`
- **And** el contenido **MUST** haberse transmitido íntegro

#### Escenario: un mermaid que no es un diagrama

- **Given** un artefacto `type="mermaid"` cuyo contenido empieza por `Aquí tienes el diagrama:`
- **When** el artefacto se cierra
- **Then** `content_status` **MUST** ser `mismatch`

#### Escenario: un mermaid válido pasa

- **Given** un artefacto `type="mermaid"` cuyo contenido empieza por `graph TD;`
- **When** el artefacto se cierra
- **Then** `content_status` **MUST** ser `ok`

#### Escenario: el markdown no se juzga

- **Given** un artefacto `type="markdown"` con cualquier contenido
- **When** el artefacto se cierra
- **Then** `content_status` **MUST** ser `unchecked`

#### Escenario: lo truncado no se juzga

- **Given** un artefacto `type="csv"` cortado por AC-005 en mitad de la primera línea
- **When** el artefacto se cierra
- **Then** `content_status` **MUST** ser `unchecked`
- **And** `truncated` **MUST** ser `true`

---

## AC-007 — Lo que este contrato NO garantiza

Esta sección es normativa: define los límites que **MUST NOT** afirmarse en producto ni en la comunicación al cliente.

El sistema **MUST NOT** afirmar, ni en `PRODUCT.md` ni en la UI, que:

- el código de un artefacto compila o parsea — **no se comprueba en ningún lenguaje**;
- el contenido de un artefacto es correcto, veraz o está bien citado — **no se comprueba nada de eso**;
- un artefacto `markdown` es válido — la afirmación es infalsificable y no se comprueba;
- existe reintento del modelo — **no lo hay en ningún punto del backend**.

#### Escenario: la promesa escrita coincide con lo implementado

- **Given** el texto de producto que describe los guardarraíles de artefactos
- **When** se contrasta con AC-001…AC-006
- **Then** **MUST NOT** prometer validación semántica de código ni de hechos
- **And** **MUST** decir que lo que se garantiza es la **detección y el aviso**, no la corrección
