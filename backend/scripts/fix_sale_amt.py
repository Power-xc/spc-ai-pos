#!/usr/bin/env python3
"""Fix sale_amt/net_sales_amt columns in Gold tables from pickle source."""

import asyncio
import pickle
from datetime import date, datetime, timezone

import pandas as pd
import asyncpg

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5433,
    "database": "foxpos",
    "user": "app_user",
    "password": "app_password",
}

GOLD_SCHEMA = "dunkin_mart_copy"
PICKLE_PATH = "/data/sapie/tax/BR-POS-App-UX-PoC/data/.cache/local_data_store.pkl"


def _to_date(v):
    if pd.isna(v):
        return None
    if hasattr(v, "date"):
        return v.date()
    if isinstance(v, date):
        return v
    return pd.Timestamp(v).date()


async def main():
    with open(PICKLE_PATH, "rb") as f:
        store = pickle.load(f)

    df = store["fact_inventory_day"]
    print(f"Updating sale_amt from {len(df)} rows...")

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        chunk_size = 50000
        total = len(df)

        # === Fix sales table ===
        for start in range(0, total, chunk_size):
            chunk = df.iloc[start:start + chunk_size]
            records = []
            for _, r in chunk.iterrows():
                d = r.to_dict()
                biz_date = _to_date(d.get("biz_date"))
                if biz_date is None:
                    continue
                sales = float(d["sales_amt"]) if pd.notna(d.get("sales_amt")) else 0.0
                records.append((
                    round(sales, 2),
                    round(sales, 2),
                    d.get("store_id", ""),
                    biz_date,
                    d.get("product_id", ""),
                ))

            if records:
                await conn.executemany(
                    f"""UPDATE {GOLD_SCHEMA}.new_product_sales_day_gold t
                       SET sale_amt = $1, net_sales_amt = $2, discount_amt = 0
                       WHERE t.store_id = $3 AND t.biz_date = $4 AND t.product_id = $5""",
                    records,
                )
            print(f"  sales: {min(start + chunk_size, total)}/{total}")

        # === Fix inventory risk table ===
        print("Updating inventory risk...")
        for start in range(0, total, chunk_size):
            chunk = df.iloc[start:start + chunk_size]
            records = []
            for _, r in chunk.iterrows():
                d = r.to_dict()
                biz_date = _to_date(d.get("biz_date"))
                if biz_date is None:
                    continue
                on_hand = float(d["on_hand_eod"]) if pd.notna(d.get("on_hand_eod")) else 0
                sold = float(d["sold_qty"]) if pd.notna(d.get("sold_qty")) else 0
                waste = float(d["waste_qty"]) if pd.notna(d.get("waste_qty")) else 0
                stockout = float(d["stockout_minutes"]) if pd.notna(d.get("stockout_minutes")) else 0
                sold_p = float(d["base_price"]) if pd.notna(d.get("base_price")) else 0
                cost = float(d["cost_price"]) if pd.notna(d.get("cost_price")) else 0
                sales = float(d["sales_amt"]) if pd.notna(d.get("sales_amt")) else 0

                records.append((
                    round(on_hand, 2),
                    round(sold, 2),
                    round(waste, 2),
                    round(stockout, 2),
                    d.get("store_id", ""),
                    biz_date,
                    d.get("product_id", ""),
                ))

            if records:
                await conn.executemany(
                    f"""UPDATE {GOLD_SCHEMA}.new_inventory_risk_day_gold t
                       SET on_hand_eod = $1, sold_qty = $2, waste_qty = $3,
                           stockout_minutes = $4
                       WHERE t.store_id = $5 AND t.biz_date = $6 AND t.product_id = $7""",
                    records,
                )
            print(f"  risk: {min(start + chunk_size, total)}/{total}")

        # Drop leftover column
        try:
            await conn.execute(f"ALTER TABLE {GOLD_SCHEMA}.new_product_sales_day_gold DROP COLUMN IF EXISTS sales_num")
        except Exception:
            pass

        # Recalculate KPI
        print("Recalculating KPI...")
        await conn.execute(f"TRUNCATE {GOLD_SCHEMA}.new_kpi_store_day_gold")
        await conn.execute(f"""
            INSERT INTO {GOLD_SCHEMA}.new_kpi_store_day_gold
                (store_id, biz_date, total_sales, total_qty, discount_total, waste_total, stockout_sku_cnt)
            SELECT
                store_id, biz_date,
                COALESCE(SUM(sale_amt)::numeric, 0),
                COALESCE(SUM(sold_qty)::numeric, 0),
                COALESCE(SUM(discount_amt)::numeric, 0),
                COALESCE(SUM(waste_qty)::numeric, 0),
                COALESCE(SUM(CASE WHEN stockout_minutes > 0 THEN 1 ELSE 0 END)::int, 0)
            FROM {GOLD_SCHEMA}.new_product_sales_day_gold
            GROUP BY store_id, biz_date
        """)

        # Verify
        print("\n=== VERIFICATION ===")
        cnt = await conn.fetchval(
            f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_product_sales_day_gold WHERE sale_amt IS NOT NULL AND sale_amt > 0"
        )
        print(f"sale_amt > 0: {cnt}")

        total_sales = await conn.fetchval(
            f"SELECT SUM(sale_amt) FROM {GOLD_SCHEMA}.new_product_sales_day_gold WHERE store_id = 'POC_010'"
        )
        print(f"POC_010 total sale_amt: {total_sales}")

        risk_cnt = await conn.fetchval(
            f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold WHERE on_hand_eod IS NOT NULL"
        )
        print(f"risk rows with on_hand: {risk_cnt}")

        kpi_cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_kpi_store_day_gold")
        print(f"KPI rows: {kpi_cnt}")

        print("\nDone!")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())