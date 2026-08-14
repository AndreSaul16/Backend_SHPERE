# Tasks: pulido-lanzamiento

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~570 (C1 245 · C2 15 · C3 215 · C4 85 · C5 10) |
| Riesgo presupuesto 400 | High |
| PRs encadenadas | No aplica — el dueño trabaja en **rama única, sin PRs** |
| Reparto sugerido | 5 commits acotados en `feat/lanzamiento-e2e`, revertibles uno a uno |
| Delivery strategy | ask-on-risk (por defecto; no se recibió otra) |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: single-branch-commits (regla vigente del dueño: rama única, commits acotados, sin PRs)
400-line budget risk: High

### Work Units

| # | Entregable | Commit | Revertible solo |
|---|---|---|---|
| 1 | Lint con significado y backend a cero | C1 | Sí |
| 2 | Un código para «falta contexto de usuario» | C2 | Sí |
| 3 | «Reintentar» sólo donde puede funcionar | C3 | Sí |
| 4 | Sin ramas muertas en el test de conexión | C4 | Sí |
| 5 | El job de lint bloquea | C5 | Sí (el más barato) |

C1 supera por sí solo el presupuesto de 400 líneas. **No se trocea**: 150 de esas líneas son
arreglos de una línea repartidos por ~30 ficheros y partirlos por fichero produce commits sin
entregable. El troceo con sentido sería «config» / «arreglos» / «flip», y ya está hecho: es C1 / C5.
Si el dueño quiere el corte estricto, hace falta `size:exception` explícito.

## Convenciones de esta lista

- `strict_tdd`: toda tarea GREEN va precedida de su RED, **con la salida literal esperada**. Si el
  RED no imprime eso, el test no observa lo que dice observar y se reescribe antes de seguir.
- Mutación = 4 pasos: aplicar la edición → correr la suite → ver **esa** salida → `git checkout -- <fichero>`
  → `git status` limpio (sin restos). Ninguna mutación se commitea.
- Backend, desde `backend/`:
  `MONGODB_URL=mongodb://localhost:27017 DB_NAME=sphere_test REDIS_URL=redis://localhost:6379/0 ENVIRONMENT=development OPENAI_API_KEY=sk-test-ci DEEPSEEK_API_KEY=sk-test-ci STRIPE_SECRET_KEY=sk_test_ci STRIPE_WEBHOOK_SECRET=whsec_ci ./.venv/bin/python -m pytest tests/ -q`
- Frontend, desde `frontend/`: `./node_modules/.bin/vitest run`
- Tipos, desde `frontend/`: `./node_modules/.bin/tsc -b --noEmit`. **Sin `-b` es un no-op** (tsconfig
  solution-style). No es un build.
- `npm` está interceptado por pnpm: usar siempre `./node_modules/.bin/*`.
- Ruff **no está en `backend/.venv`** y no va a estarlo: se instala de `backend/requirements-dev.txt`
  (tarea 1.4). Hasta entonces, `pipx run ruff==0.16.3` o un venv aparte **fuera del repo**.
- `git status` siempre acotado (`git status --porcelain <ruta>`): el árbol tiene changes sin trackear.
- **Nunca ejecutar builds.** Commits convencionales, **sin atribución de IA**.
- Baselines: **se miden en 0.1**. No hay cifras en esta lista a propósito: cuatro changes se aplican
  antes que éste y las suites van a haber crecido.

---

## Fase 0 — Medir el punto de partida

- [x] 0.1 Suite backend y suite frontend, con los comandos de Convenciones. Anotar los dos números
      aquí mismo antes de tocar nada: **backend `600` passed · frontend `967` passed / `113` ficheros**.
      Son el suelo del que no se baja.
- [x] 0.2 `git log --oneline` para confirmar que `artefactos-guardarrailes`, `junta-honesta` e
      `infra-n8n` ya están aplicados. **Si falta alguno, PARAR**: este change va el último por diseño
      (§Colisiones del design), y C1 pasa por encima de todo `backend/app`.

---

## Fase 1 — C1 `fix(lint): ruff.toml y el backend a cero hallazgos`

Verifica: 0 hallazgos con el set curado · B008 descartado y no «arreglado» · los 6 `except/pass`
registran · re-exports vivos · el catálogo de herramientas intacto.

### Medición y configuración

- [x] 1.1 **Re-medir**, no copiar: `ruff check backend/app --isolated --statistics`. Anotar el total
      y el reparto por regla. La medición de esta propuesta (619 total) es de **antes** de los tres
      changes previos; que salga otro número es lo esperado, no un error.
      **Medido**: 622 con el conjunto por defecto de 0.16.3 (antes 619) · **84** con la selección
      candidata (antes 82) · B008 63 · B904 33 · UP 312 · I001 75 · BLE001 95. Los 2 nuevos de la
      selección: `board_v2.py:463` S110 (junta-honesta) y `n8n_deployer.py:56` E741 (infra-n8n).
- [x] 1.2 Crear `ruff.toml` en la raíz con el bloque de D1: `select` **enumerado por regla**
      (`E4,E7,E9`, `F`, `S110`, `DTZ`, `RUF010/012/013/100`, `PIE790`, `TRY201`, `SIM103/117`,
      `UP037`) y el comentario con las ausencias y su motivo (`B008` 63, `B904` 31, `UP` 310,
      `I001` 75, `BLE001` 95). **Los recuentos del comentario son los de 1.1**, no los de la propuesta.
- [x] 1.3 `ruff check backend/app --statistics` con el fichero nuevo. Esperado: del orden de **82**
      hallazgos, todos reales. Si aparece una regla que no está en el `select`, el fichero no se está
      leyendo: comprobar que está en la raíz y no dentro de `backend/`.
- [x] 1.4 Crear `backend/requirements-dev.txt` con `ruff==0.16.3` (pin exacto, estilo de
      `requirements.txt`). **No** añadirlo a `requirements.txt`: la imagen de producción no lleva linter.

### RED — lo único conductual de esta fase

- [x] 1.5 Crear `backend/tests/test_circuit_breaker_logs.py`. Test BLG-005a: forzar que falle la
      persistencia del estado del circuito (doble de Redis que lanza en `hset`) y asertar con
      `caplog` un registro de nivel `WARNING`.
      RED: `E   AssertionError: el fallo de persistencia del circuito no se registró: caplog.records == []`
- [x] 1.6 Test BLG-005b: circuito en `OPEN` y lectura de `updated_at` que lanza; asertar `WARNING` y
      que `can_execute()` **sigue devolviendo `False`** (el flujo no cambia).
      RED: `E   AssertionError: el circuito no pudo evaluar la recuperación y no lo registró: caplog.records == []`

### GREEN — arreglos por regla, nunca por número de línea

- [x] 1.7 **S110 ×6, añadiendo log y sin tocar el flujo.** `warning` en `circuit_breaker.py`
      (`_set_state` y la rama `OPEN` de `can_execute`) y en `document_processor.py` (marcar
      `processing_status: "failed"`). `debug` en `rate_limit.py` (`_forget`) y en los **dos** de
      `rag.py` (caché de embeddings, best-effort declarado). Patrón de la casa:
      `except Exception as exc: logger.debug(f"No se pudo …: {exc}")`
- [x] 1.8 **DTZ005 ×4 → `datetime.now(timezone.utc)`** en `domain/models/oauth_app.py` y
      `domain/models/service_credential.py`. Verificado inerte: esas clases no se instancian en ningún
      sitio. Comprobarlo otra vez antes de tocar:
      `grep -rn "OAuthApp\b\|ServiceCredential\b" backend/ | grep -v domain/models` debe seguir sin
      devolver instanciaciones. Si ahora las hay, **PARAR** y releer D5: naive vs aware lanza `TypeError`.
- [x] 1.9 **DTZ005 ×1 → `noqa` razonado** en `core/logger.py`: es el reloj del operador en consola, no
      se persiste ni se compara. Comentario obligatorio en la misma línea.
- [x] 1.10 **F401 ×14 en `domain/models/__init__.py` → `__all__`.** No borrar. Comprobar después que
      `from app.domain.models import <uno de los 14>` sigue importando.
- [x] 1.11 **F401 restantes (~20) → borrar**, uno a uno, comprobando que no son re-exports ni imports
      por efecto secundario.
- [x] 1.12 **RUF100 en `registry.py`: la trampa.** **NO usar `--fix` en este fichero.** Con F401
      seleccionado, sobran **5** de los 6 `# noqa: F401` de `load_all_tools()` y **uno no** (el de
      `oauth_tools`). Quitar sólo los que ruff marque con F401 ya seleccionado, nunca los que marque
      en un run sin F401.
- [x] 1.13 Inmediatamente después de 1.12, correr `test_tool_catalog.py`. Es la única guarda que caza
      un import de registro borrado por error.
- [x] 1.14 **E402 ×3**: `noqa` con motivo en `orchestrator.py` y `board_classifier.py` (importan
      **después** de `load_dotenv()` a propósito). En `sessions.py` es descuido: subir
      `from enum import Enum` al bloque de imports.
- [x] 1.15 **Mecánicos**: F541 ×4, F841 ×2, PIE790 ×3, RUF010 ×2, RUF012 ×3, TRY201 ×2, SIM103 ×2,
      SIM117 ×1, UP037 ×1, E741 ×2. `ruff check backend/app --fix` resuelve la parte segura; el resto
      a mano. **Revisar el diff de `--fix` antes de aceptarlo**, sobre todo en `orchestrator.py` y
      `board_v2.py`, que otros changes acaban de editar.
- [x] 1.16 **RUF013 ×7**: `x: str = None` → `x: str | None = None`. Los fixes son *unsafe* y ruff no
      los aplica solo. Dos están en `n8n_client.py`, que `infra-n8n` acaba de editar: leer el estado
      real antes.
- [x] 1.17 `ruff check backend/app` → **`All checks passed!`**. Si queda algo, arreglarlo aquí; no se
      añaden reglas al `ignore` para llegar al cero.
- [x] 1.18 Suite backend completa ≥ baseline de 0.1, más los 2 nuevos.

### Mutaciones (aplicar · rojo · revertir · `git status` limpio)

- [x] 1.19 MUT BLG-002 — `ruff check backend/app --select B008` → `Found 63 errors.` (el número de
      1.1). Confirma que se descartó la regla y **no** se editó el código para complacerla. No hay
      nada que revertir: es sólo un comando.
- [x] 1.20 MUT BLG-005a — devolver `except Exception: pass` en `_set_state` →
      `E   AssertionError: el fallo de persistencia del circuito no se registró: caplog.records == []`
- [x] 1.21 MUT BLG-005b — devolver `except Exception: pass` en la rama `OPEN` de `can_execute` →
      `E   AssertionError: el circuito no pudo evaluar la recuperación y no lo registró: caplog.records == []`
- [x] 1.22 MUT BLG-006 — borrar de `load_all_tools()` el import de `oauth_tools` →
      `E   AssertionError: assert 16 == 23` en `test_tcat_001_el_catalogo_tiene_veintitres_herramientas`
      (23 − 7 OAuth). Es el desenlace exacto de la trampa de 1.12.
- [x] 1.23 MUT BLG-006b — borrar un re-export de `domain/models/__init__.py` en vez de declararlo en
      `__all__` → `E   ImportError: cannot import name '<X>' from 'app.domain.models'` en el consumidor.
      Si nadie lo importa, el `__all__` sigue siendo lo correcto: documenta el contrato del paquete.
- [x] 1.24 Commit C1 (`ruff.toml`, `requirements-dev.txt` y los arreglos). **Sin** tocar el workflow.
      **Nota de orden**: C1 se commitea ANTES de las mutaciones 1.20-1.23, no después. Con el
      trabajo sin commitear, el `git checkout -- <fichero>` del protocolo de mutación revierte
      TODO el fichero, no sólo la mutación (comprobado: se perdieron los arreglos de
      `circuit_breaker.py` y hubo que rehacerlos). Ninguna mutación se commitea igualmente.

---

## Fase 2 — C2 `refactor(tools): un solo código para la falta de contexto de usuario`

**Va antes que C3 por necesidad, no por gusto**: C3 escribe la lista de códigos no reintentables. Con
los dos deletreos vivos, esa lista nace duplicada y la duplicación sobrevive al change que la creó.

### RED

- [x] 2.1 En `backend/tests/test_oauth_tools.py`, cambiar la aserción del literal a
      `user_context_missing`. RED: `E   AssertionError: assert 'missing_user_context' == 'user_context_missing'`
- [x] 2.2 Añadir el caso equivalente para `shared_tools.py` (hoy no existe): una de las 2 de WhatsApp
      sin contexto de usuario. RED: la misma comparación de literales.

### GREEN

- [x] 2.3 `shared_tools.py::_missing_user_error` y `oauth_tools.py::_missing_user_error`: el valor de
      `"error"` pasa a `user_context_missing`. **Sólo el literal**: ni el nombre de la función, ni el
      `hint`, ni la forma del JSON.
- [x] 2.4 En el test de 2.1, dejar escrito **por qué** cambia: es un renombrado de contrato interno
      alineado con ATI-004, no un cambio de conducta.
- [x] 2.5 Verificar el alcance real del diff: `grep -rn "missing_user_context" backend/ frontend/` →
      **0 resultados**. Y confirmar que `frontend/src` no contenía ninguno de los dos literales (hoy no
      los contiene: el frontend no distingue códigos).

### Mutaciones

- [x] 2.6 MUT TER-001 — dejar `missing_user_context` en `oauth_tools.py` →
      `E   AssertionError: assert 'missing_user_context' == 'user_context_missing'`
- [x] 2.7 Suite backend. Commit C2.

---

## Fase 3 — C3 `fix(chat): sin «Reintentar» donde reintentar no puede funcionar`

Cinco saltos y hay que tocar los cinco o el remedio se pierde por el camino. El estado
`confirmation_required` y su tarjeta **no se tocan**.

### RED backend

- [x] 3.1 En `backend/tests/test_stream_tool_events.py`, desempaquetar 3 valores de
      `_classify_tool_output`. RED: `E   ValueError: not enough values to unpack (expected 3, got 2)`
- [x] 3.2 Casos TER-002/TER-003: `{"error": true, "message": M}` → `retry` ·
      `{"error": "linkedin_not_configured", "hint": H}` → `connect` ·
      `{"error": "github_not_connected"}` → `connect` · `{"error": "contact_not_authorized"}` → `none` ·
      `{"error": "user_context_missing"}` → `none` · `{"error": "algo_que_nadie_ha_visto"}` → `retry`
      (el defecto) · `{"error": "notion_api_error"}` → `retry`.

### GREEN backend

- [x] 3.3 `stream.py::_classify_tool_output`: devolver
      `tuple[ToolOutcome, str, Literal["retry","connect","none"]]`. La regla es **por sufijo más dos
      literales** (`_not_configured` / `_not_connected` → `connect`; `contact_not_authorized` y
      `user_context_missing` → `none`; **todo lo demás** → `retry`). Lista de **no** reintentables,
      nunca al revés: el campo `error` no siempre es un código.
- [x] 3.4 `stream.py`: añadir `'remedy': remedio` al `json.dumps` del evento `tool_error`. La rama
      `confirmation` y la de `on_tool_error` (excepción cruda → `retry`) no cambian de forma.

### RED + GREEN frontend — un fichero por tarea

- [x] 3.5 RED `frontend/tests/utils/parseMessageParts.test.ts` con
      `[TOOL_ERROR:whatsapp_send_message:connect:Falta la credencial]`.
      RED: `AssertionError: expected undefined to be 'connect' // Object.is equality`
      (hoy el segundo grupo es permisivo y se traga `connect:Falta la credencial` como mensaje)
- [x] 3.6 `frontend/src/utils/parseMessageParts.ts`: `TOOL_ERROR` pasa a
      `\[TOOL_ERROR:([^:]+):([^:]+):([^\]]*)\]` y `ParteDelTurno` gana `remedio`. **El remedio va en
      medio**: el mensaje puede llevar `:` y sólo el último grupo puede ser el permisivo. Renumerar los
      grupos posteriores (`TOOL_CONFIRM` se desplaza) — es el error fácil de esta tarea.
- [x] 3.7 RED en el mismo fichero: un mensaje **con dos puntos**
      (`[TOOL_ERROR:x:connect:Error HTTP 500: sin respuesta]`) debe devolver remedio `connect` y el
      mensaje entero. Es el test que justifica la posición del campo.
- [x] 3.8 RED `frontend/tests/store/caracterizacionStream.test.ts`: `onToolError` con
      `{tool_name, error, remedy: 'connect'}`.
      RED: `AssertionError: expected '…[TOOL_ERROR:whatsapp_send_message:Falta la credencial]…' to contain '[TOOL_ERROR:whatsapp_send_message:connect:'`
- [x] 3.9 `frontend/src/store/chat/streamHandlers.ts`: escribir
      `\n[TOOL_ERROR:${data.tool_name}:${data.remedy ?? 'retry'}:${safeError}]\n`. El saneado del
      mensaje **no cambia** (`replace(/[\]\n\r]/g, ' ')`). El `?? 'retry'` no es defensivo por gusto:
      hace que la arity la garantice el escritor y no la red.
- [x] 3.10 `frontend/src/services/api.ts`: `remedy?: 'retry' | 'connect' | 'none'` en el tipo de
      `onToolError` y en la rama `data.type === 'tool_error'`.
      RED previo: `AssertionError: expected "spy" to be called with arguments: [ ObjectContaining {"remedy": "connect"} ]`
- [x] 3.11 RED `frontend/tests/components/ToolExecutionCard.test.tsx` (el fichero ya existe), TER-004:
      fallo con `remedio='connect'`; no debe haber botón «Reintentar» y sí un enlace a Conexiones.
      RED: `AssertionError: expected <button …>Reintentar</button> to be null`
- [x] 3.12 RED en el mismo fichero: fallo con `remedio='none'` → ni botón ni enlace.
      RED: `AssertionError: expected <button …>Reintentar</button> to be null`
- [x] 3.13 RED en el mismo fichero: fallo con `remedio='retry'` → el botón sigue exactamente como hoy,
      incluido su `disabled` durante el streaming. Este test **debe pasar en verde desde el principio**:
      es la red que impide que C3 rompa el caso bueno. Si se pone rojo en 3.14, se ha roto algo.
- [x] 3.14 `frontend/src/components/chat/ToolExecutionCard.tsx`: `remedio` en los props; el bloque
      `isFailed` renderiza «Reintentar» sólo si `remedio === 'retry'`, un `<Link to="/settings/integrations">`
      si es `'connect'`, y nada si es `'none'`. La tarjeta sigue viéndose como fallo (✗, «— falló») en
      los tres casos: la acción no ocurrió.
- [x] 3.15 Comprobar `citaLlana`: su `MARCADORES` es `\[(?:…|TOOL_ERROR|…):[^\]]*\]`, indiferente a la
      arity, así que **no debería** hacer falta tocarlo. Añadir el caso de 3 campos a
      `frontend/tests/utils/citaLlana.test.ts` para comprobarlo en vez de suponerlo: este es el sitio
      exacto por el que un marcador se cuela crudo en las citas del Palco.
- [x] 3.16 `./node_modules/.bin/tsc -b --noEmit` desde `frontend/`: recorrer los errores que produce
      el campo nuevo. **Cada consumidor no actualizado es un error de compilación, y eso es la red.**

### Mutaciones

- [x] 3.17 MUT TER-003 — invertir la regla a una lista de **reintentables** y clasificar
      `{"error": "algo_que_nadie_ha_visto"}` → `E   AssertionError: assert 'none' == 'retry'`. Un
      código nuevo pierde el botón sin que nadie lo decida.
- [x] 3.18 MUT TER-004 — que la tarjeta vuelva a renderizar «Reintentar» para todo `failed` →
      `AssertionError: expected <button …>Reintentar</button> to be null` en 3.11 **y** en 3.12.
      Una sola de las dos no cubre los dos casos: `connect` y `none` fallan por motivos distintos.
- [x] 3.19 MUT TER-005 — poner el remedio **al final** del marcador
      (`[TOOL_ERROR:nombre:mensaje:remedio]`) → el test de 3.7 rompe:
      `AssertionError: expected 'Error HTTP 500' to be 'Error HTTP 500: sin respuesta' // Object.is equality`
- [x] 3.20 MUT TER-002 — calcular el remedio en el frontend a partir del texto del mensaje. La suite
      **pasa**, y eso es el fallo: TRI-001 lo prohíbe y el mensaje es copy. **MUST** rechazarse en
      verify. Revertir.
- [x] 3.21 Suites completas (backend y frontend) + `tsc -b --noEmit`. Commit C3.

---

## Fase 4 — C4 `fix(auth): borrar las ramas muertas del test de conexión`

Son **dos**, no una: `jules` (muerta desde `6fcdd3d`) y `google_calendar` (desde `6efbf1a`). Las mata
la misma guarda: `if service not in SERVICE_DEFINITIONS: raise HTTPException(400)`.

### RED

- [x] 4.1 Crear `backend/tests/test_auth_service_catalog.py`, SCT-001: leer el código de
      `test_service_credential` con `inspect.getsource`, extraer los literales con
      `service == ["']([a-z_]+)["']` y asertar **igualdad** con `set(SERVICE_DEFINITIONS)`.
      RED: `E   AssertionError: ramas sin entrada en SERVICE_DEFINITIONS: ['google_calendar', 'jules']`
- [x] 4.2 Autocomprobación del extractor (SCT-002): si se extraen 0 literales, el test **falla**.
      Nunca `pytest.skip`. Aserción explícita: `assert servicios, "0 servicios extraídos de test_service_credential"`

### GREEN

- [x] 4.3 `auth.py::test_service_credential`: borrar la rama `elif service == "jules"` entera.
- [x] 4.4 Borrar la rama `if service == "google_calendar"` entera y convertir el siguiente `elif` en
      `if`. Google Calendar se conecta por OAuth (`integrations/google`); un futuro test de conexión
      suyo va en el endpoint de integraciones, no aquí (D7).
- [x] 4.5 Comprobar SCT-003 (borrar código inalcanzable no cambia nada): la suite existente de auth
      pasa sin ningún cambio. Si algún test cambia de resultado, la rama **no** era inalcanzable:
      revertir y releer D7.

### Mutaciones

- [x] 4.6 MUT SCT-001 — reintroducir `elif service == "jules"` →
      `E   AssertionError: ramas sin entrada en SERVICE_DEFINITIONS: ['jules']`
- [x] 4.7 MUT SCT-001b (**la otra dirección, tarea aparte**) — añadir una clave a
      `SERVICE_DEFINITIONS` sin su rama →
      `E   AssertionError: servicios en SERVICE_DEFINITIONS sin rama de test: ['<clave>']`.
      Una sola mutación no cubre las dos: la igualdad tiene dos sentidos y hoy sólo falla uno.
- [x] 4.8 MUT SCT-002 «el test que no puede fallar» — sustituir `inspect.getsource` por una lista de
      servicios escrita en el propio test y añadir una rama muerta al endpoint. La suite **pasa**
      (`N passed`), y eso es el fallo: **MUST** rechazarse en verify. Revertir ambos cambios.
- [x] 4.9 Suite backend. Commit C4.

---

## Fase 5 — C5 `ci(lint): Ruff con versión fijada y bloqueante`

Va el último a propósito: cierra la puerta sobre el árbol que se fusiona, no sobre uno intermedio.
C2–C4 han añadido código y ese código también tiene que pasar la puerta.

- [x] 5.1 **Re-medir sobre el árbol final**: `ruff check backend/app` → `All checks passed!`. Si C2,
      C3 o C4 introdujeron un hallazgo, se arregla **aquí**, no se ignora.
- [x] 5.2 `.github/workflows/ci.yml`, job `lint`: quitar `continue-on-error: true`, quitar «(no
      bloqueante)» del nombre del paso, sustituir `pipx run ruff check backend/app` por
      `pip install -r backend/requirements-dev.txt` + `ruff check backend/app`. Un solo literal de
      versión en todo el repo, y está en `requirements-dev.txt`.
- [x] 5.3 Actualizar `openspec/config.yaml`: `testing.backend.linter` dice «no bloqueante en CI» y
      deja de ser verdad.
- [x] 5.4 MUT BLG-003 — introducir a propósito una violación de una regla seleccionada (por ejemplo un
      `import os` sin usar en un fichero cualquiera) y correr `ruff check backend/app` →
      `Found 1 error.` con código de salida 1. Revertir y comprobar `git status` limpio.
- [x] 5.5 Commit C5.

---

## Fase 6 — Verificación final

- [x] 6.1 Backend desde `backend/`, con el entorno completo del bloque de Convenciones: **0 failed**.
- [x] 6.2 Frontend desde `frontend/`: `./node_modules/.bin/vitest run` → **0 failed**.
- [x] 6.3 `./node_modules/.bin/tsc -b --noEmit` desde `frontend/` → sin errores.
- [x] 6.4 **Repetir 6.1 y 6.2 una segunda vez seguida.** Criterio de cierre: 0 failed en las dos
      corridas de cada suite (descarta flakes de orden y de estado compartido en Mongo).
- [x] 6.5 `ruff check backend/app` **dos veces** → `All checks passed!` las dos (BLG-003).
- [x] 6.6 Ninguna suite por debajo de las cifras de 0.1.
- [x] 6.7 `git status --porcelain` acotado a las rutas tocadas: ninguna de las 12 mutaciones sobrevive.
- [x] 6.8 `git log --oneline` muestra C1→C5 en orden, conventional commits, **sin atribución de IA**.
- [ ] 6.9 **NO EJECUTADA** (requiere navegador y arrancar la app; la regla del dueño prohíbe
      builds y este agente no tiene navegador). Queda para el dueño antes del merge.
      Comprobación manual, fuera de la suite: abrir el chat sin credenciales conectadas, provocar
      un fallo `*_not_configured` y confirmar que la tarjeta **no** ofrece «Reintentar» y que el
      enlace lleva a Ajustes → Conexiones. Es el gesto que este change existe para arreglar y ninguna
      suite lo mira con ojos de usuario.

---

## Notas para quien aplique esto

- **Este change va el último.** Si al empezar `git log` no muestra `junta-honesta` e `infra-n8n`,
  parar (tarea 0.2). C1 toca cualquier fichero de `backend/app` con hallazgos y perdería el trabajo
  ajeno en el rebase.
- **Los números de la propuesta caducan.** 619, 82, 63, 310, 75, 95 son de antes de los tres changes
  previos. La tarea 1.1 los sustituye. Un número distinto no es un fallo del plan.
- **Lo que este change NO toca**, y por tanto no genera conflicto: `orchestrator.py::DEFAULT_CORE_PROMPTS`
  (`junta-honesta`), `webhooks.py` / `integrations.py` salvo un `SIM103` / `n8n_client.py` salvo 2
  anotaciones (`infra-n8n`), `ActaActions.tsx`, `dynamic_tool_node`, y la tarjeta de
  `confirmation_required`.
- **Guardas heredadas que hay que respetar**: `test_tool_catalog.py` (TCAT-001 recuento 23, TCAT-003
  paridad con `toolLabels.ts`, TCAT-004 prompts ⊆ registry). La tarea 1.12 puede romperlas de la
  manera más silenciosa que existe; 1.13 está ahí para eso.


---

## Registro de la ejecución (apply)

### Cifras finales

| Medida | Baseline (0.1) | Final | Corridas |
|---|---|---|---|
| Backend | 600 passed | **623 passed** | 2/2 sin fallos |
| Frontend | 967 passed / 113 ficheros | **981 passed / 114 ficheros** | 2/2 sin fallos |
| `ruff check backend/app` | 84 hallazgos | **All checks passed!** | 2/2 |
| `tsc -b --noEmit` | — | limpio (8.9 s, sin `.tsbuildinfo`) | 1 |

### Commits

| # | Hash | Asunto |
|---|---|---|
| C1 | `3f9b053` | `fix(lint): ruff.toml y el backend a cero hallazgos` |
| C2 | `743fda7` | `refactor(tools): un solo código para la falta de contexto de usuario` |
| C3 | `46e91c1` | `fix(chat): sin «Reintentar» donde reintentar no puede funcionar` |
| C4 | `b1d9c55` | `fix(auth): borrar las ramas muertas del test de conexión` |
| C5 | `8842178` | `ci(lint): Ruff con versión fijada y bloqueante` |

### Desviaciones del design, con su porqué

1. **D6 · Los dos `noqa: E402` de `orchestrator.py` y `board_classifier.py` NO se escribieron.**
   El design los justificaba diciendo que importan después de `load_dotenv()` «porque los
   módulos importados leen el entorno al importarse». Medido: `app/core/llm_models.py` es un
   módulo de constantes con **cero imports** y **cero lecturas de entorno**. La premisa era
   falsa, así que el `noqa` habría sido una razón falsa por escrito — justo lo que este change
   existe para quitar. Los tres E402 se resuelven subiendo el import. Suite verde.
2. **D3 · El tercer elemento de `_classify_tool_output` admite `""`.** El design escribía
   `Literal["retry","connect","none"]`, pero eso obliga a devolver un remedio también en éxito
   y en confirmación, donde no aplica: decir `retry` de algo que no falló es una afirmación
   falsa. Se devuelve `NO_REMEDY = ""` fuera del estado «fallo». El evento `tool_error`, que es
   lo que TER-002 constriñe, sigue llevando exactamente uno de los tres.
3. **Dos tests que el design no listaba.** `test_domain_models_exports.py` (BLG-006: los 14
   re-exports no los importa nadie hoy, así que sin él la mutación 1.23 pasaba en verde) y
   `test_shared_tools_user_context.py` (TER-001: `shared_tools.py` no tenía ningún test de su
   literal y el renombrado podía quedarse a medias en silencio).
4. **Orden: los commits van ANTES de sus mutaciones.** El protocolo de mutación usa
   `git checkout -- <fichero>`, que sobre trabajo sin commitear revierte el fichero ENTERO.
   Comprobado a la mala en 1.20: se perdieron los arreglos de `circuit_breaker.py` y hubo que
   rehacerlos. Ninguna mutación se commiteó.
5. **TER-001 vs tarea 2.4.** «Dejar escrito por qué cambia» y «el deletreo antiguo MUST NOT
   existir en `backend/`» se contradicen si el porqué escribe el literal. Se resuelve
   describiéndolo («el deletreo invertido») sin escribirlo. `grep` → 0.

### Guarda heredada que el plan no vio

`tests/test_ci_infra.py::test_ci_yml_has_lint_job_non_blocking` (CI-003) assertaba
`continue-on-error is True` — o sea el invariante CONTRARIO al de C5. Salió en rojo en 6.1.
Se reescribe a `test_ci_yml_has_lint_job_blocking` + `test_ci_yml_lint_no_escribe_la_version_de_ruff`
(BLG-003 y BLG-004 como guarda ejecutable) y se enmienda dentro de C5. Mutación nueva
(la 14ª) confirma que muerde.

### Predicciones falsas de esta lista

| Tarea | Predicho | Observado | Resolución |
|---|---|---|---|
| 1.1/1.3 | 619 total · 82 seleccionados | **622** total · **84** seleccionados | Lo esperado: dos hallazgos nuevos de los changes previos |
| 1.7 | S110 ×6 | **×7** | `board_v2.py:463` (junta-honesta). Arreglado igual, nivel `debug` |
| 1.15 | E741 ×2 · F841 ×2 | **×3** · ×2 | `n8n_deployer.py:56` (infra-n8n) |
| 1.19 | B904 31 · UP 310 | **33** · **312** | Sólo afecta al comentario del `ruff.toml`, que lleva los números reales |
| 3.10 | `expected "spy" to be called with…` | `expected "vi.fn()" to be called with…` | Cosmético: así renderiza vitest el nombre del espía |
| 3.19 | `expected 'Error HTTP 500' to be 'Error HTTP 500: sin respuesta'` | `expected 'texto' to be 'utensilio'` | Más fuerte de lo predicho: con el remedio al final el marcador **no casa** y se cuela crudo como texto |
| 5.4 | `Found 1 error.` | 6 errores al primer intento | La inserción cayó antes del docstring y encadenó E402. Repetida con inserción limpia → `Found 1 error.`, exit 1 |

### Fuera de alcance encontrado

- `bash scripts/check-monorepo-invariants.sh` → `root=PASS` (la puerta exigida) pero
  `scoping=FAIL`: `ci.yml` no tiene filtro de `paths`. **Preexistente** — el bloque `on:` está
  intacto desde antes de C1 (`92027d4`) y este change no lo toca.
- `database.py::_client_kwargs` es un dict de CLASE que `__init__` **muta** (`self._client_kwargs.update`):
  el estado TLS se comparte entre instancias. Se anota `ClassVar` (que es lo honesto sobre lo que
  el código hace hoy) y se deja el comportamiento intacto: cambiarlo es otro change.
