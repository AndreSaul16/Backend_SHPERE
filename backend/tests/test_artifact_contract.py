"""El contrato del artefacto: qué tipo se acepta, qué se juzga y qué no.

Funciones puras: nada de esto necesita levantar el stream. El único test que
sale del módulo es AC-001, y sale a propósito — cruza las tres fuentes que
tienen que decir lo mismo (lista blanca, prompt del modelo y los dos mapas de
tipos del cliente) para que separarlas ponga la suite en rojo.
"""
import re
from pathlib import Path

from app.application.artifact_contract import (
    ARTIFACT_MAX_BYTES,
    ARTIFACT_TYPES,
    check_content,
    normalize_type,
    prompt_type_list,
    recortar_a_presupuesto,
)

RAIZ = Path(__file__).resolve().parents[2]


# --- AC-001 · una sola lista blanca, cruzada con las otras dos fuentes -------


def _tipos_del_prompt() -> set[str]:
    """Los tipos que el modelo lee en la etiqueta `type="…"` del prompt."""
    from app.application.orchestrator import AGENT_PROMPT_TEMPLATE

    linea = re.search(r"<sphere_artifact[^>]*>", AGENT_PROMPT_TEMPLATE)
    assert linea, "el prompt ya no contiene la etiqueta <sphere_artifact ...>"
    tipos = re.search(r'type="([^"]+)"', linea.group(0))
    assert tipos, "la etiqueta del prompt ya no ofrece un atributo type"
    return set(tipos.group(1).split("|"))


def _tipos_del_cliente(ruta_relativa: str) -> set[str]:
    """Las claves de `TIPOS_DE_ARTEFACTO` en un fichero .ts del frontend."""
    texto = (RAIZ / ruta_relativa).read_text(encoding="utf-8")
    bloque = re.search(
        r"const TIPOS_DE_ARTEFACTO[^=]*=\s*\{(.*?)\}", texto, re.DOTALL
    )
    assert bloque, f"no se encontró TIPOS_DE_ARTEFACTO en {ruta_relativa}"
    return set(re.findall(r"'([^']+)'\s*:", bloque.group(1)))


def test_ac001_el_prompt_ofrece_exactamente_la_lista_blanca():
    assert _tipos_del_prompt() == set(ARTIFACT_TYPES.values()), (
        f"el prompt ofrece {_tipos_del_prompt()} "
        f"y la lista blanca {set(ARTIFACT_TYPES.values())}"
    )


def test_ac001_los_dos_mapas_del_cliente_no_pueden_separarse_de_la_lista():
    canonicos = set(ARTIFACT_TYPES.values())

    streaming = _tipos_del_cliente("frontend/src/store/chat/streamHandlers.ts")
    historial = _tipos_del_cliente("frontend/src/store/chat/historyMapper.ts")

    assert streaming == canonicos, (
        f"streamHandlers.ts traduce {streaming} y la lista blanca es {canonicos}"
    )
    assert historial == canonicos, (
        f"historyMapper.ts traduce {historial} y la lista blanca es {canonicos}"
    )


def test_ac001_svg_es_un_tipo_de_primera_clase():
    # `PRODUCT.md` promete el SVG como artefacto, `SvgViewer` existe y sanea, y
    # `getDownloadExtension` ya devuelve `.svg`. Lo único que faltaba era que
    # alguien se lo dijera al modelo.
    assert "svg" in ARTIFACT_TYPES
    assert "svg" in prompt_type_list()


def test_ac001_prompt_type_list_es_la_lista_blanca_en_texto():
    assert set(prompt_type_list().split("|")) == set(ARTIFACT_TYPES.values())


# --- AC-002 · normalizar sí, adivinar nunca --------------------------------


def test_ac002a_caja_y_espacios_se_normalizan():
    assert normalize_type(" MarkDown ") == ("markdown", "ok")


def test_ac002a_un_tipo_canonico_pasa_tal_cual():
    assert normalize_type("mermaid") == ("mermaid", "ok")


def test_ac002b_un_tipo_mal_escrito_no_se_corrige():
    efectivo, veredicto = normalize_type("markdwon")

    assert efectivo == "code"
    assert veredicto == "unknown"


def test_ac002b_gemelo_no_se_deduce_markdown_por_parecido():
    # La distancia de edición entre "markdwon" y "markdown" es 1. Corregirlo
    # sería adivinar: acertaría casi siempre y, cuando fallara, pintaría el
    # documento bajo un tipo que no es y con más confianza que antes.
    assert normalize_type("markdwon")[0] != "markdown"
    assert normalize_type("cvs")[0] != "csv"
    assert normalize_type("mermeid")[0] != "mermaid"


def test_ac002_tipo_ausente_o_vacio_cae_a_code_sin_ruido():
    # Sin atributo `type` el default histórico es `code`; eso no es un tipo
    # desconocido declarado por el modelo, así que no lleva veredicto.
    assert normalize_type("") == ("code", "ok")
    assert normalize_type(None) == ("code", "ok")


# --- AC-005 · el presupuesto vive aquí -------------------------------------


def test_ac005_el_presupuesto_es_256_kb():
    assert ARTIFACT_MAX_BYTES == 262144


def test_ac005_lo_que_cabe_pasa_entero_y_no_agota():
    texto, bytes_nuevos, agotado = recortar_a_presupuesto("hola", 0)

    assert texto == "hola"
    assert bytes_nuevos == 4
    assert agotado is False


def test_ac005_lo_que_no_cabe_se_recorta_y_agota():
    ya = ARTIFACT_MAX_BYTES - 3
    texto, bytes_nuevos, agotado = recortar_a_presupuesto("abcdef", ya)

    assert texto == "abc"
    assert bytes_nuevos == 3
    assert agotado is True


def test_ac005_con_el_presupuesto_ya_agotado_no_pasa_nada():
    texto, bytes_nuevos, agotado = recortar_a_presupuesto("mas texto", ARTIFACT_MAX_BYTES)

    assert texto == ""
    assert bytes_nuevos == 0
    assert agotado is True


def test_ac005_el_recorte_no_parte_un_caracter_por_la_mitad():
    # "€" ocupa 3 bytes en UTF-8. Si sólo cabe 1, no se emite medio carácter.
    ya = ARTIFACT_MAX_BYTES - 1
    texto, bytes_nuevos, agotado = recortar_a_presupuesto("€", ya)

    assert texto == ""
    assert agotado is True
    assert bytes_nuevos == 1


# --- AC-006 · coherencia entre el tipo declarado y el contenido -------------


def test_ac006_csv_sin_separador_es_mismatch():
    assert check_content("csv", "Esto es un párrafo en prosa sin tabla ninguna") == "mismatch"


def test_ac006_csv_con_separador_es_ok():
    assert check_content("csv", "Director,Voto,Confianza\nCTO,SI,90") == "ok"
    assert check_content("csv", "A;B;C\n1;2;3") == "ok"
    assert check_content("csv", "| A | B |\n|---|---|") == "ok"
    assert check_content("csv", "A\tB\n1\t2") == "ok"


def test_ac006_mermaid_que_no_empieza_por_diagrama_es_mismatch():
    assert check_content("mermaid", "Aquí tienes el diagrama:\ngraph TD; A-->B;") == "mismatch"


def test_ac006_mermaid_valido_es_ok():
    assert check_content("mermaid", "graph TD;\n A-->B;") == "ok"
    assert check_content("mermaid", "\n\nsequenceDiagram\n A->>B: hola") == "ok"


def test_ac006_svg_sin_raiz_es_mismatch():
    assert check_content("svg", "<div>esto no es un svg</div>") == "mismatch"


def test_ac006_svg_con_raiz_es_ok():
    assert check_content("svg", '<svg viewBox="0 0 10 10"><rect/></svg>') == "ok"


def test_ac006b_el_markdown_no_se_juzga():
    # Cualquier texto es markdown válido: la afirmación es infalsificable y por
    # eso no se comprueba nada, en vez de fingir que sí.
    assert check_content("markdown", "cualquier cosa") == "unchecked"
    assert check_content("markdown", "") == "unchecked"


def test_ac006b_el_code_tampoco_se_juzga():
    assert check_content("code", "esto no compila en ningún lenguaje {{{") == "unchecked"


def test_ac006_contenido_vacio_no_se_juzga():
    # Un artefacto sin contenido no es incoherente con su tipo: no hay nada que
    # contrastar. Llamarlo `mismatch` sería un aviso sobre la nada.
    assert check_content("csv", "   \n  ") == "unchecked"
    assert check_content("mermaid", "") == "unchecked"
