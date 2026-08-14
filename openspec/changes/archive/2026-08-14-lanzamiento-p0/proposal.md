# Proposal: lanzamiento-p0 — cerrar los tres bloqueantes del lanzamiento

> Base: `openspec/changes/lanzamiento-v1/auditoria-guardarrailes.md` (#1, #2, #3, #4, #9, #10, #11, #19).
> Toda afirmación de este documento se ha re-verificado contra el código en `feat/grant-huerfano`.

## Intent

SPHERE se enseña a inversores. Hoy la app **miente en los tres sitios que sostienen el posicionamiento**: el recuento de votos fabrica consenso, el precio no es el prometido y el acta —el entregable— se rompe al recargar y no se puede accionar. Ninguno de los tres es un fallo de estilo: los tres producen un resultado creíble y falso.

## Scope

### In Scope

| Bloque | Qué se cierra | Evidencia |
|---|---|---|
| **B1** Recuento honesto | Normalizar el voto antes de contar; voto ininterpretable → **abstención explícita** (nunca descarte silencioso); `unanimous` exige `total == nº participantes`; empate → `EMPATE`, nunca resuelto por orden del `dict` | `board_v2.py:108-130` (`unanimous` :121, `winner` :123), `:356-361` (`if vote:` sin `else`) |
| **B2** Precio honesto | Corregir la promesa contradictoria y **hacer visible el porqué** del 3 vs 5 | `stream.py:273-283` (coste por `len(participants)`) vs `PRODUCT.md` §Positioning |
| **B3a** El stream no finge éxito | Sacar el `throw` del `try` del parser JSON; además, fin de stream sin `[DONE]` → `onError` | `api.ts:214-215` (throw) / `:217-220` (catch que lo come) / `:124-125` (`if (done) break;`) |
| **B3b** El acta vuelve siendo acta | El parser del historial acepta el atributo `type=` que el backend **realmente escribe** | backend emite `type="markdown"` (`board_v2.py:466`); frontend busca `artifact_type=` (`useChatStore.ts:414`). `grep artifact_type= backend/app/` → **0** |
| **B3c** El acta es accionable | `parseProximosPasos` cubre los 14 formatos de la auditoría (sub-encabezados, tabla, párrafo, inglés, sin `#`) **y el modal lista los títulos** antes de crear issues | `actaParser.ts:48, :55`; `ActaActions.tsx:136` sólo muestra un **número**, no los títulos |

### Out of Scope (y qué se le puede prometer a un inversor mientras tanto)

| Fuera | Por qué | Promesa honesta hoy |
|---|---|---|
| Guardarraíles **de fondo**: validar que un mermaid parsee, que un SVG no traiga `<script>`, salida estructurada / reintentos del modelo (#12, #13, #14) | Es reescribir la capa de generación, no un parche. `grep max_retries\|with_structured_output\|response_format backend/app/` → **0** | «Contenemos el daño en el visor: mermaid corre en `securityLevel:'strict'` y degrada con el fuente a la vista; el markdown del chat va con `rehypeSanitize`. **No validamos aún la semántica de lo que genera el modelo**, y está en el roadmap con nombre y fecha.» No decir «los agentes tienen guardarraíles para no equivocarse»: hoy es falso |
| Reconexión SSE / timeout (#3 parcial) | Requiere `Last-Event-ID` y replay en backend | Sí entra la mitad barata: el corte deja de fingir éxito (B3a) |
| `ErrorBoundary` en el panel (#5), `DataGrid` (#7), CSV (#8), artefacto truncado (#6), límite de tamaño (#15), historial que falla en silencio (#16), actas duplicadas (#21), `[ ]` en títulos (#23) | Reales, pero ninguno es el titular de la demo. #5 y #7 **ya están resueltos en `redesign/visual-identity-v3`** | — |
| Reembolso por consenso temprano | Ver decisión B2 | — |

**No se toca**: esquema de MongoDB, auth, rate limiting, el grafo de LangGraph (nodos y aristas), DESIGN.md, ni el precio en euros de ningún pack.

## Decisión B2 — recomendación: **corregir la promesa**, no el precio

Verificado: `PRODUCT.md` **se contradice a sí mismo**. §Positioning dice que el descuento lo da el consenso; §Operating Context dice «cuesta 5, o 3 **si el triaje reduce participantes**». El código coincide con la segunda. Y `PRODUCT.md` **sólo existe en `redesign/visual-identity-v3`**, no en la rama activa.

- Tocar precio **ahora** es apostar a ciegas: B1 cambia la frecuencia del early-exit (hoy dispara sobre unanimidad falsa). No se puede fijar un descuento cuyo ritmo real aún no se ha medido.
- El reembolso por consenso exige: nuevo punto de precio, **segundo** `apartial_refund` idempotente (el de triaje ya gastó `partial_refund_done`, `stream.py:274`), evento SSE de actualización de coste y UI. Es un cambio de dinero encima de un cambio de consenso, en la misma release.
- Coste de corregir la promesa: un párrafo + copy. Coste de corregir el código: ~1 semana y riesgo de facturación.
- **Principio 3 («el coste siempre a la vista») queda mejor servido corrigiendo la promesa**: el evento `board_plan` ya lleva `cost` (`stream.py:283`); basta enseñar el motivo («junta reducida a 2 directores → 3 créditos»). Un reembolso posterior sin evento de actualización *violaría* el principio.

Condición para reabrirlo: medir la tasa real de early-exit con el log ya existente (`board_v2.py:379-382`) durante 2-4 semanas post-B1.

## Approach — orden de commits

| # | Commit | Rama | Por qué en este orden |
|---|---|---|---|
| 1 | `fix(board): recuento de votos con abstenciones, unanimidad real y empate explícito` | activa (backend, común a ambas) | Es el más arriesgado y el único puramente backend: entra solo, con `pytest` aislado, antes de cualquier churn de frontend. Además fija la forma final del payload `board_consensus` que el frontend consumirá |
| 2 | `fix(stream): no reportar éxito cuando el stream falla o termina sin [DONE]` | activa **+ cherry-pick** | Diff mínimo, mismo fichero en ambas ramas. Es el instrumento con el que se validan los demás: sin él, cualquier fallo posterior se ve como éxito |
| 3 | `fix(artifacts): recuperar el acta del historial con su tipo real` | activa **+ port manual** | Necesita el tratamiento anti-desincronización (ficheros distintos por rama) |
| 4 | `fix(acta): parser de próximos pasos y previsualización de issues` | activa **+ cherry-pick limpio** | `actaParser.ts` es **byte-idéntico** en ambas ramas (`git diff` entre ramas → vacío) |
| 5 | `docs(product): el descuento a 3 créditos lo decide el triaje` + `feat(billing): mostrar el motivo del coste` | `PRODUCT.md` **sólo** en redesign; el copy en ambas | La copy honesta depende de qué significa «consenso» tras el commit 1 |

Alternativa válida si la fecha aprieta: 2 → 1 → 3 → 4 → 5, para tener enviado antes lo que impide que la app mienta. Se pierde el beneficio de fijar el payload primero.

## Ramas afectadas y cómo evitar la desincronización

| Fichero | `feat/grant-huerfano` | `redesign/visual-identity-v3` | Estrategia |
|---|---|---|---|
| `backend/app/application/board_v2.py` | ✅ | idéntico | Un commit; llega por merge |
| `backend/app/presentation/api/v1/stream.py` | ✅ | idéntico | Un commit |
| `frontend/src/services/api.ts` | `:214-220`, `:124-125` | `:221-227`, mismo bug | **Cherry-pick** (conflicto trivial) |
| `frontend/src/utils/actaParser.ts` | ✅ | **byte-idéntico** | **Cherry-pick limpio** |
| `frontend/src/components/artifacts/ActaActions.tsx` | ✅ | reescrito por el rediseño | Port manual |
| recuperación de artefactos del historial | `store/useChatStore.ts:414` | `store/chat/historyMapper.ts:119` | **Ficheros distintos → port manual obligatorio** |
| `PRODUCT.md` | **no existe** | ✅ | Sólo redesign |

**El dispositivo anti-desincronización es el test, no el código.** Se añade el **mismo** test a las dos ramas —uno que afirme que el atributo emitido por el backend (`type="markdown"`) se recupera como markdown— más un test de backend que fije la etiqueta que `board_v2.py:466` escribe. Un merge que pierda el arreglo rompe la suite de la rama que lo pierda, en vez de fallar en silencio. Extraer el parseo de la etiqueta a un módulo compartido se descarta: conflictúa en el merge del rediseño y no es P0.

## Capabilities

### New Capabilities
- `board-vote-tally`: normalización del voto, abstención explícita, unanimidad real (`total == participantes`), empate declarado, y el contrato del evento SSE `board_consensus`.
- `acta-deliverable`: el acta sobrevive a la recarga con su tipo y sus acciones, y sus «Próximos pasos» se extraen de los formatos que el modelo produce de verdad.
- `stream-failure-surfacing`: el cliente SSE nunca reporta éxito cuando el stream emite `error` o termina sin `[DONE]`.

### Modified Capabilities
- `credit-system`: añadir requisito explícito de que el coste del debate (5 → 3) lo determina **el triaje por número de participantes**, que el early-exit por consenso **no** altera el precio, y que el coste anunciado debe mostrarse **con su motivo**. `openspec/specs/credit-system/spec.md` hoy no dice nada del 3 vs 5 (CS-005/CS-006 sólo cubren el skip de cargo por agente y los defaults).

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Con unanimidad real, el early-exit cae casi a cero → debates más largos y más tokens | Alta | Es el comportamiento correcto: hoy dispara sobre datos falsos. Medir con el log de `consensus_gate` (`board_v2.py:379-382`). Si cae a 0, el problema es el formato del voto, no la discrepancia → alimenta el reintento de voto (fuera de alcance) |
| Los tests `test_tally_unanime` / `test_tally_dividido_no_unanime` (`backend/tests/test_board_v2.py:48-57`) codifican la semántica vieja | Certeza | Se actualizan en el commit 1, no se borran |
| El payload `board_consensus` gana campos y el frontend actual los ignora | Media | Aditivos. Verificado: `api.ts:180-184` usa `!!data.unanimous` y `data.tally \|\| {}`; `BoardWarRoom.tsx:30` destructura `{SI, NO, CONDICIONAL}` con defaults → una clave `ABSTENCION` nueva no rompe nada |
| Un parser de pasos más permisivo genera issues basura en el repo del cliente | Media | Por eso el commit 4 **incluye** listar los títulos en el modal: hoy sólo se muestra un número (`ActaActions.tsx:136`), el usuario aprueba una cifra a ciegas |
| Dejar de tragar el error del stream hace visibles fallos justo en la demo | Media | Es el objetivo. Exigencia: mensaje presentable en español, nunca un stack trace |
| `redesign/visual-identity-v3` se queda sin alguno de los arreglos | Alta sin acción | Cherry-pick en la misma sesión + el mismo test en ambas ramas |
| El commit 1 cambia el enrutado del grafo (`route_after_consensus`, `board_v2.py:566-573`) además del `tally` | Media | `early_exit` se recalcula en **tres** sitios independientes (`board_v2.py:378`, `:567`, `stream.py:297`), todos vía `_tally` → arreglar `_tally` los cubre los tres. Verificar que no queda un cuarto cálculo |

## Rollback Plan

- Cada bloque es un commit independiente: `git revert <sha>` lo deshace sin tocar los demás. **Ninguno migra datos ni cambia el esquema de Mongo.**
- **B1**: revertir devuelve el early-exit permisivo. Sin estado persistido en el formato nuevo — el `tally` se calcula en vivo desde `board_votes`, cuya forma no cambia. Los campos nuevos del SSE son aditivos, así que un frontend antiguo contra un backend nuevo (o al revés) sigue funcionando. **Es la palanca de emergencia**: un solo revert de backend + redeploy, sin tocar frontend.
- **B3b**: revertir devuelve el acta a bloque de código. Cero pérdida de datos: el contenido siempre estuvo íntegro en Mongo; sólo cambia cómo se pinta.
- **B3c**: revertir devuelve «0 pasos». Los issues ya creados en GitHub **no se deshacen** — por eso la previsualización de títulos es requisito, no adorno.
- **B2**: revert de documentación y copy.
- Orden de reversión si hay que deshacer todo: 5 → 4 → 3 → 2 → 1.

## Success Criteria

- [ ] `_tally` con 1 voto y 3 participantes **no** devuelve `unanimous: true`.
- [ ] Empate `{SI:1, NO:1, CONDICIONAL:1}` **no** devuelve `winner: "SI"`.
- [ ] Un voto ininterpretable (`decision=SI, confianza=80`, `QUIZÁS`, inglés) aparece como abstención en el war-room y en el log; nunca desaparece sin rastro.
- [ ] Un evento SSE `error` produce `onError` y **no** `onDone` (hoy: `onError=false`, `onDone=true`).
- [ ] Un stream que termina sin `[DONE]` produce `onError` en vez de spinner infinito.
- [ ] El acta recargada del historial conserva `type: markdown` y sus botones de Notion y GitHub — con test **en las dos ramas**.
- [ ] Los 7 formatos de «Próximos pasos» que hoy devuelven 0 devuelven items (test parametrizado con los 14 casos de la auditoría).
- [ ] El modal de GitHub lista los títulos que va a crear, no sólo cuántos.
- [ ] `PRODUCT.md` no contiene dos reglas de precio contradictorias, y la UI muestra el motivo del coste.
- [ ] Los commits portados están en `redesign/visual-identity-v3` y su suite pasa allí.

## Dependencies

- Ninguna externa. `apartial_refund` ya existe (`credit_manager.py:222`) por si B2 se reabre más adelante.
- Requiere decisión del dueño sobre B2 antes del commit 5.
