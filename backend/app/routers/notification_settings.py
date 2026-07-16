"""Notification settings API router."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends

from app.db.repositories.notification_settings_repository import (
    NotificationSettingsRepository,
)
from app.db.session import is_postgres_mode
from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.dependencies import get_current_user_context, get_postgres_db
from app.schemas.common import APIResponse
from app.schemas.notification_settings import (
    MuteNotificationsRequest,
    NotificationSettingsUpdate,
    UnmuteNotificationsRequest,
)
from app.services.notification_settings_service import NotificationSettingsService

router = APIRouter(
    prefix="/api/v1/notification-settings", tags=["notification-settings"]
)


def _integration_pending_response(store_id: str) -> APIResponse:
    return APIResponse(
        data={
            "store_id": store_id,
            "enabled": True,
            "snooze_until": None,
            "muted_categories": [],
            "push_enabled": True,
            "email_enabled": False,
            "in_app_enabled": True,
            "is_snoozed": False,
            "status": "integration_pending",
            "note": "알림 설정 저장은 PostgreSQL 모드에서 활성화됩니다.",
        }
    )


def _serialize_settings(
    settings, *, status: str = "active", note: str | None = None
) -> dict[str, Any]:
    return {
        "store_id": settings.store_id,
        "user_id": settings.user_id,
        "enabled": settings.enabled,
        "snooze_until": settings.snooze_until.isoformat()
        if settings.snooze_until
        else None,
        "muted_categories": settings.muted_categories,
        "push_enabled": settings.push_enabled,
        "email_enabled": settings.email_enabled,
        "in_app_enabled": settings.in_app_enabled,
        "is_snoozed": bool(
            settings.snooze_until and settings.snooze_until > datetime.now(UTC)
        ),
        "status": status,
        "note": note,
    }


@router.get("/{store_id}", response_model=APIResponse)
async def get_notification_settings(
    store_id: str,
    user: dict = Depends(get_current_user_context),
    session=Depends(get_postgres_db),
) -> APIResponse:
    """Get notification settings for store (and user if specified)."""

    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")

    if not is_postgres_mode():
        return _integration_pending_response(store_id)

    repo = NotificationSettingsRepository(session)
    service = NotificationSettingsService(repo)
    settings = await service.get_settings(store_id, user.get("user_id"))
    return APIResponse(
        data=settings if isinstance(settings, dict) else _serialize_settings(settings)
    )


@router.patch("/{store_id}", response_model=APIResponse)
async def update_notification_settings(
    store_id: str,
    update: NotificationSettingsUpdate,
    user: dict = Depends(get_current_user_context),
    session=Depends(get_postgres_db),
) -> APIResponse:
    """Update notification settings."""

    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")

    if not is_postgres_mode():
        return _integration_pending_response(store_id)

    repo = NotificationSettingsRepository(session)

    updates: dict[str, Any] = {}
    if update.enabled is not None:
        updates["enabled"] = update.enabled
    if update.snooze_minutes is not None:
        updates["snooze_until"] = (
            None
            if update.snooze_minutes == 0
            else datetime.now(UTC) + timedelta(minutes=update.snooze_minutes)
        )
    if update.muted_categories is not None:
        updates["muted_categories"] = update.muted_categories
    if update.push_enabled is not None:
        updates["push_enabled"] = update.push_enabled
    if update.email_enabled is not None:
        updates["email_enabled"] = update.email_enabled
    if update.in_app_enabled is not None:
        updates["in_app_enabled"] = update.in_app_enabled

    settings = await repo.update_settings(store_id, user.get("user_id"), updates)
    return APIResponse(data=_serialize_settings(settings, note="설정을 저장했습니다."))


@router.post("/{store_id}/mute", response_model=APIResponse)
async def mute_notifications(
    store_id: str,
    request: MuteNotificationsRequest,
    user: dict = Depends(get_current_user_context),
    session=Depends(get_postgres_db),
) -> APIResponse:
    """Mute notifications with optional duration and categories."""

    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")

    if not is_postgres_mode():
        return _integration_pending_response(store_id)

    repo = NotificationSettingsRepository(session)
    service = NotificationSettingsService(repo)

    if request.scope == "all":
        result = await service.mute_all(
            store_id, user.get("user_id"), request.duration_minutes
        )
    else:
        categories = request.categories or [request.scope]
        result = await service.mute_categories(
            store_id, user.get("user_id"), categories, request.duration_minutes
        )

    return APIResponse(data=result)


@router.post("/{store_id}/unmute", response_model=APIResponse)
async def unmute_notifications(
    store_id: str,
    request: UnmuteNotificationsRequest,
    user: dict = Depends(get_current_user_context),
    session=Depends(get_postgres_db),
) -> APIResponse:
    """Unmute notifications (all or specific categories)."""

    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")

    if not is_postgres_mode():
        return _integration_pending_response(store_id)

    repo = NotificationSettingsRepository(session)
    service = NotificationSettingsService(repo)

    if request.categories:
        result = await service.unmute_categories(
            store_id, user.get("user_id"), request.categories
        )
    else:
        result = await service.unmute_all(store_id, user.get("user_id"))

    return APIResponse(data=result)
