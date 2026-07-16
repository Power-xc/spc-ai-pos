#!/usr/bin/env python3
"""Create dim_store in dunkin_mart_copy schema from pickle cache."""

import asyncio
import pickle

import asyncpg

from _db import db_config, SEED_PICKLE

DB_CONFIG = db_config()
GOLD = "dunkin_mart_copy"

async def main():
    with open(SEED_PICKLE, "rb") as f:
        data = pickle.load(f)

    ds = data["dim_store"]
    print(f"dim_store: {len(ds)} rows", flush=True)

    conn = await asyncpg.connect(**DB_CONFIG)

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS {0}.dim_store (
            store_id text NOT NULL,
            store_name text,
            region text,
            city text,
            updated_at timestamptz DEFAULT now(),
            PRIMARY KEY (store_id)
        )
    """.format(GOLD))

    params = []
    for _, r in ds.iterrows():
        params.append((str(r["store_id"]), str(r.get("store_name", "") or ""), str(r.get("region", "") or ""), str(r.get("city", "") or "")))

    batch = 50
    for i in range(0, len(params), batch):
        b = params[i:i+batch]
        await conn.executemany("INSERT INTO {0}.dim_store (store_id, store_name, region, city) VALUES ($1, $2, $3, $4) ON CONFLICT (store_id) DO UPDATE SET store_name = EXCLUDED.store_name, region = EXCLUDED.region, city = EXCLUDED.city, updated_at = now()".format(GOLD), b)

    cnt = await conn.fetchval("SELECT COUNT(*) FROM {0}.dim_store".format(GOLD))
    print(f"  dim_store loaded: {cnt}", flush=True)

    for t in ["new_product_sales_day_gold", "new_kpi_store_day_gold", "new_inventory_risk_day_gold", "dim_store", "dim_product", "new_dim_product_silver", "new_campaign_day_gold"]:
        c = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD}.{t}")
        print(f"  {t}: {c}", flush=True)

    await conn.close()

asyncio.run(main())
