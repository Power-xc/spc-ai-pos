import asyncio, asyncpg
async def main():
    conn = await asyncpg.connect(host='127.0.0.1', port=5433, database='foxpos', user='app_user', password='app_password')
    await conn.execute("ALTER TABLE dunkin_mart_copy.new_inventory_risk_day_gold ADD COLUMN IF NOT EXISTS needs_attention boolean DEFAULT false")
    print("done")
    await conn.close()
asyncio.run(main())
