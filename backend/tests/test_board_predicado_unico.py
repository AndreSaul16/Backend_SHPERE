"""BVT-005 — unicidad del predicado del early-exit.

El repositorio debe contener **una sola** expresión que decida el early-exit, y vive
dentro de `_tally`. Los tres consumidores (`consensus_gate_node`,
`route_after_consensus` y el emisor de `board_consensus` en `stream.py`) leen
`tally["early_exit"]`; ninguno recalcula.

La comprobación es por AST, no por grep de texto: tolera reformateo, renombrado de
locales y consumidores nuevos que lean la clave. Sólo rompe ante una comparación
copiada — que es exactamente la mutación que este test existe para atrapar.

Se barren dos formas:

1. `ast.Compare` — la copia literal del predicado.
2. `ast.JoinedStr` dentro de una llamada a `logger` — el log de `consensus_gate_node`
   interpolaba `tally['unanimous']` y `tally['avg_confidence']` sueltos, que no es una
   comparación y por tanto la regla 1 no lo ve. El log debe volcar el dict del recuento.
"""
import ast
from pathlib import Path

# Claves del recuento cuya lectura fuera de `_tally` delata un predicado recalculado.
CLAVES_DEL_PREDICADO = {"avg_confidence", "unanimous"}

# Única función autorizada a decidir el early-exit.
FUNCION_AUTORIZADA = "_tally"

_BACKEND = Path(__file__).resolve().parents[1]
FICHEROS = [
    _BACKEND / "app" / "application" / "board_v2.py",
    _BACKEND / "app" / "presentation" / "api" / "v1" / "stream.py",
]


def _menciona_el_predicado(nodo: ast.AST) -> bool:
    """True si el subárbol nombra alguna clave del predicado (subíndice, local o atributo)."""
    for hijo in ast.walk(nodo):
        if isinstance(hijo, ast.Constant) and hijo.value in CLAVES_DEL_PREDICADO:
            return True
        if isinstance(hijo, ast.Name) and hijo.id in CLAVES_DEL_PREDICADO:
            return True
        if isinstance(hijo, ast.Attribute) and hijo.attr in CLAVES_DEL_PREDICADO:
            return True
    return False


def _es_llamada_a_logger(nodo: ast.AST) -> bool:
    return (
        isinstance(nodo, ast.Call)
        and isinstance(nodo.func, ast.Attribute)
        and isinstance(nodo.func.value, ast.Name)
        and nodo.func.value.id == "logger"
    )


def _recorrer(nodo, etiqueta, dentro_de_tally, comparaciones, interpolaciones):
    for hijo in ast.iter_child_nodes(nodo):
        if isinstance(hijo, (ast.FunctionDef, ast.AsyncFunctionDef)):
            _recorrer(
                hijo,
                etiqueta,
                hijo.name == FUNCION_AUTORIZADA,
                comparaciones,
                interpolaciones,
            )
            continue
        if not dentro_de_tally:
            if isinstance(hijo, ast.Compare) and _menciona_el_predicado(hijo):
                comparaciones.append(f"{etiqueta}:{hijo.lineno}")
            if _es_llamada_a_logger(hijo):
                for argumento in hijo.args:
                    if isinstance(argumento, ast.JoinedStr) and _menciona_el_predicado(argumento):
                        interpolaciones.append(f"{etiqueta}:{argumento.lineno}")
        _recorrer(hijo, etiqueta, dentro_de_tally, comparaciones, interpolaciones)


def _barrer():
    comparaciones: list[str] = []
    interpolaciones: list[str] = []
    for ruta in FICHEROS:
        arbol = ast.parse(ruta.read_text(encoding="utf-8"), filename=str(ruta))
        _recorrer(arbol, ruta.name, False, comparaciones, interpolaciones)
    return comparaciones, interpolaciones


def test_un_solo_predicado_de_early_exit():
    """Ninguna comparación ni log fuera de `_tally` menciona `unanimous`/`avg_confidence`."""
    comparaciones, interpolaciones = _barrer()
    assert not comparaciones, (
        f"comparaciones del early-exit fuera de _tally: {comparaciones}"
    )
    assert not interpolaciones, (
        f"logs que interpolan el predicado fuera de _tally: {interpolaciones}"
    )


def test_el_barrido_ve_de_verdad_el_predicado():
    """Triangulación: el barrido detecta una copia del predicado, no devuelve
    siempre listas vacías por no encontrar nada que mirar."""
    fuente = (
        "def consumidor(tally):\n"
        "    return tally['unanimous'] and tally['avg_confidence'] >= 70\n"
    )
    comparaciones: list[str] = []
    interpolaciones: list[str] = []
    _recorrer(ast.parse(fuente), "copia.py", False, comparaciones, interpolaciones)
    assert comparaciones == ["copia.py:2"]
