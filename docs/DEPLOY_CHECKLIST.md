# SPHERE — Checklist de Deploy a Producción (Railway)

> Topología: monorepo → 2 repos GitHub (backend + frontend). Railway construye
> cada servicio desde su subdirectorio y **despliega desde la rama `main`**.
> El deploy se dispara con `git push` a `backend/main` y `frontend/main`.

---

## 🔴 BLOQUEANTE #1 — Firebase (sin esto, TODO endpoint autenticado da 503)

El backend nuevo **rechaza con 503** todos los requests autenticados si Firebase no
se inicializa en producción (ver `backend/app/core/auth.py`). En Railway, en el
servicio **backend**, configura UNA de estas:

| Variable | Valor |
|---|---|
| `FIREBASE_CREDENTIALS_JSON` | **(recomendado en Railway)** El JSON completo del service account, en una sola línea. Consíguelo en Firebase Console → Project Settings → Service accounts → Generate new private key. |
| `FIREBASE_CREDENTIALS_PATH` | Ruta a un archivo de credenciales montado (no recomendado en Railway; usa el JSON). |

Sin una de las dos → `503 Servicio de autenticación no disponible`.

---

## Variables de entorno por servicio

### Servicio: **backend**

| Variable | Obligatoria | Notas |
|---|---|---|
| `MONGODB_URL` | ✅ | Connection string de MongoDB Atlas. |
| `DB_NAME` | — | Default `sphere_db`. |
| `ENVIRONMENT` | ✅ | `production`. |
| `FIREBASE_CREDENTIALS_JSON` | ✅ | Ver bloqueante #1. |
| `ALLOWED_ORIGINS` | ✅ | URL del frontend, p.ej. `https://frontendsphere-production.up.railway.app`. Coma-separado si hay varias. |
| `DEEPSEEK_API_KEY` | ✅ | Clave de DeepSeek. Los agentes usan **deepseek-v4-pro** (reasoning). |
| `DEEPSEEK_BASE_URL` | — | Default `https://api.deepseek.com`. |
| `OPENAI_API_KEY` | ✅* | Solo para **embeddings** (`text-embedding-3-small`) del RAG. |
| `FERNET_KEY` | ✅ (integraciones) | Cifra tokens OAuth en reposo. Genera: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `REDIS_URL` | — | Rate limiting (no-op si ausente). |
| **Stripe** (pagos) | ⬇️ | Ver sección Stripe. |
| **n8n** (tools) | ⬇️ | Ver sección n8n. |
| **OAuth** (integraciones) | ⬇️ | Ver sección OAuth. |

### Servicio: **frontend**

| Variable | Obligatoria | Notas |
|---|---|---|
| `VITE_API_URL` | ✅ | `https://backendshpere-production.up.railway.app/api/v1`. Se inyecta en runtime vía nginx sub_filter. |

---

## Stripe (pagos) — sin esto, la UI de pagos se oculta sola

Si `STRIPE_SECRET_KEY` está vacía, el frontend **oculta** los botones de pago y el
backend devuelve **503** claro (ya no un 500 críptico). Para activar pagos, en el
servicio **backend**:

```
STRIPE_SECRET_KEY=sk_live_...           # o sk_test_ para pruebas
STRIPE_WEBHOOK_SECRET=whsec_...         # del endpoint de webhook en Stripe

# Packs de recarga (compra puntual, los créditos no caducan)
STRIPE_PRICE_EXECUTIVE=price_...        # Executive Pack — 150 créditos — 39 €
STRIPE_PRICE_DIRECTOR=price_...         # Director Pack — 500 créditos — 139 €
STRIPE_PRICE_BOARDROOM=price_...        # Boardroom Pack — 2.000 créditos — 550 €

# Top-ups rápidos
STRIPE_PRICE_QUICK_MEETING=price_...    # Quick Meeting — 25 créditos — 7,99 €
STRIPE_PRICE_DEEP_DIVE=price_...        # Deep Dive — 50 créditos — 14,99 €

FRONTEND_URL=https://frontendsphere-production.up.railway.app
```

Son **cinco** precios y son exactamente estos cinco. Los lee `app/core/config.py`, los
mapea a SKU `app/infrastructure/stripe_client.py:_price_map()` y `PURCHASABLE_SKUS`
(`app/core/plan_limits.py`) es la lista de lo comprable. Si una variable no sale en
`config.py`, el backend no la lee: ponerla en Railway no hace nada.

> Esta sección listaba siete variables de la taxonomía anterior al pivote a mono-plan
> —`STRIPE_PRICE_STARTER`, `_PREMIUM`, `_TOPUP_FREE`, `_TOPUP_STARTER`,
> `_TOPUP_PREMIUM_1K/2K/10K`— que `config.py` ya no lee. Quien configurase desde aquí
> ponía siete variables inertes y cero de las cinco reales. Están retiradas.

Para crearlos sin tocar el dashboard: `python backend/scripts/stripe_bootstrap.py`
crea los productos y precios (es idempotente, deduplica por `lookup_key`) e imprime
las cinco líneas `STRIPE_PRICE_*=price_...` listas para pegar.

⚠️ Si `STRIPE_SECRET_KEY` está seteada pero falta algún `STRIPE_PRICE_*`, ese SKU
concreto **ya no se ofrece**: `GET /billing/me` lo deja fuera de `purchasable_skus` y su
tarjeta sale deshabilitada con «Pago no disponible temporalmente». Antes se ofrecía
igual y el clic moría en un `BILLING_INVALID_PLAN`. En cuanto pegues el precio que
falta, esa tarjeta se activa sola: no hay que desplegar nada.

Webhook de Stripe: apunta a `https://backendshpere-production.up.railway.app/api/v1/webhooks/stripe`.

---

## n8n (tools/automatización) — 3er servicio en Railway

Los agentes ejecutan herramientas (calendario, WhatsApp, LinkedIn, etc.) vía webhooks
de n8n. El código está completo (`app/infrastructure/tools/n8n_client.py`,
`app/infrastructure/n8n_deployer.py`, 18 workflows en `backend/infrastructure/n8n-workflows/`).
Lo que queda es **configuración**, y sólo se puede hacer desde el dashboard de Railway.

### ¿En qué estado está la instancia?

Este documento no lo afirma: lo responde el script, que sólo lee.

```bash
bash scripts/check-n8n-health.sh                 # 0 sana · 3 no sana · 4 no determinable
bash scripts/check-n8n-health.sh --list-expected # workflows esperados, sin usar la red
```

### Pasos en Railway

1. **Nuevo servicio** desde la **imagen oficial** `n8nio/n8n`. No se construye desde el
   repositorio: la raíz del monorepo no puede llevar configuración ni Dockerfiles (los dos
   repos reciben el árbol completo), y `bash scripts/check-monorepo-invariants.sh` lo verifica.
2. **Volumen**: monta un Railway Volume en `/home/node/.n8n`.
3. **Variables del servicio n8n y del backend**: la lista exacta, con el propósito de cada una,
   está en **[`CONEXIONES_Y_N8N_SETUP.md`](CONEXIONES_Y_N8N_SETUP.md)** (§2 y §3), derivada de
   [`scripts/infra-manifest.conf`](../scripts/infra-manifest.conf). No se repite aquí a propósito:
   una segunda copia es exactamente como las dos listas llegaron a contradecirse.
4. Abre la UI de n8n, crea el usuario admin y en **Settings → API** genera una API key para el
   backend.
5. Al arrancar, el backend auto-despliega los 18 workflows. Si no, impórtalos a mano desde
   `backend/infrastructure/n8n-workflows/`.

Sin la configuración del backend: la app funciona, pero las **tools de los agentes fallan en
silencio** (devuelven error dict). El chat normal y el board meeting sí funcionan.

---

## OAuth (integraciones GitHub / Notion / Slack)

El flujo OAuth está implementado y es seguro (state HMAC, tokens cifrados con Fernet).
Solo faltan credenciales. En el servicio **backend**:

```
GITHUB_CLIENT_ID=...        GITHUB_CLIENT_SECRET=...
NOTION_CLIENT_ID=...        NOTION_CLIENT_SECRET=...
SLACK_CLIENT_ID=...         SLACK_CLIENT_SECRET=...
OAUTH_REDIRECT_BASE_URL=https://backendshpere-production.up.railway.app/api/v1/integrations
FERNET_KEY=...              # ver sección backend
```

Callback URL a registrar en cada proveedor:
`https://backendshpere-production.up.railway.app/api/v1/integrations/{provider}/callback`

---

## Disparar el deploy

```bash
# Desde la raíz del monorepo, con la rama consolidada (master == feat/v3-thelastdance):
git push backend master:main      # despliega backend
git push frontend master:main     # despliega frontend
```

O usa `deploy.ps1` (Railway CLI). Verifica salud tras el deploy:

```
curl https://backendshpere-production.up.railway.app/api/v1/health/health
curl https://frontendsphere-production.up.railway.app/
```

---

## Orden recomendado

1. Setear `FIREBASE_CREDENTIALS_JSON` + `MONGODB_URL` + `DEEPSEEK_API_KEY` + `OPENAI_API_KEY` + `ALLOWED_ORIGINS` + `VITE_API_URL`. (mínimo para que la app funcione)
2. Push → deploy. Verificar login + chat + agentes.
3. Stripe (cuando quieras cobrar).
4. n8n (cuando quieras tools de agentes).
5. OAuth (cuando quieras integraciones).
