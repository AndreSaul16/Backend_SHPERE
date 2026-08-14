"""
Servicio de whitelist de contactos por usuario.
Los tools de envío externo (WhatsApp, Calendar, Slack) verifican
que el destinatario esté autorizado antes de ejecutar.
"""
import re
from datetime import datetime, timezone
from typing import Optional

from app.infrastructure.database import get_contacts_collection


# Normalización de contactos
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PHONE_E164_REGEX = re.compile(r"^\+[1-9]\d{1,14}$")


def normalize_contact(contact_type: str, value: str) -> str:
    """Normaliza un valor de contacto según su tipo."""
    if contact_type == "email":
        return value.lower().strip()
    elif contact_type == "phone":
        # Eliminar espacios, guiones, paréntesis
        cleaned = re.sub(r"[\s\-\(\)]", "", value)
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned
        return cleaned
    else:
        return value.strip()


def validate_contact(contact_type: str, value: str) -> bool:
    """Valida formato de un contacto."""
    if contact_type == "email":
        return bool(EMAIL_REGEX.match(value))
    elif contact_type == "phone":
        return bool(PHONE_E164_REGEX.match(value))
    return len(value) > 0


async def is_authorized(
    user_id: str,
    tool_name: str,
    contact_value: str,
    contact_type: Optional[str] = None,
) -> bool:
    """
    Verifica si un contacto está autorizado para un tool específico.
    
    Args:
        user_id: ID del usuario
        tool_name: Nombre del tool (ej: "whatsapp_send_message")
        contact_value: Valor del contacto (email, phone, channel)
        contact_type: Tipo de contacto (opcional, se filtra por)
    """
    col = get_contacts_collection()
    normalized = contact_value.lower().strip()

    # Buscar tanto por value (teléfono/email) como por display_name (nombre).
    # Los agentes LLM suelen pasar nombres ("Ruben Lima"), no números — si solo
    # buscamos por value, el contacto aparece como no autorizado aunque exista.
    query = {
        "user_id": user_id,
        "$or": [
            {"value": normalized},
            {"display_name": normalized},
        ],
        "authorized_for": tool_name,
    }
    if contact_type:
        query["type"] = contact_type

    contact = await col.find_one(query)
    return contact is not None


async def list_contacts(user_id: str) -> list[dict]:
    """Lista todos los contactos del usuario.

    Conserva `_id` (ObjectId) para que el endpoint pueda exponerlo como `id`
    y el frontend pueda borrar el contacto. Antes se hacía pop("_id") → el id
    llegaba vacío y el botón de borrar no funcionaba."""
    col = get_contacts_collection()
    contacts = []
    async for c in col.find({"user_id": user_id}).sort("added_at", -1):
        c.pop("user_id", None)
        contacts.append(c)
    return contacts


async def add_contact(
    user_id: str,
    contact_type: str,
    value: str,
    display_name: Optional[str] = None,
    authorized_for: Optional[list[str]] = None,
) -> dict:
    """
    Agrega un contacto a la whitelist del usuario.
    Upsert por (user_id, type, value).
    """
    if not validate_contact(contact_type, value):
        raise ValueError(f"Formato de {contact_type} inválido: {value}")

    normalized = normalize_contact(contact_type, value)

    col = get_contacts_collection()
    doc = {
        "user_id": user_id,
        "type": contact_type,
        "value": normalized,
        "display_name": display_name,
        "authorized_for": authorized_for or [],
        "added_at": datetime.now(timezone.utc),
    }

    await col.update_one(
        {"user_id": user_id, "type": contact_type, "value": normalized},
        {"$set": doc},
        upsert=True,
    )

    # Releer el documento para devolver su `_id` real (necesario para que el
    # frontend pueda borrarlo). El upsert no devuelve el doc completo.
    saved = await col.find_one(
        {"user_id": user_id, "type": contact_type, "value": normalized}
    )
    return saved or doc


async def remove_contact(user_id: str, contact_id: str):
    """Elimina un contacto de la whitelist. Tolera ids malformados (no 500)."""
    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        oid = ObjectId(contact_id)
    except (InvalidId, TypeError):
        return False
    col = get_contacts_collection()
    result = await col.delete_one({"_id": oid, "user_id": user_id})
    return result.deleted_count > 0
