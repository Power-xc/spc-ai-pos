"""Initial PostgreSQL ledger tables for dashboard, alerts, orders, and chat.

Revision ID: 20260410_0001
Revises:
Create Date: 2026-04-10 00:00:00
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260410_0001"
down_revision = None
branch_labels = None
depends_on = None


def _schema() -> str | None:
    return os.getenv("DATABASE_SCHEMA", "dunkin_mart") or None


def _fk(table: str, column: str, schema: str | None) -> str:
    return f"{schema}.{table}.{column}" if schema else f"{table}.{column}"


def upgrade() -> None:
    schema = _schema()

    if schema:
        op.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

    op.create_table(
        "stores",
        sa.Column("store_id", sa.String(length=32), primary_key=True, nullable=False),
        sa.Column("store_name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default=sa.text("'Asia/Seoul'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=schema,
    )
    op.create_index("ix_stores_is_active_store_name", "stores", ["is_active", "store_name"], schema=schema)

    op.create_table(
        "users",
        sa.Column("user_id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column(
            "role",
            sa.Enum("store_owner", "area_manager", "hq_admin", "system", name="userrole", native_enum=False),
            nullable=False,
            server_default=sa.text("'store_owner'"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_users_store_role", "users", ["store_id", "role"], schema=schema)
    op.create_index("ix_users_is_active", "users", ["is_active"], schema=schema)

    op.create_table(
        "products",
        sa.Column("product_id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=True),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("unit", sa.String(length=30), nullable=False, server_default=sa.text("'ea'")),
        sa.Column("base_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("cost_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_products_store_category", "products", ["store_id", "category"], schema=schema)
    op.create_index("ix_products_is_active", "products", ["is_active"], schema=schema)

    op.create_table(
        "inventory_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("biz_date", sa.Date(), nullable=True),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.Column("current_stock", sa.Numeric(14, 3), nullable=False),
        sa.Column("predicted_stock_1h", sa.Numeric(14, 3), nullable=True),
        sa.Column("depletion_eta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hourly_burn_rate", sa.Numeric(14, 3), nullable=True),
        sa.Column("stockout_probability", sa.Numeric(5, 2), nullable=True),
        sa.Column("recommended_production_qty", sa.Numeric(14, 3), nullable=True),
        sa.Column(
            "risk_level",
            sa.Enum("none", "low", "medium", "high", name="inventoryrisklevel", native_enum=False),
            nullable=False,
            server_default=sa.text("'none'"),
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["product_id"], [_fk("products", "product_id", schema)]),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_inventory_snapshots_store_snapshot_at", "inventory_snapshots", ["store_id", "snapshot_at"], schema=schema)
    op.create_index(
        "ix_inventory_snapshots_store_product_snapshot_at",
        "inventory_snapshots",
        ["store_id", "product_id", "snapshot_at"],
        schema=schema,
    )
    op.create_index("ix_inventory_snapshots_biz_date", "inventory_snapshots", ["biz_date"], schema=schema)

    op.create_table(
        "order_recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column("client_option_id", sa.String(length=100), nullable=True),
        sa.Column("option_label", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column(
            "source",
            sa.Enum("ai", "manual", "reference_history", "chat", name="ordersource", native_enum=False),
            nullable=False,
            server_default=sa.text("'ai'"),
        ),
        sa.Column(
            "status",
            sa.Enum("generated", "viewed", "confirmed", "expired", name="recommendationstatus", native_enum=False),
            nullable=False,
            server_default=sa.text("'generated'"),
        ),
        sa.Column("reference_date", sa.Date(), nullable=True),
        sa.Column("reason_summary", sa.Text(), nullable=True),
        sa.Column("four_week_avg_qty", sa.Numeric(14, 2), nullable=True),
        sa.Column("recommended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], [_fk("users", "user_id", schema)]),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_order_recommendations_store_recommended_at", "order_recommendations", ["store_id", "recommended_at"], schema=schema)
    op.create_index("ix_order_recommendations_store_status", "order_recommendations", ["store_id", "status"], schema=schema)

    op.create_table(
        "order_recommendation_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("ai_reason", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["product_id"], [_fk("products", "product_id", schema)]),
        sa.ForeignKeyConstraint(["recommendation_id"], [_fk("order_recommendations", "id", schema)]),
        schema=schema,
    )
    op.create_index("ix_order_recommendation_items_recommendation_id", "order_recommendation_items", ["recommendation_id"], schema=schema)
    op.create_index("ix_order_recommendation_items_product_id", "order_recommendation_items", ["product_id"], schema=schema)

    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("order_no", sa.String(length=100), nullable=True, unique=True),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("client_draft_id", sa.String(length=100), nullable=True),
        sa.Column("client_option_id", sa.String(length=100), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column(
            "source",
            sa.Enum("ai", "manual", "reference_history", "chat", name="ordersource", native_enum=False),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column(
            "status",
            sa.Enum("draft", "confirmed", "submitted", "cancelled", name="orderstatus", native_enum=False),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column(
            "pricing_status",
            sa.Enum("pending", "confirmed", "unknown", name="pricingstatus", native_enum=False),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("currency_code", sa.String(length=3), nullable=False, server_default=sa.text("'KRW'")),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("total_quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("confirmed_by", sa.String(length=64), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["confirmed_by"], [_fk("users", "user_id", schema)]),
        sa.ForeignKeyConstraint(["created_by"], [_fk("users", "user_id", schema)]),
        sa.ForeignKeyConstraint(["recommendation_id"], [_fk("order_recommendations", "id", schema)]),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_orders_store_status_created_at", "orders", ["store_id", "status", "created_at"], schema=schema)
    op.create_index("ix_orders_recommendation_id", "orders", ["recommendation_id"], schema=schema)
    op.create_index("ix_orders_confirmed_at", "orders", ["confirmed_at"], schema=schema)

    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommendation_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "pricing_status",
            sa.Enum("pending", "confirmed", "unknown", name="pricingstatus", native_enum=False),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["order_id"], [_fk("orders", "id", schema)]),
        sa.ForeignKeyConstraint(["product_id"], [_fk("products", "product_id", schema)]),
        sa.ForeignKeyConstraint(["recommendation_item_id"], [_fk("order_recommendation_items", "id", schema)]),
        schema=schema,
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"], schema=schema)
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"], schema=schema)

    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("low", "medium", "high", "critical", name="alertseverity", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("open", "read", "acknowledged", "resolved", "dismissed", name="alertstatus", native_enum=False),
            nullable=False,
            server_default=sa.text("'open'"),
        ),
        sa.Column(
            "source",
            sa.Enum(
                "inventory_agent",
                "order_agent",
                "sales_agent",
                "chat_agent",
                "system",
                "manual",
                name="alertsource",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("source_agent", sa.String(length=100), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("related_entity_type", sa.String(length=100), nullable=True),
        sa.Column("related_entity_id", sa.String(length=100), nullable=True),
        sa.Column("cta_action", sa.String(length=100), nullable=True),
        sa.Column("cta_label", sa.String(length=100), nullable=True),
        sa.Column("cta_route", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_alerts_store_status_occurred_at", "alerts", ["store_id", "status", "occurred_at"], schema=schema)
    op.create_index("ix_alerts_store_severity", "alerts", ["store_id", "severity"], schema=schema)
    op.create_index("ix_alerts_related_entity", "alerts", ["related_entity_type", "related_entity_id"], schema=schema)

    op.create_table(
        "alert_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column("actor_user_id", sa.String(length=64), nullable=True),
        sa.Column(
            "event_type",
            sa.Enum("created", "delivered", "read", "acknowledged", "resolved", "dismissed", "reopened", name="alerteventtype", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "from_status",
            sa.Enum("open", "read", "acknowledged", "resolved", "dismissed", name="alertstatus", native_enum=False),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            sa.Enum("open", "read", "acknowledged", "resolved", "dismissed", name="alertstatus", native_enum=False),
            nullable=True,
        ),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], [_fk("users", "user_id", schema)]),
        sa.ForeignKeyConstraint(["alert_id"], [_fk("alerts", "id", schema)]),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_alert_events_alert_id_event_at", "alert_events", ["alert_id", "event_at"], schema=schema)
    op.create_index("ix_alert_events_store_id_event_at", "alert_events", ["store_id", "event_at"], schema=schema)

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=False, unique=True),
        sa.Column("store_id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("route_path", sa.String(length=255), nullable=True),
        sa.Column("page_key", sa.String(length=100), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("context_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["store_id"], [_fk("stores", "store_id", schema)]),
        sa.ForeignKeyConstraint(["user_id"], [_fk("users", "user_id", schema)]),
        schema=schema,
    )
    op.create_index("ix_chat_sessions_store_last_message_at", "chat_sessions", ["store_id", "last_message_at"], schema=schema)
    op.create_index("ix_chat_sessions_user_last_message_at", "chat_sessions", ["user_id", "last_message_at"], schema=schema)

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("chat_session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column(
            "role",
            sa.Enum("system", "user", "assistant", "tool", name="chatrole", native_enum=False),
            nullable=False,
        ),
        sa.Column("message_order", sa.Integer(), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("content_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("message_type", sa.String(length=100), nullable=True),
        sa.Column("tool_name", sa.String(length=100), nullable=True),
        sa.Column("tool_call_id", sa.String(length=100), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("request_context", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("raw_model_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("token_usage", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["chat_session_id"], [_fk("chat_sessions", "id", schema)]),
        sa.ForeignKeyConstraint(["user_id"], [_fk("users", "user_id", schema)]),
        sa.UniqueConstraint("chat_session_id", "message_order", name="uq_chat_messages_chat_session_order"),
        schema=schema,
    )
    op.create_index("ix_chat_messages_chat_session_id", "chat_messages", ["chat_session_id"], schema=schema)
    op.create_index("ix_chat_messages_role_created_at", "chat_messages", ["role", "created_at"], schema=schema)


def downgrade() -> None:
    schema = _schema()

    op.drop_index("ix_chat_messages_role_created_at", table_name="chat_messages", schema=schema)
    op.drop_index("ix_chat_messages_chat_session_id", table_name="chat_messages", schema=schema)
    op.drop_table("chat_messages", schema=schema)

    op.drop_index("ix_chat_sessions_user_last_message_at", table_name="chat_sessions", schema=schema)
    op.drop_index("ix_chat_sessions_store_last_message_at", table_name="chat_sessions", schema=schema)
    op.drop_table("chat_sessions", schema=schema)

    op.drop_index("ix_alert_events_store_id_event_at", table_name="alert_events", schema=schema)
    op.drop_index("ix_alert_events_alert_id_event_at", table_name="alert_events", schema=schema)
    op.drop_table("alert_events", schema=schema)

    op.drop_index("ix_alerts_related_entity", table_name="alerts", schema=schema)
    op.drop_index("ix_alerts_store_severity", table_name="alerts", schema=schema)
    op.drop_index("ix_alerts_store_status_occurred_at", table_name="alerts", schema=schema)
    op.drop_table("alerts", schema=schema)

    op.drop_index("ix_order_items_product_id", table_name="order_items", schema=schema)
    op.drop_index("ix_order_items_order_id", table_name="order_items", schema=schema)
    op.drop_table("order_items", schema=schema)

    op.drop_index("ix_orders_confirmed_at", table_name="orders", schema=schema)
    op.drop_index("ix_orders_recommendation_id", table_name="orders", schema=schema)
    op.drop_index("ix_orders_store_status_created_at", table_name="orders", schema=schema)
    op.drop_table("orders", schema=schema)

    op.drop_index("ix_order_recommendation_items_product_id", table_name="order_recommendation_items", schema=schema)
    op.drop_index("ix_order_recommendation_items_recommendation_id", table_name="order_recommendation_items", schema=schema)
    op.drop_table("order_recommendation_items", schema=schema)

    op.drop_index("ix_order_recommendations_store_status", table_name="order_recommendations", schema=schema)
    op.drop_index("ix_order_recommendations_store_recommended_at", table_name="order_recommendations", schema=schema)
    op.drop_table("order_recommendations", schema=schema)

    op.drop_index("ix_inventory_snapshots_biz_date", table_name="inventory_snapshots", schema=schema)
    op.drop_index("ix_inventory_snapshots_store_product_snapshot_at", table_name="inventory_snapshots", schema=schema)
    op.drop_index("ix_inventory_snapshots_store_snapshot_at", table_name="inventory_snapshots", schema=schema)
    op.drop_table("inventory_snapshots", schema=schema)

    op.drop_index("ix_products_is_active", table_name="products", schema=schema)
    op.drop_index("ix_products_store_category", table_name="products", schema=schema)
    op.drop_table("products", schema=schema)

    op.drop_index("ix_users_is_active", table_name="users", schema=schema)
    op.drop_index("ix_users_store_role", table_name="users", schema=schema)
    op.drop_table("users", schema=schema)

    op.drop_index("ix_stores_is_active_store_name", table_name="stores", schema=schema)
    op.drop_table("stores", schema=schema)

    if schema:
        op.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
