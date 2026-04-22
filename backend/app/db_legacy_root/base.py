"""Base SQLAlchemy models with UUID primary keys."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY


class TimestampMixin:
    """Auto-fill created_at and updated_at."""

    @declared_attr
    def created_at(self) -> Mapped[datetime]:
        return mapped_column(
            DateTime(timezone=True),
            default=lambda: datetime.now(UTC),
            nullable=False,
        )

    @declared_attr
    def updated_at(self) -> Mapped[datetime]:
        return mapped_column(
            DateTime(timezone=True),
            default=lambda: datetime.now(UTC),
            onupdate=lambda: datetime.now(UTC),
            nullable=False,
        )


class SoftDeleteMixin:
    """Soft delete with is_deleted flag."""

    @declared_attr
    def is_deleted(self) -> Mapped[bool]:
        return mapped_column(default=False, nullable=False)

    @declared_attr
    def deleted_at(self) -> Mapped[datetime | None]:
        return mapped_column(DateTime(timezone=True), nullable=True)

    @declared_attr
    def deleted_by(self) -> Mapped[str | None]:
        return mapped_column(String(50), nullable=True)


class UUIDMixin:
    """UUID primary key."""

    @declared_attr
    def id(self) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        )


# Enums (PostgreSQL enum과 매핑)
class OrderSource(str):
    AI = "ai"
    MANUAL = "manual"
    HQ = "hq"


class OrderStatus(str):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    SUBMITTED = "submitted"
    CANCELLED = "cancelled"


class PricingStatus(str):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    UNKNOWN = "unknown"


class AlertSeverity(str):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class AlertSource(str):
    INVENTORY = "inventory"
    SALES = "sales"
    ORDERS = "orders"
    CHAT = "chat"
    SYSTEM = "system"
    DASHBOARD = "dashboard"


class AlertEventType(str):
    CREATED = "created"
    READ = "read"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"
    REOPENED = "reopened"


class ChatRole(str):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class InventoryRiskLevel(str):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
