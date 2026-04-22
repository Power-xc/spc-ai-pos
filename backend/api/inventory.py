"""Inventory and production APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from core.schemas import APIEnvelope, ProductionRegisterRequest
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/inventory/current", response_model=APIEnvelope)
async def inventory_current(request: Request, user=Depends(get_current_user)):
    return APIEnvelope(data=await request.app.state.production_agent.current_inventory(user))


@router.get("/api/inventory/production-guide", response_model=APIEnvelope)
async def production_guide(request: Request, user=Depends(get_current_user)):
    return APIEnvelope(data=await request.app.state.production_agent.production_guide(user))


@router.post("/api/inventory/register-production", response_model=APIEnvelope)
async def register_production(payload: ProductionRegisterRequest, request: Request, user=Depends(get_current_user)):
    request.app.state.security_gate.authorize("register_production", {"store_id": user.store_id, "product_id": payload.product_id}, user, is_write=True)
    result = await request.app.state.production_agent.register(user, payload.product_id, payload.quantity)
    await request.app.state.auditor.log(context=user, action="production_register", tool_name="register_production", params=payload.model_dump(), extra={"chance_loss": result["chance_loss"]})
    return APIEnvelope(data=result)


@router.get("/api/inventory/stockout-history", response_model=APIEnvelope)
async def stockout_history(days: int = 7, request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    history = await request.app.state.registry.execute("get_stockout_history", store_id=user.store_id, days=days)
    return APIEnvelope(data=history)
