"""File-backed data query helpers for the local POC dataset."""

from __future__ import annotations

import logging
import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import SCHEMA_NAME
from app.demo_store_config import (
    DEMO_BENCHMARK_STORE_COUNT,
    canonical_store_name,
    canonical_store_record,
    is_hidden_store_id,
    normalize_store_id,
)
from app.services import manual_inputs

logger = logging.getLogger(__name__)

OPERATING_MINUTES = 840
GOLD_SCHEMA = "dunkin_mart_copy"
APP_SCHEMA = SCHEMA_NAME or "public"
DEFAULT_HOURLY_PROFILE = {
    8: 0.03,
    9: 0.04,
    10: 0.05,
    11: 0.07,
    12: 0.09,
    13: 0.08,
    14: 0.08,
    15: 0.09,
    16: 0.10,
    17: 0.11,
    18: 0.11,
    19: 0.08,
    20: 0.05,
    21: 0.03,
}

ORDER_CATEGORY_DRINK_KEYWORDS = [
    "아메리카노",
    "라떼",
    "커피",
    "콜드브루",
    "에이드",
    "티",
    "쉐이크",
    "스무디",
    "음료",
]
ORDER_CATEGORY_MISC_KEYWORDS = [
    "베이글",
    "샌드",
    "머핀",
    "쿠키",
    "브레드",
    "핫도그",
    "브리또",
    "토스트",
    "와플",
    "케이크",
    "타르트",
]
MANUAL_ORDER_BEAN_KEYWORDS = [
    "원두",
    "빈",
    "드립백",
]
MANUAL_ORDER_COLD_KEYWORDS = [
    "우유",
    "버터",
    "크림",
    "치즈",
    "시럽",
    "냉동",
    "냉장",
    "생크림",
    "크림치즈",
]
MANUAL_ORDER_SUPPLY_KEYWORDS = [
    "비닐",
    "쇼핑백",
    "컵",
    "빨대",
    "뚜껑",
    "캐리어",
    "냅킨",
    "포장",
    "박스",
    "세트",
    "팩",
    "개입",
    "먼치킨컵",
    "스푼",
    "포크",
    "홀더",
    "용품",
    "부자재",
]


def _normalize_order_category(category: str | None) -> str | None:
    if not category:
        return None
    normalized = str(category).strip()
    if normalized in {"푸드", "케이크"}:
        return "기타"
    return normalized


def _infer_order_category_name(name: str | None) -> str:
    value = str(name or "")
    if any(keyword in value for keyword in ORDER_CATEGORY_DRINK_KEYWORDS):
        return "음료"
    if any(keyword in value for keyword in ORDER_CATEGORY_MISC_KEYWORDS):
        return "기타"
    return "도넛"


def _infer_manual_catalog_category(
    name: str | None,
    raw_category: str | None = None,
) -> str:
    value = str(name or "")
    raw = str(raw_category or "")
    combined = f"{raw} {value}"
    if any(keyword in combined for keyword in MANUAL_ORDER_BEAN_KEYWORDS):
        return "커피원두"
    if any(keyword in combined for keyword in MANUAL_ORDER_COLD_KEYWORDS):
        return "냉동/냉장"
    if any(keyword in combined for keyword in MANUAL_ORDER_SUPPLY_KEYWORDS):
        return "용품/상품"
    if any(keyword in combined for keyword in ORDER_CATEGORY_DRINK_KEYWORDS):
        return "음료"
    return "도넛"


def _order_category_case(expr: str) -> str:
    drink_conditions = " OR ".join([f"{expr} ILIKE '%{keyword}%'" for keyword in ORDER_CATEGORY_DRINK_KEYWORDS])
    misc_conditions = " OR ".join([f"{expr} ILIKE '%{keyword}%'" for keyword in ORDER_CATEGORY_MISC_KEYWORDS])
    return f"""
        CASE
            WHEN {drink_conditions} THEN '음료'
            WHEN {misc_conditions} THEN '기타'
            ELSE '도넛'
        END
    """


def _estimate_order_quantity(
    sold_qty: float | int | None,
    waste_qty: float | int | None,
    stockout_minutes: float | int | None,
) -> int:
    sold = max(_number(sold_qty), 0.0)
    waste = max(_number(waste_qty), 0.0)
    stockout = max(_number(stockout_minutes), 0.0)
    stockout_uplift = sold * min(stockout / OPERATING_MINUTES, 0.25)
    estimated = sold + waste + stockout_uplift
    return max(int(round(estimated)), 0)


def _is_async_session(db: Any) -> bool:
    return isinstance(db, AsyncSession)


async def _fetch_gold_one(db: AsyncSession, sql: str, params: dict[str, Any]) -> dict[str, Any] | None:
    result = await db.execute(text(sql), params)
    row = result.mappings().first()
    return dict(row) if row else None


async def _fetch_gold_all(db: AsyncSession, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    result = await db.execute(text(sql), params)
    return [dict(row) for row in result.mappings().all()]


def _named_list_params(prefix: str, values: list[str] | tuple[str, ...]) -> tuple[str, dict[str, Any]]:
    params: dict[str, Any] = {}
    placeholders: list[str] = []
    for index, value in enumerate(values):
        key = f"{prefix}_{index}"
        placeholders.append(f":{key}")
        params[key] = str(value)
    if not placeholders:
        return "NULL", params
    return ", ".join(placeholders), params


def _number(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return default


def _canonical_store_name(store_id: Any, fallback: Any = None) -> str:
    return canonical_store_name(str(store_id or ""), None if fallback is None else str(fallback))


def _store(db):
    data_store = getattr(db, "data_store", None)
    if data_store is None:
        raise RuntimeError("File-backed data store is not configured.")
    return data_store


def _to_timestamp(value: date | str | None) -> pd.Timestamp | None:
    if value is None:
        return None
    return pd.Timestamp(value).normalize()


def _to_iso(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _safe_pct_change(current: float, previous: float) -> float | None:
    if previous in (0, None):
        return None
    return round(((current - previous) / previous) * 100, 1)


def _sellable_mask(frame: pd.DataFrame) -> pd.Series:
    """Exclude disposables and zero-priced support items from customer-facing analysis."""
    return pd.to_numeric(frame["base_price"], errors="coerce").fillna(0) > 0


def _inventory_frame(db, store_id: str | None = None) -> pd.DataFrame:
    frame = _store(db).fact_inventory_day
    frame = frame[_sellable_mask(frame)]
    if store_id:
        frame = frame[frame["store_id"] == str(store_id)]
    return frame


def _manual_data_dir(db) -> str | None:
    if _is_async_session(db):
        try:
            from app.config import get_settings

            return str(get_settings().data_dir or "").strip() or None
        except Exception:
            return None
    try:
        return str(getattr(_store(db), "data_dir", "") or "").strip() or None
    except Exception:
        return None


def _sales_frame(db, store_id: str | None = None) -> pd.DataFrame:
    frame = _store(db).fact_sales_item_daily
    if "base_price" in frame.columns:
        frame = frame[_sellable_mask(frame)]
    if store_id:
        frame = frame[frame["store_id"] == str(store_id)]
    return frame


def _order_frame(db, store_id: str | None = None) -> pd.DataFrame:
    frame = _store(db).order_day
    if store_id:
        frame = frame[frame["store_id"] == str(store_id)]
    return frame


def _summarize_order_rows(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    grouped = (
        frame.groupby(
            ["product_id", "product_name", "category", "order_degree_name", "order_unit_price"],
            as_index=False,
        )
        .agg(
            order_qty=("order_qty", "sum"),
            confirmed_qty=("confirmed_qty", "sum"),
            recommended_qty=("recommended_qty", "sum"),
            effective_order_qty=("effective_order_qty", "sum"),
            effective_order_amt=("effective_order_amt", "sum"),
        )
        .rename(columns={"order_unit_price": "base_price"})
        .sort_values(["effective_order_qty", "product_name"], ascending=[False, True])
    )
    return grouped.to_dict(orient="records")


async def get_latest_biz_date(db, store_id: str) -> date:
    if _is_async_session(db):
        try:
            row = await _fetch_gold_one(
                db,
                f"""
                SELECT max(biz_date) AS biz_date
                FROM (
                    SELECT max(biz_date) AS biz_date
                    FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                    WHERE store_id = :store_id
                    UNION ALL
                    SELECT max(biz_date) AS biz_date
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                    UNION ALL
                    SELECT max(biz_date) AS biz_date
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE store_id = :store_id
                ) latest_dates
                """,
                {"store_id": str(store_id)},
            )
            return row["biz_date"] if row and row.get("biz_date") else date.today()
        except Exception:
            logger.exception(
                "Failed to fetch gold latest biz date for store_id=%s",
                store_id,
            )
            return date.today()
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return date.today()
        latest = frame["biz_date"].max()
        return pd.Timestamp(latest).date()
    except Exception:
        logger.exception("Failed to fetch latest biz date for store_id=%s", store_id)
        return date.today()


async def get_date_range(db) -> dict[str, str | None]:
    try:
        frame = _store(db).fact_inventory_day
        if frame.empty:
            return {"min_date": None, "max_date": None}
        return {
            "min_date": _to_iso(frame["biz_date"].min()),
            "max_date": _to_iso(frame["biz_date"].max()),
        }
    except Exception:
        logger.exception("Failed to fetch dataset date range")
        return {"min_date": None, "max_date": None}


async def get_store_list(db) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                """
                SELECT
                    store_id,
                    store_name,
                    region,
                    city,
                    timezone,
                    is_active
                FROM stores
                WHERE is_active = true
                ORDER BY store_id
                """,
                {},
            )
            normalized_rows: list[dict[str, Any]] = []
            for row in rows:
                store = canonical_store_record(row)
                if store is None:
                    continue
                normalized_rows.append(store)
            return normalized_rows
        except Exception:
            logger.exception("Failed to fetch store list from PostgreSQL")
            return []
    try:
        return _store(db).dim_store.sort_values("store_id").to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch store list")
        return []


async def get_store_info(db, store_id: str) -> dict[str, Any] | None:
    normalized_store_id = normalize_store_id(store_id)
    if is_hidden_store_id(normalized_store_id):
        return None
    if _is_async_session(db):
        try:
            row = await _fetch_gold_one(
                db,
                """
                SELECT
                    store_id,
                    store_name,
                    region,
                    city,
                    timezone,
                    is_active
                FROM stores
                WHERE store_id = :store_id
                """,
                {"store_id": normalized_store_id},
            )
            return canonical_store_record(row, normalized_store_id)
        except Exception:
            logger.exception("Failed to fetch PostgreSQL store info for store_id=%s", normalized_store_id)
            return None
    try:
        return canonical_store_record(_store(db).get_store_info(normalized_store_id), normalized_store_id)
    except Exception:
        logger.exception("Failed to fetch store info for store_id=%s", normalized_store_id)
        return None


async def lookup_product_id(db, product_name: str) -> str | None:
    if _is_async_session(db):
        try:
            exact_name = str(product_name).strip()
            if not exact_name:
                return None
            row = await _fetch_gold_one(
                db,
                f"""
                WITH candidates AS (
                    SELECT product_id, product_name, biz_date
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE product_name ILIKE :pattern
                    UNION ALL
                    SELECT product_id, product_name, biz_date
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE product_name ILIKE :pattern
                ),
                grouped AS (
                    SELECT
                        product_id,
                        max(product_name) AS product_name,
                        max(biz_date) AS last_seen
                    FROM candidates
                    GROUP BY product_id
                )
                SELECT product_id
                FROM grouped
                ORDER BY
                    CASE
                        WHEN lower(product_name) = lower(:exact_name) THEN 0
                        WHEN product_name ILIKE :prefix_pattern THEN 1
                        ELSE 2
                    END,
                    last_seen DESC,
                    product_name
                LIMIT 1
                """,
                {
                    "pattern": f"%{exact_name}%",
                    "exact_name": exact_name,
                    "prefix_pattern": f"{exact_name}%",
                },
            )
            return str(row["product_id"]) if row and row.get("product_id") else None
        except Exception:
            logger.exception(
                "Failed to lookup PostgreSQL product_id for product_name=%s",
                product_name,
            )
            return None
    try:
        return _store(db).lookup_product_id(product_name)
    except Exception:
        logger.exception("Failed to lookup product_id for product_name=%s", product_name)
        return None


async def get_store_inventory_today(
    db,
    store_id: str,
    biz_date: date | None = None,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH target_date AS (
                    SELECT COALESCE(CAST(:biz_date AS date), max(biz_date)) AS biz_date
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE store_id = :store_id
                ),
                app_products AS (
                    SELECT
                        product_id,
                        NULLIF(product_name, '') AS product_name,
                        NULLIF(category, '') AS category,
                        base_price
                    FROM {APP_SCHEMA}.products
                ),
                sales AS (
                    SELECT
                        store_id,
                        biz_date,
                        product_id,
                        max(product_name) AS product_name,
                        max(category) AS category,
                        sum(sold_qty) AS sold_qty,
                        sum(waste_qty) AS waste_qty,
                        max(stockout_minutes) AS stockout_minutes,
                        sum(sale_amt) AS sale_amt,
                        sum(net_sales_amt) AS net_sales_amt
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                    GROUP BY store_id, biz_date, product_id
                )
                SELECT
                    r.store_id,
                    r.biz_date,
                    r.product_id,
                    COALESCE(
                        ap.product_name,
                        NULLIF(s.product_name, ''),
                        NULLIF(r.product_name, ''),
                        r.product_id
                    ) AS product_name,
                    COALESCE(
                        ap.category,
                        NULLIF(s.category, ''),
                        '미분류'
                    ) AS category,
                    r.on_hand_eod,
                    COALESCE(s.sold_qty, r.sold_qty, 0) AS sold_qty,
                    COALESCE(s.waste_qty, 0) AS waste_qty,
                    COALESCE(NULLIF(s.stockout_minutes, 0), r.stockout_minutes, 0) AS stockout_minutes,
                    CASE WHEN r.on_hand_eod <= 0 THEN 1 ELSE 0 END AS reorder_triggered,
                    CASE
                        WHEN COALESCE(s.sold_qty, 0) > 0
                            THEN round(COALESCE(NULLIF(s.sale_amt, 0), s.net_sales_amt, 0) / NULLIF(s.sold_qty, 0), 2)
                        ELSE COALESCE(ap.base_price, 0)
                    END AS base_price,
                    0::numeric AS cost_price
                FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold r
                JOIN target_date t
                    ON r.biz_date = t.biz_date
                LEFT JOIN app_products ap
                    ON ap.product_id = r.product_id
                LEFT JOIN sales s
                    ON s.store_id = r.store_id
                   AND s.biz_date = r.biz_date
                   AND s.product_id = r.product_id
                WHERE r.store_id = :store_id
                ORDER BY
                     CASE WHEN r.on_hand_eod <= 0 THEN 1 ELSE 0 END DESC,
                    COALESCE(NULLIF(s.stockout_minutes, 0), r.stockout_minutes, 0) DESC,
                    COALESCE(s.sold_qty, r.sold_qty, 0) DESC,
                    COALESCE(ap.product_name, s.product_name, r.product_name, r.product_id)
                """,
                {"store_id": str(store_id), "biz_date": biz_date},
            )
            return [
                {
                    "store_id": str(row.get("store_id") or store_id),
                    "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                    "product_id": str(row.get("product_id") or ""),
                    "product_name": str(row.get("product_name") or ""),
                    "category": str(row.get("category") or "미분류"),
                    "on_hand_eod": round(_number(row.get("on_hand_eod")), 2),
                    "sold_qty": round(_number(row.get("sold_qty")), 2),
                    "waste_qty": round(_number(row.get("waste_qty")), 2),
                    "stockout_minutes": round(_number(row.get("stockout_minutes")), 2),
                    "reorder_triggered": int(_number(row.get("reorder_triggered"))),
                    "base_price": round(_number(row.get("base_price")), 2),
                    "cost_price": round(_number(row.get("cost_price")), 2),
                }
                for row in rows
            ]
        except Exception:
            logger.exception("Failed to fetch gold inventory for store_id=%s", store_id)
            return []
    try:
        frame = _inventory_frame(db, store_id)
        target_date = _to_timestamp(biz_date) or frame["biz_date"].max()
        if pd.isna(target_date):
            return []
        filtered = frame[frame["biz_date"] == target_date].copy()
        if filtered.empty:
            return []
        filtered = filtered.sort_values(
            ["stockout_minutes", "sold_qty", "product_name"],
            ascending=[False, False, True],
        )
        filtered["biz_date"] = filtered["biz_date"].map(_to_iso)
        return filtered[
            [
                "store_id",
                "biz_date",
                "product_id",
                "product_name",
                "category",
                "on_hand_eod",
                "sold_qty",
                "waste_qty",
                "stockout_minutes",
                "reorder_triggered",
                "base_price",
                "cost_price",
            ]
        ].to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch inventory for store_id=%s", store_id)
        return []


async def get_sales_opportunities(
    db,
    store_id: str,
    lookback_weeks: int = 4,
    top_n: int = 3,
) -> list[dict[str, Any]]:
    """Return products whose current sales exceed recent same-DOW baseline."""
    if _is_async_session(db):
        try:
            window_days = max(lookback_weeks * 7, 7)
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH latest AS (
                    SELECT max(biz_date) AS biz_date
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                ),
                current_day AS (
                    SELECT
                        p.product_id,
                        max(p.product_name) AS product_name,
                        COALESCE(NULLIF(max(p.category), ''), '미분류') AS category,
                        sum(p.sold_qty) AS current_sold_qty,
                        sum(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS current_sales_amt,
                        avg(
                            CASE
                                WHEN p.sold_qty > 0
                                    THEN COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0) / NULLIF(p.sold_qty, 0)
                                ELSE 0
                            END
                        ) AS base_price
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                    JOIN latest l
                      ON p.biz_date = l.biz_date
                    WHERE p.store_id = :store_id
                    GROUP BY p.product_id
                ),
                baseline AS (
                    SELECT
                        p.product_id,
                        avg(p.sold_qty) AS avg_sold_qty,
                        avg(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS avg_sales_amt
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                    JOIN latest l ON true
                    WHERE p.store_id = :store_id
                      AND p.biz_date < l.biz_date
                      AND p.biz_date >= l.biz_date - CAST(:window_days AS integer)
                      AND extract(dow FROM p.biz_date) = extract(dow FROM l.biz_date)
                    GROUP BY p.product_id
                )
                SELECT
                    c.product_id,
                    c.product_name,
                    c.category,
                    c.current_sold_qty,
                    c.current_sales_amt,
                    c.base_price,
                    b.avg_sold_qty,
                    b.avg_sales_amt
                FROM current_day c
                JOIN baseline b
                  ON b.product_id = c.product_id
                WHERE c.current_sales_amt > 0
                ORDER BY c.current_sales_amt DESC, c.product_name
                """,
                {
                    "store_id": str(store_id),
                    "window_days": window_days,
                },
            )
            opportunities = []
            for row in rows:
                growth_pct = _safe_pct_change(
                    _number(row.get("current_sold_qty")),
                    _number(row.get("avg_sold_qty")),
                )
                if growth_pct is None or growth_pct < 10:
                    continue
                opportunities.append(
                    {
                        "product_id": str(row.get("product_id") or ""),
                        "product_name": str(row.get("product_name") or ""),
                        "category": str(row.get("category") or "미분류"),
                        "current_sold_qty": round(_number(row.get("current_sold_qty")), 2),
                        "current_sales_amt": round(_number(row.get("current_sales_amt")), 2),
                        "base_price": round(_number(row.get("base_price")), 2),
                        "avg_sold_qty": round(_number(row.get("avg_sold_qty")), 2),
                        "avg_sales_amt": round(_number(row.get("avg_sales_amt")), 2),
                        "growth_pct": growth_pct,
                    }
                )
            return sorted(
                opportunities,
                key=lambda row: (
                    float(row.get("growth_pct") or 0),
                    float(row.get("current_sales_amt") or 0),
                ),
                reverse=True,
            )[:top_n]
        except Exception:
            logger.exception(
                "Failed to fetch gold sales opportunities for store_id=%s",
                store_id,
            )
            return []
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return []

        latest_date = frame["biz_date"].max()
        current = frame[frame["biz_date"] == latest_date].copy()
        history = frame[
            (frame["biz_date"] < latest_date)
            & (frame["biz_date"] >= latest_date - pd.Timedelta(days=lookback_weeks * 7))
            & (frame["biz_date"].dt.weekday == latest_date.weekday())
        ].copy()
        if current.empty or history.empty:
            return []

        baseline = (
            history.groupby(["product_id", "product_name", "category"], as_index=False)
            .agg(
                avg_sold_qty=("sold_qty", "mean"),
                avg_sales_amt=("sales_amt", "mean"),
            )
        )
        current = current[
            ["product_id", "product_name", "category", "sold_qty", "sales_amt", "base_price"]
        ].rename(
            columns={"sold_qty": "current_sold_qty", "sales_amt": "current_sales_amt"}
        )
        merged = current.merge(
            baseline,
            on=["product_id", "product_name", "category"],
            how="left",
        ).fillna({"avg_sold_qty": 0, "avg_sales_amt": 0})
        merged["growth_pct"] = merged.apply(
            lambda row: _safe_pct_change(
                float(row.get("current_sold_qty", 0) or 0),
                float(row.get("avg_sold_qty", 0) or 0),
            ),
            axis=1,
        )
        merged = merged[
            (merged["growth_pct"].notna())
            & (merged["growth_pct"] >= 10)
            & (merged["current_sales_amt"] > 0)
        ].copy()
        if merged.empty:
            return []

        merged = merged.sort_values(
            ["growth_pct", "current_sales_amt"],
            ascending=[False, False],
        )
        return merged.head(top_n).to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch sales opportunities for store_id=%s", store_id)
        return []


async def get_product_history(
    db,
    store_id: str,
    product_id: str,
    days: int = 28,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH latest AS (
                    SELECT max(biz_date) AS end_date
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE store_id = :store_id
                      AND product_id = :product_id
                ),
                sales AS (
                    SELECT
                        biz_date,
                        sum(sold_qty) AS sold_qty,
                        sum(waste_qty) AS waste_qty,
                        max(stockout_minutes) AS stockout_minutes
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                      AND product_id = :product_id
                    GROUP BY biz_date
                )
                SELECT
                    r.biz_date,
                    r.on_hand_eod,
                    COALESCE(s.sold_qty, r.sold_qty, 0) AS sold_qty,
                    COALESCE(s.waste_qty, 0) AS waste_qty,
                    COALESCE(NULLIF(s.stockout_minutes, 0), r.stockout_minutes, 0) AS stockout_minutes,
                    CASE WHEN r.on_hand_eod <= 0 THEN 1 ELSE 0 END AS reorder_triggered
                FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold r
                JOIN latest l ON true
                LEFT JOIN sales s
                    ON s.biz_date = r.biz_date
                WHERE r.store_id = :store_id
                  AND r.product_id = :product_id
                  AND l.end_date IS NOT NULL
                  AND r.biz_date BETWEEN l.end_date - CAST(:lookback_days AS integer) AND l.end_date
                ORDER BY r.biz_date
                """,
                {
                    "store_id": str(store_id),
                    "product_id": str(product_id),
                    "lookback_days": max(days - 1, 0),
                },
            )
            return [
                {
                    "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                    "on_hand_eod": round(_number(row.get("on_hand_eod")), 2),
                    "sold_qty": round(_number(row.get("sold_qty")), 2),
                    "waste_qty": round(_number(row.get("waste_qty")), 2),
                    "stockout_minutes": round(_number(row.get("stockout_minutes")), 2),
                    "reorder_triggered": int(_number(row.get("reorder_triggered"))),
                }
                for row in rows
            ]
        except Exception:
            logger.exception(
                "Failed to fetch gold product history for store_id=%s product_id=%s",
                store_id,
                product_id,
            )
            return []
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return []
        end_date = frame["biz_date"].max()
        start_date = end_date - pd.Timedelta(days=max(days - 1, 0))
        filtered = frame[
            (frame["product_id"] == str(product_id))
            & (frame["biz_date"] >= start_date)
            & (frame["biz_date"] <= end_date)
        ].sort_values("biz_date")
        if filtered.empty:
            return []
        filtered = filtered.copy()
        filtered["biz_date"] = filtered["biz_date"].map(_to_iso)
        return filtered[
            [
                "biz_date",
                "on_hand_eod",
                "sold_qty",
                "waste_qty",
                "stockout_minutes",
                "reorder_triggered",
            ]
        ].to_dict(orient="records")
    except Exception:
        logger.exception(
            "Failed to fetch product history for store_id=%s product_id=%s",
            store_id,
            product_id,
        )
        return []


async def get_production_history(
    db,
    store_id: str,
    product_id: str,
    days: int = 28,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH latest AS (
                    SELECT max(prod_dt) AS end_date
                    FROM {GOLD_SCHEMA}.new_production
                    WHERE masked_stor_cd = :store_id
                      AND item_cd = :product_id
                )
                SELECT
                    masked_stor_cd AS store_id,
                    prod_dt AS biz_date,
                    COALESCE(NULLIF(prod_dgre, ''), '1') AS prod_degree,
                    item_cd AS product_id,
                    max(item_nm) AS product_name,
                    sum(
                        COALESCE(prod_qty, 0)
                        + COALESCE(prod_qty_2, 0)
                        + COALESCE(prod_qty_3, 0)
                        + COALESCE(reprod_qty, 0)
                    ) AS produced_qty,
                    NULL::text AS registered_at,
                    NULL::text AS updated_at
                FROM {GOLD_SCHEMA}.new_production p
                JOIN latest l ON true
                WHERE masked_stor_cd = :store_id
                  AND item_cd = :product_id
                  AND l.end_date IS NOT NULL
                  AND prod_dt BETWEEN l.end_date - CAST(:lookback_days AS integer) AND l.end_date
                GROUP BY masked_stor_cd, prod_dt, COALESCE(NULLIF(prod_dgre, ''), '1'), item_cd
                ORDER BY prod_dt, COALESCE(NULLIF(prod_dgre, ''), '1')
                """,
                {
                    "store_id": str(store_id),
                    "product_id": str(product_id),
                    "lookback_days": max(days - 1, 0),
                },
            )
            return [
                {
                    "store_id": str(row.get("store_id") or store_id),
                    "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                    "prod_degree": str(row.get("prod_degree") or "1"),
                    "product_id": str(row.get("product_id") or ""),
                    "product_name": str(row.get("product_name") or ""),
                    "produced_qty": round(_number(row.get("produced_qty")), 2),
                    "registered_at": row.get("registered_at"),
                    "updated_at": row.get("updated_at"),
                }
                for row in rows
            ]
        except Exception:
            logger.exception(
                "Failed to fetch gold production history for store_id=%s product_id=%s",
                store_id,
                product_id,
            )
            return []
    try:
        frame = _store(db).production_day
        if frame.empty:
            return []
        end_date = frame["biz_date"].max()
        start_date = end_date - pd.Timedelta(days=max(days - 1, 0))
        filtered = frame[
            (frame["store_id"] == str(store_id))
            & (frame["product_id"] == str(product_id))
            & (frame["biz_date"] >= start_date)
            & (frame["biz_date"] <= end_date)
        ].copy()
        if filtered.empty:
            return []
        filtered["biz_date"] = filtered["biz_date"].map(_to_iso)
        filtered["registered_at"] = filtered["registered_at"].map(
            lambda value: value.isoformat() if isinstance(value, pd.Timestamp) and not pd.isna(value) else None
        )
        filtered["updated_at"] = filtered["updated_at"].map(
            lambda value: value.isoformat() if isinstance(value, pd.Timestamp) and not pd.isna(value) else None
        )
        return filtered[
            [
                "store_id",
                "biz_date",
                "prod_degree",
                "product_id",
                "product_name",
                "produced_qty",
                "registered_at",
                "updated_at",
            ]
        ].sort_values(["biz_date", "registered_at", "prod_degree"]).to_dict(orient="records")
    except Exception:
        logger.exception(
            "Failed to fetch production history for store_id=%s product_id=%s",
            store_id,
            product_id,
        )
        return []


async def get_stockout_risk_products(
    db,
    store_id: str,
    lookback_weeks: int = 4,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            days = max(lookback_weeks * 7, 7)
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH latest AS (
                    SELECT max(biz_date) AS biz_date
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE store_id = :store_id
                ),
                window_risk AS (
                    SELECT
                        r.store_id,
                        r.product_id,
                        max(r.product_name) AS product_name,
                        avg(r.sold_qty) AS avg_sold_qty,
                        avg(r.stockout_minutes) AS avg_stockout_minutes,
                        avg(r.on_hand_eod) AS avg_on_hand_eod,
                        count(*) FILTER (WHERE r.stockout_minutes > 0) AS weeks_with_stockout,
                        count(*) AS total_days
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold r
                    CROSS JOIN latest l
                    WHERE r.store_id = :store_id
                      AND r.biz_date >= l.biz_date - CAST(:window_days AS integer)
                      AND r.biz_date <= l.biz_date
                    GROUP BY r.store_id, r.product_id
                ),
                current_sales AS (
                    SELECT
                        p.store_id,
                        p.product_id,
                        max(p.category) AS category,
                        avg(CASE WHEN p.sold_qty > 0 THEN COALESCE(NULLIF(p.sale_amt, 0), p.net_sales_amt, 0) / NULLIF(p.sold_qty, 0) ELSE 0 END) AS avg_unit_price
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                    CROSS JOIN latest l
                    WHERE p.store_id = :store_id
                      AND p.biz_date >= l.biz_date - CAST(:window_days AS integer)
                      AND p.biz_date <= l.biz_date
                    GROUP BY p.store_id, p.product_id
                )
                SELECT
                    r.product_id,
                    r.product_name,
                    COALESCE(NULLIF(s.category, ''), '미분류') AS category,
                    r.avg_sold_qty,
                    r.avg_stockout_minutes,
                    r.avg_on_hand_eod,
                    r.weeks_with_stockout,
                    r.total_days,
                    CASE
                        WHEN r.total_days > 0 THEN round(r.weeks_with_stockout::numeric / r.total_days, 4)
                        ELSE 0
                    END AS stockout_frequency,
                    round((r.avg_stockout_minutes / :operating_minutes) * r.avg_sold_qty * COALESCE(s.avg_unit_price, 0), 2)
                        AS estimated_chance_loss_per_day
                FROM window_risk r
                LEFT JOIN current_sales s
                    ON s.store_id = r.store_id
                   AND s.product_id = r.product_id
                WHERE r.weeks_with_stockout > 0
                ORDER BY
                    stockout_frequency DESC,
                    r.avg_stockout_minutes DESC,
                    r.avg_sold_qty DESC
                """,
                {
                    "store_id": str(store_id),
                    "window_days": days,
                    "operating_minutes": OPERATING_MINUTES,
                },
            )
            return [
                {
                    "product_id": str(row.get("product_id") or ""),
                    "product_name": str(row.get("product_name") or ""),
                    "category": str(row.get("category") or "미분류"),
                    "avg_sold_qty": round(_number(row.get("avg_sold_qty")), 2),
                    "avg_stockout_minutes": round(_number(row.get("avg_stockout_minutes")), 2),
                    "avg_on_hand_eod": round(_number(row.get("avg_on_hand_eod")), 2),
                    "weeks_with_stockout": int(_number(row.get("weeks_with_stockout"))),
                    "total_weeks": int(_number(row.get("total_days"))),
                    "stockout_frequency": round(_number(row.get("stockout_frequency")), 4),
                    "estimated_chance_loss_per_day": round(
                        _number(row.get("estimated_chance_loss_per_day")),
                        2,
                    ),
                }
                for row in rows
            ]
        except Exception:
            logger.exception(
                "Failed to fetch gold stockout risk products for store_id=%s",
                store_id,
            )
            return []
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return []
        latest_date = frame["biz_date"].max()
        start_date = latest_date - pd.Timedelta(days=lookback_weeks * 7)
        same_dow = frame[
            (frame["biz_date"] < latest_date)
            & (frame["biz_date"] >= start_date)
            & (frame["biz_date"].dt.weekday == latest_date.weekday())
        ]
        if same_dow.empty:
            return []

        grouped = (
            same_dow.groupby(["product_id", "product_name", "category"], as_index=False)
            .agg(
                avg_sold_qty=("sold_qty", "mean"),
                avg_stockout_minutes=("stockout_minutes", "mean"),
                avg_on_hand_eod=("on_hand_eod", "mean"),
                weeks_with_stockout=("stockout_minutes", lambda values: int((values > 0).sum())),
                total_weeks=("biz_date", "nunique"),
                base_price=("base_price", "max"),
            )
        )
        grouped["stockout_frequency"] = grouped.apply(
            lambda row: round(
                (row["weeks_with_stockout"] / row["total_weeks"]) if row["total_weeks"] else 0,
                4,
            ),
            axis=1,
        )
        grouped["estimated_chance_loss_per_day"] = (
            (grouped["avg_stockout_minutes"] / OPERATING_MINUTES)
            * grouped["avg_sold_qty"]
            * grouped["base_price"]
        ).round(2)
        filtered = grouped[grouped["weeks_with_stockout"] > 0].copy()
        filtered = filtered.sort_values(
            ["stockout_frequency", "avg_stockout_minutes", "avg_sold_qty"],
            ascending=[False, False, False],
        )
        return filtered.to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch stockout risk products for store_id=%s", store_id)
        return []


async def get_sales_comparison(
    db,
    store_id: str,
    period1_start: date,
    period1_end: date,
    period2_start: date,
    period2_end: date,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            summary_rows = await _fetch_gold_all(
                db,
                f"""
                WITH source AS (
                    SELECT
                        biz_date::date AS biz_date,
                        CASE
                            WHEN biz_date BETWEEN :period1_start AND :period1_end THEN 'period1'
                            WHEN biz_date BETWEEN :period2_start AND :period2_end THEN 'period2'
                            ELSE NULL
                        END AS period_label,
                        COALESCE(NULLIF(net_sales_amt, 0), sale_amt, 0) AS sales_amt,
                        sold_qty,
                        waste_qty,
                        stockout_minutes
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                      AND (
                        biz_date BETWEEN :period1_start AND :period1_end
                        OR biz_date BETWEEN :period2_start AND :period2_end
                      )
                )
                SELECT
                    period_label,
                    count(DISTINCT biz_date) AS biz_days,
                    sum(sales_amt) AS total_sales,
                    sum(sold_qty) AS total_qty,
                    sum(waste_qty) AS total_waste,
                    avg(stockout_minutes) AS avg_stockout_min
                FROM source
                WHERE period_label IS NOT NULL
                GROUP BY period_label
                """,
                {
                    "store_id": str(store_id),
                    "period1_start": period1_start,
                    "period1_end": period1_end,
                    "period2_start": period2_start,
                    "period2_end": period2_end,
                },
            )
            product_rows = await _fetch_gold_all(
                db,
                f"""
                WITH source AS (
                    SELECT
                        product_id,
                        product_name,
                        CASE
                            WHEN biz_date BETWEEN :period1_start AND :period1_end THEN 'period1'
                            WHEN biz_date BETWEEN :period2_start AND :period2_end THEN 'period2'
                            ELSE NULL
                        END AS period_label,
                        COALESCE(NULLIF(net_sales_amt, 0), sale_amt, 0) AS sales_amt
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                      AND (
                        biz_date BETWEEN :period1_start AND :period1_end
                        OR biz_date BETWEEN :period2_start AND :period2_end
                      )
                )
                SELECT
                    product_id,
                    max(product_name) AS product_name,
                    sum(CASE WHEN period_label = 'period1' THEN sales_amt ELSE 0 END) AS period1_sales,
                    sum(CASE WHEN period_label = 'period2' THEN sales_amt ELSE 0 END) AS period2_sales
                FROM source
                WHERE period_label IS NOT NULL
                GROUP BY product_id
                """,
                {
                    "store_id": str(store_id),
                    "period1_start": period1_start,
                    "period1_end": period1_end,
                    "period2_start": period2_start,
                    "period2_end": period2_end,
                },
            )
            summary_map = {
                str(row.get("period_label")): {
                    "biz_days": int(row.get("biz_days", 0) or 0),
                    "total_sales": round(_number(row.get("total_sales")), 2),
                    "total_qty": round(_number(row.get("total_qty")), 2),
                    "total_waste": round(_number(row.get("total_waste")), 2),
                    "avg_stockout_min": round(_number(row.get("avg_stockout_min")), 2),
                }
                for row in summary_rows
            }
            product_records = []
            for row in product_rows:
                period1_sales = _number(row.get("period1_sales"))
                period2_sales = _number(row.get("period2_sales"))
                product_records.append(
                    {
                        "product_id": str(row.get("product_id") or ""),
                        "product_name": str(row.get("product_name") or ""),
                        "period1_sales": round(period1_sales, 2),
                        "period2_sales": round(period2_sales, 2),
                        "sales_change_pct": _safe_pct_change(period2_sales, period1_sales),
                    }
                )
            growth = sorted(
                [row for row in product_records if row["sales_change_pct"] is not None],
                key=lambda row: row["sales_change_pct"],
                reverse=True,
            )[:5]
            decline = sorted(
                [row for row in product_records if row["sales_change_pct"] is not None],
                key=lambda row: row["sales_change_pct"],
            )[:5]
            period1 = summary_map.get("period1", {})
            period2 = summary_map.get("period2", {})
            return {
                "period1": {
                    "start": str(period1_start),
                    "end": str(period1_end),
                    "biz_days": int(period1.get("biz_days", 0) or 0),
                    "total_sales": round(_number(period1.get("total_sales")), 2),
                    "total_qty": round(_number(period1.get("total_qty")), 2),
                    "total_waste": round(_number(period1.get("total_waste")), 2),
                    "avg_stockout_min": round(_number(period1.get("avg_stockout_min")), 2),
                },
                "period2": {
                    "start": str(period2_start),
                    "end": str(period2_end),
                    "biz_days": int(period2.get("biz_days", 0) or 0),
                    "total_sales": round(_number(period2.get("total_sales")), 2),
                    "total_qty": round(_number(period2.get("total_qty")), 2),
                    "total_waste": round(_number(period2.get("total_waste")), 2),
                    "avg_stockout_min": round(_number(period2.get("avg_stockout_min")), 2),
                },
                "change_pct": {
                    "sales": _safe_pct_change(
                        _number(period2.get("total_sales")),
                        _number(period1.get("total_sales")),
                    ),
                    "qty": _safe_pct_change(
                        _number(period2.get("total_qty")),
                        _number(period1.get("total_qty")),
                    ),
                    "waste": _safe_pct_change(
                        _number(period2.get("total_waste")),
                        _number(period1.get("total_waste")),
                    ),
                },
                "top_growth_products": growth,
                "top_decline_products": decline,
            }
        except Exception:
            logger.exception(
                "Failed to fetch gold sales comparison for store_id=%s",
                store_id,
            )
            return {
                "period1": {},
                "period2": {},
                "change_pct": {},
                "top_growth_products": [],
                "top_decline_products": [],
            }
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return {
                "period1": {},
                "period2": {},
                "change_pct": {},
                "top_growth_products": [],
                "top_decline_products": [],
            }

        p1_start = _to_timestamp(period1_start)
        p1_end = _to_timestamp(period1_end)
        p2_start = _to_timestamp(period2_start)
        p2_end = _to_timestamp(period2_end)

        mask = ((frame["biz_date"] >= p1_start) & (frame["biz_date"] <= p1_end)) | (
            (frame["biz_date"] >= p2_start) & (frame["biz_date"] <= p2_end)
        )
        source = frame[mask].copy()
        if source.empty:
            return {
                "period1": {},
                "period2": {},
                "change_pct": {},
                "top_growth_products": [],
                "top_decline_products": [],
            }

        source["period_label"] = source["biz_date"].apply(
            lambda biz_date: "period1" if p1_start <= biz_date <= p1_end else "period2"
        )

        summary_rows = (
            source.groupby("period_label", as_index=False)
            .agg(
                biz_days=("biz_date", "nunique"),
                total_sales=("sales_amt", "sum"),
                total_qty=("sold_qty", "sum"),
                total_waste=("waste_qty", "sum"),
                avg_stockout_min=("stockout_minutes", "mean"),
            )
            .set_index("period_label")
            .to_dict(orient="index")
        )

        product_rows = (
            source.groupby(["product_id", "product_name", "period_label"], as_index=False)["sales_amt"]
            .sum()
            .pivot_table(
                index=["product_id", "product_name"],
                columns="period_label",
                values="sales_amt",
                fill_value=0,
            )
            .reset_index()
        )
        product_rows["sales_change_pct"] = product_rows.apply(
            lambda row: _safe_pct_change(float(row.get("period2", 0)), float(row.get("period1", 0))),
            axis=1,
        )
        product_records = product_rows.rename(
            columns={"period1": "period1_sales", "period2": "period2_sales"}
        ).to_dict(orient="records")
        growth = sorted(
            [row for row in product_records if row["sales_change_pct"] is not None],
            key=lambda row: row["sales_change_pct"],
            reverse=True,
        )[:5]
        decline = sorted(
            [row for row in product_records if row["sales_change_pct"] is not None],
            key=lambda row: row["sales_change_pct"],
        )[:5]

        period1 = summary_rows.get("period1", {})
        period2 = summary_rows.get("period2", {})
        return {
            "period1": {
                "start": str(period1_start),
                "end": str(period1_end),
                "biz_days": int(period1.get("biz_days", 0) or 0),
                "total_sales": round(float(period1.get("total_sales", 0) or 0), 2),
                "total_qty": round(float(period1.get("total_qty", 0) or 0), 2),
                "total_waste": round(float(period1.get("total_waste", 0) or 0), 2),
                "avg_stockout_min": round(float(period1.get("avg_stockout_min", 0) or 0), 2),
            },
            "period2": {
                "start": str(period2_start),
                "end": str(period2_end),
                "biz_days": int(period2.get("biz_days", 0) or 0),
                "total_sales": round(float(period2.get("total_sales", 0) or 0), 2),
                "total_qty": round(float(period2.get("total_qty", 0) or 0), 2),
                "total_waste": round(float(period2.get("total_waste", 0) or 0), 2),
                "avg_stockout_min": round(float(period2.get("avg_stockout_min", 0) or 0), 2),
            },
            "change_pct": {
                "sales": _safe_pct_change(float(period2.get("total_sales", 0) or 0), float(period1.get("total_sales", 0) or 0)),
                "qty": _safe_pct_change(float(period2.get("total_qty", 0) or 0), float(period1.get("total_qty", 0) or 0)),
                "waste": _safe_pct_change(float(period2.get("total_waste", 0) or 0), float(period1.get("total_waste", 0) or 0)),
            },
            "top_growth_products": growth,
            "top_decline_products": decline,
        }
    except Exception:
        logger.exception("Failed to fetch sales comparison for store_id=%s", store_id)
        return {
            "period1": {},
            "period2": {},
            "change_pct": {},
            "top_growth_products": [],
            "top_decline_products": [],
        }


async def get_category_sales(
    db,
    store_id: str,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                f"""
                SELECT
                    COALESCE(NULLIF(category, ''), '미분류') AS category,
                    sum(sold_qty) AS total_qty,
                    sum(COALESCE(NULLIF(net_sales_amt, 0), sale_amt, 0)) AS total_sales
                FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                WHERE store_id = :store_id
                  AND biz_date BETWEEN :start_date AND :end_date
                GROUP BY COALESCE(NULLIF(category, ''), '미분류')
                ORDER BY total_sales DESC
                """,
                {
                    "store_id": str(store_id),
                    "start_date": start_date,
                    "end_date": end_date,
                },
            )
            total_sales = sum(_number(row.get("total_sales")) for row in rows)
            return [
                {
                    "category": str(row.get("category") or "미분류"),
                    "total_qty": round(_number(row.get("total_qty")), 2),
                    "total_sales": round(_number(row.get("total_sales")), 2),
                    "pct_of_total": round(
                        (_number(row.get("total_sales")) / total_sales) * 100,
                        2,
                    )
                    if total_sales
                    else 0.0,
                }
                for row in rows
            ]
        except Exception:
            logger.exception(
                "Failed to fetch gold category sales for store_id=%s",
                store_id,
            )
            return []
    try:
        frame = _inventory_frame(db, store_id)
        filtered = frame[
            (frame["biz_date"] >= _to_timestamp(start_date))
            & (frame["biz_date"] <= _to_timestamp(end_date))
        ]
        if filtered.empty:
            return []
        grouped = (
            filtered.groupby("category", as_index=False)
            .agg(total_qty=("sold_qty", "sum"), total_sales=("sales_amt", "sum"))
            .sort_values("total_sales", ascending=False)
        )
        total_sales = float(grouped["total_sales"].sum() or 0)
        grouped["pct_of_total"] = grouped["total_sales"].apply(
            lambda value: round((float(value) / total_sales) * 100, 2) if total_sales else 0.0
        )
        return grouped.to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch category sales for store_id=%s", store_id)
        return []


async def get_store_vs_benchmark(
    db,
    store_id: str,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            rows = await _fetch_gold_all(
                db,
                f"""
                SELECT
                    store_id,
                    avg(total_sales) AS daily_avg_sales,
                    avg(total_qty) AS daily_avg_qty,
                    avg(CASE WHEN total_qty > 0 THEN total_sales / total_qty ELSE NULL END) AS daily_avg_ticket,
                    avg(waste_total) AS daily_avg_waste,
                    avg(stockout_sku_cnt) AS daily_avg_stockout
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                WHERE biz_date BETWEEN :start_date AND :end_date
                GROUP BY store_id
                ORDER BY daily_avg_sales DESC
                """,
                {
                    "start_date": start_date,
                    "end_date": end_date,
                },
            )
            if not rows:
                return {
                    "my_store": {},
                    "all_stores_avg": {},
                    "diff_pct": {},
                    "rank_among_stores": None,
                    "total_stores": 0,
                    "period_start": str(start_date),
                    "period_end": str(end_date),
                    "business_days": 0,
                }
            total_stores = len(rows)
            my_row = next((row for row in rows if str(row.get("store_id")) == str(store_id)), None)
            if not my_row:
                return {
                    "my_store": {},
                    "all_stores_avg": {},
                    "diff_pct": {},
                    "rank_among_stores": None,
                    "total_stores": total_stores,
                    "period_start": str(start_date),
                    "period_end": str(end_date),
                    "business_days": (end_date - start_date).days + 1,
                }
            avg_sales = round(
                sum(_number(row.get("daily_avg_sales")) for row in rows) / total_stores,
                2,
            )
            avg_qty = round(
                sum(_number(row.get("daily_avg_qty")) for row in rows) / total_stores,
                2,
            )
            avg_ticket = round(
                sum(_number(row.get("daily_avg_ticket")) for row in rows if row.get("daily_avg_ticket") is not None) / max(sum(1 for row in rows if row.get("daily_avg_ticket") is not None), 1),
                2,
            )
            avg_waste = round(
                sum(_number(row.get("daily_avg_waste")) for row in rows) / total_stores,
                2,
            )
            avg_stockout = round(
                sum(_number(row.get("daily_avg_stockout")) for row in rows if row.get("daily_avg_stockout") is not None) / max(sum(1 for row in rows if row.get("daily_avg_stockout") is not None), 1),
                2,
            )
            rank = next(
                (
                    index + 1
                    for index, row in enumerate(rows)
                    if str(row.get("store_id")) == str(store_id)
                ),
                None,
            )
            my_sales = _number(my_row.get("daily_avg_sales"))
            my_qty = _number(my_row.get("daily_avg_qty"))
            my_ticket = _number(my_row.get("daily_avg_ticket"))
            my_waste = _number(my_row.get("daily_avg_waste"))
            my_stockout = _number(my_row.get("daily_avg_stockout"))
            business_days = (end_date - start_date).days + 1
            return {
                "my_store": {
                    "daily_avg_sales": round(my_sales, 2),
                    "daily_avg_qty": round(my_qty, 2),
                    "daily_avg_ticket": round(my_ticket, 2),
                    "daily_avg_waste": round(my_waste, 2),
                    "daily_avg_stockout": round(my_stockout, 2),
                },
                "all_stores_avg": {
                    "daily_avg_sales": avg_sales,
                    "daily_avg_qty": avg_qty,
                    "daily_avg_ticket": avg_ticket,
                    "daily_avg_waste": avg_waste,
                    "daily_avg_stockout": avg_stockout,
                },
                "diff_pct": {
                    "sales": _safe_pct_change(my_sales, avg_sales),
                    "qty": _safe_pct_change(my_qty, avg_qty),
                    "ticket": _safe_pct_change(my_ticket, avg_ticket),
                    "waste": _safe_pct_change(my_waste, avg_waste),
                    "stockout": _safe_pct_change(my_stockout, avg_stockout),
                },
                "rank_among_stores": rank,
                "total_stores": total_stores,
                "period_start": str(start_date),
                "period_end": str(end_date),
                "business_days": business_days,
            }
        except Exception:
            logger.exception(
                "Failed to fetch gold store benchmark for store_id=%s",
                store_id,
            )
            return {
                "my_store": {},
                "all_stores_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": 0,
            }
    try:
        frame = _store(db).fact_inventory_day
        filtered = frame[
            (frame["biz_date"] >= _to_timestamp(start_date))
            & (frame["biz_date"] <= _to_timestamp(end_date))
        ]
        if filtered.empty:
            return {
                "my_store": {},
                "all_stores_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": 0,
            }
        daily = (
            filtered.groupby(["store_id", "biz_date"], as_index=False)
            .agg(
                total_sales=("sales_amt", "sum"),
                total_qty=("sold_qty", "sum"),
                total_waste=("waste_qty", "sum"),
            )
        )
        store_avg = (
            daily.groupby("store_id", as_index=False)
            .agg(
                daily_avg_sales=("total_sales", "mean"),
                daily_avg_qty=("total_qty", "mean"),
                daily_avg_waste=("total_waste", "mean"),
            )
            .sort_values("daily_avg_sales", ascending=False)
        )
        if store_avg.empty:
            return {
                "my_store": {},
                "all_stores_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": 0,
            }
        total_stores = len(store_avg)
        my_rows = store_avg[store_avg["store_id"] == str(store_id)]
        if my_rows.empty:
            return {
                "my_store": {},
                "all_stores_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": total_stores,
            }
        my_row = my_rows.iloc[0]
        avg_sales = round(float(store_avg["daily_avg_sales"].mean()), 2)
        avg_qty = round(float(store_avg["daily_avg_qty"].mean()), 2)
        avg_waste = round(float(store_avg["daily_avg_waste"].mean()), 2)
        rank = int(store_avg.reset_index(drop=True).index[store_avg["store_id"] == str(store_id)][0] + 1)
        return {
            "my_store": {
                "daily_avg_sales": round(float(my_row["daily_avg_sales"]), 2),
                "daily_avg_qty": round(float(my_row["daily_avg_qty"]), 2),
                "daily_avg_waste": round(float(my_row["daily_avg_waste"]), 2),
            },
            "all_stores_avg": {
                "daily_avg_sales": avg_sales,
                "daily_avg_qty": avg_qty,
                "daily_avg_waste": avg_waste,
            },
            "diff_pct": {
                "sales": _safe_pct_change(float(my_row["daily_avg_sales"]), avg_sales),
                "qty": _safe_pct_change(float(my_row["daily_avg_qty"]), avg_qty),
                "waste": _safe_pct_change(float(my_row["daily_avg_waste"]), avg_waste),
            },
            "rank_among_stores": rank,
            "total_stores": total_stores,
        }
    except Exception:
        logger.exception("Failed to fetch benchmark comparison for store_id=%s", store_id)
        return {
            "my_store": {},
            "all_stores_avg": {},
            "diff_pct": {},
            "rank_among_stores": None,
            "total_stores": 0,
        }


async def get_benchmark_peer_summary(
    db,
    store_id: str,
    compare_store_ids: list[str],
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    if not _is_async_session(db):
        return {
            "my_store": {},
            "benchmark_avg": {},
            "diff_pct": {},
            "rank_among_stores": None,
            "total_stores": 0,
            "peers": [],
            "strengths": [],
            "risks": [],
        }
    try:
        selected_ids = [str(store_id), *[str(value) for value in compare_store_ids if str(value) != str(store_id)]]
        placeholders, list_params = _named_list_params("benchmark_store", selected_ids)
        params = {
            **list_params,
            "start_date": start_date,
            "end_date": end_date,
        }
        kpi_rows = await _fetch_gold_all(
            db,
            f"""
            WITH store_kpis AS (
                SELECT
                    k.store_id,
                    COALESCE(ast.store_name, ds.store_name, k.store_id) AS store_name,
                    avg(k.total_sales) AS daily_avg_sales,
                    avg(k.total_qty) AS daily_avg_qty,
                    avg(k.waste_total) AS daily_avg_waste
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold k
                LEFT JOIN {APP_SCHEMA}.stores ast
                  ON ast.store_id = k.store_id
                LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                  ON ds.store_id = k.store_id
                WHERE k.store_id IN ({placeholders})
                  AND k.biz_date BETWEEN :start_date AND :end_date
                GROUP BY k.store_id, COALESCE(ast.store_name, ds.store_name, k.store_id)
            ),
            ranked AS (
                SELECT
                    store_id,
                    row_number() OVER (ORDER BY avg(total_sales) DESC) AS sales_rank,
                    count(*) OVER () AS total_stores
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                WHERE biz_date BETWEEN :start_date AND :end_date
                GROUP BY store_id
            )
            SELECT
                sk.store_id,
                sk.store_name,
                sk.daily_avg_sales,
                sk.daily_avg_qty,
                sk.daily_avg_waste,
                r.sales_rank,
                r.total_stores
            FROM store_kpis sk
            LEFT JOIN ranked r
              ON r.store_id = sk.store_id
            ORDER BY sk.daily_avg_sales DESC, sk.store_id
            """,
            params,
        )
        top_item_rows = await _fetch_gold_all(
            db,
            f"""
            WITH app_products AS (
                SELECT
                    product_id,
                    NULLIF(product_name, '') AS product_name
                FROM {APP_SCHEMA}.products
            ),
            aggregated AS (
                SELECT
                    p.store_id,
                    COALESCE(ast.store_name, ds.store_name, p.store_id) AS store_name,
                    p.product_id,
                    COALESCE(
                        max(ap.product_name),
                        NULLIF(max(p.product_name), ''),
                        max(dp.product_name),
                        max(nd.product_name),
                        p.product_id
                    ) AS product_name,
                    sum(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS total_sales,
                    sum(COALESCE(p.sold_qty, 0)) AS total_qty
                FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                LEFT JOIN {APP_SCHEMA}.stores ast
                  ON ast.store_id = p.store_id
                LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                  ON ds.store_id = p.store_id
                LEFT JOIN app_products ap
                  ON ap.product_id = p.product_id
                LEFT JOIN {GOLD_SCHEMA}.dim_product dp
                  ON dp.product_id = p.product_id
                LEFT JOIN {GOLD_SCHEMA}.new_dim_product_silver nd
                  ON nd.product_id = p.product_id
                WHERE p.store_id IN ({placeholders})
                  AND p.biz_date BETWEEN :start_date AND :end_date
                GROUP BY p.store_id, COALESCE(ast.store_name, ds.store_name, p.store_id), p.product_id
            )
            SELECT *
            FROM (
                SELECT
                    store_id,
                    store_name,
                    product_id,
                    product_name,
                    total_sales,
                    total_qty,
                    row_number() OVER (
                        PARTITION BY store_id
                        ORDER BY total_sales DESC, total_qty DESC, product_name
                    ) AS row_rank
                FROM aggregated
            ) ranked
            WHERE row_rank = 1
            """,
            params,
        )
        peak_rows: list[dict[str, Any]] = []
        try:
            peak_rows = await _fetch_gold_all(
                db,
                f"""
                SELECT *
                FROM (
                    SELECT
                        h.store_id,
                        COALESCE(ast.store_name, ds.store_name, h.store_id) AS store_name,
                        h.sale_hour,
                        h.total_sales,
                        row_number() OVER (
                            PARTITION BY h.store_id
                            ORDER BY h.total_sales DESC, h.sale_hour
                        ) AS row_rank
                    FROM {GOLD_SCHEMA}.gold__sales_hourly h
                    LEFT JOIN {APP_SCHEMA}.stores ast
                      ON ast.store_id = h.store_id
                    LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                      ON ds.store_id = h.store_id
                    WHERE h.store_id IN ({placeholders})
                      AND h.biz_date BETWEEN :start_date AND :end_date
                ) ranked
                WHERE row_rank = 1
                """,
                params,
            )
        except Exception:
            logger.warning("gold__sales_hourly not available — peak_hour will be null")

        if not kpi_rows:
            return {
                "my_store": {},
                "benchmark_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": 0,
                "peers": [],
                "strengths": [],
                "risks": [],
            }

        top_item_map = {str(row["store_id"]): row for row in top_item_rows}
        peak_map = {str(row["store_id"]): row for row in peak_rows}
        my_row = next((row for row in kpi_rows if str(row.get("store_id")) == str(store_id)), None)
        peer_rows = [row for row in kpi_rows if str(row.get("store_id")) != str(store_id)]
        if not my_row:
            return {
                "my_store": {},
                "benchmark_avg": {},
                "diff_pct": {},
                "rank_among_stores": None,
                "total_stores": 0,
                "peers": [],
                "strengths": [],
                "risks": [],
            }

        benchmark_sales = round(sum(_number(row.get("daily_avg_sales")) for row in peer_rows) / max(len(peer_rows), 1), 2) if peer_rows else None
        benchmark_qty = round(sum(_number(row.get("daily_avg_qty")) for row in peer_rows) / max(len(peer_rows), 1), 2) if peer_rows else None
        benchmark_waste = round(sum(_number(row.get("daily_avg_waste")) for row in peer_rows) / max(len(peer_rows), 1), 2) if peer_rows else None

        peers: list[dict[str, Any]] = []
        for row in peer_rows:
            peer_id = str(row.get("store_id") or "")
            top_item = top_item_map.get(peer_id)
            peak = peak_map.get(peer_id)
            sales_diff = _safe_pct_change(_number(row.get("daily_avg_sales")), _number(my_row.get("daily_avg_sales")))
            qty_diff = _safe_pct_change(_number(row.get("daily_avg_qty")), _number(my_row.get("daily_avg_qty")))
            peers.append(
                {
                    "store_id": peer_id,
                    "store_name": _canonical_store_name(peer_id, row.get("store_name") or peer_id),
                    "daily_avg_sales": round(_number(row.get("daily_avg_sales")), 2),
                    "daily_avg_qty": round(_number(row.get("daily_avg_qty")), 2),
                    "daily_avg_waste": round(_number(row.get("daily_avg_waste")), 2),
                    "sales_diff_pct": sales_diff,
                    "qty_diff_pct": qty_diff,
                    "top_product": str(top_item.get("product_name") or "") if top_item else None,
                    "top_product_sales": round(_number(top_item.get("total_sales")), 2) if top_item else None,
                    "peak_hour": int(_number(peak.get("sale_hour"))) if peak else None,
                    "peak_hour_sales": round(_number(peak.get("total_sales")), 2) if peak else None,
                    "is_recommended": bool(sales_diff is not None and sales_diff > 0),
                }
            )

        strengths: list[str] = []
        risks: list[str] = []
        my_sales = round(_number(my_row.get("daily_avg_sales")), 2)
        my_qty = round(_number(my_row.get("daily_avg_qty")), 2)
        my_waste = round(_number(my_row.get("daily_avg_waste")), 2)
        if benchmark_sales is not None:
            if my_sales >= benchmark_sales:
                strengths.append(f"비교 매장 평균 대비 일평균 매출이 {round(my_sales - benchmark_sales):,}원 높습니다.")
            else:
                risks.append(f"비교 매장 평균 대비 일평균 매출이 {round(benchmark_sales - my_sales):,}원 낮습니다.")
        if benchmark_qty is not None:
            if my_qty >= benchmark_qty:
                strengths.append(f"일평균 판매수량이 비교 매장 평균보다 {round(my_qty - benchmark_qty):,}개 많습니다.")
            else:
                risks.append(f"일평균 판매수량이 비교 매장 평균보다 {round(benchmark_qty - my_qty):,}개 적습니다.")
        if benchmark_waste is not None:
            if my_waste <= benchmark_waste:
                strengths.append("폐기수량은 비교 매장 평균 이하로 관리되고 있습니다.")
            else:
                risks.append("폐기수량이 비교 매장 평균보다 높아 운영 점검이 필요합니다.")

        return {
            "my_store": {
                "store_id": str(my_row.get("store_id") or store_id),
                "store_name": _canonical_store_name(my_row.get("store_id") or store_id, my_row.get("store_name") or store_id),
                "daily_avg_sales": my_sales,
                "daily_avg_qty": my_qty,
                "daily_avg_waste": my_waste,
                "top_product": str(top_item_map.get(str(store_id), {}).get("product_name") or ""),
                "peak_hour": int(_number(peak_map.get(str(store_id), {}).get("sale_hour"))) if peak_map.get(str(store_id)) else None,
            },
            "benchmark_avg": {
                "daily_avg_sales": benchmark_sales,
                "daily_avg_qty": benchmark_qty,
                "daily_avg_waste": benchmark_waste,
            },
            "diff_pct": {
                "sales": _safe_pct_change(my_sales, benchmark_sales) if benchmark_sales not in (None, 0) else None,
                "qty": _safe_pct_change(my_qty, benchmark_qty) if benchmark_qty not in (None, 0) else None,
                "waste": _safe_pct_change(my_waste, benchmark_waste) if benchmark_waste not in (None, 0) else None,
            },
            "rank_among_stores": int(_number(my_row.get("sales_rank"))) if my_row.get("sales_rank") is not None else None,
            "total_stores": int(_number(my_row.get("total_stores"))) if my_row.get("total_stores") is not None else DEMO_BENCHMARK_STORE_COUNT,
            "peers": peers,
            "strengths": strengths,
            "risks": risks,
        }
    except Exception:
        logger.exception("Failed to fetch peer benchmark summary for store_id=%s", store_id)
        return {
            "my_store": {},
            "benchmark_avg": {},
            "diff_pct": {},
            "rank_among_stores": None,
            "total_stores": 0,
            "peers": [],
            "strengths": [],
            "risks": [],
        }


async def get_benchmark_hourly_sales(
    db,
    store_ids: list[str],
    biz_date: date,
) -> list[dict[str, Any]]:
    if not _is_async_session(db) or not store_ids:
        return []
    try:
        placeholders, params = _named_list_params("benchmark_store", store_ids)
        rows = await _fetch_gold_all(
            db,
            f"""
            SELECT
                h.store_id,
                COALESCE(ast.store_name, ds.store_name, h.store_id) AS store_name,
                h.sale_hour,
                h.total_sales,
                h.total_qty,
                h.txn_cnt
            FROM {GOLD_SCHEMA}.gold__sales_hourly h
            LEFT JOIN {APP_SCHEMA}.stores ast
              ON ast.store_id = h.store_id
            LEFT JOIN {GOLD_SCHEMA}.dim_store ds
              ON ds.store_id = h.store_id
            WHERE h.store_id IN ({placeholders})
              AND h.biz_date = :biz_date
            ORDER BY h.store_id, h.sale_hour
            """,
            {**params, "biz_date": biz_date},
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            sid = str(row.get("store_id") or "")
            bucket = grouped.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "points": [],
                },
            )
            bucket["points"].append(
                {
                    "hour": int(_number(row.get("sale_hour"))),
                    "sales": round(_number(row.get("total_sales")), 2),
                    "qty": round(_number(row.get("total_qty")), 2),
                    "txn_cnt": int(_number(row.get("txn_cnt"))),
                }
            )
        if grouped:
            return list(grouped.values())
    except Exception:
        logger.warning("gold__sales_hourly not available — falling back to KPI+profile hourly")
        try:
            await db.rollback()
        except Exception:
            pass

    try:
        placeholders2, params2 = _named_list_params("bh_store", store_ids)
        kpi_rows = await _fetch_gold_all(
            db,
            f"""
            SELECT
                k.store_id,
                COALESCE(ast.store_name, ds.store_name, k.store_id) AS store_name,
                avg(k.total_sales) AS daily_avg_sales,
                avg(k.total_qty) AS daily_avg_qty
            FROM {GOLD_SCHEMA}.new_kpi_store_day_gold k
            LEFT JOIN {APP_SCHEMA}.stores ast
              ON ast.store_id = k.store_id
            LEFT JOIN {GOLD_SCHEMA}.dim_store ds
              ON ds.store_id = k.store_id
            WHERE k.store_id IN ({placeholders2})
              AND k.biz_date = :biz_date
            GROUP BY k.store_id, COALESCE(ast.store_name, ds.store_name, k.store_id)
            """,
            {**params2, "biz_date": biz_date},
        )
        grouped2: dict[str, dict[str, Any]] = {}
        for row in kpi_rows:
            sid = str(row.get("store_id") or "")
            daily_sales = _number(row.get("daily_avg_sales"))
            daily_qty = _number(row.get("daily_avg_qty"))
            if daily_sales <= 0:
                continue
            bucket = grouped2.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "points": [],
                },
            )
            for hour, share in DEFAULT_HOURLY_PROFILE.items():
                bucket["points"].append(
                    {
                        "hour": hour,
                        "sales": round(daily_sales * share, 2),
                        "qty": round(daily_qty * share, 2),
                        "txn_cnt": 0,
                    }
                )
        return list(grouped2.values())
    except Exception:
        logger.exception("Fallback KPI-based hourly for benchmark also failed")
        return []


async def get_benchmark_top_items(
    db,
    store_ids: list[str],
    start_date: date,
    end_date: date,
    *,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    if not _is_async_session(db) or not store_ids:
        return []
    try:
        placeholders, params = _named_list_params("benchmark_store", store_ids)
        params.update({"start_date": start_date, "end_date": end_date, "top_n": int(top_n)})
        rows = await _fetch_gold_all(
            db,
            f"""
            WITH app_products AS (
                SELECT
                    product_id,
                    NULLIF(product_name, '') AS product_name
                FROM {APP_SCHEMA}.products
            ),
            aggregated AS (
                SELECT
                    p.store_id,
                    COALESCE(ast.store_name, ds.store_name, p.store_id) AS store_name,
                    p.product_id,
                    COALESCE(
                        max(ap.product_name),
                        NULLIF(max(p.product_name), ''),
                        max(dp.product_name),
                        max(nd.product_name),
                        p.product_id
                    ) AS product_name,
                    sum(COALESCE(p.sold_qty, 0)) AS sold_qty,
                    sum(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS sales_amt
                FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                LEFT JOIN {APP_SCHEMA}.stores ast
                  ON ast.store_id = p.store_id
                LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                  ON ds.store_id = p.store_id
                LEFT JOIN app_products ap
                  ON ap.product_id = p.product_id
                LEFT JOIN {GOLD_SCHEMA}.dim_product dp
                  ON dp.product_id = p.product_id
                LEFT JOIN {GOLD_SCHEMA}.new_dim_product_silver nd
                  ON nd.product_id = p.product_id
                WHERE p.store_id IN ({placeholders})
                  AND p.biz_date BETWEEN :start_date AND :end_date
                GROUP BY p.store_id, COALESCE(ast.store_name, ds.store_name, p.store_id), p.product_id
            )
            SELECT *
            FROM (
                SELECT
                    store_id,
                    store_name,
                    product_id,
                    product_name,
                    sold_qty,
                    sales_amt,
                    row_number() OVER (
                        PARTITION BY store_id
                        ORDER BY sales_amt DESC, sold_qty DESC, product_name
                    ) AS row_rank
                FROM aggregated
            ) ranked
            WHERE row_rank <= :top_n
            ORDER BY store_id, row_rank
            """,
            params,
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            sid = str(row.get("store_id") or "")
            bucket = grouped.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "items": [],
                },
            )
            bucket["items"].append(
                {
                    "product_id": str(row.get("product_id") or ""),
                    "product_name": str(row.get("product_name") or ""),
                    "sold_qty": round(_number(row.get("sold_qty")), 2),
                    "sales_amt": round(_number(row.get("sales_amt")), 2),
                }
            )
        return list(grouped.values())
    except Exception:
        logger.exception("Failed to fetch benchmark top items")
        return []


async def get_benchmark_channel_comparison(
    db,
    store_ids: list[str],
    biz_date: date,
) -> list[dict[str, Any]]:
    if not _is_async_session(db) or not store_ids:
        return []
    try:
        placeholders, params = _named_list_params("benchmark_store", store_ids)
        rows = await _fetch_gold_all(
            db,
            f"""
            WITH grouped AS (
                SELECT
                    c.masked_stor_cd AS store_id,
                    COALESCE(ast.store_name, ds.store_name, c.masked_stor_nm, c.masked_stor_cd) AS store_name,
                    CASE
                        WHEN c.ho_chnl_div = '오프라인' THEN '오프라인'
                        WHEN c.ho_chnl_div = '온라인-배달' THEN '온라인-배달'
                        WHEN c.ho_chnl_div = '온라인-픽업' THEN '온라인-픽업'
                        ELSE COALESCE(NULLIF(c.ho_chnl_div, ''), '기타')
                    END AS channel_group,
                    sum(COALESCE(c.sale_amt, 0)) AS sales_amt,
                    sum(COALESCE(c.ord_cnt, 0)) AS order_count
                FROM {GOLD_SCHEMA}.new_sales_channel_daily c
                LEFT JOIN {APP_SCHEMA}.stores ast
                  ON ast.store_id = c.masked_stor_cd
                LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                  ON ds.store_id = c.masked_stor_cd
                WHERE c.masked_stor_cd IN ({placeholders})
                  AND c.sale_dt = :biz_date
                GROUP BY c.masked_stor_cd, COALESCE(ast.store_name, ds.store_name, c.masked_stor_nm, c.masked_stor_cd), 3
            )
            SELECT * FROM grouped
            ORDER BY store_id, sales_amt DESC, channel_group
            """,
            {**params, "biz_date": biz_date},
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            sid = str(row.get("store_id") or "")
            bucket = grouped.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "channels": [],
                },
            )
            bucket["channels"].append(
                {
                    "channel_group": str(row.get("channel_group") or "기타"),
                    "sales_amt": round(_number(row.get("sales_amt")), 2),
                    "order_count": int(_number(row.get("order_count"))),
                }
            )
        for bucket in grouped.values():
            total_sales = sum(_number(item.get("sales_amt")) for item in bucket["channels"])
            for item in bucket["channels"]:
                item["pct_of_total"] = round((_number(item.get("sales_amt")) / total_sales) * 100, 1) if total_sales else 0.0
        return list(grouped.values())
    except Exception:
        logger.exception("Failed to fetch benchmark channel comparison")
        return []


async def get_benchmark_payment_comparison(
    db,
    store_ids: list[str],
    biz_date: date,
) -> list[dict[str, Any]]:
    if not _is_async_session(db) or not store_ids:
        return []
    try:
        placeholders, params = _named_list_params("benchmark_store", store_ids)
        rows = await _fetch_gold_all(
            db,
            f"""
            WITH grouped AS (
                SELECT
                    p.masked_stor_cd AS store_id,
                    COALESCE(ast.store_name, ds.store_name, p.masked_stor_nm, p.masked_stor_cd) AS store_name,
                    CASE
                        WHEN p.pay_way_cd_nm ILIKE '%카드%' THEN '카드'
                        WHEN p.pay_way_cd_nm ILIKE '%현금%' THEN '현금'
                        WHEN p.pay_way_cd_nm ILIKE '%페이%' OR p.pay_way_cd_nm ILIKE '%간편%' THEN '간편결제'
                        WHEN p.pay_way_cd_nm ILIKE '%교환권%' OR p.pay_way_cd_nm ILIKE '%상품권%' THEN '상품권'
                        WHEN p.pay_way_cd_nm ILIKE '%포인트%' THEN '포인트'
                        ELSE '기타'
                    END AS payment_group,
                    sum(COALESCE(p.pay_amt, 0)) AS sales_amt
                FROM {GOLD_SCHEMA}.new_sales_payment_daily p
                LEFT JOIN {APP_SCHEMA}.stores ast
                  ON ast.store_id = p.masked_stor_cd
                LEFT JOIN {GOLD_SCHEMA}.dim_store ds
                  ON ds.store_id = p.masked_stor_cd
                WHERE p.masked_stor_cd IN ({placeholders})
                  AND p.sale_dt = :biz_date
                GROUP BY p.masked_stor_cd, COALESCE(ast.store_name, ds.store_name, p.masked_stor_nm, p.masked_stor_cd), 3
            )
            SELECT * FROM grouped
            ORDER BY store_id, sales_amt DESC, payment_group
            """,
            {**params, "biz_date": biz_date},
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            sid = str(row.get("store_id") or "")
            bucket = grouped.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "methods": [],
                },
            )
            bucket["methods"].append(
                {
                    "payment_group": str(row.get("payment_group") or "기타"),
                    "sales_amt": round(_number(row.get("sales_amt")), 2),
                }
            )
        for bucket in grouped.values():
            total_sales = sum(_number(item.get("sales_amt")) for item in bucket["methods"])
            for item in bucket["methods"]:
                item["pct_of_total"] = round((_number(item.get("sales_amt")) / total_sales) * 100, 1) if total_sales else 0.0
        return list(grouped.values())
    except Exception:
        logger.exception("Failed to fetch benchmark payment comparison")
        return []


async def get_benchmark_promotion_comparison(
    db,
    store_ids: list[str],
    biz_date: date,
) -> list[dict[str, Any]]:
    if not _is_async_session(db) or not store_ids:
        return []
    try:
        placeholders, params = _named_list_params("benchmark_store", store_ids)
        rows = await _fetch_gold_all(
            db,
            f"""
            SELECT
                p.store_id,
                COALESCE(ast.store_name, ds.store_name, p.store_id) AS store_name,
                p.campaign_name,
                COALESCE(p.sales_amt, 0) AS sales_amt,
                COALESCE(p.bill_cnt, 0) AS bill_cnt
            FROM {GOLD_SCHEMA}.new_campaign_day_gold p
            LEFT JOIN {APP_SCHEMA}.stores ast
              ON ast.store_id = p.store_id
            LEFT JOIN {GOLD_SCHEMA}.dim_store ds
              ON ds.store_id = p.store_id
            WHERE p.store_id IN ({placeholders})
              AND p.biz_date = :biz_date
            ORDER BY p.store_id, p.sales_amt DESC, p.bill_cnt DESC, p.campaign_name
            """,
            {**params, "biz_date": biz_date},
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            sid = str(row.get("store_id") or "")
            bucket = grouped.setdefault(
                sid,
                {
                    "store_id": sid,
                    "store_name": _canonical_store_name(sid, row.get("store_name") or sid),
                    "promotions": [],
                },
            )
            bucket["promotions"].append(
                {
                    "campaign_name": str(row.get("campaign_name") or ""),
                    "sales_amt": round(_number(row.get("sales_amt")), 2),
                    "bill_cnt": int(_number(row.get("bill_cnt"))),
                }
            )
        for bucket in grouped.values():
            bucket["promotions"] = bucket["promotions"][:5]
        return list(grouped.values())
    except Exception:
        logger.exception("Failed to fetch benchmark promotion comparison")
        return []


async def get_promo_analysis(
    db,
    store_id: str,
    promo_name: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            latest_row = await _fetch_gold_one(
                db,
                f"""
                SELECT max(biz_date) AS biz_date
                FROM {GOLD_SCHEMA}.new_campaign_day_gold
                WHERE store_id = :store_id
                """,
                {"store_id": str(store_id)},
            )
            resolved_end = end_date or (latest_row.get("biz_date") if latest_row else None)
            if resolved_end is None:
                return []
            resolved_start = start_date or (resolved_end - timedelta(days=30))
            promo_filter = ""
            params: dict[str, Any] = {
                "store_id": str(store_id),
                "start_date": resolved_start,
                "end_date": resolved_end,
            }
            if promo_name:
                promo_filter = """
                      AND (
                        campaign_name ILIKE :promo_pattern
                        OR campaign_id ILIKE :promo_pattern
                      )
                """
                params["promo_pattern"] = f"%{str(promo_name).strip()}%"
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH filtered AS (
                    SELECT
                        store_id,
                        biz_date,
                        campaign_id,
                        campaign_name,
                        COALESCE(sales_amt, 0) AS sales_amt,
                        COALESCE(bill_cnt, 0) AS bill_cnt
                    FROM {GOLD_SCHEMA}.new_campaign_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :start_date AND :end_date
                    {promo_filter}
                ),
                totals AS (
                    SELECT
                        COALESCE(sum(sales_amt), 0) AS total_sales_amt,
                        COALESCE(sum(bill_cnt), 0) AS total_bill_cnt
                    FROM filtered
                )
                SELECT
                    f.store_id,
                    f.biz_date,
                    f.campaign_id,
                    f.campaign_name,
                    f.sales_amt,
                    f.bill_cnt,
                    CASE
                        WHEN length(f.campaign_name) > 14 THEN substr(f.campaign_name, 1, 14) || '…'
                        ELSE f.campaign_name
                    END AS week,
                    round(f.bill_cnt::numeric, 1) AS reaction_rate,
                    CASE
                        WHEN t.total_bill_cnt > 0 THEN round((f.bill_cnt::numeric / t.total_bill_cnt::numeric) * 100, 1)
                        ELSE 0
                    END AS conversion_rate,
                    CASE
                        WHEN t.total_sales_amt > 0 THEN round((f.sales_amt::numeric / t.total_sales_amt::numeric) * 100, 1)
                        ELSE 0
                    END AS sales_contribution
                FROM filtered f
                CROSS JOIN totals t
                ORDER BY f.biz_date DESC, f.sales_amt DESC, f.bill_cnt DESC, f.campaign_name
                """,
                params,
            )
            return [
                {
                    "promo_id": str(row.get("campaign_id") or ""),
                    "promo_name": str(row.get("campaign_name") or ""),
                    "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                    "sales_amt": round(_number(row.get("sales_amt")), 2),
                    "bill_cnt": int(round(_number(row.get("bill_cnt")))),
                    "week": str(row.get("week") or ""),
                    "반응률": round(_number(row.get("reaction_rate")), 1),
                    "전환율": round(_number(row.get("conversion_rate")), 1),
                    "매출기여": round(_number(row.get("sales_contribution")), 1),
                    "status": "active" if _number(row.get("sales_amt")) > 0 else "tracked",
                    "note": f"{row['biz_date'].isoformat() if row.get('biz_date') else ''} 매출 {int(round(_number(row.get('sales_amt'))))}원 · {int(round(_number(row.get('bill_cnt'))))}건",
                }
                for row in rows
            ]
        except Exception:
            logger.exception("Failed to fetch gold promo analysis for store_id=%s", store_id)
            return []
    try:
        frame = _store(db).fact_promo_day
        if frame.empty:
            return []
        filtered = frame[frame["store_id"] == str(store_id)]
        if promo_name:
            filtered = filtered[filtered["promo_name"].astype(str).str.contains(str(promo_name), case=False, na=False)]
        if start_date:
            filtered = filtered[filtered["biz_date"] >= _to_timestamp(start_date)]
        if end_date:
            filtered = filtered[filtered["biz_date"] <= _to_timestamp(end_date)]
        filtered = filtered.copy()
        filtered["biz_date"] = filtered["biz_date"].map(_to_iso)
        return filtered.to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch promo analysis for store_id=%s", store_id)
        return []


async def get_promo_performance_summary(
    db,
    store_id: str,
    promo_name_filter: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    """Get promotion sales facts capped to the requested performance end date."""
    if _is_async_session(db):
        try:
            latest_row = await _fetch_gold_one(
                db,
                f"""
                SELECT max(biz_date) AS biz_date
                FROM {GOLD_SCHEMA}.new_campaign_day_gold
                WHERE store_id = :store_id
                """,
                {"store_id": str(store_id)},
            )
            latest_campaign_date = latest_row.get("biz_date") if latest_row else None
            resolved_end = end_date or latest_campaign_date
            if resolved_end is None:
                return _empty_promo_summary()
            if start_date is None:
                start_date = resolved_end - timedelta(days=30)

            metric_cutoff = min(resolved_end, latest_campaign_date) if latest_campaign_date else resolved_end
            has_filter = bool(str(promo_name_filter or "").strip())
            candidate_start = metric_cutoff - timedelta(days=455) if has_filter else start_date
            candidate_end = metric_cutoff
            promo_filter = ""
            params: dict[str, Any] = {
                "store_id": str(store_id),
                "candidate_start": candidate_start,
                "candidate_end": candidate_end,
            }
            if has_filter:
                promo_filter = """
                      AND (
                        campaign_name ILIKE :promo_pattern
                        OR campaign_id ILIKE :promo_pattern
                      )
                """
                params["promo_pattern"] = f"%{str(promo_name_filter).strip()}%"

            candidate_rows = await _fetch_gold_all(
                db,
                f"""
                WITH base AS (
                    SELECT DISTINCT
                        store_id,
                        biz_date,
                        COALESCE(campaign_id, '') AS campaign_id,
                        COALESCE(campaign_name, '') AS campaign_name,
                        COALESCE(sales_amt, 0)::numeric AS sales_amt,
                        COALESCE(bill_cnt, 0)::numeric AS bill_cnt
                    FROM {GOLD_SCHEMA}.new_campaign_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :candidate_start AND :candidate_end
                )
                SELECT *
                FROM base
                WHERE TRUE
                {promo_filter}
                ORDER BY biz_date DESC, sales_amt DESC, bill_cnt DESC, campaign_name
                """,
                params,
            )

            if not candidate_rows:
                empty = _empty_promo_summary()
                empty.update(
                    {
                        "period_start": str(start_date),
                        "period_end": str(metric_cutoff),
                        "candidate_search_start": str(candidate_start),
                        "candidate_search_end": str(candidate_end),
                        "metric_cutoff_date": str(metric_cutoff),
                        "query_promotion_type": str(promo_name_filter or "프로모션"),
                        "future_data_included": False,
                    }
                )
                return empty

            def _campaign_key(row: dict[str, Any]) -> tuple[str, str]:
                return (str(row.get("campaign_id") or ""), str(row.get("campaign_name") or ""))

            if has_filter:
                current_key = _campaign_key(candidate_rows[0])
                current_rows = [row for row in candidate_rows if _campaign_key(row) == current_key]
            else:
                current_rows = [
                    row
                    for row in candidate_rows
                    if start_date <= row.get("biz_date") <= metric_cutoff
                ]

            if not current_rows:
                return _empty_promo_summary()

            row_dates = [row["biz_date"] for row in current_rows if row.get("biz_date")]
            raw_min_date = min(row_dates) if row_dates else start_date
            raw_max_date = max(row_dates) if row_dates else metric_cutoff
            campaign_names = sorted(
                {
                    str(row.get("campaign_name") or "")
                    for row in current_rows
                    if row.get("campaign_name")
                }
            )
            campaign_ids = sorted(
                {
                    str(row.get("campaign_id") or "")
                    for row in current_rows
                    if row.get("campaign_id")
                }
            )

            def _month_range_for(value: date) -> tuple[date, date]:
                return (
                    date(value.year, value.month, 1),
                    date(value.year, value.month, calendar.monthrange(value.year, value.month)[1]),
                )

            single_campaign = len({_campaign_key(row) for row in current_rows}) == 1
            if single_campaign and raw_min_date == raw_max_date:
                metric_start, metric_end = _month_range_for(raw_min_date)
                metric_end = min(metric_end, metric_cutoff)
            else:
                metric_start = max(start_date, raw_min_date)
                metric_end = min(metric_cutoff, raw_max_date)

            promo_sales = sum(_number(row.get("sales_amt")) for row in current_rows)
            promo_bills = int(round(sum(_number(row.get("bill_cnt")) for row in current_rows)))
            promo_count = len({_campaign_key(row) for row in current_rows})

            total_sales_row = await _fetch_gold_one(
                db,
                f"""
                SELECT COALESCE(sum(total_sales), 0) AS total_sales
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                WHERE store_id = :store_id
                  AND biz_date BETWEEN :metric_start AND :metric_end
                """,
                {
                    "store_id": str(store_id),
                    "metric_start": metric_start,
                    "metric_end": metric_end,
                },
            )
            same_period_total = _number(total_sales_row.get("total_sales") if total_sales_row else 0)
            promo_ratio_pct = (promo_sales / same_period_total * 100) if same_period_total > 0 else 0

            grouped: dict[tuple[str, str], dict[str, Any]] = {}
            for row in current_rows:
                key = _campaign_key(row)
                bucket = grouped.setdefault(
                    key,
                    {
                        "campaign_id": key[0],
                        "campaign_name": key[1],
                        "sales_amt": 0.0,
                        "bill_cnt": 0,
                        "min_date": row.get("biz_date"),
                        "max_date": row.get("biz_date"),
                    },
                )
                bucket["sales_amt"] += _number(row.get("sales_amt"))
                bucket["bill_cnt"] += int(round(_number(row.get("bill_cnt"))))
                if row.get("biz_date"):
                    bucket["min_date"] = min(bucket["min_date"], row["biz_date"])
                    bucket["max_date"] = max(bucket["max_date"], row["biz_date"])

            top_campaigns = [
                {
                    **item,
                    "sales_amt": round(_number(item.get("sales_amt")), 2),
                    "bill_cnt": int(round(_number(item.get("bill_cnt")))),
                    "period_start": item["min_date"].isoformat() if item.get("min_date") else None,
                    "period_end": item["max_date"].isoformat() if item.get("max_date") else None,
                }
                for item in sorted(
                    grouped.values(),
                    key=lambda grouped_item: (
                        _number(grouped_item.get("sales_amt")),
                        _number(grouped_item.get("bill_cnt")),
                    ),
                    reverse=True,
                )[:5]
            ]

            previous_comparison_available = False
            previous_promotion: dict[str, Any] | None = None
            prev_sales = 0.0
            prev_bills = 0
            prev_ratio_pct = 0.0
            prev_rows: list[dict[str, Any]] = []
            previous_period_start: date | None = None
            previous_period_end: date | None = None

            if has_filter:
                current_key = _campaign_key(current_rows[0])
                previous_candidates = [
                    row
                    for row in candidate_rows
                    if _campaign_key(row) != current_key
                    and row.get("biz_date")
                    and row["biz_date"] < raw_min_date
                ]
                if previous_candidates:
                    prev_key = _campaign_key(previous_candidates[0])
                    prev_rows = [row for row in previous_candidates if _campaign_key(row) == prev_key]
            else:
                previous_period_end = start_date - timedelta(days=1)
                previous_period_start = previous_period_end - timedelta(days=(metric_cutoff - start_date).days)
                prev_rows = await _fetch_gold_all(
                    db,
                    f"""
                    WITH base AS (
                        SELECT DISTINCT
                            store_id,
                            biz_date,
                            COALESCE(campaign_id, '') AS campaign_id,
                            COALESCE(campaign_name, '') AS campaign_name,
                            COALESCE(sales_amt, 0)::numeric AS sales_amt,
                            COALESCE(bill_cnt, 0)::numeric AS bill_cnt
                        FROM {GOLD_SCHEMA}.new_campaign_day_gold
                        WHERE store_id = :store_id
                          AND biz_date BETWEEN :prev_start AND :prev_end
                    )
                    SELECT *
                    FROM base
                    ORDER BY biz_date DESC, sales_amt DESC, bill_cnt DESC, campaign_name
                    """,
                    {
                        "store_id": str(store_id),
                        "prev_start": previous_period_start,
                        "prev_end": previous_period_end,
                    },
                )

            prev_total = 0.0
            if prev_rows:
                prev_dates = [row["biz_date"] for row in prev_rows if row.get("biz_date")]
                prev_raw_min = min(prev_dates)
                prev_raw_max = max(prev_dates)
                if len({_campaign_key(row) for row in prev_rows}) == 1 and prev_raw_min == prev_raw_max:
                    previous_period_start, previous_period_end = _month_range_for(prev_raw_min)
                    previous_period_end = min(previous_period_end, metric_cutoff)
                else:
                    previous_period_start = previous_period_start or prev_raw_min
                    previous_period_end = previous_period_end or prev_raw_max
                prev_sales = sum(_number(row.get("sales_amt")) for row in prev_rows)
                prev_bills = int(round(sum(_number(row.get("bill_cnt")) for row in prev_rows)))
                previous_comparison_available = prev_sales > 0 or prev_bills > 0
                prev_total_row = await _fetch_gold_one(
                    db,
                    f"""
                    SELECT COALESCE(sum(total_sales), 0) AS total_sales
                    FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :prev_start AND :prev_end
                    """,
                    {
                        "store_id": str(store_id),
                        "prev_start": previous_period_start,
                        "prev_end": previous_period_end,
                    },
                )
                prev_total = _number(prev_total_row.get("total_sales") if prev_total_row else 0)
                prev_ratio_pct = (prev_sales / prev_total * 100) if prev_total > 0 else 0
                prev_names = sorted({str(row.get("campaign_name") or "") for row in prev_rows if row.get("campaign_name")})
                previous_promotion = {
                    "campaign_name": prev_names[0] if len(prev_names) == 1 else ", ".join(prev_names[:3]),
                    "participation_count": prev_bills,
                    "promo_sales": round(prev_sales, 2),
                    "same_period_total_sales": round(prev_total, 2),
                    "promo_sales_ratio_pct": round(prev_ratio_pct, 2),
                    "period_start": previous_period_start.isoformat() if previous_period_start else None,
                    "period_end": previous_period_end.isoformat() if previous_period_end else None,
                }

            sales_diff = promo_sales - prev_sales
            bills_diff = promo_bills - prev_bills
            ratio_diff = promo_ratio_pct - prev_ratio_pct
            sales_diff_pct = (sales_diff / prev_sales * 100) if prev_sales > 0 else None
            bills_diff_pct = (bills_diff / prev_bills * 100) if prev_bills > 0 else None

            query_type = str(promo_name_filter or "").strip() or "프로모션"
            first_campaign_name = campaign_names[0] if len(campaign_names) == 1 else (top_campaigns[0]["campaign_name"] if top_campaigns else "")
            if query_type.upper() == "D-DAY" or (query_type == "프로모션" and "D-DAY" in first_campaign_name.upper()):
                query_type = "D-DAY"
            elif "네이버페이" in first_campaign_name or query_type == "네이버페이":
                query_type = "네이버페이"

            if metric_start.year == metric_end.year and metric_start.month == metric_end.month:
                campaign_period_label = f"{metric_start.year}년 {metric_start.month}월"
            else:
                campaign_period_label = f"{metric_start.isoformat()}~{metric_end.isoformat()}"

            return {
                "query_promotion_type": query_type,
                "campaign_id": campaign_ids[0] if len(campaign_ids) == 1 else None,
                "campaign_name": first_campaign_name,
                "campaign_names": campaign_names,
                "campaign_period_label": campaign_period_label,
                "promo_count": promo_count,
                "promo_sales": round(promo_sales, 2),
                "promo_bill_cnt": promo_bills,
                "participation_count": promo_bills,
                "min_date": raw_min_date.isoformat() if raw_min_date else None,
                "max_date": raw_max_date.isoformat() if raw_max_date else None,
                "period_start": metric_start.isoformat(),
                "period_end": metric_end.isoformat(),
                "raw_campaign_start": raw_min_date.isoformat() if raw_min_date else None,
                "raw_campaign_end": raw_max_date.isoformat() if raw_max_date else None,
                "candidate_search_start": candidate_start.isoformat(),
                "candidate_search_end": candidate_end.isoformat(),
                "metric_cutoff_date": metric_cutoff.isoformat(),
                "future_data_included": False,
                "same_period_total_sales": round(same_period_total, 2),
                "same_period_total_sales_source": f"{GOLD_SCHEMA}.new_kpi_store_day_gold.total_sales",
                "same_period_total_sales_period_start": metric_start.isoformat(),
                "same_period_total_sales_period_end": metric_end.isoformat(),
                "promo_sales_ratio_pct": round(promo_ratio_pct, 2),
                "top_campaigns": top_campaigns,
                "product_mix_available": False,
                "product_mix": [],
                "product_mix_unavailable_reason": "현재 연결된 행사 자료만으로는 제품군별 판매 믹스를 분리하기 어렵습니다.",
                "previous_comparison_available": previous_comparison_available,
                "previous_promotion": previous_promotion,
                "previous_promo_count": len({_campaign_key(row) for row in prev_rows}) if prev_rows else 0,
                "previous_promo_sales": round(prev_sales, 2),
                "previous_promo_bill_cnt": prev_bills,
                "previous_promo_ratio_pct": round(prev_ratio_pct, 2),
                "previous_comparison_unavailable_reason": ""
                if previous_comparison_available
                else "이전 행사와 직접 비교할 수 있는 연결 자료가 부족합니다.",
                "sales_diff": round(sales_diff, 2),
                "sales_diff_pct": round(sales_diff_pct, 1) if sales_diff_pct is not None else None,
                "bills_diff": bills_diff,
                "bills_diff_pct": round(bills_diff_pct, 1) if bills_diff_pct is not None else None,
                "promo_sales_ratio_diff_pctp": round(ratio_diff, 2),
            }
        except Exception:
            logger.exception("Failed to fetch gold promo performance for store_id=%s", store_id)
            return _empty_promo_summary()
    return _empty_promo_summary()


def _empty_promo_summary() -> dict[str, Any]:
    return {
        "query_promotion_type": "프로모션",
        "campaign_id": None,
        "campaign_name": "",
        "campaign_names": [],
        "campaign_period_label": "",
        "promo_count": 0,
        "promo_sales": 0,
        "promo_bill_cnt": 0,
        "participation_count": 0,
        "min_date": None,
        "max_date": None,
        "period_start": None,
        "period_end": None,
        "raw_campaign_start": None,
        "raw_campaign_end": None,
        "candidate_search_start": None,
        "candidate_search_end": None,
        "metric_cutoff_date": None,
        "future_data_included": False,
        "same_period_total_sales": 0,
        "same_period_total_sales_source": "",
        "same_period_total_sales_period_start": None,
        "same_period_total_sales_period_end": None,
        "promo_sales_ratio_pct": 0,
        "top_campaigns": [],
        "product_mix_available": False,
        "product_mix": [],
        "product_mix_unavailable_reason": "현재 연결된 행사 자료만으로는 제품군별 판매 믹스를 분리하기 어렵습니다.",
        "previous_comparison_available": False,
        "previous_promotion": None,
        "previous_promo_count": 0,
        "previous_promo_sales": 0,
        "previous_promo_bill_cnt": 0,
        "previous_promo_ratio_pct": 0,
        "previous_comparison_unavailable_reason": "이전 행사와 직접 비교할 수 있는 연결 자료가 부족합니다.",
        "sales_diff": 0,
        "sales_diff_pct": None,
        "bills_diff": 0,
        "bills_diff_pct": None,
        "promo_sales_ratio_diff_pctp": 0,
    }


async def get_payment_method_mix(
    db,
    store_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            latest_row = await _fetch_gold_one(
                db,
                f"""
                SELECT max(biz_date) AS biz_date
                FROM {GOLD_SCHEMA}.new_campaign_day_gold
                WHERE store_id = :store_id
                """,
                {"store_id": str(store_id)},
            )
            kpi_latest_row = await _fetch_gold_one(
                db,
                f"""
                SELECT max(biz_date) AS biz_date
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                WHERE store_id = :store_id
                """,
                {"store_id": str(store_id)},
            )
            resolved_end = end_date or (latest_row.get("biz_date") if latest_row else None)
            kpi_end = kpi_latest_row.get("biz_date") if kpi_latest_row else resolved_end
            if resolved_end is None:
                return {
                    "period": {"start": None, "end": None},
                    "methods": [],
                }
            resolved_start = start_date or resolved_end
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH grouped AS (
                    SELECT
                        CASE
                            WHEN pay_method_nm ILIKE '%카드%' THEN '카드'
                            WHEN pay_method_nm ILIKE '%현금%' THEN '현금'
                            WHEN pay_method_nm ILIKE '%페이%' OR pay_method_nm ILIKE '%모바일캐시%' OR pay_method_nm ILIKE '%간편%' THEN '간편결제'
                            WHEN pay_method_nm ILIKE '%교환권%' OR pay_method_nm ILIKE '%상품권%' THEN '상품권'
                            WHEN pay_method_nm ILIKE '%포인트%' THEN '포인트'
                            ELSE '기타'
                        END AS group_name,
                        sum(COALESCE(bill_cnt, 0)) AS code_count,
                        sum(COALESCE(sales_amt, 0)) AS sales_amt,
                        string_agg(DISTINCT pay_method_nm, ', ' ORDER BY pay_method_nm) AS method_names
                    FROM {GOLD_SCHEMA}.new_payment_mix_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :start_date AND :end_date
                    GROUP BY 1
                ),
                totals AS (
                    SELECT COALESCE(sum(sales_amt), 0) AS total_sales
                    FROM grouped
                )
                SELECT
                    g.group_name,
                    g.code_count,
                    g.sales_amt,
                    g.method_names,
                    CASE
                        WHEN t.total_sales > 0 THEN round((g.sales_amt / t.total_sales) * 100, 1)
                        ELSE 0
                    END AS pct_of_total
                FROM grouped g
                CROSS JOIN totals t
                ORDER BY g.sales_amt DESC, g.code_count DESC, g.group_name
                """,
                {
                    "store_id": str(store_id),
                    "start_date": resolved_start,
                    "end_date": resolved_end,
                },
            )
            return {
                "period": {
                    "start": resolved_start.isoformat(),
                    "end": resolved_end.isoformat(),
                },
                "methods": [
                    {
                        "group_name": str(row.get("group_name") or "기타"),
                        "code_count": int(round(_number(row.get("code_count")))),
                        "sales_amt": round(_number(row.get("sales_amt")), 2),
                        "pct_of_total": round(_number(row.get("pct_of_total")), 1),
                        "method_names": str(row.get("method_names") or ""),
                    }
                    for row in rows
                ],
            }
        except Exception:
            logger.exception(
                "Failed to fetch gold payment method mix for store_id=%s",
                store_id,
            )
            return {
                "period": {"start": None, "end": None},
                "methods": [],
            }

    return {
        "period": {"start": None, "end": None},
        "methods": [],
    }


async def get_waste_ranking(
    db,
    store_id: str,
    days: int = 7,
    top_n: int = 10,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            latest_date = await get_latest_biz_date(db, store_id)
            start_date = latest_date - timedelta(days=max(days - 1, 0))
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH sales AS (
                    SELECT
                        product_id,
                        max(product_name) AS product_name,
                        sum(waste_qty) AS total_waste,
                        sum(sold_qty) AS total_sold,
                        avg(
                            CASE
                                WHEN sold_qty > 0
                                    THEN COALESCE(NULLIF(net_sales_amt, 0), sale_amt, 0) / NULLIF(sold_qty, 0)
                                ELSE 0
                            END
                        ) AS avg_unit_price
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :start_date AND :end_date
                    GROUP BY product_id
                ),
                inventory AS (
                    SELECT
                        product_id,
                        sum(on_hand_eod) AS total_on_hand
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
                    WHERE store_id = :store_id
                      AND biz_date BETWEEN :start_date AND :end_date
                    GROUP BY product_id
                )
                SELECT
                    s.product_id,
                    s.product_name,
                    s.total_waste,
                    s.total_sold,
                    COALESCE(i.total_on_hand, 0) AS total_on_hand,
                    COALESCE(s.avg_unit_price, 0) AS avg_unit_price
                FROM sales s
                LEFT JOIN inventory i
                  ON i.product_id = s.product_id
                ORDER BY s.total_waste DESC, s.total_sold DESC, s.product_name
                """,
                {
                    "store_id": str(store_id),
                    "start_date": start_date,
                    "end_date": latest_date,
                },
            )
            ranking = []
            for row in rows:
                total_waste = _number(row.get("total_waste"))
                total_sold = _number(row.get("total_sold"))
                total_on_hand = _number(row.get("total_on_hand"))
                denominator = total_sold + total_waste + total_on_hand
                waste_rate = round((total_waste / denominator), 4) if denominator else 0.0
                ranking.append(
                    {
                        "product_id": str(row.get("product_id") or ""),
                        "product_name": str(row.get("product_name") or ""),
                        "total_waste": round(total_waste, 2),
                        "total_sold": round(total_sold, 2),
                        "waste_rate": waste_rate,
                        "waste_cost": round(total_waste * _number(row.get("avg_unit_price")), 2),
                    }
                )
            return sorted(
                ranking,
                key=lambda row: (
                    float(row.get("waste_rate") or 0),
                    float(row.get("total_waste") or 0),
                ),
                reverse=True,
            )[:top_n]
        except Exception:
            logger.exception("Failed to fetch gold waste ranking for store_id=%s", store_id)
            return []
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return []
        latest = frame["biz_date"].max()
        start = latest - pd.Timedelta(days=max(days - 1, 0))
        filtered = frame[(frame["biz_date"] >= start) & (frame["biz_date"] <= latest)]
        grouped = (
            filtered.groupby(["product_id", "product_name"], as_index=False)
            .agg(
                total_waste=("waste_qty", "sum"),
                total_sold=("sold_qty", "sum"),
                total_on_hand=("on_hand_eod", "sum"),
                avg_cost=("cost_price", "mean"),
            )
        )
        denominator = grouped["total_sold"] + grouped["total_waste"] + grouped["total_on_hand"]
        grouped["waste_rate"] = denominator.where(denominator > 0, 1)
        grouped["waste_rate"] = (grouped["total_waste"] / grouped["waste_rate"]).round(4)
        grouped["waste_cost"] = (grouped["total_waste"] * grouped["avg_cost"]).round(2)
        grouped = grouped.sort_values(["waste_rate", "total_waste"], ascending=[False, False]).head(top_n)
        return grouped[
            ["product_id", "product_name", "total_waste", "total_sold", "waste_rate", "waste_cost"]
        ].to_dict(orient="records")
    except Exception:
        logger.exception("Failed to fetch waste ranking for store_id=%s", store_id)
        return []


async def get_daily_kpis(
    db,
    store_id: str,
    biz_date: date | None = None,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            target_date = biz_date or await get_latest_biz_date(db, store_id)
            current = await _fetch_gold_one(
                db,
                f"""
                SELECT
                    biz_date,
                    total_sales,
                    total_qty,
                    waste_total,
                    stockout_sku_cnt
                FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                WHERE store_id = :store_id
                  AND biz_date = :biz_date
                """,
                {"store_id": str(store_id), "biz_date": target_date},
            )
            if not current:
                return {
                    "biz_date": str(target_date),
                    "total_sales_amt": 0,
                    "total_sold_qty": 0,
                    "total_waste_qty": 0,
                    "total_stockout_minutes": 0,
                    "products_with_stockout": 0,
                    "waste_rate_pct": 0.0,
                    "chance_loss_est": 0.0,
                    "vs_yesterday": {"sales_pct": None, "waste_pct": None},
                    "vs_last_week_same_dow": {"sales_pct": None, "waste_pct": None},
                    "vs_4week_avg_same_dow": {"sales_pct": None, "waste_pct": None},
                    "vs_last_month": {"sales_pct": None, "waste_pct": None},
                    "top_category": None,
                }

            comparisons = await _fetch_gold_one(
                db,
                f"""
                SELECT
                    y.total_sales AS yesterday_sales,
                    y.waste_total AS yesterday_waste,
                    w.total_sales AS last_week_sales,
                    w.waste_total AS last_week_waste,
                    m.total_sales AS last_month_sales,
                    m.waste_total AS last_month_waste,
                    avg4.avg_sales AS avg_4w_sales,
                    avg4.avg_waste AS avg_4w_waste
                FROM (SELECT 1) seed
                LEFT JOIN {GOLD_SCHEMA}.new_kpi_store_day_gold y
                    ON y.store_id = :store_id
                   AND y.biz_date = :yesterday_date
                LEFT JOIN {GOLD_SCHEMA}.new_kpi_store_day_gold w
                    ON w.store_id = :store_id
                   AND w.biz_date = :last_week_date
                LEFT JOIN {GOLD_SCHEMA}.new_kpi_store_day_gold m
                    ON m.store_id = :store_id
                   AND m.biz_date = :last_month_date
                LEFT JOIN (
                    SELECT
                        avg(total_sales) AS avg_sales,
                        avg(waste_total) AS avg_waste
                    FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
                    WHERE store_id = :store_id
                      AND biz_date < :biz_date
                      AND biz_date >= :four_week_start
                      AND extract(dow FROM biz_date) = extract(dow FROM CAST(:biz_date AS date))
                ) avg4 ON true
                """,
                {
                    "store_id": str(store_id),
                    "biz_date": target_date,
                    "yesterday_date": target_date - timedelta(days=1),
                    "last_week_date": target_date - timedelta(days=7),
                    "last_month_date": target_date - timedelta(days=28),
                    "four_week_start": target_date - timedelta(days=28),
                },
            ) or {}

            detail = await _fetch_gold_one(
                db,
                f"""
                SELECT
                    count(*) FILTER (WHERE stockout_minutes > 0) AS products_with_stockout,
                    sum(stockout_minutes) AS total_stockout_minutes,
                    sum((stockout_minutes / :operating_minutes) * COALESCE(NULLIF(sale_amt, 0), net_sales_amt, 0)) AS chance_loss_est
                FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                WHERE store_id = :store_id
                  AND biz_date = :biz_date
                """,
                {
                    "store_id": str(store_id),
                    "biz_date": target_date,
                    "operating_minutes": OPERATING_MINUTES,
                },
            ) or {}

            top_category = await _fetch_gold_one(
                db,
                f"""
                SELECT
                    COALESCE(NULLIF(category, ''), '미분류') AS category,
                    sum(COALESCE(NULLIF(net_sales_amt, 0), sale_amt, 0)) AS total_sales
                FROM {GOLD_SCHEMA}.new_product_sales_day_gold
                WHERE store_id = :store_id
                  AND biz_date = :biz_date
                GROUP BY COALESCE(NULLIF(category, ''), '미분류')
                ORDER BY total_sales DESC
                LIMIT 1
                """,
                {"store_id": str(store_id), "biz_date": target_date},
            )

            total_qty = _number(current.get("total_qty"))
            waste_total = _number(current.get("waste_total"))
            denominator = total_qty + waste_total
            current_sales = _number(current.get("total_sales"))

            return {
                "biz_date": current["biz_date"].isoformat() if current.get("biz_date") else str(target_date),
                "total_sales_amt": round(current_sales, 2),
                "total_sold_qty": int(round(total_qty)),
                "total_waste_qty": round(waste_total, 2),
                "total_stockout_minutes": int(round(_number(detail.get("total_stockout_minutes")))),
                "products_with_stockout": int(round(_number(detail.get("products_with_stockout")))),
                "waste_rate_pct": round((waste_total / denominator) * 100, 2) if denominator else 0.0,
                "chance_loss_est": round(_number(detail.get("chance_loss_est")), 2),
                "vs_yesterday": {
                    "sales_pct": _safe_pct_change(current_sales, _number(comparisons.get("yesterday_sales"), None)),
                    "waste_pct": _safe_pct_change(waste_total, _number(comparisons.get("yesterday_waste"), None)),
                },
                "vs_last_week_same_dow": {
                    "sales_pct": _safe_pct_change(current_sales, _number(comparisons.get("last_week_sales"), None)),
                    "waste_pct": _safe_pct_change(waste_total, _number(comparisons.get("last_week_waste"), None)),
                },
                "vs_4week_avg_same_dow": {
                    "sales_pct": _safe_pct_change(current_sales, _number(comparisons.get("avg_4w_sales"), None)),
                    "waste_pct": _safe_pct_change(waste_total, _number(comparisons.get("avg_4w_waste"), None)),
                },
                "vs_last_month": {
                    "sales_pct": _safe_pct_change(current_sales, _number(comparisons.get("last_month_sales"), None)),
                    "waste_pct": _safe_pct_change(waste_total, _number(comparisons.get("last_month_waste"), None)),
                },
                "top_category": str(top_category.get("category")) if top_category and top_category.get("category") else None,
            }
        except Exception:
            logger.exception("Failed to fetch gold daily KPIs for store_id=%s", store_id)
            return {
                "biz_date": str(biz_date or date.today()),
                "total_sales_amt": 0,
                "total_sold_qty": 0,
                "total_waste_qty": 0,
                "total_stockout_minutes": 0,
                "products_with_stockout": 0,
                "waste_rate_pct": 0.0,
                "chance_loss_est": 0.0,
                "vs_yesterday": {"sales_pct": None, "waste_pct": None},
                "vs_last_week_same_dow": {"sales_pct": None, "waste_pct": None},
                "vs_4week_avg_same_dow": {"sales_pct": None, "waste_pct": None},
                "vs_last_month": {"sales_pct": None, "waste_pct": None},
                "top_category": None,
            }
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return {
                "biz_date": str(biz_date or date.today()),
                "total_sales_amt": 0,
                "total_sold_qty": 0,
                "total_waste_qty": 0,
                "total_stockout_minutes": 0,
                "products_with_stockout": 0,
                "waste_rate_pct": 0.0,
                "chance_loss_est": 0.0,
                "vs_yesterday": {"sales_pct": None, "waste_pct": None},
                "vs_last_week_same_dow": {"sales_pct": None, "waste_pct": None},
                "vs_4week_avg_same_dow": {"sales_pct": None, "waste_pct": None},
                "vs_last_month": {"sales_pct": None, "waste_pct": None},
                "top_category": None,
            }
        target_date = _to_timestamp(biz_date) or frame["biz_date"].max()
        current = frame[frame["biz_date"] == target_date].copy()
        if current.empty:
            target_date = frame["biz_date"].max()
            current = frame[frame["biz_date"] == target_date].copy()

        def summarize(day_frame: pd.DataFrame) -> dict[str, float]:
            sold = float(day_frame["sold_qty"].sum())
            waste = float(day_frame["waste_qty"].sum())
            on_hand = float(day_frame["on_hand_eod"].sum())
            denominator = sold + waste + on_hand
            return {
                "sales": round(float(day_frame["sales_amt"].sum()), 2),
                "sold": round(sold, 2),
                "waste": round(waste, 2),
                "stockout": round(float(day_frame["stockout_minutes"].sum()), 2),
                "waste_rate_pct": round((waste / denominator) * 100, 2) if denominator else 0.0,
            }

        current_summary = summarize(current)
        yesterday = frame[frame["biz_date"] == (target_date - pd.Timedelta(days=1))]
        last_week = frame[frame["biz_date"] == (target_date - pd.Timedelta(days=7))]
        same_dow_4w = frame[
            (frame["biz_date"] < target_date)
            & (frame["biz_date"] >= target_date - pd.Timedelta(days=28))
            & (frame["biz_date"].dt.weekday == target_date.weekday())
        ]
        last_month = frame[frame["biz_date"] == (target_date - pd.Timedelta(days=28))]

        same_dow_summary = summarize(same_dow_4w) if not same_dow_4w.empty else {"sales": 0, "waste": 0}
        yesterday_summary = summarize(yesterday) if not yesterday.empty else {"sales": 0, "waste": 0}
        last_week_summary = summarize(last_week) if not last_week.empty else {"sales": 0, "waste": 0}
        last_month_summary = summarize(last_month) if not last_month.empty else {"sales": 0, "waste": 0}

        current = current.assign(
            chance_loss_component=(
                (current["stockout_minutes"] / OPERATING_MINUTES)
                * current["sold_qty"]
                * current["base_price"]
            )
        )
        top_category = (
            current.groupby("category", as_index=False)["sales_amt"].sum().sort_values("sales_amt", ascending=False)
        )
        return {
            "biz_date": _to_iso(target_date),
            "total_sales_amt": current_summary["sales"],
            "total_sold_qty": int(round(current_summary["sold"])),
            "total_waste_qty": round(current_summary["waste"], 2),
            "total_stockout_minutes": int(round(current_summary["stockout"])),
            "products_with_stockout": int((current["stockout_minutes"] > 0).sum()),
            "waste_rate_pct": current_summary["waste_rate_pct"],
            "chance_loss_est": round(float(current["chance_loss_component"].sum()), 2),
            "vs_yesterday": {
                "sales_pct": _safe_pct_change(current_summary["sales"], yesterday_summary["sales"]),
                "waste_pct": _safe_pct_change(current_summary["waste"], yesterday_summary["waste"]),
            },
            "vs_last_week_same_dow": {
                "sales_pct": _safe_pct_change(current_summary["sales"], last_week_summary["sales"]),
                "waste_pct": _safe_pct_change(current_summary["waste"], last_week_summary["waste"]),
            },
            "vs_4week_avg_same_dow": {
                "sales_pct": _safe_pct_change(current_summary["sales"], same_dow_summary["sales"]),
                "waste_pct": _safe_pct_change(current_summary["waste"], same_dow_summary["waste"]),
            },
            "vs_last_month": {
                "sales_pct": _safe_pct_change(current_summary["sales"], last_month_summary["sales"]),
                "waste_pct": _safe_pct_change(current_summary["waste"], last_month_summary["waste"]),
            },
            "top_category": None if top_category.empty else str(top_category.iloc[0]["category"]),
        }
    except Exception:
        logger.exception("Failed to fetch daily KPIs for store_id=%s", store_id)
        return {
            "biz_date": str(biz_date or date.today()),
            "total_sales_amt": 0,
            "total_sold_qty": 0,
            "total_waste_qty": 0,
            "total_stockout_minutes": 0,
            "products_with_stockout": 0,
            "waste_rate_pct": 0.0,
            "chance_loss_est": 0.0,
            "vs_yesterday": {"sales_pct": None, "waste_pct": None},
            "vs_last_week_same_dow": {"sales_pct": None, "waste_pct": None},
            "vs_4week_avg_same_dow": {"sales_pct": None, "waste_pct": None},
            "vs_last_month": {"sales_pct": None, "waste_pct": None},
            "top_category": None,
        }


async def get_profitability_snapshot(
    db,
    store_id: str,
    biz_date: date | None = None,
) -> dict[str, Any]:
    """Return transparent profitability estimates for owner-facing KPI cards.

    Notes:
    - Uses available sales/inventory actuals for variable-cost profit.
    - Applies owner-verified fixed/labor/promo inputs only when explicitly provided.
    """

    if _is_async_session(db):
        target_date = biz_date or await get_latest_biz_date(db, store_id)
        return {
            "biz_date": str(target_date),
            "estimated_net_profit_amt": None,
            "estimated_margin_rate_pct": None,
            "break_even_sales_amt": None,
            "break_even_coverage_pct": None,
            "promo_profit_impact_amt": None,
            "profit_status": "integration_pending",
            "margin_status": "integration_pending",
            "break_even_status": "integration_pending",
            "promo_status": "integration_pending",
            "basis": [
                "매출/재고 KPI는 gold table 실데이터를 사용하지만, 원가/고정비/프로모션 입력 매핑은 아직 남아 있습니다.",
            ],
            "assumptions": [
                "dunkin_mart_copy.new_kpi_store_day_gold 기준 KPI를 사용합니다.",
            ],
        }

    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return {
                "biz_date": str(biz_date or date.today()),
                "estimated_net_profit_amt": None,
                "estimated_margin_rate_pct": None,
                "break_even_sales_amt": None,
                "break_even_coverage_pct": None,
                "promo_profit_impact_amt": None,
                "profit_status": "insufficient_data",
                "margin_status": "insufficient_data",
                "break_even_status": "fixed_cost_missing",
                "promo_status": "integration_pending",
                "basis": [
                    "매출/원가 데이터 부족으로 손익 추정이 불가능합니다.",
                ],
                "assumptions": [],
            }

        target_date = _to_timestamp(biz_date) or frame["biz_date"].max()
        current = frame[frame["biz_date"] == target_date].copy()
        if current.empty:
            return {
                "biz_date": _to_iso(target_date),
                "estimated_net_profit_amt": None,
                "estimated_margin_rate_pct": None,
                "break_even_sales_amt": None,
                "break_even_coverage_pct": None,
                "promo_profit_impact_amt": None,
                "profit_status": "insufficient_data",
                "margin_status": "insufficient_data",
                "break_even_status": "fixed_cost_missing",
                "promo_status": "integration_pending",
                "basis": [
                    "선택한 영업일의 데이터가 없어 손익 추정을 건너뜁니다.",
                ],
                "assumptions": [],
            }

        revenue = float(current["sales_amt"].sum() or 0.0)
        sold_cogs = float((current["sold_qty"] * current["cost_price"]).sum() or 0.0)
        waste_cost = float((current["waste_qty"] * current["cost_price"]).sum() or 0.0)
        variable_profit = round(revenue - sold_cogs - waste_cost, 2)

        data_dir = _manual_data_dir(db)
        manual_financial = (
            manual_inputs.get_financial_input(
                data_dir,
                store_id=store_id,
                biz_date=target_date.date().isoformat(),
            )
            if data_dir
            else None
        )

        fixed_cost_amt = (
            float(manual_financial.get("fixed_cost_amt"))
            if manual_financial and manual_financial.get("fixed_cost_amt") is not None
            else None
        )
        labor_cost_amt = (
            float(manual_financial.get("labor_cost_amt"))
            if manual_financial and manual_financial.get("labor_cost_amt") is not None
            else None
        )
        promo_cost_amt = (
            float(manual_financial.get("promo_cost_amt"))
            if manual_financial and manual_financial.get("promo_cost_amt") is not None
            else None
        )

        promo_impact_amt: float | None = None
        promo_status = "integration_pending"
        promo_frame = getattr(_store(db), "fact_promo_day", pd.DataFrame())
        if not promo_frame.empty:
            promo_filtered = promo_frame[promo_frame["store_id"] == str(store_id)].copy()
            if "biz_date" in promo_filtered.columns:
                promo_filtered["biz_date"] = pd.to_datetime(
                    promo_filtered["biz_date"],
                    errors="coerce",
                ).dt.normalize()
                promo_filtered = promo_filtered[promo_filtered["biz_date"] == target_date]
            if not promo_filtered.empty:
                lift_series = (
                    pd.to_numeric(promo_filtered["promo_sales_lift_est"], errors="coerce")
                    if "promo_sales_lift_est" in promo_filtered.columns
                    else pd.Series(dtype=float)
                )
                redemption_series = (
                    pd.to_numeric(promo_filtered["coupon_redemption_amt"], errors="coerce")
                    if "coupon_redemption_amt" in promo_filtered.columns
                    else pd.Series(dtype=float)
                )
                lift_est = float(lift_series.fillna(0).sum())
                redemption_amt = float(redemption_series.fillna(0).sum())
                promo_impact_amt = round(lift_est - redemption_amt, 2)
                promo_status = "estimated"

        if manual_financial:
            manual_lift = manual_financial.get("promo_sales_lift_amt")
            manual_redemption = manual_financial.get("promo_coupon_redemption_amt")
            if manual_lift is not None or promo_cost_amt is not None or manual_redemption is not None:
                lift_value = float(manual_lift or 0.0)
                coupon_value = float(manual_redemption or 0.0)
                promo_cost_value = float(promo_cost_amt or 0.0)
                promo_impact_amt = round(lift_value - promo_cost_value - coupon_value, 2)
                promo_status = "manual_input"

        estimated_profit = variable_profit
        profit_status = "estimated_excluding_fixed_cost"
        margin_status = "estimated_excluding_fixed_cost"
        break_even_sales_amt: float | None = None
        break_even_coverage_pct: float | None = None
        break_even_status = "fixed_cost_missing"

        if promo_impact_amt is not None:
            estimated_profit += promo_impact_amt
        if fixed_cost_amt is not None:
            estimated_profit -= fixed_cost_amt
        if labor_cost_amt is not None:
            estimated_profit -= labor_cost_amt
        estimated_profit = round(float(estimated_profit), 2)

        if fixed_cost_amt is not None or labor_cost_amt is not None:
            if fixed_cost_amt is None or labor_cost_amt is None:
                profit_status = "estimated_partial_fixed_cost"
                margin_status = "estimated_partial_fixed_cost"
                break_even_status = "partial_cost_input"
            else:
                profit_status = "estimated_with_fixed_cost"
                margin_status = "estimated_with_fixed_cost"
                contribution_profit = variable_profit + (promo_impact_amt or 0.0)
                contribution_margin_ratio = (
                    (contribution_profit / revenue) if revenue > 0 else None
                )
                if contribution_margin_ratio and contribution_margin_ratio > 0:
                    break_even_sales_amt = round(
                        (fixed_cost_amt + labor_cost_amt) / contribution_margin_ratio,
                        2,
                    )
                    if break_even_sales_amt > 0:
                        break_even_coverage_pct = round((revenue / break_even_sales_amt) * 100, 2)
                    break_even_status = "estimated"
                else:
                    break_even_status = "insufficient_margin"

        margin_rate_pct = round((estimated_profit / revenue) * 100, 2) if revenue > 0 else None

        return {
            "biz_date": _to_iso(target_date),
            "estimated_net_profit_amt": estimated_profit,
            "estimated_margin_rate_pct": margin_rate_pct,
            "break_even_sales_amt": break_even_sales_amt,
            "break_even_coverage_pct": break_even_coverage_pct,
            "promo_profit_impact_amt": promo_impact_amt,
            "fixed_cost_amt": fixed_cost_amt,
            "labor_cost_amt": labor_cost_amt,
            "promo_cost_amt": promo_cost_amt,
            "profit_status": profit_status,
            "margin_status": margin_status,
            "break_even_status": break_even_status,
            "promo_status": promo_status,
            "input_source": {
                "financial_input": (
                    manual_financial.get("source")
                    if manual_financial
                    else "missing"
                ),
                "promo_input": "manual_input" if promo_status == "manual_input" else "fact_promo_day_or_missing",
            },
            "basis": (
                [
                    "추정 순이익 = 매출 - 판매원가 - 폐기원가 ± 행사손익 - 고정비 - 인건비",
                    "고정비/인건비 입력이 없으면 손익분기점은 미확정으로 표시",
                ]
                if fixed_cost_amt is not None or labor_cost_amt is not None
                else [
                    "추정 순이익 = 매출 - 판매원가 - 폐기원가",
                    "고정비/인건비 미연동으로 손익분기점은 미확정",
                ]
            ),
            "assumptions": [
                "cost_price를 품목 원가로 사용",
                "waste_qty는 동일 원가로 비용 반영",
                "입력된 고정비/인건비/행사비는 점주 검증값으로 간주",
            ],
        }
    except Exception:
        logger.exception("Failed to compute profitability snapshot for store_id=%s", store_id)
        return {
            "biz_date": str(biz_date or date.today()),
            "estimated_net_profit_amt": None,
            "estimated_margin_rate_pct": None,
            "break_even_sales_amt": None,
            "break_even_coverage_pct": None,
            "promo_profit_impact_amt": None,
            "profit_status": "error",
            "margin_status": "error",
            "break_even_status": "fixed_cost_missing",
            "promo_status": "integration_pending",
            "basis": ["손익 추정 중 오류가 발생했습니다."],
            "assumptions": [],
        }


async def get_customer_insights_snapshot(
    db,
    store_id: str,
) -> dict[str, Any]:
    """Return customer insight snapshot from manual/verified input when available."""

    data_dir = _manual_data_dir(db)
    records = (
        manual_inputs.get_customer_inputs_window(
            data_dir,
            store_id=store_id,
            lookback_days=28,
        )
        if data_dir
        else []
    )
    if not records:
        return {
            "status": "integration_pending",
            "repeat_customer_count": None,
            "repeat_visit_rate_pct": None,
            "avg_orders_per_repeat_customer": None,
            "reference_period": None,
            "data_points": 0,
            "source": "missing_customer_id_feed",
            "note": "고객 식별자 기반 방문/주문 원천 데이터가 없어 연동 대기 상태입니다.",
        }
    meaningful_records = [
        row
        for row in records
        if any(
            row.get(field) is not None
            for field in [
                "unique_customers",
                "repeat_customers",
                "repeat_visit_rate_pct",
                "orders_from_repeat_customers",
                "avg_orders_per_repeat_customer",
            ]
        )
    ]
    if not meaningful_records:
        return {
            "status": "integration_pending",
            "repeat_customer_count": None,
            "repeat_visit_rate_pct": None,
            "avg_orders_per_repeat_customer": None,
            "reference_period": None,
            "data_points": 0,
            "source": "manual_input_empty",
            "note": "고객 입력 데이터가 비어 있어 연동 대기 상태로 표시합니다.",
        }

    latest = meaningful_records[-1]
    unique_customers = latest.get("unique_customers")
    repeat_customers = latest.get("repeat_customers")
    repeat_visit_rate_pct = latest.get("repeat_visit_rate_pct")
    if repeat_visit_rate_pct is None and unique_customers and repeat_customers is not None and unique_customers > 0:
        repeat_visit_rate_pct = round((float(repeat_customers) / float(unique_customers)) * 100, 2)

    avg_orders_per_repeat_customer = latest.get("avg_orders_per_repeat_customer")
    orders_from_repeat = latest.get("orders_from_repeat_customers")
    if (
        avg_orders_per_repeat_customer is None
        and repeat_customers
        and orders_from_repeat is not None
        and repeat_customers > 0
    ):
        avg_orders_per_repeat_customer = round(
            float(orders_from_repeat) / float(repeat_customers),
            2,
        )

    first_day = meaningful_records[0].get("biz_date")
    last_day = latest.get("biz_date")
    reference_period = f"{first_day}~{last_day}" if first_day and last_day else last_day
    return {
        "status": "actual_manual_input",
        "repeat_customer_count": repeat_customers,
        "repeat_visit_rate_pct": repeat_visit_rate_pct,
        "avg_orders_per_repeat_customer": avg_orders_per_repeat_customer,
        "reference_period": reference_period,
        "data_points": len(meaningful_records),
        "source": latest.get("source") or "manual_inputs.customer_insights_daily.csv",
        "note": latest.get("note") or "점주 검증 입력값 기반 고객 인사이트",
    }


async def get_sales_hourly_mini_chart(
    db,
    store_id: str,
    biz_date: date | None = None,
) -> list[dict[str, Any]]:
    """Return an estimated intra-day sales sparkline for cockpit widgets."""
    if _is_async_session(db):
        try:
            kpis = await get_daily_kpis(db, store_id, biz_date)
            total_sales = _number(kpis.get("total_sales_amt"))
            if total_sales <= 0:
                return []
            return [
                {
                    "label": f"{hour:02d}:00",
                    "value": round(total_sales * share, 2),
                }
                for hour, share in DEFAULT_HOURLY_PROFILE.items()
            ]
        except Exception:
            logger.exception(
                "Failed to build gold sales mini chart for store_id=%s",
                store_id,
            )
            return []
    try:
        frame = _inventory_frame(db, store_id)
        if frame.empty:
            return []

        target_date = _to_timestamp(biz_date) or frame["biz_date"].max()
        current = frame[frame["biz_date"] == target_date]
        if current.empty:
            return []

        total_sales = float(current["sales_amt"].sum())
        chart = []
        for hour, share in DEFAULT_HOURLY_PROFILE.items():
            chart.append(
                {
                    "label": f"{hour:02d}:00",
                    "value": round(total_sales * share, 2),
                }
            )
        return chart
    except Exception:
        logger.exception("Failed to build sales mini chart for store_id=%s", store_id)
        return []


async def get_order_reference_data(
    db,
    store_id: str,
    category: str | None = None,
    reference_date: date | None = None,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            normalized_category = _normalize_order_category(category)
            latest_data_date = reference_date or await get_latest_biz_date(db, store_id)
            latest_rows = await _fetch_orderable_sales_rows(
                db,
                store_id=store_id,
                start_date=latest_data_date - timedelta(days=60),
                end_date=latest_data_date,
                category=normalized_category,
            )
            if not latest_rows:
                return {
                    "reference_dow": None,
                    "latest_biz_date": None,
                    "option_last_week": [],
                    "option_2weeks_ago": [],
                    "option_last_month": [],
                    "four_week_avg": [],
                    "active_promos": [],
                }

            latest_date = max(
                date.fromisoformat(str(row["biz_date"]))
                for row in latest_rows
                if row.get("biz_date")
            )
            recent_rows = [
                row
                for row in latest_rows
                if row.get("biz_date")
                and date.fromisoformat(str(row["biz_date"])) >= latest_date - timedelta(days=28)
            ]
            reference_dow = latest_date.weekday()

            def rows_for_day(target_date: date) -> list[dict[str, Any]]:
                return [
                    {**row, "biz_date": target_date.isoformat()}
                    for row in recent_rows
                    if row.get("biz_date") == target_date.isoformat()
                ]

            same_dow_rows = [
                row
                for row in recent_rows
                if row.get("biz_date")
                and date.fromisoformat(str(row["biz_date"])) < latest_date
                and date.fromisoformat(str(row["biz_date"])).weekday() == reference_dow
            ]
            grouped: dict[str, dict[str, Any]] = {}
            for row in same_dow_rows:
                product_id = str(row.get("product_id") or "")
                if not product_id:
                    continue
                bucket = grouped.setdefault(
                    product_id,
                    {
                        "product_id": product_id,
                        "product_name": str(row.get("product_name") or ""),
                        "category": str(row.get("category") or normalized_category or "도넛"),
                        "base_price": float(row.get("base_price", 0) or 0),
                        "effective_order_qty_values": [],
                        "effective_order_amt_values": [],
                    },
                )
                bucket["effective_order_qty_values"].append(
                    float(row.get("effective_order_qty", 0) or 0)
                )
                bucket["effective_order_amt_values"].append(
                    float(row.get("effective_order_amt", 0) or 0)
                )
                if float(row.get("base_price", 0) or 0) > 0:
                    bucket["base_price"] = float(row.get("base_price", 0) or 0)

            four_week_avg = []
            for bucket in grouped.values():
                qty_values = bucket.pop("effective_order_qty_values")
                amt_values = bucket.pop("effective_order_amt_values")
                avg_qty = sum(qty_values) / len(qty_values) if qty_values else 0.0
                avg_amt = sum(amt_values) / len(amt_values) if amt_values else 0.0
                four_week_avg.append(
                    {
                        **bucket,
                        "order_qty": round(avg_qty, 2),
                        "confirmed_qty": round(avg_qty, 2),
                        "recommended_qty": round(avg_qty, 2),
                        "effective_order_qty": round(avg_qty, 2),
                        "effective_order_amt": round(avg_amt, 2),
                        "biz_date": latest_date.isoformat(),
                    }
                )
            four_week_avg.sort(
                key=lambda row: (
                    float(row.get("effective_order_qty") or 0),
                    float(row.get("effective_order_amt") or 0),
                ),
                reverse=True,
            )

            promo_rows = await _fetch_gold_all(
                db,
                f"""
                SELECT biz_date, campaign_id, campaign_name, sales_amt, bill_cnt
                FROM {GOLD_SCHEMA}.new_campaign_day_gold
                WHERE store_id = :store_id
                  AND biz_date BETWEEN :start_date AND :end_date
                ORDER BY biz_date DESC, sales_amt DESC, bill_cnt DESC, campaign_name
                """,
                {
                    "store_id": str(store_id),
                    "start_date": latest_date - timedelta(days=30),
                    "end_date": latest_date,
                },
            )

            return {
                "reference_dow": reference_dow,
                "latest_biz_date": latest_date.isoformat(),
                "option_last_week": rows_for_day(latest_date - timedelta(days=7)),
                "option_2weeks_ago": rows_for_day(latest_date - timedelta(days=14)),
                "option_last_month": rows_for_day(latest_date - timedelta(days=28)),
                "four_week_avg": four_week_avg,
                "active_promos": [
                    {
                        "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                        "promo_id": str(row.get("campaign_id") or ""),
                        "promo_name": str(row.get("campaign_name") or ""),
                        "sales_amt": round(_number(row.get("sales_amt")), 2),
                        "bill_cnt": int(round(_number(row.get("bill_cnt")))),
                    }
                    for row in promo_rows
                ],
            }
        except Exception as exc:
            logger.warning(
                "Gold async path failed for store_id=%s: %s — falling through to pandas fallback",
                store_id,
                exc,
            )
    try:
        frame = _order_frame(db, store_id)
        if category:
            frame = frame[frame["category"] == category]
        if frame.empty:
            return {
                "reference_dow": None,
                "latest_biz_date": None,
                "option_last_week": [],
                "option_2weeks_ago": [],
                "option_last_month": [],
                "four_week_avg": [],
                "active_promos": [],
            }

        latest_date = frame["biz_date"].max()
        reference_dow = latest_date.weekday()

        def rows_for_day(day: pd.Timestamp) -> list[dict[str, Any]]:
            day_rows = frame[frame["biz_date"] == day]
            grouped = _summarize_order_rows(day_rows)
            for row in grouped:
                row["biz_date"] = _to_iso(day)
            return grouped

        same_dow_rows = frame[
            (frame["biz_date"] < latest_date)
            & (frame["biz_date"] >= latest_date - pd.Timedelta(days=28))
            & (frame["biz_date"].dt.weekday == reference_dow)
        ]
        four_week_avg = (
            same_dow_rows.groupby(
                ["product_id", "product_name", "category", "order_unit_price"],
                as_index=False,
            )
            .agg(
                order_qty=("order_qty", "mean"),
                confirmed_qty=("confirmed_qty", "mean"),
                recommended_qty=("recommended_qty", "mean"),
                effective_order_qty=("effective_order_qty", "mean"),
                effective_order_amt=("effective_order_amt", "mean"),
            )
            .rename(columns={"order_unit_price": "base_price"})
            .assign(biz_date=_to_iso(latest_date))
            .to_dict(orient="records")
        )

        return {
            "reference_dow": reference_dow,
            "latest_biz_date": _to_iso(latest_date),
            "option_last_week": rows_for_day(latest_date - pd.Timedelta(days=7)),
            "option_2weeks_ago": rows_for_day(latest_date - pd.Timedelta(days=14)),
            "option_last_month": rows_for_day(latest_date - pd.Timedelta(days=28)),
            "four_week_avg": four_week_avg,
            "active_promos": [],
        }
    except Exception:
        logger.exception("Failed to fetch order reference data for store_id=%s", store_id)
        return {
            "reference_dow": None,
            "latest_biz_date": None,
            "option_last_week": [],
            "option_2weeks_ago": [],
            "option_last_month": [],
            "four_week_avg": [],
            "active_promos": [],
        }


async def get_order_rows_for_date(
    db,
    store_id: str,
    target_date: date,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Return summarized actual order rows for a specific date."""
    if _is_async_session(db):
        try:
            return await _fetch_orderable_sales_rows(
                db,
                store_id=store_id,
                start_date=target_date,
                end_date=target_date,
                category=category,
            )
        except Exception:
            logger.exception(
                "Failed to fetch gold order rows for store_id=%s date=%s",
                store_id,
                target_date,
            )
            return []
    try:
        frame = _order_frame(db, store_id)
        if category:
            frame = frame[frame["category"] == category]
        target = _to_timestamp(target_date)
        if target is None:
            return []
        rows = frame[frame["biz_date"] == target].copy()
        summarized = _summarize_order_rows(rows)
        for row in summarized:
            row["biz_date"] = _to_iso(target)
        return summarized
    except Exception:
        logger.exception("Failed to fetch order rows for store_id=%s date=%s", store_id, target_date)
        return []


async def get_order_rows_for_period(
    db,
    store_id: str,
    start_date: date,
    end_date: date,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Return summarized actual order rows for a date range."""
    if _is_async_session(db):
        try:
            rows = await _fetch_orderable_sales_rows(
                db,
                store_id=store_id,
                start_date=start_date,
                end_date=end_date,
                category=category,
            )
            grouped: dict[str, dict[str, Any]] = {}
            for row in rows:
                product_id = str(row.get("product_id") or "")
                if not product_id:
                    continue
                bucket = grouped.setdefault(
                    product_id,
                    {
                        "product_id": product_id,
                        "product_name": str(row.get("product_name") or ""),
                        "category": str(row.get("category") or _normalize_order_category(category) or "도넛"),
                        "base_price": float(row.get("base_price", 0) or 0),
                        "order_qty": 0.0,
                        "confirmed_qty": 0.0,
                        "recommended_qty": 0.0,
                        "effective_order_qty": 0.0,
                        "effective_order_amt": 0.0,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                    },
                )
                qty = float(row.get("effective_order_qty", 0) or 0)
                amt = float(row.get("effective_order_amt", 0) or 0)
                bucket["order_qty"] += qty
                bucket["confirmed_qty"] += qty
                bucket["recommended_qty"] += qty
                bucket["effective_order_qty"] += qty
                bucket["effective_order_amt"] += amt
            summarized = list(grouped.values())
            summarized.sort(
                key=lambda row: (
                    float(row.get("effective_order_qty") or 0),
                    float(row.get("effective_order_amt") or 0),
                ),
                reverse=True,
            )
            return summarized
        except Exception:
            logger.exception(
                "Failed to fetch gold order rows for store_id=%s period=%s~%s",
                store_id,
                start_date,
                end_date,
            )
            return []
    try:
        frame = _order_frame(db, store_id)
        if category:
            frame = frame[frame["category"] == category]
        start = _to_timestamp(start_date)
        end = _to_timestamp(end_date)
        if start is None or end is None:
            return []
        rows = frame[(frame["biz_date"] >= start) & (frame["biz_date"] <= end)].copy()
        summarized = _summarize_order_rows(rows)
        for row in summarized:
            row["start_date"] = _to_iso(start)
            row["end_date"] = _to_iso(end)
        return summarized
    except Exception:
        logger.exception(
            "Failed to fetch order rows for store_id=%s period=%s~%s",
            store_id,
            start_date,
            end_date,
        )
        return []


async def get_recent_order_snapshots(
    db,
    store_id: str,
    *,
    category: str | None = None,
    limit: int = 3,
    cutoff_date: date | None = None,
) -> list[dict[str, Any]]:
    """Return recent order-day snapshots with top items for adjustment guidance.

    cutoff_date: if set, only biz_date <= cutoff_date is used.
    """
    if _is_async_session(db):
        try:
            normalized_category = _normalize_order_category(category)
            latest_date = await get_latest_biz_date(db, store_id)
            # Apply cutoff: never use future data
            effective_end = min(latest_date, cutoff_date) if cutoff_date else latest_date
            rows = await _fetch_orderable_sales_rows(
                db,
                store_id=store_id,
                start_date=effective_end - timedelta(days=21),
                end_date=effective_end,
                category=normalized_category,
            )
            by_day: dict[str, list[dict[str, Any]]] = {}
            for row in rows:
                biz_date = str(row.get("biz_date") or "")
                if not biz_date:
                    continue
                by_day.setdefault(biz_date, []).append(row)

            snapshots: list[dict[str, Any]] = []
            for biz_date in sorted(by_day.keys(), reverse=True)[: max(limit, 1)]:
                day_rows = by_day[biz_date]
                total_qty = int(
                    round(
                        sum(float(item.get("effective_order_qty", 0) or 0) for item in day_rows)
                    )
                )
                total_amount = round(
                    sum(float(item.get("effective_order_amt", 0) or 0) for item in day_rows),
                    2,
                )
                top_items = sorted(
                    [
                        {
                            "product_id": item.get("product_id"),
                            "product_name": item.get("product_name"),
                            "quantity": int(round(float(item.get("effective_order_qty", 0) or 0))),
                            "base_price": float(item.get("base_price", 0) or 0),
                        }
                        for item in day_rows
                        if float(item.get("effective_order_qty", 0) or 0) > 0
                    ],
                    key=lambda row: row["quantity"],
                    reverse=True,
                )[:5]
                snapshots.append(
                    {
                        "biz_date": biz_date,
                        "total_qty": total_qty,
                        "total_amount": total_amount,
                        "top_items": top_items,
                    }
                )
            return snapshots
        except Exception:
            logger.exception(
                "Failed to fetch gold recent order snapshots for store_id=%s",
                store_id,
            )
            return []
    try:
        frame = _order_frame(db, store_id)
        if category:
            frame = frame[frame["category"] == category]
        if frame.empty:
            return []

        unique_days = sorted(frame["biz_date"].dropna().unique(), reverse=True)
        snapshots: list[dict[str, Any]] = []
        for day_value in unique_days[: max(limit, 1)]:
            day = pd.Timestamp(day_value).normalize()
            day_rows = frame[frame["biz_date"] == day]
            summarized = _summarize_order_rows(day_rows)
            total_qty = int(sum(float(item.get("effective_order_qty", 0) or 0) for item in summarized))
            total_amount = round(sum(float(item.get("effective_order_amt", 0) or 0) for item in summarized), 2)
            top_items = sorted(
                [
                    {
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name"),
                        "quantity": int(round(float(item.get("effective_order_qty", 0) or 0))),
                        "base_price": float(item.get("base_price", 0) or 0),
                    }
                    for item in summarized
                    if float(item.get("effective_order_qty", 0) or 0) > 0
                ],
                key=lambda row: row["quantity"],
                reverse=True,
            )[:5]
            snapshots.append(
                {
                    "biz_date": _to_iso(day),
                    "total_qty": total_qty,
                    "total_amount": total_amount,
                    "top_items": top_items,
                }
            )
        return snapshots
    except Exception:
        logger.exception("Failed to fetch recent order snapshots for store_id=%s", store_id)
        return []


async def _fetch_orderable_sales_rows(
    db: AsyncSession,
    *,
    store_id: str,
    start_date: date,
    end_date: date,
    category: str | None = None,
) -> list[dict[str, Any]]:
    normalized_category = _normalize_order_category(category)
    category_case = _order_category_case("product_name")
    category_filter_sql = ""
    params: dict[str, Any] = {
        "store_id": str(store_id),
        "start_date": start_date,
        "end_date": end_date,
    }
    if normalized_category:
        category_filter_sql = f"AND {category_case} = :order_category"
        params["order_category"] = normalized_category
    rows = await _fetch_gold_all(
        db,
        f"""
        WITH app_products AS (
            SELECT
                product_id,
                NULLIF(product_name, '') AS product_name,
                NULLIF(category, '') AS category,
                base_price
            FROM {APP_SCHEMA}.products
        ),
        aggregated AS (
            SELECT
                p.biz_date,
                p.product_id,
                COALESCE(
                    max(ap.product_name),
                    NULLIF(max(p.product_name), ''),
                    max(dp.product_name),
                    max(nd.product_name),
                    p.product_id
                ) AS product_name,
                COALESCE(
                    max(ap.category),
                    NULLIF(max(p.category), ''),
                    max(dp.category),
                    max(nd.category)
                ) AS raw_category,
                sum(COALESCE(p.sold_qty, 0)) AS sold_qty,
                sum(COALESCE(p.waste_qty, 0)) AS waste_qty,
                max(COALESCE(p.stockout_minutes, 0)) AS stockout_minutes,
                COALESCE(
                    avg(
                        CASE
                            WHEN COALESCE(p.sold_qty, 0) > 0
                                THEN COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0) / NULLIF(p.sold_qty, 0)
                        END
                    ),
                    max(ap.base_price),
                    max(dp.base_price),
                    0
                ) AS base_price,
                sum(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS sales_amt
            FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
            LEFT JOIN app_products ap
              ON ap.product_id = p.product_id
            LEFT JOIN {GOLD_SCHEMA}.dim_product dp
              ON dp.product_id = p.product_id
            LEFT JOIN {GOLD_SCHEMA}.new_dim_product_silver nd
              ON nd.product_id = p.product_id
            WHERE p.store_id = :store_id
              AND p.product_id NOT LIKE '7%%'
              AND p.biz_date BETWEEN :start_date AND :end_date
            GROUP BY p.biz_date, p.product_id
        )
        SELECT
            biz_date,
            product_id,
            product_name,
            raw_category,
            sold_qty,
            waste_qty,
            stockout_minutes,
            base_price,
            sales_amt,
            {category_case} AS order_category
        FROM aggregated
        WHERE base_price > 0
        {category_filter_sql}
        ORDER BY biz_date DESC, sales_amt DESC, product_name
        """,
        params,
    )
    shaped_rows = []
    for row in rows:
        estimated_qty = _estimate_order_quantity(
            row.get("sold_qty"),
            row.get("waste_qty"),
            row.get("stockout_minutes"),
        )
        base_price = round(_number(row.get("base_price")), 2)
        shaped_rows.append(
            {
                "biz_date": row["biz_date"].isoformat() if row.get("biz_date") else None,
                "product_id": str(row.get("product_id") or ""),
                "product_name": str(row.get("product_name") or ""),
                "category": str(
                    row.get("order_category")
                    or normalized_category
                    or _infer_order_category_name(row.get("product_name"))
                ),
                "base_price": base_price,
                "sold_qty": round(_number(row.get("sold_qty")), 2),
                "waste_qty": round(_number(row.get("waste_qty")), 2),
                "stockout_minutes": round(_number(row.get("stockout_minutes")), 2),
                "order_qty": estimated_qty,
                "confirmed_qty": estimated_qty,
                "recommended_qty": estimated_qty,
                "effective_order_qty": estimated_qty,
                "effective_order_amt": round(base_price * estimated_qty, 2),
                "source": "estimated_from_sales",
            }
        )
    return shaped_rows


async def get_order_catalog(
    db,
    store_id: str,
    *,
    lookback_days: int = 90,
) -> list[dict[str, Any]]:
    if _is_async_session(db):
        try:
            latest_biz_date = await get_latest_biz_date(db, store_id)
            start_date = latest_biz_date - timedelta(days=max(int(lookback_days), 1))
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH app_products AS (
                    SELECT
                        product_id,
                        NULLIF(product_name, '') AS product_name,
                        NULLIF(category, '') AS category,
                        base_price
                    FROM {APP_SCHEMA}.products
                ),
                sales_window AS (
                    SELECT
                        p.product_id,
                        max(p.product_name) AS product_name,
                        max(NULLIF(p.category, '')) AS raw_category,
                        sum(COALESCE(p.sold_qty, 0)) AS sold_qty,
                        max(p.biz_date) AS last_sold_date,
                        avg(
                            CASE
                                WHEN COALESCE(p.sold_qty, 0) > 0
                                    THEN COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0) / NULLIF(p.sold_qty, 0)
                            END
                        ) AS derived_unit_price
                    FROM {GOLD_SCHEMA}.new_product_sales_day_gold p
                    WHERE p.store_id = :store_id
                      AND p.biz_date BETWEEN :start_date AND :end_date
                    GROUP BY p.product_id
                ),
                inventory_latest AS (
                    SELECT
                        r.product_id,
                        max(r.product_name) AS product_name,
                        max(r.on_hand_eod) AS on_hand_eod,
                        max(r.stockout_minutes) AS stockout_minutes,
                        max(r.risk_reason) AS risk_reason
                    FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold r
                    WHERE r.store_id = :store_id
                      AND r.biz_date = :end_date
                    GROUP BY r.product_id
                ),
                master AS (
                    SELECT
                        COALESCE(ap.product_id, dp.product_id, nd.product_id, sw.product_id, il.product_id) AS product_id,
                        COALESCE(
                            NULLIF(ap.product_name, ''),
                            NULLIF(dp.product_name, ''),
                            NULLIF(nd.product_name, ''),
                            sw.product_name,
                            il.product_name
                        ) AS product_name,
                        COALESCE(
                            NULLIF(ap.category, ''),
                            NULLIF(dp.category, ''),
                            NULLIF(nd.category, ''),
                            sw.raw_category
                        ) AS raw_category,
                        COALESCE(ap.base_price, dp.base_price, sw.derived_unit_price, 0) AS base_price,
                        COALESCE(sw.sold_qty, 0) AS sold_qty_lookback,
                        sw.last_sold_date,
                        COALESCE(il.on_hand_eod, 0) AS on_hand_eod,
                        COALESCE(il.stockout_minutes, 0) AS stockout_minutes,
                        il.risk_reason
                    FROM app_products ap
                    FULL OUTER JOIN {GOLD_SCHEMA}.dim_product dp
                      ON dp.product_id = ap.product_id
                    FULL OUTER JOIN {GOLD_SCHEMA}.new_dim_product_silver nd
                      ON nd.product_id = COALESCE(ap.product_id, dp.product_id)
                    FULL OUTER JOIN sales_window sw
                      ON sw.product_id = COALESCE(ap.product_id, dp.product_id, nd.product_id)
                    FULL OUTER JOIN inventory_latest il
                      ON il.product_id = COALESCE(ap.product_id, dp.product_id, nd.product_id, sw.product_id)
                )
                SELECT
                    product_id,
                    product_name,
                    raw_category,
                    base_price,
                    sold_qty_lookback,
                    last_sold_date,
                    on_hand_eod,
                    stockout_minutes,
                    risk_reason
                FROM master
                WHERE product_name IS NOT NULL
                  AND btrim(product_name) <> ''
                  AND (
                    COALESCE(sold_qty_lookback, 0) > 0
                    OR COALESCE(on_hand_eod, 0) <> 0
                    OR COALESCE(base_price, 0) > 0
                  )
                ORDER BY
                    COALESCE(sold_qty_lookback, 0) DESC,
                    product_name
                """,
                {
                    "store_id": str(store_id),
                    "start_date": start_date,
                    "end_date": latest_biz_date,
                },
            )
            catalog: list[dict[str, Any]] = []
            seen_product_ids: set[str] = set()
            for row in rows:
                product_id = str(row.get("product_id") or "").strip()
                product_name = str(row.get("product_name") or "").strip()
                if not product_id or not product_name or product_id in seen_product_ids:
                    continue
                seen_product_ids.add(product_id)
                category = _infer_manual_catalog_category(
                    product_name,
                    row.get("raw_category"),
                )
                sold_qty = round(_number(row.get("sold_qty_lookback")), 2)
                on_hand = round(_number(row.get("on_hand_eod")), 2)
                stockout_minutes = round(_number(row.get("stockout_minutes")), 2)
                base_price = round(_number(row.get("base_price")), 2)
                if on_hand:
                    stock_note = f"현재 재고 {int(round(on_hand))}개"
                elif sold_qty > 0:
                    stock_note = f"최근 {lookback_days}일 판매 {int(round(sold_qty))}개"
                else:
                    stock_note = "재고 정보 없음"
                catalog.append(
                    {
                        "product_id": product_id,
                        "product_name": product_name,
                        "category": category,
                        "base_price": base_price,
                        "sold_qty_lookback": sold_qty,
                        "last_sold_date": row.get("last_sold_date").isoformat()
                        if row.get("last_sold_date")
                        else None,
                        "on_hand_eod": on_hand,
                        "stockout_minutes": stockout_minutes,
                        "stock_note": stock_note,
                        "stock_warning": bool(on_hand <= 0 and sold_qty > 0),
                        "risk_reason": str(row.get("risk_reason") or "").strip() or None,
                        "source": (
                            f"{GOLD_SCHEMA}.dim_product + "
                            f"{GOLD_SCHEMA}.new_dim_product_silver + "
                            f"{GOLD_SCHEMA}.new_product_sales_day_gold + "
                            f"{GOLD_SCHEMA}.new_inventory_risk_day_gold"
                        ),
                    }
                )
            return catalog
        except Exception:
            logger.exception("Failed to fetch order catalog for store_id=%s", store_id)
            return []

    try:
        sales = _sales_frame(db, store_id)
        inventory = _inventory_frame(db, store_id)
        if sales.empty and inventory.empty:
            return []
        latest_date = _to_timestamp(await get_latest_biz_date(db, store_id))
        start_date = latest_date - pd.Timedelta(days=max(int(lookback_days), 1))
        sales_window = sales[
            (sales["biz_date"] >= start_date) & (sales["biz_date"] <= latest_date)
        ].copy()
        inventory_latest = inventory[inventory["biz_date"] == latest_date].copy()
        grouped_sales = (
            sales_window.groupby("product_id", as_index=False)
            .agg(
                product_name=("product_name", "max"),
                raw_category=("category", "max"),
                base_price=("base_price", "max"),
                sold_qty_lookback=("sold_qty", "sum"),
                last_sold_date=("biz_date", "max"),
            )
        )
        grouped_inventory = (
            inventory_latest.groupby("product_id", as_index=False)
            .agg(
                on_hand_eod=("on_hand_eod", "max"),
                stockout_minutes=("stockout_minutes", "max"),
                risk_reason=("risk_reason", "max"),
            )
        )
        merged = grouped_sales.merge(grouped_inventory, on="product_id", how="outer")
        merged = merged.fillna({"product_name": "", "raw_category": "", "base_price": 0, "sold_qty_lookback": 0, "on_hand_eod": 0, "stockout_minutes": 0})
        merged = merged[
            (merged["product_name"].astype(str).str.strip() != "")
            & (
                pd.to_numeric(merged["sold_qty_lookback"], errors="coerce").fillna(0) > 0
                | pd.to_numeric(merged["on_hand_eod"], errors="coerce").fillna(0) != 0
                | pd.to_numeric(merged["base_price"], errors="coerce").fillna(0) > 0
            )
        ].sort_values(["sold_qty_lookback", "product_name"], ascending=[False, True])
        return [
            {
                "product_id": str(row["product_id"]),
                "product_name": str(row["product_name"]),
                "category": _infer_manual_catalog_category(
                    row.get("product_name"),
                    row.get("raw_category"),
                ),
                "base_price": round(_number(row.get("base_price")), 2),
                "sold_qty_lookback": round(_number(row.get("sold_qty_lookback")), 2),
                "last_sold_date": _to_iso(row.get("last_sold_date")),
                "on_hand_eod": round(_number(row.get("on_hand_eod")), 2),
                "stockout_minutes": round(_number(row.get("stockout_minutes")), 2),
                "stock_note": (
                    f"현재 재고 {int(round(_number(row.get('on_hand_eod'))))}개"
                    if _number(row.get("on_hand_eod")) != 0
                    else (
                        f"최근 {lookback_days}일 판매 {int(round(_number(row.get('sold_qty_lookback'))))}개"
                        if _number(row.get("sold_qty_lookback")) > 0
                        else "재고 정보 없음"
                    )
                ),
                "stock_warning": bool(
                    _number(row.get("on_hand_eod")) <= 0
                    and _number(row.get("sold_qty_lookback")) > 0
                ),
                "risk_reason": row.get("risk_reason"),
                "source": "file_fallback.order_catalog",
            }
            for _, row in merged.iterrows()
        ]
    except Exception:
        logger.exception("Failed to build file-backed order catalog for store_id=%s", store_id)
        return []


async def get_today_confirmed_order_status(
    db,
    store_id: str,
    biz_date: date,
) -> dict[str, Any]:
    if _is_async_session(db):
        try:
            item_category_case = _order_category_case(
                "COALESCE(NULLIF(oi.product_name_snapshot, ''), p.product_name, oi.product_id)"
            )
            rows = await _fetch_gold_all(
                db,
                f"""
                WITH order_base AS (
                    SELECT
                        o.id,
                        o.store_id,
                        NULLIF(o.category, '') AS order_category,
                        o.confirmed_at
                    FROM {APP_SCHEMA}.orders o
                    WHERE o.store_id = :store_id
                      AND o.status = 'confirmed'
                      AND o.confirmed_at IS NOT NULL
                      AND timezone('Asia/Seoul', o.confirmed_at)::date = :biz_date
                ),
                item_category AS (
                    SELECT
                        ob.id AS order_id,
                        {item_category_case} AS item_order_category,
                        sum(COALESCE(oi.quantity, 0)) AS total_qty
                    FROM order_base ob
                    JOIN {APP_SCHEMA}.order_items oi
                      ON oi.order_id = ob.id
                    LEFT JOIN {APP_SCHEMA}.products p
                      ON p.product_id = oi.product_id
                     AND p.store_id = ob.store_id
                    GROUP BY ob.id, {item_category_case}
                ),
                resolved AS (
                    SELECT
                        ob.id,
                        ob.confirmed_at,
                        COALESCE(
                            ob.order_category,
                            (
                                SELECT ic.item_order_category
                                FROM item_category ic
                                WHERE ic.order_id = ob.id
                                ORDER BY ic.total_qty DESC, ic.item_order_category
                                LIMIT 1
                            )
                        ) AS order_category
                    FROM order_base ob
                )
                SELECT
                    order_category AS category,
                    count(*) AS confirmed_order_count,
                    max(confirmedi_at) AS last_confirmed_at
                FROM (
                    SELECT
                        order_category,
                        confirmed_at AS confirmedi_at
                    FROM resolved
                    WHERE order_category IS NOT NULL
                ) resolved_grouped
                GROUP BY order_category
                """,
                {
                    "store_id": str(store_id),
                    "biz_date": biz_date,
                },
            )
            categories = {
                str(row.get("category") or ""): {
                    "confirmed_order_count": int(_number(row.get("confirmed_order_count"))),
                    "last_confirmed_at": row.get("last_confirmed_at").isoformat()
                    if row.get("last_confirmed_at")
                    else None,
                }
                for row in rows
                if row.get("category")
            }
            return {
                "biz_date": biz_date.isoformat(),
                "categories": categories,
                "total_confirmed_orders": sum(
                    value["confirmed_order_count"] for value in categories.values()
                ),
            }
        except Exception:
            logger.exception(
                "Failed to fetch confirmed order status for store_id=%s",
                store_id,
            )
            return {
                "biz_date": biz_date.isoformat(),
                "categories": {},
                "total_confirmed_orders": 0,
            }

    return {
        "biz_date": biz_date.isoformat(),
        "categories": {},
        "total_confirmed_orders": 0,
    }


async def insert_ai_insight(
    db,
    store_id: str,
    biz_date: date,
    summary_text: str,
    kpi_json: dict,
    root_causes_json: dict,
    actions_json: dict,
    evidence_sql_refs: list[str],
) -> int:
    try:
        store = _store(db)
        row_id = len(store.ai_insight_rows) + 1
        store.ai_insight_rows.append(
            {
                "id": row_id,
                "store_id": store_id,
                "biz_date": str(biz_date),
                "summary_text": summary_text,
                "kpi_json": kpi_json,
                "root_causes_json": root_causes_json,
                "actions_json": actions_json,
                "evidence_sql_refs": evidence_sql_refs,
            }
        )
        return row_id
    except Exception:
        logger.exception("Failed to insert ai insight for store_id=%s", store_id)
        return 0


async def get_delivery_comparison(
    db,
    store_id: str,
    period1_start: date,
    period1_end: date,
    period2_start: date,
    period2_end: date,
) -> dict[str, Any]:
    """Compare delivery order counts and sales between two periods.

    Uses dunkin_mart_copy.gold__sales_channel_day view.
    Delivery is identified by channel_div = '온라인-배달'.
    """
    try:
        if _is_async_session(db):
            # Period summary: total sales, delivery sales, delivery orders, delivery ratio
            rows = await _fetch_gold_all(
                db,
                f"""
                SELECT
                    period_label,
                    SUM(sales_amt) AS total_sales,
                    SUM(CASE WHEN channel_div = '온라인-배달' THEN sales_amt ELSE 0 END) AS delivery_sales,
                    SUM(CASE WHEN channel_div = '온라인-배달' THEN ord_cnt ELSE 0 END) AS delivery_orders,
                    SUM(ord_cnt) AS total_orders
                FROM (
                    SELECT
                        biz_date,
                        channel_div,
                        channel_name,
                        sales_amt,
                        ord_cnt,
                        CASE
                            WHEN biz_date BETWEEN :period1_start AND :period1_end THEN 'period1'
                            WHEN biz_date BETWEEN :period2_start AND :period2_end THEN 'period2'
                        END AS period_label
                    FROM {GOLD_SCHEMA}.gold__sales_channel_day
                    WHERE store_id = :store_id
                      AND (
                        biz_date BETWEEN :period1_start AND :period1_end
                        OR biz_date BETWEEN :period2_start AND :period2_end
                      )
                ) sub
                WHERE period_label IS NOT NULL
                GROUP BY period_label
                """,
                {
                    "store_id": str(store_id),
                    "period1_start": period1_start,
                    "period1_end": period1_end,
                    "period2_start": period2_start,
                    "period2_end": period2_end,
                },
            )
            # Channel-level breakdown for delivery channels
            channel_rows = await _fetch_gold_all(
                db,
                f"""
                SELECT
                    period_label,
                    channel_name,
                    SUM(sales_amt) AS sales_amt,
                    SUM(ord_cnt) AS ord_cnt
                FROM (
                    SELECT
                        biz_date,
                        channel_name,
                        sales_amt,
                        ord_cnt,
                        CASE
                            WHEN biz_date BETWEEN :period1_start AND :period1_end THEN 'period1'
                            WHEN biz_date BETWEEN :period2_start AND :period2_end THEN 'period2'
                        END AS period_label
                    FROM {GOLD_SCHEMA}.gold__sales_channel_day
                    WHERE store_id = :store_id
                      AND channel_div = '온라인-배달'
                      AND (
                        biz_date BETWEEN :period1_start AND :period1_end
                        OR biz_date BETWEEN :period2_start AND :period2_end
                      )
                ) sub
                WHERE period_label IS NOT NULL
                GROUP BY period_label, channel_name
                ORDER BY period_label, sales_amt DESC
                """,
                {
                    "store_id": str(store_id),
                    "period1_start": period1_start,
                    "period1_end": period1_end,
                    "period2_start": period2_start,
                    "period2_end": period2_end,
                },
            )

            summary_map = {
                str(r.get("period_label")): {
                    "total_sales": round(_number(r.get("total_sales")), 2),
                    "delivery_sales": round(_number(r.get("delivery_sales")), 2),
                    "delivery_orders": int(_number(r.get("delivery_orders"))),
                    "total_orders": int(_number(r.get("total_orders"))),
                }
                for r in rows
            }

            p1 = summary_map.get("period1", {})
            p2 = summary_map.get("period2", {})

            p1_total_sales = p1.get("total_sales", 0) or 0
            p2_total_sales = p2.get("total_sales", 0) or 0
            p1_del_sales = p1.get("delivery_sales", 0) or 0
            p2_del_sales = p2.get("delivery_sales", 0) or 0
            p1_del_orders = p1.get("delivery_orders", 0) or 0
            p2_del_orders = p2.get("delivery_orders", 0) or 0

            # Compute delivery sales ratio
            p1_del_ratio = round(p1_del_sales / p1_total_sales * 100, 1) if p1_total_sales > 0 else None
            p2_del_ratio = round(p2_del_sales / p2_total_sales * 100, 1) if p2_total_sales > 0 else None

            # Order count change
            order_change = p2_del_orders - p1_del_orders
            order_change_pct = _safe_pct_change(p2_del_orders, p1_del_orders)

            # Channel breakdown per period
            def _group_channels(period_key: str) -> list[dict]:
                chs = []
                for r in channel_rows:
                    if str(r.get("period_label")) == period_key:
                        chs.append({
                            "channel_name": str(r.get("channel_name", "")),
                            "ord_cnt": int(_number(r.get("ord_cnt"))),
                            "sales_amt": round(_number(r.get("sales_amt")), 2),
                        })
                return chs

            # Check if delivery data actually exists
            has_delivery_data = bool(channel_rows)
            total_delivery_orders = p1_del_orders + p2_del_orders

            return {
                "has_delivery_data": has_delivery_data,
                "total_delivery_orders": total_delivery_orders,
                "period1": {
                    "start": str(period1_start),
                    "end": str(period1_end),
                    "total_sales": p1_total_sales,
                    "delivery_sales": p1_del_sales,
                    "delivery_orders": p1_del_orders,
                    "delivery_ratio_pct": p1_del_ratio,
                    "delivery_channels": _group_channels("period1"),
                },
                "period2": {
                    "start": str(period2_start),
                    "end": str(period2_end),
                    "total_sales": p2_total_sales,
                    "delivery_sales": p2_del_sales,
                    "delivery_orders": p2_del_orders,
                    "delivery_ratio_pct": p2_del_ratio,
                    "delivery_channels": _group_channels("period2"),
                },
                "order_change": order_change,
                "order_change_pct": order_change_pct,
                "ratio_change": (p2_del_ratio - p1_del_ratio) if (p1_del_ratio is not None and p2_del_ratio is not None) else None,
            }
    except Exception as exc:
        logger.exception("get_delivery_comparison failed for store_id=%s", store_id)
        return {
            "has_delivery_data": False,
            "total_delivery_orders": 0,
            "error": str(exc),
            "period1": {},
            "period2": {},
        }


def _build_product_where(product_name: str) -> tuple[str, dict[str, Any]]:
    """Build WHERE clause for product name matching. Returns (where_clause, params)."""
    if not product_name:
        return "1=1", {}
    pn = str(product_name).strip()
    if len(pn) < 2:
        return "1=1", {}
    return "product_name ILIKE :product_wild", {"product_wild": f"%{pn}%"}


async def get_product_sales_comparison(
    db,
    store_id: str,
    demo_date: str | date,
    product_name: str = "",
    **kwargs,
) -> dict[str, Any]:
    """상품(상품명 기반) 전월 대비 매출·수량 비교 (new_product_sales_day_gold)."""
    try:
        dd = date.fromisoformat(str(demo_date).split("T")[0])
        # Use explicit period dates from kwargs when provided (supports day/week/month/year)
        if kwargs.get("p1_start") and kwargs.get("p1_end") and kwargs.get("p2_start") and kwargs.get("p2_end"):
            p1_start = date.fromisoformat(str(kwargs["p1_start"]).split("T")[0])
            p1_end = date.fromisoformat(str(kwargs["p1_end"]).split("T")[0])
            p2_start = date.fromisoformat(str(kwargs["p2_start"]).split("T")[0])
            p2_end = date.fromisoformat(str(kwargs["p2_end"]).split("T")[0])
        else:
            # Default: month comparison
            recent_start, recent_end = dd.replace(day=1), dd
            prev_month = dd.month - 1 if dd.month > 1 else 12
            prev_year = dd.year - 1 if dd.month == 1 else dd.year
            prev_1st = date(prev_year, prev_month, 1)
            import calendar
            max_day = calendar.monthrange(prev_year, prev_month)[1]
            compare_end = date(prev_year, prev_month, min(dd.day, max_day))
            p1_start, p1_end = prev_1st, compare_end
            p2_start, p2_end = recent_start, recent_end
        p1_days = max(1, (p1_end - p1_start).days + 1)
        p2_days = max(1, (p2_end - p2_start).days + 1)
        prod_where, extra_params = _build_product_where(product_name)
        if _is_async_session(db):
            async def _agg(period_start, period_end, where_clause):
                params = {"sid": store_id, "s": period_start, "e": period_end}
                params.update(extra_params)
                row = await _fetch_gold_one(
                    db,
                    f"""SELECT
                        COALESCE(SUM(sold_qty),0)::int AS prod_qty,
                        COALESCE(SUM(sale_amt),0)::numeric AS prod_sales,
                        (SELECT COALESCE(SUM(sale_amt),0)::numeric
                         FROM dunkin_mart_copy.new_product_sales_day_gold
                         WHERE store_id=:sid AND biz_date BETWEEN :s AND :e) AS total_sales
                     FROM dunkin_mart_copy.new_product_sales_day_gold
                     WHERE store_id=:sid
                       AND biz_date BETWEEN :s AND :e
                       AND {where_clause}
                     """,
                    params,
                )
                return dict(row)

            async def _rank(period_start, period_end, where_clause):
                params = {"sid": store_id, "s": period_start, "e": period_end}
                params.update(extra_params)
                rows = await _fetch_gold_all(
                    db,
                    f"""SELECT product_name, SUM(sale_amt)::numeric AS sale_amt
                        FROM dunkin_mart_copy.new_product_sales_day_gold
                        WHERE store_id=:sid AND biz_date BETWEEN :s AND :e
                        AND {where_clause}
                        GROUP BY product_name ORDER BY sale_amt DESC LIMIT 3
                    """,
                    params,
                )
                return [dict(r) for r in rows]

            async def _overall_rank(period_start, period_end):
                rows = await _fetch_gold_all(
                    db,
                    """SELECT product_name, SUM(sale_amt)::numeric AS s
                        FROM dunkin_mart_copy.new_product_sales_day_gold
                        WHERE store_id=:sid AND biz_date BETWEEN :s AND :e
                        GROUP BY product_name ORDER BY s DESC
                    """,
                    {"sid": store_id, "s": period_start, "e": period_end},
                )
                ranked = [dict(r) for r in rows]
                matched = [
                    r["product_name"] for r in ranked
                    if product_name and product_name in r["product_name"]
                ]
                return {
                    "items": ranked[:10],
                    "matched_names": matched,
                    "total_items": len(ranked),
                }

            async def _peer_avg(period_start, period_end, where_clause):
                params = {"s": period_start, "e": period_end}
                params.update(extra_params)
                row = await _fetch_gold_one(
                    db,
                    f"""SELECT AVG(sub.gl_qty)::numeric AS avg_qty,
                               AVG(sub.gl_sales)::numeric AS avg_sales,
                               COUNT(*)::int AS peer_cnt
                      FROM (
                         SELECT store_id,
                                SUM(sold_qty)::int AS gl_qty,
                                SUM(sale_amt)::numeric AS gl_sales
                         FROM dunkin_mart_copy.new_product_sales_day_gold
                         WHERE biz_date BETWEEN :s AND :e AND {where_clause}
                         GROUP BY store_id HAVING SUM(sold_qty) > 0
                      ) sub
                     """,
                    params,
                )
                return dict(row) if row else {"avg_qty": None, "avg_sales": None, "peer_cnt": 0}

            p1_a = await _agg(p1_start, p1_end, prod_where)
            p2_a = await _agg(p2_start, p2_end, prod_where)
            p1_top = await _rank(p1_start, p1_end, prod_where)
            p2_top = await _rank(p2_start, p2_end, prod_where)
            p1_rk = await _overall_rank(p1_start, p1_end)
            p2_rk = await _overall_rank(p2_start, p2_end)
            p1_peer = await _peer_avg(p1_start, p1_end, prod_where)
            p2_peer = await _peer_avg(p2_start, p2_end, prod_where)
        else:
            raise RuntimeError("File-backed mode not supported for product comparison.")
        p1g = p1_a.get("prod_qty", 0) or 0
        p2g = p2_a.get("prod_qty", 0) or 0
        p1gm = float(p1_a.get("prod_sales", 0) or 0)
        p2gm = float(p2_a.get("prod_sales", 0) or 0)
        p1ts = float(p1_a.get("total_sales", 0) or 0)
        p2ts = float(p2_a.get("total_sales", 0) or 0)
        p1_ratio = (round(p1gm / p1ts * 100, 1) if p1ts > 0 else 0)
        p2_ratio = (round(p2gm / p2ts * 100, 1) if p2ts > 0 else 0)
        qty_chg = p2g - p1g
        qty_chg_pct = (round(qty_chg / p1g * 100, 1) if p1g > 0 else None)
        sales_chg = p2gm - p1gm
        sales_chg_pct = (round(sales_chg / p1gm * 100, 1) if p1gm > 0 else None)
        p1_avg_rank = None
        p2_avg_rank = None
        p1_matched_ranks = [i + 1 for i, it in enumerate(p1_rk.get("items", []))
                            if it.get("product_name") in p1_rk.get("matched_names", [])]
        p2_matched_ranks = [i + 1 for i, it in enumerate(p2_rk.get("items", []))
                            if it.get("product_name") in p2_rk.get("matched_names", [])]
        if p1_matched_ranks:
            p1_avg_rank = round(sum(p1_matched_ranks) / len(p1_matched_ranks))
        if p2_matched_ranks:
            p2_avg_rank = round(sum(p2_matched_ranks) / len(p2_matched_ranks))
        p1_peer_avg_qty = float(p1_peer.get("avg_qty", 0) or 0)
        p2_peer_avg_qty = float(p2_peer.get("avg_qty", 0) or 0)
        p1_peer_cnt = p1_peer.get("peer_cnt", 0)
        p2_peer_cnt = p2_peer.get("peer_cnt", 0)
        return {
            "has_data": p1g > 0 or p2g > 0,
            "period_type": kwargs.get("period_type", "month"),
            "product_name": product_name or "",
            "matched_products": list({it.get("product_name") for it in p1_top + p2_top if it.get("product_name")}),
            "period1": {
                "start": str(p1_start),
                "end": str(p1_end),
                "days": p1_days,
                "qty": p1g,
                "sales": p1gm,
                "total_sales": p1ts,
                "ratio_pct": p1_ratio,
                "top_products": p1_top,
                "avg_rank": p1_avg_rank,
                "rank_total_items": len(p1_rk.get("items", [])),
                "peer_avg_qty": p1_peer_avg_qty,
                "peer_cnt": p1_peer_cnt,
            },
            "period2": {
                "start": str(p2_start),
                "end": str(p2_end),
                "days": p2_days,
                "qty": p2g,
                "sales": p2gm,
                "total_sales": p2ts,
                "ratio_pct": p2_ratio,
                "top_products": p2_top,
                "avg_rank": p2_avg_rank,
                "rank_total_items": len(p2_rk.get("items", [])),
                "peer_avg_qty": p2_peer_avg_qty,
                "peer_cnt": p2_peer_cnt,
            },
            "qty_change": qty_chg,
            "qty_change_pct": qty_chg_pct,
            "sales_change": sales_chg,
            "sales_change_pct": sales_chg_pct,
            "ratio_change": round((p2_ratio - p1_ratio), 1) if (p1_ratio and p2_ratio) else None,
        }
    except Exception as exc:
        logger.exception("get_product_sales_comparison failed for store_id=%s prod=%s", store_id, product_name)
        return {
            "has_data": False,
            "period_type": kwargs.get("period_type", "month"),
            "error": str(exc),
            "product_name": product_name or "",
            "matched_products": [],
            "period1": {},
            "period2": {},
        }


async def get_delivery_channel_revenue(
    db,
    store_id: str,
    period_start: date,
    period_end: date,
) -> dict:
    """Single-period delivery channel revenue breakdown.

    Uses dunkin_mart_copy.gold__sales_channel_day.
    Delivery identified by channel_div = '온라인-배달' or ILIKE '%배달%'.
    """
    try:
        # Total delivery stats for the period
        total_sql = f"""
            SELECT
                SUM(CASE WHEN channel_div ILIKE '%배달%' THEN sales_amt ELSE 0 END) AS delivery_total_sales,
                SUM(CASE WHEN channel_div ILIKE '%배달%' THEN ord_cnt ELSE 0 END) AS delivery_total_orders,
                SUM(sales_amt) AS grand_total_sales
            FROM {GOLD_SCHEMA}.gold__sales_channel_day
            WHERE store_id = :store_id
              AND biz_date BETWEEN :period_start AND :period_end
        """

        total_rows = await _fetch_gold_all(db, total_sql, {
            "store_id": str(store_id),
            "period_start": period_start,
            "period_end": period_end,
        })
        if not total_rows:
            return {
                "has_data": False,
                "error": "No sales channel data for the given period",
            }
        total_row = total_rows[0]

        # Per-channel breakdown
        channel_sql = f"""
            SELECT
                channel_name,
                SUM(sales_amt) AS sales,
                SUM(ord_cnt) AS orders
            FROM {GOLD_SCHEMA}.gold__sales_channel_day
            WHERE store_id = :store_id
              AND biz_date BETWEEN :period_start AND :period_end
              AND channel_div ILIKE '%배달%'
            GROUP BY channel_name
            ORDER BY sales DESC
        """

        channel_rows = await _fetch_gold_all(db, channel_sql, {
            "store_id": str(store_id),
            "period_start": period_start,
            "period_end": period_end,
        })
        channels = []
        delivery_total = _number(total_row.get("delivery_total_sales")) or 0
        for row in channel_rows:
            ch_sales = _number(row.get("sales")) or 0
            ch_orders = int(_number(row.get("orders"))) or 0
            share = round(ch_sales / delivery_total * 100, 1) if delivery_total > 0 else 0
            channels.append({
                "channel_name": str(row.get("channel_name", "")),
                "sales": ch_sales,
                "orders": ch_orders,
                "sales_share_pct": share,
            })

        delivery_total_sales = _number(total_row.get("delivery_total_sales")) or 0
        delivery_total_orders = int(_number(total_row.get("delivery_total_orders"))) or 0
        grand_total = _number(total_row.get("grand_total_sales")) or 0
        delivery_share_of_total = round(delivery_total_sales / grand_total * 100, 1) if grand_total > 0 else 0

        return {
            "has_data": len(channels) > 0,
            "period_start": str(period_start),
            "period_end": str(period_end),
            "delivery_total_sales": delivery_total_sales,
            "delivery_total_orders": delivery_total_orders,
            "delivery_share_of_total_pct": delivery_share_of_total,
            "channels": channels,
        }
    except Exception as exc:
        logger.exception("get_delivery_channel_revenue failed for store_id=%s", store_id)
        return {
            "has_data": False,
            "error": str(exc),
        }
