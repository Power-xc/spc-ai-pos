"""Production agent that orchestrates production-related tools."""

from __future__ import annotations


class ProductionAgent:
    """Thin orchestration layer over production and inventory tools."""

    def __init__(self, registry, profit_calculator) -> None:
        self.registry = registry
        self.profit_calculator = profit_calculator

    async def current_inventory(self, context):
        return await self.registry.execute("get_current_inventory", store_id=context.store_id)

    async def production_guide(self, context):
        recommendations = await self.registry.execute("get_recommended_production", store_id=context.store_id)
        impact = await self.profit_calculator.calculate_production_impact(
            context.store_id,
            recommendations[0]["product_id"] if recommendations else "N/A",
            recommendations[0]["recommended_qty"] if recommendations else 0,
        )
        return {"recommendations": recommendations, "net_profit_bar": impact.model_dump()}

    async def register(self, context, product_id: str, quantity: int):
        result = await self.registry.execute("register_production", store_id=context.store_id, product_id=product_id, quantity=quantity)
        impact = await self.profit_calculator.calculate_production_impact(context.store_id, product_id, quantity)
        return {**result, "quantity": quantity, "net_profit_bar": impact.model_dump()}
