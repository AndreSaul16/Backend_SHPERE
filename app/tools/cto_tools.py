"""
Herramientas del CTO (Nexus): Integración con Jules (Google async coding agent).
Conecta con n8n para interactuar con la API de Jules.
"""
import json
from typing import Optional
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.tools.registry import register_role_tool
from app.tools.n8n_client import n8n_client


# ============================================================
# SCHEMAS
# ============================================================

class CreateJulesTaskInput(BaseModel):
    description: str = Field(..., description="Descripción detallada de la tarea de código a realizar")
    repo_url: Optional[str] = Field(None, description="URL del repositorio GitHub (ej: 'https://github.com/org/repo')")
    branch: str = Field("main", description="Branch objetivo para los cambios")
    language: Optional[str] = Field(None, description="Lenguaje de programación principal (ej: 'python', 'typescript')")


class CheckJulesStatusInput(BaseModel):
    jules_task_id: str = Field(..., description="ID de la tarea de Jules a consultar")


class ReviewJulesOutputInput(BaseModel):
    jules_task_id: str = Field(..., description="ID de la tarea de Jules a revisar")
    include_diff: bool = Field(True, description="Incluir el diff/cambios de código en la respuesta")


# ============================================================
# FUNCIONES
# ============================================================

async def _create_jules_task(
    description: str,
    repo_url: Optional[str] = None,
    branch: str = "main",
    language: Optional[str] = None,
) -> str:
    payload = {
        "description": description,
        "branch": branch,
    }
    if repo_url:
        payload["repo_url"] = repo_url
    if language:
        payload["language"] = language

    result = await n8n_client.call_webhook(
        "cto/jules-create",
        payload,
        timeout=30.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _check_jules_status(jules_task_id: str) -> str:
    result = await n8n_client.call_webhook(
        "cto/jules-status",
        {"jules_task_id": jules_task_id},
        timeout=15.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _review_jules_output(jules_task_id: str, include_diff: bool = True) -> str:
    result = await n8n_client.call_webhook(
        "cto/jules-review",
        {"jules_task_id": jules_task_id, "include_diff": include_diff},
        timeout=20.0,
    )
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool("CTO", StructuredTool.from_function(
    coroutine=_create_jules_task,
    name="create_jules_task",
    description="Delega una tarea de código a Jules (agente async de Google). Retorna un jules_task_id. Jules es asíncrono: la tarea se envía y se puede verificar después.",
    args_schema=CreateJulesTaskInput,
))

register_role_tool("CTO", StructuredTool.from_function(
    coroutine=_check_jules_status,
    name="check_jules_status",
    description="Consulta el estado de una tarea delegada a Jules: pending, in_progress, completed, failed.",
    args_schema=CheckJulesStatusInput,
))

register_role_tool("CTO", StructuredTool.from_function(
    coroutine=_review_jules_output,
    name="review_jules_output",
    description="Revisa el código generado por Jules para una tarea completada. Incluye diff y PR URL si está disponible.",
    args_schema=ReviewJulesOutputInput,
))
