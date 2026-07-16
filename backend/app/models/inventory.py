"""Inventory snapshot model."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, InventoryRiskLevel, UUIDPrimaryKeyMixin, enum_value_type


class InventorySnapshot(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Time-series inventory snapshot used by dashboard and alerting."""

    __tablename__ = "inventory_snapshots"
    __table_args__ = (
        Index("ix_inventory_snapshots_store_snapshot_at", "store_id", "snapshot_at"),
        Index(
            "ix_inventory_snapshots_store_product_snapshot_at",
            "store_id",
            "product_id",
            "snapshot_at",
        ),
        Index("ix_inventory_snapshots_biz_date", "biz_date"),
    )

    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    biz_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_stock: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    predicted_stock_1h: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    depletion_eta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hourly_burn_rate: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    stockout_probability: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    recommended_production_qty: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    risk_level: Mapped[InventoryRiskLevel] = mapped_column(
        enum_value_type(InventoryRiskLevel),
        nullable=False,
        default=InventoryRiskLevel.NONE,
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store"] = relationship(back_populates="inventory_snapshots")
    product: Mapped["Product"] = relationship(back_populates="inventory_snapshots")
