# Delta for payment-webhooks

Capacidad nueva: todo es ADDED. Alcance: `checkout.session.completed` en
`POST /api/v1/webhooks/stripe`. `E` = event_id, `U` = `client_reference_id`,
`P` = `metadata.plan_id`.

## ADDED Requirements

### Requirement: PW-001 — Perfil ausente no otorga ni reclama

Si el perfil (`users.firebase_uid == client_reference_id`) no existe, el sistema **MUST NOT**
mutar el wallet y **MUST NOT** insertar el registro de claim en `credit_transactions`.
**MUST** escribir en `failed_payments` con `reason: "user_profile_not_found"`, loguear ERROR y
responder **200**. Aplica por igual a `mode == "payment"` y `mode == "subscription"`.

#### Scenario: Top-up con perfil ausente

- GIVEN no existe usuario con `firebase_uid == U` ni evento previo `E`
- WHEN llega el evento con `mode: "payment"`
- THEN la respuesta es 200
- AND `credit_transactions.count_documents({stripe_event_id: E}) == 0`
- AND hay un documento en `failed_payments` con `event_id: E` y `reason: "user_profile_not_found"`

#### Scenario: Suscripción con perfil ausente (simetría)

- GIVEN las mismas precondiciones con `mode: "subscription"`
- WHEN llega el evento
- THEN la respuesta es 200, hay 0 claims para `E` y la fila en `failed_payments`
- AND ningún documento de `users` queda con el `stripe_subscription_id` del evento

#### Scenario: Mutación — la guarda debe ser observable

- GIVEN se elimina del código la comprobación de perfil ausente (la guarda pasa siempre)
- WHEN se ejecuta la suite
- THEN los tests de los dos escenarios anteriores **MUST** fallar
- AND si alguno pasa, el test no observa nada y **MUST** reescribirse antes de dar por buena la fase

### Requirement: PW-002 — La entrega no queda consumida: el replay sí otorga

Tras PW-001 el sistema **MUST** dejar el evento reprocesable: ni el claim en `credit_transactions`
ni el registro en `stripe_events_processed` pueden bloquear una segunda entrega. El evento
**MUST NOT** quedar en `status: "done"`.

#### Scenario: Replay del mismo evento tras crear el perfil (top-up)

- GIVEN el evento `E` ya fue a dead letter por perfil ausente (200)
- WHEN se crea el perfil `U` con `wallet.topup_messages_balance: 0` y se reenvía el **mismo** `E`
- THEN la respuesta no es `{"status": "already processed"}`
- AND `wallet.topup_messages_balance == topup_messages_map[P]`
- AND `credit_transactions.count_documents({stripe_event_id: E}) == 1`

#### Scenario: Replay del mismo evento tras crear el perfil (suscripción)

- GIVEN lo mismo con `mode: "subscription"`
- WHEN se reenvía `E` con el perfil ya creado
- THEN `subscription.plan_id == P` y `wallet.pro_messages_balance == plan_messages_map[P]`

### Requirement: PW-003 — Compensación cuando el perfil desaparece tras reclamar

Si tras reclamar el evento la escritura sobre `users` devuelve `matched_count == 0`, el sistema
**MUST** borrar el claim recién insertado, escribir `failed_payments` con
`reason: "user_profile_not_found"`, dejar el evento reprocesable (PW-002) y responder 200.

#### Scenario: Borrado de cuenta entre la guarda y el grant

- GIVEN el perfil existe al pasar la guarda pero se borra antes del `update_one`
- WHEN se procesa el evento `E` (`payment` o `subscription`)
- THEN la respuesta es 200
- AND `credit_transactions.count_documents({stripe_event_id: E}) == 0`
- AND existe la fila en `failed_payments`

### Requirement: PW-004 — Camino feliz intacto

Con perfil existente el sistema **MUST** otorgar los créditos, reclamar el evento y responder
`200 {"status": "success"}`.

#### Scenario: Top-up con perfil existente

- GIVEN existe `U` con balance 0
- WHEN llega el evento con `mode: "payment"`
- THEN el balance es `topup_messages_map[P]`, hay 1 claim y la respuesta es `{"status": "success"}`

#### Scenario: Suscripción con perfil existente

- GIVEN existe `U`
- WHEN llega el evento con `mode: "subscription"`
- THEN `subscription.plan_id == P`, se otorga `plan_messages_map[P]`, hay 1 claim
- AND no se escribe en `failed_payments`

### Requirement: PW-005 — Idempotencia existente preservada

El sistema **MUST** seguir devolviendo `{"status": "already processed"}` para un evento con
`status: "done"` y **MUST NOT** otorgar dos veces ante un reintento de un evento en `processing`.

#### Scenario: Reenvío de un evento ya procesado

- GIVEN `E` se procesó con éxito
- WHEN se reenvía `E`
- THEN la respuesta es 200 `{"status": "already processed"}` y el balance no cambia

#### Scenario: Reintento de un evento cortado a mitad

- GIVEN `E` otorgó créditos pero quedó en `status: "processing"`
- WHEN Stripe reintenta `E`
- THEN la respuesta es 200 y el balance sigue siendo `topup_messages_map[P]`, sin duplicar
