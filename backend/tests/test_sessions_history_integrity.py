"""Un historial que falla es un error, no una sesión vacía.

El `except Exception` del endpoint devolvía **200 con lista vacía**, así que el
cliente no podía distinguir «esta sesión no tiene mensajes» de «no he podido
leerlos». El usuario abría su debate de ayer y veía un chat en blanco, como si
nunca hubiera existido: la peor forma de perder el entregable, sin ruido.

La guarda que acompaña al arreglo es tan importante como el arreglo: «vacío» y
«roto» tienen que seguir siendo dos cosas distintas después del cambio.
"""
import pytest

from app.presentation.api.v1 import sessions as sessions_mod


async def _crear_sesion(cliente, titulo="Sesión de prueba") -> str:
    respuesta = await cliente.post("/api/v1/sessions/", json={"title": titulo})
    assert respuesta.status_code in (200, 201), respuesta.text
    return respuesta.json()["session_id"]


@pytest.fixture
def lectura_rota(monkeypatch):
    """La lectura de mensajes lanza, como si Mongo o el checkpointer fallaran."""

    async def _revienta(user_id, session_id):
        raise RuntimeError("checkpointer caído: connection refused a mongodb://interno:27017")

    monkeypatch.setattr(sessions_mod, "_load_session_messages", _revienta)


# --- SH-001 · un fallo de lectura se comunica como fallo --------------------


async def test_sh001_un_fallo_al_leer_no_puede_devolver_200(authed_client_a, lectura_rota):
    session_id = await _crear_sesion(authed_client_a)

    respuesta = await authed_client_a.get(f"/api/v1/sessions/{session_id}/history")

    assert respuesta.status_code >= 500
    assert respuesta.status_code != 200


async def test_sh001b_el_error_no_filtra_interioridades(authed_client_a, lectura_rota):
    session_id = await _crear_sesion(authed_client_a)

    respuesta = await authed_client_a.get(f"/api/v1/sessions/{session_id}/history")
    cuerpo = respuesta.text

    # Ni lista de mensajes falsa, ni traza, ni cadena de conexión, ni nombres de
    # colección: el usuario lee castellano y el detalle se queda en el log.
    assert "messages" not in respuesta.json()
    assert "mongodb://" not in cuerpo
    assert "checkpointer" not in cuerpo
    assert "Traceback" not in cuerpo


async def test_sh001c_el_fallo_se_registra_con_el_session_id(
    authed_client_a, lectura_rota, monkeypatch
):
    # El logger de la casa lleva `propagate = False`, así que `caplog` no lo ve:
    # se espía la llamada real, que es además lo que dice la spec.
    avisos: list[str] = []
    monkeypatch.setattr(sessions_mod.logger, "warning", lambda m, *a, **k: avisos.append(str(m)))

    session_id = await _crear_sesion(authed_client_a)
    await authed_client_a.get(f"/api/v1/sessions/{session_id}/history")

    assert any(session_id in aviso for aviso in avisos), (
        f"el session_id no aparece en el log: {avisos}"
    )


# --- SH-002 · una sesión sin mensajes sigue siendo un caso normal -----------


async def test_sh002_una_sesion_recien_creada_sigue_devolviendo_200(authed_client_a):
    """Caracterización: es la guarda que impide que el arreglo se lleve por
    delante el caso legítimo. Vacío y roto son cosas distintas."""
    session_id = await _crear_sesion(authed_client_a, "Sin mensajes")

    respuesta = await authed_client_a.get(f"/api/v1/sessions/{session_id}/history")

    assert respuesta.status_code == 200
    assert respuesta.json()["messages"] == []


async def test_sh002b_una_sesion_ajena_no_cambia_de_comportamiento(
    authed_client_a, authed_client_b
):
    """Caracterización del camino de autorización: `require_owner` lanza
    `HTTPException` y el `except HTTPException: raise` la deja pasar **antes**
    del 500 nuevo."""
    session_id = await _crear_sesion(authed_client_a, "De A, no de B")

    respuesta = await authed_client_b.get(f"/api/v1/sessions/{session_id}/history")

    assert respuesta.status_code == 404
    assert respuesta.status_code < 500


async def test_sh002b_bis_una_sesion_inexistente_sigue_siendo_404(authed_client_a):
    respuesta = await authed_client_a.get("/api/v1/sessions/no-existe-12345/history")

    assert respuesta.status_code == 404


async def test_sh002c_el_aviso_de_agente_borrado_sobrevive(authed_client_a):
    from app.infrastructure.database import get_sessions_collection

    session_id = await _crear_sesion(authed_client_a, "Con agente fantasma")
    await get_sessions_collection().update_one(
        {"session_id": session_id},
        {"$set": {"agent_ref_type": "custom", "base_agent_id": "agente-que-ya-no-existe"}},
    )

    respuesta = await authed_client_a.get(f"/api/v1/sessions/{session_id}/history")

    assert respuesta.status_code == 200
    assert respuesta.json()["warning"] == "agent_deleted"


# --- SH-003 · la vista compartida no hereda el cambio a ciegas --------------


async def test_sh003_la_vista_publica_no_expone_infraestructura(
    authed_client_a, lectura_rota
):
    """El segundo consumidor de `_load_session_messages` **no se toca**: un
    visitante anónimo no debe empezar a ver errores de infraestructura."""
    from app.infrastructure.database import get_sessions_collection

    session_id = await _crear_sesion(authed_client_a, "Compartida")
    await get_sessions_collection().update_one(
        {"session_id": session_id}, {"$set": {"share_token": "token-de-prueba-sh003"}}
    )

    respuesta = await authed_client_a.get("/api/v1/sessions/share/token-de-prueba-sh003")

    assert respuesta.status_code == 200
    assert respuesta.json()["messages"] == []
    assert "mongodb://" not in respuesta.text
