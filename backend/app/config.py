from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve .env relative to the backend directory so it's found regardless of CWD
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/finance_app"
    anthropic_api_key: str = ""

    model_config = {"env_file": str(ENV_FILE), "extra": "ignore"}


settings = Settings()
