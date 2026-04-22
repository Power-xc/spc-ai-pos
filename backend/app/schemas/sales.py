"""Sales-analysis request and response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class SalesQueryRequest(BaseModel):
    """Natural-language sales query request."""

    store_id: str
    query: str
    session_id: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "query": "전주 대비 매출 비교해줘",
                "session_id": "session-001",
            }
        }
    )


class MetricItem(BaseModel):
    """Highlighted metric to show in an insight card."""

    label: str
    value: str
    change_pct: float | None = None
    color: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "label": "전주 대비",
                "value": "+8.1%",
                "change_pct": 8.1,
                "color": "green",
            }
        }
    )


class InsightSection(BaseModel):
    """Section inside a sales analysis response."""

    type: str
    title: str | None = None
    data: Any = None
    text: str | None = None
    items: list[str] | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "insight",
                "title": "분석",
                "text": "배달 매출 비중이 최근 2주간 증가했습니다.",
            }
        }
    )


class SourceInfo(BaseModel):
    """Source metadata attached to a generated answer."""

    type: str
    description: str
    data_range: str | None = None
    freshness: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "SQL_QUERY",
                "description": "최근 7일 매출 비교",
                "data_range": "2026-03-27 ~ 2026-04-03",
                "freshness": "2026-04-03T09:00:00Z",
            }
        }
    )


class SalesQueryResponse(BaseModel):
    """Structured response for natural-language sales analysis."""

    intent: str
    title: str
    sections: list[InsightSection]
    sources: list[SourceInfo]
    metadata: dict[str, Any]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "intent": "SALES_COMPARISON",
                "title": "전주 대비 매출 비교",
                "sections": [],
                "sources": [],
                "metadata": {"processing_time_ms": 850, "llm_tokens_used": 220},
            }
        }
    )
