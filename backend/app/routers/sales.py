"""Sales analysis API router."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request

from app.dependencies import get_current_user_context, get_current_user_role, get_sales_agent
from app.schemas.common import APIResponse
from app.schemas.sales import SalesQueryRequest

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])


@router.post("/query", response_model=APIResponse)
async def query_sales(
    req: SalesQueryRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    sales_agent=Depends(get_sales_agent),
):
    """자연어 매출 질의."""
    user = get_current_user_context(request, role)
    demo_date: date | None = None
    demo_date_val = req.demo_date
    if demo_date_val:
        demo_date = date.fromisoformat(str(demo_date_val))
    result = await sales_agent.process_query(
        req.store_id,
        req.query,
        req.session_id,
        role=user["role"],
        user_id=user["user_id"],
        demo_date=demo_date,
    )
    return APIResponse(data=result)
