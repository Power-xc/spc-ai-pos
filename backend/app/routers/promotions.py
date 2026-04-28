"""Promotion / campaign impact API router.

Provides campaign dashboard data and campaign-impact calculations
for order management.  All numbers are derived from DB facts;
no LLM-generated numbers are returned.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request

from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.dependencies import (
    get_current_user_role,
    get_order_agent,
    get_postgres_db,
    get_request_store_id,
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/v1/promotions", tags=["promotions"])
logger = logging.getLogger(__name__)

# ── POC guardrail for campaign adjustment rate ──────────────────
CAMPAIGN_ADJUSTMENT_MIN = -0.30  # -30 % floor (POC guardrail)
CAMPAIGN_ADJUSTMENT_MAX = 0.50  # +50 % ceiling (POC guardrail)

# ── Campaign keyword → product name pattern mapping ─────────────
# Each (keyword, [exact_patterns, substring_patterns])
# exact_patterns: normalized product_name must match exactly
# substring_patterns: fallback, used when exact match fails
CAMPAIGN_PRODUCT_HINTS: dict[str, tuple[list[str], list[str]]] = {
    "글레이즈드": (["페이머스글레이즈드", "글레이즈드"], []),
    "번들": (["페이머스글레이즈드", "글레이즈드"], ["터널케이크", "호두"]),
    "아이스아메리카노": (["아이스아메리카노"], []),
    "아메리카노": (["아메리카노"], []),
    "카페라떼": (["카페라떼", "카페 라떼"], ["라떼"]),
    "런치": (["던킨런치세트", "런치세트"], ["런치", "샌드"]),
    "머니": (["머니바게트", "머니"], ["바게트"]),
    "1+1": (["페이머스글레이즈드", "글레이즈드"], []),
    "2천원": (["아이스아메리카노", "아메리카노"], ["라떼", "카페라떼"]),
    "1000원": (["던킨런치세트", "런치세트"], ["런치", "샌드"]),
}


def _normalize_product_name(name: str) -> str:
    """Normalize product name for matching: strip spaces, lowercase."""
    return "".join(name.lower().split())


def _extract_hinted_products(campaign_name: str) -> tuple[list[str], list[str]]:
    """Return (exact_patterns, substring_fallback_patterns) hinted by campaign name.

    If a longer exact pattern is present, shorter patterns that are substrings
    of it are removed to avoid over-mapping (e.g. "아이스아메리카노" blocks
    "아메리카노" from the same campaign).
    """
    exact: list[str] = []
    substr: list[str] = []
    cn = campaign_name or ""
    for keyword, (exact_pats, substr_pats) in CAMPAIGN_PRODUCT_HINTS.items():
        if keyword in cn:
            for p in exact_pats:
                np = _normalize_product_name(p)
                if np not in exact:
                    exact.append(np)
            for p in substr_pats:
                np = _normalize_product_name(p)
                if np not in substr:
                    substr.append(np)

    # Deduplicate: if a longer exact pattern contains a shorter one,
    # remove the shorter to prevent over-mapping.
    # e.g. "아이스아메리카노" blocks "아메리카노"
    filtered_exact: list[str] = []
    for p in exact:
        dominated = False
        for other in exact:
            if len(other) > len(p) and p in other:
                dominated = True
                break
        if not dominated:
            filtered_exact.append(p)
    exact = filtered_exact

    # Also remove from substring patterns anything already in exact
    substr = [s for s in substr if s not in exact]
    # Remove substring patterns dominated by exact
    filtered_substr: list[str] = []
    for s in substr:
        dominated = False
        for e in exact:
            if len(e) >= len(s) and s in e:
                dominated = True
                break
        if not dominated:
            filtered_substr.append(s)
    substr = filtered_substr

    return exact, substr


def _product_matches(campaign_name: str) -> tuple[list[str], list[str]]:
    """Return (exact_patterns, substring_fallback_patterns) for a campaign name."""
    return _extract_hinted_products(campaign_name)


async def _fetch_active_campaigns(db, store_id: str, demo_date: date) -> list[dict]:
    """Fetch campaigns active on demo_date for the given store.

    CRITICAL: Campaign 운영 기간 (start_date/end_date)은 전체 DB 기준으로 유지합니다.
    성과 집계 (total_sales_amt/bill_cnt/active_days)는 biz_date <= demo_date까지만 집계합니다.
    """
    from sqlalchemy import text

    schema = "dunkin_mart_copy"
    active_window_start = demo_date - timedelta(days=7)
    active_window_end = demo_date + timedelta(days=7)
    active_ids_result = await db.execute(
        text(f"""
            SELECT campaign_id
            FROM {schema}.new_campaign_day_gold
            WHERE store_id = :sid
              AND biz_date >= :win_start
              AND biz_date <= :win_end
            GROUP BY campaign_id
            HAVING COUNT(DISTINCT biz_date) >= 2
        """),
        {"sid": store_id, "win_start": active_window_start, "win_end": active_window_end},
    )
    active_ids = {row[0] for row in active_ids_result}
    if not active_ids:
        return []

    # Step 2: Get overall period for each active campaign (all dates)
    overall_result = await db.execute(
        text(f"""
            SELECT campaign_id, campaign_name,
                   MIN(biz_date) AS overall_start,
                   MAX(biz_date) AS overall_end
            FROM {schema}.new_campaign_day_gold
            WHERE store_id = :sid
              AND campaign_id = ANY(:ids)
            GROUP BY campaign_id, campaign_name
        """),
        {"sid": store_id, "ids": list(active_ids)},
    )

    overall = {}
    for r in overall_result.mappings().all():
        cid = r["campaign_id"]
        overall[cid] = {
            "campaign_id": cid,
            "campaign_name": str(r["campaign_name"] or ""),
            "start_date": str(r["overall_start"] or ""),
            "end_date": str(r["overall_end"] or ""),
        }

    # Step 3: Aggregate performance only up to demo_date
    perf_result = await db.execute(
        text(f"""
            SELECT campaign_id,
                   COALESCE(SUM(sales_amt), 0) AS total_sales_amt,
                   COALESCE(SUM(bill_cnt), 0) AS total_bill_cnt,
                   COUNT(DISTINCT biz_date) AS active_days
            FROM {schema}.new_campaign_day_gold
            WHERE store_id = :sid
              AND campaign_id = ANY(:ids)
              AND biz_date <= :agg_date
            GROUP BY campaign_id
        """),
        {"sid": store_id, "ids": list(active_ids), "agg_date": demo_date},
    )

    campaigns = []
    for cid in overall:
        perf_row = next(
            (r for r in perf_result.mappings().all() if r["campaign_id"] == cid),
            {"total_sales_amt": 0, "total_bill_cnt": 0, "active_days": 0},
        )
        campaigns.append({
            **overall[cid],
            "total_sales_amt": float(perf_row.get("total_sales_amt") or 0),
            "total_bill_cnt": int(perf_row.get("total_bill_cnt") or 0),
            "active_days": int(perf_row.get("active_days") or 0),
        })
    campaigns.sort(key=lambda c: c["total_sales_amt"], reverse=True)
    return campaigns


async def _compute_campaign_impact(
    db,
    store_id: str,
    demo_date: date,
    base_order_items: list[dict] | None = None,
) -> dict:
    """Compute campaign impact on order quantities.

    All performance aggregation uses biz_date <= demo_date.
    Future dates are never included in performance results.
    """
    from sqlalchemy import text

    schema = "dunkin_mart_copy"

    # 1. Active campaigns
    active_campaigns = await _fetch_active_campaigns(db, store_id, demo_date)

    if not active_campaigns:
        return {
            "store_id": store_id,
            "demo_date": demo_date.isoformat(),
            "aggregation_cutoff_date": demo_date.isoformat(),
            "future_data_excluded": True,
            "active_campaign_count": 0,
            "affected_product_count": 0,
            "campaigns": [],
            "summary": {
                "total_base_qty": 0,
                "total_adjustment_qty": 0,
                "total_final_qty": 0,
            },
            "note": "현재 적용 중인 캠페인이 없습니다.",
        }

    # 2. For each campaign, build affected products with uplift
    all_affected: dict[str, dict] = {}  # product_id -> aggregated info

    for campaign in active_campaigns:
        cid = campaign["campaign_id"]
        cname = campaign["campaign_name"]
        exact_pats, substr_pats = _extract_hinted_products(cname)

        if not exact_pats and not substr_pats:
            continue

        camp_start = campaign["start_date"] if isinstance(campaign["start_date"], date) else date.fromisoformat(str(campaign["start_date"]))
        camp_end_orig = campaign["end_date"] if isinstance(campaign["end_date"], date) else date.fromisoformat(str(campaign["end_date"]))
        # CRITICAL: Cap camp_end at demo_date to exclude future data
        camp_end = min(camp_end_orig, demo_date)
        # Skip campaign if period is entirely in the future
        if camp_start > demo_date:
            continue

        # Build product name matching: exact pattern is LIKE on normalized name,
        # not equality. "카라멜글레이즈드" should match "글레이즈드" with high confidence.
        # The distinction from substring_fallback is the controlled synonym list, not SQL operator.
        all_patterns = exact_pats + substr_pats
        like_parts = " OR ".join(f"(LOWER(REPLACE(product_name, ' ', '')) LIKE :hn_{i})" for i in range(len(exact_pats))) if exact_pats else "FALSE"
        like_parts_sub = " OR ".join(f"LOWER(product_name) LIKE :hn_sub_{i}" for i in range(len(substr_pats))) if substr_pats else ""
        where_product = f"({like_parts})"
        if substr_pats:
            where_product = f"({like_parts} OR ({like_parts_sub}))" if exact_pats else f"({like_parts_sub})"

        # 3. Get baseline: same DOW average sales qty for hinted products (biz_date < demo_date)
        demo_dow = demo_date.weekday()
        baseline_query = f"""
            SELECT product_id, product_name, category, AVG(sold_qty) AS baseline_avg
            FROM {schema}.new_product_sales_day_gold
            WHERE store_id = :store_id
              AND biz_date < :demo_date
              AND EXTRACT(DOW FROM biz_date) = :dow
              AND {where_product}
              AND sold_qty > 0
            GROUP BY product_id, product_name, category
        """
        params_bl = {
            "store_id": store_id,
            "demo_date": demo_date,
            "dow": demo_dow,
            **{f"hn_{i}": f"%{p}%" for i, p in enumerate(exact_pats)},
            **{f"hn_sub_{i}": f"%{_normalize_product_name(h).replace(' ', '')}%" for i, h in enumerate(substr_pats)},
        }

        result_bl = await db.execute(text(baseline_query), params_bl)
        baseline_rows = result_bl.mappings().all()
        baseline_map = {}
        for r in baseline_rows:
            pid = str(r["product_id"])
            pn = str(r.get("product_name") or "")
            pn_norm = _normalize_product_name(pn)
            # Determine mapping method: exact pattern contains → high, substring only → low
            matched_exact = any(ep in pn_norm for ep in exact_pats)
            if matched_exact:
                mapping_method = "product_name_exact"
                mapping_confidence = "high"
            else:
                mapping_method = "substring_fallback"
                mapping_confidence = "low"
            baseline_map[pid] = {
                "product_id": pid,
                "product_name": pn,
                "category": str(r.get("category") or ""),
                "baseline_avg": float(r.get("baseline_avg") or 0),
                "mapping_method": mapping_method,
                "mapping_confidence": mapping_confidence,
            }

        # 4. Get campaign-period sales (capped at demo_date)
        camp_query = f"""
            SELECT product_id, AVG(sold_qty) AS campaign_avg
            FROM {schema}.new_product_sales_day_gold
            WHERE store_id = :store_id
              AND biz_date >= :camp_start
              AND biz_date <= :camp_end
              AND {where_product}
              AND sold_qty > 0
            GROUP BY product_id
        """
        params_cp = {
            "store_id": store_id,
            "camp_start": camp_start,
            "camp_end": camp_end,
            **{f"hn_{i}": f"%{p}%" for i, p in enumerate(exact_pats)},
            **{f"hn_sub_{i}": f"%{_normalize_product_name(h).replace(' ', '')}%" for i, h in enumerate(substr_pats)},
        }
        result_cp = await db.execute(text(camp_query), params_cp)
        camp_rows = result_cp.mappings().all()
        camp_map = {}
        for r in camp_rows:
            pid = str(r["product_id"])
            camp_map[pid] = float(r.get("campaign_avg") or 0)

        # 5. Compute uplift per product
        for pid, bl in baseline_map.items():
            ca = camp_map.get(pid, 0)
            ba = bl["baseline_avg"]
            if pid not in all_affected:
                all_affected[pid] = {
                    "product_id": pid,
                    "product_name": bl["product_name"],
                    "category": bl["category"],
                    "baseline_avg": round(ba, 2),
                    "campaign_avgs": [],
                    "campaign_names": set(),
                    "mapping_method": bl["mapping_method"],
                    "mapping_confidence": bl.get("mapping_confidence", "medium"),
                }
            all_affected[pid]["campaign_avgs"].append({
                "campaign_id": cid,
                "campaign_name": cname,
                "campaign_avg": round(ca, 2),
            })
            all_affected[pid]["campaign_names"].add(cname)

    # 6. Apply to base order items
    total_base_qty = 0
    total_adjustment_qty = 0
    total_final_qty = 0

    campaigns_output = []
    for campaign in active_campaigns:
        cid = campaign["campaign_id"]
        cname = campaign["campaign_name"]

        affected_items = []
        for pid, info in all_affected.items():
            if cname not in info["campaign_names"]:
                continue

            ca_val = 0
            for ca_entry in info["campaign_avgs"]:
                if ca_entry["campaign_id"] == cid:
                    ca_val = ca_entry["campaign_avg"]
                    break

            ba_val = info["baseline_avg"]
            if ba_val > 0:
                uplift_rate = (ca_val / ba_val) - 1.0
            else:
                uplift_rate = 0.0

            uplift_rate = max(CAMPAIGN_ADJUSTMENT_MIN, min(CAMPAIGN_ADJUSTMENT_MAX, uplift_rate))

            base_qty = 0
            if base_order_items:
                for item in base_order_items:
                    if str(item.get("product_id") or "") == pid:
                        base_qty = int(item.get("quantity") or 0)
                        break

            mapping_confidence = info["mapping_confidence"]
            # base_qty=0: no auto adjustment
            auto_adjustment_applied = base_qty > 0 and mapping_confidence != "low"
            if base_qty > 0 and auto_adjustment_applied:
                adjustment_qty = max(0, round(base_qty * uplift_rate))
                final_qty = base_qty + adjustment_qty
            else:
                adjustment_qty = 0
                final_qty = base_qty

            impact_direction = "increase" if uplift_rate >= 0 else "decrease"

            guide_text = _build_guide_text(
                cname, info["product_name"], base_qty,
                adjustment_qty, final_qty, uplift_rate, mapping_confidence, auto_adjustment_applied
            )

            mapping_warning = None
            if mapping_confidence == "low":
                mapping_warning = (
                    f"{info['product_name']}의 상품 매핑이 정확하지 않을 수 있습니다. "
                    f"자동 보정을 적용하지 않았습니다."
                )

            affected_items.append({
                "product_id": pid,
                "product_name": info["product_name"],
                "category": info["category"],
                "baseline_avg_qty": round(ba_val, 2),
                "campaign_avg_qty": round(ca_val, 2),
                "base_recommended_qty": base_qty,
                "campaign_adjustment_qty": adjustment_qty,
                "final_recommended_qty": final_qty,
                "impact_direction": impact_direction,
                "impact_rate": round(uplift_rate, 4),
                "confidence": mapping_confidence,
                "mapping_method": info["mapping_method"],
                "mapping_confidence": mapping_confidence,
                "mapping_warning": mapping_warning,
                "auto_adjustment_applied": auto_adjustment_applied,
                "guide": guide_text,
            })

            if base_qty > 0 and auto_adjustment_applied:
                total_base_qty += base_qty
                total_adjustment_qty += adjustment_qty
                total_final_qty += final_qty

        if affected_items:
            campaigns_output.append({
                "campaign_id": cid,
                "campaign_name": cname,
                "period": {
                    "start_date": campaign["start_date"],
                    "end_date": campaign["end_date"],
                },
                "total_sales_amt": campaign["total_sales_amt"],
                "total_bill_cnt": campaign["total_bill_cnt"],
                "active_days": campaign["active_days"],
                "affected_product_count": len(affected_items),
                "affected_products": affected_items,
            })

    affected_product_set = set()
    for c in campaigns_output:
        for p in c["affected_products"]:
            affected_product_set.add(p["product_id"])

    return {
        "store_id": store_id,
        "demo_date": demo_date.isoformat(),
        "aggregation_cutoff_date": demo_date.isoformat(),
        "latest_aggregation_date": demo_date.isoformat(),
        "future_data_excluded": True,
        "active_campaign_count": len(active_campaigns),
        "affected_product_count": len(affected_product_set),
        "campaigns": campaigns_output,
        "summary": {
            "total_base_qty": total_base_qty,
            "total_adjustment_qty": total_adjustment_qty,
            "total_final_qty": total_final_qty,
        },
        "note": "캠페인 영향도는 같은 요일 기준 4주 평균 판매량 대비 캠페인 기간 평균 판매량으로 계산합니다.",
    }


def _build_guide_text(
    campaign_name: str,
    product_name: str,
    base_qty: int,
    adjustment_qty: int,
    final_qty: int,
    uplift_rate: float,
    confidence: str,
    auto_adjustment_applied: bool = True,
) -> str:
    """Build explanation text for campaign impact."""
    if base_qty == 0:
        return (
            f"{campaign_name} 캠페인 영향으로 {product_name}의 "
            f"{'수요 증가 예상' if uplift_rate > 0 else '수요 변화가 있으나'} "
            f"발주 기준 수량이 없어 자동 보정은 적용하지 않았습니다."
        )

    if confidence == "low":
        return (
            f"{campaign_name} 캠페인이 {product_name}에 영향을 줄 수 있으나 "
            f"상품 매핑이 정확하지 않아 보정을 적용하지 않았습니다. "
            f"매핑 확인이 필요합니다."
        )

    if not auto_adjustment_applied:
        direction = "증가" if uplift_rate > 0 else "감소"
        rate_pct = abs(uplift_rate * 100)
        return (
            f"{campaign_name} 캠페인 영향으로 {product_name} 수요가 "
            f"평균 대비 {rate_pct:.0f}% {direction} 예상되나 "
            f"자동 보정을 적용하지 않았습니다."
        )

    direction = "증가" if uplift_rate > 0 else "감소"
    rate_pct = abs(uplift_rate * 100)

    if uplift_rate > 0 and adjustment_qty > 0:
        return (
            f"{campaign_name} 캠페인 영향으로 {product_name} 수요가 "
            f"평균 대비 {rate_pct:.0f}% {direction} 예상되어 "
            f"발주량을 {base_qty}개에서 {final_qty}개로 보정했습니다."
        )
    elif uplift_rate < 0:
        return (
            f"{campaign_name} 캠페인 영향으로 {product_name} 수요가 "
            f"평균 대비 {rate_pct:.0f}% {direction} 예상되어 "
            f"발주량을 {base_qty}개에서 {final_qty}개로 보정했습니다."
        )
    else:
        return (
            f"{campaign_name} 캠페인 기간의 판매량이 기준평균과 유사해 "
            f"{product_name} 발주량({base_qty}개)을 유지합니다."
        )


# ── Router endpoints ────────────────────────────────────────────────

@router.get("/dashboard", response_model=APIResponse)
async def promotions_dashboard(
    request: Request,
    store_id: str = Query(default="POC_010"),
    demo_date: date | None = Query(default=None),
    demo_time: str | None = Query(default=None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
):
    """Promotion dashboard with campaign impact overview.

    Returns active campaigns, affected products, and before/after comparison.
    """
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Store not found")

    # Get latest biz date if demo_date not provided
    from app.tools import sql_queries
    latest = await sql_queries.get_latest_biz_date(db, normalized)
    target_date = demo_date or (latest or date.today())

    # Active campaigns
    active_campaigns = await _fetch_active_campaigns(db, normalized, target_date)

    # Full impact computation (without base order items)
    impact = await _compute_campaign_impact(db, normalized, target_date)

    # Build summary stats
    total_sales = sum(c["total_sales_amt"] for c in active_campaigns)
    total_bills = sum(c["total_bill_cnt"] for c in active_campaigns)

    return APIResponse(data={
        "store_id": normalized,
        "demo_date": target_date.isoformat(),
        "demo_time": demo_time or "16:00",
        "aggregation_cutoff_date": target_date.isoformat(),
        "latest_aggregation_date": target_date.isoformat(),
        "future_data_excluded": True,
        "active_campaign_count": len(active_campaigns),
        "total_campaign_sales": round(total_sales, 2),
        "total_campaign_bills": total_bills,
        "affected_product_count": impact.get("affected_product_count", 0),
        "campaigns": active_campaigns,
        "campaign_impact": impact,
        "data_source": "dunkin_mart_copy.new_campaign_day_gold",
    })


@router.get("", response_model=APIResponse)
async def promotions_list(
    request: Request,
    store_id: str = Query(default="POC_010"),
    demo_date: date | None = Query(default=None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
):
    """List all campaigns for a store within a date range."""
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Store not found")

    from app.tools import sql_queries
    latest = await sql_queries.get_latest_biz_date(db, normalized)
    target_date = demo_date or (latest or date.today())
    start_date = target_date - timedelta(days=30)

    active_campaigns = await _fetch_active_campaigns(db, normalized, target_date)
    impact = await _compute_campaign_impact(db, normalized, target_date)

    return APIResponse(data={
        "store_id": normalized,
        "period": {"start": start_date.isoformat(), "end": target_date.isoformat()},
        "active_campaigns": active_campaigns,
        "campaign_impact": impact,
        "data_source": "dunkin_mart_copy.new_campaign_day_gold",
    })
