# Tasks: infra-n8n

Rama activa: `feat/lanzamiento-e2e` (no se cambia de rama). Baseline: backend **338 passed**,
frontend **827 passed** (el frontend no se toca). `strict_tdd: true` → **el RED va antes que el GREEN
y se ve fallar con la salida escrita aquí**. Nunca se ejecuta un build. Commits convencionales, sin
atribución de IA.

Las fases siguen el **orden de commits del diseño** (§Migration/Rollout), no el orden numérico de la
propuesta: los docs van al final porque IN-005 exige citar `check-n8n-health.sh` y el manifiesto, que
antes no existen.

**Cuando un test nace verde se marca «caracterización», no RED.** Buena parte de NWI-003 y NWD-001/002
describe comportamiento que ya existe con 0 tests: su valor está en la mutación que lo acompaña, no en
un rojo inventado.

**Nota sobre `git status`**: el árbol lleva ficheros sin seguir (`VISUAL_CHECK*.md`,
`openspec/changes/*`), así que un `git status --porcelain` a secas **nunca** sale vacío. Toda
comprobación de reversión va **acotada al fichero mutado**: `git status --porcelain <fichero>` debe
devolver cadena vacía.

**IN-006 no se implementa.** Mover `N8N_WEBHOOK_SECRET` a `prod_critical` (`backend/main.py:63-68`)
impediría arrancar producción hasta que el dueño ponga la variable en Railway. N8 (frontend) fuera de
alcance. No se inventan URLs ni secretos.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1.300 – 1.700 (≈450 producción, ≈850 tests, ≈150 docs, ≈100 borrados) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Rama única `feat/lanzamiento-e2e`, 9 commits acotados, un solo PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Estrategia ya decidida por el dueño: **una sola rama, commits acotados, sin PRs encadenados**. El
presupuesto de 400 líneas se supera con `size:exception` aceptada; la protección del revisor la da la
frontera de commit, que es reversible una a una.

### Suggested Work Units

| Unit | Goal (commit) | Notes |
|------|---------------|-------|
| 1 | `fix(security)`: `core/signing.py`, 4 superficies, state sin truncar | El más arriesgado: invalida los states OAuth en vuelo (ventana 10 min) |
| 2 | `fix(infra)`: manifiesto + guard + raíz limpia + retirar T-003 | Depende de nada; habilita 3 y 9 |
| 3 | `fix(docker)`: compose del n8n local | Depende de 2 (lee el manifiesto) |
| 4 | `test(n8n)`: endpoint ASGI + deployer con `MockTransport` + estructurales | Depende de 1 |
| 5 | `chore`: borrar `ensure_workflow()` | Cierra el RED 4.6 |
| 6 | `feat(security)`: backend tolerante + dedupe + deadline | Depende de 1 y 4 |
| 7 | `feat(security)`: `schedule-post.json` con `timestamp`+`nonce` | Revertir siempre **7 antes que 6** |
| 8 | `feat(ops)`: `check-n8n-health.sh` + 3 tests offline | Independiente; lo cita 9 |
| 9 | `docs(deploy)`: lista única de variables y documentos decidibles | Último: cita 2 y 8 |

---

## Fase 1 — Commit 1 · `fix(security)`: un solo lector del secreto, un solo comparador

Ficheros: `backend/app/core/signing.py` (nuevo), `backend/app/presentation/api/v1/integrations.py`,
`backend/app/presentation/api/v1/webhooks.py`, `backend/app/infrastructure/tools/n8n_client.py`,
`docs/CONEXIONES_Y_N8N_SETUP.md:30`. Tests nuevos: `backend/tests/test_oauth_state_signing.py`,
`backend/tests/test_signing_estructural.py`, `backend/tests/test_webhook_n8n_endpoint.py`.

**Desviación deliberada del diseño**: los dos estructurales y el test ASGI de NWI-001 van en este
commit, no en el 4. Son la cerradura de lo que este commit arregla; en el 4 el commit nacería sin
guardián.

### RED

- [x] 1.1 RED · NWI-001 accesor. `test_oauth_state_signing.py`: `n8n_secret()` lanza `N8NSecretMissing`
  con `""`, `"   "` y sin variable, y devuelve el valor con secreto configurado (monkeypatch de
  `settings.N8N_WEBHOOK_SECRET`). Salida esperada:
  `ERROR tests/test_oauth_state_signing.py - ModuleNotFoundError: No module named 'app.core.signing'`.
- [x] 1.2 RED · NWI-002 no-ASCII a nivel unidad. `constant_time_equals("abc", "ñ") is False` y
  `constant_time_equals("a"*64, "a"*64) is True`. Mismo `ERROR ... ModuleNotFoundError` (el fichero no
  colecciona hasta que exista `signing.py`).
- [x] 1.3 RED · NWI-002 longitud de la firma. `_generate_state("u1")` → tercer campo con
  `re.fullmatch(r"[0-9a-f]{64}", sig)`. Salida:
  `FAILED tests/test_oauth_state_signing.py::test_state_firma_de_64_hex - AssertionError: assert 16 == 64`.
- [x] 1.4 RED · NWI-002 firma truncada. State cuya firma son los **16 primeros** hex del digest completo
  → `_verify_state(...) is False`. Salida:
  `FAILED ...::test_state_truncado_se_rechaza - assert True is False`.
- [x] 1.5 RED · NWI-002 el `TypeError` real. `_verify_state("abc:1700000000:ñ", "u1")` → `False`. Salida:
  `FAILED ...::test_state_no_ascii_no_revienta - TypeError: comparing strings with non-ASCII characters is not supported`
  (mensaje verificado con el intérprete del venv; el `except (ValueError, IndexError)` de
  `integrations.py:98` no lo captura).
- [x] 1.6 RED · NWI-001 sin secreto no se emite state. `_generate_state` lanza `N8NSecretMissing` y
  `_verify_state` devuelve `False`. Salida:
  `FAILED ...::test_sin_secreto_no_se_emite_state - Failed: DID NOT RAISE <class 'app.core.signing.N8NSecretMissing'>`.
- [x] 1.7 RED · NWI-001 vía ASGI. Fixture `authed_client_a` (`conftest.py:277`), monkeypatch de
  `_resolve_oauth_app` → app falsa (si no, se corta antes con 400), `N8N_WEBHOOK_SECRET=""`:
  `GET /api/v1/integrations/{provider}/connect` → 503 **y** `oauth_states` sin documento nuevo (contar
  antes/después). Salida: `FAILED ...::test_connect_sin_secreto_es_503 - assert 200 == 503`
  (hoy responde 200 con `{"authorize_url": ...}`, `integrations.py:148`).
- [x] 1.8 Caracterización (verde de salida) · NWI-001 escenario 1, en
  `backend/tests/test_webhook_n8n_endpoint.py`: con `N8N_WEBHOOK_SECRET=""`,
  `POST /api/v1/webhooks/n8n` con `X-Webhook-Signature = canonical_sign(payload, "")` → **401** y
  `_notify_schedule_post_result` sin llamadas. Hoy pasa por la guarda de `webhooks.py:412-418`; su
  valor está en MUT-1a.
- [x] 1.9 RED · NWI-001 cliente. `N8NClient(base_url, webhook_secret="")` con `_client` sustituido por
  `httpx.AsyncClient(transport=httpx.MockTransport(contador))`: `call_webhook` devuelve el dict de error
  de integración no disponible y el contador queda a 0. Salida:
  `FAILED ...::test_cliente_no_envia_sin_secreto - AssertionError: assert 1 == 0`.
- [x] 1.10 RED · estructural, `backend/tests/test_signing_estructural.py`: `N8N_WEBHOOK_SECRET` no
  aparece bajo `backend/app/` fuera de `core/config.py` y `core/signing.py`. Salida:
  `FAILED tests/test_signing_estructural.py::test_secreto_tiene_un_solo_lector - AssertionError: N8N_WEBHOOK_SECRET fuera de core/: ['presentation/api/v1/integrations.py:72', 'presentation/api/v1/integrations.py:88', 'presentation/api/v1/webhooks.py:412', 'presentation/api/v1/webhooks.py:417']`.
  **Alcance: sólo `backend/app/**`.** `backend/main.py` queda fuera a propósito — es la raíz de
  composición: `:91` es el CRITICAL de IN-006 y `:332` el constructor de `N8NClient`. Escribirlo en el
  test evita que alguien "arregle" el rojo refactorizando `main.py`.
- [x] 1.11 RED · estructural: `hmac.compare_digest` no aparece bajo `backend/app/` fuera de
  `core/signing.py` (líneas no comentadas). Salida:
  `FAILED ...::test_compare_digest_no_se_usa_desnudo - AssertionError: hmac.compare_digest fuera de core/signing.py: ['presentation/api/v1/integrations.py:93', 'presentation/api/v1/webhooks.py:423']`.

### GREEN

- [x] 1.12 Crear `backend/app/core/signing.py` (capa `core`, sin imports de capas superiores):
  `class N8NSecretMissing(RuntimeError)`, `n8n_secret() -> str` (lee `settings.N8N_WEBHOOK_SECRET`,
  `.strip()`, lanza si vacío) y `constant_time_equals(a, b) -> bool` (`hmac.compare_digest` envuelto en
  `try/except TypeError → False`).
- [x] 1.13 `integrations.py:65-77` — `_generate_state` usa `n8n_secret()` y `.hexdigest()` **completo**
  (fuera el `[:16]`).
- [x] 1.14 `integrations.py:79-99` — `_verify_state` con `n8n_secret()` dentro del `try`
  (`N8NSecretMissing` → `False`) y `constant_time_equals`; se conserva la expiración de 600 s.
- [x] 1.15 `integrations.py:130-134` — `connect_provider` traduce `N8NSecretMissing` a
  `HTTPException(503, ...)` **antes** del `insert_one` (el orden actual ya lo garantiza) y loguea la
  causa como configuración, distinguible del rechazo de firma.
- [x] 1.16 `webhooks.py:404-425` — `verify_n8n_signature` **conserva** su guarda explícita y su
  `logger.warning` (NWI-001 lo exige) y delega la comparación en `constant_time_equals`; desaparece el
  `try/except TypeError` local.
- [x] 1.17 `n8n_client.py:20-32` — `canonical_sign` lanza `N8NSecretMissing` con secreto vacío o de solo
  espacios; `call_webhook` lo captura y devuelve el dict de error **sin** construir la petición.
- [x] 1.18 `docs/CONEXIONES_Y_N8N_SETUP.md:30` — el secreto vacío deja de describirse como CSRF de OAuth:
  el state se consume con `find_one_and_delete` (`integrations.py:167`) antes de mirar el HMAC, así que
  un state forjado muere ahí; lo real es el truncado y el acoplamiento de secretos.

### Mutaciones (aplicar → ver rojo → revertir → comprobar acotado)

- [x] 1.19 MUT-1 · NWI-001, **dos variantes**, una detrás de otra:
  (a) quitar `if not secret: return False` de `verify_n8n_signature` → rojo
  `FAILED tests/test_webhook_n8n.py::test_secreto_vacio_rechaza_todo - assert True is False` **y**
  `FAILED tests/test_webhook_n8n_endpoint.py::test_firma_con_clave_vacia_es_401 - assert 200 == 401`;
  (b) devolver `settings.N8N_WEBHOOK_SECRET` crudo desde `n8n_secret()` (firmar el state con clave
  vacía) → rojo `FAILED tests/test_oauth_state_signing.py::test_connect_sin_secreto_es_503 - assert 200 == 503`.
  Revertir cada una con `git checkout -- <fichero>` y comprobar
  `git status --porcelain backend/app/presentation/api/v1/webhooks.py` y `.../core/signing.py` → vacío.
- [x] 1.20 MUT-2 · NWI-002. Restaurar `.hexdigest()[:16]` en `integrations.py:72` y `:88`. Rojo:
  `FAILED ...::test_state_firma_de_64_hex - AssertionError: assert 16 == 64` y
  `FAILED ...::test_state_truncado_se_rechaza - assert True is False`. Revertir +
  `git status --porcelain backend/app/presentation/api/v1/integrations.py` → vacío.
- [x] 1.21 Suite backend completa dos veces seguidas → `0 failed`. Commit
  `fix(security): un solo lector del secreto n8n y state OAuth sin truncar`.

---

## Fase 2 — Commit 2 · `fix(infra)`: manifiesto, guard asertable y raíz limpia

Ficheros: `scripts/infra-manifest.conf` (nuevo), `scripts/check-monorepo-invariants.sh`, borrado de
`railway.toml` y `Dockerfile.n8n` de la raíz, `backend/tests/test_infra_manifest.py` (nuevo),
`backend/tests/test_ci_infra.py:285-316`.

Los tests de IN-001/002/003 viven en `test_infra_manifest.py` y **no** en `test_ci_infra.py`: allí el
literal legítimo `frontend/railway.toml` (T-004, `:322`) dispararía un falso positivo de origen único.

### RED

- [x] 2.1 RED · IN-002 el manifiesto parsea. `_load_manifest()` (`line.split("|", 3)`, ignora `#` y
  vacías) devuelve ≥1 regla por cada `kind`: `root_forbidden`, `root_forbidden_glob`,
  `dockerfile_forbidden`, `env_required`, `env_forbidden`, `compose_required`, `doc_forbidden`,
  `setting`. Salida:
  `FAILED tests/test_infra_manifest.py::test_manifiesto_parsea - FileNotFoundError: [Errno 2] No such file or directory: '<repo>/scripts/infra-manifest.conf'`.
  Nota: `doc_forbidden` es un `kind` **añadido** a la enumeración del diseño; sin él las frases
  prohibidas de IN-005 (fase 9) no tendrían origen único.
- [x] 2.2 RED · IN-001 raíz limpia derivada del manifiesto. Para cada `root_forbidden`,
  `not (ROOT/value).exists()`; para cada `root_forbidden_glob`, `list(ROOT.glob(value)) == []`. Salida:
  `FAILED ...::test_raiz_limpia - AssertionError: prohibido en la raíz: ['railway.toml', 'Dockerfile.n8n']`.
- [x] 2.3 RED · IN-001 ningún `Dockerfile` declara `VOLUME`. Recorre `**/Dockerfile*` (excluye `.venv`,
  `node_modules`) y afirma que ninguna línea no comentada empieza por cada `dockerfile_forbidden`.
  Salida: `FAILED ...::test_ningun_dockerfile_declara_volume - AssertionError: instrucción prohibida VOLUME en: ['Dockerfile.n8n:8']`.
- [x] 2.4 RED · IN-002 origen único (**meta-test, es lo que impide la recaída**). Ningún `value` del
  manifiesto aparece como literal en las líneas no comentadas de `scripts/check-monorepo-invariants.sh`
  ni de `backend/tests/test_infra_manifest.py`. Salida:
  `FAILED ...::test_manifiesto_es_el_unico_origen - AssertionError: literales del manifiesto escritos a mano: ['check-monorepo-invariants.sh:24 railway.toml', 'check-monorepo-invariants.sh:25 Dockerfile*', 'check-monorepo-invariants.sh:80 railway.toml', 'check-monorepo-invariants.sh:93 Dockerfile*']`.
  **Trampa localizada**: el `usage()` (`:19-28`) también escribe `railway.toml` y `Dockerfile*` como
  literales. No se excluye el heredoc del barrido —sería un agujero por donde volvería la duplicación—:
  el `usage()` de 2.8 **imprime las reglas leyéndolas del manifiesto**, igual que las comprobaciones.
- [x] 2.5 RED · IN-003 el guard es asertable. `subprocess.run(["bash", GUARD], capture_output=True,
  text=True)`: `"INVARIANTS root=PASS" in stdout` **y** `rc == 2` (la violación de `paths:` de `ci.yml`
  sigue visible, no se oculta). Salida:
  `FAILED ...::test_guard_reporta_raiz_por_separado - AssertionError: assert 'INVARIANTS root=PASS' in '=== SPHERE Monorepo Invariant Check ===\n...'`.
- [x] 2.6 RED · IN-003 `--only`. `--only root` → `rc == 0` con `root=PASS`; `--only scoping` → `rc == 2`;
  `--only pepe` → `rc == 1`. Salida: `FAILED ...::test_guard_only_root - AssertionError: assert 2 == 0`.

### GREEN

- [x] 2.7 Crear `scripts/infra-manifest.conf` (4 columnas `kind|scope|value|note`, `#` comentario, sin
  `|` en los campos). Contenido mínimo: `root_forbidden` `railway.toml`; `root_forbidden_glob`
  `Dockerfile*`; `dockerfile_forbidden` `VOLUME`; `env_forbidden` `N8N_WEBHOOK_URL`; `compose_required|n8n`
  `N8N_WEBHOOK_SECRET`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`;
  `env_required|n8n` `N8N_HOST`, `N8N_PORT`, `N8N_PROTOCOL`, `WEBHOOK_URL`, `N8N_USER_FOLDER=/home/node`,
  `N8N_ENCRYPTION_KEY`, `DB_TYPE`, `SPHERE_BACKEND_URL` y las tres de `compose_required`;
  `env_required|backend` `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`. Cada `note` explica
  **para qué sirve** la variable. Sin valores de secretos ni URLs.
  Ambigüedad registrada: IN-001 dice «las cuatro sin las cuales los 18 workflows fallan en su primer
  nodo» y la enumeración verificable da **tres** (las del nodo `Verify Signature`, comprobadas en
  `schedule-post.json`) más `N8N_USER_FOLDER=/home/node` (sin ella se pierde todo en cada redeploy,
  `CONEXIONES:44`). Si el dueño identifica otra, se añade **una línea** al manifiesto y ambos
  consumidores la aplican sin editarlos: eso es exactamente IN-002.
- [x] 2.8 `scripts/check-monorepo-invariants.sh` — lee el manifiesto con
  `while IFS='|' read -r kind scope value note`; contadores `ROOT_VIOLATIONS` y `SCOPING_VIOLATIONS`
  **separados**; imprime `INVARIANTS root=PASS|FAIL scoping=PASS|FAIL`; conserva exit 2 si cualquiera
  falla, exit 1 para argumentos; añade `--only root|scoping`. **`usage()` se reescribe para listar las
  reglas desde el manifiesto**, no a mano: si no, 2.4 se queda rojo por su propio texto de ayuda.
- [x] 2.9 Borrar `railway.toml` y `Dockerfile.n8n` de la raíz. **Argumento, al cuerpo del commit**: en
  ningún escenario el borrado causa daño. (a) Si el servicio n8n usa `source.image` con `n8nio/n8n:latest`
  —lo que afirma `docs/DEPLOYMENT_RUNBOOK.md:37-38`—, borrarlos no cambia nada: son inertes. (b) Si
  alguien los usara en el futuro, `Dockerfile.n8n:8` declara `VOLUME`, que Railway no soporta: el build
  **falla garantizado**, así que borrarlos evita un incidente en vez de causarlo. (c) Si el servicio se
  construyera hoy desde `Dockerfile.n8n`, estaría ya caído — y no lo está.
  **Nota de verificación para el dueño (no bloquea el commit)**: confirmar en el dashboard de Railway
  que el servicio n8n tiene `source.image = n8nio/n8n:latest` y `repo = null`. No es verificable desde
  el repositorio.
- [x] 2.10 `backend/tests/test_ci_infra.py` — borrar **sólo** los 3 tests de T-003 (`:285-316`:
  `test_dockerfile_n8n_has_volume`, `test_dockerfile_n8n_has_healthcheck`,
  `test_railway_toml_has_volume_mount`). **Conservar el helper `read_dockerfile` (`:279-283`)**: lo usan
  `test_backend_dockerfile_has_healthcheck:339`, `:352`, `:365`, `:396`. Baseline 338 → 335 + los nuevos.

### Mutaciones

- [x] 2.11 MUT-3 · IN-001. Recrear `Dockerfile.n8n` en la raíz con `VOLUME /home/node/.n8n`. Rojo:
  `FAILED ...::test_raiz_limpia - AssertionError: prohibido en la raíz: ['Dockerfile.n8n']` y
  `FAILED ...::test_ningun_dockerfile_declara_volume - AssertionError: instrucción prohibida VOLUME en: ['Dockerfile.n8n:1']`;
  además el guard imprime `INVARIANTS root=FAIL` con `rc 2`. Revertir con `rm Dockerfile.n8n` (queda
  sin seguir tras 2.9); `git status --porcelain Dockerfile.n8n` → vacío.
- [x] 2.12 MUT-4 · IN-002. Reintroducir en el guard la comprobación literal
  `if [[ -f "$REPO_ROOT/railway.toml" ]]` en vez de leerla del manifiesto. Rojo:
  `FAILED ...::test_manifiesto_es_el_unico_origen - AssertionError: literales del manifiesto escritos a mano: ['check-monorepo-invariants.sh:NN railway.toml']`.
  Revertir con `git checkout -- scripts/check-monorepo-invariants.sh`;
  `git status --porcelain scripts/check-monorepo-invariants.sh` → vacío.
- [x] 2.13 MUT-5 · IN-003. Hacer que `root=` se derive del contador global en vez del suyo (acoplar los
  dos resultados). Rojo:
  `FAILED ...::test_guard_reporta_raiz_por_separado - AssertionError: assert 'INVARIANTS root=PASS' in '...INVARIANTS root=FAIL scoping=FAIL...'`.
  Revertir + comprobar acotado.
- [x] 2.14 `bash scripts/check-monorepo-invariants.sh` → `root=PASS`; suite dos veces → `0 failed`.
  Commit `fix(infra): manifiesto único de invariantes y raíz limpia`.

---

## Fase 3 — Commit 3 · `fix(docker)`: el n8n local arranca con HMAC

- [x] 3.1 RED · IN-004 las tres variables. Test en `test_infra_manifest.py` que carga
  `backend/docker-compose.yaml` con `yaml.safe_load` (PyYAML 6.0.3 está en el venv) y comprueba que el
  servicio `n8n` declara cada `compose_required|n8n` del manifiesto. Salida:
  `FAILED ...::test_compose_declara_lo_obligatorio - AssertionError: faltan en el servicio n8n: ['N8N_WEBHOOK_SECRET', 'NODE_FUNCTION_ALLOW_BUILTIN=crypto', 'N8N_BLOCK_ENV_ACCESS_IN_NODE=false']`.
- [x] 3.2 RED · IN-004 mismo valor en los dos servicios. El literal de `N8N_WEBHOOK_SECRET` del servicio
  `n8n` y el del `backend` son la **misma expresión**. Salida:
  `FAILED ...::test_secreto_compartido_en_compose - AssertionError: el servicio backend no declara N8N_WEBHOOK_SECRET`.
- [x] 3.3 GREEN `backend/docker-compose.yaml:46-53` (n8n) y `:73-77` (backend): añadir las tres al
  servicio n8n y `N8N_WEBHOOK_SECRET=${N8N_WEBHOOK_SECRET:-dev-local-secret}` a **ambos**. Ningún
  secreto real en el fichero.
- [x] 3.4 MUT-6 · IN-004. Quitar `NODE_FUNCTION_ALLOW_BUILTIN` del servicio n8n. Rojo:
  `FAILED ...::test_compose_declara_lo_obligatorio - AssertionError: faltan en el servicio n8n: ['NODE_FUNCTION_ALLOW_BUILTIN=crypto']`.
  Revertir + `git status --porcelain backend/docker-compose.yaml` → vacío.
- [x] 3.5 Suite dos veces → `0 failed`. Commit `fix(docker): el n8n local recibe el secreto y crypto`.

---

## Fase 4 — Commit 4 · `test(n8n)`: las dos superficies que estaban a 0

Ficheros: `backend/tests/test_webhook_n8n_endpoint.py` (se amplía), `backend/tests/test_n8n_deployer.py`
(nuevo).

- [x] 4.1 Caracterización · NWI-003 tabla del contrato, vía `async_client` (`conftest.py:254`): body no
  parseable → 400; body `"[]"` → 400; firma ausente o inválida → 401; `type` desconocido con firma
  válida → 200 sin efecto lateral; `type=schedule_post_result` con firma válida → 200 e invoca
  `_notify_schedule_post_result` (espía). Verdes hoy: son cerraduras.
- [x] 4.2 Caracterización · NWI-003 `user_id` no `str`. Firma válida sobre
  `{"type":"schedule_post_result","user_id":{"$ne":None},...}` → 200 y **cero** llamadas a
  `inject_credentials_into_payload` y a `n8n_client.call_webhook` (espías). Verde por
  `webhooks.py:445`; su valor está en MUT-7.
- [x] 4.3 Caracterización · NWD-001 idéntico no se reescribe. `test_n8n_deployer.py` con
  `httpx.MockTransport` inyectado en el cliente del deployer: remoto con `nodes`/`connections`/`settings`
  idénticos al JSON local → **ninguna** petición `PUT`. Verde hoy (`_workflow_differs:46-59`); su valor
  está en MUT-8.
- [x] 4.4 Caracterización · NWD-001 resto de la tabla: no existe → `POST` + activar; difiere → `PUT` con
  el contenido local y reactivación si quedó inactivo; `401` → log de error y **sin excepción propagada**
  al lifespan.
- [x] 4.5 Caracterización · NWD-002 lock. Monkeypatch de `n8n_deployer._DEPLOY_LOCK_PATH` a `tmp_path`
  (**obligatorio**: el lock no se borra al terminar, por diseño; sin monkeypatch el segundo test sería
  un no-op silencioso). Con el lock ya tomado, la segunda invocación no emite ninguna petición de
  creación y termina sin excepción.
- [x] 4.6 RED · NWD-003 sin superficie muerta. Por AST, toda función de módulo pública de
  `app/infrastructure/n8n_deployer.py` tiene ≥1 llamador en `backend/app/**` o `backend/main.py`. Salida:
  `FAILED tests/test_n8n_deployer.py::test_deployer_sin_entradas_sin_llamadores - AssertionError: funciones sin llamadores: ['ensure_workflow']`.
  **Este es el RED que cierra la fase 5.**
- [x] 4.7 Caracterización · NWD-003 importadores. Ningún módulo bajo `app/presentation/` ni
  `app/infrastructure/tools/` importa `N8NDeployer`, y el único llamador de `deploy_all_workflows` es el
  lifespan (`main.py:339-341`).
- [x] 4.8 MUT-7 · NWI-003. Quitar `isinstance(user_id, str)` de `webhooks.py:445`. Rojo:
  `FAILED tests/test_webhook_n8n_endpoint.py::test_user_id_no_string_no_llega_a_mongo - AssertionError: expected call not found`
  (1 llamada a `inject_credentials_into_payload` frente a 0). Revertir +
  `git status --porcelain backend/app/presentation/api/v1/webhooks.py` → vacío.
- [x] 4.9 MUT-8 · NWD-001. Forzar `_workflow_differs` a devolver siempre `True`. Rojo:
  `FAILED tests/test_n8n_deployer.py::test_identico_no_se_reescribe - AssertionError: peticiones de actualización emitidas: ['PUT /api/v1/workflows/wf-1']`.
  Revertir + `git status --porcelain backend/app/infrastructure/n8n_deployer.py` → vacío.
- [x] 4.10 MUT-9 · NWD-002. Eliminar la adquisición del lock (`n8n_deployer.py:220-226`). Rojo:
  `FAILED ...::test_segunda_invocacion_es_no_op - AssertionError: peticiones de creación emitidas: ['POST /api/v1/workflows']`.
  Revertir + comprobar acotado.
- [x] 4.11 MUT-10 · NWD-003. Añadir `from app.infrastructure.n8n_deployer import N8NDeployer` en un
  módulo de `app/presentation/api/v1/`. Rojo:
  `FAILED ...::test_deployer_no_se_expone - AssertionError: N8NDeployer importado en: ['presentation/api/v1/integrations.py:12']`.
  Revertir + comprobar acotado.
- [x] 4.12 Suite dos veces → `0 failed`. Commit
  `test(n8n): contrato del webhook público y del deployer sin instancia real`.

---

## Fase 5 — Commit 5 · `chore`: borrar `ensure_workflow()`

- [x] 5.1 Borrar `backend/app/infrastructure/n8n_deployer.py:314-342` (`ensure_workflow`, **cero
  llamadores**, verificado con grep sobre `app/` y `main.py`). Es la superficie que insinúa que un
  workflow puede venir de fuera del repositorio.
- [x] 5.2 El RED 4.6 pasa a verde sin tocar el test. Suite dos veces → `0 failed`. Commit
  `chore(n8n): borrar ensure_workflow, código muerto sin llamadores`.

---

## Fase 6 — Commit 6 · `feat(security)`: replay protection con gracia caducable

Ficheros: `backend/app/core/config.py`, `backend/app/presentation/api/v1/webhooks.py`,
`backend/main.py`, `scripts/infra-manifest.conf`, tests en `test_webhook_n8n_endpoint.py` y
`test_infra_manifest.py`.

### RED

- [x] 6.1 RED · NWI-004 reenvío. Payload firmado con `timestamp` y `nonce` aceptado una vez (200, una
  notificación); reenviado idéntico dentro de la ventana → 200 `"already processed"` y **cero** segundas
  notificaciones. Salida:
  `FAILED tests/test_webhook_n8n_endpoint.py::test_reenvio_no_notifica_dos_veces - AssertionError: assert 2 == 1`.
- [x] 6.2 RED · NWI-004 fuera de ventana. `timestamp = now - 3600` con firma correcta → 401. Salida:
  `FAILED ...::test_fuera_de_ventana_se_rechaza - assert 200 == 401`.
- [x] 6.3 RED · NWI-004 la gracia conmuta. Con `N8N_REQUIRE_NONCE=False` (default) un payload **sin**
  `nonce` → 200; con `True` → 401. Salida:
  `FAILED ...::test_gracia_conmuta - AttributeError: 'Settings' object has no attribute 'N8N_REQUIRE_NONCE'`.
- [x] 6.4 RED · caducidad ejecutable. Con `ENVIRONMENT=production`, `N8N_REQUIRE_NONCE=False` y
  `N8N_NONCE_GRACE_DEADLINE` **inyectada en el pasado**, la validación de arranque (`main.py:87-96`)
  emite un `CRITICAL` que nombra `N8N_REQUIRE_NONCE`; con la fecha en el futuro o vacía, no lo emite.
  La fecha se inyecta: **el test no caduca por calendario**. Salida:
  `FAILED ...::test_deadline_vencido_avisa - AssertionError: no se emitió CRITICAL con el deadline vencido`.
- [x] 6.5 RED · el deadline vive en el manifiesto. `setting|-|N8N_NONCE_GRACE_DEADLINE=<ISO>` existe y,
  si trae valor, parsea con `datetime.fromisoformat`. El test **no** afirma ninguna fecha concreta.
  Salida: `FAILED tests/test_infra_manifest.py::test_deadline_declarado - AssertionError: falta setting N8N_NONCE_GRACE_DEADLINE`.

### GREEN

- [x] 6.6 `core/config.py:27-29` — `N8N_REQUIRE_NONCE: bool = False`,
  `N8N_NONCE_WINDOW_SECONDS: int = 300`, `N8N_NONCE_GRACE_DEADLINE: str = ""`. La ventana de 300 s es
  **hipótesis no verificada** (dos contenedores de Railway sin NTP comprobado): el dueño puede
  estrecharla tras observar el primer callback real.
- [x] 6.7 `webhooks.py:469-503` — tras verificar la firma: falta `nonce` y `N8N_REQUIRE_NONCE` → 401;
  `abs(now - timestamp) > N8N_NONCE_WINDOW_SECONDS` → 401; dedupe en Mongo, colección
  `n8n_webhook_nonces`, `find_one_and_update(_id=nonce, upsert=True, return_document=BEFORE)` e índice
  TTL; si existía → 200 `{"status": "already processed"}` **sin** dispatch. Patrón calcado del webhook
  de Stripe (`webhooks.py:161-177`, mismo fichero). **No** se usa Redis: `get_redis()` devuelve `None`
  sin Redis y el control desaparecería en silencio.
- [x] 6.8 `main.py`, bloque `:87-96` — si `is_production`, la gracia sigue activa y el deadline ya pasó,
  `logger.critical` nombrando `N8N_REQUIRE_NONCE` y la fecha. **No bloqueante**, mismo precedente que el
  CRITICAL de `N8N_WEBHOOK_SECRET`. **`prod_critical` (`:63-68`) no se toca** — eso sería IN-006.
- [x] 6.9 **Pregunta abierta parametrizada — la fecha la fija el dueño, no se inventa aquí.**
  `N8N_NONCE_GRACE_DEADLINE` queda **vacía** en `config.py` y como `<ISO>` en el manifiesto; con valor
  vacío no hay CRITICAL y nada se rompe. Condición de retirada, que se documenta en la fase 9:
  `check-n8n-health.sh` reporta `SPHERE - Schedule Post` activo con el JSON nuevo **y** ha pasado el
  horizonte máximo de programación de posts en vuelo (`Wait Until Scheduled` puede tardar días).
  Ningún test afirma una fecha concreta.

### Mutación

- [x] 6.10 MUT-11 · NWI-004. Eliminar el `find_one_and_update` del dedupe. Rojo:
  `FAILED ...::test_reenvio_no_notifica_dos_veces - AssertionError: assert 2 == 1`. Revertir +
  `git status --porcelain backend/app/presentation/api/v1/webhooks.py` → vacío.
- [x] 6.11 Suite dos veces → `0 failed`. Commit
  `feat(security): replay protection del webhook n8n con gracia caducable`.

---

## Fase 7 — Commit 7 · `feat(security)`: `schedule-post.json` firma `timestamp` y `nonce`

- [x] 7.1 RED · el nodo firma ambos campos. Test que carga
  `backend/infrastructure/n8n-workflows/schedule-post.json` con `json.load` y afirma que el `jsCode` del
  nodo `Sign Callback` construye `timestamp` y `nonce` **dentro** del objeto `payload`. Salida:
  `FAILED tests/test_infra_manifest.py::test_sign_callback_firma_nonce - AssertionError: 'nonce' no aparece en el payload de Sign Callback`.
- [x] 7.2 GREEN nodo `Sign Callback`: añadir al `payload`
  `timestamp: Math.floor(Date.now() / 1000)` y `nonce: crypto.randomUUID()` **antes** de `canon(payload)`,
  de modo que la firma los cubra. El `timestamp` se genera aquí (tras publicar), no al recibir: la
  ventana mide el tramo n8n→backend, no la espera del `Wait`. **No se toca `Verify Signature`.**
- [x] 7.3 Orden de reversión, al cuerpo del commit: revertir **siempre el 7 antes que el 6**. Con el 6
  revertido y el 7 vivo, n8n manda un `nonce` que el backend ignora (inocuo); al revés, el backend
  podría exigir un `nonce` que n8n ya no manda.
- [x] 7.4 Suite dos veces → `0 failed`. Commit `feat(security): schedule-post firma timestamp y nonce`.

---

## Fase 8 — Commit 8 · `feat(ops)`: `check-n8n-health.sh`

### RED (los cuatro con el script aún inexistente: `bash <ruta>` devuelve `rc 127`)

- [x] 8.1 RED · NWD-004 sin configuración. `subprocess.run(["bash", SCRIPT], env=<sin N8N_BASE_URL ni
  N8N_API_KEY>)` → `rc == 4`, y stdout+stderr no contienen ninguna frase `doc_forbidden` del manifiesto
  (ni afirma que exista ni que no exista). Salida:
  `FAILED tests/test_infra_manifest.py::test_health_sin_config_no_concluye - assert 127 == 4`.
- [x] 8.2 RED · NWD-004 **dos parsers independientes** sobre los mismos 18 JSON.
  `bash scripts/check-n8n-health.sh --list-expected` con entorno vacío y **sin red** → conjunto idéntico
  al que pytest deriva por su cuenta con `json.load(f)["name"]` sobre
  `backend/infrastructure/n8n-workflows/*.json`. Salida:
  `FAILED ...::test_conjunto_esperado_coincide - AssertionError: assert set() == {'SPHERE - Schedule Post', ...}`.
- [x] 8.3 RED · NWD-004 mata el `18` literal. `N8N_WORKFLOWS_DIR=<tmp_path>` con 2 JSON inventados →
  `--list-expected` devuelve esos 2 nombres. Salida:
  `FAILED ...::test_conjunto_sigue_al_directorio - AssertionError: assert 0 == 2`.
- [x] 8.4 RED · NWD-004 no filtra la API key. `N8N_BASE_URL=http://127.0.0.1:1` y
  `N8N_API_KEY=<centinela largo y único>` → `rc == 3`; el centinela no aparece en stdout+stderr **ni por
  prefijo** (ningún fragmento de ≥8 caracteres), y el script no contiene `set -x`. Salida:
  `FAILED ...::test_health_no_filtra_la_api_key - assert 127 == 3`.
- [x] 8.5 GREEN crear `scripts/check-n8n-health.sh`: `set -euo pipefail`, **sin `set -x`**, sólo lecturas.
  `--list-expected` recorre `${N8N_WORKFLOWS_DIR:-<repo>/backend/infrastructure/n8n-workflows}/*.json` y
  extrae el `name` con `grep -m1` (verificado: `"name"` es la **primera** clave en los 18, antes de
  `"nodes"`; no hace falta un parser JSON en bash). Sin `N8N_BASE_URL` o `N8N_API_KEY` → **exit 4** con
  mensaje que no afirma existencia. `curl -sS --max-time 5 "$N8N_BASE_URL/healthz"` y
  `GET /api/v1/workflows` con `X-N8N-API-KEY`: inalcanzable o no sana → **exit 3**; sana → recuento de
  presentes y activos frente al conjunto esperado y **exit 0**. Argumento desconocido → **exit 1** con
  `usage`. Nunca imprime `N8N_API_KEY` ni `N8N_WEBHOOK_SECRET`, ni parcialmente.
- [x] 8.6 MUT-12 · NWD-004. Escribir `EXPECTED_COUNT=18` en el script y usarlo en `--list-expected`.
  Rojo: `FAILED ...::test_conjunto_sigue_al_directorio - AssertionError: assert 18 == 2`. Revertir +
  `git status --porcelain scripts/check-n8n-health.sh` → vacío.
- [x] 8.7 MUT-13 · NWD-004. Añadir `echo "API key: $N8N_API_KEY"` al script. Rojo:
  `FAILED ...::test_health_no_filtra_la_api_key - AssertionError: el centinela aparece en la salida del script`.
  Revertir + comprobar acotado.
- [x] 8.8 Suite dos veces → `0 failed`. Commit
  `feat(ops): check-n8n-health.sh responde por el estado de la instancia`.

---

## Fase 9 — Commit 9 · `docs(deploy)`: una sola lista de variables, documentos decidibles

### RED

- [x] 9.1 RED · IN-005 coherencia. `DEPLOY_CHECKLIST.md` y `DEPLOYMENT_RUNBOOK.md` citan
  `check-n8n-health.sh`, y ningún `.md` de `docs/` contiene una frase `doc_forbidden` ni un
  `env_forbidden` del manifiesto. **Alcance explícito: sólo `docs/*.md`.** Quedan fuera `openspec/**`
  (las specs nombran `N8N_WEBHOOK_URL` a propósito) y la raíz (lleva ficheros sin seguir:
  `VISUAL_CHECK*.md`). Salida:
  `FAILED tests/test_infra_manifest.py::test_documentos_decidibles - AssertionError: frases prohibidas: ['DEPLOY_CHECKLIST.md:84 Falta desplegar el servidor n8n', 'DEPLOY_CHECKLIST.md:88 Deploy from Dockerfile', 'DEPLOY_CHECKLIST.md:97 N8N_WEBHOOK_URL', 'DEPLOYMENT_RUNBOOK.md:56 n8n-production-16d81.up.railway.app']`.
  Las cuatro frases se declaran en el manifiesto como `doc_forbidden`, con su motivo.
- [x] 9.2 RED · IN-002 **la lista del dueño en un único fichero**. El fichero es
  `scripts/infra-manifest.conf`: cada línea `env_required|<n8n|backend>|<NOMBRE>|<para qué sirve>` es la
  lista exacta que el dueño debe poner en Railway, con nombre y propósito. El test afirma (a) que el
  conjunto de nombres `env_required|n8n` del manifiesto **coincide exactamente** con el de la tabla de
  `docs/CONEXIONES_Y_N8N_SETUP.md` —vista humana, no segunda fuente— y (b) que ningún otro `.md` de
  `docs/` contiene **2 o más** de esos nombres. Salida:
  `FAILED ...::test_lista_de_variables_en_un_solo_sitio - AssertionError: documentos que declaran la lista por su cuenta: ['DEPLOY_CHECKLIST.md', 'FUNCIONALIDADES.md']`.

### GREEN

- [x] 9.3 `docs/CONEXIONES_Y_N8N_SETUP.md` — documento canónico: tabla derivada del manifiesto (nombre +
  para qué sirve, separada por servicio n8n / backend), enlace a `scripts/infra-manifest.conf` como
  origen de los nombres, sección «¿está viva la instancia?» que remite a
  `bash scripts/check-n8n-health.sh` (0 sana · 3 inalcanzable · 4 no determinable) y la condición
  escrita de retirada de la gracia del nonce (tarea 6.9). Sin secretos ni URLs inventadas.
- [x] 9.4 `docs/DEPLOY_CHECKLIST.md:84-99` — fuera «Falta desplegar el servidor n8n», fuera «Deploy from
  Dockerfile» (borraría el fichero de la fase 2 y reintroduciría el build FAILED), fuera la lista propia
  de variables y `N8N_WEBHOOK_URL`; en su lugar, enlace al doc canónico y al script.
- [x] 9.5 `docs/DEPLOYMENT_RUNBOOK.md:56` — la URL de n8n deja de afirmarse: vive en la variable
  `N8N_BASE_URL` del servicio backend (manifiesto) y de su estado responde el script. **`:37-38` se
  conserva**: la tabla de `source.image` es la premisa del borrado de la tarea 2.9.
- [x] 9.6 `docs/FUNCIONALIDADES.md:318` — sustituir la enumeración de variables por un enlace al doc
  canónico. **Desviación deliberada** del diseño, que no lista este fichero: con el umbral de 2 nombres
  del test 9.2 esa línea lo rompería, y una línea de cambio es más barata que aflojar la regla.

### Mutación

- [x] 9.7 MUT-14 · IN-005. Restaurar en `docs/DEPLOY_CHECKLIST.md` el texto «Falta desplegar el servidor
  n8n» y, en la misma pasada, una línea `N8N_WEBHOOK_URL=https://...`. Rojo:
  `FAILED ...::test_documentos_decidibles - AssertionError: frases prohibidas: ['DEPLOY_CHECKLIST.md:NN Falta desplegar el servidor n8n', 'DEPLOY_CHECKLIST.md:NN N8N_WEBHOOK_URL']`.
  Revertir con `git checkout -- docs/DEPLOY_CHECKLIST.md`;
  `git status --porcelain docs/DEPLOY_CHECKLIST.md` → vacío.
- [x] 9.8 Suite dos veces + guard con `root=PASS`. Commit
  `docs(deploy): una sola lista de variables y documentos decidibles`.

---

## Fase 10 — Verificación final

- [x] 10.1 Backend, desde `backend/`:
  `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci ./.venv/bin/python -m pytest tests/ -q`
  → **0 failed**. Total esperado: 335 (338 − los 3 de T-003) + los nuevos, es decir **≥ 338**.
- [x] 10.2 `bash scripts/check-monorepo-invariants.sh` → stdout con **`root=PASS`**. El código de salida
  sigue siendo 2 mientras `.github/workflows/ci.yml` no tenga `paths:` (fuera de alcance): el criterio
  es `root=PASS`, no `rc 0`.
- [x] 10.3 Repetir 10.1 **una segunda vez seguida** → `0 failed` en ambas pasadas. Dos corridas
  idénticas, o el resultado no cuenta (hay tests que tocan Mongo real y el rate-limiter por IP).
- [x] 10.4 `bash scripts/check-n8n-health.sh` sin configuración → `exit 4`; `--list-expected` con el
  directorio por defecto → los 18 nombres.
- [x] 10.5 Ninguna mutación viva: `git status --porcelain <fichero>` acotado a cada uno de los tocados
  por las 14 mutaciones → sólo aparecen los cambios de las 9 unidades de trabajo.
- [x] 10.6 Frontend intacto: este cambio no toca `frontend/`, así que su baseline de 827 se mantiene sin
  ejecutarlo. **Nunca se ejecuta un build.**
- [x] 10.7 IN-006 sin activar: `git diff` confirma que `backend/main.py:63-68` (`prod_critical`) no
  contiene `N8N_WEBHOOK_SECRET` y que el bloque `:87-96` sigue siendo un `logger.critical` no bloqueante.

---

## Pendiente del dueño (no bloquea ningún commit)

1. **Fecha de `N8N_NONCE_GRACE_DEADLINE`** (tarea 6.9). Se entrega vacía y parametrizada; el dueño la
   fija en Railway cuando se cumpla la condición escrita en `docs/CONEXIONES_Y_N8N_SETUP.md`.
2. **Confirmar `source.image` del servicio n8n en Railway** (tarea 2.9). El argumento del commit
   demuestra que el borrado no daña en ningún escenario; la confirmación es higiene, no una precondición.
3. **Variables de Railway**: la lista exacta, con nombre y propósito, queda en **un único fichero**,
   `scripts/infra-manifest.conf`, y `docs/CONEXIONES_Y_N8N_SETUP.md` la explica; el resto de documentos
   enlazan, y un test lo obliga.
