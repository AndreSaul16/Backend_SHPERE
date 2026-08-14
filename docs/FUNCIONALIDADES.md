# SPHERE — Inventario exhaustivo de funcionalidades (Backend + Frontend)

> Mapa completo de **todas** las funcionalidades, grandes y pequeñas, incluidas las
> que están a medias (WIP). Generado a partir de una auditoría del código en
> `feat/v3-thelastdance`.
>
> ⚠️ **Corregido el 8 de agosto de 2026 (tarea 7.8 · D39).** Este documento tenía
> filas marcadas ✅ que eran falsas: un modal que no existe, dos secciones de
> ajustes que hoy son redirecciones y un endpoint que el backend expone y el
> frontend nunca llama. Están corregidas **en su sitio**, no borradas, para que se
> vea qué se creía y qué es. El resto del documento sigue siendo de
> `feat/v3-thelastdance` y **no** refleja la rama `redesign/visual-identity-v3`.
>
> Cada funcionalidad de frontend (botón/acción) se mapea a su endpoint de backend
> cuando aplica, de forma que el harness de pruebas [`test/complete_test.sh`](test/complete_test.sh)
> (y su lanzador [`test/complete_test.ps1`](test/complete_test.ps1)) pueda ejercitar cada una con `curl`.

---

## 0. Cómo se ejecuta el sistema

| Pieza | Comando | Puerto | Notas |
|-------|---------|--------|-------|
| Backend | `python backend/run_local.py` | `8000` | Base API: `/api/v1`. Requiere MongoDB (en `.env`: `MONGODB_URL`). |
| Frontend | `npm run dev` (en `frontend/`) | `5173` (Vite) | Base API vía `VITE_API_URL`, default `http://localhost:8000/api/v1`. |

### Autenticación
- **Producción**: Firebase ID token en `Authorization: Bearer <token>`.
- **Desarrollo**: con `ENVIRONMENT=development` y Firebase **sin** inicializar, el token
  especial **`dev-token`** se mapea a un usuario `dev_user` (`dev@sphere.local`).
  Ver [`backend/app/core/auth.py:78`](backend/app/core/auth.py#L78).

> ⚠️ **Importante para testing local**: `ENVIRONMENT` por defecto es `"production"`
> ([`config.py:13`](backend/app/core/config.py#L13)) y **no** está fijado en `.env`.
> Para que `dev-token` funcione hay que arrancar el backend con `ENVIRONMENT=development`
> y sin `FIREBASE_CREDENTIALS_PATH` válido (en `.env` apunta a `/app/...`, ruta de
> contenedor que no existe en local). Alternativamente, exporta un ID token real en
> `SPHERE_TOKEN` antes de correr el harness.

### Middleware / transversal
- **CORS** restringido a `ALLOWED_ORIGINS`; métodos `GET/POST/PATCH/DELETE/OPTIONS`.
- **Security headers** (ASGI): `x-content-type-options`, `x-frame-options`, `referrer-policy`.
- **Rate limiting** por usuario/IP (solo si Redis disponible; en dev sin Redis es no-op).
- **Idempotencia** vía header `Idempotency-Key` (creación de sesiones).

---

## 1. BACKEND — Endpoints (`/api/v1`)

Leyenda estado: ✅ completo · 🟡 parcial/WIP · 🔒 requiere auth · 🌐 público.

### 1.1 Health — `health.py` (prefijo `/health`) 🌐
| # | Método | Ruta | Descripción | Estado |
|---|--------|------|-------------|--------|
| H1 | GET | `/api/v1/health/live` | Liveness (`{"status":"alive"}`) | ✅ |
| H2 | GET | `/api/v1/health/ready` | Readiness: ping MongoDB + Redis | ✅ |
| H3 | GET | `/api/v1/health/health` | Alias de readiness (compat) | ✅ |

### 1.2 Auth / Perfil — `auth.py` (prefijo `/api/v1`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| A1 | GET | `/me` | — | Perfil completo del usuario | ✅ |
| A2 | PATCH | `/me` | `display_name`, `avatar_url`, `ui_preferences`, `professional_profile`, `communication_style`, `financial_preferences`, `personal_kb_enabled` | Actualiza perfil parcial | ✅ |
| A3 | POST | `/me/onboarding/complete` | — | Marca onboarding completado | ✅ |
| A4 | GET | `/me/usage` | — | Presupuesto/uso de tokens del día | ⛔ **el backend lo expone; el frontend NO lo llama.** `TokenUsageBar.tsx` lo consumía y fue borrado sin sustituto (7.8, 2026-08-08) |
| A5 | GET | `/me/agent-overrides` | — | Lista overrides de agentes core | ✅ |
| A6 | PUT | `/me/agent-overrides/{agent_role}` | `system_prompt_addition`, `temperature_override`, `model_override` | Crea/actualiza override (CEO/CTO/CFO/CMO) | ✅ |
| A7 | DELETE | `/me/agent-overrides/{agent_role}` | — | Borra override → vuelve a default | ✅ |
| A8 | GET | `/me/contacts` | — | Lista whitelist de contactos | ✅ |
| A9 | POST | `/me/contacts` | `type`, `value`, `display_name`, `authorized_for[]` | Añade contacto a whitelist | ✅ |
| A10 | DELETE | `/me/contacts/{contact_id}` | — | Elimina contacto | ✅ |
| A11 | GET | `/me/service-credentials` | — | Lista credenciales de servicios externos | ✅ |
| A12 | POST | `/me/service-credentials` | `service`, `api_key`, `metadata` | Guarda/actualiza credencial cifrada (Fernet) | ✅ |
| A13 | DELETE | `/me/service-credentials/{service}` | — | Revoca credencial | ✅ |
| A14 | POST | `/me/service-credentials/{service}/test` | — | Prueba conexión (Google Cal, LinkedIn, WhatsApp, Instagram) | 🟡 (Jules no testea de verdad) |
| A15 | GET | `/me/board-settings` | — | Config Board Meeting | ✅ |
| A16 | PATCH | `/me/board-settings` | `board_meeting_enabled`, `board_iterations` (1\|2) | Actualiza Board Meeting | ✅ |

Servicios soportados en credenciales: `google_calendar`, `linkedin`, `whatsapp`, `jules`, `instagram`.

### 1.3 Sessions — `sessions.py` (prefijo `/sessions`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| S1 | POST | `/sessions/` | `title`, `base_agent_id`, `type`, `visual_config`, `enabled_tools`, `members` (+ header `Idempotency-Key`) | Crea sesión (atómica con idempotencia) | ✅ |
| S2 | GET | `/sessions/?limit=50` | — | Lista sesiones del usuario | ✅ |
| S3 | GET | `/sessions/{session_id}/history` | — | Historial de mensajes desde LangGraph | ✅ |
| S4 | PATCH | `/sessions/{session_id}` | `title`, `visual_config`, `enabled_tools`, `members`, `folder`, `tags` | Actualiza sesión | ✅ |
| S5 | DELETE | `/sessions/{session_id}` | — | Borra sesión + checkpoints | ✅ |
| S6 | POST | `/sessions/{session_id}/pins` | `message_id` | Pinea mensaje | ✅ |
| S7 | DELETE | `/sessions/{session_id}/pins/{message_id}` | — | Despinea mensaje | ✅ |
| S8 | GET | `/sessions/{session_id}/pins` | — | Lista pineados | ✅ |
| S9 | POST | `/sessions/{session_id}/ratings` | `message_id`, `rating`, `feedback?` | Valora mensaje (👍/👎) | ✅ |

### 1.4 Agents (custom + templates) — `agents.py` (prefijo `/agents`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| AG1 | GET | `/agents/templates?category=` | — | Lista templates (público en práctica) | ✅ |
| AG2 | GET | `/agents/templates/{template_id}` | — | Template por ID | ✅ |
| AG3 | POST | `/agents/` | `identity{name,role,color,...}`, `brain_config{model,temperature,system_prompt}`, `default_tools[]`, `knowledge_bases[]`, `is_public` | Crea agente (cap por plan) | ✅ |
| AG4 | GET | `/agents/` | — | Lista agentes propios + públicos | ✅ |
| AG5 | GET | `/agents/{agent_id}` | — | Detalle de agente | ✅ |
| AG6 | PATCH | `/agents/{agent_id}` | `identity?`, `brain_config?`, `default_tools?`, `knowledge_bases?`, `is_public?` | Actualiza agente | ✅ |
| AG7 | DELETE | `/agents/{agent_id}` | — | Borra agente + KB + GridFS | ✅ |

Modelos permitidos: `deepseek-chat`, `deepseek-r1`, `gpt-4o`, `gpt-4o-mini`.
Cap de agentes: free=0, starter=3, premium=∞.

### 1.5 Documents / RAG — `documents.py` (prefijo `/agents`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| D1 | POST | `/agents/{agent_id}/documents` | multipart `file` | Sube documento a la KB del agente | ✅ |
| D2 | GET | `/agents/{agent_id}/documents` | — | Lista documentos del agente | ✅ |
| D3 | GET | `/agents/{agent_id}/documents/{file_id}` | — | Estado de procesamiento del doc | ✅ |
| D4 | DELETE | `/agents/{agent_id}/documents/{file_id}` | — | Borra documento + vectores | ✅ |

Extensiones: `.pdf .txt .docx .xlsx .csv .md`. Cuotas RAG: free 20MB / starter 100MB / premium 1GB.

### 1.6 Stream (SSE) — `stream.py` (prefijo `/stream`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| ST1 | POST | `/stream/` | `query` (1–10k), `session_id`, `target_role?` (CEO/CTO/CFO/CMO/null) | Chat en streaming SSE; cobra 1 crédito upfront, refund en error/disconnect | ✅ |

Eventos SSE: `meta`, `token`, `artifact_open/chunk/close`, `tool_start`, `tool_result`, `board_agent`, `error`, `[DONE]`.
Modo **Board Meeting**: agentes discuten secuencialmente (CEO→CTO→CFO→CMO→conclusión).

### 1.7 Integrations OAuth — `integrations.py` (prefijo `/integrations`) 🔒
| # | Método | Ruta | Descripción | Estado |
|---|--------|------|-------------|--------|
| I1 | GET | `/integrations/{provider}/connect` | Devuelve `authorize_url` (inicia OAuth) | ✅ |
| I2 | GET | `/integrations/{provider}/callback?code=&state=` | Callback OAuth → redirect al frontend | ✅ |
| I3 | GET | `/integrations/` | Lista estados de conexión | ✅ |
| I4 | DELETE | `/integrations/{provider}` | Desconecta/revoca proveedor | ✅ |

Proveedores: `github`, `notion`, `slack`, `google`. State CSRF firmado HMAC, TTL 10 min.

### 1.8 Billing (Stripe) — `billing.py` (prefijo `/billing`) 🔒
| # | Método | Ruta | Body | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| B1 | POST | `/billing/checkout` | `plan_id` | Crea sesión de checkout Stripe (valida tier en top-ups) | ✅ |
| B2 | POST | `/billing/portal` | — | Portal de cliente Stripe (404 si no hay customer) | ✅ **desde la tarea 6.10.** Hasta esa fecha esta fila decía ✅ y era falsa: el endpoint existía desde el principio y no lo llamaba nadie |
| B3 | GET | `/billing/me` | — | Plan, balance, uso RAG, nº agentes, `stripe_configured` | ✅ |

Planes: `starter`, `premium`. Top-ups: `topup_free/starter/premium_1k/2k/10k`.

### 1.9 Webhooks — `webhooks.py` (prefijo `/webhooks`) 🌐
| # | Método | Ruta | Auth | Descripción | Estado |
|---|--------|------|------|-------------|--------|
| W1 | POST | `/webhooks/stripe` | Firma `stripe-signature` + idempotencia | Procesa eventos Stripe (checkout, invoice, subscription) | ✅ |

### 1.10 Raíz
| # | Método | Ruta | Descripción | Estado |
|---|--------|------|-------------|--------|
| R1 | GET | `/` | Metadata del servicio | ✅ |
| R2 | GET | `/api/v1/openapi.json` | Esquema OpenAPI | ✅ |

---

## 2. FRONTEND — Páginas, botones y su endpoint

Base API: `import.meta.env.VITE_API_URL` (default `http://localhost:8000/api/v1`).
Token Firebase adjunto en cada llamada vía `authHeaders()` ([`services/api.ts`](frontend/src/services/api.ts)).

### 2.1 `/login` — LoginPage ✅
| Elemento | Acción | Backend |
|----------|--------|---------|
| Sign In (email/pass) | `signInWithEmail` | Firebase Auth (cliente) |
| Create Account | `signUpWithEmail` | Firebase Auth |
| Google | `signInWithGoogle` (popup) | Firebase Auth |
| GitHub | `signInWithGithub` (popup) | Firebase Auth |

### 2.2 `/` y `/chat/:sessionId` — ChatPanel
| Elemento | Acción | Backend | Estado |
|----------|--------|---------|--------|
| Enviar mensaje | `sendMessage` (SSE) | `POST /stream/` (ST1) | ✅ |
| Detener generación | `stopGeneration` (abort) | aborta SSE | ✅ |
| Exportar Markdown | descarga local | — | ✅ |
| Pin / Unpin mensaje | pin/unpin | `POST/DELETE /sessions/{id}/pins` (S6/S7) | ✅ |
| Valorar 👍/👎 | rate | `POST /sessions/{id}/ratings` (S9) | ✅ |
| Buscar en mensajes | filtro local | — | 🟡 UI lista, lógica de búsqueda incompleta |
| Cargar historial | al abrir sesión | `GET /sessions/{id}/history` (S3) | ✅ |
| Indicador de créditos | lectura | `GET /billing/me` (B3) | ✅ |
| Panel de artefactos (code/markdown/mermaid/tabla) | render | — (SSE) | ✅ |
| Tarjetas de tool execution | render | — (SSE) | ✅ |

### 2.3 `/chat/settings` — ChatSettingsPage ✅
| Elemento | Acción | Backend |
|----------|--------|---------|
| Renombrar sesión / avatar / colores | `updateSessionMetadata` | `PATCH /sessions/{id}` (S4) |
| Toggle Board Meeting (grupo) | `toggleBoardMeeting` | `PATCH /me/board-settings` (A16) |
| Editar miembros (grupo) | `renameAgent` / `updateAgentColor` | local + `PATCH /sessions/{id}` |

### 2.4 `/agents/:agentId` — AgentDetailPage ✅
| Elemento | Acción | Backend |
|----------|--------|---------|
| Editar identidad/cerebro (nombre, desc, color, system prompt, temperatura, modelo) | dirty form | `PATCH /agents/{id}` (AG6) |
| Guardar cambios | save | `PATCH /agents/{id}` (AG6) |
| Subir documento (KnowledgeBasePanel) | upload | `POST /agents/{id}/documents` (D1) |
| Listar/estado documentos (polling 3s) | list/status | `GET /agents/{id}/documents` (D2/D3) |
| Borrar documento | delete | `DELETE /agents/{id}/documents/{fileId}` (D4) |
| Borrar agente (Danger Zone) | confirm + delete | `DELETE /agents/{id}` (AG7) |

### 2.5 `/profile` — ProfilePage ✅
| Elemento | Acción | Backend |
|----------|--------|---------|
| Editar display name + guardar | save | `PATCH /me` (A2) |
| Subir avatar | base64 a localStorage | — (cliente) |
| Cerrar sesión | `signOut` | Firebase |

### 2.6 `/settings` y `/settings/:section` — SettingsPage (hub)
| Sub-sección | Botones/acciones | Backend | Estado |
|-------------|------------------|---------|--------|
| `profile` | Guardar perfil (identidad, profesional, estilo, finanzas, interfaz) | `GET/PATCH /me` (A1/A2) | ✅ |
| `integrations` | Connect / Disconnect (GitHub/Notion/Slack) | `GET /integrations/` (I3), `GET /integrations/{p}/connect` (I1), `DELETE /integrations/{p}` (I4) | ✅ |
| `api-keys` | **Ya no es una sección: es una redirección.** `SettingsPage.LEGACY_REDIRECTS` la manda a `/settings/integrations`, donde vive `ServiceCredentialsSettings` | `POST /me/service-credentials` (A12), `POST .../{s}/test` (A14), `DELETE .../{s}` (A13) | ✅ como parte de Conexiones |
| `board-meeting` | Toggle + iteraciones (1/2) | `GET/PATCH /me/board-settings` (A15/A16) | ✅ |
| `agent-overrides` | Guardar / Reset override (CEO/CTO/CMO/CFO) | `GET /me/agent-overrides` (A5), `PUT .../{role}` (A6), `DELETE .../{role}` (A7) | ✅ |
| `contacts` | Añadir / Borrar contacto whitelist | `GET/POST /me/contacts` (A8/A9), `DELETE /me/contacts/{id}` (A10) | ✅ |
| `storage` | **Ya no es una sección: es una redirección** a `/billing`, donde `BillingPage` pinta el almacenamiento | `GET /me/storage` | ✅ como parte de Facturación. `GET /me/usage` (A4) sigue sin llamarse desde ningún sitio |

### 2.7 `/billing` — BillingPage ✅
| Elemento | Acción | Backend |
|----------|--------|---------|
| Cargar info de plan/balance | refresh | `GET /billing/me` (B3) |
| Suscribir plan (Starter/Premium) | checkout | `POST /billing/checkout` (B1) |
| Comprar top-up | checkout | `POST /billing/checkout` (B1) |
| Gestionar suscripción | portal | `POST /billing/portal` (B2) |

### 2.8 Sidebar (layout) — `Sidebar.tsx`
| Elemento | Acción | Backend | Estado |
|----------|--------|---------|--------|
| Nuevo Chat → AgentSelectorModal | abre modal | — | ✅ |
| Seleccionar agente y crear sesión | `createNewSession` | `POST /sessions/` (S1) | ✅ |
| Listar historial de sesiones | `fetchSessions` | `GET /sessions/` (S2) | ✅ |
| Borrar sesión (menú ⋮) | `deleteSession` | `DELETE /sessions/{id}` (S5) | ✅ |
| Compartir sesión (menú ⋮) | `shareSession` / `unshareSession` | `POST/DELETE /sessions/{id}/share` | ✅ desde la fase 1 |
| Buscar sesiones | filtrado en cliente, sin distinguir acentos ni mayúsculas | — | ✅ desde la tarea 1.4 (D10) |
| Links: Perfil / Facturación / Configuración | navegación | — | ✅ |

### 2.9 Modales / componentes transversales
| Componente | Función | Backend | Estado |
|------------|---------|---------|--------|
| AgentSelectorModal | Elegir agente para nueva sesión | `POST /sessions/` (S1) | ✅ |
| AgentCreationWizard | Crear agente custom (multi-paso + template + docs) | `GET /agents/templates` (AG1), `POST /agents/` (AG3), `POST /agents/{id}/documents` (D1) | ✅ (troceado en `modals/agent-wizard/` en la tarea 7.2) |
| PaywallModal | Upsell ante 402 / cuotas | navega a `/billing` | 🟡 mapeo de razones en curso |
| ~~ToolConfirmationModal~~ | Confirmar tools destructivas | — (SSE) | ⛔ **el fichero NO existe.** Fue borrado, no integrado. La preferencia `ui_preferences.tool_confirmation_level` del perfil se guarda y **nadie la lee** (7.8, 2026-08-08) |
| CreditsIndicator | Balance en header | `GET /billing/me` (B3) | ✅ |
| ArtifactPanel / ArtifactRenderer | Render code/markdown/mermaid/tabla | — | ✅ |

### 2.10 Stores (Zustand)
- `useChatStore` — agentes (core mock + custom), sesiones, historial, streaming, artefactos, UI.
- `useBillingStore` — plan, balance, paywall, uso RAG, `stripe_configured`; `refresh()` con backoff.

---

## 3. Resumen de elementos WIP / incompletos
| Área | Pendiente |
|------|-----------|
| Chat | Búsqueda de mensajes (UI sin lógica completa) |
| Sidebar | Buscador de sesiones; botón "Compartir" sin backend |
| AgentCreationWizard | Pasos de knowledge/review en pulido |
| Storage settings | Uso real de almacenamiento de documentos no expuesto por backend |
| PaywallModal | Mapeo fino de razones (402 / cuotas) |
| Service credential test | Jules devuelve éxito simulado (no testea conexión real) |

---

## 4. Cobertura del harness `test/complete_test.sh`
El harness ejercita con `curl` todos los endpoints marcados como testeables sin
servicios externos vivos: health, perfil, overrides, contactos, credenciales (CRUD),
board-settings, sessions (CRUD + pins + ratings), agents (templates + CRUD),
documents (upload/list/status/delete), billing (`/me`, checkout, portal), integrations
(list/connect), y un smoke test de `/stream/`. Para cada uno mide **latencia**, valida
**código HTTP**, **content-type** y forma de respuesta, y reporta PASS/FAIL con resumen.

Endpoints que requieren servicios externos o firmas (Stripe webhook, OAuth callback,
respuesta real de LLM en stream) se prueban a nivel de *contrato* (acepta request /
responde con el error estructurado esperado), no de integración completa.

---

## Añadido 2026-07-12

Nueve funcionalidades nuevas (F1–F9). Backend en `app/presentation/api/v1/` y
`app/application/`; frontend en `src/`.

- **F1 — Compartir sesión público read-only.** `POST/DELETE /sessions/{id}/share`
  (genera/revoca `share_token`) y `GET /sessions/share/{token}` público, con
  mensajes sanitizados (solo role/content/agent_role/board_vote; nunca user_id,
  emails ni payloads de tools) y rate-limit por token (30/60s). Frontend: ruta
  pública `/share/:token` (`SharedSessionPage`), "Compartir" copia el enlace y
  "Dejar de compartir" en el menú del Sidebar.
- **F2 — Acta → acción.** `POST /me/exports/notion` (usa/persiste
  `notion_parent_page_id`, busca la primera página si no hay) y
  `POST /me/exports/github-issues`. Frontend: acciones en el `ArtifactPanel`
  para actas markdown (parser de "Próximos pasos" → issues, modal owner/repo con
  localStorage).
- **F3 — Junta programada.** Colección `scheduled_boards`, CRUD
  `/me/scheduled-boards` (máx 3), scheduler in-process en el lifespan (tick 60s):
  cobra 5 créditos, crea sesión group, corre `board_v2_app`, notifica por
  Slack/WhatsApp. UI en `BoardMeetingSettings` (sección "Juntas programadas").
- **F4 — Panel admin de créditos.** `require_admin` (`ADMIN_EMAILS`), `/admin/users`,
  `/admin/users/{uid}/adjust`, `/admin/transactions`. Página `/admin`; link "Admin"
  en Sidebar solo si el usuario es admin (fetch perezoso).
- **F5 — Dashboard coste/margen.** `GET /admin/metrics?days=` (agregación en
  Python sobre `credit_transactions`). Pestaña "Métricas" con tarjetas + barras SVG.
- **F6 — Analytics PostHog.** `src/lib/analytics.ts` (no-op sin `VITE_POSTHOG_KEY`);
  eventos signup/first_message/board_debate/checkout/purchase.
- **F7 — Plantillas de debate.** 6 plantillas (`src/lib/debateTemplates.ts`); chips
  en `ChatPanel` para sesión de grupo vacía que rellenan el input.
- **F8 — Memoria ejecutiva.** Colección `board_actas`; `synthesis_node` guarda el
  acta (tolerante a fallos), `ceo_open` inyecta las 2 últimas actas de la MISMA
  sesión (filtrado por user_id + session_id).
- **F9 — Webhook n8n→backend.** `POST /webhooks/n8n` con verificación HMAC
  (`canonical_sign`, reutilizada por ambos lados); workflow `schedule-post.json`
  llama de vuelta tras publicar (nodo Sign Callback + Notify Backend) con `user_id`.

Configuración externa requerida: `ADMIN_EMAILS` (backend), `VITE_POSTHOG_KEY`
(frontend, opcional) y las variables de n8n —callback y secreto compartido— que lista
[`CONEXIONES_Y_N8N_SETUP.md`](CONEXIONES_Y_N8N_SETUP.md). La lista no se repite aquí: vive en un
único sitio y un test lo comprueba.
