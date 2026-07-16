"""Unified chat request and response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ChatRequest(BaseModel):
    """Request payload for the unified chat endpoint."""

    store_id: str | None = None
    message: str
    session_id: str | None = None
    context: dict[str, Any] | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "message": "오늘 재고 상황 알려줘",
                "session_id": "session-001",
                "context": {"current_page": "dashboard"},
            }
        }
    )


class ChatResponse(BaseModel):
    """Unified response shape returned by the chat router."""

    agent: str
    response_type: str
    content: Any
    session_id: str
    metadata: dict[str, Any]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "agent": "production",
                "response_type": "alert_card",
                "content": {"title": "품절 위험 상품 2개"},
                "session_id": "session-001",
                "metadata": {
                    "intent": "PRODUCTION",
                    "suggested_questions": [
                        {"text": "재고 소진 위험 품목 알려줘", "source": "page", "reason": "dashboard_context"},
                        {"text": "미완료 항목 보여줘", "source": "store_status", "reason": "pending_todos"},
                    ],
                },
            }
        }
    )
