"""
Helper para inyectar credenciales de usuario en payloads de n8n.
Carga las credenciales cifradas de MongoDB, las descifra, y las prepara
para inyección en los webhooks de n8n.
"""

from typing import Optional
from app.core.credentials import credentials_service
from app.core.tool_context import get_current_user_id
from app.core.logger import checkpoint_logger as logger


# Map de servicios a sus credenciales requeridas
SERVICE_CREDENTIAL_MAP = {
    "google_calendar": ["google_calendar"],
    "whatsapp": ["whatsapp"],
    "linkedin": ["linkedin"],
    "instagram": ["instagram"],
    "jules": ["jules"],
    "financial_api": ["financial_api"],
}

# Etiquetas y campos mínimos por servicio para el pre-check de tools: llamar a
# n8n con credenciales vacías produce un 401 del proveedor → 500 de n8n → el
# usuario ve "n8n no disponible" en vez de "conecta el servicio". Validar ANTES.
SERVICE_LABELS = {
    "google_calendar": "Google (Calendar)",
    "whatsapp": "WhatsApp Business",
    "linkedin": "LinkedIn",
    "instagram": "Instagram",
    "jules": "Jules",
    "financial_api": "Datos financieros (Alpha Vantage)",
}

REQUIRED_CREDENTIAL_FIELDS = {
    "google_calendar": ["api_key"],
    "whatsapp": ["access_token", "phone_number_id"],
    "linkedin": ["access_token", "li_person_urn"],
    "instagram": ["access_token", "instagram_account_id"],
    "jules": ["api_key"],
    "financial_api": ["api_key"],
}


def missing_credential_error(creds: dict, service: str, tool_name: str):
    """Devuelve un JSON de error accionable si faltan credenciales del servicio,
    o None si están completas. Pensado para llamarse ANTES de invocar n8n."""
    import json as _json

    svc = (creds or {}).get(service) or {}
    required = REQUIRED_CREDENTIAL_FIELDS.get(service, ["api_key"])
    missing = [f for f in required if not svc.get(f)]
    if not missing:
        return None
    label = SERVICE_LABELS.get(service, service)
    if service == "google_calendar":
        hint = "Conecta Google en Settings → Connections (OAuth) para usar el calendario."
    elif service == "linkedin" and svc.get("access_token"):
        hint = (
            "Falta el URN de tu perfil: pulsa 'Probar conexión' en Settings → "
            "Connections → LinkedIn para completar la configuración."
        )
    else:
        hint = f"Configura {label} en Settings → Connections antes de usar esta herramienta."
    return _json.dumps(
        {
            "error": f"{service}_not_configured",
            "tool": tool_name,
            "missing": missing,
            "hint": hint,
        },
        ensure_ascii=False,
    )


async def load_user_credentials_for_services(
    user_id: str,
    services: list[str],
) -> dict:
    """
    Carga credenciales de múltiples servicios para un usuario.

    Args:
        user_id: Firebase UID del usuario
        services: Lista de servicios necesarios (ej: ["calendar", "whatsapp"])

    Returns:
        dict con credenciales descifradas listas para n8n:
        {
            "google_calendar": {"api_key": "...", "calendar_id": "primary"},
            "whatsapp": {"api_key": "...", "phone_number_id": "123"},
        }
    """
    if not user_id:
        return {}

    # Resolve service names to credential keys
    credential_keys = []
    for service in services:
        credential_keys.extend(SERVICE_CREDENTIAL_MAP.get(service, [service]))

    # Load credentials
    try:
        creds = await credentials_service.load_credentials_for_n8n(
            user_id, credential_keys
        )
        return creds
    except Exception as e:
        logger.warning(f"Error loading credentials for user {user_id}: {e}")
        return {}


async def inject_credentials_into_payload(
    payload: dict,
    services: list[str],
) -> tuple[dict, dict]:
    """
    Carga credenciales del usuario actual y las prepara para inyección.

    Args:
        payload: Payload original del webhook
        services: Servicios necesarios

    Returns:
        Tuple de (payload, credentials) donde credentials es el dict para n8n
    """
    user_id = get_current_user_id()
    if not user_id:
        return payload, {}

    credentials = await load_user_credentials_for_services(user_id, services)
    return payload, credentials


