"""
API de perfil de usuario - /me endpoints.
Gestión del perfil, onboarding, overrides de agentes y uso de tokens.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import pymongo

from app.core.auth import get_current_user
from app.infrastructure.database import (
    get_users_collection,
    get_user_agent_overrides_collection,
)
from app.domain.models.user import UserResponse, UserUpdateRequest
from app.core.logger import api_logger as logger

router = APIRouter()


# --- /me endpoints ---


@router.get("/me", response_model=UserResponse)
async def get_my_profile(user: dict = Depends(get_current_user)):
    """Devuelve el perfil completo del usuario autenticado."""
    return UserResponse(**user)


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    updates: UserUpdateRequest,
    user: dict = Depends(get_current_user),
):
    """Actualización parcial del perfil del usuario."""
    users_col = get_users_collection()
    update_data = {}

    if updates.display_name is not None:
        update_data["display_name"] = updates.display_name
    if updates.avatar_url is not None:
        update_data["avatar_url"] = updates.avatar_url
    if updates.ui_preferences is not None:
        for field, value in updates.ui_preferences.model_dump(
            exclude_unset=True
        ).items():
            update_data[f"ui_preferences.{field}"] = value
    if updates.professional_profile is not None:
        for field, value in updates.professional_profile.model_dump(
            exclude_unset=True
        ).items():
            update_data[f"professional_profile.{field}"] = value
    if updates.communication_style is not None:
        for field, value in updates.communication_style.model_dump(
            exclude_unset=True
        ).items():
            update_data[f"communication_style.{field}"] = value
    if updates.financial_preferences is not None:
        for field, value in updates.financial_preferences.model_dump(
            exclude_unset=True
        ).items():
            update_data[f"financial_preferences.{field}"] = value
    if updates.personal_kb_enabled is not None:
        update_data["personal_kb_enabled"] = updates.personal_kb_enabled

    if not update_data:
        return UserResponse(**user)

    result = await users_col.find_one_and_update(
        {"firebase_uid": user["firebase_uid"]},
        {"$set": update_data},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    result.pop("_id", None)
    logger.info(f"Perfil actualizado para usuario: {user['firebase_uid']}")
    return UserResponse(**result)


@router.post("/me/onboarding/complete")
async def complete_onboarding(user: dict = Depends(get_current_user)):
    """Marca el onboarding como completado."""
    users_col = get_users_collection()
    await users_col.update_one(
        {"firebase_uid": user["firebase_uid"]},
        {"$set": {"onboarding_completed": True}},
    )
    return {"status": "ok", "onboarding_completed": True}


@router.get("/me/usage")
async def get_my_usage(user: dict = Depends(get_current_user)):
    """Devuelve el uso de tokens y rate limiting del usuario."""
    usage = user.get("usage", {})
    return {
        "token_budget_daily": usage.get("token_budget_daily", 100_000),
        "tokens_used_today": usage.get("tokens_used_today", 0),
        "tokens_reset_at": usage.get("tokens_reset_at"),
        "requests_in_current_window": usage.get("requests_in_current_window", 0),
    }


@router.get("/me/storage")
async def get_my_storage(user: dict = Depends(get_current_user)):
    """Devuelve el uso real de almacenamiento de documentos (GridFS) del usuario,
    la cuota de su plan y el número de archivos. Multi-tenant: solo cuenta los
    archivos cuyo metadata.user_id coincide con el usuario autenticado.
    """
    from app.infrastructure.database import get_gridfs_bucket
    from app.core.plan_limits import get_plan_id, get_rag_quota_bytes

    user_id = user["firebase_uid"]
    bucket = get_gridfs_bucket()

    used_bytes = 0
    file_count = 0
    try:
        async for f in bucket.find({"metadata.user_id": user_id}):
            meta = f.metadata or {}
            used_bytes += int(meta.get("file_size_bytes", getattr(f, "length", 0)) or 0)
            file_count += 1
    except Exception as e:
        logger.warning(f"No se pudo calcular uso de GridFS para {user_id}: {e}")
        # Fallback al contador mantenido en el doc de usuario.
        used_bytes = int((user.get("limits") or {}).get("rag_storage_bytes_used", 0) or 0)

    plan_id = get_plan_id(user)
    quota_bytes = get_rag_quota_bytes(plan_id)

    return {
        "plan_id": plan_id,
        "used_bytes": used_bytes,
        "quota_bytes": quota_bytes,
        "file_count": file_count,
        "percent_used": round(min(100.0, (used_bytes / quota_bytes) * 100), 1) if quota_bytes else 0.0,
    }


# --- Agent Overrides ---


class AgentOverrideRequest(BaseModel):
    system_prompt_addition: Optional[str] = None
    temperature_override: Optional[float] = None
    model_override: Optional[str] = None


class AgentOverrideResponse(BaseModel):
    agent_role: str
    system_prompt_addition: Optional[str] = None
    temperature_override: Optional[float] = None
    model_override: Optional[str] = None
    updated_at: datetime


@router.get("/me/agent-overrides", response_model=List[AgentOverrideResponse])
async def list_agent_overrides(user: dict = Depends(get_current_user)):
    """Lista todos los overrides de agentes del usuario."""
    col = get_user_agent_overrides_collection()
    overrides = []
    async for doc in col.find({"user_id": user["firebase_uid"]}):
        doc.pop("_id", None)
        doc.pop("user_id", None)
        overrides.append(AgentOverrideResponse(**doc))
    return overrides


@router.put("/me/agent-overrides/{agent_role}", response_model=AgentOverrideResponse)
async def upsert_agent_override(
    agent_role: str,
    body: AgentOverrideRequest,
    user: dict = Depends(get_current_user),
):
    """Crea o actualiza un override para un agente del sistema."""
    col = get_user_agent_overrides_collection()

    now = datetime.now(timezone.utc)
    update_fields = {"updated_at": now}

    if body.system_prompt_addition is not None:
        update_fields["system_prompt_addition"] = body.system_prompt_addition
    if body.temperature_override is not None:
        update_fields["temperature_override"] = body.temperature_override
    if body.model_override is not None:
        update_fields["model_override"] = body.model_override

    result = await col.find_one_and_update(
        {"user_id": user["firebase_uid"], "agent_role": agent_role},
        {
            "$set": update_fields,
            "$setOnInsert": {
                "user_id": user["firebase_uid"],
                "agent_role": agent_role,
            },
        },
        upsert=True,
        return_document=pymongo.ReturnDocument.AFTER,
    )

    result.pop("_id", None)
    result.pop("user_id", None)
    logger.info(
        f"Override de agente actualizado: {agent_role} para {user['firebase_uid']}"
    )
    return AgentOverrideResponse(**result)


@router.delete("/me/agent-overrides/{agent_role}")
async def delete_agent_override(
    agent_role: str,
    user: dict = Depends(get_current_user),
):
    """Elimina un override de agente, volviendo al default del sistema."""
    col = get_user_agent_overrides_collection()
    result = await col.delete_one(
        {"user_id": user["firebase_uid"], "agent_role": agent_role}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Override no encontrado")
    return {"status": "deleted", "agent_role": agent_role}


# --- Contacts (whitelist) ---


class ContactCreateRequest(BaseModel):
    type: str  # "email", "phone", "slack_channel", "github_user", "linkedin_handle"
    value: str
    display_name: Optional[str] = None
    authorized_for: List[str] = []


class ContactResponse(BaseModel):
    id: str
    type: str
    value: str
    display_name: Optional[str] = None
    authorized_for: List[str] = []
    added_at: datetime


@router.get("/me/contacts", response_model=List[ContactResponse])
async def list_my_contacts(user: dict = Depends(get_current_user)):
    """Lista los contactos autorizados del usuario."""
    from app.core.contacts_service import list_contacts

    contacts = await list_contacts(user["firebase_uid"])
    return [
        ContactResponse(
            id=str(c.get("_id", "")), **{k: v for k, v in c.items() if k != "_id"}
        )
        for c in contacts
    ]


@router.post("/me/contacts", response_model=ContactResponse)
async def add_my_contact(
    body: ContactCreateRequest,
    user: dict = Depends(get_current_user),
):
    """Agrega un contacto a la whitelist."""
    from app.core.contacts_service import add_contact

    try:
        contact = await add_contact(
            user_id=user["firebase_uid"],
            contact_type=body.type,
            value=body.value,
            display_name=body.display_name,
            authorized_for=body.authorized_for,
        )
        return ContactResponse(
            id=str(contact.get("_id", "")),
            **{k: v for k, v in contact.items() if k not in ("_id",)},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me/contacts/{contact_id}")
async def remove_my_contact(
    contact_id: str,
    user: dict = Depends(get_current_user),
):
    """Elimina un contacto de la whitelist."""
    from app.core.contacts_service import remove_contact

    removed = await remove_contact(user["firebase_uid"], contact_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    return {"status": "deleted"}


# --- Service Credentials (API Keys for external services) ---


SERVICE_DEFINITIONS = {
    # NOTA: Google Calendar NO está aquí: se conecta vía OAuth (integrations/google),
    # porque la Google Calendar API requiere un access_token OAuth2, no una api_key.
    "linkedin": {
        "label": "LinkedIn",
        "credential_type": "oauth_token",
        "fields": ["access_token"],
        "metadata_fields": [],
        "description": "Permite al CMO publicar contenido en tu perfil de LinkedIn.",
        "tools": [
            "post_to_linkedin",
            "get_social_analytics",
            "schedule_post",
        ],
    },
    "whatsapp": {
        "label": "WhatsApp Business",
        "credential_type": "api_key",
        "fields": ["access_token"],
        "metadata_fields": ["phone_number_id"],
        "description": "Permite enviar mensajes por WhatsApp Business API.",
        "tools": [
            "whatsapp_send_message",
            "whatsapp_send_notification",
        ],
    },
    "instagram": {
        "label": "Instagram",
        "credential_type": "oauth_token",
        "fields": ["access_token"],
        "metadata_fields": ["instagram_account_id"],
        "description": "Permite al CMO publicar contenido en Instagram.",
        "tools": [
            "post_to_instagram",
            "get_social_analytics",
            "schedule_post",
        ],
    },
    "financial_api": {
        "label": "Datos financieros (Alpha Vantage)",
        "credential_type": "api_key",
        "fields": ["api_key"],
        "metadata_fields": [],
        "description": (
            "Permite al CFO consultar noticias y cotizaciones. "
            "Consigue una API key gratuita en alphavantage.co."
        ),
        "tools": [
            "get_financial_news",
            "get_stock_data",
        ],
    },
}


class ServiceCredentialCreateRequest(BaseModel):
    service: str
    api_key: str
    metadata: dict = {}


class ServiceCredentialResponse(BaseModel):
    id: str
    service: str
    credential_type: str
    metadata: dict = {}
    created_at: datetime
    updated_at: datetime
    connected: bool = True


class ServiceCredentialTestResult(BaseModel):
    service: str
    success: bool
    message: str


@router.get("/me/service-credentials")
async def list_service_credentials(user: dict = Depends(get_current_user)):
    """Lista las credenciales de servicios externos del usuario."""
    from app.core.credentials import credentials_service

    credentials = await credentials_service.list_service_credentials(
        user["firebase_uid"]
    )

    # Merge con definiciones de servicios
    result = []
    for service_id, definition in SERVICE_DEFINITIONS.items():
        connected_cred = next(
            (c for c in credentials if c["service"] == service_id), None
        )
        result.append(
            {
                "service": service_id,
                "label": definition["label"],
                "description": definition["description"],
                "credential_type": definition["credential_type"],
                "connected": connected_cred is not None,
                "metadata": connected_cred["metadata"] if connected_cred else {},
                "created_at": connected_cred["created_at"] if connected_cred else None,
                "tools": definition.get("tools", []),
            }
        )

    return {"services": result, "available": list(SERVICE_DEFINITIONS.keys())}


@router.post("/me/service-credentials")
async def store_service_credential(
    body: ServiceCredentialCreateRequest,
    user: dict = Depends(get_current_user),
):
    """Almacena o actualiza una credencial de servicio."""
    from app.core.credentials import credentials_service

    if body.service not in SERVICE_DEFINITIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Servicio '{body.service}' no soportado. Usa: {', '.join(SERVICE_DEFINITIONS.keys())}",
        )

    if not body.api_key or not body.api_key.strip():
        raise HTTPException(status_code=400, detail="La API key no puede estar vacía")

    definition = SERVICE_DEFINITIONS[body.service]

    await credentials_service.store_service_credential(
        user_id=user["firebase_uid"],
        service=body.service,
        api_key=body.api_key.strip(),
        credential_type=definition["credential_type"],
        metadata=body.metadata,
    )

    logger.info(
        f"Service credential '{body.service}' stored for user {user['firebase_uid']}"
    )
    return {"status": "stored", "service": body.service}


@router.delete("/me/service-credentials/{service}")
async def delete_service_credential(
    service: str,
    user: dict = Depends(get_current_user),
):
    """Elimina (revoca) una credencial de servicio."""
    from app.core.credentials import credentials_service

    if service not in SERVICE_DEFINITIONS:
        raise HTTPException(
            status_code=400, detail=f"Servicio '{service}' no soportado"
        )

    revoked = await credentials_service.revoke_service_credential(
        user["firebase_uid"], service
    )

    if not revoked:
        raise HTTPException(
            status_code=404, detail=f"Credencial para '{service}' no encontrada"
        )

    return {"status": "deleted", "service": service}


@router.post("/me/service-credentials/{service}/test")
async def test_service_credential(
    service: str,
    user: dict = Depends(get_current_user),
):
    """Prueba la conexión con un servicio externo usando las credenciales almacenadas."""
    from app.core.credentials import credentials_service

    if service not in SERVICE_DEFINITIONS:
        raise HTTPException(
            status_code=400, detail=f"Servicio '{service}' no soportado"
        )

    cred = await credentials_service.get_service_credential_with_metadata(
        user["firebase_uid"], service
    )

    if not cred:
        raise HTTPException(
            status_code=404,
            detail=f"No hay credenciales para '{service}'. Configúralas primero.",
        )

    # Test connection based on service type
    try:
        import httpx

        if service == "google_calendar":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                    params={"maxResults": 1},
                    headers={"Authorization": f"Bearer {cred['key']}"},
                )
                if resp.status_code == 200:
                    return {
                        "service": service,
                        "success": True,
                        "message": "Conexión exitosa con Google Calendar",
                    }
                return {
                    "service": service,
                    "success": False,
                    "message": f"Error HTTP {resp.status_code}",
                }

        elif service == "linkedin":
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.linkedin.com/v2/me",
                    headers={"Authorization": f"Bearer {cred['key']}"},
                )
                if resp.status_code == 200:
                    # Derivar y persistir el URN de la persona: la API ugcPosts
                    # exige author="urn:li:person:{id}" real y el usuario no
                    # tiene forma razonable de conocer su id a mano.
                    person_id = (resp.json() or {}).get("id")
                    if person_id:
                        await credentials_service.store_service_credential(
                            user["firebase_uid"],
                            service,
                            cred["key"],
                            credential_type="oauth_token",
                            metadata={
                                **cred.get("metadata", {}),
                                "li_person_urn": str(person_id),
                            },
                        )
                    return {
                        "service": service,
                        "success": True,
                        "message": "Conexión exitosa con LinkedIn"
                        + ("" if person_id else " (no se pudo derivar el URN de persona)"),
                    }
                return {
                    "service": service,
                    "success": False,
                    "message": f"Error HTTP {resp.status_code}",
                }

        elif service == "whatsapp":
            phone_id = cred.get("metadata", {}).get("phone_number_id", "")
            if not phone_id:
                return {
                    "service": service,
                    "success": False,
                    "message": "Phone Number ID no configurado",
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"https://graph.facebook.com/v18.0/{phone_id}",
                    params={"access_token": cred["key"]},
                )
                if resp.status_code == 200:
                    return {
                        "service": service,
                        "success": True,
                        "message": "Conexión exitosa con WhatsApp Business",
                    }
                return {
                    "service": service,
                    "success": False,
                    "message": f"Error HTTP {resp.status_code}",
                }

        elif service == "jules":
            # Jules no expone endpoint de verificación: ser honestos en vez de
            # devolver un check verde que sugiere una validación que no ocurrió.
            return {
                "service": service,
                "success": True,
                "verified": False,
                "message": (
                    "API key almacenada. Jules no ofrece verificación previa: "
                    "se validará en el primer uso real."
                ),
            }

        elif service == "instagram":
            # Validar contra la MISMA API que usa el workflow de publicación
            # (graph.facebook.com + instagram_account_id). El antiguo test contra
            # graph.instagram.com/me pasaba en verde con credenciales que luego
            # fallaban al publicar.
            account_id = cred.get("metadata", {}).get("instagram_account_id", "")
            if not account_id:
                return {
                    "service": service,
                    "success": False,
                    "message": "Instagram Account ID no configurado",
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"https://graph.facebook.com/v18.0/{account_id}",
                    params={"fields": "username", "access_token": cred["key"]},
                )
                if resp.status_code == 200:
                    return {
                        "service": service,
                        "success": True,
                        "message": "Conexión exitosa con Instagram",
                    }
                return {
                    "service": service,
                    "success": False,
                    "message": f"Error HTTP {resp.status_code}",
                }

        elif service == "financial_api":
            # Alpha Vantage responde 200 incluso con key inválida: hay que mirar
            # el cuerpo (Global Quote presente = key válida).
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://www.alphavantage.co/query",
                    params={
                        "function": "GLOBAL_QUOTE",
                        "symbol": "IBM",
                        "apikey": cred["key"],
                    },
                )
                data = resp.json() if resp.status_code == 200 else {}
                if "Global Quote" in data:
                    return {
                        "service": service,
                        "success": True,
                        "message": "Conexión exitosa con Alpha Vantage",
                    }
                detail = data.get("Information") or data.get("Error Message") or f"HTTP {resp.status_code}"
                return {
                    "service": service,
                    "success": False,
                    "message": f"Alpha Vantage rechazó la key: {str(detail)[:150]}",
                }

        return {
            "service": service,
            "success": False,
            "message": "Test no implementado para este servicio",
        }

    except Exception as e:
        logger.error(f"Error testing {service} credential: {e}")
        return {"service": service, "success": False, "message": f"Error: {str(e)}"}


# --- Board Meeting Settings ---


class BoardSettingsResponse(BaseModel):
    board_meeting_enabled: bool = False
    board_iterations: int = 1
    board_devils_advocate: bool = False


class BoardSettingsUpdateRequest(BaseModel):
    board_meeting_enabled: Optional[bool] = None
    board_iterations: Optional[int] = None
    board_devils_advocate: Optional[bool] = None


@router.get("/me/board-settings", response_model=BoardSettingsResponse)
async def get_board_settings(user: dict = Depends(get_current_user)):
    """Obtiene la configuración de Board Meeting del usuario."""
    users_col = get_users_collection()
    user_doc = await users_col.find_one(
        {"firebase_uid": user["firebase_uid"]},
        {"board_meeting_enabled": 1, "board_iterations": 1, "board_devils_advocate": 1},
    )

    if not user_doc:
        return BoardSettingsResponse()

    return BoardSettingsResponse(
        board_meeting_enabled=user_doc.get("board_meeting_enabled", False),
        board_iterations=user_doc.get("board_iterations", 1),
        board_devils_advocate=user_doc.get("board_devils_advocate", False),
    )


@router.patch("/me/board-settings", response_model=BoardSettingsResponse)
async def update_board_settings(
    body: BoardSettingsUpdateRequest,
    user: dict = Depends(get_current_user),
):
    """Actualiza la configuración de Board Meeting."""
    users_col = get_users_collection()

    update_data = {}
    if body.board_meeting_enabled is not None:
        update_data["board_meeting_enabled"] = body.board_meeting_enabled
    if body.board_iterations is not None:
        if body.board_iterations != 1:
            raise HTTPException(
                status_code=400, detail="board_iterations solo acepta 1 (único modo disponible)"
            )
        update_data["board_iterations"] = body.board_iterations
    if body.board_devils_advocate is not None:
        update_data["board_devils_advocate"] = body.board_devils_advocate

    if not update_data:
        return await get_board_settings(user)

    result = await users_col.find_one_and_update(
        {"firebase_uid": user["firebase_uid"]},
        {"$set": update_data},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return BoardSettingsResponse(
        board_meeting_enabled=result.get("board_meeting_enabled", False),
        board_iterations=result.get("board_iterations", 1),
        board_devils_advocate=result.get("board_devils_advocate", False),
    )
