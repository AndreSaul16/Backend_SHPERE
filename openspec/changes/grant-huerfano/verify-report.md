# Verify Report: grant-huerfano

**Rama**: `feat/grant-huerfano` (5 commits sobre `feat/backend-ci-verde`)
**Modo**: verificación adversaria — ejecución real, no análisis estático
**Fecha**: 2026-08-09

---

## 0. Ejecución de referencia

Suite completa, intérprete `vci/bin/python`, Mongo real (`sphere_test`):

| Corrida | Resultado |
|---|---|
| 1 (orden natural) | `324 passed in 7.71s` |
| 2 (orden natural) | `324 passed in 7.67s` |
| 3 (orden natural) | `324 passed in 7.40s` |
| 4 (**324 node-ids en orden inverso**) | `324 passed in 7.73s` |

Estable. Ni contaminación entre corridas ni dependencia de orden.
Diff de producción: `backend/app/presentation/api/v1/webhooks.py` (+89/−22), único fichero bajo
`backend/app/**`. Tareas: 26/26 `[x]`, 0 pendientes.

**Discrepancia de conteo**: la spec tiene **10** `#### Scenario:`, no 11. El 11º solo aparece si se
desdobla el escenario único de PW-003 ("`payment` o `subscription`"), que efectivamente tiene 2
tests. Se reporta como 10 escenarios + 1 desdoble.

---

## 1. Matriz escenario por escenario

Leyenda: **CUMPLE** = comportamiento probado por ejecución. La columna *Cobertura entregada* juzga
si la **suite que se despliega** lo prueba, que no siempre coincide.

| # | Req | Escenario | Evidencia ejecutada | Veredicto | Cobertura entregada |
|---|---|---|---|---|---|
| 1 | PW-001 | Top-up con perfil ausente | `test_orphan_topup_no_grant_no_claim` PASS; muere con mutación 3.1 | **CUMPLE** | Completa (vía espía, ver §3) |
| 2 | PW-001 | Suscripción con perfil ausente (simetría) | `test_orphan_subscription_no_grant_no_claim` PASS; muere con mutación 3.1 | **CUMPLE** | Completa |
| 3 | PW-001 | Mutación: la guarda debe ser observable | Mutación re-hecha por mí: `... is None and False` → **2 failed** (`assert 1 == 0` en `claim_spy.call_count`) | **CUMPLE** | N/A (paso manual) |
| 4 | PW-002 | Replay top-up tras crear el perfil | `test_orphan_topup_replay_grants_after_profile_created` PASS; muere con mutaciones 3.2 y 3.3 | **CUMPLE** | Completa |
| 5 | PW-002 | Replay suscripción tras crear el perfil | `test_orphan_subscription_replay_grants_after_profile_created` PASS | **CUMPLE** | Completa |
| 6 | PW-003 | Borrado de cuenta entre la guarda y el grant (`payment`) | `test_topup_profile_deleted_after_claim_compensates` PASS; muere con mutación 3.4 | **CUMPLE** | Completa |
| 6b | PW-003 | Ídem (`subscription`) | `test_subscription_profile_deleted_after_claim_compensates` PASS | **CUMPLE** | Completa |
| 7 | PW-004 | Top-up con perfil existente | Sonda G (ejecutada): body `{"status":"success"}`, balance = 50 = `topup_messages_map["deep_dive"]`, 1 claim, 0 `failed_payments` | **CUMPLE** | **PARCIAL** — ningún test entregado afirma el triple (balance + 1 claim + `"success"`) a la vez |
| 8 | PW-004 | Suscripción con perfil existente | Sonda F (ejecutada): `{"status":"success"}`, `plan_id="free"`, `pro_messages_balance=30`, `stripe_subscription_id` fijado, 1 claim, **0** `failed_payments`, evento `done` | **CUMPLE** | **PARCIAL** — el único test que lo toca (`..._replay_grants...`) llega al camino feliz *tras* un huérfano, así que no puede afirmar "no se escribe en `failed_payments`" |
| 9 | PW-005 | Reenvío de un evento ya procesado | Sonda F: r2 = `{"status":"already processed"}` con balance intacto | **CUMPLE** | **PARCIAL** — `test_stripe_webhook_idempotency_and_success` usa un evento **sin `metadata`**, que cae en la rama *malformed*: nunca otorgó nada, así que "el balance no cambia" es cierto por vacío |
| 10 | PW-005 | Reintento de un evento cortado a mitad | `test_topup_grant_idempotent_on_retry` PASS (bal1 == bal2 == 50) | **CUMPLE** | Completa |

**Resumen: 11/11 CUMPLE por comportamiento verificado. 3 con cobertura parcial en la suite entregada
(#7, #8, #9)** — el comportamiento es correcto hoy, pero la suite no lo defenderá si alguien lo rompe.

---

## 2. Las cuatro mutaciones, re-ejecutadas

| Mut. | Qué se rompió | Resultado obtenido | ¿Mata? |
|---|---|---|---|
| 3.1 | `elif (user_doc := ...) is None **and False**:` (la guarda pasa siempre, `user_doc` sigue ligado) | `test_orphan_topup_no_grant_no_claim` **FAILED** `assert 1 == 0`; `test_orphan_subscription_no_grant_no_claim` **FAILED** `assert 1 == 0` | **Sí, ambos** |
| 3.2 | Crear el perfil antes del 1er POST en PW-002 topup | **FAILED** en la precondición `assert users.find_one(...) is None` | Sí |
| 3.3 | `event["id"]` distinto en el replay | **FAILED** `assert 0 == 1` en `count_documents({"stripe_event_id": E})` | Sí |
| 3.4 | `side_effect` de PW-003 sin el `delete_one` | **FAILED** `assert 1 == 0` | Sí |

Las cuatro mutaciones se revirtieron con `git checkout --`; el documento residual que dejó 3.3
(`evt_pw002_topup_MUT`) se borró de Mongo a mano y se comprobó residual `[]`.

**Dato crítico de la 3.1**: bajo la mutación, `orphan_env.tx.count_documents({"stripe_event_id": E}) == 0`
**sigue en verde**. Confirmado con la traza: `ERROR | webhooks:263 | Grant sobre perfil inexistente —
claim revertido`. Es decir, la compensación de PW-003 reproduce exactamente el estado final de la
guarda. Lo único que separa los dos mundos es el espía.

---

## 3. Juicio sobre los espías (`_claim_grant`, `wraps=...`)

**El remedio funciona y no es un parche perezoso**, pero está mal colocado.

Lo que el espía revela es una verdad incómoda del propio diseño: **dado que PW-003 existe, la guarda
de PW-001 no es un requisito de corrección sino una optimización**. Verificado, no razonado: con la
guarda desactivada, PW-002 (replay) sigue verde — la compensación deja el evento igual de
reprocesable. La guarda ahorra un `insert`+`delete` en `credit_transactions` y, en `subscription`,
una llamada saliente a `stripe.Subscription.retrieve`. Nada más. PW-001 está redactado como una
afirmación sobre **estado intermedio** ("MUST NOT insertar el registro de claim"), y el estado
intermedio no deja huella. Ningún test puede observarlo sin mirar *cómo* se hace el trabajo.

**Coste de acoplamiento (real)**: `patch("app.presentation.api.v1.webhooks._claim_grant")` se rompe
si el helper se renombra, se hace inline, se mueve a una capa de aplicación o se llama por otra ruta
de import. En un repo con `app/presentation/...` que hoy habla con pymongo directamente desde el
endpoint, extraer esto a un caso de uso es un refactor legítimo y probable. Ese día los dos PW-001 se
ponen rojos con el producto correcto.

**Hay forma de observar el mismo hecho sin espiar internos** — lo escribí y lo ejecuté: un
grabador en el **boundary de pymongo** (API pública de terceros, no helper privado nuestro). Verde
sobre el código actual y **rojo bajo la mutación 3.1** con
`AssertionError: assert ['insert_one', 'delete_one'] == []`:

```python
class _WriteRecorder:
    """Registra toda escritura que LLEGA a Mongo, por colección."""
    def __init__(self):
        self.writes = []
        self._real = {n: getattr(Collection, n) for n in
                      ("insert_one", "update_one", "delete_one", "find_one_and_update")}

    def __enter__(self):
        rec = self
        def make(name, real):
            def wrapper(self, *a, **kw):
                rec.writes.append((self.name, name))
                return real(self, *a, **kw)
            return wrapper
        self._patches = [patch.object(Collection, n, make(n, r)) for n, r in self._real.items()]
        for p in self._patches: p.start()
        return self

    def __exit__(self, *e):
        for p in self._patches: p.stop()
        return False

    def on(self, collection):
        return [op for col, op in self.writes if col == collection]

# en el test:
with patch("stripe.Webhook.construct_event", return_value=event), _WriteRecorder() as rec:
    r = await async_client.post("/api/v1/webhooks/stripe", json=event,
                                headers={"stripe-signature": "v"})
assert rec.on("credit_transactions") == []   # ni un intento de escritura llegó a la colección
```

Sigue siendo un espía — pero sobre el contrato *público* de pymongo y sobre el hecho que a negocio le
importa ("no se tocó `credit_transactions`"), no sobre la existencia de una función privada nuestra.
Sobrevive a renombrar, inline o mover `_claim_grant`. **Recomendación: sustituir el
`claim_spy.call_count == 0` de los dos PW-001 por esto.** No bloquea el despliegue.

Nota a favor del implementador: el `retrieve_spy.call_count == 0` del test de suscripción **sí** es
una aserción de boundary legítima (una llamada a la API de Stripe es un efecto externo observable) y
debe quedarse tal cual.

---

## 4. Huecos de comportamiento que la spec no cubre (todos ejecutados, no razonados)

### 4.1 Reentrega automática del mismo evento huérfano → `failed_payments` duplicado — **WARNING**

Sonda B: 3 entregas del mismo evento huérfano.

```
failed_payments rows = 3 | tx claims = 0 | event status = processing | users = 0
```

- **¿Se otorga dos veces?** No. Cero claims, cero mutaciones de wallet.
- **¿Se queda colgado?** El evento queda en `processing` para siempre (ya asumido en Risks del diseño).
- **Lo no previsto**: `_dead_letter` **no es idempotente**. Una fila por entrega. La rama *malformed*
  preexistente no podía hacer esto porque marca `done` y sale por idempotencia; la ruta nueva es la
  primera que puede escribir sin límite en `failed_payments`.
- El mismo efecto en el camino de compensación (sonda C): 2 entregas → **2 filas**.
- Impacto real: `failed_payments` es el único sitio donde vive el motivo, y es el buzón que un humano
  leerá para compensar. N filas por un pago invitan a compensar N veces. **Con dinero de por medio,
  un `update_one(..., upsert=True)` sobre `event_id`, o un índice único, cuesta una línea.**
- Nota: como respondemos 200, Stripe no reintenta por sí solo; esto se dispara con reentregas por
  timeout de red y con replays manuales — justamente el mecanismo que PW-002 convierte en el
  procedimiento oficial de recuperación. O sea, no es un caso exótico: es el flujo previsto.

### 4.2 Pérdida silenciosa de dinero si el grant LANZA en vez de devolver `matched_count == 0` — **CRÍTICO (preexistente, no regresión)**

El diseño declara fuera de alcance "un crash entre el claim y el `update_one`". Ejecuté la sonda H y
**no hace falta ningún crash**: basta un `WriteError` normal de Mongo (wallet con
`topup_messages_balance` de tipo string → `$inc` falla):

```
r1 status = 500        → tras r1: tx = 1 | event = processing | failed = 0
(se repara el wallet, Stripe reintrega)
r2 = 200 {'status': 'success'}
balance final = 0  (esperado 50) | tx = 1 | event = done | failed = 0
```

El claim quedó escrito, la excepción saltó por encima del bloque de compensación (está *dentro* del
`try`, y el `except` de :352 hace `raise HTTPException(500)`), y al reintento `_claim_grant` devuelve
`False` → `applied` conserva su valor inicial `True` → **no se compensa** → el evento se marca `done`.
Pago cobrado, 0 créditos, **0 filas en `failed_payments`** y el script de auditoría **tampoco lo ve**
(el `user_id` sí existe en `users`). Es el peor modo de fallo posible: invisible por los tres canales.

Es preexistente y está declarado fuera de alcance, así que **no bloquea**. Pero dos matices honestos:
1. El diseño lo describe como "crash de proceso"; es un error de escritura corriente. La
   probabilidad real es mayor de lo que sugiere el documento.
2. `applied = True` es un **default fail-open**. Envolver el grant en
   `try/except: applied = False` (o inicializar a `False`) convertiría este agujero en una
   compensación normal, sin transacciones multi-documento ni servicios nuevos. Es una línea, dentro
   del único fichero tocable. Es la mejora de mayor retorno que queda en la mesa.

### 4.3 Carrera de doble entrega concurrente — **HIPÓTESIS, no reproducida**

Marcado explícitamente como hipótesis: no lo he podido ejecutar. Con dos entregas *simultáneas* del
mismo evento (uvicorn multi-worker o varios pods), la segunda ve `processing`, reentra, pierde el
`_claim_grant` por índice único → `claimed_tx = None`, `applied = True` → **cae al final y marca el
evento `done`** mientras la primera todavía está compensando. Resultado: evento `done`, claim borrado,
0 créditos → PW-002 roto (el replay respondería `already processed`). No es reproducible en la suite
porque el endpoint es `async def` pero llama a pymongo síncrono sin `await` intermedio: dentro de un
worker no hay interleaving posible. Misma clase que 4.2 y del mismo modo fuera del alcance declarado.

---

## 5. La compensación, interrogada (punto 4 del encargo)

| Pregunta | Respuesta verificada |
|---|---|
| ¿Y si el documento ya no está? | `delete_one` por `_id` es no-op silencioso (`deleted_count = 0`); no lanza. Sonda C reentregó el camino de compensación sin error. |
| ¿Dos eventos en vuelo? | **Sonda D**: `E1` aplica bien, `E2` corre la carrera y compensa. Resultado `claims E1 = 1, E2 = 0`. La compensación **solo** se lleva su propio claim. El borrado por `_id` (en vez de por `stripe_event_id`) está justificado y funciona. |
| ¿`matched_count == 0` por otra razón que "perfil ausente"? | **No, y es estructural**: la guarda hace `find_one({"firebase_uid": user_id})` y los dos `_grant_*` hacen `update_one({"firebase_uid": user_id}, ...)` — **filtro idéntico**, sin `upsert`. Con el perfil presente el match es siempre 1, incluso si el `$set` no cambia nada (por eso `matched_count` y no `modified_count`: correcto). Cualquier otro fallo (`$inc` sobre string, `$set` sobre path inválido) **lanza**, no devuelve 0 → cae en 4.2, no en la compensación. |
| ¿SKU comprable sin mensajes (`return True` sin perfil)? | **Sonda E**: `PURCHASABLE_SKUS = {boardroom, deep_dive, director, executive, quick_meeting}`, todos presentes en `topup_messages_map`. Intersección vacía → hoy inalcanzable. Pero la salvaguarda depende de que dos mapas en **módulos distintos** (`app/core/plan_limits.py` y `settings`) sigan sincronizados; añadir un SKU a uno solo reabre exactamente el bug que este cambio arregla (claim de delta 0, `done`, sin `failed_payments`). SUGGESTION. |

---

## 6. `backend/scripts/audit_orphan_grants.py`

**Read-only: SÍ, verificado por dos vías.**
- Estructural: `grep -E "insert|update|delete|replace|drop|create_index|\$out|\$merge|bulk_write|find_one_and"` → **ninguna coincidencia**. Solo `aggregate` (`$match/$lookup/$sort/$limit/$project`, sin `$out` ni `$merge`) y `count_documents`.
- Empírica: inserté un claim huérfano, ejecuté el script contra `sphere_test`, conteos antes/después
  `tx=16 → 16`, `users=7 → 7`. El script localizó el huérfano correctamente.

**"No puede correr contra producción por accidente": FALSO.** Sin `MONGODB_URL`/`DB_NAME` sale con
código 2 y no conecta (bien), pero antes hace
`load_dotenv(Path(__file__).resolve().parents[2] / ".env")` — que es **exactamente el mismo fichero**
que carga la app (`config.py:5` usa `parents[3]` desde `app/core/`, misma raíz; verificado, hoy no
existe ese `.env` en este árbol). En una máquina con el `.env` de producción, `python
backend/scripts/audit_orphan_grants.py` apunta a producción **en silencio**: sin confirmación, sin
mirar `ENVIRONMENT`, y el nombre de la base se imprime *después* de haber consultado. El daño está
acotado a lectura, pero `--json` vuelca `user_id` y `stripe_event_id` a stdout. Mitigación de una
línea: imprimir el host+base y exigir `--yes` (o rechazar si `ENVIRONMENT == "production"` sin flag).

Además: por diseño **no puede detectar el huérfano de 4.2** (perfil existente, claim escrito, cero
créditos). El script responde "claims sin perfil", que es un subconjunto de "claims sin créditos".

---

## 7. Coherencia con el diseño

| Decisión | ¿Seguida? | Nota |
|---|---|---|
| D1 `return` temprano, evento en `processing` | Sí | Verificado en sondas B y C |
| D2 guarda walrus en la cadena `elif` + eliminación del `if user_doc and` | Sí | `webhooks.py:189` y `:235` |
| D3 una sola guarda cubre ambos `mode` | Sí | Sonda: `retrieve` no se llama en el huérfano |
| D4 `matched_count` (no `modified_count`) + `delete_one` por `_id` | Sí | Justificación correcta y probada (sonda D) |
| D5 "las aserciones son de estado en Mongo, no del cuerpo HTTP", sin espías | **Desviación** | La implementación añadió `patch(..._claim_grant, wraps=...)` (commit `b7c9411`). Desviación necesaria y documentada, pero es una desviación del diseño escrito: la spec PW-001 no es verificable solo por estado. Ver §3 |
| Línea base 318 → 324 | Sí | 318 + 6 |

**Sobre "`processing` sobrecargado" (la decisión más discutible): aguanta, con una condición.**
La ambigüedad crashó/diferido es soportable porque el motivo vive en `failed_payments.reason` y
porque `processing` ya significaba "reintentable" antes del cambio: no se ha inventado semántica, se
ha reutilizado la existente. Lo que *no* aguanta es el par (a) `failed_payments` sin ningún consumidor
en `app/` y (b) `_dead_letter` no idempotente (§4.1): el único canal de recuperación es un buzón que
nadie lee y que ahora puede contener N copias del mismo pago. La decisión de diseño es defendible; el
proceso operativo que la sostiene, no. Eso es organizativo, no de código, y ya está declarado en los
Risks del proposal.

---

## 8. Issues

**CRÍTICO (bloquea archive)**: ninguno.

**WARNING (arreglar, no bloquea)**
1. §4.1 — `_dead_letter` no idempotente: N entregas → N filas en `failed_payments`, el buzón que
   soporta usará para compensar dinero. Un `update_one({"event_id": ...}, {"$setOnInsert": ...}, upsert=True)` lo cierra.
2. §4.2 — `applied = True` es fail-open: si el grant lanza (no solo si crashea el proceso), el
   reintento marca `done` sin créditos, sin `failed_payments` y sin rastro para el auditor. Preexistente
   y fuera de alcance declarado, pero reproducido con un `WriteError` corriente, no con un crash.
3. §3 — los dos PW-001 dependen de `patch(..._claim_grant)`. Se rompen ante un refactor legítimo.
   Sustituible por el grabador de boundary, ya probado (verde limpio / rojo bajo mutación).
4. §6 — el script se apunta al `.env` de la app sin confirmación ni comprobación de `ENVIRONMENT`.
5. Cobertura parcial de #7, #8 y #9: falta un test de camino feliz de suscripción *limpio*
   (`success` + 1 claim + **0** `failed_payments`) y `test_stripe_webhook_idempotency_and_success`
   prueba "already processed" sobre un evento que nunca otorgó nada (le falta `metadata`).

**SUGGESTION**
6. §5 — `PURCHASABLE_SKUS` y `topup_messages_map` viven en módulos distintos y hoy coinciden por
   convención. Un SKU en uno solo reabre este mismo bug. Un test de consistencia entre ambos mapas.
7. La spec dice 11 escenarios pero tiene 10 cabeceras `#### Scenario:`; desdoblar PW-003 en sus dos
   modos, que es como está implementado.

---

## 9. Veredicto

**APTO CON RESERVAS.**

1. Ningún escenario de la spec falla: 11/11 CUMPLE por ejecución (10 cabeceras + el desdoble de PW-003).
2. Las 4 mutaciones matan, incluida la 3.1, que hoy tumba los **dos** PW-001.
3. Los espías son correctos y necesarios: sin ellos la mutación 3.1 sobrevive, porque la compensación
   de PW-003 reproduce el estado final exacto de la guarda (verificado, no deducido).
4. Pero están mal colocados: acoplan a `_claim_grant`, un helper privado. Se romperán al extraer el
   webhook a una capa de aplicación. El grabador de boundary de §3 observa lo mismo, ya probado.
5. La compensación es sólida: borra solo su claim, es no-op si el documento no está, y
   `matched_count == 0` implica "perfil ausente" de forma estructural (filtro idéntico al de la guarda).
6. El script es read-only de verdad; lo que no es cierto es que no pueda apuntar a producción sola.
7. Dos huecos reales fuera de la spec: `failed_payments` duplicado por reentrega (§4.1) y pérdida
   silenciosa si el grant lanza (§4.2, preexistente, fail-open por `applied = True`).
8. **¿Lo desplegaría hoy? Sí.** Cierra una pérdida de dinero real, no introduce ninguna regresión
   (324 verdes, 4 corridas, orden inverso incluido) y su rollback es un `git revert` de un fichero.
9. Con dos condiciones antes del merge, ambas de una línea y dentro del fichero ya tocado: hacer
   `_dead_letter` idempotente y poner el grant en `try/except → applied = False`.
10. Si no caben en este PR, deben salir como issue abierto **antes** del despliegue, no después:
    el §4.2 es exactamente el bug que este cambio dice arreglar, entrando por otra puerta.
11. Los espías se pueden cambiar después; no son un riesgo de producción, solo de mantenimiento.
12. Árbol limpio, sin commits, sin builds. Sin cambios en `backend/` respecto a `HEAD`.
