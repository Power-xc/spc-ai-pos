"""Analytics API router — real-data endpoints for the analytics page."""

from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request

from app.dependencies import (
    get_current_user_role,
    get_db,
    get_production_agent,
    get_postgres_db,
    get_request_store_id,
)
from app.demo_store_config import (
    DEMO_PRIMARY_STORE_ID,
    is_hidden_store_id,
    normalize_store_id,
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)


def _store_id(request: Request, fallback: str = DEMO_PRIMARY_STORE_ID) -> str:
    return get_request_store_id(request, fallback)


def _validate_store_id(store_id: str) -> str:
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")
    return normalized


# ── KPI Summary ──────────────────────────────────────────────────────
@router.get("/summary", response_model=APIResponse)
async def analytics_summary(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    biz_date: date | None = Query(default=None),
):
    """KPI 요약: 일일 매출, 전일/전주/4주 비교, 폐기율, 소진 기회손실."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    target_date = biz_date or latest_date if latest_date else date.today()

    kpis = await sql_queries.get_daily_kpis(db, sid, target_date)
    profitability = await sql_queries.get_profitability_snapshot(db, sid, target_date)

    # Merge profitability into response
    result = {
        "biz_date": kpis.get("biz_date"),
        "total_sales_amt": kpis.get("total_sales_amt", 0),
        "total_sold_qty": kpis.get("total_sold_qty", 0),
        "total_waste_qty": kpis.get("total_waste_qty", 0),
        "waste_rate_pct": kpis.get("waste_rate_pct", 0),
        "chance_loss_est": kpis.get("chance_loss_est", 0),
        "products_with_stockout": kpis.get("products_with_stockout", 0),
        "top_category": kpis.get("top_category"),
        "vs_yesterday": kpis.get("vs_yesterday", {}),
        "vs_last_week_same_dow": kpis.get("vs_last_week_same_dow", {}),
        "vs_4week_avg_same_dow": kpis.get("vs_4week_avg_same_dow", {}),
        "vs_last_month": kpis.get("vs_last_month", {}),
        "profitability": profitability,
    }
    return APIResponse(data=result)


# ── Hourly Sales ─────────────────────────────────────────────────────
@router.get("/hourly-sales", response_model=APIResponse)
async def analytics_hourly_sales(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    biz_date: date | None = Query(default=None),
):
    """시간대별 매출 추이 (추정 프로필 기반).

    NOTE: 실거래 타임스탬프가 없으므로 정적 시간대 프로필로 분배합니다.
    데이터 근거: '추정치 (정적 프로필 분배)'
    """
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    # Use latest available date in data instead of today
    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    target_date = biz_date or latest_date if latest_date else date.today()

    # Get daily total to distribute
    kpis = await sql_queries.get_daily_kpis(db, sid, target_date)
    total_sales = float(kpis.get("total_sales_amt", 0) or 0)

    # Get last week same day for comparison
    last_week = target_date - timedelta(days=7)
    kpis_lw = await sql_queries.get_daily_kpis(db, sid, last_week)
    total_sales_lw = float(kpis_lw.get("total_sales_amt", 0) or 0)

    hourly = await sql_queries.get_sales_hourly_mini_chart(db, sid)
    # hourly is [{label, value}, ...] — redistribute using actual totals
    profile = sql_queries.DEFAULT_HOURLY_PROFILE

    today_points = []
    last_week_points = []
    for hour in sorted(profile.keys()):
        pct = profile[hour]
        today_points.append(
            {
                "hour": f"{hour:02d}:00",
                "sales_estimated": round(total_sales * pct, 0),
                "pct_of_daily": round(pct * 100, 1),
            }
        )
        last_week_points.append(
            {
                "hour": f"{hour:02d}:00",
                "sales_estimated": round(total_sales_lw * pct, 0),
            }
        )

    result = {
        "biz_date": kpis.get("biz_date"),
        "last_week_date": last_week.isoformat(),
        "total_sales_today": total_sales,
        "total_sales_last_week": total_sales_lw,
        "data_source": "추정치 (정적 프로필 분배)",
        "note": "실거래 타임스탬프 연동 전까지 시간대별 매출은 추정치입니다.",
        "today": today_points,
        "last_week": last_week_points,
    }
    return APIResponse(data=result)


# ── Category Sales ───────────────────────────────────────────────────
@router.get("/category-sales", response_model=APIResponse)
async def analytics_category_sales(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    days: int = Query(default=1, ge=1, le=90),
    biz_date: date | None = Query(default=None),
):
    """카테고리별 매출 실데이터."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    end_date = biz_date or latest_date if latest_date else date.today()
    start_date = end_date - timedelta(days=days - 1)

    categories = await sql_queries.get_category_sales(db, sid, start_date, end_date)

    result = {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "days": days,
        "data_source": "실데이터 (dunkin_mart_copy.new_product_sales_day_gold)",
        "categories": categories,
    }
    return APIResponse(data=result)


# ── Delivery Channel Share ───────────────────────────────────────────
@router.get("/delivery-share", response_model=APIResponse)
async def analytics_delivery_share(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """배달 채널 점유율.

    NOTE: 현재 POS 데이터에 채널 구분 컬럼이 없어 연동 대기 상태입니다.
    """
    result = {
        "status": "integration_pending",
        "data_source": "미연동",
        "note": "배달 채널(배민/요기요/쿠팡이츠) POS 연동 후 실데이터 제공 예정입니다.",
        "channels": [],
    }
    return APIResponse(data=result)


# ── Promo Performance ────────────────────────────────────────────────
@router.get("/promo-performance", response_model=APIResponse)
async def analytics_promo_performance(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """프로모션 성과 분석.

    NOTE: fact_promo_day 테이블이 현재 비어 있습니다. 수동 입력 데이터가 있으면 표시합니다.
    """
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    promo_latest = await sql_queries._fetch_gold_one(  # type: ignore[attr-defined]
        db,
        f"""
        SELECT max(biz_date) AS biz_date
        FROM {sql_queries.GOLD_SCHEMA}.new_campaign_day_gold
        WHERE store_id = :store_id
        """,
        {"store_id": sid},
    )
    end_date = (
        promo_latest.get("biz_date")
        if promo_latest and promo_latest.get("biz_date")
        else date.today()
    )
    start_date = end_date - timedelta(days=30)

    promo_rows = await sql_queries.get_promo_analysis(
        db,
        sid,
        start_date=start_date,
        end_date=end_date,
    )

    if promo_rows:
        result = {
            "status": "active",
            "data_source": "실데이터 (dunkin_mart_copy.new_campaign_day_gold)",
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "promotions": promo_rows,
            "note": "최신 프로모션 캠페인 집계 기준입니다.",
        }
    else:
        result = {
            "status": "no_data",
            "data_source": "dunkin_mart_copy.new_campaign_day_gold",
            "note": "선택한 기간에 프로모션 실적 데이터가 없습니다.",
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "promotions": [],
        }
    return APIResponse(data=result)


# ── Payment Methods ──────────────────────────────────────────────────
@router.get("/payment-methods", response_model=APIResponse)
async def analytics_payment_methods(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    biz_date: date | None = Query(default=None),
):
    """결제 수단 분석.

    NOTE: payment mix gold table이 있으면 선택 영업일 기준으로 집계하고,
    없으면 최신 영업일 기준으로 집계합니다.
    """
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    payment_mix = await sql_queries.get_payment_method_mix(
        db,
        sid,
        start_date=biz_date,
        end_date=biz_date,
    )
    methods = payment_mix.get("methods", [])
    if methods:
        period = payment_mix.get("period") or {}
        is_selected_date = bool(
            biz_date
            and period.get("start") == biz_date.isoformat()
            and period.get("end") == biz_date.isoformat()
        )
        return APIResponse(
            data={
                "status": "active",
                "data_source": "실데이터 (dunkin_mart_copy.new_payment_mix_day_gold)",
                "note": (
                    "선택 영업일 결제수단 집계입니다. code_count는 거래 건수 기준입니다."
                    if is_selected_date
                    else "최신 영업일 결제수단 집계입니다. code_count는 거래 건수 기준입니다."
                ),
                "period": period,
                "methods": methods,
            }
        )

    return APIResponse(
        data={
            "status": "no_data",
            "data_source": "dunkin_mart_copy.new_payment_mix_day_gold",
            "note": "선택한 점포의 결제 수단 데이터가 없습니다.",
            "period": payment_mix.get("period"),
            "methods": [],
        }
    )


# ── Inventory Timeline ───────────────────────────────────────────────
@router.get("/inventory-timeline", response_model=APIResponse)
async def analytics_inventory_timeline(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    top_n: int = Query(default=10, ge=1, le=50),
    production_agent=Depends(get_production_agent),
):
    """재고/반제 시간축 데이터.

    남은 판매 가능 시간, 소진 예상 시각, 반제 시작 권장 시점,
    재고 부족/폐기 위험 선제 표시.
    """
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    today = latest_date if latest_date else date.today()

    # Use predictor-enriched risk products so depletion/recommendation fields are populated.
    risk_products = await production_agent.predictor.get_all_risk_products(db, sid)

    timeline_items = []
    for item in risk_products[:top_n]:
        product_id = str(item.get("product_id", ""))
        product_name = str(item.get("product_name", ""))
        category = str(item.get("category", ""))
        current_stock = float(item.get("current_stock", 0) or 0)
        predicted_stock_1h = float(item.get("predicted_stock_1h", 0) or 0)
        depletion_eta = item.get("depletion_eta")
        hourly_burn_rate = float(item.get("hourly_burn_rate", 0) or 0)
        stockout_probability = float(item.get("stockout_probability", 0) or 0)
        risk_level = str(item.get("risk_level", "LOW"))
        recommended_production_qty = float(
            item.get("recommended_production_qty", 0) or 0
        )
        reason = str(item.get("reason", ""))

        # Calculate estimated hours remaining
        hours_remaining = None
        if hourly_burn_rate and hourly_burn_rate > 0 and current_stock > 0:
            hours_remaining = round(current_stock / hourly_burn_rate, 1)

        # Estimate depletion time today
        depletion_time_today = None
        if hours_remaining is not None and hours_remaining < 14:
            # Business hours: 08:00 - 22:00
            depletion_hour = min(8 + hours_remaining, 22)
            depletion_time_today = (
                f"{int(depletion_hour):02d}:{int((depletion_hour % 1) * 60):02d}"
            )

        # Production recommendation time (produce 1-2 hours before depletion)
        production_recommend_time = None
        if (
            hours_remaining is not None
            and hours_remaining < 6
            and recommended_production_qty > 0
        ):
            prod_hour = max(8, depletion_hour - 1.5) if depletion_hour else None
            if prod_hour:
                production_recommend_time = (
                    f"{int(prod_hour):02d}:{int((prod_hour % 1) * 60):02d}"
                )

        timeline_items.append(
            {
                "product_id": product_id,
                "product_name": product_name,
                "category": category,
                "current_stock": current_stock,
                "predicted_stock_1h": predicted_stock_1h,
                "hourly_burn_rate": hourly_burn_rate,
                "hours_remaining": hours_remaining,
                "depletion_time_today": depletion_time_today,
                "production_recommend_time": production_recommend_time,
                "recommended_production_qty": recommended_production_qty,
                "stockout_probability": stockout_probability,
                "risk_level": risk_level,
                "depletion_eta": depletion_eta,
                "reason": reason,
            }
        )

    # Sort: HIGH risk first, then by hours_remaining ascending (None last)
    def sort_key(x):
        risk_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        return (
            risk_order.get(x.get("risk_level", "LOW"), 2),
            x.get("hours_remaining") or 9999,
        )

    timeline_items.sort(key=sort_key)

    result = {
        "biz_date": today.isoformat(),
        "data_source": "실데이터 (dunkin_mart_copy.new_inventory_risk_day_gold + new_product_sales_day_gold + new_production)",
        "note": "hours_remaining은 시간당 소진율 기반 추정치입니다. 반제 시작 권장은 소진 1~2시간 전 기준입니다.",
        "items": timeline_items,
        "total_items": len(timeline_items),
        "high_risk_count": sum(1 for i in timeline_items if i["risk_level"] == "HIGH"),
        "medium_risk_count": sum(
            1 for i in timeline_items if i["risk_level"] == "MEDIUM"
        ),
    }
    return APIResponse(data=result)


# ── Promotion P&L Simulator ─────────────────────────────────────────
@router.post("/promo-simulator", response_model=APIResponse)
async def analytics_promo_simulator(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    body: dict | None = None,
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """프로모션 손익 시뮬레이터.

    입력: 매출증가분, 지원금, 수수료율, 인건비, 프로모션 비용
    출력: 최종 순이익 델타, 참여/보류/비참여 시나리오
    """
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))
    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    today = latest_date if latest_date else date.today()
    params = body or {}

    # Get current day's baseline sales for reference
    kpis = await sql_queries.get_daily_kpis(db, sid, today)
    baseline_sales = float(kpis.get("total_sales_amt", 0) or 0)

    # Simulation inputs (with defaults)
    sales_lift_pct = float(params.get("sales_lift_pct", 15))
    promo_support_amt = float(params.get("promo_support_amt", 0))
    commission_pct = float(params.get("commission_pct", 5))
    labor_cost_amt = float(params.get("labor_cost_amt", 0))
    promo_cost_amt = float(params.get("promo_cost_amt", 0))

    # Calculate scenarios
    projected_sales_increase = baseline_sales * (sales_lift_pct / 100)
    projected_gross_margin = projected_sales_increase * 0.55  # estimated 55% margin
    commission_cost = projected_sales_increase * (commission_pct / 100)
    net_delta = (
        projected_gross_margin
        + promo_support_amt
        - commission_cost
        - labor_cost_amt
        - promo_cost_amt
    )

    # Decision thresholds
    participate = net_delta > 0
    hold = not participate and net_delta > -abs(projected_sales_increase * 0.1)

    result = {
        "baseline_sales": baseline_sales,
        "baseline_source": "실데이터" if baseline_sales > 0 else "데이터 없음",
        "assumptions": {
            "sales_lift_pct": sales_lift_pct,
            "estimated_margin_rate": 0.55,
            "margin_rate_source": "추정치 (업종 평균)",
            "promo_support_amt": promo_support_amt,
            "commission_pct": commission_pct,
            "labor_cost_amt": labor_cost_amt,
            "promo_cost_amt": promo_cost_amt,
        },
        "calculation": {
            "projected_sales_increase": round(projected_sales_increase, 0),
            "projected_gross_margin": round(projected_gross_margin, 0),
            "commission_cost": round(commission_cost, 0),
            "promo_support_amt": promo_support_amt,
            "labor_cost_amt": labor_cost_amt,
            "promo_cost_amt": promo_cost_amt,
            "net_profit_delta": round(net_delta, 0),
        },
        "scenarios": {
            "participate": {
                "label": "참여",
                "recommended": participate,
                "net_delta": round(net_delta, 0),
                "roi_pct": round(
                    (net_delta / max(promo_cost_amt + labor_cost_amt, 1)) * 100, 1
                ),
            },
            "hold": {
                "label": "보류",
                "recommended": hold and not participate,
                "net_delta": round(net_delta, 0),
                "note": "비용 대비 효과가 불확실합니다. 추가 데이터 수집 후 재검토하세요.",
            },
            "skip": {
                "label": "비참여",
                "recommended": not participate and not hold,
                "net_delta": 0,
                "note": "비용이 예상 수익을 상회합니다.",
            },
        },
        "confidence_labels": {
            "baseline_sales": "실데이터" if baseline_sales > 0 else "미확정",
            "margin_rate": "추정치",
            "sales_lift": "추정치 (입력값)",
            "other_costs": "추정치 (입력값)",
        },
    }
    return APIResponse(data=result)


# ── Monthly Sales Comparison ──────────────────────────────────────────
@router.get("/monthly-sales", response_model=APIResponse)
async def analytics_monthly_sales(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    months: int = Query(default=6, ge=1, le=24),
):
    """월간 매출 비교 (최근 N개월)."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT TO_CHAR(biz_date, 'YYYY-MM') AS month,
               SUM(total_sales) AS total_sales,
               SUM(total_qty) AS total_qty
        FROM {sql_queries.GOLD_SCHEMA}.new_kpi_store_day_gold
        WHERE store_id = :sid
        GROUP BY TO_CHAR(biz_date, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT :limit
        """,
        {"sid": sid, "limit": months},
    )
    monthly = []
    for r in rows:
        monthly.append(
            {
                "month": r["month"],
                "total_sales": float(r["total_sales"] or 0),
                "total_qty": int(r["total_qty"] or 0),
            }
        )
    monthly.reverse()
    return APIResponse(
        data={
            "store_id": sid,
            "months": monthly,
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_kpi_store_day_gold",
        }
    )


# ── Delivery Channel Comparison ───────────────────────────────────────
@router.get("/delivery-comparison", response_model=APIResponse)
async def analytics_delivery_comparison(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    days: int = Query(default=30, ge=1, le=365),
):
    """배달 채널별 매출/건수 비교."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    latest_row = await sql_queries._fetch_gold_one(
        db,
        f"""
        SELECT MAX(sale_dt) AS latest_dt
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
        """,
        {"sid": sid},
    )
    latest_dt = (latest_row or {}).get("latest_dt") if latest_row else date.today()
    if not isinstance(latest_dt, date):
        latest_dt = date.today()
    start_dt = latest_dt - timedelta(days=days)

    rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT ho_chnl_nm,
               SUM(sale_amt) AS total_sales,
               SUM(ord_cnt) AS total_orders
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND sale_dt >= :start_dt
        GROUP BY ho_chnl_nm
        ORDER BY total_sales DESC
        """,
        {"sid": sid, "start_dt": start_dt},
    )
    channels = []
    total_sales = 0
    for r in rows:
        s = float(r["total_sales"] or 0)
        total_sales += s
        channels.append(
            {
                "channel_name": r["ho_chnl_nm"] or "기타",
                "total_sales": s,
                "total_orders": int(r["total_orders"] or 0),
            }
        )
    for c in channels:
        c["share_pct"] = round(
            (c["total_sales"] / total_sales * 100) if total_sales > 0 else 0, 1
        )
    return APIResponse(
        data={
            "store_id": sid,
            "days": days,
            "latest_date": latest_dt.isoformat() if latest_dt else None,
            "channels": channels,
            "total_sales": total_sales,
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_sales_channel_daily",
        }
    )


# ── Product Monthly Comparison ─────────────────────────────────────────
@router.get("/product-comparison", response_model=APIResponse)
async def analytics_product_comparison(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
    product_name: str = Query(default="글레이즈드"),
    months: int = Query(default=3, ge=1, le=12),
):
    """특정 상품의 전월 대비 매출 비교."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT TO_CHAR(biz_date, 'YYYY-MM') AS month,
               SUM(sold_qty) AS total_qty,
               SUM(sale_amt) AS total_sales
        FROM {sql_queries.GOLD_SCHEMA}.new_product_sales_day_gold
        WHERE store_id = :sid
          AND product_name ILIKE '%' || :pname || '%'
        GROUP BY TO_CHAR(biz_date, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT :limit
        """,
        {"sid": sid, "pname": product_name, "limit": months},
    )
    monthly = []
    for r in rows:
        monthly.append(
            {
                "month": r["month"],
                "total_qty": int(r["total_qty"] or 0),
                "total_sales": float(r["total_sales"] or 0),
            }
        )
    monthly.reverse()
    return APIResponse(
        data={
            "store_id": sid,
            "product_name": product_name,
            "months": monthly,
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_product_sales_day_gold",
        }
    )


# ── Store Average Comparison ──────────────────────────────────────────
@router.get("/store-avg-comparison", response_model=APIResponse)
async def analytics_store_avg_comparison(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """기준 점포 vs 타 점포 평균 일매출 비교 (최근 30일)."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    if not latest_date:
        latest_date = date.today()
    start_date = latest_date - timedelta(days=29)

    rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT store_id,
               AVG(daily_sales) AS avg_daily_sales,
               SUM(monthly_sales) AS total_monthly_sales
        FROM (
            SELECT store_id,
                   SUM(total_sales) AS daily_sales,
                   SUM(total_sales) AS monthly_sales
            FROM {sql_queries.GOLD_SCHEMA}.new_kpi_store_day_gold
            WHERE biz_date >= :start_date
            GROUP BY store_id, biz_date
        ) daily
        GROUP BY store_id
        ORDER BY avg_daily_sales DESC
        """,
        {"start_date": start_date},
    )
    our_data = None
    all_stores = []
    for r in rows:
        entry = {
            "store_id": r["store_id"],
            "avg_daily_sales": float(r["avg_daily_sales"] or 0),
            "total_monthly_sales": float(r["total_monthly_sales"] or 0),
        }
        all_stores.append(entry)
        if r["store_id"] == sid:
            our_data = entry
    avg_daily = (
        sum(s["avg_daily_sales"] for s in all_stores) / len(all_stores)
        if all_stores
        else 0
    )
    return APIResponse(
        data={
            "store_id": sid,
            "latest_date": latest_date.isoformat(),
            "period_start": start_date.isoformat(),
            "our_avg_daily": our_data["avg_daily_sales"] if our_data else 0,
            "all_stores_avg_daily": round(avg_daily, 0),
            "diff_pct": round(
                ((our_data["avg_daily_sales"] / avg_daily - 1) * 100)
                if our_data and avg_daily > 0
                else 0,
                1,
            ),
            "total_stores": len(all_stores),
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_kpi_store_day_gold",
        }
    )


# ── Promo Performance Detail ──────────────────────────────────────────
@router.get("/promo-performance-detail", response_model=APIResponse)
async def analytics_promo_performance_detail(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """프로모션 실적 상세 분석 (반응/매출/시간대/점포비교)."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    # 1. Promotion response & sales (all stores)
    promo_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT store_id, campaign_id, campaign_name,
               SUM(bill_cnt) AS bill_cnt, SUM(sales_amt) AS sales_amt
        FROM {sql_queries.GOLD_SCHEMA}.new_campaign_day_gold
        GROUP BY store_id, campaign_id, campaign_name
        ORDER BY SUM(bill_cnt) DESC
        """,
        {},
    )
    promo_by_id = {}
    for r in promo_rows:
        cid = r["campaign_id"] or r["campaign_name"] or "unknown"
        if cid not in promo_by_id:
            promo_by_id[cid] = {
                "campaign_id": cid,
                "campaign_name": r["campaign_name"] or cid,
                "stores": [],
            }
        promo_by_id[cid]["stores"].append(
            {
                "store_id": r["store_id"],
                "bill_cnt": int(r["bill_cnt"] or 0),
                "sales_amt": float(r["sales_amt"] or 0),
            }
        )

    # 2. Hourly data from new_sales_campaign_hourly
    hourly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT masked_stor_cd, cpi_cd, cpi_nm, bill_cnt,
               qty_00, qty_01, qty_02, qty_03, qty_04, qty_05, qty_06, qty_07,
               qty_08, qty_09, qty_10, qty_11, qty_12, qty_13, qty_14, qty_15,
               qty_16, qty_17, qty_18, qty_19, qty_20, qty_21, qty_22, qty_23,
               act_amt_00, act_amt_01, act_amt_02, act_amt_03, act_amt_04, act_amt_05, act_amt_06, act_amt_07,
               act_amt_08, act_amt_09, act_amt_10, act_amt_11, act_amt_12, act_amt_13, act_amt_14, act_amt_15,
               act_amt_16, act_amt_17, act_amt_18, act_amt_19, act_amt_20, act_amt_21, act_amt_22, act_amt_23
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_campaign_hourly
        ORDER BY bill_cnt DESC
        """,
        {},
    )
    hourly_by_promo = {}
    for r in hourly_rows:
        key = r["cpi_cd"] or r["cpi_nm"] or "unknown"
        if key not in hourly_by_promo:
            qty_fields = [f"qty_{str(i).zfill(2)}" for i in range(24)]
            amt_fields = [f"act_amt_{str(i).zfill(2)}" for i in range(24)]
            hourly_by_promo[key] = {
                "cpi_cd": r["cpi_cd"],
                "cpi_nm": r["cpi_nm"],
                "total_bill_cnt": int(r["bill_cnt"] or 0),
                "stores": [],
            }
        qty_fields = [f"qty_{str(i).zfill(2)}" for i in range(24)]
        amt_fields = [f"act_amt_{str(i).zfill(2)}" for i in range(24)]
        hourly_by_promo[key]["stores"].append(
            {
                "store_id": r["masked_stor_cd"],
                "hourly_qty": [int(r.get(f, 0) or 0) for f in qty_fields],
                "hourly_amt": [float(r.get(f, 0) or 0) for f in amt_fields],
            }
        )

    # 3. Store comparison for top promo
    top_promo_id = list(promo_by_id.keys())[0] if promo_by_id else None
    store_comparison = []
    if top_promo_id:
        store_comparison = promo_by_id[top_promo_id]["stores"]

    # 4. Aggregate response/sales
    all_promos = []
    for cid, data in promo_by_id.items():
        total_bills = sum(s["bill_cnt"] for s in data["stores"])
        total_sales = sum(s["sales_amt"] for s in data["stores"])
        all_promos.append(
            {
                "campaign_id": cid,
                "campaign_name": data["campaign_name"],
                "total_bill_cnt": total_bills,
                "total_sales_amt": total_sales,
                "store_count": len(data["stores"]),
            }
        )
    all_promos.sort(key=lambda x: x["total_bill_cnt"], reverse=True)

    return APIResponse(
        data={
            "store_id": sid,
            "promotions": all_promos[:20],
            "hourly": hourly_by_promo,
            "store_comparison": {
                "top_promo_id": top_promo_id,
                "top_promo_name": promo_by_id.get(top_promo_id, {}).get(
                    "campaign_name", ""
                ),
                "stores": store_comparison,
            }
            if top_promo_id
            else None,
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_campaign_day_gold + new_sales_campaign_hourly",
        }
    )


# ── Delivery Count Comparison (weekly / monthly) ──────────────────────
@router.get("/delivery-count-comparison", response_model=APIResponse)
async def analytics_delivery_count_comparison(
    request: Request,
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    store_id: str = Query(default=DEMO_PRIMARY_STORE_ID),
):
    """전주 대비 / 전월 대비 배달 건수 비교."""
    from app.tools import sql_queries

    sid = _validate_store_id(store_id or _store_id(request))

    latest_row = await sql_queries._fetch_gold_one(
        db,
        f"""
        SELECT MAX(sale_dt) AS latest_dt
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
        """,
        {"sid": sid},
    )
    latest_dt = (latest_row or {}).get("latest_dt") if latest_row else date.today()
    if not isinstance(latest_dt, date):
        latest_dt = date.today()
    this_week_start = latest_dt - timedelta(days=6)
    last_week_start = latest_dt - timedelta(days=13)
    last_week_end = this_week_start - timedelta(days=1)

    weekly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          CASE
            WHEN sale_dt >= :this_week_start THEN 'this_week'
            WHEN sale_dt >= :last_week_start AND sale_dt <= :last_week_end THEN 'last_week'
          END AS period,
          SUM(ord_cnt) AS total_orders
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
          AND sale_dt >= :last_week_start
        GROUP BY period
        """,
        {
            "sid": sid,
            "this_week_start": this_week_start,
            "last_week_start": last_week_start,
            "last_week_end": last_week_end,
        },
    )
    this_week_orders = 0
    last_week_orders = 0
    for r in weekly_rows:
        if r.get("period") == "this_week":
            this_week_orders = int(r["total_orders"] or 0)
        elif r.get("period") == "last_week":
            last_week_orders = int(r["total_orders"] or 0)
    weekly_diff_pct = round(
        ((this_week_orders / last_week_orders) - 1) * 100
        if last_week_orders > 0
        else 0,
        1,
    )

    monthly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          TO_CHAR(sale_dt, 'YYYY-MM') AS month,
          SUM(ord_cnt) AS total_orders,
          SUM(sale_amt) AS total_sales
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
        GROUP BY TO_CHAR(sale_dt, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 2
        """,
        {"sid": sid},
    )
    monthly_data = []
    for r in monthly_rows:
        monthly_data.append(
            {
                "month": r["month"],
                "total_orders": int(r["total_orders"] or 0),
                "total_sales": float(r["total_sales"] or 0),
            }
        )
    this_month = (
        monthly_data[0]
        if len(monthly_data) > 0
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    last_month = (
        monthly_data[1]
        if len(monthly_data) > 1
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    monthly_diff_pct = round(
        ((this_month["total_orders"] / last_month["total_orders"]) - 1) * 100
        if last_month["total_orders"] > 0
        else 0,
        1,
    )

    return APIResponse(
        data={
            "store_id": sid,
            "latest_date": latest_dt.isoformat() if latest_dt else None,
            "weekly": {
                "this_week_orders": this_week_orders,
                "last_week_orders": last_week_orders,
                "diff_pct": weekly_diff_pct,
            },
            "monthly": {
                "this_month": this_month,
                "last_month": last_month,
                "diff_pct": monthly_diff_pct,
            },
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_sales_channel_daily",
        }
    )
    latest_dt = (latest_row or {}).get("latest_dt") if latest_row else None

    weekly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          CASE
            WHEN sale_dt >= CAST(:latest_dt AS date) - INTERVAL '6 days' THEN 'this_week'
            WHEN sale_dt >= CAST(:latest_dt AS date) - INTERVAL '13 days'
                 AND sale_dt < CAST(:latest_dt AS date) - INTERVAL '6 days' THEN 'last_week'
          END AS period,
          SUM(ord_cnt) AS total_orders
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
          AND sale_dt >= CAST(:latest_dt AS date) - INTERVAL '13 days'
        GROUP BY period
        """,
        {"sid": sid, "latest_dt": str(latest_dt)},
    )
    this_week_orders = 0
    last_week_orders = 0
    for r in weekly_rows:
        if r.get("period") == "this_week":
            this_week_orders = int(r["total_orders"] or 0)
        elif r.get("period") == "last_week":
            last_week_orders = int(r["total_orders"] or 0)
    weekly_diff_pct = round(
        ((this_week_orders / last_week_orders) - 1) * 100
        if last_week_orders > 0
        else 0,
        1,
    )

    monthly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          TO_CHAR(sale_dt, 'YYYY-MM') AS month,
          SUM(ord_cnt) AS total_orders,
          SUM(sale_amt) AS total_sales
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
        GROUP BY TO_CHAR(sale_dt, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 2
        """,
        {"sid": sid},
    )
    monthly_data = []
    for r in monthly_rows:
        monthly_data.append(
            {
                "month": r["month"],
                "total_orders": int(r["total_orders"] or 0),
                "total_sales": float(r["total_sales"] or 0),
            }
        )
    this_month = (
        monthly_data[0]
        if len(monthly_data) > 0
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    last_month = (
        monthly_data[1]
        if len(monthly_data) > 1
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    monthly_diff_pct = round(
        ((this_month["total_orders"] / last_month["total_orders"]) - 1) * 100
        if last_month["total_orders"] > 0
        else 0,
        1,
    )

    return APIResponse(
        data={
            "store_id": sid,
            "latest_date": str(latest_dt) if latest_dt else None,
            "weekly": {
                "this_week_orders": this_week_orders,
                "last_week_orders": last_week_orders,
                "diff_pct": weekly_diff_pct,
            },
            "monthly": {
                "this_month": this_month,
                "last_month": last_month,
                "diff_pct": monthly_diff_pct,
            },
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_sales_channel_daily",
        }
    )
    latest_dt = (latest_row or {}).get("latest_dt") or "2026-03-10"

    weekly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          CASE
            WHEN sale_dt::text >= (CAST(:latest_dt AS date) - INTERVAL '6 days')::text THEN 'this_week'
            WHEN sale_dt::text >= (CAST(:latest_dt AS date) - INTERVAL '13 days')::text
                 AND sale_dt::text < (CAST(:latest_dt AS date) - INTERVAL '6 days')::text THEN 'last_week'
          END AS period,
          SUM(ord_cnt) AS total_orders
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
          AND sale_dt::text >= (CAST(:latest_dt AS date) - INTERVAL '13 days')::text
        GROUP BY period
        """,
        {"sid": sid, "latest_dt": latest_dt},
    )
    this_week_orders = 0
    last_week_orders = 0
    for r in weekly_rows:
        if r.get("period") == "this_week":
            this_week_orders = int(r["total_orders"] or 0)
        elif r.get("period") == "last_week":
            last_week_orders = int(r["total_orders"] or 0)
    weekly_diff_pct = round(
        ((this_week_orders / last_week_orders) - 1) * 100
        if last_week_orders > 0
        else 0,
        1,
    )

    monthly_rows = await sql_queries._fetch_gold_all(
        db,
        f"""
        SELECT
          SUBSTRING(sale_dt::text, 1, 7) AS month,
          SUM(ord_cnt) AS total_orders,
          SUM(sale_amt) AS total_sales
        FROM {sql_queries.GOLD_SCHEMA}.new_sales_channel_daily
        WHERE masked_stor_cd = :sid
          AND ho_chnl_nm != 'POS'
        GROUP BY SUBSTRING(sale_dt::text, 1, 7)
        ORDER BY month DESC
        LIMIT 2
        """,
        {"sid": sid},
    )
    monthly_data = []
    for r in monthly_rows:
        monthly_data.append(
            {
                "month": r["month"],
                "total_orders": int(r["total_orders"] or 0),
                "total_sales": float(r["total_sales"] or 0),
            }
        )
    this_month = (
        monthly_data[0]
        if len(monthly_data) > 0
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    last_month = (
        monthly_data[1]
        if len(monthly_data) > 1
        else {"month": None, "total_orders": 0, "total_sales": 0}
    )
    monthly_diff_pct = round(
        ((this_month["total_orders"] / last_month["total_orders"]) - 1) * 100
        if last_month["total_orders"] > 0
        else 0,
        1,
    )

    return APIResponse(
        data={
            "store_id": sid,
            "latest_date": latest_dt,
            "weekly": {
                "this_week_orders": this_week_orders,
                "last_week_orders": last_week_orders,
                "diff_pct": weekly_diff_pct,
            },
            "monthly": {
                "this_month": this_month,
                "last_month": last_month,
                "diff_pct": monthly_diff_pct,
            },
            "data_source": f"{sql_queries.GOLD_SCHEMA}.new_sales_channel_daily",
        }
    )
