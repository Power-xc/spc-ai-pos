"""SSE notification stream for modal and refresh events."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/notifications/stream")
async def notification_stream(request: Request, user=Depends(get_current_user)):
    queue = request.app.state.notification_hub.subscribe(user.store_id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    yield {"event": message["event"], "data": json.dumps(message["data"], ensure_ascii=False, default=str)}
                except asyncio.TimeoutError:
                    yield {"event": "refresh", "data": json.dumps({"section": "inventory", "ts": datetime.utcnow().isoformat()})}
        finally:
            request.app.state.notification_hub.unsubscribe(user.store_id, queue)

    return EventSourceResponse(event_generator())
