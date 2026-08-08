> # ⛔ OBSOLETO — no leer como si fuera verdad
>
> **Movido a `Docs/legacy/` el 8 de agosto de 2026** (tarea 7.8 · D39 del
> `PLAN_REFACTOR_FRONTEND_V3.md`). Se conserva porque cuenta qué se pensó al
> empezar, no porque describa nada de lo que hay.
>
> **Lo que este documento dice y es falso hoy:**
>
> - Dice que el proyecto está «en la etapa de inicialización (Greenfield)». Lleva
>   en producción desde junio de 2026, con Stripe cobrando.
> - Pide **Podman** para el entorno local. No se usa: el frontend se levanta con
>   `vite` y el backend con `uvicorn`.
> - Pide **Cloud Run** y un worker **vLLM en Runpod**. El despliegue real es
>   **Railway**, y la inferencia va contra la API de DeepSeek. No hay GPU propia.
>
> **Dónde está lo que sí vale:** `PRODUCT.md` (qué es el producto),
> `DESIGN.md` (el contrato visual, vinculante), `PLAN_REFACTOR_FRONTEND_V3.md`
> (el plan vivo) y `frontend/ARCHITECTURE.md` (la estructura real del código).

---

# 🧭 Punto de Entrada: Proyecto SPHERE

## Estado Actual: FASE 1 (Configuración & MVP)
Estamos en la etapa de inicialización (Greenfield). El objetivo es establecer una arquitectura robusta de bajo costo antes de desarrollar la lógica de negocio compleja.

## Documentación Crítica
⚠️ **Instrucción para el Agente:** Lee estos documentos antes de generar código.

1. **[01-PRD.md](./01-PRD.md)**: La "Biblia" del proyecto. Contiene la visión, el stack tecnológico híbrido y las reglas de negocio.

## Prioridades Inmediatas (Kanban: Doing)
1. Configurar el entorno local con **Podman** (Monorepo).
2. Establecer el esqueleto del Backend (**FastAPI** en Cloud Run).
3. Establecer el worker de inferencia (**vLLM** en Runpod).

## Arquitectura de Alto Nivel
* [cite_start]**Patrón:** Orquestación Centralizada (LangGraph)[cite: 177].
* [cite_start]**Infraestructura:** Híbrida Desacoplada (GCP Cloud Run + Runpod GPU)[cite: 182].
* [cite_start]**Frontend:** React + Vite (Streaming unidireccional vía SSE)[cite: 191].
