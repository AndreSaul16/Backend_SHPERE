> # ⛔ OBSOLETO — no leer como si fuera verdad
>
> **Movido a `Docs/legacy/` el 8 de agosto de 2026** (tarea 7.8 · D39 del
> `PLAN_REFACTOR_FRONTEND_V3.md`). Se conserva como registro de la intención
> inicial. **El PRD vigente es `PRODUCT.md`, en la raíz del repositorio.**
>
> **Lo que este documento dice y es falso hoy:**
>
> - **Stack:** promete Cloud Run, vLLM en Runpod y Podman. El despliegue real es
>   Railway y la inferencia va contra la API de DeepSeek.
> - **Latencia:** fija «objetivo <2 s para el primer token». El QA del 11 de junio
>   de 2026 midió **43,7 s** para una junta completa. El objetivo vigente está en
>   `PLAN_IMPLEMENTACION_BOARD_V2.md` (<100 s de latencia total).
> - **Roles:** habla de CEO, CTO, CMO y CFO. Hoy hay además un **Abogado del
>   Diablo** con fase propia en el debate (Board V2).
> - **Diseño:** todo lo visual que diga aquí está derogado por `DESIGN.md`.

---

# 📄 Documento de Requisitos del Producto (PRD) - Proyecto SPHERE

## 1. Visión del Producto
SPHERE es un sistema de simulación de debate multi-agente donde roles ejecutivos simulados (CEO, CTO, CMO, CFO) discuten problemas estratégicos. [cite_start]El sistema utiliza un orquestador central para gestionar turnos de forma determinista[cite: 177].

## 2. Stack Tecnológico (Decisiones de Arquitectura)
* **Backend (Lógica):** Python 3.11+ con **FastAPI**. [cite_start]Alojado en **Google Cloud Run** (Serverless)[cite: 175, 180].
* [cite_start]**Orquestación:** **LangGraph** (Máquina de Estado Cíclica) para control estricto de turnos[cite: 177].
* **Inferencia (IA):** Worker de FastAPI + **vLLM** (Motor de inferencia). [cite_start]Alojado en **Runpod** (GPU Serverless) para reducir costes[cite: 184, 187].
* **Frontend:** React (Vite) + TypeScript + Tailwind CSS.
* [cite_start]**Base de Datos:** **MongoDB Atlas** (Logs de chat y sesiones)[cite: 189].
* [cite_start]**Entorno Local:** **Podman** (Daemonless/Rootless)[cite: 194].

## 3. Protocolos de Comunicación
* [cite_start]**Cliente <-> Backend:** REST para acciones, **Server-Sent Events (SSE)** para streaming de respuestas (No WebSockets)[cite: 191, 407].
* **Backend <-> Inferencia:** HTTP/REST seguro con Bearer Tokens.
* [cite_start]**Backend <-> DB:** VPC Peering (GCP <-> Atlas)[cite: 488].

## 4. Requisitos No Funcionales
* **Coste:** Optimización agresiva. Escalar a cero cuando no haya uso. [cite_start]Evitar GPUs de hiperescaladores (AWS/Azure)[cite: 185].
* [cite_start]**Latencia:** Objetivo <2s para el primer token (TTFT)[cite: 318].
* **Seguridad:** Secretos gestionados en Google Secret Manager. Conexión privada a BD.
