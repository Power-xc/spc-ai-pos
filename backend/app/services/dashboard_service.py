"""Database-backed dashboard query service."""

from __future__ import annotations

from app.db.repositories import DashboardRepository
from app.db.session import get_session_factory


class DashboardService:
    """Connection point for dashboard read aggregation."""

    def __init__(self, session_factory=None) -> None:
        self.session_factory = session_factory or get_session_factory()

    async def get_dashboard_bundle(self, store_id: str) -> dict:
        """Future router hook: hydrate dashboard from inventory/alerts/orders tables."""

        async with self.session_factory() as session:
            repo = DashboardRepository(session)
            store = await repo.get_store(store_id)
            alerts = await repo.get_active_alerts(store_id)
            inventory_snapshots = await repo.get_latest_inventory_snapshots(store_id)
            recent_orders = await repo.get_recent_orders(store_id)

        return {
            "store": store,
            "alerts": alerts,
            "inventory_snapshots": inventory_snapshots,
            "recent_orders": recent_orders,
        }
