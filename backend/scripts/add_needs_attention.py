import asyncio, asyncpg

from _db import db_config


async def main():
    conn = await asyncpg.connect(**db_config())
    await conn.execute("ALTER TABLE dunkin_mart_copy.new_inventory_risk_day_gold ADD COLUMN IF NOT EXISTS needs_attention boolean DEFAULT false")
    print("done")
    await conn.close()
asyncio.run(main())
