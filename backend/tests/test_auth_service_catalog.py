"""
SCT-001/002 — el catálogo de servicios y el código que los prueba no divergen en silencio.

`test_service_credential` empieza con `if service not in SERVICE_DEFINITIONS: raise 400`.
Toda rama `service == "X"` con `X` fuera de ese conjunto es CÓDIGO INALCANZABLE: la guarda
responde antes de llegar a ella. Y al revés, una clave sin rama cae al retorno final y le
contesta «Test no implementado para este servicio» a un servicio que el usuario sí puede
conectar. Por eso la aserción es de IGUALDAD y no de inclusión: la divergencia tiene dos
sentidos y los dos duelen.

La comprobación lee el CÓDIGO FUENTE real (mismo patrón que `test_tool_catalog.py`), nunca
una lista escrita a mano. Un test por HTTP —llamar al endpoint con `jules` y esperar 400—
pasa HOY, con las dos ramas muertas dentro: observa la guarda, no el código que la guarda
vuelve inalcanzable.
"""
import inspect
import re

from app.presentation.api.v1 import auth
from app.presentation.api.v1.auth import SERVICE_DEFINITIONS

# Un literal comparado con `service` dentro del endpoint: `service == "linkedin"`.
COMPARACION_CON_SERVICIO = re.compile(r"""service\s*==\s*["']([a-z_]+)["']""")


def _servicios_comparados_en_el_endpoint() -> set[str]:
    fuente = inspect.getsource(auth.test_service_credential)
    return set(COMPARACION_CON_SERVICIO.findall(fuente))


def test_sct_002_el_extractor_se_autocomprueba():
    """Si el patrón deja de encontrar literales, el test FALLA. Nunca `skip`.

    Un skip haría desaparecer la comprobación sin que nadie se entere, que es la forma
    silenciosa de perder un invariante.
    """
    servicios = _servicios_comparados_en_el_endpoint()

    assert servicios, "0 servicios extraídos de test_service_credential"


def test_sct_001_las_ramas_del_test_de_conexion_coinciden_con_el_catalogo():
    """GIVEN el catálogo / THEN el conjunto de ramas es exactamente ese, en los dos sentidos."""
    servicios = _servicios_comparados_en_el_endpoint()
    catalogo = set(SERVICE_DEFINITIONS)

    inalcanzables = sorted(servicios - catalogo)
    sin_rama = sorted(catalogo - servicios)

    assert inalcanzables == [], (
        f"ramas sin entrada en SERVICE_DEFINITIONS: {inalcanzables}"
    )
    assert sin_rama == [], (
        f"servicios en SERVICE_DEFINITIONS sin rama de test: {sin_rama}"
    )


def test_sct_001_el_catalogo_no_se_ha_quedado_vacio():
    """Red de la red: con `SERVICE_DEFINITIONS` vacío la igualdad de arriba sería trivial."""
    assert set(SERVICE_DEFINITIONS) == {"linkedin", "whatsapp", "instagram", "financial_api"}
