#!/usr/bin/env python3
"""
Create and populate remaining Gold tables:
  - new_kpi_store_day_gold (from fact_inventory_day aggregated by store/date)
  - new_inventory_risk_day_gold (from fact_inventory_day)
  - new_campaign_day_gold (empty placeholder)

DB connection + seed-data paths come from the environment (see scripts/_db.py).
"""

import asyncio
import pickle
import sys

import pandas as pd
import asyncpg

from _db import db_config, SEED_PICKLE

DB_CONFIG = db_config()

GOLD_SCHEMA = "dunkin_mart_copy"


def load_pickle(path: str) -> dict:
    with open(path, "rb") as f:
        return pickle.load(f)


async def create_kpi_table(conn):
    """Create new_kpi_store_day_gold from fact_inventory_day aggregation."""
    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_kpi_store_day_gold")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_kpi_store_day_gold (
            store_id text NOT NULL,
            biz_date date NOT NULL,
            total_sales numeric,
            total_qty numeric,
            discount_total numeric,
            waste_total numeric,
            stockout_sku_cnt integer,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (store_id, biz_date)
        )
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS
            idx_kpi_store_day_gold_store_date
        ON {GOLD_SCHEMA}.new_kpi_store_day_gold (store_id, biz_date)
    """)


async def load_kpi_data(conn, fact_inv: pd.DataFrame):
    """Aggregate fact_inventory_day -> new_kpi_store_day_gold."""
    agg = fact_inv.groupby(["store_id", "biz_date"]).agg(
        total_sales=("sales_amt", "sum"),
        total_qty=("sold_qty", "sum"),
        discount_total=("sales_amt", lambda _: 0),
        waste_total=("waste_qty", "sum"),
        stockout_sku_cnt=("stockout_minutes", lambda s: int((s > 0).sum())),
    ).reset_index()

    exec_params = [
        (
            str(r["store_id"]),
            r["biz_date"].date() if hasattr(r["biz_date"], "date") else r["biz_date"],
            round(float(r["total_sales"]), 2) if pd.notna(r["total_sales"]) else None,
            round(float(r["total_qty"]), 2) if pd.notna(r["total_qty"]) else None,
            0,
            round(float(r["waste_total"]), 2) if pd.notna(r["waste_total"]) else None,
            int(r["stockout_sku_cnt"]) if pd.notna(r["stockout_sku_cnt"]) else 0,
        )
        for _, r in agg.iterrows()
    ]

    await conn.executemany(f"""
        INSERT INTO {GOLD_SCHEMA}.new_kpi_store_day_gold
        (store_id, biz_date, total_sales, total_qty, discount_total, waste_total, stockout_sku_cnt)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (store_id, biz_date) DO UPDATE SET
            total_sales = EXCLUDED.total_sales,
            total_qty = EXCLUDED.total_qty,
            discount_total = EXCLUDED.discount_total,
            waste_total = EXCLUDED.waste_total,
            stockout_sku_cnt = EXCLUDED.stockout_sku_cnt
    """, exec_params)
    print(f"  new_kpi_store_day_gold: {len(exec_params)} rows")


async def create_inventory_risk_table(conn):
    """Create new_inventory_risk_day_gold."""
    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_inventory_risk_day_gold")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_inventory_risk_day_gold (
            store_id text NOT NULL,
            biz_date date NOT NULL,
            product_id text NOT NULL,
            product_name text,
            category text,
            on_hand_eod numeric,
            sold_qty numeric,
            waste_qty numeric,
            stockout_minutes numeric,
            reorder_triggered boolean,
            base_price numeric,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (store_id, biz_date, product_id)
        )
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS
            idx_inventory_risk_gold_store_date
        ON {GOLD_SCHEMA}.new_inventory_risk_day_gold (store_id, biz_date)
    """)


async def load_inventory_risk_data(conn, fact_inv: pd.DataFrame):
    """Load fact_inventory_day -> new_inventory_risk_day_gold."""
    exec_params = [
        (
            str(r.get("store_id", "")),
            _date(r.get("biz_date")),
            str(r.get("product_id", "")),
            (str(r.get("product_name", ""))[:200]),
            (str(r.get("category", ""))[:100]),
            _num(r.get("on_hand_eod")),
            _num(r.get("sold_qty")),
            _num(r.get("waste_qty")),
            _num(r.get("stockout_minutes")),
            bool(r.get("reorder_triggered", False)),
            _num(r.get("base_price")),
        )
        for _, r in fact_inv.iterrows()
    ]

    await conn.executemany(f"""
        INSERT INTO {GOLD_SCHEMA}.new_inventory_risk_day_gold
        (store_id, biz_date, product_id, product_name, category,
         on_hand_eod, sold_qty, waste_qty, stockout_minutes,
         reorder_triggered, base_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (store_id, biz_date, product_id) DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = EXCLUDED.category,
            on_hand_eod = EXCLUDED.on_hand_eod,
            sold_qty = EXCLUDED.sold_qty,
            waste_qty = EXCLUDED.waste_qty,
            stockout_minutes = EXCLUDED.stockout_minutes,
            reorder_triggered = EXCLUDED.reorder_triggered,
            base_price = EXCLUDED.base_price
    """, exec_params)
    print(f"  new_inventory_risk_day_gold: {len(exec_params)} rows")


def _num(v):
    if pd.isna(v):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _date(v):
    if pd.isna(v):
        return None
    if hasattr(v, "date"):
        return v.date()
    try:
        return pd.to_datetime(str(v)).date()
    except Exception:
        return None


async def create_campaign_table(conn):
    """Create empty new_campaign_day_gold if not exists."""
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.new_campaign_day_gold (
            store_id text NOT NULL,
            biz_date date NOT NULL,
            campaign_id text,
            campaign_name text,
            sales_amt numeric DEFAULT 0,
            bill_cnt integer DEFAULT 0,
            updated_at timestamptz DEFAULT now()
        )
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS
            idx_campaign_gold_store_date
        ON {GOLD_SCHEMA}.new_campaign_day_gold (store_id, biz_date)
    """)
    print("  new_campaign_day_gold: created (empty)")


async def verify(conn):
    for table in [
        "new_product_sales_day_gold",
        "new_kpi_store_day_gold",
        "new_inventory_risk_day_gold",
        "dim_product",
        "new_dim_product_silver",
        "new_campaign_day_gold",
    ]:
        count = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.{table}")
        print(f"  {table}: {count} rows")

    # Test get_latest_biz_date equivalent
    latest = await conn.fetchval(f"""
        SELECT max(biz_date) AS biz_date FROM (
            SELECT max(biz_date) AS biz_date
            FROM {GOLD_SCHEMA}.new_kpi_store_day_gold
            WHERE store_id = 'POC_010'
            UNION ALL
            SELECT max(biz_date) AS biz_date
            FROM {GOLD_SCHEMA}.new_product_sales_day_gold
            WHERE store_id = 'POC_010'
            UNION ALL
            SELECT max(biz_date) AS biz_date
            FROM {GOLD_SCHEMA}.new_inventory_risk_day_gold
            WHERE store_id = 'POC_010'
        ) latest_dates
    """)
    print(f"\n  get_latest_biz_date for POC_010: {latest}")


async def main():
    source = SEED_PICKLE
    print(f"Loading pickle from {source}...")
    data = load_pickle(source)
    fact_inv = data.get("fact_inventory_day")
    if fact_inv is None:
        print("ERROR: fact_inventory_day not found")
        sys.exit(1)
    print(f"fact_inventory_day: {len(fact_inv)} rows")

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        print("\nCreating tables...")
        await create_kpi_table(conn)
        await create_inventory_risk_table(conn)
        await create_campaign_table(conn)

        print("\nLoading data...")
        await load_kpi_data(conn, fact_inv)
        await load_inventory_risk_data(conn, fact_inv)

        print("\nVerifying...")
        await verify(conn)

        print("\nDone!")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
