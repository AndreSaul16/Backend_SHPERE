# board-tool-honesty

> **Source**: junta-honesta (F0) · **TDD**: ACTIVA (pytest)
> **Alcance**: `backend/app/application/orchestrator.py`, `board_v2.py`. El chat directo NO se toca.
> **Precedencia obligatoria**: `tools-seguridad` **C4** entra ANTES (edita los mismos `DEFAULT_CORE_PROMPTS`); al revés, C4 tendría que editar dentro de los marcadores.

## Purpose

En `board_mode` el modelo recibe una identidad que le anuncia herramientas que el grafo no le da. Esta capacidad fija **por contrato el texto que llega al modelo**, no la salida del modelo. Todo lo que aquí se exige es observable sobre el prompt compuesto o sobre las llamadas capturadas.

## Requirements

| ID | Requisito | Esc. |
|----|-----------|------|
| BTH-001 | El prompt de identidad renderizado para junta MUST NOT contener ningún nombre de herramienta ni la palabra `HERRAMIENTAS`, para los 4 roles | 3 |
| BTH-002 | El prompt renderizado para chat directo MUST seguir conteniendo los nombres del registry **que ya anunciaba** (intersección registry ∩ prompt), y esa intersección MUST NOT ser vacía | 3 |
| BTH-003 | Ningún marcador `[[TOOLS]]` / `[[/TOOLS]]` MUST sobrevivir en ninguna de las dos ramas de render | 2 |
| BTH-004 | `IDENTIDAD`, `CONTEXTO ORGANIZACIONAL` y `REGLAS DE COMPORTAMIENTO` MUST sobrevivir íntegras al recorte | 2 |
| BTH-005 | El prompt **compuesto** que recibe `ainvoke` en junta MUST NOT contener nombres de herramienta y MUST incluir la cláusula de no-afirmación | 3 |
| BTH-006 | `bind_tools` MUST NOT invocarse en `board_mode` | 2 |
| BTH-007 | El protocolo de cadena CEO→CTO→CFO→CMO→CEO MUST permanecer intacto | 1 |
| BTH-008 | La síntesis MUST exigir que cada próximo paso nombre a su director responsable | 2 |
| BTH-009 | `narracion_sospechosa()` MUST registrar en log y MUST NOT bloquear, reescribir ni mostrarse al usuario | 3 |

**Derivación obligatoria de la lista prohibida**: el conjunto de nombres prohibidos SHALL obtenerse en tiempo de test de `[t.name for t in get_tools_for_role(rol)]` tras `load_all_tools()` (`registry.py:31,42`). Un test que escriba esa lista a mano NO satisface BTH-001 ni BTH-002: una herramienta nueva en el prompt debe romperlo sola.

### BTH-001: El prompt de junta no nombra herramientas

- GIVEN `load_all_tools()` ejecutado y el rol `CFO`
  WHEN se renderiza su identidad en la rama de junta
  THEN ningún `t.name` de `get_tools_for_role("CFO")` aparece en el texto
  AND la subcadena `HERRAMIENTAS` no aparece

- GIVEN los 4 roles `CEO|CTO|CFO|CMO`
  WHEN se renderiza cada identidad en la rama de junta
  THEN la aserción anterior se cumple para los cuatro

- **Mutación** — GIVEN un `DEFAULT_CORE_PROMPTS` al que se le borran los marcadores `[[TOOLS]]`
  WHEN corre el test derivado del registry
  THEN el test FALLA (los nombres reaparecen)

### BTH-002: El chat directo conserva sus herramientas (aserción complementaria)

> **Enmienda D7 (ratificada en la fase de diseño, aplicada aquí).** La redacción
> anterior —«**todos** los `t.name` de `get_tools_for_role(rol)` siguen presentes»—
> **falla hoy, antes de tocar una sola línea**: el registry expone 12 herramientas
> compartidas (`shared_tools.py:363-426` → 8, `oauth_tools.py:283-313` → 4) y los
> prompts sólo anuncian 6. `slack_*`, `notion_*`, `github_*`, `calendar_update_event`
> y `calendar_delete_event` no aparecen en ningún `DEFAULT_CORE_PROMPTS`. Era una
> aserción infalsable en verde: obligaba a **ampliar** el anuncio de herramientas
> justo en el cambio que lo recorta (territorio de `tools-seguridad`, no de éste).
> La aserción pasa a ser sobre la **intersección registry ∩ prompt**, que sigue
> derivada del registry y conserva intacta la guarda de mutación.

Aserción normativa:

```python
anunciadas = {t.name for t in get_tools_for_role(rol) if t.name in DEFAULT_CORE_PROMPTS[rol]}
assert anunciadas                                   # el prompt anuncia algo (no vacío)
assert anunciadas <= nombres_en(render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=True))
```

- GIVEN el rol `CMO` WHEN se renderiza su identidad en la rama de chat directo
  THEN todo `t.name` de `get_tools_for_role("CMO")` **que ya estuviera** en su
  `DEFAULT_CORE_PROMPTS` sigue presente tras el render

- GIVEN cualquiera de los 4 roles WHEN se calcula esa intersección
  THEN NO es vacía (si un prompt deja de anunciar cualquier herramienta, el test cae)

- **Mutación** — GIVEN un recorte que vacía el bloque también fuera de junta
  WHEN corre este test THEN FALLA. Impide «arreglar» BTH-001 vaciando el prompt para todos.

### BTH-003: Ningún marcador se filtra al modelo

- GIVEN cualquier rol WHEN se renderiza con `with_tools=True` THEN el texto no contiene `[[TOOLS]]` ni `[[/TOOLS]]`
- GIVEN cualquier rol WHEN se renderiza con `with_tools=False` THEN idem

### BTH-004: La identidad sobrevive al recorte

- GIVEN el rol `CTO` WHEN se renderiza en la rama de junta
  THEN los encabezados de identidad, contexto organizacional y reglas de comportamiento siguen presentes
- GIVEN los 4 roles WHEN se renderizan en junta THEN la longitud del prompt es > 0 y conserva los tres encabezados

### BTH-005: El prompt compuesto (lo que de verdad llega al modelo)

Es el requisito que cubre el fallo realista: que la función de recorte exista y **nadie la enchufe**. Se observa capturando el argumento de `ainvoke` con el patrón ya usado en `tests/test_stream_billing.py:33-97` (`patch("app.application.orchestrator.ChatOpenAI")`).

- GIVEN un nodo de junta (`board_v2_node_factory("CFO","analysis")`) y `ChatOpenAI` parcheado
  WHEN se ejecuta el nodo
  THEN el texto concatenado de **todos** los mensajes recibidos por `ainvoke` no contiene ningún `t.name` del registry del rol

- GIVEN el mismo montaje
  WHEN se ejecuta el nodo
  THEN ese texto SÍ contiene la cláusula que prohíbe afirmar haber consultado, revisado, enviado, publicado, agendado o ejecutado nada

- **Mutación** — GIVEN `agent_node` devuelto a pasar `resolved.system_prompt` sin recortar (`orchestrator.py:430-434`)
  WHEN corre este test THEN FALLA. Es el test que la aserción sobre la función pura no puede dar.

### BTH-006: Sin binding de herramientas en junta

- GIVEN un nodo de junta con el LLM parcheado
  WHEN se ejecuta el nodo
  THEN `bind_tools` no ha sido invocado sobre el LLM (contador de llamadas = 0)
  AND el objeto sobre el que se llama `ainvoke` es el LLM sin bindear

- **Mutación** — GIVEN `orchestrator.py:475-476` sin la guarda `not state.get("board_mode")`
  WHEN corre este test THEN FALLA

### BTH-007: La cadena del debate no se toca

- GIVEN el `HumanMessage` que construye `_board_query` (`board_v2.py:282-321`)
  WHEN se ejecuta el cambio completo
  THEN su contenido es byte a byte el mismo que antes del cambio, y los 31 tests de `test_board_v2.py + test_board_meeting.py` siguen en verde sin modificarse

### BTH-008: Cada próximo paso lleva nombre propio

- GIVEN `SYNTHESIS_ADDITION` (`board_v2.py:483-484`)
  WHEN se inspecciona la instrucción de la sección «Próximos pasos»
  THEN exige un **director responsable nombrado**, no la palabra genérica «responsable»

- **Mutación** — GIVEN la instrucción revertida a «acciones concretas con responsable»
  WHEN corre este test THEN FALLA

### BTH-009: `narracion_sospechosa()` — termómetro, no guardarraíl

Función pura `narracion_sospechosa(texto) -> list[str]`. **Qué mide**: coincidencias de un nombre del registry junto a un verbo de acción consumada («he consultado», «he enviado», «he agendado», «publiqué», «ejecuté») en el texto emitido por un director, y lo escribe en el log del debate. **Qué NO mide**: si el modelo narró de verdad, si el dato era falso, ni ninguna propiedad semántica. Sus falsos positivos (condicional legítimo: «habría que mirar la agenda») se aceptan por escrito.

- GIVEN un texto con nombre de herramienta y verbo consumado WHEN se evalúa THEN devuelve al menos una coincidencia
- GIVEN un texto en condicional sin verbo consumado WHEN se evalúa THEN devuelve lista vacía
- GIVEN cualquier texto WHEN se evalúa THEN el texto del director se emite sin modificar y no se propaga error al grafo

## Lo que NO queda cubierto (declarado, no omitido)

| # | No cubierto | Por qué |
|---|-------------|---------|
| 1 | **Que el modelo no narre** | Se mata la causa determinista (anunciar herramientas + prohibir decir «no tengo acceso»), no la posibilidad. **Ningún requisito de esta spec prueba una propiedad de la salida de un LLM, y ninguno lo pretenderá.** BTH-009 la mide; no la garantiza |
| 2 | Overrides del usuario | `system_prompt_addition` (`agent_resolver.py:69-71`) se concatena sin marcadores; el recorte no lo alcanza |
| 3 | Síntesis en pasado | BTH-008 empuja al formato con responsable; no impide «queda agendada la reunión» |
| 4 | El gate de confirmación del chat directo | Es `tools-seguridad` C3, no este cambio |
| 5 | Que el prompt anuncie **todo** el registry | 6 de las 12 shared (`slack_*`, `notion_*`, `github_*`, `calendar_update_event`, `calendar_delete_event`) no están en ningún prompt hoy. BTH-002 (enmienda D7) protege lo anunciado; **ampliar** el anuncio es `tools-seguridad` |
