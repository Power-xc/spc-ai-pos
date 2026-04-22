"""Manual input persistence for owner-verified dashboard metrics.

These files provide a transparent input path for data that is not present in
the current POS source extracts (e.g., fixed cost, labor cost, customer visits).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

FINANCIAL_INPUT_COLUMNS = [
    "store_id",
    "biz_date",
    "fixed_cost_amt",
    "labor_cost_amt",
    "promo_cost_amt",
    "promo_sales_lift_amt",
    "promo_coupon_redemption_amt",
    "note",
    "updated_at",
    "updated_by",
]

CUSTOMER_INPUT_COLUMNS = [
    "store_id",
    "biz_date",
    "unique_customers",
    "repeat_customers",
    "repeat_visit_rate_pct",
    "orders_from_repeat_customers",
    "avg_orders_per_repeat_customer",
    "data_source",
    "note",
    "updated_at",
    "updated_by",
]


def _manual_input_dir(data_dir: str) -> Path:
    path = Path(data_dir).expanduser().resolve() / "manual_inputs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _financial_path(data_dir: str) -> Path:
    return _manual_input_dir(data_dir) / "financial_inputs_daily.csv"


def _customer_path(data_dir: str) -> Path:
    return _manual_input_dir(data_dir) / "customer_insights_daily.csv"


def _to_iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.normalize().date().isoformat()


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    if pd.isna(parsed):
        return None
    return float(parsed)


def _to_int(value: Any) -> int | None:
    parsed = _to_float(value)
    if parsed is None:
        return None
    return int(round(parsed))


def _load_inputs(path: Path, *, columns: list[str]) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=columns)
    frame = pd.read_csv(path, dtype=str)
    for column in columns:
        if column not in frame.columns:
            frame[column] = pd.NA
    return frame[columns].copy()


def _write_inputs(path: Path, frame: pd.DataFrame) -> None:
    temp_path = path.with_suffix(".tmp")
    frame.to_csv(temp_path, index=False, encoding="utf-8")
    temp_path.replace(path)


def _normalize_common(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    normalized["store_id"] = normalized["store_id"].astype(str).str.strip()
    normalized["biz_date"] = pd.to_datetime(normalized["biz_date"], errors="coerce").dt.normalize()
    normalized = normalized.dropna(subset=["store_id", "biz_date"])
    return normalized


def upsert_financial_input(
    data_dir: str,
    *,
    store_id: str,
    biz_date: str | date,
    fixed_cost_amt: float | None = None,
    labor_cost_amt: float | None = None,
    promo_cost_amt: float | None = None,
    promo_sales_lift_amt: float | None = None,
    promo_coupon_redemption_amt: float | None = None,
    note: str | None = None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    path = _financial_path(data_dir)
    frame = _load_inputs(path, columns=FINANCIAL_INPUT_COLUMNS)
    frame = _normalize_common(frame)

    biz_date_iso = _to_iso_date(biz_date)
    if biz_date_iso is None:
        raise ValueError("biz_date is invalid")
    target_day = pd.Timestamp(biz_date_iso).normalize()

    frame = frame[
        ~(
            (frame["store_id"] == str(store_id).strip())
            & (frame["biz_date"] == target_day)
        )
    ]
    now_iso = datetime.now(UTC).isoformat()
    record = {
        "store_id": str(store_id).strip(),
        "biz_date": target_day,
        "fixed_cost_amt": _to_float(fixed_cost_amt),
        "labor_cost_amt": _to_float(labor_cost_amt),
        "promo_cost_amt": _to_float(promo_cost_amt),
        "promo_sales_lift_amt": _to_float(promo_sales_lift_amt),
        "promo_coupon_redemption_amt": _to_float(promo_coupon_redemption_amt),
        "note": str(note).strip() if note else "",
        "updated_at": now_iso,
        "updated_by": str(updated_by).strip() if updated_by else "",
    }
    frame = pd.concat([frame, pd.DataFrame([record])], ignore_index=True)
    frame = frame.sort_values(["store_id", "biz_date"], ascending=[True, False]).reset_index(drop=True)
    frame["biz_date"] = pd.to_datetime(frame["biz_date"], errors="coerce").dt.date.astype(str)
    _write_inputs(path, frame[FINANCIAL_INPUT_COLUMNS])
    return record | {"biz_date": biz_date_iso, "source": "manual_inputs.financial_inputs_daily.csv"}


def get_financial_input(
    data_dir: str,
    *,
    store_id: str,
    biz_date: str | date | None = None,
) -> dict[str, Any] | None:
    path = _financial_path(data_dir)
    frame = _load_inputs(path, columns=FINANCIAL_INPUT_COLUMNS)
    if frame.empty:
        return None

    frame = _normalize_common(frame)
    if frame.empty:
        return None

    filtered = frame[frame["store_id"] == str(store_id).strip()].copy()
    if filtered.empty:
        return None

    target_day = pd.to_datetime(biz_date, errors="coerce").normalize() if biz_date else None
    if target_day is not None and not pd.isna(target_day):
        exact = filtered[filtered["biz_date"] == target_day]
        if not exact.empty:
            filtered = exact

    row = filtered.sort_values("biz_date", ascending=False).iloc[0]
    return {
        "store_id": row["store_id"],
        "biz_date": row["biz_date"].date().isoformat(),
        "fixed_cost_amt": _to_float(row.get("fixed_cost_amt")),
        "labor_cost_amt": _to_float(row.get("labor_cost_amt")),
        "promo_cost_amt": _to_float(row.get("promo_cost_amt")),
        "promo_sales_lift_amt": _to_float(row.get("promo_sales_lift_amt")),
        "promo_coupon_redemption_amt": _to_float(row.get("promo_coupon_redemption_amt")),
        "note": str(row.get("note") or "").strip() or None,
        "updated_at": str(row.get("updated_at") or ""),
        "updated_by": str(row.get("updated_by") or "") or None,
        "source": "manual_inputs.financial_inputs_daily.csv",
    }


def upsert_customer_input(
    data_dir: str,
    *,
    store_id: str,
    biz_date: str | date,
    unique_customers: int | None = None,
    repeat_customers: int | None = None,
    repeat_visit_rate_pct: float | None = None,
    orders_from_repeat_customers: int | None = None,
    avg_orders_per_repeat_customer: float | None = None,
    data_source: str | None = None,
    note: str | None = None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    path = _customer_path(data_dir)
    frame = _load_inputs(path, columns=CUSTOMER_INPUT_COLUMNS)
    frame = _normalize_common(frame)

    biz_date_iso = _to_iso_date(biz_date)
    if biz_date_iso is None:
        raise ValueError("biz_date is invalid")
    target_day = pd.Timestamp(biz_date_iso).normalize()

    frame = frame[
        ~(
            (frame["store_id"] == str(store_id).strip())
            & (frame["biz_date"] == target_day)
        )
    ]
    now_iso = datetime.now(UTC).isoformat()
    record = {
        "store_id": str(store_id).strip(),
        "biz_date": target_day,
        "unique_customers": _to_int(unique_customers),
        "repeat_customers": _to_int(repeat_customers),
        "repeat_visit_rate_pct": _to_float(repeat_visit_rate_pct),
        "orders_from_repeat_customers": _to_int(orders_from_repeat_customers),
        "avg_orders_per_repeat_customer": _to_float(avg_orders_per_repeat_customer),
        "data_source": str(data_source).strip() if data_source else "manual_input",
        "note": str(note).strip() if note else "",
        "updated_at": now_iso,
        "updated_by": str(updated_by).strip() if updated_by else "",
    }
    frame = pd.concat([frame, pd.DataFrame([record])], ignore_index=True)
    frame = frame.sort_values(["store_id", "biz_date"], ascending=[True, False]).reset_index(drop=True)
    frame["biz_date"] = pd.to_datetime(frame["biz_date"], errors="coerce").dt.date.astype(str)
    _write_inputs(path, frame[CUSTOMER_INPUT_COLUMNS])
    return record | {"biz_date": biz_date_iso, "source": "manual_inputs.customer_insights_daily.csv"}


def get_customer_inputs_window(
    data_dir: str,
    *,
    store_id: str,
    lookback_days: int = 28,
) -> list[dict[str, Any]]:
    path = _customer_path(data_dir)
    frame = _load_inputs(path, columns=CUSTOMER_INPUT_COLUMNS)
    if frame.empty:
        return []

    frame = _normalize_common(frame)
    if frame.empty:
        return []

    filtered = frame[frame["store_id"] == str(store_id).strip()].copy()
    if filtered.empty:
        return []

    latest_day = filtered["biz_date"].max()
    cutoff = latest_day - timedelta(days=max(lookback_days - 1, 0))
    filtered = filtered[filtered["biz_date"] >= cutoff].sort_values("biz_date", ascending=True)

    records: list[dict[str, Any]] = []
    for _, row in filtered.iterrows():
        records.append(
            {
                "store_id": row["store_id"],
                "biz_date": row["biz_date"].date().isoformat(),
                "unique_customers": _to_int(row.get("unique_customers")),
                "repeat_customers": _to_int(row.get("repeat_customers")),
                "repeat_visit_rate_pct": _to_float(row.get("repeat_visit_rate_pct")),
                "orders_from_repeat_customers": _to_int(row.get("orders_from_repeat_customers")),
                "avg_orders_per_repeat_customer": _to_float(row.get("avg_orders_per_repeat_customer")),
                "data_source": str(row.get("data_source") or "manual_input"),
                "note": str(row.get("note") or "").strip() or None,
                "updated_at": str(row.get("updated_at") or ""),
                "updated_by": str(row.get("updated_by") or "") or None,
                "source": "manual_inputs.customer_insights_daily.csv",
            }
        )
    return records

