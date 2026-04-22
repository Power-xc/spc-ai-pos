"""Support routers for current 0414 page contracts."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from app.dependencies import (
    get_alert_service,
    get_current_user_context,
    get_current_user_role,
    get_db,
    get_postgres_db,
    get_order_agent,
    get_request_store_id,
)
from app.demo_store_config import (
    DEMO_BIZ_DATE,
    DEMO_BENCHMARK_COMPARE_STORE_IDS,
    DEMO_BENCHMARK_STORE_COUNT,
    canonical_store_name,
    is_hidden_store_id,
)
from app.schemas.common import APIResponse
from app.tools import sql_queries

router = APIRouter(tags=["support"])
BENCHMARK_DEMO_DATE = DEMO_BIZ_DATE
DEFAULT_BENCHMARK_COMPARE_STORES = list(DEMO_BENCHMARK_COMPARE_STORE_IDS)


def _now_iso() -> str:
    return datetime.now().isoformat()


def _format_number(value: float | int | None, suffix: str = "") -> str:
    if value is None:
        return "-"
    numeric = float(value)
    if suffix == "%":
        return f"{numeric:.1f}%"
    return f"{numeric:,.0f}{suffix}"


def _notice_category(source: str) -> str:
    mapping = {
        "inventory_agent": "운영",
        "order_agent": "가격정책",
        "sales_agent": "프로모션",
        "chat_agent": "시스템",
        "system": "시스템",
        "manual": "안내",
    }
    return mapping.get(str(source), "운영")


def _normalize_compare_store_ids(
    store_id: str,
    compare_store_ids: list[str] | None,
) -> list[str]:
    raw_ids = compare_store_ids or list(DEFAULT_BENCHMARK_COMPARE_STORES)
    normalized: list[str] = []
    for value in raw_ids:
        sid = str(value).strip()
        if not sid or is_hidden_store_id(sid) or sid == str(store_id) or sid in normalized:
            continue
        normalized.append(sid)
    return normalized


def _notice_tag(severity: str, source: str) -> str:
    if str(severity).lower() in {"critical", "high"}:
        return "urgent"
    if str(source).lower() in {"manual", "system"}:
        return "공지"
    return "안내"


def _extract_action_items(alert) -> list[str]:
    payload = alert.payload or {}
    items = payload.get("items")
    if isinstance(items, list):
        mapped = []
        for item in items[:3]:
            if isinstance(item, dict):
                name = item.get("product_name") or item.get("name")
                qty = item.get("quantity") or item.get("recommended_qty")
                note = item.get("note")
                parts = [
                    str(value) for value in (name, qty, note) if value not in (None, "")
                ]
                if parts:
                    mapped.append(" / ".join(parts))
            elif item:
                mapped.append(str(item))
        if mapped:
            return mapped

    summary = alert.summary or alert.message
    return [str(summary)] if summary else []


@router.get("/api/v1/notices/board", response_model=APIResponse)
async def get_notice_board(
    request: Request,
    store_id: str | None = Query(default=None),
    role: str = Depends(get_current_user_role),
    alert_service=Depends(get_alert_service),
) -> APIResponse:
    """Return the active notice-board contract.

    There is no dedicated notice master yet, so the board honestly exposes the
    currently persisted operational alerts and marks the rest as integration pending.
    """

    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)

    notice_items: list[dict[str, Any]] = []
    try:
        alerts = await alert_service.list_active_alerts(sid, limit=20)
    except Exception:
        alerts = []

    for index, alert in enumerate(alerts):
        occurred_at = alert.occurred_at or alert.created_at
        notice_items.append(
            {
                "id": str(alert.id),
                "title": alert.title,
                "tag": _notice_tag(alert.severity.value, alert.source.value),
                "category": _notice_category(alert.source.value),
                "date": occurred_at.date().isoformat(),
                "unread": alert.read_at is None,
                "pinned": str(alert.severity.value).lower() in {"critical", "high"},
                "action_required": alert.status.value not in {"resolved", "dismissed"},
                "summary": alert.summary,
                "impact": alert.message or alert.summary,
                "action_items": _extract_action_items(alert),
                "side": "left" if index % 2 == 0 else "right",
                "source": "alerts_ledger",
            }
        )

    unread_count = sum(1 for item in notice_items if item["unread"])
    urgent_count = sum(
        1
        for item in notice_items
        if item["tag"] == "urgent" or item["action_required"]
    )
    action_required_count = sum(1 for item in notice_items if item["action_required"])

    return APIResponse(
        data={
            "status": "active" if notice_items else "integration_pending",
            "data_source": "alerts_ledger" if notice_items else "integration_pending",
            "note": (
                None
                if notice_items
                else "공지 마스터 데이터는 아직 미연동입니다. 현재는 실시간 운영 alert만 게시판에 노출합니다."
            ),
            "summary": {
                "total": len(notice_items),
                "unread": unread_count,
                "urgent": urgent_count,
                "action_required": action_required_count,
            },
            "notice_items": notice_items,
            "basic_items": [],
            "last_updated_at": _now_iso(),
        }
    )


@router.get("/api/v1/ai-validation/summary", response_model=APIResponse)
async def get_ai_validation_summary(
    request: Request,
    store_id: str | None = Query(default=None),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
    order_agent=Depends(get_order_agent),
) -> APIResponse:
    """Return honest readiness/coverage metrics for the AI validation screen."""

    user = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)

    latest_date = await sql_queries.get_latest_biz_date(db, sid)
    target_date = latest_date if latest_date else date.today()
    kpis = await sql_queries.get_daily_kpis(db, sid, target_date)
    category_sales = await sql_queries.get_category_sales(db, sid, target_date, target_date)
    promo_rows = await sql_queries.get_promo_analysis(
        db,
        sid,
        start_date=target_date - timedelta(days=30),
        end_date=target_date,
    )
    order_options = await order_agent.generate_order_options(
        sid,
        user_id=user["user_id"],
        role=user["role"],
    )

    dashboard_score = 100 if (kpis.get("total_sales_amt") or 0) > 0 else 35
    order_score = 100 if len(order_options.options or []) > 0 else 40
    promo_score = 100 if promo_rows else 20

    metrics = [
        {
            "id": "validation-dashboard-coverage",
            "label": "대시보드 실데이터 가용성",
            "score_pct": dashboard_score,
            "color": "#0057a9",
            "status": "active" if dashboard_score >= 100 else "partial",
            "description": "KPI와 일별 매출 지표 연동 상태",
            "note": (
                f"{target_date.isoformat()} 기준 매출 {_format_number(kpis.get('total_sales_amt'), '원')}"
                if dashboard_score >= 100
                else "당일 KPI 데이터가 일부만 확인됩니다."
            ),
        },
        {
            "id": "validation-order-readiness",
            "label": "발주 추천 근거 가용성",
            "score_pct": order_score,
            "color": "#3c8f7c",
            "status": "active" if order_score >= 100 else "partial",
            "description": "추천 주문 옵션 생성 가능 여부",
            "note": (
                f"추천 옵션 {len(order_options.options or [])}개 생성 가능"
                if order_score >= 100
                else "발주 추천 근거가 제한적으로만 준비되어 있습니다."
            ),
        },
        {
            "id": "validation-promo-coverage",
            "label": "프로모션 실적 연동 상태",
            "score_pct": promo_score,
            "color": "#7c5cbf",
            "status": "active" if promo_rows else "integration_pending",
            "description": "프로모션 실적 입력/연동 여부",
            "note": (
                f"최근 30일 프로모션 실적 {len(promo_rows)}건"
                if promo_rows
                else "프로모션 실적 데이터가 아직 입력되지 않았습니다."
            ),
        },
        {
            "id": "validation-category-coverage",
            "label": "카테고리 매출 근거 가용성",
            "score_pct": 100 if category_sales else 30,
            "color": "#f59e0b",
            "status": "active" if category_sales else "partial",
            "description": "카테고리별 실적 비교 데이터",
            "note": (
                f"카테고리 {len(category_sales)}개 집계"
                if category_sales
                else "카테고리별 실적 집계를 확인하지 못했습니다."
            ),
        },
    ]

    return APIResponse(
        data={
            "status": "active",
            "data_source": "analytics + order_agent",
            "note": "정확도 추정치 대신 현재 운영 가능한 실데이터 가용성 지표를 표시합니다.",
            "metrics": metrics,
            "last_updated_at": _now_iso(),
        }
    )


@router.get("/api/v1/benchmarking/summary", response_model=APIResponse)
async def get_benchmark_summary(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    days: int = Query(default=7, ge=1, le=30),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    """Return store-vs-benchmark comparison for the benchmarking page."""

    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    end_date = biz_date
    start_date = end_date - timedelta(days=days - 1)
    summary = await sql_queries.get_benchmark_peer_summary(db, sid, peer_ids, start_date, end_date)

    my_store = summary.get("my_store") or {}
    benchmark = summary.get("benchmark_avg") or {}
    diff_pct = summary.get("diff_pct") or {}

    metrics = [
        {
            "id": "benchmark-sales",
            "category": "일평균 매출",
            "my_store_value": _format_number(my_store.get("daily_avg_sales"), "원"),
            "benchmark_value": _format_number(benchmark.get("daily_avg_sales"), "원"),
            "diff_pct": diff_pct.get("sales"),
            "is_higher": None if diff_pct.get("sales") is None else diff_pct.get("sales") >= 0,
        },
        {
            "id": "benchmark-qty",
            "category": "일평균 판매수량",
            "my_store_value": _format_number(my_store.get("daily_avg_qty")),
            "benchmark_value": _format_number(benchmark.get("daily_avg_qty")),
            "diff_pct": diff_pct.get("qty"),
            "is_higher": None if diff_pct.get("qty") is None else diff_pct.get("qty") >= 0,
        },
        {
            "id": "benchmark-waste",
            "category": "일평균 폐기수량",
            "my_store_value": _format_number(my_store.get("daily_avg_waste")),
            "benchmark_value": _format_number(benchmark.get("daily_avg_waste")),
            "diff_pct": diff_pct.get("waste"),
            "is_higher": None if diff_pct.get("waste") is None else diff_pct.get("waste") < 0,
        },
    ]

    has_data = any(
        metric["my_store_value"] != "-" and metric["benchmark_value"] != "-"
        for metric in metrics
    )

    return APIResponse(
        data={
            "status": "active" if has_data else "no_data",
            "data_source": "dunkin_mart_copy.new_kpi_store_day_gold",
            "note": (
                None
                if has_data
                else "비교 가능한 벤치마킹 데이터가 아직 충분하지 않습니다."
            ),
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "store": {
                "store_id": my_store.get("store_id"),
                "store_name": canonical_store_name(my_store.get("store_id"), my_store.get("store_name")),
            },
            "comparison_scope": "selected_peers",
            "compare_store_ids": peer_ids,
            "compare_stores": summary.get("peers") or [],
            "rank_among_stores": summary.get("rank_among_stores"),
            "total_stores": summary.get("total_stores") or DEMO_BENCHMARK_STORE_COUNT,
            "strengths": summary.get("strengths") or [],
            "risks": summary.get("risks") or [],
            "sales_gap_pct": diff_pct.get("sales"),
            "metrics": metrics,
            "last_updated_at": _now_iso(),
        }
    )


@router.get("/api/v1/benchmarking/hourly-sales", response_model=APIResponse)
async def get_benchmark_hourly_sales(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    rows = await sql_queries.get_benchmark_hourly_sales(db, [sid, *peer_ids], biz_date)
    return APIResponse(
        data={
            "status": "active" if rows else "no_data",
            "data_source": "dunkin_mart_copy.gold__sales_hourly",
            "biz_date": biz_date.isoformat(),
            "stores": rows,
            "note": None if rows else "시간대별 비교 데이터가 없습니다.",
        }
    )


@router.get("/api/v1/benchmarking/top-items", response_model=APIResponse)
async def get_benchmark_top_items(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    days: int = Query(default=1, ge=1, le=30),
    top_n: int = Query(default=5, ge=1, le=10),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    start_date = biz_date - timedelta(days=days - 1)
    rows = await sql_queries.get_benchmark_top_items(db, [sid, *peer_ids], start_date, biz_date, top_n=top_n)
    return APIResponse(
        data={
            "status": "active" if rows else "no_data",
            "data_source": "dunkin_mart_copy.new_product_sales_day_gold",
            "period": {"start": start_date.isoformat(), "end": biz_date.isoformat()},
            "stores": rows,
            "note": None if rows else "상품 비교 데이터가 없습니다.",
        }
    )


@router.get("/api/v1/benchmarking/channel-comparison", response_model=APIResponse)
async def get_benchmark_channel_comparison(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    rows = await sql_queries.get_benchmark_channel_comparison(db, [sid, *peer_ids], biz_date)
    return APIResponse(
        data={
            "status": "active" if rows else "no_data",
            "data_source": "dunkin_mart_copy.new_sales_channel_daily",
            "biz_date": biz_date.isoformat(),
            "stores": rows,
            "note": None if rows else "온/오프라인 비교 데이터가 없습니다.",
        }
    )


@router.get("/api/v1/benchmarking/payment-comparison", response_model=APIResponse)
async def get_benchmark_payment_comparison(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    rows = await sql_queries.get_benchmark_payment_comparison(db, [sid, *peer_ids], biz_date)
    return APIResponse(
        data={
            "status": "active" if rows else "no_data",
            "data_source": "dunkin_mart_copy.new_sales_payment_daily",
            "biz_date": biz_date.isoformat(),
            "stores": rows,
            "note": None if rows else "결제수단 비교 데이터가 없습니다.",
        }
    )


@router.get("/api/v1/benchmarking/promotion-comparison", response_model=APIResponse)
async def get_benchmark_promotion_comparison(
    request: Request,
    store_id: str | None = Query(default=None),
    compare_store_ids: list[str] | None = Query(default=None),
    biz_date: date = Query(default=BENCHMARK_DEMO_DATE),
    role: str = Depends(get_current_user_role),
    db=Depends(get_postgres_db),
) -> APIResponse:
    _ = get_current_user_context(request, role)
    sid = get_request_store_id(request, store_id)
    peer_ids = _normalize_compare_store_ids(sid, compare_store_ids)
    rows = await sql_queries.get_benchmark_promotion_comparison(db, [sid, *peer_ids], biz_date)
    return APIResponse(
        data={
            "status": "active" if rows else "no_data",
            "data_source": "dunkin_mart_copy.new_campaign_day_gold",
            "biz_date": biz_date.isoformat(),
            "stores": rows,
            "note": None if rows else "프로모션 비교 데이터가 없습니다.",
        }
    )
