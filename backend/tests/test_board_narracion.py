"""El termómetro de narración falsa: qué mide y, sobre todo, qué NO mide.

`junta-honesta` elimina la causa determinista de que un director narre acciones
que no ocurren (anunciarle herramientas y prohibirle decir «no tengo acceso»).
No elimina la posibilidad: eso es una propiedad de la salida de un LLM y no hay
test que la afirme.

Este módulo existe para poder responder con un NÚMERO, dentro de dos semanas, a
«¿ha muerto la narración falsa?», en vez de con una opinión. Es un termómetro,
no una puerta: no bloquea, no reescribe y no se le enseña al usuario.

Sus falsos positivos se aceptan POR ESCRITO: el condicional legítimo («habría
que mirar la agenda») no se distingue del pasado narrado sin entender la frase,
y entenderla no es lo que se está construyendo aquí.
"""
import pytest

from app.application.board_narracion import herramientas_nombradas, narracion_sospechosa
from app.infrastructure.tools.registry import load_all_tools


@pytest.fixture(scope="module", autouse=True)
def _registry_cargado():
    load_all_tools()


# --------------------------------------------------------------------------
# herramientas_nombradas — derivado del registry, no de una lista a mano
# --------------------------------------------------------------------------


def test_reconoce_una_herramienta_del_rol():
    texto = "Miré get_stock_data para AAPL antes de opinar."

    assert herramientas_nombradas(texto, "CFO") == ["get_stock_data"]


def test_una_herramienta_de_otro_rol_no_cuenta():
    """Triangulación: el mismo texto cambia de resultado según el rol.

    `post_to_linkedin` es del CMO. Que el CFO la nombre no es narración de una
    herramienta suya — y el vocabulario sale de `get_tools_for_role`, así que
    esto se mantiene solo cuando alguien mueva una tool de rol.
    """
    texto = "Habría que publicar esto con post_to_linkedin."

    assert herramientas_nombradas(texto, "CFO") == []
    assert herramientas_nombradas(texto, "CMO") == ["post_to_linkedin"]


def test_un_texto_sin_herramientas_devuelve_lista_vacia():
    texto = "Mi recomendación es esperar al cierre del trimestre."

    assert herramientas_nombradas(texto, "CFO") == []


# --------------------------------------------------------------------------
# narracion_sospechosa — nombre de herramienta Y verbo de acción consumada
# --------------------------------------------------------------------------


def test_positivo_nombre_de_herramienta_junto_a_verbo_consumado():
    texto = "He consultado get_stock_data y AAPL cotiza a 190."

    hallazgos = narracion_sospechosa(texto, "CFO")

    assert hallazgos == ["get_stock_data|he consultado"]


def test_positivo_con_verbo_en_preterito_de_una_sola_palabra():
    texto = "Ya publiqué el anuncio con post_to_linkedin esta mañana."

    hallazgos = narracion_sospechosa(texto, "CMO")

    assert hallazgos == ["post_to_linkedin|publiqué"]


def test_negativo_el_condicional_legitimo_no_dispara():
    """Falso negativo aceptado: sin verbo consumado no hay medición."""
    texto = "Habría que mirar la agenda con calendar_list_events antes de cerrar."

    assert narracion_sospechosa(texto, "CFO") == []


def test_negativo_verbo_consumado_sin_nombre_de_herramienta():
    texto = "He revisado el plan financiero y no me cuadra el runway."

    assert narracion_sospechosa(texto, "CFO") == []


def test_negativo_nombre_de_herramienta_sin_verbo_consumado():
    texto = "Propongo usar get_stock_data en el siguiente análisis."

    assert narracion_sospechosa(texto, "CFO") == []


def test_texto_limpio_de_director_no_dispara_nada():
    texto = (
        "Desde finanzas, el runway de 14 meses aguanta la contratación, pero no "
        "el gasto en marketing del Q3. Mi voto es CONDICIONAL."
    )

    assert narracion_sospechosa(texto, "CFO") == []


def test_varias_herramientas_narradas_se_reportan_todas():
    texto = "He consultado get_stock_data y he enviado el resumen con whatsapp_send_message."

    hallazgos = narracion_sospechosa(texto, "CFO")

    assert "get_stock_data|he consultado" in hallazgos
    assert "whatsapp_send_message|he enviado" in hallazgos


# --------------------------------------------------------------------------
# Estructural — por qué esto NO puede convertirse en un guardarraíl
# --------------------------------------------------------------------------


def test_la_firma_devuelve_lista_de_str_nunca_texto():
    """El llamante no tiene con qué reescribir la respuesta aunque quiera.

    No es una promesa en un comentario: es la forma del retorno. Para censurar
    a un director haría falta que esta función devolviera texto, y no puede.
    """
    texto = "He consultado get_stock_data y AAPL cotiza a 190."

    hallazgos = narracion_sospechosa(texto, "CFO")

    assert isinstance(hallazgos, list)
    assert not isinstance(hallazgos, str)
    assert hallazgos, "el caso positivo debe devolver algo, si no la aserción de tipo no prueba nada"
    assert all(isinstance(h, str) for h in hallazgos)


def test_no_muta_el_texto_del_director():
    texto = "He consultado get_stock_data y AAPL cotiza a 190."
    copia = str(texto)

    narracion_sospechosa(texto, "CFO")

    assert texto == copia


def test_un_rol_desconocido_no_revienta():
    """`devil_node` y los agentes a medida no tienen entrada en el registry."""
    assert narracion_sospechosa("He consultado get_stock_data.", "DEVIL") == []
    assert herramientas_nombradas("get_stock_data", "agente-a-medida-42") == []


# --------------------------------------------------------------------------
# Las 2 únicas llamadas: el debate y la síntesis
# --------------------------------------------------------------------------
#
# El termómetro se lee en el log del debate. NO va al `state`, NO va al SSE y
# NO se le enseña al usuario. `devil_node` no se mide (usa el prompt `system`,
# que nunca anunció herramientas) ni la junta v1 legacy: declarado en el diseño.

import logging  # noqa: E402

from langchain_core.messages import AIMessage  # noqa: E402

import app.application.board_v2 as board_v2_module  # noqa: E402

NARRACION = "He consultado get_stock_data y AAPL cotiza a 190."


def _agent_node_que_narra(contenido: str = NARRACION):
    async def fake(state):
        return {
            "final_response": contenido,
            "messages": [AIMessage(content=contenido)],
            "tool_calls_remaining": 3,
        }

    return fake


def _estado(**extra):
    return {
        "next_agent": "CFO",
        "target_role": "CFO",
        "query": "¿Lanzamos en Q3?",
        "user_id": None,
        "session_id": None,
        "messages": [],
        "board_participants": ["CEO", "CTO", "CFO", "CMO"],
        "board_votes": {},
        **extra,
    }


async def test_el_debate_registra_la_narracion_en_el_log(monkeypatch, caplog):
    monkeypatch.setattr(board_v2_module, "agent_node", _agent_node_que_narra())
    monkeypatch.setattr(board_v2_module.logger, "propagate", True)

    nodo = board_v2_module.board_v2_node_factory("CFO", "analysis")
    with caplog.at_level(logging.INFO, logger="sphere.checkpoint"):
        await nodo(_estado())

    assert "get_stock_data|he consultado" in caplog.text


async def test_un_director_que_no_narra_no_deja_rastro(monkeypatch, caplog):
    """Triangulación: el log sale del texto, no de pasar por el nodo."""
    limpio = "El runway de 14 meses aguanta la contratación. Mi voto es SI."
    monkeypatch.setattr(board_v2_module, "agent_node", _agent_node_que_narra(limpio))
    monkeypatch.setattr(board_v2_module.logger, "propagate", True)

    nodo = board_v2_module.board_v2_node_factory("CFO", "analysis")
    with caplog.at_level(logging.INFO, logger="sphere.checkpoint"):
        await nodo(_estado())

    assert "narración" not in caplog.text.lower()


async def test_la_sintesis_tambien_se_mide(monkeypatch, caplog):
    """La síntesis se mide con el vocabulario del CEO, no con el del CFO.

    `get_stock_data` es del CFO: que el CEO lo nombrara NO sería narración de
    una herramienta suya, y el termómetro tiene razón en callarse. Se usa una
    compartida, que sí está en `get_tools_for_role("CEO")`.
    """
    narracion_del_ceo = "He agendado la revisión con calendar_create_event para el lunes."
    monkeypatch.setattr(board_v2_module, "agent_node", _agent_node_que_narra(narracion_del_ceo))
    monkeypatch.setattr(board_v2_module.logger, "propagate", True)

    with caplog.at_level(logging.INFO, logger="sphere.checkpoint"):
        await board_v2_module.synthesis_node(_estado(next_agent="CEO", target_role="CEO"))

    assert "calendar_create_event|he agendado" in caplog.text


async def test_un_fallo_de_la_medicion_no_rompe_el_debate(monkeypatch, caplog):
    """BTH-009 escenario 3. La medición JAMÁS puede tumbar una junta.

    Si medir pudiera romper el debate, sería una puerta con la etiqueta
    equivocada. Se comprueba con la función reventando de verdad, no leyendo
    el `try/except` en el código.
    """
    def explota(texto, rol):
        raise RuntimeError("el termómetro se rompió")

    monkeypatch.setattr(board_v2_module, "agent_node", _agent_node_que_narra())
    monkeypatch.setattr(board_v2_module, "narracion_sospechosa", explota)

    nodo = board_v2_module.board_v2_node_factory("CFO", "analysis")
    salida = await nodo(_estado())

    assert salida["messages"][0].content.startswith("He consultado get_stock_data")


async def test_la_medicion_no_altera_el_texto_del_director(monkeypatch):
    """El `result` del nodo se retorna sin tocar."""
    monkeypatch.setattr(board_v2_module, "agent_node", _agent_node_que_narra())

    nodo = board_v2_module.board_v2_node_factory("CFO", "analysis")
    salida = await nodo(_estado())

    assert salida["messages"][0].content == NARRACION
