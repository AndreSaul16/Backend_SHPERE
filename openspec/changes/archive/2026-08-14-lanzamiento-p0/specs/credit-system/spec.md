# Delta for credit-system

Delta de **documentación y visibilidad**. No cambia el precio ni la lógica de cobro:
la fija por escrito y la hace auditable. Verificado: el coste lo decide el triaje por
número de participantes (`stream.py:276-278`,
`cost = BOARD_REDUCED_COST if len(participants) <= 2 else BOARD_MEETING_COST`), y el
recuento sólo decide si hay réplicas (`board_v2.py:566-573`). `PRODUCT.md` se
contradice: §Positioning :53-55 dice que el descuento lo da el consenso; §Operating
Context :66-68 dice que lo da el triaje.

CS-001 … CS-007 quedan **sin cambios**.

## ADDED Requirements

### Requirement: CS-008 — El precio del debate lo decide el triaje

El producto MUST documentar una y sólo una regla de precio del debate: cuesta
`BOARD_MEETING_COST` (5) créditos, y `BOARD_REDUCED_COST` (3) **cuando el triaje
reduce la junta a 2 participantes o menos**. `PRODUCT.md` MUST NOT contener la
afirmación de que el consenso, la unanimidad o el early-exit abaratan el debate.

La comprobación MUST ser ejecutable, en la línea de las puertas ya existentes del
repositorio (`frontend/scripts/check-*.mjs`): una regla de CI que lea `PRODUCT.md` y
falle si aparece la regla contradictoria.

#### Scenario: PRODUCT.md dice una sola cosa

- GIVEN `PRODUCT.md`
- WHEN se ejecuta la comprobación de coherencia de precio
- THEN encuentra la regla del triaje
- AND no encuentra ninguna afirmación de que el debate abreviado cueste menos

#### Scenario: Mutación — reintroducir la promesa vieja

- GIVEN se restaura en `PRODUCT.md` el texto «si el consejo está de acuerdo pronto, el
  debate se abrevia y cuesta menos (3 créditos en vez de 5)» (`PRODUCT.md:53-55`)
- WHEN se ejecuta la comprobación
- THEN MUST fallar

### Requirement: CS-009 — El early-exit no altera el precio

El consenso temprano MUST NOT modificar el importe cobrado. El único reembolso parcial
de un debate MUST ser el del triaje, emitido una sola vez tras el nodo `triage`
(`stream.py:270-282`, protegido por `partial_refund_done`). MUST NOT existir un
segundo camino de reembolso disparado por `early_exit`, `unanimous` o el recuento.

Esta condición MUST verificarse con una prueba, no sólo con la lectura del texto.

#### Scenario: Debate abreviado, mismo precio

- GIVEN una junta de 3 directores cobrada a 5 créditos
- WHEN el recuento da unanimidad y el grafo salta a síntesis
- THEN no se emite ningún reembolso adicional y el cargo sigue siendo 5

#### Scenario: Mutación — reembolsar por consenso

- GIVEN se añade un `apartial_refund` condicionado a `early_exit`
- WHEN se ejecuta la suite de backend
- THEN el test de «early-exit no reembolsa» MUST fallar

### Requirement: CS-010 — El coste se muestra con su motivo

Cuando el coste anunciado del debate difiere del precio base, la UI MUST mostrar el
importe **y su motivo**, en el mismo sitio y a la vez. Hoy `BoardWarRoom.tsx:126`
muestra `{board.cost} créditos` sin explicar por qué son 3 y no 5.

El motivo MUST derivarse de los participantes que trae el evento `board_plan`
(`stream.py:283`, ya lleva `participants` y `cost`) y MUST nombrar cuántos directores
componen la junta. El sistema MUST NOT presentar el descuento como consecuencia del
consenso.

#### Scenario: Junta reducida

- GIVEN `board_plan` llega con `participants: ["CTO","CFO"]` y `cost: 3`
- WHEN se pinta el war-room
- THEN se lee «3 créditos» y el motivo, que nombra la junta reducida a 2 directores

#### Scenario: Junta completa

- GIVEN `board_plan` llega con 3 participantes y `cost: 5`
- WHEN se pinta el war-room
- THEN se lee «5 créditos» sin mensaje de descuento

#### Scenario: Mutación — quitar el motivo

- GIVEN se elimina el texto del motivo y se deja sólo `{board.cost} créditos`
- WHEN se ejecuta la suite de frontend
- THEN el test del motivo del coste MUST fallar
