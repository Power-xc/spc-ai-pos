"""Application user model."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UserRole, enum_value_type


class User(TimestampMixin, Base):
    """User account aligned with request headers and audit context."""

    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_store_role", "store_id", "role"),
        Index("ix_users_is_active", "is_active"),
    )

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    store_id: Mapped[str | None] = mapped_column(ForeignKey("stores.store_id"), nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        enum_value_type(UserRole),
        nullable=False,
        default=UserRole.STORE_OWNER,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store | None"] = relationship(back_populates="users")
    created_orders: Mapped[list["Order"]] = relationship(
        back_populates="created_by_user",
        foreign_keys="Order.created_by",
    )
    confirmed_orders: Mapped[list["Order"]] = relationship(
        back_populates="confirmed_by_user",
        foreign_keys="Order.confirmed_by",
    )
    order_recommendations: Mapped[list["OrderRecommendation"]] = relationship(
        back_populates="created_by_user",
        foreign_keys="OrderRecommendation.created_by",
    )
    alert_events: Mapped[list["AlertEvent"]] = relationship(back_populates="actor_user")
    chat_sessions: Mapped[list["ChatSession"]] = relationship(back_populates="user")
    chat_messages: Mapped[list["ChatMessage"]] = relationship(back_populates="user")
    notification_settings: Mapped[list["NotificationSettings"]] = relationship(
        back_populates="user"
    )
