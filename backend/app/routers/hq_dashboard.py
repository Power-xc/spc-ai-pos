"""HQ Dashboard menu APIs — gold-table backed endpoints for all dashboard menus."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_postgres_db, get_current_user_context
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/hq", tags=["hq-dashboard"])
logger = logging.getLogger(__name__)

G = "dunkin_mart_copy"

DEMO_DATE = date(2026, 3, 5)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _p(d: date = DEMO_DATE) -> dict:
    from datetime import timedelta
    d7 = d - timedelta(days=7)
    return {"d": d, "d7": d7}


async def qall(db: AsyncSession, sql: str, params: dict | None = None) -> list[dict]:
    result = await db.execute(text(sql), params or {})
    return [{k: v for k, v in dict(row).items()} for row in result.mappings()]


async def qone(db: AsyncSession, sql: str, params: dict | None = None) -> dict | None:
    result = await db.execute(text(sql), params or {})
    row = result.mappings().first()
    return {k: v for k, v in dict(row).items()} if row else None


def _wrap(
    as_of: date,
    summary: dict | None = None,
    kpis: list[dict] | None = None,
    tables: list[dict] | None = None,
    charts: list[dict] | None = None,
    insights: list[str] | None = None,
    sources: list[dict] | None = None,
) -> dict:
    return {
        "asOfDate": str(as_of),
        "scope": "HQ",
        "region": "전체",
        "storeId": None,
        "summary": summary or {},
        "kpis": kpis or [],
        "tables": tables or [],
        "charts": charts or [],
        "insights": insights or [],
        "sources": sources or [],
    }


# ── 1. /api/hq/summary (종합현황) ──────────────────────────────────────────

@router.get("/summary")
async def api_hq_summary(
    asOfDate: date | None = Query(None, description="기준일"),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ summary: asOfDate=%s", d)

    r = await qone(db, f"""
    WITH k AS (
        SELECT store_id, total_sales::float, stockout_sku_cnt, waste_total::float,
               total_qty::float AS qty, discount_total::float AS disc
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    ),
    ds AS (
        SELECT store_id, store_name, region FROM {G}.dim_store
    ),
    ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)
        GROUP BY store_id
    ),
    scored AS (
        SELECT ds.store_id, ds.store_name, ds.region,
               COALESCE(k.total_sales, 0)::float AS sales,
               COALESCE(k.stockout_sku_cnt, 0) AS so_skus,
               COALESCE(ir.ri, 0) AS inv_ri,
               CASE WHEN COALESCE(ir.ri, 0) >= 50 THEN 'risk'
                    WHEN COALESCE(ir.ri, 0) >= 40 THEN 'warning' ELSE 'normal' END AS status
        FROM ds LEFT JOIN k ON k.store_id = ds.store_id LEFT JOIN ir ON ir.store_id = ds.store_id
    )
    SELECT
        (SELECT COUNT(*) FROM ds) AS total_stores,
        (SELECT COUNT(*) FROM k) AS stores_with_sales,
        (SELECT COALESCE(SUM(total_sales), 0)::float FROM k) AS total_sales,
        (SELECT COALESCE(SUM(stockout_sku_cnt), 0) FROM k) AS total_so_skus,
        (SELECT COUNT(*) FROM scored WHERE status='risk') AS risk_cnt,
        (SELECT COUNT(*) FROM scored WHERE status='warning') AS warn_cnt,
        (SELECT COUNT(*) FROM scored WHERE status='normal') AS norm_cnt,
        COALESCE((SELECT COUNT(*) FROM dunkin_mart.alerts WHERE read_at IS NULL), 0)::int AS unread_alerts,
        COALESCE((SELECT COUNT(*) FROM dunkin_mart.alerts WHERE title LIKE '%%긴급%%'), 0)::int AS urgent_alerts
    """, _p(d))

    top5 = await qall(db, f"""
    SELECT ds.store_id, ds.store_name, ds.region, k.total_sales::float
    FROM {G}.new_kpi_store_day_gold k JOIN {G}.dim_store ds ON ds.store_id = k.store_id
    WHERE k.biz_date = :d ORDER BY k.total_sales DESC LIMIT 5""", _p(d))

    alerts = await qall(db, """
    SELECT store_id, title, severity, occurred_at::text AS occurred_at
    FROM dunkin_mart.alerts WHERE read_at IS NULL ORDER BY occurred_at DESC LIMIT 5""")

    logger.info("HQ summary: total_stores=%d stores_with_sales=%d", r.get("total_stores", 0), r.get("stores_with_sales", 0))

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_stores": r["total_stores"], "stores_with_sales": r["stores_with_sales"],
                     "risk": r["risk_cnt"], "warning": r["warn_cnt"], "normal": r["norm_cnt"]},
            kpis=[
                {"label": "전체 점포", "value": f"{r['total_stores']}개", "sub": f"매출 집계 {r['stores_with_sales']}개"},
                {"label": "전체 매출", "value": f"₩{r['total_sales']:,.0f}" if r['total_sales'] else "₩0"},
                {"label": "위험 점포", "value": f"{r['risk_cnt']}개"},
                {"label": "주의 점포", "value": f"{r['warn_cnt']}개"},
                {"label": "미확인 공지", "value": f"{r['unread_alerts']}건"},
            ],
            tables=[{"title": "매출 TOP5 점포", "columns": ["점포", "매출", "지역"],
                     "rows": [[s["store_name"], f"₩{s['total_sales']:,.0f}", s["region"]] for s in top5]}],
            sources=[{"label": "골드 KPI 집계", "asOfDate": str(d)},
                     {"label": "점포 master", "asOfDate": str(d)},
                     {"label": "재고 위험 집계", "asOfDate": str(d)}]),
        "alerts": alerts,
    })


# ── 2. /api/hq/store-operations (점포운영) ──────────────────────────────────

@router.get("/store-operations")
async def api_hq_store_ops(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ store-operations: asOfDate=%s", d)

    stores = await qall(db, f"""
    WITH k AS (
        SELECT store_id, total_sales::float, stockout_sku_cnt
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    ), ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)
        GROUP BY store_id
    )
    SELECT ds.store_id, ds.store_name, ds.region, ds.city,
           COALESCE(k.total_sales, 0)::float AS sales,
           COALESCE(k.stockout_sku_cnt, 0) AS so_skus,
           COALESCE(ir.ri, 0) AS inv_ri,
            CASE WHEN COALESCE(ir.ri, 0) >= 50 THEN 'risk'
                 WHEN COALESCE(ir.ri, 0) >= 40 THEN 'warning' ELSE 'normal' END AS status
    FROM {G}.dim_store ds
    LEFT JOIN k ON k.store_id = ds.store_id
    LEFT JOIN ir ON ir.store_id = ds.store_id
    ORDER BY inv_ri DESC
    """, _p(d))

    risk = [s for s in stores if s["status"] == "risk"]
    warn = [s for s in stores if s["status"] == "warning"]
    normal = [s for s in stores if s["status"] == "normal"]

    alerts = await qall(db, """
    SELECT store_id, title, severity, summary, occurred_at::text AS occurred_at
    FROM dunkin_mart.alerts ORDER BY occurred_at DESC LIMIT 10""")

    logger.info("HQ store-ops: risk=%d warn=%d normal=%d", len(risk), len(warn), len(normal))

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"risk": len(risk), "warning": len(warn), "normal": len(normal), "total": len(stores)},
            kpis=[
                {"label": "위험", "value": f"{len(risk)}개"},
                {"label": "주의", "value": f"{len(warn)}개"},
                {"label": "정상", "value": f"{len(normal)}개"},
                {"label": "전체", "value": f"{len(stores)}개"},
            ],
            tables=[
                {"title": "위험 점포", "columns": ["점포", "지역", "위험품목", "품절SKU"],
                 "rows": [[s["store_name"], s["region"], s["inv_ri"], s["so_skus"]] for s in risk]},
                {"title": "주의 점포", "columns": ["점포", "지역", "위험품목", "품절SKU"],
                 "rows": [[s["store_name"], s["region"], s["inv_ri"], s["so_skus"]] for s in warn[:10]]},
            ],
            sources=[{"label": "골드 KPI + 재고위험", "asOfDate": str(d)}]),
        "stores": stores,
        "alerts": alerts,
    })


# ── 3. /api/hq/store-status (점포현황) ──────────────────────────────────────

@router.get("/store-status")
async def api_hq_store_status(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ store-status: asOfDate=%s", d)

    all_stores = await qall(db, f"""
    WITH k AS (
        SELECT store_id, total_sales::float, stockout_sku_cnt,
               total_qty::float AS qty, waste_total::float AS waste
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    ), lw AS (
        SELECT store_id, total_sales::float AS lw
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d7
    ), ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)
        GROUP BY store_id
    ), ls AS (
        SELECT store_id, COUNT(*)::int AS low_cnt
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :d AND on_hand_eod > 0 AND on_hand_eod <= 2
        GROUP BY store_id
    )
    SELECT ds.store_id, ds.store_name, ds.region, ds.city,
           COALESCE(k.total_sales, 0)::float AS sales,
           COALESCE(lw.lw, 0)::float AS lw_sales,
           COALESCE(k.stockout_sku_cnt, 0) AS so_skus,
           COALESCE(ir.ri, 0) AS inv_ri,
           COALESCE(ls.low_cnt, 0) AS low_stock,
           CASE WHEN COALESCE(ir.ri, 0) >= 50 THEN 'risk'
                WHEN COALESCE(ir.ri, 0) >= 40 THEN 'warning' ELSE 'normal' END AS status
    FROM {G}.dim_store ds
    LEFT JOIN k ON k.store_id = ds.store_id
    LEFT JOIN lw ON lw.store_id = ds.store_id
    LEFT JOIN ir ON ir.store_id = ds.store_id
    LEFT JOIN ls ON ls.store_id = ds.store_id
    ORDER BY ds.region, ds.store_id
    """, _p(d))

    region_summary = await qall(db, f"""
    WITH k AS (
        SELECT store_id, total_sales::float
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    )
    SELECT ds.region, COUNT(*) AS store_cnt,
           COUNT(k.store_id) AS active_cnt,
           COALESCE(SUM(k.total_sales), 0)::float AS region_sales
    FROM {G}.dim_store ds
    LEFT JOIN k ON k.store_id = ds.store_id
    GROUP BY ds.region ORDER BY region_sales DESC
    """, _p(d))

    summary = {"total_stores": len(all_stores),
               "risk": sum(1 for s in all_stores if s["status"] == "risk"),
               "warning": sum(1 for s in all_stores if s["status"] == "warning"),
               "normal": sum(1 for s in all_stores if s["status"] == "normal")}

    logger.info("HQ store-status: total=%d regions=%d", len(all_stores), len(region_summary))

    STATUS_KR = {"risk": "위험", "warning": "주의", "normal": "정상"}

    return APIResponse(status="success", data={
        **_wrap(d,
            summary=summary,
            kpis=[{"label": "전체 점포", "value": f"{summary['total_stores']}개"},
                  {"label": "위험", "value": f"{summary['risk']}개"},
                  {"label": "주의", "value": f"{summary['warning']}개"},
                  {"label": "정상", "value": f"{summary['normal']}개"}],
            tables=[
                {"title": "지역별 요약", "columns": ["지역", "전체", "매출발생", "매출"],
                 "rows": [[r["region"], r["store_cnt"], r["active_cnt"],
                           f"₩{r['region_sales']:,.0f}"] for r in region_summary]},
                 {"title": "점포별 현황", "columns": ["점포", "지역", "상태", "품절", "저재고", "일발주", "id"],
                  "rows": [[s["store_name"], s["region"], STATUS_KR.get(s["status"], s["status"]),
                            s["so_skus"], s["low_stock"], int(s["sales"]), s["store_id"]]
                          for s in all_stores]},
            ],
            sources=[{"label": "점포 master + KPI", "asOfDate": str(d)}]),
        "stores": all_stores,
        "regions": region_summary,
    })


# ── 4. /api/hq/sales-analysis (매출분석) ────────────────────────────────────

@router.get("/sales-analysis")
async def api_hq_sales_analysis(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ sales-analysis: asOfDate=%s", d)

    r = await qone(db, f"""
    WITH today AS (
        SELECT COALESCE(SUM(total_sales), 0)::float AS sales,
               COALESCE(SUM(total_qty)::numeric, 0)::float AS qty,
               COUNT(DISTINCT store_id) AS active_stores
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    ), last_wk AS (
        SELECT COALESCE(SUM(total_sales), 0)::float AS sales
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d7
    )
    SELECT t.sales, t.qty, t.active_stores, l.sales AS lw_sales
    FROM today t, last_wk l
    """, _p(d))

    top5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           lw.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id = s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold lw ON lw.store_id = s.store_id
           AND lw.biz_date = :d7
    WHERE s.biz_date = :d ORDER BY s.total_sales DESC LIMIT 5""", _p(d))

    bot5 = await qall(db, f"""
    SELECT s.store_id, d.store_name, d.region, s.total_sales::float,
           lw.total_sales::float AS lw_sales
    FROM {G}.new_kpi_store_day_gold s
    JOIN {G}.dim_store d ON d.store_id = s.store_id
    LEFT JOIN {G}.new_kpi_store_day_gold lw ON lw.store_id = s.store_id
           AND lw.biz_date = :d7
    WHERE s.biz_date = :d AND s.total_sales > 0
    ORDER BY s.total_sales ASC LIMIT 5""", _p(d))

    wow_pct = round((r["sales"] - r["lw_sales"]) / r["lw_sales"] * 100, 1) if r["lw_sales"] > 0 else None

    top_products = await qall(db, f"""
    SELECT product_name, category, SUM(sale_amt)::float AS total_sales,
           SUM(sold_qty)::float AS total_qty,
           COUNT(DISTINCT store_id) AS store_cnt
    FROM {G}.new_product_sales_day_gold WHERE biz_date = :d
    GROUP BY product_name, category ORDER BY total_sales DESC LIMIT 10""", _p(d))

    logger.info("HQ sales: total=%.0f wow=%.1f active=%d", r["sales"], wow_pct or 0, r["active_stores"])

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_sales": r["sales"], "total_qty": r["qty"],
                     "last_week_sales": r["lw_sales"], "wow_pct": wow_pct,
                     "active_stores": r["active_stores"]},
            kpis=[
                {"label": "전체 매출", "value": f"₩{r['sales']:,.0f}"},
                {"label": "전주 대비", "value": f"{'+' if wow_pct and wow_pct > 0 else ''}{wow_pct:.1f}%"} if wow_pct is not None else None,
                {"label": "매출 점포", "value": f"{r['active_stores']}개 (전체 33개)"},
                {"label": "총 수량", "value": str(int(r['qty']))},
            ],
            tables=[
                {"title": "매출 상위 TOP5", "columns": ["점포", "매출", "전주", "증감%"],
                 "rows": [[s["store_name"], f"₩{s['total_sales']:,.0f}",
                           f"₩{s['lw_sales']:,.0f}" if s.get('lw_sales') else "₩0",
                           f"{'+' if (s['total_sales']-(s.get('lw_sales') or 0))>0 else ''}{( (s['total_sales']-(s.get('lw_sales') or 0)) / (s.get('lw_sales') or 1) * 100):.1f}%"]
                          for s in top5]},
                {"title": "매출 하위 TOP5", "columns": ["점포", "매출", "전주", "증감%"],
                 "rows": [[s["store_name"], f"₩{s['total_sales']:,.0f}",
                           f"₩{s['lw_sales']:,.0f}" if s.get('lw_sales') else "₩0",
                           f"{'+' if (s['total_sales']-(s.get('lw_sales') or 0))>0 else ''}{( (s['total_sales']-(s.get('lw_sales') or 0)) / (s.get('lw_sales') or 1) * 100):.1f}%"]
                          for s in bot5]},
                {"title": "품목별 매출 TOP10", "columns": ["품목", "카테고리", "매출", "수량", "점포수"],
                 "rows": [[p["product_name"], p["category"], f"₩{p['total_sales']:,.0f}",
                           str(int(p['total_qty'])), p["store_cnt"]] for p in top_products]},
            ],
            sources=[{"label": "골드 KPI + 품목매출", "asOfDate": str(d)}]),
    })


# ── 5. /api/hq/inventory (재고) ────────────────────────────────────────────

@router.get("/inventory")
async def api_hq_inventory(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ inventory: asOfDate=%s", d)

    risky_items = await qall(db, f"""
    SELECT product_name, category,
           COUNT(DISTINCT store_id)::int AS affected_stores,
           SUM(CASE WHEN on_hand_eod <= 0 THEN 1 ELSE 0 END)::int AS stockout_count,
           ROUND(AVG(on_hand_eod), 1) AS avg_on_hand,
           ROUND(AVG(days_of_supply), 1) AS avg_dos
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date = :d AND on_hand_eod <= 3
    GROUP BY product_name, category
    ORDER BY affected_stores DESC, stockout_count DESC, avg_on_hand ASC
    LIMIT 15""", _p(d))

    risky_stores = await qall(db, f"""
    SELECT store_id, COUNT(*)::int AS risk_cnt,
           SUM(CASE WHEN on_hand_eod <= 0 THEN 1 ELSE 0 END)::int AS so_items,
           SUM(CASE WHEN on_hand_eod BETWEEN 1 AND 2 THEN 1 ELSE 0 END)::int AS low_items
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)
    GROUP BY store_id ORDER BY risk_cnt DESC LIMIT 15""", _p(d))

    total_risk = sum(s["risk_cnt"] for s in risky_stores)

    logger.info("HQ inventory: risky_items=%d risky_stores=%d total_risk=%d",
                len(risky_items), len(risky_stores), total_risk)

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_risk_items": total_risk, "risky_store_count": len(risky_stores)},
            kpis=[
                {"label": "위험 품목 건수", "value": f"{total_risk}건"},
                {"label": "위험 점포 수", "value": f"{len(risky_stores)}개"},
                {"label": "품절 품목", "value": f"{len(risky_items)}개"},
            ],
            tables=[
                {"title": "위험 품목 TOP15", "columns": ["품목", "카테고리", "위험점포", "품절건", "평균재고", "공급일"],
                 "rows": [[i["product_name"], i["category"], i["affected_stores"], i["stockout_count"],
                           i["avg_on_hand"], i["avg_dos"]] for i in risky_items]},
                {"title": "위험 점포 TOP15", "columns": ["점포", "위험건", "품절", "저재고"],
                 "rows": [[s["store_id"], s["risk_cnt"], s["so_items"], s["low_items"]] for s in risky_stores]},
            ],
            sources=[{"label": "골드 재고위험", "asOfDate": str(d)}]),
    })


# ── 6. /api/hq/campaigns (캠페인) ───────────────────────────────────────────

@router.get("/campaigns")
async def api_hq_campaigns(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ campaigns: asOfDate=%s", d)

    campaigns = await qall(db, f"""
    SELECT campaign_id, campaign_name,
           SUM(sales_amt)::float AS total_sales,
           SUM(bill_cnt)::int AS total_bills,
           COUNT(DISTINCT store_id)::int AS store_cnt,
           AVG(sales_amt)::float AS avg_sales
    FROM {G}.new_campaign_day_gold WHERE biz_date = :d
    GROUP BY campaign_id, campaign_name ORDER BY total_sales DESC""", _p(d))

    total_sales_all = sum(c["total_sales"] for c in campaigns)
    total_bills_all = sum(c["total_bills"] for c in campaigns)

    logger.info("HQ campaigns: count=%d total_sales=%.0f total_bills=%d", len(campaigns), total_sales_all, total_bills_all)

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_campaigns": len(campaigns), "total_sales": total_sales_all, "total_bills": total_bills_all},
            kpis=[
                {"label": "캠페인 수", "value": f"{len(campaigns)}개"},
                {"label": "총 매출", "value": f"₩{total_sales_all:,.0f}"},
                {"label": "총 거래건", "value": f"{total_bills_all}건"},
            ],
            tables=[{"title": "캠페인 성과", "columns": ["캠페인", "총매출", "거래건", "점포수", "평균매출"],
                     "rows": [[c["campaign_name"], f"₩{c['total_sales']:,.0f}", c["total_bills"],
                               c["store_cnt"], f"₩{c['avg_sales']:,.0f}"] for c in campaigns]}],
            sources=[{"label": "골드 캠페인", "asOfDate": str(d)}]),
    })


# ── 7. /api/hq/notices (공지) ──────────────────────────────────────────────

@router.get("/notices")
async def api_hq_notices(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ notices: asOfDate=%s", d)

    by_severity = await qall(db, """
    SELECT severity, status,
           SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END)::int AS unread,
           COUNT(*)::int AS total
    FROM dunkin_mart.alerts GROUP BY severity, status ORDER BY severity DESC""")

    unread = await qall(db, """
    SELECT store_id, severity, title, summary, occurred_at::text AS occurred_at
    FROM dunkin_mart.alerts WHERE read_at IS NULL ORDER BY occurred_at DESC LIMIT 15""")

    urgent = await qall(db, """
    SELECT store_id, title, severity, summary, occurred_at::text AS occurred_at
    FROM dunkin_mart.alerts WHERE severity IN ('critical','high') OR title LIKE '%%긴급%%'
    ORDER BY occurred_at DESC LIMIT 15""")

    recent = await qall(db, """
    SELECT store_id, title, severity, summary, occurred_at::text AS occurred_at
    FROM dunkin_mart.alerts ORDER BY occurred_at DESC LIMIT 20""")

    logger.info("HQ notices: unread=%d urgent=%d recent=%d", len(unread), len(urgent), len(recent))

    sev_kr = {"critical": "긴급", "high": "주의", "medium": "안내", "low": "공지", "info": "공지"}
    notice_rows = []
    for a in recent:
        sev = a.get("severity", "info")
        tag = sev_kr.get(sev, sev)
        is_urg = sev in ("critical", "high") or "긴급" in a.get("title", "")
        tag = "긴급" if is_urg else tag
        date_str = (a.get("occurred_at") or "")[:10]
        notice_rows.append([a.get("title", ""), tag, date_str])
    for a in urgent:
        title = a.get("title", "")
        if not any(r[0] == title for r in notice_rows):
            sev = a.get("severity", "critical")
            tag = sev_kr.get(sev, "긴급")
            date_str = (a.get("occurred_at") or "")[:10]
            notice_rows.insert(0, [title, "긴급" if "긴급" in title else tag, date_str])

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"unread": len(unread), "urgent": len(urgent)},
            kpis=[
                {"label": "미확인 공지", "value": f"{len(unread)}건"},
                {"label": "긴급 알림", "value": f"{len(urgent)}건"},
            ],
            tables=[{"title": "공지사항", "columns": ["제목", "상태", "일자"], "rows": notice_rows}],
            sources=[{"label": "dunkin_mart.alerts"}]),
        "unread": unread,
        "urgent": urgent,
        "recent": recent,
        "by_severity": by_severity,
    })


# ── 8. /api/hq/reports (리포트) ─────────────────────────────────────────────

@router.get("/reports")
async def api_hq_reports(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ reports: asOfDate=%s", d)

    kpi_total = await qone(db, f"""
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(total_sales), 0)::float AS sales,
           COALESCE(SUM(total_qty)::numeric, 0)::float AS qty,
           COALESCE(SUM(stockout_sku_cnt), 0)::int AS so_skus,
           COALESCE(SUM(waste_total), 0)::float AS waste,
           COALESCE(SUM(discount_total), 0)::float AS discount
    FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d""", _p(d))

    kpi_lw = await qone(db, f"""
    SELECT COALESCE(SUM(total_sales), 0)::float AS sales
    FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d7""", _p(d))

    inv_total = await qone(db, f"""
    SELECT COUNT(*)::int AS total_risk,
           COUNT(DISTINCT store_id)::int AS risky_stores
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)""", _p(d))

    stockout_top = await qall(db, f"""
    SELECT product_name, COUNT(DISTINCT store_id)::int AS affected
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date = :d AND on_hand_eod <= 0
    GROUP BY product_name ORDER BY affected DESC LIMIT 5""", _p(d))

    wow_pct = None
    if kpi_lw and kpi_lw["sales"] > 0 and kpi_total and kpi_total["sales"]:
        wow_pct = round((kpi_total["sales"] - kpi_lw["sales"]) / kpi_lw["sales"] * 100, 1)

    logger.info("HQ reports: sales=%.0f inv_risk=%d", kpi_total["sales"] if kpi_total else 0,
                inv_total["total_risk"] if inv_total else 0)

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_sales": kpi_total["sales"] if kpi_total else 0,
                     "last_week_sales": kpi_lw["sales"] if kpi_lw else 0,
                     "wow_pct": wow_pct,
                     "stores": kpi_total["cnt"] if kpi_total else 0,
                     "total_risk": inv_total["total_risk"] if inv_total else 0},
            kpis=[
                {"label": "전체 매출", "value": f"₩{kpi_total['sales']:,.0f}" if kpi_total else "₩0"},
                {"label": "전주 대비", "value": f"{'+' if wow_pct and wow_pct > 0 else ''}{wow_pct:.1f}%" if wow_pct is not None else "N/A"},
                {"label": "매출 점포", "value": f"{kpi_total['cnt']}개" if kpi_total else "0개"},
                {"label": "재고 위험", "value": f"{inv_total['total_risk']}건" if inv_total else "0건"},
                {"label": "위험 품목", "value": f"{inv_total['risky_stores']}개점포" if inv_total else "0개"},
            ],
            tables=[{"title": "품절 TOP5 품목", "columns": ["품목", "품절점포"],
                     "rows": [[s["product_name"], s["affected"]] for s in stockout_top]}],
            sources=[{"label": "골드 KPI + 재고위험", "asOfDate": str(d)}]),
    })


# ── 9. /api/hq/ai-insights (AI인사이트) ──────────────────────────────────────

@router.get("/ai-insights")
async def api_hq_ai_insights(
    asOfDate: date | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
    _ctx = Depends(get_current_user_context),
):
    d = asOfDate or DEMO_DATE
    logger.info("HQ ai-insights: asOfDate=%s", d)

    health = await qall(db, f"""
    WITH ir AS (
        SELECT store_id, COUNT(*)::int AS ri
        FROM {G}.new_inventory_risk_day_gold
        WHERE biz_date = :d AND (on_hand_eod <= 2 OR days_of_supply <= 1)
        GROUP BY store_id
    )
    SELECT ds.store_id, ds.store_name, ds.region,
           COALESCE(k.total_sales, 0)::float AS sales,
           COALESCE(ir.ri, 0) AS inv_ri,
            CASE WHEN COALESCE(ir.ri, 0) >= 50 THEN 'risk'
                 WHEN COALESCE(ir.ri, 0) >= 40 THEN 'warning' ELSE 'normal' END AS status
    FROM {G}.dim_store ds
    LEFT JOIN {G}.new_kpi_store_day_gold k ON k.store_id = ds.store_id AND k.biz_date = :d
    LEFT JOIN ir ON ir.store_id = ds.store_id
    ORDER BY inv_ri DESC, COALESCE(k.total_sales, 0) DESC
    """, _p(d))

    risk_top = [h for h in health if h["status"] == "risk"][:10]
    warn_list = [h for h in health if h["status"] == "warning"][:15]
    normal_list = [h for h in health if h["status"] == "normal"]

    wow = await qone(db, f"""
    WITH tk AS (
        SELECT COALESCE(SUM(total_sales), 0)::float AS s
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d
    ), lk AS (
        SELECT COALESCE(SUM(total_sales), 0)::float AS s
        FROM {G}.new_kpi_store_day_gold WHERE biz_date = :d7
    ) SELECT tk.s AS today, lk.s AS last_week FROM tk, lk""", _p(d))

    wow_pct = round((wow["today"] - wow["last_week"]) / wow["last_week"] * 100, 1) if wow and wow["last_week"] > 0 else None

    risk_items = await qall(db, f"""
    SELECT product_name, COUNT(DISTINCT store_id)::int AS affected
    FROM {G}.new_inventory_risk_day_gold
    WHERE biz_date = :d AND on_hand_eod <= 0
    GROUP BY product_name ORDER BY affected DESC LIMIT 5""", _p(d))

    insights = []
    if wow_pct is not None:
        insights.append(f"전체 매출 전주 대비 {'+' if wow_pct > 0 else ''}{wow_pct:.1f}%(₩{wow['today']:,.0f})")
    insights.append(f"위험 점포 {len(risk_top)}개, 주의 {len(warn_list)}개, 정상 {len(normal_list)}개")
    if risk_items:
        insights.append(f"품절 TOP 품목: {risk_items[0]['product_name']}({risk_items[0]['affected']}개점포)")

    logger.info("HQ ai-insights: risk=%d warn=%d normal=%d", len(risk_top), len(warn_list), len(normal_list))

    return APIResponse(status="success", data={
        **_wrap(d,
            summary={"total_stores": len(health), "risk": len(risk_top), "warning": len(warn_list),
                     "normal": len(normal_list), "total_sales": wow["today"] if wow else 0,
                     "wow_pct": wow_pct},
            kpis=[
                {"label": "위험 점포", "value": f"{len(risk_top)}개"},
                {"label": "주의 점포", "value": f"{len(warn_list)}개"},
                {"label": "정상 점포", "value": f"{len(normal_list)}개"},
                {"label": "전체 매출", "value": f"₩{wow['today']:,.0f}" if wow else "₩0"},
                {"label": "전주 대비", "value": f"{'+' if wow_pct and wow_pct > 0 else ''}{wow_pct:.1f}%" if wow_pct is not None else "N/A"},
            ],
            tables=[
                {"title": "위험 점포 TOP10", "columns": ["점포", "지역", "위험품목", "매출"],
                 "rows": [[s["store_name"], s["region"], s["inv_ri"],
                           f"₩{s['sales']:,.0f}"] for s in risk_top]},
                {"title": "품절 TOP5", "columns": ["품목", "품절점포"],
                 "rows": [[i["product_name"], i["affected"]] for i in risk_items]},
            ],
            insights=insights,
            sources=[{"label": "골드 KPI + 재고위험", "asOfDate": str(d)}]),
    })
