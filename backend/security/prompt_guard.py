"""Prompt-injection guard for the chat endpoint."""

from __future__ import annotations

import re

from fastapi import HTTPException

PATTERNS = [
    r"시스템 프롬프트",
    r"ignore .* instructions",
    r"developer message",
    r"prompt",
    r"role: system",
]


def check_prompt_safety(text: str) -> None:
    """Reject known prompt-injection patterns."""

    candidate = text.strip()
    if len(candidate) > 2_000:
        raise HTTPException(status_code=400, detail="Message too long")
    for pattern in PATTERNS:
        if re.search(pattern, candidate, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Prompt injection blocked")
