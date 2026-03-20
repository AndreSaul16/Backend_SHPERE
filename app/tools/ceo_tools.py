"""
Herramientas del CEO (Oberon): Delegación de tareas al equipo.
Intra-sistema — opera directamente con MongoDB, sin n8n.
"""
import json
import uuid
from typing import Optional, Literal
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.tools.registry import register_role_tool
from app.core.database import db
from app.core.logger import checkpoint_logger as logger


def _get_tasks_collection():
    return db.get_async_db()["agent_tasks"]


# ============================================================
# SCHEMAS
# ============================================================

class DelegateTaskInput(BaseModel):
    assigned_to: Literal["CTO", "CMO", "CFO"] = Field(..., description="Agente al que se asigna la tarea")
    description: str = Field(..., description="Descripción clara de la tarea a realizar", max_length=2000)
    priority: Literal["high", "medium", "low"] = Field("medium", description="Prioridad de la tarea")


class CheckTaskStatusInput(BaseModel):
    task_id: Optional[str] = Field(None, description="ID de la tarea a consultar")
    assigned_to: Optional[Literal["CTO", "CMO", "CFO"]] = Field(None, description="Filtrar por agente asignado")


class ListActiveTasksInput(BaseModel):
    pass  # Sin argumentos


# ============================================================
# FUNCIONES
# ============================================================

async def _delegate_task(
    assigned_to: Literal["CTO", "CMO", "CFO"],
    description: str,
    priority: Literal["high", "medium", "low"] = "medium",
) -> str:
    tasks_col = _get_tasks_collection()
    task_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc)

    task_doc = {
        "task_id": task_id,
        "created_by": "CEO",
        "assigned_to": assigned_to,
        "description": description,
        "priority": priority,
        "status": "pending",
        "result": None,
        "created_at": now,
        "updated_at": now,
    }

    await tasks_col.insert_one(task_doc)
    logger.info(f"Tarea {task_id} delegada a {assigned_to}: {description[:50]}...")

    return json.dumps({
        "success": True,
        "task_id": task_id,
        "assigned_to": assigned_to,
        "priority": priority,
        "status": "pending",
        "message": f"Tarea asignada exitosamente a {assigned_to}."
    }, ensure_ascii=False)


async def _check_task_status(
    task_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
) -> str:
    tasks_col = _get_tasks_collection()

    query = {}
    if task_id:
        query["task_id"] = task_id
    if assigned_to:
        query["assigned_to"] = assigned_to

    if not query:
        return json.dumps({"error": "Debes proporcionar task_id o assigned_to"}, ensure_ascii=False)

    cursor = tasks_col.find(query).sort("updated_at", -1).limit(10)
    tasks = []
    async for doc in cursor:
        tasks.append({
            "task_id": doc["task_id"],
            "assigned_to": doc["assigned_to"],
            "description": doc["description"][:100],
            "priority": doc["priority"],
            "status": doc["status"],
            "result": doc.get("result"),
            "created_at": doc["created_at"].isoformat(),
        })

    return json.dumps({"tasks": tasks, "count": len(tasks)}, ensure_ascii=False)


async def _list_active_tasks() -> str:
    tasks_col = _get_tasks_collection()
    cursor = tasks_col.find(
        {"status": {"$in": ["pending", "in_progress"]}}
    ).sort("priority", 1).limit(20)

    tasks = []
    async for doc in cursor:
        tasks.append({
            "task_id": doc["task_id"],
            "assigned_to": doc["assigned_to"],
            "description": doc["description"][:100],
            "priority": doc["priority"],
            "status": doc["status"],
            "created_at": doc["created_at"].isoformat(),
        })

    return json.dumps({"active_tasks": tasks, "count": len(tasks)}, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool("CEO", StructuredTool.from_function(
    coroutine=_delegate_task,
    name="delegate_task",
    description="Asigna una tarea a un miembro del equipo (CTO, CMO o CFO) con descripción y prioridad.",
    args_schema=DelegateTaskInput,
))

register_role_tool("CEO", StructuredTool.from_function(
    coroutine=_check_task_status,
    name="check_task_status",
    description="Consulta el estado de una o varias tareas delegadas, por task_id o por agente asignado.",
    args_schema=CheckTaskStatusInput,
))

register_role_tool("CEO", StructuredTool.from_function(
    coroutine=_list_active_tasks,
    name="list_active_tasks",
    description="Lista todas las tareas activas (pendientes o en progreso) del equipo.",
    args_schema=ListActiveTasksInput,
))
