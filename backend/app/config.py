"""Application settings loaded from environment variables."""

import json
from functools import lru_cache
from pathlib import Path
from typing import ClassVar

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the FastAPI backend."""

    default_data_dir: ClassVar[str] = str((Path(__file__).resolve().parents[2] / "data").resolve())

    database_url: str = Field(
        default="postgresql+asyncpg://user:password@host:5432/dbname",
        alias="DATABASE_URL",
    )
    database_schema: str = Field(default="dunkin_mart", alias="DATABASE_SCHEMA")
    data_mode: str = Field(default="file", alias="DATA_MODE")
    data_dir: str = Field(default=default_data_dir, alias="DATA_DIR")
    demo_mode: bool = Field(default=False, alias="DEMO_MODE")
    demo_seed_dir: str | None = Field(default=None, alias="DEMO_SEED_DIR")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="OPENAI_BASE_URL",
    )
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_complex_model: str | None = Field(default=None, alias="OPENAI_COMPLEX_MODEL")
    chat_trace_enabled: bool = Field(default=False, alias="CHAT_TRACE_ENABLED")
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    production_check_interval_minutes: int = Field(default=5, alias="PRODUCTION_CHECK_INTERVAL_MINUTES")
    production_alert_window_minutes: int = Field(default=60, alias="PRODUCTION_ALERT_WINDOW_MINUTES")
    production_lead_time_minutes: int = Field(default=60, alias="PRODUCTION_LEAD_TIME_MINUTES")
    business_start_hour: int = Field(default=8, alias="BUSINESS_START_HOUR")
    business_end_hour: int = Field(default=22, alias="BUSINESS_END_HOUR")
    audit_log_path: str = Field(default="logs/audit.jsonl", alias="AUDIT_LOG_PATH")
    events_config_path: str = Field(default="config/events.json", alias="EVENTS_CONFIG_PATH")
    rag_doc_dir: str = Field(default="sample_docs", alias="RAG_DOC_DIR")
    rag_index_dir: str = Field(default=".rag", alias="RAG_INDEX_DIR")
    rag_min_score: float = Field(default=0.5, alias="RAG_MIN_SCORE")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Support either JSON-array or comma-separated CORS origins from `.env`."""
        value = self.cors_origins
        if not value:
            return ["http://localhost:3000"]

        stripped = value.strip()
        if stripped.startswith("["):
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                return [str(origin).strip() for origin in parsed if str(origin).strip()]

        return [origin.strip() for origin in stripped.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""
    return Settings()
