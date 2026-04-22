"""SQLAlchemy models - aligned with DDL 0001_init_core_postgres.sql."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import (
    AlertEventType,
    AlertSeverity,
    AlertSource,
    AlertStatus,
    ChatRole,
    InventoryRiskLevel,
    OrderSource,
    OrderStatus,
    PricingStatus,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDMixin,
)


class Store(UUIDMixin, TimestampMixin):
    """매장 정보 - stores table."""

    __tablename__ = "stores"

    store_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    store_name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(
        String(64), default="Asia/Seoul", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    app_users: Mapped[list["AppUser"]] = relationship(
        "AppUser", back_populates="store", lazy="dynamic"
    )
    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="store", lazy="dynamic"
    )
    orders: Mapped[list["Order"]] = relationship(
        "Order", back_populates="store", lazy="dynamic"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert", back_populates="store", lazy="dynamic"
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        "ChatSession", back_populates="store", lazy="dynamic"
    )


class AppUser(UUIDMixin, TimestampMixin):
    """사용자 정보 - app_users table (users vs PostgreSQL reserved)."""

    __tablename__ = "app_users"

    user_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=True
    )
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(
        String(50), default="store_owner", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="app_users")
    chat_messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="user", lazy="dynamic"
    )


class Product(UUIDMixin, TimestampMixin):
    """상품 정보 - products table."""

    __tablename__ = "products"

    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=True
    )
    product_code: Mapped[str] = mapped_column(String(100), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(30), default="ea", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="products")
    order_items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="product", lazy="dynamic"
    )
    inventory_snapshots: Mapped[list["InventorySnapshot"]] = relationship(
        "InventorySnapshot", back_populates="product", lazy="dynamic"
    )
    order_recommendation_items: Mapped[list["OrderRecommendationItem"]] = relationship(
        "OrderRecommendationItem", back_populates="product", lazy="dynamic"
    )


class InventorySnapshot(UUIDMixin):
    """재고 스냅샷 - inventory_snapshots table."""

    __tablename__ = "inventory_snapshots"

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    current_stock: Mapped[float] = mapped_column(
        Numeric(14, 3), default=0, nullable=False
    )
    predicted_stock_1h: Mapped[float | None] = mapped_column(
        Numeric(14, 3), nullable=True
    )
    depletion_eta: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    hourly_burn_rate: Mapped[float | None] = mapped_column(
        Numeric(14, 3), nullable=True
    )
    stockout_probability: Mapped[float | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    recommended_production_qty: Mapped[float | None] = mapped_column(
        Numeric(14, 3), nullable=True
    )
    risk_level: Mapped[str] = mapped_column(
        Enum(InventoryRiskLevel, native_enum=False),
        default=InventoryRiskLevel.NONE,
        nullable=False,
    )
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    product: Mapped["Product"] = relationship(
        "Product", back_populates="inventory_snapshots"
    )


class OrderRecommendation(UUIDMixin, TimestampMixin):
    """주문 추천 - order_recommendations table."""

    __tablename__ = "order_recommendations"

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id"),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(
        Enum(OrderSource, native_enum=False),
        default=OrderSource.AI,
        nullable=False,
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    option_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    option_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deviation_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="generated", nullable=False)
    recommended_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    raw_response: Mapped[dict[str, Any]] = mapped_column(
        JSON, default={}, nullable=False
    )
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=True
    )

    # Relationships
    items: Mapped[list["OrderRecommendationItem"]] = relationship(
        "OrderRecommendationItem",
        back_populates="recommendation",
        lazy="dynamic",
    )


class OrderRecommendationItem(UUIDMixin):
    """주문 추천 품목 - order_recommendation_items table."""

    __tablename__ = "order_recommendation_items"

    recommendation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_recommendations.id"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    recommendation: Mapped["OrderRecommendation"] = relationship(
        "OrderRecommendation", back_populates="items"
    )
    product: Mapped["Product"] = relationship(
        "Product", back_populates="order_recommendation_items"
    )


class Order(UUIDMixin, TimestampMixin):
    """주문 (확정) - orders table."""

    __tablename__ = "orders"

    order_no: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id"),
        nullable=False,
    )
    recommendation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_recommendations.id"), nullable=True
    )
    source: Mapped[str] = mapped_column(
        Enum(OrderSource, native_enum=False),
        default=OrderSource.MANUAL,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum(OrderStatus, native_enum=False),
        default=OrderStatus.DRAFT,
        nullable=False,
    )
    pricing_status: Mapped[str] = mapped_column(
        Enum(PricingStatus, native_enum=False),
        default=PricingStatus.PENDING,
        nullable=False,
    )
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency_code: Mapped[str] = mapped_column(
        String(3), default="KRW", nullable=False
    )
    total_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=True
    )
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=True
    )
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="order", lazy="dynamic"
    )


class OrderItem(UUIDMixin, TimestampMixin):
    """주문 품목 - order_items table."""

    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    pricing_status: Mapped[str] = mapped_column(
        Enum(PricingStatus, native_enum=False),
        default=PricingStatus.PENDING,
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="order_items")


class Alert(UUIDMixin, TimestampMixin):
    """알림 (현재 상태) - alerts table."""

    __tablename__ = "alerts"

    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id"),
        nullable=False,
    )
    severity: Mapped[str] = mapped_column(
        Enum(AlertSeverity, native_enum=False), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum(AlertStatus, native_enum=False),
        default=AlertStatus.OPEN,
        nullable=False,
    )
    source: Mapped[str] = mapped_column(
        Enum(AlertSource, native_enum=False), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    unread: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_route: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="alerts")
    events: Mapped[list["AlertEvent"]] = relationship(
        "AlertEvent", back_populates="alert", lazy="dynamic"
    )


class AlertEvent(UUIDMixin):
    """알림 이벤트 로그 - alert_events table."""

    __tablename__ = "alert_events"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("alerts.id"),
        nullable=False,
        index=True,
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(
        Enum(AlertEventType, native_enum=False), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=True
    )
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    alert: Mapped["Alert"] = relationship("Alert", back_populates="events")


class ChatSession(UUIDMixin, TimestampMixin):
    """채팅 세션 - chat_sessions table."""

    __tablename__ = "chat_sessions"

    session_key: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=True
    )
    route_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="chat_sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", lazy="dynamic"
    )


class ChatMessage(UUIDMixin):
    """채팅 메시지 - chat_messages table."""

    __tablename__ = "chat_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        Enum(ChatRole, native_enum=False), nullable=False
    )
    message_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    message_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_cards: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=[], nullable=False
    )
    tools_used: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=[], nullable=False
    )
    path: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=[], nullable=False)
    raw_response: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default={}, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
    user: Mapped["AppUser"] = relationship("AppUser", back_populates="chat_messages")