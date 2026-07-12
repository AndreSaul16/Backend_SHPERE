from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ruta al .env en la raíz del proyecto
ENV_FILE_PATH = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "SPHERE Backend Orchestrator"
    API_V1_STR: str = "/api/v1"

    # Entorno: "production" (default, estricto) | "development" (laxo, dev-only)
    ENVIRONMENT: str = "production"

    # Deploy metadata — inyectados por Railway en el build
    GIT_COMMIT_SHA: str = ""
    BUILD_TIMESTAMP: str = ""

    # Variable obligatoria
    MONGODB_URL: str
    DB_NAME: str = "sphere_db"

    # CORS — en producción, set to comma-separated list of frontend URLs
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # n8n - Workflow Automation
    N8N_BASE_URL: str = "http://n8n:5678"
    N8N_WEBHOOK_SECRET: str = ""
    N8N_API_KEY: str = ""  # API key para gestionar workflows (X-N8N-API-KEY)

    # Firebase Auth
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_CREDENTIALS_JSON: str = ""  # Contenido del JSON (Railway-friendly)

    # Cifrado de tokens OAuth en reposo.
    # FERNET_KEY: clave principal (retrocompat).
    # FERNET_KEYS: lista separada por comas, la PRIMERA es la activa (cifra) y el
    # resto son claves antiguas que aún deben poder DESCIFRAR datos existentes.
    # Para rotar: pones la nueva clave al frente de FERNET_KEYS, dejas la vieja
    # detrás; cuando todos los datos estén re-cifrados, eliminas la vieja.
    FERNET_KEY: str = ""
    FERNET_KEYS: str = ""

    # OAuth (BYO): cada usuario registra su propia OAuth app (client_id/secret),
    # cifrada por-usuario en la colección user_oauth_apps. NO hay client_id/secret
    # globales. Lo único global es el callback, que el usuario whitelistea en su
    # app del provider. En prod debe apuntar al backend público, p.ej.
    # https://<backend>/api/v1/integrations
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:8000/api/v1/integrations"

    # OAuth app COMPARTIDA de Google (opcional). Si se configura, los usuarios
    # pueden conectar Google Calendar sin crear su propia app (sin fricción BYO).
    # Una app BYO registrada por el usuario siempre tiene prioridad.
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Rate Limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 30
    TOKEN_BUDGET_DAILY_DEFAULT: int = 100_000
    TOKEN_BUDGET_RESET_HOUR_UTC: int = 0

    # GridFS Quota
    GRIDFS_QUOTA_MB_PER_USER: int = 500

    # Timeouts
    OPENAI_TIMEOUT: float = 15.0
    DEEPSEEK_TIMEOUT: float = 60.0
    EXTERNAL_API_TIMEOUT: float = 30.0

    # DeepSeek
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # Board Meeting V2 (debate paralelo + triage + votos + devil + acta).
    # Si se desactiva, el board usa el grafo secuencial legacy (rollback por env var).
    BOARD_V2_ENABLED: bool = True

    # OpenAI
    OPENAI_API_KEY: str = ""

    # Stripe (pagos)
    # Modelo solo-créditos: Free (30 créditos/mes gratis) + compras puntuales de
    # créditos (packs de recarga + top-ups). NO hay suscripciones de pago: todo lo
    # de pago es one-time (mode=payment). Crea los productos en el dashboard Stripe
    # con scripts/stripe_bootstrap.py y pega los Price IDs aquí.
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_EXECUTIVE: str = ""      # Executive Pack — 150 créditos — 39€
    STRIPE_PRICE_DIRECTOR: str = ""       # Director Pack — 500 créditos — 139€
    STRIPE_PRICE_BOARDROOM: str = ""      # Boardroom Pack — 2.000 créditos — 550€
    STRIPE_PRICE_QUICK_MEETING: str = ""  # Quick Meeting — 25 créditos — 7,99€
    STRIPE_PRICE_DEEP_DIVE: str = ""      # Deep Dive — 50 créditos — 14,99€
    FRONTEND_URL: str = "http://localhost:5173"

    # Admin: emails con acceso al panel /admin (separados por coma).
    ADMIN_EMAILS: str = ""

    @property
    def admin_emails_list(self) -> list[str]:
        """Lista de emails admin normalizados (minúsculas, sin espacios)."""
        return [e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()]

    @property
    def topup_messages_map(self) -> dict[str, int]:
        """Mapeo SKU -> créditos que otorga esa compra puntual.

        Modelo de créditos ponderados: 1 chat (1 agente) = 1 crédito;
        1 board meeting = 5 créditos. Incluye packs de recarga (executive/
        director/boardroom) y top-ups rápidos (quick_meeting/deep_dive). Todos
        son one-time: suman a wallet.topup_messages_balance (no caducan)."""
        return {
            # Packs de recarga
            "executive": 150,
            "director": 500,
            "boardroom": 2000,
            # Top-ups rápidos
            "quick_meeting": 25,
            "deep_dive": 50,
        }

    @property
    def plan_messages_map(self) -> dict[str, int]:
        """Mapeo plan_id -> créditos mensuales que otorga el plan.

        Solo existe el plan Free: 30 créditos/mes gratis (≈30 chats o ~6 board
        meetings). Todo lo demás se compra como créditos puntuales."""
        return {
            "free": 30,
        }

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def fernet_keys_list(self) -> list[str]:
        """Claves Fernet en orden de prioridad (la primera cifra; todas descifran).
        Combina FERNET_KEYS (lista) y FERNET_KEY (legacy) sin duplicar."""
        keys: list[str] = []
        for k in (self.FERNET_KEYS or "").split(","):
            k = k.strip()
            if k and k not in keys:
                keys.append(k)
        legacy = (self.FERNET_KEY or "").strip()
        if legacy and legacy not in keys:
            keys.append(legacy)
        return keys

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() in ("development", "dev", "local")

    @property
    def stripe_configured(self) -> bool:
        """True cuando STRIPE_SECRET_KEY está configurada (no vacía).
        Usado por el frontend para decidir si mostrar UI de pagos."""
        return bool(self.STRIPE_SECRET_KEY and self.STRIPE_SECRET_KEY.strip())

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=str(ENV_FILE_PATH),
        extra="ignore",  # Ignorar variables extra del .env
    )


settings = Settings()
