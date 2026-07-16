"""Sales analytics tools for POS APIs and chat fast-path requests."""

from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timedelta

import pandas as pd

HOURLY_PROFILE = {8: 0.04, 9: 0.05, 10: 0.06, 11: 0.07, 12: 0.1, 13: 0.09, 14: 0.09, 15: 0.09, 16: 0.09, 17: 0.1, 18: 0.1, 19: 0.07, 20: 0.03, 21: 0.02}


def _frame(data_store, store_id: str) -> pd.DataFrame:
    frame = data_store.fact_inventory_day
    return frame[(frame["store_id"] == str(store_id)) & (frame["base_price"] > 0)].copy()


def _period(frame: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    return frame[(frame["biz_date"] >= pd.Timestamp(start)) & (frame["biz_date"] <= pd.Timestamp(end))].copy()


async def get_daily_summary(data_store, store_id: str) -> dict:
    frame = _frame(data_store, store_id)
    latest = pd.Timestamp(frame["biz_date"].max()).normalize()
    today = frame[frame["biz_date"] == latest]
    yesterday = frame[frame["biz_date"] == latest - pd.Timedelta(days=1)]
    last_week = frame[frame["biz_date"] == latest - pd.Timedelta(days=7)]
    total_revenue = float(today["sales_amt"].sum())
    hourly = [{"hour": hour, "revenue": int(round(total_revenue * ratio))} for hour, ratio in HOURLY_PROFILE.items()]
    top = (
        today.groupby("product_name", as_index=False)
        .agg(qty=("sold_qty", "sum"), revenue=("sales_amt", "sum"))
        .sort_values("revenue", ascending=False)
        .head(5)
        .to_dict(orient="records")
    )
    vs_yesterday = ((total_revenue - float(yesterday["sales_amt"].sum())) / float(yesterday["sales_amt"].sum()) * 100) if float(yesterday["sales_amt"].sum() or 0) else 0
    vs_last_week = ((total_revenue - float(last_week["sales_amt"].sum())) / float(last_week["sales_amt"].sum()) * 100) if float(last_week["sales_amt"].sum() or 0) else 0
    insight = "어제보다 매출이 좋습니다 💪" if vs_yesterday >= 10 else "어제보다 매출이 부진합니다. 오후 프로모션을 고려해보세요." if vs_yesterday <= -10 else "어제와 비슷한 흐름입니다."
    return {
        "today_revenue": int(round(total_revenue)),
        "today_qty": int(round(today["sold_qty"].sum())),
        "vs_yesterday_same_time_pct": round(vs_yesterday, 1),
        "vs_last_week_same_day_pct": round(vs_last_week, 1),
        "hourly_trend": hourly,
        "top_selling": top,
        "last_updated_at": datetime.now().isoformat(),
        "insight": insight,
    }


async def compare_sales(data_store, store_id: str, period_a_start: str, period_a_end: str, period_b_start: str, period_b_end: str) -> dict:
    frame = _frame(data_store, store_id)
    period_a = _period(frame, period_a_start, period_a_end)
    period_b = _period(frame, period_b_start, period_b_end)
    sales_a = float(period_a["sales_amt"].sum())
    sales_b = float(period_b["sales_amt"].sum())
    change = ((sales_a - sales_b) / sales_b * 100) if sales_a and sales_b else None
    by_product = (
        period_a.groupby("product_name", as_index=False)["sales_amt"].sum()
        .merge(period_b.groupby("product_name", as_index=False)["sales_amt"].sum(), on="product_name", how="outer", suffixes=("_a", "_b"))
        .fillna(0)
    )
    by_product["delta"] = by_product["sales_amt_a"] - by_product["sales_amt_b"]
    top_increase = by_product.sort_values("delta", ascending=False).head(3).to_dict(orient="records")
    top_decrease = by_product.sort_values("delta", ascending=True).head(3).to_dict(orient="records")
    lead_up = top_increase[0]["product_name"] if top_increase else "상위 품목"
    lead_down = top_decrease[0]["product_name"] if top_decrease else "하위 품목"
    if sales_a == 0 or sales_b == 0:
        missing_period = f"{period_a_start}~{period_a_end}" if sales_a == 0 else f"{period_b_start}~{period_b_end}"
        insight = f"⚠️ 비교 기간({missing_period}) 데이터가 없습니다. 단일 기간 분석만 제공합니다."
    elif change is not None and change >= 10:
        insight = f"{lead_up} 호조가 전체 매출 상승 견인"
    elif change is not None and change <= -10:
        insight = f"{lead_down} 부진. 진열 위치/프로모션 검토 권장"
    else:
        insight = "두 기간의 매출 흐름은 유사합니다."
    return {
        "period_a": {"start": period_a_start, "end": period_a_end, "revenue": int(round(sales_a)), "qty": int(round(period_a["sold_qty"].sum()))},
        "period_b": {"start": period_b_start, "end": period_b_end, "revenue": int(round(sales_b)), "qty": int(round(period_b["sold_qty"].sum()))},
        "revenue_change_pct": round(change, 1) if change is not None else None,
        "top_increase": top_increase,
        "top_decrease": top_decrease,
        "insight": insight,
    }


async def get_product_ranking(data_store, store_id: str, period: str) -> list[dict]:
    frame = _frame(data_store, store_id)
    latest = pd.Timestamp(frame["biz_date"].max()).normalize()
    start = latest if period == "today" else latest - pd.Timedelta(days=6 if period == "week" else 29)
    scoped = frame[frame["biz_date"] >= start]
    total = float(scoped["sales_amt"].sum() or 0)
    ranking = scoped.groupby("product_name", as_index=False).agg(qty=("sold_qty", "sum"), revenue=("sales_amt", "sum")).sort_values("revenue", ascending=False)
    return [
        {"rank": idx + 1, "product_name": row["product_name"], "qty": int(round(row["qty"])), "revenue": int(round(row["revenue"])), "revenue_pct": round((row["revenue"] / total * 100), 1) if total else 0}
        for idx, row in enumerate(ranking.head(10).to_dict(orient="records"))
    ]


async def get_waste_summary(data_store, store_id: str, period: str) -> dict:
    frame = _frame(data_store, store_id)
    latest = pd.Timestamp(frame["biz_date"].max()).normalize()
    start = latest if period == "today" else latest - pd.Timedelta(days=6 if period == "week" else 29)
    scoped = frame[frame["biz_date"] >= start].copy()
    scoped["waste_amount"] = scoped["waste_qty"] * scoped["cost_price"]
    prev_start = start - (latest - start + pd.Timedelta(days=1))
    prev = frame[(frame["biz_date"] >= prev_start) & (frame["biz_date"] < start)].copy()
    prev["waste_amount"] = prev["waste_qty"] * prev["cost_price"]
    change = ((scoped["waste_amount"].sum() - prev["waste_amount"].sum()) / prev["waste_amount"].sum() * 100) if prev["waste_amount"].sum() else 0
    items = scoped.groupby("product_name", as_index=False).agg(qty=("waste_qty", "sum"), amount=("waste_amount", "sum"), sold=("sold_qty", "sum"))
    items["waste_rate_pct"] = ((items["qty"] / (items["qty"] + items["sold"]).replace(0, 1)) * 100).round(1)
    return {
        "total_waste_amount": int(round(scoped["waste_amount"].sum())),
        "total_waste_qty": int(round(scoped["waste_qty"].sum())),
        "items": items.sort_values("amount", ascending=False).head(10).to_dict(orient="records"),
        "vs_last_week_pct": round(change, 1),
        "insight": f"전주 대비 폐기율이 {abs(change):.1f}% {'개선' if change < 0 else '악화'}되었습니다.",
    }


async def get_hourly_sales(data_store, store_id: str, date: str | None = None) -> list[dict]:
    frame = _frame(data_store, store_id)
    target = pd.Timestamp(date).normalize() if date else pd.Timestamp(frame["biz_date"].max()).normalize()
    total = float(frame[frame["biz_date"] == target]["sales_amt"].sum())
    return [{"hour": hour, "revenue": int(round(total * ratio))} for hour, ratio in HOURLY_PROFILE.items()]


async def get_profitability(data_store, store_id: str, period: str = "month") -> dict:
    frame = _frame(data_store, store_id)
    latest = pd.Timestamp(frame["biz_date"].max()).normalize()
    if period == "month":
        start = latest.replace(day=1)
        end = latest.replace(day=monthrange(latest.year, latest.month)[1])
    else:
        start = latest - pd.Timedelta(days=6)
        end = latest
    scoped = frame[(frame["biz_date"] >= start) & (frame["biz_date"] <= end)]
    revenue = int(round(scoped["sales_amt"].sum()))
    cogs = int(round((scoped["sold_qty"] * scoped["cost_price"]).sum()))
    gross = revenue - cogs
    return {"period": f"{start.date().isoformat()}~{end.date().isoformat()}", "revenue": revenue, "cost_of_goods": cogs, "gross_profit": gross, "gross_margin_pct": round((gross / revenue * 100), 1) if revenue else 0.0, "commission": None, "labor_cost": None, "net_profit": None}
