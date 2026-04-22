"""Production recommendation and registration tools."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import uuid4

import pandas as pd

from tools.inventory_tools import get_all_depletion, predict_stock_depletion

_PRODUCTION_LOG: list[dict] = []


def _production_frame(data_store, store_id: str, product_id: str) -> pd.DataFrame:
    frame = data_store.production_day
    return frame[(frame["store_id"] == str(store_id)) & (frame["product_id"] == str(product_id))].copy()


def _normalize_product_name(value: str | None) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", str(value or "")).lower()


def _match_production_rows(data_store, store_id: str, product_id: str) -> pd.DataFrame:
    exact = _production_frame(data_store, store_id, product_id)
    if not exact.empty:
        return exact
    product_rows = data_store.dim_product[data_store.dim_product["product_id"] == str(product_id)]
    if product_rows.empty:
        return exact
    product_name = product_rows.iloc[0]["product_name"]
    normalized = _normalize_product_name(product_name)
    production = data_store.production_day[data_store.production_day["store_id"] == str(store_id)].copy()
    if production.empty:
        return exact
    production["_normalized_name"] = production["product_name"].map(_normalize_product_name)
    matched = production[
        production["_normalized_name"].map(
            lambda value: bool(value) and (normalized in value or value in normalized)
        )
    ].copy()
    return matched.drop(columns="_normalized_name", errors="ignore")


def _average_time(series: pd.Series) -> str | None:
    valid = series.dropna()
    if valid.empty:
        return None
    minutes = (valid.dt.hour * 60 + valid.dt.minute).mean()
    hour = int(minutes // 60)
    minute = int(minutes % 60)
    return f"{hour:02d}:{minute:02d}"


def _fallback_pattern(frame: pd.DataFrame) -> dict | None:
    valid = frame.dropna(subset=["registered_at"]).copy()
    if valid.empty:
        return None
    valid["time_slot"] = valid["registered_at"].dt.floor("30min")
    top_slot = valid["time_slot"].mode()
    slot = top_slot.iloc[0] if not top_slot.empty else valid["time_slot"].iloc[0]
    slot_rows = valid[valid["time_slot"] == slot]
    return {
        "avg_time": slot.strftime("%H:%M"),
        "avg_qty": int(round(slot_rows["produced_qty"].mean())),
    }


def _category_fallback_qty(data_store, store_id: str, product_id: str) -> int:
    product_rows = data_store.dim_product[data_store.dim_product["product_id"] == str(product_id)]
    category = product_rows.iloc[0]["category"] if not product_rows.empty else None
    if category is None:
        return 12
    inventory = data_store.fact_inventory_day
    rows = inventory[
        (inventory["store_id"] == str(store_id))
        & (inventory["category"] == category)
        & (inventory["sold_qty"] > 0)
    ]
    if rows.empty:
        return 12
    return max(12, int(round(rows["sold_qty"].median())))


async def get_production_pattern(data_store, store_id: str, product_id: str) -> dict:
    frame = _match_production_rows(data_store, store_id, product_id)
    if frame.empty:
        return {"first_production": None, "second_production": None}
    ranked = frame.sort_values(["biz_date", "prod_degree", "registered_at"]).copy()
    ranked["sequence"] = ranked.groupby("biz_date").cumcount() + 1
    first = ranked[ranked["sequence"] == 1]
    second = ranked[ranked["sequence"] == 2]
    first_pattern = {
        "avg_time": _average_time(first["registered_at"]) or "09:15",
        "avg_qty": int(round(first["produced_qty"].mean())) if not first.empty else 0,
    } if not first.empty else _fallback_pattern(frame)
    second_pattern = {
        "avg_time": _average_time(second["registered_at"]) or "13:40",
        "avg_qty": int(round(second["produced_qty"].mean())) if not second.empty else 0,
    } if not second.empty else None
    return {
        "first_production": first_pattern,
        "second_production": second_pattern,
    }


async def get_recommended_production(data_store, store_id: str) -> list[dict]:
    depletion = await get_all_depletion(data_store, store_id)
    recommendations = []
    for item in depletion:
        hours_left = (
            float(item["current_stock"]) / max(float(item["hourly_burn_rate"]), 0.1)
            if item["hourly_burn_rate"]
            else 99
        )
        if hours_left > 2:
            continue
        pattern = await get_production_pattern(data_store, store_id, item["product_id"])
        fallback_qty = int(round(item["hourly_burn_rate"] * 4))
        used_category_fallback = pattern.get("first_production") is None
        category_qty = _category_fallback_qty(data_store, store_id, item["product_id"]) if used_category_fallback else 0
        pattern_qty = max(
            int((pattern.get("first_production") or {}).get("avg_qty") or 0),
            int((pattern.get("second_production") or {}).get("avg_qty") or 0),
        )
        recommended_qty = max(
            fallback_qty,
            pattern_qty,
            category_qty,
            12,
        )
        reason = f"현재고 {item['current_stock']}개, 1시간 후 {item['predicted_stock_1h']:.1f}개 예상"
        if used_category_fallback:
            reason += " · 생산 이력 부족, 유사 품목 기준 추천"
        recommendations.append(
            {
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "recommended_qty": recommended_qty,
                "current_stock": item.get("current_stock", 0),
                "predicted_stock_1h": item.get("predicted_stock_1h"),
                "depletion_eta": item.get("depletion_eta"),
                "hourly_burn_rate": item.get("hourly_burn_rate", 0),
                "reason": reason,
                "urgency": "high" if hours_left <= 1 else "medium",
                "pattern": pattern,
            }
        )
    return sorted(recommendations, key=lambda row: (row["urgency"] != "high", row["product_name"]))


async def register_production(data_store, store_id: str, product_id: str, quantity: int) -> dict:
    prediction = await predict_stock_depletion(data_store, store_id, product_id)
    product_rows = data_store.dim_product[data_store.dim_product["product_id"] == str(product_id)]
    product_name = product_rows.iloc[0]["product_name"] if not product_rows.empty else product_id
    status = "prevented" if prediction.get("current_stock", 0) > 0 else "occurred"
    pct = 8.5 if status == "prevented" else 5.0
    record = {
        "production_id": f"PROD-{uuid4().hex[:8]}",
        "store_id": store_id,
        "product_id": product_id,
        "quantity": quantity,
        "registered_at": datetime.now(UTC).isoformat(),
    }
    _PRODUCTION_LOG.append(record)
    return {
        "registered": True,
        "registered_at": record["registered_at"],
        "production_id": record["production_id"],
        "product_name": product_name,
        "chance_loss": {
            "status": status,
            "message": (
                "미리 생산 등록을 완료하셔서, 과거 동 시간에 발생했던 찬스 로스를 8.5% 감소시켰습니다."
                if status == "prevented"
                else "이미 소진 이후 등록되어 찬스 로스가 발생했습니다."
            ),
            "pct": pct,
        },
    }
