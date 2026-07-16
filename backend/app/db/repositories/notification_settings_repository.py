"""Notification settings repository."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification_settings import NotificationSettings

if TYPE_CHECKING:
    from collections.abc import Sequence


class NotificationSettingsRepository:
    """Repository for notification settings CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _normalize_user_id(user_id: str | None) -> str | None:
        if not user_id or str(user_id).strip().lower() == "anonymous":
            return None
        return str(user_id)

    async def get_settings(
        self, store_id: str, user_id: str | None = None
    ) -> NotificationSettings | None:
        """Get settings for store (user-specific or store default)."""
        normalized_user_id = self._normalize_user_id(user_id)
        stmt = select(NotificationSettings).where(
            NotificationSettings.store_id == store_id
        )

        if normalized_user_id:
            stmt = stmt.where(NotificationSettings.user_id == normalized_user_id)
        else:
            stmt = stmt.where(NotificationSettings.user_id.is_(None))

        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_settings(
        self, store_id: str, user_id: str | None = None
    ) -> NotificationSettings:
        """Get existing settings or create default."""
        normalized_user_id = self._normalize_user_id(user_id)
        settings = await self.get_settings(store_id, normalized_user_id)
        if settings:
            return settings

        settings = NotificationSettings(
            id=str(uuid4()),
            store_id=store_id,
            user_id=normalized_user_id,
            enabled=True,
            snooze_until=None,
            muted_categories=[],
            push_enabled=True,
            email_enabled=False,
            in_app_enabled=True,
        )
        self._session.add(settings)
        await self._session.commit()
        await self._session.refresh(settings)
        return settings

    async def update_settings(
        self, store_id: str, user_id: str | None, updates: dict[str, Any]
    ) -> NotificationSettings:
        """Update settings with provided values."""
        settings = await self.get_or_create_settings(
            store_id,
            self._normalize_user_id(user_id),
        )

        for key, value in updates.items():
            if hasattr(settings, key):
                setattr(settings, key, value)

        settings.updated_at = datetime.utcnow()
        await self._session.commit()
        await self._session.refresh(settings)
        return settings

    async def mute_notifications(
        self,
        store_id: str,
        user_id: str | None,
        duration_minutes: int | None = None,
        categories: list[str] | None = None,
        *,
        disable_all: bool = False,
    ) -> NotificationSettings:
        """Mute notifications with optional duration and categories."""
        updates: dict[str, Any] = {}

        if disable_all:
            updates["enabled"] = False

        if duration_minutes:
            updates["snooze_until"] = datetime.utcnow() + timedelta(
                minutes=duration_minutes
            )
        elif duration_minutes == 0:
            updates["snooze_until"] = None

        if categories:
            settings = await self.get_or_create_settings(store_id, user_id)
            current_muted = set(settings.muted_categories or [])
            current_muted.update(categories)
            updates["muted_categories"] = list(current_muted)

        return await self.update_settings(store_id, user_id, updates)

    async def unmute_notifications(
        self, store_id: str, user_id: str | None
    ) -> NotificationSettings:
        """Unmute all notifications."""
        return await self.update_settings(
            store_id,
            user_id,
            {"enabled": True, "snooze_until": None, "muted_categories": []},
        )

    async def unmute_category(
        self, store_id: str, user_id: str | None, category: str
    ) -> NotificationSettings:
        """Unmute a specific category."""
        settings = await self.get_or_create_settings(store_id, user_id)
        current_muted = set(settings.muted_categories or [])
        current_muted.discard(category)

        return await self.update_settings(
            store_id, user_id, {"muted_categories": list(current_muted)}
        )
