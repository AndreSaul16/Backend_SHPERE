# SPHERE — Runbook de Despliegue (Railway)

> **Propósito:** que nunca más perdamos una tarde sin saber *por qué* no sale un
> deploy. Documenta la topología, las **invariantes que deben cumplirse**, los
> **3 modos de fallo** del deploy (con los incidentes reales que hemos sufrido),
> y cómo diagnosticar cada uno en segundos.
>
> Herramienta de diagnóstico: [`scripts/railway-doctor.py`](../scripts/railway-doctor.py).
> Variables de entorno requeridas: [`DEPLOY_CHECKLIST.md`](../DEPLOY_CHECKLIST.md).

---

## 1. Topología (importante: monorepo → 2 repos)

SPHERE es **un monorepo** (`backend/` + `frontend/` + tooling en la raíz) que se
pushea a **dos repos de GitHub separados**, y cada uno alimenta un servicio de
Railway distinto:

```
  Monorepo local (rama master)
        │  git push backend  master:main
        ├────────────────────────────►  github.com/AndreSaul16/Backend_SHPERE
        │                                      │  (auto-deploy de la rama main)
        │                                      ▼
        │                                Railway service: Backend_SHPERE
        │                                  rootDirectory = backend
        │                                  build = backend/Dockerfile
        │
        │  git push frontend master:main
        └────────────────────────────►  github.com/AndreSaul16/Frontend_SPHERE
                                               │  (auto-deploy de la rama main)
                                               ▼
                                         Railway service: Frontend_SPHERE
                                           rootDirectory = "" (raíz)
                                           build = RAILPACK (autodetect)

  Railway service: n8n   → NO se construye del repo. Usa la imagen oficial
                           n8nio/n8n:latest. (source.image, repo=null)
```

**Consecuencia clave:** *ambos* repos reciben el árbol completo del monorepo,
incluido cualquier `.github/workflows/` y cualquier `Dockerfile`/`railway.toml`
de la raíz. Lo que pongas en la raíz afecta a los dos servicios. Esto es la
fuente de la mayoría de incidencias (ver §3).

| Servicio        | Repo / fuente              | rootDirectory | Builder    | Notas |
|-----------------|----------------------------|---------------|------------|-------|
| Backend_SHPERE  | repo Backend_SHPERE        | `backend`     | Dockerfile | usa `backend/railway.toml` + `backend/Dockerfile` |
| Frontend_SPHERE | repo Frontend_SPHERE       | `""` (raíz)   | RAILPACK   | autodetect; no requiere Dockerfile |
| n8n             | imagen `n8nio/n8n:latest`  | —             | —          | no se construye del repo |
| brave-art       | repo Frontend_SPHERE       | —             | RAILPACK   | **duplicado huérfano** del frontend; candidato a borrar |

URLs de producción:
- Backend:  https://backendshpere-production.up.railway.app
- Frontend: https://frontendsphere-production.up.railway.app
- n8n:      no se afirma aquí. La URL vive en la variable del servicio backend
  (ver [`CONEXIONES_Y_N8N_SETUP.md`](CONEXIONES_Y_N8N_SETUP.md)) y de su estado responde
  `bash scripts/check-n8n-health.sh` (0 sana · 3 no sana · 4 no determinable). Este documento
  y `DEPLOY_CHECKLIST.md` llegaron a afirmar cosas opuestas sobre esa instancia; por eso ya no
  la afirma ninguno.

---

## 2. Invariantes (si una se rompe, el deploy falla)

1. **`Backend_SHPERE` debe tener `rootDirectory=backend` y
   `railwayConfigFile=backend/railway.toml`.** Si no, Railway lee la
   configuración de la **raíz** del repo y construye lo que no debe.
   > Doc oficial: *el Config File NO sigue al Root Directory* — hay que fijar la
   > ruta del config file explícitamente.
2. **Ningún `Dockerfile` puede tener la instrucción `VOLUME`.** Railway no la
   soporta (usa Railway Volumes). Un `VOLUME` aborta el build.
3. **No debe haber `railway.toml` ni `Dockerfile*` en la RAÍZ del repo** salvo
   que sepas que aplican a ambos servicios. (Hoy n8n usa imagen, así que la raíz
   debe estar limpia.)
4. **No debe haber un `.github/workflows/` que bloquee deploys.** Railway está
   configurado para **esperar al check suite de GitHub**; si la CI falla, el
   deploy se marca **SKIPPED y ni siquiera compila** (ver §3, modo A). Una CI de
   monorepo corriendo en dos repos de un solo propósito es la forma equivocada.
5. **Las variables de entorno críticas deben estar en Railway** (no en `.env`,
   que no se sube). Si falta `MONGODB_URL`, o ni `FIREBASE_CREDENTIALS_JSON` ni
   `FIREBASE_CREDENTIALS_PATH`, el arranque aborta en producción. Lista completa
   en [`DEPLOY_CHECKLIST.md`](../DEPLOY_CHECKLIST.md).

---

## 3. Los 3 modos de fallo del deploy

Cuando "el deploy no sale", **siempre** es uno de estos tres. El truco es saber
*cuál* — y para eso está `railway-doctor.py` (§4).

### Modo A — SKIPPED (ni siquiera compiló)  ← incidente real 2026-06-08
- **Síntoma:** no hay logs de build; el estado del deploy es `SKIPPED`.
- **Causa:** Railway espera al check suite de GitHub y este **falló**. El motivo
  exacto está en `deployment.meta.skippedReason` (p.ej. `"CI check suite failed"`).
- **Incidente real:** un único `.github/workflows/ci.yml` del monorepo corría la
  suite completa (pytest + vitest) en **ambos** repos. `pytest` fallaba en el
  runner de CI porque `tests/` incluye tests de integración que necesitan
  credenciales reales (DeepSeek/OpenAI/Firebase) que la CI no tiene → check
  suite en rojo → **todos** los deploys SKIPPED.
- **Fix aplicado:** eliminado `ci.yml` (commit `286e39d`). Sin workflow no hay
  check suite que esperar. La CI se puede reintroducir bien hecha: por-repo,
  con scope a cada servicio y como check **no requerido**.

### Modo B — FAILED (falló el build)  ← incidente real 2026-06-08
- **Síntoma:** estado `FAILED`; **sí** hay build logs con el error.
- **Causa típica:** se construyó el Dockerfile equivocado o un Dockerfile inválido.
- **Incidente real:** el `railway.toml` de la **raíz** tenía
  `dockerfilePath = "Dockerfile.n8n"`, y ese Dockerfile tenía `VOLUME` en la
  línea 8. Como `Backend_SHPERE` no tenía su `rootDirectory` fijado, leía el
  config de la raíz y construía `Dockerfile.n8n` →
  `docker VOLUME at Line 8 is not supported` → build FAILED siempre.
- **Fix aplicado:** (1) fijado `rootDirectory=backend` +
  `railwayConfigFile=backend/railway.toml` en el servicio; (2) borrados los
  ficheros muertos `railway.toml` y `Dockerfile.n8n` de la raíz (commit `a692102`).

### Modo C — CRASHED / healthcheck falla (compiló pero no arranca)
- **Síntoma:** `CRASHED`, o `FAILED` tras agotar el healthcheck timeout. Build
  logs OK pero **runtime logs** con un traceback, o el contenedor sale solo.
- **Causa típica:** crash en el arranque (falta una env var crítica, no conecta
  a Mongo, Firebase mal configurado), o el healthcheck apunta mal / el puerto no
  expande.
- **Cómo se diagnostica:** el backend ahora imprime un **banner FATAL** que nombra
  la fase de arranque que petó (`env` / `mongodb` / `firebase` / ...) — ver §5.
  Los runtime logs se ven en el dashboard o con `railway logs` (o, por API,
  `deploymentLogs(deploymentId)` — que es donde sale el error de runtime, NO
  `buildLogs`).
- **Incidente real (n8n, 2026-06-08):** `CRASHED` con
  `Error: EACCES: permission denied, open '/home/node/.n8n/config'` en los
  *runtime logs*. El Railway Volume montado en `/home/node/.n8n` pertenece a
  `root`, pero la imagen `n8nio/n8n` corre como el usuario `node` → no puede
  escribir su config. **Fix:** poner `RAILWAY_RUN_UID=0` (el contenedor corre como
  root y puede escribir el volumen) + `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false`
  (n8n no aborta por los permisos del config al correr como root). RESUELTO.

### Modo D — 502 (compiló, arrancó, pero el edge no enruta)  ← incidente real 2026-06-08
- **Síntoma:** el deploy está en `SUCCESS` y los **runtime logs dicen que el
  servidor escucha** (`Editor is now accessible via: https://...`), pero la URL
  pública devuelve **HTTP 502** de forma persistente (no es un cold-start).
- **Causa:** el dominio público del servicio tiene **`targetPort: null`**.
  Railway intenta autodetectar el puerto del contenedor; si la app **no escucha en
  el `PORT` que Railway inyecta** (n8n usa su propio `N8N_PORT=5678` e ignora
  `PORT`), la autodetección falla y el proxy no sabe a qué puerto enrutar → 502.
- **Fix aplicado (n8n):** fijar el `targetPort` del dominio a **5678** vía
  `serviceDomainUpdate` (cambio de proxy en el edge; aplica en segundos, **sin
  redeploy**). Comprobar con `domains(projectId,environmentId,serviceId){
  serviceDomains{ id domain targetPort } }`.
- **Regla general:** para servicios por **imagen** que escuchan en un puerto fijo
  (no en `PORT`), hay que **fijar el `targetPort` del dominio** explícitamente.

---

## 4. Diagnóstico en un comando: `railway-doctor.py`

```bash
python scripts/railway-doctor.py                 # todos los servicios
python scripts/railway-doctor.py Backend_SHPERE  # filtra por nombre
python scripts/railway-doctor.py --logs 80       # más líneas de build log
python scripts/railway-doctor.py --json          # salida JSON para CI
```

El flag `--json` produce un array `[{service, status, sha, error, failure_mode}]`
consumible por GitHub Actions y otros sistemas de automatización.

Para cada servicio imprime su config de build y el estado del último deploy, y
**si está bloqueado, el motivo exacto**: `skippedReason` (modo A) o las últimas
líneas de build logs con el error (modo B). Sale con código 1 si algún servicio
no está en SUCCESS (útil para automatizar).

Token: lee `RAILWAY_API_TOKEN`, `RAILWAY_TOKEN_SECRET`, o el `.env` de la raíz.
(El token es de cuenta — trátalo como secreto, no lo subas ni lo pegues en logs.)

> Nota técnica: la API de Railway está tras Cloudflare, que bloquea el
> `User-Agent` por defecto de `urllib` (error 1010). El script manda un UA de
> `curl`, que sí pasa. Si escribes tus propias llamadas, usa `curl` o pon un UA.

---

## 5. Consultas GraphQL crudas (por si el script no basta)

Endpoint: `POST https://backboard.railway.app/graphql/v2`
Header: `Authorization: Bearer <RAILWAY_TOKEN_SECRET>` (+ `User-Agent: curl/8`).

```graphql
# Config actual de un servicio (rootDirectory, railwayConfigFile, builder)
query($id:String!){ service(id:$id){ name serviceInstances{ edges{ node{
  rootDirectory railwayConfigFile builder healthcheckPath } } } } }

# Último(s) deploy(s) de un servicio: status + meta (skippedReason, commit, ...)
query($sid:String!,$eid:String!){ deployments(first:3, input:{serviceId:$sid,
  environmentId:$eid}){ edges{ node{ id status meta } } } }

# Logs de build de un deploy (el CLI NO muestra los de deploys fallidos)
query($id:String!){ buildLogs(deploymentId:$id, limit:120){ message severity } }
```

Fijar las invariantes del backend por API (lo que arregló el incidente):

```graphql
mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){
  serviceInstanceUpdate(serviceId:$serviceId, environmentId:$environmentId, input:$input)
}
# variables.input = { "rootDirectory":"backend", "railwayConfigFile":"backend/railway.toml" }
```

Setear/actualizar una variable de entorno (dispara redeploy en build-services):
```graphql
mutation($input:VariableUpsertInput!){ variableUpsert(input:$input) }
# input = { projectId, environmentId, serviceId, name, value }
```

Fijar el puerto destino del dominio (arregla el 502 del modo D). OJO: `domain` es
obligatorio (NON_NULL) en el input, hay que reenviarlo:
```graphql
mutation($input:ServiceDomainUpdateInput!){ serviceDomainUpdate(input:$input) }
# input = { serviceDomainId, domain, environmentId, serviceId, targetPort:5678 }
```

Forzar un redeploy del último build de un servicio:
```graphql
mutation($sid:String!,$eid:String!){ serviceInstanceRedeploy(serviceId:$sid, environmentId:$eid) }
```

IDs del proyecto SPHERE (entorno `production`):
- projectId      `444961a0-0355-4809-813f-b50ba32ec7f9`
- environmentId  `d9a8784b-0ee7-4c0b-a557-1c0e805dff29`
- Backend_SHPERE `350cbcf8-df90-43ac-b493-b49b764c7487`
- Frontend_SPHERE `47f36c7d-97af-4c0d-830a-59cae0cd172d`
- n8n            `111caf06-5c72-4f45-a2d2-1a85f5616279`

---

## 6. Observabilidad de la aplicación (runtime)

- **Logs:** logger estructurado con timestamp, nivel y `módulo:línea`
  ([`backend/app/core/logger.py`](../backend/app/core/logger.py)). Sale a `stdout`
  → visible en Railway.
- **Banner FATAL de arranque:** el `lifespan` envuelve cada fase del arranque
  (`env`, `mongodb`, `firebase`, `redis`, `n8n`, `tools`). Si una peta, imprime
  un bloque inconfundible `FATAL STARTUP FAILURE — phase=<fase>` con el error
  antes de abortar, así el runtime log dice *exactamente* qué impidió arrancar.
- **Handler global de excepciones:** cualquier excepción no controlada en una
  request se loguea con traceback completo en servidor y devuelve un 500
  saneado al cliente (`{"error":"common.internal_error", ...}`), sin filtrar
  stack traces ni nombres de colecciones.
- **Health checks:**
  - `GET /api/v1/health/live`  → liveness puro (siempre 200 si el proceso vive).
  - `GET /api/v1/health/ready` → readiness (Mongo/Redis); 200 con el detalle.
  - `GET /api/v1/health/health`→ el que usa el healthcheck de Railway.
  - `GET /api/v1/health/deploy`→ **NUEVO** — devuelve `{ commit_sha, build_timestamp, deploy_status, service_name, version }` sin auth ni queries a DB. Responde en <1ms. El `deploy_status` es `"live"` cuando `GIT_COMMIT_SHA` y `BUILD_TIMESTAMP` están definidos (inyectados por Railway), o `"deploying"` cuando no.
- **Página de estado pública:** `GET /status` (frontend) — muestra tarjetas por servicio con indicadores de color:
  - 🟢 Verde: Live
  - 🟡 Amarillo: Deploying
  - 🔴 Rojo: Unreachable
  - ⚫ Gris: Unknown
  - El frontend inyecta su propio SHA y timestamp en build-time vía Vite `define`.
- **Códigos de error:** taxonomía en [`backend/app/core/errors.py`](../backend/app/core/errors.py)
  (`<dominio>.<estado>`), para mapear código→acción en frontend y agrupar en logs.

### Mejoras implementadas (2026-06-09)

- **Guard de invariantes:** `scripts/check-monorepo-invariants.sh` — verifica que no
  haya `.github/workflows/`, `railway.toml`, ni `Dockerfile*` en la raíz del
  monorepo. Sale con exit code 2 si encuentra violaciones, reportando TODAS
  (no solo la primera) y explicando POR QUÉ cada una es peligrosa.
- **CI por-repo no bloqueante:**
  - `backend/.github/workflows/ci-backend.yml` → pytest (unit only), non-required.
  - `frontend/.github/workflows/ci-frontend.yml` → vitest + tsc + eslint, non-required.
  - Ambos triggers: push a main + workflow_dispatch.
- **Deploy Monitor (GitHub Actions):**
  - `backend/.github/workflows/deploy-monitor.yml` y
    `frontend/.github/workflows/deploy-monitor.yml` — poll de Railway GraphQL cada
    30s × 10 intentos tras cada push. Setea commit status (`pending` → `success` /
    `failure` / `error`) y auto-crea GitHub Issue en failure con el contexto del
    error. Deduplica issues existentes por label `deploy-failure`.
  - Requiere secrets: `RAILWAY_API_TOKEN` y `RAILWAY_PROJECT_ID`.
- **`railway-doctor.py --json`:** salida estructurada `[{service, status, sha, error,
  failure_mode}]` para consumo automatizado en CI/ monitoreo.

### Mejoras futuras recomendadas (no implementadas)
- Logs en **JSON** en producción (parseables por agregadores) tras un flag
  `LOG_FORMAT=json`.
- **Sentry** (o similar) para alertas de errores de runtime con contexto.
- E2E tests para la página de status (no críticos — la página solo muestra datos).

---

## 7. Checklist rápida cuando "no sale el deploy"

1. `python scripts/railway-doctor.py` → ¿qué servicio y qué estado?
2. ¿`SKIPPED`? → mira `skippedReason`. ¿Es CI? → §3-A.
3. ¿`FAILED`? → lee los build logs que imprime el doctor. ¿Dockerfile/VOLUME/
   config de raíz? → §3-B. Verifica las invariantes §2.
4. ¿`CRASHED` / healthcheck? → revisa runtime logs (`railway logs` o dashboard) y
   busca el banner `FATAL STARTUP FAILURE`. ¿Falta una env var? → §2.5 +
   `DEPLOY_CHECKLIST.md`.
5. Tras arreglar: `git push backend master:main` (y/o `frontend`), y vuelve a
   correr el doctor hasta ver `VEREDICTO: todos los servicios con último deploy OK`.
