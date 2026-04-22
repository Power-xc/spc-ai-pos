"""Phase 1 notice stubs."""

from fastapi import APIRouter, Depends

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/notice/list", response_model=APIEnvelope)
async def notice_list(user=Depends(get_current_user)):
    return APIEnvelope(data={"notices": [], "_stub": True})


@router.get("/api/notice/promotions", response_model=APIEnvelope)
async def notice_promotions(user=Depends(get_current_user)):
    return APIEnvelope(data={"promotions": [], "_stub": True})
