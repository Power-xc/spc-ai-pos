"""Order management API router."""

from __future__ import annotations

from collections import OrderedDict
from datetime import UTC, date, datetime
import logging
from time import perf_counter
import re
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.db.session import is_postgres_mode
from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.dependencies import (
    get_current_user_context,
    get_current_user_role,
    get_db,
    get_notification_service,
    get_order_agent,
    get_order_service,
    get_postgres_db,
    get_request_store_id,
)
from app.schemas.common import APIResponse
from app.schemas.orders import DraftOrderRequest, DraftRiskRequest, OrderConfirmRequest
from app.tools import sql_queries

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
logger = logging.getLogger(__name__)


# ── Duplicate confirm prevention ──────────────────────────────────────
# Keeps track of recently confirmed order fingerprints to prevent
# double-click / double-submit within a short window.
_CONFIRM_CACHE: OrderedDict[str, float] = OrderedDict()
_CONFIRM_CACHE_TTL_SEC = 30.0
_CONFIRM_CACHE_MAX = 256


def _make_confirm_fingerprint(store_id: str, items: list[dict]) -> str:
    """Create a deterministic fingerprint from store_id + sorted product_ids."""
    product_ids = sorted(str(item.get("product_id", "")) for item in items)
    return f"{store_id}:{','.join(product_ids)}"


def _check_confirm_duplicate(fingerprint: str) -> bool:
    """Return True if this fingerprint was confirmed within the TTL window."""
    now = perf_counter()
    # Evict expired entries
    expired = [
        k for k, ts in _CONFIRM_CACHE.items() if now - ts > _CONFIRM_CACHE_TTL_SEC
    ]
    for k in expired:
        del _CONFIRM_CACHE[k]
    if len(_CONFIRM_CACHE) > _CONFIRM_CACHE_MAX:
        # Evict oldest
        for _ in range(len(_CONFIRM_CACHE) - _CONFIRM_CACHE_MAX + 16):
            _CONFIRM_CACHE.popitem(last=False)
    return fingerprint in _CONFIRM_CACHE


def _record_confirm(fingerprint: str) -> None:
    """Record that this fingerprint was confirmed."""
    _CONFIRM_CACHE[fingerprint] = perf_counter()


def _serialize_confirm_result(result: Any) -> dict[str, Any]:
    if hasattr(result, "id") and hasattr(result, "total_quantity"):
        confirmed_at = result.confirmed_at or result.created_at
        return {
            "order_id": str(result.id),
            "confirmed_at": confirmed_at.isoformat(),
            "status": result.status.value,
            "total_qty": int(result.total_quantity),
            "total_amount": float(result.total_amount)
            if result.total_amount is not None
            else 0.0,
            "message": "주문이 확정되었습니다."
            if result.status.value == "confirmed"
            else "발주 처리 완료",
        }

    payload = (
        result.model_dump(mode="json")
        if hasattr(result, "model_dump")
        else dict(result)
    )
    payload["status"] = payload.get("status") or (
        "confirmed" if payload.get("order_id") else "error"
    )
    if payload.get("total_amount") is None:
        payload["total_amount"] = 0.0
    return payload


def _build_recommendation_rationale(
    kpis: dict[str, Any], options_payload: dict[str, Any]
) -> dict[str, Any]:
    flags = []
    for option in options_payload.get("options", []) or []:
        flags.extend(option.get("flags") or [])
    flag_set = set(str(flag) for flag in flags)

    vs_yesterday = (kpis.get("vs_yesterday") or {}).get("sales_pct")
    vs_last_week = (kpis.get("vs_last_week_same_dow") or {}).get("sales_pct")
    stockout_count = int(kpis.get("products_with_stockout") or 0)
    waste_rate_pct = kpis.get("waste_rate_pct")

    if stockout_count > 0:
        stockout_note = f"품절/소진 위험 품목 {stockout_count}개"
    else:
        stockout_note = "품절/소진 위험 감지 없음"

    return {
        "summary": (
            f"전일 대비 {vs_yesterday:+.1f}% / 최근 기준일 대비 {vs_last_week:+.1f}%"
            if isinstance(vs_yesterday, (int, float))
            and isinstance(vs_last_week, (int, float))
            else "일부 근거 데이터만 확보되어 요약을 제한적으로 제공합니다."
        ),
        "vs_yesterday_sales_pct": vs_yesterday,
        "vs_last_week_same_dow_sales_pct": vs_last_week,
        "stockout_signal": {
            "count": stockout_count,
            "note": stockout_note,
            "status": "actual",
        },
        "waste_signal": {
            "waste_rate_pct": waste_rate_pct,
            "status": "actual" if waste_rate_pct is not None else "insufficient_data",
        },
        "weather_impact": {
            "status": "integration_pending",
            "note": "기상 데이터 연동 대기",
        },
        "event_impact": {
            "status": "actual"
            if ("CAMPAIGN_PERIOD" in flag_set or "SPECIAL_PERIOD" in flag_set)
            else "insufficient_data",
            "note": (
                "행사/특수기간 플래그 반영"
                if ("CAMPAIGN_PERIOD" in flag_set or "SPECIAL_PERIOD" in flag_set)
                else "행사 데이터 미감지"
            ),
        },
        "mutual_support_impact": {
            "status": "integration_pending",
            "note": "상생지원/보조금 데이터 연동 대기",
        },
        "time_band_impact": {
            "status": "integration_pending",
            "note": "시간대별 주문 근거 모델 준비중",
        },
    }


async def _publish_order_confirmed_event(
    *,
    notification_service,
    store_id: str,
    payload: dict[str, Any],
) -> None:
    if notification_service is None:
        return
    event_data = {
        "store_id": store_id,
        "order_id": payload.get("order_id"),
        "status": payload.get("status"),
        "confirmed_at": payload.get("confirmed_at"),
        "total_qty": payload.get("total_qty"),
        "total_amount": payload.get("total_amount"),
        "message": payload.get("message"),
    }
    try:
        await notification_service.publish(
            store_id,
            "order_confirmed",
            event_data,
        )
        await notification_service.publish(
            store_id,
            "refresh",
            {
                "scope": "orders",
                "reason": "order_confirmed",
                **event_data,
            },
        )
    except Exception:
        logger.exception(
            "Failed to publish order_confirmed SSE event: store_id=%s", store_id
        )


def _deadline_minutes_from_title(title: str) -> int:
    matched = re.search(r"(\d+)\s*분", str(title))
    if not matched:
        return 0
    try:
        return int(matched.group(1))
    except Exception:
        return 0


def _parse_demo_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=ZoneInfo("Asia/Seoul"))
    return parsed


@router.get("/{store_id}/options", response_model=APIResponse)
async def get_order_options(
    store_id: str,
    request: Request,
    category: str | None = None,
    demo_date: date | None = Query(None),
    demo_time: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
):
    """3개 주문 옵션."""
    user = get_current_user_context(request, role)
    reference_date = demo_date
    options = await order_agent.generate_order_options(
        store_id,
        category,
        reference_date=reference_date,
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data=options)


@router.get("/{store_id}/catalog", response_model=APIResponse)
async def get_order_catalog(
    store_id: str,
    db=Depends(get_postgres_db),
):
    """Full manual-orderable catalog for the given store."""
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        raise HTTPException(status_code=404, detail="Store not found")
    items = await sql_queries.get_order_catalog(db, normalized)
    return APIResponse(
        data={
            "store_id": normalized,
            "total_count": len(items),
            "items": items,
            "data_source": (
                "dunkin_mart_copy.dim_product + "
                "dunkin_mart_copy.new_dim_product_silver + "
                "dunkin_mart_copy.new_product_sales_day_gold + "
                "dunkin_mart_copy.new_inventory_risk_day_gold"
            ),
        }
    )


@router.get("/analysis/{option_id}", response_model=APIResponse)
async def analyze_option(
    option_id: str,
    store_id: str,
    request: Request,
    category: str | None = None,
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
):
    """선택 옵션 특이사항 분석."""
    store_id = normalize_store_id(store_id)
    if is_hidden_store_id(store_id):
        raise HTTPException(status_code=404, detail="Store not found")
    user = get_current_user_context(request, role)
    options_response = order_agent.get_cached_options(
        store_id=store_id, category=category
    )
    if not options_response:
        options_response = await order_agent.generate_order_options(
            store_id,
            category=category,
            user_id=user["user_id"],
            role=user["role"],
        )
    option = next(
        (item for item in options_response.options if item.option_id == option_id), None
    )
    if option is None:
        raise HTTPException(status_code=404, detail="Option not found")
    explanation = await order_agent.analyze_option(
        store_id,
        option_id,
        option.model_dump(mode="python"),
        category=category or getattr(options_response, "category", None),
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data={"option_id": option_id, "explanation": explanation})


@router.post("/draft", response_model=APIResponse)
async def create_order_draft(
    req: DraftOrderRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
):
    """주문 옵션 선택 후 draft_order 상태로 저장."""
    user = get_current_user_context(request, role)
    result = await order_agent.create_draft_order(
        store_id=req.store_id,
        option_id=req.option_id,
        items=[item.model_dump(mode="python") for item in req.items],
        category=req.category,
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data=result)


@router.post("/draft/{draft_order_id}/risk", response_model=APIResponse)
async def recalculate_order_risk(
    draft_order_id: str,
    req: DraftRiskRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
):
    """수량 수정 후 draft_order 리스크 재계산."""
    user = get_current_user_context(request, role)
    result = await order_agent.recalculate_risk(
        draft_order_id,
        items=[item.model_dump(mode="python") for item in req.items],
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data=result)


@router.post("/confirm", response_model=APIResponse)
async def confirm_order(
    req: OrderConfirmRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
    order_service=Depends(get_order_service),
    notification_service=Depends(get_notification_service),
):
    """주문 확정."""
    execute_started_at = perf_counter()
    user = get_current_user_context(request, role)
    store_id = get_request_store_id(request, req.store_id)
    items = [item.model_dump(mode="python") for item in req.items]
    if not items:
        raise HTTPException(status_code=400, detail="items is required")
    option_response = order_agent._last_generated_options.get(store_id)
    option = (
        next(
            (
                item
                for item in (option_response.options if option_response else [])
                if item.option_id == req.option_id
            ),
            None,
        )
        if req.option_id
        else None
    )
    if option is not None:
        price_map = {it.product_id: it.base_price for it in option.items}
        for it in items:
            if it.get("base_price", 0) <= 0 and it.get("product_id") in price_map:
                it["base_price"] = price_map[it.get("product_id")]
    draft_state = order_agent._draft_orders.get(req.draft_order_id or "")
    resolved_category = getattr(option_response, "category", None) or (
        draft_state or {}
    ).get("category")

    # ── Duplicate confirm prevention ──────────────────────────────────
    fingerprint = _make_confirm_fingerprint(store_id, items)
    if _check_confirm_duplicate(fingerprint):
        logger.warning(
            "order_confirm: duplicate detected, fingerprint=%s store_id=%s",
            fingerprint[:40],
            store_id,
        )
        return APIResponse(
            data={
                "order_id": None,
                "status": "duplicate",
                "message": "이미 처리된 주문안입니다. 중복 실행을 방지합니다.",
            }
        )
    _record_confirm(fingerprint)

    if is_postgres_mode():
        result = await order_service.confirm_order(
            store_id=store_id,
            items=items,
            client_draft_id=req.draft_order_id,
            client_option_id=req.option_id,
            category=resolved_category,
            created_by=user["user_id"],
            confirmed_by=user["user_id"],
            context_payload={
                "request_path": str(request.url.path),
                "mode": "postgres",
                "option_label": getattr(option, "label", None),
            },
        )
        payload = _serialize_confirm_result(result)
        await _publish_order_confirmed_event(
            notification_service=notification_service,
            store_id=store_id,
            payload=payload,
        )
        payload["trace"] = {
            "order_confirm_execute_ms": int(
                (perf_counter() - execute_started_at) * 1000
            ),
        }
        return APIResponse(data=payload)

    result = await order_agent.confirm_order(
        store_id=store_id,
        option_id=req.option_id,
        draft_order_id=req.draft_order_id,
        items=items,
        user_id=user["user_id"],
        role=user["role"],
    )
    payload = _serialize_confirm_result(result)
    await _publish_order_confirmed_event(
        notification_service=notification_service,
        store_id=store_id,
        payload=payload,
    )
    payload["trace"] = {
        "order_confirm_execute_ms": int((perf_counter() - execute_started_at) * 1000),
    }
    return APIResponse(data=payload)


@router.get("/{store_id}/campaign-impact", response_model=APIResponse)
async def get_campaign_impact(
    store_id: str,
    request: Request,
    demo_date: date | None = Query(None),
    demo_time: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    order_agent=Depends(get_order_agent),
):
    """Get campaign impact on order quantities for a store.

    Computes adjustment quantities based on campaign period sales vs baseline.
    """
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        raise HTTPException(status_code=404, detail="Store not found")

    from app.tools import sql_queries

    latest = await sql_queries.get_latest_biz_date(db, normalized)
    target_date = demo_date or (latest or date.today())

    # Get base order options items from the best option
    options_resp = order_agent.get_cached_options(store_id=normalized)
    base_items = None
    if not options_resp:
        user = get_current_user_context(request, role)
        options_resp = await order_agent.generate_order_options(
            normalized,
            user_id=user["user_id"],
            role=user["role"],
        )

    if options_resp and options_resp.options:
        best = next(
            (o for o in options_resp.options if o.option_id == "option_last_week"),
            options_resp.options[0],
        )
        base_items = [
            {"product_id": item.product_id, "quantity": item.quantity}
            for item in best.items
        ]

    # Compute impact
    from app.routers.promotions import _compute_campaign_impact

    impact = await _compute_campaign_impact(db, normalized, target_date, base_items)

    return APIResponse(data=impact)


async def get_order_recommendations_legacy(
    request: Request,
    category: str | None = None,
    biz_date: date | None = Query(None),
    demo_date: date | None = Query(None),
    demo_time: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    order_agent=Depends(get_order_agent),
):
    """Legacy `/api/order/recommendations` payload used by current frontend."""

    user = get_current_user_context(request, role)
    store_id = get_request_store_id(request, None)
    effective_reference_date = biz_date or demo_date
    options = await order_agent.generate_order_options(
        store_id=store_id,
        category=category,
        include_explanation=True,
        reference_date=effective_reference_date,
        user_id=user["user_id"],
        role=user["role"],
    )
    payload = options.model_dump(mode="json")
    kpis = await sql_queries.get_daily_kpis(db, store_id, effective_reference_date)
    payload["rationale"] = _build_recommendation_rationale(kpis, payload)
    payload["data_source"] = (
        "estimated_from_sales "
        "(dunkin_mart_copy.new_product_sales_day_gold + "
        "dunkin_mart_copy.new_campaign_day_gold + "
        "dunkin_mart_copy.dim_product + dunkin_mart_copy.new_dim_product_silver)"
    )
    payload["note"] = (
        "최근 동요일 판매·폐기·품절 실적과 최근 30일 프로모션 이력을 기준으로 추정한 주문안입니다. "
        "실제 확정 주문 이력은 주문 마감 상태와 대시보드 요약에 별도로 반영합니다."
    )
    payload["generated_at"] = datetime.now(UTC).isoformat()
    return APIResponse(data=payload)


async def get_order_deadlines_legacy(
    request: Request,
    demo_datetime: str | None = Query(None),
    role: str = Depends(get_current_user_role),
    order_agent=Depends(get_order_agent),
):
    """Legacy `/api/order/deadlines` payload used by dashboard widgets."""

    store_id = get_request_store_id(request, None)
    snapshots = await order_agent.get_deadline_snapshots(
        store_id=store_id,
        reference_datetime=_parse_demo_datetime(demo_datetime),
    )

    payload = []
    for snapshot in snapshots:
        minutes_remaining = int(snapshot.get("minutes_remaining") or 0)
        confirmed_order_count = int(snapshot.get("confirmed_order_count") or 0)
        if confirmed_order_count > 0:
            status = "confirmed"
        elif minutes_remaining < 0:
            status = "past_due"
        elif minutes_remaining <= 20:
            status = "urgent"
        elif minutes_remaining <= 60:
            status = "soon"
        else:
            status = "scheduled"
        payload.append(
            {
                "id": f"deadline-{snapshot.get('category')}",
                "product_group": snapshot.get("category") or "주문 마감 확인",
                "deadline": snapshot.get("deadline") or "",
                "minutes_remaining": minutes_remaining,
                "status": status,
                "confirmed_order_count": confirmed_order_count,
                "last_confirmed_at": snapshot.get("last_confirmed_at"),
            }
        )
    return APIResponse(data=payload)
