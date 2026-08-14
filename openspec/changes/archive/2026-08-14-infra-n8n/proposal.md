# Proposal: infra-n8n — dejar n8n configurado y verificable para el lanzamiento

> Base: `openspec/changes/lanzamiento-v1/auditoria-n8n.md`. Todo lo de abajo está reverificado en
> `feat/lanzamiento-e2e`. **Dos afirmaciones de la auditoría no se sostienen** (§Correcciones).

## Intent

El código n8n está terminado (18 tools ↔ 18 workflows JSON, verificado). Lo que falta es
configuración, y el checklist oficial la omite. Objetivo: dejar el repo correcto y **decidible**, y
entregar al dueño una lista exacta de lo que sólo él puede tocar en Railway.

## Correcciones a la auditoría (verificadas)

| # | Afirmación auditada | Realidad verificada |
|---|---|---|
| N5 | Secreto vacío ⇒ «CSRF de OAuth abierto» | **Falso.** `/connect` guarda el state en Mongo (`integrations.py:130-141`, requiere auth); el callback lo consume con `find_one_and_delete` **antes** del HMAC (`:167-171`). Un state forjado muere ahí. El HMAC es defensa secundaria; el nonce es `token_urlsafe(32)`. Queda real: HMAC truncado a 64 bits (`:75`) y acoplamiento de secretos. `CONEXIONES_Y_N8N_SETUP.md:30` propaga el error. |
| N4 | «Guard vs test: uno está equivocado» | **Los dos, asimétricamente** — y hay algo peor: `Dockerfile.n8n:8` tiene `VOLUME`, que `DEPLOYMENT_RUNBOOK.md:67-68,218-221` documenta como **build FAILED garantizado** en Railway (`docker VOLUME at Line 8 is not supported`). `test_ci_infra.py:285-293` **exige esa instrucción**: codifica un bug ya vivido como invariante. |

Extra: el guard **no corre en CI** (0 referencias en `.github/workflows/`), luego no bloquea nada
automáticamente; su 3ª violación (workflow sin `paths`) es ajena a n8n. Y `a692102`, el commit que el
runbook dice que borró los ficheros, **no existe en este repo**; volvieron en `65f91bd`.

## Veredicto N4

**Borrar `railway.toml` y `Dockerfile.n8n` de la raíz; corregir los 3 tests.** Argumento decisivo: si
el servicio n8n construyera desde `Dockerfile.n8n`, hoy estaría en build FAILED por el `VOLUME`; si usa
la imagen oficial (`DEPLOYMENT_RUNBOOK.md:37-38,50`: `source.image, repo=null`), ambos ficheros son
inertes. **En ningún escenario borrarlos causa daño**, y deja de sostenerse un fichero que reintroduce
un incidente conocido. La persistencia se logra con un Railway Volume + `N8N_USER_FOLDER`, no con
`VOLUME`. Los tests pasan a verificar la invariante correcta (raíz limpia, ningún Dockerfile con
`VOLUME`). El guard queda verde sin excepciones especiales.

## Scope

### In Scope
1. **C1 `fix(security)`** — guarda de secreto vacío en `_generate_state`/`_verify_state`; dejar de
   truncar el HMAC a 64 bits; corregir `CONEXIONES_Y_N8N_SETUP.md:30`.
2. **C2 `fix(infra)`** — borrar los 2 ficheros de raíz; reescribir `test_ci_infra.py:285-316`.
3. **C3 `fix(docker)`** — `docker-compose.yaml:46-53`: añadir `N8N_WEBHOOK_SECRET`,
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Desbloquea probar en local.
4. **C4 `docs(deploy)`** — reescribir `DEPLOY_CHECKLIST.md:84-107` con las 4 obligatorias;
   `WEBHOOK_URL` (no `N8N_WEBHOOK_URL`); quitar la opción «Deploy from Dockerfile».
5. **C5 `test(n8n)`** — cobertura mínima (§N6).
6. **C6 `feat(security)`** — replay protection: `timestamp`+`nonce` en `Sign Callback`
   (`schedule-post.json`), ventana temporal y dedupe en Redis. Patrón ya presente en el repo.
7. **C7 `chore`** — borrar `ensure_workflow()` (`n8n_deployer.py:314`, 0 llamadores).
8. **C8 `feat(config)`** — `N8N_WEBHOOK_SECRET` en `prod_critical` (`main.py:63-68`).
   **Va el último a propósito**: mergeado antes de que el dueño configure Railway, **impide arrancar
   el backend en producción**.
9. **C9 `feat(ops)`** — `scripts/check-n8n-health.sh` (§N7).

### Out of Scope
- **N8 — exponer el deployer a agentes.** Riesgo verificado: las dos variables que hacen falta para
  que n8n funcione (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`)
  convierten un workflow escrito por un LLM en **lectura de `$env`**, es decir exfiltración de
  `N8N_WEBHOOK_SECRET` y de las credenciales del entorno n8n. Siguiente hito, con modelo de amenazas propio.
- Desacoplar `OAUTH_STATE_SECRET`, rotación plural, rate-limit distribuido, persistir
  `schedule_post_result`, UI de automatizaciones, quitar «n8n» de `BillingPage.tsx:20`.
- Tocar Railway (no tengo acceso) y pinear la imagen de n8n.

## N6 — cobertura: qué merece la pena

| Merece la pena | Exagerado |
|---|---|
| `POST /api/v1/webhooks/n8n` con `AsyncClient`: 401 firma inválida/ausente, 400 JSON, `user_id` no-`str` (`webhooks.py:445`), `type` desconocido, happy path. Hoy **0 tests** sobre superficie pública sin auth. | Retry/circuit breaker de `call_webhook` (lógica de httpx, ya probada aguas arriba). |
| `n8n_deployer` con `httpx.MockTransport`: crear, actualizar-si-difiere, saltar-si-igual, 401. Decide si los 18 workflows llegan a prod; hoy **0 líneas**. | E2E contra instancia real en CI; perseguir un % global de cobertura. |

## N7 — hacerlo decidible sin inventar

No afirmar ni que existe ni que no. `C9` añade un script read-only que, con `N8N_BASE_URL` y
`N8N_API_KEY` del entorno, consulta `/healthz` y `GET /api/v1/workflows` y reporta cuántos de los 18
paths están presentes y activos. Los docs pasan de afirmar a **apuntar al script**.
`DEPLOY_CHECKLIST.md:84` y `DEPLOYMENT_RUNBOOK.md:56` dejan de contradecirse.

## Capabilities

### New Capabilities
- `n8n-webhook-ingress`: endpoint público sin auth — verificación de firma, replay protection, dispatch por `type`, rate-limit.
- `n8n-workflow-deployment`: auto-deploy idempotente de los 18 workflows, lock entre workers, sincronización.

### Modified Capabilities
- `infrastructure`: IN-001 hoy sólo exige `N8N_HOST/PORT/PROTOCOL/WEBHOOK_URL` y un `railway.toml` raíz con `[deploy.volume]`. Pasa a exigir las 4 obligatorias del servicio n8n + `SPHERE_BACKEND_URL`, y a prohibir `VOLUME` en Dockerfiles y config en la raíz.

## Frontera: repo vs. Railway

**Cerrable desde el repo (C1-C9):** todo lo anterior. **No tengo acceso a Railway**; nada de lo de
abajo puede hacerse ni verificarse desde aquí.

### Acciones del dueño en Railway (bloqueantes)

Generar el secreto una vez: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

**Servicio n8n** — las 4 obligatorias que faltan (`CONEXIONES_Y_N8N_SETUP.md:44-47`):

| Variable | Valor exacto |
|---|---|
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto` |
| `N8N_WEBHOOK_SECRET` | *(el secreto generado — idéntico al del backend)* |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` |
| `N8N_USER_FOLDER` | `/home/node` |

Y además: `SPHERE_BACKEND_URL` = URL pública del backend; `WEBHOOK_URL` = URL pública de n8n con `/`
final (**no** `N8N_WEBHOOK_URL`); `N8N_ENCRYPTION_KEY` (32+ aleatorio); `RAILWAY_RUN_UID=0`;
`N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false`; `N8N_HOST`, `N8N_PORT=5678`, `N8N_PROTOCOL=https`.
Montar un **Railway Volume en `/home/node/.n8n`** desde el dashboard.

**Servicio backend:** `N8N_BASE_URL` = URL pública de n8n · `N8N_WEBHOOK_SECRET` = *el mismo secreto* ·
`N8N_API_KEY` = API key creada en la UI de n8n.

**Confirmar y reportar:** si el servicio n8n usa imagen (`source.image`) o build desde Dockerfile.

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `backend/app/presentation/api/v1/integrations.py` | Modified | Guarda de secreto vacío; HMAC sin truncar |
| `backend/app/presentation/api/v1/webhooks.py` | Modified | Replay protection |
| `backend/app/main.py` | Modified | `N8N_WEBHOOK_SECRET` en `prod_critical` (C8) |
| `backend/app/infrastructure/n8n_deployer.py` | Modified | Borrar `ensure_workflow()` |
| `backend/infrastructure/n8n-workflows/schedule-post.json` | Modified | `timestamp`+`nonce` en `Sign Callback` |
| `railway.toml`, `Dockerfile.n8n` (raíz) | Removed | Inertes y con `VOLUME` prohibido |
| `backend/tests/test_ci_infra.py` | Modified | 3 tests reescritos |
| `backend/tests/test_webhook_n8n_endpoint.py`, `test_n8n_deployer.py` | New | Cobertura mínima |
| `backend/docker-compose.yaml`, `scripts/check-n8n-health.sh`, `docs/*` | Modified/New | Entorno local, verificación, docs |
| `frontend/**` | **Sin tocar** | Fuera de alcance |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **C8 impide arrancar el backend en producción** si Railway no tiene el secreto | Alta si se desordena | C8 va el último y **sólo se mergea** tras confirmación del dueño |
| Borrar los ficheros de raíz rompe el deploy de n8n | Baja | Si construyera desde el Dockerfile ya estaría FAILED; confirmar `source.image` antes de mergear C2 |
| HMAC sin truncar invalida states OAuth en vuelo | Media | Ventana de 10 min; desplegar en valle; el usuario reintenta |
| Replay protection desincroniza backend y workflow JSON | Media | Backend acepta payloads sin `nonce` durante una ventana de gracia; redesplegar workflows antes de exigirlo |
| `WEBHOOK_URL` no sea el nombre correcto en la versión desplegada | Baja | 2 fuentes internas coinciden (`docker-compose.yaml:53`, spec IN-001); el dueño confirma con C9 |

## Rollback Plan

Cada commit es independiente y revertible con `git revert` sin tocar los demás; ninguno migra datos.
- **C2** (el único con riesgo de infra): `git revert` restaura ambos ficheros y los 3 tests originales.
- **C8**: `git revert` devuelve el `logger.critical` no bloqueante y el backend vuelve a arrancar.
- **C6**: revertir el commit del backend **antes** que el JSON del workflow.
- Nada del repo cambia el estado de Railway; revertir código nunca borra variables ni el volumen.
- Baseline de retorno: **338 tests backend en verde** (reproducido hoy, 9.40s).

## Dependencies

- Acceso del dueño al dashboard de Railway (bloqueante para C8 y para la verificación final).
- Instancia n8n viva con API key para ejecutar C9.

## Success Criteria

- [ ] `bash scripts/check-monorepo-invariants.sh` no reporta violaciones de raíz.
- [ ] Suite backend en verde (≥338, más los nuevos tests de C5).
- [ ] `POST /api/v1/webhooks/n8n` y `n8n_deployer.py` dejan de tener 0 tests / 0 líneas cubiertas.
- [ ] `docker compose up` da un n8n cuyo nodo `Verify Signature` no revienta.
- [ ] `DEPLOY_CHECKLIST.md` lista las 4 obligatorias y no ofrece la opción de build rota.
- [ ] `check-n8n-health.sh` responde cuántos de los 18 workflows están activos.
- [ ] Ningún doc afirma a la vez que la instancia existe y que no existe.
