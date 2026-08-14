# Design: junta-honesta

> Verificado sobre `feat/lanzamiento-e2e`. Marcado **[H]** lo que es hipótesis.

## Lo que asumo de las dependencias

| De | Asumo | Si no se cumple |
|---|---|---|
| `tools-seguridad` **C4** | Cada uno de los 4 `DEFAULT_CORE_PROMPTS` conserva (i) al menos un encabezado `HERRAMIENTAS …` **o** el párrafo final de uso, y (ii) ese párrafo sigue siendo **lo último del prompt** (hoy: `:183`, `:208`, `:234`, `:259`). C4 desregistra 5 tools y borra sus líneas; no reordena secciones. **[H]** | La regla de colocación (abajo) sigue valiendo: `[[TOOLS]]` va antes de la primera línea de anuncio que quede |
| `lanzamiento-p0` | `parseProximosPasos(md): ParsedIssue[]` con `{title, body}` sobrevive; p0 toca `ActaActions.tsx:363` (lista dentro del modal de GitHub) y `tests/components/ActaActions.test.tsx`. **[H]** — p0 está a 0/86 tareas | Rebase: junta-honesta toca `:287-329` (la fila) y el mismo fichero de test |

## Enfoque

Un solo embudo. **Verificado**: `agent_node` **nunca lee `state["system_prompt"]`** (`grep` de `system_prompt` en `orchestrator.py`: sólo `:798` dentro de `board_agent_node_factory`, y `:850`/`:913` lo *escriben* en un estado que nadie consume). Compone desde `resolved.system_prompt` (`:430-434`). Los 5 caminos de junta (`board_v2.py:340`, `:441`, `:527`, `orchestrator.py:855`, `:917`) llaman a `agent_node`. Recortar ahí cubre el 100%; recortar en `board_v2.py` no haría nada.

## Decisiones

### D1 · `render_identity` — marcadores, y el fallo es ruidoso

**Vive en** `orchestrator.py`, justo tras `DEFAULT_CORE_PROMPTS` (los datos y su renderizador juntos; `agent_resolver` ya importa de ahí, sin ciclo).

```python
TOOLS_OPEN, TOOLS_CLOSE = "[[TOOLS]]", "[[/TOOLS]]"

def render_identity(prompt: str, *, with_tools: bool) -> str:
    """Pura. with_tools=True borra sólo las líneas marcadoras;
    False borra el bloque entero. Sin marcadores: devuelve el prompt intacto."""
```

**Colocación**: `[[TOOLS]]` en línea propia justo antes de la primera línea `HERRAMIENTAS …`; `[[/TOOLS]]` como **última línea del prompt**. El caso CEO lo obliga: `delegate_task` aparece en el párrafo final (`:183`), fuera de las listas — un bloque que no llegue al final deja ese nombre vivo y BTH-001 falla.

**Sin marcadores → intacto, no excepción.** Motivo verificado, no estético: `devil_node` resuelve `target_role="DEVIL"`, que no está en `CORE_ROLES` ni en Mongo → cae en `DEFAULT_CORE_PROMPTS["system"]`, que no tiene marcadores; y todo agente a medida (`agents.py:34`) tampoco. Un `raise` convertiría un desliz de redacción en un 500 en el chat del usuario.

**Y entonces, ¿dónde está el ruido?** En tres sitios, ninguno silencioso:

| Guarda | Falla cuando |
|---|---|
| Test de marcadores | Un core prompt no tiene exactamente un `[[TOOLS]]` y un `[[/TOOLS]]`, en ese orden |
| Test V1 derivado del registry | Un nombre del registry sobrevive al recorte de junta |
| **Postcondición en runtime** (`logger.warning`) | Tras recortar, el texto de identidad **todavía** nombra una herramienta del registry |

La postcondición es la respuesta directa al precedente de `str.replace` (`:808-813`): allí una coma cambiada no produce ningún síntoma. Aquí, la misma comprobación derivada del registry cubre **los dos** modos de fallo — marcador perdido y override del usuario — y se ve en el log de producción. No modifica el texto.

**Descartado**: `str.replace` de literales (el fallo silencioso que arreglamos); regex sobre `^HERRAMIENTAS` (misma fragilidad, un encabezado renombrado y adiós); mover los prompts a YAML (cambio grande, ninguna garantía nueva).

### D2 · Enganche exacto — `agent_node` paso 6

```python
# 6. Construir el prompt rico
en_junta = bool(state.get("board_mode"))
identidad = render_identity(resolved.system_prompt, with_tools=not en_junta)
if en_junta:
    fugadas = herramientas_nombradas(identidad, effective_role)   # observación
    if fugadas:
        logger.warning(f"junta {effective_role}: identidad aún nombra {fugadas}")
    identidad += BOARD_NO_TOOLS_CLAUSE
rich_system_prompt = AGENT_PROMPT_TEMPLATE.format(system_instruction=identidad, ...)
```

5 líneas de producción. Va **junto a** la rama `board_mode` de `:420-427` (misma condición, mismo paso), no dentro: aquella limpia historial, ésta compone identidad.

**Detalle que evita un falso rojo**: BTH-001 prohíbe la subcadena `HERRAMIENTAS` **en mayúsculas** y se afirma sobre `render_identity(..., with_tools=False)`, **antes** de concatenar la cláusula (que dice «ejecución de herramientas» en minúscula). El test no debe ser insensible a mayúsculas.

### D3 · `system_prompt_addition`: se deja, se declara y **se avisa**

Ni se recorta ni se ignora. Tres razones:

1. **No se puede recortar sin heurística.** `resolve_agent_config` devuelve *una* cadena (`user_context + base + addition`, `agent_resolver.py:71,81`); en `agent_node` la parte del usuario ya no es separable. Hacerla separable exige cambiar la forma de `ResolvedAgent` — más producción que todo el resto del commit junto.
2. **Recortar texto del usuario con un regex de nombres de herramienta es exactamente el guardarraíl que fallaría en silencio** con cualquier frase que no previmos, y mutilaría instrucciones legítimas.
3. **Es del usuario.** Que el *producto* anuncie manos que no existen es un defecto; que el fundador se lo escriba a Ledger es su decisión.

Lo que sí hacemos: la postcondición de D2 **ya lo detecta** (el nombre sobrevive al recorte porque está fuera del bloque) y lo deja en el log. Sin UI, sin bloqueo, en este cambio. Queda declarado en la spec (no-cubierto #2).

**Descartado**: descartar el `addition` entero en junta — silenciar al usuario sin avisarle es peor que la mentira que evita.

### D4 · `narracion_sospechosa` — termómetro por construcción

**Vive en** `backend/app/application/board_narracion.py` (módulo nuevo, ~30 líneas; importa `registry`, nada del grafo).

```python
def herramientas_nombradas(texto: str, rol: str) -> list[str]
def narracion_sospechosa(texto: str, rol: str) -> list[str]   # -> ["get_stock_data|he consultado", ...]
```

**Qué mide**: coincidencia de un `t.name` de `get_tools_for_role(rol)` **y** un verbo de acción consumada (`he consultado|revisado|enviado|publicado|agendado|ejecutado`, `publiqué`, `ejecuté`, …) en la misma respuesta. **Qué no mide**: si narró de verdad, si el dato era falso, ni nada semántico. Falsos positivos del condicional aceptados por escrito.

**Por qué no puede confundirse con una defensa** — es estructural, no una promesa:

- La firma devuelve `list[str]`, **nunca texto**: el llamante no tiene con qué reescribir la respuesta aunque quiera.
- Vive en un módulo sin acceso al `state` ni a los `messages`.
- Sus 2 llamadas (`board_v2_node_factory.node` y `synthesis_node`, después de `agent_node`) van envueltas en `try/except Exception: pass` y devuelven `None`; el `result` se retorna sin tocar.
- Escribe en el log del debate (`logger.info`), no en el estado, no en SSE.

**No medido**: `devil_node` (usa el prompt `system`, sin anuncio de herramientas) y la junta v1 legacy.

### D5 · Deep-link — cero líneas nuevas de mecanismo

Se reutiliza tal cual el camino ya en producción (`CommandPalette.tsx:203-210` → `ChatPanel.tsx:654-660`), **incluida la clave `plantilla`** del `state` de navegación. `ChatPanel` ya hace `setInputValue(...)` + `navigate(pathname, {replace:true, state:null})`: precarga sin enviar y limpia el state. **Diff en `ChatPanel` para el mecanismo: 0 líneas** (sólo un comentario que documente el segundo productor).

```
fila del acta ──createNewSession(agentId)──> sessionId
      │                                          │
      │  falla → InlineError en la fila,         └─ navigate(`/chat/${id}`, {state:{plantilla}})
      │          NO navega                                     │
      └─ éxito ─────────────────────────────────> ChatPanel: setInputValue + state:null
                                                  (sin stream, sin cargo — el crédito lo dispara enviar)
```

**Invariante «el destino ∈ `MOCK_AGENTS`» por construcción, no por guarda**: `directorDelPaso` sólo conoce el vocabulario de los 4 directores ejecutables; `Némesis`/`DEVIL` **no están en su tabla**, así que devuelve `null` y cae en CEO. `devil-1` es inalcanzable porque nadie lo puede nombrar, no porque un `if` lo filtre — un `if` alguien lo borra.

**Descartado**: query params (el texto del paso acabaría en la URL y en telemetría); ruta nueva; clave de state nueva (obligaría a tocar `ChatPanel` y su test para ganar sólo un nombre mejor — deuda anotada).

### D6 · De dónde sale el director responsable

**Del texto del paso, y de nada más** (`title` primero, luego `body`; gana la primera aparición). Descartado inferirlo de la fase (los próximos pasos los emite siempre la síntesis → siempre CEO, inútil) y del acta (la tabla de votos dice quién votó, no quién ejecuta). Descartado un clasificador temático («runway» → CFO): es una conjetura disfrazada de dato; cuando acierta no aporta nada y cuando falla el usuario abre el chat equivocado. Que el nombre esté escrito es trabajo de **BTH-008**, no del parser.

| Ambiguo | Resuelve |
|---|---|
| Dos responsables | El primero en aparecer (determinista, ASH-002) |
| Ninguno | Oberon (CEO), quien delega; el `aria-label` dice por qué |
| Némesis | Ninguno → Oberon (D5) |
| `CTOS`, `director` | No casa: límite de palabra sobre texto sin tildes y en minúsculas |

`DIRECTORES = [{rol:'CEO', nombre:'Oberon'}, …]` vive en `directorDelPaso.ts`; el `agentId` y el nombre a pintar salen de `MOCK_AGENTS` buscando por `role`. Un test comprueba que cada `nombre` de la tabla aparece en el `name` de su agente en `MOCK_AGENTS` — misma idea que derivar del registry en backend: la deriva se cae sola.

### D7 · Enmienda obligatoria a BTH-002 (bloqueante si no se corrige)

**Verificado**: el registry tiene **12 shared** (`shared_tools.py:363-426` → 8, `oauth_tools.py:283-313` → 4) + las de rol; los prompts anuncian **6 shared**. `calendar_update_event`, `calendar_delete_event`, `slack_*`, `notion_*`, `github_*` **no están en ningún prompt hoy**. BTH-002 tal como está escrito («*todos* los `t.name` siguen presentes») **falla hoy, antes de tocar nada**.

Aserción que sí se sostiene y conserva la guarda de mutación:

```python
anunciadas = {t.name for t in get_tools_for_role(rol) if t.name in DEFAULT_CORE_PROMPTS[rol]}
assert anunciadas                                            # el prompt anuncia algo
assert anunciadas <= set_de_nombres(render_identity(p, with_tools=True))   # y lo sigue anunciando
```

Sigue derivada del registry y sigue rompiéndose si alguien vacía el bloque para todos. Añadir los 6 nombres que faltan a los prompts sería ampliar el anuncio de herramientas justo en el cambio que lo recorta: es territorio de `tools-seguridad`.

## Ficheros

| Fichero | Acción | Qué |
|---|---|---|
| `backend/app/application/orchestrator.py` | Modify | Marcadores en los 4 prompts; `render_identity`; `BOARD_NO_TOOLS_CLAUSE`; 5 líneas en `agent_node:429` |
| `backend/app/application/board_narracion.py` | **New** | `herramientas_nombradas`, `narracion_sospechosa` |
| `backend/app/application/board_v2.py` | Modify | `SYNTHESIS_ADDITION:483-484`; 2 llamadas de medición |
| `backend/tests/test_board_prompt.py` | **New** | V1 + V2 |
| `backend/tests/test_board_narracion.py` | **New** | Positivos y negativos |
| `frontend/src/utils/directorDelPaso.ts` | **New** | Resolución del responsable |
| `frontend/src/components/artifacts/ActaActions.tsx` | Modify | Botón por fila (`:287-329`) + `InlineError` por fila |
| `frontend/tests/components/ActaActions.test.tsx` | Modify | Envolver en `MemoryRouter` (patrón de `PaletaDeComandos.test.tsx:21-30`) — hoy renderiza sin router y `useNavigate` reventaría |
| `BoardActivationModal.tsx` (en `components/modals/`), `ChatPanel.tsx`, `agentCatalog.ts:13`, `PRODUCT.md` | Modify | Copy |

## Pruebas

| Capa | Qué | Cómo |
|---|---|---|
| Unit backend | V1, marcadores bien formados, `narracion_sospechosa` | Puro, sin red; nombres desde `load_all_tools()` |
| Integración backend | V2: texto de **todos** los mensajes de `ainvoke`; `bind_tools` no llamado | `patch("app.application.orchestrator.ChatOpenAI")`, patrón de `test_stream_billing.py:33-97` |
| Mutación | Devolver `resolved.system_prompt` crudo → V2 rojo; borrar marcadores → V1 rojo | A mano al escribir el test, documentado en la spec |
| Unit frontend | `directorDelPaso` (6 casos) + deriva contra `MOCK_AGENTS` | vitest |
| Componente | Fila: navega con `state`, no envía, error inline; copy sobre **texto renderizado** (`getByText`), nunca contra la constante | RTL + `MemoryRouter` + `useNavigate` espiado |

La cláusula se afirma con su **literal escrito en el test** (`"NO afirmes haber consultado, revisado, enviado, publicado, agendado ni ejecutado"`), no comparando la constante consigo misma: si alguien la retoca, el test se pone rojo — que es justo lo contrario del `.replace` de `:808`.

## Commits

| # | Commit | Se verifica |
|---|---|---|
| 1 | `fix(board): la identidad del director no anuncia herramientas en modo junta` | `pytest tests/ -q` ≥ 338 + nuevos; `test_board_v2.py`+`test_board_meeting.py` **sin tocar**, 31 verdes; las 2 mutaciones a mano |
| 2 | `feat(board): medir la narración de herramientas en la junta` | Tests de `narracion_sospechosa`; suite completa verde |
| 3 | `fix(board): el acta nombra al director responsable de cada próximo paso` | BTH-008 + los 31 de board siguen verdes |
| 4 | `feat(acta): ejecutar un próximo paso con su director` | `vitest run` ≥ 827 + nuevos; `tsc -b --noEmit`; `check-dead-classes` |
| 5 | `docs(product): la junta delibera; la ejecución vive en el chat del director` | Tests de copy sobre texto renderizado; ninguna frase prohibida |

**Desviación de la propuesta, con motivo**: F0-1 y F0-2 van **fusionados** en el commit 1. Separados, `git revert` del commit del prompt —la palanca de emergencia declarada— dejaría los tests del commit siguiente en rojo. El commit 2 (medición) se separa para poder revertirla sin tocar el arreglo. Orden 3 → 4 a propósito: el acta debe nombrar al responsable **antes** de que la UI se fíe del nombre. El 5 va al final por depender de C3 para cualquier promesa de confirmación.

TDD estricto (`config.yaml: strict_tdd`) se aplica **dentro** de cada commit (rojo → verde); ningún commit se deja rojo.

## Preguntas abiertas

- [ ] BTH-002 necesita la enmienda de D7 antes de la fase apply (bloqueante: hoy es infalsable en verde).
- [ ] ¿Se mide también `devil_node`? Propuesto: no, y declarado.
