"""
Herramientas del CMO (Vortex): Redes sociales.
Conecta con n8n para LinkedIn, Instagram y otras plataformas.

Las acciones públicas (post_to_linkedin, post_to_instagram, schedule_post)
requieren confirmación explícita del usuario vía el parámetro `confirmed=True`
cuando `tool_confirmation_level` del usuario no es "never".

Las credenciales de LinkedIn/Instagram se inyectan automáticamente
desde credential_injector.
"""

import json
from typing import Optional, Literal
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.infrastructure.tools.registry import register_role_tool
from app.infrastructure.tools.n8n_client import n8n_client
from app.infrastructure.tools.credential_injector import (
    inject_credentials_into_payload,
    missing_credential_error,
)
from app.core.tool_context import requires_confirmation, get_current_user_id
from app.core.logger import checkpoint_logger as logger


def _confirmation_required_error(tool_name: str, action_summary: str) -> str:
    """
    Error estructurado cuando la tool requiere confirmación explícita.
    El LLM lo interpreta y pregunta al usuario antes de reintentar con confirmed=True.
    """
    return json.dumps(
        {
            "error": "confirmation_required",
            "tool": tool_name,
            "action_summary": action_summary,
            "hint": (
                f"Esta acción ('{tool_name}') es pública y requiere confirmación "
                f"explícita del usuario. Muestra al usuario: '{action_summary}'. "
                f"Si el usuario confirma, llama al tool de nuevo con confirmed=True."
            ),
        },
        ensure_ascii=False,
    )


# ============================================================
# SCHEMAS
# ============================================================


class PostToLinkedInInput(BaseModel):
    content: str = Field(
        ..., description="Texto del post para LinkedIn", max_length=3000
    )
    image_url: Optional[str] = Field(
        None, description="URL de imagen a adjuntar (opcional)"
    )
    confirmed: bool = Field(
        False,
        description="Solo setear a True si el usuario ha confirmado explícitamente la publicación.",
    )


class PostToInstagramInput(BaseModel):
    content: str = Field(
        ..., description="Caption del post de Instagram", max_length=2200
    )
    image_url: str = Field(
        ..., description="URL de la imagen a publicar (obligatorio para Instagram)"
    )
    post_type: Literal["feed", "story", "reel"] = Field(
        "feed", description="Tipo de publicación"
    )
    confirmed: bool = Field(
        False,
        description="Solo setear a True si el usuario ha confirmado explícitamente la publicación.",
    )


class GetSocialAnalyticsInput(BaseModel):
    platform: Literal["linkedin", "instagram", "all"] = Field(
        "all", description="Plataforma a consultar"
    )
    period: Literal["7d", "30d", "90d"] = Field(
        "30d", description="Período de análisis"
    )
    metrics: Optional[list[str]] = Field(
        default=["impressions", "engagement_rate", "clicks"],
        description="Métricas a incluir",
    )


class SchedulePostInput(BaseModel):
    platform: Literal["linkedin", "instagram"] = Field(
        ..., description="Plataforma destino"
    )
    content: str = Field(..., description="Contenido del post", max_length=3000)
    scheduled_time: str = Field(
        ..., description="Fecha y hora de publicación en ISO 8601"
    )
    image_url: Optional[str] = Field(
        None,
        description="URL de imagen (opcional para LinkedIn, requerido para Instagram)",
    )
    confirmed: bool = Field(
        False,
        description="Solo setear a True si el usuario ha confirmado explícitamente programar el post.",
    )


# ============================================================
# FUNCIONES
# ============================================================


async def _post_to_linkedin(
    content: str,
    image_url: Optional[str] = None,
    confirmed: bool = False,
) -> str:
    if requires_confirmation("post_to_linkedin") and not confirmed:
        summary = (
            f"Publicar en LinkedIn: '{content[:120]}...'"
            if len(content) > 120
            else f"Publicar en LinkedIn: '{content}'"
        )
        logger.info(f"post_to_linkedin bloqueado por confirmación requerida")
        return _confirmation_required_error("post_to_linkedin", summary)

    payload = {"content": content, "image_url": image_url}
    payload, creds = await inject_credentials_into_payload(payload, ["linkedin"])
    err = missing_credential_error(creds, "linkedin", "post_to_linkedin")
    if err:
        return err
    result = await n8n_client.call_webhook(
        "cmo/linkedin-post",
        payload,
        timeout=20.0,
        user_credentials=creds,
    )
    return json.dumps(result, ensure_ascii=False)


async def _post_to_instagram(
    content: str,
    image_url: str,
    post_type: Literal["feed", "story", "reel"] = "feed",
    confirmed: bool = False,
) -> str:
    if requires_confirmation("post_to_instagram") and not confirmed:
        summary = (
            f"Publicar en Instagram ({post_type}): '{content[:120]}...'"
            if len(content) > 120
            else f"Publicar en Instagram ({post_type}): '{content}'"
        )
        logger.info(f"post_to_instagram bloqueado por confirmación requerida")
        return _confirmation_required_error("post_to_instagram", summary)

    payload = {"content": content, "image_url": image_url, "type": post_type}
    payload, creds = await inject_credentials_into_payload(payload, ["instagram"])
    err = missing_credential_error(creds, "instagram", "post_to_instagram")
    if err:
        return err
    result = await n8n_client.call_webhook(
        "cmo/instagram-post",
        payload,
        timeout=20.0,
        user_credentials=creds,
    )
    return json.dumps(result, ensure_ascii=False)


async def _get_social_analytics(
    platform: Literal["linkedin", "instagram", "all"] = "all",
    period: Literal["7d", "30d", "90d"] = "30d",
    metrics: Optional[list[str]] = None,
) -> str:
    payload = {
        "platform": platform,
        "period": period,
        "metrics": metrics or ["impressions", "engagement_rate", "clicks"],
    }
    services = ["linkedin", "instagram"] if platform == "all" else [platform]
    payload, creds = await inject_credentials_into_payload(payload, services)
    # El workflow solo soporta métricas de Instagram (para LinkedIn responde con
    # una nota honesta), así que solo Instagram se pre-valida.
    if platform in ("instagram", "all"):
        err = missing_credential_error(creds, "instagram", "get_social_analytics")
        if err:
            return err
    result = await n8n_client.call_webhook(
        "cmo/social-analytics",
        payload,
        timeout=15.0,
        user_credentials=creds,
    )
    return json.dumps(result, ensure_ascii=False)


async def _schedule_post(
    platform: Literal["linkedin", "instagram"],
    content: str,
    scheduled_time: str,
    image_url: Optional[str] = None,
    confirmed: bool = False,
) -> str:
    if requires_confirmation("schedule_post") and not confirmed:
        summary = (
            f"Programar post en {platform} para {scheduled_time}: '{content[:120]}...'"
            if len(content) > 120
            else f"Programar post en {platform} para {scheduled_time}: '{content}'"
        )
        return _confirmation_required_error("schedule_post", summary)

    payload = {
        "platform": platform,
        "content": content,
        "scheduled_time": scheduled_time,
        "image_url": image_url,
        # F9: user_id viaja al workflow para que el callback n8n→backend sepa a
        # quién notificar el resultado de la publicación.
        "user_id": get_current_user_id(),
    }
    service = "linkedin" if platform == "linkedin" else "instagram"
    payload, creds = await inject_credentials_into_payload(payload, [service])
    err = missing_credential_error(creds, service, "schedule_post")
    if err:
        return err
    result = await n8n_client.call_webhook(
        "cmo/schedule-post",
        payload,
        timeout=15.0,
        user_credentials=creds,
    )
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool(
    "CMO",
    StructuredTool.from_function(
        coroutine=_post_to_linkedin,
        name="post_to_linkedin",
        description="Publica contenido en LinkedIn. IMPORTANTE: Muestra preview al usuario y pide confirmación antes de publicar.",
        args_schema=PostToLinkedInInput,
    ),
)

register_role_tool(
    "CMO",
    StructuredTool.from_function(
        coroutine=_post_to_instagram,
        name="post_to_instagram",
        description="Publica contenido en Instagram (feed, story o reel). Requiere URL de imagen. Pide confirmación antes de publicar.",
        args_schema=PostToInstagramInput,
    ),
)

register_role_tool(
    "CMO",
    StructuredTool.from_function(
        coroutine=_get_social_analytics,
        name="get_social_analytics",
        description="Obtiene métricas de redes sociales: impresiones, engagement rate, clicks por plataforma y período.",
        args_schema=GetSocialAnalyticsInput,
    ),
)

register_role_tool(
    "CMO",
    StructuredTool.from_function(
        coroutine=_schedule_post,
        name="schedule_post",
        description="Programa una publicación para una fecha/hora futura en LinkedIn o Instagram.",
        args_schema=SchedulePostInput,
    ),
)
