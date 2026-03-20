"""
Herramientas compartidas: Google Calendar + WhatsApp.
Disponibles para TODOS los agentes C-Suite.
"""
import json
from typing import Optional
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.tools.registry import register_shared_tool
from app.tools.n8n_client import n8n_client
from app.core.logger import checkpoint_logger as logger


# ============================================================
# GOOGLE CALENDAR TOOLS
# ============================================================

class CalendarListEventsInput(BaseModel):
    date_from: str = Field(..., description="Fecha inicio en formato ISO 8601 (ej: '2026-03-20')")
    date_to: str = Field(..., description="Fecha fin en formato ISO 8601 (ej: '2026-03-21')")
    max_results: int = Field(10, ge=1, le=50, description="Número máximo de eventos a retornar")


class CalendarCreateEventInput(BaseModel):
    title: str = Field(..., description="Título del evento o reunión", max_length=200)
    start_time: str = Field(..., description="Hora de inicio en ISO 8601 (ej: '2026-03-20T10:00:00')")
    end_time: str = Field(..., description="Hora de fin en ISO 8601 (ej: '2026-03-20T11:00:00')")
    description: Optional[str] = Field(None, description="Descripción del evento", max_length=1000)
    attendees: Optional[list[str]] = Field(None, description="Lista de emails de asistentes")


class CalendarUpdateEventInput(BaseModel):
    event_id: str = Field(..., description="ID del evento a modificar")
    title: Optional[str] = Field(None, description="Nuevo título", max_length=200)
    start_time: Optional[str] = Field(None, description="Nueva hora de inicio ISO 8601")
    end_time: Optional[str] = Field(None, description="Nueva hora de fin ISO 8601")
    description: Optional[str] = Field(None, description="Nueva descripción", max_length=1000)


class CalendarDeleteEventInput(BaseModel):
    event_id: str = Field(..., description="ID del evento a eliminar")


class CalendarCheckAvailabilityInput(BaseModel):
    date: str = Field(..., description="Fecha a consultar en formato ISO 8601 (ej: '2026-03-20')")
    duration_minutes: int = Field(60, ge=15, le=480, description="Duración deseada en minutos")


async def _calendar_list_events(date_from: str, date_to: str, max_results: int = 10) -> str:
    result = await n8n_client.call_webhook(
        "shared/calendar-list",
        {"date_from": date_from, "date_to": date_to, "max_results": max_results},
    )
    return json.dumps(result, ensure_ascii=False)


async def _calendar_create_event(
    title: str, start_time: str, end_time: str,
    description: Optional[str] = None, attendees: Optional[list[str]] = None,
) -> str:
    result = await n8n_client.call_webhook(
        "shared/calendar-create",
        {
            "title": title, "start_time": start_time, "end_time": end_time,
            "description": description, "attendees": attendees or [],
        },
    )
    return json.dumps(result, ensure_ascii=False)


async def _calendar_update_event(
    event_id: str, title: Optional[str] = None,
    start_time: Optional[str] = None, end_time: Optional[str] = None,
    description: Optional[str] = None,
) -> str:
    payload = {"event_id": event_id}
    if title: payload["title"] = title
    if start_time: payload["start_time"] = start_time
    if end_time: payload["end_time"] = end_time
    if description: payload["description"] = description
    result = await n8n_client.call_webhook("shared/calendar-update", payload)
    return json.dumps(result, ensure_ascii=False)


async def _calendar_delete_event(event_id: str) -> str:
    result = await n8n_client.call_webhook("shared/calendar-delete", {"event_id": event_id})
    return json.dumps(result, ensure_ascii=False)


async def _calendar_check_availability(date: str, duration_minutes: int = 60) -> str:
    result = await n8n_client.call_webhook(
        "shared/calendar-availability",
        {"date": date, "duration_minutes": duration_minutes},
    )
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# WHATSAPP TOOLS
# ============================================================

class WhatsAppSendMessageInput(BaseModel):
    to: str = Field(..., description="Nombre del contacto o número de teléfono")
    message: str = Field(..., description="Contenido del mensaje", max_length=4096)


class WhatsAppSendNotificationInput(BaseModel):
    group: str = Field(..., description="Nombre del grupo de equipo (ej: 'Junta Directiva', 'Desarrollo')")
    message: str = Field(..., description="Contenido de la notificación", max_length=4096)
    priority: Optional[str] = Field("normal", description="Prioridad: 'high', 'normal', 'low'")


class WhatsAppReadMessagesInput(BaseModel):
    from_contact: Optional[str] = Field(None, description="Filtrar por contacto remitente")
    limit: int = Field(10, ge=1, le=50, description="Número máximo de mensajes")
    since: Optional[str] = Field(None, description="Desde qué fecha ISO 8601")


async def _whatsapp_send_message(to: str, message: str) -> str:
    result = await n8n_client.call_webhook(
        "shared/whatsapp-send",
        {"to": to, "message": message},
    )
    return json.dumps(result, ensure_ascii=False)


async def _whatsapp_send_notification(
    group: str, message: str, priority: Optional[str] = "normal",
) -> str:
    result = await n8n_client.call_webhook(
        "shared/whatsapp-notify",
        {"group": group, "message": message, "priority": priority},
    )
    return json.dumps(result, ensure_ascii=False)


async def _whatsapp_read_messages(
    from_contact: Optional[str] = None, limit: int = 10, since: Optional[str] = None,
) -> str:
    payload: dict = {"limit": limit}
    if from_contact: payload["from"] = from_contact
    if since: payload["since"] = since
    result = await n8n_client.call_webhook("shared/whatsapp-read", payload)
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO DE TOOLS COMPARTIDAS
# ============================================================

register_shared_tool(StructuredTool.from_function(
    coroutine=_calendar_list_events,
    name="calendar_list_events",
    description="Lista eventos del calendario de Google en un rango de fechas. Solo lectura.",
    args_schema=CalendarListEventsInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_calendar_create_event,
    name="calendar_create_event",
    description="Crea un nuevo evento o reunión en Google Calendar con título, hora y asistentes opcionales.",
    args_schema=CalendarCreateEventInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_calendar_update_event,
    name="calendar_update_event",
    description="Modifica un evento existente de Google Calendar (título, hora, descripción).",
    args_schema=CalendarUpdateEventInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_calendar_delete_event,
    name="calendar_delete_event",
    description="Elimina un evento de Google Calendar por su ID.",
    args_schema=CalendarDeleteEventInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_calendar_check_availability,
    name="calendar_check_availability",
    description="Verifica disponibilidad horaria en una fecha para encontrar slots libres.",
    args_schema=CalendarCheckAvailabilityInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_whatsapp_send_message,
    name="whatsapp_send_message",
    description="Envía un mensaje de texto por WhatsApp a un contacto específico.",
    args_schema=WhatsAppSendMessageInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_whatsapp_send_notification,
    name="whatsapp_send_notification",
    description="Envía una notificación al grupo de equipo por WhatsApp.",
    args_schema=WhatsAppSendNotificationInput,
))

register_shared_tool(StructuredTool.from_function(
    coroutine=_whatsapp_read_messages,
    name="whatsapp_read_messages",
    description="Lee mensajes recientes de WhatsApp, opcionalmente filtrados por contacto.",
    args_schema=WhatsAppReadMessagesInput,
))
