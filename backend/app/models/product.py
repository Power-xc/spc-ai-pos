"""Product master model."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Product(TimestampMixin, Base):
    """Product master keyed by upstream product_id."""

    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_store_category", "store_id", "category"),
        Index("ix_products_is_active", "is_active"),
    )

    product_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    store_id: Mapped[str | None] = mapped_column(ForeignKey("stores.store_id"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="ea")
    base_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    cost_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store | None"] = relationship(back_populates="products")
    inventory_snapshots: Mapped[list["InventorySnapshot"]] = relationship(back_populates="product")
    order_recommendation_items: Mapped[list["OrderRecommendationItem"]] = relationship(
        back_populates="product",
    )
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="product")
