# Resumen Backend - Proyecto SPHERE

**Sistema Multi-Agente con RAG y LangGraph**

---

## 🗓️ Cronología del Trabajo

### **21 diciembre, 2025 - Configuración Inicial Backend**

#### Hitos
- ✅ Estructura inicial de FastAPI creada
- ✅ Configuración de MongoDB Atlas con conexión segura
- ✅ Endpoint `/api/v1/health` implementado
- ✅ Archivo `config.py` con pydantic-settings
- ✅ Base de conexión a MongoDB (`database.py`)

---

### **27 enero, 2026 - Sistema Multi-Agente Completo**

#### Hitos

##### 1. **Vectorización de la Base de Conocimiento**
- ✅ **74 documentos vectorizados** con OpenAI `text-embedding-3-small`
- ✅ Índice vectorial creado en MongoDB Atlas (`vector_index`)
- ✅ Script `etl/scripts/vectorize_corpus.py` funcionando al 100%
- ✅ Búsqueda semántica probada exitosamente

##### 2. **Orquestador Multi-Agente (LangGraph)**
- ✅ `app/core/orchestrator.py` implementado con LangGraph
- ✅ Router inteligente con DeepSeek (deepseek-chat)
- ✅ Clasificación automática: CTO, CEO, CFO, CMO, FINAL
- ✅ Grafo de estados: Router → Expert Agent → END

##### 3. **Sistema RAG (Retrieval Augmented Generation)**
- ✅ `app/core/rag.py` implementado
- ✅ Búsqueda vectorial filtrada por `agent_target`
- ✅ Contexto de 3 documentos más relevantes por consulta
- ✅ Integración OpenAI + MongoDB Vector Search

##### 4. **Endpoint de Chat API**
- ✅ `app/api/v1/chat.py` - POST `/api/v1/chat/`
- ✅ CORS habilitado para frontend
- ✅ Swagger UI disponible en `/docs`
- ✅ Integración completa: FastAPI → LangGraph → RAG → DeepSeek

##### 5. **Infraestructura & Bugs Corregidos**
- ✅ **Parche SSL**: Uso de `certifi` para conexiones seguras con MongoDB Atlas.
- ✅ **Compatibilidad Pydantic v2**: Migración a `model_config` y `SettingsConfigDict` para gestión de entornos.
- ✅ **Sincronización de Drivers**: Actualización de `motor` a v3.7.x para compatibilidad con `pymongo` 4.9+.
- ✅ **Límite de Tokens**: Implementación de corte de seguridad a 20k caracteres en el pipeline de vectorización.

##### 6. **Dependencias Instaladas**
```
langgraph==1.0.7
langchain-openai==1.1.7
langchain-mongodb==0.11.0
langchain-core==1.2.7
motor==3.7.1
pydantic-settings (v2.x)
certifi
```

---

### **30 enero, 2026 - Streaming SSE y Optimización API**

#### Hitos
- ✅ **Implementación de Streaming (SSE)**: Migración de respuesta estática a Server-Sent Events para una experiencia de chat en tiempo real.
- ✅ **Refactor de Orquestación**: Ajustes en el `orchestrator.py` para soportar la emisión de tokens por roles.
- ✅ **Nuevo Endpoint `/api/v1/chat/stream`**: Endpoint especializado para streaming con manejo de errores robusto.
- ✅ **Mejora en Prompting**: Ajustes en el Router para asegurar que los agentes generen bloques de código y tablas detectables por el frontend.

---

## 📊 Estado Actual del Sistema

### Arquitectura
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   FastAPI   │────▶│  LangGraph   │────▶│  DeepSeek   │
│   /chat     │     │ Orchestrator │     │   (LLM)     │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌─────────────┐
                    │     RAG      │────▶│  MongoDB    │
                    │  retrieve()  │     │  Vector DB  │
                    └──────────────┘     └─────────────┘
```

### Endpoints Disponibles
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/docs` | Swagger UI |
| GET | `/api/v1/health/` | Health check |
| POST | `/api/v1/chat/` | Chat con SPHERE |

### Ejemplo de Uso
```bash
curl -X POST http://localhost:8000/api/v1/chat/ \
  -H "Content-Type: application/json" \
  -d '{"query": "Cómo escalamos la base de datos?"}'
```

**Respuesta:**
```json
{
  "role": "CTO",
  "response": "Desde mi perspectiva técnica..."
}
```

---

### **31 enero, 2026 - Infraestructura de Persistencia y Testing (Refactorización)**
 
 #### Hitos
 - ✅ **Arquitectura Dual de MongoDB**: Implementación de clientes separados (Motor Async + PyMongo Sync). Erradicación de bloqueos de hilos.
 - ✅ **Suite de Testing (29 tests)**: Validación exhaustiva de conexiones, CRUD y checkpointer.
 - ✅ **Frontend Fantasma (CLI)**: Creación de `phantom_front.py` integrado directamente en el backend como herramienta de diagnóstico SSE/Stress.
  - ✅ **Auditoría Técnica de 9 Puntos**: Certificación de estabilidad total:
      - **Memoria Real**: Corregida inyección de mensajes con `add_messages`.
      - **Fix de Persistencia Crítica**: Resuelto bug en `stream.py` que sobrescribía el historial con arrays vacíos. Implementada carga de estado previo con `aget_state()` antes de procesar nuevos tokens.
      - **Stress Test**: Soportados flujos paralelos masivos sin degradación.
      - **Concurrencia Intra-Sesión**: Validación de seguridad en el mismo `thread_id`.
 - ✅ **Deployment GitHub**: Lanzamiento del core al repositorio multi-repo oficial.
 
 ---
 
 ### **01 - 02 febrero, 2026 - Migración Total Cloud y Estabilidad**
 
 #### Hitos
- ✅ **Cloud Migration Final**: Remoción total del servicio local de MongoDB en `compose.yaml`.
- ✅ **Atlas Connectivity**: Validación de conexión segura TLS con MongoDB Atlas para `sphere_db` y `checkpointing_db`.
- ✅ **Entorno Dinámico**: Resolución de conflictos de variables de entorno ($HOME) para ejecución de agentes autónomos.
- ✅ **Persistencia Certificada**: Verificación de que la memoria de LangGraph se mantiene íntegra tras resets del contenedor.

 ---
 
 ## 📊 Estado Actual del Sistema
 
 ### Arquitectura de Conexión
 ```mermaid
 graph LR
     subgraph FastAPI_App
         A[API Endpoints] -->|Motor Async| B[(MongoDB)]
     end
     subgraph LangGraph_Engine
         C[Checkpointer] -->|PyMongo Sync| B
     end
     subgraph Diagnostic_Tool
         D[Phantom CLI] -->|httpx| A
     end
 ```

 ### Endpoints Disponibles
 | Método | Endpoint | Descripción |
 |--------|----------|-------------|
 | GET | `/api/v1/health/health` | Health check + Latencia DB |
 | POST | `/api/v1/sessions/` | Crear sesión de chat |
 | GET | `/api/v1/sessions/` | Listar sesiones históricas |
 | POST | `/api/v1/stream/` | Chat Streaming (SSE) con Memoria |

 ---

 ### **10 febrero, 2026 - Auditoría y Consolidación de Esquema DB**

 #### Hitos
- ✅ **Documentación de `sessions_metadata`**: Definición del esquema que soporta overrides visuales (`override_name`, `avatar`, `color`).
- ✅ **Esquema de `custom_agents`**: Estructura de perfiles para agentes dinámicos, incluyendo la persistencia del `system_prompt`.
- ✅ **Mapeo de Relaciones**: Clarificación del vínculo entre `session_id` y `thread_id` en la colección de checkpoints.
- ✅ **Diagnóstico de Identidad de Mensajes**: Identificado que el `agent_id` no se está persistiendo en los `additional_kwargs` de los `AIMessage`, lo que causaba que el frontend perdiera la referencia del agente al recargar el historial.

---

### **10 febrero, 2026 - Investigación de Integridad de Mensajes**

#### Hitos
- 🔍 **Debugging de Persistencia**: Análisis de la serialización de mensajes en `orchestrator.py`. Confirmado que los mensajes del LLM requieren inyección explícita de metadatos para mantener la identidad del agente entre sesiones.
- 🔍 **Auditoría de Orquestador**: Revisión de `agent_node` para asegurar que las respuestas del experto viajen con su ID correspondiente hacia el checkpointer de MongoDB.

---

### **10 febrero, 2026 - Restauración de Infraestructura & Local Fallback (Noche)**

#### Hitos
- ✅ **Recuperación de Podman**: Guía y ejecución de reset de máquina Podman en Windows (`machine init/start`) tras pérdida de conectividad.
- ✅ **Docker Restoration**: Restauración de `Dockerfile` y `.dockerignore` críticos para el despliegue de la imagen frontend a través de `podman-compose`.
- ✅ **Ejecución Local de Emergencia**: Validada la disponibilidad del backend mediante ejecución directa con `uvicorn` para desbloquear el desarrollo del frontend mientras se estabilizaban los contenedores.
- ✅ **Verificación de Signos Vitales**: Confirmada la escucha en puerto 8000 y respuesta JSON del servidor local.


 ### Colecciones Principales (`sphere_db`)
 1. **`sessions_metadata`**:
    - Campos: `session_id`, `title`, `base_agent_id`, `created_at`, `metadata`.
    - Propósito: Personalización UI y catálogo de chats.
 2. **`custom_agents`**:
    - Campos: `agent_id`, `name`, `description`, `system_prompt`, `role`, `color`.
    - Propósito: Definición de personalidades dinámicas para el Orquestador.
 3. **`checkpoints`**:
    - Gestionada por: `langgraph-checkpoint-mongodb`.
    - Propósito: Memoria de estado y mensajes.

 ---

### **10 febrero, 2026 - Ingeniería de Datos Avanzada y Refacto de Proyecto (Noche)**

#### Hitos
- ✅ **ArXiv PDF Pipeline**: Implementación de `arxiv_pdf_spider.py`. Descarga exitosa de 7 papers clave (12.9 MB).
- ✅ **Ingesta de Libros Sintéticos CTO**: Integración de 7 libros del CTO (30,135 palabras) en MongoDB.
- ✅ **Pipeline de Datos CMO**:
    - Implementación de 3 spiders: `blogs_spider.py` (filtros avanzados por keywords), `frameworks_spider.py` (PDF & Web) y `case_studies_spider.py`.
    - Ingesta exitosa de 27 documentos CMO con arquitectura dual Bronze/Silver.
- ✅ **Pipeline de Datos CFO**:
    - Implementación de spiders especializados en Métricas SaaS, Regulación y Macroeconomía.
    - Debugging de error de infraestructura: identificado bloqueo SSL en MongoDB Atlas que impide el guardado remoto temporal.
- ✅ **Limpieza de "Noise"**: Algoritmo de extracción de referencias que eliminó 222 URLs embebidas, moviéndolas a metadatos para optimizar RAG.
- ✅ **Tooling de Procesamiento**: Lanzamiento de `pdf_processor.py` (Backend dual PyPDF2/pdfplumber).
- ✅ **Automatización Operativa**: Creación de `run_etl_cron.bat` y `README_CRON.md` para ejecuciones periódicas e incrementales.
- ✅ **Professional Environment**: Limpieza profunda de archivos temporales y optimización de `.gitignore` para estándares GitHub.

---

### **10 febrero, 2026 - Validación de Contratos y Conectividad (Noche)**

#### Hitos
- ✅ **Auditoría de CORS**: Verificación de la configuración en `main.py` para asegurar que el frontend en el puerto 3000 pueda comunicarse sin restricciones.
- ✅ **Validación de Contrato API**: Sincronización de esquemas entre `ChatRequest`/`ChatResponse` del backend y la interfaz `api.ts` del frontend.

---

### **10 febrero, 2026 - Evolución de la API de Sesiones (Noche)**

#### Hitos
- ✅ **Diseño de Endpoint `PATCH`**: Especificación técnica para permitir actualizaciones parciales de sesiones y su persistencia en `sessions_metadata`.
- ✅ **Auditoría de API**: Verificación de requerimientos para soportar Overrides visuales persistentes en el flujo de orquestación.

---

### **10 febrero, 2026 - Fase de Persistencia Atómica y Diferenciación de Chats (Cierre)**

#### Hitos
- ✅ **Evolución del Modelo de Sesión**: Implementación de `SessionType` (Enum: `group`, `direct`) en `sessions.py`.
- ✅ **Esquema de Metadatos Atómicos**: Extensión de `VisualConfig` para soportar `bubble_color` (propio de la sesión 1:1) y `theme` (propio del grupo), garantizando el aislamiento de personalizaciones.
- ✅ **Gestión de Miembros**: Habilitada la persistencia y actualización del campo `members` en las sesiones de grupo para control de orquestación.
- ✅ **CRUD de Sesiones Evolucionado**: Actualización de los endpoints `POST /` y `PATCH /{session_id}` para manejar la nueva lógica de tipos y metadatos extendidos.
- ✅ **Blindaje con Tests**: Creación de `tests/test_session_atomicity.py` para asegurar que las actualizaciones visuales sean atómicas por thread_id/session_id.
- ✅ **Arquitectura Lógica de 9 Capas**: Mapeo exhaustivo del orquestador (ADN a Escudo Térmico) documentado para máxima transparencia técnica.
- ✅ **README Profesional**: Despliegue de la guía técnica del orquestador premium en GitHub.
- ✅ **Skins (Lógica Side-Server)**: Implementada la recuperación automática de la identidad del agente desde los metadatos de la sesión en el flujo de streaming SSE.

---

### **10 febrero, 2026 - API de Actualización de Sesiones (Cierre de Sesión)**

#### Hitos
- ✅ **Endpoint PATCH Sessions**: Implementación de `PATCH /api/v1/sessions/{session_id}` en `sessions.py` para actualizaciones parciales.
- ✅ **Actualización Atómica de Metadatos**: Lógica para modificar títulos y `visual_config` sin alterar el resto del documento de sesión.
- ✅ **Integración con Motor**: Optimización de la consulta de actualización en MongoDB Atlas para asegurar atomicidad y consistencia.

---

 ## 🎯 Logros Clave
 
 ### ✅ Técnicos
 1. **Memoria Inquebrantable**: Uso de `add_messages` para persistencia histórica real en el grafo.
 2. **Resiliencia de Concurrencia**: Capacidad de manejar múltiples flujos en la misma sesión sin colisiones.
 3. **Atomicidad de Datos**: Garantizada la independencia de configuraciones visuales entre sesiones paralelas.
 4. **Deduplicación Inteligente**: Sistema incremental que evita descargas redundantes mediante `url_exists()`.
 5. **Medallion Architecture**: Pipeline Bronze → Silver consolidado con 31 documentos curados para el CTO.
 
 ---
 
 ---

### **19 marzo, 2026 - Evolución Masiva: RAG Personalizado, Agent CRUD Completo y UX Premium**

Sesión de alto impacto que transforma el backend de un prototipo funcional en una plataforma de agentes personalizados con knowledge base por agente, comparable a Google Gemini Gems.

#### Hitos — Fase 1: Bug Fixes Críticos (6 correcciones)

- ✅ **Validación de Agente Custom en Stream**: Añadida verificación en `stream.py` de que el agente custom asignado a una sesión sigue existiendo en MongoDB antes de iniciar el streaming. Si fue eliminado, devuelve HTTP 422 con mensaje claro en lugar de un 500 genérico. En `sessions.py`, `get_session_history` ahora devuelve `warning: "agent_deleted"` si el agente fue borrado.
- ✅ **Campo `agent_ref_type`**: Nuevo campo `"core" | "custom"` en el modelo `SessionBase` y `CreateSessionRequest`. Auto-detectado en `create_session`: si `base_agent_id` está en `CORE_AGENT_IDS` → `"core"`, si no → `"custom"`. Usado en `stream.py` para resolver `target_role` correctamente según el tipo de agente.
- ✅ **Modelo Dinámico por Agente Custom**: Nuevo campo `model_config: Optional[dict]` en `AgentState`. En `router_node`, al cargar un agente custom, se extrae `model` y `temperature` de su `brain_config`. En `agent_node`, si `model_config` existe, se crea un `ChatOpenAI` dinámico en lugar de usar el `llm_expert` global. Esto permite que cada agente custom use su propio modelo y temperatura.
- ✅ **Fix de Modelo Default**: Cambiado el default de `BrainConfig.model` de `"deepseek-r1"` a `"deepseek-chat"` para alinearse con el modelo real usado en el orquestador.
- ✅ **Limpieza de Checkpoints on Delete**: `delete_session` ahora elimina también los documentos de las colecciones `checkpoints` y `checkpoint_writes` donde `thread_id == session_id`, liberando la memoria de LangGraph al borrar una sesión.
- ✅ **Mejora de Prompts de Junta Directiva**: Refactorización completa de `DEFAULT_CORE_PROMPTS` en `orchestrator.py`. Cada agente (Oberon/CEO, Nexus/CTO, Vortex/CMO, Ledger/CFO) ahora tiene identidad, personalidad y contexto organizacional. Incluye directiva anti-imitación para que el LLM no copie patrones de respuestas previas del historial.
- ✅ **Filtrado de SystemMessages en Historial**: `agent_node` ahora filtra `SystemMessage` del historial para que el prompt actual siempre domine sobre conversaciones anteriores.

#### Hitos — Fase 2: Agent CRUD Completo

- ✅ **Endpoint `PATCH /api/v1/agents/{agent_id}`**: Actualización parcial de agentes con dot-notation de MongoDB (mismo patrón que `sessions.py`). Incluye `updated_at` timestamp automático.
- ✅ **Enhanced DELETE**: Al eliminar un agente, ahora también se eliminan todos sus vectores de `knowledge_base` donde `agent_target == agent_id` y todos sus archivos de GridFS donde `metadata.agent_id == agent_id`.
- ✅ **Validaciones de BrainConfig**: `system_prompt` (10-10,000 chars), `temperature` (0.0-2.0), `model` (validado contra `ALLOWED_MODELS`). Nuevo campo `description` en `AgentIdentity`.
- ✅ **Campo `documents_count`**: Nuevo campo en `CustomAgentResponse` que trackea el número de documentos subidos al agente.

#### Hitos — Fase 3: Sistema de Templates de Prompts

- ✅ **Nuevo módulo `app/core/templates.py`**: Catálogo estático con 10 templates de agentes especializados:
  - ⚖️ Asesor Legal (compliance, contratos)
  - 🧠 Psicólogo Clínico (CBT, bienestar)
  - 📊 Contador Público (impuestos, auditoría)
  - 🔬 Data Scientist (ML, estadística)
  - ✍️ Copywriter Creativo (branding, contenido)
  - 👥 Especialista en RRHH (talento, cultura)
  - 🎯 Sales Coach (negociación, pipeline)
  - 🎓 Tutor Académico (investigación, metodología)
  - 📋 Project Manager (agile, delivery)
  - 🏥 Asesor Médico (orientación basada en evidencia)
- ✅ **Endpoints**: `GET /api/v1/agents/templates` (con filtro por `category`) y `GET /api/v1/agents/templates/{template_id}`. Rutas definidas ANTES de `/{agent_id}` para evitar colisión con FastAPI.

#### Hitos — Fase 4: Pipeline de Documentos y RAG Personalizado

- ✅ **Nuevo módulo `app/core/document_processor.py`**: Pipeline completo de procesamiento:
  - **Parsing**: PDF (pymupdf/fitz), DOCX (python-docx), TXT/MD (UTF-8)
  - **Chunking**: Token-aware con tiktoken (cl100k_base), 512 tokens por chunk con 64 de overlap
  - **Embedding**: Batch con OpenAI `text-embedding-3-small` (1536 dims), batches de 20
  - **Storage**: Vectores en `knowledge_base` con `agent_target = agent_id` (reutiliza patrón existente)
  - **Cleanup**: `delete_document_vectors()` y `delete_agent_vectors()`
- ✅ **GridFS para Archivos Raw**: Nueva función `get_gridfs_bucket()` en `database.py`. Bucket `agent_files` con metadata de status de procesamiento (`pending` → `processing` → `completed` / `failed`).
- ✅ **Nuevo módulo `app/api/v1/documents.py`**: Endpoints RESTful anidados bajo `/api/v1/agents/{agent_id}/documents`:
  - `POST` — Upload (multipart), validación de tipo/tamaño/límite, procesamiento en `BackgroundTasks`
  - `GET` — Listar documentos del agente con status
  - `GET /{file_id}` — Status de procesamiento individual (para polling)
  - `DELETE /{file_id}` — Eliminar archivo + vectores
- ✅ **Integración RAG**: Cambio de UNA línea en `orchestrator.py` (`rag_role = target_role` en lugar de `"all"` para custom agents). El UUID del agente se pasa como `agent_target` al filtro de `$vectorSearch`.
- ✅ **Fallback RAG**: En `rag.py`, si un agente custom no tiene documentos propios (0 resultados), se hace fallback a `agent_target = "all"` para no dar contexto vacío.
- ✅ **Nuevos Índices**: `knowledge_base.agent_target`, `knowledge_base.source_file_id`, `message_ratings.(session_id, message_id)`.
- ✅ **Dependencias**: `python-multipart`, `pymupdf`, `python-docx`, `tiktoken` añadidas a `requirements.txt`.

#### Hitos — Fase 6 (Backend): Endpoints UX

- ✅ **Pins**: `POST/DELETE/GET /api/v1/sessions/{session_id}/pins` — Array `pinned_messages` en el documento de sesión usando `$addToSet` y `$pull` de MongoDB.
- ✅ **Ratings**: `POST /api/v1/sessions/{session_id}/ratings` — Colección `message_ratings` con upsert por `(session_id, message_id)`. Almacena rating (`up`/`down`), feedback opcional y metadata. Datos valiosos para futuro entrenamiento de IAs propias.
- ✅ **Folders/Tags**: Campos `folder` y `tags` añadidos a `UpdateSessionRequest` y procesados en `update_session`.

#### Hitos — Fase 7: Clean Architecture

- ✅ **Extracción de Pydantic Models**: Nuevo directorio `app/models/` con:
  - `session.py`: `SessionType`, `VisualConfig`, `ContextFile`, `SessionBase`, `CreateSessionRequest`, `UpdateSessionRequest`, `PinRequest`, `RatingRequest`
  - `agent.py`: `AgentIdentity`, `BrainConfig`, `CustomAgentCreate`, `CustomAgentUpdate`, `CustomAgentResponse`, `ALLOWED_MODELS`
  - `__init__.py`: Re-exports centralizados

---

## 📊 Estado Actual del Sistema

### Arquitectura Actualizada
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   FastAPI    │────▶│  LangGraph   │────▶│  DeepSeek   │
│  /stream     │     │ Orchestrator │     │  (LLM)      │
│  /agents     │     │ + model_cfg  │     │  + Custom    │
│  /documents  │     └──────────────┘     └─────────────┘
│  /sessions   │            │
│  /templates  │            ▼
└─────────────┘     ┌──────────────┐     ┌─────────────┐
                    │     RAG      │────▶│  MongoDB    │
                    │  per-agent   │     │  Atlas      │
                    │  + fallback  │     │  + GridFS   │
                    └──────────────┘     └─────────────┘
```

### Endpoints Disponibles (Actualizado)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/stream/` | Streaming SSE con memoria + validación de agente |
| POST | `/api/v1/sessions/` | Crear sesión (con `agent_ref_type`) |
| GET | `/api/v1/sessions/` | Listar sesiones |
| PATCH | `/api/v1/sessions/{id}` | Actualizar sesión (+ folders/tags) |
| DELETE | `/api/v1/sessions/{id}` | Eliminar sesión + checkpoints |
| GET | `/api/v1/sessions/{id}/history` | Historial con warning de agente eliminado |
| POST | `/api/v1/sessions/{id}/pins` | Pinear mensaje |
| DELETE | `/api/v1/sessions/{id}/pins/{msg}` | Despinear mensaje |
| GET | `/api/v1/sessions/{id}/pins` | Listar mensajes pineados |
| POST | `/api/v1/sessions/{id}/ratings` | Rating de mensaje (up/down + feedback) |
| POST | `/api/v1/agents/` | Crear agente custom |
| GET | `/api/v1/agents/` | Listar agentes |
| GET | `/api/v1/agents/{id}` | Detalle de agente |
| PATCH | `/api/v1/agents/{id}` | Actualizar agente |
| DELETE | `/api/v1/agents/{id}` | Eliminar agente + KB + GridFS |
| GET | `/api/v1/agents/templates` | Catálogo de templates |
| GET | `/api/v1/agents/templates/{id}` | Template específico |
| POST | `/api/v1/agents/{id}/documents` | Upload documento (multipart) |
| GET | `/api/v1/agents/{id}/documents` | Listar documentos del agente |
| GET | `/api/v1/agents/{id}/documents/{fid}` | Status de procesamiento |
| DELETE | `/api/v1/agents/{id}/documents/{fid}` | Eliminar documento + vectores |
| GET | `/api/v1/health/health` | Health check + latencia DB |

### Colecciones MongoDB (`sphere_db`)
1. **`sessions_metadata`**: Sesiones con `agent_ref_type`, `folder`, `tags`, `pinned_messages`
2. **`custom_agents`**: Agentes con `documents_count`, `updated_at`, validaciones
3. **`knowledge_base`**: Vectores RAG con `agent_target` (core role o agent UUID), `source_file_id`
4. **`checkpoints` / `checkpoint_writes`**: Memoria LangGraph (limpiada on delete)
5. **`message_ratings`**: Ratings de mensajes para futuro entrenamiento de IAs
6. **`agent_files.*`**: GridFS bucket para archivos raw de documentos

### Archivos Nuevos Creados
| Archivo | Propósito |
|---------|-----------|
| `app/core/templates.py` | Catálogo de 10 templates de agentes |
| `app/core/document_processor.py` | Pipeline: parse → chunk → embed → store |
| `app/api/v1/documents.py` | CRUD de documentos por agente |
| `app/models/__init__.py` | Re-exports de Pydantic models |
| `app/models/session.py` | Models de sesión extraídos |
| `app/models/agent.py` | Models de agente extraídos |

---

---

### **20 marzo, 2026 - Integración n8n + Tool-Calling (ReAct Loop)**

#### Hitos

##### 1. **Infraestructura n8n**
- ✅ Servicio `sphere-n8n` en `docker-compose.yml` (puerto 5678, volumen persistente)
- ✅ Variables de entorno `N8N_*` (auth, encryption, webhook secret)
- ✅ Settings `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET` en Pydantic config

##### 2. **Sistema de Tool-Calling (Nuevo paquete `app/tools/`)**
- ✅ **`registry.py`**: Patrón Registry con `SHARED_TOOLS` (globales) + `ROLE_TOOLS` (por rol)
- ✅ **`n8n_client.py`**: Cliente HTTP async (`httpx`) con HMAC-SHA256, timeouts y error handling
- ✅ **`shared_tools.py`**: 8 herramientas compartidas (Google Calendar + WhatsApp)
- ✅ **`ceo_tools.py`**: 3 herramientas de delegación (MongoDB directo, sin n8n)
- ✅ **`cfo_tools.py`**: 3 herramientas financieras (noticias, bolsa, análisis de mercado)
- ✅ **`cmo_tools.py`**: 4 herramientas de redes sociales (LinkedIn, Instagram, analytics, scheduling)
- ✅ **`cto_tools.py`**: 3 herramientas para Jules (agente async de Google)

##### 3. **Transformación del Grafo LangGraph (ReAct Loop)**
- ✅ `AgentState` += `tool_calls_remaining: int` (anti-loop, default 3)
- ✅ `agent_node` ahora ejecuta `llm.bind_tools(tools)` cuando el rol tiene herramientas
- ✅ Nuevo nodo `dynamic_tool_node` con `ToolNode` de `langgraph.prebuilt`
- ✅ Condición `should_use_tools`: verifica `tool_calls` en `AIMessage` + remaining > 0
- ✅ Grafo: `expert_agent → should_use_tools? → tool_node → expert_agent` (loop) o `→ END`

##### 4. **Streaming de Tool Events**
- ✅ Nuevos eventos SSE: `tool_start` (on_tool_start) y `tool_result` (on_tool_end)
- ✅ Integrados en el loop de `astream_events` sin afectar artifact streaming

##### 5. **Nuevas Colecciones MongoDB**
- ✅ `agent_tasks`: Tareas delegadas por el CEO con UUID, status, prioridad
- ✅ `tool_audit_log`: Registro de cada invocación de herramienta

### Arquitectura Actualizada (con Tool-Calling)
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   FastAPI    │────▶│    LangGraph     │────▶│  DeepSeek   │
│  /stream     │     │  Orchestrator    │     │  (LLM)      │
│  /agents     │     │  + ReAct Loop    │     │  + bind_    │
│  /documents  │     │  + tool_node     │     │    tools()  │
│  /sessions   │     └──────────────────┘     └─────────────┘
│  /templates  │            │       │
└─────────────┘            ▼       ▼
                    ┌──────────┐  ┌──────────────┐
                    │   RAG    │  │  Tool Node   │
                    │ per-agent│  │  (21 tools)  │
                    │ +fallback│  │              │
                    └──────────┘  └──────────────┘
                         │              │
                         ▼              ▼
                    ┌──────────┐  ┌──────────────┐
                    │ MongoDB  │  │    n8n       │
                    │  Atlas   │  │  Webhooks    │
                    │ +GridFS  │  │  (16 paths)  │
                    └──────────┘  └──────────────┘
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                         Google    WhatsApp   Jules/
                        Calendar   Business   Social
```

### Herramientas por Rol (21 total)
| Rol | Herramientas | Via |
|-----|-------------|-----|
| **Todos** | calendar_list/create/update/delete/availability, whatsapp_send/notify/read | n8n |
| **CEO** | delegate_task, check_task_status, list_active_tasks | MongoDB |
| **CTO** | create_jules_task, check_jules_status, review_jules_output | n8n |
| **CFO** | get_financial_news, get_stock_data, get_market_analysis | n8n |
| **CMO** | post_to_linkedin, post_to_instagram, get_social_analytics, schedule_post | n8n |

### Archivos Nuevos Creados (Sesión 20 de Marzo)
| Archivo | Propósito |
|---------|-----------|
| `app/tools/__init__.py` | Package init |
| `app/tools/registry.py` | Registry: role → tools (shared + specific) |
| `app/tools/n8n_client.py` | Cliente HTTP async para n8n con HMAC |
| `app/tools/shared_tools.py` | 8 tools compartidas (Calendar + WhatsApp) |
| `app/tools/ceo_tools.py` | 3 tools de delegación (MongoDB) |
| `app/tools/cfo_tools.py` | 3 tools financieras |
| `app/tools/cmo_tools.py` | 4 tools de redes sociales |
| `app/tools/cto_tools.py` | 3 tools para Jules |

### Archivos Modificados (Sesión 20 de Marzo)
| Archivo | Cambio |
|---------|--------|
| `docker-compose.yml` | Servicio n8n + volumen |
| `.env` | Variables N8N_* |
| `app/core/config.py` | Settings N8N_BASE_URL, N8N_WEBHOOK_SECRET |
| `app/core/orchestrator.py` | ReAct loop, tool_node, bind_tools, prompts con herramientas |
| `app/api/v1/stream.py` | Eventos SSE tool_start/tool_result |
| `main.py` | Lifecycle N8NClient, load_all_tools, índices nuevos |

---

## 🔮 Próximos Pasos

### Inmediato
1. **Configurar workflows n8n**: Crear workflows en `localhost:5678` para cada webhook path definido.
2. **OAuth Google Calendar**: Conectar credenciales OAuth2 de Google en n8n credential store.
3. **WhatsApp Business API**: Configurar token de WhatsApp Business o Twilio en n8n.
4. **IAs Propias**: Integración de vLLM en Runpod para inferencia con modelos custom.
5. **Multi-usuario**: Sistema de autenticación JWT.

---

**Última actualización**: 20 de marzo, 2026
**Estado del proyecto**: 🚀 **AGENTIC PLATFORM** | Tool-calling con 21 herramientas, n8n como capa de ejecución, ReAct loop en LangGraph, Google Calendar + WhatsApp + redes sociales + Jules + delegación.
