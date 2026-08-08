# Tasks: Grant huérfano — el pago entra y los créditos no

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~280-330 (prod ~45, tests ~200, script ~60) |
| Riesgo presupuesto 400 | Medium |
| PRs encadenados | No |
| Split sugerido | PR único, 3 commits TDD (RED → GREEN → script) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Objetivo | Commit |
|---|---|---|
| 1 | Fixture `orphan_env` + 6 tests en rojo | `test(webhooks): cubrir grant huérfano en top-up y suscripción` |
| 2 | Guarda + `bool` + compensación en `webhooks.py` | `fix(webhooks): no otorgar créditos si el perfil no existe` |
| 3 | `audit_orphan_grants.py` read-only | `chore(scripts): auditoría read-only de grants huérfanos` |

**Regla dura**: el único fichero de producción tocable es
`backend/app/presentation/api/v1/webhooks.py`. Cualquier tarea que necesite otro fichero bajo
`backend/app/**` queda **BLOQUEADA** y se reporta al orquestador con el motivo.

**Nunca ejecutar builds.** Commits convencionales, sin atribución de IA.

---

## Fase 0: Línea base

- [x] 0.1 Confirmar rama `feat/grant-huerfano` y `git status --short backend/` limpio.
- [x] 0.2 Correr la suite (comando de 5.1). Esperado exacto: `318 passed`. Si difiere, parar y reportar.

## Fase 1: RED — tests que fallan por el bug

- [x] 1.1 En `backend/tests/test_stripe_webhooks.py`, fixture local `orphan_env(sync_db)`: limpia
      **antes y después** `stripe_events_processed{_id}`, `credit_transactions{stripe_event_id}`,
      `users{firebase_uid}`, `failed_payments{event_id}`; crea el índice único
      `credit_transactions.stripe_event_id` (patrón de la línea 69); expone un dict de evento
      **construido una sola vez** por test con `event_id` propio (`evt_pw002_topup`, …).
- [x] 1.2 PW-001 topup — `test_orphan_topup_no_grant_no_claim`. Precondición
      `assert users_col.find_one({"firebase_uid": U}) is None`. RED esperado:
      `AssertionError: assert 1 == 0` en `count_documents({"stripe_event_id": E})`.
- [x] 1.3 PW-001 suscripción — `test_orphan_subscription_no_grant_no_claim`. Mismo RED
      `assert 1 == 0`, más `assert users_col.count_documents({"subscription.stripe_subscription_id": S}) == 0`.
- [x] 1.4 PW-002 topup — `test_orphan_topup_replay_grants_after_profile_created`: 1er POST sin perfil,
      `assert events_col.find_one({"_id": E})["status"] != "done"`, crear perfil con balance 0,
      reenviar **el mismo** dict. RED esperado: `AssertionError: assert 'done' != 'done'`.
- [x] 1.5 PW-002 suscripción — mismo patrón; tras el replay `subscription.plan_id == P` y
      `wallet.pro_messages_balance == plan_messages_map[P]`. RED: `assert 'done' != 'done'`.
- [x] 1.6 PW-003 topup y suscripción — `patch("...webhooks._grant_topup", side_effect=...)` que
      **borra el perfil y llama al helper real**. RED esperado: `AssertionError: assert 1 == 0`
      (claim no compensado) y `assert None is not None` en `failed_payments`.
- [x] 1.7 Correr la suite: esperado `318 passed, 6 failed`. Commit RED (unit 1).

## Fase 2: GREEN — `webhooks.py` (único fichero de producción)

- [ ] 2.1 Extraer `_dead_letter(failed_col, event_id, event_type, obj, reason)` (~línea 46) y hacer
      que la rama malformed `155-161` lo use.
- [ ] 2.2 `_grant_subscription`:71 → `res = users_col.update_one(...)`; `return res.matched_count > 0`.
- [ ] 2.3 `_grant_topup`:80 → igual; el early-return de `topup_messages <= 0` devuelve `True` con
      comentario (SKU desconocido ≠ perfil huérfano).
- [ ] 2.4 Guarda walrus en la cadena `elif` de :162 —
      `elif (user_doc := users_col.find_one({"firebase_uid": user_id})) is None:` → log ERROR +
      `_dead_letter(..., "user_profile_not_found")` + `return {"status": "user_profile_not_found"}`.
      Docstring: explica por qué el evento queda en `processing`.
- [ ] 2.5 Borrar el `find_one` de :184; :185 pasa a `if not validate_topup_tier(user_doc, plan_id):`.
- [ ] 2.6 Capturar `claimed_tx`/`applied` en las dos ramas de `mode` y añadir la cola única al final
      de la rama (~:203): `if claimed_tx is not None and not applied:` →
      `transactions_col.delete_one({"_id": claimed_tx["_id"]})` + `_dead_letter` + `return`.
- [ ] 2.7 Correr la suite: esperado `324 passed, 0 failed`. Commit GREEN (unit 2).

## Fase 3: Anti-falso-verde (mutaciones; revertir SIEMPRE)

- [ ] 3.1 **Mutación PW-001**: borrar a mano la guarda de 2.4 y correr solo 1.2 y 1.3. Ambos **deben**
      dar `AssertionError: assert 1 == 0`. Si alguno pasa, el test no observa nada → reescribirlo.
      Revertir la mutación.
- [ ] 3.2 **Falso verde PW-002 (a)**: crear el perfil `U` **antes** del 1er POST dentro del test.
      Esperado: falla la precondición `AssertionError: assert {...} is None`. Revertir.
- [ ] 3.3 **Falso verde PW-002 (b)**: usar otro `event_id` en el replay. Esperado:
      `AssertionError: assert 0 == 1` en `count_documents({"stripe_event_id": E})`. Revertir.
- [ ] 3.4 **Falso verde PW-003**: quitar el `delete_one` del `side_effect` (dejar solo la llamada al
      helper real). Esperado: `AssertionError: assert 1 == 0` — el verde depende de la carrera real.
      Revertir.
- [ ] 3.5 `git status --short backend/app` **vacío** y `git diff -- backend/` sin restos de mutación
      antes de cualquier commit.

## Fase 4: Script de auditoría

- [ ] 4.1 Crear `backend/scripts/audit_orphan_grants.py`: read-only, lista `credit_transactions` cuyo
      `user_id` no existe en `users`. Sin escrituras, sin import desde `backend/app/**`.
- [ ] 4.2 Ejecutarlo contra la DB de test y confirmar salida sin mutaciones. Commit (unit 3).

## Fase 5: Verificación final

- [ ] 5.1 Comando exacto:
```
cd backend && MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci /tmp/claude-1000/-home-jarvis-code-SPHERE/547aee8f-16bd-43c9-9f66-4f13b1f9915f/scratchpad/vci/bin/python -m pytest tests/ -q
```
- [ ] 5.2 Correrlo **dos veces seguidas**: ambas `324 passed, 0 failed` (318 + 6). Una 2ª corrida en
      rojo = contaminación entre corridas (PW-002 y PW-005 comparten `stripe_events_processed`) →
      arreglar la limpieza *previa* del fixture 1.1, no el test.
- [ ] 5.3 Confirmar que el diff de producción toca **solo** `webhooks.py`
      (`git diff --name-only -- backend/app`).
