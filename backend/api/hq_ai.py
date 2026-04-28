"""HQ AI Chat — multi-store RAG-style Q&A backed by existing API endpoints + LLM summarization."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from fastapi import APIRouter, Depends, Request

from app.schemas.chat import ChatRequest
from core.llm_client import LLMClient
from security.prompt_guard import check_prompt_safety
from security.rbac import get_current_user

router = APIRouter()

# ── API base ──
# The backend runs on localhost:8100. We call ourselves via internal HTTP
# to reuse existing endpoint logic and column mappings.
BACKEND_BASE = "http://127.0.0.1:8100"

HQ_HEADERS = {
    "Content-Type": "application/json",
    "X-User-Role": "hq_admin",
    "X-User-Id": "A001",
    "X-Store-Id": "HQ_ALL",
}

# ── Domain classification ──
DOMAIN_KEYWORDS = {
    "점포운영": ["점포운영", "운영", "발주", "누락", "이슈", "미확인", "발주 누락"],
    "점포현황": ["점포현황", "지역별", "서울", "경기", "부산", "경상", "지역", "점포 수", "전체 점포"],
    "매출분석": ["매출", "매출분석", "상위", "하위", "증감", "감소", "증가", "분석"],
    "재고": ["재고", "품목", "부족", "위험 품목", "품절"],
    "캠페인": ["캠페인", "프로모션", "성과", "참여율", "기여"],
    "공지": ["공지", "긴급"],
}


def _classify_domain(message: str) -> str:
    scores: dict[str, int] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in message.lower())
        if score > 0:
            scores[domain] = score
    return max(scores, key=scores.get) if scores else "점포운영"


# ── HTTP helper ──


async def _get(path: str, store_id: str = "POC_001") -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        h = {**HQ_HEADERS}
        h["X-Store-Id"] = store_id
        resp = await c.get(f"{BACKEND_BASE}{path}", headers=h)
        resp.raise_for_status()
        return resp.json()


# ── Per-store fetch helpers (parallel) ──


async def _fetch_store_status(store_id: str) -> dict[str, Any]:
    """Get inventory risk + sales for one store."""
    try:
        inv = await _get("/api/inventory/current", store_id)
        sales = await _get("/api/home/sales-summary", store_id)
        return {
            "store_id": store_id,
            "inventory": inv.get("data", []),
            "today_revenue": sales.get("data", {}).get("today_revenue", 0),
            "vs_yesterday_same_time_pct": sales.get("data", {}).get("vs_yesterday_same_time_pct"),
            "vs_last_week_same_day_pct": sales.get("data", {}).get("vs_last_week_same_day_pct"),
            "top_selling": sales.get("data", {}).get("top_selling", []),
        }
    except Exception as e:
        return {"store_id": store_id, "error": str(e)}


# ── Domain gatherers ──


async def _gather_store_ops(data_store) -> dict[str, Any]:
    """점포운영: inventory risk + order deadlines across all stores."""
    stores = data_store.dim_store
    store_ids = stores["store_id"].astype(str).tolist()
    results = await asyncio.gather(*[_fetch_store_status(sid) for sid in store_ids])

    risk_stores = []
    warning_stores = []
    normal_stores = []
    for r in results:
        inv_items = r.get("inventory", [])
        if not isinstance(inv_items, list):
            normal_stores.append(r.get("store_id"))
            continue
        has_stockout = any(i.get("stockout_risk") == "HIGH" for i in inv_items)
        has_low = any(i.get("on_hand_eod", 0) <= 2 and i.get("stockout_risk") != "HIGH" for i in inv_items[:10])

        entry = {
            "store_id": r["store_id"],
            "today_revenue": r.get("today_revenue", 0),
            "stockout_items": [i["product_name"] for i in inv_items if i.get("stockout_risk") == "HIGH"][:10],
        }
        if has_stockout:
            risk_stores.append(entry)
        elif has_low:
            warning_stores.append(entry)
        else:
            normal_stores.append(r["store_id"])

    return {
        "title": "점포 운영 현황",
        "total_stores": len(store_ids),
        "risk_count": len(risk_stores),
        "warning_count": len(warning_stores),
        "normal_count": len(normal_stores),
        "risk_stores": risk_stores,
        "warning_stores": warning_stores,
    }


async def _gather_store_status(data_store) -> dict[str, Any]:
    """점포현황: store list with region breakdown."""
    stores = data_store.dim_store
    region_map: dict[str, list[dict]] = {}
    for _, s in stores.iterrows():
        sid = str(s.get("store_id", ""))
        name = str(s.get("store_name", sid))
        region = str(s.get("region", "기타"))
        city = str(s.get("city", ""))
        region_map.setdefault(region, []).append({"store_id": sid, "store_name": name, "city": city})

    region_summary = {}
    for region, slist in region_map.items():
        region_summary[region] = {
            "total": len(slist),
            "stores": [s["store_name"] for s in slist],
        }

    return {
        "title": "점포 현황",
        "total_stores": len(stores),
        "region_breakdown": region_summary,
    }


async def _gather_sales(data_store) -> dict[str, Any]:
    """매출분석: aggregated sales across all stores."""
    stores = data_store.dim_store
    store_ids = stores["store_id"].astype(str).tolist()

    sales_results = await asyncio.gather(
        *[_get("/api/home/sales-summary", sid) for sid in store_ids],
        return_exceptions=True,
    )

    store_sales = []
    total_revenue = 0
    for sid, result in zip(store_ids, sales_results):
        if isinstance(result, Exception):
            continue
        d = result.get("data", {})
        rev = d.get("today_revenue", 0) or 0
        store_sales.append({
            "store_id": sid,
            "today_revenue": rev,
            "vs_yesterday_same_time_pct": d.get("vs_yesterday_same_time_pct"),
            "vs_last_week_same_day_pct": d.get("vs_last_week_same_day_pct"),
            "top_selling": d.get("top_selling", []),
        })
        total_revenue += rev

    store_sales.sort(key=lambda x: x["today_revenue"], reverse=True)
    declining = [s for s in store_sales if (s.get("vs_last_week_same_day_pct") or 0) < 0]

    return {
        "title": "매출 분석",
        "total_revenue": total_revenue,
        "store_count": len(store_sales),
        "top5": store_sales[:5],
        "bottom5": store_sales[-5:],
        "declining_count": len(declining),
        "declining_stores": declining[:10],
    }


async def _gather_inventory(data_store) -> dict[str, Any]:
    """재고: aggregated inventory risk across all stores."""
    stores = data_store.dim_store
    store_ids = stores["store_id"].astype(str).tolist()

    inv_results = await asyncio.gather(
        *[_get("/api/inventory/current", sid) for sid in store_ids],
        return_exceptions=True,
    )

    all_items = []
    store_risk: list[dict] = []
    for sid, result in zip(store_ids, inv_results):
        if isinstance(result, Exception):
            continue
        items = result.get("data", [])
        if not isinstance(items, list):
            continue
        high_items = [i for i in items if i.get("stockout_risk") == "HIGH"]
        low_items = [i for i in items if 0 < i.get("on_hand_eod", 0) <= 2]
        all_items.extend(high_items)
        if high_items:
            store_risk.append({
                "store_id": sid,
                "high_risk_count": len(high_items),
                "products": [i["product_name"] for i in high_items[:5]],
            })

    # Aggregate by product
    product_counts: dict[str, int] = {}
    for item in all_items:
        pname = item.get("product_name", "unknown")
        product_counts[pname] = product_counts.get(pname, 0) + 1

    top_risk = sorted(product_counts.items(), key=lambda x: x[1], reverse=True)[:15]

    store_risk.sort(key=lambda x: x["high_risk_count"], reverse=True)

    return {
        "title": "재고 위험 현황",
        "total_stockout_items": len(all_items),
        "unique_stockout_products": len(product_counts),
        "top_risk_products": [{"product_name": p, "store_count": c} for p, c in top_risk],
        "highest_risk_stores": store_risk[:10],
    }


async def _gather_campaigns(data_store) -> dict[str, Any]:
    """캠페인: campaign data from backend if available."""
    try:
        result = await _get("/api/sales/ranking")
        return {
            "title": "캠페인 현황",
            "sales_ranking": result.get("data", []),
            "note": "캠페인 데이터는 현재 판매 순위 데이터와 연동됩니다.",
        }
    except Exception:
        return {
            "title": "캠페인 현황",
            "note": "현재 조회 가능한 캠페인 데이터가 없습니다.",
        }


async def _gather_notices(data_store) -> dict[str, Any]:
    """공지: notice data from backend."""
    try:
        result = await _get("/api/notice/list")
        items = result.get("data", [])
        urgent = [n for n in items if "긴급" in str(n.get("title", ""))]
        return {
            "title": "공지 현황",
            "total": len(items),
            "urgent_count": len(urgent),
            "urgent_notices": urgent[:10],
            "recent": items[:10],
        }
    except Exception:
        return {
            "title": "공지 현황",
            "note": "공지 조회 중 오류가 발생했습니다.",
        }


GATHERERS = {
    "점포운영": _gather_store_ops,
    "점포현황": _gather_store_status,
    "매출분석": _gather_sales,
    "재고": _gather_inventory,
    "캠페인": _gather_campaigns,
    "공지": _gather_notices,
}


def _data_to_text(data: dict[str, Any]) -> str:
    """Serialize gathered data to LLM-readable text."""
    lines = [f"=== {data.get('title', '데이터')} ==="]
    for key, val in data.items():
        if key == "title":
            continue
        if isinstance(val, dict):
            lines.append(f"  {key}: {json.dumps(val, ensure_ascii=False, default=str)}")
        elif isinstance(val, list):
            if val and isinstance(val[0], dict):
                lines.append(f"  {key} ({len(val)}건):")
                for item in val[:20]:
                    lines.append(f"    - {json.dumps(item, ensure_ascii=False, default=str)}")
            else:
                lines.append(f"  {key}: {val}")
        else:
            lines.append(f"  {key}: {val}")
    return "\n".join(lines)


SYSTEM_PROMPT = """너는 BRKorea HQ Console의 점포 운영 AI 어시스턴트다.

원칙:
- 반드시 제공된 DB 조회 결과만 근거로 답변한다.
- DB 조회 결과가 없으면 "현재 조회 가능한 데이터에서는 확인되지 않습니다."라고 답한다.
- 숫자는 가능한 한 원본 값과 단위를 함께 표시한다.
- 전주 대비, 전월 대비 같은 비교 질문은 조회 결과에 비교 기준 데이터가 있을 때만 답한다.
- 사용자가 특정 점포/지역/기간을 말하면 해당 조건을 우선 적용한다.
- SQL, 내부 테이블명, API Key, 서버 경로 같은 내부 구현 정보를 사용자에게 노출하지 않는다.
- 위험/주의/정상 같은 상태는 DB의 상태값 또는 서비스에서 정의된 기준만 사용한다.
- 답변은 간결하고 명확하게 한다."""


@router.post("/api/hq-ai/chat")
async def hq_ai_chat(payload: ChatRequest, request: Request):
    """HQ multi-store AI chat with DB-backed RAG."""
    check_prompt_safety(payload.message)
    app = request.app
    data_store = app.state.data_store
    llm_client: LLMClient = app.state.llm_client

    start = time.time()

    # 1. Classify domain
    domain = _classify_domain(payload.message)
    user_msg = payload.message or ""

    # 2. Determine which domains to gather (cross-domain for compound questions)
    domains_to_gather = {domain}
    if any(kw in user_msg for kw in ["위험", "주의", "상태", "현황"]):
        domains_to_gather.add("점포현황")
    if any(kw in user_msg for kw in ["위험", "품절", "재고", "부족"]):
        domains_to_gather.add("재고")
    if any(kw in user_msg for kw in ["매출", "순위", "점포 비교"]):
        domains_to_gather.add("매출분석")

    # 3. Gather data in parallel
    gathered_data: dict[str, Any] = {}
    sources = []
    gather_tasks = []
    for d in sorted(domains_to_gather):
        fn = GATHERERS.get(d)
        if fn:
            gather_tasks.append((_safe_gather(d, fn, data_store), d))

    if gather_tasks:
        results = await asyncio.gather(*[t[0] for t in gather_tasks])
        for result, d in zip(results, [t[1] for t in gather_tasks]):
            gathered_data[d] = result
            sources.append({
                "type": "db",
                "domain": d,
                "summary": f"{result.get('title', d)} 조회 기준 {datetime.now(UTC).strftime('%Y-%m-%d')}",
                "has_error": result.get("error") is not None,
            })

    # 4. Build context text
    context_parts = [_data_to_text(gathered_data[d]) for d in sorted(domains_to_gather) if d in gathered_data]
    context_text = "\n\n".join(context_parts) if context_parts else "조회 데이터가 없습니다."

    # 5. Call LLM
    try:
        result = await llm_client.summarize(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=f"### 조회 데이터\n{context_text}\n\n### 사용자 질문\n{user_msg}\n\n위 조회 데이터만 근거로 질문에 간결하게 답변하세요.",
            max_tokens=2048,
        )
        answer = result["content"]
        tokens = result["tokens"]
    except Exception as e:
        return {
            "error": "ai_server_error",
            "answer": "AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
            "domain": domain,
            "sources": sources,
        }

    latency_ms = round((time.time() - start) * 1000)

    return {
        "answer": answer,
        "domain": domain,
        "sources": sources,
        "latency_ms": latency_ms,
        "token_usage": tokens,
    }


async def _safe_gather(domain: str, fn, data_store) -> dict[str, Any]:
    try:
        return await fn(data_store)
    except Exception as e:
        return {"title": domain, "error": str(e)}
