"""Common API response and event schemas."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class APIResponse(BaseModel):
    """Standard success response envelope."""

    status: str = "success"
    data: Any = None
    error: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "success",
                "data": {"message": "ok"},
                "metadata": {"processing_time_ms": 120},
            }
        }
    )


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    status: str = "error"
    error: dict[str, Any]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "error",
                "error": {"code": "NOT_FOUND", "message": "Resource not found"},
            }
        }
    )


class AlertCard(BaseModel):
    """Compact alert card for dashboard and notifications."""

    id: str
    severity: str
    type: str
    title: str
    subtitle: str | None = None
    message: str | None = None
    cta: dict[str, Any] | None = None
    created_at: str
    read: bool = False

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "alert-prod-001",
                "severity": "HIGH",
                "type": "production",
                "title": "글레이즈드 도넛 재고 부족 예상",
                "subtitle": "1시간 내 소진 가능성 높음",
                "message": "권장 생산량 24개",
                "cta": {
                    "label": "생산 등록하기",
                    "action": "PRODUCTION_REGISTER",
                    "route": "/production",
                },
                "created_at": "2026-04-03T09:00:00Z",
                "read": False,
            }
        }
    )


class NotificationEvent(BaseModel):
    """SSE event payload."""

    event_type: str
    data: dict[str, Any]
    timestamp: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "event_type": "production_alert",
                "data": {"product_id": "P001", "message": "품절 위험"},
                "timestamp": "2026-04-03T09:00:00Z",
            }
        }
    )


class StoreInfo(BaseModel):
    """Basic store master information."""

    store_id: str
    store_name: str
    region: str
    city: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "store_name": "강남역점",
                "region": "서울",
                "city": "강남구",
            }
        }
    )
