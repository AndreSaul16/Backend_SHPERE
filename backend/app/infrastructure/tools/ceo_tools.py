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
from app.infrastructure.tools.registry import register_role_tool
from app.infrastructure.database import db
from app.core.logger import checkpoint_logger as logger
from app.core.tool_context import get_current_user_id


# ============================================================
# ACCESO A agent_tasks — el dueño no se aplica, se hereda
# ============================================================
#
# No existe forma de obtener la colección cruda desde este módulo: la única
# puerta es `_scoped_tasks`, y lo que devuelve ya lleva el dueño dentro. Una
# cuarta lectura futura no puede olvidar el filtro porque no tiene con qué.


class _ScopedTasks:
    """`agent_tasks` acotada a un dueño. No expone la colección subyacente."""

    def __init__(self, col, uid: str):
        self._col = col
        self._uid = uid

    def find(self, query: Optional[dict] = None):
        return self._col.find({**(query or {}), "owner_user_id": self._uid})

    async def insert_one(self, doc: dict):
        return await self._col.insert_one({**doc, "owner_user_id": self._uid})


def _user_context_missing_error(tool_name: str) -> str:
    return json.dumps(
        {
            "error": "user_context_missing",
            "tool": tool_name,
            "hint": "Esta herramienta requiere un usuario autenticado.",
        },
        ensure_ascii=False,
    )


def _scoped_tasks(tool_name: str) -> tuple[Optional[_ScopedTasks], Optional[str]]:
    """Devuelve `(colección acotada, None)` o `(None, error)`.

    La guarda va ANTES de `db.get_async_db()`: sin usuario en contexto no se
    abre consulta alguna contra Mongo (ATI-004).
    """
    uid = get_current_user_id()
    if not uid:
        return None, _user_context_missing_error(tool_name)
    return _ScopedTasks(db.get_async_db()["agent_tasks"], uid), None


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
    tasks_col, error = _scoped_tasks("delegate_task")
    if error:
        return error

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
    query = {}
    if task_id:
        query["task_id"] = task_id
    if assigned_to:
        query["assigned_to"] = assigned_to

    # La guarda se evalúa sobre los argumentos del llamante y ANTES de mezclar
    # el dueño; si se evaluara después nunca estaría vacía y este mensaje
    # quedaría muerto.
    if not query:
        return json.dumps({"error": "Debes proporcionar task_id o assigned_to"}, ensure_ascii=False)

    tasks_col, error = _scoped_tasks("check_task_status")
    if error:
        return error

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
    tasks_col, error = _scoped_tasks("list_active_tasks")
    if error:
        return error

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
