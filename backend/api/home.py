"""Home dashboard APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


@router.get("/api/home/sales-summary", response_model=APIEnvelope)
async def home_sales_summary(request: Request, user=Depends(get_current_user)):
    summary = await request.app.state.sales_agent.daily_summary(user)
    return APIEnvelope(data=summary)


@router.get("/api/home/briefing", response_model=APIEnvelope)
async def home_briefing(request: Request, user=Depends(get_current_user)):
    sales = await request.app.state.sales_agent.daily_summary(user)
    production = await request.app.state.production_agent.production_guide(user)
    deadlines = await request.app.state.registry.execute("get_pending_deadlines", store_id=user.store_id)
    alerts = [modal.model_dump(mode="json") for modal in await request.app.state.modal_manager.get_pending(user.store_id)]
    greeting = (
        f"좋은 아침입니다! 어제 매출 {sales['today_revenue']:,}원, "
        f"오늘 {production['recommendations'][0]['product_name']} {production['recommendations'][0]['recommended_qty']}개 생산 권장합니다."
        if production["recommendations"]
        else "좋은 아침입니다! 오늘은 급한 생산 알림이 없습니다."
    )
    return APIEnvelope(
        data={
            "yesterday_summary": sales,
            "today_production": production["recommendations"],
            "pending_orders": deadlines,
            "active_alerts": alerts,
            "greeting": greeting,
            "last_updated_at": sales["last_updated_at"],
        }
    )


@router.get("/api/home/alerts", response_model=APIEnvelope)
async def home_alerts(request: Request, user=Depends(get_current_user)):
    modals = [modal.model_dump(mode="json") for modal in await request.app.state.modal_manager.get_pending(user.store_id)]
    return APIEnvelope(data=modals)


@router.get("/api/home/chance-loss", response_model=APIEnvelope)
async def home_chance_loss(request: Request, user=Depends(get_current_user)):
    history = await request.app.state.registry.execute("get_stockout_history", store_id=user.store_id, days=1)
    total_loss = sum(item["estimated_lost_sales"] for item in history)
    return APIEnvelope(data={"today": {"total_loss_amount": total_loss, "incidents": history}, "weekly": None, "monthly": None, "last_updated_at": user.current_time.isoformat()})
