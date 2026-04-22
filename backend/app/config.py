from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        # Railway / Render / Heroku provide postgresql:// — asyncpg needs +asyncpg
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # App
    app_name: str = "Dottle"
    app_version: str = "0.1.0"
    environment: str = "development"
    secret_key: str = "change-me-to-a-32-char-random-string"
    # Comma-separated origins string: "http://localhost:3000,https://yourdomain.com"
    cors_origins: str = "http://localhost:3000"

    # JWT
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7   # 7 days

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    frontend_url: str = "http://localhost:3000"

    def get_cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # Database
    database_url: str = "postgresql+asyncpg://dottle:dottle_secret@localhost:5432/dottle"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Email / Alerts
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_from_email: str = "alerts@dottle.dev"

    # Slack OAuth App
    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_redirect_uri: str = "http://localhost:8000/api/v1/slack/oauth/callback"
    slack_default_webhook: str = ""

    # Alert worker
    alert_poll_interval_seconds: int = 60

    # Code Integration (internal coding agent)
    anthropic_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
