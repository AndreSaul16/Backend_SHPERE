# credit-system

> **Source**: fix-platform-stability (archived 2026-05-14), ragnarok-production-audit-v2 (archived 2026-05-21), lanzamiento-p0 (archived 2026-08-14), production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)
> **Promoción retroactiva (2026-08-14)**: CS-011 se implementó y sus tareas se cerraron
> al 100 % en el ciclo `production-readiness`, pero nunca se promovió a esta spec.
> Se promueve ahora tal y como se escribió, sin reescribirlo.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| CS-001 | `_ensure_wallet` MUST re-initialize invalid wallets (`null`, `{}`, missing `pro_messages_balance`) | 3 |
| CS-002 | Valid wallets MUST NOT be overwritten | 1 |
| CS-003 | Admin repair endpoint SHALL fix invalid wallets for existing users | 2 |
| CS-004 | ChatPanel.tsx MUST NOT call `decrementOptimistic()` (single decrement in `api.ts` only) | 2 |
| CS-005 | Board meeting flow MUST skip per-agent credit charge when `board_mode` is set | 1 |
| CS-006 | `_auto_provision_user` MUST set `board_meeting_enabled: True` and `board_iterations: 1` | 1 |
| CS-007 | ChatPanel MUST display real latency/token metrics or nothing; MUST NOT hardcode `"24ms"` / `"0.8k/min"` | 2 |
| CS-008 | `PRODUCT.md` MUST documentar una sola regla de precio del debate: la decide el triaje | 2 |
| CS-009 | El early-exit MUST NOT alterar el importe cobrado ni abrir un segundo reembolso | 2 |
| CS-010 | La UI MUST mostrar el coste del debate junto a su motivo | 3 |
| CS-011 | Exactly 1 message credit SHALL be charged per human POST to `/stream` | 5 |

### CS-001: Wallet Hardening

> CS-001 cubre la forma `null` desde `6b978c3`.

- GIVEN `wallet: {}`  WHEN `_ensure_wallet` is called  THEN init with `pro_messages_balance: 5`
- GIVEN `wallet: null`  WHEN `_ensure_wallet` is called  THEN init with `pro_messages_balance: 5`
- GIVEN `wallet: {topup_messages_balance: 0}` (no pro key)  WHEN `_ensure_wallet` runs  THEN re-init

### CS-002: Valid Wallet Preservation

- GIVEN wallet `{pro_messages_balance: 3, topup_messages_balance: 0}`  WHEN `_ensure_wallet` runs  THEN balance unchanged

### CS-003: Repair Endpoint

> Implementado en `4d50f35`.

- GIVEN user with wallet `{}`  WHEN repair called  THEN wallet initialized, user can send messages
- GIVEN user with valid wallet (balance 3)  WHEN repair called  THEN balance remains 3

### CS-004: Single Credit Decrement

- GIVEN user clicks Send
  WHEN `streamChat()` starts in `api.ts`
  THEN `decrementOptimistic()` is called ONCE (in `api.ts`)

- GIVEN `handleSendMessage` executes in ChatPanel.tsx
  WHEN the message is processed
  THEN ChatPanel.tsx does NOT call `decrementOptimistic()`

### CS-005: Board Meeting Credit Handling

- GIVEN `board_mode` flag is true
  WHEN an agent node executes
  THEN credit manager does NOT charge per-agent (stream-level `already_charged` covers it)

### CS-006: Board Meeting Defaults

- GIVEN `_auto_provision_user()` creates a new user document
  WHEN the user doc is inserted into MongoDB
  THEN `board_meeting_enabled` field equals `True`
  AND `board_iterations` field equals `1`

### CS-007: Real Metrics Display

- GIVEN SSE stream has completed
  WHEN time-to-first-token and total token count are measurable
  THEN ChatPanel displays the actual measured values

- GIVEN no measurement data is available (stream not started, error, or incomplete)
  WHEN ChatPanel renders the metrics section
  THEN no fake metrics are shown (no `"Latencia: 24ms"`, no `"Tokens: 0.8k/min"`)

### CS-008: El precio del debate lo decide el triaje

El producto MUST documentar una y sólo una regla de precio del debate: cuesta
`BOARD_MEETING_COST` (5) créditos, y `BOARD_REDUCED_COST` (3) **cuando el triaje
reduce la junta a 2 participantes o menos**. `PRODUCT.md` MUST NOT contener la
afirmación de que el consenso, la unanimidad o el early-exit abaratan el debate.

La comprobación MUST ser ejecutable, en la línea de las puertas ya existentes del
repositorio (`frontend/scripts/check-*.mjs`): una regla de CI que lea `PRODUCT.md` y
falle si aparece la regla contradictoria.

- GIVEN `PRODUCT.md`
  WHEN se ejecuta la comprobación de coherencia de precio
  THEN encuentra la regla del triaje
  AND no encuentra ninguna afirmación de que el debate abreviado cueste menos

- **Mutación**: GIVEN se restaura en `PRODUCT.md` el texto «si el consejo está de
  acuerdo pronto, el debate se abrevia y cuesta menos (3 créditos en vez de 5)»
  (`PRODUCT.md:53-55`)
  WHEN se ejecuta la comprobación
  THEN MUST fallar

### CS-009: El early-exit no altera el precio

El consenso temprano MUST NOT modificar el importe cobrado. El único reembolso parcial
de un debate MUST ser el del triaje, emitido una sola vez tras el nodo `triage`
(`stream.py:270-282`, protegido por `partial_refund_done`). MUST NOT existir un
segundo camino de reembolso disparado por `early_exit`, `unanimous` o el recuento.

Esta condición MUST verificarse con una prueba, no sólo con la lectura del texto.

- GIVEN una junta de 3 directores cobrada a 5 créditos
  WHEN el recuento da unanimidad y el grafo salta a síntesis
  THEN no se emite ningún reembolso adicional y el cargo sigue siendo 5

- **Mutación**: GIVEN se añade un `apartial_refund` condicionado a `early_exit`
  WHEN se ejecuta la suite de backend
  THEN el test de «early-exit no reembolsa» MUST fallar

### CS-010: El coste se muestra con su motivo

Cuando el coste anunciado del debate difiere del precio base, la UI MUST mostrar el
importe **y su motivo**, en el mismo sitio y a la vez. Hoy `BoardWarRoom.tsx:126`
muestra `{board.cost} créditos` sin explicar por qué son 3 y no 5.

El motivo MUST derivarse de los participantes que trae el evento `board_plan`
(`stream.py:283`, ya lleva `participants` y `cost`) y MUST nombrar cuántos directores
componen la junta. El sistema MUST NOT presentar el descuento como consecuencia del
consenso.

- GIVEN `board_plan` llega con `participants: ["CTO","CFO"]` y `cost: 3`
  WHEN se pinta el war-room
  THEN se lee «3 créditos» y el motivo, que nombra la junta reducida a 2 directores

- GIVEN `board_plan` llega con 3 participantes y `cost: 5`
  WHEN se pinta el war-room
  THEN se lee «5 créditos» sin mensaje de descuento

- **Mutación**: GIVEN se elimina el texto del motivo y se deja sólo
  `{board.cost} créditos`
  WHEN se ejecuta la suite de frontend
  THEN el test del motivo del coste MUST fallar

### CS-011: Credit Metering — One Charge Per Human Message

> Promovido retroactivamente el 2026-08-14 desde `production-readiness`.

The system SHALL charge exactly 1 message credit per human POST to `/stream`, regardless
of agent invocations or tool loops.

- GIVEN a user with balance 5 sends "Hola"
  WHEN the stream completes without tool calls
  THEN the balance is 4 (1 credit consumed)

- GIVEN a user with balance 5 and a query that triggers a tool call plus follow-up
  WHEN the agent invokes the tool and generates a response
  THEN the balance is 4 (1 credit consumed, not 2)

- GIVEN a user with balance 1, board meeting enabled, and 5 agents collaborating
  WHEN the POST to `/stream` triggers the full board meeting
  THEN the balance is 0 (1 credit consumed, not 5-10)

- GIVEN a user with balance 3 sends 2 messages simultaneously
  WHEN both streams process concurrently
  THEN the balance is 1 (2 credits consumed, no double-charge)

- GIVEN a user with balance 2 and a stream that starts
  WHEN the backend raises an inference error before the response completes
  THEN the balance is 2 (credit refunded; 0 consumed)
