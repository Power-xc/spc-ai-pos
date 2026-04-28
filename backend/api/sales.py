"""Sales analysis APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request

from core.schemas import APIEnvelope
from security.rbac import get_current_user

router = APIRouter()


async def _query_gold_view(request: Request, query: str, params: dict[str, Any] | None = None) -> list[dict]:
    """Execute SELECT query against dunkin_mart_copy Gold Views."""
    db = request.app.state.db
    async with db.connection() as conn:
        result = await conn.fetch(query, **(params or {}))
        return [dict(row) for row in result]


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


@router.get("/v1/analytics/monthly-compare", response_model=APIEnvelope)
async def monthly_compare(
    store_id: str = "POC_010",
    current_month: str = "2026-02",
    compare_month: str = "2025-02",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """월별 매출 비교 (질문 1)."""
    store_id = user.store_id

    current_start = f"{current_month}-01"
    compare_start = f"{compare_month}-01"

    query = """
        SELECT
            SUM(CASE WHEN biz_date >= $1 THEN sales_amt END) as current_total,
            SUM(CASE WHEN biz_date < $1 AND biz_date >= $2 THEN sales_amt END) as compare_total,
            COUNT(DISTINCT CASE WHEN biz_date >= $1 THEN biz_date END) as current_days,
            COUNT(DISTINCT CASE WHEN biz_date < $1 AND biz_date >= $2 THEN biz_date END) as compare_days
        FROM dunkin_mart_copy.gold__sales_channel_day
        WHERE store_id = $3
          AND biz_date >= $2
    """

    rows = await _query_gold_view(request, query, {"current_start": current_start, "compare_start": compare_start, "store_id": store_id})
    row = rows[0] if rows else {}

    current_total = float(row.get("current_total") or 0)
    compare_total = float(row.get("compare_total") or 0)
    current_days = int(row.get("current_days") or 0)
    compare_days = int(row.get("compare_days") or 0)

    current_daily = current_total / current_days if current_days > 0 else 0
    compare_daily = compare_total / compare_days if compare_days > 0 else 0
    daily_change_pct = ((current_daily - compare_daily) / compare_daily * 100) if compare_daily > 0 else 0

    action = "전년 동월 대비 매출이 크게 증가했습니다. 성공 요인을 분석하여 지속하세요." if daily_change_pct > 10 else "전년 동월 대비 매출이 감소했습니다. 프로모션 또는 진열 개선을 고려해보세요." if daily_change_pct < -10 else "전년 동월과 유사한 흐름입니다. 현재 전략을 유지하세요."

    return APIEnvelope(
        data={
            "current_month": current_month,
            "compare_month": compare_month,
            "current_total_sales": round(current_total, 2),
            "compare_total_sales": round(compare_total, 2),
            "current_business_days": current_days,
            "compare_business_days": compare_days,
            "current_daily_avg": round(current_daily, 2),
            "compare_daily_avg": round(compare_daily, 2),
            "daily_change_pct": round(daily_change_pct, 2),
            "action": action,
            "data_source": "dunkin_mart_copy.gold__sales_channel_day",
        }
    )


@router.get("/v1/analytics/delivery-orders", response_model=APIEnvelope)
async def delivery_orders(
    store_id: str = "POC_010",
    period: str = "month",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """배달 건수 비교 (질문 2)."""
    store_id = user.store_id
    now = datetime.now()
    current_start = now.replace(day=1).strftime("%Y-%m-%d")
    compare_start = (now - __import__("datetime").timedelta(days=30)).replace(day=1).strftime("%Y-%m-%d")
    current_end = now.strftime("%Y-%m-%d")

    query = """
        SELECT
            SUM(CASE WHEN biz_date >= $1 THEN ord_cnt END) as current_orders,
            SUM(CASE WHEN biz_date < $1 AND biz_date >= $2 THEN ord_cnt END) as compare_orders,
            SUM(CASE WHEN biz_date >= $1 THEN sales_amt END) as current_sales,
            SUM(CASE WHEN biz_date < $1 AND biz_date >= $2 THEN sales_amt END) as compare_sales
        FROM dunkin_mart_copy.gold__sales_channel_day
        WHERE store_id = $3
          AND channel_div = '온라인-배달'
          AND biz_date >= $2
    """

    rows = await _query_gold_view(request, query, {"current_start": current_start, "compare_start": compare_start, "store_id": store_id})
    row = rows[0] if rows else {}

    current_orders = float(row.get("current_orders") or 0)
    compare_orders = float(row.get("compare_orders") or 0)
    current_sales = float(row.get("current_sales") or 0)
    compare_sales = float(row.get("compare_sales") or 0)

    order_change_pct = ((current_orders - compare_orders) / compare_orders * 100) if compare_orders > 0 else 0

    action = "배달 건수가 크게 증가했습니다. 배달 인력 또는 포장 용품 재고를 확인하세요." if order_change_pct > 20 else "배달 건수가 감소했습니다. 배달 앱 프로모션을 검토해보세요." if order_change_pct < -20 else "배달 건수가 안정적입니다."

    return APIEnvelope(
        data={
            "period": period,
            "current_delivery_orders": round(current_orders, 0),
            "compare_delivery_orders": round(compare_orders, 0),
            "current_delivery_sales": round(current_sales, 2),
            "compare_delivery_sales": round(compare_sales, 2),
            "order_change_pct": round(order_change_pct, 2),
            "action": action,
            "data_source": "dunkin_mart_copy.gold__sales_channel_day",
        }
    )


@router.get("/v1/analytics/campaign-effect", response_model=APIEnvelope)
async def campaign_effect(
    store_id: str = "POC_010",
    campaign_keyword: str = "티데이",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """프로모션 효과 분석 (질문 3)."""
    store_id = user.store_id

    query = """
        SELECT
            campaign_id,
            campaign_name,
            SUM(lift_est) as total_lift,
            SUM(redemption_cnt) as total_redemptions,
            COUNT(DISTINCT biz_date) as active_days
        FROM dunkin_mart_copy.gold__campaign_hourly
        WHERE store_id = $1
          AND (campaign_name ILIKE $2 OR campaign_name ILIKE $3 OR campaign_name ILIKE $4 OR campaign_name ILIKE $5)
        GROUP BY campaign_id, campaign_name
        ORDER BY total_redemptions DESC
    """

    keywords = [
        f"%{campaign_keyword}%",
        "%T day%",
        "%T-Day%",
        "%D-DAY%",
        "%티데이%",
    ]
    params = [store_id] + keywords

    rows = await _query_gold_view(request, query, {"store_id": store_id, "k1": keywords[0], "k2": keywords[1], "k3": keywords[2], "k4": keywords[3]})

    if not rows:
        return APIEnvelope(
            data={
                "campaigns_found": 0,
                "message": "매칭된 티데이 캠페인이 없습니다. campaign_name 매핑 확인 필요.",
                "action": "기존 프로모션 데이터를 확인하거나 캠페인명 매핑을 업데이트하세요.",
                "data_source": "dunkin_mart_copy.gold__campaign_hourly",
            }
        )

    total_redemptions = sum(r["total_redemptions"] for r in rows)
    total_lift = sum(r["total_lift"] for r in rows)

    action = f"티데이 관련 캠페인 {len(rows)}개 확인됨. 참여 건수 {total_redemptions} 건으로 반응이 좋습니다. 성공 요인을 분석하세요." if total_redemptions > 100 else "티데이 캠페인 참여가 낮습니다. 프로모션 강화를 고려해보세요."

    return APIEnvelope(
        data={
            "campaigns": rows,
            "total_campaigns": len(rows),
            "total_redemptions": round(total_redemptions, 0),
            "total_lift": round(total_lift, 2),
            "action": action,
            "data_source": "dunkin_mart_copy.gold__campaign_hourly",
        }
    )


@router.get("/v1/analytics/product-compare", response_model=APIEnvelope)
async def product_compare(
    store_id: str = "POC_010",
    product_keyword: str = "글레이즈드",
    current_month: str = "2026-02",
    compare_month: str = "2026-01",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """상품별 전월 대비 분석 (질문 4)."""
    store_id = user.store_id

    current_start = f"{current_month}-01"
    current_end = f"{current_month}-28"
    compare_start = f"{compare_month}-01"
    compare_end = f"{compare_month}-28"

    query = """
        SELECT
            product_name,
            SUM(CASE WHEN biz_date >= $1 AND biz_date <= $2 THEN sold_qty END) as current_qty,
            SUM(CASE WHEN biz_date >= $3 AND biz_date <= $4 THEN sold_qty END) as compare_qty,
            SUM(CASE WHEN biz_date >= $1 AND biz_date <= $2 THEN sold_qty END) * (
                SELECT AVG(base_price) FROM dunkin_mart_copy.dim_product WHERE product_id = dunkin_mart_copy.gold__product_sales_day.product_id
            ) as current_sales,
            SUM(CASE WHEN biz_date >= $3 AND biz_date <= $4 THEN sold_qty END) * (
                SELECT AVG(base_price) FROM dunkin_mart_copy.dim_product WHERE product_id = dunkin_mart_copy.gold__product_sales_day.product_id
            ) as compare_sales
        FROM dunkin_mart_copy.gold__product_sales_day
        WHERE store_id = $5
          AND product_name ILIKE $6
          AND biz_date >= $3
        GROUP BY product_name
        ORDER BY current_qty DESC
    """

    rows = await _query_gold_view(
        request, query, {
            "current_start": current_start,
            "current_end": current_end,
            "compare_start": compare_start,
            "compare_end": compare_end,
            "store_id": store_id,
            "keyword": f"%{product_keyword}%",
        }
    )

    if not rows:
        return APIEnvelope(
            data={
                "products_found": 0,
                "message": f"'{product_keyword}' 관련 상품이 없습니다.",
                "data_source": "dunkin_mart_copy.gold__product_sales_day",
            }
        )

    for row in rows:
        current_qty = float(row.get("current_qty") or 0)
        compare_qty = float(row.get("compare_qty") or 0)
        row["qty_change_pct"] = round(((current_qty - compare_qty) / compare_qty * 100) if compare_qty > 0 else 0, 2)

    action = f"'{product_keyword}' 상품군 판매량이 전월 대비 변동되었습니다. 재고 및 생산 계획을 조정하세요."

    return APIEnvelope(
        data={
            "products": rows,
            "current_month": current_month,
            "compare_month": compare_month,
            "action": action,
            "data_source": "dunkin_mart_copy.gold__product_sales_day",
        }
    )


@router.get("/v1/analytics/channel-sales", response_model=APIEnvelope)
async def channel_sales(
    store_id: str = "POC_010",
    month: str = "2026-02",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """채널별 매출 분석 (질문 5)."""
    store_id = user.store_id

    month_start = f"{month}-01"
    month_end = f"{month}-28"

    query = """
        SELECT
            channel_name,
            SUM(sales_amt) as channel_sales,
            SUM(ord_cnt) as channel_orders,
            AVG(sales_ratio_pct) as avg_sales_ratio
        FROM dunkin_mart_copy.gold__sales_channel_day
        WHERE store_id = $1
          AND biz_date >= $2
          AND biz_date <= $3
          AND channel_div = '온라인-배달'
        GROUP BY channel_name
        ORDER BY channel_sales DESC
    """

    rows = await _query_gold_view(request, query, {"store_id": store_id, "month_start": month_start, "month_end": month_end})

    total_delivery_sales = sum(r["channel_sales"] for r in rows) if rows else 0

    action = "배달 채널 매출이 안정적입니다. 주요 채널에 집중하여 프로모션을 강화하세요."

    return APIEnvelope(
        data={
            "month": month,
            "channels": rows,
            "total_delivery_sales": round(total_delivery_sales, 2),
            "action": action,
            "data_source": "dunkin_mart_copy.gold__sales_channel_day",
        }
    )


@router.get("/v1/analytics/peer-compare", response_model=APIEnvelope)
async def peer_compare(
    store_id: str = "POC_010",
    month: str = "2026-02",
    request: Request = None,  # type: ignore[assignment]
    user=Depends(get_current_user),
):
    """타점포 비교 (질문 6)."""
    store_id = user.store_id

    month_start = f"{month}-01"
    month_end = f"{month}-28"

    query = """
        SELECT
            AVG(total_sales) as store_avg_sales,
            AVG(peer_avg_sales) as peer_avg_sales,
            AVG(vs_peer_sales_delta_pct) as avg_vs_peer_delta,
            COUNT(DISTINCT biz_date) as business_days
        FROM dunkin_mart_copy.gold__store_peer_day
        WHERE store_id = $1
          AND biz_date >= $2
          AND biz_date <= $3
    """

    rows = await _query_gold_view(request, query, {"store_id": store_id, "month_start": month_start, "month_end": month_end})
    row = rows[0] if rows else {}

    store_avg = float(row.get("store_avg_sales") or 0)
    peer_avg = float(row.get("peer_avg_sales") or 0)
    avg_delta = float(row.get("avg_vs_peer_delta") or 0)

    action = "타점포 평균 대비 매출이 높습니다. 성공 요인을 분석하여 유지하세요." if avg_delta > 5 else "타점포 평균 대비 매출이 낮습니다. 경쟁점포 분석 및 개선 방안 모색 필요." if avg_delta < -5 else "타점포 평균과 유사한 수준입니다."

    return APIEnvelope(
        data={
            "month": month,
            "store_daily_avg": round(store_avg, 2),
            "peer_daily_avg": round(peer_avg, 2),
            "vs_peer_delta_pct": round(avg_delta, 2),
            "business_days": int(row.get("business_days") or 0),
            "action": action,
            "note": "클러스터 기준이 없으므로 전체 POC 평균 대비입니다. 동종 클러스터 비교는 추후 기준 데이터 필요.",
            "data_source": "dunkin_mart_copy.gold__store_peer_day",
        }
    )
