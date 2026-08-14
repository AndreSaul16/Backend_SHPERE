# Decisión: herramientas en la Junta — lanzamiento v1

**Fecha**: 2026-08-13 · **Alcance**: `backend/app/application/board_v2.py`, `backend/app/application/orchestrator.py`, `backend/app/infrastructure/tools/`, `backend/app/presentation/api/v1/stream.py`, `frontend/src/store/chat/*`.
**Método**: lectura de código con evidencia `fichero:línea`, investigación web con fuentes (frameworks, papers de multi-agent debate, productos comparables y sus modelos de aprobación/precio). Complementa `auditoria-herramientas.md` (misma carpeta).

**Decisión en una línea**: **Opción C, ejecutada por fases** — el día del lanzamiento la Junta es debate puro pero *honesto* (se corrige el prompt que hoy miente); inmediatamente después, herramientas **de solo lectura con allowlist literal y presupuesto duro** en la fase de análisis; las **escrituras nunca entran al debate**: se convierten en action items del acta que el usuario aprueba explícitamente y se ejecutan por el pipeline del chat directo que ya existe.

---

## 1. Contexto verificado en el código

### 1.1 La mentira tiene un mecanismo preciso (verificado)

1. Los prompts de identidad **anuncian herramientas a cada director**: `DEFAULT_CORE_PROMPTS` lista "HERRAMIENTAS EXCLUSIVAS" y "HERRAMIENTAS COMPARTIDAS" para CEO/CTO/CFO/CMO (`orchestrator.py:170-259`).
2. En la Junta se usa **la misma identidad**: `resolve_agent_config` parte de `DEFAULT_CORE_PROMPTS` (`agent_resolver.py:47`) y `agent_node` la inyecta en `AGENT_PROMPT_TEMPLATE` (`orchestrator.py:430-434`).
3. Pero `bind_tools` **se salta cuando `board_mode`** (`orchestrator.py:474-476`), el historial se limpia de tool_calls colgantes con `_strip_tools_from_history` (`orchestrator.py:322-348`, comentario explícito: *«Board meeting: los agentes debaten en secuencia SIN nodo de ejecución de tools»*, y en `orchestrator.py:418`: *«Board meeting: no hay nodo de tools»*).
4. Ni el grafo legacy (`orchestrator.py:969-1035`) ni el V2 (`board_v2.py:584-647`) tienen nodo de tools.

**Resultado**: el modelo cree que tiene `get_stock_data`, `calendar_list_events`, etc., no puede llamarlas, y como su identidad le prohíbe decir "no tengo acceso" (`orchestrator.py:163`), **narra acciones que no ocurren**. No es un bug del LLM: es la consecuencia determinista de anunciar herramientas y quitárselas.

### 1.2 Lo que ya existe y se puede reutilizar (verificado)

| Pieza | Dónde | Estado |
|---|---|---|
| Ciclo ReAct completo en chat directo | `orchestrator.py:606-634` (`expert_agent ⇄ tool_node`), anti-loop `tool_calls_remaining=3` (reset en `router_node`, `orchestrator.py:278`; decremento en `orchestrator.py:507-510`) | **Funciona hoy** |
| Ejecución de tools con contexto multi-tenant + nivel de confirmación | `dynamic_tool_node` (`orchestrator.py:544-583`) vía contextvars (`tool_context.py`) | Funciona |
| Eventos SSE de tools de punta a punta | Backend emite `tool_start/tool_result/tool_error` para *cualquier* grafo (`stream.py:319-344`); `api.ts:206-217` los mapea a `onToolStart/Result/Error`; `streamHandlers.ts:112-125` los pinta como chips | **Existe y está sin usar en la Junta** (nunca llegan porque no hay tools) |
| Atribución de rol por nodo en streams paralelos | `metadata.langgraph_node` → rol (`stream.py:355-359`, hoy solo para tokens) | Reutilizable para atribuir tools a directores |
| Human-in-the-loop asíncrono | Cola `board_interventions` + `POST /stream/intervene` (`stream.py:779-830`), consumida en `consensus_gate`/`rebuttal_join`/`synthesis` (`board_v2.py:133-149, 389, 401, 513`) | Funciona; patrón a imitar para aprobaciones |
| Acta con "Próximos pasos" | `SYNTHESIS_ADDITION` exige sección "Próximos pasos (acciones concretas con responsable)" (`board_v2.py:483-485`) y se persiste en `board_actas` (`board_v2.py:188-204`) | La semilla natural de las acciones diferidas |
| Checkpointer persistente MongoDB | `MongoDBSaver` compartido (`board_v2.py:657-667`) | Prerequisito de `interrupt()` de LangGraph, ya cumplido |

### 1.3 Restricciones técnicas que condicionan la solución (verificado)

- **Paralelismo del V2**: los nodos de análisis/réplica corren en paralelo dentro del mismo superstep y **solo pueden escribir canales con reducer** (`messages`, `board_votes`) — propagar `LastValue` como `tool_calls_remaining` colisiona (`board_v2.py:342-346`). Un ciclo ReAct "plano" con conditional edges por director dentro del grafo padre **no cabe**; la forma correcta es **un subgrafo por director** que resuelva su mini-loop internamente y emita al padre solo el mensaje final limpio.
- **DeepSeek es estricto**: un `AIMessage` con `tool_calls` sin su `ToolMessage` → 400 (`orchestrator.py:325-328`). Los pasos intermedios de tools deben quedar **dentro del subgrafo**, no en el historial compartido de la Junta.
- **El precio de la Junta es fijo de verdad**: 5 créditos por POST (`credit_manager.py:38`, `stream.py:678`), refund parcial a 3 si el triage deja ≤2 directores (`stream.py:273-283`, `credit_manager.py:41`). El recargo por >4k tokens **solo aplica si `counted_as == 1`** (`credit_manager.py:128`), o sea nunca a la Junta. **Añadir tools no puede sorprender al usuario en el precio: come margen de SPHERE**, y por eso el presupuesto interno debe ser duro.
- **Solo 9 de 28 herramientas funcionan de punta a punta** (`auditoria-herramientas.md` §5): las 3 de Jules están rotas (host 404), `get_market_analysis` devuelve `{}`, `whatsapp_read_messages` no tiene arista GET. Conectar "las 28" a la Junta conectaría mayormente humo.
- **La política de confirmación está rota incluso en chat directo**: `DESTRUCTIVE_TOOLS` tiene 9 entradas (`tool_context.py:23-33`) pero solo 5 tools comprueban `requires_confirmation` (`cmo_tools.py:122,151,208`; `oauth_tools.py:153,196`). `shared_tools.py` **ni importa** `requires_confirmation`: `calendar_create_event`, `calendar_delete_event`, `whatsapp_send_message` y `whatsapp_send_notification` ejecutan sin confirmar. Peor: `calendar_update_event`, `github_create_issue`, `github_comment_pr`, `notion_create_page` y `notion_update_page` son escrituras que **ni siquiera están en la denylist**. Conclusión: la clasificación por denylist no es de fiar; para la Junta hay que trabajar con **allowlist explícita**.
- `tool_audit_log` tiene índice y **cero escritores** (`auditoria-herramientas.md` §12): no hay rastro de qué hizo un agente en nombre del usuario.

---

## 2. Lo investigado, con fuentes

### 2.1 Frameworks: cómo se ejecutan tools dentro de estructuras multiagente

- **LangGraph** documenta dos patrones para multiagente: *subagentes como tools* y *agentes como nodos/subgrafos*, con `ToolNode` y loops acotados por `recursion_limit`; el debate de diseño está vivo ([issue langchain#36157](https://github.com/langchain-ai/langchain/issues/36157), [langgraph-supervisor](https://reference.langchain.com/python/langgraph-supervisor)). Para human-in-the-loop, el patrón nativo es `interrupt()` + `Command(resume=...)` sobre un checkpointer persistente (MongoDBSaver vale), con decisiones approve/edit/reject/respond ([docs oficiales](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)). La guía de la comunidad converge en una regla: **interrumpir solo acciones irreversibles de alto impacto**, porque cada interrupt introduce latencia sin límite ([abstractalgorithms](https://www.abstractalgorithms.dev/langgraph-human-in-the-loop)).
- **AutoGen** separa estructuralmente **proponer** de **ejecutar**: `register_for_llm()` (el agente puede sugerir la llamada) vs `register_for_execution()` (otro agente la ejecuta) ([Tool Use](https://microsoft.github.io/autogen/0.2/docs/tutorial/tool-use/), [Conversation Patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/)). Es exactamente la separación que SPHERE necesita: el director propone, la ejecución vive en otro sitio.
- **CrewAI** tiene `human_input` a nivel de tarea, pero la aprobación *antes de ejecutar una tool* es una carencia reconocida por su propia comunidad ([Human verification before tool execution](https://community.crewai.com/t/human-verification-before-tool-execution/4994), [proceso jerárquico](https://docs.crewai.com/en/learn/hierarchical-process)).
- **OpenAI Agents SDK** modela esto como `needsApproval` por tool: el run se pausa, aflora la interrupción, y se reanuda con `state.approve()/reject()` ([docs](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/), [guardrails y approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)). Lección operativa: **no trae timeout** — producción necesita expiración/auto-deny de aprobaciones pendientes ([thehandover](https://thehandover.xyz/blog/openai-agents-sdk-needs-approval)). **Microsoft Agent Framework** tiene el mismo primitivo ([tool approval](https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval)).

### 2.2 Investigación sobre debate multiagente con herramientas

- **Tool-MAD** (arXiv, 2026): debate multiagente para verificación de hechos donde los agentes usan **retrieval/búsqueda** (lectura) entre rondas; mejora hasta un 35,5% sobre frameworks de debate sin tools ([paper](https://www.arxiv.org/pdf/2601.04742)). Es la validación directa de la tesis de la opción C: **evidencia en vivo dentro del debate sube la calidad**.
- **Debate-Augmented RAG** ([arXiv 2505.18581](https://arxiv.org/pdf/2505.18581)) y **PROClaim** (debate tipo tribunal con RAG progresivo, [arXiv 2603.28488](https://arxiv.org/html/2603.28488v1)): mismo patrón — los roles debaten y las tools que entran al debate son de **recuperación de evidencia**.
- El survey de estrategias de debate ([arXiv 2607.26212](https://arxiv.org/pdf/2607.26212)) trata la inyección de conocimiento externo como palanca de grounding; y hay evidencia de que los debates sin grounding son manipulables por persuasión ([Nature Sci Rep, 2026](https://www.nature.com/articles/s41598-026-42705-7)).
- **Lo que NO aparece en la literatura**: agentes ejecutando **escrituras** (enviar mensajes, publicar, borrar) *dentro* de un debate. El corpus entero usa tools de lectura. Nadie manda WhatsApps a mitad de una deliberación, por una razón: el debate es para decidir, no para actuar.

### 2.3 Productos comparables: aprobación de acciones

- **n8n**: paso "human review" insertable entre el agente y cada tool; el workflow se pausa y pide approve/deny por Slack/Telegram/chat ([docs](https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/)).
- **Lindy**: el agente ejecuta hasta la acción sensible, se detiene y pide aprobación por email/panel de tareas ([docs](https://docs.lindy.ai/testing/human-in-the-loop)).
- **Zapier Agents**: aprobación para acciones de alto riesgo. Patrón universal: **proponer → pausar → aprobar → ejecutar**, con el humano fuera del hilo caliente.
- Advertencia de seguridad transversal: *"approval prompts are not authorization"* — la aprobación de UI no sustituye scoping real de credenciales ([blakecrosley.com](https://blakecrosley.com/blog/ai-agent-approval-prompts-not-authorization)). En SPHERE eso ya está mediado por `credential_injector` y OAuth por usuario; hay que mantenerlo.

### 2.4 Precio: la lección de Manus y Devin

- **Manus**: su sistema de créditos es "la mayor fuente de quejas del producto entero" — no dice cuánto costará una tarea antes de lanzarla, no hay tope "para en X créditos", y una tarea puede quemar 900+ créditos ([eesel](https://www.eesel.ai/blog/manus-ai-pricing), [nocode.mba](https://www.nocode.mba/articles/manus-ai-pricing)).
- **Devin**: ACUs opacos, "el coste escala con el uso y un agente desbocado quema presupuesto rápido" ([brainroad](https://brainroad.com/devin-pricing-in-2026-real-cost-hidden-spend-and-alternatives/)).
- **Conclusión para SPHERE**: el precio fijo por debate (5/3, visible en `board_plan` antes de que hablen los directores) es un **diferenciador**, no una limitación. Cualquier diseño que facture por iteración de tool replicaría el patrón más odiado de la categoría. El principio 3 («el coste siempre a la vista») se cumple con **precio fijo conocido a priori + presupuesto interno duro**, no con un taxímetro.

### 2.5 Guía de arquitectura

- Anthropic, *Building Effective Agents*: distinguir **workflows** (rutas predefinidas) de **agentes** (el LLM dirige su propio proceso); usar el patrón más simple que pase la evaluación; "cada turno autónomo extra añade latencia, coste y probabilidad de que un error temprano se propague" ([anthropic.com](https://www.anthropic.com/engineering/building-effective-agents)). La Junta de SPHERE es deliberadamente un **workflow por fases** — su predictibilidad es la feature. Meter un agente ReAct sin acotar dentro de cada fase la destruiría.

---

## 3. Opciones y tradeoffs

### Opción A — `tool_node` en el grafo v2 con ciclo ReAct por director

- **A favor**: máxima capacidad; los directores realmente hacen lo que narran.
- **En contra (decisivo)**:
  - Coste y latencia sin cota práctica: hoy un debate completo son ~8-9 llamadas al modelo reasoning; con ReAct libre (3 iteraciones × 3 directores × 2 rondas) puede triplicarse. Con precio fijo de 5 créditos, el margen lo absorbe SPHERE; con precio variable, se repite el caso Manus (§2.4).
  - Escrituras sin usuario mirando: `calendar_delete_event` y los envíos de WhatsApp **hoy no comprueban confirmación** (§1.3); en un debate de 2-3 minutos el usuario no está leyendo cada burbuja en tiempo real.
  - 19 de 28 tools no están verificadas de punta a punta (`auditoria-herramientas.md`): se conectaría humo con tick verde.
  - Técnicamente exige subgrafos igualmente (§1.3, paralelismo + DeepSeek estricto): "añadir un tool_node" no es un nodo, es una re-arquitectura.
- **Veredicto**: es la versión final deseable *solo para lecturas acotadas*; como se enuncia (ReAct completo, todas las tools), es la peor opción para un lanzamiento en días.

### Opción B — debate puro para siempre; tools solo en chat directo; corregir la promesa

- **A favor**: cero esfuerzo de backend; honesto; el coste queda como está; ningún riesgo de seguridad nuevo.
- **En contra**: renuncia al diferenciador. La literatura (§2.2) dice que el retrieval en debate mejora la calidad de la decisión; el CFO opinando de bolsa sin `get_stock_data` es un tertuliano, no un director. Y la promesa comercial "tu junta con 28 integraciones" quedaría reducida permanentemente a "tu junta habla y tú ejecutas a mano".
- **Veredicto**: correcta como *estado del día 1* (su parte de higiene es obligatoria ya), incorrecta como destino.

### Opción C — lecturas durante el debate; escrituras diferidas al acta con aprobación explícita

- **A favor**: coincide con toda la evidencia — la literatura usa lecturas en debate (§2.2), los productos serios difieren las escrituras a aprobación (§2.3), AutoGen separa proponer/ejecutar (§2.1), y el pipeline de ejecución con confirmación ya existe en el chat directo (§1.2). Mantiene el precio fijo y el workflow predecible.
- **En contra**: no es gratis (subgrafos + allowlist + UI); la frontera lectura/escritura debe ser una **allowlist literal**, porque la denylist actual está incompleta (§1.3); hay que acotar iteraciones para proteger margen y latencia.
- **Veredicto**: **es la opción correcta**, con dos correcciones de ejecución (abajo).

### Opción D considerada y descartada — `interrupt()` mid-debate para aprobar escrituras en caliente

Pausar el grafo con `interrupt()` cuando un director quiera escribir parece elegante (checkpointer MongoDB ya cumple el prerequisito), pero: el debate corre dentro de un POST SSE con `DistributedLock` de TTL 60s (`stream.py:701-704`) — una pausa de minutos/horas rompe lock y stream; la latencia de aprobación es "sin límite" por diseño (§2.1) y el usuario de una junta asíncrona puede no estar mirando; y OpenAI/n8n enseñan que las aprobaciones pendientes necesitan expiración y escalado. Diferir la escritura al acta logra lo mismo sin pausar nada: el debate **termina siempre**, y las acciones quedan propuestas, no colgadas.

---

## 4. Recomendación

**Opción C, ejecutada en tres fases, con B como higiene del día 1.** Formulación de producto: **«La junta delibera con datos reales; tú apruebas; SPHERE ejecuta»**.

Las dos correcciones de ejecución sobre la opción C tal como estaba enunciada:

1. **Lecturas**: no "todas las de lectura", sino una **allowlist literal de tools verificadas** (de la auditoría): `get_stock_data`, `get_financial_news`, `calendar_list_events`, `calendar_check_availability`, `get_social_analytics`, `slack_list_channels`, y las de solo-lectura de GitHub cuando estén etiquetadas. Fuera de la allowlist: Jules (roto), `get_market_analysis` (stub), `whatsapp_read_messages` (roto), y por supuesto toda escritura. Implementación: **subgrafo por director solo en la fase `analysis`** (patrón LangGraph agentes-como-subgrafos, §2.1), máximo **2 iteraciones de tool por director**, `ToolMessage` truncado, y los pasos intermedios confinados al subgrafo (el historial compartido de la Junta recibe solo el mensaje final limpio — resuelve la restricción DeepSeek de §1.3). Réplicas, devil y síntesis quedan puras: son las fases baratas y de juicio, no de investigación.
   - Nota técnica: el presupuesto es **por director**, no global, porque las ramas paralelas del mismo superstep ven el snapshot del estado al inicio del step — un contador global compartido no se puede hacer respetar sin serializar el análisis.
2. **Escrituras**: la síntesis emite los "Próximos pasos" como **action items estructurados** (p. ej. línea `[ACCION] tool=whatsapp_send_notification args={...} responsable=CMO`, mismo patrón de parsing que `[VOTO]` en `board_v2.py:71-96`). Se persisten junto al acta, la UI los pinta como tarjetas con **Aprobar / Editar / Descartar**, y al aprobar se ejecutan por el **pipeline del chat directo existente** (`expert_agent ⇄ tool_node`, con `requires_confirmation` ya reparado). Las propuestas **expiran** (TTL, como `board_interventions`) — lección OpenAI SDK (§2.1). Nada se ejecuta dentro de la junta, nunca, en ninguna fase.

### Por qué esta y no otra

- La evidencia académica (§2.2) respalda lecturas en debate y no registra escrituras en debate.
- Los productos de referencia (§2.3) convergen en proponer→aprobar→ejecutar para efectos secundarios.
- El coste queda fijo y anunciado (principio 3), a diferencia del taxímetro Manus/Devin (§2.4).
- Reutiliza lo que ya funciona: eventos SSE de tools sin usar, cola de intervenciones como precedente de HITL asíncrono, acta con próximos pasos, ReAct del chat directo (§1.2).
- Respeta la arquitectura real del grafo v2 (paralelismo con reducers, DeepSeek estricto, §1.3) en vez de pelearse con ella.

---

## 5. Impacto en créditos

- **Hoy**: debate completo ≈ 1 llamada flash (triage) + 8-9 llamadas reasoning; precio fijo 5 créditos (3 si triage reduce), sin recargo por tokens (`counted_as != 1`, `credit_manager.py:128`). El evento `board_plan` ya lleva `cost` a la UI **antes** de que hablen los directores (`stream.py:283`).
- **Con F1 (lecturas acotadas)**: peor caso +2 llamadas reasoning por director en análisis → de ~9 a ~15 llamadas (+60-70% de cómputo peor caso; típico +2-3 llamadas porque no todos los directores necesitan datos). Los `ToolMessage` de lectura son cortos (truncar a ~1.500 chars) — el grueso del coste extra es re-prompting, no resultados.
- **Cómo se acota sin mentir**:
  1. **El precio al usuario no cambia por iteración**: sigue siendo fijo y anunciado a priori (5/3). El presupuesto interno (2 tool-iteraciones/director, solo análisis, allowlist corta) protege el margen. La telemetría real ya existe (`aadjust_after_completion` guarda `tokens_in/out` y `cost_usd_actual` por transacción) — medir 2 semanas y decidir con datos.
  2. Si el margen no aguanta: **toggle "Junta con datos en vivo" = +2 créditos**, mostrado en el composer y reflejado en `board_plan.cost` (la tubería del coste ya existe). Nunca facturación ex-post ni por iteración: ese es exactamente el patrón que la categoría está pagando en quejas (§2.4).
  3. En la UI del debate, los chips de tool por director ya hacen visible *en qué se gasta* el crédito — coste a la vista también en sentido cualitativo.
- **F2 (acciones aprobadas)**: cada acción aprobada se ejecuta como turno de chat directo → **1 crédito por acción, cobrado al aprobar** con su coste en el botón ("Ejecutar con Vortex · 1 crédito"). Coherente con el modelo actual: 1 POST = 1 crédito.

## 6. Impacto en streaming (SSE)

**Ya existe y está sin usar en la Junta**: `tool_start` / `tool_result` / `tool_error` se emiten para cualquier grafo (`stream.py:319-344`), `api.ts:206-217` ya los mapea a `onToolStart/onToolResult/onToolError` y `streamHandlers.ts:112-125` ya los renderiza. En cuanto un subgrafo ejecute tools, estos eventos fluyen solos.

**Lo que falta**:

1. **Atribución de rol/fase en eventos tool_***: hoy no llevan `role`; con 3 directores en paralelo la UI no sabría en qué burbuja pintar el chip. Solución ya inventada en el propio fichero: derivar el rol de `metadata.langgraph_node` como se hace para tokens (`stream.py:355-359`) y añadir `role` (y `phase`) al payload.
2. **`boardStreamHandlers.ts` no maneja tools** (solo `onBoardStart/Plan/Phase/Vote/Consensus/Intervention/Agent`): añadir los tres handlers para insertar los placeholders `[TOOL_*]` en la burbuja del director activo (el mecanismo de render ya existe en `streamHandlers.ts`).
3. **Nuevos eventos para F2**: `board_actions` (lista de action items propuestos, emitido tras `synthesis` igual que `board_vote` se emite leyendo el output del nodo en `stream.py:285-289`) y, fuera del stream, `POST /board/actions/{id}/approve|dismiss`. La ejecución de una acción aprobada reutiliza el stream normal del chat directo (con sus `tool_start/…` ya soportados).

## 7. Seguridad y modelo de confirmación

1. **Regla de oro**: durante el debate, **capacidad cero de escritura** — no por prompt, sino porque el subgrafo solo bindea la allowlist read-only. Un prompt no es un control de seguridad; el binding sí.
2. **Allowlist, no denylist**: `DESTRUCTIVE_TOOLS` está incompleta y `shared_tools.py` ni comprueba confirmación (§1.3). Para la Junta, allowlist literal. Para el chat directo (y para F2), reparar lo ya auditado: importar `requires_confirmation` en `shared_tools.py` y añadir las escrituras que faltan a la política — idealmente moviendo `requires_confirmation`/`read_only` a metadata del registro (`registry.py`), que hoy es una lista plana sin metadata.
3. **Confirmación de acciones nacidas en la Junta**: el usuario puede no estar mirando → la confirmación no puede ser conversacional in-band (el patrón actual `{"error": "confirmation_required"}`, `stream.py:36-54`). Modelo propuesto: **aprobación explícita post-acta por acción** (tarjeta con preview de args editables), TTL de expiración, y al ejecutar, la acción pasa además por `requires_confirmation` del chat directo si es destructiva — doble puerta para lo irreversible, alineado con "interrumpir solo lo irreversible" (§2.1).
4. **Auditoría**: encender `tool_audit_log` (hoy, índice sin escritores) al menos para toda escritura ejecutada desde una acción aprobada: quién aprobó, cuándo, con qué args, resultado. Con agentes actuando en nombre del usuario ante terceros (WhatsApp, LinkedIn), esto es lo primero que preguntará un cliente serio — y un inversor.
5. **Aprobación ≠ autorización** (§2.3): la ejecución sigue corriendo con las credenciales OAuth scoped del usuario vía `credential_injector`; la tarjeta de aprobación no otorga permisos, solo consiente una llamada concreta.

## 8. Plan por fases con esfuerzo honesto

| Fase | Contenido | Ficheros principales | Esfuerzo |
|---|---|---|---|
| **F0 — Honestidad (lanzamiento, bloqueante)** | En `board_mode`: instrucción explícita de fase "en la junta NO tenés ejecución de herramientas; no afirmes haber consultado datos en vivo ni haber ejecutado acciones; lo que requiera acción, proponelo en Próximos pasos" + strip de las secciones "HERRAMIENTAS" del prompt de identidad cuando `board_mode` (mismo patrón del strip que ya hace `board_agent_node_factory` con la instrucción de síntesis, `orchestrator.py:808-814`). Ajustar copy de marketing/onboarding. | `board_v2.py` (`_board_query`), `orchestrator.py` (`BOARD_SYSTEM_PROMPT_ADDITION`) | **0,5-1 día** |
| **F0b — Acta accionable v0 (lanzamiento)** | Los "Próximos pasos" del acta se pintan con deep-link "Ejecutar con {director} →" que abre el chat directo del responsable (donde las tools SÍ funcionan) con el paso precargado. Cero backend. | `frontend/src` (render del acta) | **0,5-1 día** |
| **F1 — Evidencia en vivo (1-2 semanas post-lanzamiento)** | Subgrafo `research` por director en fase `analysis`: mini-loop agent⇄tools, allowlist read-only literal, máx 2 iteraciones, ToolMessage truncado, solo el mensaje final al historial padre. Eventos `tool_*` con `role`/`phase`. Handlers en `boardStreamHandlers.ts`. Telemetría de coste por debate; decidir 5 fijo vs toggle +2. Tests: paralelismo (reducers), historial limpio post-join, anti-loop. | `board_v2.py`, `stream.py`, `registry.py` (metadata `read_only`), `boardStreamHandlers.ts` | **3-5 días** |
| **F2 — Acciones aprobadas (2-4 semanas post-lanzamiento)** | Formato `[ACCION]` en síntesis + parser (patrón `[VOTO]`), colección `board_actions` con TTL, endpoints approve/dismiss, tarjetas de aprobación con preview editable y coste (1 crédito), ejecución vía pipeline chat directo, `tool_audit_log` encendido. Prerequisito: reparar `requires_confirmation` en `shared_tools.py` y completar la política (ya listado en `auditoria-herramientas.md`). | `board_v2.py`, nuevo `board_actions` API, `shared_tools.py`, `tool_context.py`/`registry.py`, frontend | **5-8 días** |

Para un lanzamiento "en días": **entran F0 y F0b**. F1 detrás de flag solo si sobra tiempo (no forzarlo). F2 es la primera gran iteración post-lanzamiento.

## 9. Qué se le puede prometer a un inversor (sin exagerar)

- **Día del lanzamiento (F0+F0b)**: «Un consejo de agentes que delibera en fases con votos estructurados y acta ejecutiva, donde cada próximo paso se ejecuta con un click con el director responsable — que sí tiene sus herramientas — bajo confirmación del usuario». No prometer que la Junta ejecuta ni "28 integraciones en la junta" (solo 9 funcionan de punta a punta).
- **Con F1 (semanas)**: «Los directores consultan datos reales en vivo durante el debate — mercado, calendario, canales — con coste fijo anunciado antes de empezar». Respaldable con literatura (Tool-MAD) si preguntan por qué mejora la calidad de la decisión.
- **Con F2 (1-2 meses)**: «La junta decide, tú apruebas, SPHERE ejecuta: ninguna acción externa sin aprobación explícita, con registro de auditoría completo». La gobernanza es el pitch, no una disculpa — es exactamente lo que n8n/Lindy/OpenAI venden como capa de producción.
- **Nunca prometer**: ejecución autónoma de escrituras durante el debate (nadie serio lo hace, §2.2-2.3), ni coste variable "según lo que trabajen los agentes" (el anti-patrón Manus, §2.4).

---

## Fuentes

**Código** (todas las rutas bajo `/home/jarvis/code/SPHERE/Frontend_SPHERE/`): `backend/app/application/board_v2.py`, `backend/app/application/orchestrator.py`, `backend/app/application/agent_resolver.py`, `backend/app/application/credit_manager.py`, `backend/app/core/tool_context.py`, `backend/app/infrastructure/tools/{registry,shared_tools,ceo_tools,cfo_tools,cmo_tools,cto_tools,oauth_tools}.py`, `backend/app/presentation/api/v1/stream.py`, `frontend/src/services/api.ts`, `frontend/src/store/chat/{streamHandlers,boardStreamHandlers}.ts`, `openspec/changes/lanzamiento-v1/auditoria-herramientas.md`.

**Web** (consultadas 2026-08-13):
- LangGraph HITL / interrupt: https://docs.langchain.com/oss/python/langchain/human-in-the-loop · https://www.abstractalgorithms.dev/langgraph-human-in-the-loop
- LangGraph multiagente (subagentes vs nodos): https://github.com/langchain-ai/langchain/issues/36157 · https://reference.langchain.com/python/langgraph-supervisor
- AutoGen (proponer vs ejecutar): https://microsoft.github.io/autogen/0.2/docs/tutorial/tool-use/ · https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/
- CrewAI: https://docs.crewai.com/en/learn/hierarchical-process · https://community.crewai.com/t/human-verification-before-tool-execution/4994
- OpenAI Agents SDK needsApproval: https://openai.github.io/openai-agents-js/guides/human-in-the-loop/ · https://developers.openai.com/api/docs/guides/agents/guardrails-approvals · https://thehandover.xyz/blog/openai-agents-sdk-needs-approval
- Microsoft Agent Framework tool approval: https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval
- Investigación debate+tools: Tool-MAD https://www.arxiv.org/pdf/2601.04742 · Debate-Augmented RAG https://arxiv.org/pdf/2505.18581 · PROClaim https://arxiv.org/html/2603.28488v1 · Survey MAD https://arxiv.org/pdf/2607.26212 · Persuasión adversarial en MAD https://www.nature.com/articles/s41598-026-42705-7
- Productos con aprobación: n8n https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/ · Lindy https://docs.lindy.ai/testing/human-in-the-loop
- Precio/transparencia: Manus https://www.eesel.ai/blog/manus-ai-pricing · https://www.nocode.mba/articles/manus-ai-pricing · Devin https://brainroad.com/devin-pricing-in-2026-real-cost-hidden-spend-and-alternatives/
- Arquitectura: Anthropic, Building Effective Agents https://www.anthropic.com/engineering/building-effective-agents · Aprobación ≠ autorización https://blakecrosley.com/blog/ai-agent-approval-prompts-not-authorization
