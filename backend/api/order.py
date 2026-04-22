"""Ordering APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from core.schemas import APIEnvelope, OrderConfirmRequest, OrderDraftRequest
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/order/recommendations", response_model=APIEnvelope)
async def order_recommendations(request: Request, user=Depends(get_current_user)):
    return APIEnvelope(data=await request.app.state.ordering_agent.recommendations(user))


@router.post("/api/order/recalculate-risk", response_model=APIEnvelope)
async def recalculate_risk(payload: OrderDraftRequest, request: Request, user=Depends(get_current_user)):
    items = [item.model_dump() for item in payload.items]
    return APIEnvelope(data=await request.app.state.ordering_agent.recalculate(user, items))


@router.post("/api/order/confirm", response_model=APIEnvelope)
async def confirm_order(payload: OrderConfirmRequest, request: Request, user=Depends(get_current_user)):
    items = [item.model_dump() for item in payload.items]
    request.app.state.security_gate.authorize("confirm_order", {"store_id": user.store_id}, user, is_write=True)
    result = await request.app.state.ordering_agent.confirm(user, items)
    await request.app.state.auditor.log(context=user, action="owner_confirm", tool_name="confirm_order", params={"items": items})
    return APIEnvelope(data=result)


@router.get("/api/order/history", response_model=APIEnvelope)
async def order_history(days: int = 30, request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    latest = request.app.state.data_store.order_day["biz_date"].max()
    dates = request.app.state.data_store.order_day[request.app.state.data_store.order_day["store_id"] == user.store_id]["biz_date"].drop_duplicates().sort_values(ascending=False).head(days)
    data = [await request.app.state.registry.execute("get_order_history", store_id=user.store_id, date=date.date().isoformat()) for date in dates]
    return APIEnvelope(data=data)


@router.get("/api/order/deadlines", response_model=APIEnvelope)
async def order_deadlines(request: Request, user=Depends(get_current_user)):
    return APIEnvelope(data=await request.app.state.registry.execute("get_pending_deadlines", store_id=user.store_id))
