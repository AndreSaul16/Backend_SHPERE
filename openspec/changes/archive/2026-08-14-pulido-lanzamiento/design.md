# Design: pulido-lanzamiento

> Base: `proposal.md` + las 3 delta specs. Verificado en `feat/lanzamiento-e2e` con
> `ruff 0.16.3` instalado fuera del repo (el venv del proyecto no lo tiene). Lo no verificado va
> marcado **[hipótesis]**. No se ejecutó ningún build.

## Technical Approach

Cinco commits (C1→C5). El hilo conductor es **quitar afirmaciones falsas**: un job de CI que dice
«revisado» sin revisar nada (C1/C5), un botón que dice «Reintentar» ante algo que no se puede
reintentar (C3), un `elif` que dice que Jules se prueba (C4) y dos códigos que dicen que hay dos
conceptos donde hay uno (C2).

Restricción rectora: **este change se aplica el último de cinco**. C1 pasa por encima de todo
`backend/app`, así que cualquier fichero que toquen `junta-honesta` o `infra-n8n` es superficie de
conflicto. La consecuencia de diseño no es «tener cuidado»: es que **el reparto de los 82 hallazgos
se vuelve a medir en la tarea 1.1** y las tareas se escriben por *regla*, nunca por número de línea.

---

## Architecture Decisions

### D1 — El `ruff.toml` selecciona **reglas**, no familias, y explica sus ausencias

**Choice**: `ruff.toml` en la raíz (no `pyproject.toml`: no hay empaquetado que justificarlo, y un
fichero de una sola responsabilidad no invita a meterle dependencias). `select` enumera reglas
concretas. Medido en el árbol de hoy: **82 hallazgos**, todos reales.

```toml
target-version = "py311"
line-length = 120

[lint]
# Se seleccionan REGLAS, no familias: "S" o "SIM" enteras traen hallazgos que
# nadie ha medido, y el objetivo es un cero honesto, no un cero grande.
select = [
  "E4", "E7", "E9",        # imports fuera de sitio, nombres ambiguos, sintaxis
  "F",                     # imports y variables muertos, f-strings sin placeholder
  "S110",                  # except/pass silencioso
  "DTZ",                   # datetime sin tz
  "RUF010", "RUF012", "RUF013", "RUF100",
  "PIE790", "TRY201", "SIM103", "SIM117", "UP037",
]
# Ausencias deliberadas. Cada una con su motivo, aquí y no en un acta que nadie abre:
#   B008  (63) - `Depends()` es el idioma OBLIGATORIO de FastAPI. Falso positivo puro.
#                Por eso no se selecciona "B" entera; el resto son 31 B904.
#   B904  (31) - `raise ... from`: mejora la traza, no el resultado. 31 handlers.
#   UP    (310)- Optional[X] -> X | None: codemod de todo el backend, cero efecto en ejecución.
#   I001  (75) - lo arregla UN `ruff check --fix`, pero toca 75 ficheros. Primero tras el merge.
#   BLE001(95) - cada `except Exception` exige decidir a qué se estrecha. Change propio.
```

**Por qué el motivo vive en el fichero y no aquí**: un `ruff.toml` sin comentarios se lee como una
lista arbitraria, y el siguiente que la mire añadirá o quitará reglas sin saber qué se decidió. El
comentario es la parte del diseño que sobrevive al archivado de este change.

| Alternativa descartada | Por qué |
|---|---|
| `select = ["ALL"]` + `ignore` largo | Cada versión de ruff añade reglas: el conjunto crece solo y el job se pone rojo por algo que nadie eligió. Es la forma versionada del mismo ruido de hoy |
| Seleccionar familias (`S`, `SIM`, `RUF`) | Trae hallazgos no medidos. Un cero que no se ha medido no es un cero |
| `pyproject.toml` | Invita a mover ahí dependencias y build. Hoy no hay ninguno y no se echa de menos |

### D2 — Una sola versión de ruff en todo el repo, y el job deja de mentir

Hoy: `pipx run ruff check backend/app`, **sin pin**. Eso no es un detalle de higiene, está medido:

| Versión | Mismo comando, mismo árbol | Hallazgos |
|---|---|---|
| ruff 0.8.6 | `ruff check backend/app --isolated` | **45** |
| ruff 0.16.3 | `ruff check backend/app --isolated` | **619** |

El conjunto de reglas por defecto de ruff **cambió** (0.16.3 activa 413 reglas por defecto; la
documentación clásica dice `E4,E7,E9,F`, que aquí da 45). Sin pin, lo que el job comprueba depende
del día. Con `continue-on-error` daba igual; bloqueando, sería inaceptable.

**Choice**: `backend/requirements-dev.txt` con `ruff==0.16.3` (estilo de pin de
`requirements.txt`), y el job instala **de ese fichero**:

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r backend/requirements-dev.txt
      - name: Ruff (backend)
        run: ruff check backend/app
```

Se va `continue-on-error: true` y se va «(no bloqueante)» del nombre del paso.

| Alternativa descartada | Por qué |
|---|---|
| `pipx run ruff==0.16.3` | Funciona, pero deja el literal de versión en el workflow **y** otro en el fichero del desarrollador: dos sitios que se desincronizan en silencio |
| Ruff en `requirements.txt` | La imagen de producción no debe cargar un linter |
| Sólo pipx, sin fichero de dev | El desarrollador no puede reproducir el CI. Hoy es literalmente así: `backend/.venv` **no tiene ruff**, por eso 619 hallazgos vivieron meses sin que nadie los viera |

**Por qué pasa a bloquear**: un job no bloqueante con 619 hallazgos no es una red, es un adorno —
está demostrado, lleva meses así. Bloqueando a 0, el primer hallazgo nuevo para el merge y se
arregla cuando cuesta un minuto. El riesgo está acotado: el set no tiene falsos positivos (B008
fuera por construcción) ni churn de estilo, y revertir es devolver dos líneas.

### D3 — El fallo viaja con su **remedio**; el código no sale del backend

`_classify_tool_output` (`stream.py`) ya es el único punto de decisión —invariante TRI-001 de
`tools-seguridad`— y ya tiene el código del error en la mano (`error = parsed.get("error")`), sólo
que lo tira: se queda con `message`/`hint` y devuelve `(estado, texto)`. Pasa a devolver
`(estado, texto, remedio)`.

```
tool devuelve JSON                                              (backend)
   │ {"error":"linkedin_not_configured","hint":H}
   ▼
stream.py  _classify_tool_output(raw) → ("error", H, "connect")
   │ SSE: {"type":"tool_error","tool_name":N,"error":H,"remedy":"connect"}
   ▼
api.ts     onToolError?.({tool_name, error, remedy})
   ▼
streamHandlers.ts  anadirALaActiva(`\n[TOOL_ERROR:${N}:${remedy}:${safeH}]\n`)
   ▼
parseMessageParts.ts  → { tipo:'utensilio', estado:'failed', error:H, remedio:'connect' }
   ▼
ToolExecutionCard.tsx  ✗ roja · mensaje · enlace «Conectar en Ajustes» · SIN «Reintentar»
```

**El vocabulario es cerrado y de tres valores** porque la UI tiene tres afordancias:

| `remedy` | Cuándo | Qué ofrece la tarjeta |
|---|---|---|
| `retry` | **por defecto**: cualquier cosa no probada imposible | «Reintentar» (conducta de hoy, intacta) |
| `connect` | código termina en `_not_configured` o `_not_connected` | Enlace a `/settings/integrations` |
| `none` | `contact_not_authorized`, `user_context_missing` | Nada más que el mensaje |

La regla es **por sufijo más dos literales**, no una lista de 30 códigos, porque la taxonomía real
lo permite. Inventario completo medido en `backend/app/infrastructure/tools/`:

| Código emitido | Remedio | Por qué |
|---|---|---|
| `True` (n8n, red) ×5 | `retry` | Transitorio. Es la conducta de hoy y no se toca |
| `{provider}_api_error` | `retry` | 5xx o rate limit del remoto: reintentar puede funcionar |
| `{service}_not_configured`, `whatsapp_not_configured` | `connect` | Falta credencial. Reintentar no puede funcionar **jamás** |
| `{provider}_not_connected` | `connect` | Falta OAuth. Ídem. **No estaba en el encargo**: son las 7 de GitHub/Slack/Notion |
| `contact_not_authorized` | `none` | Hay que editar la whitelist. Su `hint` ya dice «Settings → Contacts» |
| `user_context_missing` | `none` | Sesión rota. Reintentar es pedirle al agente que repita un imposible |
| `"Debes proporcionar task_id o assigned_to"` | `retry` | **El campo `error` no siempre es un código**: aquí es una frase. Cae al defecto, y el defecto es el correcto |

Esa última fila es la razón de que el defecto sea `retry` y la lista sea de **no** reintentables: al
revés, cualquier código nuevo perdería el botón en silencio.

**`contact_not_authorized` se queda en `none`, no en un cuarto remedio hacia Contactos.** El `hint`
que ya se pinta dice exactamente dónde ir; añadir un segundo destino de enlace duplica el
vocabulario para ahorrar un clic. Es la decisión que más fácil sería revisar si el dueño discrepa:
cuesta un valor de enum y un `<Link>`.

| Alternativa descartada | Por qué |
|---|---|
| (a) llevar el **código crudo** al marcador y decidir en el frontend | El frontend tendría que mantener a mano la lista de códigos de error del backend. Es exactamente la clase de lista que `test_tool_catalog.py` existe para prohibir. Un código nuevo en Python cae en un `default` de TS que nadie recuerda |
| (b') un booleano `retryable` | No distingue «enlaza a Conexiones» de «no ofrezcas nada», que es justo la decisión de UX que hay que tomar |
| (c) heurística sobre el mensaje | Prohibida por TRI-001 («sin heurísticas sobre el texto»). Además el mensaje es *copy* en castellano: cambiar una frase cambiaría la conducta |

**Detalles que no son opcionales:**

- **Arity del marcador.** Nuevo: `[TOOL_ERROR:name:remedy:msg]`, regex
  `\[TOOL_ERROR:([^:]+):([^:]+):([^\]]*)\]`. El remedio va **en medio** y no al final: el mensaje
  puede contener `:` (el saneado sólo quita `]`, `\n` y `\r`), así que sólo el último grupo puede
  ser el permisivo. Se conserva la asimetría deliberada del fichero.
- **No hay problema de compatibilidad con el historial.** Verificado: los marcadores los escribe
  `streamHandlers.ts` en la burbuja **en vivo**; el historial sale del checkpointer de LangGraph
  (`_load_session_messages`) y contiene los mensajes del modelo, sin marcadores. El frontend nunca
  devuelve el contenido compuesto al backend. Cambiar la arity no rompe ninguna conversación vieja.
- **La arity la garantiza el escritor, no la red.** `streamHandlers` escribe siempre 3 campos, con
  `data.remedy ?? 'retry'`. Si el evento SSE llegara sin `remedy`, el marcador sigue siendo
  parseable y la tarjeta se comporta como hoy.
- **`citaLlana.ts` no se toca**: su `MARCADORES` es `\[(?:…|TOOL_ERROR|…):[^\]]*\]`, indiferente a
  la arity. Hay una tarea que lo **comprueba** en vez de suponerlo, porque este es exactamente el
  sitio por el que un marcador se cuela crudo en las citas del Palco.
- **`ParteDelTurno` y `ToolExecutionCardProps` ganan `remedio`.** TypeScript estricto convierte
  cada consumidor no actualizado en error de compilación: esa es la red.

### D4 — Los 6 S110 no son el mismo bug, y no cambian el flujo

**Regla común**: se **añade** la línea de log que falta; el `try/except` sigue tragando y el flujo
no cambia. Un cambio de flujo aquí sería otro change.

| Sitio | Nivel | Qué se pierde hoy en silencio |
|---|---|---|
| `circuit_breaker.py` → `_set_state` | `warning` | El estado del circuito no se persiste. El breaker degrada a «siempre cerrado» y **nadie lo sabe** |
| `circuit_breaker.py` → `can_execute`, rama `OPEN` | `warning` | No se puede leer `updated_at`: el circuito **nunca pasa a HALF_OPEN**, o sea nunca se recupera |
| `document_processor.py` → marcar `processing_status: "failed"` | `warning` | El documento se queda «procesando» para siempre en la UI del usuario |
| `rate_limit.py` → `leaker.deregister(bucket)` | `debug` | Fuga de buckets. Molesto, no visible |
| `rag.py` → lectura de caché de embeddings | `debug` | Best-effort legítimo: un miss no es un evento |
| `rag.py` → escritura de caché de embeddings | `debug` | Ídem |

Patrón de la casa, ya usado en `stream.py` y `auth.py`:
`except Exception as exc: logger.debug(f"No se pudo …: {exc}")`. Los dos del circuit breaker son
los únicos **conductuales** y por eso son los únicos con test (`caplog`).

### D5 — DTZ005: 4 son inertes y 1 no debe cambiarse

La pregunta del encargo era si pasar a `datetime.now(timezone.utc)` es seguro comparando con cómo
se comparan esas fechas en Mongo. Medido, la respuesta es que **la comparación no existe**:

- `OAuthApp` y `ServiceCredential` (los 4 `default_factory` de `created_at`/`updated_at`) **no se
  instancian en ningún sitio**. `grep -rn "OAuthApp\|ServiceCredential" backend/` fuera de sus dos
  ficheros sólo devuelve `OAuthAppCreate` (otra clase, sin fechas) y las clases locales que
  `auth.py` se define aparte. El `default_factory` nunca se dispara.
- El cliente de Mongo **no** es `tz_aware` (`_client_kwargs` en `database.py` sólo lleva timeouts y
  TLS), así que lo que se lee vuelve naive. Con el modelo muerto, no hay nada que comparar.

**Decisión**: los 4 pasan a `datetime.now(timezone.utc)`. Es inerte hoy y es el defecto correcto
para el día en que alguien empiece a usar esos modelos —que es cuando el bug (guardar hora local
como si fuera UTC) se volvería real y difícil de ver.

**`core/logger.py` no se toca**: es el `timestamp` de una línea de consola. Hora local es lo
correcto para quien lee logs, no se compara con nada y no se persiste. Lleva
`# noqa: DTZ005  # hora local a propósito: es el reloj del operador, no un instante almacenado`.
Silenciar con motivo escrito es honesto; cambiarlo sería romper una conducta buena para complacer
a una regla.

### D6 — F401: 14 son re-exports, 6 `noqa` son una trampa

Los 34 F401 no son «imports muertos». Reparto medido:

- **14 en `backend/app/domain/models/__init__.py`**: re-exports intencionales. Se arreglan con
  `__all__`, **no borrando**. Borrarlos rompería cualquier `from app.domain.models import X`.
- **~20 repartidos** (`sessions.py` ×4, `user.py` ×2, y once ficheros con 1): muertos de verdad.

**La trampa, verificada**: `registry.py` → `load_all_tools()` importa los seis módulos de
herramientas **por su efecto secundario** (registrarse), cada uno con `# noqa: F401`. Ruff marca
los seis con RUF100 («unused noqa»), y RUF100 es auto-fixable `[*]`. Pero con F401 seleccionado,
**cinco** de esos `noqa` sobran y **uno no** (el de `oauth_tools`). Encadenado:

1. Alguien corre `ruff check --fix` y RUF100 borra los seis `# noqa`.
2. F401 se pone rojo en el import que sí lo necesitaba.
3. El arreglo «obvio» es borrar el import → `oauth_tools` no se registra →
   **las 7 herramientas OAuth desaparecen del catálogo**.

Guarda que ya existe y lo cazaría: `test_tool_catalog.py` TCAT-001 (`len(catalogo) == 23`) y la
paridad con `toolLabels.ts`. La tarea correspondiente prohíbe `--fix` a ciegas en ese fichero y
exige correr la suite de catálogo justo después.

**E402 (3)**: dos son deliberados —`orchestrator.py` y `board_classifier.py` importan **después**
de `load_dotenv()` a propósito, porque los módulos importados leen el entorno al importarse— y
llevan `noqa` con ese motivo. El tercero (`sessions.py`, un `from enum import Enum` colocado tras
`router = APIRouter()`) es sólo descuido: se sube y ya.

### D7 — La rama muerta se borra y un test estructural cierra la puerta

`test_service_credential` empieza con `if service not in SERVICE_DEFINITIONS: raise HTTPException(400)`.
`SERVICE_DEFINITIONS` = `{linkedin, whatsapp, instagram, financial_api}`. Toda rama
`service == "X"` con `X` fuera de ese conjunto es inalcanzable. Hay **dos**: `jules` (desde
`6fcdd3d`) y `google_calendar` (desde `6efbf1a`, que lo pasó a OAuth).

**Choice**: test estructural en `backend/tests/test_auth_service_catalog.py` que lee el **código
fuente** de `test_service_credential` con `inspect.getsource`, extrae los literales comparados con
`service` mediante regex (`service == ["']([a-z_]+)["']`) y asserta que el conjunto extraído es
**igual** a `set(SERVICE_DEFINITIONS)`. Igualdad en los dos sentidos, no inclusión: así falla
también el caso inverso —añadir un servicio a `SERVICE_DEFINITIONS` y olvidar su rama— que hoy
devuelve un silencioso «Test no implementado para este servicio».

Es el mismo patrón que `test_tool_catalog.py`: leer la fuente real, nunca una lista escrita a mano,
y **fallar** (no `skip`) si la extracción devuelve 0 literales.

| Alternativa descartada | Por qué |
|---|---|
| Lista de excepciones con `google_calendar` dentro | Un test con un agujero declarado. Borrar la rama es la misma operación y más pequeña |
| Test por HTTP (llamar al endpoint con `jules` y esperar 400) | Pasa **hoy**, sin borrar nada: no observa el código muerto, observa la guarda. No impide que vuelva |
| `vulture` / cobertura | Herramienta nueva para un invariante de 8 líneas |

**Dónde vive el futuro test de conexión de Google**: no aquí. Ese endpoint sirve credenciales de
`SERVICE_DEFINITIONS`, que son api-key/token pegados a mano; Google Calendar se conecta por OAuth
(`integrations/google`) y meterlo en `SERVICE_DEFINITIONS` haría aparecer un campo de API key en
Ajustes para un servicio que no la usa. Si algún día se quiere, va en el endpoint de integraciones.

**Declarado y no arreglado**: `ServiceCredentialsSettings.tsx` tiene un bloque
`svc.service === "google_calendar"` que pinta un campo «Calendar ID». La lista que renderiza sale
de `SERVICE_DEFINITIONS`, así que ese bloque tampoco se muestra nunca. Es UI muerta simétrica a la
del backend; queda fuera de alcance para no abrir `frontend/src/pages/settings/` en este ciclo.

### D8 — Orden de commits y qué verifica cada uno

| # | Commit | Qué se verifica antes de pasar al siguiente |
|---|---|---|
| **C1** | `fix(lint): ruff.toml y el backend a cero hallazgos` | `ruff check backend/app` → `All checks passed!`. `--select B008` sigue dando 63. Suite backend ≥ baseline. Test de `caplog` en los 2 S110 del breaker |
| **C2** | `refactor(tools): un solo código para la falta de contexto de usuario` | `grep -rn "missing_user_context" backend/` → 0. `test_oauth_tools.py` actualizado con su porqué. Frontend sin tocar (verificado: 0 apariciones del literal) |
| **C3** | `fix(chat): sin «Reintentar» donde reintentar no puede funcionar` | Los 3 remedios en `_classify_tool_output`; los 4 saltos del frontend; `tsc -b --noEmit` limpio; `citaLlana` comprobado |
| **C4** | `fix(auth): borrar las ramas muertas del test de conexión` | Test estructural rojo antes de borrar, verde después; y rojo otra vez si se re-añade cualquiera de las dos ramas |
| **C5** | `ci(lint): Ruff con versión fijada y bloqueante` | Re-medición del cero **sobre el árbol final** (C2–C4 han añadido código). Sin `continue-on-error` |

**C2 antes que C3 no es preferencia**: C3 escribe la lista de códigos no reintentables. Con los dos
deletreos vivos, esa lista nace con `{"user_context_missing", "missing_user_context"}` y la
duplicación sobrevive al change que la creó.
**C5 el último tampoco**: cierra la puerta sobre el árbol que se fusiona, no sobre uno intermedio.

---

## Colisiones — por qué este change va el último

Se aplica después de `artefactos-guardarrailes`, `junta-honesta` e `infra-n8n`. C1 toca, por
definición, cualquier fichero de `backend/app` con hallazgos. Solapes **medidos** hoy:

| Fichero | Hallazgo de C1 | Change que también lo edita | Riesgo |
|---|---|---|---|
| `application/orchestrator.py` | TRY201, F541, F841, E402, F401 | `junta-honesta` (prompts) | **Alto**: 5 hallazgos, uno de ellos (`F841 messages`) en cuerpo de función |
| `presentation/api/v1/integrations.py` | SIM103 | `infra-n8n` | Medio |
| `infrastructure/tools/n8n_client.py` | RUF013 ×2 | `infra-n8n` | Medio |
| `application/board_v2.py` | E741 (`l`) | `junta-honesta` | Bajo (renombrar una variable de bucle) |
| `presentation/api/v1/stream.py` | F541, TRY201 | **este mismo change** (C3) | Bajo: C1 va antes que C3 |
| `stream.py`, `api.ts`, `streamHandlers.ts` | — | `artefactos-guardarrailes`, **en vuelo mientras se escribe esto** | **Bajo, medido**: su diff toca esos 3 ficheros (179 inserciones) pero **cero** líneas con `tool_error`, `TOOL_ERROR`, `_classify_tool_output` u `onToolError`. Colisión de fichero, no de semántica |

Consecuencias que la fase apply debe respetar:

1. **Los 82 son de hoy, no del árbol final.** La tarea 1.1 vuelve a medir y la 1.2 vuelve a repartir.
   Si sale un número distinto, **no es un error**: es que los otros changes escribieron código.
2. Un hallazgo **nuevo** en un fichero de `junta-honesta` o `infra-n8n` se arregla aquí, no se
   devuelve. Este es el último ciclo.
3. `infra-n8n` **borra** `railway.toml` y `Dockerfile.n8n` de la raíz. El `ruff.toml` nuevo también
   vive en la raíz: no colisiona, pero se crea *después* de esos borrados.
4. **Nada de este change toca** `orchestrator.py::DEFAULT_CORE_PROMPTS`, `board_v2.py` salvo el
   renombrado de `l`, `webhooks.py`, `n8n_client.py` salvo 2 anotaciones, ni `ActaActions.tsx`.

---

## File Changes

| Fichero | Acción | Qué cambia | Commit |
|---|---|---|---|
| `ruff.toml` | Create | Set curado + motivos de las ausencias | C1 |
| `backend/requirements-dev.txt` | Create | `ruff==0.16.3`. Único literal de versión del repo | C1 |
| `backend/app/core/circuit_breaker.py` | Modify | 2 S110 → `logger.warning`; SIM103; PIE790; F841 | C1 |
| `backend/app/core/rate_limit.py` | Modify | S110 → `logger.debug`; UP037 | C1 |
| `backend/app/application/rag.py` | Modify | 2 S110 → `logger.debug`; 2 RUF013 | C1 |
| `backend/app/application/document_processor.py` | Modify | S110 → `logger.warning`; 2 RUF013 | C1 |
| `backend/app/domain/models/{oauth_app,service_credential}.py` | Modify | 4 DTZ005 → `timezone.utc` | C1 |
| `backend/app/core/logger.py` | Modify | DTZ005 → `noqa` razonado; RUF012 ×2; F401 | C1 |
| `backend/app/domain/models/__init__.py` | Modify | 14 F401 → `__all__` | C1 |
| `backend/app/infrastructure/tools/registry.py` | Modify | RUF100: quitar **5** `noqa`, conservar el de `oauth_tools` | C1 |
| `backend/app/presentation/api/v1/sessions.py` | Modify | 4 F401; E402 (subir `from enum import Enum`); SIM117 | C1 |
| `backend/app/application/orchestrator.py` | Modify | TRY201, F541, F841, F401; E402 con `noqa` razonado | C1 |
| (resto de `backend/app`) | Modify | Hallazgos sueltos según medición de 1.1 | C1 |
| `backend/tests/test_circuit_breaker_logs.py` | Create | Los 2 S110 conductuales, con `caplog` | C1 |
| `backend/app/infrastructure/tools/{shared,oauth}_tools.py` | Modify | `missing_user_context` → `user_context_missing` | C2 |
| `backend/tests/test_oauth_tools.py` | Modify | El literal, con comentario de porqué | C2 |
| `backend/app/presentation/api/v1/stream.py` | Modify | `_classify_tool_output` → 3-tupla; `remedy` en el evento | C3 |
| `backend/tests/test_stream_tool_events.py` | Modify | Casos de los 3 remedios | C3 |
| `frontend/src/services/api.ts` | Modify | `remedy` en el tipo y en la rama `tool_error` | C3 |
| `frontend/src/store/chat/streamHandlers.ts` | Modify | Marcador de 3 campos, `?? 'retry'` | C3 |
| `frontend/src/utils/parseMessageParts.ts` | Modify | Grupo nuevo en `TOOL_ERROR`; `remedio` en `ParteDelTurno` | C3 |
| `frontend/src/components/chat/ToolExecutionCard.tsx` | Modify | `retry`/`connect`/`none`; enlace a `/settings/integrations` | C3 |
| `frontend/tests/{utils/parseMessageParts,store/caracterizacionStream,components/ToolExecutionCard}` | Modify | Los 3 remedios de punta a punta | C3 |
| `backend/app/presentation/api/v1/auth.py` | Modify | −2 ramas (`jules`, `google_calendar`) | C4 |
| `backend/tests/test_auth_service_catalog.py` | Create | Ramas == `SERVICE_DEFINITIONS` | C4 |
| `.github/workflows/ci.yml` | Modify | Instala de `requirements-dev.txt`; sin `continue-on-error` | C5 |

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Lint | Que el cero es real y que B008 se descartó, no se «arregló» | `ruff check backend/app` y `--select B008` en las tareas. **El job de CI es la aserción**, no un pytest |
| Unit backend | Los 3 remedios; los 2 S110 conductuales del breaker | pytest; `caplog` para los logs; `test_stream_tool_events.py` ya existe |
| Estructural backend | Ramas de `test_service_credential` == `SERVICE_DEFINITIONS` | `inspect.getsource` + regex, patrón de `test_tool_catalog.py`. Falla, nunca `skip` |
| Unit frontend | Marcador de 3 campos, saneado, las 3 afordancias de la tarjeta | vitest desde `frontend/` |
| Tipos | Que ningún consumidor se quede sin actualizar | `./node_modules/.bin/tsc -b --noEmit` desde `frontend/` (no es un build) |
| E2E | No hay (`config.yaml: e2e: false`) | — |

**Por qué no hay un pytest que ejecute ruff**: ruff no está en `backend/.venv` y no va a estarlo
(vive en `requirements-dev.txt`). Un test que lo invoque tendría que hacer `skip` cuando falta, y un
skip es justo el «test que no puede fallar» que este repo rechaza. La aserción del cero es el job de
CI bloqueante, y su mutación es re-introducir una violación y ver el job rojo.

Los escenarios de mutación de las specs se ejecutan a mano en la fase verify (editar, correr,
revertir); ninguno se commitea.

## Migration / Rollout

Sin migración, sin cambio de esquema, sin feature flags. Los 4 `datetime.now(timezone.utc)` de C1
son inertes (D5). C3 no toca datos persistidos: los marcadores son de la sesión en vivo (verificado
en D3). Los cinco commits revierten limpio en orden inverso; C5 es el más barato y el primero a
revertir si el merge urge.

## Open Questions

- [ ] `contact_not_authorized` se queda con remedio `none` y sólo su `hint`. ¿Merece un enlace a
      Ajustes → Contactos? Cuesta un valor de enum y un `<Link>`. Decisión del dueño; no bloquea.
- [ ] `I001` (75) es un `ruff check --fix` de un comando. ¿Se enciende inmediatamente después del
      merge a master, con el árbol quieto? Recomendado, pero es otro change.
- [ ] **[hipótesis]** `ruff==0.16.3` seguirá disponible en PyPI para el runner. Si el equipo prefiere
      no fijar patch, `~=0.16.0` deja entrar reglas nuevas: eso reabre exactamente el problema de D2.
