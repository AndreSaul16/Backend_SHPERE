from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ruta al .env en la raíz del proyecto
ENV_FILE_PATH = Path(__file__).resolve().parents[3] / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "SPHERE Backend Orchestrator"
    API_V1_STR: str = "/api/v1"

    # Variable obligatoria
    MONGODB_URL: str

    # CORS — en producción, set to comma-separated list of frontend URLs
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # n8n - Workflow Automation
    N8N_BASE_URL: str = "http://n8n:5678"
    N8N_WEBHOOK_SECRET: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=str(ENV_FILE_PATH),
        extra="ignore"  # Ignorar variables extra del .env
    )

settings = Settings()