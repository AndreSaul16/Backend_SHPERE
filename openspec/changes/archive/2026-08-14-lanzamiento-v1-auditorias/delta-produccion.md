# Delta de producción — auditoría de release v1

**Fecha:** 2026-08-13 · **Auditor:** agente de release · **Método:** solo lectura. Ningún merge real, ningún commit, ningún push, ninguna rama modificada. Los merges se simularon con `git merge-tree` y con un worktree *detached* desechable que se borró al terminar (prueba en §4.4). Cada afirmación de este informe lleva el comando o el fichero del que sale.

**Referencia de producción:** `origin/master` = `605ffc0`. Railway despliega desde `master`, así que **eso es lo que hay hoy delante del usuario**.

---

## 0. Resumen de la situación

| Rama | HEAD | CI real (GitHub API) | Relación con `master` local |
|---|---|---|---|
| `origin/master` (**PRODUCCIÓN**) | `605ffc0` | **0 check-runs — nunca pasó por CI** | base |
| `master` local | `a913329` | **0 check-runs — nunca pasó por CI** | 5 commits por delante de producción |
| `feat/backend-ci-verde` | `638206a` | verde (`test-backend` ✔ · `test-frontend` ✔) | descendiente de `master` |
| `feat/grant-huerfano` | `57bddec` | verde (`test-backend` ✔ · `test-frontend` ✔) | descendiente de `master`, **contiene** `backend-ci-verde` |
| `redesign/visual-identity-v3` | `cc6a7c2` | **ROJO — `test-backend (3.11)` = failure** | descendiente de `master`, 145 commits |
| `origin/main` | `5023d93` | histórico en rojo | rama muerta |
| `origin/railway/fix-deploy-138469` | `5dc9aba` | — | rama muerta, 0 contenido nuevo |

> `lint` figura como `failure` en las tres ramas, pero el job es `continue-on-error: true` en todas ellas (`.github/workflows/ci.yml`, job `lint`). No bloquea y no cuenta como regresión.

**Evidencia de "producción nunca pasó por CI":**
```
GET /repos/AndreSaul16/Frontend_SPHERE/commits/605ffc0/check-runs → total_count: 0
GET /repos/AndreSaul16/Frontend_SPHERE/commits/a913329/check-runs → total_count: 0
```
El `ci.yml` de `origin/master` dispara en `push`/`pull_request` sobre **`main`**, una rama que está muerta. El workflow no se ha ejecutado nunca contra el código que está en producción.

---

## 1. Delta `origin/master` → `master` local (5 commits) — qué cambia para el usuario

| Commit | Qué ve el usuario HOY en producción | Qué pasa a ver |
|---|---|---|
| `b7452be` fix(agents) | **La base de conocimiento de un agente no funciona.** Listar, subir y borrar documentos llaman al backend **sin cabecera `Authorization`** → el endpoint responde 401. Y aunque respondiera, el GET devuelve `{documents, total_count}` y el código mete ese objeto entero en `setDocuments` esperando un array → la lista nunca se pinta. | Las tres operaciones se autentican y la respuesta se lee con su forma real. La base de conocimiento vuelve a existir. |
| `84c14e0` fix(chat) | **`/chat/settings` revienta.** Si se entra antes de que la sesión haya cargado, React lanza *"Rendered more hooks than during the previous render"*: los ajustes de conversación son inaccesibles. | Los hooks suben por encima del *early return*; la pantalla abre siempre y se sincroniza cuando llega la sesión. |
| `e44f974` chore(deps) | El saneado del HTML del chat depende de `dompurify`, que **nadie declara**: viaja como dependencia transitiva. Un `npm ci` que resuelva el árbol de otra forma lo deja fuera y el chat pierde la sanitización. | `dompurify` es dependencia directa y hay un verificador de sincronía del lockfile (`frontend/scripts/verify-lock-sync.mjs`). |
| `0c77f8a` ci | **No hay gate.** El pipeline apunta a `main` (rama muerta) y el `Typecheck` es un no-op: `tsc --noEmit` sobre un `tsconfig.json` *solution-style* comprueba **cero ficheros** y sale 0 siempre. | El pipeline se dispara en PR contra `master` y en push a `feat/**`; el typecheck pasa a `tsc -b --noEmit` y comprueba de verdad. |
| `a913329` test(agents) | — | +12 casos de regresión que fijan los dos P0 anteriores. |

**Evidencia del contrato roto** (`backend/app/presentation/api/v1/documents.py`):
```
:46  @router.post("/{agent_id}/documents", response_model=DocumentResponse)
:51      user: dict = Depends(get_current_user),
:178 @router.get("/{agent_id}/documents", response_model=DocumentListResponse)
:181     user: dict = Depends(get_current_user),
```
El backend ya exigía autenticación y ya devolvía `DocumentListResponse`. **El frontend de producción nunca se alineó.** El arreglo es del lado del frontend: el backend no cambia.

---

## 2. Delta `master` local → `feat/grant-huerfano` (17 commits) — el bug de pagos

### 2.1 Respuesta binaria

> ## SÍ. El bug de pagos está VIVO HOY EN PRODUCCIÓN.

### 2.2 Evidencia

**a) El fichero de producción es idéntico al de `master` local** — el arreglo no ha tocado producción por ninguna vía:
```
$ git log --oneline origin/master..master -- backend/app/presentation/api/v1/webhooks.py
(sin salida)
```

**b) El código que hay hoy en `origin/master` descarta el resultado de la escritura.** En `origin/master:backend/app/presentation/api/v1/webhooks.py`:

```python
def _grant_subscription(users_col, user_id, plan_id, customer_id, subscription_id, period_end):
    ...
    users_col.update_one({"firebase_uid": user_id}, update)   # ← resultado descartado
```
```python
def _grant_topup(users_col, user_id, plan_id):
    ...
    users_col.update_one(
        {"firebase_uid": user_id},
        {"$inc": {"wallet.topup_messages_balance": topup_messages}},
    )                                                          # ← resultado descartado
```

Si el perfil no existe (alta a medias, cuenta borrada), Mongo actualiza **0 documentos** y nadie se entera.

**c) Y es irrecuperable, no solo silencioso.** El orden de operaciones en producción es:

1. El evento se marca `processing` en `processed_events`.
2. `_claim_grant` **inserta ya** la transacción en `credit_transactions` con `stripe_event_id` (índice único).
3. `_grant_*` intenta escribir el wallet — y falla en silencio.
4. Al final del `try`, el evento se marca **`done`**.

Resultado: el cliente paga → Stripe recibe 200 → **los créditos no llegan** → y un *replay* del webhook **tampoco los otorga**, porque el claim ya está escrito (el reintento choca con `DuplicateKeyError`) y el evento ya está `done`. El dinero entró y el saldo no.

**d) Segunda vía del mismo agujero:** si el `$set` lanza (p. ej. `WriteError` sobre un wallet corrupto), el claim ya está escrito y el evento se marca `done` igual → mismo desenlace.

### 2.3 Qué trae el arreglo (`feat/grant-huerfano`)

- **Guarda de perfil antes de reclamar.** Si `users.firebase_uid` no existe, se sale **antes** de escribir el claim y antes del dispatch de `mode`. No se muta nada.
- **El evento NO se marca `done`** en ese caso: queda reprocesable. Cuando el perfil aparezca, un replay del mismo evento **sí** otorga los créditos.
- **`matched_count` como señal** (no `modified_count`: reaplicar los mismos valores daría 0 con el perfil presente y dispararía una compensación falsa).
- **Compensación del claim** si el grant no se aplica: se borra por `_id`, nunca por `stripe_event_id`.
- **Fail-closed ante excepción**: si el grant lanza, el claim se revierte y se propaga el error → 500 → Stripe reintenta solo, y el reintento otorga limpio.
- **`_dead_letter` idempotente por upsert** sobre `failed_payments.event_id`: un pago no aplicado deja **una** fila que soporte puede leer y compensar, no N filas por reentrega (que invitarían a compensar N veces).
- **+20 tests de webhooks** (243 defs `test_` en el árbol vs 223 en `backend-ci-verde`; el delta coincide exactamente con los 318 → 338 declarados).
- **`backend/scripts/audit_orphan_grants.py`**: auditoría **read-only** de grants huérfanos, con pretil que exige `--yes` si la base no parece de test o `ENVIRONMENT=production`.

### 2.4 Lo que trae de propina (`feat/backend-ci-verde`, incluido)

Harness de tests del backend arreglado: la base de test se resuelve vía `settings.DB_NAME`, la suite **aborta** si apunta fuera de una base de test, y el CI exporta credenciales Stripe **falsas y en claro** (`sk_test_ci`/`whsec_ci`) — sin ellas `settings.stripe_configured` es `False` y `billing.py` corta con 503 antes de que los mocks entren en juego. **Esto es lo que pone verde el `test-backend`.**

---

## 3. Delta → `redesign/visual-identity-v3` (145 commits)

`master` local es ancestro directo: la rama contiene **todo** lo de §1. **No toca `backend/` en absoluto** (`git diff --name-only a913329 redesign -- backend/` = vacío).

### 3.1 Lo visual

Identidad nueva completa ("sala capitular": paño verde como campo dominante, latón como único metal y acción primaria, oxblood para el disenso, papel cálido para todo documento; radios 2/4/8/12px, filetes de 1px, cero blur decorativo). Cuatro fuentes variables **auto-hospedadas** (`frontend/public/fonts/`, ~364 KB) en lugar de Google Fonts. `index.css` reescrito sobre tokens y `tailwind.config.js` borrado.

**El tema claro pasa a existir de verdad:** hoy es CSS muerto y el selector miente. La auditoría lo midió: los nombres de los directores en claro estaban a **2.24-2.57:1**, las iniciales a **2.01-2.31:1**, el saldo y "Nuevo Chat" a 3.28-3.96:1. Todo arreglado y re-medido.

### 3.2 Lo funcional — no es solo pintura

47 commits `feat`. Lo que gana el usuario:

- **Juntas:** replay del debate (con uno de muestra), grado de desacuerdo legible de un vistazo, dos directores enfrentados con sus votos, aguja de confianza, Palco con todos los asientos visibles a la vez en móvil, Canto del orden del día.
- **Acta:** se presenta a pantalla completa en vez de copiarse a Google Slides; próximos pasos marcables y recordables; sello, fecha y recuento en cabecera; **export de la junta entera a un fichero que se abre sin red**.
- **Chat:** regenerar un turno deja de destruir la respuesta anterior; borrador persistido por sesión; compositor que crece; transcript leído como documento (68ch) y no como chat.
- **Dinero:** el coste se declara **antes** de escribir, no en el 402; el saldo se lee de un vistazo; **el portal de Stripe deja de estar muerto**.
- **Cuenta:** recuperar la contraseña deja de ser un ticket de soporte; entrar a `/billing` sin sesión devuelve a `/billing` y no a la portada.
- **Seguridad de datos del usuario:** salir con cambios sin guardar ya no es gratis; borrar una junta deja de ser irreversible; mover créditos en `/admin` exige confirmar.
- **Robustez:** fronteras de error por región (no solo en la raíz); aviso de pérdida de conexión antes de que el usuario se estrelle; los fallos silenciosos pasan a avisos.
- **Navegación:** paleta de comandos única para las 13 rutas; 7 atajos de teclado con hoja de ayuda; dos densidades y en táctil manda el dedo; 10 servicios de conexiones dejan de ser 6 pantallas de scroll.
- **Esperas y huecos:** 8 "Cargando…" pasan a silueta de lo que viene; 4 estados vacíos dejan de ser un hueco o una página en blanco.

### 3.3 Veredicto de `AUDIT_FINAL_V3.md`

> **APTO CON RESERVAS.**

Verde: `tsc -b --noEmit` exit 0 · `vitest run` **101 ficheros, 827 tests** todos verdes · 0 clases muertas · `eslint src` 0 errores · axe-core **0 violaciones critical/serious en las 13 rutas** · matriz responsive 7 anchuras × 13 rutas = **91 celdas con 0 px de scroll horizontal**.

**Las dos reservas — ninguna se puede levantar sin stack real:**

| Reserva | Qué falta | Qué hace falta para cerrarla |
|---|---|---|
| **8.4 — perfil de rendimiento móvil** | **NO EJECUTADA.** Sin medir: fps en streaming, p95 de scroll, capas compuestas, TBT de la landing. | Backend vivo + sesión Firebase real + 300 turnos + CPU 6× + **una pasada en hardware físico clase Redmi Note/Galaxy A** |
| **8.6 — QA E2E de Board V2** | **NUNCA EJECUTADA** (única tarea del plan de Board V2 que jamás ha corrido). | Backend vivo: latencia total <100s, ausencia de SSE duplicado, votos visibles, acta descargable y **cobro 5 → refund 2 contra `/me`** |

Deudas declaradas, no bloqueantes: `ChatPanel.tsx` de 1320 líneas (era 628 en master); SHIM del sistema viejo con **~210 usos vivos**; suite axe no está en CI; 5 `fetch()` fuera de `req()` que se saltan el manejador global (un 402 ahí no abre el paywall).

### 3.4 Hallazgo que no estaba en el encargo: **el CI de esta rama está EN ROJO**

```
GET /commits/cc6a7c2/check-runs
  test-backend (3.11)  → failure
  test-frontend (20)   → success
  lint                 → failure (continue-on-error)
```

**Causa identificada:** el `ci.yml` de `redesign` **no exporta `STRIPE_SECRET_KEY` ni `STRIPE_WEBHOOK_SECRET`** — su bloque `env:` del job `test-backend` termina en `DEEPSEEK_API_KEY`. Ese arreglo vive en `feat/backend-ci-verde`, que `redesign` no contiene. No es una regresión del rediseño: es la ausencia del arreglo del harness.

**`test-frontend` sí pasa entero**, incluidos los pasos propios de la rama: `Clases muertas`, **`Build de producción`**, `Presupuesto de arranque (entry ≤ 220 KB gzip · CSS ≤ 45 KB gzip)`. Eso descarta que el borrado de los cuatro `define` de `vite.config.ts` (`__GIT_COMMIT_SHA__` y compañía) rompa el build.

---

## 4. Merges simulados — **0 conflictos**

### 4.1 Ancestría (nada que fusionar en dos de los tres casos)

```
$ git merge-base master feat/grant-huerfano          → a913329  (= master)
$ git merge-base master redesign/visual-identity-v3  → a913329  (= master)
$ git merge-base --is-ancestor master feat/grant-huerfano          → SÍ
$ git merge-base --is-ancestor master redesign/visual-identity-v3  → SÍ
$ git rev-list --count redesign/visual-identity-v3..master         → 0
```

| Merge | Resultado | Conflictos |
|---|---|---|
| `master` → `feat/grant-huerfano` | **fast-forward** | **0** |
| `master` → `redesign/visual-identity-v3` | **fast-forward** | **0** |
| `feat/grant-huerfano` × `redesign/visual-identity-v3` | merge de tres vías, base `a913329` | **0** |

### 4.2 El único merge real: `grant-huerfano` × `redesign`

Superficie de solape mínima — **1 fichero de 336**:

```
ficheros tocados por grant-huerfano: 24
ficheros tocados por redesign:      312
INTERSECCIÓN: .github/workflows/ci.yml
```

Y las dos ramas editan **regiones distintas** de ese fichero:
- `grant-huerfano` toca el bloque `env:` del job `test-backend` (Stripe + `SPHERE_DEFAULT_BRANCH`).
- `redesign` toca los triggers (`push: ['feat/**', 'redesign/**']`) y añade steps al job `test-frontend`.

### 4.3 Doble verificación

**a) `git merge-tree` (sin efectos secundarios):**
```
$ git merge-tree a913329 feat/grant-huerfano redesign/visual-identity-v3
bloques 'changed in both': 1   (.github/workflows/ci.yml)
marcadores '<<<<<<<':      0
```

**b) Merge real en worktree *detached* desechable:**
```
$ git worktree add --detach $SCRATCH/wt-merge-sim feat/grant-huerfano
$ git -C $SCRATCH/wt-merge-sim merge --no-commit --no-ff redesign/visual-identity-v3
Auto-merging .github/workflows/ci.yml
Automatic merge went well; stopped before committing as requested
$ git -C ... diff --name-only --diff-filter=U   → (vacío)
$ git -C ... ls-files -u | wc -l                → 0
```

**c) El YAML resultante es válido y conserva ambos lados:**
```
YAML OK. jobs: ['test-backend', 'test-frontend', 'lint']
triggers: {'pull_request': {'branches': ['master']},
           'push': {'branches': ['feat/**', 'redesign/**']}}
STRIPE_SECRET_KEY: sk_test_ci        ← de grant-huerfano, conservado
STRIPE_WEBHOOK_SECRET: whsec_ci      ← de grant-huerfano, conservado
SPHERE_DEFAULT_BRANCH: ${{ ... }}    ← de grant-huerfano, conservado
steps: Clases muertas · Build de producción · Presupuesto de arranque  ← de redesign, conservados
```
Los asserts de `test_ci_infra.py` (grant-huerfano) siguen satisfechos tras el merge: `push.branches` = `['feat/**','redesign/**']` no cubre la rama por defecto (`master`) ni solapa con `pull_request.branches`.

### 4.4 Prueba de que no queda rastro

```
$ git worktree list
/home/jarvis/code/SPHERE/Frontend_SPHERE  57bddec [feat/grant-huerfano]

$ git status
On branch feat/grant-huerfano
Untracked files:
	VISUAL_CHECK.md
	VISUAL_CHECK_2.md
nothing added to commit but untracked files present

$ git branch -v
  feat/backend-ci-verde       638206a
* feat/grant-huerfano         57bddec
  master                      a913329 [ahead 5]
  redesign/visual-identity-v3 cc6a7c2
```
Los dos `VISUAL_CHECK*.md` ya estaban sin seguimiento **antes** de empezar esta auditoría. Ninguna rama movida, ningún commit, ningún merge persistido.

---

## 5. Orden de despliegue recomendado

### Paso 1 — `master` local → `origin/master`
Desbloquea la base de conocimiento de agentes (401 hoy) y `/chat/settings` (crash hoy). Riesgo bajísimo: 8 ficheros, solo frontend + CI, **el backend no cambia**. El frontend se alinea con un contrato que el backend ya tenía.
*(Queda absorbido por el paso 2, que lo contiene entero. Se puede saltar y hacer el 2 directamente.)*

### Paso 2 — `feat/grant-huerfano` → `master` · **PRIMERO Y URGENTE**
- Es **fast-forward**: 0 conflictos, 0 riesgo de resolución manual.
- Es lo único que toca **dinero**. Cada día que pase es otro día en que un cliente puede pagar y no recibir créditos, de forma irrecuperable.
- CI real **verde** en el HEAD exacto (`57bddec`).
- 0 variables de entorno nuevas, 0 migraciones, `config.py` y `main.py` intactos.
- Trae además el harness de backend que hace falta para el paso 3.

### Paso 3 — `redesign/visual-identity-v3` → encima de lo anterior · **DESPUÉS, NUNCA ANTES**
Razón técnica dura, no de preferencia: **el CI de `redesign` solo se pone verde después del paso 2.** Su `test-backend` falla hoy porque le faltan las credenciales Stripe falsas que introduce `backend-ci-verde` (contenida en `grant-huerfano`). Al revés, el rediseño entraría a producción con el backend en rojo y sin forma de distinguir un fallo real de uno de configuración.

Corolario tranquilizador: `redesign` **no toca `backend/`**, así que el paso 2 no puede regresar nada del rediseño, y el paso 3 no puede regresar el arreglo de pagos. Son ortogonales.

**Antes de ejecutar el paso 3**, cerrar o aceptar por escrito las dos reservas de `AUDIT_FINAL_V3.md` (§3.3): el perfil de rendimiento en móvil físico (8.4) y el E2E de Board V2 con cobro/refund reales (8.6).

### Paso 4 — higiene
Borrar `origin/main` y `origin/railway/fix-deploy-138469` (ver §7). Considerar añadir `push: [master]` al `ci.yml` **solo tras confirmar en el dashboard de Railway que el servicio no espera a los checks de GitHub** — es exactamente lo que provocó los deploys SKIPPED de `1867ff4`.

---

## 6. Riesgos del despliegue

### 6.1 Migraciones de datos: **ninguna requerida**

`backend/main.py` **no cambia en ninguna de las tres ramas** (verificado con `git diff origin/master <rama> -- backend/main.py`, vacío en las tres). El índice del que depende toda la idempotencia de pagos **ya está creado en producción**:

```python
# backend/main.py:265-271 — presente en origin/master
tx_col = db.get_async_db()["credit_transactions"]
await tx_col.create_index(
    [("stripe_event_id", ASCENDING)],
    unique=True,
    partialFilterExpression={"stripe_event_id": {"$exists": True}},
    background=True,
)
```

**Pero hay dos acciones de datos que sí tocan hacer, y no las hace el deploy:**

| Acción | Por qué | Comando |
|---|---|---|
| **Auditar y compensar los pagos ya huérfanos** | El arreglo **previene**, no repara. Los clientes que ya pagaron sin recibir créditos siguen sin recibirlos: el evento está `done` y el claim escrito. Nadie sabe hoy cuántos son. | `MONGODB_URL=... python backend/scripts/audit_orphan_grants.py --yes` (read-only; exige `--yes` contra producción) |
| **Índice único en `failed_payments.event_id`** | `_dead_letter` es idempotente **por upsert**, no por índice. Bajo carrera (dos reentregas simultáneas de Stripe) puede duplicar la fila del buzón, y el buzón es lo que soporte lee para devolver dinero. | No existe hoy. Evaluar antes de que el volumen importe. |

### 6.2 Contrato de API frontend ↔ backend: **sin desfase**

El único cambio de contrato del delta es el de §1 (`KnowledgeBasePanel`), y va **en la dirección segura**: el frontend se adapta al contrato que el backend ya expone (`Depends(get_current_user)` + `DocumentListResponse`). **Ningún endpoint del backend cambia de forma en ninguna rama.** No hay ventana de incompatibilidad entre desplegar backend y frontend.

### 6.3 Variables de entorno: **ninguna rama añade ninguna**

```
$ git diff origin/master <rama> -- backend/app/core/config.py   → vacío en las 3
$ git diff origin/master <rama> -- frontend/.env.example        → vacío en las 3
```

**Este despliegue no necesita tocar Railway.** Lo que sigue es deuda **preexistente**: `backend/RAILWAY.md` está desalineado con lo que el código exige de verdad. No puedo leer la configuración real de Railway desde el repo, así que la columna final marca lo que **no está documentado** como obligatorio y por tanto es candidato razonable a faltar.

#### Tabla — lo que el código exige vs. lo que `RAILWAY.md` documenta

| Variable | Exigida por el código | `RAILWAY.md` | Qué rompe si falta en Railway |
|---|---|---|---|
| `MONGODB_URL` | **Bloqueante siempre** (`main.py:70-75`, sin default en `config.py`) | ✅ obligatoria | El backend no arranca. |
| `OPENAI_API_KEY` | **Bloqueante en producción** (`main.py:64`) | ✅ obligatoria | El backend no arranca. |
| `DEEPSEEK_API_KEY` | **Bloqueante en producción** (`main.py:65`) | ✅ obligatoria | El backend no arranca. |
| `FERNET_KEY` | **Bloqueante en producción** (`main.py:66`) | ✅ obligatoria | El backend no arranca. Sin ella no hay cifrado de tokens OAuth en reposo. |
| `FIREBASE_CREDENTIALS_JSON` **o** `..._PATH` | **Bloqueante en producción** (`main.py:100-101`) | ⚠️ documenta solo `_PATH` | En Railway se usa `_JSON`. `RAILWAY.md` induce a configurar la variable equivocada. |
| `REDIS_URL` | Listada como crítica (`main.py:67`) **pero tiene default `redis://localhost:6379`**, así que la validación **nunca dispara** | ⚠️ como "opcional" | **Trampa:** si falta, el arranque pasa limpio y el backend habla con un Redis que no existe. Falla en runtime (rate limiting, no en el arranque). |
| `ALLOWED_ORIGINS` | Consumida en `main.py:390` (CORS) | ⚠️ dice default `*` — **falso**: el default real es `http://localhost:3000,http://127.0.0.1:3000` | **El frontend de Railway se queda fuera de CORS.** Toda la app deja de hablar con el backend desde el navegador. |
| `STRIPE_SECRET_KEY` | No bloqueante, pero `main.py:81-85` loguea CRITICAL | ❌ **no aparece** | **Los pagos quedan deshabilitados.** `stripe_configured=False` → el frontend oculta la UI de pagos y `billing.py` corta con 503. |
| `STRIPE_WEBHOOK_SECRET` | Usada para verificar la firma del webhook | ❌ **no aparece** | El webhook de Stripe no puede validar firmas. **Sin esto el arreglo del bug de pagos es irrelevante: no llega ningún evento válido.** |
| `STRIPE_PRICE_EXECUTIVE` · `_DIRECTOR` · `_BOARDROOM` · `_QUICK_MEETING` · `_DEEP_DIVE` | `stripe_client.py:14-19` | ❌ **no aparecen** | Los 5 SKU de compra no se pueden crear en Checkout. No se puede comprar nada. |
| `FRONTEND_URL` | `stripe_client.py:36,37,55` (`success_url`, `cancel_url`, `return_url`) | ❌ **no aparece** | Default `http://localhost:5173`. **Tras pagar, el usuario aterriza en localhost.** |
| `ADMIN_EMAILS` | `admin.py:35` | ❌ **no aparece** | Nadie puede entrar a `/admin`. |
| `OAUTH_REDIRECT_BASE_URL` | `integrations.py:34` | ❌ **no aparece** | Default `http://localhost:8000/...`. Todo el OAuth de integraciones (Google Calendar, etc.) roto. |
| `N8N_WEBHOOK_SECRET` | `main.py:91-96` loguea CRITICAL en producción si está vacío | ⚠️ como "opcional" | Las firmas HMAC de los webhooks n8n se calculan con secreto vacío → **trivialmente falsificables**. |
| `ENVIRONMENT` | Default `production` (estricto) | ✅ opcional | Correcto tal cual. Ojo: ponerla en `development` desactiva TODAS las validaciones bloqueantes. |
| `RATE_LIMIT_CHAT_PER_MINUTE` | **No existe en el código** | ❌ documentada por error | Ninguno. Ruido en `RAILWAY.md`. |

> Acción recomendada, **independiente de este release**: verificar en el dashboard de Railway las 11 filas marcadas ❌, y reescribir `backend/RAILWAY.md` desde `config.py` + `main.py`.

### 6.4 Riesgos específicos del paso 3 (rediseño)

- **+364 KB de fuentes** en `dist/` (`frontend/public/fonts/`, 4 `.woff2` variables) que hoy no se sirven. El presupuesto de arranque está verificado en CI (entry ≤ 220 KB gzip, CSS ≤ 45 KB gzip) y pasa.
- `frontend/index.html` cambia (preload de fuentes, metadatos, contrato de dirección). `frontend/vite.config.ts` borra 4 `define` de metadatos de build; el job `Build de producción` de CI pasa, así que no hay consumidores vivos.
- **`nginx.conf`, `Dockerfile` y `docker-entrypoint.sh` NO cambian** en el rediseño. El proxy de Vite que se añade es **solo del servidor de desarrollo**. Producción sigue sirviéndose exactamente igual.
- **Reservas 8.4 y 8.6 abiertas** (§3.3): el rendimiento en móvil real y el flujo de cobro/refund del Board V2 no están verificados de punta a punta. Son las dos únicas cosas que la auditoría no pudo cerrar.
- La verificación `grep b620ecfd dist/index.html` (contrato de dirección superviviente al build) nunca se ha ejecutado: está en fuente, no en `dist/`.

### 6.5 Riesgo transversal

**Producción se despliega sin gate automático.** `605ffc0` y `a913329` tienen **0 check-runs**. El pipeline dispara en PR contra `master` y en push a `feat/**`, deliberadamente **no** en push a `master` (para no reproducir los deploys SKIPPED de `1867ff4`). Consecuencia práctica: si alguien mergea a `master` sin PR, no hay verificación ninguna. **Los tres pasos de despliegue deben hacerse vía Pull Request**, o el gate no existe.

---

## 7. `railway/fix-deploy-138469` — qué es y qué aporta

**Es una rama muerta. No contiene nada que no esté ya en `master`.**

```
$ git log --oneline origin/master..5dc9aba
5dc9aba fix: add BACKEND_PRIVATE_URL to envsubst list in docker-entrypoint.sh

$ git diff origin/master 5dc9aba -- frontend/docker-entrypoint.sh
(vacío — contenido idéntico)

$ git rev-list --count 5dc9aba..origin/master
9
```

Autoría: `railway-app[bot]`, 2026-06-12. Su único commit añade `BACKEND_PRIVATE_URL` a la lista de `envsubst` de `frontend/docker-entrypoint.sh`. **Ese cambio ya está en producción** como `6d203cd` (mismo título, mergeado vía PR #1, mismo bot como co-autor). El diff `origin/master 5dc9aba` es un *revert* de los 9 commits posteriores de `master` — no aporta, resta.

**Veredicto: borrable.** Igual que `origin/main` (0 por delante, 15 por detrás, y su único efecto vivo es que el `ci.yml` de producción apunta a ella y por eso nunca se ejecuta).

---

## 8. Resumen ejecutivo

1. Producción (`605ffc0`) **nunca ha pasado por CI**: 0 check-runs, porque el pipeline apunta a `main`, una rama muerta.
2. **El bug de pagos está VIVO HOY.** `webhooks.py` no ha cambiado entre producción y `master` local (`git log origin/master..master --` vacío).
3. El mecanismo: `_grant_subscription`/`_grant_topup` **descartan el resultado** de `update_one`. Perfil ausente → 0 documentos actualizados, en silencio.
4. Es **irrecuperable**, no solo silencioso: el claim ya está escrito y el evento se marca `done`, así que ni un replay del webhook otorga los créditos. El cliente pagó y no hay vuelta atrás automática.
5. Producción también tiene **la base de conocimiento de agentes rota** (llamadas sin `Authorization` → 401) y **`/chat/settings` crasheando** (violación de las Rules of Hooks).
6. `feat/grant-huerfano` arregla los pagos (+20 tests), trae el harness de CI y **está verde de verdad** en GitHub Actions (`57bddec` → `test-backend` ✔ `test-frontend` ✔).
7. `redesign/visual-identity-v3` trae 145 commits: identidad visual completa, tema claro funcional y **47 features reales** (replay, export offline, coste antes de escribir, portal de Stripe vivo, recuperar contraseña, paleta de comandos…).
8. Su auditoría dictamina **APTO CON RESERVAS**: 827 tests verdes, axe limpio, 91 celdas responsive sin scroll — pero **8.4 (rendimiento en móvil físico) y 8.6 (E2E de Board V2 con cobro/refund) nunca se han ejecutado**.
9. Hallazgo no previsto: **el CI de `redesign` está en ROJO** (`test-backend` failure) porque le faltan las credenciales Stripe falsas que vive en `backend-ci-verde`.
10. **Merges simulados: 0 conflictos en los tres casos.** Dos son fast-forward. El tercero solapa en **1 solo fichero** (`.github/workflows/ci.yml`), auto-mergeado en regiones distintas. Verificado con `merge-tree` y con worktree desechable ya eliminado.
11. **Orden: `grant-huerfano` primero** (es dinero, es fast-forward, y **pone verde el CI de `redesign`**), **`redesign` después**. Al revés, el rediseño entra con el backend en rojo.
12. **0 migraciones y 0 variables nuevas.** Pero hay que auditar los pagos ya huérfanos (`audit_orphan_grants.py`), `RAILWAY.md` omite 11 variables que el código usa (incluidas todas las de Stripe y `FRONTEND_URL`), y **hay que desplegar vía PR** o no hay gate ninguno.
