# Delta for infrastructure

IN-001 exige hoy justo el `railway.toml` raíz que este cambio borra, y `test_ci_infra.py:285-315`
codifica como invariante el `VOLUME` de `Dockerfile.n8n:8` que el runbook documenta como **build
FAILED garantizado** en Railway. Suite y guard se contradicen. Este delta reescribe IN-001 y añade
el origen de verdad único que impide que vuelvan a contradecirse.

Verificado hoy: el guard tiene 3 comprobaciones y la 1ª (workflow sin `paths:`) falla por
`.github/workflows/ci.yml`, que está **fuera del alcance** de este cambio; el guard **no tiene
ninguna referencia en `.github/workflows/`**, luego hoy no bloquea nada automáticamente.

## MODIFIED Requirements

### Requirement: IN-001 — Despliegue de n8n desde imagen, con el conjunto completo de variables

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

#### Scenario: La raíz está limpia

- GIVEN el repositorio en cualquier rama
- WHEN se comprueban las invariantes de raíz
- THEN no hay `railway.toml` ni ningún `Dockerfile*` en la raíz

#### Scenario: Ningún Dockerfile declara VOLUME

- GIVEN todos los `Dockerfile*` del repositorio
- WHEN se inspeccionan sus instrucciones
- THEN ninguno contiene `VOLUME`

#### Scenario: Mutación — reintroducir el fichero del incidente

- GIVEN se recrea `Dockerfile.n8n` en la raíz con `VOLUME /home/node/.n8n`
- WHEN se ejecuta la suite de backend
- THEN los dos escenarios anteriores **MUST** fallar
- AND el guard **MUST** reportar violación de raíz

## ADDED Requirements

### Requirement: IN-002 — Un único origen de verdad para invariantes y variables

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

#### Scenario: Guard y suite concuerdan por construcción

- GIVEN una regla de raíz declarada sólo en el manifiesto
- WHEN se ejecutan el guard y la suite
- THEN ambos la aplican sin haber sido editados

#### Scenario: La lista del dueño vive en un solo sitio

- GIVEN el manifiesto y el documento canónico
- WHEN se comparan los nombres de variable del servicio n8n
- THEN coinciden exactamente
- AND ningún otro documento del repositorio declara esa lista por su cuenta

#### Scenario: Mutación — volver a escribir la regla a mano

- GIVEN se reintroduce en el guard o en un test la ruta `railway.toml` literal en vez de leerla del
  manifiesto
- WHEN se ejecuta la comprobación de origen único
- THEN **MUST** fallar

### Requirement: IN-003 — El resultado del guard es asertable por comprobación

El guard **MUST** permitir afirmar el estado de las invariantes de raíz **con independencia** de la
comprobación de `paths:` en los workflows, que hoy falla por `ci.yml` y queda fuera de este cambio.
Sin esa separación, «el guard está verde» no es comprobable y cualquier test que lo afirme sería
permanentemente rojo o vacío.

#### Scenario: Raíz limpia con ci.yml sin paths

- GIVEN la raíz sin `railway.toml` ni `Dockerfile*`, y `.github/workflows/ci.yml` sin `paths:`
- WHEN se ejecuta el guard
- THEN reporta las invariantes de raíz como satisfechas
- AND su resultado global sigue reflejando la violación de scoping, sin ocultarla

#### Scenario: Mutación — mezclar los dos resultados

- GIVEN se hace que el resultado de raíz dependa del de scoping
- WHEN se ejecuta la comprobación
- THEN **MUST** fallar

### Requirement: IN-004 — Entorno local reproducible desde un clon limpio

Un desarrollador que clone el repositorio y levante el stack local **MUST** obtener un n8n cuyo nodo
`Verify Signature` no lance: hoy `docker-compose.yaml:46-53` no pasa el secreto ni
`NODE_FUNCTION_ALLOW_BUILTIN`, así que los 18 workflows fallan en su primer nodo y la integración
nunca ha podido probarse en local desde que se añadió el HMAC.

El servicio n8n de `docker-compose.yaml` **MUST** declarar `N8N_WEBHOOK_SECRET`,
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, y el valor del secreto
**MUST** ser el mismo que recibe el backend en el mismo `docker compose`. La comprobación **MUST**
ser ejecutable por un script, no una instrucción en un README.

#### Scenario: El compose declara lo obligatorio

- GIVEN `backend/docker-compose.yaml`
- WHEN se comprueba el servicio n8n contra el manifiesto de IN-002
- THEN están las tres variables
- AND el secreto del servicio n8n y el del backend resuelven al mismo valor

#### Scenario: Mutación — quitar el flag de crypto

- GIVEN se elimina `NODE_FUNCTION_ALLOW_BUILTIN` del servicio n8n
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar

### Requirement: IN-005 — La documentación es decidible, no afirmativa

Ningún documento **MAY** afirmar si la instancia de n8n existe, está viva o tiene los workflows
activos: esa pregunta la responde `scripts/check-n8n-health.sh` (NWD-004). Hoy
`DEPLOY_CHECKLIST.md:84` dice que falta desplegarla y `DEPLOYMENT_RUNBOOK.md:56` da su URL de
producción; los dos documentos oficiales se contradicen sobre el hecho básico.

`DEPLOY_CHECKLIST.md` **MUST NOT** ofrecer la opción «Deploy from Dockerfile» (borra el fichero y
reintroduce el build FAILED) ni usar `N8N_WEBHOOK_URL`. `CONEXIONES_Y_N8N_SETUP.md:30` **MUST**
dejar de describir el secreto vacío como CSRF de OAuth: el state se consume con `find_one_and_delete`
antes de mirar el HMAC (`integrations.py:167-171`), así que un state forjado muere ahí; lo real es
el truncado y el acoplamiento de secretos (NWI-002).

La coherencia **MUST** comprobarse de forma ejecutable, con reglas concretas —no con una lectura
subjetiva de «no se contradicen».

#### Scenario: Los documentos apuntan al script

- GIVEN `DEPLOY_CHECKLIST.md` y `DEPLOYMENT_RUNBOOK.md`
- WHEN se comprueba la coherencia
- THEN ninguno afirma el estado de la instancia y ambos citan `check-n8n-health.sh`

#### Scenario: Mutación — reintroducir la afirmación

- GIVEN se restaura en `DEPLOY_CHECKLIST.md` el texto «Falta desplegar el servidor n8n», o aparece
  `N8N_WEBHOOK_URL` en cualquier documento
- WHEN se ejecuta la comprobación de coherencia
- THEN **MUST** fallar

### Requirement: IN-006 — [DIFERIDO, NO ACTIVAR] Secreto bloqueante en producción

**Este requisito NO se implementa en este cambio.** Mover `N8N_WEBHOOK_SECRET` a `prod_critical`
(`backend/main.py:63-68`) **MUST NOT** hacerse hasta que el dueño confirme que la variable existe
en el servicio backend de Railway: hoy no la ha puesto, y activarlo antes **impide arrancar el
backend en producción**.

Comportamiento vigente y exigible hoy: con `ENVIRONMENT=production` y secreto vacío el backend
**MUST** arrancar y **MUST** emitir un log `CRITICAL` (`main.py:88-96`).

Condición de activación: confirmación explícita del dueño de que `N8N_WEBHOOK_SECRET` está
configurada en Railway. Sólo entonces el arranque en producción **MUST** abortar con secreto vacío.

#### Scenario: Hoy — arranca y avisa

- GIVEN `ENVIRONMENT=production` y `N8N_WEBHOOK_SECRET=""`
- WHEN arranca el backend
- THEN arranca correctamente
- AND emite un log `CRITICAL` que nombra la variable

#### Scenario: Tras la confirmación del dueño (no activo aún)

- GIVEN la variable confirmada en Railway y este requisito activado
- WHEN arranca el backend en producción con el secreto vacío
- THEN el arranque **MUST** abortar, como ya hace `FERNET_KEY`
