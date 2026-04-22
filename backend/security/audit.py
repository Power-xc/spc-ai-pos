"""Audit logger for AI recommendations, approvals, and executions."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class Auditor:
    """Append-only JSONL audit logger."""

    def __init__(self, log_path: str) -> None:
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    async def log(
        self,
        *,
        context,
        action: str,
        tool_name: str | None = None,
        params: dict | None = None,
        masked_fields: list[str] | None = None,
        token_usage: int = 0,
        error: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        record = {
            "timestamp": datetime.now(UTC).isoformat(),
            "user_id": context.user_id,
            "role": context.role,
            "store_id": context.store_id,
            "action": action,
            "tool_name": tool_name,
            "params": params or {},
            "masked_fields": masked_fields or [],
            "token_usage": token_usage,
            "error": error,
            "extra": extra or {},
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
