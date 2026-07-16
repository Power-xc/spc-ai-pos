"""Chance-loss calculation helpers."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.tools import sql_queries


class ChanceLossCalculator:
    """Chance Loss(기회손실) 산출."""

    OPERATING_MINUTES = 840

    async def calculate_daily_chance_loss(
        self,
        db: AsyncSession,
        store_id: str,
        biz_date: date,
    ) -> dict[str, Any]:
        """Calculate per-product and total chance loss for one day."""
        inventory_rows = await sql_queries.get_store_inventory_today(db, store_id, biz_date)
        products: list[dict[str, Any]] = []
        total_chance_loss = 0.0

        for row in inventory_rows:
            stockout_minutes = float(row.get("stockout_minutes", 0) or 0)
            sold_qty = float(row.get("sold_qty", 0) or 0)
            base_price = float(row.get("base_price", 0) or 0)
            available_minutes = max(self.OPERATING_MINUTES - stockout_minutes, 1)
            minute_rate = sold_qty / available_minutes
            lost_qty_est = round(minute_rate * stockout_minutes, 2)
            chance_loss_amt = round(lost_qty_est * base_price, 2)
            total_chance_loss += chance_loss_amt
            products.append(
                {
                    "product_id": row["product_id"],
                    "product_name": row["product_name"],
                    "stockout_minutes": int(stockout_minutes),
                    "lost_qty_est": lost_qty_est,
                    "chance_loss_amt": chance_loss_amt,
                }
            )

        for product in products:
            product["pct_of_total"] = round(
                (product["chance_loss_amt"] / total_chance_loss) * 100, 2
            ) if total_chance_loss > 0 else 0.0

        return {
            "biz_date": str(biz_date),
            "total_chance_loss": round(total_chance_loss, 2),
            "products": sorted(
                products,
                key=lambda item: item["chance_loss_amt"],
                reverse=True,
            ),
        }

    async def compare_chance_loss(
        self,
        db: AsyncSession,
        store_id: str,
        date1: date,
        date2: date,
    ) -> dict[str, Any]:
        """Compare chance loss between two dates."""
        snapshot1 = await self.calculate_daily_chance_loss(db, store_id, date1)
        snapshot2 = await self.calculate_daily_chance_loss(db, store_id, date2)
        products1 = {item["product_id"]: item for item in snapshot1["products"]}
        products2 = {item["product_id"]: item for item in snapshot2["products"]}

        improved_products = []
        worsened_products = []
        for product_id in set(products1) | set(products2):
            loss1 = float(products1.get(product_id, {}).get("chance_loss_amt", 0) or 0)
            loss2 = float(products2.get(product_id, {}).get("chance_loss_amt", 0) or 0)
            change_pct = None
            if loss1 > 0:
                change_pct = round(((loss2 - loss1) / loss1) * 100, 1)
            payload = {
                "product_id": product_id,
                "product_name": products2.get(product_id, products1.get(product_id, {})).get(
                    "product_name"
                ),
                "date1_loss": loss1,
                "date2_loss": loss2,
                "change_pct": change_pct,
            }
            if loss2 < loss1:
                improved_products.append(payload)
            elif loss2 > loss1:
                worsened_products.append(payload)

        total1 = float(snapshot1["total_chance_loss"])
        total2 = float(snapshot2["total_chance_loss"])
        change_pct = round(((total2 - total1) / total1) * 100, 1) if total1 > 0 else None

        return {
            "date1": snapshot1,
            "date2": snapshot2,
            "change_pct": change_pct,
            "improved_products": sorted(
                improved_products,
                key=lambda item: item["change_pct"] if item["change_pct"] is not None else 0,
            ),
            "worsened_products": sorted(
                worsened_products,
                key=lambda item: item["change_pct"] if item["change_pct"] is not None else 0,
                reverse=True,
            ),
        }

    async def generate_feedback_message(
        self,
        store_id: str,
        product_id: str,
        today_data: dict[str, Any],
        historical_avg: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate a rule-based feedback payload after a production action."""
        today_stockout = float(today_data.get("stockout_minutes", 0) or 0)
        historical_stockout = float(historical_avg.get("avg_stockout_minutes", 0) or 0)
        today_loss = float(today_data.get("chance_loss_amt", 0) or 0)
        historical_loss = float(historical_avg.get("avg_chance_loss_amt", 0) or 0)

        if historical_stockout > 0 and today_stockout < historical_stockout:
            reduction_pct = round(((historical_stockout - today_stockout) / historical_stockout) * 100, 1)
            prevented_amount = max(historical_loss - today_loss, 0.0)
            return {
                "type": "POSITIVE",
                "message": (
                    f"생산 조치를 완료하셔서, 과거 평균 대비 찬스 로스를 "
                    f"약 {reduction_pct}% 감소시킨 것으로 추정됩니다."
                ),
                "impact_pct": reduction_pct,
                "estimated_amount": round(prevented_amount, 2),
            }

        if historical_loss > 0:
            loss_pct = round((today_loss / historical_loss) * 100, 1)
        else:
            loss_pct = 0.0

        return {
            "type": "NEGATIVE",
            "message": (
                f"오늘 {product_id}에서 추가 기회손실이 발생했습니다. "
                f"평균 대비 {loss_pct:.1f}% 수준으로 추정됩니다."
            ),
            "impact_pct": loss_pct,
            "estimated_amount": round(today_loss, 2),
        }

