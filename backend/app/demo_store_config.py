"""Canonical demo-store metadata for the 2026-03-05 POC evaluation."""

from __future__ import annotations

from datetime import date, time

DEMO_BIZ_DATE = date(2026, 3, 5)
DEMO_TIME = time(14, 45)

DEMO_PRIMARY_STORE_ID = "POC_010"
DEMO_PRIMARY_STORE_NAME = "강서구01"

DEMO_STORE_NAME_MAP: dict[str, str] = {
    "POC_001": "고양시02",
    "POC_003": "노원구01",
    "POC_009": "마포구02",
    "POC_010": "강서구01",
    "POC_011": "안양시01",
    "POC_012": "마포구01",
    "POC_030": "성남시01",
    "POC_031": "수원시01",
    "POC_032": "여수시01",
    "POC_033": "고양시01",
}

DEMO_BENCHMARK_COMPARE_STORE_IDS = [
    "POC_001",  # 고양시02
    "POC_011",  # 안양시01
    "POC_030",  # 성남시01
    "POC_031",  # 수원시01
    "POC_012",  # 마포구01
    "POC_009",  # 마포구02
]

DEMO_BENCHMARK_STORE_COUNT = 31
DEMO_ACTIVE_MASTER_STORE_COUNT = 33

HIDDEN_STORE_IDS = {"STORE_001"}


def normalize_store_id(store_id: str | None) -> str:
    return str(store_id or "").strip().upper()


def is_hidden_store_id(store_id: str | None) -> bool:
    sid = normalize_store_id(store_id)
    return sid in HIDDEN_STORE_IDS or sid.startswith("STORE_")


def canonical_store_name(store_id: str | None, fallback: str | None = None) -> str:
    sid = normalize_store_id(store_id)
    if sid in DEMO_STORE_NAME_MAP:
        return DEMO_STORE_NAME_MAP[sid]
    normalized_fallback = str(fallback or "").strip()
    return normalized_fallback or sid


def canonical_store_record(store: dict | None, fallback_store_id: str | None = None) -> dict | None:
    if store is None:
        return None
    sid = normalize_store_id(store.get("store_id") if isinstance(store, dict) else fallback_store_id)
    if not sid:
        sid = normalize_store_id(fallback_store_id)
    if is_hidden_store_id(sid):
        return None
    cloned = dict(store)
    cloned["store_id"] = sid
    cloned["store_name"] = canonical_store_name(sid, cloned.get("store_name"))
    return cloned
