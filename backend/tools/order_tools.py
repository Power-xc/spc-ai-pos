"""Ordering tools used by POS APIs and complex chat workflows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pandas as pd

from tools.inventory_tools import _weighted_daily_qty  # type: ignore[attr-defined]

ORDER_DEADLINES = {"도넛류": "18:00", "음료류": "17:00", "기타": "16:00"}
_ORDER_LOG: list[dict] = []


def _orders(data_store, store_id: str) -> pd.DataFrame:
    frame = data_store.order_day
    return frame[frame["store_id"] == str(store_id)].copy()


def _date_string(value) -> str:
    return pd.Timestamp(value).date().isoformat()


def _summarize(frame: pd.DataFrame) -> list[dict]:
    if frame.empty:
        return []
    grouped = frame.groupby(["product_id", "product_name"], as_index=False).agg(
        quantity=("effective_order_qty", "sum"),
        price=("order_unit_price", "mean"),
    )
    return [
        {
            "product_id": row["product_id"],
            "product_name": row["product_name"],
            "quantity": int(round(row["quantity"])),
            "base_price": float(row["price"] or 0),
        }
        for row in grouped.sort_values(["quantity", "product_name"], ascending=[False, True]).to_dict(orient="records")
    ]


def _expected_order_demand(data_store, store_id: str, product_id: str) -> float:
    frame = _orders(data_store, store_id)
    if not frame.empty:
        latest = pd.Timestamp(frame["biz_date"].max()).normalize()
        same_dow = frame[
            (frame["product_id"] == str(product_id))
            & (frame["biz_date"] < latest)
            & (frame["biz_date"].dt.weekday == latest.weekday())
        ].sort_values("biz_date", ascending=False)
        values = (
            same_dow.groupby("biz_date", as_index=False)["effective_order_qty"]
            .sum()
            .sort_values("biz_date", ascending=False)["effective_order_qty"]
            .head(4)
            .tolist()
        )
        if values:
            return round(sum(float(v or 0) * w for v, w in zip(values, [0.4, 0.3, 0.2, 0.1], strict=False)), 2)
    inventory = data_store.fact_inventory_day
    inv_store = inventory[inventory["store_id"] == str(store_id)].copy()
    if inv_store.empty:
        return 0.0
    latest_inventory = pd.Timestamp(inv_store["biz_date"].max()).normalize()
    return _weighted_daily_qty(inv_store, latest_inventory, product_id)


async def get_order_history(data_store, store_id: str, date: str) -> dict:
    frame = _orders(data_store, store_id)
    target = pd.Timestamp(date).normalize()
    daily = frame[frame["biz_date"] == target]
    return {
        "order_date": _date_string(target),
        "items": _summarize(daily),
        "total_qty": int(round(daily["effective_order_qty"].sum())) if not daily.empty else 0,
        "has_event": False,
        "event_name": None,
    }


async def calculate_order_risk(data_store, store_id: str, items: list[dict]) -> dict:
    rows = []
    overall_waste = 0
    for item in items:
        expected = _expected_order_demand(data_store, store_id, item["product_id"])
        quantity = int(item["quantity"])
        anomaly = expected > 0 and quantity >= expected * 2
        waste_excess = max(0, quantity - expected * 1.3)
        overall_waste += int(round(waste_excess * float(item.get("base_price", 0) or 0) * 0.4))
        rows.append(
            {
                "product_id": item["product_id"],
                "product_name": item.get("product_name", item["product_id"]),
                "quantity": quantity,
                "expected_demand": round(expected, 1),
                "stockout_risk": "high" if quantity < expected * 0.8 else "medium" if quantity < expected else "low",
                "waste_risk": "high" if quantity > expected * 1.3 else "medium" if quantity > expected * 1.1 else "low",
                "anomaly": anomaly,
                "anomaly_note": f"⚠️ 평소 주문량({expected:.0f}개)의 2배입니다. 확인해주세요." if anomaly else None,
                "note": "폐기 위험이 높습니다." if quantity > expected * 1.3 else "품절 위험이 낮습니다.",
            }
        )
    return {"items": rows, "overall_waste_risk_amount": overall_waste}


async def get_order_options(data_store, store_id: str, target_date: str | None = None) -> dict:
    frame = _orders(data_store, store_id)
    latest = pd.Timestamp(target_date).normalize() if target_date else pd.Timestamp(frame["biz_date"].max()).normalize()
    refs = {
        "ai_recommendation": [latest - timedelta(days=7 * i) for i in range(1, 5)],
        "last_week": [latest - timedelta(days=7)],
        "two_weeks_ago": [latest - timedelta(days=14)],
    }
    options = []
    ai_items: dict[str, dict] = {}
    for idx, ref_date in enumerate(refs["ai_recommendation"], start=1):
        daily = frame[frame["biz_date"] == ref_date]
        for item in _summarize(daily):
            entry = ai_items.setdefault(item["product_id"], {**item, "weighted_qty": 0.0})
            entry["weighted_qty"] += item["quantity"] * [0.4, 0.3, 0.2, 0.1][idx - 1]
    ai_list = [{**row, "quantity": int(round(row["weighted_qty"]))} for row in ai_items.values() if row["weighted_qty"] > 0]
    for label, source, ref_dates in [
        ("AI 추천 (4주 가중 평균)", "ai_recommendation", refs["ai_recommendation"]),
        ("전주 동요일", "last_week", refs["last_week"]),
        ("전전주 동요일", "two_weeks_ago", refs["two_weeks_ago"]),
    ]:
        items = ai_list if source == "ai_recommendation" else _summarize(frame[frame["biz_date"] == ref_dates[0]])
        risk = await calculate_order_risk(data_store, store_id, items)
        options.append(
            {
                "label": label,
                "source": source,
                "reference_date": _date_string(ref_dates[0]),
                "items": items,
                "total_qty": sum(item["quantity"] for item in items),
                "event_note": "평소보다 많이 주문된 날입니다." if items and source != "ai_recommendation" and sum(item["quantity"] for item in items) > sum(item["quantity"] for item in ai_list) * 1.1 else None,
                "risk_summary": {
                    "stockout_count": sum(1 for item in risk["items"] if item["stockout_risk"] == "high"),
                    "waste_count": sum(1 for item in risk["items"] if item["waste_risk"] == "high"),
                    "waste_items": [item["product_name"] for item in risk["items"] if item["waste_risk"] == "high"],
                },
            }
        )
    deadline = datetime.now().replace(hour=18, minute=0, second=0, microsecond=0)
    return {
        "target_date": _date_string(latest),
        "deadline": deadline.isoformat(),
        "minutes_to_deadline": max(0, int((deadline - datetime.now()).total_seconds() // 60)),
        "options": options,
    }


async def confirm_order(data_store, store_id: str, items: list[dict]) -> dict:
    risk = await calculate_order_risk(data_store, store_id, items)
    record = {
        "order_id": f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid4().hex[:6]}",
        "store_id": store_id,
        "items": items,
        "confirmed_at": datetime.now(UTC).isoformat(),
    }
    _ORDER_LOG.append(record)
    return {
        "order_id": record["order_id"],
        "status": "confirmed",
        "confirmed_at": record["confirmed_at"],
        "items": items,
        "risk_summary": {
            "stockout_count": sum(1 for item in risk["items"] if item["stockout_risk"] == "high"),
            "waste_count": sum(1 for item in risk["items"] if item["waste_risk"] == "high"),
        },
    }


async def get_pending_deadlines(data_store, store_id: str) -> list[dict]:
    now = datetime.now()
    responses = []
    for group, time_text in ORDER_DEADLINES.items():
        hour, minute = [int(part) for part in time_text.split(":")]
        deadline = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        minutes = int((deadline - now).total_seconds() // 60)
        has_pending = any(log["store_id"] == store_id for log in _ORDER_LOG if log["confirmed_at"][:10] == now.date().isoformat())
        responses.append(
            {
                "product_group": group,
                "deadline": deadline.isoformat(),
                "minutes_remaining": max(0, minutes),
                "has_pending_order": has_pending,
                "status": "urgent" if minutes <= 20 else "soon" if minutes <= 60 else "ok",
            }
        )
    return responses
