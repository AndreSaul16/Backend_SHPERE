"""Troceado del contenido del acta en bloques Notion (<=2000 chars).

Una acta real supera los 2000 chars y Notion rechaza cualquier text.content por
encima de ese límite: meter todo en un bloque hacía fallar la exportación.
"""
from app.infrastructure.tools.clients.notion_client import _content_to_blocks, _NOTION_TEXT_LIMIT


def test_contenido_corto_un_bloque():
    blocks = _content_to_blocks("Hola mundo")
    assert len(blocks) == 1
    assert blocks[0]["paragraph"]["rich_text"][0]["text"]["content"] == "Hola mundo"


def test_contenido_vacio_sin_bloques():
    assert _content_to_blocks("") == []


def test_ningun_bloque_supera_el_limite():
    # Acta larga simulada: 50 líneas de 100 chars = 5000 chars.
    contenido = "\n".join("x" * 100 for _ in range(50))
    blocks = _content_to_blocks(contenido)
    assert len(blocks) > 1
    for b in blocks:
        assert len(b["paragraph"]["rich_text"][0]["text"]["content"]) <= _NOTION_TEXT_LIMIT


def test_linea_unica_mas_larga_que_el_limite_se_parte():
    contenido = "y" * 5000  # una sola línea sin saltos
    blocks = _content_to_blocks(contenido)
    assert len(blocks) == 3  # 2000 + 2000 + 1000
    for b in blocks:
        assert len(b["paragraph"]["rich_text"][0]["text"]["content"]) <= _NOTION_TEXT_LIMIT


def test_maximo_100_bloques():
    contenido = "\n".join("z" * 1999 for _ in range(200))
    blocks = _content_to_blocks(contenido)
    assert len(blocks) <= 100
