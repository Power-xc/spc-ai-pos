"""Modal pending list and owner response APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from core.schemas import APIEnvelope, ModalResponseRequest, OrderConfirmRequest, ProductionRegisterRequest
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/modal/pending", response_model=APIEnvelope)
async def get_pending_modals(request: Request, user=Depends(get_current_user)):
    modals = [modal.model_dump(mode="json") for modal in await request.app.state.modal_manager.get_pending(user.store_id)]
    return APIEnvelope(data=modals)


@router.post("/api/modal/{modal_id}/respond", response_model=APIEnvelope)
async def respond_to_modal(modal_id: str, payload: ModalResponseRequest, request: Request, user=Depends(get_current_user)):
    pending = {modal.modal_id: modal for modal in await request.app.state.modal_manager.get_pending(user.store_id)}
    modal = pending.get(modal_id)
    if not modal:
        raise HTTPException(status_code=404, detail="Modal not found")
    action = next((item for item in modal.actions if item.action_type == payload.action_type), None)
    if action is None:
        raise HTTPException(status_code=400, detail="Invalid modal action")
    await request.app.state.modal_manager.resolve(modal_id, payload.action_type)
    await request.app.state.auditor.log(context=user, action="modal_response", params={"modal_id": modal_id, "action_type": payload.action_type})
    if payload.action_type == "dismiss":
        return APIEnvelope(data={"result": "모달 닫힘"})
    if payload.action_type == "modify":
        return APIEnvelope(data={"result": "수정 화면으로 이동", "redirect": action.api_endpoint, "params": action.params})
    if action.api_endpoint == "/api/inventory/register-production":
        result = await request.app.state.production_agent.register(user, action.params["product_id"], int(action.params["quantity"]))
        return APIEnvelope(data={"result": "생산 등록 완료", **result})
    if action.api_endpoint == "/api/order/confirm":
        if action.params.get("source") == "ai_recommendation":
            rec = await request.app.state.ordering_agent.recommendations(user)
            items = rec["options"][0]["items"] if rec["options"] else []
        else:
            items = payload.params.get("items", [])
        result = await request.app.state.ordering_agent.confirm(user, items)
        return APIEnvelope(data={"result": "발주 확정 완료", **result})
    return APIEnvelope(data={"result": "처리 완료"})
