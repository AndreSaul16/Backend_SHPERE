"""
Modelo Pydantic para el perfil de usuario multi-tenant.
Schema rico que habilita personalización de agentes, preferencias de UI,
y contexto profesional que se inyecta en system prompts.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class UIPreferences(BaseModel):
    theme: Literal["dark", "light", "system"] = "system"
    accent_color: str = "#7c3aed"
    locale: str = "es-ES"
    timezone: str = "Europe/Madrid"
    artifact_default_open: bool = True
    tool_confirmation_level: Literal["always", "destructive_only", "never"] = "destructive_only"


class ProfessionalProfile(BaseModel):
    role: Optional[str] = None
    industry: Optional[str] = None
    company_name: Optional[str] = None
    company_stage: Optional[str] = None
    team_size: Optional[int] = None


class CommunicationStyle(BaseModel):
    tone: Literal["formal", "casual"] = "casual"
    verbosity: Literal["concise", "detailed"] = "concise"
    language_register: Optional[str] = None


class FinancialPreferences(BaseModel):
    base_currency: str = "EUR"
    fiscal_year_start_month: int = Field(1, ge=1, le=12)


class UsageInfo(BaseModel):
    token_budget_daily: int = 100_000
    tokens_used_today: int = 0
    tokens_reset_at: datetime
    requests_in_current_window: int = 0


class SubscriptionInfo(BaseModel):
    plan_id: Literal["free"] = "free"
    status: Literal["active", "past_due", "canceled"] = "active"
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False


class WalletInfo(BaseModel):
    pro_messages_balance: int = 5
    pro_messages_granted_this_period: int = 5
    last_period_reset: Optional[datetime] = None
    topup_messages_balance: int = 0


class UserLimits(BaseModel):
    rag_storage_bytes_used: int = 0
    custom_agents_count: int = 0


class UserResponse(BaseModel):
    """Respuesta del perfil de usuario (sin datos sensibles)."""
    firebase_uid: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    created_at: datetime
    last_login_at: datetime
    onboarding_completed: bool = False
    ui_preferences: UIPreferences = UIPreferences()
    professional_profile: ProfessionalProfile = ProfessionalProfile()
    communication_style: CommunicationStyle = CommunicationStyle()
    financial_preferences: FinancialPreferences = FinancialPreferences()
    personal_kb_enabled: bool = True
    feature_flags: List[str] = []
    connected_providers: List[str] = []
    usage: Optional[UsageInfo] = None
    subscription: SubscriptionInfo = SubscriptionInfo()
    wallet: WalletInfo = WalletInfo()
    limits: UserLimits = UserLimits()
    # ¿Panel de administración? Lo calcula el endpoint con `es_admin`; NO sale
    # del documento de Mongo (nadie es admin por tener un campo puesto a mano).
    # Por defecto False: quien construya un UserResponse sin decidirlo no
    # reparte accesos por olvido.
    is_admin: bool = False


class UserUpdateRequest(BaseModel):
    """Actualización parcial del perfil del usuario."""
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    ui_preferences: Optional[UIPreferences] = None
    professional_profile: Optional[ProfessionalProfile] = None
    communication_style: Optional[CommunicationStyle] = None
    financial_preferences: Optional[FinancialPreferences] = None
    personal_kb_enabled: Optional[bool] = None
