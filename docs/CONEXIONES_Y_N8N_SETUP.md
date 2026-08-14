# Conexiones + herramientas n8n — guía de activación

**Fecha:** 2026-06-12

Esta guía cubre lo necesario para que las **herramientas de los agentes** (Calendar, WhatsApp, LinkedIn, Instagram, finanzas, Jules) funcionen para usuarios reales, y para que la **página de Conexiones** (`/settings/integrations` y `/settings/contacts`) opere al 100%.

El código ya está completo (registry de tools, cliente n8n, auto-deploy de workflows, inyección de credenciales cifradas, CRUD de contactos, OAuth). Lo que queda es **configuración de entorno + un instancia n8n**, que es responsabilidad de operación (no de código).

---

## 1. Qué ya funciona en el código (tras este PR)

- **Auto-deploy de workflows n8n**: en cada arranque del backend, `deploy_all_workflows()` sube y activa los 18 workflows de `backend/infrastructure/n8n-workflows/`. Ahora además **actualiza** los que cambian de contenido (antes solo creaba los que faltaban).
- **Contactos CRUD**: arreglado el bug por el que los contactos volvían sin `id` y no se podían borrar. Añadir/listar/borrar funciona en la UI.
- **Google Calendar por OAuth**: Calendar ya NO se conecta con una "api_key" (que Google rechaza) — ahora es OAuth real (`/settings/integrations` → Google Calendar). El token se auto-refresca y se inyecta en los workflows de calendario.
- **Inyección multi-tenant de credenciales**: cada llamada a n8n lleva las credenciales cifradas del usuario (`user_credentials` en el payload).

---

## 2. Variables de entorno (Railway — servicio backend)

> **Este documento es la única explicación de la lista.** Los *nombres* viven en
> [`scripts/infra-manifest.conf`](../scripts/infra-manifest.conf), que es lo que leen el guard de
> invariantes y la suite de backend. Si añades una variable, añádela allí: un test comprueba que
> esta tabla y el manifiesto coinciden, y que ningún otro documento declara la lista por su cuenta.

<!-- manifiesto:backend -->

| Variable | Para qué |
|---|---|
| `N8N_BASE_URL` | URL del n8n al que el backend despliega workflows y llama webhooks |
| `N8N_API_KEY` | API key de n8n para crear y activar workflows (Settings → API en la UI de n8n) |
| `N8N_WEBHOOK_SECRET` | El mismo secreto que el servicio n8n; sin él la integración queda apagada |

<!-- /manifiesto:backend -->

Además, no específicas de n8n: `FERNET_KEY` (cifrado de credenciales de usuario;
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) y
`OAUTH_REDIRECT_BASE_URL` (base del callback OAuth, `https://<tu-backend>/api/v1/integrations`).

Genera el secreto compartido **una vez** y ponlo idéntico en los dos servicios:

```
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

> ⚠️ Sin `N8N_BASE_URL` los workflows no se despliegan y las tools fallan con error claro (no crashea). Sin `FERNET_KEY` el backend no arranca (lo viste en los tests).
>
> Con el secreto compartido vacío la integración queda **apagada, no abierta**: el webhook rechaza toda firma (401), `/connect` responde 503 sin emitir ni guardar state, y el cliente no llega a llamar a n8n. **No es un CSRF de OAuth**: el callback consume el state con `find_one_and_delete` *antes* de mirar el HMAC (`app/presentation/api/v1/integrations.py`), así que un state forjado muere ahí. Lo que sí era real —y este cambio corrige— es que la firma del state se truncaba a 64 bits y que un mismo secreto firma dos cosas distintas (webhooks n8n y state OAuth); desacoplarlos queda pendiente.

---

## 3. Instancia n8n

El servicio n8n usa la **imagen oficial** `n8nio/n8n` configurada por servicio en el dashboard de
Railway. No se construye desde el repositorio: un `Dockerfile` en la raíz afectaría también al
build del frontend, y el que existía declaraba una instrucción que Railway no soporta y que aborta
el build. La persistencia se logra con un **Railway Volume montado en `/home/node/.n8n`** más la
variable de carpeta de usuario, nunca con esa instrucción.

1. Crea el servicio desde la imagen y monta el volumen.
2. Configura las variables de la tabla de abajo.
3. Abre la UI, crea el usuario admin y en **Settings → API** genera la API key → va al backend.
4. Reinicia el backend: en el log verás `📦 Deployando 18 workflows a n8n...`. El usuario nunca
   toca n8n.

**Variables del servicio n8n (Railway).** El dueño las configura a mano; ninguna se puede poner
desde el repositorio:

<!-- manifiesto:n8n -->

| Variable | Para qué |
|---|---|
| `N8N_HOST` | Host público del servicio n8n |
| `N8N_PORT` | Puerto en el que escucha n8n (`5678`) |
| `N8N_PROTOCOL` | Esquema de las URLs que n8n genera (`https` en Railway) |
| `WEBHOOK_URL` | URL pública de n8n **con barra final**; éste es el nombre correcto de la variable |
| `N8N_USER_FOLDER` | `/home/node`. ⚠️ **Sin ella se pierde TODO en cada redeploy**: n8n corre como root y guardaría la base en `/root/.n8n`, fuera del volumen. Incidente real del 2026-06-12: un redeploy borró workflows y API key |
| `N8N_ENCRYPTION_KEY` | Cifra las credenciales que n8n guarda; si cambia, dejan de descifrarse (32+ caracteres aleatorios) |
| `DB_TYPE` | Motor de persistencia de n8n (`sqlite` sobre el volumen montado) |
| `SPHERE_BACKEND_URL` | URL pública del backend a la que los workflows devuelven el callback firmado |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto`. El nodo `Verify Signature` lo necesita para el HMAC |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false`. n8n bloquea el acceso al entorno en nodos Code y el nodo de verificación lee el secreto de ahí |
| `N8N_WEBHOOK_SECRET` | El mismo secreto que el backend; firma y verifica los webhooks en ambos sentidos |

<!-- /manifiesto:n8n -->

> **Además, del incidente de permisos del volumen** (2026-06-08): el servicio n8n necesita también
> las dos variables que documenta el post-mortem de [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md)
> (Modo C: `CRASHED` por `EACCES` al escribir en el volumen). No se declaran en el manifiesto porque
> no son un requisito de los workflows sino el arreglo de ese incidente, y su explicación —con el
> síntoma y el diagnóstico— vive allí.

> Las dos últimas del bloque de verificación (`NODE_FUNCTION_ALLOW_BUILTIN` y el acceso al entorno)
> son obligatorias para que el HMAC funcione **y** son exactamente las que harían peligroso permitir
> que un workflow lo escriba un LLM: podría leer el entorno y exfiltrar el secreto. Por eso el
> deployer no se expone a los agentes, y un test lo impide.

> Recomendado: **pinear la imagen** a una versión concreta (ej. `n8nio/n8n:2.25.7`) en vez de
> `latest` — un redeploy con `latest` puede saltar de major version sin avisar.

### ¿Está viva la instancia? Lo dice el script, no este documento

```bash
bash scripts/check-n8n-health.sh                 # 0 sana · 3 no sana · 4 no determinable
bash scripts/check-n8n-health.sh --list-expected # los workflows esperados, sin usar la red
```

`4` significa «faltan `N8N_BASE_URL` o `N8N_API_KEY` en tu entorno», **no** «la instancia no
existe». Ningún documento del repositorio afirma el estado de la instancia: se pregunta al script.

### Cuándo cerrar la gracia del nonce

El webhook de n8n acepta todavía callbacks **sin** `nonce` (`N8N_REQUIRE_NONCE=false`), porque las
ejecuciones ya en vuelo siguen firmando con el nodo antiguo y `Wait Until Scheduled` puede tardar
días. Condición escrita para cerrarla:

1. `check-n8n-health.sh` reporta `SPHERE - Schedule Post` **activo** con el JSON nuevo, **y**
2. ha pasado el horizonte máximo de programación de los posts que estaban en vuelo.

Entonces: pon `N8N_REQUIRE_NONCE=true` en el backend. Si además fijas `N8N_NONCE_GRACE_DEADLINE`
(fecha ISO), el arranque emitirá un `CRITICAL` mientras la gracia siga abierta pasada esa fecha.

---

## 4. Conectar servicios (lo hace cada usuario en `/settings`)

### Google Calendar (OAuth — recomendado)
1. El usuario crea una OAuth app en Google Cloud Console → Credentials → OAuth client ID (tipo Web).
2. Habilita la **Google Calendar API** en ese proyecto.
3. Añade la Callback URL que muestra la UI (`.../api/v1/integrations/google/callback`) a los *Authorized redirect URIs*.
4. Pega `client_id` + `client_secret` en SPHERE → Conexiones → Google Calendar → "Guardar app" → "Conectar".
5. Autoriza en Google. Listo: los agentes pueden gestionar su calendario.

> Alternativa sin fricción para el usuario: registrar UNA OAuth app de Google de SPHERE y compartir su `client_id/secret` por defecto (requiere pantalla de consentimiento verificada por Google). Hoy el flujo es BYO (cada usuario su app), igual que GitHub/Notion/Slack.

### WhatsApp / LinkedIn / Instagram (api_key / token — `/settings/integrations` → credenciales)
- Estos aceptan tokens de larga duración pegables: el usuario pega el `access_token` (y `phone_number_id` para WhatsApp; `instagram_account_id` para Instagram). Se cifran con Fernet.
- El botón "Test" valida contra la API real en WhatsApp, LinkedIn, Instagram y Datos financieros. **LinkedIn además deriva y guarda automáticamente el URN de tu perfil** (necesario para publicar) — pulsa "Probar conexión" al menos una vez tras pegar el token. Jules no ofrece verificación previa: se valida en el primer uso.
- **Datos financieros (CFO)**: el usuario pega su API key de Alpha Vantage (gratuita en alphavantage.co) para que el CFO consulte noticias, cotizaciones y análisis de mercado.
- Nota técnica (2026-07-12): el injector expone el secreto como `api_key` **y** `access_token` a los workflows — los JSON no son homogéneos y antes solo se emitía `api_key`, lo que rompía WhatsApp/LinkedIn/Instagram.

### Contactos (`/settings/contacts`)
- Whitelist obligatoria: los agentes solo envían a contactos que el usuario añada (anti prompt-injection). Añadir/borrar ya funciona.

---

## 5. Hardening (implementado 2026-06-12)

- **Verificación HMAC en los workflows** ✅ — cada workflow tiene un nodo `Verify Signature` tras el Webhook que recomputa la firma HMAC-SHA256 sobre la forma canónica del payload (claves ordenadas, sin espacios, UTF-8) y compara en tiempo constante con `X-Webhook-Signature`. Sin firma válida, el webhook devuelve error y la tool no se ejecuta. Requiere en el **servicio n8n**: `N8N_WEBHOOK_SECRET` (mismo valor que el backend) y `NODE_FUNCTION_ALLOW_BUILTIN=crypto`. El nodo se inserta con `backend/infrastructure/scripts/add_hmac_verification.py` (idempotente).
- **Surface de errores de tools en el chat** ✅ — el backend emite el evento SSE `tool_error` cuando una tool devuelve `{"error": true}` (el flujo `confirmation_required` NO cuenta como error); el chat muestra una card roja con el mensaje y botón **Reintentar** que pide al agente repetir la acción.
- **OAuth de Google compartido** ✅ (código) — si configuras `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` en el backend (Railway), los usuarios conectan Google Calendar directamente sin crear su propia app (la UI lo detecta sola). Una app BYO registrada por el usuario sigue teniendo prioridad. **Pendiente de operación:** crear la OAuth app oficial de SPHERE en Google Cloud Console (pantalla de consentimiento + verificación de Google) y poner las 2 env vars.
- **Rate limiting con Redis** ✅ — servicio Redis en Railway; `REDIS_URL` del backend apunta a `redis.railway.internal`.

## 6. Pendientes opcionales

- **Catálogo visual de integraciones con logs por servicio**: la página ya lista servicios y estado; un catálogo con historial de ejecuciones sería el siguiente nivel.
- **App OAuth de Google de SPHERE**: crearla en Google Cloud Console y configurar `GOOGLE_OAUTH_CLIENT_ID/SECRET` (ver §5).
