"""Sales analysis agent for POS API aggregation."""

from __future__ import annotations


class SalesAnalysisAgent:
    """Sales orchestration layer for POS screens."""

    def __init__(self, registry) -> None:
        self.registry = registry

    async def daily_summary(self, context):
        return await self.registry.execute("get_daily_summary", store_id=context.store_id)

    async def compare(self, context, period_a_start: str, period_a_end: str, period_b_start: str, period_b_end: str):
        return await self.registry.execute(
            "compare_sales",
            store_id=context.store_id,
            period_a_start=period_a_start,
            period_a_end=period_a_end,
            period_b_start=period_b_start,
            period_b_end=period_b_end,
        )

    async def waste(self, context, period: str):
        return await self.registry.execute("get_waste_summary", store_id=context.store_id, period=period)
