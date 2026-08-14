# n8n-webhook-ingress

> **Source**: infra-n8n (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Cubre el endpoint público sin auth (`POST /api/v1/webhooks/n8n`, `webhooks.py:469-503`) y **la semántica única del secreto compartido** `N8N_WEBHOOK_SECRET`, que tiene cuatro consumidores con comportamientos distintos ante el secreto vacío.

> **Precisión verificada**: `canonical_sign` (`n8n_client.py:20-32`) ya firma con el digest
> **completo**; el truncado a 64 bits está **sólo** en el state OAuth (`integrations.py:75` y `:91`).

## Requirements

| ID | Requirement | N |
|----|------------|---|
| NWI-001 | Secreto ausente, vacío o en blanco **MUST** tratarse como *sin secreto* en todas sus superficies; **MUST NOT** degradar a aceptar firmas forjables | 3 |
| NWI-002 | El state OAuth **MUST** firmarse y compararse con el digest SHA-256 completo; **MUST NOT** truncarse | 3 |
| NWI-003 | El contrato observable de `POST /api/v1/webhooks/n8n` **MUST** verificarse a través de la app ASGI | 2 |
| NWI-004 | El payload firmado **MUST** llevar `timestamp` y `nonce`, con rechazo fuera de ventana y dedupe por `nonce` | 3 |

### NWI-001: Secreto vacío = integración apagada, nunca «cualquier firma vale»

`N8N_WEBHOOK_SECRET` ausente, vacío o sólo espacios **MUST** tratarse como *sin secreto* en
**todas** sus superficies. Ninguna **MAY** calcular, emitir ni aceptar material firmado con clave
vacía. El sistema **MUST** cerrar en falso y **MUST NOT** degradar a aceptar firmas forjables.

| Superficie | Comportamiento MUST con secreto vacío |
|---|---|
| `verify_n8n_signature` (`webhooks.py:404-425`) | `False` sin comparar → 401. Ya implementado; **MUST** conservarse |
| `_generate_state` (`integrations.py:65-77`) | **MUST NOT** emitir state; `/connect` falla con error de configuración y no persiste state en Mongo |
| `_verify_state` (`integrations.py:79-99`) | `False` sin comparar |
| `N8NClient._sign` / `call_webhook` | **MUST NOT** enviar la petición; devuelve el dict de error de integración no disponible |

La causa **MUST** ser distinguible en los logs (configuración vs. firma inválida) y **MUST NOT**
serlo en la respuesta al llamante no autenticado del webhook, que sigue siendo 401.

- GIVEN `N8N_WEBHOOK_SECRET=""`
  WHEN llega `POST /api/v1/webhooks/n8n` con `X-Webhook-Signature` **correcta para la clave vacía**
  THEN la respuesta es 401 y no se ejecuta ningún dispatch

- GIVEN `N8N_WEBHOOK_SECRET=""` y un usuario autenticado
  WHEN invoca `GET /api/v1/integrations/{provider}/connect`
  THEN no hay redirección al provider y no se escribe ningún documento de state

- **Mutación**: GIVEN se elimina `if not secret: return False` de `verify_n8n_signature`, o se permite firmar el
  state con clave vacía
  WHEN se ejecuta la suite de backend
  THEN los dos escenarios anteriores **MUST** fallar
  AND si pasan, el test no observa la guarda y **MUST** reescribirse

### NWI-002: El state OAuth se firma y compara sin truncar

La firma del state **MUST** ser el digest SHA-256 **completo** (64 caracteres hex) y **MUST**
compararse con `hmac.compare_digest`. **MUST NOT** truncarse (antes `.hexdigest()[:16]` = 64 bits).

`_verify_state` **MUST** devolver `False` —nunca 500— ante un `state` con caracteres no ASCII:
`compare_digest` lanza `TypeError`, que el `except (ValueError, IndexError)` anterior **no** captura,
y el `state` llega por query string del callback. La guarda equivalente ya existe en
`webhooks.py:422-425`.

- GIVEN un secreto configurado
  WHEN `_generate_state` produce `nonce:timestamp:sig`
  THEN `sig` tiene exactamente 64 caracteres hex

- GIVEN un state cuya firma son los **16 primeros** caracteres correctos del digest completo
  WHEN se verifica
  THEN **MUST** rechazarse
  AND si se restaura `[:16]`, este test **MUST** fallar

- GIVEN `state = "abc:1700000000:ñ"`
  WHEN se verifica
  THEN devuelve `False` sin propagar `TypeError`

### NWI-003: Contrato observable del endpoint público

`POST /api/v1/webhooks/n8n` es la única superficie de SPHERE alcanzable desde internet sin
autenticación. Su contrato **MUST** verificarse **a través de la app ASGI**, no sólo sobre la
función pura (antes `test_webhook_n8n.py` sólo ejercitaba `verify_n8n_signature`; el endpoint tenía
0 tests).

| Entrada | Respuesta MUST |
|---|---|
| Body no parseable, o parseado a algo que no es `dict` | 400 |
| `X-Webhook-Signature` ausente o inválida | 401 |
| `type` desconocido | 200, sin efecto lateral |
| `user_id` no `str` (p. ej. `{"$ne": null}`) | 200, **ninguna** lectura de credenciales ni llamada saliente |
| `type=schedule_post_result` con firma válida | 200 y se invoca la notificación |

- GIVEN firma válida y `user_id = {"$ne": null}`
  WHEN se procesa el webhook
  THEN no se ejecuta ninguna lectura de credenciales ni llamada saliente a n8n

- **Mutación**: GIVEN se elimina la guarda `isinstance(user_id, str)` de `webhooks.py:445`
  WHEN se ejecuta la suite
  THEN el escenario anterior **MUST** fallar

### NWI-004: Replay protection con caducidad declarada

El payload firmado **MUST** llevar `timestamp` y `nonce`. El backend **MUST** rechazar fuera de una
ventana temporal explícita y **MUST** deduplicar por `nonce`, como ya hace el webhook de Stripe por
`event_id` (`webhooks.py:161-177`).

Durante el redespliegue de los workflows el backend **MAY** aceptar payloads sin `nonce`, pero esa
gracia **MUST** vivir tras un interruptor de configuración con condición de retirada escrita;
**MUST NOT** ser el comportamiento por defecto indefinido.

- GIVEN un payload firmado ya aceptado una vez
  WHEN se reenvía idéntico dentro de la ventana
  THEN se rechaza y **no** se emite un segundo mensaje de WhatsApp

- GIVEN un payload con `timestamp` anterior a la ventana
  WHEN llega con firma correcta
  THEN se rechaza igualmente

- **Mutación**: GIVEN se elimina la comprobación de `nonce`
  WHEN se ejecuta la suite
  THEN el escenario de reenvío **MUST** fallar
