"""Shared schemas used across POS APIs, proactive flows, and chat."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class StoreContext(BaseModel):
    """Authenticated user context passed to every API."""

    store_id: str
    user_id: str
    role: str
    current_time: datetime


class ModalType(str, Enum):
    PRODUCTION_ALERT = "production_alert"
    ORDER_DEADLINE = "order_deadline"
    ANOMALY_SALES = "anomaly_sales"
    STOCKOUT_RISK = "stockout_risk"
    ORDER_ANOMALY = "order_anomaly"


class ModalAction(BaseModel):
    label: str
    action_type: str
    api_endpoint: str
    params: dict = Field(default_factory=dict)


class Modal(BaseModel):
    """Point-of-sale modal pushed by the proactive monitor."""

    modal_id: str
    modal_type: ModalType
    severity: str
    title: str
    body: str
    data: dict
    actions: list[ModalAction]
    created_at: datetime
    expires_at: datetime
    net_profit_impact: float | None = None


class ModalResponseRequest(BaseModel):
    action_type: str
    params: dict = Field(default_factory=dict)


class Complexity(str, Enum):
    SIMPLE = "simple"
    COMPLEX = "complex"
    REJECT = "reject"


class ClassifierResult(BaseModel):
    complexity: Complexity
    tool_name: str | None = None
    tool_params: dict | None = None
    reasoning: str


class ActionCard(BaseModel):
    card_type: str
    title: str
    body: str
    actions: list[ModalAction] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str
    action_cards: list[ActionCard] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    path: str
    latency_ms: int
    token_usage: int


class NetProfitBar(BaseModel):
    """Always-visible profit delta for any recommended action."""

    action_description: str
    revenue_impact: int
    cost_impact: int
    net_profit_delta: int
    confidence: str


class ProductionRegisterRequest(BaseModel):
    product_id: str
    quantity: int


class OrderDraftItem(BaseModel):
    product_id: str
    quantity: int


class OrderDraftRequest(BaseModel):
    items: list[OrderDraftItem]


class OrderConfirmRequest(BaseModel):
    items: list[OrderDraftItem]


class APIEnvelope(BaseModel):
    """Consistent wrapper for frontend-agnostic POS responses."""

    success: bool = True
    data: dict | list | None = None
    error: str | None = None
