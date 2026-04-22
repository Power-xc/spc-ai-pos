"""Rule-based proactive monitor run every five minutes."""

from __future__ import annotations

from core.schemas import ModalAction, ModalType
from proactive.triggers import ORDER_DEADLINE_CRITICAL_MINUTES, ORDER_DEADLINE_WARNING_MINUTES, SALES_ANOMALY_PCT, STOCKOUT_ALERT_MINUTES


class ProactiveMonitor:
    """Checks inventory, deadlines, and anomalies and emits pending modals."""

    def __init__(self, registry, modal_manager, auditor, profit_calculator) -> None:
        self.registry = registry
        self.modal_manager = modal_manager
        self.auditor = auditor
        self.profit_calculator = profit_calculator

    async def run(self, context) -> None:
        await self._check_stock_depletion(context)
        await self._check_order_deadlines(context)
        await self._check_sales_anomaly(context)

    async def _check_stock_depletion(self, context) -> None:
        recommendations = await self.registry.execute("get_recommended_production", store_id=context.store_id)
        for item in recommendations[:3]:
            severity = "critical" if item["urgency"] == "high" else "warning"
            net_bar = await self.profit_calculator.calculate_production_impact(context.store_id, item["product_id"], item["recommended_qty"])
            already_depleted = float(item.get("current_stock", 0) or 0) <= 0
            body = (
                f"이미 소진되었습니다. 즉시 생산이 필요하며 권장 생산량은 {item['recommended_qty']}개입니다."
                if already_depleted
                else f"현재고 감소 추세로 약 1시간 내 소진 가능성이 있습니다. 권장 생산량은 {item['recommended_qty']}개입니다."
            )
            modal = await self.modal_manager.create_modal(
                context.store_id,
                modal_type=ModalType.PRODUCTION_ALERT,
                severity=severity,
                title=f"⚠️ {item['product_name']} {'즉시 생산 필요' if already_depleted else '재고 부족 예상'}",
                body=body,
                data={
                    "items": [
                        {
                            "product_name": item["product_name"],
                            "current_stock": item.get("current_stock", 0),
                            "predicted_stock_1h": item.get("predicted_stock_1h"),
                            "depletion_eta": item.get("depletion_eta"),
                            "note": item["reason"] if not already_depleted else "이미 소진됨",
                            "first_production": item["pattern"].get("first_production"),
                            "second_production": item["pattern"].get("second_production"),
                        }
                    ]
                },
                actions=[
                    ModalAction(label="지금 생산 등록", action_type="confirm", api_endpoint="/api/inventory/register-production", params={"product_id": item["product_id"], "quantity": item["recommended_qty"]}),
                    ModalAction(label="수량 수정", action_type="modify", api_endpoint="/api/inventory/production-guide", params={}),
                    ModalAction(label="나중에", action_type="dismiss", api_endpoint="", params={}),
                ],
                net_profit_impact=net_bar.net_profit_delta,
                dedup_key=f"{context.store_id}_production_{item['product_id']}",
            )
            if modal:
                await self.auditor.log(context=context, action="ai_recommendation", tool_name="get_recommended_production", params={"product_id": item["product_id"]})

    async def _check_order_deadlines(self, context) -> None:
        deadlines = await self.registry.execute("get_pending_deadlines", store_id=context.store_id)
        for item in deadlines:
            minutes = item["minutes_remaining"]
            if item["has_pending_order"] or minutes > ORDER_DEADLINE_WARNING_MINUTES:
                continue
            severity = "critical" if minutes <= ORDER_DEADLINE_CRITICAL_MINUTES else "warning"
            modal = await self.modal_manager.create_modal(
                context.store_id,
                modal_type=ModalType.ORDER_DEADLINE,
                severity=severity,
                title=f"📦 {item['product_group']} 발주 마감 {minutes}분 전",
                body="아직 주문이 접수되지 않았습니다.",
                data=item,
                actions=[
                    ModalAction(label="AI 추천으로 바로 발주", action_type="confirm", api_endpoint="/api/order/confirm", params={"source": "ai_recommendation"}),
                    ModalAction(label="직접 발주하기", action_type="modify", api_endpoint="/api/order/recommendations", params={}),
                    ModalAction(label="오늘 안 함", action_type="dismiss", api_endpoint="", params={}),
                ],
                dedup_key=f"{context.store_id}_deadline_{item['product_group']}",
            )
            if modal:
                await self.auditor.log(context=context, action="ai_recommendation", tool_name="get_pending_deadlines", params={"product_group": item["product_group"]})

    async def _check_sales_anomaly(self, context) -> None:
        summary = await self.registry.execute("get_daily_summary", store_id=context.store_id)
        for key, label in [("vs_yesterday_same_time_pct", "전일 대비"), ("vs_last_week_same_day_pct", "전주 대비")]:
            pct = float(summary.get(key, 0) or 0)
            if abs(pct) < SALES_ANOMALY_PCT:
                continue
            await self.modal_manager.create_modal(
                context.store_id,
                modal_type=ModalType.ANOMALY_SALES,
                severity="info",
                title=f"{'📈' if pct > 0 else '📉'} 매출 {'급증' if pct > 0 else '급감'}: {label} {pct:+.1f}%",
                body="매출 비교 화면에서 원인을 확인하세요.",
                data=summary,
                actions=[ModalAction(label="매출 분석 보기", action_type="modify", api_endpoint="/api/sales/compare", params={})],
                dedup_key=f"{context.store_id}_sales_{key}",
            )
