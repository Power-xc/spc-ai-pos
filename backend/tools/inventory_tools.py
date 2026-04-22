"""Inventory tools shared by POS APIs and proactive monitoring."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

WEIGHTS = [0.4, 0.3, 0.2, 0.1]
HOURLY_PROFILE = {8: 0.05, 9: 0.06, 10: 0.07, 11: 0.08, 12: 0.10, 13: 0.09, 14: 0.09, 15: 0.09, 16: 0.09, 17: 0.09, 18: 0.08, 19: 0.06, 20: 0.03, 21: 0.02}


def _inventory(data_store, store_id: str) -> pd.DataFrame:
    frame = data_store.fact_inventory_day
    return frame[(frame["store_id"] == str(store_id)) & (frame["base_price"] > 0)].copy()


def _latest_date(frame: pd.DataFrame) -> pd.Timestamp:
    return pd.Timestamp(frame["biz_date"].max()).normalize()


def _weighted_daily_qty(frame: pd.DataFrame, latest_date: pd.Timestamp, product_id: str) -> float:
    same_dow = frame[(frame["product_id"] == str(product_id)) & (frame["biz_date"] < latest_date)]
    same_dow = same_dow[same_dow["biz_date"].dt.weekday == latest_date.weekday()].sort_values("biz_date", ascending=False)
    values = same_dow["sold_qty"].head(4).tolist()
    return round(sum(float(v or 0) * w for v, w in zip(values, WEIGHTS, strict=False)), 2)


def _hourly_burn_rate(predicted_daily_qty: float, current_hour: int | None = None) -> float:
    hour = current_hour if current_hour in HOURLY_PROFILE else datetime.now().hour
    share = HOURLY_PROFILE.get(hour, 1 / 14)
    return round(max(predicted_daily_qty * share, predicted_daily_qty / 14), 2)


async def get_current_inventory(data_store, store_id: str, product_id: str | None = None, product_name: str | None = None) -> list[dict]:
    frame = _inventory(data_store, store_id)
    if frame.empty:
        return []
    latest = _latest_date(frame)
    current = frame[frame["biz_date"] == latest].copy()
    if product_id:
        current = current[current["product_id"] == str(product_id)]
    if product_name:
        current = current[current["product_name"].str.contains(product_name, case=False, na=False)]
    items: list[dict] = []
    for row in current.to_dict(orient="records"):
        predicted_daily = _weighted_daily_qty(frame, latest, row["product_id"])
        burn = _hourly_burn_rate(predicted_daily)
        raw_stock = float(row["on_hand_eod"] or 0)
        current_stock = max(0.0, raw_stock)
        eta = None if burn <= 0 else (datetime.now() + timedelta(hours=current_stock / max(burn, 0.1))).isoformat()
        remaining_hours = current_stock / max(burn, 0.1) if burn > 0 else 99
        item = {
            "product_id": row["product_id"],
            "product_name": row["product_name"],
            "category": row["category"],
            "current_stock": int(round(current_stock)),
            "hourly_burn_rate": burn,
            "depletion_eta": eta,
            "freshness": {
                "produced_at": row.get("registered_at").isoformat() if row.get("registered_at") is not None and not pd.isna(row.get("registered_at")) else None,
                "remaining_sell_hours": round(max(0.0, 8.0 - float(row.get("stockout_minutes", 0)) / 60), 1),
                "recommended_remake_time": (datetime.now() + timedelta(minutes=30)).isoformat(),
            },
            "status": "critical" if remaining_hours <= 1 else "warning" if remaining_hours <= 2 else "ok",
        }
        if raw_stock < 0:
            item["_note"] = "원본 데이터 음수, 0으로 보정"
        items.append(item)
    return sorted(items, key=lambda item: (item["status"] != "critical", item["status"] != "warning", item["product_name"]))


async def predict_stock_depletion(data_store, store_id: str, product_id: str) -> dict:
    frame = _inventory(data_store, store_id)
    latest = _latest_date(frame)
    current = frame[(frame["biz_date"] == latest) & (frame["product_id"] == str(product_id))]
    if current.empty:
        return {}
    row = current.iloc[0]
    predicted_daily = _weighted_daily_qty(frame, latest, product_id)
    burn = _hourly_burn_rate(predicted_daily)
    current_stock = max(0.0, float(row["on_hand_eod"] or 0))
    predicted_stock_1h = round(current_stock - burn, 2)
    eta = None if burn <= 0 else (datetime.now() + timedelta(hours=current_stock / max(burn, 0.1))).isoformat()
    return {
        "current_stock": round(current_stock, 2),
        "hourly_burn_rate": burn,
        "predicted_stock_1h": predicted_stock_1h,
        "depletion_eta": eta,
        "confidence": "high" if predicted_daily > 0 else "low",
    }


async def get_stockout_history(data_store, store_id: str, days: int) -> list[dict]:
    frame = _inventory(data_store, store_id)
    latest = _latest_date(frame)
    history = frame[frame["biz_date"] >= latest - pd.Timedelta(days=days - 1)]
    incidents = history[history["stockout_minutes"] > 0].copy()
    incidents["estimated_lost_sales"] = (
        incidents["stockout_minutes"] / 840 * incidents["sold_qty"] * incidents["base_price"]
    ).round(0)
    return [
        {
            "date": row["biz_date"].date().isoformat(),
            "product_name": row["product_name"],
            "stockout_start": None,
            "stockout_end": None,
            "duration_minutes": int(row["stockout_minutes"]),
            "estimated_lost_sales": int(row["estimated_lost_sales"]),
        }
        for row in incidents.sort_values(["biz_date", "stockout_minutes"], ascending=[False, False]).to_dict(orient="records")
    ]


async def get_all_depletion(data_store, store_id: str) -> list[dict]:
    current_items = await get_current_inventory(data_store, store_id)
    depletion = []
    for item in current_items:
        prediction = await predict_stock_depletion(data_store, store_id, item["product_id"])
        if prediction:
            depletion.append({**item, **prediction})
    return depletion
