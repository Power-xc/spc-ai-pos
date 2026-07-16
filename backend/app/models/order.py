"""Order and recommendation models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import (
    Base,
    CreatedAtMixin,
    OrderSource,
    OrderStatus,
    PricingStatus,
    RecommendationStatus,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    enum_value_type,
)


class OrderRecommendation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Snapshot of recommended order options before a confirmation decision."""

    __tablename__ = "order_recommendations"
    __table_args__ = (
        Index("ix_order_recommendations_store_recommended_at", "store_id", "recommended_at"),
        Index("ix_order_recommendations_store_status", "store_id", "status"),
    )

    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    client_option_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    option_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[OrderSource] = mapped_column(
        enum_value_type(OrderSource),
        nullable=False,
        default=OrderSource.AI,
    )
    status: Mapped[RecommendationStatus] = mapped_column(
        enum_value_type(RecommendationStatus),
        nullable=False,
        default=RecommendationStatus.GENERATED,
    )
    reference_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # TODO: recommendation summary math may move to a dedicated analytics table later.
    four_week_avg_qty: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    recommended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    context_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    raw_response: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store"] = relationship(back_populates="order_recommendations")
    created_by_user: Mapped["User | None"] = relationship(
        back_populates="order_recommendations",
        foreign_keys=[created_by],
    )
    items: Mapped[list["OrderRecommendationItem"]] = relationship(
        back_populates="recommendation",
        cascade="all, delete-orphan",
        order_by="OrderRecommendationItem.sort_order",
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="recommendation")


class OrderRecommendationItem(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Item rows for a recommendation snapshot."""

    __tablename__ = "order_recommendation_items"
    __table_args__ = (
        Index("ix_order_recommendation_items_recommendation_id", "recommendation_id"),
        Index("ix_order_recommendation_items_product_id", "product_id"),
    )

    recommendation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_recommendations.id"),
        nullable=False,
    )
    product_id: Mapped[str] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    ai_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    recommendation: Mapped["OrderRecommendation"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="order_recommendation_items")


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Operational order ledger row supporting draft and confirmed states."""

    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_store_status_created_at", "store_id", "status", "created_at"),
        Index("ix_orders_recommendation_id", "recommendation_id"),
        Index("ix_orders_confirmed_at", "confirmed_at"),
    )

    order_no: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    recommendation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_recommendations.id"),
        nullable=True,
    )
    client_draft_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    client_option_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[OrderSource] = mapped_column(
        enum_value_type(OrderSource),
        nullable=False,
        default=OrderSource.MANUAL,
    )
    status: Mapped[OrderStatus] = mapped_column(
        enum_value_type(OrderStatus),
        nullable=False,
        default=OrderStatus.DRAFT,
    )
    pricing_status: Mapped[PricingStatus] = mapped_column(
        enum_value_type(PricingStatus),
        nullable=False,
        default=PricingStatus.PENDING,
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="KRW")
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # TODO: upstream pricing source is not fixed yet, so amount fields stay nullable.
    total_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    context_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store"] = relationship(back_populates="orders")
    recommendation: Mapped["OrderRecommendation | None"] = relationship(back_populates="orders")
    created_by_user: Mapped["User | None"] = relationship(
        back_populates="created_orders",
        foreign_keys=[created_by],
    )
    confirmed_by_user: Mapped["User | None"] = relationship(
        back_populates="confirmed_orders",
        foreign_keys=[confirmed_by],
    )
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
    )


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Final or draft order line items."""

    __tablename__ = "order_items"
    __table_args__ = (
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_product_id", "product_id"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    recommendation_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_recommendation_items.id"),
        nullable=True,
    )
    product_id: Mapped[str] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # TODO: order confirmation currently guarantees quantity, not price.
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    pricing_status: Mapped[PricingStatus] = mapped_column(
        enum_value_type(PricingStatus),
        nullable=False,
        default=PricingStatus.PENDING,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="order_items")
    recommendation_item: Mapped["OrderRecommendationItem | None"] = relationship()
