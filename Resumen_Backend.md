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
 
 ## 🔮 Próximos Pasos
 
 ### Inmediato
 1. **RAG para Expertos Custom**: Ingesta de documentos específicos para agentes del usuario.
 2. **Optimización de Latencia**: Refinar el parser de artefactos para una respuesta visual instantánea.
 
 ---
 
 **Última actualización**: 10 de febrero, 2026  
 **Estado del proyecto**: 🚀 **ATOMIC & DATA ARCHITECTED** | Backend con persistencia de identidad robusta.
