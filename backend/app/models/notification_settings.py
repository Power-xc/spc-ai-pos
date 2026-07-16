"""Notification settings model for per-store and per-user notification preferences."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, String, DateTime, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.store import Store
    from app.models.user import User


class NotificationSettings(Base):
    """Store and user notification preferences."""

    __tablename__ = "notification_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    store_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("stores.store_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Global toggle
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Snooze until timestamp (null if not snoozed)
    snooze_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Muted categories (list of category names)
    # Categories: inventory, order, actions, analytics, production, general
    muted_categories: Mapped[List[str]] = mapped_column(
        JSON, default=list, nullable=False
    )

    # Per-channel settings
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    store: Mapped["Store"] = relationship(
        "Store", back_populates="notification_settings"
    )
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="notification_settings"
    )

    def is_snoozed(self) -> bool:
        """Check if notifications are currently snoozed."""
        if self.snooze_until is None:
            return False
        return datetime.utcnow() < self.snooze_until

    def is_category_muted(self, category: str) -> bool:
        """Check if a specific category is muted."""
        return category in (self.muted_categories or [])

    def __repr__(self) -> str:
        return f"<NotificationSettings store_id={self.store_id} enabled={self.enabled}>"
