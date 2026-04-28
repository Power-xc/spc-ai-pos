"""Dashboard response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.common import AlertCard
from app.schemas.production import ProductionBatchPattern


class InventoryItem(BaseModel):
    """Inventory item shown on the dashboard."""

    product_id: str
    product_name: str
    category: str
    on_hand_eod: float
    sold_qty: float
    waste_qty: float
    stockout_minutes: int
    reorder_triggered: bool
    base_price: float
    estimated_chance_loss: float | None = None
    stockout_risk: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "category": "도넛",
                "on_hand_eod": 12,
                "sold_qty": 48,
                "waste_qty": 2,
                "stockout_minutes": 35,
                "reorder_triggered": True,
                "base_price": 1800,
                "estimated_chance_loss": 5400,
                "stockout_risk": "HIGH",
            }
        }
    )


class TodoItem(BaseModel):
    """Action item for the store owner."""

    id: str
    label: str
    deadline: str | None
    done: bool
    priority: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "todo-order-donut",
                "label": "도넛 주문 확인",
                "deadline": "15:00",
                "done": False,
                "priority": "HIGH",
            }
        }
    )


class TodaySales(BaseModel):
    """Headline daily sales metrics."""

    total_sales_amt: float
    total_sold_qty: int
    vs_last_week_pct: float | None
    vs_last_month_pct: float | None
    top_category: str | None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_sales_amt": 1250000,
                "total_sold_qty": 485,
                "vs_last_week_pct": 8.1,
                "vs_last_month_pct": 5.4,
                "top_category": "도넛",
            }
        }
    )


class DashboardResponse(BaseModel):
    """Dashboard payload for the operating cockpit view."""

    store_id: str
    store_name: str
    biz_date: str
    last_updated: str
    alerts: list[AlertCard]
    today_sales: TodaySales
    inventory_status: list[InventoryItem]
    todo_list: list[TodoItem]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "store_name": "강남역점",
                "biz_date": "2026-04-03",
                "last_updated": "2026-04-03T09:00:00Z",
                "alerts": [],
                "today_sales": {
                    "total_sales_amt": 1250000,
                    "total_sold_qty": 485,
                    "vs_last_week_pct": 8.1,
                    "vs_last_month_pct": 5.4,
                    "top_category": "도넛",
                },
                "inventory_status": [],
                "todo_list": [],
            }
        }
    )


class DashboardAction(BaseModel):
    """Action CTA surfaced in the dashboard briefing."""

    label: str
    action: str
    route: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "label": "생산 추천 보기",
                "action": "OPEN_PRODUCTION",
                "route": "/production",
            }
        }
    )


class BriefingOpportunity(BaseModel):
    """Sales or operational opportunity surfaced in the briefing card."""

    id: str
    title: str
    summary: str
    metric: str | None = None
    cta: DashboardAction | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "sales-opportunity-P001",
                "title": "글레이즈드 매출 급증",
                "summary": "최근 4주 동요일 평균 대비 판매량이 크게 상승했습니다.",
                "metric": "+18.4%",
                "cta": {
                    "label": "매출 해석 보기",
                    "action": "OPEN_SALES",
                    "route": "/sales",
                },
            }
        }
    )


class DashboardBriefingResponse(BaseModel):
    """Top-level briefing data for the web POS cockpit."""

    store_id: str
    store_name: str
    risks: list[AlertCard]
    opportunities: list[BriefingOpportunity]
    actions: list[DashboardAction]
    last_updated_at: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "POC_001",
                "store_name": "고양시02",
                "risks": [],
                "opportunities": [],
                "actions": [],
                "last_updated_at": "2026-04-07T10:00:00Z",
            }
        }
    )


class ProductionCockpitItem(BaseModel):
    """Production card row rendered in the cockpit panel."""

    product_id: str
    product_name: str
    category: str
    current_stock: int
    predicted_stock_1h: int
    depletion_eta: str | None = None
    hourly_burn_rate: float
    stockout_probability: float
    recommended_production_qty: int
    first_production: ProductionBatchPattern | None = None
    second_production: ProductionBatchPattern | None = None
    risk_level: str
    why: list[str] | None = None
    current_stock_is_estimated: bool = False
    current_stock_basis: str | None = None
    current_stock_as_of: str | None = None
    predicted_stock_1h_as_of: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "category": "도넛",
                "current_stock": 8,
                "predicted_stock_1h": 0,
                "depletion_eta": "2026-04-07T16:10:00+09:00",
                "hourly_burn_rate": 6.2,
                "stockout_probability": 75.0,
                "recommended_production_qty": 12,
                "first_production": {"avg_time": "09:15", "avg_qty": 48},
                "second_production": {"avg_time": "13:40", "avg_qty": 32},
                "risk_level": "HIGH",
                "why": ["최근 4주 중 3주에서 품절이 발생했습니다."],
            }
        }
    )


class DashboardProductionResponse(BaseModel):
    """Production widget payload."""

    store_id: str
    store_name: str
    items: list[ProductionCockpitItem]
    last_updated_at: str


class OrderDeadlineCard(BaseModel):
    """Order widget row with deadline state."""

    category: str
    deadline: str
    minutes_remaining: int
    severity: str
    missing_order_item_count: int
    recommended_option_label: str | None = None
    why: list[str] | None = None
    cta: DashboardAction | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "category": "도넛",
                "deadline": "15:00",
                "minutes_remaining": 18,
                "severity": "HIGH",
                "missing_order_item_count": 12,
                "recommended_option_label": "전전주 동요일",
                "why": ["현재까지 오늘 확정 주문이 없습니다."],
                "cta": {
                    "label": "주문 옵션 보기",
                    "action": "OPEN_ORDERS",
                    "route": "/orders",
                },
            }
        }
    )


class DashboardOrdersResponse(BaseModel):
    """Order status widget payload."""

    store_id: str
    store_name: str
    today_deadlines: list[OrderDeadlineCard]
    imminent_deadline_count: int
    last_updated_at: str


class MiniChartPoint(BaseModel):
    """Compact chart point for cockpit sparkline widgets."""

    label: str
    value: float


class DashboardSalesSummaryResponse(BaseModel):
    """Sales summary widget payload."""

    store_id: str
    store_name: str
    biz_date: str
    today_sales_amt: float
    vs_yesterday_pct: float | None
    vs_last_week_same_dow_pct: float | None
    top_category: str | None
    mini_chart_data: list[MiniChartPoint]
    why: list[str] | None = None
    last_updated_at: str


class DashboardAlertsResponse(BaseModel):
    """Recent dashboard alert feed."""

    store_id: str
    store_name: str
    alerts: list[AlertCard]
    last_updated_at: str
