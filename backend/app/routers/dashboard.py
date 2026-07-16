"""Dashboard API router with widget-level cockpit endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime
import logging
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from app.agents.order_agent import ORDER_DEADLINES
from app.config import get_settings
from app.dependencies import (
    get_alert_service,
    get_current_user_context,
    get_current_user_role,
    get_db,
    get_notification_service,
    get_order_agent,
    get_postgres_db,
    get_production_agent,
    get_request_store_id,
)
from app.demo_store_config import canonical_store_name
from app.db.session import is_postgres_mode
from app.schemas.common import APIResponse, AlertCard
from app.schemas.dashboard import (
    BriefingOpportunity,
    DashboardAction,
    DashboardAlertsResponse,
    DashboardBriefingResponse,
    DashboardOrdersResponse,
    DashboardProductionResponse,
    DashboardResponse,
    DashboardSalesSummaryResponse,
    MiniChartPoint,
    OrderDeadlineCard,
    ProductionCockpitItem,
    TodoItem,
    TodaySales,
)
from app.services import manual_inputs
from app.tools import sql_queries

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
logger = logging.getLogger(__name__)
settings = get_settings()


class FinancialInputUpsertRequest(BaseModel):
    """Owner-verified daily financial inputs for profitability refinement."""

    store_id: str | None = None
    biz_date: str = Field(..., description="YYYY-MM-DD")
    fixed_cost_amt: float | None = None
    labor_cost_amt: float | None = None
    promo_cost_amt: float | None = None
    promo_sales_lift_amt: float | None = None
    promo_coupon_redemption_amt: float | None = None
    note: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "POC_001",
                "biz_date": "2026-04-13",
                "fixed_cost_amt": 120000,
                "labor_cost_amt": 80000,
                "promo_cost_amt": 15000,
                "promo_sales_lift_amt": 30000,
                "promo_coupon_redemption_amt": 5000,
                "note": "점주 입력",
            }
        }
    )


class CustomerInputUpsertRequest(BaseModel):
    """Owner-verified daily customer visit inputs."""

    store_id: str | None = None
    biz_date: str = Field(..., description="YYYY-MM-DD")
    unique_customers: int | None = None
    repeat_customers: int | None = None
    repeat_visit_rate_pct: float | None = None
    orders_from_repeat_customers: int | None = None
    avg_orders_per_repeat_customer: float | None = None
    data_source: str | None = None
    note: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "POC_001",
                "biz_date": "2026-04-13",
                "unique_customers": 420,
                "repeat_customers": 96,
                "orders_from_repeat_customers": 154,
                "data_source": "POS daily export",
                "note": "점주 검증 완료",
            }
        }
    )


# 원료/부자재/포장재 판정 기준
# - product_id 7xxxxx: 원자재/포장재/도구/용품 (완제품 아님)
# - 8xxxxx: 완제품 (도넛, 먼치킨, 음료, 베이글, 샌드위치 등)
RAW_MATERIAL_KEYWORDS = set()
RAW_MATERIAL_CATEGORIES = {
    "냉동/냉장", "냉장/냉동", "냉동", "냉장", "용품/상품", "포장재",
    "원자재", "도구", "기타/용품",
}
_RAW_MATERIAL_PRODUCT_IDS = {"700721", "700009", "700013", "700014", "700015", "700016", "700104"}


def _is_raw_material(product_id: str, product_name: str | None, category: str | None) -> bool:
    """원료/부자재/포장재/도구/용품을 판정해 생산관리 대상에서 제외."""
    product_id = str(product_id).strip()

    # product_id 7xxxxx = 원자재 prefix
    if product_id.startswith("7"):
        return True

    # 확정 제외 목록
    if product_id in _RAW_MATERIAL_PRODUCT_IDS:
        return True

    # category가 원료 계열
    if category and category in RAW_MATERIAL_CATEGORIES:
        return True

    # 이름에 원료 키워드 포함
    if product_name:
        name_lower = product_name.lower()
        for kw in RAW_MATERIAL_KEYWORDS:
            if kw.lower() in name_lower:
                return True

    return False


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _parse_demo_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=ZoneInfo("Asia/Seoul"))
    return parsed


def _alert_to_card(alert) -> AlertCard:
    if isinstance(alert, AlertCard):
        return alert
    if hasattr(alert, "detail"):
        detail = alert.detail
        subtitle = None
        if getattr(detail, "depletion_eta", None):
            subtitle = f"{detail.depletion_eta} 예상 소진"
        return AlertCard(
            id=alert.id,
            severity=alert.severity,
            type="production",
            title=f"{alert.product_name} 재고 부족 예상",
            subtitle=subtitle,
            message=alert.message,
            cta={
                "label": alert.cta_label,
                "action": alert.cta_action,
                "route": "/production",
            },
            created_at=alert.created_at,
            read=False,
        )
    return AlertCard.model_validate(alert)


def _notification_to_alert_card(message: dict) -> AlertCard | None:
    event_type = str(message.get("event_type") or "")
    data = message.get("data") or {}
    timestamp = message.get("timestamp") or _now_iso()
    if event_type == "production_alert":
        return AlertCard(
            id=data.get("id", f"production-{timestamp}"),
            severity=data.get("severity", "MEDIUM"),
            type="production",
            title=f"{data.get('product_name', '상품')} 재고 부족 예상",
            subtitle=(data.get("detail") or {}).get("depletion_eta"),
            message=data.get("message"),
            cta={
                "label": data.get("cta_label", "생산 등록하기"),
                "action": data.get("cta_action", "PRODUCTION_REGISTER"),
                "route": "/production",
            },
            created_at=data.get("created_at", timestamp),
            read=False,
        )
    if event_type == "order_deadline":
        return AlertCard(
            id=data.get("id", f"order-{timestamp}"),
            severity=data.get("severity", "MEDIUM"),
            type="order",
            title=data.get("title", "주문 마감 임박"),
            subtitle=data.get("subtitle"),
            message=data.get("message"),
            cta=data.get("cta"),
            created_at=data.get("created_at", timestamp),
            read=False,
        )
    if event_type == "sales_insight":
        return AlertCard(
            id=data.get("id", f"sales-{timestamp}"),
            severity=data.get("severity", "LOW"),
            type="sales",
            title=data.get("title", "매출 인사이트"),
            subtitle=data.get("subtitle"),
            message=data.get("message"),
            cta=data.get("cta"),
            created_at=data.get("created_at", timestamp),
            read=False,
        )
    return None


def _alert_card_to_legacy_modal(card: AlertCard) -> dict:
    severity = (
        "critical"
        if card.severity == "HIGH"
        else "warning"
        if card.severity == "MEDIUM"
        else "info"
    )
    modal_type = (
        "production_alert"
        if card.type == "production"
        else "order_deadline"
        if card.type == "order"
        else "anomaly_sales"
    )
    return {
        "modal_id": card.id,
        "modal_type": modal_type,
        "severity": severity,
        "title": card.title,
        "body": card.message or card.subtitle or card.title,
        "data": {
            **({"subtitle": card.subtitle} if card.subtitle else {}),
            "warning_kind": _warning_kind_from_alert(card),
            "warning_mode": "beta",
        },
        "actions": (
            [
                {
                    "label": card.cta.get("label", "상세 보기"),
                    "action_type": card.cta.get("action", "modify"),
                    "api_endpoint": card.cta.get("route", "/"),
                    "params": {},
                }
            ]
            if card.cta
            else []
        ),
        "created_at": card.created_at,
        "expires_at": card.created_at,
        "net_profit_impact": None,
    }


def _warning_kind_from_alert(card: AlertCard) -> str:
    if card.type == "production":
        return "소진 속도 경보"
    if card.type == "order":
        return "제조 준비 필요"
    title = str(card.title or "")
    if "혼잡" in title or "피크" in title:
        return "혼잡/피크 경보"
    return "품절 대응 경보"


async def _get_store_or_404(db, store_id: str) -> dict:
    store = await sql_queries.get_store_info(db, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _safe_store(store_id: str, store: dict | None) -> dict[str, str]:
    if store:
        return {
            "store_id": str(store.get("store_id") or store_id),
            "store_name": canonical_store_name(
                store.get("store_id") or store_id, store.get("store_name") or store_id
            ),
        }
    return {
        "store_id": store_id,
        "store_name": canonical_store_name(store_id, store_id),
    }


def _legacy_sales_empty(store_id: str) -> dict:
    return {
        "store_id": store_id,
        "today_revenue": 0,
        "vs_yesterday_same_time_pct": None,
        "vs_last_week_same_day_pct": None,
        "hourly_trend": [],
        "top_selling": [],
        "insight": "매출 데이터가 아직 없습니다.",
        "last_updated_at": _now_iso(),
        "profitability": {
            "biz_date": date.today().isoformat(),
            "estimated_net_profit_amt": None,
            "estimated_margin_rate_pct": None,
            "break_even_sales_amt": None,
            "break_even_coverage_pct": None,
            "promo_profit_impact_amt": None,
            "profit_status": "insufficient_data",
            "margin_status": "insufficient_data",
            "break_even_status": "fixed_cost_missing",
            "promo_status": "integration_pending",
            "basis": ["매출/원가 데이터 부족으로 손익 추정이 불가능합니다."],
            "assumptions": [],
        },
    }


async def _build_legacy_sales_summary(
    db,
    store_id: str,
    biz_date: date | None = None,
    as_of_hour: int | None = None,
) -> dict:
    """Build legacy `/api/home/sales-summary` payload shape."""

    kpis = await sql_queries.get_daily_kpis(db, store_id, biz_date)
    chart = await sql_queries.get_sales_hourly_mini_chart(db, store_id, biz_date)
    profitability = await sql_queries.get_profitability_snapshot(db, store_id, biz_date)
    today_revenue = int(round(float(kpis.get("total_sales_amt", 0) or 0)))
    top_category = kpis.get("top_category")

    hourly_trend = []
    for point in chart:
        label = str(point.get("label") or "00:00")
        hour = int(label.split(":", 1)[0]) if ":" in label else int(label[:2] or 0)
        hourly_trend.append(
            {
                "hour": hour,
                "revenue": float(point.get("value", 0) or 0),
            }
        )

    cumulative_revenue_until = None
    if as_of_hour is not None:
        # "시각까지의 누적" 규칙:
        # HH:MM 기준, 8~(H-1)시 bucket 전체 + H시 bucket×(M/60)
        # 예: 12:00=8~11시 전체, 12:30=8~11시+12시×50%, 17:00=8~16시 전체
        total_by_hour = {h["hour"]: h["revenue"] for h in hourly_trend}
        floored = int(as_of_hour)
        frac = as_of_hour - floored
        cum = 0.0
        for h in range(8, min(floored, 21)):
            cum += total_by_hour.get(h, 0)
        if floored <= 21 and 0 < frac < 1:
            cum += total_by_hour.get(floored, 0) * frac
        if cum > 0:
            cumulative_revenue_until = int(round(cum))

    if top_category:
        insight = f"오늘 핵심 카테고리는 {top_category}입니다."
    else:
        insight = "오늘 핵심 카테고리 데이터가 없습니다."

    return {
        "store_id": store_id,
        "today_revenue": today_revenue,
        "cumulative_revenue_until": cumulative_revenue_until,
        "vs_yesterday_same_time_pct": (kpis.get("vs_yesterday") or {}).get("sales_pct"),
        "vs_last_week_same_day_pct": (kpis.get("vs_last_week_same_dow") or {}).get(
            "sales_pct"
        ),
        "hourly_trend": hourly_trend,
        "top_selling": (
            [{"product_name": top_category, "sales_amt": today_revenue}]
            if top_category
            else []
        ),
        "insight": insight,
        "last_updated_at": _now_iso(),
        "profitability": profitability,
    }


async def _build_legacy_briefing(
    *,
    request: Request,
    store_id: str,
    role: str,
    db,
    production_agent,
    order_agent,
    biz_date: date | None = None,
    reference_datetime: datetime | None = None,
) -> dict:
    """Build legacy `/api/home/briefing` payload shape."""

    user = get_current_user_context(request, role)
    store = await sql_queries.get_store_info(db, store_id)
    store_meta = _safe_store(store_id, store)
    as_of_hour_briefing = reference_datetime.hour if reference_datetime is not None else None
    sales_summary = await _build_legacy_sales_summary(db, store_id, biz_date, as_of_hour_briefing)
    customer_insights = await sql_queries.get_customer_insights_snapshot(db, store_id)
    production_alerts = await production_agent.get_current_alerts(
        store_id,
        user_id=user["user_id"],
        role=user["role"],
    )
    deadline_alerts = await order_agent.check_deadlines(
        store_id,
        publish=False,
        user_id=user["user_id"],
        role=user["role"],
        reference_datetime=reference_datetime,
    )

    active_alerts = []
    for alert in production_alerts:
        active_alerts.append(_alert_card_to_legacy_modal(_alert_to_card(alert)))
    for raw in deadline_alerts:
        card = raw if isinstance(raw, AlertCard) else AlertCard.model_validate(raw)
        active_alerts.append(_alert_card_to_legacy_modal(card))

    today_production = []
    for alert in production_alerts[:3]:
        detail = getattr(alert, "detail", None)
        today_production.append(
            {
                "product_id": alert.product_id,
                "product_name": alert.product_name,
                "recommended_qty": (
                    getattr(detail, "recommended_production_qty", None)
                    if detail is not None
                    else None
                ),
                "reason": alert.message,
                "urgency": str(alert.severity).lower(),
                "current_stock": (
                    getattr(detail, "current_stock", None)
                    if detail is not None
                    else None
                ),
                "predicted_stock_1h": (
                    getattr(detail, "predicted_stock_1h", None)
                    if detail is not None
                    else None
                ),
            }
        )

    pending_orders = []
    for alert in deadline_alerts[:3]:
        card = (
            alert if isinstance(alert, AlertCard) else AlertCard.model_validate(alert)
        )
        pending_orders.append(
            {
                "product_group": card.title,
                "deadline": card.subtitle or "",
                "minutes_remaining": 0,
                "status": (
                    "urgent"
                    if card.severity == "HIGH"
                    else "soon"
                    if card.severity == "MEDIUM"
                    else "ok"
                ),
            }
        )

    greeting = (
        f"{store_meta['store_name']} 브리핑입니다. "
        f"{sales_summary.get('insight') or '핵심 이슈를 확인해 주세요.'}"
    )
    return {
        "yesterday_summary": sales_summary,
        "today_production": today_production,
        "pending_orders": pending_orders,
        "active_alerts": active_alerts,
        "customer_insights": customer_insights,
        "greeting": greeting,
        "last_updated_at": _now_iso(),
    }


@router.get("/customer-insights", response_model=APIResponse)
async def get_customer_insights(
    request: Request,
    store_id: str = Query(...),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
):
    """Return customer insights snapshot with explicit availability status."""

    _ = get_current_user_context(request, role)
    _ = await _get_store_or_404(db, store_id)
    snapshot = await sql_queries.get_customer_insights_snapshot(db, store_id)
    return APIResponse(data=snapshot)


@router.post("/inputs/financial", response_model=APIResponse)
async def upsert_financial_inputs(
    req: FinancialInputUpsertRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
):
    """Persist owner-verified fixed/labor/promo inputs used by profitability KPI."""

    user = get_current_user_context(request, role)
    store_id = req.store_id or get_request_store_id(request, None)
    try:
        record = manual_inputs.upsert_financial_input(
            settings.data_dir,
            store_id=store_id,
            biz_date=req.biz_date,
            fixed_cost_amt=req.fixed_cost_amt,
            labor_cost_amt=req.labor_cost_amt,
            promo_cost_amt=req.promo_cost_amt,
            promo_sales_lift_amt=req.promo_sales_lift_amt,
            promo_coupon_redemption_amt=req.promo_coupon_redemption_amt,
            note=req.note,
            updated_by=user["user_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return APIResponse(data={"store_id": store_id, "saved": True, "record": record})


@router.post("/inputs/customer-insights", response_model=APIResponse)
async def upsert_customer_inputs(
    req: CustomerInputUpsertRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
):
    """Persist owner-verified customer visit metrics for dashboard insights."""

    user = get_current_user_context(request, role)
    store_id = req.store_id or get_request_store_id(request, None)
    try:
        record = manual_inputs.upsert_customer_input(
            settings.data_dir,
            store_id=store_id,
            biz_date=req.biz_date,
            unique_customers=req.unique_customers,
            repeat_customers=req.repeat_customers,
            repeat_visit_rate_pct=req.repeat_visit_rate_pct,
            orders_from_repeat_customers=req.orders_from_repeat_customers,
            avg_orders_per_repeat_customer=req.avg_orders_per_repeat_customer,
            data_source=req.data_source,
            note=req.note,
            updated_by=user["user_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return APIResponse(data={"store_id": store_id, "saved": True, "record": record})


@router.get("/briefing", response_model=APIResponse)
async def get_briefing(
    request: Request,
    store_id: str = Query(...),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
    order_agent=Depends(get_order_agent),
):
    """Return today's dashboard briefing."""
    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)
    production_alerts = await production_agent.get_current_alerts(
        store_id,
        user_id=user["user_id"],
        role=user["role"],
    )
    order_deadlines = await order_agent.check_deadlines(
        store_id,
        publish=False,
        user_id=user["user_id"],
        role=user["role"],
    )
    opportunities = await sql_queries.get_sales_opportunities(db, store_id, top_n=3)

    risk_cards = [_alert_to_card(alert) for alert in production_alerts]
    risk_cards.extend(order_deadlines)
    risk_cards = risk_cards[:5]

    opportunity_cards = [
        BriefingOpportunity(
            id=f"opportunity-{row['product_id']}",
            title=f"{row['product_name']} 판매 급증 감지",
            summary=(
                f"최근 4주 동요일 평균 대비 판매 수량이 "
                f"{abs(float(row.get('growth_pct', 0) or 0)):.1f}% 높습니다."
            ),
            metric=f"+{float(row.get('growth_pct', 0) or 0):.1f}%",
            cta=DashboardAction(
                label="매출 해석 보기",
                action="OPEN_SALES",
                route="/sales",
            ),
        )
        for row in opportunities
    ]

    actions: list[DashboardAction] = []
    if production_alerts:
        actions.append(
            DashboardAction(
                label="생산 추천 보기",
                action="OPEN_PRODUCTION",
                route="/production",
            )
        )
    if order_deadlines:
        actions.append(
            DashboardAction(
                label="주문 옵션 보기",
                action="OPEN_ORDERS",
                route="/orders",
            )
        )
    if opportunities:
        actions.append(
            DashboardAction(
                label="매출 해석 보기",
                action="OPEN_SALES",
                route="/sales",
            )
        )

    briefing = DashboardBriefingResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        risks=risk_cards,
        opportunities=opportunity_cards,
        actions=actions,
        last_updated_at=_now_iso(),
    )
    return APIResponse(data=briefing)


async def _enrich_with_production_products(
    db, store_id: str, predictor, existing_ids: set, limit: int
) -> list:
    if limit <= 0:
        return []
    try:
        prod_rows = await sql_queries._fetch_gold_all(
            db,
            f"""
            SELECT DISTINCT item_cd AS product_id, max(item_nm) AS product_name
            FROM {sql_queries.GOLD_SCHEMA}.new_production
            WHERE masked_stor_cd = :store_id
            GROUP BY item_cd
            ORDER BY max(item_nm)
            """,
            {"store_id": str(store_id)},
        )
    except Exception:
        logger.exception("Failed to query production products")
        return []

    if not prod_rows:
        return []

    result = []
    for row in prod_rows:
        product_id = str(row.get("product_id", "")).strip()
        if not product_id or product_id in existing_ids:
            continue
        product_name = str(row.get("product_name", product_id))
        if _is_raw_material(product_id, product_name, None):
            logger.debug("Enrich skip raw material: %s (%s)", product_id, product_name)
            continue

        try:
            pattern = await predictor.get_production_pattern(db, store_id, product_id)
            demand = await predictor.predict_daily_demand(db, store_id, product_id)
            hourly = await predictor.predict_hourly_depletion(db, store_id, product_id)
            inventory_rows = await sql_queries.get_store_inventory_today(db, store_id)
            inv_row = next(
                (r for r in inventory_rows if r["product_id"] == product_id), None
            )
        except Exception:
            logger.warning(
                "Failed to get prediction for production product %s", product_id
            )
            continue

        if not pattern or not (
            pattern.get("first_production") or pattern.get("second_production")
        ):
            continue

        on_hand = float(inv_row["on_hand_eod"]) if inv_row else 0
        category = str(inv_row.get("category", "미분류")) if inv_row else "미분류"
        sold_qty = float(inv_row.get("sold_qty", 0) or 0) if inv_row else 0
        stockout_minutes = (
            int(inv_row.get("stockout_minutes", 0) or 0) if inv_row else 0
        )

        first_prod = pattern.get("first_production") if pattern else None
        second_prod = pattern.get("second_production") if pattern else None
        predicted_stock_1h = hourly.get("predicted_stock_1h", int(on_hand))
        hourly_burn = hourly.get("hourly_burn_rate", 0)
        predicted_sold = float(demand.get("predicted_sold_qty", 0) or 0)
        recommended_qty = max(
            0, int(predicted_sold - on_hand + max(3, predicted_sold * 0.1))
        )

        why_parts = [
            f"최근 4주 평균 판매량 {predicted_sold:.1f}개",
            "품절 발생 빈도 0회",
        ]
        if hourly_burn > 0:
            why_parts.append(f"시간당 판매 속도 {hourly_burn:.1f}개")
        if first_prod and first_prod.get("avg_time"):
            why_parts.append(
                f"최근 생산 이력 평균 {first_prod['avg_time']} / {first_prod.get('avg_qty', 0)}개"
            )
        else:
            why_parts.append("생산 패턴 데이터 부족")
        if second_prod and second_prod.get("avg_time"):
            why_parts.append(
                f"최근 생산 이력 평균 {second_prod['avg_time']} / {second_prod.get('avg_qty', 0)}개"
            )
        else:
            why_parts.append("2차 생산 패턴 데이터 부족")

        risk_level = (
            "HIGH"
            if on_hand <= 0 or stockout_minutes >= 60
            else "MEDIUM"
            if stockout_minutes >= 20
            else "LOW"
        )

        result.append(
            ProductionCockpitItem(
                product_id=product_id,
                product_name=product_name,
                category=category,
                current_stock=int(on_hand),
                predicted_stock_1h=predicted_stock_1h,
                depletion_eta=hourly.get("depletion_eta").isoformat()
                if isinstance(hourly.get("depletion_eta"), datetime)
                else hourly.get("depletion_eta"),
                hourly_burn_rate=round(hourly_burn, 2),
                stockout_probability=0,
                recommended_production_qty=recommended_qty,
                first_production=first_prod,
                second_production=second_prod,
                risk_level=risk_level,
                why=why_parts,
            )
        )
        if len(result) >= limit:
            break

    return result


@router.get("/production", response_model=APIResponse)
async def get_production_dashboard(
    request: Request,
    store_id: str = Query(...),
    biz_date: date | None = Query(default=None),
    demo_datetime: str | None = Query(default=None),
    demo_time: str | None = Query(default=None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
):
    """Return production cockpit cards."""
    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)
    reference_datetime = _parse_demo_datetime(demo_datetime)
    biz_date_str = str(biz_date) if biz_date else ""

    # Build estimated stock map from inventory for time-based enrichment
    demo_time_str = (reference_datetime.strftime("%H:%M") if reference_datetime else None) or demo_time or "13:00"
    est_stock_map: dict[str, dict] = {}
    try:
        from app.routers.production import (  # noqa: F401
            _cumulative_hourly_ratio,
            _estimate_stock_at_time,
            _add_one_hour,
        )

        inv_rows = await sql_queries.get_store_inventory_today(db, store_id, biz_date) or []
        next_time_str = _add_one_hour(demo_time_str)
        cum = _cumulative_hourly_ratio(demo_time_str)
        next_cum = _cumulative_hourly_ratio(next_time_str)
        prod_map_raw: dict[str, float] = {}
        try:
            prod_rows = await sql_queries._fetch_gold_all(
                db,
                f"""
                SELECT item_cd, SUM(prod_qty) AS tp
                FROM {sql_queries.GOLD_SCHEMA}.new_production
                WHERE masked_stor_cd = :store_id AND prod_dt = :biz_date
                GROUP BY item_cd
                """,
                {"store_id": store_id, "biz_date": biz_date_str},
            )
            prod_map_raw = {str(r["item_cd"]): float(r["tp"] or 0) for r in (prod_rows or [])}
        except Exception:
            pass
        for row in inv_rows:
            pid = str(row.get("product_id") or "")
            on_hand = int(row.get("on_hand_eod") or 0)
            sold = float(row.get("sold_qty") or 0)
            produced = prod_map_raw.get(pid, 0)
            curr = _estimate_stock_at_time(on_hand, sold, produced, cum)
            pred1h = _estimate_stock_at_time(on_hand, sold, produced, next_cum)
            est_stock_map[pid] = {"current_stock": curr, "predicted_stock_1h": pred1h}
    except Exception:
        logger.exception("Failed to build estimated stock map for dashboard")

    risk_products = await production_agent.predictor.get_all_risk_products(
        db,
        store_id,
        reference_time=reference_datetime,
        biz_date=biz_date,
    )

    # 원료/부자재/포장재/도구 제외
    filtered_risk_products = []
    for rp in risk_products:
        pid = str(rp.get("product_id", ""))
        pname = rp.get("product_name") or ""
        pcat = rp.get("category") or ""
        if _is_raw_material(pid, pname, pcat):
            logger.debug("Excluded raw material: %s (%s) [%s]", pid, pname, pcat)
            continue
        filtered_risk_products.append(rp)

    items = []
    for item in filtered_risk_products[:8]:
        current_stock = int(item.get("current_stock", 0) or 0)
        predicted_stock_1h = int(item.get("predicted_stock_1h", 0) or 0)
        hourly_burn = float(item.get("hourly_burn_rate", 0) or 0)
        stockout_prob = float(item.get("stockout_probability", 0) or 0)
        risk_level = item.get("risk_level", "LOW")
        depletion_eta_val = item.get("depletion_eta")
        if isinstance(depletion_eta_val, datetime):
            depletion_eta_str = depletion_eta_val.isoformat()
        else:
            depletion_eta_str = depletion_eta_val

        if current_stock <= 0:
            status_label = "즉시 생산 필요"
        elif risk_level == "HIGH":
            status_label = "부족 위험"
        elif risk_level == "MEDIUM":
            status_label = "주의"
        else:
            status_label = "재고 적정"

        why_parts = [
            f"최근 4주 평균 판매량 {float(item.get('avg_sold_qty', 0) or 0):.1f}개",
            f"품절 발생 빈도 {int(item.get('weeks_with_stockout', 0) or 0)}회",
        ]
        if hourly_burn > 0:
            why_parts.append(f"시간당 판매 속도 {hourly_burn:.1f}개")
        if stockout_prob > 0:
            why_parts.append(f"동일 요일 품절 빈도 {stockout_prob:.0f}%")

        first_prod = item.get("first_production")
        second_prod = item.get("second_production")
        if first_prod and first_prod.get("avg_time"):
            why_parts.append(
                f"최근 생산 이력 평균 {first_prod['avg_time']} / {first_prod.get('avg_qty', 0)}개"
            )
        else:
            why_parts.append("생산 패턴 데이터 부족")
        if second_prod and second_prod.get("avg_time"):
            why_parts.append(
                f"최근 생산 이력 평균 {second_prod['avg_time']} / {second_prod.get('avg_qty', 0)}개"
            )
        else:
            why_parts.append("2차 생산 패턴 데이터 부족")

        pid_item = str(item["product_id"])
        est = est_stock_map.get(pid_item, {})
        est_current = est.get("current_stock")
        est_pred = est.get("predicted_stock_1h")

        items.append(
            ProductionCockpitItem(
                product_id=item["product_id"],
                product_name=item["product_name"],
                category=item["category"],
                current_stock=est_current if est_current is not None else current_stock,
                predicted_stock_1h=est_pred if est_pred is not None else predicted_stock_1h,
                depletion_eta=depletion_eta_str,
                hourly_burn_rate=round(hourly_burn, 2),
                stockout_probability=round(stockout_prob, 1),
                recommended_production_qty=int(
                    item.get("recommended_production_qty", 0) or 0
                ),
                first_production=first_prod,
                second_production=second_prod,
                risk_level=risk_level,
                why=why_parts,
                current_stock_is_estimated=est_current is not None,
                current_stock_basis="시간대 판매 패턴 기반 추정" if est_current is not None else None,
                current_stock_as_of=demo_time_str if est_current is not None else None,
                predicted_stock_1h_as_of=next_time_str if est_current is not None else None,
            )
        )

    if len(items) < 8:
        try:
            production_products = await _enrich_with_production_products(
                db,
                store_id,
                production_agent.predictor,
                {it.product_id for it in items},
                8 - len(items),
            )
            for pp in production_products:
                items.append(pp)
        except Exception:
            logger.warning(
                "Failed to enrich production dashboard with production-only products"
            )

    try:
        production_products = await _enrich_with_production_products(
            db,
            store_id,
            production_agent.predictor,
            {it.product_id for it in items},
            4,
        )
        for pp in production_products:
            items.append(pp)
    except Exception:
        logger.warning("Failed to add production-pattern products to dashboard")

    payload = DashboardProductionResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        items=items,
        last_updated_at=_now_iso(),
    )
    return APIResponse(data=payload, metadata={"user_id": user["user_id"]})


@router.get("/orders", response_model=APIResponse)
async def get_orders_dashboard(
    request: Request,
    store_id: str = Query(...),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    order_agent=Depends(get_order_agent),
):
    """Return order deadline cards and missing-order summaries."""
    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)
    deadline_snapshots = await order_agent.get_deadline_snapshots(store_id=store_id)
    snapshot_map = {item["category"]: item for item in deadline_snapshots}

    cards: list[OrderDeadlineCard] = []
    for category, deadline in ORDER_DEADLINES.items():
        response = await order_agent.generate_order_options(
            store_id,
            category=category,
            include_explanation=False,
            user_id=user["user_id"],
            role=user["role"],
        )
        snapshot = snapshot_map.get(
            category,
            {
                "minutes_remaining": 0,
                "confirmed_order_count": 0,
                "last_confirmed_at": None,
            },
        )
        minutes_remaining = int(snapshot.get("minutes_remaining") or 0)
        confirmed_order_count = int(snapshot.get("confirmed_order_count") or 0)
        best_option = (
            min(
                response.options,
                key=lambda option: abs(option.deviation_from_avg_pct),
            )
            if response.options
            else None
        )
        missing_item_count = (
            0
            if confirmed_order_count > 0
            else len(best_option.items)
            if best_option
            else 0
        )
        if minutes_remaining <= 10:
            severity = "HIGH"
        elif minutes_remaining <= 30:
            severity = "MEDIUM"
        else:
            severity = "LOW"
        cards.append(
            OrderDeadlineCard(
                category=category,
                deadline=deadline,
                minutes_remaining=minutes_remaining,
                severity=severity,
                missing_order_item_count=missing_item_count,
                recommended_option_label=best_option.label if best_option else None,
                why=[
                    f"최근 4주 동요일 추정 주문량 {response.four_week_avg_qty:.1f}개 기준입니다.",
                    (
                        f"오늘 확정 주문 {confirmed_order_count}건"
                        + (
                            f" / 마지막 확정 {snapshot.get('last_confirmed_at')}"
                            if snapshot.get("last_confirmed_at")
                            else ""
                        )
                    )
                    if confirmed_order_count > 0
                    else "오늘 확정 주문이 없습니다.",
                ],
                cta=DashboardAction(
                    label="조치하기",
                    action="OPEN_ORDERS",
                    route="/orders",
                ),
            )
        )

    payload = DashboardOrdersResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        today_deadlines=cards,
        imminent_deadline_count=sum(
            1
            for card in cards
            if 0 <= card.minutes_remaining <= 60 and card.missing_order_item_count > 0
        ),
        last_updated_at=_now_iso(),
    )
    return APIResponse(data=payload)


@router.get("/sales-summary", response_model=APIResponse)
async def get_sales_summary_dashboard(
    request: Request,
    store_id: str = Query(...),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
):
    """Return sales summary card for the cockpit."""
    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)
    kpis = await sql_queries.get_daily_kpis(db, store_id)
    chart = await sql_queries.get_sales_hourly_mini_chart(db, store_id)
    payload = DashboardSalesSummaryResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        biz_date=kpis["biz_date"],
        today_sales_amt=float(kpis["total_sales_amt"]),
        vs_yesterday_pct=kpis.get("vs_yesterday", {}).get("sales_pct"),
        vs_last_week_same_dow_pct=kpis.get("vs_last_week_same_dow", {}).get(
            "sales_pct"
        ),
        top_category=kpis.get("top_category"),
        mini_chart_data=[MiniChartPoint(**point) for point in chart],
        why=[
            f"전주 동요일 대비 매출 {kpis.get('vs_last_week_same_dow', {}).get('sales_pct') or 0:+.1f}%",
            f"핵심 카테고리: {kpis.get('top_category') or '정보 없음'}",
        ],
        last_updated_at=_now_iso(),
    )
    return APIResponse(data=payload, metadata={"user_id": user["user_id"]})


@router.get("/alerts", response_model=APIResponse)
async def get_dashboard_alerts(
    request: Request,
    store_id: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_db),
    notification_service=Depends(get_notification_service),
    production_agent=Depends(get_production_agent),
    order_agent=Depends(get_order_agent),
    alert_service=Depends(get_alert_service),
):
    """Return recent active dashboard alerts."""
    store_id = get_request_store_id(request, store_id)
    if is_postgres_mode():
        store_name = await alert_service.get_store_name(store_id)
        alert_cards = [
            AlertCard.model_validate(card)
            for card in await alert_service.list_alert_cards(store_id, limit=20)
        ]
        payload = DashboardAlertsResponse(
            store_id=store_id,
            store_name=store_name,
            alerts=alert_cards,
            last_updated_at=_now_iso(),
        )
        return APIResponse(data=payload)

    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)
    history = notification_service.get_recent(store_id, hours=24, limit=20)
    alert_cards = [
        card
        for message in history
        if (card := _notification_to_alert_card(message)) is not None
    ]

    if not alert_cards:
        production_alerts = await production_agent.get_current_alerts(
            store_id,
            user_id=user["user_id"],
            role=user["role"],
        )
        deadline_alerts = await order_agent.check_deadlines(
            store_id,
            publish=False,
            user_id=user["user_id"],
            role=user["role"],
        )
        alert_cards = [_alert_to_card(alert) for alert in production_alerts]
        alert_cards.extend(deadline_alerts)

    payload = DashboardAlertsResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        alerts=alert_cards[:20],
        last_updated_at=_now_iso(),
    )
    return APIResponse(data=payload)


async def get_home_alerts(
    request: Request,
    role: str = Depends(get_current_user_role),
    notification_service=Depends(get_notification_service),
    production_agent=Depends(get_production_agent),
    order_agent=Depends(get_order_agent),
    alert_service=Depends(get_alert_service),
):
    """Legacy `/api/home/alerts` payload used by the current frontend."""

    store_id = get_request_store_id(request, None)
    if is_postgres_mode():
        return APIResponse(
            data=await alert_service.list_legacy_modals(store_id, limit=20)
        )

    user = get_current_user_context(request, role)
    history = notification_service.get_recent(store_id, hours=24, limit=20)
    alert_cards = [
        card
        for message in history
        if (card := _notification_to_alert_card(message)) is not None
    ]
    if not alert_cards:
        production_alerts = await production_agent.get_current_alerts(
            store_id,
            user_id=user["user_id"],
            role=user["role"],
        )
        deadline_alerts = await order_agent.check_deadlines(
            store_id,
            publish=False,
            user_id=user["user_id"],
            role=user["role"],
        )
        alert_cards = [_alert_to_card(alert) for alert in production_alerts]
        alert_cards.extend(deadline_alerts)

    return APIResponse(
        data=[_alert_card_to_legacy_modal(card) for card in alert_cards[:20]]
    )


async def get_home_briefing(
    request: Request,
    biz_date: date | None = Query(None),
    demo_datetime: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
    order_agent=Depends(get_order_agent),
):
    """Legacy `/api/home/briefing` payload used by frontend DashboardPage."""

    store_id = get_request_store_id(request, None)
    try:
        payload = await _build_legacy_briefing(
            request=request,
            store_id=store_id,
            role=role,
            db=db,
            production_agent=production_agent,
            order_agent=order_agent,
            biz_date=biz_date,
            reference_datetime=_parse_demo_datetime(demo_datetime),
        )
    except Exception:
        logger.exception(
            "Failed to build legacy briefing payload for store_id=%s", store_id
        )
        payload = {
            "yesterday_summary": _legacy_sales_empty(store_id),
            "today_production": [],
            "pending_orders": [],
            "active_alerts": [],
            "customer_insights": {
                "status": "integration_pending",
                "repeat_customer_count": None,
                "repeat_visit_rate_pct": None,
                "avg_orders_per_repeat_customer": None,
                "reference_period": None,
                "note": "고객 식별자 기반 주문 원천 데이터 연동 대기",
            },
            "greeting": "브리핑 데이터를 불러올 수 없어 기본 정보를 표시합니다.",
            "last_updated_at": _now_iso(),
        }
    return APIResponse(data=payload)


async def get_home_sales_summary(
    request: Request,
    biz_date: date | None = Query(None),
    demo_datetime: str | None = Query(None),
    db=Depends(get_postgres_db),
):
    """Legacy `/api/home/sales-summary` payload used by frontend DashboardPage."""

    store_id = get_request_store_id(request, None)
    reference_dt = _parse_demo_datetime(demo_datetime)
    as_of_hour = (reference_dt.hour + reference_dt.minute / 60) if reference_dt is not None else None
    try:
        payload = await _build_legacy_sales_summary(db, store_id, biz_date, as_of_hour)
    except Exception:
        logger.exception(
            "Failed to build legacy sales summary for store_id=%s", store_id
        )
        payload = _legacy_sales_empty(store_id)
    return APIResponse(data=payload)


@router.get("/{store_id}", response_model=APIResponse)
async def get_dashboard(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
    order_agent=Depends(get_order_agent),
):
    """Legacy aggregate dashboard payload for the operating cockpit view."""
    user = get_current_user_context(request, role)
    store = await _get_store_or_404(db, store_id)

    alerts = await production_agent.get_current_alerts(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    inventory_status = await production_agent.get_inventory_status(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    kpis = await sql_queries.get_daily_kpis(db, store_id)
    pending_deadlines = await order_agent.check_deadlines(
        store_id,
        publish=False,
        user_id=user["user_id"],
        role=user["role"],
    )

    todo_list = [
        TodoItem(
            id=f"todo-order-{category}",
            label=f"{category} 주문 확인",
            deadline=deadline,
            done=False,
            priority="HIGH"
            if any(alert.title.startswith(category) for alert in pending_deadlines)
            else "MEDIUM",
        )
        for category, deadline in ORDER_DEADLINES.items()
    ]
    if alerts:
        todo_list.insert(
            0,
            TodoItem(
                id="todo-production",
                label="품절 위험 상품 생산 등록",
                deadline=None,
                done=False,
                priority="HIGH",
            ),
        )

    dashboard = DashboardResponse(
        store_id=store["store_id"],
        store_name=store["store_name"],
        biz_date=kpis["biz_date"],
        last_updated=_now_iso(),
        alerts=[_alert_to_card(alert) for alert in alerts]
        + [alert.model_dump(mode="python") for alert in pending_deadlines],
        today_sales=TodaySales(
            total_sales_amt=float(kpis["total_sales_amt"]),
            total_sold_qty=int(kpis["total_sold_qty"]),
            vs_last_week_pct=kpis["vs_last_week_same_dow"]["sales_pct"],
            vs_last_month_pct=kpis["vs_last_month"]["sales_pct"],
            top_category=kpis["top_category"],
        ),
        inventory_status=inventory_status,
        todo_list=todo_list,
    )
    return APIResponse(data=dashboard)
