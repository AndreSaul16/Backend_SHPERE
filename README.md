# 🚀 SPHERE Backend - Orquestador Multi-Agente Premium

SPHERE es un ecosistema de orquestación de agentes de IA diseñado para startups tecnológicas. Utiliza una arquitectura avanzada de **Recuperación Aumentada por Generación (RAG)** y un cerebro basado en **LangGraph** para delegar tareas entre expertos especializados (CEO, CTO, CFO, CMO) y agentes personalizados.

---

## 🛠️ Stack Tecnológico

- **Core**: Python 3.10+
- **Framework Web**: FastAPI (Asíncrono)
- **Cerebro IA**: LangGraph (ReAct Loop) & LangChain
- **Tool Execution**: n8n (webhooks, OAuth, workflow automation)
- **Modelos**: DeepSeek-Chat (Orquestación) & OpenAI (Embeddings)
- **Base de Datos**: MongoDB Atlas (Vector Search & Checkpointing)
- **HTTP Client**: httpx (async, HMAC-SHA256)
- **Streaming**: Server-Sent Events (SSE)
- **Logging**: Colored Structured Logging

---

## 🏗️ Arquitectura Lógica (10 Capas)

El backend está diseñado de forma modular y altamente escalable:

1.  **Configuración y ADN**: Validación estricta de entorno con Pydantic Settings.
2.  **Observabilidad Estructurada**: Sistema de logs coloreados con iconos para diagnóstico rápido.
3.  **Persistencia Dual**: Cliente asíncrono para la API y síncrono para la memoria de LangGraph.
4.  **Conocimiento Semántico (RAG)**: Búsqueda vectorial filtrada por rol del agente.
5.  **Neocórtex (Orquestador)**: Grafo de estados ReAct con tool-calling cíclico.
6.  **Tool Execution Layer**: 21 herramientas externas via n8n webhooks con HMAC-SHA256.
7.  **Gestión Administrativa**: CRUD de sesiones e identidades de agentes personalizados.
8.  **Sistema Nervioso SSE**: Generador de eventos en tiempo real para tokens, artefactos y tool events.
9.  **Servidor y Ciclo de Vida**: Gestión de startup/shutdown con N8NClient lifecycle.
10. **Auditoría y Escudo Térmico**: Suite de pruebas + tool_audit_log.

---

## 🚀 Instalación y Uso

### 1. Requisitos Previos
- Python 3.10 o superior.
- Una instancia de MongoDB Atlas con Vector Search habilitado.
- API Keys de OpenAI y DeepSeek.

### 2. Configuración
Crea un archivo `.env` en la raíz con:
```env
MONGODB_URL=tu_url_de_atlas
OPENAI_API_KEY=tu_api_key
DEEPSEEK_API_KEY=tu_api_key
DB_NAME=sphere_db
```

### 3. Ejecución Local
```bash
cd backend
python -m venv venv
source venv/bin/activate  # o venv\Scripts\activate en Windows
pip install -r requirements.txt
python run_local.py --reload
```

---

## 📡 Endpoints Principales

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/v1/stream/` | Streaming SSE con memoria + validación de agente. |
| `POST` | `/api/v1/sessions/` | Crear sesión (con `agent_ref_type`). |
| `PATCH` | `/api/v1/sessions/{id}` | Actualizar sesión (título, visual, folders, tags). |
| `DELETE` | `/api/v1/sessions/{id}` | Eliminar sesión + checkpoints de LangGraph. |
| `POST` | `/api/v1/sessions/{id}/pins` | Pinear/despinear mensajes. |
| `POST` | `/api/v1/sessions/{id}/ratings` | Rating de respuestas (up/down + feedback). |
| `POST` | `/api/v1/agents/` | Crear agente custom con validaciones. |
| `PATCH` | `/api/v1/agents/{id}` | Actualizar agente (parcial). |
| `DELETE` | `/api/v1/agents/{id}` | Eliminar agente + KB + GridFS. |
| `GET` | `/api/v1/agents/templates` | Catálogo de 10 templates profesionales. |
| `POST` | `/api/v1/agents/{id}/documents` | Upload de documentos (PDF/DOCX/TXT/MD). |
| `GET` | `/api/v1/agents/{id}/documents` | Listar documentos + status de procesamiento. |
| `GET` | `/api/v1/health/health` | Estado del sistema y latencia de DB. |

---

## 🧠 RAG Personalizado (Estilo Gemini Gems)

Cada agente custom puede tener su propia base de conocimientos:

1. **Upload**: El usuario sube PDF, DOCX, TXT o MD (máx 20MB, 10 archivos por agente).
2. **Processing**: Pipeline automático: Parse → Chunk (tiktoken, 512 tokens) → Embed (OpenAI) → Store.
3. **Retrieval**: Búsqueda vectorial filtrada por `agent_target = agent_id` en MongoDB Atlas.
4. **Fallback**: Si el agente no tiene documentos propios, busca en el corpus general.

```
Upload → GridFS → BackgroundTask → Parse → Chunk → Embed → knowledge_base
                                                                  ↓
Chat Query → Orchestrator → RAG($vectorSearch, agent_target) → LLM → Response
```

---

## 🔧 Tool-Calling (21 Herramientas Externas)

Los agentes C-Suite ejecutan herramientas reales via un **ReAct loop** en LangGraph + **n8n webhooks**:

```
Agent → bind_tools() → LLM decision → ToolNode → n8n webhook → External API → Agent (loop)
```

### Herramientas Compartidas (Todos los agentes)
| Tool | Descripción |
|------|-------------|
| `calendar_list_events` | Listar eventos de Google Calendar |
| `calendar_create_event` | Crear reuniones y eventos |
| `calendar_update_event` | Modificar eventos existentes |
| `calendar_delete_event` | Eliminar eventos |
| `calendar_check_availability` | Verificar disponibilidad horaria |
| `whatsapp_send_message` | Enviar mensajes por WhatsApp |
| `whatsapp_send_notification` | Notificar al equipo |
| `whatsapp_read_messages` | Leer mensajes recientes |

### Herramientas por Rol
| Rol | Tools | Via |
|-----|-------|-----|
| **CEO** | delegate_task, check_task_status, list_active_tasks | MongoDB |
| **CTO** | create_jules_task, check_jules_status, review_jules_output | n8n → Jules API |
| **CFO** | get_financial_news, get_stock_data, get_market_analysis | n8n → Finance APIs |
| **CMO** | post_to_linkedin, post_to_instagram, get_social_analytics, schedule_post | n8n → Social APIs |

### Seguridad
- HMAC-SHA256 en cada request backend → n8n
- Anti-loop: máximo 3 iteraciones de tool-calling por turno
- Secrets de APIs externas aislados en n8n credential store
- Validación Pydantic estricta en schemas de cada herramienta

---

## 🎨 Templates de Agentes

10 perfiles profesionales pre-configurados: Asesor Legal, Psicólogo, Contador, Data Scientist, Copywriter, RRHH, Sales Coach, Tutor Académico, Project Manager y Asesor Médico.

---
*Firma: SPHERE Implementation Team*
*Fecha: Marzo, 2026*
