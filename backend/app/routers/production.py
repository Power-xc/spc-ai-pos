"""Production management API router."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from statistics import mean

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_current_user_context,
    get_current_user_role,
    get_postgres_db,
    get_production_agent,
    get_request_store_id,
)
from app.demo_store_config import is_hidden_store_id, normalize_store_id
from app.schemas.common import APIResponse
from app.schemas.production import (
    BatchRegisterRequest,
    BatchRegisterResponse,
    InventorySnapshotItem,
    InventorySnapshotResponse,
    InventorySnapshotSummary,
    ProductionRegisterRequest,
    RegisterableProductItem,
    RegisterableProductSummary,
    RegisterableProductsResponse,
)
from app.tools import sql_queries

router = APIRouter(prefix="/api/v1/production", tags=["production"])
logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
BUSINESS_START = 8
BUSINESS_END = 22
LEAD_TIME_HOURS = 1
MUTE_BEFORE_CLOSE_MINUTES = 60
CLOSE_COMPLETE_MUTE_HOUR = 22


def _validate_store_id(store_id: str) -> str:
    normalized = normalize_store_id(store_id)
    if is_hidden_store_id(normalized):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Store not found")
    return normalized


def _compute_status_label(
    on_hand_now: float,
    risk_level: str,
    stockout_probability: float,
    predicted_stock_1h: int,
    depletion_eta: datetime | None,
    now: datetime,
) -> tuple[str, str]:
    if on_hand_now <= 0:
        if depletion_eta and now < depletion_eta:
            return (
                "즉시 생산 필요",
                "현재 보유가 0개이며 품절 상태입니다. 최근 동일 시간대 판매 패턴 기준으로 즉시 생산이 필요합니다.",
            )
        return (
            "즉시 생산 필요",
            "현재 보유가 0개이므로 즉시 생산이 필요합니다. 판매가 발생하지 않는 시간대면 모니터링을 유지하세요.",
        )

    minutes_to_depletion = None
    if depletion_eta and on_hand_now > 0:
        minutes_to_depletion = max(0, (depletion_eta - now).total_seconds() / 60)

    if risk_level == "HIGH" or (
        minutes_to_depletion is not None and minutes_to_depletion <= 60
    ):
        reason = f"최근 4주 동일 요일 패턴 기준 품절 가능성이 높습니다(동일 요일 품절 빈도 {stockout_probability:.0f}%)."
        if minutes_to_depletion is not None and minutes_to_depletion <= 60:
            reason = f"최근 판매 패턴 기준 1시간 내 소진 예상(약 {minutes_to_depletion:.0f}분 후). 리드타임 1시간을 고려하면 지금 생산해야 합니다."
        return "부족 위험", reason

    if risk_level == "MEDIUM" or (
        minutes_to_depletion is not None and minutes_to_depletion <= 120
    ):
        return (
            "주의",
            f"최근 4주 동일 요일 기준 품절 가능성이 있습니다(동일 요일 품절 빈도 {stockout_probability:.0f}%). 1~2시간 내 품절 가능성을 모니터링하세요.",
        )

    if predicted_stock_1h <= 0 and on_hand_now > 0:
        return (
            "주의",
            "현재 보유는 있지만 최근 동일 시간대 판매 패턴 기준 1시간 뒤 예상 재고가 0 이하입니다. 판매 속도를 확인하고 생산을 검토하세요.",
        )

    return (
        "재고 적정",
        f"최근 동일 시간대 판매 패턴 기준으로 1시간 내 품절 위험은 낮습니다. (현재 보유 {int(on_hand_now)}개, 1시간 뒤 예상 {predicted_stock_1h}개)",
    )


def _compute_alert_mute(now_kst: datetime) -> tuple[bool, str]:
    hour = now_kst.hour
    if hour >= CLOSE_COMPLETE_MUTE_HOUR or hour < BUSINESS_START:
        return (
            True,
            "영업 종료 시간입니다. 생산 알림을 차단합니다. 영업 시작 전 준비 점검을 권장합니다.",
        )
    if hour >= BUSINESS_END - 1:
        return (
            True,
            "영업 종료 1시간 전입니다. 추가 생산보다 진열 점검 및 남은 재고 정리를 우선하세요.",
        )
    minutes_to_close = (BUSINESS_END * 60) - (hour * 60 + now_kst.minute)
    if minutes_to_close <= 90:
        return (
            True,
            f"영업 종료까지 {minutes_to_close}분 남았습니다. 리드타임 1시간을 고려하면 추가 생산보다 진열 점검을 우선하세요.",
        )
    return False, ""


def _compute_alert_trigger_reason(
    on_hand_now: float,
    depletion_eta: datetime | None,
    now: datetime,
    stockout_probability: float,
    alert_muted: bool,
) -> str:
    if alert_muted:
        return "알림이 차단된 시간대입니다. 영업 종료 임박으로 추가 생산 알림을 보내지 않습니다."

    if on_hand_now <= 0:
        return "현재 재고가 0개입니다. 즉시 생산이 필요합니다."

    if depletion_eta:
        minutes_to_depletion = max(0, (depletion_eta - now).total_seconds() / 60)
        if minutes_to_depletion <= LEAD_TIME_HOURS * 60:
            return (
                f"1시간 이내 품절 예상(약 {minutes_to_depletion:.0f}분 후 소진). "
                f"리드타임 1시간을 고려하면 지금 생산 알림을 드립니다."
            )
        if minutes_to_depletion <= 120:
            return (
                f"2시간 이내 품절 예상(약 {minutes_to_depletion:.0f}분 후 소진). "
                f"1시간 내 생산 등록을 검토하세요."
            )
        return f"{minutes_to_depletion:.0f}분 후 품절 예상. 아직 여유가 있지만 판매 속도를 모니터링하세요."

    if stockout_probability >= 70:
        return f"동일 요일 품절 빈도가 {stockout_probability:.0f}%로 높습니다. 1시간 내 생산을 검토하세요."

    return "현재 재고는 있지만 판매 속도를 지속 모니터링합니다."


@router.get("/{store_id}/alerts", response_model=APIResponse)
async def get_production_alerts(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    store_id = _validate_store_id(store_id)
    user = get_current_user_context(request, role)
    alerts = await production_agent.get_current_alerts(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    return APIResponse(data=alerts)


@router.get("/{store_id}/inventory", response_model=APIResponse)
async def get_inventory(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    store_id = _validate_store_id(store_id)
    user = get_current_user_context(request, role)
    inventory = await production_agent.get_inventory_status(
        store_id, user_id=user["user_id"], role=user["role"]
    )
    return APIResponse(data=inventory)


@router.get("/{store_id}/forecast/{product_id}", response_model=APIResponse)
async def get_forecast(
    store_id: str,
    product_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
    production_agent=Depends(get_production_agent),
):
    store_id = _validate_store_id(store_id)
    _ = get_current_user_context(request, role)
    demand = await production_agent.predictor.predict_daily_demand(
        db, store_id, product_id
    )
    risk = await production_agent.predictor.predict_stockout_risk(
        db, store_id, product_id
    )
    hourly = await production_agent.predictor.predict_hourly_depletion(
        db, store_id, product_id
    )
    pattern = await production_agent.predictor.get_production_pattern(
        db, store_id, product_id
    )
    return APIResponse(
        data={"demand": demand, "risk": risk, "hourly": hourly, "pattern": pattern}
    )


@router.post("/register", response_model=APIResponse)
async def register_production(
    req: ProductionRegisterRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    user = get_current_user_context(request, role)
    response = await production_agent.register_production(
        store_id=req.store_id,
        product_id=req.product_id,
        quantity=req.quantity,
        alert_id=req.alert_id,
        user_id=user["user_id"],
        role=user["role"],
    )
    return APIResponse(data=response)


RAW_MATERIAL_KEYWORDS = {
    "원료", "파우더", "시럽", "소스", "컵", "뚜껑", "리드", " 빨대", "봉투",
    "박스", "포장", "스티커", "냅킨", "장갑", "세제", "필름", "트레이",
}
RAW_MATERIAL_CATEGORIES = {
    "냉동/냉장", "냉장/냉동", "냉동", "냉장", "용품/상품", "포장재",
    "원자재", "도구", "기타/용품",
}


def _is_raw_material_local(product_id: str, product_name: str | None, category: str | None) -> bool:
    """Check if product is a raw material / packaging / tool — same logic as dashboard.py."""
    product_id = str(product_id).strip()
    if product_id.startswith("7"):
        return True
    if category and category in RAW_MATERIAL_CATEGORIES:
        return True
    if product_name:
        name_lower = product_name.lower()
        for kw in RAW_MATERIAL_KEYWORDS:
            if kw.strip().lower() in name_lower:
                return True
    return False


DEFAULT_HOURLY_PROFILE = {
    8: 0.03, 9: 0.04, 10: 0.05, 11: 0.07, 12: 0.09,
    13: 0.08, 14: 0.08, 15: 0.09, 16: 0.10, 17: 0.11,
    18: 0.11, 19: 0.08, 20: 0.05, 21: 0.03,
}


def _cumulative_hourly_ratio(demo_time_str: str) -> float:
    """Cumulative ratio from 8:00 up to demo_time using hourly profile."""
    demo_time_str = demo_time_str.strip().lower()
    if not demo_time_str or demo_time_str in ("00:00", "00:00:00"):
        return 0.0
    parts = demo_time_str.replace("T", " ").split(" ")[-1] if "T" in demo_time_str else demo_time_str
    parts = parts.split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    if h < BUSINESS_START:
        return 0.0
    cumulative = 0.0
    for hr in range(BUSINESS_START, h):
        cumulative += DEFAULT_HOURLY_PROFILE.get(hr, 0)
    cumulative += DEFAULT_HOURLY_PROFILE.get(h, 0) * (m / 60)
    return cumulative


def _estimate_stock_at_time(
    on_hand_eod: int,
    daily_sold: float,
    daily_production: float,
    cumulative_ratio: float,
) -> int:
    """Estimate stock at a given time using simplified formula.

    estimated_start_stock = on_hand_eod + daily_sold - daily_production
    current_stock = max(0, estimated_start_stock - daily_sold * cumulative_ratio + daily_production * cumulative_ratio)
    """
    daily_net = daily_sold - daily_production
    estimated_start = max(0, on_hand_eod + daily_sold - daily_production)
    sold_until = daily_sold * cumulative_ratio
    produced_until = daily_production * cumulative_ratio
    est = max(0, estimated_start - sold_until + produced_until)
    return int(round(est))


def _compute_recommended_qty_simple(
    current_est: int, daily_sold: float, cumulative_ratio: float
) -> int:
    """Simple recommended qty: need enough to cover remaining day's demand."""
    remaining_ratio = 1.0 - cumulative_ratio
    remaining_demand = daily_sold * remaining_ratio
    needed = max(0, remaining_demand - current_est + max(3, daily_sold * 0.1))
    return int(round(needed))


def _row_to_registerable(
    row: dict, risk: str, q: str
) -> RegisterableProductItem | None:
    """Convert a dashboard item row to RegisterableProductItem, applying filters."""
    pid = str(row.get("product_id") or "")
    pn = row.get("product_name") or str(pid)
    pcat = row.get("category") or ""

    # Exclude raw materials
    if _is_raw_material_local(pid, pn, pcat):
        return None

    # Search filter
    if q and q.lower() not in (pn or "").lower() and q not in pid:
        return None

    current = int(row.get("current_stock") or row.get("on_hand_eod") or 0)
    predicted_1h = int(row.get("predicted_stock_1h") or 0)
    risk_level = str(row.get("risk_level", "LOW"))
    status_label = str(row.get("status_label", ""))

    is_urgent = status_label in ("즉시 생산 필요", "부족 위험") or risk_level in ("HIGH", "CRITICAL")
    is_supplement = (not is_urgent) and (status_label in ("보충 필요", "주의") or risk_level == "MEDIUM")

    if risk == "urgent" and not is_urgent:
        return None
    if risk == "supplement" and not is_supplement:
        return None
    if risk == "normal" and (is_urgent or is_supplement):
        return None

    return RegisterableProductItem(
        product_id=pid,
        product_name=pn,
        category=str(pcat or ""),
        current_stock=current,
        predicted_stock_1h=predicted_1h if predicted_1h else None,
        risk_level=risk_level,
        is_urgent=is_urgent,
        is_supplement=is_supplement,
        recommended_production_qty=int(row.get("recommended_production_qty") or 0),
        daily_recommended_qty=int(row.get("recommended_production_qty") or 0),
        last_1h_sales_rate=float(row.get("hourly_burn_rate") or 0) if row.get("hourly_burn_rate") else None,
        unit_price=float(row.get("unit_price") or row.get("base_price") or 0),
    )


@router.get("/registerable-products", response_model=APIResponse)
async def get_registerable_products(
    request: Request,
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
    q: str = Query("", description="Search by product name"),
    risk: str = Query("all", regex="^(all|urgent|supplement|normal)$"),
):
    """Get registerable products — dashboard items + all store inventory (risk=all)."""
    user = get_current_user_context(request, role)
    store_id = normalize_store_id(get_request_store_id(request, ""))
    # 1) Fetch dashboard production data (curated, predicted items)
    demo_date = request.query_params.get("demo_date", "")
    demo_time = request.query_params.get("demo_time", "")
    dash_url = f"http://127.0.0.1:8100/api/v1/dashboard/production?store_id={store_id}"
    if demo_date:
        dash_url += f"&demo_date={demo_date}"
    if demo_time:
        dash_url += f"&demo_time={demo_time}"

    import httpx as _httpx
    dash_items_raw: list[dict] = []
    try:
        async with _httpx.AsyncClient(timeout=15) as _client:
            dash_resp = await _client.get(
                dash_url,
                headers={"X-User-Role": user.get("role", ""), "X-Store-Id": store_id},
            )
            if dash_resp.status_code == 200:
                dash_items_raw = dash_resp.json().get("data", {}).get("items", [])
    except Exception:
        logger.exception("Failed to fetch dashboard production data for %s", store_id)

    existing_pids: set[str] = set()
    items: list[RegisterableProductItem] = []
    q_lower = (q or "").lower()

    # 2) Convert dashboard items (they have risk predictions, status labels)
    for row in dash_items_raw:
        pid = str(row.get("product_id") or "")
        pn = (row.get("product_name") or pid).lower()
        if q_lower and q_lower not in pn and q_lower not in pid.lower():
            continue
        item = _row_to_registerable(row, risk, "")
        if item:
            items.append(item)
            existing_pids.add(item.product_id)

    # 3) For risk=all, also fetch ALL store inventory products (enrich list beyond dashboard)
    if risk == "all":
        try:
            inv_rows = await sql_queries.get_store_inventory_today(db, store_id) or []
            for row in inv_rows:
                pid = str(row.get("product_id") or "")
                if pid in existing_pids:
                    continue
                if _is_raw_material_local(pid, row.get("product_name"), row.get("category")):
                    continue
                inv_name = (row.get("product_name") or "").lower()
                if q_lower and q_lower not in inv_name and q_lower not in pid:
                    continue
                on_hand = int(row.get("on_hand_eod") or 0)
                sold = float(row.get("sold_qty") or 0)
                items.append(RegisterableProductItem(
                    product_id=pid,
                    product_name=row.get("product_name") or pid,
                    category=str(row.get("category") or ""),
                    current_stock=on_hand,
                    predicted_stock_1h=None,
                    risk_level="LOW",
                    is_urgent=False,
                    is_supplement=False,
                    recommended_production_qty=max(0, round(sold * 0.15 + 3)),
                    daily_recommended_qty=max(0, round(sold + 3)),
                    last_1h_sales_rate=round(sold / 14, 1) if sold > 0 else None,
                    unit_price=None,
                ))
                existing_pids.add(pid)
        except Exception:
            logger.exception("Failed to fetch inventory for %s", store_id)

    items.sort(key=lambda x: (not x.is_urgent, not x.is_supplement, x.current_stock))

    urgent_count = sum(1 for i in items if i.is_urgent)
    supplement_count = sum(1 for i in items if i.is_supplement)

    resp_data = RegisterableProductsResponse(
        items=items,
        summary=RegisterableProductSummary(
            total_count=len(items),
            urgent_count=urgent_count,
            supplement_count=supplement_count,
            normal_count=len(items) - urgent_count - supplement_count,
        ),
    )
    return APIResponse(data=resp_data.model_dump(mode="json"))


@router.post("/batch-register", response_model=APIResponse)
async def batch_register_production(
    req: BatchRegisterRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    production_agent=Depends(get_production_agent),
):
    """Register multiple items for production in one call."""
    user = get_current_user_context(request, role)
    results: list[dict] = []
    registered = 0
    failed = 0

    for item in req.items:
        if item.quantity <= 0:
            continue
        try:
            res = await production_agent.register_production(
                store_id=req.store_id,
                product_id=item.product_id,
                quantity=item.quantity,
                alert_id=None,
                user_id=user["user_id"],
                role=user["role"],
            )
            results.append({
                "product_id": item.product_id,
                "product_name": item.product_name,
                "quantity": item.quantity,
                "success": True,
                "production_id": getattr(res, "production_id", None),
            })
            registered += 1
        except Exception as exc:
            logger.warning("Batch register failed for %s: %s", item.product_id, exc)
            results.append({
                "product_id": item.product_id,
                "product_name": item.product_name,
                "quantity": item.quantity,
                "success": False,
                "production_id": None,
            })
            failed += 1

    return APIResponse(data={
        "registered_count": registered,
        "failed_count": failed,
        "results": results,
    })


@router.get("/inventory-snapshot", response_model=APIResponse)
async def get_inventory_snapshot(
    request: Request,
    store_id: str = Query(...),
    db: AsyncSession = Depends(get_postgres_db),
    demo_date: date | None = Query(default=None),
    demo_time: str = Query("13:00", description="Time to estimate stock for, e.g. 13:00"),
    q: str = Query("", description="Search by product name"),
    risk: str = Query("all", regex="^(all|urgent|supplement|normal)$"),
):
    """Full product inventory snapshot with estimated stock at demo_time.

    Two sources merged:
    1) Dashboard production data (curated, with predictions, risk classification)
    2) All inventory items (time-based stock estimation)

    Returns ALL sellable products, sorted by risk priority.
    """
    store_id = _validate_store_id(store_id)

    # 1) Fetch dashboard production items (already classified with predictions)
    # 0) Fetch inventory FIRST to build price map and estimated stock map
    inv_rows = await sql_queries.get_store_inventory_today(db, store_id, demo_date) or []
    inv_map: dict[str, dict] = {str(r.get("product_id") or ""): r for r in inv_rows}

    # Fetch production data
    demo_date_str = str(demo_date) if demo_date else ""
    daily_prod_map: dict[str, float] = {}
    try:
        prod_rows = await sql_queries._fetch_gold_all(
            db,
            f"""
            SELECT item_cd, SUM(prod_qty) AS total_prod_qty
            FROM {sql_queries.GOLD_SCHEMA}.new_production
            WHERE masked_stor_cd = :store_id AND prod_dt = :biz_date
            GROUP BY item_cd
            """,
            {"store_id": store_id, "biz_date": demo_date_str if demo_date_str else ""},
        )
        daily_prod_map = {str(r["item_cd"]): float(r["total_prod_qty"] or 0) for r in (prod_rows or [])}
    except Exception:
        pass

    # Also grab production-only products not in inventory
    try:
        prod_product_rows = await sql_queries._fetch_gold_all(
            db,
            f"""
            SELECT DISTINCT item_cd AS product_id, max(item_nm) AS product_name, max(category_nm) AS category
            FROM {sql_queries.GOLD_SCHEMA}.new_production
            WHERE masked_stor_cd = :store_id
            GROUP BY item_cd
            """,
            {"store_id": store_id},
        )
        for row in (prod_product_rows or []):
            pid = str(row.get("product_id") or "")
            if pid not in inv_map:
                inv_map[pid] = {
                    "product_id": pid,
                    "product_name": row.get("product_name", pid),
                    "category": row.get("category", "미분류"),
                    "on_hand_eod": 0,
                    "sold_qty": 0,
                    "base_price": 0,
                }
    except Exception:
        pass

    # Build estimated stock map and price map for ALL products in inventory
    cum_ratio = _cumulative_hourly_ratio(demo_time)
    next_cum_ratio = _cumulative_hourly_ratio(_add_one_hour(demo_time))
    est_stock_map: dict[str, dict] = {}
    price_map: dict[str, float] = {}
    for pid, row in inv_map.items():
        pname = str(row.get("product_name") or "")
        pcat = str(row.get("category") or "미분류")
        if _is_raw_material_local(pid, pname, pcat):
            continue
        on_hand_eod = int(row.get("on_hand_eod") or 0)
        daily_sold = float(row.get("sold_qty") or 0)
        daily_prod = daily_prod_map.get(pid, 0)
        curr = _estimate_stock_at_time(on_hand_eod, daily_sold, daily_prod, cum_ratio)
        pred = _estimate_stock_at_time(on_hand_eod, daily_sold, daily_prod, next_cum_ratio)
        est_stock_map[pid] = {"current_stock": curr, "predicted_stock_1h": pred, "daily_sold": daily_sold}
        bp = float(row.get("base_price") or 0)
        if bp > 0:
            price_map[pid] = bp

    # Also lookup base_price from dim_product for products missing price in inventory
    try:
        dim_rows = await sql_queries._fetch_gold_all(
            db,
            f"SELECT product_id, base_price FROM {sql_queries.GOLD_SCHEMA}.dim_product WHERE base_price > 0",
            {},
        )
        for dr in (dim_rows or []):
            did = str(dr.get("product_id") or "")
            dbp = float(dr.get("base_price") or 0)
            if dbp > 0 and did not in price_map:
                price_map[did] = dbp
    except Exception:
        pass

    # 1) Fetch dashboard for risk classification and burn rates
    import httpx as _httpx
    dash_items_raw: list[dict] = []
    demo_dt_str = ""
    if demo_date_str and demo_time:
        demo_dt_str = f"{demo_date_str}T{demo_time.replace(':', '%3A')}:00"
    dash_url = f"http://127.0.0.1:8100/api/v1/dashboard/production?store_id={store_id}"
    if demo_date_str:
        dash_url += f"&demo_date={demo_date_str}"
    if demo_time:
        dash_url += f"&demo_time={demo_time}"
    if demo_dt_str:
        dash_url += f"&demo_datetime={demo_dt_str}"
    try:
        async with _httpx.AsyncClient(timeout=15) as _client:
            dash_resp = await _client.get(dash_url, headers={"X-User-Role": "store_owner", "X-Store-Id": store_id})
            if dash_resp.status_code == 200:
                dash_items_raw = dash_resp.json().get("data", {}).get("items", [])
    except Exception:
        logger.exception("Failed to fetch dashboard for inventory snapshot %s", store_id)

    existing_pids: set[str] = set()
    q_lower = (q or "").lower()
    items: list[InventorySnapshotItem] = []

    # Build dashboard items with estimated stock from inventory + price enrichment
    for row in dash_items_raw:
        pid = str(row.get("product_id") or "")
        pname = str(row.get("product_name") or pid)
        if _is_raw_material_local(pid, pname, row.get("category")):
            continue
        existing_pids.add(pid)

        # Use estimated stock from inventory instead of dashboard stock
        est = est_stock_map.get(pid, {})
        current_est = est.get("current_stock", int(row.get("current_stock") or 0))
        pred_est = est.get("predicted_stock_1h", int(row.get("predicted_stock_1h") or 0))
        daily_sold_inv = est.get("daily_sold", 0)

        # Price from inventory
        unit_price = price_map.get(pid)
        if unit_price is None or unit_price <= 0:
            # No price for this product — skip (not a sellable product)
            continue

        if q_lower and q_lower not in pname.lower() and q_lower not in pid.lower():
            continue

        burn_rate = float(row.get("hourly_burn_rate") or 0)
        is_urgent = burn_rate >= 1.5
        is_supplement = (not is_urgent)
        risk_level = "HIGH" if is_urgent else "MEDIUM"

        if risk == "urgent" and not is_urgent:
            continue
        if risk == "supplement" and not is_supplement:
            continue
        if risk == "normal" and (is_urgent or is_supplement):
            continue

        items.append(InventorySnapshotItem(
            product_id=pid,
            product_name=pname,
            category=str(row.get("category") or "미분류"),
            current_stock=current_est,
            predicted_stock_1h=pred_est,
            risk_level=risk_level,
            is_urgent=is_urgent,
            is_supplement=is_supplement,
            recommended_production_qty=int(row.get("recommended_production_qty") or 0),
            daily_recommended_qty=int(row.get("recommended_production_qty") or 0),
            last_1h_sales_rate=float(row.get("hourly_burn_rate") or 0) if row.get("hourly_burn_rate") else None,
            unit_price=unit_price,
            stock_basis="시간대 판매 패턴 기반 추정",
            is_estimated=True,
        ))

    # 3) Inventory items (non-dashboard)
    for row in inv_rows:
        pid = str(row.get("product_id") or "")
        if pid in existing_pids:
            continue
        pname = str(row.get("product_name") or pid)
        pcat = str(row.get("category") or "미분류")
        if _is_raw_material_local(pid, pname, pcat):
            continue
        base_price = float(row.get("base_price") or 0)
        # Exclude products with no base price — not a sellable product
        if base_price <= 0:
            continue
        if q_lower and q_lower not in pname.lower() and q_lower not in pid:
            continue
        is_urgent = False
        curr_est = est_stock_map.get(pid, {}).get("current_stock", 0)
        pred_est = est_stock_map.get(pid, {}).get("predicted_stock_1h", 0)
        is_supplement = curr_est <= 3 or pred_est <= 3
        risk_level = "MEDIUM" if is_supplement else "LOW"
        if risk == "urgent" and not is_urgent:
            continue
        if risk == "supplement" and not is_supplement:
            continue
        if risk == "normal" and (is_urgent or is_supplement):
            continue
        daily_sold_for_rec = est_stock_map.get(pid, {}).get("daily_sold", 0)
        recommended_qty = _compute_recommended_qty_simple(curr_est, daily_sold_for_rec, cum_ratio) if daily_sold_for_rec > 0 else 0
        items.append(InventorySnapshotItem(
            product_id=pid,
            product_name=pname,
            category=pcat,
            current_stock=curr_est,
            predicted_stock_1h=pred_est,
            risk_level=risk_level,
            is_urgent=is_urgent,
            is_supplement=is_supplement,
            recommended_production_qty=recommended_qty,
            daily_recommended_qty=int(daily_sold_for_rec) if daily_sold_for_rec > 0 else 0,
            last_1h_sales_rate=round(daily_sold_for_rec / 14, 1) if daily_sold_for_rec > 0 else None,
            unit_price=base_price,
            stock_basis="시간대 판매 패턴 기반 추정",
            is_estimated=True,
        ))
        existing_pids.add(pid)

    items.sort(key=lambda x: (0 if x.is_urgent else (1 if x.is_supplement else 2), x.current_stock, -x.daily_recommended_qty))

    urgent_count = sum(1 for i in items if i.is_urgent)
    supplement_count = sum(1 for i in items if i.is_supplement)

    as_of_str = f"{demo_date_str or ''} {demo_time}".strip()

    resp = InventorySnapshotResponse(
        as_of=as_of_str,
        is_estimated=True,
        basis="시간대 판매 패턴 기반 추정",
        summary=InventorySnapshotSummary(
            total_count=len(items),
            urgent_count=urgent_count,
            supplement_count=supplement_count,
            normal_count=len(items) - urgent_count - supplement_count,
        ),
        items=items,
    )
    return APIResponse(data=resp.model_dump(mode="json"))


def _add_one_hour(time_str: str) -> str:
    """Add 1 hour to a time string like '13:00' → '14:00'."""
    parts = time_str.strip().split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    h += 1
    if h >= 22:
        return "21:59"
    return f"{h:02d}:{m:02d}"


async def get_inventory_current_legacy(
    request: Request,
    biz_date: date | None = Query(None),
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
):
    store_id = get_request_store_id(request, None)
    try:
        inventory_rows = await sql_queries.get_store_inventory_today(
            db,
            store_id,
            biz_date,
        )
        inventory = []
        for row in inventory_rows:
            stockout_minutes = int(round(float(row.get("stockout_minutes", 0) or 0)))
            on_hand_eod = float(row.get("on_hand_eod", 0) or 0)
            sold_qty = float(row.get("sold_qty", 0) or 0)
            base_price = float(row.get("base_price", 0) or 0)
            if stockout_minutes >= 60 or on_hand_eod <= 0:
                stockout_risk = "HIGH"
            elif stockout_minutes >= 20:
                stockout_risk = "MEDIUM"
            elif bool(row.get("reorder_triggered", 0)) or on_hand_eod < 10:
                stockout_risk = "LOW"
            else:
                stockout_risk = "NONE"

            estimated_chance_loss = round(
                (stockout_minutes / sql_queries.OPERATING_MINUTES)
                * sold_qty
                * base_price,
                2,
            )
            inventory.append(
                {
                    "product_id": row["product_id"],
                    "product_name": row["product_name"],
                    "category": row["category"],
                    "on_hand_eod": on_hand_eod,
                    "sold_qty": sold_qty,
                    "waste_qty": float(row.get("waste_qty", 0) or 0),
                    "stockout_minutes": stockout_minutes,
                    "reorder_triggered": bool(row.get("reorder_triggered", 0)),
                    "base_price": base_price,
                    "estimated_chance_loss": estimated_chance_loss
                    if estimated_chance_loss > 0
                    else None,
                    "stockout_risk": stockout_risk,
                }
            )
    except Exception:
        logger.exception(
            "Failed to build legacy inventory payload for store_id=%s", store_id
        )
        inventory = []
    return APIResponse(data=inventory)


def _compute_recommended_qty(
    on_hand_now: float, predicted_sold_qty: float, hourly_burn_rate: float
) -> int:
    buffer = max(3, predicted_sold_qty * 0.1)
    needed = max(0, -on_hand_now + buffer)
    if hourly_burn_rate > 0 and on_hand_now > 0:
        hours_to_depletion = on_hand_now / hourly_burn_rate
        if hours_to_depletion < LEAD_TIME_HOURS:
            needed = max(
                needed, hourly_burn_rate * (LEAD_TIME_HOURS + 1) - on_hand_now + buffer
            )
    return max(0, round(needed))


@router.get("/{store_id}/validation-report", response_model=APIResponse)
async def get_prediction_validation_report(
    store_id: str,
    request: Request,
    role: str = Depends(get_current_user_role),
    db: AsyncSession = Depends(get_postgres_db),
    top_n: int = Query(default=10, ge=1, le=50),
):
    from app.tools.prediction import InventoryPredictor

    _ = get_current_user_context(request, role)
    store_id = _validate_store_id(store_id)
    now_kst = datetime.now(KST)
    now_utc = datetime.now(timezone.utc)

    predictor = InventoryPredictor()

    inventory_rows = await sql_queries.get_store_inventory_today(db, store_id)
    if not inventory_rows:
        return APIResponse(
            data={
                "status": "no_data",
                "note": "현재 일자 재고 데이터가 없어 검증 리포트를 생성할 수 없습니다.",
                "items": [],
                "backtest": None,
                "summary": {
                    "total_products": 0,
                    "within_10pct": 0,
                    "avg_error_pct": 0,
                    "within_10pct_ratio": 0,
                },
            }
        )

    risk_products = await sql_queries.get_stockout_risk_products(db, store_id)
    risk_product_ids = {rp["product_id"] for rp in risk_products[:top_n]}

    backtest_items = await _run_backtest(
        db, store_id, predictor, top_n=min(top_n * 2, 10)
    )

    validation_items = []
    for row in inventory_rows:
        product_id = row["product_id"]
        if product_id not in risk_product_ids and len(validation_items) >= top_n:
            continue

        on_hand_now = float(row.get("on_hand_eod", 0) or 0)
        sold_qty = float(row.get("sold_qty", 0) or 0)

        try:
            hourly = await predictor.predict_hourly_depletion(db, store_id, product_id)
            predicted_stock_1h = hourly.get("predicted_stock_1h", on_hand_now)
            hourly_burn_rate = hourly.get("hourly_burn_rate", 0)
        except Exception:
            predicted_stock_1h = on_hand_now
            hourly_burn_rate = 0

        if on_hand_now > 0 and sold_qty > 0:
            operating_hours = 14
            hourly_sold = sold_qty / operating_hours
            actual_stock_after_1h = max(0, on_hand_now - hourly_sold)
        else:
            actual_stock_after_1h = 0.0

        if predicted_stock_1h > 0:
            error_pct = (
                abs(predicted_stock_1h - actual_stock_after_1h)
                / predicted_stock_1h
                * 100
            )
        elif actual_stock_after_1h > 0:
            error_pct = 100.0
        else:
            error_pct = 0.0

        within_10pct = error_pct <= 10.0

        try:
            risk = await predictor.predict_stockout_risk(db, store_id, product_id)
            stockout_probability = risk.get("stockout_probability", 0)
            risk_level = risk.get("risk_level", "UNKNOWN")
        except Exception:
            stockout_probability = 0
            risk_level = "UNKNOWN"

        try:
            pattern = await predictor.get_production_pattern(db, store_id, product_id)
            first_prod = pattern.get("first_production")
            second_prod = pattern.get("second_production")
        except Exception:
            first_prod = None
            second_prod = None

        depletion_eta = hourly.get("depletion_eta")
        if isinstance(depletion_eta, str):
            try:
                depletion_eta = datetime.fromisoformat(depletion_eta)
            except (ValueError, TypeError):
                depletion_eta = None

        status_label, status_explanation = _compute_status_label(
            on_hand_now,
            risk_level,
            stockout_probability,
            predicted_stock_1h,
            depletion_eta,
            now_utc,
        )

        alert_muted, mute_reason = _compute_alert_mute(now_kst)
        alert_trigger_reason = _compute_alert_trigger_reason(
            on_hand_now,
            depletion_eta,
            now_utc,
            stockout_probability,
            alert_muted,
        )

        confidence = (
            "HIGH"
            if risk.get("total_weeks", 0) >= 4
            else "MEDIUM"
            if risk.get("total_weeks", 0) >= 2
            else "LOW"
        )

        demand = None
        try:
            demand = await predictor.predict_daily_demand(db, store_id, product_id)
        except Exception:
            pass

        recommended_qty = _compute_recommended_qty(
            on_hand_now, sold_qty, hourly_burn_rate
        )

        grounding_parts = []
        if hourly_burn_rate > 0:
            grounding_parts.append(
                f"최근 1시간 판매 속도 {hourly_burn_rate:.1f}개/시간"
            )
        if demand and demand.get("weekly_data"):
            grounding_parts.append(
                f"4주 동일 요일 가중평균 추정 {demand.get('predicted_sold_qty', 0)}개"
            )
        if stockout_probability > 0:
            grounding_parts.append(f"동일 요일 품절 빈도 {stockout_probability:.0f}%")
        if first_prod:
            grounding_parts.append(
                f"최근 생산 이력 평균 {first_prod.get('avg_time', '-')} / {first_prod.get('avg_qty', 0)}개"
            )
        if second_prod:
            grounding_parts.append(
                f"최근 생산 이력 평균 {second_prod.get('avg_time', '-')} / {second_prod.get('avg_qty', 0)}개"
            )
        grounding_parts.append(f"리드타임 {LEAD_TIME_HOURS}시간 반영")

        validation_items.append(
            {
                "product_id": product_id,
                "product_name": row.get("product_name", product_id),
                "current_stock": on_hand_now,
                "predicted_stock_1h": predicted_stock_1h,
                "estimated_actual_after_1h": round(actual_stock_after_1h, 1),
                "error_pct": round(error_pct, 1),
                "within_10pct": within_10pct,
                "hourly_burn_rate": hourly_burn_rate,
                "stockout_probability": stockout_probability,
                "risk_level": risk_level,
                "status_label": status_label,
                "status_explanation": status_explanation,
                "recommended_production_qty": recommended_qty,
                "first_production": first_prod,
                "second_production": second_prod,
                "alert_muted": alert_muted,
                "mute_reason": mute_reason,
                "alert_trigger_reason": alert_trigger_reason,
                "depletion_eta": hourly.get("depletion_eta"),
                "confidence": confidence,
                "grounding": grounding_parts,
            }
        )

    validation_items.sort(
        key=lambda x: (
            0 if x["risk_level"] == "HIGH" else 1 if x["risk_level"] == "MEDIUM" else 2,
            -x["stockout_probability"],
        )
    )

    total_products = len(validation_items)
    within_10pct_count = sum(1 for item in validation_items if item["within_10pct"])
    avg_error_pct = round(
        sum(item["error_pct"] for item in validation_items) / max(total_products, 1), 1
    )
    within_10pct_ratio = round(within_10pct_count / max(total_products, 1) * 100, 1)

    high_error_items = [item for item in validation_items if not item["within_10pct"]]

    backtest_summary = None
    if backtest_items:
        backtest_within = sum(1 for b in backtest_items if b.get("within_10pct", False))
        backtest_total = len(backtest_items)
        backtest_avg_error = round(
            sum(b.get("error_pct", 0) for b in backtest_items) / max(backtest_total, 1),
            1,
        )
        backtest_within_ratio = round(backtest_within / max(backtest_total, 1) * 100, 1)
        high_error_backtest = [
            b for b in backtest_items if not b.get("within_10pct", False)
        ]
        backtest_summary = {
            "method": "과거 7일 같은 요일 예측 vs 실제 비교 (히스토리컬 백테스트)",
            "total_products": backtest_total,
            "within_10pct": backtest_within,
            "avg_error_pct": backtest_avg_error,
            "within_10pct_ratio": backtest_within_ratio,
            "high_error_products": len(high_error_backtest),
            "items": backtest_items[:5],
            "high_error_reasons": [
                "동일 요일 4주 가중이동평균이 실제 판매 변동성을 완전히 반영하지 못합니다.",
                "시간대별 판매 프로필이 정적(static)이어서 실시간 변동을 반영하지 못합니다.",
                "on_hand_eod가 일일 종료 기준이어서 실시간 재고와 차이가 있을 수 있습니다.",
                "프로모션/이벤트/날씨 등 외부 요인이 예측에 반영되지 않습니다.",
            ],
        }

    return APIResponse(
        data={
            "status": "active",
            "data_source": "dunkin_mart_copy.new_product_sales_day_gold + new_inventory_risk_day_gold",
            "note": "최근 4주 동일 요일 가중이동평균 기반 1시간 뒤 예상 재고량과 추정 실제 재고량을 비교한 검증 리포트입니다. 이는 확정 예측이 아닌 과거 패턴 기반 추정이며, 백테스트 결과도 함께 제공합니다.",
            "items": validation_items[:top_n],
            "backtest": backtest_summary,
            "summary": {
                "total_products": total_products,
                "within_10pct": within_10pct_count,
                "avg_error_pct": avg_error_pct,
                "within_10pct_ratio": within_10pct_ratio,
                "high_error_products": len(high_error_items),
                "high_error_reasons": [
                    "동일 요일 판매 데이터가 부족하여 가중이동평균의 신뢰도가 낮습니다.",
                    "시간대별 판매 프로필이 정적(static)이어서 실제 변동을 반영하지 못합니다.",
                    "현재 재고(on_hand_eod)가 일일 종료 기준이어서 실시간 재고와 차이가 있을 수 있습니다.",
                    "프로모션/이벤트/날씨 등 외부 요인이 예측에 반영되지 않습니다.",
                ],
            },
        }
    )


async def _run_backtest(
    db: AsyncSession,
    store_id: str,
    predictor: "InventoryPredictor",
    top_n: int = 5,
) -> list[dict]:
    from app.tools import sql_queries as sq

    try:
        inventory_rows = await sq.get_store_inventory_today(db, store_id)
        if not inventory_rows:
            return []

        risk_products = await sq.get_stockout_risk_products(db, store_id)
        candidate_ids = [rp["product_id"] for rp in risk_products[:top_n]]

        if not candidate_ids:
            by_stockout = sorted(
                inventory_rows,
                key=lambda r: float(r.get("stockout_minutes", 0) or 0),
                reverse=True,
            )
            candidate_ids = [r["product_id"] for r in by_stockout[:top_n]]

        backtest_items = []
        for product_id in candidate_ids[:top_n]:
            history = await sq.get_product_history(db, store_id, product_id, days=35)
            if len(history) < 5:
                continue

            all_rows_sorted = sorted(history, key=lambda r: r["biz_date"])
            latest_date = date.fromisoformat(str(all_rows_sorted[-1]["biz_date"]))
            target_dow = latest_date.weekday()

            same_dow_rows = []
            for row in all_rows_sorted[:-1]:
                row_date = date.fromisoformat(str(row["biz_date"]))
                if row_date.weekday() == target_dow:
                    same_dow_rows.append(row)

            if len(same_dow_rows) < 2:
                recent_rows = all_rows_sorted[-7:]
                if len(recent_rows) < 2:
                    continue
                same_dow_rows = recent_rows

            same_dow_rows.sort(key=lambda r: r["biz_date"])

            test_row = same_dow_rows[-1]
            test_date = date.fromisoformat(str(test_row["biz_date"]))

            test_on_hand = float(test_row.get("on_hand_eod", 0) or 0)
            test_sold = float(test_row.get("sold_qty", 0) or 0)
            test_stockout = float(test_row.get("stockout_minutes", 0) or 0)

            training_rows = same_dow_rows[:-1]
            if not training_rows:
                training_rows = same_dow_rows

            training_solds = [float(r.get("sold_qty", 0) or 0) for r in training_rows]
            weights = [0.40, 0.30, 0.20, 0.10][: len(training_solds)]
            total_w = sum(weights)
            if total_w == 0:
                continue
            predicted_sold = (
                sum(s * w for s, w in zip(training_solds, weights)) / total_w
            )

            hour_share = 0.08
            predicted_hourly = predicted_sold * hour_share
            predicted_stock_1h = max(0, int(round(test_on_hand - predicted_hourly)))

            operating_hours = 14
            actual_hourly = test_sold / operating_hours if test_sold > 0 else 0
            actual_stock_after_1h = max(0, test_on_hand - actual_hourly)

            if predicted_stock_1h > 0:
                error_pct = (
                    abs(predicted_stock_1h - actual_stock_after_1h)
                    / predicted_stock_1h
                    * 100
                )
            elif actual_stock_after_1h > 0:
                error_pct = 100.0
            else:
                error_pct = 0.0

            within_10pct = error_pct <= 10.0

            product_name = ""
            for row in inventory_rows:
                if row["product_id"] == product_id:
                    product_name = row.get("product_name", product_id)
                    break

            backtest_items.append(
                {
                    "product_id": product_id,
                    "product_name": product_name,
                    "test_date": test_date.isoformat(),
                    "test_on_hand": test_on_hand,
                    "predicted_stock_1h": predicted_stock_1h,
                    "actual_stock_after_1h": round(actual_stock_after_1h, 1),
                    "predicted_hourly_burn": round(predicted_hourly, 2),
                    "actual_hourly_burn": round(actual_hourly, 2),
                    "error_pct": round(error_pct, 1),
                    "within_10pct": within_10pct,
                    "confidence": "HIGH"
                    if len(training_rows) >= 4
                    else "MEDIUM"
                    if len(training_rows) >= 2
                    else "LOW",
                    "note": f"과거 {test_date.isoformat()} 기준 백테스트 (동일 요일 4주 가중이동평균 vs 실제)",
                }
            )

        return backtest_items
    except Exception:
        logger.exception("Backtest calculation failed for store_id=%s", store_id)
        return []
