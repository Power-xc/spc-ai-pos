"""Sales analysis APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/sales/hourly", response_model=APIEnvelope)
async def sales_hourly(date: str | None = None, request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    return APIEnvelope(data=await request.app.state.registry.execute("get_hourly_sales", store_id=user.store_id, date=date))


@router.get("/api/sales/ranking", response_model=APIEnvelope)
async def sales_ranking(period: str = "today", request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    return APIEnvelope(data=await request.app.state.registry.execute("get_product_ranking", store_id=user.store_id, period=period))


@router.get("/api/sales/compare", response_model=APIEnvelope)
async def sales_compare(period_a_start: str, period_a_end: str, period_b_start: str, period_b_end: str, request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    payload = await request.app.state.sales_agent.compare(user, period_a_start, period_a_end, period_b_start, period_b_end)
    return APIEnvelope(data=payload)


@router.get("/api/sales/waste", response_model=APIEnvelope)
async def sales_waste(period: str = "today", request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    return APIEnvelope(data=await request.app.state.sales_agent.waste(user, period))


@router.get("/api/sales/profitability", response_model=APIEnvelope)
async def sales_profitability(period: str = "month", request: Request = None, user=Depends(get_current_user)):  # type: ignore[assignment]
    payload = await request.app.state.registry.execute("get_profitability", store_id=user.store_id, period=period)
    masked, masked_fields = request.app.state.security_gate.mask(payload, user.role)
    return APIEnvelope(data={**masked, "_masked_fields": masked_fields})
