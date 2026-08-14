# Design: Grant huérfano — el pago entra y los créditos no

## Technical Approach

Una guarda de perfil **antes** del dispatch de `mode`, un `bool` de retorno en los dos `_grant_*`
y una cola de compensación única al final de la rama `checkout.session.completed`. Todo en
`webhooks.py`. El evento sale de las rutas de fallo por `return` temprano, así que nunca llega al
`update_one(status="done")` de la línea 292 y queda reprocesable (PW-002).

## Architecture Decisions

### D1 — Cómo se evita el `done` sin romper PW-005

| Opción | Coste | Veredicto |
|---|---|---|
| **`return` temprano; el evento se queda en `processing`** | 1 línea | **Elegida** |
| Estado nuevo (`pending_profile`) | +estado en una colección que hoy solo conoce `processing`/`done`, 0 consumidores | Descartada |
| `events_col.delete_one(_id)` | Borra la traza de que el evento se vio | Descartada |

**Rationale**: verificado en `webhooks.py:133-139` — la guarda de idempotencia solo bloquea con
`status == "done"`; `processing` cae al `logger.warning` y **reentra**. Es exactamente el camino
que PW-005 ya prueba (`test_topup_grant_idempotent_on_retry:120`). Dejar `processing` es literalmente
"no marcar done": diff mínimo, cero estados nuevos, y el motivo vive donde debe (`failed_payments.reason`).
La respuesta es `200 {"status": "user_profile_not_found"}` — cuerpo distinto de `success` y de
`already processed`, que Stripe ignora pero los tests pueden distinguir.

### D2 — Dónde va la guarda

En la **cadena `elif` existente** (línea 162), con walrus, para no reindentar las dos ramas de `mode`:

```python
elif (user_doc := users_col.find_one({"firebase_uid": user_id})) is None:
    logger.error(...)
    _dead_letter(failed_col, event_id, event_type, obj, "user_profile_not_found")
    return {"status": "user_profile_not_found"}
```

**Rationale**: sube el `find_one` que ya existe en la línea 184 por encima del dispatch. Efectos:
(a) el bug de `if user_doc and not validate_topup_tier(...)` (185) desaparece — ahí `user_doc` ya es
no-nulo, se queda `if not validate_topup_tier(user_doc, plan_id)`; (b) top-up **no** gana lecturas;
(c) la suscripción huérfana ni siquiera llama a `stripe.Subscription.retrieve`.
**Descartado**: guarda duplicada dentro de cada rama de `mode` (dos sitios que desincronizar).

### D3 — Simetría con `_grant_subscription`

Una sola guarda cubre `payment` y `subscription` porque vive **antes** del `if mode ==`. Cero lógica
duplicada, cero código nuevo en `_grant_subscription` salvo el `return`.

### D4 — Compensación de `matched_count == 0`

`_grant_subscription` (71) y `_grant_topup` (80) pasan a `res = users_col.update_one(...)` /
`return res.matched_count > 0`. **`matched_count`, no `modified_count`**: un `$set` con los mismos
valores da `modified_count == 0` con el perfil presente y dispararía una compensación falsa.
El `topup_messages <= 0` (SKU desconocido) devuelve `True` — el perfil existe, no es huérfano;
comportamiento intacto, fuera de alcance, comentado en el código.

La cola vive **una sola vez**, al final de la rama `checkout.session.completed`:

```python
if claimed_tx is not None and not applied:
    transactions_col.delete_one({"_id": claimed_tx["_id"]})   # el claim de ESTA petición
    _dead_letter(failed_col, event_id, event_type, obj, "user_profile_not_found")
    return {"status": "user_profile_not_found"}
```

**Borra exactamente** el documento insertado en esta petición: `insert_one` inyecta `_id` en el dict
pasado (verificado contra pymongo 4.16 en este entorno), así que se borra por `_id`, no por
`stripe_event_id`. Importa: los tests crean el índice único a mano y puede no existir en algún
entorno; borrar por `stripe_event_id` podría llevarse un documento ajeno.

### D5 — Tests que no pueden pasar por accidente

Fixture local `orphan_env(sync_db)` en `test_stripe_webhooks.py` — no en `conftest.py`, para no
tocar tests ajenos:

1. Limpia **antes y después** (yield) las 4 colecciones: `stripe_events_processed{_id}`,
   `credit_transactions{stripe_event_id}`, `users{firebase_uid}`, `failed_payments{event_id}`.
   Sin la limpieza *previa*, un `done` de una corrida rota deja PW-002 en rojo permanente y PW-005
   contamina PW-002 (Mongo compartido en CI).
2. `event_id` único por test (`evt_pw002_topup`, …) → PW-002 y PW-005 no pueden colisionar.
3. Crea el índice único de `credit_transactions.stripe_event_id` (como el test existente:69), sin él
   los `count_documents == 0` no significan nada.

Anti-trampa dentro de cada test:
- **Precondición explícita**: `assert users_col.find_one({"firebase_uid": U}) is None` antes del 1er
  envío → mata el falso verde de "el perfil ya existía".
- **Aserción directa de PW-002**: `assert events_col.find_one({"_id": E})["status"] != "done"` tras
  el 1er envío → falla si alguien reintroduce el marcado.
- **Un solo objeto evento**: el dict se construye una vez en el fixture y se reusa en los dos POST.
  No hay un segundo literal donde colar otro `event_id`.
- Las aserciones son de **estado en Mongo** (claims, balance, `failed_payments`), no del cuerpo HTTP.
- PW-003 simula la carrera envolviendo el helper real:
  `patch("...webhooks._grant_topup", side_effect=lambda col, u, p: (col.delete_one({"firebase_uid": u}), _real(col, u, p))[1])`
  — borra el perfil y **llama al helper real**, así se ejerce el `matched_count` de verdad.
- PW-001 escenario 3 (mutación) es un paso **manual** del checklist de verify: borrar la guarda,
  correr la suite, exigir rojo en los 2 tests.

## Data Flow

```
Stripe ──POST──> claim evento (upsert "processing")
                      │ status=="done"? ──> 200 already processed        [PW-005]
                      ▼
                 find_one(users)
                   │ None ──> failed_payments + ERROR ──> 200 (queda "processing") [PW-001/002]
                   ▼
                 _claim_grant(tx)  ──False──> (ya aplicado) ──> done
                   │True
                   ▼
                 _grant_*  ──matched_count==0──> delete tx + failed_payments ──> 200 ("processing") [PW-003]
                   │True
                   ▼
                 status="done" ──> 200 success                            [PW-004]
```

## File Changes

| Fichero | Acción | Descripción |
|---|---|---|
| `backend/app/presentation/api/v1/webhooks.py` | Modify | `_dead_letter` nuevo (~46); `_grant_subscription`:71 y `_grant_topup`:80 devuelven `bool`; guarda walrus en la cadena :162; `if user_doc and`:185 → `if not validate…`; cola de compensación al final de la rama (:203); `155-161` pasa a usar `_dead_letter` |
| `backend/tests/test_stripe_webhooks.py` | Modify | fixture `orphan_env` + 6 tests (PW-001/002/003 × topup/subscription) |
| `backend/scripts/audit_orphan_grants.py` | Create | Read-only, no se despliega, no se importa desde `app/` |

Único fichero de producción. `stripe_events_processed` y `failed_payments` no cambian de esquema.

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Integración (única) | PW-001..005 | httpx + Mongo real, `patch("stripe.Webhook.construct_event")` como el resto del fichero |
| Manual | PW-001 esc. 3 | Mutación de la guarda → exigir rojo |

Línea base a preservar: **318 passed**. Comando en la orden de tarea (intérprete `vci/bin/python`).

## Migration / Rollout

Sin migración. Commits (TDD estricto):
1. `test(webhooks): cubrir grant huérfano en top-up y suscripción` — **RED**, 6 tests fallando.
2. `fix(webhooks): no otorgar créditos si el perfil no existe` — **GREEN**, 324 passed.
3. `chore(scripts): auditoría read-only de grants huérfanos`.

**Pago en vuelo durante el despliegue**: el proceso FastAPI reinicia entre `find_one_and_update` y el
`done` → el evento queda en `processing`, Stripe reintenta y reentra idempotente (comportamiento
actual, sin regresión). Un evento que la versión vieja atendió y dejó huérfano **no** se repara solo:
requiere replay manual. Un evento que la versión nueva mandó a `failed_payments` y que se reprocesa
tras un `git revert` vuelve al bug antiguo — el revert reabre el fallo, no introduce otro.

## Risks

| Riesgo que introduce el diseño | Mitigación |
|---|---|
| `processing` pasa a significar dos cosas (crashó / diferido por perfil ausente); un operador no las distingue mirando solo esa colección | El motivo está en `failed_payments.reason`; se documenta en el docstring de la guarda |
| Documentos en `processing` que ya nadie reintenta (Stripe recibió 200) se acumulan sin TTL | Ya ocurre hoy con los crashes; el script de auditoría los expone |
| Fallo transitorio de Mongo en el `find_one` de la guarda → dead letter falso | No: la excepción sube al `except` de :285 → 500 → Stripe reintenta |
| El walrus en la cadena `elif` es menos legible que un `else:` con bloque | Alternativa: reindentar 40 líneas y engordar el diff. Se elige el diff pequeño |
| `delete_one` de compensación si el índice único no existe | Se borra por `_id` del documento insertado, no por `stripe_event_id` |

## Open Questions

- Ninguna que bloquee. Frecuencia real del bug en producción: sigue siendo **hipótesis** (solo el
  script de auditoría contra la base real puede responderla).
