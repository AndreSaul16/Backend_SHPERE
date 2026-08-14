# Exploración — `arreglar-ci-backend`

Fecha: 2026-08-08 · Rama: `master` (HEAD `a913329`, 5 commits por delante de `origin/master` `605ffc0`).
Toda cifra de este documento procede de un comando citado, ejecutado en esta sesión.

## Resumen ejecutivo

**A.** El contrato correcto es `master`. No existe requisito CI-001/CI-002 en ningún spec: `grep -rn "CI-001\|CI-002"` sobre todo el repo solo devuelve los *docstrings* de `backend/tests/test_ci_infra.py`. El test es huérfano e inventó sus propios IDs, así que no hay «fuente de verdad» que exija `main`; además `main` existe en el remoto pero está muerta (0 commits por delante, 15 por detrás de `master`).
**D.** El merge de `redesign/visual-identity-v3` **no introduce ningún fallo nuevo de backend**: la rama no toca `backend/` en absoluto y el merge simulado es limpio (0 conflictos), con el mismo conjunto de fallos que ya tenemos.
**B/C.** De los 10 fallos, **9 son deuda preexistente en `origin/master`** (verificado ejecutando la suite sobre `origin/master`) y solo 1 lo causamos nosotros. Los 13 errores de Mongo son artefacto local: `mongod` llevaba parado y arrancó a las 23:35:20, después de la ejecución base.
**Dinero.** No hay fuga: el *dead letter* de Stripe **sí se escribe**; el test lo busca en la base de datos equivocada.

## A. `main` vs `master`

### La rama `main` existe, pero está muerta

```
$ git ls-remote --heads origin
5023d93…  refs/heads/main
605ffc0…  refs/heads/master
5dc9aba…  refs/heads/railway/fix-deploy-138469
cc6a7c2…  refs/heads/redesign/visual-identity-v3

$ git ls-remote --symref origin HEAD
ref: refs/heads/master	HEAD

$ git rev-list --left-right --count refs/remotes/origin/main...origin/master
0	15

$ git log -1 --format='%H %ci' refs/remotes/origin/main
5023d93… 2026-06-12 17:07:19 +0200
```

`main` es un **ancestro estricto** de `master` (`git merge-base` devuelve el propio tip de `main`): cero commits propios, 15 por detrás, último commit del 12 de junio. `origin/HEAD` apunta a `master`. `git branch -r` no la mostraba porque el *refspec* local está recortado (`remote.origin.fetch = +refs/heads/master:refs/remotes/origin/master`), no porque no exista.

Consecuencia: un workflow con `branches: [main]` **no se dispara nunca**, ni en push ni en PR, porque nadie empuja ni abre PRs contra `main`. La afirmación de la cabecera de `ci.yml` («la única rama del repo es `master`») es inexacta —`main` existe— pero su conclusión operativa es correcta.

### El incidente de Railway

```
$ git show 1867ff4 --stat
fix(deploy): remover GitHub Actions workflows temporalmente
Los workflows causaban SKIPPED en Railway porque espera todos los checks.
 4 files changed, 386 deletions(-)   (ci-backend, ci-frontend, deploy-monitor-*)
```

El incidente fue **por push a la rama de despliegue**, no por el nombre de la rama. `ci.yml` (líneas 9-16) documenta que por eso hoy no hay trigger en push a `master`. Ninguna de las opciones de abajo reintroduce ese trigger, así que **ninguna cambia el comportamiento de despliegue de Railway**.

### Procedencia del test

```
$ git log --follow --oneline -- backend/tests/test_ci_infra.py
65f91bd ci: pipeline de GitHub Actions y servicio n8n con volumen persistente
fff299d fix: forzar LF con .gitattributes …
5f99fcd fix: modelo single-plan …
cd66c4f feat(board): chat grupal multi-agente …
```

`65f91bd` (12 jul) creó `ci.yml` con `branches: [main]` y en el mismo commit ajustó `test_ci_infra`. El test se escribió para congelar ese `ci.yml`, no para implementar un spec: `openspec/specs/infrastructure/spec.md` solo contiene `IN-001` (despliegue de n8n). **CI-001 y CI-002 no existen fuera del docstring.**

### Opciones

| Opción | Efecto en CI | Efecto en despliegue Railway | Coste |
|---|---|---|---|
| 1. Ajustar el test a `master`/`feat/**` | El gate real (PR contra `master`) queda cubierto y verde | Ninguno: `ci.yml` no se toca | Bajo |
| 2. Volver `ci.yml` a `main` | El pipeline no se ejecuta nunca; el gate es ficticio | Ninguno | Bajo, pero anula el propósito del cambio |
| 3. Añadir `main` junto a `master` en los filtros | Test verde y pipeline funcional, pero el fichero afirma algo falso (`main` está muerta) | Ninguno mientras no se añada `master` al trigger de *push* | Bajo |
| 4. Opción 1 + borrar `refs/heads/main` del remoto | Igual que 1, y elimina la ambigüedad de raíz | Ninguno | Bajo; irreversible sin backup del ref |

**Recomendación: opción 1, y considerar la 4 como limpieza aparte.** El test es el único artefacto que exige `main`, no lo respalda ningún spec, y la rama que nombra está abandonada. La opción 3 dejaría el repo mintiendo sobre su propia topología.

## B. Los 9 fallos de Stripe/billing — todos preexistentes

### Los 6 de `test_billing_api.py`: falta `STRIPE_SECRET_KEY` en `ci.yml`

`app/core/config.py:161-164` define `stripe_configured` como `bool(STRIPE_SECRET_KEY)`, y `app/presentation/api/v1/billing.py:23-28` y `:55-61` devuelven 503 antes de cualquier otra lógica. El bloque `env:` del job `test-backend` (`ci.yml:40-47`) **no define ninguna variable `STRIPE_*`**. Como el guard 503 se evalúa *antes* de la validación de SKU, los dos tests que esperan 403 también reciben 503.

Prueba del mecanismo (misma suite, añadiendo solo la clave):

```
$ STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy … pytest tests/test_billing_api.py -q
14 passed in 2.68s
```

Sin la clave son 6 fallos; con una clave *dummy*, 14 verdes. **Fallan igual en CI**: no es un artefacto local, es configuración ausente en el workflow.

### Los 3 de `test_stripe_webhooks.py`: los tests miran a la base de datos equivocada

`app/infrastructure/database.py:24` resuelve `DB_NAME = os.getenv("DB_NAME", "sphere_db")`, y `ci.yml:42` fija `DB_NAME: sphere_test`. Pero los tests **codifican `sphere_db` a mano**:

```
$ grep -n "sphere_db" backend/tests/*.py
tests/test_stripe_webhooks.py:34   events_col = db_instance.get_sync_client()["sphere_db"]["stripe_events_processed"]
tests/test_stripe_webhooks.py:66   dbc = db_instance.get_sync_client()["sphere_db"]
tests/test_stripe_webhooks.py:137  dbc = db_instance.get_sync_client()["sphere_db"]
tests/test_billing_api.py:168      db_sync = db_instance.get_sync_client()["sphere_db"]
tests/test_credit_manager.py:10    return db_instance.get_sync_client()["sphere_db"]
```

La aplicación es coherente (`app/presentation/api/v1/webhooks.py:105` usa `settings.DB_NAME`); son los tests los que están desalineados. Verificado que `settings.DB_NAME` y `database.DB_NAME` resuelven ambos a `sphere_test` bajo el entorno de CI.

Con el estado limpio y `DB_NAME=sphere_test` (exactamente lo que hace CI) los 3 siguen fallando, así que **no es suciedad de la base local: fallan en CI**.

```
$ DB_NAME=sphere_test … pytest tests/test_stripe_webhooks.py -q     # tras borrar los evt_* de sphere_test
3 failed, 1 passed in 2.88s
```

### El *dead letter*: no hay fuga de dinero

Ejecución aislada en una base virgen (`DB_NAME=sphere_probe1`), leyendo después lo que dejó el backend:

```
$ DB_NAME=sphere_probe1 … pytest tests/…::test_malformed_checkout_goes_to_dead_letter -q
1 failed in 2.82s

$ # contenido real de sphere_probe1
cols: ['failed_payments', 'stripe_events_processed', 'users']
DEAD-LETTER ESCRITA: evt_malformed_1 | campos: ['created_at', 'event_id', 'reason', 'stripe_object', 'type']
```

El backend **sí escribió** el registro en `failed_payments`, con `event_id`, `reason` y el `stripe_object` completo (`webhooks.py:109`). El test falla porque consulta `sphere_db.failed_payments`, colección que en el entorno de CI ni siquiera existe. **Es un bug del test, no del backend. Un pago malformado no se pierde en silencio.**

Contrafactual no ejecutado, declarado como tal: es razonable deducir que estos tests pasaban cuando se escribieron porque el desarrollador corría sin `DB_NAME`, cayendo al default `sphere_db` y coincidiendo con el valor codificado. **No lo he ejecutado** para no escribir datos de test en `sphere_db`, que contiene datos de desarrollo reales.

## C. Los 13 errores de Mongo — artefacto local, no reproducible

Hay un MongoDB real y sano en `localhost:27017` (`server_info()['version'] = 7.0.39`) y Redis responde `PING True`. La causa del episodio queda fechada por el propio servidor:

```
$ # serverStatus
uptime_segundos = 721
arrancado_aprox = 2026-08-08 23:35:20
ahora           = 2026-08-08 23:47:21
```

`mongod` arrancó a las **23:35:20**, es decir **después** de la ejecución base que produjo los 13 `ServerSelectionTimeout`. Eso también explica los 411 s de aquella ejecución: 13 timeouts × 30 s de `serverSelectionTimeoutMS` ≈ 390 s. Con Mongo levantado, la suite tarda **8-9 segundos**.

En **tres ejecuciones completas** posteriores no aparece ni un solo error de recolección ni de conexión, y los 13 tests que antes erraban ahora pasan (294 + 13 = 307):

```
$ MONGODB_URL=… DB_NAME=sphere_test … python -m pytest tests/ -q      # HEAD a913329
10 failed, 307 passed in 8.25s
```

Sobre CI: con el servicio `mongo:7` del workflow, estos 13 pasarían. Es una inferencia sólida (el fallo era ausencia de servidor, y CI arranca uno), pero **no la he podido ejecutar contra GitHub Actions**: no hay `gh` CLI, no hay Docker y los logs del workflow devuelven 403.

## Tabla de clasificación

Leyenda: **N** = causado por nosotros · **P** = preexistente en `origin/master` · **L** = artefacto del entorno local.

Evidencia transversal — la misma suite sobre `origin/master` en un *worktree* limpio:

```
$ git worktree add /tmp/sdd-om origin/master --detach     # HEAD 605ffc0
$ cd /tmp/sdd-om/backend && … python -m pytest tests/ -q
10 failed, 307 passed in 9.53s
```

En `origin/master` fallan los mismos 6 de billing y 3 de Stripe; **no** falla el de triggers (allí `ci.yml:11` dice `branches: [main]`) y sí falla `test_test_file_itself_loads`, que solo rompe dentro de un *worktree*.

| # | Test | Clase | Evidencia |
|---|---|---|---|
| 1 | `test_billing_api::test_create_checkout_session` | **P** | Falla idéntico en `origin/master` (run citado arriba). Verde con `STRIPE_SECRET_KEY=sk_test_dummy` → `14 passed` |
| 2 | `test_billing_api::test_create_portal_session` | **P** | Ídem |
| 3 | `…TestTopupSKUValidation::test_user_can_purchase_valid_sku_executive` | **P** | Ídem |
| 4 | `…TestTopupSKUValidation::test_user_can_purchase_valid_sku_director` | **P** | Ídem |
| 5 | `…TestTopupSKUValidation::test_user_cannot_purchase_invalid_sku` (`503 == 403`) | **P** | Ídem; el guard 503 precede a la validación de SKU (`billing.py:23-28`) |
| 6 | `…TestTopupSKUValidation::test_legacy_sku_topup_premium_rejected` (`503 == 403`) | **P** | Ídem |
| 7 | `test_ci_infra::test_ci_yml_triggers_on_push_and_pr_to_main` | **N** | Único fallo ausente en `origin/master`. Lo introduce `0c77f8a`: `assert 'main' in ['feat/**']` |
| 8 | `test_stripe_webhooks::test_stripe_webhook_idempotency_and_success` | **P** | Falla idéntico en `origin/master`. Persiste con base limpia y `DB_NAME=sphere_test` (`3 failed, 1 passed`) |
| 9 | `test_stripe_webhooks::test_topup_grant_idempotent_on_retry` (`0 == 50`) | **P** | Ídem; el saldo queda a 0 porque el test lee `sphere_db` y el grant fue a `sphere_test` |
| 10 | `test_stripe_webhooks::test_malformed_checkout_goes_to_dead_letter` | **P** | Ídem; el *dead letter* sí existe en la base configurada (run `sphere_probe1`) |
| 11-23 | 13 errores `ServerSelectionTimeout` en `test_agents.py`, `test_auth.py`, `test_agent_overrides.py` | **L** | `mongod` arrancó a las 23:35:20, después de la ejecución base. No reproducidos en 3 suites completas; los 13 ahora pasan (294+13=307) |

No puedo enumerar los 13 errores test a test: no volvieron a reproducirse, así que su identidad individual queda **no verificada**; solo consta el agregado (294 → 307 tests que pasan) y los ficheros implicados según la ejecución base.

## D. `test_ci_infra.py` como contrato de infraestructura frente al merge

Ficheros que el redesign toca y que están bajo contrato:

```
$ git diff --name-only master..redesign/visual-identity-v3 | grep -iE "^\.github/|Dockerfile|railway\.toml|nginx\.conf\.template|dockerignore|package\.json$"
.github/workflows/ci.yml
frontend/package.json

$ git diff --name-only master..redesign/visual-identity-v3 | grep "^backend/"
(vacío — la rama no toca backend en absoluto)
```

De los 312 ficheros que cambia la rama, solo 2 caen bajo contrato y ninguno lo rompe:

- `frontend/package.json` conserva los dos scripts exigidos (`"test": "vitest run"`, `"test:coverage": "vitest run --coverage"`).
- `Dockerfile.n8n`, `railway.toml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf.template` y `backend/.dockerignore` existen en la rama **sin cambios** respecto a `master`.
- `ci.yml` sí cambia, pero en la misma dirección que nosotros: la rama ya trae `pull_request: [master]` y añade `push: ['feat/**', 'redesign/**']`. Es decir, **el conflicto `main` ya está presente en la rama de redesign también**; no lo introduce el merge.

Merge simulado y suite completa sobre el árbol fusionado:

```
$ git merge --no-commit --no-ff redesign/visual-identity-v3
Automatic merge went well; stopped before committing as requested
$ git diff --name-only --diff-filter=U        → (sin conflictos)
$ … python -m pytest tests/ -q
11 failed, 306 passed in 8.72s
```

Los 11 son los 10 conocidos más `test_test_file_itself_loads`, que solo falla porque en un *worktree* `.git` es un fichero y no un directorio (`test_ci_infra.py:367`). **Respuesta a D: no, el merge no está peor de lo que creemos — no añade ni un fallo de backend.**

## E. Riesgo de despliegue

`backend/tests/test_production_readiness.py` es más estrecho de lo que sugiere su nombre: contiene dos clases, `TestPlanRateLimits` y `TestEmailVerifiedGate` (límites de peticiones por plan y puerta de email verificado). No audita infraestructura de despliegue.

```
$ … python -m pytest tests/test_production_readiness.py -q
5 passed in 0.52s
```

Pasa entero. El resto de `test_ci_infra.py` (24 de sus 25 tests) también pasa: el único rojo es el de los triggers.

Qué se rompería en producción si fusionamos hoy con el backend en rojo:

- **Nada por causa del merge en sí.** La rama no toca backend, y los 9 fallos de Stripe/billing ya viven en `origin/master` desde antes; producción lleva conviviendo con ellos.
- **El gate seguiría siendo ficticio.** Con `ci.yml` apuntando a `master`/`feat/**`, un PR de `redesign/visual-identity-v3` contra `master` **sí** dispara el pipeline, y ese pipeline saldría rojo por los 9 preexistentes, bloqueando el merge por deuda ajena al rediseño.
- **Riesgo real de configuración, no de código:** si `STRIPE_SECRET_KEY` no está puesta en el entorno de producción, el backend devuelve 503 en `/checkout` y `/portal` — es decir, nadie puede pagar. Los tests fallan por lo mismo, así que el rojo de billing es un síntoma que conviene no silenciar: **verificar la variable en Railway antes de fusionar**.

## Ficheros críticos

| Fichero | Líneas | Por qué |
|---|---|---|
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/tests/test_ci_infra.py` | 26-44 | El test de triggers; exige `main` y cita CI-001/CI-002, que no existen |
| " | 367 | `assert ROOT.joinpath(".git").is_dir()` — falso negativo dentro de un *worktree* |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/.github/workflows/ci.yml` | 1-16 | Cabecera con el razonamiento del incidente de Railway |
| " | 19-23 | Bloque `on:` — `pull_request: [master]`, `push: ['feat/**']` |
| " | 40-47 | `env:` del job `test-backend` — **sin ninguna `STRIPE_*`** |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/app/presentation/api/v1/billing.py` | 23-28, 55-61 | Guards 503; se evalúan antes de la validación de SKU |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/app/core/config.py` | 89-95, 161-164 | Claves `STRIPE_*` y `stripe_configured` |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/app/infrastructure/database.py` | 24 | `DB_NAME = os.getenv("DB_NAME", "sphere_db")` |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/app/presentation/api/v1/webhooks.py` | 105, 109 | Usa `settings.DB_NAME`; escribe el *dead letter* en `failed_payments` |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/tests/test_stripe_webhooks.py` | 34, 66, 137 | `sphere_db` codificado a mano |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/tests/test_billing_api.py` | 168 | Ídem |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/backend/tests/test_credit_manager.py` | 10 | Ídem (hoy no falla, misma bomba de relojería) |
| `/home/jarvis/code/SPHERE/Frontend_SPHERE/openspec/specs/infrastructure/spec.md` | 8-12 | Solo `IN-001`; no hay CI-001/CI-002 |

## Preguntas abiertas para el dueño

1. **¿Se arregla la deuda preexistente de Stripe/billing dentro de este cambio o en uno aparte?** Son 9 de los 10 fallos y son la diferencia entre un CI verde y un CI que sigue rojo tras arreglar los triggers. Arreglarlos aquí amplía el alcance; dejarlos fuera significa que el pipeline recién activado nace en rojo y no puede usarse como gate de merge del rediseño.
2. **¿Se confirma `master` como rama de contrato y se borra `refs/heads/main` del remoto?** Mantener la rama muerta deja abierta la ambigüedad que originó este fallo. Borrarla es irreversible sin backup del ref.
3. **¿`STRIPE_SECRET_KEY` está configurada en el entorno de producción de Railway?** No es verificable desde el repo. Si no lo está, los pagos ya están caídos en producción, con independencia de este cambio.

## Riesgos

1. **Configuración de Stripe en producción (impacto en dinero, no confirmado).** El *dead letter* funciona y no se pierde ningún pago malformado — eso queda descartado. El riesgo real es distinto: si `STRIPE_SECRET_KEY` falta en producción, `/checkout` y `/portal` devuelven 503 y **nadie puede comprar**. No verificable desde el repo; requiere mirar el dashboard de Railway.
2. **El pipeline nace en rojo.** Al activarse por primera vez, los 9 fallos preexistentes bloquearán todo PR contra `master`, incluido el del rediseño. Si no se decide qué hacer con ellos, el gate recién creado se convertirá en un obstáculo que alguien acabará saltándose.
3. **Fragilidad del `DB_NAME` codificado.** Cinco tests fijan `sphere_db` a mano. `test_credit_manager.py:10` tiene el mismo defecto y hoy no falla por casualidad; cualquier cambio de aserción lo activará.
4. **Los tests de Stripe no son idempotentes entre ejecuciones.** Su limpieza borra de `sphere_db` mientras la aplicación escribe en `DB_NAME`, así que en una base persistente el estado se acumula. En CI no importa (contenedor efímero), en local produce fallos fantasma.
5. **Riesgo de despliegue de Railway al tocar los triggers.** Bajo mientras no se añada `master` al trigger de `push`, que es exactamente lo que provocó `1867ff4`. Cualquier propuesta que lo reintroduzca debe verificarse antes en el dashboard de Railway.
6. **Verificación de CI imposible en local.** Sin `gh`, sin Docker y con los logs de Actions en 403, la primera ejecución real del workflow será la primera medición de verdad. El job de frontend además incluye un presupuesto de bundle que **nunca se ha medido**.

## Estado del entorno tras la exploración

No se modificó código. Los artefactos temporales se retiraron: *worktree* `/tmp/sdd-om` eliminado, rama `sdd-merge-probe` borrada, bases `sphere_probe*` / `sphere_test_om` / `sphere_test_mg` eliminadas. El repositorio sigue en `master`, HEAD `a913329`, 5 commits por delante de `origin/master`. Se creó la referencia local `refs/remotes/origin/main` (necesaria para comparar) y se borraron de `sphere_test` cuatro documentos de test (`evt_*`) para poder ejecutar el experimento de estado limpio.
