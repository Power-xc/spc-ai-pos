"""File-backed local data store for POC mode."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.demo_seed import available_seed_paths, merge_demo_seed_frames


def _parse_yyyymmdd(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series.astype(str), format="%Y%m%d", errors="coerce").dt.normalize()


def _parse_hhmmss(value: Any) -> str | None:
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    digits = digits.zfill(6)[-6:]
    hour = int(digits[:2])
    minute = int(digits[2:4])
    second = int(digits[4:6])
    if hour > 23 or minute > 59 or second > 59:
        return None
    return f"{hour:02d}:{minute:02d}:{second:02d}"


def _parse_korean_datetime(series: pd.Series) -> pd.Series:
    normalized = (
        series.astype(str)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "NaT": pd.NA})
        .dropna()
        .str.replace("오전", "AM", regex=False)
        .str.replace("오후", "PM", regex=False)
        .str.replace(r"\s+", " ", regex=True)
    )
    parsed = pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns]")
    if normalized.empty:
        return parsed
    parsed.loc[normalized.index] = pd.to_datetime(
        normalized,
        format="%Y-%m-%d %p %I:%M:%S",
        errors="coerce",
    )
    return parsed


def _normalize_id(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip()


def _infer_category(name: str) -> str:
    value = str(name or "")
    if any(keyword in value for keyword in ["아메리카노", "라떼", "커피", "콜드브루", "에이드", "티", "쉐이크", "스무디", "음료"]):
        return "음료"
    if any(keyword in value for keyword in ["베이글", "샌드", "머핀", "쿠키", "브레드", "핫도그", "브리또", "토스트", "와플"]):
        return "푸드"
    if any(keyword in value for keyword in ["케이크", "타르트"]):
        return "케이크"
    return "도넛"


@dataclass
class LocalDataStore:
    """Normalized POC dataset loaded directly from local Excel/CSV files."""

    CACHE_VERSION = 4

    data_dir: str
    demo_mode: bool = False
    demo_seed_dir: str | None = None
    dim_store: pd.DataFrame = field(init=False)
    dim_product: pd.DataFrame = field(init=False)
    fact_inventory_day: pd.DataFrame = field(init=False)
    fact_sales_item_daily: pd.DataFrame = field(init=False)
    fact_promo_day: pd.DataFrame = field(init=False)
    production_day: pd.DataFrame = field(init=False)
    order_day: pd.DataFrame = field(init=False)
    payment_code_table: pd.DataFrame = field(init=False)
    ai_insight_rows: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        base_dir = Path(self.data_dir).expanduser().resolve()
        if not base_dir.exists():
            raise FileNotFoundError(f"DATA_DIR does not exist: {base_dir}")
        self.data_dir = str(base_dir)
        if self.demo_seed_dir is None:
            self.demo_seed_dir = str((base_dir / "demo_seed").resolve())
        self._load()

    def _load(self) -> None:
        store_path = Path(self.data_dir) / "01. 점포 마스터" / "던킨+점포마스터_매핑용.xlsx"
        inventory_path = Path(self.data_dir) / "06. 재고" / "재고 데이터 추출.xlsx"
        production_path = Path(self.data_dir) / "04. 생산" / "생산 데이터 추출.xlsx"
        order_path = Path(self.data_dir) / "05. 주문" / "주문+데이터.xlsx"
        payment_code_path = (
            Path(self.data_dir) / "03. 결제 수단 코드" / "결제_할인+수단+코드+테이블.csv"
        )
        source_paths = {
            "store_path": store_path,
            "inventory_path": inventory_path,
            "production_path": production_path,
            "order_path": order_path,
            "payment_code_path": payment_code_path,
        }
        if self.demo_mode:
            source_paths |= {
                f"seed_{name}": path
                for name, path in available_seed_paths(self.demo_seed_dir).items()
            }

        if self._load_from_cache(source_paths):
            return
        if self.demo_mode and self._load_demo_from_base_cache(source_paths):
            return

        stores = pd.read_excel(
            store_path,
            usecols=[
                "MASKED_STOR_CD",
                "MAKED_STOR_NM",
                "시도",
                "지역",
            ],
        ).rename(
            columns={
                "MASKED_STOR_CD": "store_id",
                "MAKED_STOR_NM": "store_name",
                "시도": "region",
                "지역": "city",
            }
        )
        stores["store_id"] = _normalize_id(stores["store_id"])
        stores["store_name"] = stores["store_name"].astype(str).str.strip()
        stores["region"] = stores["region"].astype(str).str.strip()
        stores["city"] = stores["city"].astype(str).str.strip()
        self.dim_store = stores.drop_duplicates("store_id").sort_values("store_id").reset_index(drop=True)

        inventory = pd.read_excel(
            inventory_path,
            usecols=[
                "MASKED_STOR_CD",
                "MASKED_STOR_NM",
                "STOCK_DT",
                "ITEM_CD",
                "ITEM_NM",
                "GI_QTY",
                "DISUSE_QTY",
                "SALE_QTY",
                "COST",
                "SALE_PRC",
                "STOCK_QTY",
                "LAST_SALE_DT",
                "REG_DATE",
            ],
        ).rename(
            columns={
                "MASKED_STOR_CD": "store_id",
                "MASKED_STOR_NM": "store_name",
                "STOCK_DT": "biz_date",
                "ITEM_CD": "product_id",
                "ITEM_NM": "product_name",
                "GI_QTY": "opening_qty",
                "DISUSE_QTY": "waste_qty",
                "SALE_QTY": "sold_qty",
                "COST": "cost_price",
                "SALE_PRC": "base_price",
                "STOCK_QTY": "on_hand_eod",
            }
        )
        inventory["store_id"] = _normalize_id(inventory["store_id"])
        inventory["product_id"] = _normalize_id(inventory["product_id"])
        inventory["biz_date"] = _parse_yyyymmdd(inventory["biz_date"])
        inventory["last_sale_time"] = inventory.get("LAST_SALE_DT", pd.Series(dtype=object)).map(_parse_hhmmss)
        inventory["registered_at"] = _parse_korean_datetime(
            inventory.get("REG_DATE", pd.Series(pd.NA, index=inventory.index))
        )
        inventory["product_name"] = inventory["product_name"].astype(str).str.strip()
        inventory["category"] = inventory["product_name"].map(_infer_category)

        numeric_cols = ["opening_qty", "waste_qty", "sold_qty", "cost_price", "base_price", "on_hand_eod"]
        for column in numeric_cols:
            inventory[column] = pd.to_numeric(inventory[column], errors="coerce").fillna(0.0)

        inventory["stockout_minutes"] = 0
        inventory.loc[(inventory["on_hand_eod"] <= 0) & (inventory["sold_qty"] > 0), "stockout_minutes"] = 60
        inventory.loc[
            (inventory["stockout_minutes"] == 0)
            & (inventory["on_hand_eod"] <= 2)
            & (inventory["sold_qty"] >= inventory["opening_qty"] * 0.8),
            "stockout_minutes",
        ] = 20
        inventory["reorder_triggered"] = (inventory["on_hand_eod"] <= 0).astype(int)
        inventory["sales_amt"] = (inventory["sold_qty"] * inventory["base_price"]).round(2)

        self.fact_inventory_day = inventory[
            [
                "store_id",
                "store_name",
                "biz_date",
                "product_id",
                "product_name",
                "category",
                "on_hand_eod",
                "sold_qty",
                "waste_qty",
                "stockout_minutes",
                "reorder_triggered",
                "base_price",
                "cost_price",
                "sales_amt",
                "last_sale_time",
                "registered_at",
            ]
        ].sort_values(["store_id", "biz_date", "product_id"]).reset_index(drop=True)

        self.fact_sales_item_daily = self.fact_inventory_day[
            ["store_id", "biz_date", "product_id", "sold_qty", "sales_amt", "category", "product_name"]
        ].rename(columns={"sold_qty": "sales_qty"})

        production = pd.read_excel(
            production_path,
            usecols=[
                "MASKED_STOR_CD",
                "MASKED_STOR_NM",
                "PROD_DT",
                "PROD_DGRE",
                "ITEM_CD",
                "ITEM_NM",
                "PROD_QTY",
                "PROD_QTY_2",
                "PROD_QTY_3",
                "REPROD_QTY",
                "ITEM_COST",
                "SALE_PRC",
                "REG_DATE",
                "UPD_DATE",
            ],
        ).rename(
            columns={
                "MASKED_STOR_CD": "store_id",
                "MASKED_STOR_NM": "store_name",
                "PROD_DT": "biz_date",
                "PROD_DGRE": "prod_degree",
                "ITEM_CD": "product_id",
                "ITEM_NM": "product_name",
                "ITEM_COST": "cost_price",
                "SALE_PRC": "base_price",
            }
        )
        production["store_id"] = _normalize_id(production["store_id"])
        production["product_id"] = _normalize_id(production["product_id"])
        production["biz_date"] = _parse_yyyymmdd(production["biz_date"])
        production["registered_at"] = _parse_korean_datetime(production["REG_DATE"])
        production["updated_at"] = _parse_korean_datetime(production["UPD_DATE"])
        production["product_name"] = production["product_name"].astype(str).str.strip()
        for column in ["PROD_QTY", "PROD_QTY_2", "PROD_QTY_3", "REPROD_QTY", "cost_price", "base_price"]:
            production[column] = pd.to_numeric(production[column], errors="coerce").fillna(0.0)
        production["produced_qty"] = (
            production["PROD_QTY"]
            + production["PROD_QTY_2"]
            + production["PROD_QTY_3"]
            + production["REPROD_QTY"]
        )
        self.production_day = production[
            [
                "store_id",
                "store_name",
                "biz_date",
                "prod_degree",
                "product_id",
                "product_name",
                "produced_qty",
                "base_price",
                "cost_price",
                "registered_at",
                "updated_at",
            ]
        ].sort_values(["store_id", "biz_date", "prod_degree", "product_id"]).reset_index(drop=True)

        order_data = pd.read_excel(
            order_path,
            sheet_name="Sheet1",
            usecols=[
                "DLV_DT",
                "MASKED_STOR_CD",
                "MASKED_STOR_NM",
                "ORD_GRP_NM",
                "ORD_DGRE",
                "ORD_DGRE_NM",
                "ITEM_CD",
                "ITEM_NM",
                "ORD_PRC",
                "ORD_QTY",
                "ORD_AMT",
                "CONFRM_QTY",
                "CONFRM_AMT",
                "ORD_REC_QTY",
                "AUTO_ORD_YN",
            ],
        ).rename(
            columns={
                "DLV_DT": "biz_date",
                "MASKED_STOR_CD": "store_id",
                "MASKED_STOR_NM": "store_name",
                "ORD_GRP_NM": "order_group_name",
                "ORD_DGRE": "order_degree",
                "ORD_DGRE_NM": "order_degree_name",
                "ITEM_CD": "product_id",
                "ITEM_NM": "product_name",
                "ORD_PRC": "order_unit_price",
                "ORD_QTY": "order_qty",
                "ORD_AMT": "order_amt",
                "CONFRM_QTY": "confirmed_qty",
                "CONFRM_AMT": "confirmed_amt",
                "ORD_REC_QTY": "recommended_qty",
                "AUTO_ORD_YN": "auto_order_yn",
            }
        )
        order_data["store_id"] = _normalize_id(order_data["store_id"])
        order_data["product_id"] = _normalize_id(order_data["product_id"])
        order_data["biz_date"] = _parse_yyyymmdd(order_data["biz_date"])
        order_data["product_name"] = order_data["product_name"].astype(str).str.strip()
        order_data["category"] = order_data["product_name"].map(_infer_category)
        for column in [
            "order_degree",
            "order_unit_price",
            "order_qty",
            "order_amt",
            "confirmed_qty",
            "confirmed_amt",
            "recommended_qty",
            "auto_order_yn",
        ]:
            order_data[column] = pd.to_numeric(order_data[column], errors="coerce").fillna(0.0)
        order_data["effective_order_qty"] = order_data["confirmed_qty"].where(
            order_data["confirmed_qty"] > 0,
            order_data["order_qty"],
        )
        order_data["effective_order_amt"] = order_data["confirmed_amt"].where(
            order_data["confirmed_amt"] > 0,
            order_data["order_amt"],
        )
        self.order_day = order_data[
            [
                "store_id",
                "store_name",
                "biz_date",
                "order_group_name",
                "order_degree",
                "order_degree_name",
                "product_id",
                "product_name",
                "category",
                "order_unit_price",
                "order_qty",
                "order_amt",
                "confirmed_qty",
                "confirmed_amt",
                "recommended_qty",
                "effective_order_qty",
                "effective_order_amt",
                "auto_order_yn",
            ]
        ].sort_values(["store_id", "biz_date", "order_degree", "product_id"]).reset_index(drop=True)

        payment_codes = pd.read_csv(payment_code_path, encoding="cp949").rename(
            columns={
                "PAY_DC_GRP_TYPE": "group_type",
                "ENTRY_NM": "group_name",
                "PAY_DC_CD": "code",
                "PAY_DC_NM": "code_name",
                "PAY_DC_TYPE": "code_type",
                "ENTRY_NM.1": "entry_group_name",
            }
        )
        self.payment_code_table = payment_codes

        if self.demo_mode:
            merge_demo_seed_frames(self, self.demo_seed_dir)

        self._refresh_derived_frames()

        self.fact_promo_day = pd.DataFrame(
            columns=[
                "store_id",
                "biz_date",
                "promo_id",
                "promo_name",
                "promo_sales_lift_est",
                "coupon_cnt",
                "coupon_redemption_amt",
            ]
        )
        self._save_cache(source_paths)

    def _cache_dir(self) -> Path:
        return Path(self.data_dir) / ".cache"

    def _cache_payload_path(self) -> Path:
        return self._cache_dir() / "local_data_store.pkl"

    def _cache_meta_path(self) -> Path:
        return self._cache_dir() / "local_data_store.meta.json"

    def _build_source_signature(self, source_paths: dict[str, Path]) -> dict[str, dict[str, Any]]:
        signature: dict[str, dict[str, Any]] = {
            "__cache_version__": {"value": self.CACHE_VERSION},
            "__demo_mode__": {"value": self.demo_mode},
            "__demo_seed_dir__": {"value": self.demo_seed_dir},
        }
        for name, path in source_paths.items():
            stat = path.stat()
            signature[name] = {
                "path": str(path),
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        return signature

    def _load_from_cache(self, source_paths: dict[str, Path]) -> bool:
        cache_payload_path = self._cache_payload_path()
        cache_meta_path = self._cache_meta_path()
        if not cache_payload_path.exists() or not cache_meta_path.exists():
            return False

        try:
            cached_meta = json.loads(cache_meta_path.read_text(encoding="utf-8"))
            current_meta = self._build_source_signature(source_paths)
            if cached_meta != current_meta:
                return False

            payload = pd.read_pickle(cache_payload_path)
            self.dim_store = payload["dim_store"]
            self.dim_product = payload["dim_product"]
            self.fact_inventory_day = payload["fact_inventory_day"]
            self.fact_sales_item_daily = payload["fact_sales_item_daily"]
            self.fact_promo_day = payload["fact_promo_day"]
            self.production_day = payload["production_day"]
            self.order_day = payload["order_day"]
            self.payment_code_table = payload["payment_code_table"]
            self.ai_insight_rows = payload.get("ai_insight_rows", [])
            return True
        except Exception:
            return False

    def _save_cache(self, source_paths: dict[str, Path]) -> None:
        cache_dir = self._cache_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "dim_store": self.dim_store,
            "dim_product": self.dim_product,
            "fact_inventory_day": self.fact_inventory_day,
            "fact_sales_item_daily": self.fact_sales_item_daily,
            "fact_promo_day": self.fact_promo_day,
            "production_day": self.production_day,
            "order_day": self.order_day,
            "payment_code_table": self.payment_code_table,
            "ai_insight_rows": self.ai_insight_rows,
        }
        pd.to_pickle(payload, self._cache_payload_path())
        self._cache_meta_path().write_text(
            json.dumps(self._build_source_signature(source_paths), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _refresh_derived_frames(self) -> None:
        self.fact_inventory_day["store_id"] = self.fact_inventory_day["store_id"].astype(str).str.strip()
        self.fact_inventory_day["product_id"] = self.fact_inventory_day["product_id"].astype(str).str.strip()
        self.production_day["store_id"] = self.production_day["store_id"].astype(str).str.strip()
        self.production_day["product_id"] = self.production_day["product_id"].astype(str).str.strip()
        self.order_day["store_id"] = self.order_day["store_id"].astype(str).str.strip()
        self.order_day["product_id"] = self.order_day["product_id"].astype(str).str.strip()
        self.fact_inventory_day["biz_date"] = pd.to_datetime(
            self.fact_inventory_day["biz_date"], errors="coerce"
        )
        self.fact_sales_item_daily = self.fact_inventory_day[
            ["store_id", "biz_date", "product_id", "sold_qty", "sales_amt", "category", "product_name"]
        ].rename(columns={"sold_qty": "sales_qty"})
        product_union = pd.concat(
            [
                self.fact_inventory_day[
                    ["product_id", "product_name", "category", "base_price", "cost_price"]
                ],
                self.production_day[
                    ["product_id", "product_name", "base_price", "cost_price"]
                ].assign(category=lambda frame: frame["product_name"].map(_infer_category)),
                self.order_day[
                    ["product_id", "product_name", "category", "order_unit_price"]
                ].rename(columns={"order_unit_price": "base_price"}).assign(cost_price=pd.NA),
            ],
            ignore_index=True,
        )
        self.dim_product = (
            product_union.groupby("product_id", as_index=False)
            .agg(
                product_name=("product_name", "first"),
                category=("category", "first"),
                base_price=("base_price", "mean"),
                cost_price=("cost_price", "mean"),
            )
            .assign(
                is_core_menu=1,
                is_seasonal=0,
                base_price=lambda frame: pd.to_numeric(
                    frame["base_price"], errors="coerce"
                ).fillna(0).round(2),
                cost_price=lambda frame: pd.to_numeric(
                    frame["cost_price"], errors="coerce"
                ).fillna(0).round(2),
            )
            .sort_values("product_id")
            .reset_index(drop=True)
        )

    def _load_demo_from_base_cache(self, source_paths: dict[str, Path]) -> bool:
        payload = self._load_cached_payload(ignore_signature=True)
        if payload is None:
            return False
        self._hydrate_payload(payload)
        merge_demo_seed_frames(self, self.demo_seed_dir)
        self._refresh_derived_frames()
        self._save_cache(source_paths)
        return True

    def _hydrate_payload(self, payload: dict[str, Any]) -> None:
        self.dim_store = payload["dim_store"]
        self.dim_product = payload["dim_product"]
        self.fact_inventory_day = payload["fact_inventory_day"]
        self.fact_sales_item_daily = payload["fact_sales_item_daily"]
        self.fact_promo_day = payload["fact_promo_day"]
        self.production_day = payload["production_day"]
        self.order_day = payload["order_day"]
        self.payment_code_table = payload["payment_code_table"]
        self.ai_insight_rows = payload.get("ai_insight_rows", [])

    def _load_cached_payload(self, ignore_signature: bool = False) -> dict[str, Any] | None:
        cache_payload_path = self._cache_payload_path()
        cache_meta_path = self._cache_meta_path()
        if not cache_payload_path.exists() or not cache_meta_path.exists():
            return None
        try:
            if not ignore_signature:
                cached_meta = json.loads(cache_meta_path.read_text(encoding="utf-8"))
                if cached_meta != self._build_source_signature({}):
                    return None
            return pd.read_pickle(cache_payload_path)
        except Exception:
            return None

    def get_store_info(self, store_id: str) -> dict[str, Any] | None:
        rows = self.dim_store[self.dim_store["store_id"] == str(store_id)]
        if rows.empty:
            return None
        row = rows.iloc[0]
        return {
            "store_id": row["store_id"],
            "store_name": row["store_name"],
            "region": row["region"],
            "city": row["city"],
        }

    def lookup_product_id(self, product_name: str) -> str | None:
        needle = str(product_name or "").strip()
        if not needle:
            return None
        rows = self.dim_product[
            self.dim_product["product_name"].str.contains(needle, case=False, na=False)
        ]
        if rows.empty:
            return None
        return str(rows.iloc[0]["product_id"])
