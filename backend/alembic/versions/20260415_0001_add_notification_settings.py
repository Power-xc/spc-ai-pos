"""Add notification_settings table.

Revision ID: 20260415_0001_add_notification_settings
Revises: 20260410_0001
Create Date: 2026-04-15 09:00:00

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
import sqlalchemy.dialects.postgresql as pg

# revision identifiers, used by Alembic.
revision = "2026041501"
down_revision = "20260410_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("store_id", sa.String(36), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=True, index=True),
        sa.Column("enabled", sa.Boolean, default=True, nullable=False),
        sa.Column("snooze_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("muted_categories", pg.JSONB, default=list, nullable=False),
        sa.Column("push_enabled", sa.Boolean, default=True, nullable=False),
        sa.Column("email_enabled", sa.Boolean, default=False, nullable=False),
        sa.Column("in_app_enabled", sa.Boolean, default=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("notification_settings")
