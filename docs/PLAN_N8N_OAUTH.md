# Plan: terminar n8n (CRASHED) + implementar OAuth BYO

## Contexto

Producción quedó estable (backend + frontend SUCCESS, observabilidad añadida:
`scripts/railway-doctor.py`, `docs/DEPLOYMENT_RUNBOOK.md`, banner FATAL de arranque
+ handler global de errores en `backend/main.py`). Quedan dos frentes, con
decisiones ya tomadas:

1. **n8n CRASHED** → arreglar el arranque (causa confirmada: permisos del Volume)
   con `RAILWAY_RUN_UID=0`, y completar la conexión backend↔n8n + import de workflows.
2. **OAuth BYO** → migrar de client IDs globales a "cada usuario trae su propia
   OAuth app" (GitHub/Notion/Slack).

---

## Frente A — n8n

### A1. Arreglar el arranque (causa CONFIRMADA: permisos del Volume)
Runtime logs (deploy `5c2f768a`): `Error: EACCES: permission denied, open
'/home/node/.n8n/config'` en `InstanceSettings.save`. El Railway Volume montado en
`/home/node/.n8n` es de `root`; n8n corre como `node` → no puede escribir.

**Fix (env-only):** en el servicio **n8n** (serviceId `111caf06-...`), vía GraphQL
`variableUpsert` (o dashboard):
- `RAILWAY_RUN_UID=0` → el contenedor corre como root y puede escribir el volumen.
- `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false` → n8n no aborta por permisos del
  config file al correr como root.

Redeploy n8n → `python scripts/railway-doctor.py n8n` debe pasar a SUCCESS y la UI
(https://n8n-production-16d81.up.railway.app) debe cargar.

**Fallback si Railway ignora `RAILWAY_RUN_UID` en servicios por imagen:** migrar a
Postgres — añadir servicio Postgres de Railway, `DB_TYPE=postgresdb` +
`DB_POSTGRESDB_HOST/PORT/DATABASE/USER/PASSWORD`, y eliminar el Volume (la clave de
cifrado ya está en `N8N_ENCRYPTION_KEY`, no se pierde nada).

### A2. Conexión backend ↔ n8n
Settings en `config.py:23-25`: `N8N_BASE_URL` (default `http://n8n:5678`),
`N8N_WEBHOOK_SECRET`, `N8N_API_KEY`. En el servicio **Backend_SHPERE**:
- `N8N_BASE_URL` = URL de n8n alcanzable desde el backend (dominio interno de
  Railway entre servicios, o la URL pública de n8n).
- `N8N_WEBHOOK_SECRET` = **mismo valor** que el del servicio n8n (HMAC de
  `n8n_client.py:55-59,144`).

### A3. API key + import de los 18 workflows (automático en arranque)
`deploy_all_workflows()` (`n8n_deployer.py:145`) corre en el lifespan del backend:
lista workflows (`GET /api/v1/workflows`) y crea/activa los que falten
(`POST`/`PATCH`), con header `X-N8N-API-KEY`. Si falta `N8N_API_KEY` o n8n no está
arriba, hace no-op y reintenta (no crashea — `n8n_deployer.py:240`).
Pasos (parte manual del usuario):
1. UI de n8n → crear cuenta admin.
2. Settings → n8n API → generar API key.
3. Setear `N8N_API_KEY` en Backend_SHPERE → redeploy → auto-importa los 16 `.json`
   de `backend/infrastructure/n8n-workflows/`.
4. Verificar en la UI que aparecen y están activos.

### A4. Notas/gaps (no bloqueantes)
- Los workflows esperan credenciales por-usuario en el payload (`user_credentials`,
  p.ej. `whatsapp-send.json`); algunos requieren credenciales en n8n. Es de uso.
- No existe handler de webhooks **n8n → backend** (`webhooks.py` solo tiene Stripe).
  Si algún workflow debe responder al backend, habría que añadirlo. No bloquea.

---

## Frente B — OAuth BYO (cada usuario su propia app)

**Estado actual (global):** 3 providers (`integrations.py:21-27`): GitHub/Notion/Slack.
Client IDs/secrets globales en `config.py:35-40`, leídos en 9 call sites
(`providers/github.py`, `notion.py`, `slack.py`, refresh en `credentials.py:204,225-226`).
Tokens por-usuario YA se guardan cifrados (Fernet, `FERNET_KEY`) en `oauth_credentials`
(`credentials.py:22-46,96-107`). Callback único/global (`OAUTH_REDIRECT_BASE_URL`,
`config.py:41`). Patrón a reusar: `service_credentials` (`credentials.py:250-375`).

**Cambios (medium, ~2-3 días backend):**

1. **Storage de la app del usuario** (cifrado con FERNET_KEY):
   - `database.py` → `get_user_oauth_apps_collection()` (colección `user_oauth_apps`).
   - `domain/models/oauth_app.py` (nuevo) — modelo OAuthApp.
   - `credentials.py` → `store_oauth_app` / `get_oauth_app` / `list_oauth_apps` /
     `revoke_oauth_app` (cifrar client_secret, nunca loguear).
2. **Parametrizar providers** (`providers/github.py:5-56`, `notion.py:5-44`,
   `slack.py:5-56`): `authorize_url(state, client_id, redirect_uri)` y
   `exchange_code(code, client_id, client_secret, redirect_uri)`; quitar `settings.*`.
3. **API de integraciones** (`integrations.py:66-154`): antes de `authorize_url`
   (L96) y `exchange_code` (L132), cargar `get_oauth_app(user_id, provider)`; si no
   hay app → 400 "registra tu OAuth app".
4. **Refresh** (`credentials.py:196-240`): Notion/Slack usan las creds de la app del
   usuario.
5. **Endpoints de gestión** (`auth.py`, tras L424): `POST /me/oauth-apps/{provider}`,
   `GET /me/oauth-apps` (sin secretos), `DELETE /me/oauth-apps/{provider}` (revoca
   tokens asociados).
6. **Config** (`config.py:35-40` + `main.py`): `*_CLIENT_ID/SECRET` opcionales.
   `FERNET_KEY` sigue obligatoria.
7. **Frontend** (adicional): UI en Settings para registrar client_id/secret y ver
   apps; doc de cómo crear la OAuth app en cada provider y qué callback whitelistear.

**Seguridad:** validar `redirect_uri` (open redirect); nunca loguear client_secret;
al revocar la app, revocar sus tokens; auditar scopes.

**Migración:** decidir si usuarios ya conectados con apps globales se mantienen
hasta reconexión o se fuerza re-registro (probablemente no hay aún en prod).

---

## Verificación (end-to-end)
- **n8n:** `python scripts/railway-doctor.py n8n` → SUCCESS; UI carga; tras
  `N8N_API_KEY`, los 18 workflows aparecen; un webhook de prueba responde.
- **OAuth BYO:** un usuario registra su app (`POST /me/oauth-apps/github`) →
  connect → callback → token cifrado en `oauth_credentials`; integración real
  funciona; `DELETE` revoca app + tokens. Tests espejo de `service_credentials`.

## Orden de ejecución
1. n8n A1 (arrancar) + verificar. 2. A2/A3 (conexión + API key + import). 3. OAuth
BYO fases 1→6, luego frontend (7).
