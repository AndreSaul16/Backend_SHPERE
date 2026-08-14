# Exploración: backend-ci-verde

> Fase SDD: explore. Fecha: 2026-08-08. Rama: `master`.
> Objetivo: dejar `test-backend` de GitHub Actions en verde **sin apagar señal**.

## Resumen del veredicto

**Los 10 fallos son del test o del entorno de CI. Ninguno es un bug de producto.**
Pero la investigación ha destapado dos cosas peores que el rojo:

1. **Un test verde que miente** (`test_billing_api.py::TestWebhookInvalidSKU`) — no puede fallar nunca.
2. **Un bug real de producción** en el webhook de Stripe (grant huérfano sin dead-letter), invisible para la suite.

---

## Estado actual

`.github/workflows/ci.yml` levanta Mongo 7 + Redis 7 y exporta `MONGODB_URL`, `DB_NAME=sphere_test`,
`REDIS_URL`, `ENVIRONMENT=development`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`. **No exporta ninguna
`STRIPE_*`.** No hay `.env` versionado en el repo (verificado: `ls .env` y `backend/.env` → no existen),
por lo que el entorno local reproduce CI con fidelidad.

Reproducción local (venv con pins idénticos a CI): **10 failed, 307 passed**.

### Arquitectura relevante

| Pieza | Comportamiento |
|---|---|
| `app/core/config.py:21` | `DB_NAME: str = "sphere_db"` — Pydantic Settings, sobreescrito por la env var. En CI vale `sphere_test`. |
| `app/infrastructure/database.py:24` | `DB_NAME = os.getenv("DB_NAME", "sphere_db")`; `get_sync_client()` devuelve el **cliente**, no la base. |
| `app/presentation/api/v1/webhooks.py:105` | `db_client = db.get_sync_client()[settings.DB_NAME]` — la app **siempre** escribe en `DB_NAME`. |
| `app/core/config.py:161-164` | `stripe_configured` = `bool(STRIPE_SECRET_KEY.strip())`. |
| `app/presentation/api/v1/billing.py:24-29` | Guard `if not settings.stripe_configured: → 503`, **antes** de la validación de catálogo (línea 32). |

---

## Evidencia experimental (decisiva)

Dos experimentos que aíslan cada causa **sin tocar una línea de código**, solo variando el entorno:

| Experimento | Comando | Resultado |
|---|---|---|
| **EXP-1** — añadir `STRIPE_SECRET_KEY=sk_test_ci` | `pytest tests/test_billing_api.py` | **14 passed** (los 6 fallos del grupo A desaparecen) |
| **EXP-2** — alinear `DB_NAME=sphere_db` con lo que leen los tests | `pytest tests/test_stripe_webhooks.py` | **4 passed** (los 3 fallos del grupo C desaparecen) |
| **EXP-3** — ambas condiciones, suite completa | `pytest tests/ -q` | **1 failed, 316 passed** — solo queda `test_ci_infra` |

Esto prueba que el código de producto no interviene en 9 de los 10 fallos, y que el décimo es
una aserción obsoleta sobre un fichero YAML.

> Nota: `DB_NAME=sphere_db` es **diagnóstico, no la solución propuesta** — anularía el
> aislamiento de la base de test. La corrección va en los tests (ver más abajo).

---

## Los 10 fallos, uno a uno

### Grupo A — `test_billing_api.py` (6 fallos): Stripe no configurado en CI

Todos devuelven **503** donde se espera 200 o 403.

| Test | Espera | Obtiene |
|---|---|---|
| `test_create_checkout_session` | 200 | 503 |
| `test_create_portal_session` | 200 | 503 |
| `TestTopupSKUValidation::test_user_can_purchase_valid_sku_executive` | 200 | 503 |
| `TestTopupSKUValidation::test_user_can_purchase_valid_sku_director` | 200 | 503 |
| `TestTopupSKUValidation::test_user_cannot_purchase_invalid_sku` | 403 | 503 |
| `TestTopupSKUValidation::test_legacy_sku_topup_premium_rejected` | 403 | 503 |

**Causa raíz.** `backend/app/presentation/api/v1/billing.py:24-29` (y su gemelo en `:58-63`):

```python
if not settings.stripe_configured:
    raise billing_error(ErrorCode.BILLING_STRIPE_ERROR, 503, "Los pagos no están disponibles...")
```

`ci.yml` no exporta `STRIPE_SECRET_KEY` → `stripe_configured` es `False` → el guard corta la petición
**antes** de que los mocks de `StripeClient` lleguen a usarse y antes de la validación de catálogo
(`billing.py:32`). Por eso incluso los dos tests que esperan 403 reciben 503.

**Culpable: ENTORNO DE CI.** El guard es correcto y deseable en producción (503 explícito en vez de
un 500 críptico). El fallo es que el workflow no da al backend un entorno donde los pagos existan.

**Arreglo propuesto.** Añadir al bloque `env:` del job `test-backend`:

```yaml
STRIPE_SECRET_KEY: sk_test_ci
STRIPE_WEBHOOK_SECRET: whsec_ci
```

Valores falsos: toda llamada real a Stripe está mockeada en los tests, y `stripe.api_key` solo se
asigna en import (`webhooks.py:18`). Verificado que **ningún** test en verde depende de que Stripe
esté sin configurar: los tres `test_stripe_configured_false_*` construyen `Settings(...)` con kwargs
explícitos, que ganan a la env var; `test_billing_me_includes_stripe_configured` solo comprueba que
el campo sea `bool`. Los únicos tests que esperan 503 son de Firebase (`test_firebase.py:91`), ajenos.

**Alternativa descartada.** Mover la validación de catálogo (403) *antes* del guard de Stripe (503),
para que un SKU inexistente devuelva 403 aunque los pagos estén caídos. Es semánticamente más
correcto (un producto que no existe no existe con Stripe caído o no), pero cambia el comportamiento
de un endpoint de pago en producción y no arregla los 4 tests que esperan 200. Merece una nota
aparte, no mezclarlo con el arreglo de CI.

**Riesgo: BAJO.** Solo se toca `.github/workflows/ci.yml`. Cero impacto en el artefacto desplegado.
Único matiz: si algún día se añade un test que llame a Stripe de verdad, fallará con clave falsa —
que es el comportamiento deseado.

---

### Grupo B — `test_ci_infra.py::test_ci_yml_triggers_on_push_and_pr_to_main` (1 fallo)

`AssertionError: assert 'main' in ['feat/**']` en `backend/tests/test_ci_infra.py:39`.

**Causa raíz.** El test exige que el workflow dispare en la rama `main`. La única rama del repo es
`master` (`git branch -a`: `master`, `redesign/visual-identity-v3`, `origin/HEAD -> origin/master`).
El workflow apunta deliberadamente a `pull_request: [master]` + `push: ['feat/**']`.

**El test está obsoleto, y lo prueba la historia de git:**

- `65f91bd` creó **a la vez** `ci.yml` (apuntando a `main`) y `test_ci_infra.py`.
- `0c77f8a` ("ci: activar el pipeline y arreglar el typecheck no-op") corrigió `ci.yml` a
  `master`/`feat/**` — y su `--stat` muestra **un único fichero tocado**: `.github/workflows/ci.yml`.
  El test se quedó atrás.

La decisión de no disparar en push a `master` está razonada en la cabecera de `ci.yml`: hacerlo
provocó deploys SKIPPED en Railway (`1867ff4`). La puerta de calidad se conserva vía PR contra
`master` + push a `feat/**`.

**Culpable: EL TEST.** El código es correcto y está documentado.

**Arreglo propuesto.** Reescribir el test para que valide la **intención** en vez de un literal:
renombrarlo (p. ej. `test_ci_yml_triggers_on_pr_to_default_branch_and_feature_pushes`) y afirmar que
(a) existen los dos triggers, (b) `pull_request.branches` contiene la rama por defecto real del repo
y (c) `push.branches` cubre las ramas de desarrollo. Nada de `main` hardcodeado.

**Alternativa descartada.** Cambiar `ci.yml` para incluir `main`: añadiría un trigger a una rama que
no existe (ruido puro) y, si se añadiera `master` al `push`, reintroduciría el incidente de los
deploys SKIPPED. Es exactamente la trampa de "arreglar el código para contentar al test".

**Riesgo: NULO para producción.** Solo se toca un fichero de test. El riesgo real es el opuesto: si
se "arregla" tocando `ci.yml`, se rompe el deploy.

---

### Grupo C — `test_stripe_webhooks.py` (3 fallos): los tests miran otra base de datos

| Test | Síntoma |
|---|---|
| `test_stripe_webhook_idempotency_and_success` | `assert 'already processed' == 'success'` |
| `test_topup_grant_idempotent_on_retry` | `assert 0 == 50` |
| `test_malformed_checkout_goes_to_dead_letter` | `assert None is not None` |

**Causa raíz — hipótesis del orquestador CONFIRMADA.**

- Los tests leen `db_instance.get_sync_client()["sphere_db"]` con el nombre **hardcodeado**:
  `tests/test_stripe_webhooks.py:34`, `:66`, `:137`.
- La app escribe en `db.get_sync_client()[settings.DB_NAME]` → `webhooks.py:105`. En CI, `sphere_test`.

Test y producto operan sobre **bases distintas**. Los `delete_many` de limpieza son no-ops y las
aserciones leen una base donde la app nunca escribe.

**Prueba directa** (inspección de Mongo tras la suite):

```
--- sphere_db  --- colecciones: ['credit_transactions', 'users']
--- sphere_test --- colecciones: ['board_actas', 'contacts', 'credit_transactions', 'custom_agents',
                                  'failed_payments', 'oauth_states', 'sessions_metadata',
                                  'stripe_events_processed', 'user_agent_overrides',
                                  'user_oauth_apps', 'users']
```

`sphere_db` **ni siquiera tiene** `stripe_events_processed` ni `failed_payments`: son colecciones que
solo crea la app, y la app nunca escribe ahí. Las únicas dos colecciones de `sphere_db` las crearon
los propios tests. EXP-2 lo remata: alineando `DB_NAME`, los 4 tests del fichero pasan sin tocar código.

Detalle por test:
- **idempotency**: falla en el *primer* POST con `already processed` porque `evt_test_123` quedó
  `status: done` en `sphere_test` de un run anterior (la limpieza borró de `sphere_db`). En una base
  virgen fallaría una línea más abajo (`events_col.find_one(...) is not None`, línea 48). El fallo es
  el mismo en ambos casos.
- **topup idempotente**: el usuario se inserta en `sphere_db`; el webhook lo busca en `sphere_test`,
  no lo encuentra, y el `$inc` no impacta nada. El test lee `sphere_db` → 0.
- **dead letter**: `failed_payments` se escribe en `sphere_test` (verificado: 2 documentos con
  `reason: missing_user_id_or_plan_id`). El test lo busca en `sphere_db` → `None`.

**Culpable: EL TEST.** El producto se comporta correctamente en las tres rutas.

**Arreglo propuesto.** Sustituir el literal por la configuración real en los 5 puntos del suite:

```python
from app.core.config import settings
dbc = db_instance.get_sync_client()[settings.DB_NAME]
```

Mejor aún: una fixture compartida en `tests/conftest.py` (p. ej. `sync_db`) que devuelva
`db_instance.get_sync_client()[settings.DB_NAME]`, de modo que el literal no pueda reaparecer.

**Alternativa descartada.** Poner `DB_NAME=sphere_db` en CI para que coincidan. Hace pasar los tests
y además destruye el aislamiento: la base de test pasaría a llamarse igual que la de producción por
defecto. Es la opción que convierte un rojo honesto en un verde peligroso.

**Riesgo: BAJO** para producción (solo ficheros de test), pero el arreglo es **obligatorio antes de
tocar nada más**: mientras el literal siga ahí, la suite no está observando el producto.

---

## Test verde que MIENTE (lo más grave del informe)

`backend/tests/test_billing_api.py:168` — `TestWebhookInvalidSKU::test_webhook_invalid_sku_grants_no_credits`

```python
db_sync = db_instance.get_sync_client()["sphere_db"]   # ← misma base equivocada
```

**Este test pasa en verde y no puede fallar nunca.** Inserta el usuario en `sphere_db`, dispara el
webhook (que opera sobre `sphere_test`) y luego afirma sobre `sphere_db`:

```python
assert user["wallet"]["topup_messages_balance"] == 0
assert tx_count == 0, "Se crearon N transacciones de top-up inesperadas"
```

Como la app **jamás** escribe en `sphere_db`, ninguna conducta del webhook puede mover esos valores.
El test afirma "el webhook no otorga créditos con un SKU inválido" comprobando una base de datos que
el webhook no toca. Si mañana alguien rompiera `validate_topup_tier` y el webhook regalase créditos
por un SKU inexistente, **este test seguiría en verde**.

Es el mismo patrón que ya mordió en el frontend (el test que reproducía la forma inventada de la
respuesta de documentos). La diferencia: aquí el test custodia una ruta de **dinero**.

**Arreglo.** El mismo cambio a `settings.DB_NAME`. Y tras cambiarlo, verificar que el test sigue
pasando **por el motivo correcto** — se recomienda comprobarlo con una mutación temporal deliberada
(romper `validate_topup_tier` en local y confirmar que el test se pone rojo). Un test de dinero que
no se ha visto fallar nunca no está verificado.

**Riesgo si NO se arregla: ALTO.** Es una cobertura fantasma sobre concesión de créditos.

---

## Bug real de producto descubierto de camino

**Grant reclamado para un usuario inexistente: el cliente paga, la transacción se registra, los
créditos no llegan, y no hay dead-letter.**

`backend/app/presentation/api/v1/webhooks.py:182-203` (top-up) y `:162-181` (suscripción):

```python
elif mode == "payment":
    user_doc = users_col.find_one({"firebase_uid": user_id})
    if user_doc and not validate_topup_tier(user_doc, plan_id):
        ...rechazar...
    else:
        if _claim_grant(transactions_col, {...}):   # ← reclama SIEMPRE
            _grant_topup(users_col, user_id, plan_id)
```

Y `_grant_topup` (`:80-83`) hace `users_col.update_one(...)` **sin comprobar `matched_count`**
(verificado: la palabra `matched_count` no aparece en todo el fichero). Lo mismo en
`_grant_subscription` (`:71`).

Consecuencia si el perfil del usuario no existe (cuenta borrada, carrera con el auto-provisioning,
`client_reference_id` de otro entorno):

1. `_claim_grant` inserta la transacción con `stripe_event_id` único → el evento queda **reclamado**.
2. `update_one` no encuentra a nadie → **no-op silencioso**.
3. El reintento de Stripe choca con el `DuplicateKeyError` → **nunca se compensa**.
4. No entra en `failed_payments`: el dead-letter (`:150-161`) solo cubre "falta `user_id` o `plan_id`",
   no "el usuario no existe" ni "el update no impactó ningún documento".

**Evidencia en la base de datos real** tras la suite:

```
user test_topup_idem_user en sphere_test: None
credit_transactions de ese user: [{'delta': 50, 'reason': 'topup_purchase',
                                   'stripe_event_id': 'evt_topup_idem_1'}]
```

Transacción de 50 créditos reclamada contra un usuario que no existe. Exactamente el escenario.

Un segundo efecto: cuando `user_doc` es `None`, la rama `if user_doc and not validate_topup_tier(...)`
es falsa y **la validación de catálogo se salta por completo**. Hoy no infla créditos porque
`_grant_topup` corta con `topup_messages_map.get(plan_id, 0) <= 0`, pero la defensa depende de un
segundo guard, no del previsto.

**Culpable: EL PRODUCTO.** No causa ninguno de los 10 rojos — es un hueco que la suite no observa.

**Arreglo propuesto.** Comprobar el resultado de la escritura y mandar a `failed_payments` cuando no
impacte: que `_grant_topup` / `_grant_subscription` devuelvan `result.matched_count`, y si es 0,
registrar en el dead-letter con `reason: "user_not_found"` (idealmente en la misma transacción lógica
que el claim, o compensando el claim). Alternativa más conservadora: validar `user_doc is not None`
antes de `_claim_grant` y mandar al dead-letter si falta, sin tocar la lógica de claim.

**Riesgo: MEDIO.** Toca la ruta de dinero en producción. Debe ir en su propio cambio, con test que
falle primero (TDD, `strict_tdd: true` en `openspec/config.yaml`), y **después** de arreglar el
literal de la base de datos — si no, el test nuevo tampoco observaría nada.

**Estado: confirmado por lectura de código + inspección de datos. Falta confirmar la frecuencia real
en producción** (consulta a la base real: transacciones con `stripe_event_id` cuyo `user_id` no
exista en `users`). No se puede verificar desde el repo.

---

## Otros riesgos inventariados

| # | Riesgo | Fichero | Severidad | Estado |
|---|---|---|---|---|
| R1 | Tests escriben en `sphere_db`, el **default de producción**. Si alguien corre pytest con `MONGODB_URL` apuntando a producción, los `delete_many` / `insert_one` impactan la base real, **ignorando el pretil de `DB_NAME=sphere_test`**. | `test_credit_manager.py:10`, `test_stripe_webhooks.py:34,66,137`, `test_billing_api.py:168` | **Alta** | Confirmado |
| R2 | `/api/v1/ready` (sin auth) devuelve `str(e)` de excepciones de Mongo/Redis. Los errores de PyMongo suelen incluir host y, según la URI, credenciales. | `health.py:39-41,53-55` | Media | Confirmado por lectura; falta reproducir una excepción real con URI con credenciales |
| R3 | `test_stripe_webhook_idempotency_and_success` no prueba lo que su nombre dice: el evento mock no lleva `mode` ni `metadata.plan_id`, así que recorre la **ruta de dead-letter**, no la de alta de suscripción. Verificado: `failed_payments` contiene `evt_test_123` con `reason: missing_user_id_or_plan_id`. Aun arreglando la base, la ruta de grant sigue sin cobertura. | `test_stripe_webhooks.py:6-18` | Media | Confirmado |
| R4 | `VITE_FIREBASE_API_KEY` literal en `frontend/Dockerfile:17`. Las claves web de Firebase son públicas por diseño, así que **no es una fuga**; la protección real son las reglas de seguridad y los dominios autorizados. Se anota para que no se confunda con un secreto en futuras auditorías. | `frontend/Dockerfile:17` | Baja / informativa | Confirmado |
| R5 | `auth`: la cobertura es buena. `admin.py` protege sus 4 rutas con `require_admin` (que a su vez depende de `get_current_user`). `agents.py` deja sin auth solo `/templates` y `/templates/{id}` (catálogo estático, sin datos de usuario). `webhooks.py` no usa `get_current_user` **correctamente**: Stripe valida por firma y n8n por HMAC, y `verify_n8n_signature` rechaza explícitamente si falta el secreto (`webhooks.py:312-318`) en vez de firmar con clave vacía. | — | Sin hallazgo | Verificado |
| R6 | El pin de pytest es frágil: `pytest.ini` filtra `ignore::pytest.PytestRemovedIn9Warning`, atributo **inexistente en pytest ≥ 9.1**. Con un pytest más nuevo la suite revienta antes de recolectar. CI se salva solo porque `requirements.txt` está pinneado. | `backend/pytest.ini:7` | Media | Confirmado |

---

## Enfoques

1. **Arreglo mínimo por capas (recomendado)** — tres commits independientes, cada uno verificable.
   1. `ci.yml`: añadir `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` falsas → −6 fallos.
   2. Tests: sustituir `["sphere_db"]` por `[settings.DB_NAME]` vía fixture en `conftest.py`, en los
      **5** puntos (incluido el test verde que miente) → −3 fallos y se elimina la cobertura fantasma.
   3. `test_ci_infra.py`: reescribir la aserción de ramas contra la intención documentada → −1 fallo.
   - Pros: cada paso es reversible por separado; ningún cambio toca el artefacto de producción; ya
     está empíricamente validado (EXP-1/2/3).
   - Contras: no cierra el bug de producto (deliberado: va en otro cambio).
   - Esfuerzo: **Bajo**.

2. **Un único commit "CI en verde"** — mismos cambios, todos juntos.
   - Pros: una sola PR, muy por debajo del presupuesto de 400 líneas.
   - Contras: mezcla infraestructura, higiene de tests y corrección de una mentira en verde; si algo
     se tuerce, el rollback se lleva las tres cosas.
   - Esfuerzo: **Bajo**.

3. **Silenciar / marcar `xfail` los 10 fallos** — descartado de plano.
   - Pros: rojo apagado en minutos.
   - Contras: convierte un rojo honesto en un verde falso justo sobre la ruta de pagos, que es el
     escenario que este informe existe para evitar.
   - Esfuerzo: Bajo. **No hacer.**

---

## Recomendación

**Enfoque 1**, en ese orden exacto, y con el paso 2 **antes** que cualquier trabajo sobre el webhook:
mientras los tests lean `sphere_db`, cualquier test nuevo que se escriba sobre Stripe nacerá ciego.

El bug de producto (grant huérfano) debe ir en un **cambio SDD aparte**, con TDD estricto
(`strict_tdd: true`) y su propia evaluación de riesgo, porque toca dinero en producción. No mezclarlo
con el saneamiento de CI.

Tras el paso 2, validar que `TestWebhookInvalidSKU` pasa **por el motivo correcto**, rompiendo
`validate_topup_tier` en local a propósito y confirmando que se pone rojo. Sin esa comprobación,
seguiríamos sin saber si el test observa algo.

---

## Riesgos del cambio propuesto

- **Ninguno de los tres pasos toca código de producción**: solo `.github/workflows/ci.yml` y
  ficheros bajo `backend/tests/`. El artefacto desplegado no cambia.
- Riesgo de **rebote**: al alinear `settings.DB_NAME`, tests que hoy pasan por coincidencia contra
  `sphere_db` pueden ponerse rojos (candidato: `test_credit_manager.py`, que se auto-inyecta el
  handle y debería seguir consistente, pero hay que confirmarlo en la ejecución completa). Ese rojo
  sería **señal legítima recuperada**, no una regresión.
- Riesgo de **contaminación entre tests**: la suite comparte una base sin limpieza global entre
  ficheros (`clean_test_data` es opt-in y solo borra por `user_id`/`owner_user_id`). Al unificar
  todo en `sphere_test` aumenta la interdependencia. Vigilar tests dependientes del orden; si
  aparecen, la mitigación es limpieza por fixture, no volver al literal.
- Tocar `ci.yml` para "arreglar" el grupo B **reintroduciría los deploys SKIPPED de `1867ff4`**. La
  corrección va en el test. Esto debe quedar escrito en la propuesta para que no se revierta.
- El fix del bug de producto (fuera de este alcance) sí es de riesgo medio: modifica la ruta de
  concesión de créditos.

---

## Listo para propuesta

**Sí.** Diagnóstico cerrado con evidencia experimental para 9 de los 10 fallos y evidencia
documental (historia de git) para el décimo. Alcance recomendado para `backend-ci-verde`:
los tres pasos del Enfoque 1. El bug del webhook y el endurecimiento de `/ready` (R2) se proponen
como cambios separados.

Pregunta abierta única para el dueño: **¿el arreglo del grant huérfano entra en este cambio o va
aparte?** La recomendación es aparte, por ser la única parte que toca producción.
