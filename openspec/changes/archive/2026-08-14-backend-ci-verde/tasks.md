# Tasks: backend-ci-verde

## Review Workload Forecast

Líneas estimadas: 150–220. Split sugerido: PR único, 4 commits autónomos. Delivery: ask-on-risk.

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

Restricción dura: **ninguna tarea toca `backend/app/**`**. Si una lo requiriese → bloqueada.
Nunca ejecutar builds. Conventional commits, sin atribución de IA.

## Fase 1 — Resolver la base vía `settings.DB_NAME` (commit 1)

- [x] 1.1 `backend/tests/conftest.py`: añadir fixture function-scope `sync_db(db_instance)` que devuelve el callable `lambda: db_instance.get_sync_client()[settings.DB_NAME]` (D1).
- [x] 1.2 `backend/tests/test_credit_manager.py:8-10`: borrar la fixture local `sync_db` (sombrea la de conftest) y pasar a `CreditManager(sync_db())`.
- [x] 1.3 `backend/tests/test_stripe_webhooks.py:34,66,137`: literal `"sphere_db"` → `sync_db()`.
- [x] 1.4 `backend/tests/test_billing_api.py:168`: literal → `sync_db()`.
- [x] 1.5 RED esperado: los rebotes al ejecutar la suite (candidato `test_credit_manager`) son señal recuperada. Arreglar el test, nunca reponer el literal.
- [x] 1.6 `test_billing_api.py:216-222`: contador de transacciones filtrado por `{"stripe_event_id": "evt_invalid_sku_topup"}` en vez de `{user_id, balance_source}`; conservar `topup_messages_balance == 0` (D3).
- [x] 1.7 `test_billing_api.py` (~160-222): limpieza previa y `finally` de `credit_transactions`/`stripe_events_processed` para ese `event_id` (estilo `test_stripe_webhooks.py:127-130`).
- [x] 1.8 Comprobar `grep -rn '"sphere_db"' backend/tests/` → solo `test_stream_billing.py:49,58` (MagicMock).

## Fase 2 — Verificación por mutación del SKU (sin commit)

- [x] 2.1 RED artificial: degradar a mano `validate_topup_tier` (`app/.../plan_limits.py:66-73`) para devolver `True` siempre.
- [x] 2.2 Ejecutar `TestWebhookInvalidSKU::test_webhook_invalid_sku_grants_no_credits`: MUST fallar en el contador por `stripe_event_id`. Si sigue verde, volver a 1.6.
- [x] 2.3 Revertir la mutación (`git checkout --` del fichero) y confirmar verde. La mutación **no se commitea**; `backend/app/**` queda intacto en el diff.

## Fase 3 — Pretil de aislamiento (commit 2)

- [x] 3.1 RED: lanzar la suite con `DB_NAME=sphere_db` y comprobar que hoy **no** aborta.
- [x] 3.2 `backend/tests/conftest.py`: tras `load_dotenv` (L23) y antes de cualquier import de `app`, `os.environ.setdefault("DB_NAME", "sphere_test")`.
- [x] 3.3 `backend/tests/conftest.py`: `pytest_configure(config)` que lee `settings.DB_NAME` y si `"test" not in name.lower()` lanza `pytest.UsageError` con valor rechazado, motivo y `export DB_NAME=sphere_test` (D2).
- [x] 3.4 GREEN: repetir 3.1 → exit code 4, 0 tests, sin resumen.

## Fase 4 — Credenciales Stripe falsas en CI (commit 3)

- [x] 4.1 RED: en `backend/tests/test_ci_infra.py::test_ci_yml_backend_env_vars` (L71-83), asertar `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` presentes, no vacíos, sin `${{`, con prefijo `sk_test_`/`whsec_`. Debe fallar.
- [x] 4.2 GREEN: `.github/workflows/ci.yml`, `env:` del job `test-backend` (tras L47): `STRIPE_SECRET_KEY: sk_test_ci`, `STRIPE_WEBHOOK_SECRET: whsec_ci`, `SPHERE_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}`.

## Fase 5 — Intención de los triggers (commit 4)

- [x] 5.1 `backend/tests/test_ci_infra.py:27-44`: sustituir `test_ci_yml_triggers_on_push_and_pr_to_main` por `test_ci_yml_merge_gate_targets_default_branch` (cadena `SPHERE_DEFAULT_BRANCH` → `git symbolic-ref --short refs/remotes/origin/HEAD` → `pytest.skip`). Sin literal `main`/`master`.
- [x] 5.2 Añadir `test_ci_yml_push_never_covers_merge_gate_branches`: `push.branches` no vacío y ningún patrón cubre (`fnmatch`) ninguna entrada de `pull_request.branches`.
- [x] 5.3 RED de control: añadir `master` a `push.branches` en local → ambos tests rojos; añadir `hotfix/**` → verdes. Revertir `ci.yml`, no commitear el experimento.

## Fase 6 — Verificación final

- [x] 6.1 Suite completa:
  `cd backend && MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci /tmp/claude-1000/-home-jarvis-code-SPHERE/547aee8f-16bd-43c9-9f66-4f13b1f9915f/scratchpad/vci/bin/python -m pytest tests/ -q`
  Criterio: **317 passed, 0 failed**. Sin `skip`/`xfail` nuevos.
- [x] 6.2 Repetir 6.1 con `DB_NAME=sphere_db`: exit code 4, 0 tests, mensaje con remedio.
- [x] 6.3 `git diff --name-only` no lista nada bajo `backend/app/`.

## Fase 7 — Cierre de reservas de verify (commit 5)

- [x] 7.1 `backend/tests/test_ci_infra.py`: añadir `import pytest` (DEFECTO-1 / F821). RED reproducido con
  un shim de `git` que devuelve `rc=128` como `actions/checkout` (`NameError: name 'pytest' is not defined`,
  exit 1) y con un checkout real estilo `actions/checkout` (`git init` + `fetch --depth=1` + `checkout
  FETCH_HEAD`); GREEN: `1 skipped`, exit 0, y `21 passed, 1 skipped` en ese checkout.
- [x] 7.2 `resolve_default_branch()`: **decidido NO tocar la lógica** (DEFECTO-2). Evidencia: `rc != 0` ya
  devuelve `None`, así que el `rc=128` de `actions/checkout` termina en el skip previsto en cuanto existe el
  import — la excepción la causaba solo DEFECTO-1. La otra mitad del defecto (un `clone --single-branch`
  devuelve la rama clonada) **no es distinguible sin red**: este repo es shallow *y* single-branch
  (`+refs/heads/master:refs/remotes/origin/master`) y sí acierta, de modo que los dos discriminadores offline
  candidatos (`--is-shallow-repository`, refspec single-branch) darían falso positivo y silenciarían el test
  justo donde hoy funciona. Se documenta la limitación en el docstring; la garantía la da
  `SPHERE_DEFAULT_BRANCH`, que el workflow exporta siempre.

## Notas de ejecución (fase apply)

Dos correcciones al criterio escrito en 6.1, ninguna opcional:

1. **El total es 318, no 317.** D4 sustituye un test por **dos**
   (`merge_gate_targets_default_branch` + `push_never_covers_merge_gate_branches`),
   así que 317 → 318. Resultado real: **318 passed, 0 failed**. Sin `skip` ni `xfail`.
2. **El comando de 6.1 no reproduce el entorno de CI**: le faltan `STRIPE_SECRET_KEY` y
   `STRIPE_WEBHOOK_SECRET`, que son justo lo que añade la fase 4 al `env:` del job. Sin ellas,
   `stripe_configured` es `False` y 6 tests de `test_billing_api.py` caen con 503 (**6 failed,
   312 passed**) — el fallo de entorno original, no una regresión. Comando correcto:

   ```
   cd backend && MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test \
   REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development \
   OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci \
   STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci \
   <venv>/bin/python -m pytest tests/ -q
   ```

Hallazgo extra en 1.5 (el «rebote» previsto): `test_topup_grant_idempotent_on_retry` creaba el
índice único **antes** de limpiar, y en `sphere_test` había **dos** transacciones huérfanas de
`evt_topup_idem_1` (con `user_id` inexistente) de runs anteriores → `DuplicateKeyError` al construir
el índice. Se reordenó limpieza-antes-de-índice. Esas dos transacciones son evidencia física del bug
de **grant huérfano** documentado en `exploration.md`, que sigue fuera de alcance (toca `app/**`).
