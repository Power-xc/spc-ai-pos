"""HQ AI Chat — gold-table backed RAG Q&A with structured query builders and keyword routing."""

from __future__ import annotations

import json
import logging
import time
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_context, get_postgres_db
from app.schemas.chat import ChatRequest
from app.schemas.common import APIResponse
from app.services.llm_gateway import LLMGateway

router = APIRouter(tags=["hq-ai"])
logger = logging.getLogger(__name__)

G = "dunkin_mart_copy"  # gold schema shorthand
BASE_DATE = date(2026, 3, 5)


# ── DB helper ───────────────────────────────────────────────────────────────

from datetime import date as _date


def _p(d: date | None = None) -> dict[str, Any]:
    val = d or BASE_DATE
    if isinstance(val, str):
        val = _date.fromisoformat(val[:10])
    return {"biz": val}


async def qall(db: AsyncSession, sql: str, params: dict | None = None) -> list[dict]:
    result = await db.execute(text(sql), params or {})
    cols = result.keys()
    return [dict(zip(cols, r)) for r in result.fetchall()]


async def qone(db: AsyncSession, sql: str, params: dict | None = None) -> dict | None:
    result = await db.execute(text(sql), params or {})
    cols = result.keys()
    r = result.fetchone()
    return dict(zip(cols, r)) if r else None


# ── Question Router (keyword-based) ────────────────────────────────────────

METRIC_KW: dict[str, list[str]] = {
    "total_sales_summary": ["매출", "요약", "overview", "일일", "오늘", "summary", "whole", "all"],
    "strongest_stores": ["강한", "strongest", "잘하는", "우수", "좋은", "best", "top 점포", "가장 강한"],
    "weakest_stores": ["약한", "부진", "개선", "저조", "worst", "가장 약한", "문제"],
    "store_health_summary": ["점포운영", "운영", "상태", "미확인", "정상"],
    "top_bottom_gap": ["차이", "격차", "상위점포 하위", "상위 하위", "비교", "contrast", "difference"],
    "inventory_risky_stores": ["재고", "위험", "품절", "부족", "stockout", "inventory risk"],
    "inventory_risky_items": ["품목", "재료", "product", "재고 품목"],
    "order_required_items_top": ["발주", "필요", "보충", "order", " 주문", "depletion"],
    "order_trend_wow": ["추이", "전주", "weekly", "trend", "변동", "증감", "increase", "decrease"],
    "payment_mix": ["결제", "payment", "카드", "현금", "간편결제", "비중"],
    "hourly_weak_periods": ["시간", "hour", "구간", "peak", "약한 시간", "오전", "오후"],
    "campaign_performance_top": ["캠페인", "campaign", "promotion", "성과", "uplift", "반응 좋은", "좋은 camp"],
    "campaign_low_performance": ["낮은 camp", "낮은 성과", "bad camp", "react 낮은"],
    "notice_summary": ["공지", "notice", "alert", "긴급", "미확인", "announcements"],
    "top_sales_stores": ["매출 상위", "매출 good"],
    "bottom_sales_stores": ["매출 하위", "매출 weak"],
    "active_campaigns": ["진행하는 캠페인", "현재 camp", "camp active", "진행중"],
}

DOMAIN_MAP: dict[str, str] = {
    "total_sales_summary": "sales",
    "strongest_stores": "store_ops",
    "weakest_stores": "store_ops",
    "store_health_summary": "store_ops",
    "top_bottom_gap": "sales",
    "inventory_risky_stores": "inventory",
    "inventory_risky_items": "inventory",
    "order_required_items_top": "inventory",
    "order_trend_wow": "inventory",
    "payment_mix": "sales",
    "hourly_weak_periods": "sales",
    "campaign_performance_top": "campaign",
    "campaign_low_performance": "campaign",
    "notice_summary": "notice",
    "top_sales_stores": "sales",
    "bottom_sales_stores": "sales",
    "active_campaigns": "campaign",
}


def route_question(message: str) -> dict[str, Any]:
    msg_lower = message.lower()
    scores: dict[str, int] = {}
    for metric, keywords in METRIC_KW.items():
        score = sum(1 for kw in keywords if kw.lower() in msg_lower)
        if score > 0:
            scores[metric] = score
    if not scores:
        if any(k in msg_lower for k in ["매출", "sale"]):
            scores["total_sales_summary"] = 1
        elif any(k in msg_lower for k in ["재고", "inventory", "stock"]):
            scores["inventory_risky_stores"] = 1
        elif any(k in msg_lower for k in ["점포", "store"]):
            scores["store_health_summary"] = 1
        else:
            scores["total_sales_summary"] = 0
    best = max(scores, key=scores.get)
    return {
        "domain": DOMAIN_MAP.get(best, "sales"),
        "metric": best,
        "confidence": min(scores.get(best, 0) / 3, 1.0),
    }


# ── Query Functions ────────────────────────────────────────────────────────

async def query_total_sales_summary(db: AsyncSession, biz: date) -> dict:
    r = await qone(db, f"""
    WITH t AS (
        SELECT COUNT(*)::int AS cnt,
               COALESCE(SUM(total_sales),0)::float AS sales,
               COALESCE(SUM(total_qty)::numeric,0)::float AS qty,
               COALESCE(SUM(discount_total),0)::float AS discount,
               COALESCE(SUM(waste_total),0)::float AS waste,
               COALESCE(SUM(stockout_sku_cnt),0)::int AS so_skus
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :biz
    ), lw AS (
        SELECT COALESCE(SUM(total_sales),0)::float AS s
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :biz - INTERVAL '7 days'
    ), dec AS (
        SELECT COUNT(*)::int AS c FROM {G}.new_kpi_store_day_gold s
        JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
        WHERE s.biz_date = :biz AND s.total_sales < l.total_sales
    )
    SELECT t.*, lw.s AS lw_sales, dec.c AS declining_cnt FROM t, lw, dec
    """, _p(biz))

    top5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           l.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz ORDER BY s.total_sales DESC LIMIT 5""", _p(biz))

    bot5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           l.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz AND s.total_sales > 0
    ORDER BY s.total_sales ASC LIMIT 5""", _p(biz))

    s = r["sales"] or 0
    lw = r["lw_sales"] or 0
    wow = round((s - lw) / lw * 100, 1) if lw > 0 else None
    return {
        "store_count": r["cnt"], "total_sales": round(s), "total_qty": r["qty"],
        "discount_total": round(r["discount"]), "waste_total": round(r["waste"]),
        "total_stockout_skus": r["so_skus"], "last_week_sales": round(lw),
        "wow_pct": wow, "declining_count": r["declining_cnt"],
        "top5": top5, "bottom5": bot5,
    }


async def query_strongest_stores(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    WITH t AS (
        SELECT store_id, total_sales::float AS sales, total_qty::float, stockout_sku_cnt, waste_total::float AS waste
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :biz
    ), lw AS (
        SELECT store_id, total_sales::float AS lw FROM {G}.new_kpi_store_day_gold WHERE biz_date = :biz - INTERVAL '7 days'
    ), ir AS (
        SELECT store_id, COUNT(*)::int AS ri FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :biz AND (on_hand_eod <= 2 OR days_of_supply <= 1) GROUP BY store_id
    )
    SELECT t.store_id, COALESCE(d.store_name, t.store_id) AS store_name, d.region,
           t.sales, COALESCE(lw.lw,0) AS lw, COALESCE(t.stockout_sku_cnt,0) AS so,
           COALESCE(t.waste,0) AS waste, COALESCE(ir.ri,0) AS ri
    FROM t LEFT JOIN {G}.dim_store d ON d.store_id=t.store_id
           LEFT JOIN lw ON lw.store_id=t.store_id LEFT JOIN ir ON ir.store_id=t.store_id
    ORDER BY t.sales DESC LIMIT 15""", _p(biz))

    if not rows:
        return {"note": f"{biz} 기준 데이터가 없습니다.", "stores": []}
    mx = max((r["sales"] or 0 for r in rows), default=1)
    scored = []
    for r in rows:
        s = r["sales"] or 0
        l = r["lw"] or 0
        wowp = ((s - l) / l * 100) if l > 0 else 0
        ri = r["ri"] + r["so"]
        comp = round(s / mx * 40 + min(max(wowp / 50, 0), 1) * 25 + max(0, 1 - ri / 20) * 20 + max(0, 1 - r["waste"] / 1e6) * 15)
        scored.append({
            "rank": len(scored) + 1, "store_id": r["store_id"],
            "store_name": r["store_name"], "region": r.get("region", ""),
            "sales": round(s), "wow_pct": round(wowp, 1),
            "risk_items": ri, "score": comp,
        })
    return {
        "scoring_note": "매출 40%, 전주 대비 성장률 25%, 재고 안정성 20%, 폐기 효율 15% 기준",
        "stores": scored[:10], "best_store": scored[0] if scored else None,
    }


async def query_weakest_stores(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           s.stockout_sku_cnt, s.waste_total::float, l.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz ORDER BY s.total_sales ASC LIMIT 10""", _p(biz))
    result = []
    for r in rows:
        s = r["total_sales"] or 0
        l = r["lw_sales"] or 0
        wow = round((s - l) / l * 100, 1) if l > 0 else None
        result.append({
            "store_id": r["store_id"], "store_name": r.get("store_name", ""),
            "region": r.get("region", ""), "sales": round(s), "wow_pct": wow,
            "stockout_skus": r.get("stockout_sku_cnt", 0), "waste": r.get("waste_total", 0),
        })
    return {"stores": result}


async def query_top_bottom_gap(db: AsyncSession, biz: date) -> dict:
    r = await qone(db, f"""
    WITH top_h AS (
        SELECT s.store_id, s.total_sales::float FROM {G}.new_kpi_store_day_gold s
        JOIN {G}.dim_store d ON d.store_id=s.store_id
        WHERE s.biz_date=:biz AND s.total_sales>0 ORDER BY s.total_sales DESC LIMIT 11
    ), bot_h AS (
        SELECT s.store_id, s.total_sales::float FROM {G}.new_kpi_store_day_gold s
        JOIN {G}.dim_store d ON d.store_id=s.store_id
        WHERE s.biz_date=:biz AND s.total_sales>0 ORDER BY s.total_sales ASC LIMIT 11
    )
    SELECT (SELECT AVG(total_sales) FROM top_h) AS top_avg,
           (SELECT AVG(total_sales) FROM bot_h) AS bot_avg,
           (SELECT MAX(total_sales) FROM top_h) AS top_max,
           (SELECT MIN(total_sales) FROM bot_h) AS bot_min
    FROM top_h, bot_h""", _p(biz))

    top5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           l.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz ORDER BY s.total_sales DESC LIMIT 5""", _p(biz))

    bot5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           l.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz AND s.total_sales>0
    ORDER BY s.total_sales ASC LIMIT 5""", _p(biz))

    ta = r["top_avg"] or 0
    ba = r["bot_avg"] or 0
    gap = ta - ba
    return {
        "top_avg_sales": round(ta), "bottom_avg_sales": round(ba),
        "gap": round(gap), "gap_pct": round(gap / ba * 100, 1) if ba > 0 else 0,
        "top5": top5, "bottom5": bot5,
    }


async def query_inventory_risky_stores(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    SELECT store_id, COUNT(*)::int AS ric,
           SUM(CASE WHEN on_hand_eod<=0 THEN 1 ELSE 0 END)::int AS stockout_items,
           SUM(CASE WHEN on_hand_eod BETWEEN 1 AND 2 THEN 1 ELSE 0 END)::int AS low_items
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date=:biz AND (on_hand_eod<=2 OR days_of_supply<=1)
    GROUP BY store_id ORDER BY ric DESC LIMIT 15""", _p(biz))

    stores = []
    for r in rows:
        sid = r["store_id"]
        items = await qall(db, f"""
        SELECT product_name, on_hand_eod, days_of_supply
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date=:biz AND store_id=:sid AND (on_hand_eod<=2 OR days_of_supply<=1)
        ORDER BY on_hand_eod ASC LIMIT 5""", {"biz": biz, "sid": sid})
        stores.append({
            "store_id": sid, "risk_item_cnt": r["ric"],
            "stockout_items": r["stockout_items"], "low_stock_items": r["low_items"],
            "top_risk_items": items[:5],
        })
    return {
        "total_risk_items": sum(r["ric"] for r in rows),
        "risky_store_count": len(stores), "stores": stores,
    }


async def query_inventory_risky_items(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    SELECT product_id, product_name, category,
           COUNT(DISTINCT store_id)::int AS risky_stores,
           SUM(CASE WHEN on_hand_eod<=0 THEN 1 ELSE 0 END)::int AS stockout_count,
           AVG(on_hand_eod)::float AS avg_on_hand,
           AVG(days_of_supply)::float AS avg_dos
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date=:biz AND (on_hand_eod<=2 OR days_of_supply<=1)
    GROUP BY product_id, product_name, category
    ORDER BY risky_stores DESC, stockout_count DESC LIMIT 15""", _p(biz))
    return {"total_risk_products": len(rows), "items": rows}


async def query_order_required_items_top(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    SELECT product_id, product_name, category,
           COUNT(DISTINCT store_id)::int AS affected_stores,
           SUM(CASE WHEN on_hand_eod<=0 THEN 1 ELSE 0 END)::int AS stockout_count,
           ROUND(AVG(on_hand_eod),1) AS avg_on_hand,
           ROUND(AVG(days_of_supply),1) AS avg_dos
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date=:biz AND on_hand_eod<=3
    GROUP BY product_id, product_name, category
    ORDER BY affected_stores DESC, stockout_count DESC, avg_on_hand ASC LIMIT 10""", _p(biz))
    return {"items": rows, "total_affected": len(rows)}


async def query_order_trend_wow(db: AsyncSession, biz: date) -> dict:
    r = await qone(db, f"""
    WITH tk AS (
        SELECT COALESCE(SUM(total_sales),0)::float AS s, COALESCE(SUM(total_qty)::numeric,0)::float AS q
        FROM {G}.new_kpi_store_day_gold WHERE biz_date=:biz
    ), lk AS (
        SELECT COALESCE(SUM(total_sales),0)::float AS s, COALESCE(SUM(total_qty)::numeric,0)::float AS q
        FROM {G}.new_kpi_store_day_gold WHERE biz_date=:biz - INTERVAL '7 days'
    )
    SELECT tk.s AS ts, tk.q AS tq, lk.s AS lws, lk.q AS lwq FROM tk, lk""", _p(biz))

    store_wow = await qall(db, f"""
    SELECT s.store_id, d.store_name,
           s.total_sales::float AS today, l.total_sales::float AS lw
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold l ON l.store_id=s.store_id AND l.biz_date=s.biz_date - INTERVAL '7 days'
    WHERE s.biz_date=:biz ORDER BY s.total_sales DESC""", _p(biz))

    ts = r["ts"] or 0
    lws = r["lws"] or 0
    wowp = round((ts - lws) / lws * 100, 1) if lws > 0 else None
    inc = [s for s in store_wow if s.get("lw") and s["today"] > (s["lw"] or 0)]
    dec = [s for s in store_wow if s.get("lw") and s["today"] < (s["lw"] or 0)]
    return {
        "today_sales": round(ts), "last_week_sales": round(lws),
        "wow_pct": wowp, "store_count": len(store_wow),
        "increasing_count": len(inc), "decreasing_count": len(dec),
        "top_gainers": inc[:5], "top_losers": dec[:5],
    }


async def query_store_health(db: AsyncSession, biz: date) -> dict:
    summary_rows = await qall(db, f"""
    WITH ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date=:biz AND (on_hand_eod<=2 OR days_of_supply<=1) GROUP BY store_id
    ), sc AS (
        SELECT s.store_id, d.store_name, d.region, s.total_sales::float, s.stockout_sku_cnt,
               COALESCE(ir.ri,0) AS inv_ri,
               CASE WHEN COALESCE(ir.ri,0)>=19 THEN 'risk'
                    WHEN COALESCE(ir.ri,0)>=8 THEN 'warning' ELSE 'normal' END AS status
        FROM {G}.new_kpi_store_day_gold s
        JOIN {G}.dim_store d ON d.store_id=s.store_id LEFT JOIN ir ON ir.store_id=s.store_id
        WHERE s.biz_date=:biz
    )
    SELECT status, COUNT(*)::int AS cnt, ROUND(AVG(total_sales))::int AS avg_sales,
           SUM(stockout_sku_cnt)::int AS total_so
    FROM sc GROUP BY status""", _p(biz))

    store_rows = await qall(db, f"""
    WITH ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date=:biz AND (on_hand_eod<=2 OR days_of_supply<=1) GROUP BY store_id
    )
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float, s.stockout_sku_cnt,
           COALESCE(ir.ri,0) AS inv_ri,
           CASE WHEN COALESCE(ir.ri,0)>=19 THEN 'risk'
                WHEN COALESCE(ir.ri,0)>=8 THEN 'warning' ELSE 'normal' END AS status
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id=s.store_id LEFT JOIN ir ON ir.store_id=s.store_id
    WHERE s.biz_date=:biz ORDER BY inv_ri DESC""", _p(biz))

    return {"summary": {s["status"]: s for s in summary_rows}, "stores": store_rows}


async def query_campaign_performance(db: AsyncSession, biz: date) -> dict:
    rows = await qall(db, f"""
    SELECT campaign_id, campaign_name,
           SUM(sales_amt)::float AS total_sales,
           SUM(bill_cnt)::int AS total_bills,
           COUNT(DISTINCT store_id)::int AS store_cnt,
           AVG(sales_amt)::float AS avg_sales
    FROM {G}.new_campaign_day_gold WHERE biz_date <= :biz
    GROUP BY campaign_id, campaign_name ORDER BY total_sales DESC""", _p(biz))
    latest = await qone(db, f"SELECT MAX(biz_date) AS md FROM {G}.new_campaign_day_gold")
    return {
        "campaigns": rows,
        "latest_data_date": str(biz),
        "total_campaigns": len(rows),
    }


async def query_payment_mix(db: AsyncSession, biz: date) -> dict:
    total = await qone(db, f"""
    SELECT COALESCE(SUM(total_sales),0)::float AS s FROM {G}.new_kpi_store_day_gold WHERE biz_date=:biz""", _p(biz))
    return {
        "available": False,
        "note": "결제수단별 데이터는 현재 gold 테이블에 없습니다. 전체 매출액과 지역별/점포별 매출 분석은 가능합니다.",
        "total_sales": total["s"] if total else 0,
    }


async def query_hourly_weak(db: AsyncSession, biz: date) -> dict:
    return {
        "available": False,
        "note": "시간대별 매출 데이터는 하루 단위 집계만 있습니다. 대신 전주 대비 발주/매출 추이는 분석할 수 있습니다.",
    }


async def query_notice_summary(db: AsyncSession, biz: date | None = None) -> dict:
    rows = await qall(db, """
    SELECT severity, status,
           SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END)::int AS unread,
           COUNT(*)::int AS total, MAX(occurred_at)::text AS last_at
    FROM dunkin_mart.alerts GROUP BY severity, status ORDER BY severity DESC""")

    unread = await qall(db, """
    SELECT store_id, severity, title, summary, occurred_at::text
    FROM dunkin_mart.alerts WHERE read_at IS NULL ORDER BY occurred_at DESC LIMIT 10""")

    urgent = await qall(db, """
    SELECT store_id, title, summary, occurred_at::text
    FROM dunkin_mart.alerts WHERE severity IN ('critical','high') OR title LIKE '%긴급%'
    ORDER BY occurred_at DESC LIMIT 10""")

    return {"by_severity": rows, "unread_alerts": unread, "urgent_alerts": urgent}


# ── Dispatcher ──────────────────────────────────────────────────────────────

DISPATCH = {
    "total_sales_summary": query_total_sales_summary,
    "strongest_stores": query_strongest_stores,
    "weakest_stores": query_weakest_stores,
    "top_bottom_gap": query_top_bottom_gap,
    "inventory_risky_stores": query_inventory_risky_stores,
    "inventory_risky_items": query_inventory_risky_items,
    "order_required_items_top": query_order_required_items_top,
    "order_trend_wow": query_order_trend_wow,
    "payment_mix": query_payment_mix,
    "hourly_weak_periods": query_hourly_weak,
    "campaign_performance_top": query_campaign_performance,
    "campaign_low_performance": query_campaign_performance,
    "notice_summary": query_notice_summary,
    "store_health_summary": query_store_health,
    "top_sales_stores": query_strongest_stores,
    "bottom_sales_stores": query_weakest_stores,
    "active_campaigns": query_campaign_performance,
}


# ── LLM ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """너는 BRKorea HQ Console의 점포 운영 분석 AI다.

규칙:
1. 제공된 structured result만 근거로 답한다.
2. 데이터 일부만 있으면 가능한 범위와 부족한 범위 구분해서 답한다.
3. "확인되지 않습니다"는 정말 관련 gold 테이블과 대체 지표가 모두 없을 때만 쓴다.
4. SQL, 테이블명, 컬럼명은 노출하지 않는다.
5. 짧은 요약 → 핵심 수치 → 표 → 분석 근거 순서.
6. 원화는 ₩표시. TOP5 이내.
7. 기준일 반드시 표시."""


def _llm_ctx(metric: str, result: dict, question: str) -> str:
    lines = [f"[{metric}]", f"기준일: {BASE_DATE}", ""]
    for k, v in result.items():
        if isinstance(v, list):
            lines.append(f"{k} ({len(v)}):")
            for item in v[:10]:
                lines.append(f"  - {json.dumps(item, ensure_ascii=False, default=str)}")
        elif isinstance(v, dict):
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False, default=str)}")
        else:
            lines.append(f"{k}: {v}")
    lines.append(f"\n[질문] {question}")
    return "\n".join(lines)


def _fmt_money(v) -> str:
    if v is None:
        return "N/A"
    v = int(v)
    if abs(v) >= 1_000_000_000:
        return f"₩{v/1e9:.1f}B"
    if abs(v) >= 1_000_000:
        return f"₩{v/1e6:.1f}M"
    if abs(v) >= 1_000:
        return f"₩{v/1e3:.1f}K"
    return f"₩{v:,.0f}"


def _fmt_pct(v) -> str:
    if v is None:
        return "N/A"
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.1f}%"


def _build_answer_blocks(metric: str, result: dict, biz_date: date) -> list[dict] | None:
    """Build structured answer blocks for frontend rendering."""
    try:
        if metric == "total_sales_summary":
            top5_rows = []
            for r in (result.get("top5") or [])[:5]:
                sn = r.get("store_name") or r.get("store_id", "?")
                lw = r.get("lw_sales") or 0
                wow = ((r["total_sales"] - lw) / lw * 100) if lw > 0 else 0
                top5_rows.append([sn, _fmt_money(r["total_sales"]), _fmt_pct(wow)])
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "전체 매출", "value": _fmt_money(result.get("total_sales"))},
                    {"label": "점포 수", "value": f"{result.get('store_count', 0)}개"},
                    {"label": "매출 감소 점포", "value": f"{result.get('declining_count', 0)}개"},
                    {"label": "전주 대비", "value": _fmt_pct(result.get("wow_pct"))},
                ]},
                {"type": "table", "title": "매출 상위 TOP5", "columns": ["점포", "매출", "전주 대비"], "rows": top5_rows},
                {"type": "sources", "items": [f"기준일: {biz_date}", f"범위: 전체 {result.get('store_count', 0)}개 점포"]},
            ]
            return blocks

        if metric in ("strongest_stores", "top_sales_stores"):
            stores = result.get("stores", [])
            rows = []
            for s in stores[:5]:
                rows.append([s.get("rank", 1), s.get("store_name", s.get("store_id")),
                             _fmt_money(s.get("sales")), _fmt_pct(s.get("wow_pct")), s.get("score"), s.get("risk_items")])
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "1위 점포", "value": (stores[0].get("store_name") if stores else "?")},
                    {"label": "종합 점수", "value": str(stores[0].get("score", 0)) if stores else "N/A"},
                ]},
                {"type": "table", "title": "강한 점포 TOP5", "columns": ["순위", "점포", "매출", "증감률", "점수", "위험건"], "rows": rows},
                {"type": "sources", "items": [result.get("scoring_note", ""), f"기준일: {biz_date}"]},
            ]
            return blocks

        if metric == "top_bottom_gap":
            top_rows = [[r.get("store_name") or r.get("store_id"), _fmt_money(r.get("total_sales")),
                         _fmt_pct(((r.get("total_sales") - (r.get("lw_sales") or 0)) / (r.get("lw_sales") or 1) * 100))]
                        for r in (result.get("top5") or [])[:5]]
            bot_rows = [[r.get("store_name") or r.get("store_id"), _fmt_money(r.get("total_sales")),
                         _fmt_pct(((r.get("total_sales") - (r.get("lw_sales") or 0)) / (r.get("lw_sales") or 1) * 100))]
                        for r in (result.get("bottom5") or [])[:5]]
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "상위 평균", "value": _fmt_money(result.get("top_avg_sales"))},
                    {"label": "하위 평균", "value": _fmt_money(result.get("bottom_avg_sales"))},
                    {"label": "격차", "value": _fmt_money(result.get("gap"))},
                    {"label": "격차율", "value": _fmt_pct(result.get("gap_pct"))},
                ]},
                {"type": "table", "title": "상위 5개", "columns": ["점포", "매출", "전주 대비"], "rows": top_rows},
                {"type": "table", "title": "하위 5개", "columns": ["점포", "매출", "전주 대비"], "rows": bot_rows},
                {"type": "sources", "items": [f"기준일: {biz_date}"]},
            ]
            return blocks

        if metric == "inventory_risky_stores":
            rows = [[s.get("store_id"), s.get("risk_item_cnt"), s.get("stockout_items"), s.get("low_stock_items")]
                    for s in (result.get("stores") or [])[:10]]
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "위험 품목", "value": f"{result.get('total_risk_items', 0)}건"},
                    {"label": "위험 점포", "value": f"{result.get('risky_store_count', 0)}개"},
                ]},
                {"type": "table", "title": "재고 위험 점포 TOP10", "columns": ["점포", "위험건", "품절", "저재고"], "rows": rows},
                {"type": "sources", "items": [f"기준일: {biz_date}", "상세 품목은 점포별 조회 가능"]},
            ]
            return blocks

        if metric in ("order_required_items_top", "inventory_risky_items"):
            items = result.get("items", [])
            rows = [[i.get("product_name", "?"), str(i.get("affected_stores") or i.get("risky_stores", 0)),
                     str(i.get("stockout_count", 0)), f"{i.get('avg_on_hand', 0):.0f}", i.get("category", "")]
                    for i in items[:10]]
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "영향 품목", "value": f"{len(items)}개"},
                ]},
                {"type": "table", "title": "위험 품목 TOP10", "columns": ["품목", "위험점포", "품절건", "평균재고", "카테고리"], "rows": rows},
                {"type": "sources", "items": [f"기준일: {biz_date}"]},
            ]
            return blocks

        if metric == "order_trend_wow":
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "오늘 매출", "value": _fmt_money(result.get("today_sales"))},
                    {"label": "전주 매출", "value": _fmt_money(result.get("last_week_sales"))},
                    {"label": "증감률", "value": _fmt_pct(result.get("wow_pct"))},
                    {"label": "증가 점포", "value": f"{result.get('increasing_count', 0)}개"},
                    {"label": "감소 점포", "value": f"{result.get('decreasing_count', 0)}개"},
                ]},
                {"type": "sources", "items": [f"기준일: {biz_date}", f"전체 {result.get('store_count', 0)}개 점포"]},
            ]
            return blocks

        if metric == "campaign_performance_top" or metric.startswith("campaign"):
            campaigns = result.get("campaigns", [])
            rows = [[i.get("campaign_name", "?"), _fmt_money(i.get("total_sales")),
                     str(i.get("total_bills") or 0), str(i.get("store_cnt") or 0)]
                    for i in campaigns[:5]]
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "캠페인 수", "value": f"{result.get('total_campaigns', 0)}개"},
                    {"label": "최신 데이터", "value": result.get("latest_data_date", "N/A")},
                ]},
                {"type": "table", "title": "캠페인 성과 TOP5", "columns": ["캠페인", "총매출", "거래건", "점포수"], "rows": rows},
                {"type": "sources", "items": [f"최신 데이터: {result.get('latest_data_date', 'N/A')}"]},
            ]
            return blocks

        if metric == "notice_summary":
            rows = [[s.get("severity", "?"), str(s.get("total", 0)), str(s.get("unread", 0))]
                    for s in (result.get("by_severity") or [])[:5]]
            urg = result.get("urgent_alerts", [])
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "미확인 공지", "value": f"{len(result.get('unread_alerts', []))}건"},
                    {"label": "긴급 알림", "value": f"{len(urg)}건"},
                ]},
                {"type": "table", "title": "严重도별 현황", "columns": ["级别", "总件", "未读"], "rows": rows},
                {"type": "sources", "items": ["dunkin_mart.alerts 기준"]},
            ]
            return blocks

        if metric in ("payment_mix", "hourly_weak_periods"):
            return [
                {"type": "insight", "text": result.get("note", "해당 데이터는 현재 조회할 수 없습니다.")},
                {"type": "sources", "items": [f"기준일: {biz_date}"]},
            ]

        if metric == "store_health_summary":
            summary = result.get("summary", {})
            rows = [[s, d.get("cnt", 0), _fmt_money(d.get("avg_sales")), d.get("total_so", 0)]
                    for s, d in summary.items()]
            blocks = [
                {"type": "kpi", "items": [
                    {"label": "위험", "value": str(summary.get("risk", {}).get("cnt", 0))},
                    {"label": "주의", "value": str(summary.get("warning", {}).get("cnt", 0))},
                    {"label": "정상", "value": str(summary.get("normal", {}).get("cnt", 0))},
                ]},
                {"type": "table", "title": "점포 상태 요약", "columns": ["상태", "개수", "평균매출", "품절SKU"], "rows": rows},
                {"type": "sources", "items": [f"기준일: {biz_date}"]},
            ]
            return blocks

    except Exception as e:
        logger.exception("answerBlocks build error")
        return None


# ── Endpoint ────────────────────────────────────────────────────────────────

@router.post("/api/hq-ai/chat")
async def hq_ai_chat(
    payload: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_postgres_db),
    _user_ctx=Depends(get_current_user_context),
):
    llm_gateway: LLMGateway | None = getattr(request.app.state, "llm_gateway", None)
    if not llm_gateway:
        return APIResponse(status="error", data=None,
                           error={"code": "service_unavailable", "message": "AI 서버에 연결할 수 없습니다."})

    start = time.time()
    user_msg = payload.message or ""
    routing = route_question(user_msg)
    metric = routing["metric"]
    domain = routing["domain"]

    biz_date: date | None = None
    ctx = payload.context or {}
    if "asOfDate" in ctx:
        try:
            biz_date = date.fromisoformat(str(ctx["asOfDate"])[:10])
        except Exception:
            pass
    if not biz_date:
        biz_date = BASE_DATE

    logger.info(f"HQ AI: q=%r metric=%s conf=%.2f date=%s", user_msg, metric, routing["confidence"], biz_date)

    fn = DISPATCH.get(metric)
    if not fn:
        return APIResponse(status="success", data={
            "answer": f"'{user_msg}'에 해당하는 분석 지표는 아직 지원하지 않습니다.",
            "domain": domain, "debug": {"metric": metric}})

    try:
        t0 = time.time()
        result = await fn(db, biz_date) if metric != "notice_summary" else await fn(db, None)
        qms = round((time.time() - t0) * 1000)
        logger.info(f"HQ AI query: {qms}ms metric={metric}")
        rc = sum(len(v) for v in result.values() if isinstance(v, list))
    except Exception as e:
        logger.exception(f"HQ AI query fail metric={metric}")
        return APIResponse(status="error", data=None,
                           error={"code": "query_error", "message": f"데이터 조회 오류: {str(e)[:100]}"})

    try:
        ctx_text = _llm_ctx(metric, result, user_msg)
        llm_start = time.time()
        r = await llm_gateway.call(
            purpose="hq_ai_chat", system_prompt=SYSTEM_PROMPT,
            user_prompt=f"### 조회 데이터\n{ctx_text}\n\n위 데이터만 근거로 질문에 간결하게 답변하세요.",
            max_tokens=2048, temperature=0.1)
        answer = r.get("content", "")
        llms = round((time.time() - llm_start) * 1000)
        logger.info(f"HQ AI LLM: {llms}ms metric={metric}")
    except Exception as e:
        logger.exception("LLM fail")
        answer = f"데이터 조회 성공. metric={metric} (LLM 오류)"

    answer_blocks = _build_answer_blocks(metric, result, biz_date)
    return APIResponse(status="success", data={
        "answer": answer, "domain": domain,
        "answerBlocks": answer_blocks,
        "sources": [{"type": "gold_table", "metric": metric, "summary": f"조회 기준 {biz_date}"}],
        "data": result, "latency_ms": round((time.time() - start) * 1000),
        "debug": {"domain": domain, "metric": metric, "confidence": routing["confidence"],
                  "rowCount": rc, "query_latency_ms": qms, "llm_latency_ms": llms},
    })