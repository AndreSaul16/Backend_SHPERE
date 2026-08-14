"""Semántica única del secreto compartido con n8n y de la comparación de firmas.

Por qué existe (NWI-001): cuatro superficies leían `N8N_WEBHOOK_SECRET` por su
cuenta y se comportaban distinto ante el secreto vacío — una rechazaba, tres
firmaban con clave vacía (es decir, con firma forjable por cualquiera, porque el
esquema canónico es público). La decisión se toma **aquí**, una vez.

Por qué la comparación también (NWI-002): `hmac.compare_digest` lanza `TypeError`
con cadenas no ASCII. La guarda existía en el webhook y faltaba en el state OAuth:
la definición de un patrón que debe ser una función, no algo que se copia.

Capa `core`: la más baja. No importa de application/presentation/infrastructure.
"""
import hmac

from app.core.config import settings


class N8NSecretMissing(RuntimeError):
    """El secreto compartido con n8n está ausente, vacío o es sólo espacios.

    El texto de la excepción es el que cada superficie lleva a sus logs: así el
    nombre de la variable vive en un único fichero y la causa sigue siendo
    distinguible (configuración vs. firma inválida).
    """

    def __init__(self, message: str = "N8N_WEBHOOK_SECRET no configurado"):
        super().__init__(message)


def require_secret(secret: str | None) -> str:
    """Valida un secreto YA inyectado (no lee la configuración).

    Existe para las superficies que reciben el secreto por constructor o por
    parámetro (`N8NClient`, `canonical_sign`): así «vacío» significa lo mismo en
    todas ellas y ninguna necesita nombrar la variable de entorno.
    """
    limpio = (secret or "").strip()
    if not limpio:
        raise N8NSecretMissing()
    return limpio


def n8n_secret() -> str:
    """Devuelve el secreto configurado o lanza `N8NSecretMissing`.

    Nunca devuelve cadena vacía: sin secreto la integración está apagada, que no
    es lo mismo que «cualquier firma vale».
    """
    return require_secret(getattr(settings, "N8N_WEBHOOK_SECRET", ""))


def constant_time_equals(a: str, b: str) -> bool:
    """Comparación en tiempo constante que nunca lanza.

    Un `state` o un header manipulado con caracteres no ASCII debe ser un rechazo,
    no un 500.
    """
    try:
        return hmac.compare_digest(a, b)
    except TypeError:
        return False
