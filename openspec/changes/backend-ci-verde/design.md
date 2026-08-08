# Design: backend-ci-verde

> Fase SDD: design. Base: `proposal.md`, `specs/backend-test-harness`, `specs/ci-pipeline`, `exploration.md`.
> Todo lo afirmado aquí está verificado contra el código salvo lo marcado **[hipótesis]**.

## Enfoque técnico

Cuatro commits sobre `backend/tests/**` y `.github/workflows/ci.yml`. **Cero ficheros bajo `backend/app/**`**.
El eje del diseño: la suite deja de nombrar la base y pasa a *resolverla* por la misma vía que la app
(`settings.DB_NAME`, `webhooks.py:105`), y se le pone un pretil que aborta antes de recolectar.

```
HOY:   test ──insert/assert──> sphere_db          (2 colecciones, creadas por los tests)
       webhook ──write──────> settings.DB_NAME = sphere_test   (11 colecciones)
                              ↑ el test nunca mira aquí → verde imposible de romper

DISEÑO: test ──sync_db()──┐
        webhook ──────────┴──> settings.DB_NAME   (una sola base, observada)
```

## Decisiones

### D1 — `sync_db` es una fixture **invocable**, no un handle

`conftest.py`, ámbito **function** (obligado: depende de `db_instance`, que es function — un scope
superior daría `ScopeMismatch`).

```python
@pytest.fixture
def sync_db(db_instance):
    """Devuelve un callable: resuelve la base EN EL MOMENTO DE USO."""
    from app.core.config import settings
    return lambda: db_instance.get_sync_client()[settings.DB_NAME]
```

Uso: `dbc = sync_db()` dentro del cuerpo del test (igual que hoy, pero sin literal).

| Opción | Trade-off | Decisión |
|---|---|---|
| Handle plano (`return ...[settings.DB_NAME]`) | Idiomático, pero se resuelve en *setup* | **Descartada** |
| Callable | `()` extra en cada uso | **Elegida** |

Rationale (verificado, no estético): `_setup_db()` (`conftest.py:179-188`) **cierra y recrea**
`db.sync_client` en cada test async, porque pytest-asyncio da un loop nuevo por test y el
short-circuit de línea 171-177 solo salta si el loop de Motor coincide. Y PyMongo 4 documenta en
`pymongo/synchronous/mongo_client.py:1711-1713`: *"Once closed, the client cannot be used again and
any attempt will raise InvalidOperation"*. Un handle plano capturado antes de `async_client`
apuntaría a un cliente cerrado → el test rompería según el **orden de los parámetros** de su firma.
El callable elimina esa clase de fallo entera y conserva la semántica que hoy funciona (resolver en
el cuerpo). El diseño de `conftest.py` se respeta: `get_sync_client()` es PyMongo, no Motor, así que
puede resolverse desde contexto sync.

`test_credit_manager.py:8-10` define hoy una fixture **local** `sync_db` que sombrearía a la de
`conftest`. El commit 1 la borra: la colisión de nombres es deliberada y la resolución es "heredar".

### D2 — Pretil en `pytest_configure` + `os.environ.setdefault`

Dos piezas en `backend/tests/conftest.py`:

1. **Después** de `load_dotenv` (línea 23) y **antes** de cualquier import de `app`:
   `os.environ.setdefault("DB_NAME", "sphere_test")`.
2. `def pytest_configure(config)`: importa `settings` y si `"test" not in settings.DB_NAME.lower()`
   → `raise pytest.UsageError(...)` con el valor rechazado, el motivo y `export DB_NAME=sphere_test`.

Comportamiento **verificado ejecutando pytest 9.0.3 con este montaje**: `UsageError` desde
`pytest_configure` sale por `wrap_session` (`_pytest/main.py:314-320`, `except UsageError: raise`)
hasta `main()` (`config/__init__.py:206-208`) → imprime `ERROR: <msg>` en stderr y devuelve
`ExitCode.USAGE_ERROR` = **4**. Como falla con `initstate = 0`, `pytest_sessionfinish` no corre:
**0 tests, sin resumen**. Cumple el escenario de la spec literalmente.

- **Hook**: `pytest_configure` es el último punto anterior a la recolección. `pytest_collection` ya
  sería tarde; `pytest_sessionstart` no llega a ejecutarse aquí.
- **Dónde engancha**: `backend/tests/conftest.py`. No existe ningún otro `conftest.py` en el repo
  (verificado). Con `testpaths = tests` en `pytest.ini`, `tests/conftest.py` es conftest *inicial* y
  su hook se dispara aunque se lance `pytest` sin argumentos (comprobado con un repro en `/tmp`).
  **Descartado** crear `backend/conftest.py`: segunda capa de conftest y segundo sitio donde tocar
  `sys.path`, sin cobertura adicional real.
- **Cómo distingue una base de test**: regla de substring `"test" in name.lower()`. Acepta
  `sphere_test`, `sphere_test_jarvis`, `ci_test`; rechaza `sphere_db` (el default de producción,
  `config.py:21`). **Descartada** la allowlist exacta `{"sphere_test"}` (bloquea al dev que quiere su
  propia base aislada) y **descartada** la denylist de `sphere_db` (no cubre ningún otro nombre de
  producción). Un dev nunca queda bloqueado sin salida: o no ha exportado nada y el `setdefault` le
  da una base segura, o el mensaje le da el `export` exacto.
- El orden importa: `load_dotenv` **primero** (no sobreescribe env existente), `setdefault` después;
  al revés, un `.env` con `DB_NAME` quedaría ignorado.
- La validación lee `settings.DB_NAME`, no `os.environ`: es el valor que usará el webhook.

### D3 — La cobertura de SKU se ancla al **claim del evento**, no al saldo

`test_billing_api.py:160-222`. Traza verificada de la mutación (`validate_topup_tier` → `True`
siempre, `plan_limits.py:66-73`):

```
webhook mode=payment ──> if user_doc and not validate_topup_tier(...)  [mutado: falso]
                     └──> _claim_grant(...)  INSERTA tx {balance_source:"topup", delta:0}
                          └──> _grant_topup ──> topup_messages_map.get("topup_premium_10k",0)=0
                                               <= 0 → return  (webhooks.py:76-79)
```

Consecuencia dura: **la aserción de saldo (línea 213) NO detecta la mutación** — el balance sigue en
0 porque un segundo guard corta. Quien detecta es el contador de transacciones. Por eso el test se
reescribe así:

- Conservar `topup_messages_balance == 0` (barato, cubre la regresión de saldo).
- Cambiar el contador de `{"user_id": ..., "balance_source": "topup"}` a
  **`{"stripe_event_id": "evt_invalid_sku_topup"}`**. Es el hecho observable ("esta compra no
  reclamó ningún grant") e inmune a transacciones que otros tests dejan para `test_user_a` en la
  base compartida (`test_credit_manager.py::test_charge_from_topup` crea exactamente una tx con
  `user_id=test_user_a` y `balance_source="topup"` → con el filtro viejo, rojo por el motivo
  equivocado).
- **Limpieza previa y `finally`** de `credit_transactions`/`stripe_events_processed` para ese
  `event_id`, siguiendo la convención ya presente en `test_stripe_webhooks.py:127-130`. Sin el
  `finally`, la ejecución mutada deja la tx reclamada y la siguiente ejecución *sana* saldría roja:
  el propio procedimiento de verificación envenenaría la suite.

### D4 — Triggers: intención resuelta, partida en dos tests

`test_ci_infra.py` sustituye `test_ci_yml_triggers_on_push_and_pr_to_main` (líneas 27-44) por:

1. `test_ci_yml_merge_gate_targets_default_branch` — resuelve la rama por defecto en cadena:
   `os.environ["SPHERE_DEFAULT_BRANCH"]` → `git symbolic-ref --short refs/remotes/origin/HEAD`
   (verificado en local: devuelve `origin/master`) → si nada resuelve, `pytest.skip` con motivo.
   Afirma: la rama por defecto está en `pull_request.branches` y **no** está cubierta por
   `push.branches`.
2. `test_ci_yml_push_never_covers_merge_gate_branches` — invariante puro de YAML, sin git, siempre
   corre: `push.branches` no vacío y ningún patrón de `push.branches` cubre ninguna entrada de
   `pull_request.branches`.

Cobertura por patrón con `fnmatch`, verificado: `fnmatch("master","feat/**")` → `False`;
`fnmatch("master","*")` y `("master","**")` → `True`. Es decir, añadir `hotfix/**` deja los dos tests
verdes; añadir `master` o `*` a `push` los pone rojos. `fnmatch` es más permisivo que el glob de
GitHub (su `*` cruza `/`), lo cual falla del lado seguro. Ningún literal de rama en el fichero.

`SPHERE_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}` se exporta en el `env:` del
job (commit 3) para que en CI la resolución sea exacta en *cualquier* evento **[hipótesis: la
disponibilidad de `github.event.repository` en push y pull_request es doc-level, no verificable desde
el repo; por eso la cadena tiene fallback y el test 2 no depende de ella]**.
**Descartado** `git rev-parse --abbrev-ref HEAD` (en un PR el checkout está detached) y
**descartado** `GITHUB_BASE_REF` como fuente única (es la rama destino del PR, no la por defecto).

### D5 — Credenciales Stripe: literales falsos, nunca `secrets`

En `.github/workflows/ci.yml`, bloque `env:` del job `test-backend` (tras la línea 47):

```yaml
      STRIPE_SECRET_KEY: sk_test_ci
      STRIPE_WEBHOOK_SECRET: whsec_ci
      SPHERE_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}
```

Por qué no crea riesgo de tocar Stripe de verdad, verificado:
- `stripe.api_key = settings.STRIPE_SECRET_KEY` (`webhooks.py:18`) es una **asignación en import**,
  sin red.
- La única llamada saliente real del webhook es `stripe.Subscription.retrieve`, en la rama
  `mode == "subscription"`. **Ningún test construye un evento con `mode: "subscription"`**
  (verificado por grep en `tests/`): `test_stripe_webhooks.py:6-18` no lleva `mode`, así que recorre
  el dead-letter. `construct_event` está parcheado en todos los tests de webhook y `StripeClient`
  mockeado en los de billing.
- `sk_test_ci` vive en el namespace de *test mode* de Stripe y además no es un formato de clave
  válido: una llamada que se escapara moriría en 401, jamás movería dinero.
- Sin `${{ secrets.* }}`: es imposible que la configuración derive a inyectar una clave real, y el
  valor viaja en claro en el diff, así que cualquier cambio a una clave real se ve en review.
- Ningún test verde depende de que Stripe esté *sin* configurar: los tres
  `test_stripe_configured_*` construyen `Settings(...)` con kwargs explícitos (ganan a la env var,
  `test_billing_api.py:233-255`).

El commit 3 añade además a `test_ci_infra.py` la aserción del contrato: ambas claves presentes, no
vacías, sin `${{` y con prefijo `sk_test_` / `whsec_` (escenario "Claves falsas, no secretos").

## Ficheros afectados

| Fichero | Acción | Qué |
|---|---|---|
| `backend/tests/conftest.py` | Modify | `setdefault` tras L23; fixture `sync_db`; `pytest_configure` |
| `backend/tests/test_stripe_webhooks.py` | Modify | L34, L66, L137: literal → `sync_db()` |
| `backend/tests/test_credit_manager.py` | Modify | Borrar fixture local L8-10; `CreditManager(sync_db())` |
| `backend/tests/test_billing_api.py` | Modify | L168 literal; L216-222 contador por `stripe_event_id`; limpieza + `finally` |
| `backend/tests/test_ci_infra.py` | Modify | L27-44 → dos tests; contrato `STRIPE_*` en `test_ci_yml_backend_env_vars` (L71-83) |
| `.github/workflows/ci.yml` | Modify | 3 líneas en `env:` de `test-backend` (tras L47) |
| `backend/app/**` | **Sin tocar** | — |

`test_stream_billing.py:49,58` conserva `"sphere_db"`: son `MagicMock`, sin acceso real (así lo
admite el criterio de éxito de la propuesta).

## Orden de ejecución y por qué

| # | Commit | Por qué en esa posición |
|---|---|---|
| 1 | `test(backend): resolver la base de test vía settings.DB_NAME` | Va primero porque hasta que la suite no observa la base real, **cualquier** señal posterior es ficticia. Aislado, un `git bisect` señala directamente el rebote de `test_credit_manager`. |
| 2 | `test(backend): abortar la suite fuera de una base de test` | **Después** de 1, no antes: un pretil sobre una suite que aún nombra `sphere_db` a mano diría "estás a salvo" mientras los tests siguen escribiendo en otra base — falsa garantía, el mismo pecado que este cambio corrige. |
| 3 | `ci: exportar credenciales Stripe falsas en test-backend` | Independiente de 1-2, pero antes de 4 porque **exporta `SPHERE_DEFAULT_BRANCH`, que el test del commit 4 consume**. Además, el primer CI verde ya incluye la resolución correcta de base. |
| 4 | `test(ci): validar la intención de los triggers, no el literal main` | Último: consume el env var de 3. Si fuera primero, en CI caería al fallback de git y podría `skip`. |

Entre 1 y 2, y fuera de commit: ejecutar la **verificación por mutación** de D3 (romper
`validate_topup_tier` en local, ver rojo, revertir). No se commitea.

## Riesgos que introduce este diseño

| # | Riesgo | Severidad | Nota |
|---|---|---|---|
| RD-1 | El pretil vive en `pytest_configure`: `--noconftest`, un script suelto de pymongo o un pytest cuyo conftest inicial no sea este lo esquivan. **No es protección a nivel de base de datos.** | Media | Aceptado: cubre el vector real (correr la suite). |
| RD-2 | **El pretil valida el NOMBRE, no el HOST.** Con `MONGODB_URL` apuntando a producción y `DB_NAME=sphere_test`, la suite escribe en el clúster de producción y el pretil dice OK. R1 de la exploración queda **parcialmente** mitigado. | Media | Ver pregunta abierta. |
| RD-3 | `"test" in name` acepta un nombre desafortunado (`latest_db`). | Baja | Se prefiere a bloquear al dev. |
| RD-4 | Unificar en `sphere_test` sube la contaminación cruzada: `test_billing_api.py:171` borra y reinserta `test_user_a`, y `test_credit_manager.setup_user` también. | Media | `_setup_db()` reupserta `PROFILE_A` con `$set` en cada fixture de cliente, así que se autocura. D3 mitiga la parte que importa (aserciones por evento + `finally`). |
| RD-5 | `SPHERE_DEFAULT_BRANCH` es hipótesis; si viene vacío, en CI se cae a git y el test 1 puede `skip`. | Baja | El test 2 (invariante YAML) cubre el negativo sin depender de nada. |
| RD-6 | El `skip` condicional del test 1 podría ocultar la intención en un entorno sin git ni env var. | Baja | Es guarda de entorno, no de fallo; y nunca deja el negativo sin cubrir. |

## Hallazgos que NO se tocan (requieren `backend/app/**`)

- **Grant huérfano** (`webhooks.py:182-203`, `_grant_topup` ignora `matched_count`): confirmado, fuera
  de alcance por decisión de la propuesta. Requiere `app/**` → cambio SDD propio con TDD estricto.
- **Segundo guard como red de seguridad**: que un SKU inválido no infle créditos depende hoy de
  `topup_messages_map.get(plan_id, 0) <= 0`, no de `validate_topup_tier`. Es la razón por la que la
  aserción de saldo no detecta la mutación. Corregirlo tocaría `app/**`: **no se hace aquí**, se
  registra.
- `pytest.ini:7` (`PytestRemovedIn9Warning`, R6) y R2/R3: fuera de alcance, sin cambios.

## Pregunta abierta

- [ ] ¿Extender el pretil a `MONGODB_URL` (rechazar hosts que no sean localhost / no contengan
  `test`)? Cierra RD-2, pero bloquearía a un dev con clúster Atlas de desarrollo. Decisión del dueño.
