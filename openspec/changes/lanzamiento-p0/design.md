# Design: lanzamiento-p0

Verificado contra `feat/lanzamiento-e2e`. Las dos decisiones ratificadas (normalización antes que
abstención; censo deduplicado) se dan por cerradas y no se reabren aquí.

## Technical Approach

`_tally` deja de ser un contador de votos parseados y pasa a ser el **recuento del censo**: recibe los
participantes, deduplica, imputa `ABSTENCION` a quien no aportó voto decisivo y **devuelve él mismo el
`early_exit`**. Los cinco consumidores leen del dict; ninguno recalcula. En frontend, tres arreglos de una
línea de intención cada uno (lector del historial, `throw` fuera del `try`, lista de títulos en el modal) y
un parser reescrito con reglas deterministas.

## Architecture Decisions

### D1 — El predicado del early-exit vive dentro de `_tally`

**Choice**: `_tally` devuelve `early_exit`, con el umbral como constante de módulo
`EARLY_EXIT_MIN_CONFIDENCE = 70`. Los tres sitios pasan a leer `tally["early_exit"]`:
`board_v2.py:381`, `:569` y `stream.py:297`. `stream.py` conserva su matiz de presentación
(`tally["early_exit"] and node_name == "consensus_gate"`): lee, no recalcula.

**Alternativa descartada**: función aparte `is_early_exit(tally)`. Es importable y por tanto olvidable —
`stream.py` ya hace un import local de `_tally`. Si el valor viaja **dentro** del recuento, no hay nada que
olvidar y copiar el predicado se ve a simple vista.

**Test de unicidad, sin fragilidad**: AST, no grep de texto. Se parsean `board_v2.py` y `stream.py`, se
recorren los nodos `ast.Compare` y se afirma que **ninguna comparación fuera de `_tally` menciona
`avg_confidence` ni `unanimous`**. Tolera reformateo, renombrado de locales, f-strings de log y
consumidores nuevos que lean `tally["early_exit"]`; sólo rompe ante una comparación copiada, que es
exactamente la mutación de BVT-005. **Consecuencia obligatoria**: el log de `consensus_gate_node:382-385`
deja de interpolar `tally['avg_confidence']` dentro de una comparación y vuelca el dict.

### D2 — Cómo llega el censo a `_tally`

**Choice**: firma `_tally(votes, participants=None)`. Origen: `state["board_participants"]`, escrito por
`triage_node:270` y preservado en regeneración (`:244`). Está disponible en los cinco puntos de llamada
—`:380`, `:425` (devil), `:495` (synthesis), `:568`— y en `stream.py:296`, que ya lee el mismo
`snap.values` del que sale `board_votes`. Censo = `dedup(participants) − NON_VOTING_ROLES({"CEO"})`.

**Doble deduplicación, deliberada**: en `_tally` (autoritativa, preserva orden, es lo que exige el escenario
«censo con rol duplicado») y en `triage_node` **antes** del `len(chosen) >= 2`. La segunda no es redundante:
sin ella `route_analysis:563` sigue devolviendo `["cto_analysis","cto_analysis"]` al fan-out.

**Si no está disponible** → `BOARD_DIRECTORS`, que es la convención ya usada en cuatro sitios del fichero.
Yerra hacia **no** hacer early-exit (exige 3 votos decisivos), que es la dirección segura.

**Alternativa descartada**: `expected = nº de votos parseados`. Es el bug de hoy con otro nombre.

### D3 — Normalización del voto y línea `[VOTO]`

**Choice**: localizador + dos extractores, no un mega-regex. El localizador encuentra el marcador `[VOTO]` y
toma el resto de la línea; sobre esa cola se extraen `decision\s*[:=]\s*(S[IÍ]|NO|CONDICIONAL)` y
`confianza\s*[:=]\s*(\d{1,3})` por separado. Cualquier puntuación entre campos deja de importar porque no se
exige adyacencia. Decisión fuera del whitelist → `None` → abstención. Confianza ilegible con decisión válida
→ 50 (fallback ya existente en `:95`), que mantiene el voto decisivo pero bloquea el early-exit.

**`_strip_vote_line` cambia de granularidad**: hoy hace `_VOTE_RE.sub("", …)` (`:103`), que con la línea
decorada `**[voto] …**` dejaría `****` huérfano. Pasa a **eliminar la línea completa** que contiene el
marcador, y se invoca **siempre que haya marcador**, no sólo `if vote:` (`:357-358`): una línea de voto rota
ya se reporta como chip de abstención, enseñarla además en crudo la cuenta dos veces.

**La abstención se escribe en el canal de estado**, no se deduce: cuando el voto no parsea, el nodo emite
`out["board_votes"] = {role: {"decision": "ABSTENCION", "confidence": None}}`. Con eso salen gratis el evento
SSE `board_vote` (`stream.py:285-289`), la persistencia en `additional_kwargs`, la recuperación por
`leerVoto` tras recargar y la distinción «se abstuvo» vs «aún no ha votado». **Alternativa descartada**:
evento SSE nuevo y rama de emisión propia — más código para el mismo resultado.

**El log de abstenciones va en el nodo, no en la función pura**: `_tally` devuelve `abstentions: [roles]` y
lo loguea `consensus_gate_node`. `_tally` se llama cinco veces por debate; loguear dentro sería ruido ×5.

### D4 — El acta que sobrevive a la recarga: se toca **sólo el lector**

**Verificado antes de decidir**: `grep -rn 'artifact_type\s*=\s*\\?"' backend/ frontend/src/` → **0
resultados**. Los dos escritores ya emiten `type=`: `board_v2.py:466` (acta) y `orchestrator.py:139`
(artefactos generales). `artifact_type` existe únicamente como **campo JSON del evento SSE**
`artifact_open`, que `streamHandlers.ts:83` lee correctamente — otro espacio de nombres, no hay conflicto.

**Choice**: cambiar `historyMapper.ts:119` a `/\btype=\\?"([^\\"]+)\\?"/`. El `\b` no casa dentro de
`artifact_type=` porque `_` es carácter de palabra, así que el regex no puede volver a leer el atributo
equivocado por accidente. El escritor y el evento SSE quedan intactos: tocarlos sería cambiar el contrato
que ya funciona en el camino en vivo para arreglar el camino de recarga.

**Pero el lector no es el único cómplice: los fixtures también mienten.** Verificado — las únicas
apariciones de `artifact_type=` como atributo XML en todo el repositorio están **en tests de frontend**:
`tests/mocks/handlers.ts:33`, `tests/store/hydration.test.ts:12` y `:44`, y
`tests/store/caracterizacionStore.test.ts:358-359`. Ninguna en `backend/`. Esa es la razón por la que 827
tests en verde nunca vieron el fallo: los fixtures se escribieron contra el lector roto, no contra lo que el
backend emite. Los fixtures entran en el commit 3 y pasan a `type=`.

Consecuencia medida, **exactamente un test rojo**: `caracterizacionStore.test.ts:356` («varios artefactos en
un mismo turno…») afirma `['markdown','data_table']` sobre fixtures con `artifact_type=`; con el lector
corregido caerían al default `'code'`. Es un test de caracterización que codifica el bug: se corrige su
fixture, no su aserción. Los otros tres fixtures usan `artifact_type="code"`, que coincide con el default,
así que pasan por accidente antes y después — se corrigen igual, porque un fixture que miente sobre el
formato del backend es el mecanismo que dejó pasar esto. `VISUAL_CHECK_2.md:26` documenta el mismo formato
falso como «es como el backend los persiste»; conviene corregirlo en el mismo commit.

**No hace falta compatibilidad hacia atrás**: como el backend nunca escribió `artifact_type=`, no hay
historial persistido en Mongo con ese atributo. Aceptar los dos nombres sólo mantendría vivo el formato
inventado.

### D5 — Parser de próximos pasos: reglas, no heurística

**Choice**: cuatro reglas deterministas, evaluadas en orden y **sólo dentro de la sección**:

1. **Nivel**: al detectar el encabezado se guarda su nivel `n` (nº de `#`; la variante en negrita sin `#`
   toma `n = 6`, el nivel más bajo posible, de modo que cualquier encabezado real la cierra).
2. **Corte**: la sección termina en el primer encabezado de nivel `<= n`. Los de nivel `> n` son
   sub-secciones y sus bullets entran.
3. **Tabla**: si el cuerpo tiene fila cabecera + separador `|---|`, cada fila de datos da un item; título =
   primera celda no vacía, resto → `body`.
4. **Párrafo**: sólo si no hubo **ni** bullets **ni** tabla, cada línea no vacía que no sea encabezado da un
   item.

La regla 4 es la que evita convertir cualquier línea suelta en issue: está acotada por el corte de la regla
2 y subordinada a que la sección no tenga estructura. Las líneas de continuación indentadas siguen yendo al
`body` del item anterior (comportamiento actual, formato 7).

**Relación con `ActaActions.tsx`**: el componente **ya** pinta la lista completa de títulos con su botón
por item (`:285-330`); lo que sólo dice un número es el modal de repositorio (`:363`). El arreglo es reusar
esa lista dentro del modal, no construir una segunda. `parsedIssues.length` y los títulos listados salen por
construcción del mismo array, así que el recuento anunciado no puede divergir.

### D6 — Sacar el `throw` del `try` sin perder la tolerancia al JSON corrupto

**Choice**: el `catch (parseError)` de `:224` se queda tal cual — es SFS-003 y su propósito legítimo. La rama
`data.type === 'error'` (`:221-223`) deja de lanzar y **anota** el mensaje en una variable del ámbito del
bucle; inmediatamente **después** del `try/catch` se lanza si está anotada. El JSON ilegible sigue
descartándose; el error del servidor ya no lo puede tragar el mismo `catch`.

**Fin sin `[DONE]`**: `[DONE]` (`:153`) y la cancelación (`:128`) hacen `return`, así que **llegar al código
posterior al `while` significa, por construcción, cuerpo cerrado sin centinela**. Ahí se lanza, sustituyendo
el `console.warn` del buffer residual (`:232-234`). El `catch` exterior (`:236-241`) comprueba
`signal?.aborted` antes de `onError`, con lo que la cancelación del usuario sigue sin producir error.
Las callbacks terminales quedan garantizadas «como máximo una vez» **por estructura**, no por bandera.
**Alternativa descartada**: bandera `terminado` explícita — redundante con los `return` existentes y una
línea más que mantener.

**SFS-004 y SFS-005 ya se cumplen**: `streamHandlers.ts:139-169` saca la sesión de `streamingSessionIds` y
escribe «*La respuesta se cortó aquí.*», ignorando el objeto de error (no hay `[object Object]` posible).
No hay cambio de producción: se añaden tests de caracterización para que dejen de poder romperse en silencio.

### D7 — `PRODUCT.md`: una sola redacción y una puerta ejecutable

**Choice**: gana la redacción del triaje (`:66-68`), que es la que coincide con `stream.py:276-278`. Se
reescribe `:53-55`: el early-exit se queda descrito como **mecanismo de debate** (se abrevia), sin ninguna
afirmación de precio. **Puerta**: `frontend/scripts/check-product-pricing.mjs`, en la línea de
`check-dead-classes.mjs`, con paso propio en el job `test-frontend` junto al de «Clases muertas»
(`ci.yml:113-115`, `working-directory: frontend`, leyendo `../PRODUCT.md`). Falla si aparece cualquier
patrón que ate consenso/unanimidad/early-exit a créditos, y falla también si **desaparece** la frase del
triaje — si no, borrar las dos reglas pasaría la puerta.

**Alternativa descartada**: un test de vitest. Funcionaría como puerta, pero acopla el linteo de un
documento de producto a la suite de la aplicación y esconde la comprobación entre 827 tests en vez de darle
un paso con nombre en CI.

### D8 — Orden de commits y qué verifica cada uno

| # | Commit | Verificable al cerrarlo |
|---|--------|--------------------------|
| 1 | `fix(board): recuento con censo, abstenciones, unanimidad real y empate` | `pytest tests/test_board_v2.py` aislado: los 4 escenarios de BVT-001..004 + el test AST de unicidad. Fija el payload que el frontend consumirá |
| 2 | `fix(stream): no reportar éxito cuando el stream falla o termina sin [DONE]` | `vitest tests/services/`: error+`[DONE]`, corte limpio, chunk corrupto, cancelación. Es el instrumento con el que se validan 3 y 4 |
| 3 | `fix(artifacts): recuperar el acta del historial con su tipo real` | `vitest tests/store/`: acta como `markdown` y mermaid como `mermaid`, **con los cuatro fixtures corregidos** + test de backend que fija `type="markdown"` en la plantilla (AD-002, literal idéntico a cada lado) |
| 4 | `fix(acta): parser de próximos pasos y previsualización de issues` | `vitest tests/utils/actaParser.test.ts` parametrizado con los 14 formatos + `tests/components/ActaActions.test.tsx` |
| 5 | `docs(product)` + `feat(billing): mostrar el motivo del coste` | `node scripts/check-product-pricing.mjs` y el test del motivo en `BoardWarRoom` |

El 1 va primero porque es el único puramente backend y el más arriesgado; el 2 antes que 3 y 4 porque sin
él cualquier fallo posterior se sigue viendo como éxito.

## Data Flow

    triage ──► board_participants ──dedup──┐
                                           ▼
    directores ──► board_votes ──► _tally(votes, censo)
      (voto o ABSTENCION explícita)            │
                                               ├─► counts + expected + outcome + winner
                                               └─► early_exit  ◄── único predicado
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────┐
                    ▼                                 ▼                             ▼
        consensus_gate_node:381          route_after_consensus:569          stream.py:297
          (fase + log)                     (réplicas o síntesis)          (SSE board_consensus)

## File Changes

| Fichero | Acción | Qué cambia |
|---|---|---|
| `backend/app/application/board_v2.py` | Modify | `_VOTE_RE`→localizador+extractores; `_strip_vote_line` por líneas; `_tally(votes, participants)` con censo, `ABSTENCION`, `expected`, `outcome`, `winner`, `early_exit`, `abstentions`; dedup en `triage_node`; `ABSTENCION` escrita en `board_votes`; 5 call sites |
| `backend/app/presentation/api/v1/stream.py` | Modify | `_tally(votes, participants)` desde `snap.values`; payload `board_consensus` con `expected`/`total_decisivos`/`outcome`/`winner`; lee `tally["early_exit"]` |
| `frontend/src/store/chat/historyMapper.ts` | Modify | `:119` `artifact_type=` → `\btype=` |
| `frontend/tests/{mocks/handlers.ts, store/hydration.test.ts, store/caracterizacionStore.test.ts}` | Modify | Fixtures al formato real `type=`; 1 test hoy verde pasa a rojo si no se corrige el fixture |
| `frontend/src/services/api.ts` | Modify | `:221-223` anota en vez de lanzar; `throw` tras el `catch`; `throw` tras el `while` |
| `frontend/src/utils/actaParser.ts` | Modify | Nivel de encabezado, sub-secciones, tabla, párrafo, títulos 8-11 |
| `frontend/src/components/artifacts/ActaActions.tsx` | Modify | `:363`: la lista de títulos dentro del modal |
| `frontend/src/components/chat/BoardWarRoom.tsx` | Modify | `:126` coste con motivo desde `board.participants`; «Empate» en el veredicto |
| `frontend/scripts/check-product-pricing.mjs` | Create | Puerta de coherencia de precio |
| `PRODUCT.md` · `.github/workflows/ci.yml` | Modify | Redacción única (`:53-55`); paso de la puerta |

## Interfaces / Contracts

```python
def _tally(votes: dict, participants: Optional[list[str]] = None) -> dict:
    # {counts:{SI,NO,CONDICIONAL,ABSTENCION}, expected, total_decisivos, unanimous,
    #  avg_confidence, outcome: UNANIME|MAYORIA|EMPATE|SIN_VOTOS, winner|None,
    #  early_exit, abstentions:[roles]}
```

Aditivo en SSE: `BoardWarRoom.tsx:60` destructura `{SI, NO, CONDICIONAL}` con defaults y `api.ts:186-190`
sólo lee `unanimous`/`tally` → una clave `ABSTENCION` nueva no rompe nada.

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit backend | Normalización, abstención, censo, empate | `tests/test_board_v2.py` parametrizado; se **actualizan** `test_tally_unanime`/`test_tally_dividido_no_unanime` (`:48-57`), no se borran |
| Estructural backend | Unicidad del predicado | AST sobre `ast.Compare`, descrito en D1 |
| Contrato backend | `type="markdown"` en la plantilla; SSE con `expected` | Aserción sobre `SYNTHESIS_ADDITION`; test del payload |
| Unit frontend | 14 formatos del parser | `tests/utils/actaParser.test.ts` parametrizado (7 primeros = regresión) |
| Integración frontend | Error+`[DONE]`, corte limpio, chunk corrupto, cancelación | `tests/services/` con lector SSE simulado |
| Store | Acta recuperada como `markdown`; salida de `streamingSessionIds` en `onError` | `tests/store/loadSessionJunta.test.ts`, `tests/store/streaming.test.ts`. Baseline 827 → sube; ningún test debe **quitarse**, sólo corregirse el fixture de `caracterizacionStore.test.ts:358-359` |
| Componente | Títulos en el modal; motivo del coste; «Empate» | `tests/components/ActaActions.test.tsx`, test nuevo de `BoardWarRoom` |
| Puerta CI | Coherencia de `PRODUCT.md` | `node scripts/check-product-pricing.mjs` |

## Migration / Rollout

Sin migración: `_tally` se calcula en vivo, `board_votes` no cambia de forma (gana un valor de `decision`,
no una clave) y los campos del SSE son aditivos. Revert por commit.

## Open Questions

- [ ] **La decisión más discutible: escribir `ABSTENCION` en `board_votes`.** Es la de mayor radio de
  impacto fuera del recuento — llega a `gradoDeDesacuerdo(board.votes)` (`BoardWarRoom.tsx:56`), al chip de
  voto y al historial persistido, consumidores que nunca han visto ese valor. A cambio, es lo único que hace
  que la abstención se vea en la UI y sobreviva a la recarga sin tocar el emisor SSE. Requiere regresión en
  `tests/components/GradoDeDesacuerdo.test.tsx` antes de darla por buena.
- [x] **RATIFICADA (fase tasks).** Con decisión válida y confianza ilegible se asume 50: el voto sigue
  siendo decisivo y el 50 bloquea el early-exit. Ante un voto que no se entiende del todo, no se abrevia el
  debate. El escenario que faltaba está ahora en `specs/board-vote-tally/spec.md` (BVT-001, «Confianza
  ilegible con decisión válida»), y su RED/GREEN es la tarea 1.2 de `tasks.md`.
