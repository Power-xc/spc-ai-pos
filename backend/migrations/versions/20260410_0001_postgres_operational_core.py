"""Create initial PostgreSQL operational tables for dashboard/orders/alerts/chat.

Revision ID: 20260410_0001
Revises:
Create Date: 2026-04-10 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.config import get_settings

# revision identifiers, used by Alembic.
revision = "20260410_0001"
down_revision = None
branch_labels = None
depends_on = None

settings = get_settings()
schema = settings.database_schema

user_role_enum = sa.Enum(
    "store_owner",
    "area_manager",
    "hq_admin",
    "system",
    name="userrole",
    native_enum=False,
)
inventory_risk_enum = sa.Enum(
    "none",
    "low",
    "medium",
    "high",
    name="inventoryrisklevel",
    native_enum=False,
)
recommendation_source_enum = sa.Enum(
    "ai",
    "historical",
    "hq",
    "manual",
    name="recommendationsource",
    native_enum=False,
)
recommendation_status_enum = sa.Enum(
    "generated",
    "selected",
    "expired",
    "superseded",
    name="recommendationstatus",
    native_enum=False,
)
order_source_enum = sa.Enum(
    "ai",
    "chat",
    "hq",
    "manual",
    name="ordersource",
    native_enum=False,
)
order_status_enum = sa.Enum(
    "draft",
    "confirmed",
    "submitted",
    "cancelled",
    name="orderstatus",
    native_enum=False,
)
pricing_status_enum = sa.Enum(
    "pending",
    "confirmed",
    "unavailable",
    name="pricingstatus",
    native_enum=False,
)
alert_severity_enum = sa.Enum(
    "low",
    "medium",
    "high",
    "critical",
    name="alertseverity",
    native_enum=False,
)
alert_status_enum = sa.Enum(
    "open",
    "read",
    "acknowledged",
    "resolved",
    "dismissed",
    name="alertstatus",
    native_enum=False,
)
alert_source_enum = sa.Enum(
    "production",
    "orders",
    "sales",
    "chat",
    "system",
    name="alertsource",
    native_enum=False,
)
alert_event_type_enum = sa.Enum(
    "created",
    "delivered",
    "read",
    "acknowledged",
    "resolved",
    "dismissed",
    "reopened",
    name="alerteventtype",
    native_enum=False,
)
chat_session_status_enum = sa.Enum(
    "active",
    "closed",
    "archived",
    name="chatsessionstatus",
    native_enum=False,
)
chat_role_enum = sa.Enum(
    "system",
    "user",
    "assistant",
    "tool",
    name="chatrole",
    native_enum=False,
)


def upgrade() -> None:
    op.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

    op.create_table(
        "stores",
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("store_name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Seoul"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("store_id", name="pk_stores"),
        schema=schema,
    )
    op.create_index("ix_br_stores_store_name", "stores", ["store_name"], unique=False, schema=schema)

    op.create_table(
        "users",
        sa.Column("user_id", sa.String(length=50), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("role", user_role_enum, nullable=False, server_default="store_owner"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_users_store_id_stores"),
        sa.PrimaryKeyConstraint("user_id", name="pk_users"),
        schema=schema,
    )
    op.create_index("ix_br_users_store_id", "users", ["store_id"], unique=False, schema=schema)

    op.create_table(
        "products",
        sa.Column("product_id", sa.String(length=80), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("unit", sa.String(length=30), nullable=False, server_default="ea"),
        sa.Column("base_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("cost_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("product_id", name="pk_products"),
        schema=schema,
    )
    op.create_index("ix_br_products_name", "products", ["product_name"], unique=False, schema=schema)
    op.create_index("ix_br_products_category", "products", ["category"], unique=False, schema=schema)

    op.create_table(
        "inventory_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("product_id", sa.String(length=80), nullable=False),
        sa.Column("biz_date", sa.Date(), nullable=True),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("on_hand_qty", sa.Numeric(14, 3), nullable=False),
        sa.Column("sold_qty", sa.Numeric(14, 3), nullable=True),
        sa.Column("waste_qty", sa.Numeric(14, 3), nullable=True),
        sa.Column("base_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("cost_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("stockout_minutes", sa.Integer(), nullable=True),
        sa.Column("reorder_triggered", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("risk_level", inventory_risk_enum, nullable=False, server_default="none"),
        sa.Column("predicted_stock_1h", sa.Numeric(14, 3), nullable=True),
        sa.Column("depletion_eta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hourly_burn_rate", sa.Numeric(14, 3), nullable=True),
        sa.Column("stockout_probability", sa.Numeric(5, 2), nullable=True),
        sa.Column("recommended_production_qty", sa.Numeric(14, 3), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["product_id"], [f"{schema}.products.product_id"], name="fk_inventory_snapshots_product_id_products"),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_inventory_snapshots_store_id_stores"),
        sa.PrimaryKeyConstraint("id", name="pk_inventory_snapshots"),
        sa.UniqueConstraint("store_id", "product_id", "snapshot_at", name="uq_inventory_snapshot_store_product_ts"),
        schema=schema,
    )
    op.create_index("ix_br_inventory_store_snapshot_at", "inventory_snapshots", ["store_id", "snapshot_at"], unique=False, schema=schema)
    op.create_index("ix_br_inventory_store_biz_date", "inventory_snapshots", ["store_id", "biz_date"], unique=False, schema=schema)

    op.create_table(
        "order_recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommendation_batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("option_id", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("product_group", sa.String(length=100), nullable=True),
        sa.Column("reference_date", sa.Date(), nullable=True),
        sa.Column("deadline_time", sa.Time(), nullable=True),
        sa.Column("source", recommendation_source_enum, nullable=False, server_default="ai"),
        sa.Column("status", recommendation_status_enum, nullable=False, server_default="generated"),
        sa.Column("four_week_avg_qty", sa.Numeric(14, 2), nullable=True),
        sa.Column("total_qty", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("deviation_pct", sa.Numeric(7, 2), nullable=True),
        sa.Column("deviation_label", sa.String(length=255), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=50), nullable=True),
        sa.Column("snapshot_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_user_id"], [f"{schema}.users.user_id"], name="fk_order_recommendations_created_by_user_id_users"),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_order_recommendations_store_id_stores"),
        sa.PrimaryKeyConstraint("id", name="pk_order_recommendations"),
        sa.UniqueConstraint("recommendation_batch_id", "option_id", name="uq_order_recommendations_batch_option"),
        schema=schema,
    )
    op.create_index("ix_br_order_recommendations_batch_id", "order_recommendations", ["recommendation_batch_id"], unique=False, schema=schema)
    op.create_index("ix_br_order_recommendations_store_created_at", "order_recommendations", ["store_id", "created_at"], unique=False, schema=schema)

    op.create_table(
        "order_recommendation_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.String(length=80), nullable=True),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("ai_reason", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["product_id"], [f"{schema}.products.product_id"], name="fk_order_recommendation_items_product_id_products"),
        sa.ForeignKeyConstraint(["recommendation_id"], [f"{schema}.order_recommendations.id"], name="fk_order_recommendation_items_recommendation_id_order_recommendations"),
        sa.PrimaryKeyConstraint("id", name="pk_order_recommendation_items"),
        schema=schema,
    )
    op.create_index("ix_br_order_recommendation_items_rec_sort", "order_recommendation_items", ["recommendation_id", "sort_order"], unique=False, schema=schema)

    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_no", sa.String(length=120), nullable=True),
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source", order_source_enum, nullable=False, server_default="manual"),
        sa.Column("status", order_status_enum, nullable=False, server_default="confirmed"),
        sa.Column("pricing_status", pricing_status_enum, nullable=False, server_default="pending"),
        sa.Column("currency_code", sa.String(length=3), nullable=False, server_default="KRW"),
        sa.Column("total_qty", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("session_id", sa.String(length=255), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_user_id", sa.String(length=50), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], [f"{schema}.users.user_id"], name="fk_orders_confirmed_by_user_id_users"),
        sa.ForeignKeyConstraint(["recommendation_id"], [f"{schema}.order_recommendations.id"], name="fk_orders_recommendation_id_order_recommendations"),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_orders_store_id_stores"),
        sa.PrimaryKeyConstraint("id", name="pk_orders"),
        sa.UniqueConstraint("order_no", name="uq_orders_order_no"),
        schema=schema,
    )
    op.create_index("ix_br_orders_store_confirmed_at", "orders", ["store_id", "confirmed_at"], unique=False, schema=schema)
    op.create_index("ix_br_orders_store_status", "orders", ["store_id", "status"], unique=False, schema=schema)

    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.String(length=80), nullable=True),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("pricing_status", pricing_status_enum, nullable=False, server_default="pending"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["order_id"], [f"{schema}.orders.id"], name="fk_order_items_order_id_orders"),
        sa.ForeignKeyConstraint(["product_id"], [f"{schema}.products.product_id"], name="fk_order_items_product_id_products"),
        sa.PrimaryKeyConstraint("id", name="pk_order_items"),
        schema=schema,
    )
    op.create_index("ix_br_order_items_order_sort", "order_items", ["order_id", "sort_order"], unique=False, schema=schema)

    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("alert_type", sa.String(length=100), nullable=False),
        sa.Column("severity", alert_severity_enum, nullable=False),
        sa.Column("status", alert_status_enum, nullable=False, server_default="open"),
        sa.Column("source", alert_source_enum, nullable=False),
        sa.Column("source_agent", sa.String(length=100), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("is_unread", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("related_entity_type", sa.String(length=100), nullable=True),
        sa.Column("related_entity_id", sa.String(length=120), nullable=True),
        sa.Column("cta_label", sa.String(length=100), nullable=True),
        sa.Column("cta_action", sa.String(length=100), nullable=True),
        sa.Column("cta_route", sa.String(length=255), nullable=True),
        sa.Column("sse_event_type", sa.String(length=100), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_alerts_store_id_stores"),
        sa.PrimaryKeyConstraint("id", name="pk_alerts"),
        schema=schema,
    )
    op.create_index("ix_br_alerts_store_status_occurred_at", "alerts", ["store_id", "status", "occurred_at"], unique=False, schema=schema)
    op.create_index("ix_br_alerts_store_unread", "alerts", ["store_id", "is_unread"], unique=False, schema=schema)

    op.create_table(
        "alert_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=False),
        sa.Column("event_type", alert_event_type_enum, nullable=False),
        sa.Column("actor_user_id", sa.String(length=50), nullable=True),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("emitted_to_sse", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], [f"{schema}.users.user_id"], name="fk_alert_events_actor_user_id_users"),
        sa.ForeignKeyConstraint(["alert_id"], [f"{schema}.alerts.id"], name="fk_alert_events_alert_id_alerts"),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_alert_events_store_id_stores"),
        sa.PrimaryKeyConstraint("id", name="pk_alert_events"),
        schema=schema,
    )
    op.create_index("ix_br_alert_events_alert_id_event_at", "alert_events", ["alert_id", "event_at"], unique=False, schema=schema)
    op.create_index("ix_br_alert_events_store_id_event_at", "alert_events", ["store_id", "event_at"], unique=False, schema=schema)

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        sa.Column("store_id", sa.String(length=50), nullable=True),
        sa.Column("user_id", sa.String(length=50), nullable=True),
        sa.Column("status", chat_session_status_enum, nullable=False, server_default="active"),
        sa.Column("route_path", sa.String(length=255), nullable=True),
        sa.Column("page_key", sa.String(length=100), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [f"{schema}.stores.store_id"], name="fk_chat_sessions_store_id_stores"),
        sa.ForeignKeyConstraint(["user_id"], [f"{schema}.users.user_id"], name="fk_chat_sessions_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_chat_sessions"),
        sa.UniqueConstraint("session_id", name="uq_chat_sessions_session_id"),
        schema=schema,
    )
    op.create_index("ix_br_chat_sessions_store_last_message_at", "chat_sessions", ["store_id", "last_message_at"], unique=False, schema=schema)
    op.create_index("ix_br_chat_sessions_session_id", "chat_sessions", ["session_id"], unique=False, schema=schema)

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chat_session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=50), nullable=True),
        sa.Column("role", chat_role_enum, nullable=False),
        sa.Column("message_order", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("response_type", sa.String(length=100), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("actions_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["chat_session_id"], [f"{schema}.chat_sessions.id"], name="fk_chat_messages_chat_session_id_chat_sessions"),
        sa.ForeignKeyConstraint(["user_id"], [f"{schema}.users.user_id"], name="fk_chat_messages_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_chat_messages"),
        sa.UniqueConstraint("chat_session_id", "message_order", name="uq_chat_messages_session_order"),
        schema=schema,
    )
    op.create_index("ix_br_chat_messages_session_created_at", "chat_messages", ["chat_session_id", "created_at"], unique=False, schema=schema)


def downgrade() -> None:
    op.drop_index("ix_br_chat_messages_session_created_at", table_name="chat_messages", schema=schema)
    op.drop_table("chat_messages", schema=schema)

    op.drop_index("ix_br_chat_sessions_session_id", table_name="chat_sessions", schema=schema)
    op.drop_index("ix_br_chat_sessions_store_last_message_at", table_name="chat_sessions", schema=schema)
    op.drop_table("chat_sessions", schema=schema)

    op.drop_index("ix_br_alert_events_store_id_event_at", table_name="alert_events", schema=schema)
    op.drop_index("ix_br_alert_events_alert_id_event_at", table_name="alert_events", schema=schema)
    op.drop_table("alert_events", schema=schema)

    op.drop_index("ix_br_alerts_store_unread", table_name="alerts", schema=schema)
    op.drop_index("ix_br_alerts_store_status_occurred_at", table_name="alerts", schema=schema)
    op.drop_table("alerts", schema=schema)

    op.drop_index("ix_br_order_items_order_sort", table_name="order_items", schema=schema)
    op.drop_table("order_items", schema=schema)

    op.drop_index("ix_br_orders_store_status", table_name="orders", schema=schema)
    op.drop_index("ix_br_orders_store_confirmed_at", table_name="orders", schema=schema)
    op.drop_table("orders", schema=schema)

    op.drop_index("ix_br_order_recommendation_items_rec_sort", table_name="order_recommendation_items", schema=schema)
    op.drop_table("order_recommendation_items", schema=schema)

    op.drop_index("ix_br_order_recommendations_store_created_at", table_name="order_recommendations", schema=schema)
    op.drop_index("ix_br_order_recommendations_batch_id", table_name="order_recommendations", schema=schema)
    op.drop_table("order_recommendations", schema=schema)

    op.drop_index("ix_br_inventory_store_biz_date", table_name="inventory_snapshots", schema=schema)
    op.drop_index("ix_br_inventory_store_snapshot_at", table_name="inventory_snapshots", schema=schema)
    op.drop_table("inventory_snapshots", schema=schema)

    op.drop_index("ix_br_products_category", table_name="products", schema=schema)
    op.drop_index("ix_br_products_name", table_name="products", schema=schema)
    op.drop_table("products", schema=schema)

    op.drop_index("ix_br_users_store_id", table_name="users", schema=schema)
    op.drop_table("users", schema=schema)

    op.drop_index("ix_br_stores_store_name", table_name="stores", schema=schema)
    op.drop_table("stores", schema=schema)
