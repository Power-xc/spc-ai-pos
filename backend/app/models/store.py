"""Store master model."""

from __future__ import annotations

from sqlalchemy import Boolean, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Store(TimestampMixin, Base):
    """Store master keyed by the business store_id used by the frontend."""

    __tablename__ = "stores"
    __table_args__ = (
        Index("ix_stores_is_active_store_name", "is_active", "store_name"),
    )

    store_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    store_name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    users: Mapped[list["User"]] = relationship(back_populates="store")
    products: Mapped[list["Product"]] = relationship(back_populates="store")
    inventory_snapshots: Mapped[list["InventorySnapshot"]] = relationship(back_populates="store")
    order_recommendations: Mapped[list["OrderRecommendation"]] = relationship(back_populates="store")
    orders: Mapped[list["Order"]] = relationship(back_populates="store")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="store")
    chat_sessions: Mapped[list["ChatSession"]] = relationship(back_populates="store")
    notification_settings: Mapped[list["NotificationSettings"]] = relationship(
        back_populates="store"
    )
