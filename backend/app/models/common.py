"""Compatibility re-exports for older imports.

The canonical enum definitions now live in ``app.db.base`` so ORM models,
repositories, and Alembic all share one source of truth.
"""

from enum import StrEnum

from app.db.base import (
    AlertEventType,
    AlertSeverity,
    AlertSource,
    AlertStatus,
    ChatRole,
    InventoryRiskLevel,
    OrderSource,
    OrderStatus,
    PricingStatus,
    RecommendationStatus,
    UserRole,
)


class RecommendationSource(StrEnum):
    """Legacy recommendation source enum kept for backwards compatibility."""

    AI = "ai"
    HISTORICAL = "historical"
    HQ = "hq"
    MANUAL = "manual"


class ChatSessionStatus(StrEnum):
    """Legacy chat session lifecycle enum retained for older imports."""

    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"

__all__ = [
    "AlertEventType",
    "AlertSeverity",
    "AlertSource",
    "AlertStatus",
    "ChatRole",
    "ChatSessionStatus",
    "InventoryRiskLevel",
    "OrderSource",
    "OrderStatus",
    "PricingStatus",
    "RecommendationSource",
    "RecommendationStatus",
    "UserRole",
]
