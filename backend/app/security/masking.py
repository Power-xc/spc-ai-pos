"""Sensitive-data masking helpers."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

SENSITIVE_FIELDS = {
    "revenue",
    "profit",
    "cost",
    "margin",
    "production_qty",
    "store_performance",
}


def _should_mask(field_name: str, role: str) -> bool:
    normalized = field_name.lower()
    if role == "hq_admin":
        return False
    if normalized.startswith("competitor_store_"):
        return role == "store_owner"
    if role == "area_manager":
        return "cost" in normalized
    return (
        normalized in SENSITIVE_FIELDS
        or "revenue" in normalized
        or "profit" in normalized
        or "margin" in normalized
        or "cost" in normalized
        or normalized.startswith("competitor_store_")
        or normalized.startswith("store_performance")
    )


def _mask_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return "***"
    return None


def _mask_recursive(data: Any, role: str, path: str = "") -> tuple[Any, list[str]]:
    masked_fields: list[str] = []
    if isinstance(data, dict):
        masked: dict[str, Any] = {}
        for key, value in data.items():
            current_path = f"{path}.{key}" if path else key
            if _should_mask(key, role):
                masked[key] = _mask_value(value)
                masked_fields.append(current_path)
            else:
                masked[key], nested = _mask_recursive(value, role, current_path)
                masked_fields.extend(nested)
        return masked, masked_fields
    if isinstance(data, list):
        masked_list = []
        for index, item in enumerate(data):
            masked_item, nested = _mask_recursive(item, role, f"{path}[{index}]")
            masked_list.append(masked_item)
            masked_fields.extend(nested)
        return masked_list, masked_fields
    return data, masked_fields


def mask_sensitive(data: dict[str, Any], role: str) -> dict[str, Any]:
    """Mask sensitive fields according to the caller role."""
    masked, _ = _mask_recursive(deepcopy(data), role)
    return masked


class DataMaskingService:
    """Mask sensitive operational data before sending it outside the system."""

    def mask(self, data: dict[str, Any], role: str) -> dict[str, Any]:
        return mask_sensitive(data, role)

    def mask_with_details(self, data: dict[str, Any], role: str) -> tuple[dict[str, Any], list[str]]:
        masked, fields = _mask_recursive(deepcopy(data), role)
        return masked, fields
