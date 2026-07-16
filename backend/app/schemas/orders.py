"""Order-related request and response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class OrderItem(BaseModel):
    """Single item in an order option or confirmed order."""

    product_id: str
    product_name: str
    quantity: int
    base_price: float

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "quantity": 24,
                "base_price": 1800,
            }
        }
    )


class OrderOption(BaseModel):
    """Reference order option built from historical data."""

    option_id: str
    label: str
    reference_date: str
    expected_reference_date: str | None = None
    actual_reference_date: str | None = None
    reference_label: str | None = None
    reference_reason: str | None = None
    is_exact_same_weekday: bool | None = None
    fallback: bool | None = None
    total_qty: int
    total_amount: float
    deviation_from_avg_pct: float
    deviation_label: str
    items: list[OrderItem]
    flags: list[str]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "option_id": "last_week",
                "label": "전주 동요일",
                "reference_date": "2026-03-27",
                "expected_reference_date": "2026-03-27",
                "actual_reference_date": "2026-03-27",
                "reference_label": "전주 동요일",
                "reference_reason": "전주 동요일 데이터 사용",
                "is_exact_same_weekday": True,
                "fallback": False,
                "total_qty": 120,
                "total_amount": 216000,
                "deviation_from_avg_pct": 10.0,
                "deviation_label": "평균 대비 10% 많음",
                "items": [],
                "flags": ["CAMPAIGN_PERIOD"],
            }
        }
    )


class OrderOptionsResponse(BaseModel):
    """Full order-options response for the ordering screen."""

    store_id: str
    product_group: str | None
    category: str | None
    deadline: str | None
    options: list[OrderOption]
    four_week_avg_qty: float
    explanation: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "product_group": None,
                "category": "도넛",
                "deadline": "15:00",
                "options": [],
                "four_week_avg_qty": 109.5,
                "explanation": "전주 주문은 캠페인 영향으로 평균보다 높았습니다.",
            }
        }
    )


class OrderConfirmItem(BaseModel):
    """Minimal confirm-order contract already used by the frontend."""

    product_id: str
    quantity: int

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "811047",
                "quantity": 24,
            }
        }
    )


class OrderConfirmRequest(BaseModel):
    """Request payload for confirming an order option."""

    store_id: str | None = None
    option_id: str | None = None
    draft_order_id: str | None = None
    items: list[OrderConfirmItem]
    confirmed_by: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "STORE001",
                "option_id": "last_week",
                "items": [],
                "confirmed_by": "store_owner",
            }
        }
    )


class OrderConfirmResponse(BaseModel):
    """Response returned after confirming an order."""

    order_id: str
    confirmed_at: str
    status: str = "confirmed"
    total_qty: int
    total_amount: float | None = None
    message: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "order_id": "order-001",
                "confirmed_at": "2026-04-03T14:55:00Z",
                "total_qty": 118,
                "total_amount": 215400,
                "message": "주문이 확정되었습니다.",
            }
        }
    )


class DraftOrderRequest(BaseModel):
    """Create a draft order from a selected option."""

    store_id: str
    option_id: str
    items: list[OrderItem]
    category: str | None = None


class DraftOrderResponse(BaseModel):
    """Draft order payload returned after selecting or editing an option."""

    draft_order_id: str
    status: str
    store_id: str
    option_id: str
    items: list[OrderItem]
    total_qty: int
    total_amount: float
    message: str


class OrderRiskItem(BaseModel):
    """Per-item risk check after editing draft quantities."""

    product_id: str
    product_name: str
    quantity: int
    expected_qty: float
    risk_type: str
    message: str


class OrderRiskResponse(BaseModel):
    """Risk summary returned when a draft order is edited."""

    draft_order_id: str
    overall_risk: str
    summary: str
    items: list[OrderRiskItem]


class DraftRiskRequest(BaseModel):
    """Updated item list for recalculating a draft order."""

    items: list[OrderItem]
