# Proposal: Grant huérfano — el pago entra y los créditos no

## Intent

En `checkout.session.completed`, `_claim_grant` reclama el evento y luego `_grant_*` hace `update_one`
**sin comprobar `matched_count`**. Si el perfil no existe: el cliente paga, el claim se consume, los
créditos nunca llegan y el reintento de Stripe choca con `DuplicateKeyError` → 200 → pérdida
permanente y silenciosa.

Verificado en código (no solo heredado de la exploración):
- `webhooks.py:80` (`_grant_topup`) y `webhooks.py:71` (`_grant_subscription`) — **ambas** rutas de grant
  ignoran `matched_count`. La exploración solo citaba top-up.
- `webhooks.py:184-193` ya hace `find_one` del perfil; el condicional `if user_doc and not
  validate_topup_tier(...)` hace que `user_doc = None` caiga al `else` **y otorgue**. La comprobación
  está a una línea.
- Patrón dead-letter ya existente y con test: rama "malformed" → `failed_payments` + 200
  (`webhooks.py:155-161`, `test_stripe_webhooks.py:139`).

## Scope

### In Scope
- Guarda previa: si el perfil no existe, **no reclamar**; escribir en `failed_payments` (`reason:
  "user_profile_not_found"`), log ERROR, responder 200. Aplica a las rutas `payment` y `subscription`.
- Red de seguridad: `_grant_*` devuelve si aplicó. Si `matched_count == 0` **después** de reclamar
  (carrera: borrado de cuenta entre lectura y escritura) → borrar el claim (compensación) +
  dead letter + 200.
- Tests TDD (RED primero) para ambas rutas: perfil ausente → sin créditos, sin claim consumido,
  fila en `failed_payments`, 200.
- Script **read-only** `backend/scripts/audit_orphan_grants.py`: lista transacciones cuyo `user_id`
  no existe en `users`. No repara. No se despliega.

### Out of Scope
- Crear el perfil desde el webhook. El webhook solo tiene `client_reference_id` y `customer`;
  `_auto_provision_user` (`auth.py:201`) necesita claims de Firebase y aplica el gate de email
  verificado. Crearlo aquí duplicaría el aprovisionamiento y podría resucitar cuentas borradas.
- Reintentos con 500 (Stripe reintentaría y luego desistiría igual de silenciosamente).
- **Crash entre `_claim_grant` y `update_one`**: produce el mismo huérfano por otra vía. Requiere
  transacción multi-documento o reconciliación automática. Este cambio NO lo cierra.
- Reparación automática de huérfanos existentes; telemetría o servicios nuevos; `invoice.*` y
  `customer.subscription.*` (no otorgan crédito nuevo o ya guardan con `if user:`).

## Capabilities

### New Capabilities
- `payment-webhooks`: entrega de créditos vía Stripe — idempotencia por claim, perfil ausente,
  dead letter, compensación del claim, contrato de códigos de respuesta.

### Modified Capabilities
- None. `credit-system` (CS-001..CS-007) cubre wallets y frontend, no la ruta de webhook; ninguno
  de sus requisitos cambia.

## Approach

Decisión: **no otorgar, no reclamar, dead-letter y 200** — coherente con la rama "malformed" ya
existente. El claim nunca queda consumido sin efecto, así que un *replay* manual desde el dashboard
de Stripe entrega los créditos sin tocar Mongo a mano. Ese es el punto que hace defendible el 200.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/app/presentation/api/v1/webhooks.py` | Modified | Único fichero de producción. Guarda previa + `matched_count` + compensación |
| `backend/tests/test_stripe_webhooks.py` | Modified | 4 tests nuevos (topup/subscription × guarda/carrera) |
| `backend/scripts/audit_orphan_grants.py` | New | Auditoría read-only, no desplegada |

Commits (TDD estricto): 1) `test(webhooks): cubrir grant huérfano en top-up y suscripción` (RED) →
2) `fix(webhooks): no otorgar créditos si el perfil no existe` (GREEN) →
3) `chore(scripts): auditoría read-only de grants huérfanos`.

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| `failed_payments` no lo lee **nadie** (verificado: cero consumidores en `app/`) — el pago sigue invisible sin proceso humano | Alta | Log ERROR + script de auditoría. Sin telemetría nueva (regla del dueño). Se declara explícitamente |
| Carrera real aprovisionamiento/checkout: el perfil aparece segundos después y el 200 renuncia al reintento gratis de Stripe | Baja (hipótesis) | Claim no consumido → replay desde Stripe funciona |
| Fallo transitorio de Mongo en el `find_one` de la guarda → dead letter falso | Baja | La excepción sube al `except` existente → 500 → Stripe reintenta. No se dead-letterea |
| Un `find_one` extra por webhook de suscripción | Baja | Coste despreciable; ya se hace en la ruta top-up |

**Frecuencia real en producción: desconocida (hipótesis).** La evidencia física citada
(`evt_topup_idem_1`) es un *event_id de test*: demuestra el mecanismo del bug en la base compartida,
**no** que haya ocurrido con un cliente real. Desde el repositorio no puede saberse; solo el script
de auditoría contra la base de producción puede responderlo.

## Rollback Plan

`git revert` del commit de fix. Un solo fichero de producción, sin migraciones ni cambios de
esquema; `failed_payments` es aditivo (los documentos escritos por la versión nueva sobreviven al
revert sin romper nada porque nadie los lee). Revertir reabre el bug, no introduce otro.

**Pago en vuelo durante el despliegue** (reinicio del proceso FastAPI):
- Webhook completado antes del reinicio: sin cambio.
- Webhook cortado a mitad: el evento queda en `processing`, Stripe reintenta y la lógica idempotente
  reentra. Sin regresión.
- Peor caso: proceso muere entre `_claim_grant` y `update_one` → huérfano igual, **fuera de alcance**
  (ver Out of Scope). El despliegue no lo agrava ni lo mitiga.
- Durante el revert: idéntico. Los pagos ya enviados a `failed_payments` **no** se reprocesan solos;
  requieren replay manual.

## Dependencies

Ninguna externa. Apilado sobre `feat/backend-ci-verde` (CI en verde), que es lo que permite que los
tests nuevos observen algo real.

## Success Criteria

- [ ] Perfil ausente en `payment` y en `subscription` → 0 créditos, 200, fila en `failed_payments`
- [ ] El claim **no** queda consumido: un replay del mismo evento con el perfil ya creado sí otorga
- [ ] `matched_count == 0` tras reclamar → claim borrado y dead letter
- [ ] Ningún test existente de idempotencia se rompe (no hay doble grant)
- [ ] El script de auditoría corre sin escribir nada
