"""Unified security gate for APIs, tools, and chat."""

from __future__ import annotations

from fastapi import HTTPException

from security.masking import MaskingService


class SecurityGate:
    """Apply RBAC, store-scoping, and output masking consistently."""

    def __init__(self, masking_service: MaskingService) -> None:
        self.masking_service = masking_service

    def authorize(self, tool_name: str, params: dict, context, *, is_write: bool = False) -> None:
        target_store = str(params.get("store_id") or context.store_id)
        if context.role == "store_owner" and target_store != context.store_id:
            raise HTTPException(status_code=403, detail="Other store access blocked")
        if is_write and context.role not in {"store_owner", "area_manager", "hq_admin"}:
            raise HTTPException(status_code=403, detail="Write access denied")

    def mask(self, payload: dict | list, role: str) -> tuple[dict | list, list[str]]:
        return self.masking_service.mask(payload, role)

    def scan_answer(self, text: str, role: str) -> str:
        if role == "hq_admin":
            return text
        blocked = ("원가", "순이익", "마진")
        redacted = text
        for token in blocked:
            redacted = redacted.replace(token, "[보호정보]")
        return redacted
