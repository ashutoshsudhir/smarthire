"""Application settings, loaded from environment variables (and .env locally)."""
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_env: str = "development"  # development | production | test
    database_url: str = f"sqlite:///{BASE_DIR / 'smarthire.db'}"
    jwt_secret: str = "dev-only-insecure-secret-change-me-in-production"
    jwt_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173"  # comma separated
    cors_origin_regex: str | None = None  # e.g. https://smarthire-.*\.vercel\.app

    llm_provider: str = "mock"  # mock | anthropic | openai
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_seconds: float = 30.0

    auto_seed: bool = True  # create tables + seed Input_Data.json on startup if empty
    seed_file: str = str(BASE_DIR / "data" / "Input_Data.json")
    admin_api_token: str | None = None  # optional token for the batch-screening cron

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    postgres_url: str | None = None  # set automatically by the Vercel/Neon integration

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite") and self.postgres_url and not os.getenv("DATABASE_URL"):
            url = self.postgres_url
        # Hosted Postgres providers hand out postgres:// or postgresql:// URLs; use psycopg 3.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.app_env == "production":
        if s.jwt_secret.startswith("dev-only") or len(s.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET must be set to a random value of 32+ characters in production")
        if s.is_sqlite:
            raise RuntimeError("DATABASE_URL must point to PostgreSQL in production")
    return s
