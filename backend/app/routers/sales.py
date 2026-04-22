"""Sales analysis API router."""

from __future__ import annotations

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
    result = await sales_agent.process_query(
        req.store_id,
        req.query,
        req.session_id,
        role=user["role"],
        user_id=user["user_id"],
    )
    return APIResponse(data=result)
