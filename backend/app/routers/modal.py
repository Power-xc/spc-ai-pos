"""Legacy modal endpoints used by the 0414 frontend."""

from __future__ import annotations

from time import perf_counter
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.base import AlertEventType, AlertStatus, utc_now
from app.db.repositories.alert_repository import AlertRepository
from app.db.session import is_postgres_mode
from app.dependencies import (
    get_actions_todo_service,
    get_alert_service,
    get_current_user_context,
    get_current_user_role,
    get_notification_service,
    get_order_agent,
    get_order_service,
    get_postgres_db,
    get_production_agent,
    get_request_store_id,
)
from app.models.alert import Alert
from app.routers.orders import _publish_order_confirmed_event, _serialize_confirm_result
from app.schemas.common import APIResponse
from app.services.notification_settings_service import NotificationSettingsService
from app.db.repositories.notification_settings_repository import NotificationSettingsRepository

router = APIRouter(tags=["modal"])


def _normalize_action(action_type: str) -> str:
    return str(action_type or "").strip().lower()


async def _publish_modal_refresh(
    notification_service, store_id: str, modal_id: str, action_type: str
) -> None:
    if notification_service is None:
        return
    await notification_service.publish(
        store_id,
        "refresh",
        {
            "scope": "modal",
            "reason": action_type,
            "modal_id": modal_id,
        },
    )


@router.get("/api/modal/pending", response_model=APIResponse)
async def get_pending_modals(
    request: Request,
    role: str = Depends(get_current_user_role),
    alert_service=Depends(get_alert_service),
    db=Depends(get_postgres_db),
) -> APIResponse:
    """Return the current legacy modal list for active alerts."""

    user = get_current_user_context(request, role)
    store_id = get_request_store_id(request, None)
    if not is_postgres_mode():
        return APIResponse(data=[])
    modals = await alert_service.list_legacy_modals(store_id, limit=20)
    service = NotificationSettingsService(NotificationSettingsRepository(db))
    filtered = await service.filter_legacy_modals(store_id, user.get("user_id"), modals)
    return APIResponse(data=filtered)


@router.post("/api/modal/{modal_id}/respond", response_model=APIResponse)
async def respond_to_modal(
    modal_id: str,
    payload: dict,
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    actions_todo_service=Depends(get_actions_todo_service),
    order_agent=Depends(get_order_agent),
    order_service=Depends(get_order_service),
    production_agent=Depends(get_production_agent),
    notification_service=Depends(get_notification_service),
) -> APIResponse:
    """Execute a modal action and update the backing alert state."""

    action_started_at = perf_counter()
    user = get_current_user_context(request, role)
    store_id = get_request_store_id(request, None)
    action_type = str(payload.get("action_type") or "")
    params = payload.get("params") or {}
    normalized_action = _normalize_action(action_type)

    if not is_postgres_mode():
        return APIResponse(
            data={
                "status": "integration_pending",
                "message": "DATA_MODE=file에서는 modal action 실행이 제한됩니다.",
            }
        )

    try:
        modal_uuid = uuid.UUID(modal_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid modal id") from exc

    repo = AlertRepository(db)
    alert = await db.get(Alert, modal_uuid)
    if alert is None or alert.store_id != store_id:
        raise HTTPException(status_code=404, detail="Modal not found")

    response_payload: dict = {
        "modal_id": modal_id,
        "action_type": action_type,
        "status": "handled",
    }

    if normalized_action in {"dismiss", "close"}:
        previous_status = alert.status
        alert.status = AlertStatus.DISMISSED
        alert.read_at = alert.read_at or utc_now()
        alert.dismissed_at = utc_now()
        await repo.append_alert_event(
            alert_id=alert.id,
            store_id=store_id,
            actor_user_id=user["user_id"],
            event_type=AlertEventType.DISMISSED,
            from_status=previous_status,
            to_status=AlertStatus.DISMISSED,
            details={"channel": "modal"},
        )
        response_payload["message"] = "알림을 닫았습니다."
    elif normalized_action in {"modify", "navigate"}:
        previous_status = alert.status
        alert.read_at = alert.read_at or utc_now()
        alert.status = AlertStatus.DISMISSED
        alert.dismissed_at = utc_now()
        await repo.append_alert_event(
            alert_id=alert.id,
            store_id=store_id,
            actor_user_id=user["user_id"],
            event_type=AlertEventType.DISMISSED,
            from_status=previous_status,
            to_status=alert.status,
            details={"channel": "modal", "route": params.get("route") or alert.cta_route},
        )
        response_payload["message"] = "관련 화면으로 이동합니다."
        response_payload["route"] = params.get("route") or alert.cta_route or "/alerts"
    elif normalized_action == "todo_complete":
        item = await actions_todo_service.complete_todo(
            store_id=store_id,
            todo_id=modal_uuid,
            actor_user_id=user["user_id"],
        )
        response_payload["message"] = "할일을 완료 처리했습니다."
        response_payload["item"] = item
        response_payload["route"] = params.get("route") or "/actions"
    elif normalized_action == "todo_hold":
        item = await actions_todo_service.hold_todo(
            store_id=store_id,
            todo_id=modal_uuid,
            actor_user_id=user["user_id"],
        )
        response_payload["message"] = "할일을 보류 처리했습니다."
        response_payload["item"] = item
        response_payload["route"] = params.get("route") or "/actions"
    elif normalized_action == "order_confirm":
        items = params.get("items") or alert.payload.get("items") or []
        if not items:
            raise HTTPException(
                status_code=400, detail="items is required for order_confirm"
            )
        if is_postgres_mode():
            result = await order_service.confirm_order(
                store_id=store_id,
                items=items,
                created_by=user["user_id"],
                confirmed_by=user["user_id"],
                context_payload={
                    "request_path": str(request.url.path),
                    "mode": "modal",
                },
            )
        else:
            result = await order_agent.confirm_order(
                store_id=store_id,
                items=items,
                user_id=user["user_id"],
                role=user["role"],
            )
        confirm_payload = _serialize_confirm_result(result)
        await _publish_order_confirmed_event(
            notification_service=notification_service,
            store_id=store_id,
            payload=confirm_payload,
        )
        response_payload.update(confirm_payload)
        response_payload["message"] = (
            confirm_payload.get("message") or "발주를 확정했습니다."
        )
        response_payload["route"] = params.get("route") or "/orders"
    elif normalized_action == "production_register":
        product_id = params.get("product_id") or alert.payload.get("product_id")
        quantity = (
            params.get("quantity")
            or params.get("recommended_production_qty")
            or alert.payload.get("recommended_production_qty")
        )
        if not product_id or quantity in (None, ""):
            raise HTTPException(
                status_code=400, detail="product_id and quantity are required"
            )
        register_payload = await production_agent.register_production(
            store_id=store_id,
            product_id=str(product_id),
            quantity=int(quantity),
            alert_id=str(alert.id),
            user_id=user["user_id"],
            role=user["role"],
        )
        previous_status = alert.status
        alert.read_at = alert.read_at or utc_now()
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = utc_now()
        await repo.append_alert_event(
            alert_id=alert.id,
            store_id=store_id,
            actor_user_id=user["user_id"],
            event_type=AlertEventType.RESOLVED,
            from_status=previous_status,
            to_status=AlertStatus.RESOLVED,
            details={
                "channel": "modal",
                "product_id": product_id,
                "quantity": quantity,
            },
        )
        response_payload["message"] = "생산 등록을 완료했습니다."
        response_payload["data"] = register_payload
        response_payload["route"] = params.get("route") or "/realtime"
    else:
        raise HTTPException(
            status_code=400, detail=f"Unsupported modal action: {action_type}"
        )

    await db.commit()
    response_payload["latency_ms"] = int((perf_counter() - action_started_at) * 1000)
    await _publish_modal_refresh(notification_service, store_id, modal_id, normalized_action)
    return APIResponse(data=response_payload)
