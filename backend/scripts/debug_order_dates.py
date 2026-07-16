import asyncio, asyncpg
from datetime import date, timedelta

from _db import db_config


async def main():
    conn = await asyncpg.connect(**db_config())

    today = date.today()
    ref_end = today
    start_date = ref_end - timedelta(days=60)

    print(f"reference_end: {ref_end}")
    print(f"start_date: {start_date}")

    rows = await conn.fetch(
        "SELECT DISTINCT biz_date FROM dunkin_mart_copy.new_product_sales_day_gold WHERE store_id=$1 AND biz_date >= $2 AND biz_date <= $3 ORDER BY biz_date",
        'POC_010', start_date, ref_end
    )
    print(f"Dates in window: {[r['biz_date'] for r in rows]}")

    latest = await conn.fetchval("SELECT MAX(biz_date) FROM dunkin_mart_copy.new_product_sales_day_gold WHERE store_id=$1 AND biz_date >= $2 AND biz_date <= $3", 'POC_010', start_date, ref_end)
    print(f"latest_date from SQL: {latest}")

    recent_start = latest - timedelta(days=28)
    print(f"recent_start: {recent_start}")

    targets = ['2026-03-03', '2026-02-24', '2026-02-10']
    for td in targets:
        cd = date.fromisoformat(td)
        raw = await conn.fetchval("SELECT COUNT(*) FROM dunkin_mart_copy.new_product_sales_day_gold WHERE store_id=$1 AND biz_date=$2", 'POC_010', cd)
        in_window = cd >= start_date and cd <= ref_end
        in_recent = cd >= recent_start
        print(f"  {td}: raw_rows={raw}, in_60d_window={in_window}, in_recent={in_recent}")

    print()
    print("=== What _fetch_orderable_sales_rows returns ===")
    # Simulate the full query for 2026-02-26 to 2026-04-27
    sql = """
    WITH app_products AS (
        SELECT product_id,
            NULLIF(product_name, '') AS product_name,
            NULLIF(category, '') AS category,
            base_price
        FROM dunkin_mart.products
    ),
    aggregated AS (
        SELECT
            p.biz_date,
            p.product_id,
            COALESCE(max(ap.product_name), NULLIF(max(p.product_name), ''), p.product_id) AS product_name,
            sum(COALESCE(p.sold_qty, 0)) AS sold_qty,
            sum(COALESCE(p.waste_qty, 0)) AS waste_qty,
            max(COALESCE(p.stockout_minutes, 0)) AS stockout_minutes,
            0 AS base_price,
            sum(COALESCE(NULLIF(p.net_sales_amt, 0), p.sale_amt, 0)) AS sales_amt
        FROM dunkin_mart_copy.new_product_sales_day_gold p
        LEFT JOIN app_products ap ON ap.product_id = p.product_id
        WHERE p.store_id = $1 AND p.biz_date BETWEEN $2 AND $3
        GROUP BY p.biz_date, p.product_id
    )
    SELECT biz_date, product_id, product_name, sold_qty, waste_qty, stockout_minutes, sales_amt
    FROM aggregated
    ORDER BY biz_date, sales_amt DESC
    """
    rows2 = await conn.fetch(sql, 'POC_010', start_date, ref_end)
    print(f"Total aggregated rows: {len(rows2)}")
    dates_in_result = set()
    for r in rows2:
        dates_in_result.add(r['biz_date'])
    print(f"Distinct dates in result: {sorted(dates_in_result)}")
    for td in targets:
        d = date.fromisoformat(td)
        cnt = sum(1 for r in rows2 if r['biz_date'] == d)
        print(f"  Row count for {td}: {cnt}")

    await conn.close()

asyncio.run(main())
