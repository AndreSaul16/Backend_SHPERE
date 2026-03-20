"""
Herramientas del CMO (Vortex): Redes sociales.
Conecta con n8n para LinkedIn, Instagram y otras plataformas.
"""
import json
from typing import Optional, Literal
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.tools.registry import register_role_tool
from app.tools.n8n_client import n8n_client


# ============================================================
# SCHEMAS
# ============================================================

class PostToLinkedInInput(BaseModel):
    content: str = Field(..., description="Texto del post para LinkedIn", max_length=3000)
    image_url: Optional[str] = Field(None, description="URL de imagen a adjuntar (opcional)")


class PostToInstagramInput(BaseModel):
    content: str = Field(..., description="Caption del post de Instagram", max_length=2200)
    image_url: str = Field(..., description="URL de la imagen a publicar (obligatorio para Instagram)")
    post_type: Literal["feed", "story", "reel"] = Field("feed", description="Tipo de publicación")


class GetSocialAnalyticsInput(BaseModel):
    platform: Literal["linkedin", "instagram", "all"] = Field("all", description="Plataforma a consultar")
    period: Literal["7d", "30d", "90d"] = Field("30d", description="Período de análisis")
    metrics: Optional[list[str]] = Field(
        default=["impressions", "engagement_rate", "clicks"],
        description="Métricas a incluir",
    )


class SchedulePostInput(BaseModel):
    platform: Literal["linkedin", "instagram"] = Field(..., description="Plataforma destino")
    content: str = Field(..., description="Contenido del post", max_length=3000)
    scheduled_time: str = Field(..., description="Fecha y hora de publicación en ISO 8601")
    image_url: Optional[str] = Field(None, description="URL de imagen (opcional para LinkedIn, requerido para Instagram)")


# ============================================================
# FUNCIONES
# ============================================================

async def _post_to_linkedin(content: str, image_url: Optional[str] = None) -> str:
    result = await n8n_client.call_webhook(
        "cmo/linkedin-post",
        {"content": content, "image_url": image_url},
        timeout=20.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _post_to_instagram(
    content: str, image_url: str, post_type: Literal["feed", "story", "reel"] = "feed",
) -> str:
    result = await n8n_client.call_webhook(
        "cmo/instagram-post",
        {"content": content, "image_url": image_url, "type": post_type},
        timeout=20.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _get_social_analytics(
    platform: Literal["linkedin", "instagram", "all"] = "all",
    period: Literal["7d", "30d", "90d"] = "30d",
    metrics: Optional[list[str]] = None,
) -> str:
    result = await n8n_client.call_webhook(
        "cmo/social-analytics",
        {
            "platform": platform,
            "period": period,
            "metrics": metrics or ["impressions", "engagement_rate", "clicks"],
        },
        timeout=15.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _schedule_post(
    platform: Literal["linkedin", "instagram"],
    content: str,
    scheduled_time: str,
    image_url: Optional[str] = None,
) -> str:
    result = await n8n_client.call_webhook(
        "cmo/schedule-post",
        {
            "platform": platform,
            "content": content,
            "scheduled_time": scheduled_time,
            "image_url": image_url,
        },
        timeout=15.0,
    )
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool("CMO", StructuredTool.from_function(
    coroutine=_post_to_linkedin,
    name="post_to_linkedin",
    description="Publica contenido en LinkedIn. IMPORTANTE: Muestra preview al usuario y pide confirmación antes de publicar.",
    args_schema=PostToLinkedInInput,
))

register_role_tool("CMO", StructuredTool.from_function(
    coroutine=_post_to_instagram,
    name="post_to_instagram",
    description="Publica contenido en Instagram (feed, story o reel). Requiere URL de imagen. Pide confirmación antes de publicar.",
    args_schema=PostToInstagramInput,
))

register_role_tool("CMO", StructuredTool.from_function(
    coroutine=_get_social_analytics,
    name="get_social_analytics",
    description="Obtiene métricas de redes sociales: impresiones, engagement rate, clicks por plataforma y período.",
    args_schema=GetSocialAnalyticsInput,
))

register_role_tool("CMO", StructuredTool.from_function(
    coroutine=_schedule_post,
    name="schedule_post",
    description="Programa una publicación para una fecha/hora futura en LinkedIn o Instagram.",
    args_schema=SchedulePostInput,
))
