"""Role-based masking for sensitive fields."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

MASK_KEYS = {"cost", "cost_of_goods", "gross_profit", "margin", "net_profit", "profit"}


def _should_mask(key: str, role: str) -> bool:
    lowered = key.lower()
    if role == "hq_admin":
        return False
    if role == "area_manager":
        return lowered in {"cost", "cost_of_goods"}
    return lowered in MASK_KEYS or lowered.startswith("other_store")


def _mask(data: Any, role: str, prefix: str = "") -> tuple[Any, list[str]]:
    fields: list[str] = []
    if isinstance(data, dict):
        masked = {}
        for key, value in data.items():
            path = f"{prefix}.{key}" if prefix else key
            if _should_mask(key, role):
                masked[key] = "***"
                fields.append(path)
            else:
                masked[key], nested = _mask(value, role, path)
                fields.extend(nested)
        return masked, fields
    if isinstance(data, list):
        masked_list = []
        for idx, item in enumerate(data):
            masked_item, nested = _mask(item, role, f"{prefix}[{idx}]")
            masked_list.append(masked_item)
            fields.extend(nested)
        return masked_list, fields
    return data, fields


class MaskingService:
    """Masks sensitive response fields depending on the caller role."""

    def mask(self, payload: dict | list, role: str) -> tuple[dict | list, list[str]]:
        return _mask(deepcopy(payload), role)
