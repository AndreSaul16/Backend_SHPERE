"""
Tests de aislamiento multi-tenant:
User A NO puede ver sesiones/agentes/docs de User B.
"""
import json

import pytest
from unittest.mock import patch
from datetime import datetime, timezone

import app.infrastructure.tools.ceo_tools as ceo_tools
from app.core.tool_context import _current_user_id


@pytest.mark.asyncio
async def test_user_a_cannot_see_user_b_sessions(authed_client_a, authed_client_b, clean_test_data):
    """User A crea una sesión. User B no la ve en su listado."""
    # User A crea sesión
    resp = await authed_client_a.post("/api/v1/sessions/", json={
        "title": "Sesión Privada de A",
        "base_agent_id": "CEO",
    })
    assert resp.status_code == 200
    session_a = resp.json()

    # User B lista sesiones
    resp = await authed_client_b.get("/api/v1/sessions/")
    assert resp.status_code == 200
    sessions_b = resp.json()

    # User B NO debe ver la sesión de User A
    session_ids_b = [s["session_id"] for s in sessions_b]
    assert session_a["session_id"] not in session_ids_b


@pytest.mark.asyncio
async def test_user_b_cannot_access_user_a_session(authed_client_a, authed_client_b, clean_test_data):
    """User B intenta acceder a una sesión de User A → 404."""
    # User A crea sesión
    resp = await authed_client_a.post("/api/v1/sessions/", json={
        "title": "Sesión Privada de A",
        "base_agent_id": "CEO",
    })
    session_id = resp.json()["session_id"]

    # User B intenta obtener el historial
    resp = await authed_client_b.get(f"/api/v1/sessions/{session_id}/history")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_b_cannot_delete_user_a_session(authed_client_a, authed_client_b, clean_test_data):
    """User B intenta borrar una sesión de User A → 404."""
    # User A crea sesión
    resp = await authed_client_a.post("/api/v1/sessions/", json={
        "title": "Sesión Privada de A",
        "base_agent_id": "CEO",
    })
    session_id = resp.json()["session_id"]

    # User B intenta borrarla
    resp = await authed_client_b.delete(f"/api/v1/sessions/{session_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_a_cannot_see_user_b_agents(authed_client_a, authed_client_b, clean_test_data):
    """User A crea un agente. User B no lo ve (si no es público)."""
    # User A crea agente privado
    resp = await authed_client_a.post("/api/v1/agents/", json={
        "identity": {"name": "Mi Agente Privado"},
        "brain_config": {
            "system_prompt": "Eres un agente de prueba con más de diez caracteres.",
            "model": "deepseek-chat",
        },
        "is_public": False,
    })
    assert resp.status_code == 200, f"Error creando agente: {resp.text}"
    agent_a = resp.json()

    # User B lista agentes
    resp = await authed_client_b.get("/api/v1/agents/")
    assert resp.status_code == 200
    agents_b = resp.json()

    # User B NO debe ver el agente privado de A
    agent_ids_b = [a["agent_id"] for a in agents_b]
    assert agent_a["agent_id"] not in agent_ids_b


@pytest.mark.asyncio
async def test_user_b_cannot_update_user_a_agent(authed_client_a, authed_client_b, clean_test_data):
    """User B intenta modificar un agente de User A → 404."""
    # User A crea agente
    resp = await authed_client_a.post("/api/v1/agents/", json={
        "identity": {"name": "Agente A"},
        "brain_config": {
            "system_prompt": "Eres un agente de prueba con más de diez caracteres.",
        },
    })
    assert resp.status_code == 200, f"Error creando agente: {resp.text}"
    agent_id = resp.json()["agent_id"]

    # User B intenta modificarlo
    resp = await authed_client_b.patch(f"/api/v1/agents/{agent_id}", json={
        "identity": {"name": "Hackeado por B"},
        "brain_config": {"system_prompt": "Prompt hackeado con más de diez caracteres."},
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_b_cannot_delete_user_a_agent(authed_client_a, authed_client_b, clean_test_data):
    """User B intenta borrar un agente de User A → 404."""
    # User A crea agente
    resp = await authed_client_a.post("/api/v1/agents/", json={
        "identity": {"name": "Agente A"},
        "brain_config": {
            "system_prompt": "Eres un agente de prueba con más de diez caracteres.",
        },
    })
    assert resp.status_code == 200, f"Error creando agente: {resp.text}"
    agent_id = resp.json()["agent_id"]

    # User B intenta borrarlo
    resp = await authed_client_b.delete(f"/api/v1/agents/{agent_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_b_cannot_rate_user_a_session(authed_client_a, authed_client_b, clean_test_data):
    """User B intenta calificar un mensaje de una sesión de User A → 404."""
    # User A crea sesión
    resp = await authed_client_a.post("/api/v1/sessions/", json={
        "title": "Sesión A",
        "base_agent_id": "CEO",
    })
    session_id = resp.json()["session_id"]

    # User B intenta calificar
    resp = await authed_client_b.post(f"/api/v1/sessions/{session_id}/ratings", json={
        "message_id": "msg_123",
        "rating": "up",
    })
    assert resp.status_code == 404


# ============================================================
# agent_tasks — aislamiento por dueño (ATI-001 … ATI-005)
# ============================================================


class _EspiaAgentTasks:
    """Colección que registra qué operaciones recibe y delega en la real.

    ATI-004 no se conforma con "devuelve error": exige que sin contexto de
    usuario no se abra consulta alguna contra Mongo.
    """

    def __init__(self, real):
        self._real = real
        self.llamadas: list[str] = []

    def find(self, *args, **kwargs):
        self.llamadas.append("find")
        return self._real.find(*args, **kwargs)

    async def insert_one(self, *args, **kwargs):
        self.llamadas.append("insert_one")
        return await self._real.insert_one(*args, **kwargs)


class _CursorVacio:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _ColeccionInerte:
    """Cualquier colección que no sea `agent_tasks`: nadie debe escribirla."""

    async def count_documents(self, *args, **kwargs):
        return 0

    def find(self, *args, **kwargs):
        return _CursorVacio()

    async def update_many(self, *args, **kwargs):
        raise AssertionError("no debe escribirse en esta colección")

    async def update_one(self, *args, **kwargs):
        raise AssertionError("no debe escribirse en esta colección")


class _DbSoloAgentTasks:
    """Sustituto de `db` que solo expone `agent_tasks` de verdad.

    Acota el radio de un backfill que, tal cual, reescribiría `checkpoints` y
    `knowledge_base` de la base de test.
    """

    def __init__(self, col):
        self._col = col

    def get_async_db(self):
        return self

    def __getitem__(self, nombre):
        return self._col if nombre == "agent_tasks" else _ColeccionInerte()


def _tarea(task_id: str, owner: str | None = None, status: str = "pending") -> dict:
    ahora = datetime.now(timezone.utc)
    doc = {
        "task_id": task_id,
        "created_by": "CEO",
        "assigned_to": "CTO",
        "description": f"Tarea {task_id}",
        "priority": "medium",
        "status": status,
        "result": None,
        "created_at": ahora,
        "updated_at": ahora,
    }
    if owner is not None:
        doc["owner_user_id"] = owner
    return doc


@pytest.fixture
async def tasks_col():
    """`agent_tasks` conectada al loop del test y vacía a ambos lados.

    Se vacía entera, no por dueño: ATI-003 necesita controlar los documentos
    huérfanos, y ningún filtro por dueño puede limpiarlos.
    """
    from app.core.config import settings
    from app.infrastructure.database import db as sphere_db
    from tests.conftest import _setup_db

    await _setup_db()
    assert "test" in settings.DB_NAME, (
        f"esta fixture vacía agent_tasks entera y DB_NAME={settings.DB_NAME!r} "
        "no parece una base de test"
    )
    col = sphere_db.get_async_db()["agent_tasks"]
    await col.delete_many({})
    yield col
    await col.delete_many({})


@pytest.fixture
def como_usuario_a():
    token = _current_user_id.set("test_user_a")
    yield "test_user_a"
    _current_user_id.reset(token)


# --- ATI-001: ninguna lectura cruza de usuario ---

async def test_ati_001_el_ceo_de_a_no_ve_ninguna_tarea_de_b(tasks_col, como_usuario_a):
    await tasks_col.insert_many([
        _tarea("ati_a1", owner="test_user_a"),
        _tarea("ati_a2", owner="test_user_a"),
        _tarea("ati_b1", owner="test_user_b"),
        _tarea("ati_b2", owner="test_user_b"),
        _tarea("ati_b3", owner="test_user_b"),
    ])

    crudo = await ceo_tools._list_active_tasks()
    payload = json.loads(crudo)

    assert payload["count"] == 2
    assert {t["task_id"] for t in payload["active_tasks"]} == {"ati_a1", "ati_a2"}
    for ajena in ("ati_b1", "ati_b2", "ati_b3"):
        assert ajena not in crudo


async def test_ati_001b_un_task_id_ajeno_no_confirma_ni_desmiente(tasks_col, como_usuario_a):
    await tasks_col.insert_one(_tarea("ati_b_secreta", owner="test_user_b"))

    payload = json.loads(await ceo_tools._check_task_status(task_id="ati_b_secreta"))

    assert payload["count"] == 0
    assert payload["tasks"] == []
    assert "error" not in payload


# --- ATI-002: toda escritura sella el dueño ---

async def test_ati_002_delegate_task_sella_el_dueno(tasks_col, como_usuario_a):
    creada = json.loads(await ceo_tools._delegate_task("CTO", "Auditar el bundle"))
    task_id = creada["task_id"]

    doc = await tasks_col.find_one({"task_id": task_id})
    assert doc["owner_user_id"] == "test_user_a"


async def test_ati_002b_la_tarea_creada_aparece_en_la_lista_de_su_autor(
    tasks_col, como_usuario_a
):
    creada = json.loads(await ceo_tools._delegate_task("CMO", "Preparar el guion"))

    payload = json.loads(await ceo_tools._list_active_tasks())

    assert payload["count"] == 1
    assert payload["active_tasks"][0]["task_id"] == creada["task_id"]


# --- ATI-003: huérfanos invisibles, sin backfill ni $exists ---

async def test_ati_003_las_huerfanas_son_invisibles(tasks_col, como_usuario_a):
    await tasks_col.insert_many([
        _tarea("ati_huerfana_1"),
        _tarea("ati_huerfana_2"),
        _tarea("ati_huerfana_3"),
        _tarea("ati_a1", owner="test_user_a"),
    ])

    payload = json.loads(await ceo_tools._list_active_tasks())

    assert payload["count"] == 1
    assert [t["task_id"] for t in payload["active_tasks"]] == ["ati_a1"]


async def test_ati_003b_solo_huerfanas_es_lista_vacia_no_error(tasks_col, como_usuario_a):
    await tasks_col.insert_many([_tarea("ati_huerfana_1"), _tarea("ati_huerfana_2")])

    payload = json.loads(await ceo_tools._list_active_tasks())

    assert payload == {"active_tasks": [], "count": 0}


# --- ATI-004: sin contexto de usuario no se consulta nada ---

async def _sin_contexto(monkeypatch, tasks_col, invocar):
    espia = _EspiaAgentTasks(tasks_col)
    monkeypatch.setattr(ceo_tools, "db", _DbSoloAgentTasks(espia))

    token = _current_user_id.set(None)
    try:
        salida = await invocar()
    finally:
        _current_user_id.reset(token)
    return salida, espia


# Las dos mitades de ATI-004 van en tests separados a propósito: juntas, la
# aserción sobre el error se dispara primero y la del espía —la que observa
# que Mongo no se toca— no llegaría a evaluarse nunca.
_LAS_TRES_DEL_CEO = [
    pytest.param(lambda: ceo_tools._list_active_tasks(), id="list_active_tasks"),
    pytest.param(lambda: ceo_tools._check_task_status(task_id="ati_x"), id="check_task_status"),
    pytest.param(lambda: ceo_tools._delegate_task("CTO", "algo"), id="delegate_task"),
]


@pytest.mark.parametrize("invocar", _LAS_TRES_DEL_CEO)
async def test_ati_004_sin_contexto_devuelve_error(tasks_col, monkeypatch, invocar):
    salida, _ = await _sin_contexto(monkeypatch, tasks_col, invocar)

    assert "user_context_missing" in salida


@pytest.mark.parametrize("invocar", _LAS_TRES_DEL_CEO)
async def test_ati_004_sin_contexto_no_se_toca_mongo(tasks_col, monkeypatch, invocar):
    _, espia = await _sin_contexto(monkeypatch, tasks_col, invocar)

    assert espia.llamadas == [], f"la colección agent_tasks recibió {espia.llamadas}"


# --- ATI-005: un solo nombre de campo, también en el backfill ---

async def test_ati_005_el_backfill_unifica_agent_tasks_en_el_campo_del_indice(
    tasks_col, monkeypatch
):
    from scripts import backfill_user_id as script

    await tasks_col.insert_one(_tarea("ati_005_huerfana"))
    monkeypatch.setattr(script, "db", _DbSoloAgentTasks(tasks_col))

    await script.backfill("test_user_a")

    doc = await tasks_col.find_one({"task_id": "ati_005_huerfana"})
    assert doc["owner_user_id"] == "test_user_a"
    assert "user_id" not in doc
