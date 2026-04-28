#!/usr/bin/env python3
"""Load new_production Gold table from pickle cache into PostgreSQL."""

import asyncio
import pickle
from datetime import date as date_type, datetime

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


def _fmt_date(v) -> str:
    if hasattr(v, "date"):
        return v.date().isoformat()
    if isinstance(v, date_type):
        return v.isoformat()
    return ""


def _fmt_dt(v):
    if pd.notna(v) and hasattr(v, "to_pydatetime"):
        dt = v.to_pydatetime()
        if dt.tzinfo is None:
            from datetime import timezone as tz
            dt = dt.replace(tzinfo=tz.utc)
        return dt.isoformat()
    return "null"


async def main():
    with open(PICKLE_PATH, "rb") as f:
        store = pickle.load(f)

    df = store.get("production_day")
    if df is None:
        print("ERROR: production_day not found in pickle")
        return
    print(f"production_day: {len(df)} rows")

    # Build pipe-delimited text for COPY
    lines = []
    for _, row in df.iterrows():
        prod_dgre = str(row.get("prod_degree", "1")) if pd.notna(row.get("prod_degree")) else "1"
        date_str = _fmt_date(row.get("biz_date"))
        reg_str = _fmt_dt(row.get("registered_at"))
        upd_str = _fmt_dt(row.get("updated_at"))
        prod_qty = int(row.get("produced_qty", 0)) if pd.notna(row.get("produced_qty")) else 0
        item_nm = str(row.get("product_name", "")) if pd.notna(row.get("product_name")) else ""

        # Escape pipe in item name
        item_nm = item_nm.replace("|", "\\|")

        line = "|".join([
            str(row.get("store_id", "")),
            date_str,
            prod_dgre,
            str(row.get("product_id", "")),
            item_nm,
            str(prod_qty),
            reg_str,
            upd_str,
        ])
        lines.append(line)

    csv_data = "\n".join(lines) + "\n"
    tmp_path = "/tmp/production_import.tsv"
    with open(tmp_path, "w") as f:
        f.write(csv_data)
    print(f"Wrote {len(lines)} rows to {tmp_path}")

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.new_production (
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
        print(f"Created/verified {GOLD_SCHEMA}.new_production table")

        await conn.execute(f"TRUNCATE {GOLD_SCHEMA}.new_production")

        await conn.execute(f"""
            COPY {GOLD_SCHEMA}.new_production
                (masked_stor_cd, prod_dt, prod_dgre, item_cd, item_nm, prod_qty,
                 registered_at, updated_at)
            FROM '{tmp_path}'
            WITH (FORMAT text, DELIMITER '|', NULL 'null')
        """)
        print("COPY complete")

        await conn.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_new_production_stor_item
            ON {GOLD_SCHEMA}.new_production (masked_stor_cd, item_cd)
        """)
        await conn.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_new_production_prod_dt
            ON {GOLD_SCHEMA}.new_production (prod_dt)
        """)
        print("Indexes created")

        count = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_production")
        print(f"\nVerification: {count} rows")

        sample = await conn.fetch(f"""
            SELECT masked_stor_cd, prod_dt, prod_dgre, item_cd, item_nm, prod_qty
            FROM {GOLD_SCHEMA}.new_production
            ORDER BY prod_dt DESC LIMIT 5
        """)
        for r in sample:
            nm = str(r['item_nm'])[:30]
            print(f"  {r['masked_stor_cd']} | {r['prod_dt']} | {r['prod_dgre']} | {r['item_cd']} | {nm} | {r['prod_qty']}")

        poc010 = await conn.fetchval(
            f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_production WHERE masked_stor_cd = 'POC_010'"
        )
        print(f"\nPOC_010 rows: {poc010}")

        dr = await conn.fetchval(
            f"""SELECT MIN(prod_dt)::text || ' to ' || MAX(prod_dt)::text
                FROM {GOLD_SCHEMA}.new_production WHERE masked_stor_cd = 'POC_010'"""
        )
        print(f"POC_010 date range: {dr}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())