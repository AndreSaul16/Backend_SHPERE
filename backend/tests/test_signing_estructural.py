"""Estructural: un solo lector del secreto n8n y un solo uso de compare_digest.

Alcance deliberado: **sólo `backend/app/**`**. `backend/main.py` queda fuera porque
es la raíz de composición (emite el CRITICAL de arranque y construye `N8NClient`);
escribirlo aquí evita que alguien "arregle" un rojo refactorizando `main.py` en vez
de dejar de leer el secreto crudo.
"""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

# Ficheros donde el literal SÍ puede aparecer, relativos a backend/app/.
LECTORES_DEL_SECRETO = {"core/config.py", "core/signing.py"}
COMPARADORES = {"core/signing.py"}


def _lineas_de_codigo(path: Path):
    """Líneas no vacías y no comentadas, con su número (1-based)."""
    for numero, linea in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        limpia = linea.strip()
        if limpia and not limpia.startswith("#"):
            yield numero, limpia


def _apariciones(literal: str, permitidos: set[str]) -> list[str]:
    hits: list[str] = []
    for py in sorted(APP.rglob("*.py")):
        rel = py.relative_to(APP).as_posix()
        if rel in permitidos:
            continue
        for numero, linea in _lineas_de_codigo(py):
            if literal in linea:
                hits.append(f"{rel}:{numero}")
    return hits


def test_secreto_tiene_un_solo_lector():
    """Una quinta superficie no puede leer el secreto crudo sin poner esto en rojo."""
    hits = _apariciones("N8N_WEBHOOK_SECRET", LECTORES_DEL_SECRETO)
    assert hits == [], f"N8N_WEBHOOK_SECRET fuera de core/: {hits}"


def test_compare_digest_no_se_usa_desnudo():
    """La guarda del TypeError existía en una superficie y faltaba en la otra:
    por eso la comparación es una función y no un patrón que se copia."""
    hits = _apariciones("hmac.compare_digest", COMPARADORES)
    assert hits == [], f"hmac.compare_digest fuera de core/signing.py: {hits}"


def test_el_escaner_ve_los_ficheros_esperados():
    """Anti-test-fantasma: si el barrido no encontrara módulos, los dos tests de
    arriba pasarían por vacío."""
    modulos = list(APP.rglob("*.py"))
    assert len(modulos) > 50, f"el barrido sólo vio {len(modulos)} módulos"
    assert (APP / "core" / "signing.py").exists()
