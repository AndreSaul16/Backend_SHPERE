"""El prompt que recibe un director en la junta, fijado por contrato.

Esta capacidad NO prueba que el modelo deje de narrar herramientas: eso es una
propiedad de la salida de un LLM y no se puede afirmar en un test. Lo que sí se
puede afirmar, y es donde vive la causa, es el TEXTO que llega al modelo.

Dos capas, cada una capaz de fallar por su cuenta:

  V1 (este bloque, puro)  — la función de recorte hace lo que dice.
  V2 (bloque de abajo)    — alguien la enchufó. Es el fallo realista: que la
                            función exista y nadie la llame.

La lista de nombres prohibidos NUNCA se escribe a mano: sale de
`get_tools_for_role(rol)` tras `load_all_tools()`. Una herramienta nueva
anunciada en un prompt rompe este fichero sola, sin que nadie lo actualice.
"""

import pytest

from app.application.orchestrator import (
    DEFAULT_CORE_PROMPTS,
    TOOLS_CLOSE,
    TOOLS_OPEN,
    logger,
    render_identity,
)
from app.infrastructure.tools.registry import get_tools_for_role, load_all_tools

ROLES = ["CEO", "CTO", "CFO", "CMO"]

# Los tres encabezados de identidad que el recorte NO puede tocar. No todos los
# prompts tienen los tres (sólo el CEO lleva REGLAS DE COMPORTAMIENTO), así que
# la aserción es «el que estuviera, sigue estando»: misma idea que la
# intersección de BTH-002, y no se puede satisfacer vaciando el prompt.
ENCABEZADOS_DE_IDENTIDAD = [
    "IDENTIDAD Y PERSONALIDAD",
    "CONTEXTO ORGANIZACIONAL",
    "REGLAS DE COMPORTAMIENTO",
]


@pytest.fixture(scope="module", autouse=True)
def _registry_cargado():
    """El registry se llena al importar los módulos de tools, no antes."""
    load_all_tools()


def nombres_del_registry(rol: str) -> list[str]:
    return [t.name for t in get_tools_for_role(rol)]


def nombres_presentes(texto: str, rol: str) -> list[str]:
    """Qué herramientas del registry aparecen en un texto. Derivado, no a mano."""
    return sorted(n for n in nombres_del_registry(rol) if n in texto)


# --------------------------------------------------------------------------
# BTH-001 — el prompt de junta no nombra herramientas
# --------------------------------------------------------------------------


@pytest.mark.parametrize("rol", ROLES)
def test_bth001_la_identidad_de_junta_no_nombra_ninguna_herramienta(rol):
    """Ningún `t.name` del registry sobrevive al recorte de junta.

    Se afirma sobre `render_identity(..., with_tools=False)` a secas, ANTES de
    que `agent_node` concatene la cláusula: la cláusula habla de «ejecución de
    herramientas» en minúscula y contaminaría la búsqueda de `HERRAMIENTAS`.
    """
    identidad = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=False)

    fugadas = nombres_presentes(identidad, rol)
    assert not fugadas, f"{rol}: la identidad de junta nombra {fugadas}"


@pytest.mark.parametrize("rol", ROLES)
def test_bth001_la_palabra_herramientas_desaparece_del_prompt_de_junta(rol):
    """Sensible a mayúsculas a propósito: el encabezado grita, la cláusula no."""
    identidad = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=False)

    assert "HERRAMIENTAS" not in identidad, (
        f"{rol}: la identidad de junta conserva un encabezado de herramientas"
    )


# --------------------------------------------------------------------------
# BTH-002 (enmienda D7) — el chat directo conserva lo que ya anunciaba
# --------------------------------------------------------------------------


@pytest.mark.parametrize("rol", ROLES)
def test_bth002_el_chat_directo_sigue_anunciando_sus_herramientas(rol):
    """Intersección registry ∩ prompt, no el registry entero.

    El registry expone 13-15 herramientas por rol y los prompts sólo anuncian
    5-9 (`slack_*`, `notion_*`, `github_*`, `calendar_update_event`,
    `calendar_delete_event` no están en ningún prompt). Exigir «todas» era una
    aserción que fallaba antes de tocar nada y que sólo se podía satisfacer
    AMPLIANDO el anuncio de herramientas justo en el cambio que lo recorta.

    Esta es la mitad que impide «arreglar» BTH-001 vaciando el prompt para todos.
    """
    anunciadas = set(nombres_presentes(DEFAULT_CORE_PROMPTS[rol], rol))
    assert anunciadas, f"{rol}: el prompt no anuncia ninguna herramienta del registry"

    identidad = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=True)
    supervivientes = set(nombres_presentes(identidad, rol))

    perdidas = sorted(anunciadas - supervivientes)
    assert not perdidas, f"{rol}: el prompt de chat directo dejó de anunciar {perdidas}"


# --------------------------------------------------------------------------
# BTH-003 — ningún marcador se filtra al modelo
# --------------------------------------------------------------------------


@pytest.mark.parametrize("rol", ROLES)
@pytest.mark.parametrize("with_tools", [True, False])
def test_bth003_ningun_marcador_sobrevive_al_render(rol, with_tools):
    identidad = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=with_tools)

    assert TOOLS_OPEN not in identidad
    assert TOOLS_CLOSE not in identidad


@pytest.mark.parametrize("rol", ROLES)
def test_los_marcadores_estan_bien_formados_en_el_prompt_fuente(rol):
    """Exactamente un par, y en orden. Un marcador que falta SÍ es detectable.

    Éste es el contraste con el `.replace()` de un literal copiado a mano
    (`orchestrator.py:808-813`): allí una coma cambiada no produce ningún
    síntoma. Aquí, se pone rojo.
    """
    prompt = DEFAULT_CORE_PROMPTS[rol]

    assert prompt.count(TOOLS_OPEN) == 1, f"{rol}: se esperaba un solo {TOOLS_OPEN}"
    assert prompt.count(TOOLS_CLOSE) == 1, f"{rol}: se esperaba un solo {TOOLS_CLOSE}"
    assert prompt.index(TOOLS_OPEN) < prompt.index(TOOLS_CLOSE), (
        f"{rol}: {TOOLS_CLOSE} aparece antes que {TOOLS_OPEN}"
    )


@pytest.mark.parametrize("rol", ROLES)
def test_el_bloque_marcado_cubre_hasta_el_final_del_prompt(rol):
    """`[[/TOOLS]]` es la última línea, no el final de la lista de viñetas.

    El CEO lo obliga: `delegate_task` vive en el párrafo de uso que va DESPUÉS
    de las listas. Un bloque que cierre antes de ese párrafo deja el nombre
    vivo y BTH-001 se pone rojo por un motivo que cuesta leer.
    """
    prompt = DEFAULT_CORE_PROMPTS[rol]
    cola = prompt[prompt.index(TOOLS_CLOSE) + len(TOOLS_CLOSE):]

    assert cola.strip() == "", f"{rol}: queda texto tras {TOOLS_CLOSE}: {cola.strip()[:80]!r}"


# --------------------------------------------------------------------------
# BTH-004 — la identidad sobrevive al recorte
# --------------------------------------------------------------------------


@pytest.mark.parametrize("rol", ROLES)
def test_bth004_los_encabezados_de_identidad_sobreviven_al_recorte(rol):
    """El que estuviera en el prompt fuente, sigue tras recortar."""
    prompt = DEFAULT_CORE_PROMPTS[rol]
    esperados = [h for h in ENCABEZADOS_DE_IDENTIDAD if h in prompt]
    assert esperados, f"{rol}: el prompt fuente no tiene encabezados de identidad"

    identidad = render_identity(prompt, with_tools=False)

    faltan = [h for h in esperados if h not in identidad]
    assert not faltan, f"{rol}: el recorte se comió {faltan}"


@pytest.mark.parametrize("rol", ROLES)
def test_bth004_el_recorte_no_deja_el_prompt_vacio(rol):
    """Un recorte que devuelve '' pasaría BTH-001 y sería inservible."""
    identidad = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=False)

    assert len(identidad.strip()) > 200, f"{rol}: identidad de junta sospechosamente corta"
    assert "SPHERE" in identidad


# --------------------------------------------------------------------------
# Prompts sin marcadores: intactos y sin excepción
# --------------------------------------------------------------------------


@pytest.mark.parametrize("with_tools", [True, False])
def test_un_prompt_sin_marcadores_se_devuelve_intacto(with_tools):
    """`devil_node` y todo agente a medida pasan por aquí.

    `devil_node` resuelve `target_role="DEVIL"`, que no está en `CORE_ROLES` ni
    en Mongo, así que cae en `DEFAULT_CORE_PROMPTS["system"]` — sin marcadores.
    Lo mismo todo agente personalizado (`agents.py:34`). Un `raise` aquí sería
    un 500 en el chat del usuario, no un aviso para el desarrollador.
    """
    prompt = "Eres un agente a medida.\nNo tienes marcadores de ningún tipo."

    assert render_identity(prompt, with_tools=with_tools) == prompt


@pytest.mark.parametrize("with_tools", [True, False])
def test_el_prompt_system_no_tiene_marcadores_y_sale_intacto(with_tools):
    """El prompt real por el que cae `devil_node`, no uno inventado."""
    system = DEFAULT_CORE_PROMPTS["system"]
    assert TOOLS_OPEN not in system

    assert render_identity(system, with_tools=with_tools) == system


def test_render_identity_es_puro_y_no_muta_la_fuente():
    """Los prompts son constantes de módulo compartidas por todo el proceso."""
    antes = DEFAULT_CORE_PROMPTS["CFO"]
    copia = str(antes)

    render_identity(antes, with_tools=False)
    render_identity(antes, with_tools=True)

    assert DEFAULT_CORE_PROMPTS["CFO"] == copia


def test_el_recorte_de_junta_es_mas_corto_que_el_de_chat_directo():
    """Guarda contra un `render_identity` que ignore `with_tools`."""
    for rol in ROLES:
        junta = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=False)
        directo = render_identity(DEFAULT_CORE_PROMPTS[rol], with_tools=True)

        assert len(junta) < len(directo), f"{rol}: el recorte de junta no recortó nada"


# ==========================================================================
# V2 — el prompt COMPUESTO, que es lo que de verdad llega al modelo
# ==========================================================================
#
# V1 afirma que la función de recorte hace lo que dice. No puede afirmar que
# alguien la haya llamado. Éste es el fallo realista —la función existe y nadie
# la enchufa— y es el único que se ve capturando el argumento de `ainvoke`.
#
# Patrón de `tests/test_stream_billing.py`: `patch("app...orchestrator.ChatOpenAI")`.
# `get_tools_for_role` NO se parchea: el registry real tiene 13 herramientas para
# el CFO, y hace falta que la lista sea no vacía para que BTH-006 signifique algo
# (con `tools=[]`, `bind_tools` no se llamaría ni sin la guarda de board_mode).

from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

from langchain_core.messages import AIMessage  # noqa: E402

import app.application.board_v2 as board_v2_module  # noqa: E402

# El literal de la cláusula, escrito A MANO aquí. No se importa la constante:
# comparar la constante consigo misma no puede fallar nunca, que es exactamente
# el vicio del `.replace()` de `orchestrator.py:808-813`. Si alguien la retoca,
# este test se pone rojo — que es el punto.
CLAUSULA_ESPERADA = "NO afirmes haber consultado, revisado, enviado, publicado, agendado ni ejecutado"


class _LLMFalso:
    """Registra si le bindearon herramientas y con qué mensajes lo invocaron."""

    def __init__(self):
        self.bindeado = MagicMock()
        self.bindeado.ainvoke = AsyncMock(
            return_value=AIMessage(content="Respuesta del LLM bindeado.")
        )
        self.bind_tools = MagicMock(return_value=self.bindeado)
        self.ainvoke = AsyncMock(
            return_value=AIMessage(content="Mi análisis.\n[VOTO] decision=SI confianza=80")
        )


async def _ejecutar_nodo_de_junta(
    rol: str, fase: str = "analysis", prompt: str | None = None
) -> _LLMFalso:
    """Corre un nodo de director real con el LLM parcheado. Devuelve el espía."""
    llm = _LLMFalso()

    resuelto = MagicMock()
    resuelto.system_prompt = DEFAULT_CORE_PROMPTS[rol] if prompt is None else prompt
    resuelto.model = "deepseek-reasoner"
    resuelto.temperature = 0.3

    with patch(
        "app.application.agent_resolver.resolve_agent_config",
        new=AsyncMock(return_value=resuelto),
    ), patch(
        "app.application.orchestrator.retrieve_context",
        new=AsyncMock(return_value="contexto RAG de prueba"),
    ), patch(
        "app.application.orchestrator.ChatOpenAI", MagicMock(return_value=llm)
    ):
        nodo = board_v2_module.board_v2_node_factory(rol, fase)
        await nodo(
            {
                "next_agent": rol,
                "query": "¿Lanzamos el producto en Q3?",
                "user_id": None,
                "already_charged": True,
                "messages": [],
                "board_participants": ["CEO", "CTO", "CFO", "CMO"],
            }
        )

    return llm


def _texto_enviado_al_modelo(llm: _LLMFalso) -> str:
    """Texto concatenado de TODOS los mensajes que recibió `ainvoke`."""
    assert llm.ainvoke.await_count == 1, (
        f"se esperaba una llamada a ainvoke sobre el LLM sin bindear, hubo {llm.ainvoke.await_count}"
    )
    mensajes = llm.ainvoke.await_args[0][0]
    assert mensajes, "ainvoke recibió una lista de mensajes vacía"
    return "\n".join(str(getattr(m, "content", "")) for m in mensajes)


@pytest.mark.parametrize("rol", ROLES)
async def test_bth005_el_prompt_compuesto_de_junta_no_nombra_herramientas(rol):
    llm = await _ejecutar_nodo_de_junta(rol)
    texto = _texto_enviado_al_modelo(llm)

    fugadas = nombres_presentes(texto, rol)
    assert not fugadas, f"junta {rol}: el prompt compuesto nombra {fugadas}"


@pytest.mark.parametrize("rol", ROLES)
async def test_bth005_el_prompt_compuesto_lleva_la_clausula_de_no_afirmacion(rol):
    llm = await _ejecutar_nodo_de_junta(rol)
    texto = _texto_enviado_al_modelo(llm)

    assert CLAUSULA_ESPERADA in texto, (
        f"junta {rol}: el prompt compuesto no lleva la cláusula de deliberación"
    )


async def test_bth005_ningun_marcador_llega_al_modelo():
    llm = await _ejecutar_nodo_de_junta("CFO")
    texto = _texto_enviado_al_modelo(llm)

    assert TOOLS_OPEN not in texto
    assert TOOLS_CLOSE not in texto


async def test_bth005_la_identidad_del_director_sigue_llegando_al_modelo():
    """El recorte no puede dejar al CFO sonando a asistente genérico."""
    llm = await _ejecutar_nodo_de_junta("CFO")
    texto = _texto_enviado_al_modelo(llm)

    assert "Ledger" in texto
    assert "IDENTIDAD Y PERSONALIDAD" in texto
    assert "CONTEXTO ORGANIZACIONAL" in texto


@pytest.mark.parametrize("rol", ROLES)
async def test_bth006_no_se_bindean_herramientas_en_modo_junta(rol):
    """Con el registry real: si cae la guarda de `board_mode`, esto se pone rojo."""
    assert nombres_del_registry(rol), f"{rol}: el registry está vacío, el test no probaría nada"

    llm = await _ejecutar_nodo_de_junta(rol)

    assert llm.bind_tools.call_count == 0, (
        f"bind_tools invocado {llm.bind_tools.call_count} vez/veces en board_mode (esperado 0)"
    )
    assert llm.bindeado.ainvoke.await_count == 0, (
        "se invocó al LLM bindeado: la junta debe hablar con el LLM sin herramientas"
    )


# --------------------------------------------------------------------------
# Postcondición de runtime — la única red para el override del usuario
# --------------------------------------------------------------------------
#
# `system_prompt_addition` (`agent_resolver.py:69-71`) se concatena al prompt
# base SIN marcadores, así que el recorte no lo alcanza — y se deja así a
# propósito: recortar con una heurística el texto que el fundador le escribió a
# su director mutilaría instrucciones legítimas, y es suyo. Lo que sí se hace es
# no callarlo. La misma comprobación derivada del registry cubre el otro modo de
# fallo, el marcador mal puesto, que es el que no da ningún síntoma.


async def test_la_postcondicion_avisa_de_una_herramienta_que_sobrevive_al_recorte(caplog):
    import logging

    prompt_con_override = (
        DEFAULT_CORE_PROMPTS["CFO"]
        + "\n\nInstrucción del fundador: usá get_stock_data siempre que hables de bolsa."
    )

    with patch.object(logger, "propagate", True):
        with caplog.at_level(logging.WARNING, logger="sphere.checkpoint"):
            await _ejecutar_nodo_de_junta("CFO", prompt=prompt_con_override)

    assert "get_stock_data" in caplog.text, (
        "la postcondición no avisó de la herramienta que sobrevivió al recorte"
    )
    assert "CFO" in caplog.text


async def test_la_postcondicion_no_modifica_el_texto_que_llega_al_modelo(caplog):
    """Avisa y se aparta: el override del usuario llega al modelo tal cual.

    Es la diferencia entre un termómetro y un guardarraíl. Si esto empezara a
    reescribir el prompt, silenciaría al fundador sin decírselo — peor que la
    mentira que evita.
    """
    import logging

    override = "Instrucción del fundador: usá get_stock_data siempre que hables de bolsa."
    prompt_con_override = DEFAULT_CORE_PROMPTS["CFO"] + "\n\n" + override

    with patch.object(logger, "propagate", True):
        with caplog.at_level(logging.WARNING, logger="sphere.checkpoint"):
            llm = await _ejecutar_nodo_de_junta("CFO", prompt=prompt_con_override)

    texto = _texto_enviado_al_modelo(llm)
    assert override in texto, "la postcondición mutiló el texto del usuario"


async def test_sin_override_la_postcondicion_se_calla(caplog):
    """Triangulación: el aviso sale del texto, no de estar en board_mode."""
    import logging

    with patch.object(logger, "propagate", True):
        with caplog.at_level(logging.WARNING, logger="sphere.checkpoint"):
            await _ejecutar_nodo_de_junta("CFO")

    assert "identidad aún nombra" not in caplog.text
