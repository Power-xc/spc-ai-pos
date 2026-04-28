#!/usr/bin/env python3
"""Load remaining Gold tables from pickle cache into PostgreSQL."""

import asyncio
import pickle
from datetime import date as date_type, datetime, timezone

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
    if isinstance(v, date_type):
        return v
    try:
        return pd.Timestamp(v).date()
    except Exception:
        return None


def _to_ts(v):
    if pd.isna(v):
        return None
    if hasattr(v, "to_pydatetime"):
        dt = v.to_pydatetime()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v
    return None


async def load_dim_store(conn, store):
    print("=== dim_store ===")
    dim_store = store.get("dim_store")
    if dim_store is None or len(dim_store) == 0:
        print("  SKIPPED - empty")
        return

    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.dim_store")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.dim_store (
            store_id text PRIMARY KEY,
            store_name text,
            region text,
            city text
        )
    """)

    rows = []
    for _, r in dim_store.iterrows():
        d = r.to_dict()
        vals = {
            "store_id": str(d.get("store_id", "")),
            "store_name": str(d.get("store_name", "")) if pd.notna(d.get("store_name")) else None,
            "region": str(d.get("region", "")) if pd.notna(d.get("region")) else None,
            "city": str(d.get("city", "")) if pd.notna(d.get("city")) else None,
        }
        rows.append(vals)

    await conn.executemany(
        f"INSERT INTO {GOLD_SCHEMA}.dim_store VALUES ($1, $2, $3, $4)",
        [(r["store_id"], r["store_name"], r["region"], r["city"]) for r in rows],
    )
    print(f"  Loaded {len(rows)} rows")


async def load_dim_product(conn, store):
    print("=== dim_product ===")
    dim_prod = store.get("dim_product")
    if dim_prod is None or len(dim_prod) == 0:
        print("  SKIPPED - empty")
        return

    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.dim_product")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.dim_product (
            product_id text PRIMARY KEY,
            product_name text,
            category text,
            base_price numeric,
            cost_price numeric,
            brand_name text,
            item_class text
        )
    """)

    rows = []
    for _, r in dim_prod.iterrows():
        d = r.to_dict()
        vals = {
            "product_id": str(d.get("product_id", "")),
            "product_name": str(d.get("product_name", "")) if pd.notna(d.get("product_name")) else None,
            "category": str(d.get("category", "")) if pd.notna(d.get("category")) else None,
            "base_price": float(d["base_price"]) if pd.notna(d.get("base_price")) else None,
            "cost_price": float(d["cost_price"]) if pd.notna(d.get("cost_price")) else None,
            "brand_name": str(d.get("brand_name", "")) if pd.notna(d.get("brand_name")) else None,
            "item_class": str(d.get("item_class", "")) if pd.notna(d.get("item_class")) else None,
        }
        rows.append(vals)

    await conn.executemany(
        f"INSERT INTO {GOLD_SCHEMA}.dim_product VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [(r["product_id"], r["product_name"], r["category"], r["base_price"],
          r["cost_price"], r["brand_name"], r["item_class"]) for r in rows],
    )
    print(f"  Loaded {len(rows)} rows")


async def load_new_product_sales_day_gold(conn, store):
    print("=== new_product_sales_day_gold ===")
    fact_inv = store.get("fact_inventory_day")
    if fact_inv is None or len(fact_inv) == 0:
        print("  SKIPPED - empty")
        return

    print(f"  fact_inventory_day: {len(fact_inv)} rows, cols: {list(fact_inv.columns)}")

    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_product_sales_day_gold")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_product_sales_day_gold (
            store_id text NOT NULL,
            biz_date date NOT NULL,
            product_id text NOT NULL,
            product_name text,
            category text,
            sold_qty numeric,
            sale_amt numeric,
            discount_amt numeric,
            net_sales_amt numeric,
            waste_qty numeric,
            stockout_minutes numeric,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (store_id, biz_date, product_id)
        )
    """)

    chunk_size = 50000
    total = len(fact_inv)
    total_loaded = 0

    for start in range(0, total, chunk_size):
        chunk = fact_inv.iloc[start:start + chunk_size]
        records = []
        for _, r in chunk.iterrows():
            d = r.to_dict()
            biz_date = _to_date(d.get("biz_date"))
            if biz_date is None:
                continue

            sold = float(d["sold_qty"]) if pd.notna(d.get("sold_qty")) else None
            sale = float(d["sale_amt"]) if pd.notna(d.get("sale_amt")) else None
            discount = float(d["discount_amt"]) if pd.notna(d.get("discount_amt")) else None
            net = float(d["net_sales_amt"]) if pd.notna(d.get("net_sales_amt")) else None
            waste = float(d["waste_qty"]) if pd.notna(d.get("waste_qty")) else None
            stockout = float(d["stockout_minutes"]) if pd.notna(d.get("stockout_minutes")) else None

            records.append((
                str(d.get("store_id", "")),
                biz_date,
                str(d.get("product_id", "")),
                str(d.get("product_name", "")) if pd.notna(d.get("product_name")) else None,
                str(d.get("category", "")) if pd.notna(d.get("category")) else None,
                sold, sale, discount, net, waste, stockout,
            ))
            total_loaded += 1

        if records:
            await conn.executemany(
                f"""INSERT INTO {GOLD_SCHEMA}.new_product_sales_day_gold
                   (store_id, biz_date, product_id, product_name, category,
                    sold_qty, sale_amt, discount_amt, net_sales_amt, waste_qty, stockout_minutes)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   ON CONFLICT (store_id, biz_date, product_id)
                   DO UPDATE SET product_name = EXCLUDED.product_name""",
                records,
            )
        print(f"  Progress: {min(start + chunk_size, total)}/{total}...")

    # Create index
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_product_sales_day_gold_store_date
        ON {GOLD_SCHEMA}.new_product_sales_day_gold (store_id, biz_date)
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_product_sales_day_gold_product
        ON {GOLD_SCHEMA}.new_product_sales_day_gold (product_id)
    """)
    print(f"  Loaded {total_loaded} rows, indexes created")


async def load_inventory_risk_gold(conn, store):
    print("=== new_inventory_risk_day_gold ===")
    fact_inv = store.get("fact_inventory_day")
    if fact_inv is None or len(fact_inv) == 0:
        print("  SKIPPED - empty")
        return

    print(f"  fact_inventory_day: {len(fact_inv)} rows, cols: {list(fact_inv.columns)}")

    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_inventory_risk_day_gold")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_inventory_risk_day_gold (
            store_id text NOT NULL,
            biz_date date NOT NULL,
            product_id text NOT NULL,
            product_name text,
            category text,
            on_hand_eod numeric,
            ordered_qty numeric,
            delivered_qty numeric,
            sold_qty numeric,
            waste_qty numeric,
            stockout_minutes numeric,
            days_of_supply numeric,
            sell_through_rate numeric,
            inventory_turnover numeric,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (store_id, biz_date, product_id)
        )
    """)

    chunk_size = 50000
    total = len(fact_inv)
    total_loaded = 0

    for start in range(0, total, chunk_size):
        chunk = fact_inv.iloc[start:start + chunk_size]
        records = []
        for _, r in chunk.iterrows():
            d = r.to_dict()
            biz_date = _to_date(d.get("biz_date"))
            if biz_date is None:
                continue

            on_hand = float(d["on_hand_eod"]) if pd.notna(d.get("on_hand_eod")) else None
            ordered = float(d["ordered_qty"]) if pd.notna(d.get("ordered_qty")) else None
            delivered = float(d["delivered_qty"]) if pd.notna(d.get("delivered_qty")) else None
            sold = float(d["sold_qty"]) if pd.notna(d.get("sold_qty")) else None
            waste = float(d["waste_qty"]) if pd.notna(d.get("waste_qty")) else None
            stockout = float(d["stockout_minutes"]) if pd.notna(d.get("stockout_minutes")) else None
            dos = float(d["days_of_supply"]) if pd.notna(d.get("days_of_supply")) else None
            str_val = float(d["sell_through_rate"]) if pd.notna(d.get("sell_through_rate")) else None
            inv_turn = float(d["inventory_turnover"]) if pd.notna(d.get("inventory_turnover")) else None

            records.append((
                str(d.get("store_id", "")),
                biz_date,
                str(d.get("product_id", "")),
                str(d.get("product_name", "")) if pd.notna(d.get("product_name")) else None,
                str(d.get("category", "")) if pd.notna(d.get("category")) else None,
                on_hand, ordered, delivered, sold, waste, stockout, dos, str_val, inv_turn,
            ))
            total_loaded += 1

        if records:
            await conn.executemany(
                f"""INSERT INTO {GOLD_SCHEMA}.new_inventory_risk_day_gold
                   (store_id, biz_date, product_id, product_name, category,
                    on_hand_eod, ordered_qty, delivered_qty, sold_qty, waste_qty,
                    stockout_minutes, days_of_supply, sell_through_rate, inventory_turnover)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                   ON CONFLICT (store_id, biz_date, product_id)
                   DO UPDATE SET product_name = EXCLUDED.product_name""",
                records,
            )
        print(f"  Progress: {min(start + chunk_size, total)}/{total}...")

    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_inv_risk_gold_store_date
        ON {GOLD_SCHEMA}.new_inventory_risk_day_gold (store_id, biz_date)
    """)
    print(f"  Loaded {total_loaded} rows")


async def load_kpi_gold(conn):
    print("=== new_kpi_store_day_gold ===")
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
    cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_kpi_store_day_gold")
    print(f"  Aggregated: {cnt} rows")


async def load_production_gold(conn, store):
    print("=== new_production ===")
    prod_day = store.get("production_day")
    if prod_day is None or len(prod_day) == 0:
        print("  SKIPPED - empty")
        return

    print(f"  production_day: {len(prod_day)} rows")

    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_production")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_production (
            masked_stor_cd text NOT NULL,
            prod_dt date NOT NULL,
            prod_dgre text,
            item_cd text NOT NULL,
            item_nm text,
            prod_qty numeric DEFAULT 0,
            prod_qty_2 numeric DEFAULT 0,
            prod_qty_3 numeric DEFAULT 0,
            reprod_qty numeric DEFAULT 0,
            registered_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (masked_stor_cd, prod_dt, item_cd, prod_dgre)
        )
    """)

    chunk_size = 5000
    total = len(prod_day)
    total_loaded = 0

    for start in range(0, total, chunk_size):
        chunk = prod_day.iloc[start:start + chunk_size]
        records = []
        for _, r in chunk.iterrows():
            d = r.to_dict()
            prod_dt = _to_date(d.get("biz_date"))
            if prod_dt is None:
                continue

            prod_dgre = str(d.get("prod_degree", "1")) if pd.notna(d.get("prod_degree")) else "1"
            prod_qty = int(d.get("produced_qty", 0)) if pd.notna(d.get("produced_qty")) else 0
            reg = _to_ts(d.get("registered_at"))
            upd = _to_ts(d.get("updated_at"))

            records.append((
                str(d.get("store_id", "")),
                prod_dt,
                prod_dgre,
                str(d.get("product_id", "")),
                str(d.get("product_name", "")) if pd.notna(d.get("product_name")) else None,
                prod_qty, 0, 0, 0, reg, upd,
            ))
            total_loaded += 1

        if records:
            await conn.executemany(
                f"""INSERT INTO {GOLD_SCHEMA}.new_production
                   (masked_stor_cd, prod_dt, prod_dgre, item_cd, item_nm,
                    prod_qty, prod_qty_2, prod_qty_3, reprod_qty, registered_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   ON CONFLICT (masked_stor_cd, prod_dt, item_cd, prod_dgre)
                   DO UPDATE SET item_nm = EXCLUDED.item_nm, prod_qty = EXCLUDED.prod_qty,
                                 updated_at = EXCLUDED.updated_at""",
                records,
            )
        print(f"  Progress: {min(start + chunk_size, total)}/{total}...")

    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_production_stor_item
        ON {GOLD_SCHEMA}.new_production (masked_stor_cd, item_cd)
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_production_prod_dt
        ON {GOLD_SCHEMA}.new_production (prod_dt)
    """)
    print(f"  Loaded {total_loaded} rows, indexes created")


async def load_campaign_gold(conn, store):
    print("=== new_campaign_day_gold ===")
    promo = store.get("fact_promo_day")
    if promo is not None and len(promo) > 0:
        print(f"  fact_promo_day: {len(promo)} rows")
        await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_campaign_day_gold")
        await conn.execute(f"""
            CREATE TABLE {GOLD_SCHEMA}.new_campaign_day_gold (
                store_id text NOT NULL,
                biz_date date NOT NULL,
                campaign_id text NOT NULL,
                campaign_name text,
                campaign_type text,
                coupon_cnt numeric,
                coupon_redemption_amt numeric,
                updated_at timestamptz DEFAULT now(),
                PRIMARY KEY (store_id, biz_date, campaign_id)
            )
        """)

        for _, r in promo.iterrows():
            d = r.to_dict()
            biz_date = _to_date(d.get("biz_date"))
            if biz_date is None:
                continue
            await conn.execute(
                f"""INSERT INTO {GOLD_SCHEMA}.new_campaign_day_gold
                   (store_id, biz_date, campaign_id, campaign_name, campaign_type, coupon_cnt, coupon_redemption_amt)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                str(d.get("store_id", "")),
                biz_date,
                str(d.get("campaign_id", "")) if pd.notna(d.get("campaign_id")) else str(d.get("promo_id", "")),
                str(d.get("campaign_name", "")) if pd.notna(d.get("campaign_name")) else str(d.get("promo_name", "")),
                str(d.get("campaign_type", "")) if pd.notna(d.get("campaign_type")) else None,
                float(d["coupon_cnt"]) if pd.notna(d.get("coupon_cnt")) else None,
                float(d["coupon_redemption_amt"]) if pd.notna(d.get("coupon_redemption_amt")) else None,
            )
        cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_campaign_day_gold")
        print(f"  Loaded {cnt} rows")
    else:
        print("  Empty — creating table with 0 rows")
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.new_campaign_day_gold (
                store_id text NOT NULL,
                biz_date date NOT NULL,
                campaign_id text NOT NULL,
                campaign_name text,
                campaign_type text,
                coupon_cnt numeric,
                coupon_redemption_amt numeric,
                updated_at timestamptz DEFAULT now(),
                PRIMARY KEY (store_id, biz_date, campaign_id)
            )
        """)


async def load_dim_product_silver(conn):
    print("=== new_dim_product_silver ===")
    await conn.execute(f"DROP TABLE IF EXISTS {GOLD_SCHEMA}.new_dim_product_silver")
    await conn.execute(f"""
        CREATE TABLE {GOLD_SCHEMA}.new_dim_product_silver (
            product_id text PRIMARY KEY,
            product_name text,
            category text,
            base_price numeric DEFAULT 0,
            cost_price numeric DEFAULT 0
        )
    """)
    await conn.execute(f"""
        INSERT INTO {GOLD_SCHEMA}.new_dim_product_silver (product_id, product_name, category, base_price, cost_price)
        SELECT product_id, product_name, category, base_price, cost_price
        FROM {GOLD_SCHEMA}.dim_product
    """)
    cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_dim_product_silver")
    print(f"  Copied from dim_product: {cnt} rows")


async def verify(conn):
    print("\n=== FINAL VERIFICATION ===")
    tables = [
        "dim_store", "dim_product", "new_dim_product_silver",
        "new_product_sales_day_gold", "new_inventory_risk_day_gold",
        "new_kpi_store_day_gold", "new_production", "new_campaign_day_gold",
    ]
    for tbl in tables:
        try:
            cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.{tbl}")
            print(f"  {tbl}: {cnt} rows")
        except Exception as e:
            print(f"  {tbl}: ERROR - {e}")

    prod_poc = await conn.fetchval(
        f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_production WHERE masked_stor_cd = 'POC_010'"
    )
    print(f"\nPOC_010 production rows: {prod_poc}")
    sales_poc = await conn.fetchval(
        f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_product_sales_day_gold WHERE store_id = 'POC_010'"
    )
    print(f"POC_010 sales rows: {sales_poc}")


async def main():
    print(f"Loading from: {PICKLE_PATH}")
    with open(PICKLE_PATH, "rb") as f:
        store = pickle.load(f)
    print(f"Pickle keys: {list(store.keys())}")

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await load_dim_store(conn, store)
        await load_dim_product(conn, store)
        await load_new_product_sales_day_gold(conn, store)
        await load_inventory_risk_gold(conn, store)
        await load_kpi_gold(conn)
        await load_production_gold(conn, store)
        await load_campaign_gold(conn, store)
        await load_dim_product_silver(conn)
        await verify(conn)
        print("\n=== DONE ===")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())