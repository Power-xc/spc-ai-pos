"""Phase 1 settings stubs."""

from fastapi import APIRouter, Depends

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/settings/weather", response_model=APIEnvelope)
async def settings_weather(user=Depends(get_current_user)):
    return APIEnvelope(data={"weather": None, "_stub": True})


@router.get("/api/settings/staff-schedule", response_model=APIEnvelope)
async def settings_staff(user=Depends(get_current_user)):
    return APIEnvelope(data={"schedule": [], "_stub": True})
