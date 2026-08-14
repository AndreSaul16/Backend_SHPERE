# Auditoría n8n — estado real de punta a punta

**Fecha:** 2026-08-13 · **Rama:** `feat/grant-huerfano` · **Alcance:** todo el monorepo
**Método:** lectura de código, ejecución de la suite (338 passed) e instrumentación de cobertura.
Todo lo afirmado lleva `fichero:línea`. Lo que exige una instancia real va marcado **[no verificable aquí]**.

---

## 0. Veredicto en una frase

El código de n8n está **completo y bien hecho**; lo que no existe es una instancia configurada, y **el
checklist oficial de despliegue omite las 4 variables sin las cuales n8n no funciona en absoluto**.
El resultado: si alguien sigue `docs/DEPLOY_CHECKLIST.md` el día del lanzamiento, obtiene un n8n que
falla el 100% de las llamadas y pierde todo en cada redeploy.

---

## 1. ¿Qué puede hacer hoy un agente con n8n?

### La cadena completa, trazada

```
Agente (LangChain tool)
  └─ tool en registry.py            SHARED_TOOLS / ROLE_TOOLS
      └─ inject_credentials_into_payload()      credential_injector.py
          └─ n8n_client.call_webhook(path, payload, creds)   n8n_client.py:73
              └─ POST {N8N_BASE_URL}/webhook/{path}          n8n_client.py:147
                 header X-Webhook-Signature = HMAC-SHA256    n8n_client.py:154
                  └─ n8n: nodo "Verify Signature" (require crypto)
                      └─ nodo "Extract Credentials" → httpRequest a la API real
                          └─ respondToWebhook → JSON de vuelta
              └─ return response.json()                      n8n_client.py:168
          └─ json.dumps(result) → texto que lee el LLM
```

### Respuestas concretas

**¿Hay herramienta en el registry?** Sí. El registry es `backend/app/infrastructure/tools/registry.py`
(52 líneas) y carga los módulos en `load_all_tools()` (`registry.py:41-52`). **18 llamadas a n8n**
repartidas en 5 ficheros:

| Ámbito | Fichero:línea | Webhook path |
|---|---|---|
| Shared | `shared_tools.py:128,167,195,207,219` | `shared/calendar-{list,create,update,delete,availability}` |
| Shared | `shared_tools.py:298,330,354` | `shared/whatsapp-{send,notify,read}` |
| CFO | `cfo_tools.py:53,70,87` | `cfo/{financial-news,stock-data,market-analysis}` |
| CTO | `cto_tools.py:76,92,108` | `cto/jules-{create,status,review}` |
| CMO | `cmo_tools.py:137,166,193,231` | `cmo/{linkedin-post,instagram-post,social-analytics,schedule-post}` |
| Scheduler | `scheduled_boards.py:157` | `shared/whatsapp-notify` |
| Webhook n8n→backend | `webhooks.py:457` | `shared/whatsapp-notify` |

**Correspondencia con las plantillas: 18/18 exacta.** Cada path llamado tiene su workflow JSON en
`backend/infrastructure/n8n-workflows/` con el mismo `parameters.path` en el nodo webhook. **Cero
huérfanos en ambos sentidos** (verificado extrayendo el path de cada JSON y cruzándolo con los greps).

**¿Qué recibe y qué devuelve?** Recibe un dict con los argumentos de la tool más
`user_credentials` inyectadas (`n8n_client.py:150-151`); devuelve el JSON del `respondToWebhook`
serializado a texto. Si n8n falla, devuelve un **dict de error, nunca lanza** (`n8n_client.py:119-131`),
con un `hint` redactado para el usuario final. Hay circuit breaker (5 fallos → abre 30s,
`n8n_client.py:62-66`) y 3 reintentos con backoff exponencial solo en 5xx/timeout
(`n8n_client.py:133-138`). Esto está bien diseñado.

**¿Un agente puede desplegar un workflow?** **NO.** `N8NDeployer` solo se instancia dentro de su propio
módulo (`n8n_deployer.py:233` y `:322`) y `deploy_all_workflows()` tiene un único llamador: el lifespan
de arranque (`main.py:339-341`). No está expuesto como tool ni como ruta de API. Un agente no puede
crear, editar ni activar workflows.

**¿Dispararlo?** Sí, pero **solo los 18 paths hardcodeados**. No existe una tool genérica del tipo
"llama a este webhook de n8n". El path nunca viene del LLM.

**¿Leer el resultado?** Sí, de forma síncrona: el JSON de `respondToWebhook` vuelve como valor de
retorno de la tool. La única ejecución asíncrona es `cmo/schedule-post`, que responde de inmediato y
más tarde devuelve el resultado por el webhook entrante (ver §2).

> **Sobre "las posibilidades son infinitas al dar n8n a los agentes":** hoy son exactamente 18,
> fijas, escritas a mano y desplegadas por el backend. Los agentes son **consumidores** de un catálogo
> cerrado, no autores de automatizaciones. Construir la versión "infinita" (que un agente diseñe y
> despliegue workflows nuevos) exigiría exponer `N8NDeployer` como tool, y eso es una superficie de
> ejecución de código arbitrario en la infraestructura: no es un ajuste de configuración, es un
> proyecto con su propio modelo de amenazas.

---

## 2. El webhook entrante: ¿buzón muerto?

**Casi.** La firma se verifica correctamente y luego el payload alimenta **un solo caso de uso**.

Recorrido real (`backend/app/presentation/api/v1/webhooks.py`):

1. `n8n_webhook()` — `webhooks.py:469-503`, ruta `POST /api/v1/webhooks/n8n`
   (montada en `main.py:537-539`).
2. Rate-limit por IP, 60/min — `webhooks.py:479`.
3. Parseo y validación de que es un dict — `webhooks.py:482-488`.
4. `verify_n8n_signature()` — `webhooks.py:404-425`, rechaza con 401 si falla (`webhooks.py:491-493`).
5. **Dispatch: un único `type` manejado**, `schedule_post_result` — `webhooks.py:498-501`.
   Cualquier otro tipo cae en un `logger.info` y se descarta.
6. `_notify_schedule_post_result()` — `webhooks.py:428-466`: carga las credenciales de WhatsApp del
   usuario y le manda un mensaje diciendo si su publicación programada salió bien.

**Adónde va el payload:** a un mensaje de WhatsApp y a los logs. **No se persiste en Mongo, no
actualiza ningún documento, no queda consultable en ninguna parte.** Si el usuario no tiene WhatsApp
configurado, la rama `else` de `webhooks.py:459-462` solo escribe un `logger.info` y **el resultado de
la publicación se pierde definitivamente**. Un usuario que programe un post por LinkedIn sin WhatsApp
conectado no tiene forma de saber si se publicó.

Quién lo emite: el nodo `Notify Backend` de `schedule-post.json:273`, que apunta a
`{{ $env.SPHERE_BACKEND_URL || 'http://backend:8000' }}/api/v1/webhooks/n8n`, precedido del nodo
`Sign Callback` que firma con la misma forma canónica. **El bucle está cerrado y es correcto** — es
buena ingeniería; el problema es que su único consumidor es una notificación best-effort.

---

## 3. `n8n_deployer.py`: ¿real o huérfano?

**Despliega de verdad, y no es huérfano — pero solo tiene un llamador y cero cobertura.**

- Habla con la **API pública REST de n8n**: `GET/POST/PUT /api/v1/workflows`
  (`n8n_deployer.py:108,116,129,147`) y los endpoints dedicados `/activate` y `/deactivate`
  (`n8n_deployer.py:163,174`).
- **URL:** `settings.N8N_BASE_URL` (`n8n_deployer.py:234`), default `http://n8n:5678`
  (`config.py:27`) — un nombre de servicio Docker que **no resuelve en Railway**.
- **Credenciales:** cabecera `X-N8N-API-KEY` con `settings.N8N_API_KEY` (`n8n_deployer.py:73-74`).
- **Conectado a:** el lifespan de arranque, `main.py:339-341`. **No hay ninguna ruta de API que lo
  exponga** (verificado: cero coincidencias de "workflow" en `app/presentation/` salvo un comentario
  en `auth.py:601`).
- Es código **maduro, no un esqueleto**: lock entre workers para no duplicar workflows con
  `--workers 4` (`n8n_deployer.py:222-229`), filtrado de campos read-only que la API rechaza
  (`n8n_deployer.py:28`), y sincronización de contenido cuando el JSON local difiere del remoto
  (`n8n_deployer.py:46-59`, `:264-274`).

**Función realmente huérfana:** `ensure_workflow()` (`n8n_deployer.py:314-342`) — **cero llamadores**
en todo el repo. Es código muerto.

---

## 4. Configuración: la tabla completa

Leyenda: **config.py** = declarada en `backend/app/core/config.py` · **CI** = `.github/workflows/ci.yml`
· **Docs** = algún documento de despliegue.

> **Ninguna variable N8N_* aparece en `.github/workflows/ci.yml`** (verificado: `grep -i n8n` sobre
> `.github/workflows/*.yml` devuelve 0 resultados). Esto es *correcto* — el CI no debe hablar con n8n —
> pero significa que **ningún test de CI puede detectar una regresión de configuración de n8n**.

### 4.1 Lado backend (las lee `Settings`)

| Variable | Para qué | ¿config.py? | ¿CI? | ¿Docs de despliegue? |
|---|---|---|---|---|
| `N8N_BASE_URL` | URL de la instancia n8n: deploy de workflows + destino de los webhooks salientes | **SÍ** `config.py:27` — default `http://n8n:5678` (inservible en Railway) | NO | SÍ: `DEPLOY_CHECKLIST.md:105`, `CONEXIONES_Y_N8N_SETUP.md:24`, `.env.example:18`. ⚠️ `backend/RAILWAY.md:45` la clasifica como **"Opcional"**, contradiciendo a `CONEXIONES_Y_N8N_SETUP.md:30` |
| `N8N_WEBHOOK_SECRET` | HMAC de los webhooks (ambos sentidos) **y firma del state OAuth** | **SÍ** `config.py:28` — default `""` | NO | SÍ: `DEPLOY_CHECKLIST.md:106`, `CONEXIONES_Y_N8N_SETUP.md:26`, `.env.example:19` |
| `N8N_API_KEY` | `X-N8N-API-KEY` para crear/activar workflows | **SÍ** `config.py:29` — default `""` | NO | SÍ: `DEPLOY_CHECKLIST.md:107`, `CONEXIONES_Y_N8N_SETUP.md:25`, `.env.example:20` |

### 4.2 Lado instancia n8n (no son del backend; van en el servicio n8n)

| Variable | Para qué | ¿config.py? | ¿CI? | ¿Docs de despliegue? |
|---|---|---|---|---|
| `N8N_WEBHOOK_SECRET` | Lo lee el nodo `Verify Signature` de los 18 workflows vía `$env` | N/A | NO | **Solo `CONEXIONES_Y_N8N_SETUP.md:47`.** ❌ **Ausente de `DEPLOY_CHECKLIST.md:92-99`** y de `docker-compose.yaml` |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | Sin ella `require('crypto')` falla → **los 18 workflows revientan en su primer nodo** | N/A | NO | **Solo `CONEXIONES_Y_N8N_SETUP.md:45`** y un docstring en `infrastructure/scripts/add_hmac_verification.py:8`. ❌ Ausente del checklist |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | n8n ≥2.x bloquea `$env` en nodos Code por defecto | N/A | NO | **Solo `CONEXIONES_Y_N8N_SETUP.md:46`.** ❌ Ausente del checklist |
| `N8N_USER_FOLDER=/home/node` | Sin ella n8n (como root) escribe en `/root/.n8n`, **fuera del volumen** → se pierde todo en cada redeploy | N/A | NO | **Solo `CONEXIONES_Y_N8N_SETUP.md:44`**, que documenta un incidente real del 2026-06-12. ❌ Ausente del checklist |
| `SPHERE_BACKEND_URL` | URL del backend para el callback de `schedule-post` | N/A | NO | **Solo `docs/FUNCIONALIDADES.md:311`.** ❌ Ausente del checklist y de `CONEXIONES_Y_N8N_SETUP.md`. Fallback `http://backend:8000` (`schedule-post.json:273`), que en Railway **no resuelve** |
| `RAILWAY_RUN_UID=0` | Permisos del volumen (incidente EACCES) | N/A | NO | `PLAN_N8N_OAUTH.md:26-28`, `DEPLOYMENT_RUNBOOK.md:128-129`. ❌ Ausente del checklist |
| `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false` | Ídem | N/A | NO | Ídem. ❌ Ausente del checklist |
| `N8N_ENCRYPTION_KEY` | Cifrado interno de n8n | N/A | NO | `DEPLOY_CHECKLIST.md:99` |
| `N8N_HOST` / `N8N_PORT` / `N8N_PROTOCOL` | URL pública de n8n | N/A | NO | `DEPLOY_CHECKLIST.md:94-96`, `docker-compose.yaml:50-52` |
| `WEBHOOK_URL` | URL pública para los webhooks | N/A | NO | `docker-compose.yaml:53` usa `WEBHOOK_URL`; **`DEPLOY_CHECKLIST.md:97` usa `N8N_WEBHOOK_URL`** — nombres distintos, uno de los dos no hace nada |
| `DB_TYPE=sqlite` | Persistencia | N/A | NO | `DEPLOY_CHECKLIST.md:98`; contradicho por `PLAN_N8N_OAUTH.md:33-36` (propone Postgres) |

### 4.3 El agujero que cuesta el lanzamiento

`docs/DEPLOY_CHECKLIST.md` es el checklist oficial. Sus env vars del servicio n8n
(`DEPLOY_CHECKLIST.md:92-99`) son 6, y **omite las 4 que `CONEXIONES_Y_N8N_SETUP.md:44-47` marca como
OBLIGATORIAS**. Un operador que siga el checklist al pie de la letra despliega un n8n que:

1. falla el 100% de las llamadas (sin `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, el nodo `Verify Signature`
   lanza en `require('crypto')`);
2. aunque eso se arreglara, sigue fallando (sin `N8N_WEBHOOK_SECRET` en n8n, el nodo lanza
   explícitamente `throw new Error('N8N_WEBHOOK_SECRET no configurado en n8n')` — ver el JS embebido
   en cualquier workflow, p. ej. el nodo `Verify Signature` de `whatsapp-send.json`);
3. pierde workflows y API key en cada redeploy (sin `N8N_USER_FOLDER`);
4. no puede devolver el resultado de las publicaciones programadas (sin `SPHERE_BACKEND_URL`).

### 4.4 El entorno de desarrollo local también está roto

`backend/docker-compose.yaml:46-53` define el servicio n8n con 7 variables y **ninguna** es
`N8N_WEBHOOK_SECRET` ni `NODE_FUNCTION_ALLOW_BUILTIN`. El servicio no tiene `env_file` (a diferencia
del backend, `docker-compose.yaml:73`). Conclusión: **`docker compose up` produce un n8n en el que los
18 workflows fallan en el primer nodo.** Nadie puede haber probado esto localmente desde que se
añadió la verificación HMAC.

---

## 5. ¿Hay instancia de n8n?

**El producto asume self-hosted en Railway. n8n.cloud no aparece en ninguna parte del repo** (0
coincidencias de `n8n.cloud`).

**Infraestructura declarada en el repo — existe y es correcta:**
- `Dockerfile.n8n` (raíz): `FROM n8nio/n8n:latest`, `VOLUME /home/node/.n8n`, healthcheck a `/healthz`.
- `railway.toml` (raíz): build desde `Dockerfile.n8n`, healthcheck `/healthz`, y volumen
  `[deploy.volume]` montado en `/home/node/.n8n`.

**Rastro de una instancia real:** `docs/DEPLOYMENT_RUNBOOK.md:56` lista
`https://n8n-production-16d81.up.railway.app` bajo "URLs de producción", con serviceId
`111caf06-5c72-4f45-a2d2-1a85f5616279` (`DEPLOYMENT_RUNBOOK.md:225`).
**[no verificable aquí]** si ese servicio está vivo, tiene los workflows importados y activos, o tiene
una API key válida. Para comprobarlo hace falta acceso al dashboard de Railway o una petición a esa
URL (`GET /healthz` y `GET /api/v1/workflows` con la API key).

**Contradicciones documentales sin resolver:**
- `DEPLOY_CHECKLIST.md:84` dice "**Falta desplegar el servidor n8n y conectarlo**" mientras
  `DEPLOYMENT_RUNBOOK.md:56` da su URL de producción y `CONEXIONES_Y_N8N_SETUP.md:44` narra un
  incidente del 2026-06-12 en el que "un redeploy borró workflows + API key" (lo que implica una
  instancia viva y con workflows). **Los dos documentos oficiales se contradicen sobre el hecho básico
  de si n8n existe.**
- `DEPLOYMENT_RUNBOOK.md:37-39` dice que n8n "**NO se construye del repo**, usa la imagen oficial",
  mientras `railway.toml:8-10` en la raíz configura precisamente un build desde `Dockerfile.n8n`.
- `PLAN_N8N_OAUTH.md:1,10` titula "n8n **CRASHED**"; `DEPLOYMENT_RUNBOOK.md:130,141` marca ese mismo
  incidente como "**RESUELTO**". Sin fecha que permita ordenarlos con certeza.

### 5.1 Bloqueante de despliegue verificado

Los dos ficheros de n8n en la raíz **violan las invariantes del propio monorepo**. Ejecutado por mí:

```
$ bash scripts/check-monorepo-invariants.sh
❌ FAIL: railway.toml found at monorepo root
❌ FAIL: Dockerfile found at monorepo root:  • Dockerfile.n8n
❌ 3 violation(s) found. Fix them before deploying.
```

Y al mismo tiempo `backend/tests/test_ci_infra.py:285-292` (`test_dockerfile_n8n_has_volume`) y
`:310-315` (`test_railway_toml_has_volume_mount`) **exigen que esos ficheros sigan ahí**.
`DEPLOYMENT_RUNBOOK.md:67-71` prohíbe explícitamente ambas cosas ("Ningún `Dockerfile` puede tener la
instrucción `VOLUME`", "No debe haber `railway.toml` ni `Dockerfile*` en la RAÍZ"), y
`DEPLOYMENT_RUNBOOK.md:110-111` afirma que se borraron en el commit `a692102` — pero volvieron.

**La suite de tests y el guard de despliegue se contradicen entre sí.** Hay que decidir cuál manda
antes de tocar el deploy, y hoy no está decidido.

---

## 6. UI: qué ve el usuario

**El usuario no puede configurar, ver ni ejecutar nada de n8n.** No hay ruta, pestaña ni componente.

- Rutas de la app (`frontend/src/App.tsx:39-138`) y pestañas de Ajustes
  (`frontend/src/pages/SettingsPage.tsx:28-33`): **ninguna de automatizaciones o workflows**.
- La cadena "workflow" tiene **0 coincidencias** en todo `frontend/src`.
- No existe input para la URL de una instancia n8n ni para una API key de n8n. El catálogo de
  credenciales está hardcodeado en `frontend/src/pages/settings/ServiceCredentialsSettings.tsx:40-47`
  y **no incluye `n8n`**.
- No hay historial de ejecuciones. Lo más parecido son tarjetas efímeras dentro del chat
  (`frontend/src/components/chat/ToolExecutionCard.tsx:43`), que se pierden al recargar.

**Lo que sí ve — y es un problema de producto:** la palabra "n8n" se filtra a la UI en 3 sitios
visibles, sin explicación alguna:

- `frontend/src/pages/BillingPage.tsx:20` — en una tarjeta de compra de **€14,99**:
  `'10 interacciones con el board o una investigación con n8n.'` Se renderiza en `BillingPage.tsx:327`.
  **Estamos cobrando por algo cuyo nombre es jerga interna y que el usuario no puede ver ni controlar.**
- `frontend/src/pages/settings/ServiceCredentialsSettings.tsx:183-184` — bloque de seguridad:
  "Se inyectan en los payloads de n8n solo cuando los agentes ejecutan acciones en tu nombre. n8n no
  almacena tus credenciales."

`ConnectionsSettings.tsx` es solo un contenedor (`ConnectionsSettings.tsx:41-67`); todos sus endpoints
son OAuth de terceros (`/integrations/*`, `services/api.ts:653-672`) y de credenciales
(`/me/service-credentials`, `ServiceCredentialsSettings.tsx:76,106,137,156`). **Ninguno toca n8n.**

---

## 7. Seguridad

### Lo que está bien

- Firma HMAC-SHA256 sobre forma canónica, idéntica en Python y JS (`n8n_client.py:20-32` vs. el nodo
  `Verify Signature` de los 18 workflows). Comparación en tiempo constante en ambos lados
  (`webhooks.py:423`, `crypto.timingSafeEqual` en el JS).
- **Secreto vacío → rechaza todo** en el webhook entrante (`webhooks.py:412-418`). Decisión correcta y
  con test (`test_webhook_n8n.py:58-63`).
- `TypeError` de `compare_digest` con headers no-ASCII capturado para no devolver 500
  (`webhooks.py:422-425`).
- `user_id` del payload validado como `str` antes de llegar a una query Mongo
  (`webhooks.py:445-446`) — defensa contra inyección de operadores tipo `{"$ne": null}`.
- Rate-limit por IP en el endpoint sin auth (`webhooks.py:479`).

### Huecos

**H1 — No hay replay protection. [confirmado]**
El payload firmado es `{type, user_id, platform, success, detail}` (nodo `Sign Callback` de
`schedule-post.json`): **sin timestamp, sin nonce, sin id de ejecución**. `verify_n8n_signature`
(`webhooks.py:404-425`) no comprueba frescura y `n8n_webhook` (`webhooks.py:469-503`) no deduplica.
Un `POST` capturado se puede reenviar indefinidamente y cada reenvío dispara un mensaje de WhatsApp
al usuario (`webhooks.py:457`) — spam al cliente final y coste real, porque los mensajes de WhatsApp
Business se pagan.

El contraste dentro del mismo fichero es revelador: el webhook de Stripe **sí** tiene idempotencia
atómica por `event_id` (`webhooks.py:161-177`), y el state OAuth **sí** lleva nonce + timestamp +
expiración de 10 minutos (`integrations.py:66-99`). El webhook de n8n es el único de los tres sin
protección.

**H2 — El secreto de n8n también protege el OAuth, y ahí no hay guarda de vacío. [confirmado]**
`integrations.py:71-75` y `:87-91` firman y verifican el **state CSRF de OAuth** con
`settings.N8N_WEBHOOK_SECRET`. A diferencia de `verify_n8n_signature`, **no hay comprobación de secreto
vacío**: con `N8N_WEBHOOK_SECRET=""` el state se firma con clave vacía y **cualquiera puede forjar uno
válido** → CSRF en el flujo OAuth de conexión de cuentas. Además el HMAC se trunca a 16 hex = **64 bits**
(`integrations.py:75`).

Consecuencia de la reutilización de clave: el secreto vive también en la instancia n8n (un sistema
distinto, con su propia UI y sus propios operadores). Quien lo obtenga de ahí puede falsificar states
OAuth del backend. `CONEXIONES_Y_N8N_SETUP.md:26` documenta el doble uso como si fuera normal
("Firma HMAC de los webhooks + firma del state OAuth"); es un acoplamiento que conviene romper.

**H3 — No hay rotación del secreto. [confirmado]**
`config.py:28` declara un único `N8N_WEBHOOK_SECRET`. No existe el equivalente plural que el propio
proyecto ya usa para Fernet (`FERNET_KEYS` + `fernet_keys_list`, `config.py:41-42` y `:138-150`, con
soporte de claves antiguas para descifrar). Rotar el secreto de n8n exige cambiarlo **a la vez** en el
backend y en la instancia n8n: durante la ventana, todas las tools fallan **y todos los flujos OAuth
en vuelo se invalidan** (por H2).

**H4 — Secreto vacío en producción no bloquea el arranque. [confirmado]**
`main.py:91-96` solo emite `logger.critical` y sigue; el propio comentario lo admite ("No es
bloqueante", `main.py:89`). Compárese con `FERNET_KEY`, que sí está en `prod_critical`
(`main.py:66`) y aborta (`main.py:102-107`). Dado H2, un `N8N_WEBHOOK_SECRET` vacío no es "una
integración desactivada": es un agujero de CSRF en OAuth. `docs/AUDITORIA_PRODUCCION_2026-06-10.md:100-103`
ya lo señaló (hallazgo A11) y el fix se aplicó a medias.

**H5 — El rate-limit del webhook es más débil de lo que parece. [parcialmente verificable]**
`chat_rate_limiter` es un singleton **in-process** (`rate_limit.py:90-91`), no distribuido, y el
contenedor arranca con `--workers ${WEB_CONCURRENCY:-4}` (`Dockerfile:36`): el límite real es
**~240/min por instancia**, no 60. Además la identidad es `request.client.host` (`webhooks.py:478`) y
**no se configura `forwarded_allow_ips` en ningún sitio del repo** (0 coincidencias de
`FORWARDED_ALLOW_IPS` / `--proxy-headers`); detrás del edge de Railway eso tiende a colapsar a todos
los clientes en una única cubeta compartida. **[no verificable aquí]** el comportamiento exacto: hay
que observar `request.client.host` en un despliegue real de Railway.

**H6 — Sin `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, la verificación HMAC no se ejecuta.**
El nodo lee el secreto de `$env.N8N_WEBHOOK_SECRET`. Si n8n bloquea `$env` (default en ≥2.x, según
`CONEXIONES_Y_N8N_SETUP.md:46`), el nodo lanza y el workflow falla. **Falla cerrado, que es lo correcto**,
pero convierte una variable no documentada en el checklist en un interruptor de apagado total.

---

## 8. Cobertura: qué prueban de verdad los tests

**Línea base reproducida: 338 passed, 0 failed** (9s, con Mongo 7 y Redis).

> Nota de entorno: el intérprete indicado en el encargo (`.../scratchpad/vci/bin/python`) no existe;
> usé `backend/.venv/bin/python`. Además **MongoDB no estaba escuchando en 27017** al empezar (Redis sí),
> lo que colgaba la suite indefinidamente; la ejecuté tras arrancar un `mongod` local (v7.0.39).

Instrumenté la suite con un plugin de trazado efímero (en scratchpad, sin tocar el proyecto) para
medir qué se ejecuta de verdad:

```
app/presentation/api/v1/webhooks.py      185/374 líneas (49%)
    NUNCA EJECUTADAS:  L428 _notify_schedule_post_result
                       L470 n8n_webhook
app/infrastructure/tools/n8n_client.py    42/182 líneas (23%)
app/infrastructure/n8n_deployer.py        >>> 0 líneas — MÓDULO NUNCA EJECUTADO <<<
```

### Qué significa

**`test_webhook_n8n.py` son 7 tests de una función pura.** Todos llaman a `verify_n8n_signature`, que
es aritmética HMAC sin efectos. Son tests **correctos y valiosos** — el de secreto vacío
(`test_webhook_n8n.py:58-63`) protege una decisión de seguridad real, y el de payload manipulado
(`:40-43`) también. Pero su alcance es esa función y nada más.

**El endpoint `POST /api/v1/webhooks/n8n` no tiene ni un solo test.** Cero. No se prueba el 401, ni el
429 del rate-limit, ni el 400 de JSON inválido, ni el dispatch por `type`, ni la guarda de `user_id`
no-string de `webhooks.py:445` (una defensa anti-inyección **sin ninguna prueba**).

**`n8n_deployer.py` tiene 0 líneas ejecutadas por 338 tests.** El filtrado de campos read-only, el lock
entre workers, la comparación `_workflow_differs`, el manejo de 401 — nada está probado. Es el módulo
que decide si los 18 workflows llegan a producción.

**`N8NClient.call_webhook` tampoco se ejecuta nunca.** Ni el retry, ni el circuit breaker, ni el
manejo de respuesta no-JSON (`n8n_client.py:169-179`).

### Los tests de infraestructura son asserts sobre texto

`test_ci_infra.py:285-292` y `:296-308` abren `Dockerfile.n8n` y comprueban que contiene las cadenas
`VOLUME` y `HEALTHCHECK`. `:310-315` comprueba que `railway.toml` contiene `[deploy.volume]`.
**No prueban que n8n arranque, ni que persista, ni que responda.** Pasan aunque la instancia no exista
— de hecho pasan hoy, sin instancia. Y como se vio en §5.1, **codifican precisamente el estado que el
guard de despliegue del propio repo declara inválido**.

### Veredicto de cobertura

Los tests de n8n **no son teatro** (no encontré aquí el patrón de "tests que no pueden fallar": todos
tienen aserciones con contenido). El problema es de **alcance**: cubren ~1 función de las tres piezas
del sistema. Lo verificado es la aritmética de la firma; lo no verificado es todo lo que puede romper
en producción.

---

## 9. Lo que falta para que n8n funcione el día del lanzamiento

Ordenado por esfuerzo creciente. Los ítems 1-4 son **bloqueantes**.

### Esfuerzo trivial (minutos) — sin ellos n8n no funciona en absoluto

1. **Añadir las 4 variables que faltan al servicio n8n** y ponerlas en `docs/DEPLOY_CHECKLIST.md:92-99`:
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_WEBHOOK_SECRET` (mismo valor que el backend),
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_USER_FOLDER=/home/node`. Fuente:
   `CONEXIONES_Y_N8N_SETUP.md:44-47`. **Sin la primera, el 100% de las llamadas falla.**
2. **Añadir `SPHERE_BACKEND_URL`** al servicio n8n con la URL pública del backend. Sin ella el callback
   de `schedule-post` va a `http://backend:8000` (`schedule-post.json:273`), que no resuelve en Railway.
3. **Poner `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET` y `N8N_API_KEY`** en el servicio backend de Railway.
   Generar el secreto con `secrets.token_urlsafe(32)` y usar **el mismo** a ambos lados.
4. **Resolver `WEBHOOK_URL` vs `N8N_WEBHOOK_URL`**: `DEPLOY_CHECKLIST.md:97` y
   `docker-compose.yaml:53` usan nombres distintos. Confirmar cuál acepta la versión de n8n desplegada.

### Esfuerzo bajo (1-2 horas)

5. **Decidir el conflicto raíz vs. invariantes (§5.1)** — hoy `check-monorepo-invariants.sh` falla y
   `test_ci_infra.py` exige lo contrario. Elegir uno y alinear el otro. **Es un bloqueante de deploy,
   no un tema de estilo.**
6. **Arreglar `docker-compose.yaml:46-53`** añadiendo `N8N_WEBHOOK_SECRET` y
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto` al servicio n8n, para que el entorno local deje de estar roto.
7. **Hacer `N8N_WEBHOOK_SECRET` bloqueante en producción** (`main.py:91-96` → moverlo a `prod_critical`,
   `main.py:63-68`). Justificación: por H2 un secreto vacío es un CSRF de OAuth, no una integración apagada.
8. **Quitar "n8n" de la UI** — `BillingPage.tsx:20` vende jerga interna en una tarjeta de €14,99.
   Sustituir por "automatizaciones" o "herramientas conectadas".
9. **Borrar `ensure_workflow()`** (`n8n_deployer.py:314-342`), código muerto sin llamadores.
10. **Reescribir `backend/infrastructure/n8n-workflows/README.md`**: dice "importar a mano", lista 5 de
    18 workflows, y su ejemplo de Google Calendar usa `api_key`, que
    `CONEXIONES_Y_N8N_SETUP.md:15` dice que **Google rechaza**. Hoy engaña a quien lo lea.

### Esfuerzo medio (medio día)

11. **Replay protection en el webhook entrante (H1)**: añadir `timestamp` + `nonce` al payload firmado
    en el nodo `Sign Callback` de `schedule-post.json`, rechazar por ventana temporal en
    `verify_n8n_signature` y deduplicar por nonce en Redis. El patrón ya existe en el repo:
    `integrations.py:66-99`.
12. **Tests del endpoint**: `POST /api/v1/webhooks/n8n` con firma válida, inválida, ausente, JSON
    inválido, `user_id` no-string y `type` desconocido. Hoy son **0 tests** sobre 34 líneas de código
    accesible desde internet sin autenticación.
13. **Tests de `n8n_deployer.py`** con un `httpx.MockTransport`: crear, actualizar cuando difiere,
    saltar cuando es idéntico, activar, y el lock entre workers. Hoy **0 líneas cubiertas**.
14. **Persistir el resultado de `schedule_post_result`** en Mongo (§2). Hoy, si el usuario no tiene
    WhatsApp, el resultado de su publicación programada se pierde en un log.
15. **Verificación end-to-end contra la instancia real [no verificable aquí]**: `GET /healthz`,
    confirmar que los 18 workflows aparecen y están activos, y disparar un webhook de prueba
    comprobando que la firma se acepta. Requiere la URL y la API key reales.

### Esfuerzo alto (varios días)

16. **Desacoplar el secreto OAuth del secreto n8n (H2)**: introducir `OAUTH_STATE_SECRET`, dejar de
    truncar el HMAC a 64 bits, y añadir guarda de secreto vacío en `integrations.py:66-99`.
17. **Rotación de secreto (H3)**: `N8N_WEBHOOK_SECRETS` en plural, verificando contra todas las claves y
    firmando con la primera, replicando el patrón de `fernet_keys_list` (`config.py:138-150`).
18. **Rate-limit distribuido** para los endpoints sin auth (H5), sobre Redis en vez de in-process, y
    fijar el manejo de `X-Forwarded-For`.
19. **UI de automatizaciones (§6)**: estado de conexión de n8n, catálogo de las 18 automatizaciones
    disponibles e historial de ejecuciones. Hoy no existe nada y es lo que un inversor esperaría ver.

---

## 10. Resumen ejecutivo

1. **El código de n8n está terminado y es de buena calidad**: 18 tools cableadas, 18 workflows con
   correspondencia 1:1 exacta, HMAC bidireccional, circuit breaker, retry y auto-deploy idempotente.
2. **Lo que NO está terminado es la configuración**, y ese es justo el eslabón que decide si funciona.
3. **El checklist oficial de despliegue está mal**: `DEPLOY_CHECKLIST.md:92-99` omite las 4 variables
   que `CONEXIONES_Y_N8N_SETUP.md:44-47` marca como obligatorias. Seguirlo produce un n8n que falla el
   100% de las llamadas y se borra en cada redeploy.
4. **`NODE_FUNCTION_ALLOW_BUILTIN=crypto` es el interruptor general** y solo está documentado en un
   docstring (`add_hmac_verification.py:8`) y una tabla secundaria. Sin él, nada funciona.
5. **Los docs se contradicen sobre si la instancia existe**: `DEPLOY_CHECKLIST.md:84` dice que falta
   desplegarla; `DEPLOYMENT_RUNBOOK.md:56` da su URL de producción. Nadie puede saberlo desde el repo.
6. **Bloqueante de deploy verificado**: `check-monorepo-invariants.sh` falla hoy por los dos ficheros
   de n8n en la raíz, que `test_ci_infra.py` exige que estén. Suite y guard se contradicen.
7. **El entorno local también está roto**: `docker-compose.yaml` no pasa el secreto ni el flag de
   crypto a n8n, así que los workflows nunca han podido probarse en local desde que se añadió el HMAC.
8. **Órfano de verdad**: solo `ensure_workflow()` (`n8n_deployer.py:314`). `n8n_deployer.py` no es
   huérfano, pero tiene **0% de cobertura** en 338 tests.
9. **El webhook entrante casi es un buzón muerto**: un solo `type` manejado, y su resultado solo
   produce un WhatsApp best-effort que se pierde si el usuario no lo tiene conectado.
10. **Seguridad**: sin replay protection; el mismo secreto firma los webhooks y el state OAuth, y en
    OAuth **no hay guarda de secreto vacío** (CSRF forjable); sin rotación; y el arranque en producción
    no bloquea con secreto vacío.
11. **Cobertura**: los 7 tests de n8n son honestos pero cubren una sola función pura. El endpoint
    público sin auth tiene 0 tests y el deployer tiene 0 líneas ejecutadas.
12. **¿Enseñable a un inversor? No.** No hay nada que enseñar: cero UI de n8n, cero workflows visibles,
    cero historial de ejecuciones. Lo único que el inversor vería es la palabra "n8n" suelta en una
    tarjeta de pago de €14,99 (`BillingPage.tsx:20`). Con los ítems 1-4 (minutos de trabajo) se puede
    **demostrar en vivo** que un agente crea un evento de calendario o publica en LinkedIn, y eso sí
    es una demo potente. Sin ellos, cada tool responde "Servicio de automatizaciones no disponible".
