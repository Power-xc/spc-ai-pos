"""Notification settings schema."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NotificationSettingsResponse(BaseModel):
    """Response schema for notification settings."""

    store_id: str
    user_id: str | None = None
    enabled: bool = True
    snooze_until: datetime | None = None
    muted_categories: list[str] = Field(default_factory=list)
    push_enabled: bool = True
    email_enabled: bool = False
    in_app_enabled: bool = True
    is_snoozed: bool = False

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class NotificationSettingsUpdate(BaseModel):
    """Update schema for notification settings."""

    enabled: bool | None = None
    snooze_minutes: int | None = Field(None, ge=0, le=1440)  # Max 24 hours
    muted_categories: list[str] | None = None
    push_enabled: bool | None = None
    email_enabled: bool | None = None
    in_app_enabled: bool | None = None


class MuteNotificationsRequest(BaseModel):
    """Request to mute notifications."""

    duration_minutes: int | None = Field(None, ge=0, le=1440)
    categories: list[str] | None = Field(
        None,
        description="Categories to mute: inventory, order, actions, analytics, production, general",
    )
    scope: str = "all"  # all, inventory, order, actions, analytics


class UnmuteNotificationsRequest(BaseModel):
    """Request to unmute notifications."""

    categories: list[str] | None = (
        None  # Specific categories to unmute, or None for all
    )


class NotificationMuteResult(BaseModel):
    """Result of mute/unmute operation."""

    success: bool
    message: str
    settings: NotificationSettingsResponse | None = None
    action_taken: str  # "muted", "unmuted", "snoozed", "category_muted"
