"""Actions/Todo API router."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.db.session import is_postgres_mode
from app.dependencies import (
    get_actions_todo_service,
    get_current_user_context,
    get_current_user_role,
    get_notification_service,
    get_request_store_id,
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/v1/actions", tags=["actions"])
logger = logging.getLogger(__name__)


def _to_query_mode(status: str) -> str:
    normalized = status.strip().lower()
    if normalized in {"completed", "done"}:
        return "completed_only"
    if normalized in {"hold", "on_hold", "dismissed"}:
        return "on_hold_only"
    if normalized in {"incomplete", "open"}:
        return "incomplete_only"
    if normalized in {"all", "*"}:
        return "all"
    return "pending_only"


async def _publish_todo_event(
    *,
    notification_service,
    store_id: str,
    todo_id: str,
    action: str,
    item: dict,
) -> None:
    if notification_service is None:
        return
    event_data = {
        "store_id": store_id,
        "todo_id": todo_id,
        "action": action,
        "item": item,
    }
    try:
        await notification_service.publish(store_id, "todo_updated", event_data)
        await notification_service.publish(
            store_id,
            "refresh",
            {
                "scope": "actions_todo",
                "reason": action,
                **event_data,
            },
        )
    except Exception:
        logger.exception("Failed to publish todo_updated SSE event: store_id=%s, todo_id=%s", store_id, todo_id)


@router.get("/todos", response_model=APIResponse)
async def list_todos(
    request: Request,
    status: str = Query("pending", description="pending|incomplete|completed|hold|all"),
    limit: int = Query(20, ge=1, le=100),
    role: str = Depends(get_current_user_role),
    actions_todo_service=Depends(get_actions_todo_service),
):
    store_id = get_request_store_id(request, None)
    query_mode = _to_query_mode(status)

    if not is_postgres_mode():
        return APIResponse(
            data={
                "items": [],
                "total": 0,
                "status_mode": query_mode,
                "mode": "file",
            }
        )

    user = get_current_user_context(request, role)
    items = await actions_todo_service.list_todos(
        store_id=store_id,
        query_mode=query_mode,
        limit=limit,
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(
        data={
            "items": items,
            "total": len(items),
            "status_mode": query_mode,
            "mode": "postgres",
        }
    )


@router.post("/todos/{todo_id}/complete", response_model=APIResponse)
async def complete_todo(
    todo_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    actions_todo_service=Depends(get_actions_todo_service),
    notification_service=Depends(get_notification_service),
):
    store_id = get_request_store_id(request, None)

    if not is_postgres_mode():
        return APIResponse(
            data={
                "todo_id": todo_id,
                "updated": False,
                "mode": "file",
                "message": "DATA_MODE=file에서는 todo 상태 변경이 비활성화됩니다.",
            }
        )

    user = get_current_user_context(request, role)
    try:
        item = await actions_todo_service.complete_todo(
            store_id=store_id,
            todo_id=todo_id,
            actor_user_id=user["user_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Todo update failed: {exc}") from exc

    await _publish_todo_event(
        notification_service=notification_service,
        store_id=store_id,
        todo_id=todo_id,
        action="todo_complete",
        item=item,
    )
    return APIResponse(data={"todo_id": todo_id, "updated": True, "item": item})


@router.post("/todos/{todo_id}/hold", response_model=APIResponse)
async def hold_todo(
    todo_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    actions_todo_service=Depends(get_actions_todo_service),
    notification_service=Depends(get_notification_service),
):
    store_id = get_request_store_id(request, None)

    if not is_postgres_mode():
        return APIResponse(
            data={
                "todo_id": todo_id,
                "updated": False,
                "mode": "file",
                "message": "DATA_MODE=file에서는 todo 상태 변경이 비활성화됩니다.",
            }
        )

    user = get_current_user_context(request, role)
    try:
        item = await actions_todo_service.hold_todo(
            store_id=store_id,
            todo_id=todo_id,
            actor_user_id=user["user_id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Todo update failed: {exc}") from exc

    await _publish_todo_event(
        notification_service=notification_service,
        store_id=store_id,
        todo_id=todo_id,
        action="todo_hold",
        item=item,
    )
    return APIResponse(data={"todo_id": todo_id, "updated": True, "item": item})
