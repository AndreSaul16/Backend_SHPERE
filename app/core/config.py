from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ruta al .env en la raíz del proyecto
ENV_FILE_PATH = Path(__file__).resolve().parents[3] / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "SPHERE Backend Orchestrator"
    API_V1_STR: str = "/api/v1"
    
    # Variable obligatoria
    MONGODB_URL: str

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=str(ENV_FILE_PATH),
        extra="ignore"  # Ignorar variables extra del .env
    )

settings = Settings()