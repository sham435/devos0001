from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    app_env: str = "development"
    secret_key: str = "change-me-to-a-long-random-string-min-32-chars"
    database_url: str = "postgresql+asyncpg://appuser:apppass@localhost:5432/appdb"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    backend_cors_origins: str = '["http://localhost:3000"]'
    smtp_host: str = "smtp.mailtrap.io"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.backend_cors_origins)

    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.refresh_token_expire_days * 86400

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
