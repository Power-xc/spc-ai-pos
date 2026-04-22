"""Generate lightweight demo seed CSV files for DEMO_MODE."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SEED_DIR = DATA_DIR / "demo_seed"
STORE_ID = "POC_001"
STORE_NAME = "고양시02"
CURRENT_DATE = pd.Timestamp("2026-04-08")
LAST_WEEK_TUESDAY = pd.Timestamp("2026-03-31")
HISTORY_WEDNESDAYS = [
    pd.Timestamp("2026-03-11"),
    pd.Timestamp("2026-03-18"),
    pd.Timestamp("2026-03-25"),
    pd.Timestamp("2026-04-01"),
]
HISTORY_TUESDAYS = [
    pd.Timestamp("2026-03-03"),
    pd.Timestamp("2026-03-10"),
    pd.Timestamp("2026-03-17"),
    pd.Timestamp("2026-03-24"),
]

PRODUCTS = {
    "811047": ("페이머스글레이즈드", "도넛", 1143.64, 759.0),
    "812001": ("스트로베리필드", "도넛", 1406.04, 915.0),
    "811191": ("카카오후로스티드", "도넛", 1385.88, 915.0),
    "822010": ("카카오하니딥", "도넛", 1176.98, 759.0),
    "832078": ("소금우유도넛", "도넛", 1790.92, 1220.0),
    "831067": ("허니후리터", "도넛", 1784.08, 1202.0),
    "700833": ("빨대", "기타", 0.0, 0.0),
    "DEMO_OLDFASHIONED": ("올드패션", "도넛", 1450.0, 945.0),
    "DEMO_CREAM_CHEESE_MUFFIN": ("크림치즈머핀", "푸드", 2100.0, 1260.0),
}


def product_meta(product_id: str) -> tuple[str, str, float, float]:
    return PRODUCTS[product_id]


def inventory_row(
    biz_date: pd.Timestamp,
    product_id: str,
    sold_qty: int,
    on_hand_eod: int,
    *,
    waste_qty: int = 0,
    stockout_minutes: int = 0,
    last_sale_time: str = "14:00:00",
    registered_at: str | None = None,
) -> dict:
    product_name, category, base_price, cost_price = product_meta(product_id)
    return {
        "store_id": STORE_ID,
        "store_name": STORE_NAME,
        "biz_date": biz_date.date().isoformat(),
        "product_id": product_id,
        "product_name": product_name,
        "category": category,
        "on_hand_eod": on_hand_eod,
        "sold_qty": sold_qty,
        "waste_qty": waste_qty,
        "stockout_minutes": stockout_minutes,
        "reorder_triggered": 1 if on_hand_eod <= 0 else 0,
        "base_price": round(base_price, 2),
        "cost_price": round(cost_price, 2),
        "sales_amt": round(sold_qty * base_price, 2),
        "last_sale_time": last_sale_time,
        "registered_at": registered_at or f"{biz_date.date().isoformat()}T06:00:00",
    }


def production_row(
    biz_date: pd.Timestamp,
    product_id: str,
    prod_degree: int,
    qty: int,
    time_text: str,
) -> dict:
    product_name, _, base_price, cost_price = product_meta(product_id)
    timestamp = f"{biz_date.date().isoformat()}T{time_text}:00"
    return {
        "store_id": STORE_ID,
        "store_name": STORE_NAME,
        "biz_date": biz_date.date().isoformat(),
        "prod_degree": prod_degree,
        "product_id": product_id,
        "product_name": product_name,
        "produced_qty": qty,
        "base_price": round(base_price, 2),
        "cost_price": round(cost_price, 2),
        "registered_at": timestamp,
        "updated_at": timestamp,
    }


def order_row(
    biz_date: pd.Timestamp,
    product_id: str,
    quantity: int,
    group_name: str = "도넛류",
) -> dict:
    product_name, category, base_price, _ = product_meta(product_id)
    return {
        "store_id": STORE_ID,
        "store_name": STORE_NAME,
        "biz_date": biz_date.date().isoformat(),
        "order_group_name": group_name,
        "order_degree": 1,
        "order_degree_name": "1차",
        "product_id": product_id,
        "product_name": product_name,
        "category": category,
        "order_unit_price": round(base_price, 2),
        "order_qty": quantity,
        "order_amt": round(quantity * base_price, 2),
        "confirmed_qty": quantity,
        "confirmed_amt": round(quantity * base_price, 2),
        "recommended_qty": quantity,
        "effective_order_qty": quantity,
        "effective_order_amt": round(quantity * base_price, 2),
        "auto_order_yn": 0,
    }


def monthly_rows(
    start_date: pd.Timestamp, product_id: str, total_qty: int
) -> list[dict]:
    end_date = (start_date + pd.offsets.MonthEnd(0)).normalize()
    days = pd.date_range(start_date, end_date, freq="D")
    base_qty, remainder = divmod(total_qty, len(days))
    rows: list[dict] = []
    for index, biz_date in enumerate(days):
        qty = base_qty + (1 if index < remainder else 0)
        rows.append(
            inventory_row(
                biz_date,
                product_id,
                sold_qty=qty,
                on_hand_eod=max(8, qty // 2),
                waste_qty=max(0, qty // 25),
                last_sale_time="18:00:00",
                registered_at=f"{biz_date.date().isoformat()}T07:00:00",
            )
        )
    return rows


def build_inventory_seed() -> pd.DataFrame:
    rows: list[dict] = []

    # Scenario A: proactive production modal.
    current_day = {
        "811047": (140, 15),
        "DEMO_OLDFASHIONED": (36, 42),
        "812001": (24, 34),
        "811191": (22, 32),
        "822010": (20, 28),
        "832078": (18, 24),
        "831067": (14, 22),
    }
    for product_id, (sold_qty, stock_qty) in current_day.items():
        rows.append(inventory_row(CURRENT_DATE, product_id, sold_qty, stock_qty))

    history_profile = {
        "811047": [136, 142, 138, 144],
        "DEMO_OLDFASHIONED": [34, 38, 35, 37],
        "812001": [22, 24, 23, 25],
        "811191": [20, 22, 21, 23],
        "822010": [18, 20, 19, 21],
        "832078": [16, 18, 17, 19],
        "831067": [12, 14, 13, 15],
    }
    for product_id, quantities in history_profile.items():
        for biz_date, qty in zip(HISTORY_WEDNESDAYS, quantities, strict=True):
            rows.append(inventory_row(biz_date, product_id, qty, max(qty // 2, 20)))

    # Scenario C: 2025-02 comparison baseline around 9.46M KRW.
    february_2025 = {
        "811047": 2000,
        "DEMO_OLDFASHIONED": 1400,
        "812001": 900,
        "811191": 850,
        "822010": 900,
        "832078": 620,
        "DEMO_CREAM_CHEESE_MUFFIN": 250,
    }
    for product_id, total_qty in february_2025.items():
        rows.extend(monthly_rows(pd.Timestamp("2025-02-01"), product_id, total_qty))

    return pd.DataFrame(rows)


def build_production_seed() -> pd.DataFrame:
    rows: list[dict] = []
    for biz_date in [*HISTORY_WEDNESDAYS, CURRENT_DATE]:
        rows.append(production_row(biz_date, "811047", 1, 48, "09:00"))
        rows.append(production_row(biz_date, "811047", 2, 36, "13:30"))
    return pd.DataFrame(rows)


def build_order_seed() -> pd.DataFrame:
    rows: list[dict] = []
    repeated_orders = [
        ("811047", 48),
        ("DEMO_OLDFASHIONED", 36),
        ("812001", 24),
        ("811191", 24),
        ("822010", 20),
        ("832078", 12),
        ("831067", 12),
        ("700833", 100),
    ]
    for biz_date in [*HISTORY_TUESDAYS, LAST_WEEK_TUESDAY]:
        for product_id, quantity in repeated_orders:
            group_name = "기타" if product_id == "700833" else "도넛류"
            rows.append(order_row(biz_date, product_id, quantity, group_name))
    return pd.DataFrame(rows)


def main() -> None:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    inventory = build_inventory_seed()
    production = build_production_seed()
    order_day = build_order_seed()
    inventory.to_csv(SEED_DIR / "fact_inventory_day.csv", index=False)
    production.to_csv(SEED_DIR / "production_day.csv", index=False)
    order_day.to_csv(SEED_DIR / "order_day.csv", index=False)
    print(f"Wrote demo seeds to {SEED_DIR}")
    print(
        f"inventory rows={len(inventory)} production rows={len(production)} order rows={len(order_day)}"
    )


if __name__ == "__main__":
    main()
