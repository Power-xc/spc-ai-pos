"""Production-related request and response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ProductionBatchPattern(BaseModel):
    """Average time and quantity for a historical production batch."""

    avg_time: str
    avg_qty: int

    model_config = ConfigDict(
        json_schema_extra={"example": {"avg_time": "09:15", "avg_qty": 48}}
    )


class ProductionPattern(BaseModel):
    """Four-week production or stockout pattern summary."""

    dow: int
    avg_sold_qty: float
    avg_stockout_minutes: float
    stockout_frequency: float
    avg_on_hand_eod: float

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "dow": 5,
                "avg_sold_qty": 52.3,
                "avg_stockout_minutes": 38.5,
                "stockout_frequency": 0.75,
                "avg_on_hand_eod": 5.2,
            }
        }
    )


class StockoutRiskItem(BaseModel):
    """Detailed stockout-risk analysis for a product."""

    product_id: str
    product_name: str
    category: str
    current_date_on_hand: float | None
    current_stock: int | None = None
    predicted_sold_qty: float
    predicted_stock_1h: int | None = None
    depletion_eta: str | None = None
    hourly_burn_rate: float | None = None
    stockout_probability: float
    avg_stockout_minutes_4w: float
    recommended_production_qty: int
    chance_loss_if_no_action: float
    first_production: ProductionBatchPattern | None = None
    second_production: ProductionBatchPattern | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "category": "도넛",
                "current_date_on_hand": 8,
                "current_stock": 8,
                "predicted_sold_qty": 52,
                "predicted_stock_1h": 0,
                "depletion_eta": "2026-04-03T14:30:00+09:00",
                "hourly_burn_rate": 8.0,
                "stockout_probability": 75.0,
                "avg_stockout_minutes_4w": 38.0,
                "recommended_production_qty": 24,
                "chance_loss_if_no_action": 18500,
                "first_production": {"avg_time": "09:15", "avg_qty": 48},
                "second_production": {"avg_time": "13:40", "avg_qty": 32},
            }
        }
    )


class ProductionAlert(BaseModel):
    """Alert card returned by the production agent."""

    id: str
    severity: str
    product_id: str
    product_name: str
    message: str
    detail: StockoutRiskItem
    cta_label: str
    cta_action: str
    created_at: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "prod-alert-001",
                "severity": "HIGH",
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "message": "오늘 글레이즈드 도넛 재고 부족이 예상됩니다.",
                "detail": {
                    "product_id": "P001",
                    "product_name": "글레이즈드 도넛",
                    "category": "도넛",
                    "current_date_on_hand": 8,
                    "predicted_sold_qty": 52,
                    "stockout_probability": 75.0,
                    "avg_stockout_minutes_4w": 38.0,
                    "recommended_production_qty": 24,
                    "chance_loss_if_no_action": 18500,
                },
                "cta_label": "생산 등록하기",
                "cta_action": "PRODUCTION_REGISTER",
                "created_at": "2026-04-03T09:00:00Z",
            }
        }
    )


class ProductionRegisterRequest(BaseModel):
    """Request payload for registering production."""

    store_id: str
    product_id: str
    quantity: int
    alert_id: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "product_id": "P001",
                "quantity": 24,
                "alert_id": "prod-alert-001",
            }
        }
    )


class ChanceLossFeedback(BaseModel):
    """Feedback payload after a production action."""

    type: str
    message: str
    impact_pct: float
    estimated_amount: float

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "POSITIVE",
                "message": "찬스 로스를 10.5% 감소시켰습니다.",
                "impact_pct": 10.5,
                "estimated_amount": 45000,
            }
        }
    )


class ProductionRegisterResponse(BaseModel):
    """Response after production registration."""

    production_id: str
    registered_at: str
    feedback: ChanceLossFeedback

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "production_id": "prod-001",
                "registered_at": "2026-04-03T09:05:00Z",
                "feedback": {
                    "type": "POSITIVE",
                    "message": "찬스 로스를 10.5% 감소시켰습니다.",
                    "impact_pct": 10.5,
                    "estimated_amount": 45000,
                },
            }
        }
    )


class BatchRegisterItem(BaseModel):
    """Single item in a batch production registration."""

    product_id: str
    product_name: str = ""
    quantity: int
    source: str = "manual"


class BatchRegisterRequest(BaseModel):
    """Batch production registration request."""

    store_id: str
    items: list[BatchRegisterItem]


class BatchRegisterResultItem(BaseModel):
    """Result of a single item in batch register."""

    product_id: str
    product_name: str
    quantity: int
    success: bool
    production_id: str | None


class BatchRegisterResponse(BaseModel):
    """Response for batch production registration."""

    registered_count: int
    failed_count: int
    results: list[BatchRegisterResultItem]


class RegisterableProductItem(BaseModel):
    """A product available for production registration."""

    product_id: str
    product_name: str
    category: str = ""
    current_stock: int
    predicted_stock_1h: int | None = None
    risk_level: str = "LOW"
    is_urgent: bool = False
    is_supplement: bool = False
    recommended_production_qty: int = 0
    daily_recommended_qty: int = 0
    last_1h_sales_rate: float | None = None
    unit_price: float | None = None


class RegisterableProductSummary(BaseModel):
    """Summary counts for registerable products."""

    total_count: int
    urgent_count: int
    supplement_count: int
    normal_count: int


class RegisterableProductsResponse(BaseModel):
    """Response for the registerable products list."""

    items: list[RegisterableProductItem]
    summary: RegisterableProductSummary


class InventorySnapshotItem(BaseModel):
    """A product in the inventory snapshot — estimated stock at a given time."""

    product_id: str
    product_name: str
    category: str = ""
    current_stock: int
    predicted_stock_1h: int | None = None
    risk_level: str = "LOW"
    is_urgent: bool = False
    is_supplement: bool = False
    recommended_production_qty: int = 0
    daily_recommended_qty: int = 0
    last_1h_sales_rate: float | None = None
    unit_price: float | None = None
    stock_basis: str = "시간대 판매 패턴 기반 추정"
    is_estimated: bool = True


class InventorySnapshotSummary(BaseModel):
    """Summary counts for inventory snapshot."""

    total_count: int
    urgent_count: int
    supplement_count: int
    normal_count: int


class InventorySnapshotResponse(BaseModel):
    """Response for the inventory snapshot endpoint."""

    as_of: str
    is_estimated: bool
    basis: str = "시간대 판매 패턴 기반 추정"
    summary: InventorySnapshotSummary
    items: list[InventorySnapshotItem]
