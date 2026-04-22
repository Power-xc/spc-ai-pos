"""Production management API router."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_current_user_context,
    get_current_user_role,
    get_postgres_db,
    get_production_agent,
    get_request_store_id,
)
from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.schemas.common import APIResponse
from app.schemas.production import ProductionRegisterRequest
from app.tools import sql_queries

router = APIRouter(prefix="/api/v1/production", tags=["production"])
logger = logging.getLogger(__name__)


def _validate_store_id(store_id: str) -> str:
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")
    return normalized


@router.get("/{store_id}/alerts", response_model=APIResponse)
async def get_production_alerts(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    """현재 생산 알림 목록."""
    store_id = _validate_store_id(store_id)
    user = get_current_user_context(request, role)
    alerts = await production_agent.get_current_alerts(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    return APIResponse(data=alerts)


@router.get("/{store_id}/inventory", response_model=APIResponse)
async def get_inventory(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    """전체 재고 현황."""
    store_id = _validate_store_id(store_id)
    user = get_current_user_context(request, role)
    inventory = await production_agent.get_inventory_status(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    return APIResponse(data=inventory)


@router.get("/{store_id}/forecast/{product_id}", response_model=APIResponse)
async def get_forecast(
    store_id: str,
    product_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
):
    """특정 제품 예측."""
    store_id = _validate_store_id(store_id)
    _ = get_current_user_context(request, role)
    demand = await production_agent.predictor.predict_daily_demand(
        db, store_id, product_id
    )
    risk = await production_agent.predictor.predict_stockout_risk(
        db, store_id, product_id
    )
    hourly = await production_agent.predictor.predict_hourly_depletion(
        db, store_id, product_id
    )
    pattern = await production_agent.predictor.get_production_pattern(
        db, store_id, product_id
    )
    return APIResponse(
        data={"demand": demand, "risk": risk, "hourly": hourly, "pattern": pattern}
    )


@router.post("/register", response_model=APIResponse)
async def register_production(
    req: ProductionRegisterRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    """생산 등록 + 피드백."""
    user = get_current_user_context(request, role)
    response = await production_agent.register_production(
        store_id=req.store_id,
        product_id=req.product_id,
        quantity=req.quantity,
        alert_id=req.alert_id,
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data=response)


async def get_inventory_current_legacy(
    request: Request,
    biz_date: date | None = Query(None),
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
):
    """Legacy `/api/inventory/current` payload used by the current frontend."""

    store_id = get_request_store_id(request, None)
    try:
        inventory_rows = await sql_queries.get_store_inventory_today(
            db,
            store_id,
            biz_date,
        )
        inventory = []
        for row in inventory_rows:
            stockout_minutes = int(round(float(row.get("stockout_minutes", 0) or 0)))
            on_hand_eod = float(row.get("on_hand_eod", 0) or 0)
            sold_qty = float(row.get("sold_qty", 0) or 0)
            base_price = float(row.get("base_price", 0) or 0)
            if stockout_minutes >= 60 or on_hand_eod <= 0:
                stockout_risk = "HIGH"
            elif stockout_minutes >= 20:
                stockout_risk = "MEDIUM"
            elif bool(row.get("reorder_triggered", 0)) or on_hand_eod < 10:
                stockout_risk = "LOW"
            else:
                stockout_risk = "NONE"

            estimated_chance_loss = round(
                (stockout_minutes / sql_queries.OPERATING_MINUTES)
                * sold_qty
                * base_price,
                2,
            )
            inventory.append(
                {
                    "product_id": row["product_id"],
                    "product_name": row["product_name"],
                    "category": row["category"],
                    "on_hand_eod": on_hand_eod,
                    "sold_qty": sold_qty,
                    "waste_qty": float(row.get("waste_qty", 0) or 0),
                    "stockout_minutes": stockout_minutes,
                    "reorder_triggered": bool(row.get("reorder_triggered", 0)),
                    "base_price": base_price,
                    "estimated_chance_loss": estimated_chance_loss
                    if estimated_chance_loss > 0
                    else None,
                    "stockout_risk": stockout_risk,
                }
            )
    except Exception:
        logger.exception(
            "Failed to build legacy inventory payload for store_id=%s", store_id
        )
        inventory = []
    return APIResponse(data=inventory)
