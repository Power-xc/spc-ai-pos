"""Ordering agent that composes recommendation, risk, and confirmation tools."""

from __future__ import annotations


class OrderingAgent:
    """Order orchestration layer without embedding business logic."""

    def __init__(self, registry, profit_calculator) -> None:
        self.registry = registry
        self.profit_calculator = profit_calculator

    async def recommendations(self, context):
        payload = await self.registry.execute("get_order_options", store_id=context.store_id)
        impact = await self.profit_calculator.calculate_order_impact(
            context.store_id,
            payload["options"][0]["items"] if payload["options"] else [],
        )
        payload["net_profit_bar"] = impact.model_dump()
        return payload

    async def recalculate(self, context, items: list[dict]):
        payload = await self.registry.execute("calculate_order_risk", store_id=context.store_id, items=items)
        payload["net_profit_bar"] = (await self.profit_calculator.calculate_order_impact(context.store_id, items)).model_dump()
        return payload

    async def confirm(self, context, items: list[dict]):
        payload = await self.registry.execute("confirm_order", store_id=context.store_id, items=items)
        payload["net_profit_bar"] = (await self.profit_calculator.calculate_order_impact(context.store_id, items)).model_dump()
        return payload
