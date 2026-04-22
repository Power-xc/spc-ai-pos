"""Production management agent."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from app.schemas.dashboard import InventoryItem
from app.schemas.production import (
    ChanceLossFeedback,
    ProductionAlert,
    ProductionRegisterResponse,
    StockoutRiskItem,
)
from app.tools import sql_queries
from app.tools.templates import DOW_NAMES

logger = logging.getLogger(__name__)


class ProductionAgent:
    """Coordinate production risk scanning and production actions."""

    MAX_ALERTS = 8
    ALERT_WINDOW_MINUTES = 60

    def __init__(
        self,
        db_session_factory,
        predictor,
        chance_loss_calculator,
        template_engine,
        notification_service,
        audit_logger=None,
    ) -> None:
        self.db_session_factory = db_session_factory
        self.predictor = predictor
        self.chance_loss_calculator = chance_loss_calculator
        self.template_engine = template_engine
        self.notification_service = notification_service
        self.audit_logger = audit_logger
        self._alert_cache: dict[str, list[ProductionAlert]] = {}
        self._alert_lookup: dict[str, dict] = {}
        self._production_records: dict[str, list[dict]] = {}

    async def daily_scan(
        self, store_id: str, user_id: str = "system", role: str = "hq_admin"
    ) -> list[ProductionAlert]:
        """일일 생산 리스크 스캔."""
        return await self.check_production_needs(store_id, user_id=user_id, role=role)

    async def check_production_needs(
        self, store_id: str, user_id: str = "system", role: str = "hq_admin"
    ) -> list[ProductionAlert]:
        """5분 주기 생산 필요 체크."""
        try:
            if self.audit_logger:
                await self.audit_logger.log_access(
                    user_id=user_id,
                    role=role,
                    action="production_scan",
                    resource="production:alerts",
                    masked_fields=[],
                    details={"store_id": store_id},
                )
            async with self.db_session_factory() as db:
                risk_products = await self.predictor.get_all_risk_products(db, store_id)

            now = datetime.now(UTC).astimezone()
            alerts: list[ProductionAlert] = []
            for item in risk_products:
                depletion_eta = item.get("depletion_eta")
                if depletion_eta is None:
                    continue
                if isinstance(depletion_eta, str):
                    depletion_eta = datetime.fromisoformat(depletion_eta)
                minutes_to_depletion = (depletion_eta - now).total_seconds() / 60
                if not (0 <= minutes_to_depletion <= self.ALERT_WINDOW_MINUTES):
                    continue

                severity = "HIGH" if minutes_to_depletion <= 30 else "MEDIUM"
                first_pattern = item.get("first_production") or None
                second_pattern = item.get("second_production") or None
                detail = StockoutRiskItem(
                    product_id=item["product_id"],
                    product_name=item["product_name"],
                    category=item["category"],
                    current_date_on_hand=item.get("current_date_on_hand"),
                    current_stock=int(item.get("current_stock", 0) or 0),
                    predicted_sold_qty=float(item.get("predicted_sold_qty", 0) or 0),
                    predicted_stock_1h=int(item.get("predicted_stock_1h", 0) or 0),
                    depletion_eta=depletion_eta.isoformat(),
                    hourly_burn_rate=float(item.get("hourly_burn_rate", 0) or 0),
                    stockout_probability=float(
                        item.get("stockout_probability", 0) or 0
                    ),
                    avg_stockout_minutes_4w=float(
                        item.get("avg_stockout_minutes_4w", 0) or 0
                    ),
                    recommended_production_qty=int(
                        item.get("recommended_production_qty", 0) or 0
                    ),
                    chance_loss_if_no_action=float(
                        item.get("chance_loss_if_no_action", 0) or 0
                    ),
                    first_production=first_pattern,
                    second_production=second_pattern,
                )
                message = self.template_engine.render(
                    "production_alert",
                    product_name=item["product_name"],
                    category=item["category"],
                    current_stock=int(item.get("current_stock", 0) or 0),
                    predicted_stock_1h=int(item.get("predicted_stock_1h", 0) or 0),
                    depletion_eta=depletion_eta.strftime("%H:%M"),
                    dow_name=DOW_NAMES.get(now.weekday(), "오늘"),
                    avg_sold_qty=round(float(item.get("avg_sold_qty", 0) or 0), 1),
                    avg_stockout_minutes=round(
                        float(item.get("avg_stockout_minutes", 0) or 0), 1
                    ),
                    weeks_with_stockout=int(item.get("weeks_with_stockout", 0) or 0),
                    first_production_time=(first_pattern or {}).get("avg_time", "없음"),
                    first_production_qty=(first_pattern or {}).get("avg_qty", 0),
                    second_production_time=(second_pattern or {}).get(
                        "avg_time", "없음"
                    ),
                    second_production_qty=(second_pattern or {}).get("avg_qty", 0),
                    recommended_qty=int(item.get("recommended_production_qty", 0) or 0),
                    chance_loss_est=round(
                        float(item.get("chance_loss_if_no_action", 0) or 0)
                    ),
                )
                alert = ProductionAlert(
                    id=f"prod-{uuid4().hex[:12]}",
                    severity=severity,
                    product_id=item["product_id"],
                    product_name=item["product_name"],
                    message=message,
                    detail=detail,
                    cta_label="생산 등록하기",
                    cta_action="PRODUCTION_REGISTER",
                    created_at=datetime.now(UTC).isoformat(),
                )
                alerts.append(alert)
                self._alert_lookup[alert.id] = {
                    "store_id": store_id,
                    "created_at": alert.created_at,
                    "detail": detail.model_dump(mode="json"),
                }

            alerts = alerts[: self.MAX_ALERTS]
            self._alert_cache[store_id] = alerts
            for alert in alerts:
                await self.notification_service.publish(
                    store_id,
                    "production_alert",
                    alert.model_dump(mode="json"),
                )
            return alerts
        except Exception:
            if self.audit_logger:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    role=role,
                    action="production_scan",
                    resource="production:alerts",
                    error="check_production_needs_failed",
                    details={"store_id": store_id},
                )
            logger.exception(
                "Failed to check production needs for store_id=%s", store_id
            )
            return []

    async def get_current_alerts(
        self, store_id: str, user_id: str = "anonymous", role: str = "store_owner"
    ) -> list[ProductionAlert]:
        """Return cached production alerts or trigger a fresh scan."""
        if store_id in self._alert_cache:
            return self._alert_cache[store_id]
        return await self.check_production_needs(store_id, user_id=user_id, role=role)

    async def get_inventory_status(
        self, store_id: str, user_id: str = "anonymous", role: str = "store_owner"
    ) -> list[InventoryItem]:
        """Return the latest inventory status for dashboard rendering."""
        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="inventory_status",
                resource="production:inventory",
                masked_fields=[],
                details={"store_id": store_id},
            )
        async with self.db_session_factory() as db:
            inventory = await sql_queries.get_store_inventory_today(db, store_id)
            risk_products = await self.predictor.get_all_risk_products(db, store_id)

        risk_map = {item["product_id"]: item for item in risk_products}
        status_items: list[InventoryItem] = []
        for row in inventory:
            risk_item = risk_map.get(row["product_id"], {})
            stockout_minutes = int(row.get("stockout_minutes", 0) or 0)
            if risk_item.get("risk_level"):
                stockout_risk = risk_item["risk_level"]
            elif stockout_minutes >= 60:
                stockout_risk = "HIGH"
            elif stockout_minutes >= 20:
                stockout_risk = "MEDIUM"
            elif stockout_minutes > 0:
                stockout_risk = "LOW"
            else:
                stockout_risk = "NONE"

            estimated_chance_loss = round(
                (
                    float(stockout_minutes)
                    / self.chance_loss_calculator.OPERATING_MINUTES
                )
                * float(row.get("sold_qty", 0) or 0)
                * float(row.get("base_price", 0) or 0),
                2,
            )

            status_items.append(
                InventoryItem(
                    product_id=row["product_id"],
                    product_name=row["product_name"],
                    category=row["category"],
                    on_hand_eod=float(row.get("on_hand_eod", 0) or 0),
                    sold_qty=float(row.get("sold_qty", 0) or 0),
                    waste_qty=float(row.get("waste_qty", 0) or 0),
                    stockout_minutes=stockout_minutes,
                    reorder_triggered=bool(row.get("reorder_triggered", 0)),
                    base_price=float(row.get("base_price", 0) or 0),
                    estimated_chance_loss=estimated_chance_loss
                    if estimated_chance_loss > 0
                    else None,
                    stockout_risk=stockout_risk,
                )
            )
        return status_items

    async def get_risk_products(
        self, store_id: str, biz_date: str | None = None
    ) -> list[dict]:
        from datetime import datetime, date, timezone

        async with self.db_session_factory() as db:
            reference_datetime = None
            biz_date_obj = None
            if biz_date:
                try:
                    biz_date_obj = date.fromisoformat(biz_date)
                    reference_datetime = datetime(
                        biz_date_obj.year,
                        biz_date_obj.month,
                        biz_date_obj.day,
                        14,
                        45,
                        tzinfo=timezone(timedelta(hours=9)),
                    )
                except (ValueError, TypeError):
                    pass
            risk_products = await self.predictor.get_all_risk_products(
                db, store_id, reference_time=reference_datetime, biz_date=biz_date_obj
            )
        return risk_products

    async def register_production(
        self,
        store_id: str,
        product_id: str,
        quantity: int,
        alert_id: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> ProductionRegisterResponse:
        """생산 등록 처리 + 피드백 생성."""
        production_id = f"prod-reg-{uuid4().hex[:12]}"
        registered_at = datetime.now(UTC).isoformat()
        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="production_register",
                resource="production:register",
                masked_fields=[],
                details={
                    "store_id": store_id,
                    "product_id": product_id,
                    "quantity": quantity,
                },
            )
        feedback = None
        alert_context = self._alert_lookup.get(alert_id or "", {})
        detail = alert_context.get("detail")
        if detail is None:
            cached_alert = next(
                (
                    alert
                    for alert in self._alert_cache.get(store_id, [])
                    if alert.product_id == product_id
                ),
                None,
            )
            detail = (
                cached_alert.detail.model_dump(mode="json") if cached_alert else None
            )

        if detail:
            now = datetime.now(UTC).astimezone()
            depletion_eta = detail.get("depletion_eta")
            depletion_eta_dt = (
                datetime.fromisoformat(depletion_eta) if depletion_eta else None
            )
            hourly_burn_rate = float(detail.get("hourly_burn_rate", 0) or 0)
            predicted_daily_qty = max(
                float(detail.get("predicted_sold_qty", 0) or 0), 1.0
            )
            base_price = 0.0
            async with self.db_session_factory() as db:
                inventory_rows = await sql_queries.get_store_inventory_today(
                    db, store_id
                )
            inventory_row = next(
                (row for row in inventory_rows if row["product_id"] == product_id), None
            )
            if inventory_row:
                base_price = float(inventory_row.get("base_price", 0) or 0)
            no_action_loss_qty = (
                float(detail.get("chance_loss_if_no_action", 0) or 0) / base_price
                if base_price > 0
                else hourly_burn_rate
            )

            if depletion_eta_dt and now < depletion_eta_dt:
                impact_pct = round((no_action_loss_qty / predicted_daily_qty) * 100, 1)
                feedback = ChanceLossFeedback(
                    type="POSITIVE",
                    message=f"찬스 로스를 {impact_pct:.1f}% 감소시켰습니다.",
                    impact_pct=impact_pct,
                    estimated_amount=round(
                        float(detail.get("chance_loss_if_no_action", 0) or 0), 2
                    ),
                )
            elif depletion_eta_dt:
                elapsed_minutes = max(
                    (now - depletion_eta_dt).total_seconds() / 60, 0.0
                )
                lost_qty = hourly_burn_rate * (elapsed_minutes / 60)
                impact_pct = round((lost_qty / predicted_daily_qty) * 100, 1)
                feedback = ChanceLossFeedback(
                    type="NEGATIVE",
                    message=f"{impact_pct:.1f}% 찬스 로스가 발생했습니다.",
                    impact_pct=impact_pct,
                    estimated_amount=round(lost_qty * base_price, 2),
                )

        if feedback is None:
            async with self.db_session_factory() as db:
                latest_date = await sql_queries.get_latest_biz_date(db, store_id)
                daily_chance_loss = (
                    await self.chance_loss_calculator.calculate_daily_chance_loss(
                        db, store_id, latest_date
                    )
                )
                risk_products = await self.predictor.get_all_risk_products(db, store_id)

            today_product = next(
                (
                    item
                    for item in daily_chance_loss["products"]
                    if item["product_id"] == product_id
                ),
                {
                    "stockout_minutes": 0,
                    "chance_loss_amt": 0.0,
                },
            )
            historical = next(
                (item for item in risk_products if item["product_id"] == product_id),
                None,
            )
            feedback_dict = await self.chance_loss_calculator.generate_feedback_message(
                store_id=store_id,
                product_id=product_id,
                today_data=today_product,
                historical_avg={
                    "avg_stockout_minutes": historical.get("avg_stockout_minutes", 0)
                    if historical
                    else 0,
                    "avg_chance_loss_amt": historical.get("chance_loss_if_no_action", 0)
                    if historical
                    else 0,
                },
            )
            feedback = ChanceLossFeedback(**feedback_dict)

        self._production_records.setdefault(store_id, []).append(
            {
                "production_id": production_id,
                "product_id": product_id,
                "quantity": quantity,
                "alert_id": alert_id,
                "registered_at": registered_at,
            }
        )
        return ProductionRegisterResponse(
            production_id=production_id,
            registered_at=registered_at,
            feedback=feedback,
        )

    async def generate_daily_insight(self, store_id: str, biz_date: date) -> dict:
        """Generate and persist a production-focused daily insight."""
        async with self.db_session_factory() as db:
            kpis = await sql_queries.get_daily_kpis(db, store_id, biz_date)
            chance_loss = await self.chance_loss_calculator.calculate_daily_chance_loss(
                db, store_id, biz_date
            )
            top_loss_products = chance_loss["products"][:3]
            summary_text = (
                f"{store_id}의 {biz_date} 생산 인사이트: "
                f"품절 제품 수 {kpis['products_with_stockout']}개, "
                f"추정 기회손실 {kpis['chance_loss_est']:.0f}원"
            )
            row_id = await sql_queries.insert_ai_insight(
                db=db,
                store_id=store_id,
                biz_date=biz_date,
                summary_text=summary_text,
                kpi_json=kpis,
                root_causes_json={"top_loss_products": top_loss_products},
                actions_json={
                    "actions": [
                        "품절 발생 빈도가 높은 제품의 오전 생산량 재점검",
                        "재주문 트리거가 반복되는 핵심 메뉴를 우선 모니터링",
                    ]
                },
                evidence_sql_refs=[
                    "get_daily_kpis",
                    "calculate_daily_chance_loss",
                ],
            )
        return {
            "id": row_id,
            "store_id": store_id,
            "biz_date": str(biz_date),
            "summary_text": summary_text,
        }
