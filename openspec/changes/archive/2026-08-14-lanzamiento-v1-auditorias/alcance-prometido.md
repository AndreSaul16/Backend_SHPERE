# Alcance prometido — reconstrucción del contrato de lanzamiento

**Fecha:** 2026-08-13 · **Encargo:** reconstruir la «propuesta inicial» que nadie encuentra, con la fuente exacta de cada promesa.
**Método:** lectura completa de los 41 `.md` de `openspec/`, los 10 documentos legacy de `backend/docs/legacy/`, los 7 de `docs/`, los 5 de la rama `redesign/visual-identity-v3`, el historial de las 4 ramas y el código de `backend/app` y `frontend/src`. Toda fila lleva `fichero:línea` o hash de commit. Lo que es deducción mía va marcado **[deducción]**. No se ha modificado ni compilado nada.

**Rutas:** relativas a la raíz del repo. Los ficheros que solo existen en la rama del rediseño llevan el prefijo `[v3]` (rama `redesign/visual-identity-v3`, **145 commits por delante de `master` y sin fusionar**).

---

## 1. ¿Existe un documento de «propuesta inicial»?

**No en este repositorio. Y hay evidencia de que sí existe fuera de él.**

El repositorio no puede contener la propuesta inicial por una razón mecánica: **su commit raíz `cd66c4f` (2026-06-08) ya contiene el producto entero construido**, más una carpeta `backend/docs/legacy/` con la historia previa. Los 62 commits de `master` empiezan cuando SPHERE ya tenía junta directiva, 21 tools, RAG, multi-tenant y Stripe. El repo es la segunda vida del proyecto, no la primera.

### 1.1 El rastro de la propuesta original: `frontend/Docs/01-PRD.md`

Es el **único** documento del repo que se declara a sí mismo documento de requisitos, y son **23 líneas**:

> `# 📄 Documento de Requisitos del Producto (PRD) - Proyecto SPHERE` — `frontend/Docs/01-PRD.md:1`
> `SPHERE es un sistema de simulación de debate multi-agente donde roles ejecutivos simulados (CEO, CTO, CMO, CFO) discuten problemas estratégicos. [cite_start]El sistema utiliza un orquestador central para gestionar turnos de forma determinista[cite: 177].` — `frontend/Docs/01-PRD.md:4`

**El hallazgo importante está en los marcadores.** El fichero contiene nueve citas de la forma `[cite_start]…[cite: N]` con `N` ∈ {175, 177, 180, 184, 185, 187, 189, 191, 194, 318, 407, 488} (`01-PRD.md:4,7,8,9,11,12,15,17,20,21`). Ese formato lo genera una herramienta de síntesis (NotebookLM / Gemini) **al resumir un documento fuente**, y numera segmentos de ese fuente. Es decir: **la propuesta inicial existe como documento externo de al menos 488 segmentos, y el PRD del repo es un resumen automático de él.** Ese documento fuente no está en ninguna rama.

→ **Acción de lanzamiento nº 1: localizar ese documento fuente** (Drive/NotebookLM del dueño). Es la única forma de saber qué se prometió de verdad. Todo lo demás de este informe es reconstrucción a partir de los efectos.

### 1.2 Qué contiene el PRD, y por qué no sirve como contrato hoy

El alcance declarado en el PRD es **únicamente** «simulación de debate multi-agente». No menciona: tools, integraciones, agentes personalizados, RAG, artefactos, créditos, pagos, multi-tenant, guardarraíles ni MCP. Y su stack **ya no es el producto**:

| PRD dice | Realidad hoy | Fuente |
|---|---|---|
| Google Cloud Run | Railway | `01-PRD.md:7` vs `railway.toml`, `backend/RAILWAY.md` |
| vLLM en Runpod (modelos propios) | API de DeepSeek + OpenAI | `01-PRD.md:9` vs `backend/app/core/llm_models.py` |
| MongoDB Atlas | MongoDB Atlas ✔ | `01-PRD.md:11` |
| SSE, no WebSockets | SSE ✔ | `01-PRD.md:15` |
| TTFT < 2 s | 43,7 s de primer token medidos en el CFO | `01-PRD.md:21` vs `PLAN_IMPLEMENTACION_BOARD_V2.md:7` |
| Secretos en Google Secret Manager | Variables de entorno de Railway + Fernet | `01-PRD.md:22` vs `docs/CONEXIONES_Y_N8N_SETUP.md:20-30` |

De los seis requisitos no funcionales y de arquitectura del PRD, **cuatro se abandonaron sin que ningún documento registre la decisión**. El único objetivo cuantitativo que el PRD fija (TTFT < 2 s) se incumple por un factor de 20 y nadie lo ha declarado obsoleto.

### 1.3 Ranking de documentos por fuerza contractual

| # | Documento | Por qué | ¿Contrato? |
|---|---|---|---|
| 1 | `PLAN_IMPLEMENTACION_BOARD_V2.md:11-18` | **Único texto del repo que dice «Alcance aprobado por el usuario»**, con 5 puntos numerados y una lista de exclusiones explícitas | **Sí, el más fuerte** |
| 2 | `openspec/specs/*/spec.md` (7 capacidades, 27 requisitos RFC-2119) | Normativos (MUST/SHALL), con escenarios Given/When/Then | Sí, pero solo cubren remediación técnica |
| 3 | `[v3] DESIGN.md` | Se declara «contrato de identidad visual auditable» (`DESIGN.md:3`) y `openspec/config.yaml:60` lo eleva a regla: «Respetar DESIGN.md como contrato de identidad en cualquier cambio de UI» | Sí, para UI |
| 4 | `frontend/Docs/01-PRD.md` | Se llama PRD, pero es un resumen de 23 líneas de un original ausente y su stack está caducado | Histórico |
| 5 | `[v3] PRODUCT.md` | El retrato de producto más completo que existe — **pero se autodescalifica** | **No** (ver §1.4) |
| 6 | `docs/FUNCIONALIDADES.md` | Inventario exhaustivo generado auditando el código | Descriptivo, no promesa |
| 7 | `backend/docs/legacy/*` | Bitácora y planes de la vida anterior del proyecto | Histórico |

### 1.4 `PRODUCT.md` es una reconstrucción, no una propuesta — y lo dice él mismo

Es el documento que más se parece a lo que el dueño busca, y por eso importa leer su encabezado:

> `Este registro se escribió sin ronda de entrevista: la sesión que lo generó no disponía de herramienta de preguntas al usuario. Todo lo no marcado proviene de evidencia directa del repositorio (código, rutas, specs de openspec/, docs). Lo marcado [inferido] proviene del brief de la tarea o de deducción sobre el código y debe confirmarse antes de tratarse como verdad de producto.` — `[v3] PRODUCT.md:5-10`

Traducido: **PRODUCT.md describe lo que el código hace, no lo que se prometió.** Es un espejo, no un contrato. Usarlo como base de un pitch a inversores invertiría la dirección de la prueba.

---

## 2. Tabla maestra

**Clasificación empleada:**
- **CONTRATO** — normativo: requisito RFC-2119 en `openspec/`, alcance marcado como aprobado, o documento autodeclarado contrato.
- **ESTADO** — el documento afirma que algo *está hecho*. No es una promesa futura, pero **es una afirmación verificable y por tanto un pasivo si es falsa**.
- **PLAN** — escrito y detallado, pero sin marca de aprobación.
- **INFERENCIA** — marcado `[inferido]`, o deducción (mía o del autor del documento).

| # | Promesa | Fuente | Contrato / inferencia | Estado aparente |
|---|---|---|---|---|
| **A. AGENTES Y HERRAMIENTAS** ||||
| A1 | Junta de 4 directores C-Suite (CEO/CTO/CFO/CMO) que debaten un problema estratégico | `frontend/Docs/01-PRD.md:4` | CONTRATO (PRD) | **Cumplido** — `backend/app/application/orchestrator.py:149-260`, `:640` |
| A2 | Nombres propios: Oberon, Nexus, Ledger, Vortex, Némesis | `[v3] PRODUCT.md:33-35`, `:120-125` | ESTADO | **Cumplido** (4 core) — `orchestrator.py:150,184,209,235`; Némesis/DEVIL en `frontend/src/types/index.ts:1` |
| A3 | **«21 herramientas externas»** que los agentes pueden ejecutar | `backend/docs/legacy/Bitacora_SPHERE.md:427,442`; `backend/README.md:98`; `backend/docs/legacy/Resumen_Backend.md:476`; `backend/docs/legacy/Docs/00-START-HERE.md:39`; `frontend/Docs/legacy/Resumen_Frontend.md:283` | ESTADO (5 fuentes coincidentes) | **Superado**: hoy hay **28** registradas — ver §4.1 |
| A4 | «Etiquetas humanas para **20** herramientas» | `[v3] PRODUCT.md:142-143` | ESTADO | **Incorrecto**: son **21** claves en `TOOL_LABELS` (`frontend/src/components/chat/ToolExecutionCard.tsx:14-41`) |
| A5 | 7 operaciones atómicas GitHub/Notion/Slack (create_repo, create_issue, comment_pr, notion create/update, slack post/list) | `backend/docs/legacy/PLAN_AUTH_MULTITENANT.md:244-248` | PLAN | **Cumplido en backend** — `backend/app/infrastructure/tools/oauth_tools.py:257-313`; **sin etiqueta en la UI** (§4.2) |
| A6 | Agentes personalizados con base de conocimiento (RAG) | `Bitacora_SPHERE.md:231`, `:245`; `[v3] PRODUCT.md:81-83` | ESTADO | **Cumplido** — `backend/app/presentation/api/v1/agents.py:96-266`, `backend/app/application/rag.py` |
| A7 | 10 plantillas de agente profesional (legal, psicólogo, contable…) | `Resumen_Backend.md:301-311` | ESTADO | Declarado cumplido; `docs/AUDITORIA_PRODUCCION_2026-06-10.md:187` dice «~25 templates» — cifras incompatibles |
| A8 | Los agentes custom eligen sus tools (`default_tools`) | `docs/FUNCIONALIDADES.md:92` (AG3) | ESTADO | **Campo muerto**: se persiste y nunca se aplica (`backend/app/domain/models/agent.py:37`; sin lectura en el orquestador) |
| A9 | Board V2: triaje → CEO abre → ronda paralela → réplicas con voto → devil's advocate → acta → intervención | `PLAN_IMPLEMENTACION_BOARD_V2.md:12` («**Alcance aprobado por el usuario**») | **CONTRATO** | **Cumplido en código** — commit `f523117`; **QA E2E nunca ejecutado** (§4.4) |
| A10 | Anti-loop de 3 tool-calls por turno | `Bitacora_SPHERE.md:339`, `:436` | ESTADO | Declarado cumplido |
| **B. INTEGRACIONES** ||||
| B1 | Alcance de integraciones «GitHub + Notion + Slack en la primera iteración» | `PLAN_AUTH_MULTITENANT.md:22` | PLAN (decisión declarada) | **Cumplido** — `backend/app/presentation/api/v1/integrations.py:24-29` (4 providers: +google) |
| B2 | Google Calendar, WhatsApp, LinkedIn, Instagram, APIs financieras: **«fuera de scope»** | `PLAN_AUTH_MULTITENANT.md:546` | Exclusión explícita | **Entregados igualmente** — la exclusión quedó obsoleta sin registrarse |
| B3 | Integraciones reales: Notion, WhatsApp, n8n, Calendar, LinkedIn, Instagram, GitHub, Jules | `[v3] PRODUCT.md:76-80` | ESTADO | **Cumplido** (código real; ejecución delegada a n8n) |
| B4 | 16 workflows n8n | `docs/AUDITORIA_PRODUCCION_2026-06-10.md:189` | ESTADO | **Desactualizado**: hay **18** en `backend/infrastructure/n8n-workflows/` (`docs/CONEXIONES_Y_N8N_SETUP.md:13` ya dice 18) |
| B5 | Verificación HMAC en los 18 workflows | commit `d433843`; `docs/CONEXIONES_Y_N8N_SETUP.md:45-47` | ESTADO | Declarado cumplido; requiere 3 env vars en n8n o falla |
| B6 | Email / Gmail como herramienta de agente | — | **NUNCA PROMETIDO** | Solo aparece en un docstring: `backend/app/integrations/providers/google.py:1`. El scope OAuth real es solo calendar (`:12`) |
| **C. ARTEFACTOS Y GUARDARRAÍLES** ||||
| C1 | «Las herramientas destructivas (enviar WhatsApp, postear en LinkedIn) **requieren confirmación del usuario**» | `backend/docs/legacy/Docs/00-START-HERE.md:63-64` | ESTADO (principio de arquitectura) | **Parcial** — 5 de 28 tools; ver §4.3 |
| C2 | Nodo `confirm_before_execute` en el grafo para tools destructivas | `PLAN_AUTH_MULTITENANT.md:361` (dup. `Docs/SPHERE-Autenticacion….md:324`) | PLAN | **Nunca implementado** — 0 ocurrencias en `backend/` |
| C3 | `ToolConfirmationModal.tsx` — modal de confirmación antes de acciones destructivas | `PLAN_AUTH_MULTITENANT.md:481`; `Bitacora_SPHERE.md:630` («lista para wirear»); `docs/FUNCIONALIDADES.md:238` (✅) | PLAN + ESTADO contradictorio | **BORRADO** en commit `af7eff4`. Ver §4.3 |
| C4 | Whitelist de contactos: los tools rechazan destinatarios no autorizados | `PLAN_AUTH_MULTITENANT.md:30`, `:350-357`; `Bitacora_SPHERE.md:605` | PLAN + ESTADO | **Cumplido en 3 tools** — `backend/app/infrastructure/tools/shared_tools.py:146,283,315` |
| C5 | `tool_confirmation_level` con 3 niveles (`always` / `destructive_only` / `never`) | `PLAN_AUTH_MULTITENANT.md:154`; `backend/app/domain/models/user.py:17` | CONTRATO (expuesto en la UI de ajustes) | **`always` es inoperante** — solo 5 tools consultan `requires_confirmation()`; §4.3 |
| C6 | Validación Pydantic estricta en los `args_schema` de las tools | `Bitacora_SPHERE.md:435` | ESTADO | **Cumplido** |
| C7 | Guardarraíles **sobre la generación de artefactos** (actas, markdown, mermaid, código) | — | **NUNCA PROMETIDO** | Ver §4.5. `backend/docs/legacy/auditoria.md:290` admite por escrito: «output filtering **no**» |
| C8 | Sanitización XSS del markdown renderizado | `Bitacora_SPHERE.md:171` | ESTADO | Cumplido (`rehype-sanitize`, dompurify — commit `e44f974`) |
| **D. CRÉDITOS Y PAGOS** ||||
| D1 | 3 planes (Free/Starter/Premium) con suscripción y feature gating | `backend/PLAN_PAGOS.md:36-44` | **SUPERSEDED** por el propio documento | **No vigente** — `backend/PLAN_PAGOS.md:3-9` lo anula por escrito |
| D2 | Modelo mono-plan de solo créditos: 30 créditos/mes, packs y top-ups, sin suscripciones | `backend/PLAN_PAGOS.md:3-9`; commits `5a5cf87`, `5f99fcd` | CONTRATO (pivote declarado) | **Cumplido** — `backend/app/core/plan_limits.py:13-17`, `backend/app/infrastructure/stripe_client.py:11-20` |
| D3 | 1 crédito por mensaje directo; 5 por debate; 3 si el triaje reduce participantes | `PLAN_IMPLEMENTACION_BOARD_V2.md:24`; `[v3] PRODUCT.md:66-69` | CONTRATO | **Cumplido** — `backend/app/application/credit_manager.py:38,41` |
| D4 | «Cobrar exactamente 1 crédito por POST humano a `/stream`, sin importar invocaciones de agente ni bucles de tools» | `openspec/changes/production-readiness/spec.md:9` | **CONTRATO (SHALL)** | Tareas al 100 % `[x]`; **criterios de éxito del proposal sin marcar** (`production-readiness/proposal.md:90-100`) |
| D5 | «El coste siempre a la vista» — el usuario nunca descubre a posteriori que gastó 5 créditos | `[v3] PRODUCT.md:162-163`; `docs/AUDITORIA_PRODUCCION_2026-06-10.md` B1 | CONTRATO (principio de producto) | **Cumplido** — chip de coste, `PLAN_IMPLEMENTACION_BOARD_V2.md:109` |
| D6 | Verificación de email obligatoria antes de recibir créditos | `openspec/changes/production-readiness/spec.md:50` | **CONTRATO (SHALL)** | Cumplido — `backend/app/core/auth.py:206,218` |
| D7 | 4 requisitos de billing frontend (BF-001…BF-004) | `openspec/specs/billing-frontend/spec.md:10-13` | **CONTRATO (MUST)** | Declarados cumplidos |
| D8 | 7 requisitos del sistema de créditos (CS-001…CS-007) | `openspec/specs/credit-system/spec.md:10-16` | **CONTRATO (MUST/SHALL)** | **CS-003 declarado NO implementado** — §4.6 |
| D9 | Webhook de Stripe idempotente, con firma y compensación (PW-001…PW-005) | `openspec/changes/grant-huerfano/specs/payment-webhooks/spec.md:9-106` | **CONTRATO (MUST)** | En curso (rama `feat/grant-huerfano`) |
| **E. AUTH Y MULTI-TENANT** ||||
| E1 | Firebase Auth (email/password + Google/GitHub/Microsoft) | `PLAN_AUTH_MULTITENANT.md:21`; commit `729064e` | PLAN + ESTADO | **Cumplido** — `backend/app/core/auth.py:94` |
| E2 | Aislamiento row-level: agentes, documentos, embeddings y sesiones de un usuario **nunca** se filtran a otro | `PLAN_AUTH_MULTITENANT.md:9`, `:51-73` | PLAN (decisión declarada) | **Cumplido** — `backend/app/core/tenant.py`, `backend/app/application/rag.py:88-96` fail-closed en `:142-149` |
| E3 | Fuga RAG multi-tenant corregida (`$vectorSearch` filtrado por `user_id`) | `Bitacora_SPHERE.md:572-576`; commit `dff8071` | ESTADO | **Cumplido**; pero `openspec/changes/backend-ci-verde/verify-report.md:403` avisa de que 3 de sus 5 tests **no pueden fallar** |
| E4 | 404 en lugar de 403 al acceder a recursos ajenos | `backend/docs/legacy/Docs/00-START-HERE.md:50-51` | ESTADO | Cumplido (`backend/app/core/tenant.py:98`) — **contradice** `PLAN_AUTH_MULTITENANT.md:69`, que promete 403 |
| E5 | Rate limiting en dos capas: req/min (Redis) + presupuesto diario de tokens | `PLAN_AUTH_MULTITENANT.md:29`; `openspec/specs/rate-limiting/spec.md:11-14` | **CONTRATO (MUST)** | Cumplido; **taxonomía de planes contradictoria** — §5 |
| E6 | Equipos / workspaces compartidos | `PLAN_AUTH_MULTITENANT.md:550` | **Exclusión explícita** | Fuera de alcance por escrito — no prometer en el lanzamiento |
| E7 | Panel de admin con UI | `PLAN_AUTH_MULTITENANT.md:554` | Exclusión explícita | **Entregado igualmente** (commit `1f63f1a`, F4) |
| **F. UX, DISEÑO E IDENTIDAD** ||||
| F1 | «Midnight Protocol»: estética oscura con acentos cian y púrpura | `Bitacora_SPHERE.md:18` | ESTADO (identidad v1) | **Sustituida** por «sala capitular» en v3 |
| F2 | Identidad v3 «sala capitular»: paño verde, latón, oxblood, anilina; rechazo explícito de casi-negro+neón, glassmorphism y degradado morado→azul | `[v3] DESIGN.md:14-30`, `:54` | **CONTRATO** (`openspec/config.yaml:60`) | Implementado en la rama v3; **sin fusionar a `master`** |
| F3 | El contrato de dirección viaja verbatim en `index.html` y es auditable con grep sobre `dist/` (clave `b620ecfd`) | `[v3] DESIGN.md:12`, `:39` | CONTRATO | Verificado **en fuente** (`frontend/index.html:85`); **no verificado sobre `dist/`** — `[v3] AUDIT_FINAL_V3.md:53-54` |
| F4 | **12 efectos de firma** (§8.1 Mesa … §8.12 Odómetro) | `[v3] DESIGN.md:584-687` | CONTRATO | Construidos entre las 16:42 y 19:43 del 2026-08-08 (commits `1c64655`…`1ff5570`) |
| F5 | **17 reglas de accesibilidad «no negociables»**, objetivo WCAG 2.2 AA + AAA en texto de cuerpo | `[v3] DESIGN.md:877-898` | CONTRATO | **13 rutas con 0 violaciones critical/serious de axe** — `[v3] AUDIT_FINAL_V3.md:32` |
| F6 | El mismo objetivo WCAG 2.2 AA marcado como **[inferido]** y «debe confirmarse» | `[v3] PRODUCT.md:175` | **INFERENCIA** | **Contradice F5** — §5 |
| F7 | Sin scroll horizontal del body hasta 320 px | `[v3] DESIGN.md` §12.12 | CONTRATO | **Cumplido y medido**: 91 celdas (7 anchuras × 13 rutas), 0 px — `[v3] AUDIT_FINAL_V3.md:44-45` |
| F8 | Perfil de rendimiento contra móvil físico de referencia (Redmi Note/Galaxy A) | `[v3] DESIGN.md` §7.7 | CONTRATO | **NO EJECUTADO** — `[v3] AUDIT_FINAL_V3.md:41-42` |
| F9 | Logotipo propio | — | **NO EXISTE** | `[v3] PRODUCT.md:128-130`: «**No hay logotipo.** Hoy se usa el favicon por defecto de Vite» |
| F10 | Theming avanzado (CSS custom, logos, branding por usuario) | `PLAN_AUTH_MULTITENANT.md:552` | Exclusión explícita | Fuera de alcance |
| F11 | Copy heredado de ciencia ficción («Neuro-Link v2.0», «Canal Encriptado») desentona | `[v3] PRODUCT.md:131-134` | **INFERENCIA** (marcada `[inferido]`) | Decisión pendiente del dueño |
| **G. INFRAESTRUCTURA** ||||
| G1 | Despliegue en Google Cloud Run + Runpod/vLLM | `frontend/Docs/01-PRD.md:7,9` | CONTRATO (PRD) | **Abandonado sin registro** — hoy Railway + DeepSeek API |
| G2 | n8n desplegable vía Railway con sus env vars (IN-001) | `openspec/specs/infrastructure/spec.md:10` | **CONTRATO (MUST)** | `⚠️ PARTIAL` y «sin verificación automatizada» — `openspec/changes/archive/2026-05-14-fix-platform-stability/verify-report.md:65-67,149` |
| G3 | Auto-deploy y sincronización de los 18 workflows a n8n en cada arranque | `docs/CONEXIONES_Y_N8N_SETUP.md:13`; commit `6efbf1a` | ESTADO | Cumplido — `backend/app/infrastructure/n8n_deployer.py:43` |
| G4 | CI en verde con pytest sobre Mongo/Redis reales + gates de frontend | `openspec/config.yaml:16-19`; commit `0c77f8a` | CONTRATO (config del proyecto) | En curso — `openspec/changes/backend-ci-verde/` |
| G5 | TTFT < 2 s | `frontend/Docs/01-PRD.md:21` | CONTRATO (PRD) | **Incumplido por 20×**: 43,7 s medidos — `PLAN_IMPLEMENTACION_BOARD_V2.md:7` |
| G6 | Escalar a cero cuando no hay uso | `frontend/Docs/01-PRD.md:20` | CONTRATO (PRD) | **No aplicable** en Railway con scheduler in-process (`1f63f1a`, F3) |

---

## 3. Por áreas

### 3.1 Agentes y herramientas — de dónde sale «más de 15»

**El número 15 no aparece en ningún documento.** Búsqueda exhaustiva sobre `master` y `redesign/visual-identity-v3`: cero coincidencias de «15» junto a herramienta/tool/capacidad/funcionalidad. Es una aproximación de memoria del dueño.

Las cifras que **sí** están escritas son dos, y no coinciden entre sí:

| Cifra | Fuentes | Qué cuenta |
|---|---|---|
| **21** | `Bitacora_SPHERE.md:427` («8 shared + 3 CEO + 3 CFO + 4 CMO + 3 CTO»), `:442`; `backend/README.md:98`; `Resumen_Backend.md:476`; `Docs/00-START-HERE.md:39`; `improve_quality.md:249`; `frontend/Docs/legacy/Resumen_Frontend.md:283` | Las tools de n8n + CEO, **antes** de añadir las 7 de OAuth |
| **20** | `[v3] PRODUCT.md:142-143` | Intento de contar `TOOL_LABELS`; **está mal, son 21** |

**La lista canónica real, medida hoy (28 tools registradas):**

| # | Tool | Módulo:línea | ¿Etiqueta en UI? |
|---|---|---|---|
| 1-5 | `calendar_list_events`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`, `calendar_check_availability` | `shared_tools.py:366,375,384,393,402` | Sí |
| 6-8 | `whatsapp_send_message`, `whatsapp_send_notification`, `whatsapp_read_messages` | `shared_tools.py:411,420,429` | Sí |
| 9-11 | `delegate_task`, `check_task_status`, `list_active_tasks` (CEO) | `ceo_tools.py:134,141,148` | Sí |
| 12-14 | `get_financial_news`, `get_stock_data`, `get_market_analysis` (CFO) | `cfo_tools.py:101,108,115` | Sí |
| 15-18 | `post_to_linkedin`, `post_to_instagram`, `get_social_analytics`, `schedule_post` (CMO) | `cmo_tools.py:247,257,267,277` | Sí |
| 19-21 | `create_jules_task`, `check_jules_status`, `review_jules_output` (CTO) | `cto_tools.py:124,134,144` | Sí |
| 22-24 | `github_create_repo`, `github_create_issue`, `github_comment_pr` | `oauth_tools.py:257,267,277` | **NO** |
| 25-26 | `notion_create_page`, `notion_update_page` | `oauth_tools.py:304,313` | **NO** |
| 27-28 | `slack_post_message`, `slack_list_channels` | `oauth_tools.py:286,295` | **NO** |

Registro: `backend/app/infrastructure/tools/registry.py` no declara ninguna tool — es solo el mecanismo (`SHARED_TOOLS` y `ROLE_TOOLS` en `:8,11`, poblados por `load_all_tools()` en `:42-52`, invocado desde `backend/main.py:345`).

**Cifra defendible para el lanzamiento: 28 herramientas, de las cuales 21 se presentan con nombre humano en el chat.** No 15, no 20, no 21.

### 3.2 Integraciones

Reales y cableadas: **n8n** (18 workflows, HMAC, circuit breaker), **Google Calendar** (OAuth real desde `6efbf1a`), **WhatsApp Business**, **LinkedIn**, **Instagram**, **Slack**, **Notion**, **GitHub**, **Jules**, **APIs financieras**, **Stripe**, **Firebase**. Cuatro proveedores OAuth registrados: `github`, `notion`, `slack`, `google` (`backend/app/presentation/api/v1/integrations.py:24-29`).

Dos avisos para el pitch:
- Las 14 tools que pasan por n8n **solo funcionan si la instancia n8n está viva y con las 4 variables obligatorias**, incluida `N8N_USER_FOLDER=/home/node` — sin ella «se pierde TODO en cada redeploy», con incidente real registrado el 2026-06-12 (`docs/CONEXIONES_Y_N8N_SETUP.md:44`).
- `revoke()` de Notion es un stub vacío (`backend/app/integrations/providers/notion.py:48-50`): desconectar Notion no revoca nada en el lado de Notion.

### 3.3 Artefactos y guardarraíles

**Dónde se prometieron y en qué términos:**

1. **Principio general** — `backend/docs/legacy/Docs/00-START-HERE.md:63-64`: «Las herramientas destructivas (enviar WhatsApp, postear en LinkedIn) requieren confirmación del usuario. El flujo: tool devuelve error estructurado → LLM pregunta al usuario → usuario confirma → LLM reintenta con `confirmed=True`.»
2. **Nodo en el grafo** — `PLAN_AUTH_MULTITENANT.md:361`: un nodo `confirm_before_execute` para `post_to_linkedin`, `calendar_create_event` con asistentes, `whatsapp_send_message` y `github.delete_repo`.
3. **Whitelist de contactos como defensa anti prompt-injection** — `PLAN_AUTH_MULTITENANT.md:341-360`: «Los tools rechazan cualquier destinatario no autorizado; el agente tiene que pedir al usuario añadirlo explícitamente al perfil.»
4. **Modal de confirmación en la UI** — `PLAN_AUTH_MULTITENANT.md:481`.

**Qué hay de verdad:**

| Guardarraíl | Cobertura real | Evidencia |
|---|---|---|
| `requires_confirmation()` + `confirmed=True` | **5 tools de 28** | `cmo_tools.py:122,151,208`; `oauth_tools.py:153,196` |
| Whitelist de contactos | **3 tools** | `shared_tools.py:146,283,315` |
| Nodo `confirm_before_execute` | **0** — nunca escrito | grep en `backend/`: solo aparece en los dos docs de plan |
| Modal de confirmación en la UI | **0** — borrado | commit `af7eff4` |
| `dry_run` / `preview` / `pending_approval` / `human_in_the_loop` / `guardrail` | **0 ocurrencias** en `backend/app` y `frontend/src` | — |
| Validación de artefactos generados | **0** | `orchestrator.py:126-141` es solo texto de prompt |

**Sobre la generación de artefactos concretamente: no se prometió ningún guardarraíl, en ningún documento, nunca.** Es el punto donde el recuerdo del dueño y el papel más divergen. La única referencia honesta al tema en todo el corpus es una admisión de carencia: `backend/docs/legacy/auditoria.md:290` — «| Safety | Input validation, output filtering | Pydantic si, **output filtering no** |».

### 3.4 Créditos y pagos

Contrato vigente: **mono-plan de solo créditos**. `backend/PLAN_PAGOS.md:3-9` anula por escrito su propio contenido de 3 tiers. 30 créditos/mes; 1 por mensaje, 5 por debate, 3 si el triaje reduce; packs y top-ups en modo `payment`.

Es el área **más contratada** del proyecto: ~24 de los 48 requisitos normativos escritos (BF-001…004, CS-001…007, PW-001…005, más los de `production-readiness`). Stripe está cableado con firma de webhook, idempotencia y dead-letter (`backend/app/presentation/api/v1/webhooks.py:21-136`).

Dos deudas abiertas: **CS-003** (§4.6) y el bug del grant huérfano, en curso en `feat/grant-huerfano`, cuyo propio proposal acepta por escrito un riesgo **Alta**: «`failed_payments` no lo lee **nadie** — el pago sigue invisible sin proceso humano» (`openspec/changes/grant-huerfano/proposal.md:74`).

### 3.5 Auth y multi-tenant

El área mejor documentada del proyecto: `PLAN_AUTH_MULTITENANT.md` son 572 líneas con 4 capas, 12 colecciones con su regla de scope, 11 fases y un checklist de verificación de 17 puntos (`:526-542`). Firebase Auth, row-level scoping vía `backend/app/core/tenant.py`, RAG fail-closed. Todo entregado.

El documento **también declara 10 exclusiones explícitas** (`:544-555`) que conviene no prometer a un inversor sin matizar: equipos/workspaces compartidos, MFA propio, roles internos, export GDPR, theming avanzado, notificaciones push. Dos de esas exclusiones (Calendar/WhatsApp/LinkedIn y el panel de admin) se entregaron de todos modos, lo que confirma que la lista está caducada y nadie la actualizó.

### 3.6 UX, diseño e identidad — y su estado según `AUDIT_FINAL_V3.md`

La identidad v3 es lo más parecido a un contrato formal que tiene el producto: `DESIGN.md:3` — «Cada valor de aquí es verificable: un auditor puede abrir la app, medir y decir "cumple" o "no cumple"», y `openspec/config.yaml:60` lo convierte en regla de aplicación.

**Veredicto declarado: `APTO CON RESERVAS`** (`[v3] AUDIT_FINAL_V3.md:10`).

Verde y medido:
- 4 criterios de salida en verde: `tsc -b` exit 0; **827 tests en 101 ficheros**; 0 clases muertas; eslint exit 0 (`:20-23`).
- axe-core en las 13 rutas: 5 violaciones encontradas, **las 5 arregladas**, re-medido **0 critical/serious** (`:32`).
- Contraste en ambos temas: de 3+19 fallos iniciales a **1 par por tema**, y es el botón de enviar deshabilitado, exento por WCAG (`:38-39`).
- Responsive: **91 celdas, 0 px de scroll horizontal** (`:44-45`).

**Las dos reservas, textuales:**
- **8.4 perfil de rendimiento móvil — NO EJECUTADA.** «No la ejecuté y nada de ella debe darse por cumplida» (`:41`). Requiere backend vivo, 300 turnos y hardware físico de la clase Redmi Note/Galaxy A.
- **8.6 QA E2E de Board V2 — NO EJECUTADA.** «Sigue siendo la única tarea del plan de Board V2 que **nunca se ha ejecutado**» (`:48`).

Deudas dictaminadas como no bloqueantes: `ChatPanel.tsx` de 1320 líneas (`:79`), el SHIM del sistema viejo con ~210 usos vivos (`:85`), 5 `fetch()` fuera del manejador global (`:83`).

Y el dato operativo que más pesa: **`[v3] AUDIT_FINAL_V3.md:134` — «Nada se ha subido: el push no está autorizado».** El rediseño entero son 145 commits sin fusionar ni empujar.

### 3.7 Infraestructura

Railway (backend + frontend + n8n), MongoDB Atlas, Redis, Firebase. CI en `.github/workflows/ci.yml` con pytest sobre Mongo/Redis reales y gates de frontend (`openspec/config.yaml:16-19`), activado en el commit `0c77f8a`.

Riesgo declarado y sin cerrar: `openspec/changes/backend-ci-verde/verify-report.md:449-455` — «`ci.yml` **no define `FERNET_KEY` ni `FERNET_KEYS`** … **la aserción de que el secreto no se guarda en claro nunca se ejecuta en la puerta de merge**». Es decir: el cifrado de credenciales de usuario no está cubierto por el CI.

---

## 4. Promesas huérfanas

Ordenadas por gravedad para el lanzamiento.

### 4.1 MCP — se prometió al inversor, pero **nunca se prometió por escrito; se rechazó**

Tu grep se confirma de forma independiente: `grep -rni "mcp" backend/app frontend/src` → **0 resultados sobre 211 ficheros**. Y en toda la documentación de las 4 ramas solo hay tres apariciones, ninguna es una promesa:

1. **`backend/docs/legacy/Bitacora_SPHERE.md:337`** — una decisión de arquitectura que **descarta MCP explícitamente**:
   > «**¿Por qué n8n y no MCP directo?**: MCP (stdio) es para integraciones locales de IDE. n8n como contenedor Podman ofrece UI visual para workflows, nodos nativos de Google Calendar, WhatsApp Business, LinkedIn, y manejo de credenciales OAuth sin tocar el backend.»
2. **`backend/docs/legacy/readme_drawio.md`** (145 líneas) — el README de un producto de terceros (`@drawio/mcp`) que alguien dejó caer en la carpeta de docs legacy. **No tiene nada que ver con SPHERE.**
3. **`docs/BOARD_FRONTERA_Y_QA_2026-06-11.md:131`** — «Plugin `chrome-devtools-mcp` instalado (scope user)»: una herramienta de desarrollo de Claude Code, no una función del producto.

**Conclusión:** MCP no es una promesa incumplida, es un recuerdo falso — probablemente contaminado por el README de drawio y por el tooling del equipo. **Si se ha dicho a un inversor que SPHERE «tiene MCP», hay que corregirlo antes de la reunión**, porque no hay ni una línea de respaldo y sí una decisión escrita en contra. La contrapropuesta honesta y verificable existe: 28 tools sobre 18 workflows n8n con firma HMAC.

### 4.2 Siete herramientas se ejecutan sin nombre humano en el chat

Las 7 tools de `oauth_tools.py` (GitHub ×3, Notion ×2, Slack ×2) no están en `TOOL_LABELS`. El fallback es `TOOL_LABELS[toolName] || toolName` (`frontend/src/components/chat/ToolExecutionCard.tsx:50`): en pantalla aparece literalmente `notion_create_page`. Son justo las integraciones que `PLAN_AUTH_MULTITENANT.md:22` declaró **prioritarias de primera iteración**. Arreglo: 7 líneas.

### 4.3 El guardarraíl de confirmación es más pequeño de lo que dicen tres documentos

Tres piezas prometidas y ausentes:

- **`ToolConfirmationModal.tsx` fue borrado.** Commit `af7eff4`, con motivo en el cuerpo: «Borrado codigo muerto sin consumidores: ToolConfirmationModal (el flujo de confirmacion es conversacional via tool_error)». Existía desde el commit raíz. `docs/FUNCIONALIDADES.md:238` **sigue listándolo como ✅**.
- **El nodo `confirm_before_execute` nunca se escribió.** Prometido en `PLAN_AUTH_MULTITENANT.md:361`; 0 ocurrencias en el código.
- **`DESTRUCTIVE_TOOLS` declara 9 tools; solo 5 comprueban la confirmación.** `backend/app/core/tool_context.py:23-33` lista 9, pero `whatsapp_send_message`, `whatsapp_send_notification`, `calendar_create_event` y `calendar_delete_event` **no importan `requires_confirmation` ni tienen parámetro `confirmed`** (`shared_tools.py:24`). Consecuencia directa: un usuario que elija `tool_confirmation_level: "always"` en `frontend/src/pages/settings/ProfileSettings.tsx:253-259` **seguirá enviando WhatsApps y borrando eventos de calendario sin confirmar**. La UI promete más que el motor.

Y una limitación de diseño que conviene decir en voz alta ante un inversor técnico: **la confirmación no es una puerta, es una petición al modelo.** La tool devuelve `{"error": "confirmation_required"}` y se confía en que el LLM pregunte; nada impide que el propio modelo reintente con `confirmed=True`. No hay estado de aprobación persistido ni token de un solo uso. **[deducción]** Es un guardarraíl probabilístico presentado en la documentación como determinista.

### 4.4 El QA E2E de Board V2 nunca se ha ejecutado

Board V2 es el **único alcance del repo marcado como aprobado por el dueño** (`PLAN_IMPLEMENTACION_BOARD_V2.md:11`), y su FASE 7 exige comprobar contra producción: latencia total < 100 s, ausencia de evento SSE duplicado, votos visibles, acta descargable y cobro 5 → refund 2 verificable en `/me` (`:135`). Dos auditorías independientes lo confirman pendiente: `[v3] AUDIT_FINAL_V3.md:48` («la única tarea del plan de Board V2 que nunca se ha ejecutado») y `:103`. Es **una hora con el stack completo**, y es lo único que separa «el debate paralelo funciona» de «el debate paralelo funciona, medido».

### 4.5 Cero guardarraíles sobre la generación de artefactos

El acta es, según el propio producto, el entregable (`[v3] PRODUCT.md:59`, `:158`). Y sin embargo:
- No existe validación, cuota, previsualización ni rechazo de artefactos. El parser detecta `<sphere_artifact>` y lo emite (`backend/app/presentation/api/v1/stream.py:384-478`).
- El único control es texto en el prompt: «PROTOCOLO DE ARTEFACTOS… NO generes el artefacto proactivamente» (`orchestrator.py:126-141`).
- Ningún documento lo prometió jamás — así que **no es un incumplimiento, es un hueco que nadie vio**.

**[deducción]** Si el pitch va a decir «guardarraíles para no equivocarse al generar artefactos», hoy eso no existe ni sobre el papel. Lo más barato que lo convertiría en verdad: validar el markdown del acta contra las secciones fijas que `PLAN_IMPLEMENTACION_BOARD_V2.md:65` ya especifica (Contexto / Votación / Decisión / Riesgos / Próximos pasos) y marcar visiblemente el acta si falta alguna.

### 4.6 CS-003: un requisito vigente declarado no implementado hace tres meses

`openspec/specs/credit-system/spec.md:12` sigue diciendo «Admin repair endpoint SHALL fix invalid wallets for existing users». Y el informe de verificación del cambio que lo entregó dice lo contrario: «CS-003 Admin HTTP endpoint | ❌ Not implemented | `_repair_wallet()` exists but no `/admin/repair-wallet` HTTP route was created» (`openspec/changes/archive/2026-05-14-fix-platform-stability/verify-report.md:78`, repetido en `:148` y en `archive-report.md:69`). **Un SHALL vivo, incumplido y archivado como completo.**

### 4.7 Diez requisitos SHALL que nunca llegaron a ser spec

`openspec/changes/production-readiness/` tiene 10 requisitos SHALL y 36 escenarios (`spec.md:9-149`), sus tareas están al **100 % `[x]`**, y **nunca se promocionó a `openspec/specs/` ni se archivó**. Igual `production-ready-v2/`, que además **no tiene `proposal.md`, `spec.md` ni `design.md`**: 16 tareas ejecutadas sobre créditos, rate limiting y verificación de email sin ningún requisito escrito detrás.

Y un patrón que atraviesa todo el corpus: **los `tasks.md` están al 100 % completados, pero no hay un solo criterio de éxito marcado en ningún `proposal.md`** — 30 casillas `[ ]` repartidas entre `production-readiness` (11), `ragnarok-production-audit-v2` (8, **archivado así**), `backend-ci-verde` (6) y `grant-huerfano` (5). Tareas cerradas, promesas sin firmar.

### 4.8 Objetivos del PRD abandonados sin acta

TTFT < 2 s (`01-PRD.md:21`) vs 43,7 s medidos. Cloud Run y Runpod/vLLM (`:7,9`) vs Railway y DeepSeek. Google Secret Manager (`:22`) vs env vars. **Ningún documento registra estas decisiones.** Si el documento fuente citado por el PRD llegó a manos de un inversor, estos cuatro puntos son promesas vivas.

### 4.9 Ausencias que el propio producto declara y no se deben maquillar

`[v3] PRODUCT.md:151-154`: «no hay clientes, testimonios, logos de empresas, benchmarks, precios públicos ni número de usuarios. No hay logotipo. No hay fotografía de producto. Cualquier dato de demostración en pantallas de marketing debe marcarse como sintético.»

---

## 5. Contradicciones entre documentos

No las resuelvo: las señalo, como pediste.

| # | Contradicción | Lado A | Lado B |
|---|---|---|---|
| 1 | **Número de herramientas** | «21» en 6 documentos (`Bitacora_SPHERE.md:427`, `backend/README.md:98`, …) | «20» en `[v3] PRODUCT.md:142`. Medido: **28 registradas / 21 etiquetadas** |
| 2 | **Modal de confirmación** | `docs/FUNCIONALIDADES.md:238` lo da por ✅ | Borrado en `af7eff4`; `Bitacora_SPHERE.md:630` ya decía «lista para wirear» (= no cableada) |
| 3 | **Confirmación de acciones destructivas** | `docs/AUDITORIA_PRODUCCION_2026-06-10.md:189`: «confirmación explícita para acciones destructivas ✓» | Solo 5 de las 9 `DESTRUCTIVE_TOOLS` la comprueban (`tool_context.py:23-33` vs `shared_tools.py`) |
| 4 | **403 vs 404** al acceder a recursos ajenos | `PLAN_AUTH_MULTITENANT.md:69`: `require_owner` «lanza 403» | `Docs/00-START-HERE.md:50`: «404 > 403»; el código hace 404 (`tenant.py:98`) |
| 5 | **Objetivo de accesibilidad** | `[v3] DESIGN.md:879`: WCAG 2.2 AA + AAA en cuerpo, «reglas no negociables» | `[v3] PRODUCT.md:175`: el mismo objetivo marcado **[inferido]** y «debe confirmarse» |
| 6 | **Taxonomía de planes** | `openspec/specs/rate-limiting/spec.md:12`: `free, pro, enterprise` | `production-readiness/spec.md:25`: `Free/Starter/Premium`. Y `PLAN_PAGOS.md:3-9`: mono-plan. **Tres taxonomías vivas** |
| 7 | **Código de error de top-up inválido** | `production-readiness/spec.md:80`: `403 Forbidden` | `production-readiness/proposal.md:93`: `→ 400`. Mismo cambio, dos códigos |
| 8 | **QA visual móvil de SettingsPage** | `fix-platform-stability/tasks.md:56`: `[x]` ejecutado | `.../apply-progress.md:142-161`: 13 casillas `[ ]` sin ejecutar, en un cambio **archivado como completo** |
| 9 | **Nº de workflows n8n** | `AUDITORIA_PRODUCCION_2026-06-10.md:189`: 16 | `CONEXIONES_Y_N8N_SETUP.md:13`: 18. Medido: **18** |
| 10 | **Nº de plantillas de agente** | `Resumen_Backend.md:301`: 10 | `AUDITORIA_PRODUCCION_2026-06-10.md:187`: «~25 templates» |
| 11 | **Nº de ficheros de test** | `Bitacora_SPHERE.md:543`: 16 · `Resumen_Backend.md:588`: 13 · `Docs/00-START-HERE.md:127`: «~80 tests, 15 archivos» | Hoy: 827 tests en 101 ficheros solo en frontend (`[v3] AUDIT_FINAL_V3.md:21`) |
| 12 | **Estado visual del rediseño** | `VISUAL_CHECK_2.md` (sin versionar, 2026-08-08 09:07): «de los doce efectos de firma de §8 solo **uno** existe» | `[v3] AUDIT_FINAL_V3.md` (20:37 del mismo día): APTO CON RESERVAS. **Se resuelve por cronología**: los efectos se construyeron entre las 16:42 y las 19:43 (commits `1c64655`…`1ff5570`). `VISUAL_CHECK*.md` son fotos previas y **no deben citarse como estado actual** |

---

## 6. Qué queda sin decidir (no prometer sin confirmar)

De `[v3] PRODUCT.md:115-116`, textual: «Explícitamente sin decidir: idioma de producto (¿solo español o es-ES + en-US?), si habrá tema claro además de oscuro, si habrá app nativa.» — el tema claro **ya se construyó** (commit `33da1cb`), así que ese punto está resuelto de hecho pero no de derecho.

Marcado `[inferido]` y por tanto **no contrato**:
- El turno de uso (escritorio de día, móvil entre reuniones) — `[v3] PRODUCT.md:21-23`
- Que el copy de ciencia ficción desentona — `[v3] PRODUCT.md:134`
- El objetivo WCAG 2.2 AA — `[v3] PRODUCT.md:175`

Pendiente de producto por escrito: «los board meetings (5 créditos) no reciben recargo por tokens (decisión pendiente de producto)» — `openspec/changes/production-ready-v2/tasks.md:63`.

---

## 7. Los cinco movimientos previos al lanzamiento

1. **Buscar el documento fuente que cita el PRD** (`[cite: 175…488]`). Es la propuesta inicial real y está fuera del repo.
2. **Corregir el mensaje sobre MCP** antes de la reunión: no existe, y se descartó por escrito. Sustituirlo por «28 herramientas sobre 18 workflows n8n con firma HMAC».
3. **Ejecutar 8.6** (QA E2E de Board V2, una hora) y **8.4** (rendimiento en móvil físico). Son las dos reservas del único dictamen de calidad que existe.
4. **Cerrar el guardarraíl que la UI ya promete**: importar `requires_confirmation` en `shared_tools.py` para las 4 tools destructivas que hoy lo ignoran, y añadir las 7 etiquetas que faltan en `TOOL_LABELS`.
5. **Decidir qué se hace con los 145 commits del rediseño**, sin fusionar y sin empujar (`[v3] AUDIT_FINAL_V3.md:134`). Hoy, lo que un inversor abriría en producción es la identidad vieja.
