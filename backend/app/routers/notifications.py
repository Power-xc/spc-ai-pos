"""Notifications and SSE API router."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sse_starlette.sse import EventSourceResponse

from app.dependencies import (
    get_current_user_context,
    get_current_user_role,
    get_notification_service,
)
from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.db.repositories.notification_settings_repository import (
    NotificationSettingsRepository,
)
from app.db.session import get_session_factory, is_postgres_mode
from app.services.notification_settings_service import NotificationSettingsService

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/{store_id}/stream")
async def notification_stream(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    notification_service=Depends(get_notification_service),
):
    """SSE 알림 스트림."""
    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")
    user = get_current_user_context(request, role)
    queue = notification_service.subscribe(store_id)

    async def should_deliver(message: dict) -> bool:
        if not is_postgres_mode():
            return True
        event_type = str(message.get("event_type") or "")
        if event_type in {"refresh", "heartbeat"}:
            return True
        data = message.get("data") or {}
        category = NotificationSettingsService.category_from_event(event_type, data)
        if category is None:
            return True
        session_factory = get_session_factory()
        async with session_factory() as session:
            service = NotificationSettingsService(
                NotificationSettingsRepository(session)
            )
            return await service.should_deliver(
                store_id,
                user.get("user_id"),
                category=category,
                channel="in_app",
            )

    async def event_generator():
        try:
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    if not await should_deliver(message):
                        continue
                    yield {
                        "event": message["event_type"],
                        "data": json.dumps(
                            message["data"], ensure_ascii=False, default=str
                        ),
                    }
                except asyncio.TimeoutError:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"ts": datetime.now(UTC).isoformat()}),
                    }
        finally:
            notification_service.unsubscribe(store_id, queue)

    return EventSourceResponse(event_generator())


async def notification_stream_legacy(
    request: Request,
    store_id: str = Query(...),
    role: str = Depends(get_current_user_role),
    notification_service=Depends(get_notification_service),
):
    """Legacy SSE path used by the current frontend."""

    return await notification_stream(
        store_id=store_id,
        request=request,
        role=role,
        notification_service=notification_service,
    )
