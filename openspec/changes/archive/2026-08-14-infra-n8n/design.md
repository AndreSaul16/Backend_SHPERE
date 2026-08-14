# Design: infra-n8n

## Technical Approach

Nada de esto es lógica nueva: son **cuatro duplicaciones** que divergieron. El diseño crea el punto
único de cada una y convierte la divergencia futura en un test rojo, no en una auditoría.

| Duplicación de hoy | Punto único |
|---|---|
| Guard y suite codifican las rutas de raíz por su cuenta (IN-002) | `scripts/infra-manifest.conf` |
| 4 superficies leen `N8N_WEBHOOK_SECRET` y se comportan distinto (NWI-001) | `app/core/signing.py` |
| `compare_digest` protegido en `webhooks.py:422-425`, desprotegido en `integrations.py:93` | `constant_time_equals()` |
| Los docs afirman el estado de la instancia (IN-005) | `scripts/check-n8n-health.sh` |

## Architecture Decisions

### D1 — Manifiesto: texto delimitado por `|` en `scripts/infra-manifest.conf`

**Elegido**: 4 columnas `kind|scope|value|note`, una regla por línea, `#` comentario.
**Descartado**: JSON y YAML. **Verificado en esta máquina: `jq` y `yq` NO están instalados**; PyYAML
6.0.3 sí está en el venv, pero eso sirve a pytest y no a bash.
**Rationale**: bash lo lee con `while IFS='|' read -r kind scope value note`; pytest con
`line.split("|", 3)`. Es el único formato que ambos leen con cero dependencias nuevas.

`kind` ∈ `root_forbidden`, `root_forbidden_glob`, `dockerfile_forbidden`, `env_required`
(scope `n8n|backend`), `env_forbidden`, `compose_required`, `setting`.

**Origen único comprobable** (mutación IN-002): `test_manifiesto_es_el_unico_origen` lee los `value`
del manifiesto y falla si alguno aparece como literal en las líneas no comentadas del guard o del
fichero de tests nuevo. Los tests de IN-001/002/003 viven en `backend/tests/test_infra_manifest.py`,
**no** en `test_ci_infra.py`, para que el literal legítimo `frontend/railway.toml` (T-004, otro
requisito) no dispare falsos positivos.

### D2 — IN-003: dos contadores y una línea legible por máquina

`ROOT_VIOLATIONS` y `SCOPING_VIOLATIONS` separados; el guard imprime
`INVARIANTS root=PASS scoping=FAIL` y **conserva** exit 2 si cualquiera falla — la violación de
`paths:` en `ci.yml` sigue visible. Flag `--only root|scoping` para el futuro gate de CI.
**Descartado**: exit code por bits (1 ya significa error de argumentos) y silenciar el scoping.
**Rationale**: el test afirma `root=PASS` con exit global 2. Si alguien acopla los contadores, cae solo.

### D3 — NWI-004: la gracia es el default, con caducidad ejecutable

`N8N_REQUIRE_NONCE: bool = False`. Orden obligatorio: **backend tolerante → JSON → flip por variable
de entorno**. Exigir el nonce antes de redesplegar rompe los workflows; y `Wait Until Scheduled` puede
tardar **días**, así que ejecuciones ya en vuelo seguirán firmando con el `Sign Callback` viejo incluso
después del redeploy.
**Descartado**: default `True` + `N8N_REQUIRE_NONCE=false` en Railway — repite exactamente la trampa
de IN-006: exige una acción del dueño en Railway *antes* de mergear.
**Que no sea indefinida**: `N8N_NONCE_GRACE_DEADLINE` (ISO) en el manifiesto; `main.py` emite
`CRITICAL` en producción si la fecha pasó y el flag sigue en `False` — precedente no bloqueante de
`main.py:91-96`. El test inyecta la fecha; no caduca por calendario.

**Dedupe en Mongo, no en Redis**: colección `n8n_webhook_nonces`, `_id = nonce`, índice TTL.
**Descartado**: Redis `SET NX EX` — `get_redis()` devuelve `None` si Redis no está y
`DistributedLock:34` degrada a *permitir*; un control antirreplay que desaparece en silencio no es un
control. Mongo es dependencia dura (sin `MONGODB_URL` el backend no arranca) y es el patrón ya citado
por la spec (`webhooks.py:161-177`, mismo fichero, mismo `db.get_sync_client()`).

### D4 — El secreto vacío se decide en un accesor, no en cuatro sitios

`app/core/signing.py` (nuevo, capa `core` = la más baja, sin violar capas):

```python
class N8NSecretMissing(RuntimeError): ...
def n8n_secret() -> str: ...          # lanza si ausente/vacío/solo espacios
def constant_time_equals(a, b) -> bool: ...   # compare_digest que nunca lanza
```

`canonical_sign` pasa a rechazar secreto vacío (defensa en profundidad del camino de firma). Cada
superficie traduce la excepción a su contrato: `verify_n8n_signature` → `False` (conserva su guarda
explícita y su log, NWI-001 lo exige); `_generate_state` → propaga y `connect_provider` responde 503
**antes** del `insert_one` (el orden actual, `:130` antes de `:134`, ya lo garantiza); `_verify_state`
→ `False`; `N8NClient.call_webhook` → dict de error, sin enviar la petición.

**La anti-olvido es estructural, no documental**: `test_secreto_tiene_un_solo_lector` afirma que
`N8N_WEBHOOK_SECRET` no se referencia bajo `backend/app/` fuera de `core/config.py` y `core/signing.py`.
Una quinta superficie futura no puede leer el secreto crudo sin poner el test en rojo.
**Descartado**: repetir `if not secret` en cada sitio (es el estado actual, y ya falló 3 de 4 veces).

### D5 — El `TypeError`: corrección real, alcance corregido

**Corrección a la spec, verificada.** `hmac.compare_digest("ñ", ...)` lanza `TypeError` (comprobado
ejecutando el intérprete del venv) y el `except (ValueError, IndexError)` de `_verify_state:98` no lo
captura: el 500 es real. Pero **hoy no es provocable desde fuera**: el único llamador es
`provider_callback:176`, y `find_one_and_delete({"state": state}):167` responde 400 antes si el state
no está en Mongo — y los únicos states en Mongo los produce `_generate_state`, que emite ASCII
(`token_urlsafe` + dígitos + hex). Es un bug **latente**, no una vía de 500 abierta. La propia
propuesta ya describía esa compuerta (§Correcciones N5); la nota de NWI-002 la pasó por alto.

**Dónde va el arreglo**: en `constant_time_equals()`, usado por las dos superficies. Sí conviene
unificarlas: la guarda gemela existía en una y faltaba en la otra — la definición de un patrón que
debe ser una función. Refuerzo: `test_compare_digest_no_se_usa_desnudo` afirma que
`hmac.compare_digest` no aparece bajo `backend/app/` fuera de `core/signing.py`.

### D6 — `check-n8n-health.sh`: read-only, tres desenlaces, dos parsers independientes

Comprueba `GET {N8N_BASE_URL}/healthz` y `GET {N8N_BASE_URL}/api/v1/workflows` (`X-N8N-API-KEY`,
`--max-time 5`). Salidas: `0` sana · `3` inalcanzable/no sana · `4` no determinable (falta config) ·
`1` error de uso. `4 ≠ 3` es lo que impide leer «sin configuración» como «no existe».

**Conjunto esperado**: `--list-expected` recorre `backend/infrastructure/n8n-workflows/*.json` y extrae
el `name` de nivel superior. Verificado: en los 18 ficheros `"name"` es la **primera** clave, antes de
`"nodes"`, así que `grep -m1` es suficiente y no hace falta un parser de JSON en bash. La fragilidad
queda acotada por el test, no por la esperanza.

**Cómo se prueba offline sin ser un test fantasma** — tres tests que ejercitan el script real:

| Test | Qué ancla |
|---|---|
| `bash check-n8n-health.sh --list-expected` con env vacío, **sin red** | Su salida **MUST** ser idéntica al conjunto que pytest deriva por su cuenta con `json.load(f)["name"]`. Dos parsers independientes sobre los mismos ficheros: si el grep se rompe o alguien escribe el `18`, divergen |
| Mutación del conjunto: `N8N_WORKFLOWS_DIR=<tmp_path>` con 2 JSON inventados | La salida refleja 2, no 18 — mata el literal escrito a mano |
| `N8N_BASE_URL=http://127.0.0.1:1` + `N8N_API_KEY=<centinela>` | exit 3 y el centinela **no** aparece en stdout+stderr ni por prefijo; y el script no contiene `set -x` |

Sin config → exit 4 y la salida no afirma existencia ni inexistencia (grep negativo sobre frases
prohibidas del manifiesto).

### D7 — NWD-002: se conserva el lock de fichero

`_DEPLOY_LOCK_PATH` (`n8n_deployer.py:35`) ya cumple el requisito para N workers de uvicorn en un
contenedor. **Descartado** migrar a `DistributedLock`: degrada a *permitir* sin Redis, que es
justamente el fallo que el lock evita. Limitación aceptada y documentada: no cubre N réplicas de
Railway. Los tests monkeypatchean `n8n_deployer._DEPLOY_LOCK_PATH` a `tmp_path` (el lock **no** se
borra al terminar, por diseño; sin monkeypatch el segundo test sería un no-op silencioso).

## Data Flow — replay protection y gracia

```
n8n «Sign Callback»                    backend POST /api/v1/webhooks/n8n
  payload = {type,user_id,platform,       1. rate-limit por IP
             success,detail,               2. json.loads → dict?          no → 400
             timestamp,nonce}  ──────►     3. constant_time_equals(HMAC)  no → 401
  signature = HMAC(canon(payload))         4. ¿falta nonce?
                                              ├ N8N_REQUIRE_NONCE=false → sigue (gracia)
                                              └ true                    → 401
                                           5. |now - timestamp| > ventana → 401
                                           6. Mongo n8n_webhook_nonces:
                                              find_one_and_update(_id=nonce, upsert,
                                                                  BEFORE)
                                              existía → 200 "already processed", sin WhatsApp
                                           7. dispatch por type
```

`timestamp` se genera en `Sign Callback` (tras publicar), no al recibir el webhook: la ventana mide el
tramo n8n→backend, no la espera del `Wait`.

## File Changes

| Fichero | Acción | Qué |
|---|---|---|
| `scripts/infra-manifest.conf` | Create | Origen único: rutas prohibidas, instrucciones prohibidas, vars por servicio, `N8N_NONCE_GRACE_DEADLINE` |
| `scripts/check-monorepo-invariants.sh` | Modify | Lee el manifiesto; contadores separados; `INVARIANTS root=… scoping=…`; `--only` |
| `scripts/check-n8n-health.sh` | Create | Read-only; exits 0/3/4/1; `--list-expected` |
| `railway.toml`, `Dockerfile.n8n` (raíz) | Delete | Inertes; el `VOLUME:8` garantiza build FAILED |
| `backend/app/core/signing.py` | Create | `N8NSecretMissing`, `n8n_secret()`, `constant_time_equals()` |
| `backend/app/core/config.py` | Modify | `N8N_REQUIRE_NONCE`, `N8N_NONCE_WINDOW_SECONDS` |
| `backend/app/presentation/api/v1/integrations.py` | Modify | HMAC sin `[:16]`; secreto vía accesor; comparación unificada |
| `backend/app/presentation/api/v1/webhooks.py` | Modify | Replay protection; comparación unificada |
| `backend/app/infrastructure/tools/n8n_client.py` | Modify | `canonical_sign` rechaza secreto vacío; `call_webhook` no envía sin secreto |
| `backend/app/infrastructure/n8n_deployer.py` | Modify | Borrar `ensure_workflow()` (`:314-342`) |
| `backend/main.py` | Modify | `CRITICAL` si venció el deadline de gracia. **IN-006 NO se toca** |
| `backend/infrastructure/n8n-workflows/schedule-post.json` | Modify | `timestamp` + `nonce` en `Sign Callback` |
| `backend/docker-compose.yaml` | Modify | 3 vars del servicio n8n; secreto compartido con el backend |
| `backend/tests/test_ci_infra.py` | Modify | Borrar los 3 tests de `T-003` (`:285-316`) |
| `backend/tests/test_infra_manifest.py` | Create | IN-001/002/003/004/005 + NWD-004 offline |
| `backend/tests/test_webhook_n8n_endpoint.py` | Create | NWI-001/003/004 vía ASGI |
| `backend/tests/test_n8n_deployer.py` | Create | NWD-001/002/003 con `httpx.MockTransport` |
| `backend/tests/test_oauth_state_signing.py` | Create | NWI-001/002 |
| `docs/CONEXIONES_Y_N8N_SETUP.md` | Modify | Doc canónico; corrige `:30`; condición de retirada de la gracia |
| `docs/DEPLOY_CHECKLIST.md`, `docs/DEPLOYMENT_RUNBOOK.md` | Modify | Apuntan al script y al doc canónico; fuera «Deploy from Dockerfile» y `N8N_WEBHOOK_URL` |

## Interfaces

```
# scripts/infra-manifest.conf — kind|scope|value|note   ('#' comentario, sin '|' en los campos)
root_forbidden|-|railway.toml|Configuraria backend y frontend a la vez
root_forbidden_glob|-|Dockerfile*|Un Dockerfile en la raiz arrastra el backend al build del frontend
dockerfile_forbidden|-|VOLUME|Railway aborta el build: VOLUME no soportado
env_required|n8n|WEBHOOK_URL|URL publica con barra final
env_forbidden|-|N8N_WEBHOOK_URL|Nombre inexistente; el correcto es WEBHOOK_URL
compose_required|n8n|NODE_FUNCTION_ALLOW_BUILTIN=crypto|Verify Signature usa require('crypto')
setting|-|N8N_NONCE_GRACE_DEADLINE=<ISO>|Tras esta fecha, main.py emite CRITICAL si la gracia sigue activa
```

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | `constant_time_equals`, `n8n_secret`, `canonical_sign` sin secreto, `_generate_state/_verify_state` | pytest directo; incluye `state="abc:1700000000:ñ"` → `False`, sin `TypeError` |
| Unit | Firma de 64 hex; mutación: firma = 16 primeros correctos → rechazada | pytest |
| Integración | `POST /api/v1/webhooks/n8n`: 400 / 401 / `type` desconocido / `user_id` no-str / happy path / replay / fuera de ventana / gracia on-off | `AsyncClient` + `ASGITransport` (fixture `async_client`, `conftest.py:254`) |
| Integración | Deployer: crear, actualizar-si-difiere, saltar-si-igual, 401 no aborta, lock | `httpx.MockTransport` + monkeypatch de `_DEPLOY_LOCK_PATH` |
| Estructural | Un solo lector del secreto · `compare_digest` sólo en `signing.py` · `N8NDeployer` sin importadores en `presentation/`/`tools/` · literales del manifiesto no duplicados | AST/lectura de ficheros bajo `backend/app/` |
| Ops offline | Guard (`root=PASS` con exit 2) y `check-n8n-health.sh` (3 desenlaces, conjunto derivado, no filtra la key) | `subprocess.run(["bash", …])`, sin red |

Comando: el del enunciado, desde `backend/`, con `./.venv/bin/python -m pytest tests/ -q`. Baseline
338 → **335 + nuevos** (los 3 tests de `T-003` se borran); el criterio ≥338 se cumple con margen.

## Migration / Rollout — orden de commits

| # | Commit | Verificación |
|---|---|---|
| 1 | `fix(security)`: `core/signing.py`, 4 superficies, HMAC sin truncar, `CONEXIONES:30` | Suite verde; states OAuth en vuelo se invalidan (ventana 10 min) |
| 2 | `fix(infra)`: manifiesto + guard + borrar los 2 ficheros de raíz + reemplazar `T-003` | `bash scripts/check-monorepo-invariants.sh` → `root=PASS`; suite verde |
| 3 | `fix(docker)`: `docker-compose.yaml` + test IN-004 contra el manifiesto | `docker compose up`: `Verify Signature` no revienta |
| 4 | `test(n8n)`: endpoint ASGI + deployer con `MockTransport` + estructurales | Cobertura de las 2 superficies que estaban a 0 |
| 5 | `chore`: borrar `ensure_workflow()` | El estructural de NWD-003 del paso 4 lo cubre |
| 6 | `feat(security)`: backend tolerante (`N8N_REQUIRE_NONCE=False`) + dedupe + deadline | Tests de replay con gracia on y off |
| 7 | `feat(security)`: `schedule-post.json` con `timestamp`+`nonce` | Revertir siempre 7 **antes** que 6 |
| 8 | `feat(ops)`: `check-n8n-health.sh` + sus 3 tests offline | exit 4 sin config; sin fuga del centinela |
| 9 | `docs(deploy)`: checklist, runbook y doc canónico + test de coherencia IN-005 | Ningún doc afirma el estado; ambos citan el script |

**Desviación del orden numérico de la propuesta, deliberada**: C4 (docs) pasa al final porque IN-005
exige citar `check-n8n-health.sh` (C9) y reflejar el manifiesto (C2); un doc escrito antes nacería
mintiendo. C5/C7 se adelantan a C6 para que el replay llegue con la superficie ya cubierta.
**C8 / IN-006 no se implementa**: mover `N8N_WEBHOOK_SECRET` a `prod_critical` impide arrancar
producción mientras la variable no esté en Railway.

Reversión: cada commit es independiente; ninguno migra datos. `n8n_webhook_nonces` se crea sola y
caduca por TTL, así que revertir el 6 no deja residuo funcional.

## Open Questions

- [ ] `N8N_NONCE_WINDOW_SECONDS`: propuesto **300 s**. El reloj de n8n y el del backend son dos
      contenedores distintos de Railway; sin NTP verificado, una ventana más estrecha rechazaría
      callbacks legítimos. **Hipótesis, no verificada** — el dueño puede estrecharla tras observar el
      primer callback real.
- [ ] `N8N_NONCE_GRACE_DEADLINE`: la fecha la fija el dueño. Condición escrita de retirada:
      `check-n8n-health.sh` reporta `SPHERE - Schedule Post` activo con el JSON nuevo **y** ha pasado
      el horizonte máximo de programación de posts en vuelo.
- [ ] Confirmar con el dueño que el servicio n8n usa `source.image` (riesgo del commit 2). El runbook
      lo afirma (`DEPLOYMENT_RUNBOOK.md:37-38`), pero no es verificable desde el repo.
