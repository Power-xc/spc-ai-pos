"""Alert current-state and event-log models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import (
    AlertEventType,
    AlertSeverity,
    AlertSource,
    AlertStatus,
    Base,
    CreatedAtMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    enum_value_type,
)


class Alert(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Current alert state consumed by alerts page and dashboard badges."""

    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_store_status_occurred_at", "store_id", "status", "occurred_at"),
        Index("ix_alerts_store_severity", "store_id", "severity"),
        Index("ix_alerts_related_entity", "related_entity_type", "related_entity_id"),
    )

    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        enum_value_type(AlertSeverity),
        nullable=False,
    )
    status: Mapped[AlertStatus] = mapped_column(
        enum_value_type(AlertStatus),
        nullable=False,
        default=AlertStatus.OPEN,
    )
    source: Mapped[AlertSource] = mapped_column(
        enum_value_type(AlertSource),
        nullable=False,
    )
    source_agent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    related_entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cta_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cta_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cta_route: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # TODO: current schema tracks store-level read state; user-level receipts can be added later.
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store"] = relationship(back_populates="alerts")
    events: Mapped[list["AlertEvent"]] = relationship(
        back_populates="alert",
        cascade="all, delete-orphan",
        order_by="AlertEvent.event_at",
    )


class AlertEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Immutable alert event history."""

    __tablename__ = "alert_events"
    __table_args__ = (
        Index("ix_alert_events_alert_id_event_at", "alert_id", "event_at"),
        Index("ix_alert_events_store_id_event_at", "store_id", "event_at"),
    )

    alert_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    event_type: Mapped[AlertEventType] = mapped_column(
        enum_value_type(AlertEventType),
        nullable=False,
    )
    from_status: Mapped[AlertStatus | None] = mapped_column(
        enum_value_type(AlertStatus),
        nullable=True,
    )
    to_status: Mapped[AlertStatus | None] = mapped_column(
        enum_value_type(AlertStatus),
        nullable=True,
    )
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    alert: Mapped["Alert"] = relationship(back_populates="events")
    actor_user: Mapped["User | None"] = relationship(back_populates="alert_events")
