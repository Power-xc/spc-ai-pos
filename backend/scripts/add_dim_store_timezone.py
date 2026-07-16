#!/usr/bin/env python3
import asyncio, asyncpg

from _db import db_config


async def main():
    conn = await asyncpg.connect(**db_config())
    await conn.execute("ALTER TABLE dunkin_mart_copy.dim_store ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Seoul'")
    cnt = await conn.fetchval("SELECT COUNT(*) FROM dunkin_mart_copy.dim_store")
    cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='dunkin_mart_copy' AND table_name='dim_store' ORDER BY ordinal_position")
    print(f"dim_store: {cnt} rows", flush=True)
    print(f"columns: {[c['column_name'] for c in cols]}", flush=True)
    await conn.close()
asyncio.run(main())
