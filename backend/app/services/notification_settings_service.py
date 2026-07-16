"""Notification settings service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.db.repositories.notification_settings_repository import (
        NotificationSettingsRepository,
    )


class NotificationSettingsService:
    """Service for managing notification settings."""

    CATEGORY_MAP = {
        "재고": "inventory",
        "inventory": "inventory",
        "주문": "order",
        "발주": "order",
        "order": "order",
        "할일": "actions",
        "actions": "actions",
        "할 일": "actions",
        "매출": "analytics",
        "analytics": "analytics",
        "실시간": "production",
        "production": "production",
        "일반": "general",
        "general": "general",
    }
    CHANNEL_MAP = {
        "앱내": "in_app",
        "앱 내": "in_app",
        "인앱": "in_app",
        "화면": "in_app",
        "app": "in_app",
        "in_app": "in_app",
        "in-app": "in_app",
        "푸시": "push",
        "push": "push",
        "이메일": "email",
        "메일": "email",
        "email": "email",
    }
    CHANNEL_FIELD_MAP = {
        "in_app": "in_app_enabled",
        "push": "push_enabled",
        "email": "email_enabled",
    }
    CHANNEL_LABEL_MAP = {
        "in_app": "앱 내",
        "push": "푸시",
        "email": "이메일",
    }
    CATEGORY_LABEL_MAP = {
        "inventory": "재고",
        "order": "주문",
        "actions": "할일",
        "analytics": "매출",
        "production": "실시간",
        "general": "일반",
    }
    EVENT_CATEGORY_MAP = {
        "production_alert": "production",
        "order_deadline": "order",
        "order_confirmed": "order",
        "todo_updated": "actions",
        "sales_insight": "analytics",
    }
    MODAL_CATEGORY_MAP = {
        "production_alert": "production",
        "order_deadline": "order",
        "anomaly_sales": "analytics",
        "stockout_risk": "production",
        "order_anomaly": "order",
    }

    def __init__(self, repository: "NotificationSettingsRepository") -> None:
        self._repo = repository

    @classmethod
    def _serialize_settings(cls, settings: Any) -> dict[str, Any]:
        return {
            "store_id": settings.store_id,
            "user_id": settings.user_id,
            "enabled": settings.enabled,
            "snooze_until": settings.snooze_until.isoformat()
            if settings.snooze_until
            else None,
            "muted_categories": list(settings.muted_categories or []),
            "push_enabled": settings.push_enabled,
            "email_enabled": settings.email_enabled,
            "in_app_enabled": settings.in_app_enabled,
            "is_snoozed": settings.is_snoozed(),
        }

    async def get_settings(
        self, store_id: str, user_id: str | None = None
    ) -> dict[str, Any]:
        """Get current settings for store/user."""
        settings = await self._repo.get_or_create_settings(store_id, user_id)
        return self._serialize_settings(settings)

    async def mute_all(
        self,
        store_id: str,
        user_id: str | None = None,
        duration_minutes: int | None = None,
    ) -> dict[str, Any]:
        """Mute all notifications."""
        result = await self.apply_chat_settings_operation(
            store_id,
            user_id,
            sub_intent="NOTIFICATION_MUTE",
            scope="all",
            duration_minutes=duration_minutes,
        )

        return {
            "success": True,
            "message": result["message"],
            "action": "muted",
            "settings": result["settings"],
        }

    async def mute_categories(
        self,
        store_id: str,
        user_id: str | None,
        category_names: list[str],
        duration_minutes: int | None = None,
    ) -> dict[str, Any]:
        """Mute specific categories."""
        categories = self.normalize_categories(category_names)
        result = await self.apply_chat_settings_operation(
            store_id,
            user_id,
            sub_intent="NOTIFICATION_MUTE",
            scope="categories",
            category_names=category_names,
            duration_minutes=duration_minutes,
        )

        return {
            "success": True,
            "message": result["message"],
            "action": "category_muted",
            "categories": categories,
            "settings": result["settings"],
        }

    async def unmute_all(
        self, store_id: str, user_id: str | None = None
    ) -> dict[str, Any]:
        """Unmute all notifications."""
        result = await self.apply_chat_settings_operation(
            store_id,
            user_id,
            sub_intent="NOTIFICATION_UNMUTE",
            scope="all",
        )
        return {
            "success": True,
            "message": result["message"],
            "action": "unmuted",
            "settings": result["settings"],
        }

    async def unmute_categories(
        self, store_id: str, user_id: str | None, category_names: list[str]
    ) -> dict[str, Any]:
        """Unmute specific categories."""
        result = await self.apply_chat_settings_operation(
            store_id,
            user_id,
            sub_intent="NOTIFICATION_UNMUTE",
            scope="categories",
            category_names=category_names,
        )

        return {
            "success": True,
            "message": result["message"],
            "action": "category_unmuted",
            "settings": result["settings"],
        }

    @classmethod
    def normalize_categories(cls, category_names: list[str] | None) -> list[str]:
        categories: list[str] = []
        for name in category_names or []:
            normalized_name = str(name or "").strip()
            if not normalized_name:
                continue
            category = cls.CATEGORY_MAP.get(normalized_name.lower())
            if category and category not in categories:
                categories.append(category)
        return categories

    @classmethod
    def normalize_channels(cls, channel_names: list[str] | None) -> list[str]:
        channels: list[str] = []
        for name in channel_names or []:
            normalized_name = str(name or "").strip()
            if not normalized_name:
                continue
            compact_name = normalized_name.lower().replace(" ", "")
            channel = cls.CHANNEL_MAP.get(normalized_name.lower()) or cls.CHANNEL_MAP.get(
                compact_name
            )
            if channel and channel not in channels:
                channels.append(channel)
        return channels

    @classmethod
    def channel_field(cls, channel: str) -> str | None:
        return cls.CHANNEL_FIELD_MAP.get(channel)

    @classmethod
    def channel_label(cls, channel: str) -> str:
        return cls.CHANNEL_LABEL_MAP.get(channel, channel)

    @classmethod
    def category_label(cls, category: str) -> str:
        return cls.CATEGORY_LABEL_MAP.get(category, category)

    @classmethod
    def disabled_channels(cls, settings: dict[str, Any]) -> list[str]:
        disabled: list[str] = []
        for channel, field_name in cls.CHANNEL_FIELD_MAP.items():
            if not bool(settings.get(field_name, True)):
                disabled.append(channel)
        return disabled

    @classmethod
    def all_channels_disabled(cls, settings: dict[str, Any]) -> bool:
        return len(cls.disabled_channels(settings)) == len(cls.CHANNEL_FIELD_MAP)

    @classmethod
    def describe_settings_state(cls, settings: dict[str, Any]) -> str:
        if not settings:
            return "현재 알림 설정 상태를 확인하지 못했습니다."
        if settings.get("is_snoozed"):
            return "현재 알림이 일시 중지되어 있습니다."

        disabled_channels = cls.disabled_channels(settings)
        muted_categories = list(settings.get("muted_categories") or [])

        if (not settings.get("enabled", True)) and cls.all_channels_disabled(settings):
            return "현재 모든 알림이 꺼져 있습니다."

        parts: list[str] = []
        if disabled_channels:
            parts.extend(cls.channel_label(channel) for channel in disabled_channels)
        if muted_categories:
            parts.extend(cls.category_label(category) for category in muted_categories)

        if parts:
            return f"현재 일부 알림이 꺼져 있습니다. ({', '.join(parts)})"
        return "현재 모든 알림이 켜져 있습니다."

    @classmethod
    def _target_labels(
        cls,
        categories: list[str] | None = None,
        channels: list[str] | None = None,
    ) -> list[str]:
        return [
            *(cls.channel_label(channel) for channel in channels or []),
            *(cls.category_label(category) for category in categories or []),
        ]

    @classmethod
    def _matches_expectation(
        cls,
        settings: dict[str, Any],
        *,
        sub_intent: str,
        categories: list[str],
        channels: list[str],
        duration_minutes: int | None,
    ) -> bool:
        is_all_scope = not categories and not channels

        if sub_intent == "NOTIFICATION_STATUS":
            return True

        if sub_intent == "NOTIFICATION_UNMUTE":
            if is_all_scope:
                return (
                    bool(settings.get("enabled"))
                    and bool(settings.get("in_app_enabled"))
                    and bool(settings.get("push_enabled"))
                    and bool(settings.get("email_enabled"))
                    and not list(settings.get("muted_categories") or [])
                    and not bool(settings.get("is_snoozed"))
                )
            return all(
                category not in list(settings.get("muted_categories") or [])
                for category in categories
            ) and all(
                bool(settings.get(cls.channel_field(channel) or "", True))
                for channel in channels
            )

        if is_all_scope:
            if duration_minutes:
                return bool(settings.get("is_snoozed"))
            return (
                not bool(settings.get("enabled"))
                and not bool(settings.get("in_app_enabled"))
                and not bool(settings.get("push_enabled"))
                and not bool(settings.get("email_enabled"))
            )

        return all(
            category in list(settings.get("muted_categories") or [])
            for category in categories
        ) and all(
            not bool(settings.get(cls.channel_field(channel) or "", True))
            for channel in channels
        )

    @classmethod
    def build_operation_message(
        cls,
        settings: dict[str, Any],
        *,
        sub_intent: str,
        categories: list[str],
        channels: list[str],
        duration_minutes: int | None,
    ) -> str:
        if sub_intent == "NOTIFICATION_STATUS":
            return cls.describe_settings_state(settings)

        if not cls._matches_expectation(
            settings,
            sub_intent=sub_intent,
            categories=categories,
            channels=channels,
            duration_minutes=duration_minutes,
        ):
            return (
                "일부 알림만 다시 켜졌습니다."
                if sub_intent == "NOTIFICATION_UNMUTE"
                else "일부 알림만 꺼졌습니다."
            )

        target_labels = cls._target_labels(categories, channels)
        if sub_intent == "NOTIFICATION_UNMUTE":
            return (
                "모든 알림을 다시 켰습니다."
                if not target_labels
                else f"{', '.join(target_labels)} 알림을 다시 켰습니다."
            )

        if not target_labels:
            if duration_minutes:
                return f"모든 알림을 {duration_minutes}분간 일시 중지했습니다."
            return "모든 알림을 껐습니다."
        return f"{', '.join(target_labels)} 알림을 껐습니다."

    async def apply_chat_settings_operation(
        self,
        store_id: str,
        user_id: str | None,
        *,
        sub_intent: str,
        scope: str,
        category_names: list[str] | None = None,
        channel_names: list[str] | None = None,
        duration_minutes: int | None = None,
    ) -> dict[str, Any]:
        settings_model = await self._repo.get_or_create_settings(store_id, user_id)
        current = self._serialize_settings(settings_model)
        resolved_categories = self.normalize_categories(category_names)
        resolved_channels = self.normalize_channels(channel_names)
        updates: dict[str, Any] = {}

        if sub_intent == "NOTIFICATION_STATUS":
            return {
                "settings": current,
                "persisted": False,
                "resolved_categories": resolved_categories,
                "resolved_channels": resolved_channels,
                "message": self.describe_settings_state(current),
            }

        next_settings = {
            **current,
            "muted_categories": list(current.get("muted_categories") or []),
        }

        is_all_scope = (
            scope == "all" and not resolved_categories and not resolved_channels
        )
        has_targets = bool(resolved_categories or resolved_channels)

        if sub_intent == "NOTIFICATION_UNMUTE":
            next_settings["enabled"] = True
            next_settings["snooze_until"] = None
            next_settings["muted_categories"] = [
                category
                for category in next_settings["muted_categories"]
                if category not in resolved_categories
            ]
            if is_all_scope:
                next_settings["muted_categories"] = []
                next_settings["push_enabled"] = True
                next_settings["email_enabled"] = True
                next_settings["in_app_enabled"] = True
            for channel in resolved_channels:
                field_name = self.channel_field(channel)
                if field_name:
                    next_settings[field_name] = True
        else:
            if is_all_scope:
                if duration_minutes:
                    next_settings["enabled"] = True
                    next_settings["snooze_until"] = (
                        datetime.now(UTC) + timedelta(minutes=duration_minutes)
                    )
                else:
                    next_settings["enabled"] = False
                    next_settings["snooze_until"] = None
                    next_settings["push_enabled"] = False
                    next_settings["email_enabled"] = False
                    next_settings["in_app_enabled"] = False
            else:
                muted_categories = set(next_settings["muted_categories"])
                muted_categories.update(resolved_categories)
                next_settings["muted_categories"] = list(muted_categories)
                for channel in resolved_channels:
                    field_name = self.channel_field(channel)
                    if field_name:
                        next_settings[field_name] = False
                if duration_minutes:
                    next_settings["snooze_until"] = (
                        datetime.now(UTC) + timedelta(minutes=duration_minutes)
                    )

        if not any(
            bool(next_settings.get(field_name, True))
            for field_name in self.CHANNEL_FIELD_MAP.values()
        ):
            next_settings["enabled"] = False
        elif sub_intent == "NOTIFICATION_UNMUTE" and (is_all_scope or has_targets):
            next_settings["enabled"] = True

        for key, value in next_settings.items():
            if current.get(key) != value:
                updates[key] = value

        persisted = False
        if updates:
            settings_model = await self._repo.update_settings(store_id, user_id, updates)
            persisted = True

        settings_data = self._serialize_settings(settings_model)
        return {
            "settings": settings_data,
            "persisted": persisted,
            "resolved_categories": resolved_categories,
            "resolved_channels": resolved_channels,
            "message": self.build_operation_message(
                settings_data,
                sub_intent=sub_intent,
                categories=resolved_categories,
                channels=resolved_channels,
                duration_minutes=duration_minutes,
            ),
        }

    @classmethod
    def category_from_event(cls, event_type: str, data: dict[str, Any] | None = None) -> str | None:
        event_key = str(event_type or "").strip().lower()
        if event_key in cls.EVENT_CATEGORY_MAP:
            return cls.EVENT_CATEGORY_MAP[event_key]
        payload = data or {}
        if event_key == "modal":
            return cls.category_from_modal(payload)
        if str(payload.get("type") or "").lower() == "order":
            return "order"
        if str(payload.get("type") or "").lower() == "production":
            return "production"
        if str(payload.get("type") or "").lower() == "sales":
            return "analytics"
        return None

    @classmethod
    def category_from_modal(cls, modal: dict[str, Any] | None) -> str | None:
        modal_type = str((modal or {}).get("modal_type") or "").strip().lower()
        return cls.MODAL_CATEGORY_MAP.get(modal_type)

    async def should_deliver(
        self,
        store_id: str,
        user_id: str | None,
        *,
        category: str | None = None,
        channel: str | None = None,
    ) -> bool:
        settings = await self._repo.get_or_create_settings(store_id, user_id)
        if not settings.enabled:
            return False
        if settings.is_snoozed():
            return False
        field_name = self.channel_field(str(channel or "").strip())
        if field_name and not bool(getattr(settings, field_name, True)):
            return False
        if category and settings.is_category_muted(category):
            return False
        return True

    async def filter_legacy_modals(
        self,
        store_id: str,
        user_id: str | None,
        modals: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        filtered: list[dict[str, Any]] = []
        for modal in modals:
            category = self.category_from_modal(modal)
            if await self.should_deliver(
                store_id,
                user_id,
                category=category,
                channel="in_app",
            ):
                filtered.append(modal)
        return filtered

    def resolve_mute_scope(
        self, query: str
    ) -> tuple[str, list[str] | None, int | None]:
        """Parse query to determine mute scope and duration."""
        import re

        # Check for duration
        duration_match = re.search(r"(\d+)\s*시간?", query)
        duration_minutes = None
        if duration_match:
            hours = int(duration_match.group(1))
            duration_minutes = hours * 60

        # Check for specific categories
        categories = []
        if "재고" in query or "inventory" in query.lower():
            categories.append("재고")
        if "주문" in query or "발주" in query or "order" in query.lower():
            categories.append("주문")
        if "할일" in query or "할 일" in query or "actions" in query.lower():
            categories.append("할일")
        if "매출" in query or "analytics" in query.lower():
            categories.append("매출")

        # Check for "오늘" (today) - snooze until end of day
        if "오늘" in query and not duration_match:
            from datetime import datetime, timedelta

            now = datetime.now()
            end_of_day = now.replace(hour=23, minute=59, second=59)
            duration_minutes = int((end_of_day - now).total_seconds() / 60)

        scope = "categories" if categories else "all"
        return scope, categories, duration_minutes
