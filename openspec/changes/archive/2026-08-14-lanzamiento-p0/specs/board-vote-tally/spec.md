# board-vote-tally Specification

## Purpose

El recuento de votos de la junta. Define qué es un voto válido, cómo se normaliza,
qué pasa con el que no se entiende, cuándo hay unanimidad de verdad, cómo se declara
un empate y qué gobierna el enrutado del grafo. Verificado contra
`backend/app/application/board_v2.py` (`_parse_vote` :84, `_tally` :107,
`consensus_gate_node` :377, `route_after_consensus` :566) y
`backend/app/presentation/api/v1/stream.py` :291-299.

**Censo de votantes** (usado por todo este spec): los roles de
`state["board_participants"]` (por defecto la junta completa), **deduplicados**, menos
los roles que no votan (`CEO`).

## Requirements

| ID | Requisito | Esc. |
|----|-----------|------|
| BVT-001 | El voto MUST normalizarse antes de contarse | 5 |
| BVT-002 | El voto no interpretable MUST ser abstención explícita, nunca descarte | 3 |
| BVT-003 | `unanimous` MUST exigir un voto decisivo por cada votante del censo | 4 |
| BVT-004 | El empate MUST declararse; `winner` MUST NOT salir del orden del `dict` | 3 |
| BVT-005 | El early-exit MUST tener un único punto de decisión, los tres sitios lo leen | 3 |
| BVT-006 | El evento `board_consensus` MUST llevar censo, abstenciones y resultado | 2 |

### Requirement: BVT-001 — Normalización del voto

El sistema MUST normalizar la línea de voto antes de decidir si es válida. MUST
aceptar, y contar como voto decisivo: puntuación entre los campos (`,`, `;`, `·`, `|`,
`-`), espacios en blanco arbitrarios incluidos saltos de línea, mayúsculas/minúsculas
mezcladas, decoración markdown alrededor de la línea (`**`, `` ` ``, `>`), `SÍ` con
tilde como `SI`, y texto adicional después del número.

El sistema MUST NOT inventar un voto: la decisión MUST pertenecer a
`{SI, NO, CONDICIONAL}` y la confianza MUST ser un entero, acotado a 0-100.

#### Scenario: La coma deja de tirar el voto

- GIVEN la intervención acaba en `[VOTO] decision=SI, confianza=80`
- WHEN se parsea el voto
- THEN devuelve `{decision: "SI", confidence: 80}`
- AND ese director cuenta como votante decisivo

#### Scenario: Ruido tolerado

- GIVEN las líneas `**[voto] decision = CONDICIONAL ; confianza = 70**`,
  `[VOTO] decision=sí confianza=90` y `[VOTO] decision=NO confianza=55 (revisable)`
- WHEN se parsea cada una
- THEN las tres devuelven voto decisivo con su decisión y confianza correctas

#### Scenario: Confianza fuera de rango

- GIVEN `[VOTO] decision=SI confianza=150`
- WHEN se parsea
- THEN la confianza resultante es `100`

#### Scenario: Confianza ilegible con decisión válida

- GIVEN `[VOTO] decision=SI confianza=alto`
- WHEN se parsea
- THEN devuelve `{decision: "SI", confidence: 50}`: el voto sigue siendo decisivo
- AND ese 50 MUST bloquear el early-exit aunque el resto de la junta vote lo mismo,
  porque `avg_confidence` no alcanza `EARLY_EXIT_MIN_CONFIDENCE`

#### Scenario: Mutación — quitar la normalización

- GIVEN se restaura el regex que exige `decision=X confianza=NN` sin puntuación
  intermedia (`_VOTE_RE`, `board_v2.py:78-81`)
- WHEN se ejecuta la suite
- THEN el test de la coma MUST fallar

### Requirement: BVT-002 — Abstención explícita

Todo votante del censo que no aporte un voto decisivo tras la normalización MUST
aparecer en el recuento como `ABSTENCION`. El sistema MUST NOT descartarlo en
silencio: MUST registrarlo en el log con su rol, MUST emitirlo por SSE como voto del
director, y MUST distinguirse en la UI de «aún no ha votado».

`ABSTENCION` MUST NOT contar a favor de ninguna decisión ni entrar en la media de
confianza.

#### Scenario: Voto irreconocible

- GIVEN el CFO termina con `[VOTO] decision=QUIZÁS confianza=alto`
- WHEN se calcula el recuento del censo `[CTO, CFO, CMO]`
- THEN `counts.ABSTENCION == 1` y el CFO figura como abstención
- AND el log contiene el rol y el motivo
- AND ninguna de `SI`/`NO`/`CONDICIONAL` se incrementa por él

#### Scenario: Director que no emite línea de voto

- GIVEN el CMO no escribe ninguna línea `[VOTO]`
- WHEN se calcula el recuento
- THEN el CMO figura como `ABSTENCION`, no como ausente del recuento

#### Scenario: Mutación — volver al descarte silencioso

- GIVEN se restaura el `if vote:` sin `else` de `board_v2.py:355-361`
- WHEN se ejecuta la suite
- THEN el test de abstención MUST fallar

### Requirement: BVT-003 — Unanimidad real

`unanimous` MUST ser cierto si y sólo si **todos** los votantes del censo emitieron
voto decisivo **y** todos eligieron la misma decisión. Formalmente:
`unanimous == (expected > 0 && counts.ABSTENCION == 0 && max(SI, NO, CONDICIONAL) == expected)`,
donde `expected` es el tamaño del censo.

El recuento MUST exponer `expected` y MUST cumplir
`SI + NO + CONDICIONAL + ABSTENCION == expected`. El censo MUST estar deduplicado por
rol: un rol repetido por el triaje (`["CTO","CTO"]`) cuenta una vez, o la unanimidad
sería inalcanzable para siempre.

#### Scenario: Tres directores, dos votos malformados → NO unánime

- GIVEN el censo `[CTO, CFO, CMO]`
- AND el CTO vota `SI` con 90, y CFO y CMO emiten votos que no se pueden interpretar
- WHEN se calcula el recuento
- THEN `unanimous == false`
- AND `counts == {SI: 1, NO: 0, CONDICIONAL: 0, ABSTENCION: 2}`, `expected == 3`

#### Scenario: Unanimidad legítima

- GIVEN el censo `[CTO, CFO, CMO]` y los tres votan `SI`
- WHEN se calcula el recuento
- THEN `unanimous == true` y `counts.SI == expected == 3`

#### Scenario: Censo con rol duplicado

- GIVEN el triaje devuelve `["CTO", "CTO"]` y el CTO vota `SI`
- WHEN se calcula el recuento
- THEN `expected == 1` y `unanimous == true`

#### Scenario: Mutación — volver a contar sólo los votos parseados

- GIVEN se restaura `total = sum(counts.values())` con
  `unanimous = total > 0 and max(counts.values()) == total` (`board_v2.py:118-121`)
- WHEN se ejecuta la suite
- THEN el test de «3 directores, 2 malformados» MUST fallar

### Requirement: BVT-004 — Empate declarado

Cuando dos o más decisiones empatan en el máximo, el recuento MUST declarar
`outcome == "EMPATE"` y `winner == null`. `winner` MUST NOT derivarse del orden de
inserción de un diccionario.

`outcome` MUST tomar exactamente uno de `UNANIME | MAYORIA | EMPATE | SIN_VOTOS`.
Los prompts que consumen el resultado (abogado del diablo `board_v2.py:414, :431`;
síntesis `:507`) MUST recibir «empate / sin mayoría» y MUST NOT recibir una decisión
que la junta no tomó. La UI MUST decir «Empate» y MUST NOT decir «consenso».

#### Scenario: 1-1-1

- GIVEN `counts == {SI: 1, NO: 1, CONDICIONAL: 1, ABSTENCION: 0}`
- WHEN se calcula el recuento
- THEN `outcome == "EMPATE"`, `winner == null` y `unanimous == false`
- AND el war-room muestra «Empate» y el recuento por decisión
- AND el prompt de síntesis no contiene «Tendencia: SI»

#### Scenario: Sin ningún voto decisivo

- GIVEN los tres directores abstienen
- WHEN se calcula el recuento
- THEN `outcome == "SIN_VOTOS"` y `winner == null`

#### Scenario: Mutación — desempatar por el diccionario

- GIVEN se restaura `winner = max(counts, key=counts.get)` (`board_v2.py:123`)
- WHEN se ejecuta la suite
- THEN el test de 1-1-1 MUST fallar porque `winner` vuelve a ser `"SI"`

### Requirement: BVT-005 — Invariante del enrutado

El early-exit MUST decidirse en **un solo sitio**, derivado del recuento, y los tres
consumidores MUST leerlo de ahí: `consensus_gate_node` (`board_v2.py:378`),
`route_after_consensus` (`board_v2.py:567`) y el emisor de `board_consensus`
(`stream.py:297`). El repositorio MUST contener exactamente **una** expresión que
decida el early-exit.

Invariante: `early_exit == true` MUST implicar
`unanimous == true && counts.ABSTENCION == 0 && expected > 0 && avg_confidence >= 70`.
Cada sitio MAY añadir su propio matiz de presentación (p. ej. `stream.py` sólo lo
anuncia en `consensus_gate`), pero MUST NOT recalcular el predicado.

#### Scenario: Los tres sitios coinciden

- GIVEN un mismo `board_votes` y un mismo censo
- WHEN se consulta el early-exit desde los tres puntos
- THEN los tres devuelven el mismo booleano
- AND una búsqueda del predicado en el repositorio encuentra una sola definición

#### Scenario: No hay early-exit con abstenciones

- GIVEN `counts == {SI: 2, ABSTENCION: 1}` con `avg_confidence == 95`
- WHEN se evalúa el early-exit
- THEN es `false`, y `route_after_consensus` devuelve la ronda de réplicas completa

#### Scenario: Mutación — reintroducir un cuarto cálculo

- GIVEN se copia `tally["unanimous"] and tally["avg_confidence"] >= 70` en cualquiera
  de los tres sitios en lugar de invocar el predicado único
- WHEN se ejecuta la suite
- THEN el test de unicidad del predicado MUST fallar

### Requirement: BVT-006 — Contrato del evento `board_consensus`

El evento SSE `board_consensus` MUST llevar `unanimous`, `tally` (con la clave
`ABSTENCION`), `expected`, `total_decisivos`, `outcome`, `winner` (o `null`) y
`early_exit`. Los campos nuevos MUST ser aditivos: un cliente que sólo lea
`unanimous` y `tally` (`api.ts:186-190`) MUST seguir funcionando sin cambios.

#### Scenario: Payload completo

- GIVEN un recuento `{SI: 1, ABSTENCION: 2}` con censo 3
- WHEN se emite `board_consensus`
- THEN el payload incluye `expected: 3`, `tally.ABSTENCION: 2`, `outcome: "MAYORIA"`,
  `unanimous: false`, `early_exit: false`

#### Scenario: Mutación — quitar `expected` del payload

- GIVEN se elimina `expected` del evento
- WHEN se ejecuta el test de contrato del SSE
- THEN MUST fallar
