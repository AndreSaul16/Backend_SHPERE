"""El catálogo de herramientas y las tres listas que hay que mantener a mano.

Estar en el catálogo es un compromiso: registrada, bindeada al LLM, anunciable
en los prompts y con etiqueta humana. Una herramienta cuyo endpoint externo ya
no existe no puede seguir ofreciéndose —el agente la llama, falla, y el usuario
ve una promesa rota—, así que se desregistra.

Retirar NO es borrar: el código de las tools, sus esquemas y los workflows de
n8n se quedan en el repositorio. Reactivar es borrar una línea de
`RETIRED_TOOLS`, no reescribir una integración.
"""
import re
from pathlib import Path

import pytest

from app.application.orchestrator import DEFAULT_CORE_PROMPTS
from app.infrastructure.tools.registry import (
    ROLE_TOOLS,
    SHARED_TOOLS,
    get_tools_for_role,
    load_all_tools,
)
from app.presentation.api.v1.auth import SERVICE_DEFINITIONS


RETIRADAS = {
    "create_jules_task",
    "check_jules_status",
    "review_jules_output",
    "get_market_analysis",
    "whatsapp_read_messages",
}

# Un nombre de herramienta anunciado en un prompt: viñeta, snake_case, dos puntos.
NOMBRE_EN_PROMPT = re.compile(r"^- ([a-z][a-z0-9_]{3,}):", re.MULTILINE)

# El puente entre los dos lenguajes: un pytest que lee el fichero de etiquetas
# del frontend. El coste es un regex acoplado al formato de un fichero de un
# solo propósito; a cambio no hay paso de sincronización que nadie pueda
# olvidar, que es exactamente cómo 7 herramientas OAuth se quedaron sin nombre.
RUTA_ETIQUETAS = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "components" / "chat" / "toolLabels.ts"
)
CLAVE_DE_ETIQUETA = re.compile(r"^\s*['\"]?(\w+)['\"]?\s*:", re.MULTILINE)


def _etiquetas() -> set[str]:
    """Las claves de `TOOL_LABELS`, leídas del fichero real.

    Si el fichero no existe o no se extrae ni una clave, esto FALLA. Nunca
    `pytest.skip`: un skip sería justo el «test que no puede fallar» que
    TCAT-003 prohíbe — la comprobación desaparecería sin que nadie se entere.
    """
    if not RUTA_ETIQUETAS.exists():
        raise FileNotFoundError("frontend/src/components/chat/toolLabels.ts")
    claves = set(CLAVE_DE_ETIQUETA.findall(RUTA_ETIQUETAS.read_text(encoding="utf-8")))
    assert claves, "toolLabels.ts: 0 claves extraídas"
    return claves


@pytest.fixture(scope="module")
def catalogo() -> set[str]:
    """Los nombres del registry REAL, no una lista escrita a mano."""
    load_all_tools()
    nombres = {t.name for t in SHARED_TOOLS}
    for tools_del_rol in ROLE_TOOLS.values():
        nombres |= {t.name for t in tools_del_rol}
    return nombres


# ------------------------------------------------- TCAT-001: el tamaño declarado


def test_tcat_001_el_catalogo_tiene_veintitres_herramientas(catalogo):
    assert len(catalogo) == 23


def test_tcat_001b_ninguna_retirada_sigue_registrada(catalogo):
    siguen = sorted(RETIRADAS & catalogo)

    assert siguen == [], f"retiradas pero aún registradas: {siguen}"


def test_tcat_001c_retirar_no_borra_el_codigo_de_la_herramienta():
    # La diferencia entre retirar y borrar: reactivar tiene que ser un revert.
    # Si alguien "limpia" el código de las tools retiradas, esto lo caza.
    from app.infrastructure.tools.registry import RETIRED_TOOLS

    fuente = Path(__file__).resolve().parents[1] / "app" / "infrastructure" / "tools"
    cto = (fuente / "cto_tools.py").read_text(encoding="utf-8")
    cfo = (fuente / "cfo_tools.py").read_text(encoding="utf-8")
    compartidas = (fuente / "shared_tools.py").read_text(encoding="utf-8")

    assert "async def _create_jules_task" in cto
    assert "async def _get_market_analysis" in cfo
    assert "async def _whatsapp_read_messages" in compartidas
    assert set(RETIRED_TOOLS) == RETIRADAS


# ------------------------------------ TCAT-002: ningún rol recibe las retiradas


@pytest.mark.parametrize("rol", ["CEO", "CTO", "CFO", "CMO", "ROL_QUE_NADIE_DECLARO"])
def test_tcat_002_ningun_rol_recibe_una_retirada(catalogo, rol):
    recibidas = [t.name for t in get_tools_for_role(rol)]

    coladas = [n for n in recibidas if n in RETIRADAS]
    assert coladas == [], f"rol {rol!r} recibe {coladas}"


# ------------------------------------- TCAT-004: los prompts no anuncian humo


def _nombres_anunciados() -> set[str]:
    nombres: set[str] = set()
    for prompt in DEFAULT_CORE_PROMPTS.values():
        nombres |= set(NOMBRE_EN_PROMPT.findall(prompt))
    return nombres


def test_tcat_004_todo_nombre_anunciado_esta_registrado(catalogo):
    huerfanas = sorted(_nombres_anunciados() - catalogo)

    assert huerfanas == [], f"prompts nombran herramientas no registradas: {huerfanas}"


def test_tcat_004b_el_extractor_de_prompts_encuentra_algo():
    # Auto-comprobación: si el regex deja de casar con el formato de los
    # prompts, el test anterior pasaría siempre sin mirar nada.
    anunciadas = _nombres_anunciados()

    assert len(anunciadas) >= 8, f"solo se extrajeron {len(anunciadas)} nombres: {anunciadas}"
    assert "delegate_task" in anunciadas


# --------------- La tercera lista a mano: la que se enseña en Settings


def test_las_herramientas_de_settings_existen_en_el_catalogo(catalogo):
    # `SERVICE_DEFINITIONS` es la lista que ve el usuario al conectar un
    # servicio. Prometer ahí una herramienta que no existe es la misma mentira
    # que anunciarla en un prompt, pero delante del usuario.
    prometidas = {
        nombre
        for definicion in SERVICE_DEFINITIONS.values()
        for nombre in definicion.get("tools", [])
    }

    fantasmas = sorted(prometidas - catalogo)
    assert fantasmas == [], f"Settings ofrece herramientas no registradas: {fantasmas}"


# ------------------ TCAT-003: ninguna herramienta ofrecida sin etiqueta


def test_tcat_003_paridad_entre_catalogo_y_etiquetas(catalogo):
    # Los dos sentidos en el mismo test, a propósito: si el fichero de
    # etiquetas desaparece, el resultado tiene que ser exactamente `1 failed`.
    etiquetas = _etiquetas()

    sin_etiqueta = sorted(catalogo - etiquetas)
    assert sin_etiqueta == [], f"en el catálogo pero sin etiqueta: {sin_etiqueta}"

    sobran = sorted(etiquetas - catalogo)
    assert sobran == [], f"etiquetadas pero no registradas: {sobran}"
