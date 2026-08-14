"""
Modelo de "OAuth app" por usuario (BYO — Bring Your Own).

Cada usuario registra su PROPIA OAuth app (client_id + client_secret) de GitHub,
Notion o Slack. El backend cifra el client_secret con Fernet y lo usa para el
flujo OAuth de ese usuario. El callback (redirect_uri) es ÚNICO y global
(OAUTH_REDIRECT_BASE_URL/{provider}/callback): el usuario lo whitelistea al crear
su app en el provider. Los scopes son fijos por provider (no los elige el usuario).
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, timezone
from uuid import uuid4


Provider = Literal["github", "notion", "slack"]


class OAuthApp(BaseModel):
    """OAuth app de un usuario almacenada en MongoDB (colección user_oauth_apps)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    provider: Provider
    client_id: str  # No secreto; se guarda en claro para poder mostrarlo
    client_secret_enc: bytes  # Cifrado con Fernet
    scopes: list[str] = []  # Fijos por provider (informativo)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: Optional[datetime] = None


class OAuthAppCreate(BaseModel):
    """Payload para registrar/actualizar la OAuth app de un usuario."""

    client_id: str = Field(..., description="Client ID de la OAuth app", min_length=1)
    client_secret: str = Field(
        ..., description="Client Secret de la OAuth app", min_length=1
    )


class OAuthAppResponse(BaseModel):
    """Respuesta pública (NUNCA expone el client_secret)."""

    provider: str
    client_id: str
    scopes: list[str] = []
    created_at: datetime
    updated_at: datetime
    connected: bool = True
