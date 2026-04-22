"""Audit logging helpers."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass
class AuditEvent:
    user_id: str
    role: str
    action: str
    resource: str
    masked_fields: list[str]
    timestamp: str
    success: bool = True
    details: dict[str, Any] | None = None


class AuditLogger:
    """Persist audit events for requests, LLM usage, and data access."""

    def __init__(self, log_path: str = "logs/audit.jsonl") -> None:
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    async def log(self, event: dict) -> None:
        """Record an audit event."""
        self._write_line(event)

    async def log_access(
        self,
        user_id: str,
        role: str,
        action: str,
        resource: str,
        masked_fields: list[str] | None = None,
        timestamp: str | None = None,
        success: bool = True,
        details: dict[str, Any] | None = None,
    ) -> None:
        event = AuditEvent(
            user_id=user_id,
            role=role,
            action=action,
            resource=resource,
            masked_fields=masked_fields or [],
            timestamp=timestamp or datetime.now(UTC).isoformat(),
            success=success,
            details=details,
        )
        self._write_line(asdict(event))

    async def log_error(
        self,
        user_id: str,
        role: str,
        action: str,
        resource: str,
        error: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        await self.log_access(
            user_id=user_id,
            role=role,
            action=action,
            resource=resource,
            masked_fields=[],
            success=False,
            details={"error": error, **(details or {})},
        )

    def _write_line(self, payload: dict[str, Any]) -> None:
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
