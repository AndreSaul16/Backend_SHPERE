# Verify Report: backend-ci-verde

> Fase SDD: verify. Modo: Standard (no hay `strict_tdd` activo).
> Rama verificada: `feat/backend-ci-verde` @ `55e4fbe`, 4 commits sobre `master`.
> Todo lo afirmado abajo se ejecutó en esta sesión. Lo no ejecutable se marca **NO VERIFICABLE**.

## Entorno de ejecución

```
cd /home/jarvis/code/SPHERE/Frontend_SPHERE/backend
MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 \
ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci \
STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci \
<venv>/bin/python -m pytest tests/ -q
```

pytest 9.0.3, pytest-asyncio 1.3.0. Sin `pytest-randomly` ni `pytest-xdist` instalados.

## Completeness

| Métrica | Valor |
|---|---|
| Tareas totales | 20 |
| Completadas `[x]` | 20 |
| Incompletas | 0 |

## Matriz de cumplimiento escenario a escenario

| # | Requisito | Escenario | Veredicto | Evidencia |
|---|---|---|---|---|
| S1 | Resolución de la base vía configuración | La fixture apunta a la base que usa la app | **CUMPLE** | E-1 |
| S2 | Resolución de la base vía configuración | No quedan literales | **CUMPLE** | E-2 |
| S3 | Pretil de aislamiento | Base de producción por defecto | **CUMPLE** | E-3 |
| S4 | Pretil de aislamiento | Base de test válida | **CUMPLE** | E-4 |
| S5 | Pretil de aislamiento | Dev local sin `DB_NAME` | **CUMPLE** | E-5 |
| S6 | Cobertura de SKU | Verde por el motivo correcto | **CUMPLE** | E-6 |
| S7 | Cobertura de SKU | Mutación — el test MUST ponerse rojo | **CUMPLE** | E-7 |
| S8 | Entorno del job `test-backend` | Facturación alcanzable en CI | **CUMPLE** | E-8 |
| S9 | Entorno del job `test-backend` | Claves falsas, no secretos | **CUMPLE** | E-9 |
| S10 | Intención de los triggers | Puerta de merge presente | **CUMPLE** | E-10 |
| S11 | Intención de los triggers | Verificación continua | **CUMPLE** | E-11 |
| S12 | Intención de los triggers | La rama por defecto nunca dispara por push | **CUMPLE** | E-12 |
| S13 | Intención de los triggers | Añadir otro patrón no rompe el test | **CUMPLE** | E-13 |
| S14 | `test-backend` termina en verde | Suite completa sin fallos | **CUMPLE en local / NO VERIFICABLE en CI** | E-14 |

**Resumen: 14/14 escenarios cumplen en local. 1 de ellos (S14) no es verificable en el runner de GitHub desde este entorno.**

---

## Evidencia

### E-1 — La fixture resuelve la base real

`backend/tests/conftest.py` define `sync_db` como callable (`lambda: db_instance.get_sync_client()[settings.DB_NAME]`).
Usada en `test_credit_manager.py` (28 llamadas), `test_stripe_webhooks.py:34,66,140` y `test_billing_api.py:168`.

Prueba de que apunta a la base que escribe el webhook: bajo mutación (E-7) el test **leyó** la transacción que el
webhook acababa de escribir en `settings.DB_NAME`. Si la fixture apuntara a otra base, la mutación habría pasado
inadvertida.

Estado real de Mongo tras las corridas:
```
sphere_test -> 11 colecciones (las que escribe la app)
sphere_db   -> 11 colecciones, intactas (ver E-3)
```

### E-2 — No quedan literales en accesos reales

```
$ grep -rn "sphere_db\|sphere_test" backend/tests/
test_stream_billing.py:49:    mock_db.get_sync_client.return_value = {"sphere_db": MagicMock()}
test_stream_billing.py:58:    mock_settings.DB_NAME = "sphere_db"
conftest.py:29:   # (comentario)
conftest.py:30:   os.environ.setdefault("DB_NAME", "sphere_test")
conftest.py:51:   # (texto del mensaje de remedio)
conftest.py:311:  from app.infrastructure.database import db as sphere_db   # alias de variable, no base
test_ci_infra.py:162: assert env.get("DB_NAME") == "sphere_test"          # contrato de ci.yml, no acceso a Mongo
```
Los dos únicos literales en código de test son `MagicMock` sin acceso real, tal y como admite la spec.

### E-3 — Pretil con `DB_NAME=sphere_db`

```
$ DB_NAME=sphere_db ... pytest tests/ -q
ERROR: DB_NAME='sphere_db' rechazado: no parece una base de test (su nombre no contiene 'test').
La suite borra e inserta documentos, así que se niega a correr fuera de una base desechable.
Remedio: export DB_NAME=sphere_test
EXIT=4
```
- Exit code **4** → distinto de 0 y de 1. ✔
- **0 tests ejecutados, sin resumen** (ni `collected`, ni `passed/failed`). ✔ Confirmado también con `--collect-only`: mismo exit 4.
- Mensaje con **valor rechazado** (`'sphere_db'`), **motivo** ("no parece una base de test") y **remedio exacto** (`export DB_NAME=sphere_test`). ✔
- **Ninguna colección tocada**: conteos de `sphere_db` idénticos antes y después:
  ```
  ANTES:   [('board_actas',1),('contacts',0),('credit_transactions',17),('custom_agents',0),
            ('failed_payments',2),('oauth_states',1),('sessions_metadata',0),
            ('stripe_events_processed',0),('user_agent_overrides',0),('user_oauth_apps',0),('users',7)]
  DESPUES: idéntico
  ```

Variante `DB_NAME=produccion`: mismo comportamiento, exit 4, mensaje con `'produccion'`. ✔

Vectores de evasión probados (RD-1), mejores de lo documentado:
- Lanzado **desde la raíz del repo** (`pytest backend/tests/...`): el pretil **también dispara**, exit 4.
- `--noconftest`: no escribe nada — 12 `errors` por fixture ausente, exit 1. No es una vía de escritura real.
- `DB_NAME=latest_db`: **pasa el pretil** (22 passed). RD-3 confirmado y aceptado por diseño.

### E-4 — `DB_NAME=sphere_test`

`318 passed in 8.84s`, exit 0, sin error de pretil.

### E-5 — Sin `DB_NAME` en el entorno

`env -u DB_NAME ... pytest tests/ -q` → `318 passed`, exit 0.
No existe `/home/jarvis/code/SPHERE/.env`, así que el valor viene del `setdefault`. Resolución comprobada
aislando la secuencia de `conftest.py`: `DB_NAME resuelto = sphere_test`. En ningún caso opera sobre producción. ✔

### E-6 — SKU: verde por el motivo correcto

```
$ pytest tests/test_billing_api.py::TestWebhookInvalidSKU -q
1 passed in 2.57s
```
Sus aserciones leen `db_sync = sync_db()`, es decir `settings.DB_NAME`. ✔

### E-7 — SKU: la mutación pone el test ROJO (prueba de fuego)

Mutación aplicada a `backend/app/core/plan_limits.py:73`:
`return topup_plan_id in PURCHASABLE_SKUS` → `return True`.

```
$ pytest tests/test_billing_api.py::TestWebhookInvalidSKU::test_webhook_invalid_sku_grants_no_credits -q
E   AssertionError: Se crearon 1 transacciones de top-up inesperadas para el evento
E   evt_invalid_sku_topup: el SKU inválido reclamó un grant
E   assert 1 == 0
tests/test_billing_api.py:229: AssertionError
1 failed in 3.88s   EXIT=1
```

**La cobertura es real, no fantasma.** Además queda confirmada la predicción de D3: el fallo se produce en el
contador por `stripe_event_id` (línea 229) y **no** en la aserción de saldo (línea 214), que pasó — el segundo
guard de `_grant_topup` (`topup_messages_map.get(plan_id,0) <= 0`) absorbe el `$inc`. Anclar al claim del evento
era necesario, no cosmético.

Reversión y limpieza:
```
$ grep -n "return topup_plan_id in PURCHASABLE_SKUS" app/core/plan_limits.py
73:    return topup_plan_id in PURCHASABLE_SKUS
$ git status --porcelain
 M .atl/skill-registry.md      <- preexistente, fuera de backend/
?? VISUAL_CHECK.md             <- preexistente
?? VISUAL_CHECK_2.md           <- preexistente
?? openspec/changes/backend-ci-verde/
?? openspec/config.yaml
$ git diff --stat -- backend/app/
(vacío)
$ pytest tests/test_billing_api.py::TestWebhookInvalidSKU -q  ->  1 passed
```
`backend/app/**` y `backend/tests/**` quedan limpios. ✔

### E-8 — Facturación alcanzable en CI

Con las claves del `env:` del job: `tests/test_billing_api.py` → **14 passed**, ningún 503.
Contrafactual (mismo comando sin `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`): **6 failed, 8 passed**.
Los tests de SKU inválido asertan 403 explícitamente (`test_billing_api.py:132` y `:150`). ✔

### E-9 — Claves falsas, no secretos

`.github/workflows/ci.yml`, `env:` del job `test-backend`:
```yaml
      STRIPE_SECRET_KEY: sk_test_ci
      STRIPE_WEBHOOK_SECRET: whsec_ci
      SPHERE_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}
```
Literales en claro, sin `${{ secrets.* }}`. `test_ci_yml_backend_env_vars` (`test_ci_infra.py:171-186`) asegura
presencia, no-vacío, ausencia de `${{` y prefijos `sk_test_` / `whsec_`. ✔

### E-10 / E-11 — Puerta de merge y verificación continua

`ci.yml`: `pull_request.branches: [master]`, `push.branches: ['feat/**']`.
`git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/master` (rama por defecto real).
`grep -n "main" backend/tests/test_ci_infra.py` → **sin resultados**: no hay literal de rama. ✔

### E-12 / E-13 — Matriz de triggers (simulada, `ci.yml` sin tocar)

Ejercitados los dos tests contra `ci.yml` sintéticos sustituyendo `read_ci_yml` en memoria
(`/tmp/verify_triggers.py`; el `ci.yml` del repo no se modificó — `git status` lo confirma):

| Caso | `push.branches` | `merge_gate_targets_default_branch` | `push_never_covers_merge_gate_branches` |
|---|---|---|---|
| A baseline | `['feat/**']` | PASS | PASS |
| B **+ patrón extra** | `['feat/**','hotfix/**']` | **PASS** | **PASS** |
| C **master en push** | `['feat/**','master']` | **FAIL** | **FAIL** |
| D comodín `*` | `['*']` | **FAIL** | **FAIL** |
| E comodín `**` | `['**']` | **FAIL** | **FAIL** |
| F push vacío | `[]` | PASS | **FAIL** |

El invariante que protege contra los deploys SKIPPED de `1867ff4` **existe y muerde**: `master`, `*` y `**` ponen
en rojo ambos tests. Añadir `hotfix/**` no rompe nada. ✔

### E-14 — Suite completa y estabilidad

| Corrida | Resultado |
|---|---|
| 1 | `318 passed in 8.88s` — exit 0 |
| 2 | `318 passed in 8.72s` — exit 0 |
| 3 | `318 passed in 9.00s` — exit 0 |
| Ficheros en orden inverso | `318 passed in 8.83s` — exit 0 |
| `test_billing_api.py` aislado | 14 passed |
| `test_credit_manager.py` aislado | 12 passed |
| `test_stripe_webhooks.py` aislado | 4 passed |

Sin contaminación entre corridas ni dependencia de orden detectable con los ficheros disponibles.
Sin `skip` ni `xfail` añadidos por el cambio (`git diff master..HEAD` no introduce ninguno).
`git diff master..HEAD --name-only -- backend/app/` → **0 ficheros**. ✔

**NO VERIFICABLE**: no puedo consultar el resultado real del workflow en GitHub Actions — `gh` no está instalado
en este entorno. Todo lo anterior es evidencia local que reproduce el `env:` del job, no una corrida del runner.

---

## Coherencia con el diseño

| Decisión | ¿Seguida? | Nota |
|---|---|---|
| D1 `sync_db` callable function-scope | Sí | `conftest.py`; ninguna fixture local la sombrea |
| D2 Pretil en `pytest_configure` + `setdefault` | Sí | Comportamiento exacto: exit 4, 0 tests |
| D3 Cobertura anclada al claim del evento | Sí | Y demostrada necesaria (E-7) |
| D4 Triggers: intención en dos tests | Sí, con defecto | Ver DEFECTO-1 y DEFECTO-2 |
| D5 Credenciales Stripe literales | Sí | |
| Ficheros afectados = tabla del diseño | Sí | 6 ficheros, ninguno bajo `backend/app/` |

Imprecisión documental menor: el diseño y la exploración sitúan `_grant_topup` en `webhooks.py:182-203`; su
definición real está en `app/presentation/api/v1/webhooks.py:74-83` y su llamada en la línea 203.

## Fuera de alcance — confirmado intacto

**Grant huérfano.** `app/presentation/api/v1/webhooks.py:194-203`: `_claim_grant(...)` inserta la transacción y
acto seguido `_grant_topup` hace `users_col.update_one(...)` **sin comprobar `matched_count`** (líneas 80-83).
Si el usuario no existe, la transacción queda huérfana. Sigue sin tocarse: `git diff master..HEAD -- backend/app/`
está vacío.

Nota: las dos transacciones huérfanas de `evt_topup_idem_1` que existían en `sphere_test` **ya no están**
(`count_documents({'stripe_event_id':'evt_topup_idem_1'})` → 0). Las borró la limpieza reordenada de
`test_stripe_webhooks.py`. La evidencia física desapareció; el bug, no.

## Pregunta abierta del diseño: nombre vs. host

**No es suficiente, pero es la línea correcta para este cambio.** El pretil convierte un fallo silencioso
(escribir en la base equivocada del host correcto) en un fallo ruidoso, que es el vector que se materializó de
verdad aquí. Lo que **no** cubre es el vector caro: `MONGODB_URL` apuntando al clúster de producción con
`DB_NAME=sphere_test` — la suite borraría e insertaría en producción y el pretil diría OK. Ese riesgo no es
teórico: la suite hace `delete_many` sobre `users`.

Recomendación concreta, en su propio cambio SDD y sin bloquear a nadie: **advertir, no bloquear**. Si el host de
`MONGODB_URL` no es `localhost`/`127.0.0.1`/`mongodb` y no contiene `test`, emitir un `warning` visible en la
cabecera de pytest con el host resuelto. Coste ~10 líneas en el mismo `pytest_configure`, cero devs bloqueados,
y el dev con Atlas de desarrollo ve el host antes de que la suite escriba. Bloquear por host sí bloquearía a ese
dev, que es justo la razón por la que se dejó abierta.

---

## Defectos encontrados

### DEFECTO-1 (CRÍTICO en su rama) — `pytest.skip` sin `import pytest`

`backend/tests/test_ci_infra.py:82` llama a `pytest.skip(...)`, pero el módulo **no importa `pytest`**
(`test_ci_infra.py:7-11`: `json`, `os`, `pathlib.Path`, `yaml`).

```
$ python /tmp/verify_triggers.py   # caso G: resolve_default_branch() -> None
G rama por defecto irresoluble | NameError: name 'pytest' is not defined
```

Consecuencia: cuando la rama por defecto no se puede resolver, el test **no hace skip, revienta con `NameError`**
y el job cae en rojo. La mitigación documentada en RD-6 ("es guarda de entorno, no de fallo") es **falsa**.
Nunca se ha disparado en local porque `git symbolic-ref` siempre resuelve aquí.

### DEFECTO-2 (ALTO) — el fallback de `resolve_default_branch()` no resuelve la rama por defecto en CI

`test_ci_infra.py:56-68` usa `git symbolic-ref --short refs/remotes/origin/HEAD` como fallback. Verificado:

```
# repo local completo
$ git symbolic-ref --short refs/remotes/origin/HEAD   -> origin/master        (correcto)

# clon shallow con --branch (git clone --depth 1 --branch feat/backend-ci-verde)
$ git symbolic-ref --short refs/remotes/origin/HEAD   -> origin/feat/backend-ci-verde   (INCORRECTO)

# checkout estilo actions/checkout@v4 (git init + remote add + fetch --depth=1 + checkout FETCH_HEAD)
$ git symbolic-ref --short refs/remotes/origin/HEAD
fatal: ref refs/remotes/origin/HEAD is not a symbolic ref   rc=128   -> None -> DEFECTO-1
```

El fallback devuelve la rama **clonada**, no la rama por defecto del repositorio. Encadenado con DEFECTO-1:
si `${{ github.event.repository.default_branch }}` llegara vacío en algún evento (la propia hipótesis marcada en
D4/RD-5), el job de CI se pone rojo con `NameError`, no con skip ni con un fallo explicativo.

Ambos defectos son de **una línea cada uno**: añadir `import pytest` al módulo, y sustituir el fallback por
`git remote show origin` / `git ls-remote --symref origin HEAD` (que sí consulta el remoto) o eliminarlo y
depender solo del env var con un mensaje claro. **No bloquean el mérito del cambio**, pero contradicen a la letra
lo que D4 y RD-6 afirman.

### DEFECTO-3 (BAJO, documental) — el criterio de `tasks.md` 6.1 dice 317

Ya corregido en las "Notas de ejecución" del propio `tasks.md`. El total real es 318 y las notas lo explican.
Sin acción.

---

## Strict TDD (config: `strict_tdd: true`)

### TDD Compliance

| Check | Resultado | Detalle |
|---|---|---|
| Artefacto `apply-progress` con tabla "TDD Cycle Evidence" | ❌ | No existe ni en `openspec/changes/backend-ci-verde/` ni en Engram (`mem_search` sin resultados) |
| Todas las tareas tienen test | ✅ | 20/20 marcadas, todas sobre `backend/tests/**` |
| RED confirmado | ✅ (reproducido por mí) | Mutación SKU → rojo (E-7); contrafactual Stripe → 6 failed (E-8); `master` en push → 2 rojos (E-12) |
| GREEN confirmado | ✅ | 318/318 pasan en 4 ejecuciones |
| Triangulación | ✅ | D4 parte 1 test en 2; matriz de 6 casos de trigger ejercitada |
| Safety net en ficheros modificados | ✅ | 5 ficheros modificados, ninguno nuevo; la suite entera corre en cada fase |

**No hay tabla formal de evidencia TDD**, pero `tasks.md` documenta los ciclos (1.5 RED, 3.1 RED / 3.4 GREEN,
4.1 RED / 4.2 GREEN, 5.3 RED de control, fase 2 completa de mutación) y los mensajes de commit los repiten.
He **reproducido independientemente** los tres RED clave, así que la evidencia sustantiva existe aunque falte
el artefacto. Lo reporto como incumplimiento de forma, no de fondo.

### Distribución por capa (ficheros tocados por el cambio)

| Capa | Tests | Ficheros | Herramientas |
|---|---|---|---|
| Unit (lee YAML/ficheros, sin I/O) | 22 | `test_ci_infra.py` | pytest |
| Integración (Mongo real) | 12 | `test_credit_manager.py` | pytest + pymongo |
| Integración (HTTP + Mongo real) | 18 | `test_billing_api.py` (14), `test_stripe_webhooks.py` (4) | pytest-asyncio + httpx `AsyncClient` |
| Infraestructura | — | `conftest.py` | — |
| **Total tocado** | **52** | **5** | |

E2E: no aplica (`e2e: false` en config). Coherente con las capacidades declaradas.

### Cobertura de ficheros cambiados

**Omitida — `coverage: false` para backend en `openspec/config.yaml`.** No hay `pytest-cov` instalado.
No es un fallo; es una capacidad ausente. `coverage_threshold: 0`, así que no hay umbral que incumplir.

### Quality Metrics

**Linter (ruff, no bloqueante en CI y no configurado para `tests/`)** — comparado contra `master`:

| | master | HEAD | Delta |
|---|---|---|---|
| F401 (import sin usar) | 9 | 8 | −1 (el cambio da uso a `os` en `test_ci_infra.py`) |
| **F821 (nombre indefinido)** | **0** | **1** | **+1 — `test_ci_infra.py:82` `Undefined name 'pytest'`** |

```
$ ruff check --select F821 backend/tests/
backend/tests/test_ci_infra.py:82:9: F821 Undefined name `pytest`
Found 1 error.
```

Ruff detecta DEFECTO-1 de forma automática. Es la única regresión de lint introducida por el cambio.

**Type checker**: no disponible (`typechecker: false` para backend).

---

## Tests fantasma encontrados (barrido de los 37 ficheros de `backend/tests/`)

El cambio corrigió **uno** (el de la ruta del dinero). Quedan más. Los siguientes son **preexistentes**, no
introducidos por `backend-ci-verde`, pero contaminan la señal de "318 passed" que este cambio deja como criterio
de calidad. **Los dos primeros los he confirmado yo por mutación o lectura directa; el resto proceden de un
barrido y están citados con línea, pero no todos verificados por mutación** (marcados *[no mutado]*).

### F-1 — El gate de verificación de email no tiene NINGUNA cobertura (CRÍTICO, verificado por mutación)

Mutación: eliminar el gate en `app/core/auth.py` (las 3 ocurrencias de
`settings.plan_messages_map["free"] if email_verified else 0` → `settings.plan_messages_map["free"]`, y
`subscription_status = "active"` incondicional). Es decir, **cualquier usuario con email sin verificar recibe
créditos**.

```
$ pytest tests/ -q      # con el gate de email ELIMINADO
318 passed in 8.40s
```

**La suite entera sigue verde.** Los 6 tests que dicen probarlo no lo prueban:

| Fichero | Línea | Test |
|---|---|---|
| `backend/tests/test_email_gate.py` | 31 | `test_auto_provision_unverified_email_gets_zero_balance` |
| `backend/tests/test_email_gate.py` | 70 | `test_auto_provision_verified_email_gets_5_credits` |
| `backend/tests/test_email_gate.py` | 108 | `test_dev_token_bypass_treats_user_as_verified_in_development` |
| `backend/tests/test_production_readiness.py` | 40 | `test_auto_provision_unverified_user_gets_zero_balance` |
| `backend/tests/test_production_readiness.py` | 82 | `test_auto_provision_verified_user_gets_credits` |
| `backend/tests/test_production_readiness.py` | 122 | `test_auto_provision_dev_token_always_verified` |

Causa raíz: los seis mockean `find_one` con un `side_effect` cuyo **segundo** valor es el dict de usuario que el
propio test escribe. `_auto_provision_user` construye `new_user`, lo manda a un `update_one` mockeado (no-op) y
**releé** con `find_one` → devuelve el literal del test. La aserción
`assert result["wallet"]["pro_messages_balance"] == 0` lee el 0 que el test acaba de inyectar, no el que calcula
`auth.py`. Es exactamente la misma patología que este cambio corrigió en la ruta del dinero, en otra ruta.

### F-2 — `test_rag_isolation.py`: 3 tests de aislamiento multi-tenant que no pueden fallar (CRÍTICO, verificado por lectura)

`backend/tests/test_rag_isolation.py:10, 29, 42`. Los tres tienen esta forma exacta:

```python
    try:
        result = _retrieve_context_sync("test query", role, user_id=user_id)
        assert isinstance(result, str)
    except Exception:
        pass
```

Dos capas de inmunidad: el `except Exception: pass` se traga cualquier fallo, y si no falla, la única aserción
es `isinstance(result, str)` sobre una función que devuelve `str` **incluso en su camino de error**
(`"Error recuperando contexto de la base de datos."`). El docstring promete verificar que `user_id` está en el
filtro del vector search; ninguno de los tres inspecciona el filtro.

Atenuante honesto: los dos tests siguientes del mismo fichero (`:61` y `:82`) **sí** inspeccionan
`call_args_list` y son la cobertura real del aislamiento.

### F-3 — `test_rate_limit.py`: 4 tests que prueban `pyrate_limiter`, no SPHERE *[no mutado]*

`backend/tests/test_rate_limit.py:26, 45, 65, 91`. Los cuatro hacen `limiter = Limiter(rate)` — construyen su
propia instancia de la librería de terceros. Lo único de SPHERE que consumen es la tupla de configuración
`RATE_LIMIT_CHAT_BY_PLAN["free"]`. No tocan `app/core/rate_limit.py` ni `stream.py`.
Atenuante: `TestChatRateLimiterWiring` (`:114-156`) del mismo fichero sí prueba el `ChatRateLimiter` real.

### F-4 — `assert X is not None` sobre lo recién construido *[no mutado]*

| Fichero | Línea | Test | Aserción |
|---|---|---|---|
| `backend/tests/test_checkpoint.py` | 32 | `test_checkpoint_collection_writable` | `assert checkpointer is not None` — el docstring dice "la colección es escribible" y **no escribe nada** |
| `backend/tests/test_checkpoint.py` | 12 | `test_checkpointer_initialized` | `assert checkpointer is not None` |

### F-5 — Tests que asertan sobre el propio `conftest.py` *[no mutado]*

`backend/tests/test_firebase.py:245` (`test_free_user_fixture_balance`) y
`backend/tests/test_credit_manager.py:164` (`test_free_user_fixture_has_correct_balance`) asertan sobre
`_PLAN_WALLETS` (`conftest.py:113`), un literal de infraestructura de test. Cero código de producción implicado.

### F-6 — `test_firebase.py:216 / :141` *[no mutado]*

`test_auto_provision_uses_email_as_display_name_fallback` (`:234`) y `test_auto_provision_creates_new_user`
(`:168-171`) asertan sobre el literal mockeado, misma patología que F-1. En el segundo, la única aserción real es
`mock_col.update_one.assert_called_once()`.

### F-7 — Aserción de seguridad muerta en CI *[no mutado]*

`backend/tests/test_oauth_apps.py:91-99`: `if credentials_service._fernet is not None:` envuelve
`assert b"PLAINTEXT_SECRET" not in raw`. `ci.yml` **no define `FERNET_KEY` ni `FERNET_KEYS`** en el `env:` del
job (verificado en las líneas 40-58), así que `credentials.py` deja `_fernet = None` y **la aserción de que el
secreto no se guarda en claro nunca se ejecuta en la puerta de merge**. Directamente relacionado con este cambio:
es otra variable de entorno ausente del job `test-backend`.

### F-8 — Tautología de firma *[no mutado]*

`backend/tests/test_webhook_n8n.py:27-28`: el test firma con `canonical_sign(...)` y verifica con
`verify_n8n_signature(...)`, que internamente llama a **la misma** `canonical_sign` (`webhooks.py:319`).
Si la función de firma regresara, firma y verificación se moverían juntas y el test seguiría verde.

### F-9 — Llamada sin aserción *[no mutado]*

`backend/tests/test_agent_overrides.py:52`: `result = build_user_context_block(user_empty)` se calcula y se
descarta (se sobrescribe en `:63`). La mitad del test que verificaría la exclusión de campos vacíos son tres
líneas de comentario.

### Lo que NO se encontró (confirmado)

Cero `assert True`, cero `assert 1 == 1`, cero `mock.assert_called()` como aserción única, cero `pytest.skip`
incondicional, y **cero tests que lean una base o colección que el código bajo prueba no escribe** — ese patrón,
que era el objetivo del cambio, está erradicado.

---

## Veredicto

**APTO CON RESERVAS.**

Los 14 escenarios cumplen en local, con evidencia ejecutada. La prueba de fuego pasa: degradar
`validate_topup_tier` pone el test en rojo por el motivo previsto (el claim del evento, no el saldo), y revertir
deja `backend/app/**` intacto. El pretil aborta con exit 4, 0 tests y mensaje remediable en `sphere_db`,
`produccion` y desde la raíz del repo, sin tocar una sola colección de producción. Los tests de triggers muerden
donde deben (`master`, `*`, `**`) y toleran patrones nuevos (`hotfix/**`). Tres corridas consecutivas y una en
orden inverso: 318 passed, sin contaminación ni dependencia de orden. Sin `skip`/`xfail` nuevos, sin atribución
de IA en los commits, cero ficheros de `backend/app/` en el diff.

Las reservas, por orden:

1. **DEFECTO-1/2 (bloqueantes de la promesa de CI, 2 líneas de arreglo).** `test_ci_infra.py:82` llama a
   `pytest.skip` sin `import pytest` (ruff lo marca F821), y el fallback `git symbolic-ref origin/HEAD` no
   resuelve la rama por defecto en un checkout de GitHub Actions — devuelve la rama clonada o falla. Si
   `${{ github.event.repository.default_branch }}` llegara vacío, el job se pone rojo con `NameError`, no con el
   skip que RD-6 promete. Arreglar antes de archivar.
2. **S14 no verificable en CI**: `gh` no está instalado; toda la evidencia es local reproduciendo el `env:` del
   job. `rules.verify` de `config.yaml` exige verificar contra el CI real. Pendiente de la primera corrida verde
   en GitHub.
3. **Falta el artefacto `apply-progress`** con tabla de evidencia TDD, exigido por `strict_tdd: true`. El fondo
   está (tasks.md + commits + mis RED reproducidos); la forma, no.
4. **17 tests fantasma preexistentes** en la suite. Dos son graves y confirmados: el gate de verificación de
   email no tiene cobertura alguna (eliminarlo entero deja los 318 verdes) y 3 de los 5 tests de aislamiento RAG
   multi-tenant no pueden fallar. Fuera del alcance de este cambio, pero devalúan el "318 passed" que deja como
   criterio. Merecen un cambio SDD propio.
5. **Pregunta abierta (nombre vs. host)**: insuficiente pero correcta para este alcance. Recomendación:
   advertir con el host resuelto, no bloquear.

Ninguna reserva invalida el objetivo del cambio. La cobertura de la ruta del dinero ya no es fantasma.

