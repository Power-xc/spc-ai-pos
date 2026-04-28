#!/usr/bin/env python3
"""
Create and populate dunkin_mart_copy.new_campaign_day_gold

This is a placeholder table. Real campaign data isn't in the current source files,
so we create an empty table so the SQL path won't crash on missing relation.
"""

import asyncio
import asyncpg

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5433,
    "database": "foxpos",
    "user": "app_user",
    "password": "app_password",
}

GOLD_SCHEMA = "dunkin_mart_copy"

async def main():
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
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
        print("Created new_campaign_day_gold")

        await conn.execute(f"""
            CREATE INDEX IF NOT EXISTS idx_new_campaign_day_gold_store_date
            ON {GOLD_SCHEMA}.new_campaign_day_gold (store_id, biz_date)
        """)
        print("Created index")

        row_count = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_campaign_day_gold")
        print(f"Row count: {row_count}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
