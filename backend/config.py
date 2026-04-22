"""Runtime settings for the POS-first AI Agent POC backend."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven runtime configuration."""

    data_dir: str = Field(
        default=str((Path(__file__).resolve().parents[1] / "data").resolve()),
        alias="DATA_DIR",
    )
    demo_mode: bool = Field(default=False, alias="DEMO_MODE")
    demo_seed_dir: str = Field(
        default=str((Path(__file__).resolve().parents[1] / "data" / "demo_seed").resolve()),
        alias="DEMO_SEED_DIR",
    )
    vllm_base_url: str = Field(default="http://localhost:8000/v1", alias="VLLM_BASE_URL")
    vllm_model: str | None = Field(default="dunkin-agent", alias="VLLM_MODEL")
    agent_max_steps: int = Field(default=7, alias="AGENT_MAX_STEPS")
    agent_timeout: int = Field(default=25, alias="AGENT_TIMEOUT")
    proactive_interval_minutes: int = Field(default=5, alias="PROACTIVE_INTERVAL_MINUTES")
    tool_timeout: int = Field(default=5, alias="TOOL_TIMEOUT")
    token_budget_complex: int = Field(default=25_000, alias="TOKEN_BUDGET_COMPLEX")
    audit_log_path: str = Field(default="./logs/audit.jsonl", alias="AUDIT_LOG_PATH")
    modal_duplicate_suppress_minutes: int = Field(
        default=30,
        alias="MODAL_DUPLICATE_SUPPRESS_MINUTES",
    )
    max_daily_modals: int = Field(default=20, alias="MAX_DAILY_MODALS")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
