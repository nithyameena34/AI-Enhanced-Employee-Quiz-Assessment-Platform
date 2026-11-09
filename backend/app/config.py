from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    app_name: str = "AI Employee Assessment Platform"
    debug: bool = True
    database_url: str = f"sqlite:///{(ROOT_DIR / 'backend' / 'employee_assessment.db').as_posix()}"
    secret_key: str = "development-only-change-this-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    groq_api_key: str = ""
    admin_registration_code: str = ""

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

settings = Settings()
