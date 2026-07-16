"""Helpers for chat latency/trace instrumentation."""

from __future__ import annotations

from datetime import UTC, datetime
from time import perf_counter
from typing import Any


TRACE_STAGE_KEYS = (
    "total_ms",
    "classify_ms",
    "recent_messages_ms",
    "route_ms",
    "domain_service_ms",
    "db_ms",
    "llm_ms",
    "response_map_ms",
    "suggested_questions_ms",
    "sales_sql_ms",
    "order_options_fetch_ms",
    "order_recent_history_ms",
    "actions_todo_fetch_ms",
    "action_cards_build_ms",
    "order_confirm_prepare_ms",
    "order_confirm_execute_ms",
)


def now_counter() -> float:
    """Return monotonic counter value for latency measurement."""
    return perf_counter()


def elapsed_ms(started_at: float) -> float:
    """Return elapsed milliseconds since the given monotonic counter value."""
    return max((perf_counter() - started_at) * 1000.0, 0.0)


def new_trace(
    *,
    store_id: str,
    session_id: str | None = None,
    current_page: str | None = None,
    page_key: str | None = None,
) -> dict[str, Any]:
    """Create an initialized trace payload for one chat request."""
    payload: dict[str, Any] = {
        key: 0.0 for key in TRACE_STAGE_KEYS
    }
    payload.update(
        {
            "path": None,
            "intent_confidence": None,
            "session_id": session_id,
            "store_id": store_id,
            "current_page": current_page,
            "page_key": page_key,
            "used_llm": False,
            "llm_mode": "none",
            "llm_calls": [],
            "llm_purposes": [],
        }
    )
    return payload


def add_ms(trace: dict[str, Any] | None, key: str, delta_ms: float) -> None:
    """Accumulate elapsed milliseconds for a trace stage."""
    if trace is None:
        return
    trace[key] = max(float(trace.get(key, 0.0)) + max(delta_ms, 0.0), 0.0)


def add_elapsed(trace: dict[str, Any] | None, key: str, started_at: float) -> float:
    """Measure elapsed time and add it to the given trace stage."""
    delta = elapsed_ms(started_at)
    add_ms(trace, key, delta)
    return delta


def add_db_elapsed(trace: dict[str, Any] | None, started_at: float) -> float:
    """Measure elapsed time as DB stage."""
    return add_elapsed(trace, "db_ms", started_at)


def set_field(trace: dict[str, Any] | None, key: str, value: Any) -> None:
    """Set a trace metadata field when trace is present."""
    if trace is None:
        return
    trace[key] = value


def add_llm_call(
    trace: dict[str, Any] | None,
    *,
    purpose: str,
    model: str,
    base_url: str,
    endpoint: str,
    started_at_iso: str,
    ended_at_iso: str,
    llm_ms: float,
    upstream_status: int | None,
    timeout: bool,
    retry_count: int,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
) -> None:
    """Append one LLM call trace and aggregate LLM latency usage."""
    if trace is None:
        return
    add_ms(trace, "llm_ms", llm_ms)
    trace["used_llm"] = True
    llm_calls = trace.setdefault("llm_calls", [])
    llm_calls.append(
        {
            "purpose": purpose,
            "model": model,
            "base_url": base_url,
            "endpoint": endpoint,
            "started_at": started_at_iso,
            "ended_at": ended_at_iso,
            "llm_ms": round(float(llm_ms), 3),
            "upstream_status": upstream_status,
            "timeout": timeout,
            "retry": retry_count > 0,
            "retry_count": retry_count,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "total_tokens": int(total_tokens),
        }
    )
    purposes = trace.setdefault("llm_purposes", [])
    if purpose not in purposes:
        purposes.append(purpose)


def now_iso() -> str:
    """Return UTC timestamp in ISO format for trace events."""
    return datetime.now(UTC).isoformat()


def infer_llm_mode(trace: dict[str, Any] | None) -> str:
    """Infer LLM usage mode for one chat request."""
    if trace is None or not trace.get("used_llm"):
        return "none"
    purposes = set(str(item) for item in (trace.get("llm_purposes") or []))
    summary_only_purposes = {"insight_generation", "explanation_generation"}
    if purposes and purposes.issubset(summary_only_purposes):
        return "summary_only"
    return "full"


def _ms_int(value: Any) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return 0


def response_trace(trace: dict[str, Any] | None, *, include_calls: bool = False) -> dict[str, Any]:
    """Return trace payload shape for API response metadata."""
    if trace is None:
        return {}
    trace["llm_mode"] = infer_llm_mode(trace)
    output = {
        "total_ms": _ms_int(trace.get("total_ms")),
        "classify_ms": _ms_int(trace.get("classify_ms")),
        "recent_messages_ms": _ms_int(trace.get("recent_messages_ms")),
        "route_ms": _ms_int(trace.get("route_ms")),
        "domain_service_ms": _ms_int(trace.get("domain_service_ms")),
        "db_ms": _ms_int(trace.get("db_ms")),
        "llm_ms": _ms_int(trace.get("llm_ms")),
        "response_map_ms": _ms_int(trace.get("response_map_ms")),
        "suggested_questions_ms": _ms_int(trace.get("suggested_questions_ms")),
        "sales_sql_ms": _ms_int(trace.get("sales_sql_ms")),
        "order_options_fetch_ms": _ms_int(trace.get("order_options_fetch_ms")),
        "order_recent_history_ms": _ms_int(trace.get("order_recent_history_ms")),
        "actions_todo_fetch_ms": _ms_int(trace.get("actions_todo_fetch_ms")),
        "action_cards_build_ms": _ms_int(trace.get("action_cards_build_ms")),
        "order_confirm_prepare_ms": _ms_int(trace.get("order_confirm_prepare_ms")),
        "order_confirm_execute_ms": _ms_int(trace.get("order_confirm_execute_ms")),
        "path": trace.get("path"),
        "sub_intent": trace.get("sub_intent"),
        "intent_confidence": trace.get("intent_confidence"),
        "session_id": trace.get("session_id"),
        "store_id": trace.get("store_id"),
        "current_page": trace.get("current_page"),
        "page_key": trace.get("page_key"),
        "used_llm": bool(trace.get("used_llm")),
        "llm_mode": trace.get("llm_mode") or "none",
    }
    if include_calls:
        output["llm_calls"] = list(trace.get("llm_calls") or [])
    return output
