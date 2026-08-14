# Auditoría de herramientas de agente — lanzamiento v1

**Fecha**: 2026-08-13 · **Rama**: `feat/grant-huerfano` · **Alcance**: `backend/app/infrastructure/tools/`, workflows n8n, rutas API, UI de ajustes y `TOOL_LABELS`.
**Método**: lectura de código con evidencia `fichero:línea`, enumeración empírica del registry, inspección de los 18 JSON de workflows y sondas HTTP/DNS reales contra los endpoints externos.

---

## Resumen ejecutivo

1. Hay **28 herramientas registradas**, no 15: 12 compartidas + CEO 3, CTO 6, CFO 3, CMO 4 (enumeración empírica del registry).
2. **Funcionan de verdad (código + endpoint válido + credencial obtenible): 9** — `get_stock_data`, `post_to_linkedin`, `post_to_instagram`, `schedule_post`, los 3 de GitHub y 2 de Slack.
3. **Rotas o stub verificados: 5** — las 3 de Jules (host 404), `get_market_analysis` (Alpha Vantage `SECTOR` devuelve `{}`) y `whatsapp_read_messages` (arista GET inexistente + filtros descartados).
4. Las **14 restantes** son plausibles pero no verificables sin n8n vivo y credenciales reales; varias descartan parámetros del esquema.
5. **Bloqueante nº 1: en modo Junta no se ejecuta NINGUNA herramienta.** Ni el grafo v1 ni el v2 tienen `tool_node` y `bind_tools` se salta con `board_mode`. El agente narra acciones que no ocurren.
6. **Bloqueante nº 2 (seguridad): fuga multi-tenant.** `list_active_tasks` y `check_task_status` consultan `agent_tasks` sin filtro de usuario: el CEO de A lee las tareas de B.
7. **Bloqueante nº 3 (confianza): la UI pinta ✅ verde cuando la herramienta falla.** `_tool_error_message` sólo detecta `{"error": true}`, pero todos los errores de credenciales son strings.
8. **La más peligrosa: `calendar_delete_event`.** Está en `DESTRUCTIVE_TOOLS` pero `shared_tools.py` ni importa `requires_confirmation`: borra eventos sin confirmación, sin whitelist, sin auditoría y mostrando un tick verde. Lo mismo aplica a `calendar_create_event` y las dos de envío de WhatsApp.
9. **Integraciones OAuth completas: 4 de 8** (GitHub, Notion, Slack, Google Calendar). WhatsApp, LinkedIn, Instagram y Jules no tienen OAuth: son API keys pegadas a mano.
10. **7 herramientas no tienen etiqueta** en `TOOL_LABELS` (todas las OAuth): el usuario ve `slack_post_message` crudo en la card.
11. **17 de 28 no tienen ningún test.** Los que existen son honestos (los de troceado Notion y firma HMAC son reales), pero cero cobertura de CEO, Jules, Instagram y la mitad del calendario.
12. **`tool_audit_log` tiene índice y cero escritores**: no hay rastro de qué hizo cada agente en nombre del usuario.

---

## 0. Resumen de conteo

| Métrica | Valor | Evidencia |
|---|---|---|
| Herramientas registradas (distintas) | **28** | enumeración empírica de `SHARED_TOOLS` + `ROLE_TOOLS` tras `load_all_tools()` |
| Compartidas (todos los roles) | 12 | `registry.py:8`, `shared_tools.py:363-433`, `oauth_tools.py:283-317` |
| CEO / CTO / CFO / CMO | 3 / 6 / 3 / 4 | `ceo_tools.py:132-151`, `cto_tools.py:120-148` + `oauth_tools.py:253-281`, `cfo_tools.py:99-118`, `cmo_tools.py:243-281` |
| Visibles por rol | CEO 15 · CTO 18 · CFO 15 · CMO 16 | `registry.py:31-39` (`SHARED_TOOLS + role_specific`) |
| Etiquetas en `TOOL_LABELS` | 21 | `ToolExecutionCard.tsx:14-41` |
| Herramientas **sin** etiqueta | **7** | las 7 OAuth (GitHub×3, Slack×2, Notion×2) |
| Workflows n8n en repo | 18 | `backend/infrastructure/n8n-workflows/` |
| Herramientas que dependen de n8n | 18 de 28 | resto: 3 CEO (Mongo directo) + 7 OAuth (HTTP directo) |

**Contra la promesa de «+15»**: hay 28 registradas, así que el número *nominal* sobra. Pero sólo **9 de 28** están en condiciones de funcionar de punta a punta en el lanzamiento (ver §5). Y **ninguna de las 28 se puede invocar en una junta/debate** (§1).

---

## 1. Hallazgo bloqueante: en modo Junta (debate) NINGUNA herramienta se ejecuta

Esto contesta la columna «¿Invocable en un debate real?» de golpe para las 28.

- `orchestrator.py:474-476` — `tools = get_tools_for_role(...)` y luego `if tools and not state.get("board_mode"): llm = llm.bind_tools(tools)`. En junta **no se bindean**: el LLM ni siquiera ve los esquemas.
- `orchestrator.py:418-419` — comentario del propio código: *«Board meeting: no hay nodo de tools, así que limpiamos tool_calls colgantes»*, y `_strip_tools_from_history(history)`.
- Grafo de junta v1 `orchestrator.py:969-1035`: nodos `classifier, ceo_board, cto_board, cfo_board, cmo_board, next_iteration_node, conclusion`. **No hay `tool_node`.**
- Grafo de junta v2 `board_v2.py:584-647`: nodos `triage, ceo_open, *_analysis, consensus_gate, *_rebuttal, rebuttal_join, devil, synthesis`. **No hay `tool_node`**; `grep -n "tools\|bind_tools\|ToolNode" board_v2.py` → 0 resultados.
- `board_classifier_node` sigue seteando `"tool_calls_remaining": 3` (`orchestrator.py:757`) — vestigio muerto.

**Consecuencia de producto**: la Junta Directiva es 100 % conversación. Un usuario que pida en junta «publica esto en LinkedIn» o «agenda la reunión» recibirá texto que *dice* haberlo hecho, sin ninguna llamada real. Las herramientas sólo existen en el chat 1-a-1 (`workflow` de `orchestrator.py:607-634`, con `tool_node` y `tool_calls_remaining` por defecto 3).

---

## 2. Tabla por herramienta

Leyenda **Real/Stub**: `Real` = código propio completo y endpoint externo válido · `Real-frágil` = código completo pero con parámetros que se descartan o dependencia sin verificar · `Roto` = el endpoint externo no existe o devuelve vacío · `Stub` = devuelve texto fijo sin llamar a nada.

### 2.1 Compartidas — Google Calendar (5)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `calendar_list_events` | `shared_tools.py:119` / reg. `:363` · wf `google-calendar-list.json` | Real (Google Calendar API v3) | **No** (§1). Sí en 1-a-1 | OAuth Google (`credentials.py:562-569`); pre-check `credential_injector.py:56-57`; + `N8N_BASE_URL`/`N8N_WEBHOOK_SECRET`/`N8N_API_KEY` | Sólo el string del pre-check (`test_credential_injection.py:93-95`). **Ninguno de comportamiento** | Sí (`ToolExecutionCard.tsx:16`) | Plausible OK, no verificado E2E |
| `calendar_create_event` | `shared_tools.py:135` / `:372` | Real; valida asistentes contra whitelist (`:144-153`) | No (§1) | Igual | Whitelist indirecta (`test_contacts.py:70-83`). Ninguno de la tool | Sí (`:17`) | ⚠️ Marcada destructiva pero **sin confirmación** (§4) |
| `calendar_update_event` | `shared_tools.py:174` / `:381` | Real | No (§1) | Igual | **Ninguno** | Sí (`:18`) | ⚠️ Sin whitelist ni confirmación. **No aparece en los prompts** de ningún agente |
| `calendar_delete_event` | `shared_tools.py:200` / `:390` | Real (DELETE a Google) | No (§1) | Igual | **Ninguno** | Sí (`:19`) | 🔴 **La más peligrosa** (§4). Borra sin confirmación ni whitelist |
| `calendar_check_availability` | `shared_tools.py:212` / `:399` | Real | No (§1) | Igual | **Ninguno** | Sí (`:20`) | Plausible OK |

### 2.2 Compartidas — WhatsApp (3)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `whatsapp_send_message` | `shared_tools.py:277` / `:408` · wf `whatsapp-send.json` | Real-frágil: POST Graph v18 OK, pero pasa `to` **verbatim** al campo `to` de Meta (wf `jsonBody`), y el esquema admite «Nombre del contacto» (`:232`). No hay resolución nombre→teléfono en ningún sitio | No (§1) | `whatsapp` service-credential: `access_token` + `phone_number_id` (`auth.py:~317`, `credential_injector.py:37`); validación `shared_tools.py:257-274` | Validador sí (`test_credential_injection.py:53-64`); whitelist sí (`test_contacts.py:70-83`). **Envío real: ninguno** | Sí (`:21`) | ⚠️ Marcada destructiva **sin confirmación**; falla si el LLM pasa un nombre |
| `whatsapp_send_notification` | `shared_tools.py:305` / `:417` | Real-frágil (mismo POST a `/messages` con el nombre de grupo en `to`) | No (§1) | Igual | **Ninguno** | Sí (`:22`) | ⚠️ Destructiva sin confirmación. «Grupo» no existe como destinatario en Cloud API |
| `whatsapp_read_messages` | `shared_tools.py:337` / `:426` · wf `whatsapp-read.json` | 🔴 **Roto**: `GET https://graph.facebook.com/v18.0/{phone_number_id}/messages`. Esa arista es POST-para-enviar; los entrantes llegan por webhook. Además `from_contact` y `since` se extraen y **nunca se envían** (sólo `limit`) | No (§1) | Igual | **Ninguno** | Sí (`:23`) | 🔴 Retirar o reimplementar. Endpoint no verificable sin token real, pero el descarte de filtros sí está verificado |

### 2.3 Compartidas — OAuth Slack / Notion (4)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `slack_post_message` | `oauth_tools.py:195` / reg. `:283` · cliente `clients/slack_client.py:8` | Real (`chat.postMessage`, chequea `ok`) | No (§1) | Token OAuth Slack (`credentials.py:75-98`); app BYO `integrations.py:281` | `test_oauth_tools.py:102-105` (confirmación) — **mock** | 🔴 **NO** | Funcional, pero card sin etiqueta → el usuario ve `slack_post_message` crudo |
| `slack_list_channels` | `oauth_tools.py:211` / `:292` | Real (`conversations.list`) | No (§1) | Igual | `test_oauth_tools.py:74-77` — mock | 🔴 **NO** | OK salvo etiqueta |
| `notion_create_page` | `oauth_tools.py:227` / `:301` · cliente `clients/notion_client.py:52` | Real, con troceado a 2000 chars (`:13-49`) | No (§1) | Token OAuth Notion | `test_oauth_tools.py:108-117` (error) + `test_notion_chunking.py` (5 tests **reales** del troceado, sin red) | 🔴 **NO** | OK salvo etiqueta. **Sin confirmación** pese a escribir en el workspace |
| `notion_update_page` | `oauth_tools.py:238` / `:310` · cliente `:104` | Real, pero **no trocea**: manda `content` entero en un bloque → Notion rechaza >2000 chars | No (§1) | Igual | Sólo registro (`test_oauth_tools.py:45-55`) | 🔴 **NO** | ⚠️ Bug: aplica el troceado sólo en `create_page` |

### 2.4 CEO (3)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `delegate_task` | `ceo_tools.py:43` / reg. `:132` | **Escritura sin consumidor**: inserta en `agent_tasks` (`:64`) y devuelve `"Tarea asignada exitosamente"` (`:73`). `grep -rn agent_tasks` → sólo `ceo_tools.py`, el índice de `main.py:226` y el script de backfill. **Nadie ejecuta la tarea**: `status` queda `pending` y `result` `None` para siempre | No (§1) | Ninguna (Mongo) | **Ninguno** | Sí (`:25`) | 🔴 Promete un resultado que el sistema nunca cumple |
| `check_task_status` | `ceo_tools.py:77` / `:139` | Real (lee Mongo) | No (§1) | Ninguna | **Ninguno** | Sí (`:26`) | 🔴 **Fuga multi-tenant** (§4) |
| `list_active_tasks` | `ceo_tools.py:108` / `:146` | Real (lee Mongo) | No (§1) | Ninguna | **Ninguno** | Sí (`:27`) | 🔴 **Fuga multi-tenant** (§4) |

### 2.5 CTO — Jules (3)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `create_jules_task` | `cto_tools.py:56` / reg. `:120` · wf `jules-create.json` | 🔴 **Roto — verificado**: apunta a `https://api.jules.google/v1/tasks`. Sonda real: `POST` → **HTTP 404 `text/html`**. DNS: `api.jules.google → www3.l.google.com` (frontal web de Google). La API real es `jules.googleapis.com` → `GET /v1alpha/sessions` = **401 JSON** (existe, pide auth) | No (§1) | `jules.api_key` (`auth.py:~330`, `credential_injector.py:41`) | **Ninguno** | Sí (`:38`) | 🔴 Nunca ha funcionado ni puede funcionar |
| `check_jules_status` | `cto_tools.py:84` / `:130` · wf `jules-status.json` | 🔴 Roto (mismo host) | No (§1) | Igual | **Ninguno** | Sí (`:39`) | 🔴 |
| `review_jules_output` | `cto_tools.py:100` / `:140` · wf `jules-review.json` | 🔴 Roto (mismo host) | No (§1) | Igual | **Ninguno** | Sí (`:40`) | 🔴 |

Agrava: el «test de conexión» de Jules devuelve `success: true` sin llamar a nada (`auth.py:~578-590`, *«Jules no ofrece verificación previa»*). El usuario ve verde y la herramienta no existe.

### 2.6 CTO — GitHub (3)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `github_create_repo` | `oauth_tools.py:150` / reg. `:253` · cliente `clients/github_client.py:11` | Real | No (§1) | Token OAuth GitHub (scopes `repo,read:user`, `providers/github.py:5`) | `test_oauth_tools.py:82-99` — **mock** del cliente, pero cubre bien el gate de confirmación | 🔴 **NO** | ✅ El **único** camino con confirmación *y* test. Falta etiqueta |
| `github_create_issue` | `oauth_tools.py:168` / `:263` | Real | No (§1) | Igual | `test_oauth_tools.py:67-71` — mock del token | 🔴 **NO** | ⚠️ Escribe en repos ajenos **sin confirmación** (no está en `DESTRUCTIVE_TOOLS`) |
| `github_comment_pr` | `oauth_tools.py:179` / `:273` | Real | No (§1) | Igual | Sólo registro (`:37-42`) | 🔴 **NO** | ⚠️ Comenta públicamente sin confirmación |

### 2.7 CFO (3)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `get_financial_news` | `cfo_tools.py:44` / reg. `:99` · wf `financial-news.json` | Real-frágil: Alpha Vantage `NEWS_SENTIMENT`. El `topic` libre («AI stocks») viaja al parámetro `topics`, que AV documenta como enum cerrado. `date_range` se **descarta** en `Extract Credentials` | No (§1) | `financial_api.api_key` (Alpha Vantage) | **Ninguno** | Sí (`:29`) | ⚠️ Devolverá vacío/erróneo con temas libres. No verificable aquí sin key real |
| `get_stock_data` | `cfo_tools.py:61` / `:106` · wf `stock-data.json` | Real — **verificado**: `GLOBAL_QUOTE&symbol=IBM&apikey=demo` devuelve precio real. `period` (`1d/5d/1mo/3mo`) se **descarta**: GLOBAL_QUOTE es sólo snapshot | No (§1) | Igual | `test_credential_injection.py:103-114` — real (verifica que no toca n8n sin credencial) | Sí (`:30`) | ✅ La más sana del CFO; quitar `period` del esquema |
| `get_market_analysis` | `cfo_tools.py:78` / `:113` · wf `market-analysis.json` | 🔴 **Roto — verificado**: usa `function=SECTOR`, retirado por Alpha Vantage. Sonda real: devuelve **`{}`**. Además `sector` y `metrics` **nunca** llegan a la petición (sólo `function`+`apikey`) | No (§1) | Igual | **Ninguno** | Sí (`:31`) | 🔴 Siempre devolverá `{}` |

### 2.8 CMO (4)

| Herramienta | Fichero:línea | ¿Real o stub? | ¿Invocable en debate? | Credenciales | Test | Etiqueta UI | Veredicto |
|---|---|---|---|---|---|---|---|
| `post_to_linkedin` | `cmo_tools.py:117` / reg. `:243` · wf `linkedin-post.json` | Real (`ugcPosts`), pero exige `li_person_urn` que **sólo** se deriva pulsando «Probar conexión» (`auth.py:~520-545`) | No (§1) | `linkedin.access_token` + `li_person_urn` (`credential_injector.py:38`) | `test_credential_injection.py:81-90` — real (pre-check) | Sí (`:33`) | ✅ Con confirmación (`:122`). Setup en 2 pasos poco descubrible |
| `post_to_instagram` | `cmo_tools.py:145` / `:253` · wf `instagram-post.json` | Real (Graph: create media → publish) | No (§1) | `instagram.access_token` + `instagram_account_id` | **Ninguno** | Sí (`:34`) | ✅ Con confirmación (`:151`) |
| `get_social_analytics` | `cmo_tools.py:174` / `:263` · wf `social-analytics.json` | **Parcial/Stub para LinkedIn**: sólo llama a Instagram Insights. Para LinkedIn el nodo `Format Analytics` inyecta una nota fija *«Analytics de LinkedIn aun no disponibles»* | No (§1) | Igual | **Ninguno** | Sí (`:35`) | ⚠️ Honesto en el texto, pero la etiqueta y el prompt prometen «métricas de redes sociales» |
| `schedule_post` | `cmo_tools.py:201` / `:273` · wf `schedule-post.json` | Real y el más completo: `Wait` + rama LinkedIn/Instagram + callback firmado al backend (`webhooks.py:498-499`) | No (§1) | Igual | Firma del callback: `test_webhook_n8n.py` (7 tests **reales**, sin mocks) | Sí (`:36`) | ✅ Con confirmación (`:208`) |

---

## 3. Desajustes de `TOOL_LABELS` (ambos sentidos)

- **Etiquetas sin herramienta**: ninguna. Las 21 entradas de `ToolExecutionCard.tsx:14-41` corresponden a herramientas registradas.
- **Herramientas sin etiqueta (7)**: `github_create_repo`, `github_create_issue`, `github_comment_pr`, `slack_post_message`, `slack_list_channels`, `notion_create_page`, `notion_update_page`. Fallback `TOOL_LABELS[toolName] || toolName` (`:50`) → el usuario ve el identificador crudo en la card y en el texto del botón «Reintentar» (`:60`).
- **Prompts vs registry**: los prompts de rol (`orchestrator.py:150-340`) sólo listan 19 herramientas. Faltan `calendar_update_event`, `calendar_delete_event` y las 7 OAuth. Están bindeadas (el LLM ve el esquema) pero el agente nunca las anuncia.
- **UI muerta**: `ServiceCredentialsSettings.tsx:41,50,291-312` sigue teniendo icono, color y campo «Calendar ID» para `google_calendar`, pero `SERVICE_DEFINITIONS` ya no lo incluye (`auth.py:303-304`) → ese bloque nunca se renderiza.
- **Campo muerto**: `default_tools` de los agentes personalizados (`agents.py:48,133,238`, `agent.py:37`) **nunca se lee**; `get_tools_for_role` ignora la lista.

---

## 4. Herramientas que pueden hacer daño sin confirmación

`DESTRUCTIVE_TOOLS` (`tool_context.py:23-32`) lista 9. Pero **sólo 5 comprueban `requires_confirmation()`** — `grep -rn requires_confirmation app/` devuelve sólo `cmo_tools.py:122,151,208` y `oauth_tools.py:153,196`. `shared_tools.py` **ni siquiera importa** `requires_confirmation` (su import es `tool_context.py` → sólo `get_current_user_id`, línea 24).

| Herramienta | En `DESTRUCTIVE_TOOLS` | ¿Pregunta? | Salvaguarda real | Riesgo |
|---|---|---|---|---|
| `calendar_delete_event` | Sí (`:28`) | **NO** | **Ninguna** — ni whitelist ni confirmación | 🔴🔴 **La más peligrosa del sistema.** Basta un `event_id` alucinado o inyectado en un documento RAG para borrar una reunión. El usuario ve ✅ verde (§4.1) |
| `calendar_create_event` | Sí (`:27`) | **NO** | Whitelist de asistentes | 🔴 Crea eventos e invita sin preguntar |
| `whatsapp_send_message` | Sí (`:25`) | **NO** | Whitelist (falla cerrado) | 🔴 Envía a terceros; la whitelist es la única barrera |
| `whatsapp_send_notification` | Sí (`:26`) | **NO** | Whitelist | 🔴 Igual |
| `calendar_update_event` | No | No | Ninguna | 🟠 Modifica eventos silenciosamente |
| `github_create_issue` / `github_comment_pr` | No | No | Ninguna | 🟠 Escribe públicamente en repos del usuario |
| `notion_create_page` / `notion_update_page` | No | No | Ninguna | 🟠 Escribe en el workspace |
| `post_to_linkedin`, `post_to_instagram`, `schedule_post`, `github_create_repo`, `slack_post_message` | Sí | **Sí** | Confirmación + `confirmed=True` | ✅ Correcto |

**Además**: `get_tools_for_role` devuelve `SHARED_TOOLS` para *cualquier* rol (`registry.py:38-39`), contradiciendo su propio docstring (`:36` — *«Retorna lista vacía para roles sin tools (custom agents, etc.)»*). Verificado empíricamente: un agente personalizado hereda las 12 compartidas, incluidas `whatsapp_send_message`, `slack_post_message` y `calendar_delete_event`.

**Sin rastro de auditoría**: `tool_audit_log` tiene getter (`database.py:264`) e índice (`main.py:256-259`) pero **cero escritores**. No hay registro de qué herramienta se ejecutó, con qué argumentos ni para qué usuario.

### 4.1 El usuario ve ✅ verde cuando la herramienta falla

`stream.py:36-54` (`_tool_error_message`) sólo trata como error `{"error": true}`. Pero **todos** los errores de credenciales/permisos son strings:
- `credential_injector.py:67` → `{"error": "linkedin_not_configured"}`
- `oauth_tools.py:44` → `{"error": "github_not_connected"}`
- `oauth_tools.py:74` → `{"error": "notion_api_error"}`
- `shared_tools.py:33` → `{"error": "contact_not_authorized"}`
- `shared_tools.py:263` → `{"error": "whatsapp_not_configured"}`

`parsed.get("error") is True` → `False` → se emite `tool_result` (`stream.py:337-338`) → `ToolExecutionCard` pinta `CheckCircle2` verde (`ToolExecutionCard.tsx:84`). **El usuario ve «✅ Publicando en LinkedIn» cuando no se ha publicado nada.** Sólo los fallos de transporte de n8n (`n8n_client.py:122-131`, único sitio con `"error": True`) se pintan en rojo.

### 4.2 Fuga multi-tenant en las tareas del CEO

- `_check_task_status` (`ceo_tools.py:83-92`): `query = {}`, sólo añade `task_id` y/o `assigned_to`. **Sin filtro de usuario.**
- `_list_active_tasks` (`ceo_tools.py:110-112`): `find({"status": {"$in": ["pending","in_progress"]}})`. **Global, sin filtro de usuario.**
- `_delegate_task` (`ceo_tools.py:52-62`) **nunca escribe** `owner_user_id` ni `user_id`… pero `main.py:231-233` crea un índice sobre `owner_user_id` y `scripts/backfill_user_id.py:28` incluye `agent_tasks`: la intención de aislar existía y no se implementó.
- `tests/test_tenant_isolation.py` cubre sesiones y agentes; **no cubre `agent_tasks`**.

→ El CEO del usuario A puede listar y leer, con descripción completa, las tareas delegadas por el usuario B.

### 4.3 Whitelist de contactos: normalización asimétrica

`add_contact` guarda el valor normalizado (`contacts_service.py:106,112`) y el `display_name` **crudo** (`:113`). `is_authorized` sólo hace `.lower().strip()` (`:58`) y compara contra ambos (`:63-70`).
- Teléfono con espacios (`+34 612 345 678`) → no casa con el guardado `+34612345678` → bloqueo falso.
- `display_name` «Ruben» → busca `"ruben"` contra el guardado `"Ruben"` → no casa.
- `validate_contact` se ejecuta **antes** de normalizar (`:103` vs `:106`), así que un teléfono sin `+` se rechaza aunque `normalize_contact` sabría arreglarlo.

Falla cerrado (seguro), pero hace la única salvaguarda de WhatsApp poco fiable en la práctica.

---

## 5. Estado por integración (flujo OAuth de punta a punta)

| Integración | Backend | UI | Flujo OAuth | Refresh | Herramientas | Estado |
|---|---|---|---|---|---|---|
| **GitHub** | `providers/github.py` (scopes `repo,read:user`), `integrations.py:102-329` | `IntegrationsSettings.tsx:40-46` | ✅ Completo: registrar app BYO → `/connect` → `/callback` → token cifrado | Tokens de OAuth App no expiran (`credentials.py:217-219`) | 3 (+ export de actas `exports.py:124`) | ✅ **Completo**. Falta etiqueta UI y confirmación en issue/comment |
| **Notion** | `providers/notion.py` | `IntegrationsSettings.tsx:47-53` | ✅ Completo | ✅ `credentials.py:238-258` | 2 (+ export `exports.py:40`) | ✅ **Completo**. `notion_update_page` no trocea >2000 chars |
| **Slack** | `providers/slack.py` (`chat:write,channels:read`) | `IntegrationsSettings.tsx:54-60` | ✅ Completo | ✅ `credentials.py:260-282` | 2 | ✅ **Completo**. Sin etiqueta UI |
| **Google Calendar** | `providers/google.py` (scope `.../auth/calendar`) + app compartida por env (`integrations.py:37-49`) | `IntegrationsSettings.tsx:61-68` | ✅ Completo (BYO o `GOOGLE_OAUTH_CLIENT_ID/SECRET`) | ✅ `credentials.py:284+` | 5 | ✅ **Completo** en OAuth. ⚠️ Requiere además n8n vivo. UI muerta residual en `ServiceCredentialsSettings.tsx:291-312` |
| **WhatsApp** | Sin OAuth: API key manual (`auth.py:~317`) | `ServiceCredentialsSettings.tsx:268-289` | ❌ **No hay OAuth**. El usuario debe crear una WhatsApp Business App y pegar `access_token` + `phone_number_id` | N/A (token de larga duración manual) | 3 (1 rota) | ⚠️ **Manual**. Test de credencial sí valida contra Graph (`auth.py:~552-570`) |
| **LinkedIn** | Sin OAuth: token manual | `ServiceCredentialsSettings.tsx` (`SERVICE_DEFINITIONS`, `auth.py:305-315`) | ❌ **No hay OAuth**. Token pegado a mano + «Probar conexión» obligatorio para derivar `li_person_urn` | N/A | 2 (post + schedule) + analytics stub | ⚠️ **Manual y en 2 pasos**. Analytics no soportado |
| **Instagram** | Sin OAuth: token manual + `instagram_account_id` | `ServiceCredentialsSettings.tsx:314-335` | ❌ **No hay OAuth** | N/A | 3 | ⚠️ **Manual**. Test valida contra la misma API que publica (`auth.py:~595-620`) — bien hecho |
| **Jules** | Sin OAuth: `api_key` manual | `ServiceCredentialsSettings.tsx` | ❌ No hay OAuth | N/A | 3, **todas rotas** | 🔴 **Backend apunta a un host inexistente** (§2.5). El «test» devuelve verde sin verificar nada |
| **n8n** | `n8n_deployer.py:182-312` despliega los 18 workflows en el arranque; `n8n_client.py` firma HMAC + retry + circuit breaker | Sin UI (infra) | N/A | N/A | 18 de 28 dependen de él | ⚠️ Los 18 `path` de los JSON casan **exactamente** con los que llaman las tools (verificado). Si falta `N8N_API_KEY` el deploy se salta (`n8n_deployer.py:202-213`) → las 18 devuelven `error:true` genérico |

**Resumen OAuth**: 4 de 4 providers OAuth (GitHub, Notion, Slack, Google) están completos de punta a punta — UI, backend, callback, cifrado Fernet y refresh. Las otras 4 integraciones (WhatsApp, LinkedIn, Instagram, Jules) **no tienen OAuth en absoluto**: son API keys pegadas a mano.

---

## 6. Estado de los tests

- **Suite completa: NO reproducible en esta sesión.** Tres ejecuciones concurrentes de `pytest tests/` (PIDs 2306, 2758, 9978, lanzadas por agentes paralelos) comparten `DB_NAME=sphere_test` y `REDIS_URL=redis://localhost:6379/0`. Tras 20 min de reloj acumulaban ~16 s de CPU cada una → bloqueadas en IO, no trabajando. Durante la auditoría **MongoDB dejó de escuchar en el 27017** (`ss -tlnp` sólo muestra 6379; `pymongo ping` → `ServerSelectionTimeoutError` con 20 s de timeout). No lo he reiniciado para no romper los runs de los otros agentes. Mi run completo murió al 42 % con exit 144 y una cascada de `E` (errores de setup por Mongo caído), no de `F`. **La línea base «338 passed, 0 failed» no se ha podido verificar, y tampoco se ha desmentido: no hay ni un solo fallo de aserción, sólo errores de infraestructura.**
- **Subset aislado ejecutado** (`DB_NAME=sphere_test_toolsaudit`, `redis/3`) sobre los 7 ficheros relevantes a herramientas: **51 passed, 7 errors en 214 s**. Los 7 errores son todos `pymongo.errors.ServerSelectionTimeoutError` (los únicos tests que tocan Mongo: `test_contacts.py::test_add_and_list_contacts`, `::test_is_authorized_check` y los 5 de `test_oauth_apps.py`) — fallo de entorno por la caída de Mongo, no del código. Los 51 tests sin dependencia de DB pasan todos.

### 6.1 Calidad de los tests que tocan herramientas

| Fichero | Tests | Naturaleza |
|---|---|---|
| `test_oauth_tools.py` | 9 | Registro (real, verifica el registry) + gating y confirmación con `monkeypatch` de `credentials_service.get_token` y de los clientes → **mock**, pero prueban la lógica correcta (no son tests que no puedan fallar) |
| `test_credential_injection.py` | 12 | **Reales**: contrato del injector y pre-checks sin red. `test_cfo_sin_credencial_no_llama_a_n8n` (`:103`) es un buen test de comportamiento |
| `test_notion_chunking.py` | 5 | **Reales**, puros, sin red — prueban el troceado de verdad |
| `test_webhook_n8n.py` | 7 | **Reales**: firma HMAC canónica, incluye caso de secreto vacío |
| `test_contacts.py` | 12 | Normalización/validación reales; whitelist contra Mongo real |

**Cobertura por herramienta**: **17 de 28 no tienen ningún test**. Sin cobertura alguna: las 3 del CEO, las 3 de Jules, `get_financial_news`, `get_market_analysis`, `post_to_instagram`, `get_social_analytics`, `calendar_update_event`, `calendar_delete_event`, `calendar_check_availability`, `calendar_list_events` (sólo el string del pre-check), `whatsapp_send_notification`, `whatsapp_read_messages`, `notion_update_page`, `github_comment_pr`.

**No verificable aquí**: la ejecución real de los 18 workflows n8n (haría falta una instancia n8n con `N8N_API_KEY` y credenciales reales de Google/Meta/LinkedIn/Alpha Vantage), y la validez del enum `topics` de Alpha Vantage (requiere API key de pago).

---

## 7. Lista de arreglos, por prioridad

**Bloqueantes para lanzar**
1. Filtrar por `user_id` en `_check_task_status` y `_list_active_tasks`, y escribir `owner_user_id` en `_delegate_task` (`ceo_tools.py:52-112`). Añadir test en `test_tenant_isolation.py`.
2. Poner el gate `requires_confirmation` en `calendar_delete_event`, `calendar_create_event`, `whatsapp_send_message`, `whatsapp_send_notification` (`shared_tools.py`) — hoy están en `DESTRUCTIVE_TOOLS` y no hacen nada.
3. Arreglar `_tool_error_message` (`stream.py:36-54`) para tratar `error` string como fallo. Hoy la UI miente en verde.
4. Decidir sobre Jules: 3 herramientas apuntan a un host que devuelve 404 HTML. O se migra a `jules.googleapis.com` o se retiran (tool + credencial + card de UI + `TOOL_LABELS`).
5. Retirar o reimplementar `get_market_analysis` (Alpha Vantage `SECTOR` devuelve `{}`) y `whatsapp_read_messages` (arista GET inexistente).

**Alta**
6. Añadir las 7 etiquetas OAuth a `TOOL_LABELS` (`ToolExecutionCard.tsx:14-41`).
7. Decidir si la Junta debe ejecutar herramientas. Si sí, es trabajo de arquitectura (añadir `tool_node` a ambos grafos). Si no, hay que decirlo en el producto: hoy el agente en junta *narra* acciones que no ocurren.
8. Corregir `is_authorized` para usar `normalize_contact` y comparar `display_name` sin distinguir mayúsculas (`contacts_service.py:42-75`).
9. Aplicar el troceado de `_content_to_blocks` también en `notion_client.update_page` (`clients/notion_client.py:104`).

**Media**
10. Escribir en `tool_audit_log` en `dynamic_tool_node` (`orchestrator.py:~545`).
11. Limpiar parámetros decorativos: `period` de `get_stock_data`, `date_range` de `get_financial_news`, `metrics`/`sector` de `get_market_analysis`, `from_contact`/`since` de `whatsapp_read_messages`.
12. Resolver nombre→teléfono antes de llamar al workflow de WhatsApp, o restringir el esquema a E.164.
13. Corregir el docstring de `get_tools_for_role` (`registry.py:36`) y decidir explícitamente si los agentes personalizados deben heredar las 12 compartidas.
14. Añadir `calendar_update_event`, `calendar_delete_event` y las 7 OAuth a los prompts de rol, o desregistrarlas.
15. Borrar la UI muerta de `google_calendar` en `ServiceCredentialsSettings.tsx:41,50,291-312` y el campo `default_tools` sin consumidor.
