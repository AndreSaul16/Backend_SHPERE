# Proposal: junta-honesta — la Junta deja de narrar herramientas que no tiene

> Base: `openspec/changes/lanzamiento-v1/decision-tools-en-junta.md` §8, fases **F0** y **F0b**. La decisión (Opción C por fases) ya está tomada; esto la vuelve ejecutable.
> Toda afirmación re-verificada contra `feat/lanzamiento-e2e` en esta sesión.
> Baseline de la zona: `tests/test_board_v2.py + tests/test_board_meeting.py` → **31 passed (2,13 s)**.

## Intent

En la Junta, los directores **narran acciones que no ocurren**. No es una alucinación aleatoria: es determinista. Su identidad les anuncia herramientas (`orchestrator.py:170-259`), la Junta hereda esa identidad (`agent_resolver.py:47`), `bind_tools` se salta con `board_mode` (`orchestrator.py:475-476`) y ningún grafo de junta tiene nodo de tools (`board_v2.py`, `grep bind_tools|ToolNode` → 0). Encima, su prompt les prohíbe decir «no tengo acceso» (`orchestrator.py:163`). Se les dice que tienen manos, se les atan, y se les prohíbe mencionarlo.

Lema del lanzamiento: **la junta delibera con datos reales; tú apruebas; SPHERE ejecuta**. Hoy sólo se puede sostener la primera mitad si se dice la verdad sobre la segunda.

## Scope

### In Scope

| # | Commit | Qué cierra |
|---|---|---|
| **F0-1** | `fix(board): la identidad del director no anuncia herramientas en modo junta` | Recorte del bloque de herramientas + cláusula de deliberación, en el único punto por el que pasan los cuatro grafos |
| **F0-2** | `test(board): fijar por contrato el prompt que recibe un director en junta` | Las tres capas de verificación (§F0-b) |
| **F0-3** | `fix(board): el acta nombra al director responsable de cada próximo paso` | `SYNTHESIS_ADDITION` (`board_v2.py:483-484`) exige nombre, no «responsable» genérico |
| **F0b-1** | `feat(acta): ejecutar un próximo paso con su director` | Botón por fila + resolución del responsable, reutilizando el deep-link que ya existe |
| **F0b-2** | `docs(product): la junta delibera; la ejecución vive en el chat del director` | Los cinco textos de §Copy |

### Out of Scope

| Fuera | Por qué | Dónde vive |
|---|---|---|
| **F1** — lecturas en vivo (subgrafo por director, allowlist de 6, 2 iteraciones) | 3-5 días y re-arquitectura del paralelismo | `decision-tools-en-junta.md` §8 |
| **F2** — escrituras como `[ACCION]` con aprobación y TTL | 5-8 días; exige el gate de confirmación completo | ídem |
| Arreglar el gate `requires_confirmation` (4 destructivas sin puerta) | Es **C3 de `tools-seguridad`**, no de aquí | `openspec/changes/tools-seguridad/` |
| Retirar del prompt las 5 herramientas rotas | Es **C4 de `tools-seguridad`** | ídem |
| Tocar `actaParser.ts` o el modal de GitHub | Es **`lanzamiento-p0`** (B3c) | `openspec/changes/lanzamiento-p0/` |

**No se toca**: aristas ni nodos de ningún grafo, `bind_tools`, el chat directo (allí las herramientas existen y el prompt debe seguir anunciándolas), el protocolo de cadena CEO→CTO→CFO→CMO→CEO, el esquema de Mongo, créditos, auth, DESIGN.md.

## Decisión F0-a — dónde y cómo se recorta el prompt

**Hallazgo que cambia el plan** (verificado, y el propio código lo documenta en `board_v2.py:67-70`): **`agent_node` ignora `state["system_prompt"]`**. Compone el prompt desde `resolve_agent_config` (`orchestrator.py:430-434`); `state["system_prompt"]` sólo lo lee el grafo legacy (`:798`). Consecuencia directa: el recorte **no puede hacerse desde `board_v2.py`** — ahí no llegaría al modelo. La fase F0 del estudio proponía tocar `_board_query`; eso habría producido un cambio que no hace nada.

**Dónde**: en `agent_node`, paso 6, junto a la rama `board_mode` que ya limpia el historial (`:420-427`). Es el embudo por el que pasan los cuatro caminos (junta v1, junta v2, `devil_node`, `synthesis_node`).

**Cómo**: marcadores explícitos, no `str.replace` de literales.

1. En los 4 `DEFAULT_CORE_PROMPTS`, envolver entre `[[TOOLS]]` … `[[/TOOLS]]` las secciones «HERRAMIENTAS EXCLUSIVAS…», «HERRAMIENTAS COMPARTIDAS…» **y el párrafo final de uso** (`Usa las herramientas cuando…`, `:183`, `:208`, `:234`, `:259`) — ese párrafo también miente y está fuera de las listas.
2. Función pura `render_identity(prompt, *, with_tools: bool) -> str`: `True` borra sólo las líneas marcadoras; `False` borra el bloque entero. Ningún marcador sobrevive en ninguna de las dos ramas.
3. En `agent_node`: `board_mode` → `render_identity(..., with_tools=False) + BOARD_NO_TOOLS_CLAUSE`; si no → `render_identity(..., with_tools=True)`.

**Por qué marcadores**: el precedente de recorte por literal ya existe y es exactamente lo que falla en silencio — `board_agent_node_factory:808-813` hace `.replace()` de un párrafo copiado a mano; si alguien retoca una coma del prompt, el replace no casa, no lanza nada y devuelve el texto intacto. Un marcador que falta **sí** es detectable por test.

**Qué NO se toca de la identidad**: `IDENTIDAD Y PERSONALIDAD`, `CONTEXTO ORGANIZACIONAL`, `REGLAS DE COMPORTAMIENTO`. El protocolo de cadena no vive en el system prompt sino en el `HumanMessage` que construye `_board_query` (`board_v2.py:282-321`) y **no se toca en absoluto**: riesgo cero para el orden de la junta.

## Decisión F0-b — cómo se comprueba que un director ya no narra herramientas

Es una propiedad del texto de un modelo, así que **no se puede probar**. Lo que sí se puede probar, y es donde vive la causa, es el prompt. Tres capas, cada una capaz de fallar:

| Capa | Qué afirma | Por qué no es tautológica |
|---|---|---|
| **V1 — contrato del prompt** (puro, sin red) | Para cada rol: el prompt de junta no contiene **ninguno** de los nombres de `get_tools_for_role(rol)` tras `load_all_tools()`, ni la palabra `HERRAMIENTAS`; y **sí** conserva las secciones de identidad | Los nombres salen del **registry real**, no de una lista escrita en el test: una herramienta nueva en el prompt lo rompe sola. La aserción **complementaria** —con `with_tools=True` los nombres siguen ahí— impide «arreglarlo» vaciando el prompt del chat directo. El test puede fallar por los dos lados |
| **V2 — prompt compuesto** (lo que llega al modelo) | Con el patrón ya usado en `test_stream_billing.py:33-97` (`patch("app.application.orchestrator.ChatOpenAI")`), ejecutar `board_v2_node_factory("CFO","analysis")` y afirmar sobre el texto concatenado de **todos** los mensajes de `ainvoke`: cero nombres de herramienta, cláusula presente, `bind_tools` no invocado | Cubre el fallo realista: que la función pura exista y **nadie la enchufe**. Es el test que V1 no puede dar |
| **V3 — mutación** (patrón ya usado en los specs de `lanzamiento-p0`) | Si `agent_node` vuelve a pasar `resolved.system_prompt` tal cual en junta, V2 debe fallar; si se borran los marcadores de un prompt, V1 debe fallar | Se ejecuta a mano al escribir el test y queda documentado como escenario |

### Lo que NO queda cubierto — dicho sin adornos

1. **Que el modelo no narre.** Se elimina la causa determinista (anunciarle herramientas y prohibirle decir que no tiene acceso), no la posibilidad. Ningún test de este cambio prueba una propiedad de la salida del LLM, y ninguno lo pretenderá.
2. **Los overrides del usuario.** `agent_resolver.py:69-71` concatena `system_prompt_addition` al prompt base. Si un usuario escribe ahí «tienes acceso a WhatsApp», el recorte no lo quita: no lleva marcadores. Declarado, fuera de alcance.
3. **La síntesis del CEO** puede seguir redactando un paso en pasado («queda agendada la reunión»). F0-3 empuja al formato con responsable, pero no lo garantiza.
4. **El chat directo** queda exactamente como está: allí las herramientas existen, y su confirmación real la arregla `tools-seguridad` C3 — no este cambio.

### Instrumento de medida, no guardarraíl

Función pura `narracion_sospechosa(texto) -> list[str]`: marca coincidencias de nombres del registry junto a verbos de acción consumada («he consultado», «he enviado», «he agendado», «publiqué», «ejecuté») y lo escribe en el log del debate. **No bloquea, no reescribe, no se muestra al usuario.** Existe para poder responder con un número dentro de dos semanas a «¿ha muerto la narración falsa?», en vez de con una opinión. Sus falsos positivos (el condicional legítimo: «habría que mirar la agenda») se aceptan por escrito: es un termómetro, no una puerta. Su propio test sí puede fallar, con casos positivos y negativos.

## Decisión F0b — el deep-link «Ejecutar con {director}»

**Ruta: ninguna nueva.** Se reutiliza el mecanismo ya en producción para las plantillas de debate: `createNewSession(agentId)` → `navigate('/chat/'+sessionId, { state: { plantilla } })` (`CommandPalette.tsx:203-210`), que consume `ChatPanel.tsx:654-660` y **borra el state** para que volver atrás no lo re-pegue. Sin query params: el texto del paso no debe viajar en la URL ni en telemetría.

| Caso | Decisión |
|---|---|
| Texto precargado | `título` + `body` del item + una línea de procedencia del acta. **No se envía solo**: el crédito lo dispara el usuario (principio 3) y el paywall ya se abre en el composer con el borrador intacto (`ChatPanel.tsx:504-518`) |
| Resolver el responsable | Fichero **nuevo** `frontend/src/utils/directorDelPaso.ts`: busca rol (`CEO\|CTO\|CFO\|CMO`) o nombre (`Oberon\|Nexus\|Ledger\|Vortex`) como palabra completa en título y cuerpo, sin distinguir mayúsculas ni tildes; gana la primera aparición |
| El paso no nombra a nadie | Botón **«Ejecutar con Oberon (CEO)»** — es quien delega. El `title`/`aria-label` dice por qué. Descartado un selector de director: más UI para el caso raro |
| El paso nombra a Némesis | Igual que «sin responsable»: el Abogado del Diablo **no es un canal** (`BOARD_DEVIL_AGENT` no está en `MOCK_AGENTS`, `agentCatalog.ts:139-155`) |
| `createNewSession` falla | `InlineError` en la fila y **no se navega** (`sessionsSlice.ts:166-170` ya lanza `SessionError`) |
| Sesión por clic | Se crea una nueva, como hacen las plantillas («aplicarla sobre una conversación en curso pisaría lo que el usuario ya escribió»). Coste declarado: un documento de sesión por clic, borrable desde el sidebar |

## Coordinación con `lanzamiento-p0` y `tools-seguridad`

| Fichero | `lanzamiento-p0` | `tools-seguridad` | `junta-honesta` | Orden |
|---|---|---|---|---|
| `frontend/src/utils/actaParser.ts` | Reescribe el parser (14 formatos) | — | **No lo toca** | p0 antes; sin conflicto |
| `frontend/src/components/artifacts/ActaActions.tsx` | Modal de GitHub: previsualización de títulos (`:356-364`) | — | Fila de la lista de pasos (`:287-329`): un botón más junto al de GitHub | p0 antes; **zonas distintas** del mismo fichero → rebase, no conflicto semántico |
| `backend/app/application/orchestrator.py` (`DEFAULT_CORE_PROMPTS`) | — | **C4 quita del prompt las 5 herramientas retiradas** | Envuelve en marcadores lo que quede | **C4 obligatoriamente antes**; al revés, C4 tendría que editar dentro de los marcadores |
| Copy que promete confirmación | — | **C3** lleva el gate de 5 a 9 herramientas | Depende de C3 | Si C3 no entra, el copy dice «lo lanzas tú desde su chat» y **no** «bajo tu confirmación» |

Efecto colateral bueno: p0 hace el parser más permisivo → más pasos reconocidos → más botones «Ejecutar con», y su `body` (celdas de tabla, líneas de continuación) mejora el texto precargado.

## Copy — los cinco textos, literales

1. **`BoardActivationModal.tsx`** (tras el párrafo de `:68-74`):
   «La junta **delibera**: no consulta datos en vivo ni ejecuta acciones. Cada próximo paso del acta se abre con un clic en el chat de su director, y lo lanzas tú.»
2. **`ChatPanel.tsx:703-706`** (bienvenida), tercera frase:
   «Deliberan y firman el acta; cada próximo paso se abre en el chat de su director, y lo lanzas tú.»
3. **`agentCatalog.ts:13`** (saludo del canal Junta — hoy describe el modo router, no el debate):
   «Bienvenido a la **Junta Directiva**. Tus directores debaten en fases, votan y el CEO firma el acta. Aquí se decide: cada próximo paso se ejecuta después, en el chat de su director.»
4. **`ActaActions.tsx`**, bajo el encabezado «Próximos pasos»: «La junta decide; el paso lo lanzas tú con su director.» · Botón: **«Ejecutar con Nexus»** · `aria-label`: «Abrir el chat de Nexus (CTO) con este paso preparado».
5. **`PRODUCT.md:76-80`** (Integraciones reales), añadir: «…disponibles en el **chat individual** de cada director. **En la junta no se ejecuta ninguna herramienta**: la junta delibera y el acta deja cada acción con su responsable.» Y en el principio 4 (`:164-165`), «y qué herramienta ejecutó» → «y, en el chat de cada director, qué herramienta se ejecutó».

**Prohibido decir**: «la junta ejecuta», «28 integraciones» (9 funcionan de punta a punta; 23 quedan registradas tras C4), «los directores consultan datos en tiempo real», «tus agentes actúan por ti mientras debaten».

**Texto de la cláusula del prompt** (`BOARD_NO_TOOLS_CLAUSE`, constante nueva):

```
--- MODO JUNTA: DELIBERACIÓN, NO EJECUCIÓN ---
En esta sesión la junta DELIBERA. No hay ejecución de herramientas: no consultás
sistemas externos ni actuás sobre ellos mientras hablás.
1. NO afirmes haber consultado, revisado, enviado, publicado, agendado ni ejecutado
   nada. No inventes datos "en vivo" (cotizaciones, métricas, agenda, mensajes).
2. Esto NO es decir "no tengo acceso": no te disculpes ni rompas la reunión. Sos un
   director de esta junta y decidís con tu criterio y con lo que hay sobre la mesa.
3. Si hace falta un dato externo o una acción, va a "Próximos pasos" como acción
   concreta con SU DIRECTOR RESPONSABLE nombrado. El fundador la lanzará después
   desde el chat de ese director.
```

## Capabilities

### New Capabilities
- `board-tool-honesty`: la identidad de un director en modo junta no anuncia herramientas; el prompt compuesto está fijado por contrato; el chat directo conserva las suyas; y el documento declara qué no queda cubierto.
- `acta-step-handoff`: cada próximo paso del acta se abre en el chat de su director responsable con el paso precargado y **sin enviar**, con reglas explícitas para «sin responsable», «responsable no seleccionable» y «fallo al crear la sesión».

### Modified Capabilities
- None. (`acta-deliverable` es de `lanzamiento-p0` y aún no está en `openspec/specs/`. Si p0 se archiva antes de la fase spec, `acta-step-handoff` se escribe como delta sobre él en vez de como capacidad nueva.)

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `backend/app/application/orchestrator.py` | Modified | Marcadores en los 4 prompts; `render_identity()`; `BOARD_NO_TOOLS_CLAUSE`; 3 líneas en `agent_node` paso 6 |
| `backend/app/application/board_v2.py` | Modified | Sólo `SYNTHESIS_ADDITION:483-484`: el próximo paso nombra a su director |
| `backend/tests/test_board_prompt.py` | New | Capas V1 y V2 |
| `frontend/src/utils/directorDelPaso.ts` (+ test) | New | Resolución del responsable |
| `frontend/src/components/artifacts/ActaActions.tsx` | Modified | Un botón por fila en la lista de pasos ya existente |
| `BoardActivationModal.tsx`, `ChatPanel.tsx`, `agentCatalog.ts`, `PRODUCT.md` | Modified | Copy |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El recorte se come parte de la identidad y el director suena a asistente genérico | Media | V1 afirma que las secciones de identidad siguen; revisión humana de **una junta real** antes de cerrar el cambio |
| Un marcador mal puesto deja el chat directo sin herramientas | Media | V1 con `with_tools=True` falla si desaparece un nombre del registry |
| El modelo sigue narrando (residual) | Media | No se promete lo contrario: se mide con `narracion_sospechosa` y se decide con datos |
| Un prompt más corto cambia el tono o la longitud del debate | Media | Cambio de comportamiento observable, no fallo. Se comprueba con una junta real y con los 31 tests de board existentes |
| Colisión con C4 de `tools-seguridad` en `DEFAULT_CORE_PROMPTS` | Alta sin orden | Orden fijado: C4 → junta-honesta |
| Colisión con p0 en `ActaActions.tsx` | Baja | Zonas distintas; si p0 reescribe la lista de pasos, se rebasa |
| El copy promete confirmación que hoy no existe para 4 herramientas | Alta sin C3 | El texto 1 y 4 no dicen «bajo tu confirmación» hasta que C3 esté dentro |
| Sesiones huérfanas por clics en «Ejecutar con» | Baja | Declarado; borrables desde el sidebar |

## Rollback Plan

- Cinco commits independientes; `git revert <sha>` deshace cada uno sin tocar los demás. **Ninguno migra datos ni cambia el esquema de Mongo.**
- **F0-1** es la palanca de emergencia: un revert de backend y redeploy devuelve el prompt anterior. Sin estado persistido: el prompt se compone en cada llamada; los checkpoints de LangGraph guardan mensajes, no prompts.
- **F0-3**: revertir devuelve «responsable» genérico; las actas ya emitidas no se tocan (y `directorDelPaso` sigue funcionando sobre ellas, sólo acierta menos).
- **F0b-1**: revertir devuelve la fila del paso a tener sólo el botón de GitHub. Las sesiones ya creadas se quedan; no estorban.
- **F0b-2**: revert de documentación y copy.
- Orden si hay que deshacer todo: F0b-2 → F0b-1 → F0-3 → F0-2 → F0-1.

## Success Criteria

- [ ] El prompt de junta de los 4 roles no contiene ningún nombre del registry ni la palabra `HERRAMIENTAS`; el de chat directo sí los contiene (mismo test, dos ramas).
- [ ] Ningún marcador `[[TOOLS]]` sobrevive en ninguno de los dos prompts renderizados.
- [ ] El prompt **compuesto** que recibe `ainvoke` en `cfo_analysis` no contiene nombres de herramienta y sí la cláusula; `bind_tools` no se invoca en junta.
- [ ] Mutación: devolver `resolved.system_prompt` sin recortar hace fallar V2; borrar los marcadores de un prompt hace fallar V1.
- [ ] `directorDelPaso` resuelve «Nexus (CTO): migrar…», «**CFO** — revisar…», «Responsable: CMO» y devuelve `null` con un paso sin nombre.
- [ ] Un paso sin responsable ofrece «Ejecutar con Oberon (CEO)» y no rompe la fila.
- [ ] Pulsar «Ejecutar con» abre el chat del director con el texto en el compositor y **sin enviarlo**, y no consume ningún crédito.
- [ ] Backend y frontend siguen en verde (338 / 827 de partida) y los 31 tests de board no se tocan.
- [ ] Una junta real leída de arriba abajo: ningún director afirma haber consultado o ejecutado nada, y cada próximo paso nombra a un director.
- [ ] Ningún texto de la UI dice que la junta ejecuta, ni menciona «28 integraciones».

## Dependencies

- **`lanzamiento-p0`** — se aplica ANTES. Toca `actaParser.ts` y el modal de `ActaActions.tsx`; este cambio no toca ninguno de los dos.
- **`tools-seguridad`** — C4 antes (prompts de rol), C3 antes de publicar el copy que menciona confirmación.
- Ninguna dependencia externa: sin librerías nuevas, sin endpoints nuevos, sin migraciones.
