"""
Modelo de credenciales de servicios externos cifradas en reposo.
Cada usuario tiene sus propias credenciales por servicio.
Se inyectan en los payloads de n8n para que los workflows las usen.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, timezone
from uuid import uuid4


class ServiceCredential(BaseModel):
    """Credencial de servicio almacenada en MongoDB."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    service: str  # "google_calendar", "linkedin", "whatsapp", "jules", "instagram"
    credential_type: Literal["api_key", "oauth_token", "service_account"] = "api_key"
    key_enc: bytes  # Cifrado con Fernet
    metadata: dict = {}  # Calendar ID, Phone Number ID, etc. (no sensible)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: Optional[datetime] = None


class ServiceCredentialCreate(BaseModel):
    """Payload para crear/actualizar una credencial de servicio."""

    service: str = Field(
        ...,
        description="Nombre del servicio: google_calendar, linkedin, whatsapp, jules, instagram",
    )
    credential_type: Literal["api_key", "oauth_token", "service_account"] = "api_key"
    api_key: str = Field(..., description="API Key o token del servicio", min_length=1)
    metadata: dict = Field(
        default_factory=dict,
        description="Metadata adicional (Calendar ID, Phone Number ID, etc.)",
    )


class ServiceCredentialResponse(BaseModel):
    """Respuesta pública (sin exponer la key)."""

    id: str
    service: str
    credential_type: str
    metadata: dict = {}
    created_at: datetime
    updated_at: datetime
    connected: bool = True


class ServiceCredentialTestResult(BaseModel):
    """Resultado del test de conexión."""

    service: str
    success: bool
    message: str
    details: dict = {}
