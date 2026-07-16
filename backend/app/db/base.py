"""Shared SQLAlchemy base, mixins, and enums for the PostgreSQL ledger."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum as SAEnum, MetaData, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings

SCHEMA_NAME = get_settings().database_schema or None

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base declarative class with naming convention and optional schema."""

    metadata = MetaData(schema=SCHEMA_NAME, naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    """Standard created/updated timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class CreatedAtMixin:
    """Append-only timestamp for log/snapshot tables."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UUIDPrimaryKeyMixin:
    """UUID primary key for transactional tables."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )


class UserRole(StrEnum):
    STORE_OWNER = "store_owner"
    AREA_MANAGER = "area_manager"
    HQ_ADMIN = "hq_admin"
    SYSTEM = "system"


class OrderSource(StrEnum):
    AI = "ai"
    MANUAL = "manual"
    REFERENCE_HISTORY = "reference_history"
    CHAT = "chat"


class OrderStatus(StrEnum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    SUBMITTED = "submitted"
    CANCELLED = "cancelled"


class PricingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    UNKNOWN = "unknown"


class RecommendationStatus(StrEnum):
    GENERATED = "generated"
    VIEWED = "viewed"
    CONFIRMED = "confirmed"
    EXPIRED = "expired"


class InventoryRiskLevel(StrEnum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AlertSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(StrEnum):
    OPEN = "open"
    READ = "read"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class AlertSource(StrEnum):
    INVENTORY_AGENT = "inventory_agent"
    ORDER_AGENT = "order_agent"
    SALES_AGENT = "sales_agent"
    CHAT_AGENT = "chat_agent"
    SYSTEM = "system"
    MANUAL = "manual"


class AlertEventType(StrEnum):
    CREATED = "created"
    DELIVERED = "delivered"
    READ = "read"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"
    REOPENED = "reopened"


class ChatRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""

    return datetime.now(UTC)


def enum_value_type(enum_cls):
    """Return a SQLAlchemy Enum that persists enum `.value` strings."""

    return SAEnum(
        enum_cls,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )
