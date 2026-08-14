# Proposal: pulido-lanzamiento — que el lint signifique algo y que la UI no ofrezca lo imposible

> Último ciclo antes de fusionar `feat/lanzamiento-e2e` a master. Se aplica **el último** de los
> cinco changes en vuelo. Cada cifra de este documento está medida por mí en el árbol de hoy;
> lo no verificado se marca **[hipótesis]**. No se ejecutó ningún build.
> Baselines de suite: **se miden en la tarea 0.1**, no se copian — el árbol se está moviendo.

## Intent

Cuatro asperezas que un espectador toca en los primeros cinco minutos, o que un desarrollador
paga cada semana:

1. El job `lint` de CI lleva `continue-on-error: true` y **619 hallazgos**. Nadie lo lee, y no
   puede leerse: 310 son de estilo y **63 son un falso positivo puro** (`Depends()`).
2. Tras `a3eadef`, toda la familia de errores en string pinta ✗ con botón **«Reintentar»**.
   Para `*_not_configured`, `*_not_connected`, `contact_not_authorized` y `user_context_missing`
   reintentar **gasta un crédito y no puede funcionar jamás**. Es lo primero que se pulsa.
3. `test_service_credential` conserva ramas para servicios que su propia guarda rechaza.
4. Un mismo concepto tiene dos códigos: `user_context_missing` (spec ATI-004) y
   `missing_user_context`. La regla de reintentabilidad de (2) tendría que nombrarlo dos veces.

(4) no es una tarea de limpieza suelta: es **prerrequisito de (2)**. Una regla que decide qué es
reintentable y tiene que listar dos deletreos del mismo concepto se pudre en el primer olvido.

## Scope

### In Scope

| # | Commit | Qué cierra | Evidencia medida |
|---|---|---|---|
| **C1** | `fix(lint): ruff.toml y el backend a cero hallazgos` | 619 → **0**, con un set curado y **sin B008** | `ruff 0.16.3 --isolated` → 619; candidata medida → **82** reales |
| **C2** | `refactor(tools): un solo código para la falta de contexto de usuario` | `missing_user_context` → `user_context_missing` | 2 emisores (`shared_tools`, `oauth_tools`) + 1 test (`test_oauth_tools.py`) |
| **C3** | `fix(chat): sin «Reintentar» donde reintentar no puede funcionar` | El fallo viaja con su **remedio**; enlace a Conexiones o nada | `_classify_tool_output` ya tiene el código en la mano y lo tira |
| **C4** | `fix(auth): borrar las ramas muertas del test de conexión` | −2 ramas inalcanzables + test estructural | La guarda `service not in SERVICE_DEFINITIONS` las mata a las dos |
| **C5** | `ci(lint): Ruff con versión fijada y bloqueante` | Fin de `continue-on-error`; una sola versión en el repo | Mismo comando: ruff 0.8.6 → **45**; ruff 0.16.3 → **619** |

### Out of Scope

- **UP (310) · BLE001 (95) · I001 (75) · B904 (31)**: no se seleccionan. Motivo escrito en el
  propio `ruff.toml`. Ver decisión C1.
- Modal de confirmación, `tool_audit_log`, deep-link por servicio en el enlace a Conexiones,
  purga de credenciales de Jules, `dynamic_tool_node`.
- El estado `confirmation_required` y su tarjeta: **no se tocan**.
- El bloque muerto `svc.service === "google_calendar"` de `ServiceCredentialsSettings.tsx`
  (UI que nunca se renderiza): se **declara**, no se arregla.

**No se toca**: esquema de Mongo, auth, créditos, grafos de LangGraph, DESIGN.md, la Junta,
`requirements.txt` de producción, ni ningún fichero de `frontend/` fuera de los 4 de C3.

## Decisión C1 — qué se silencia, y por qué el criterio es uno solo

**Criterio**: se selecciona una regla si violarla puede producir *un resultado observable
equivocado*, o si arreglarla es mecánico y de riesgo ~0. Se descarta lo que exige un codemod de
todo el backend. Este es el último ciclo y hay tres changes en vuelo: cada fichero que toco es
superficie de conflicto.

| Familia | N | Decisión | Por qué |
|---|---|---|---|
| `B008` | 63 | **Nunca** | `Depends()` es el idioma obligatorio de FastAPI. Un lint que marca el framework es ruido con autoridad |
| `B` (resto) | 32 | No ahora | 31 son B904 (`raise ... from`): mejora la traza, no el resultado. 31 handlers = 31 conflictos |
| `UP` | 310 | No ahora | `Optional[X]`→`X \| None` es un codemod de todo el backend. Cero efecto en ejecución |
| `I001` | 75 | No ahora | Se arregla con **un** `ruff check --fix`, pero toca 75 ficheros. Primer candidato tras el merge |
| `BLE001` | 95 | No ahora | Cada `except Exception` exige decidir a qué se estrecha. Es un change propio, no una tarea |
| Seleccionadas | **82** | **A cero** | `F` · `E4/E7/E9` · `S110` · `DTZ` · `RUF010/012/013/100` · `PIE790` · `TRY201` · `SIM103/117` · `UP037` |

Se seleccionan **reglas**, no familias: `S` o `SIM` enteras traen hallazgos nuevos que nadie ha
medido, y el objetivo es un cero honesto, no un cero grande.

## Decisión C3 — viaja el **remedio**, no el código ni una heurística

El transporte es un marcador de texto (`[TOOL_ERROR:tool:mensaje]`), y el código del error hoy
se pierde en `_classify_tool_output`. Las tres opciones y el veredicto:

| Opción | Veredicto |
|---|---|
| (c) heurística sobre el mensaje | **Rechazada por contrato**: TRI-001 exige distinguir estados «sin heurísticas sobre el texto». Además el mensaje es *copy* en castellano |
| (a) llevar el código crudo al marcador | Obliga al frontend a mantener una lista de códigos de error del backend. Es exactamente la lista a mano que `test_tool_catalog.py` existe para prohibir |
| **(b) el backend clasifica; viaja un remedio de vocabulario cerrado** | **Elegida.** `_classify_tool_output` ya es el único punto de decisión (TRI-001) y ya tiene el código en la mano |

El remedio tiene **tres** valores —`retry`, `connect`, `none`— porque la UI tiene tres
afordancias. Un booleano «reintentable» no distingue «enlaza a Conexiones» de «no ofrezcas nada»,
que es justo lo que hay que decidir. **Por defecto `retry`**: lo desconocido conserva la conducta
de hoy; sólo lo probadamente imposible la pierde.

## Scope revisado por hallazgo — dos ramas muertas, no una

`test_service_credential` guarda con `if service not in SERVICE_DEFINITIONS: raise 400`.
`SERVICE_DEFINITIONS` tiene 4 claves: `linkedin`, `whatsapp`, `instagram`, `financial_api`.
Son inalcanzables **dos** ramas, por la misma razón estructural:

- `elif service == "jules"` — desde `6fcdd3d` (in scope, decidido).
- `if service == "google_calendar"` — desde `6efbf1a`, que lo movió a OAuth.

El test estructural de C4 falla con las dos. Meter `google_calendar` en una lista de excepciones
sería un test con un agujero declarado; borrarlo es la misma operación, más pequeña. **Se borran
las dos** y el design registra dónde vive un futuro test de conexión de Google.

## Approach

Orden **C1 → C2 → C3 → C4 → C5**, y dos de las flechas son obligatorias:

- **C2 antes que C3**: C3 escribe la regla de no-reintentable. Con dos deletreos vivos, la regla
  nace con una duplicación que nadie recordará borrar.
- **C5 el último**: se mide el cero sobre el árbol final, no sobre uno intermedio. C2–C4 añaden
  código nuevo, y ese código también tiene que pasar la puerta antes de cerrarla.

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `ruff.toml` (raíz) | Create | Set curado; cada exclusión con su motivo en el propio fichero |
| `backend/requirements-dev.txt` | Create | **Único** literal de versión de ruff del repo |
| `.github/workflows/ci.yml` (job `lint`) | Modified | Instala del fichero de pines; sin `continue-on-error` |
| `backend/app/core/circuit_breaker.py`, `core/rate_limit.py`, `application/rag.py`, `application/document_processor.py` | Modified | 6 S110: el log que falta. **No cambia el flujo** |
| `backend/app/domain/models/{oauth_app,service_credential}.py` | Modified | 4 DTZ005 → `datetime.now(timezone.utc)` |
| `backend/app/core/logger.py` | Modified | 1 DTZ005 → `noqa` razonado (hora local es lo correcto en consola) |
| `backend/app/domain/models/__init__.py` | Modified | 14 F401 son re-exports: `__all__`, no borrado |
| `backend/app/infrastructure/tools/{shared,oauth}_tools.py` | Modified | `user_context_missing` (C2) |
| `backend/app/presentation/api/v1/stream.py` | Modified | `_classify_tool_output` devuelve también el remedio |
| `frontend/src/services/api.ts`, `store/chat/streamHandlers.ts`, `utils/parseMessageParts.ts`, `components/chat/ToolExecutionCard.tsx` | Modified | El remedio de punta a punta |
| `backend/app/presentation/api/v1/auth.py` | Modified | −2 ramas muertas |
| `backend/tests/{test_auth_service_catalog,test_stream_tool_events,test_oauth_tools}.py` | Create/Modified | Test estructural + remedio + literal renombrado |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| C1 choca con `junta-honesta` / `infra-n8n`: hay hallazgos en `orchestrator.py`, `integrations.py`, `n8n_client.py`, `board_v2.py` | **Alta** | Por eso este change va **el último**. Los 82 se **re-miden** en 1.1 sobre el árbol final; el reparto por regla puede haber variado |
| `--fix` de RUF100 borra los 6 `# noqa: F401` de `load_all_tools()`; alguien «arregla» luego el F401 borrando el import → **el catálogo se queda vacío** | Media | Verificado: 5 de los 6 sobran, **1 no**. Tarea explícita de no usar `--fix` a ciegas ahí. Guarda existente: `test_tool_catalog.py` TCAT-001 (`len(catalogo) == 23`) |
| Lint bloqueante deja rojo el merge por algo trivial | Media | Se flipa en C5, con el cero ya medido dos veces, y la versión fijada. Revertir es un commit de 2 líneas |
| El remedio se queda a medias en uno de los 4 saltos del frontend y el marcador se cuela crudo | Media | El escritor del marcador (`streamHandlers`) siempre emite 3 campos, con `retry` por defecto. La arity la garantiza el escritor, no la red |
| Cambiar DTZ005 rompe comparaciones naive/aware en Mongo | **Baja (descartada)** | Verificado: `OAuthApp` y `ServiceCredential` **no se instancian en ningún sitio**; el cliente Mongo no es `tz_aware`. Los 4 `default_factory` no llegan a dispararse |

## Rollback Plan

Cinco commits independientes, `git revert` limpio en orden inverso. Sin migraciones, sin cambio
de esquema, sin operación destructiva. C5 es el más barato de revertir (devolver
`continue-on-error: true`) y el que más conviene revertir primero si el merge urge. C1 no cambia
conducta salvo en 6 sitios, y ahí sólo **añade** una línea de log. C3 es el de mayor alcance
—toca 5 ficheros en dos lenguajes— y su reversión completa cabe en `_classify_tool_output` más
los 4 consumidores; su peor caso es volver al «Reintentar» de hoy, que es el estado actual.

## Dependencies

- Se aplica **después** de `artefactos-guardarrailes`, `junta-honesta` e `infra-n8n`. No al revés:
  C1 pasa por encima de todo `backend/app`.
- `ruff==0.16.3` debe existir en PyPI en el runner de CI (lo hace hoy).
- El enlace de `connect` apunta a `/settings/integrations` (id `integrations`, etiqueta
  «Conexiones»). Verificado en `SettingsPage.tsx`.

## Success Criteria

- [ ] `ruff check backend/app` con el `ruff.toml` nuevo → **0 errores**, medido dos veces sobre el árbol final.
- [ ] `ruff check backend/app --select B008` sigue devolviendo 63: se descartaron, no se «arreglaron».
- [ ] Un fallo `linkedin_not_configured` pinta ✗ **sin** «Reintentar» y **con** enlace a Conexiones.
- [ ] Un fallo `{"error": true}` de n8n sigue ofreciendo «Reintentar» (la conducta de hoy no se pierde).
- [ ] `grep -rn "missing_user_context" backend/` → **0 resultados**.
- [ ] Un test falla si alguien añade a `test_service_credential` una rama de un servicio que no está en `SERVICE_DEFINITIONS`.
- [ ] El job `lint` de CI bloquea y está verde.
- [ ] Backend y frontend ≥ baselines de 0.1, más los nuevos.

## Capabilities

### New Capabilities
- `backend-lint-gate`: qué promete el lint del backend, qué reglas entran y por qué las que no entran no entran; cuándo bloquea el merge.
- `tool-error-remedy`: un fallo de herramienta viaja con lo que el usuario puede hacer al respecto; un concepto de error tiene exactamente un código.
- `service-connection-test`: el test de conexión sólo contiene ramas para servicios que existen en `SERVICE_DEFINITIONS`.

### Modified Capabilities
None — ninguna spec de `openspec/specs/` (`billing-frontend`, `core-agents-endpoint`,
`credit-system`, `infrastructure`, `model-provider-routing`, `rate-limiting`, `settings-page`)
cubre lint, remedios de error ni el catálogo de servicios. `tool-result-integrity` sigue siendo
delta sin archivar en `tools-seguridad`: `tool-error-remedy` la **extiende**, no la reemplaza —
TRI-001 sigue definiendo los tres estados, y este change sólo añade qué se ofrece dentro de «fallo».
