"""Repositories for dashboard-oriented read models."""

from __future__ import annotations

from sqlalchemy import and_, func, select

from app.db.base import AlertStatus
from app.db.repositories.base import RepositoryBase
from app.models import Alert, InventorySnapshot, Order, Store


class DashboardRepository(RepositoryBase):
    """Read-side helpers for dashboard aggregation."""

    async def get_store(self, store_id: str) -> Store | None:
        return await self.session.get(Store, store_id)

    async def get_active_alerts(self, store_id: str, *, limit: int = 20) -> list[Alert]:
        """Dashboard/alerts read model entry point."""

        stmt = (
            select(Alert)
            .where(
                Alert.store_id == store_id,
                Alert.status.not_in([AlertStatus.RESOLVED, AlertStatus.DISMISSED]),
            )
            .order_by(Alert.occurred_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def list_open_alerts(self, store_id: str, *, limit: int = 20) -> list[Alert]:
        return await self.get_active_alerts(store_id, limit=limit)

    async def get_latest_inventory_snapshots(
        self,
        store_id: str,
        *,
        limit: int = 200,
    ) -> list[InventorySnapshot]:
        """Dashboard inventory source rows."""

        latest_per_product = (
            select(
                InventorySnapshot.product_id,
                func.max(InventorySnapshot.snapshot_at).label("max_snapshot_at"),
            )
            .where(InventorySnapshot.store_id == store_id)
            .group_by(InventorySnapshot.product_id)
            .subquery()
        )
        stmt = (
            select(InventorySnapshot)
            .join(
                latest_per_product,
                and_(
                    InventorySnapshot.product_id == latest_per_product.c.product_id,
                    InventorySnapshot.snapshot_at == latest_per_product.c.max_snapshot_at,
                ),
            )
            .where(InventorySnapshot.store_id == store_id)
            .order_by(InventorySnapshot.risk_level.desc(), InventorySnapshot.product_id.asc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def list_latest_inventory_snapshots(
        self,
        store_id: str,
        *,
        limit: int = 200,
    ) -> list[InventorySnapshot]:
        return await self.get_latest_inventory_snapshots(store_id, limit=limit)

    async def get_recent_orders(self, store_id: str, *, limit: int = 20) -> list[Order]:
        """Dashboard order widget source rows."""

        stmt = (
            select(Order)
            .where(Order.store_id == store_id)
            .order_by(Order.confirmed_at.desc().nullslast(), Order.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def list_recent_confirmed_orders(self, store_id: str, *, limit: int = 20) -> list[Order]:
        return await self.get_recent_orders(store_id, limit=limit)
