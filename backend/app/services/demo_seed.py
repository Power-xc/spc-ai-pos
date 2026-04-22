"""Helpers for loading and merging demo seed datasets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

SEED_SPECS: dict[str, dict[str, Any]] = {
    "fact_inventory_day": {
        "filename": "fact_inventory_day.csv",
        "date_columns": ["biz_date", "registered_at"],
        "numeric_columns": [
            "on_hand_eod",
            "sold_qty",
            "waste_qty",
            "stockout_minutes",
            "reorder_triggered",
            "base_price",
            "cost_price",
            "sales_amt",
        ],
        "dedupe_keys": ["store_id", "biz_date", "product_id"],
        "sort_keys": ["store_id", "biz_date", "product_id"],
    },
    "production_day": {
        "filename": "production_day.csv",
        "date_columns": ["biz_date", "registered_at", "updated_at"],
        "numeric_columns": ["prod_degree", "produced_qty", "base_price", "cost_price"],
        "dedupe_keys": ["store_id", "biz_date", "product_id", "prod_degree", "registered_at"],
        "sort_keys": ["store_id", "biz_date", "prod_degree", "product_id"],
    },
    "order_day": {
        "filename": "order_day.csv",
        "date_columns": ["biz_date"],
        "numeric_columns": [
            "order_degree",
            "order_unit_price",
            "order_qty",
            "order_amt",
            "confirmed_qty",
            "confirmed_amt",
            "recommended_qty",
            "effective_order_qty",
            "effective_order_amt",
            "auto_order_yn",
        ],
        "dedupe_keys": ["store_id", "biz_date", "product_id", "order_degree", "order_group_name"],
        "sort_keys": ["store_id", "biz_date", "order_degree", "product_id"],
    },
}


def available_seed_paths(seed_dir: str | None) -> dict[str, Path]:
    """Return existing seed file paths keyed by dataframe name."""

    if not seed_dir:
        return {}
    base = Path(seed_dir).expanduser().resolve()
    if not base.exists():
        return {}
    paths: dict[str, Path] = {}
    for key, spec in SEED_SPECS.items():
        path = base / spec["filename"]
        if path.exists():
            paths[key] = path
    return paths


def merge_demo_seed_frames(store, seed_dir: str | None) -> None:
    """Merge normalized demo seed frames into the loaded store."""

    for key, path in available_seed_paths(seed_dir).items():
        spec = SEED_SPECS[key]
        current = getattr(store, key)
        incoming = pd.read_csv(path)
        merged = _normalize_and_merge(current, incoming, spec)
        setattr(store, key, merged)


def _normalize_and_merge(current: pd.DataFrame, incoming: pd.DataFrame, spec: dict[str, Any]) -> pd.DataFrame:
    frame = incoming.copy()
    for column in spec["date_columns"]:
        if column in frame.columns:
            frame[column] = pd.to_datetime(frame[column], errors="coerce")
    for column in spec["numeric_columns"]:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    for column in current.columns:
        if column not in frame.columns:
            frame[column] = pd.NA
    frame = frame[current.columns]
    merged = pd.concat([current, frame], ignore_index=True)
    merged = merged.drop_duplicates(subset=spec["dedupe_keys"], keep="last")
    return merged.sort_values(spec["sort_keys"]).reset_index(drop=True)
