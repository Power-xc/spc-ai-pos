"""Simple metrics endpoint for hq_admin only."""

from fastapi import APIRouter, Depends, HTTPException, Request

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/admin/metrics", response_model=APIEnvelope)
async def get_metrics(request: Request, user=Depends(get_current_user)):
    if user.role != "hq_admin":
        raise HTTPException(status_code=403, detail="hq_admin only")
    return APIEnvelope(data={"today": {**request.app.state.metrics, **request.app.state.modal_manager.stats()}})
