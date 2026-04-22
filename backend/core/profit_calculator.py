"""Profit impact calculator shared by action-oriented APIs."""

from __future__ import annotations

from core.schemas import NetProfitBar


class ProfitCalculator:
    """Phase 0 gross-profit approximation used by bottom profit bar."""

    def __init__(self, data_store) -> None:
        self.data_store = data_store

    def _price_cost(self, product_id: str) -> tuple[float, float]:
        rows = self.data_store.dim_product[self.data_store.dim_product["product_id"] == str(product_id)]
        if rows.empty:
            return 0.0, 0.0
        row = rows.iloc[0]
        return float(row.get("base_price", 0) or 0), float(row.get("cost_price", 0) or 0)

    async def calculate_production_impact(self, store_id: str, product_id: str, quantity: int) -> NetProfitBar:
        price, cost = self._price_cost(product_id)
        revenue = int(round(price * quantity))
        cost_total = -int(round(cost * quantity))
        return NetProfitBar(
            action_description=f"{product_id} {quantity}개 생산 등록",
            revenue_impact=revenue,
            cost_impact=cost_total,
            net_profit_delta=revenue + cost_total,
            confidence="medium",
        )

    async def calculate_order_impact(self, store_id: str, items: list[dict]) -> NetProfitBar:
        revenue = 0
        cost_total = 0
        for item in items:
            price, cost = self._price_cost(item["product_id"])
            quantity = int(item["quantity"])
            revenue += int(round(price * quantity))
            cost_total += int(round(cost * quantity))
        return NetProfitBar(
            action_description="발주안 확정",
            revenue_impact=revenue,
            cost_impact=-cost_total,
            net_profit_delta=revenue - cost_total,
            confidence="medium",
        )

    async def calculate_waste_impact(self, store_id: str, product_id: str, waste_qty: int) -> NetProfitBar:
        _, cost = self._price_cost(product_id)
        loss = int(round(cost * waste_qty))
        return NetProfitBar(
            action_description=f"{product_id} 폐기 {waste_qty}개",
            revenue_impact=0,
            cost_impact=-loss,
            net_profit_delta=-loss,
            confidence="high",
        )
