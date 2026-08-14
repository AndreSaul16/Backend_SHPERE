"""
BLG-006 — un import muerto y un re-export no son lo mismo.

`app/domain/models/__init__.py` no usa localmente ninguno de los 14 nombres que importa:
existe para re-exportarlos. Ruff los marca F401 y el arreglo «obvio» es borrarlos, que es
justo lo que rompería `from app.domain.models import X`.

Hoy ningún módulo del backend hace ese import, así que sin este test el contrato del
paquete no lo observa nadie y la mutación de BLG-006 (borrar un re-export en vez de
declararlo) pasaría en verde. La lista de abajo ES el contrato que el paquete promete;
por eso se comprueba en los dos sentidos: nada declarado que no exista, nada exportado
que no esté declarado.
"""
import importlib

REEXPORTS_PROMETIDOS = frozenset({
    # app.domain.models.session
    "SessionType", "VisualConfig", "ContextFile", "SessionBase",
    "CreateSessionRequest", "UpdateSessionRequest", "PinRequest", "RatingRequest",
    # app.domain.models.agent
    "AgentIdentity", "BrainConfig", "CustomAgentCreate",
    "CustomAgentUpdate", "CustomAgentResponse", "ALLOWED_MODELS",
})


def test_blg_006_el_paquete_de_modelos_declara_sus_reexports():
    """GIVEN 14 imports sin uso local / THEN se resuelven declarándolos en `__all__`."""
    modelos = importlib.import_module("app.domain.models")

    declarados = getattr(modelos, "__all__", None)
    assert declarados is not None, (
        "app.domain.models no declara __all__: sus re-exports se leen como imports muertos"
    )
    assert set(declarados) == set(REEXPORTS_PROMETIDOS), (
        "el __all__ del paquete no coincide con sus re-exports: "
        f"sobran {sorted(set(declarados) - REEXPORTS_PROMETIDOS)}, "
        f"faltan {sorted(REEXPORTS_PROMETIDOS - set(declarados))}"
    )


def test_blg_006_cada_reexport_prometido_sigue_importandose_del_paquete():
    """El contrato no es la declaración, es que el nombre se pueda importar de verdad."""
    modelos = importlib.import_module("app.domain.models")

    assert len(REEXPORTS_PROMETIDOS) == 14, "la lista del contrato dejó de tener 14 nombres"
    ausentes = [nombre for nombre in sorted(REEXPORTS_PROMETIDOS) if not hasattr(modelos, nombre)]
    assert ausentes == [], f"re-exports que ya no se pueden importar de app.domain.models: {ausentes}"

    # Y son los objetos reales de su módulo de origen, no cualquier cosa con ese nombre.
    session = importlib.import_module("app.domain.models.session")
    assert modelos.CreateSessionRequest is session.CreateSessionRequest
    agent = importlib.import_module("app.domain.models.agent")
    assert modelos.ALLOWED_MODELS is agent.ALLOWED_MODELS
