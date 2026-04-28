#!/usr/bin/env python3
"""
Load Gold sales data from pickle cache into PostgreSQL

Usage:
    python scripts/load_gold_sales_day.py --source <path>
    python scripts/load_gold_sales_day.py --source /app/data/seed_data/.cache/local_data_store.pkl
"""

import argparse
import asyncio
import pickle
import sys
from pathlib import Path

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

DRINK_KEYWORDS = [
    "아메리카노", "라떼", "커피", "콜드브루", "에이드", "티",
    "쉐이크", "스무디", "음료", "바닐라", "카라멜", "마키",
    "모카", "카푸치노", "에스프레소", "초코", "코코아",
    "밀키", "프링글스", "팝콘", "콜라", "스프라이트",
    "오트사이드", "캇예스", "밀키스",
]
MISC_KEYWORDS = [
    "베이글", "샌드", "머핀", "쿠키", "브레드", "핫도그",
    "브리또", "토스트", "와플", "케이크", "타르트", "핫샌",
]
MATERIAL_KEYWORDS = [
    "설탕", "우유", "버터", "크림", "치즈", "물티슈", "빨대",
    "뚜껑", "캐리어", "냅킨", "포장", "박스", "세트", "팩",
    "개입", "먼치킨컵", "스푼", "포크", "홀더", "용품",
    "부자재", "컵", "리드", "슬리브", "유산지", "봉투",
    "스트로우", "쇼핑백", "필름", "스티커", "토핑",
    "파우더", "소스", "필드봉투", "필링", "페이스트",
    "베이스", "완제", "쿨라타", "리프레셔", "오링",
    "초콜릿", "티백", "코카", "리드", "약과", "베이글칩",
    "스팀피쳐", "용기", "플레이스", "온습도계", "꼬지",
    "밑지", "트레이", "슬리브", "피", "픽", "고메",
    "코코넛", "듀얼", "반제", "밀키", "오링",
    "그릴", "유산지", "포켓", "볼", "볼빨간",
    "헤이즐넛", "로쉐", "젠틀맨", "볼빨간",
    "후르츠", "산도", "시나몬", "쿠키", "산타",
    "볼", "볼빨간", "두바이", "ST", "쫀득",
    "볼빨간", "헤이즐넛", "로쉐",
]

DONUT_KEYWORDS = [
    "도넛", "그리저", "글레이즈드", "링", "필드", "팝핑",
    "카스텔라", "스마일", "크런치", "크러쉬", "파인",
    "맘모스", "듀얼필드", "빅", "콘버터",
    "허니", "챱슬", "바이츠", "츄이", "꽈배기",
    "올드훼션드", "초코", "카카오", "딸기", "블루베리",
    "메이플", "월넛", "흑임자", "보드카", "크림치즈",
    "보스톤", "바바리안", "먼치킨", "파운드", "바이트",
    "허쉬", "레몬", "밀크티", "잔망루피", "피스타치오",
    "눈사람", "마지", "심슨", "핑크", "하트",
    "망고", "코코넛", "가을밤", "베리", "인러브",
    "카푸치노", "올리브", "소금우유", "꿀고구마",
    "씨앗", "츄이스틱", "딸기필링", "플레인",
    "킷캣", "샌드위치", "두바이", "볼빨간",
    "스트로베리", "헤이즐넛", "로쉐", "두바이",
    "볼", "젠틀맨", "후르츠", "산도", "쿠키",
]


def infer_category(product_name: str, raw_category: str) -> str:
    name = str(product_name or "")
    raw = str(raw_category or "").strip()
    if raw and raw not in ("B", "", "N/A", "제품"):
        raw_lower = raw.lower()
        if "음료" in raw_lower:
            return "음료"
        if "기타" in raw_lower:
            return "기타"
        if "도넛" in raw_lower:
            return "도넛"
        return raw
    if any(kw in name for kw in MATERIAL_KEYWORDS):
        return "B"
    if any(kw in name for kw in DRINK_KEYWORDS):
        return "음료"
    if any(kw in name for kw in MISC_KEYWORDS):
        return "기타"
    return "도넛"


def load_pickle(source_path: str) -> dict:
    with open(source_path, "rb") as f:
        return pickle.load(f)


async def create_schema_and_tables(conn):
    await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {GOLD_SCHEMA}")

    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.new_product_sales_day_gold (
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

    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.dim_product (
            product_id text NOT NULL,
            product_name text,
            category text,
            base_price numeric,
            PRIMARY KEY (product_id)
        )
    """)

    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {GOLD_SCHEMA}.new_dim_product_silver (
            product_id text NOT NULL,
            product_name text,
            category text,
            base_price numeric DEFAULT 0,
            cost_price numeric DEFAULT 0,
            PRIMARY KEY (product_id)
        )
    """)

    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_product_sales_day_gold_store_date
        ON {GOLD_SCHEMA}.new_product_sales_day_gold (store_id, biz_date)
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_new_product_sales_day_gold_product
        ON {GOLD_SCHEMA}.new_product_sales_day_gold (product_id)
    """)

    print("Schema and tables created")


async def load_product_sales_day_gold(conn, fact_inv: pd.DataFrame):
    await conn.execute(f"TRUNCATE {GOLD_SCHEMA}.new_product_sales_day_gold")

    fact_inv["product_name"] = fact_inv["product_name"].fillna("").astype(str)
    fact_inv["category"] = fact_inv.apply(
        lambda r: infer_category(r.get("product_name", ""), r.get("category", "")),
        axis=1,
    )

    total = len(fact_inv)
    print(f"  Total rows to insert: {total}")

    sql = f"""
        INSERT INTO {GOLD_SCHEMA}.new_product_sales_day_gold (
            store_id, biz_date, product_id, product_name, category,
            sold_qty, sale_amt, discount_amt, net_sales_amt,
            waste_qty, stockout_minutes, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        ON CONFLICT (store_id, biz_date, product_id)
        DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = EXCLUDED.category,
            sold_qty = EXCLUDED.sold_qty,
            sale_amt = EXCLUDED.sale_amt,
            net_sales_amt = EXCLUDED.net_sales_amt,
            waste_qty = EXCLUDED.waste_qty,
            stockout_minutes = EXCLUDED.stockout_minutes,
            updated_at = now()
    """
    exec_params = [
        (
            str(r.get("store_id", "")),
            _date_val(r.get("biz_date")),
            str(r.get("product_id", "")),
            (str(r.get("product_name", ""))[:200]),
            (str(r.get("category", ""))[:100]),
            _num(r.get("sold_qty")),
            _num(r.get("sales_amt")),
            None,
            _num(r.get("sales_amt")),
            _num(r.get("waste_qty")),
            _num(r.get("stockout_minutes")),
        )
        for _, r in fact_inv.iterrows()
    ]

    await conn.executemany(sql, exec_params)
    print(f"  Inserted {total} rows")
    return total


def _date_val(v):
    if pd.isna(v):
        return None
    if hasattr(v, "date"):
        return v.date()
    try:
        return pd.to_datetime(str(v)).date()
    except Exception:
        return None


def _num(v):
    if pd.isna(v):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


async def load_dim_product(conn, dim_prods: pd.DataFrame):
    await conn.execute(f"TRUNCATE {GOLD_SCHEMA}.dim_product")

    exec_params = [
        (
            str(r.get("product_id", "")),
            (str(r.get("product_name", ""))[:200]),
            (str(r.get("category", ""))[:100]),
            _num(r.get("base_price")),
        )
        for _, r in dim_prods.iterrows()
    ]

    await conn.executemany(f"""
        INSERT INTO {GOLD_SCHEMA}.dim_product
        (product_id, product_name, category, base_price)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (product_id)
        DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = EXCLUDED.category,
            base_price = EXCLUDED.base_price
    """, exec_params)

    print(f"  dim_product: {len(exec_params)} rows")


async def load_new_dim_product_silver(conn, dim_prods: pd.DataFrame):
    await conn.execute(f"TRUNCATE {GOLD_SCHEMA}.new_dim_product_silver")

    exec_params = [
        (
            str(r.get("product_id", "")),
            (str(r.get("product_name", ""))[:200]),
            (str(r.get("category", ""))[:100]),
            _num(r.get("base_price")),
            _num(r.get("cost_price")),
        )
        for _, r in dim_prods.iterrows()
    ]

    await conn.executemany(f"""
        INSERT INTO {GOLD_SCHEMA}.new_dim_product_silver
        (product_id, product_name, category, base_price, cost_price)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id)
        DO UPDATE SET
            product_name = EXCLUDED.product_name,
            category = EXCLUDED.category,
            base_price = EXCLUDED.base_price,
            cost_price = EXCLUDED.cost_price
    """, exec_params)

    print(f"  new_dim_product_silver: {len(exec_params)} rows")


async def verify(conn):
    total = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_product_sales_day_gold")
    print(f"\nTotal new_product_sales_day_gold rows: {total}")

    poc_010_total = await conn.fetchval(
        f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_product_sales_day_gold WHERE store_id = 'POC_010'"
    )
    print(f"POC_010 rows: {poc_010_total}")

    rows = await conn.fetch(f"""
        SELECT biz_date,
               COUNT(*) AS row_count,
               COUNT(DISTINCT product_id) AS products,
               SUM(sold_qty)::int AS total_sold,
               SUM(sale_amt)::int AS total_sale_amt,
               SUM(waste_qty)::int AS total_waste
        FROM {GOLD_SCHEMA}.new_product_sales_day_gold
        WHERE store_id = 'POC_010'
          AND biz_date IN ('2026-03-03', '2026-02-24', '2026-02-10')
        GROUP BY biz_date
        ORDER BY biz_date
    """)
    print(f"\n{'biz_date':12} {'rows':6} {'products':10} {'sold_qty':12} {'sale_amt':14} {'waste'}")
    for r in rows:
        print(f"{str(r['biz_date']):12} {r['row_count']:6} {r['products']:10} {r['total_sold']:12} {r['total_sale_amt']:14} {r['total_waste']}")

    cats = await conn.fetch(f"""
        SELECT category, COUNT(*) AS cnt
        FROM {GOLD_SCHEMA}.new_product_sales_day_gold
        WHERE store_id = 'POC_010'
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 10
    """)
    print("\nPOC_010 category distribution:")
    for c in cats:
        print(f"  {c['category']}: {c['cnt']} rows")

    dr = await conn.fetchval(f"""
        SELECT MIN(biz_date) || ' to ' || MAX(biz_date)
        FROM {GOLD_SCHEMA}.new_product_sales_day_gold
        WHERE store_id = 'POC_010'
    """)
    print(f"POC_010 date range: {dr}")

    dp = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.dim_product")
    print(f"\ndim_product rows: {dp}")
    silver = await conn.fetchval(f"SELECT COUNT(*) FROM {GOLD_SCHEMA}.new_dim_product_silver")
    print(f"new_dim_product_silver rows: {silver}")

    await conn.close()


async def main():
    parser = argparse.ArgumentParser(description="Load Gold sales data into PostgreSQL")
    parser.add_argument("--source", required=True, help="Path to pickle cache")
    args = parser.parse_args()

    print(f"Loading from: {args.source}")
    data = load_pickle(args.source)
    print(f"Pickle keys: {list(data.keys())}")

    fact_inv = data.get("fact_inventory_day")
    if fact_inv is None:
        print("ERROR: fact_inventory_day not found")
        sys.exit(1)
    print(f"fact_inventory_day: {len(fact_inv)} rows, cols: {list(fact_inv.columns)}")

    dim_prods = data.get("dim_product")
    if dim_prods is None:
        print("ERROR: dim_product not found")
        sys.exit(1)
    print(f"dim_product: {len(dim_prods)} rows")

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await create_schema_and_tables(conn)

        print("\nLoading new_product_sales_day_gold ...")
        await load_product_sales_day_gold(conn, fact_inv)

        print("\nLoading dim_product ...")
        await load_dim_product(conn, dim_prods)

        print("\nLoading new_dim_product_silver ...")
        await load_new_dim_product_silver(conn, dim_prods)

        print("\nVerifying ...")
        await verify(conn)

        print("\nDone!")
    except Exception:
        await conn.close()
        raise


if __name__ == "__main__":
    asyncio.run(main())
