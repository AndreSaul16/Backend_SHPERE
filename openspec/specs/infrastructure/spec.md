# infrastructure

> **Source**: fix-platform-stability (archived 2026-05-14), infra-n8n (archived 2026-08-14)
> **TDD**: ACTIVE (pytest) — IN-002, IN-004 e IN-005 los fija `backend/tests/test_ci_infra.py`; IN-006 está DIFERIDO

## Requirements

| ID | Requirement | N |
|----|------------|---|
| IN-001 | n8n **MUST** desplegarse desde la imagen `n8nio/n8n` con el conjunto completo de variables; la raíz **MUST NOT** tener `railway.toml` ni `Dockerfile*` y ningún `Dockerfile` **MAY** declarar `VOLUME` | 3 |
| IN-002 | **MUST** existir un único fichero versionado y legible por máquina del que guard y suite deriven invariantes y nombres de variable | 3 |
| IN-003 | El guard **MUST** permitir afirmar las invariantes de raíz con independencia de la comprobación de `paths:` | 2 |
| IN-004 | El servicio n8n de `docker-compose.yaml` **MUST** declarar el secreto y los dos flags que necesita el nodo `Verify Signature` | 2 |
| IN-005 | Ningún documento **MAY** afirmar el estado de la instancia de n8n: lo responde `check-n8n-health.sh` | 2 |
| IN-006 | **[DIFERIDO, NO ACTIVAR]** Hoy el backend **MUST** arrancar con secreto vacío y emitir `CRITICAL`; abortar el arranque **MUST NOT** activarse sin confirmación del dueño | 2 |

### IN-001: Despliegue de n8n desde imagen, con el conjunto completo de variables

> **Reemplaza** la versión anterior de IN-001 (que exigía `railway.toml` en la raíz con `[deploy.volume]`) — sustituida el 2026-08-14 por `infra-n8n`.

El servicio n8n **MUST** desplegarse desde la imagen oficial `n8nio/n8n`, configurada por servicio
en el dashboard de Railway. **MUST NOT** existir `railway.toml` ni `Dockerfile*` en la raíz del
monorepo, y ningún `Dockerfile` del repositorio **MAY** declarar `VOLUME`: Railway no lo soporta y
aborta el build. La persistencia **MUST** lograrse con un Railway Volume montado en
`/home/node/.n8n` más `N8N_USER_FOLDER=/home/node`.

El servicio n8n **MUST** recibir, además de `N8N_HOST`, `N8N_PORT`, `N8N_PROTOCOL` y `WEBHOOK_URL`,
las cuatro sin las cuales los 18 workflows fallan en su primer nodo, y `SPHERE_BACKEND_URL` para el
callback. El nombre correcto es `WEBHOOK_URL`; `N8N_WEBHOOK_URL` **MUST NOT** aparecer en ningún
documento.

(Antes: exigía un `railway.toml` raíz con `[deploy.volume]`, la imagen `n8nio/n8n:latest` y sólo
`N8N_HOST`/`N8N_PORT`/`N8N_PROTOCOL`/`WEBHOOK_URL` — es decir, exigía el fichero raíz que el guard
del propio repositorio declara inválido.)

- GIVEN el repositorio en cualquier rama
  WHEN se comprueban las invariantes de raíz
  THEN no hay `railway.toml` ni ningún `Dockerfile*` en la raíz

- GIVEN todos los `Dockerfile*` del repositorio
  WHEN se inspeccionan sus instrucciones
  THEN ninguno contiene `VOLUME`

- **Mutación**: GIVEN se recrea `Dockerfile.n8n` en la raíz con `VOLUME /home/node/.n8n`
  WHEN se ejecuta la suite de backend
  THEN los dos escenarios anteriores **MUST** fallar
  AND el guard **MUST** reportar violación de raíz

### IN-002: Un único origen de verdad para invariantes y variables

**MUST** existir **un solo** fichero versionado y legible por máquina que declare (a) qué ficheros
no pueden estar en la raíz y por qué, (b) qué instrucciones no puede contener un `Dockerfile`, y
(c) el nombre exacto y el propósito de cada variable que el dueño debe poner en Railway, separadas
por servicio (n8n / backend).

`scripts/check-monorepo-invariants.sh` y la suite de backend **MUST** derivar sus comprobaciones de
ese fichero. **MUST NOT** codificar las rutas ni los nombres de variable por su cuenta: es
exactamente así como llegaron a contradecirse. Añadir una regla al manifiesto **MUST** bastar para
que ambos consumidores la apliquen.

El manifiesto es la fuente de los **nombres**; la explicación para humanos **MUST** vivir en un
único documento (`docs/CONEXIONES_Y_N8N_SETUP.md`), y el resto de documentos **MUST** enlazarlo en
vez de repetir la lista. **MUST NOT** contener valores de secretos ni URLs inventadas.

- GIVEN una regla de raíz declarada sólo en el manifiesto
  WHEN se ejecutan el guard y la suite
  THEN ambos la aplican sin haber sido editados

- GIVEN el manifiesto y el documento canónico
  WHEN se comparan los nombres de variable del servicio n8n
  THEN coinciden exactamente
  AND ningún otro documento del repositorio declara esa lista por su cuenta

- **Mutación**: GIVEN se reintroduce en el guard o en un test la ruta `railway.toml` literal en vez de leerla del
  manifiesto
  WHEN se ejecuta la comprobación de origen único
  THEN **MUST** fallar

### IN-003: El resultado del guard es asertable por comprobación

El guard **MUST** permitir afirmar el estado de las invariantes de raíz **con independencia** de la
comprobación de `paths:` en los workflows, que falla por `ci.yml` y queda fuera de este cambio.
Sin esa separación, «el guard está verde» no es comprobable y cualquier test que lo afirme sería
permanentemente rojo o vacío.

- GIVEN la raíz sin `railway.toml` ni `Dockerfile*`, y `.github/workflows/ci.yml` sin `paths:`
  WHEN se ejecuta el guard
  THEN reporta las invariantes de raíz como satisfechas
  AND su resultado global sigue reflejando la violación de scoping, sin ocultarla

- **Mutación**: GIVEN se hace que el resultado de raíz dependa del de scoping
  WHEN se ejecuta la comprobación
  THEN **MUST** fallar

### IN-004: Entorno local reproducible desde un clon limpio

Un desarrollador que clone el repositorio y levante el stack local **MUST** obtener un n8n cuyo nodo
`Verify Signature` no lance: antes de `infra-n8n`, `docker-compose.yaml:46-53` no pasaba el secreto ni
`NODE_FUNCTION_ALLOW_BUILTIN`, así que los 18 workflows fallaban en su primer nodo y la integración
nunca pudo probarse en local desde que se añadió el HMAC.

El servicio n8n de `docker-compose.yaml` **MUST** declarar `N8N_WEBHOOK_SECRET`,
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, y el valor del secreto
**MUST** ser el mismo que recibe el backend en el mismo `docker compose`. La comprobación **MUST**
ser ejecutable por un script, no una instrucción en un README.

- GIVEN `backend/docker-compose.yaml`
  WHEN se comprueba el servicio n8n contra el manifiesto de IN-002
  THEN están las tres variables
  AND el secreto del servicio n8n y el del backend resuelven al mismo valor

- **Mutación**: GIVEN se elimina `NODE_FUNCTION_ALLOW_BUILTIN` del servicio n8n
  WHEN se ejecuta la suite
  THEN el escenario anterior **MUST** fallar

### IN-005: La documentación es decidible, no afirmativa

Ningún documento **MAY** afirmar si la instancia de n8n existe, está viva o tiene los workflows
activos: esa pregunta la responde `scripts/check-n8n-health.sh` (NWD-004). Antes de `infra-n8n`,
`DEPLOY_CHECKLIST.md:84` decía que faltaba desplegarla y `DEPLOYMENT_RUNBOOK.md:56` daba su URL de
producción; los dos documentos oficiales se contradecían sobre el hecho básico.

`DEPLOY_CHECKLIST.md` **MUST NOT** ofrecer la opción «Deploy from Dockerfile» (borra el fichero y
reintroduce el build FAILED) ni usar `N8N_WEBHOOK_URL`. `CONEXIONES_Y_N8N_SETUP.md:30` **MUST**
dejar de describir el secreto vacío como CSRF de OAuth: el state se consume con `find_one_and_delete`
antes de mirar el HMAC (`integrations.py:167-171`), así que un state forjado muere ahí; lo real es
el truncado y el acoplamiento de secretos (NWI-002).

La coherencia **MUST** comprobarse de forma ejecutable, con reglas concretas —no con una lectura
subjetiva de «no se contradicen».

- GIVEN `DEPLOY_CHECKLIST.md` y `DEPLOYMENT_RUNBOOK.md`
  WHEN se comprueba la coherencia
  THEN ninguno afirma el estado de la instancia y ambos citan `check-n8n-health.sh`

- **Mutación**: GIVEN se restaura en `DEPLOY_CHECKLIST.md` el texto «Falta desplegar el servidor n8n», o aparece
  `N8N_WEBHOOK_URL` en cualquier documento
  WHEN se ejecuta la comprobación de coherencia
  THEN **MUST** fallar

### IN-006: [DIFERIDO, NO ACTIVAR] Secreto bloqueante en producción

**Este requisito NO se implementa en este cambio.** Mover `N8N_WEBHOOK_SECRET` a `prod_critical`
(`backend/main.py:63-68`) **MUST NOT** hacerse hasta que el dueño confirme que la variable existe
en el servicio backend de Railway: hoy no la ha puesto, y activarlo antes **impide arrancar el
backend en producción**.

Comportamiento vigente y exigible hoy: con `ENVIRONMENT=production` y secreto vacío el backend
**MUST** arrancar y **MUST** emitir un log `CRITICAL` (`main.py:88-96`).

Condición de activación: confirmación explícita del dueño de que `N8N_WEBHOOK_SECRET` está
configurada en Railway. Sólo entonces el arranque en producción **MUST** abortar con secreto vacío.

- GIVEN `ENVIRONMENT=production` y `N8N_WEBHOOK_SECRET=""`
  WHEN arranca el backend
  THEN arranca correctamente
  AND emite un log `CRITICAL` que nombra la variable

- GIVEN la variable confirmada en Railway y este requisito activado (no activo aún)
  WHEN arranca el backend en producción con el secreto vacío
  THEN el arranque **MUST** abortar, como ya hace `FERNET_KEY`

## Acciones del dueño en Railway (frontera externa de `infra-n8n`)

No cerrable desde el repositorio. Generar el secreto una vez:
`python -c "import secrets; print(secrets.token_urlsafe(32))"`.

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
