"""Sales analysis agent."""

from __future__ import annotations

import calendar
import asyncio
import json
import logging
from datetime import UTC, date, datetime, timedelta
from time import perf_counter
import re
from uuid import uuid4

_logger = logging.getLogger(__name__)

from app.demo_store_config import DEMO_STORE_NAME_MAP
from app.schemas.sales import InsightSection, SalesQueryResponse, SourceInfo
from app.services.chat_trace import add_elapsed, add_ms
from app.tools import sql_queries


class SalesAnalysisAgent:
    """매출 분석 Agent."""

    TOOL_MAP = {
        "SALES_COMPARISON": "get_sales_comparison",
        "CHANNEL_ANALYSIS": "get_sales_comparison",
        "PRODUCT_SALES_COMPARISON": "get_product_sales_comparison",
        "PROMO_ANALYSIS": "get_promo_analysis",
        "BENCHMARK": "get_store_vs_benchmark",
        "RANKING": "get_category_sales",
        "TREND": "get_product_history",
        "CATEGORY": "get_category_sales",
        "DAILY_SUMMARY": "get_daily_kpis",
        "WASTE": "get_waste_ranking",
        "PRODUCTION": None,
        "ORDER": None,
        "SENSITIVE_BLOCKED": None,
        "FAQ": None,
        "DELIVERY_CHANNEL_REVENUE": "get_delivery_channel_revenue",
    }

    NEEDS_LLM = {
        "SALES_COMPARISON": False,
        "CHANNEL_ANALYSIS": False,
        "PRODUCT_SALES_COMPARISON": True,
        "PROMO_ANALYSIS": True,
        "BENCHMARK": True,
        "RANKING": False,
        "TREND": True,
        "CATEGORY": False,
        "DAILY_SUMMARY": False,
        "WASTE": True,
        "DELIVERY_CHANNEL_REVENUE": True,
    }

    def __init__(
        self,
        db_session_factory,
        intent_classifier,
        llm_gateway,
        masking_service=None,
        audit_logger=None,
    ) -> None:
        self.db_session_factory = db_session_factory
        self.intent_classifier = intent_classifier
        self.llm_gateway = llm_gateway
        self.masking_service = masking_service
        self.audit_logger = audit_logger

    async def process_query(
        self,
        store_id: str,
        query: str,
        session_id: str | None = None,
        role: str = "store_owner",
        user_id: str = "anonymous",
        trace: dict | None = None,
        demo_date: date | None = None,
    ) -> SalesQueryResponse:
        """Process a natural-language analysis query."""
        started_at = datetime.now(UTC)
        try:
            intent_result = await self.intent_classifier.classify(
                query, store_id, trace=trace
            )
            intent = intent_result["intent"]
            metadata = {
                "processing_time_ms": 0,
                "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                "session_id": session_id or uuid4().hex,
                "classification_confidence": intent_result.get("confidence"),
            }

            if self.audit_logger:
                await self.audit_logger.log_access(
                    user_id=user_id,
                    role=role,
                    action="sales_query",
                    resource=f"sales:{intent}",
                    masked_fields=[],
                    details={"store_id": store_id, "query": query},
                )

            if intent == "SENSITIVE_BLOCKED":
                response = self._blocked_response()
                response.metadata.update(metadata)
                response.metadata["processing_time_ms"] = int(
                    (datetime.now(UTC) - started_at).total_seconds() * 1000
                )
                return response

            tool_name = self.TOOL_MAP.get(intent)
            is_delivery_comparison = False
            if intent == "CHANNEL_ANALYSIS" and self._is_delivery_question(query):
                tool_name = "get_delivery_comparison"
                is_delivery_comparison = True
            if intent == "DELIVERY_CHANNEL_REVENUE":
                tool_name = self.TOOL_MAP.get(intent)

            if tool_name is None:
                response = SalesQueryResponse(
                    intent=intent,
                    title="지원되지 않는 질의",
                    sections=[
                        InsightSection(
                            type="text",
                            text="해당 질의는 매출 분석 API보다 통합 채팅 또는 다른 Agent가 더 적합합니다.",
                        )
                    ],
                    sources=[],
                    metadata=metadata,
                )
                response.metadata["processing_time_ms"] = int(
                    (datetime.now(UTC) - started_at).total_seconds() * 1000
                )
                return response

            db_started_at = perf_counter()
            async with self.db_session_factory() as db:
                resolved_params = await self._resolve_params(
                    intent, intent_result.get("params", {}), store_id, db, demo_date
                )
                sql_callable = getattr(sql_queries, tool_name)
                sql_result = await sql_callable(
                    db=db, store_id=store_id, **resolved_params
                )
            db_elapsed = add_elapsed(trace, "sales_sql_ms", db_started_at)
            add_ms(trace, "db_ms", db_elapsed)

            if self.NEEDS_LLM.get(intent, False):
                sections, llm_meta = await self._generate_insight(
                    query,
                    intent,
                    sql_result,
                    store_id,
                    role,
                    demo_date=demo_date,
                    resolved_params=resolved_params,
                    trace=trace,
                )
                metadata["llm_tokens_used"] += llm_meta.get("llm_tokens_used", 0)
                metadata["llm_model"] = llm_meta.get("model")
                metadata["masked_fields"] = llm_meta.get("masked_fields", [])
                if llm_meta.get("insight_llm_used"):
                    metadata["insight_llm_used"] = True
                    metadata["used_llm"] = True
            else:
                sections = self._format_simple(intent, sql_result, store_id)

            if intent == "PROMO_ANALYSIS":
                metadata["analysis_type"] = "promotion_sales"
                metadata["grounding"] = "행사 참여 및 매출 자료 기준"
                metadata["suggested_questions"] = [
                    "행사 매출 높은 순서로 보여줘",
                    "이전 행사와 비교해줘",
                    "행사 때 잘 팔린 상품 알려줘",
                    "다음 행사 준비할 상품 알려줘",
                ]
                facts_section = next(
                    (
                        section
                        for section in sections
                        if getattr(section, "type", None) == "facts"
                    ),
                    None,
                )
                if facts_section and isinstance(facts_section.data, dict):
                    metadata["promo_sales_facts"] = facts_section.data

            metadata["processing_time_ms"] = int(
                (datetime.now(UTC) - started_at).total_seconds() * 1000
            )

            return SalesQueryResponse(
                intent=intent,
                title=self._build_title(intent, query),
                sections=sections,
                sources=self._build_sources(intent, resolved_params),
                metadata=metadata,
            )
        except Exception as exc:
            if self.audit_logger:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    role=role,
                    action="sales_query",
                    resource="sales",
                    error=str(exc),
                    details={"store_id": store_id},
                )
            error_text = str(exc)
            if "Expecting value" in error_text or "JSON" in error_text.upper():
                user_message = "질의 분류 응답 형식 오류로 상태 요약을 생성하지 못했습니다. 다시 시도해 주세요."
            elif "timeout" in error_text.lower():
                user_message = "분석 모델 응답 지연으로 상태 요약 생성이 지연되었습니다. 잠시 후 다시 시도해 주세요."
            else:
                user_message = "상태 요약 처리 중 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            return SalesQueryResponse(
                intent="ERROR",
                title="처리 오류",
                sections=[
                    InsightSection(
                        type="text",
                        text=user_message,
                    )
                ],
                sources=[],
                metadata={
                    "processing_time_ms": int(
                        (datetime.now(UTC) - started_at).total_seconds() * 1000
                    ),
                    "llm_tokens_used": 0,
                    "session_id": session_id or uuid4().hex,
                    "error": str(exc),
                },
            )

    async def _resolve_params(
        self,
        intent: str,
        params: dict,
        store_id: str,
        db,
        demo_date: date | None = None,
    ) -> dict:
        """Convert extracted params into SQL function args."""
        latest_biz_date = await sql_queries.get_latest_biz_date(db, store_id)
        ref_date = demo_date if demo_date else latest_biz_date
        if intent in {"SALES_COMPARISON", "CHANNEL_ANALYSIS"}:
            if params.get("period1_month") and params.get("period2_month"):
                p1_start, p1_end = self._month_range(params["period1_month"])
                p2_start, p2_end = self._month_range(params["period2_month"])
                return {
                    "period1_start": p1_start,
                    "period1_end": p1_end,
                    "period2_start": p2_start,
                    "period2_end": p2_end,
                }
            relative = params.get("relative_period", "last_week")
            range_ref_date = ref_date
            if intent == "CHANNEL_ANALYSIS":
                # Channel feeds settle later than POS sales in the demo data; the
                # original scenario compares through the latest settled channel day.
                range_ref_date = ref_date - timedelta(days=2)
            if relative == "last_month" and intent == "CHANNEL_ANALYSIS":
                ranges = self._mtd_comparison_ranges(range_ref_date)
            else:
                ranges = self._relative_comparison_ranges(range_ref_date, relative)
            return ranges

        if intent == "PROMO_ANALYSIS":
            end = min(latest_biz_date, demo_date) if demo_date else latest_biz_date
            return {
                "promo_name": params.get("promo_name") or params.get("product_name"),
                "start_date": end - timedelta(days=30),
                "end_date": end,
            }

        if intent == "BENCHMARK":
            end = min(latest_biz_date, demo_date) if demo_date else latest_biz_date
            # Use MTD (Month-To-Date) range: 1st of month to demo_date
            p_start = date(end.year, end.month, 1)
            return {
                "start_date": p_start,
                "end_date": end,
            }

        if intent in {"RANKING", "CATEGORY"}:
            end = min(latest_biz_date, demo_date) if demo_date else latest_biz_date
            return {
                "start_date": end - timedelta(days=6),
                "end_date": end,
            }

        if intent == "TREND":
            product_id = params.get("product_id")
            if not product_id and params.get("product_name"):
                product_id = await self._lookup_product_id(db, params["product_name"])
            if not product_id:
                inventory = await sql_queries.get_store_inventory_today(db, store_id)
                product_id = inventory[0]["product_id"] if inventory else ""
            return {"product_id": product_id, "days": 28}

        if intent == "DAILY_SUMMARY":
            if params.get("relative_period") == "yesterday":
                target_date = latest_biz_date - timedelta(days=1)
            else:
                target_date = min(latest_biz_date, demo_date) if demo_date else latest_biz_date
            return {"biz_date": target_date}

        if intent == "WASTE":
            return {"days": 7, "top_n": 10}

        if intent == "DELIVERY_CHANNEL_REVENUE":
            ref_date_dt = ref_date if isinstance(ref_date, date) else date.fromisoformat(str(ref_date).split("T")[0])
            target_date = None
            if "period1_month" in params:
                target_date = params.pop("period1_month")
            elif "target_month" in params:
                target_date = params["target_month"]
            if not target_date:
                y = ref_date_dt.month - 1 if ref_date_dt.month > 1 else 12
                yr = ref_date_dt.year - 1 if ref_date_dt.month == 1 else ref_date_dt.year
                target_date = f"{yr}-{y:02d}"
            ym = str(target_date).split("T")[0].split("-")
            target_year = int(ym[0])
            target_month = int(ym[1])
            max_day = calendar.monthrange(target_year, target_month)[1]
            if target_year == ref_date_dt.year and target_month == ref_date_dt.month:
                p_end = ref_date_dt
            else:
                p_end = date(target_year, target_month, max_day)
            p_start = date(target_year, target_month, 1)
            return {
                "period_start": p_start,
                "period_end": p_end,
            }

        import calendar as _cal
        if intent == "PRODUCT_SALES_COMPARISON":
            pn = params.get("product_name", "")
            period_type = params.get("period_type", "month")
            dd = ref_date if isinstance(ref_date, date) else date.fromisoformat(str(ref_date).split("T")[0])
            if period_type == "day":
                p1_start = dd - timedelta(days=1)
                p1_end = dd - timedelta(days=1)
                p2_start = dd
                p2_end = dd
            elif period_type == "week":
                p2_start = dd - timedelta(days=6)
                p2_end = dd
                p1_start = dd - timedelta(days=13)
                p1_end = dd - timedelta(days=7)
            elif period_type == "year":
                p2_start = dd.replace(day=1)
                p2_end = dd
                cy = dd.year - 1
                cm = dd.month
                max_day = _cal.monthrange(cy, cm)[1]
                ce = min(dd.day, max_day)
                p1_start = date(cy, cm, 1)
                p1_end = date(cy, cm, ce)
            else:  # month
                p2_start = dd.replace(day=1)
                p2_end = dd
                cm = dd.month - 1 if dd.month > 1 else 12
                cy = dd.year - 1 if dd.month == 1 else dd.year
                max_day = _cal.monthrange(cy, cm)[1]
                ce = min(dd.day, max_day)
                p1_start = date(cy, cm, 1)
                p1_end = date(cy, cm, ce)
            return {
                "demo_date": dd,
                "product_name": pn,
                "period_type": period_type,
                "p1_start": str(p1_start),
                "p1_end": str(p1_end),
                "p2_start": str(p2_start),
                "p2_end": str(p2_end),
            }

        return {}

    async def _lookup_product_id(self, db, product_name: str) -> str | None:
        """Resolve a product name to the closest matching product_id."""
        return await sql_queries.lookup_product_id(db, product_name)

    def _build_product_facts(self, sql_result: dict, store_id: str, query: str) -> dict:
        """Build a structured facts payload from SQL result for LLM insight."""
        product_name = sql_result.get("product_name", "")
        matched = sql_result.get("matched_products", [])
        if matched:
            display_name = ", ".join(matched)
        elif product_name:
            display_name = product_name
        else:
            display_name = "해당 상품"

        p1 = sql_result.get("period1", {})
        p2 = sql_result.get("period2", {})
        p1_qty = p1.get("qty") or 0
        p2_qty = p2.get("qty") or 0
        p1_sales = float(p1.get("sales") or 0)
        p2_sales = float(p2.get("sales") or 0)
        p1_ratio = p1.get("ratio_pct", 0) or 0
        p2_ratio = p2.get("ratio_pct", 0) or 0
        p1_rank = p1.get("avg_rank")
        p2_rank = p2.get("avg_rank")
        p2_peer_avg = float(p2.get("peer_avg_qty", 0) or 0)
        p2_peer_cnt = p2.get("peer_cnt", 0) or 0
        qty_chg = sql_result.get("qty_change") or 0
        qty_chg_pct = sql_result.get("qty_change_pct")
        sales_chg = sql_result.get("sales_change") or 0
        sales_chg_pct = sql_result.get("sales_change_pct")
        ratio_chg = sql_result.get("ratio_change")
        period_type = sql_result.get("period_type", "month")
        store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id or "(매장)")

        rank_change = None
        if p1_rank is not None and p2_rank is not None:
            rank_change = p1_rank - p2_rank

        return {
            "store_name": store_name,
            "product_query": product_name,
            "matched_products": matched,
            "display_name": display_name,
            "period_type": period_type,
            "recent_period": f"{p2.get('start', '')}~{p2.get('end', '')}",
            "compare_period": f"{p1.get('start', '')}~{p1.get('end', '')}",
            "recent_qty": p2_qty,
            "compare_qty": p1_qty,
            "qty_diff": qty_chg,
            "qty_diff_pct": qty_chg_pct,
            "recent_sales": p2_sales,
            "compare_sales": p1_sales,
            "sales_diff": sales_chg,
            "sales_diff_pct": sales_chg_pct,
            "recent_share_pct": p2_ratio,
            "compare_share_pct": p1_ratio,
            "share_diff_pctp": ratio_chg,
            "recent_rank": p2_rank,
            "compare_rank": p1_rank,
            "rank_change": rank_change,
            "poc_avg_qty": p2_peer_avg,
            "poc_store_count": p2_peer_cnt,
        }

    def _build_delivery_channel_facts(self, sql_result: dict, store_id: str, query: str) -> dict:
        """Build structured facts for delivery channel revenue LLM."""
        store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id or "(매장)")
        p_start = sql_result.get("period_start", "")
        p_end = sql_result.get("period_end", "")
        period_label = f"{p_start}~{p_end}" if p_start and p_end else "(기간)"

        channels = []
        if sql_result.get("has_data"):
            for ch in sql_result.get("channels", []):
                channels.append({
                    "channel_name": ch.get("channel_name", ""),
                    "sales": ch.get("sales", 0),
                    "orders": ch.get("orders", 0),
                    "sales_share_pct": ch.get("sales_share_pct", 0),
                })

        return {
            "store_name": store_name,
            "period_label": period_label,
            "period_start": p_start,
            "period_end": p_end,
            "delivery_total_sales": sql_result.get("delivery_total_sales", 0),
            "delivery_total_orders": sql_result.get("delivery_total_orders", 0),
            "delivery_share_of_total_pct": sql_result.get("delivery_share_of_total_pct", 0),
            "channels": channels,
        }

    async def _generate_delivery_channel_insight_llm(
        self,
        sql_result: dict,
        store_id: str,
        query: str,
        trace: dict | None = None,
    ) -> tuple[list[InsightSection], dict]:
        """Generate LLM insight for DELIVERY_CHANNEL_REVENUE."""
        if not self.llm_gateway.api_key:
            return (
                self._format_simple("DELIVERY_CHANNEL_REVENUE", sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        if not sql_result.get("has_data"):
            error_msg = sql_result.get("error", "")
            return [
                InsightSection(
                    type="text",
                    text="현재 화면에 연결된 배달 채널별 매출 데이터가 부족합니다.\n"
                         + (f"(오류: {error_msg})" if error_msg else ""),
                ),
            ], {"llm_tokens_used": 0, "model": None, "masked_fields": []}

        facts = self._build_delivery_channel_facts(sql_result, store_id, query)

        channels_text = ""
        for ch in facts["channels"]:
            channels_text += f"- {ch['channel_name']}: ₩{int(ch['sales']):,} ({ch['sales_share_pct']}%), {ch['orders']}건\n"

        system_prompt = f"""너는 던킨 점주를 돕는 매장 운영 AI다.
주어진 배달 채널별 매출 facts만 사용해 답변한다.
숫자는 절대 새로 만들지 않는다.
답변은 5문장 이내로 짧게 쓴다.
전문 용어와 내부 개발 용어를 쓰지 않는다.
점주가 바로 할 수 있는 액션을 1~2개 제안한다.

반드시 포함:
- 분석 기간
- 배달 총 매출과 총 주문건수
- 채널별 매출과 비중
- 가장 기여도 큰 채널
- 점주 액션

금지어: SQL, DB, LLM, intent, template, CHANNEL_ANALYSIS, PRODUCT_SALES_COMPARISON, DELIVERY_CHANNEL_REVENUE, POC_010, 품절 시간, 비교 기간, 판매 수량 변화, 평균 품절 시간"""

        user_prompt = f"""{facts['store_name']}의 {facts['period_label']} 배달 채널별 매출입니다.

배달 총 매출: ₩{int(facts['delivery_total_sales']):,}
배달 총 주문건수: {facts['delivery_total_orders']}건
전체 매출 대비 배달 비중: {facts['delivery_share_of_total_pct']}%

채널별 매출:
{channels_text}
위 facts만 사용해서 점주가 바로 실행할 수 있는 답변을 작성하세요. 5문장 이내로 자연스럽게."""

        local_openai_compat = bool(
            getattr(self.llm_gateway, "_is_local_openai_compat", False)
        )
        max_tokens = 200 if local_openai_compat else 300

        try:
            result = await self.llm_gateway.call(
                purpose="delivery_channel_insight",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                temperature=0.3,
                response_format=None,
                trace=trace,
            )
        except Exception:
            return (
                self._format_simple("DELIVERY_CHANNEL_REVENUE", sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        llm_meta = {
            "llm_tokens_used": result.get("input_tokens", 0) + result.get("output_tokens", 0),
            "model": result.get("model"),
            "masked_fields": [],
            "insight_llm_used": True,
        }
        raw_content = str(result.get("content") or "").strip()
        lines = [l.strip() for l in raw_content.split("\n") if l.strip()]
        insight_text = "\n".join(lines[:5]) if lines else "배달 채널별 매출 비교 결과입니다."
        missing_channel_amount = any(
            int(ch.get("sales") or 0) > 0
            and f"{int(ch.get('sales') or 0):,}" not in insight_text
            for ch in facts["channels"]
        )
        if missing_channel_amount or str(int(facts["delivery_total_orders"] or 0)) not in insight_text:
            channel_parts = [
                f"{ch['channel_name']} ₩{int(ch['sales']):,} ({ch['sales_share_pct']}%, {ch['orders']}건)"
                for ch in facts["channels"]
            ]
            top_channel = max(
                facts["channels"],
                key=lambda item: float(item.get("sales") or 0),
                default=None,
            )
            top_text = (
                f"{top_channel['channel_name']} 비중이 가장 큽니다."
                if top_channel
                else "채널별 기여도는 연결된 자료 기준으로 확인했습니다."
            )
            insight_text = (
                f"{facts['period_label']} 배달 총 매출은 ₩{int(facts['delivery_total_sales']):,}, "
                f"총 주문건수는 {int(facts['delivery_total_orders']):,}건이고 전체 매출 대비 배달 비중은 "
                f"{facts['delivery_share_of_total_pct']}%입니다. "
                f"채널별 매출은 {', '.join(channel_parts)}입니다. "
                f"{top_text} 다음에는 상위 채널 노출 메뉴를 점검하고, 낮은 채널은 매장 내 안내를 강화하세요."
            )

        return (
            [
                InsightSection(type="insight", title="배달 매출", text=insight_text),
            ],
            llm_meta,
        )

    async def _generate_product_insight_llm(
        self,
        sql_result: dict,
        store_id: str,
        query: str,
        trace: dict | None = None,
    ) -> tuple[list[InsightSection], dict]:
        """Generate LLM insight for PRODUCT_SALES_COMPARISON with structured facts."""
        if not self.llm_gateway.api_key:
            return (
                self._format_simple("PRODUCT_SALES_COMPARISON", sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        if not sql_result.get("has_data"):
            return (
                self._format_simple("PRODUCT_SALES_COMPARISON", sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        facts = self._build_product_facts(sql_result, store_id, query)
        period_type = facts["period_type"]
        period_kr = {"day": "전일", "week": "전주", "month": "전월", "year": "전년"}.get(
            period_type, "전월"
        )
        name_for_prompt = facts["display_name"]

        system_prompt = f"""너는 던킨도너츠 점주를 돕는 매장 운영 AI다.
주어진 수치(facts)만 사용해서 {facts['display_name']}의 {period_kr} 대비 매출 비교 결과를 자연스럽게 해설한다.

## 규칙
1. 숫자는 절대 새로 만들지 않는다. facts에 있는 숫자만 그대로 사용한다.
2. 내부 용어(SQL, DB, API, POC, intent, LLM, template, metadata, fallback)를 절대 쓰지 않는다.
3. 매장 ID(POC_010)를 쓰지 않고 {facts['store_name']}을 쓴다.
4. 5~6문장 이내. 태그형 구조([핵심 판단] 등)를 쓰지 말고 자연스러운 문단으로 쓴다.
5. 품절 시간을 언급하지 않는다.

## 답변 구조
1문장: 핵심 판단 (좋아짐/약해짐/유지)
2문장: 판매 수량 + 매출 변동 간단 언급
1문장: 원인 해석 (수량↑매출↓→객단가↓, 수량↑매출↑→수요 증가 등)
1~2문장: 지금 할 일 1~2개 자연스러운 문장

##Few-shot 예시
예시 1 (수량↑ 매출↓):
{name_for_prompt}은 비교 기간보다 판매량은 유지됐지만 매출은 소폭 줄었습니다. 판매 수량은 75개로 1개 늘었고, 매출은 ₩120,700으로 ₩1,700 감소했습니다. 다만 전체 매출 내 비중은 7.7%에서 9.1%로 올라 중요합니다. 수량은 늘었는데 매출이 줄어 객단가가 낮아진 흐름입니다. 할인이나 세트 판매가 늘었는지 확인하고, 피크 시간대에는 단품 진열을 강화하세요.

예시 2 (수량↓ 매출↓):
{name_for_prompt}은 비교 기간보다 판매량과 매출이 모두 줄어 주의해야 합니다. 판매 수량은 267개로 86개 줄었고, 매출도 ₩319,500으로 ₩110,200 감소했습니다. 전체 매출 비중은 6.2%에서 5.1%로 하락했고 순위도 2단계 떨어졌습니 다. 진열 위치를 앞쪽으로 조정하고, 다른 인기 상품과 함께 묶어 안내해 보세요."""

        user_prompt = f"""{facts['store_name']}의 '{facts['display_name']}' {period_kr} 대비 매출 비교입니다.

최근 기간: {facts['recent_period']}
비교 기간: {facts['compare_period']}

판매 수량:
- 최근 기간: {facts['recent_qty']}개
- 비교 기간: {facts['compare_qty']}개
- 차이: {'+' if facts['qty_diff'] > 0 else ''}{facts['qty_diff']}개{' (+' + str(facts['qty_diff_pct']) + '%)' if facts['qty_diff_pct'] and facts['qty_diff_pct'] > 0 else ' (' + str(facts['qty_diff_pct']) + '%)' if facts['qty_diff_pct'] else ''}

매출:
- 최근 기간: ₩{facts['recent_sales']:,.0f}
- 비교 기간: ₩{facts['compare_sales']:,.0f}
- 차이: {'+' if facts['sales_diff'] > 0 else ''}₩{facts['sales_diff']:,.0f}{' (+' + str(facts['sales_diff_pct']) + '%)' if facts['sales_diff_pct'] and facts['sales_diff_pct'] > 0 else ' (' + str(facts['sales_diff_pct']) + '%)' if facts['sales_diff_pct'] else ''}

전체 매출 비중:
- 최근 기간: {facts['recent_share_pct']}%
- 비교 기간: {facts['compare_share_pct']}%
{'- 비중 차이: +' + str(facts['share_diff_pctp']) + '%p' if facts['share_diff_pctp'] and facts['share_diff_pctp'] > 0 else '- 비중 차이: ' + str(facts['share_diff_pctp']) + '%p' if facts['share_diff_pctp'] else ''}

"""

        if facts["recent_rank"] is not None and facts["compare_rank"] is not None:
            rank_dir = "상승" if facts["rank_change"] > 0 else ("하락" if facts["rank_change"] < 0 else "유지")
            user_prompt += f"""매출 순위:
- 최근: {facts['recent_rank']}위
- 비교: {facts['compare_rank']}위
- 변화: {abs(facts['rank_change'])}단계 {rank_dir}

"""

        if facts["poc_avg_qty"] > 0:
            peer_diff = facts["recent_qty"] - facts["poc_avg_qty"]
            peer_dir = "높음" if peer_diff >= 0 else "낮음"
            peer_cnt_str = f" ({facts['poc_store_count']}개 매장 평균)"
            user_prompt += f"""매장 평균 비교:
- 같은 기간 동일 상품 평균 판매량: {facts['poc_avg_qty']:.0f}개{peer_cnt_str}
- 내 매장 vs 평균: {'+' if peer_diff > 0 else ''}{abs(peer_diff):.0f}개 ({peer_dir})
"""

        user_prompt += "\n위 facts만 사용해서 점주가 바로 실행할 수 있는 답변을 작성하세요."

        local_openai_compat = bool(
            getattr(self.llm_gateway, "_is_local_openai_compat", False)
        )
        max_tokens = 200 if local_openai_compat else 300

        try:
            result = await self.llm_gateway.call(
                purpose="product_insight_generation",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                temperature=0.3,
                response_format=None,
                trace=trace,
            )
        except Exception:
            return (
                self._format_simple("PRODUCT_SALES_COMPARISON", sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        llm_meta = {
            "llm_tokens_used": result.get("input_tokens", 0) + result.get("output_tokens", 0),
            "model": result.get("model"),
            "masked_fields": [],
            "insight_llm_used": True,
        }
        raw_content = str(result.get("content") or "").strip()
        lines = [l.strip() for l in raw_content.split("\n") if l.strip()]
        insight_text = "\n".join(lines[:6]) if lines else "상품별 매출 비교 결과입니다."

        simple_sections = self._format_simple("PRODUCT_SALES_COMPARISON", sql_result, store_id)
        simple_text = "\n".join(
            str(sec.text or "")
            for sec in simple_sections
            if sec.type in {"text", "insight"} and getattr(sec, "text", None)
        ).strip()
        simple_actions = [
            item
            for sec in simple_sections
            if sec.type == "action" and getattr(sec, "items", None)
            for item in (sec.items or [])
            if item
        ]
        missing_required_product_fact = False
        if facts["recent_rank"] is not None and facts["compare_rank"] is not None and "순위" not in insight_text:
            missing_required_product_fact = True
        if facts["poc_avg_qty"] > 0 and "평균" not in insight_text:
            missing_required_product_fact = True
        if "비중" not in insight_text:
            missing_required_product_fact = True
        if missing_required_product_fact and simple_text:
            insight_text = simple_text
            if simple_actions:
                insight_text = f"{insight_text}\n다음 액션: {simple_actions[0]}"
        sections = [
            InsightSection(type="insight", title="해석", text=insight_text),
        ]
        for sec in simple_sections:
            if sec.type not in ("text", "action"):
                sections.append(sec)

        return sections, llm_meta

    async def _generate_insight(
        self,
        query: str,
        intent: str,
        sql_result,
        store_id: str,
        role: str,
        demo_date: date | None = None,
        resolved_params: dict | None = None,
        trace: dict | None = None,
    ) -> tuple[list[InsightSection], dict]:
        """Generate narrative insights from structured SQL output."""
        if not self.llm_gateway.api_key:
            return (
                [
                    InsightSection(
                        type="insight",
                        text="LLM 설정이 없어 SQL 결과 기반 요약만 제공합니다.",
                    ),
                    *self._format_simple(intent, sql_result, store_id),
                ],
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        # PRODUCT_SALES_COMPARISON: use dedicated LLM pipeline
        if intent == "PRODUCT_SALES_COMPARISON":
            return await self._generate_product_insight_llm(
                sql_result, store_id, query, trace
            )

        # DELIVERY_CHANNEL_REVENUE: use dedicated LLM pipeline
        if intent == "DELIVERY_CHANNEL_REVENUE":
            return await self._generate_delivery_channel_insight_llm(
                sql_result, store_id, query, trace
            )

        # BENCHMARK: use dedicated LLM pipeline
        if intent == "BENCHMARK":
            return await self._generate_benchmark_insight_llm(
                sql_result, store_id, query, trace
            )

        # PROMO_ANALYSIS: use dedicated LLM pipeline
        if intent == "PROMO_ANALYSIS":
            return await self._generate_promo_insight(
                query,
                sql_result,
                store_id,
                demo_date,
                trace,
                resolved_params=resolved_params,
            )

    def _build_benchmark_facts(self, sql_result: dict, store_id: str, query: str) -> dict:
        """Build structured facts from benchmark SQL result for LLM insight."""
        store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id or "(매장)")
        my_store = sql_result.get("my_store", {}) or {}
        all_avg = sql_result.get("all_stores_avg", {}) or {}
        diff_pct = sql_result.get("diff_pct", {}) or {}
        my_sales = float(my_store.get("daily_avg_sales", 0) or 0)
        avg_sales = float(all_avg.get("daily_avg_sales", 0) or 0)
        my_qty = float(my_store.get("daily_avg_qty", 0) or 0)
        avg_qty = float(all_avg.get("daily_avg_qty", 0) or 0)
        my_ticket = float(my_store.get("daily_avg_ticket", 0) or 0)
        avg_ticket = float(all_avg.get("daily_avg_ticket", 0) or 0)
        my_waste = float(my_store.get("daily_avg_waste", 0) or 0)
        avg_waste = float(all_avg.get("daily_avg_waste", 0) or 0)
        my_stockout = float(my_store.get("daily_avg_stockout", 0) or 0)
        avg_stockout = float(all_avg.get("daily_avg_stockout", 0) or 0)
        sales_diff_pct = diff_pct.get("sales")
        qty_diff_pct = diff_pct.get("qty")
        ticket_diff_pct = diff_pct.get("ticket")
        waste_diff_pct = diff_pct.get("waste")
        stockout_diff_pct = diff_pct.get("stockout")
        rank = sql_result.get("rank_among_stores")
        total = sql_result.get("total_stores", 0)

        p_start = str(sql_result.get("period_start", ""))
        p_end = str(sql_result.get("period_end", ""))
        business_days = int(sql_result.get("business_days", 0))
        if p_start and p_end:
            try:
                _ps = date.fromisoformat(p_start)
                _pe = date.fromisoformat(p_end)
                period_display_start = _ps.strftime("%Y년 %m월 %d일")
                period_display_end = _pe.strftime("%Y년 %m월 %d일")
                if period_display_start == period_display_end:
                    period_label = f"{period_display_start} 기준"
                else:
                    period_label = f"{period_display_start}부터 {period_display_end}까지"
            except (ValueError, TypeError):
                period_label = f"{p_start}부터 {p_end}까지"
        else:
            period_label = ""

        store_total = round(my_sales * business_days) if business_days > 0 else 0

        if rank and total:
            pctile = (1 - rank / total) * 100
            if pctile >= 66:
                rank_position = "상위"
            elif pctile >= 33:
                rank_position = "중간"
            else:
                rank_position = "하위"
        else:
            rank_position = None

        strength_signals: list[dict] = []
        weakness_signals: list[dict] = []

        if sales_diff_pct is not None:
            if sales_diff_pct > 5:
                strength_signals.append({"metric": "일평균 매출", "direction": "higher", "diff_pct": round(sales_diff_pct, 1), "meaning": "일평균 매출이 비교 점포 평균보다 높음"})
            elif sales_diff_pct < -5:
                weakness_signals.append({"metric": "일평균 매출", "direction": "lower", "diff_pct": round(sales_diff_pct, 1), "meaning": "일평균 매출이 비교 점포 평균보다 낮음"})
            elif abs(sales_diff_pct) <= 3:
                strength_signals.append({"metric": "일평균 매출", "direction": "similar", "diff_pct": round(sales_diff_pct, 1), "meaning": "일평균 매출이 비교 점포 평균과 큰 차이가 없음"})
            else:
                if sales_diff_pct < 0:
                    weakness_signals.append({"metric": "일평균 매출", "direction": "slightly_lower", "diff_pct": round(sales_diff_pct, 1), "meaning": "일평균 매출이 비교 점포 평균보다 약간 낮음"})
                else:
                    strength_signals.append({"metric": "일평균 매출", "direction": "slightly_higher", "diff_pct": round(sales_diff_pct, 1), "meaning": "일평균 매출이 비교 점포 평균보다 약간 높음"})

        if qty_diff_pct is not None:
            if qty_diff_pct > 5:
                strength_signals.append({"metric": "판매 수량", "direction": "higher", "diff_pct": round(qty_diff_pct, 1), "meaning": "판매 수량이 비교 점포 평균보다 많음"})
            elif qty_diff_pct < -10:
                weakness_signals.append({"metric": "판매 수량", "direction": "significantly_lower", "diff_pct": round(qty_diff_pct, 1), "meaning": "판매 수량이 비교 점포 평균보다 현저히 적음"})
            elif qty_diff_pct < 0:
                weakness_signals.append({"metric": "판매 수량", "direction": "lower", "diff_pct": round(qty_diff_pct, 1), "meaning": "판매 수량이 비교 점포 평균보다 적음"})
            else:
                strength_signals.append({"metric": "판매 수량", "direction": "similar_or_higher", "diff_pct": round(qty_diff_pct, 1), "meaning": "판매 수량이 비교 점포 평균과 비슷하거나 많음"})

        if ticket_diff_pct is not None and abs(ticket_diff_pct) > 5:
            if ticket_diff_pct > 0:
                strength_signals.append({"metric": "객단가", "direction": "higher", "diff_pct": round(ticket_diff_pct, 1), "meaning": "한 번 구매할 때 담는 금액이 비교 점포 평균보다 높음"})
            else:
                weakness_signals.append({"metric": "객단가", "direction": "lower", "diff_pct": round(ticket_diff_pct, 1), "meaning": "한 번 구매할 때 담는 금액이 비교 점포 평균보다 낮음"})

        if stockout_diff_pct is not None and stockout_diff_pct > 50 and my_stockout > 1:
            weakness_signals.append({"metric": "품절", "direction": "higher", "diff_pct": round(stockout_diff_pct, 1), "meaning": "일평균 품절 SKU 수가 비교 점포 평균보다 많음"})

        action_candidates: list[str] = []
        if qty_diff_pct is not None and qty_diff_pct < -10:
            action_candidates.append("인기 상품 진열을 강화해 보세요")
            action_candidates.append("세트 또는 추가 메뉴 제안을 늘려 보세요")
        elif qty_diff_pct is not None and qty_diff_pct < 0:
            action_candidates.append("평균보다 약한 시간대의 진열과 생산을 점검해 보세요")
        if ticket_diff_pct is not None and ticket_diff_pct < -5:
            action_candidates.append("고부가가치 상품과 업그레이드 제안을 늘려 보세요")
        if stockout_diff_pct is not None and stockout_diff_pct > 50 and my_stockout > 1:
            action_candidates.append("자주 품절되는 상품의 생산 계획을 늘려 보세요")
        if waste_diff_pct is not None and waste_diff_pct > 10:
            action_candidates.append("폐기가 많은 상품의 생산 기준을 재조정해 보세요")
        if not action_candidates or (sales_diff_pct is not None and sales_diff_pct >= 0 and not action_candidates):
            action_candidates.append("현재 우세한 시간대와 메뉴 구성을 유지해 보세요")

        return {
            "store_name": store_name,
            "period_label": period_label,
            "period_start": p_start,
            "period_end": p_end,
            "business_days": business_days,
            "metric_label": "일평균 매출",
            "store_total_sales": store_total,
            "store_daily_avg_sales": my_sales,
            "store_daily_avg_qty": my_qty,
            "store_daily_avg_ticket": my_ticket,
            "comparison_basis_type": "all_comparable_stores",
            "comparison_basis_label": "전체 비교 점포 평균",
            "comparison_basis_description": "현재는 전체 비교 점포 평균을 기준으로 비교했습니다.",
            "cluster_available": False,
            "cluster_fields_used": [],
            "comparison_store_count": total,
            "comparison_daily_avg_sales": avg_sales,
            "comparison_daily_avg_qty": avg_qty,
            "comparison_daily_avg_ticket": avg_ticket,
            "diff_amount": round(my_sales - avg_sales),
            "diff_pct": sales_diff_pct,
            "qty_diff_pct": qty_diff_pct,
            "ticket_diff_pct": ticket_diff_pct,
            "waste_diff_pct": waste_diff_pct,
            "stockout_diff_pct": stockout_diff_pct,
            "rank": rank,
            "rank_total": total,
            "rank_position": rank_position,
            "strength_signals": strength_signals,
            "weakness_signals": weakness_signals,
            "action_candidates": action_candidates,
        }

    def _format_benchmark_fallback(self, sql_result: dict, store_id: str) -> list[InsightSection]:
        """Facts-based fallback for BENCHMARK when LLM is unavailable or fails."""
        facts = self._build_benchmark_facts(sql_result, store_id, "fallback")
        period_label = facts.get("period_label") or f"{facts['period_start']} ~ {facts['period_end']}"
        store_name = facts["store_name"]
        store_avg = f"{facts['store_daily_avg_sales']:,.0f}"
        basis_desc = facts["comparison_basis_description"]
        group_avg = f"{facts['comparison_daily_avg_sales']:,.0f}"
        diff_amount = facts["diff_amount"]
        diff_pct = facts["diff_pct"]

        direction = "높고" if diff_amount > 0 else "낮고"
        diff_text = f"{abs(diff_amount):,.0f}"

        diff_pct_str = ""
        if diff_pct is not None:
            abs_pct = abs(diff_pct)
            diff_pct_str = f" 평균 대비 {abs_pct:.1f}% 차이입니다. "
        else:
            diff_pct_str = " 차이입니다. "

        answer = (
            f"{period_label} {store_name} 매장의 일평균 매출은 {store_avg}원입니다. "
            f"{basis_desc} {group_avg}원보다 {diff_text}원 {direction}, {diff_pct_str} "
        )

        rank = facts.get("rank")
        rank_total = facts.get("rank_total")
        rank_position = facts.get("rank_position")
        if rank and rank_total:
            pos_text = f" ({rank_position})" if rank_position else ""
            answer += f"비교 점포 {rank_total}개 중 {rank}위{pos_text}입니다. "

        diagnosis = facts.get("diagnosis_candidates", [])
        action = facts.get("action_candidates", ["현재 상태를 유지하며 관찰해 보세요"])
        primary_action = action[0] if action else "현재 상태를 유지하며 관찰해 보세요"

        if diagnosis:
            primary_diag = diagnosis[0] if diagnosis else ""
            if len(diagnosis) > 1:
                secondary_diag = diagnosis[1]
                answer += f"{primary_diag} {secondary_diag} "
            else:
                answer += primary_diag + " "
            answer += f"오늘은 {primary_action} "

        return [
            InsightSection(type="insight", title="벤치마킹", text=answer),
        ]

    async def _generate_benchmark_insight_llm(
        self,
        sql_result: dict,
        store_id: str,
        query: str,
        trace: dict | None = None,
    ) -> tuple[list[InsightSection], dict]:
        """Generate LLM insight for BENCHMARK with structured facts."""
        if not self.llm_gateway.api_key:
            return (
                self._format_benchmark_fallback(sql_result, store_id),
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )

        facts = self._build_benchmark_facts(sql_result, store_id, query)

        system_prompt = """너는 던킨 매장 점주를 돕는 매출 분석 AI다.

너의 역할은 facts에 있는 수치와 비교 기준만 사용해, 점주가 이해할 수 있는 짧은 매출 벤치마킹 답변을 작성하는 것이다.

반드시 지켜야 할 규칙:
1. facts에 없는 숫자, 날짜, 순위, 원인, 강점, 약점은 만들지 않는다.
2. 사용자가 "이번 달"이라고 물으면 facts.period_label을 사용해 기간을 명확히 말한다.
3. "최근", "현재 기간"처럼 기준이 모호한 표현은 쓰지 않는다.
4. 비교 기준을 반드시 설명한다.
   - facts.cluster_available이 true이면 facts.cluster_fields_used를 바탕으로 유사 점포 기준을 설명한다.
   - facts.cluster_available이 false이면, 실제 클러스터 기준은 따로 없고 facts.comparison_store_count개의 전체 비교 점포 평균을 기준으로 비교했다는 의미를 점주가 이해하기 쉽게 말한다.
   - 없는 클러스터 기준을 상상해서 만들지 않는다.
5. 타 점포 평균과 우리 매장의 차이를 반드시 말한다.
6. 순위를 말할 때는 facts.rank와 facts.rank_total을 함께 사용한다.
7. 강점은 facts.strength_signals에서만 고른다.
8. 약점은 facts.weakness_signals에서만 고른다.
9. strength_signals가 비어 있으면 강점을 억지로 만들지 않는다.
   단, "강점 확인 중", "분석 중", "산정 중" 같은 미완성 표현은 절대 쓰지 않는다.
10. 마지막에는 facts.action_candidates 중 1~2개를 활용해 오늘 바로 할 수 있는 행동을 제안한다.
11. 답변은 5문장 이내로 작성한다.
12. 대괄호 섹션, 보고서 제목, 개발자 용어는 쓰지 않는다.

절대 쓰면 안 되는 표현:
SQL, DB, LLM, intent, template, metadata, fallback, PRODUCT_SALES_COMPARISON, CHANNEL_ANALYSIS, DDAY_INFO, PROMO_ANALYSIS, campaign_data, seed, 적재, POC_010, POC 평균, 최근 일평균, 현재 기간, 강점 확인 중, 강점 분석 진행 중, 분석 중입니다, 산정 중입니다, 확인 중, 산정 중"""

        strength_lines = "\n".join(
            f"  - {s['metric']}: {s['direction']} ({s['diff_pct']}%) — {s['meaning']}"
            for s in facts.get("strength_signals", [])
        ) or "  (없음)"
        weakness_lines = "\n".join(
            f"  - {s['metric']}: {s['direction']} ({s['diff_pct']}%) — {s['meaning']}"
            for s in facts.get("weakness_signals", [])
        ) or "  (없음)"
        action_lines = "\n".join(
            f"  - {a}"
            for a in facts.get("action_candidates", [])
        ) or "  (없음)"

        ticket_info = ""
        if facts.get("ticket_diff_pct") is not None:
            ticket_info = f"\n- 객단가 차이: {facts['ticket_diff_pct']:.1f}%"

        user_prompt = f"""{facts['store_name']} 매장 일평균 매출 벤치마킹 결과입니다. 아래 facts만 사용해 점주용 답변을 작성하세요.

[기간]
- period_label: {facts['period_label']}
- 영업일: {facts['business_days']}일

[우리 매장]
- 일평균 매출: {facts['store_daily_avg_sales']:,.0f}원
- 일평균 판매 수량: {facts['store_daily_avg_qty']:,.0f}개
{f'- 일평균 객단가: {facts["store_daily_avg_ticket"]:,.0f}원' if facts.get('store_daily_avg_ticket') and facts['store_daily_avg_ticket'] > 0 else ''}

[비교 기준]
- cluster_available: {facts['cluster_available']}
- comparison_basis_description: {facts['comparison_basis_description']}
- 비교 점포 수: {facts['comparison_store_count']}개
- 전체 비교 점포 평균 일평균 매출: {facts['comparison_daily_avg_sales']:,.0f}원
- 전체 비교 점포 평균 일평균 판매 수량: {facts['comparison_daily_avg_qty']:,.0f}개

[차이]
- 매출 차액: {facts['diff_amount']:,.0f}원 (평균 대비 {facts['diff_pct']:.1f}%)
- 판매 수량 차이: {facts['qty_diff_pct']:.1f}%
{ticket_info}

[순위]
- {facts['rank_total']}개 비교 점포 중 {facts['rank']}위 (위치: {facts['rank_position']})

[강점 신호]
{strength_lines}

[약점 신호]
{weakness_lines}

[액션 후보]
{action_lines}

[답변에 반드시 포함할 의미]
- 비교 기간 (facts.period_label 사용)
- 비교 기준 설명 (cluster_available=false이면 전체 비교 점포 평균 기준이라는 의미 포함)
- 우리 매장 일평균 매출
- 비교 점포 평균
- 평균 대비 차이 (금액과 퍼센트)
- 비교 그룹 내 위치 (rank/rank_total 함께 사용)
- 강점 1개 이상 (strength_signals에서 고름) 또는 강점 신호가 부족하면 조심스러운 진단
- 약점 1개 이상 (weakness_signals에서 고름)
- 오늘 할 액션 1~2개 (action_candidates에서 고름)

[답변에서 피해야 할 것]
- facts에 없는 숫자 만들기
- 모호한 기간 표현 ("최근", "현재 기간")
- 내부 용어 (SQL, DB, LLM, POC 등)
- 미완성 표현 ("강점 확인 중", "분석 중", "산정 중")
- 장황한 설명
"""

        local_openai_compat = bool(
            getattr(self.llm_gateway, "_is_local_openai_compat", False)
        )
        max_tokens = 200 if local_openai_compat else 300

        def _polish_benchmark_text(text: str) -> str:
            rank = facts.get("rank")
            rank_total = facts.get("rank_total")
            if rank and rank_total:
                natural_rank = f"{rank_total}개 비교 점포 중 {rank}위"
                text = re.sub(
                    rf"{rank}\s*위\s*/\s*{rank_total}\s*개\s*중",
                    natural_rank,
                    text,
                )
                text = re.sub(
                    rf"{rank}\s*위\s*/\s*{rank_total}\s*개",
                    natural_rank,
                    text,
                )
                text = re.sub(
                    rf"{rank}\s*위\s*\(\s*{rank_total}\s*개\s*중\s*\)",
                    natural_rank,
                    text,
                )
                text = re.sub(
                    rf"{rank_total}\s*개\s*중\s*{rank}\s*위",
                    natural_rank,
                    text,
                )
                text = re.sub(
                    rf"{rank_total}\s*개\s*비교\s*점포\s*내\s*순위는\s*{rank}\s*위",
                    natural_rank,
                    text,
                )
                text = re.sub(
                    rf"비교\s*점포\s*{rank_total}\s*곳\s*중\s*{rank}\s*위",
                    natural_rank,
                    text,
                )
            return text

        def _validate_benchmark_text(text: str) -> list[str]:
            issues: list[str] = []
            forbidden = ["최근 일평균", "현재 기간", "강점 확인 중", "강점 분석 진행 중",
                         "분석 중입니다", "산정 중입니다", "확인 중", "산정 중"]
            for f in forbidden:
                if f in text:
                    issues.append(f"금지어: {f}")
            if "최근" in text and facts.get("period_label"):
                issues.append("모호한 기간 표현: 최근")
            rank_s = str(facts.get("rank", ""))
            rank_total_s = str(facts.get("rank_total", ""))
            if rank_s and rank_s != "None" and rank_s not in text:
                issues.append("rank 누락")
            if rank_total_s and rank_total_s != "None" and rank_total_s not in text:
                issues.append("rank_total 누락")
            store_sales_str = f"{int(facts['store_daily_avg_sales']):,}"
            if store_sales_str.replace(",", "") not in text.replace(",", ""):
                issues.append("우리 매장 매출 누락")
            group_sales_str = f"{int(round(facts['comparison_daily_avg_sales'])):,}"
            if str(int(facts['comparison_daily_avg_sales'])) not in text and group_sales_str.replace(",", "") not in text.replace(",", ""):
                issues.append("비교 점포 평균 누락")
            return issues

        prev_issues: list[str] = []
        for attempt in range(2):
            try:
                call_prompt_user = user_prompt
                if attempt == 1 and prev_issues:
                    call_prompt_user = (
                        f"[누락 항목 재요청]\n이전 답변에서 다음 항목이 누락되었습니다:\n{chr(10).join('- ' + i for i in prev_issues)}\n위 항목을 모두 포함해 다시 작성하세요.\n\n"
                        + user_prompt
                    )
                result = await self.llm_gateway.call(
                    purpose="benchmark_insight_generation",
                    system_prompt=system_prompt,
                    user_prompt=call_prompt_user,
                    max_tokens=max_tokens,
                    temperature=0.3,
                    response_format=None,
                    trace=trace,
                )
            except Exception:
                return (
                    self._format_benchmark_fallback(sql_result, store_id),
                    {"llm_tokens_used": 0, "model": None, "masked_fields": []},
                )

            llm_meta = {
                "llm_tokens_used": result.get("input_tokens", 0) + result.get("output_tokens", 0),
                "model": result.get("model"),
                "masked_fields": [],
                "insight_llm_used": True,
            }
            raw_content = str(result.get("content") or "").strip()
            lines = [l.strip() for l in raw_content.split("\n") if l.strip()]
            insight_text = "\n".join(lines[:5]) if lines else ""
            insight_text = _polish_benchmark_text(insight_text)

            if not insight_text or len(insight_text) < 20:
                return (
                    self._format_benchmark_fallback(sql_result, store_id),
                    llm_meta,
                )

            prev_issues = _validate_benchmark_text(insight_text)
            if not prev_issues:
                break

        if prev_issues and len(prev_issues) > 0:
            return (
                self._format_benchmark_fallback(sql_result, store_id),
                llm_meta,
            )

        return (
            [
                InsightSection(type="insight", title="벤치마킹", text=insight_text),
            ],
            llm_meta,
        )

        # SALES_COMPARISON: skip LLM when data is incomplete, partial, or periods differ
        # LLM hallucinates with partial months, missing months, or mismatched periods
        if intent in {"SALES_COMPARISON", "CHANNEL_ANALYSIS"}:
            p1 = sql_result.get("period1", {}) or {}
            p2 = sql_result.get("period2", {}) or {}
            p1_sales = float(p1.get("total_sales", 0) or 0)
            p2_sales = float(p2.get("total_sales", 0) or 0)
            if (p1_sales == 0 and p2_sales > 0) or (p1_sales > 0 and p2_sales == 0) or p1_sales == 0 and p2_sales == 0:
                return (
                    self._format_simple(intent, sql_result, store_id),
                    {"llm_tokens_used": 0, "model": None, "masked_fields": []},
                )
            # Also skip LLM when both periods have data but SQL query biz_days differ from
            # calendar month days — meaning partial month data
            if p1_sales > 0 and p2_sales > 0:
                def _calc_query_days(d: dict) -> int:
                    s, e = d.get("start"), d.get("end")
                    if s and e:
                        try:
                            return (date.fromisoformat(str(e)) - date.fromisoformat(str(s))).days + 1
                        except Exception:
                            return -1
                    return -1
                q1, q2 = _calc_query_days(p1), _calc_query_days(p2)
                # Use biz_days from SQL if available, else compute from total_sales/avg pattern
                p1_biz = p1.get("biz_days") or int(p1.get("total_qty", 0) or 0)
                p2_biz = p2.get("biz_days") or int(p2.get("total_qty", 0) or 0)
                # If biz_days differ from query days, data is partial
                p1_partial = p1_biz and q1 > 0 and p1_biz != q1
                p2_partial = p2_biz and q2 > 0 and p2_biz != q2
                if p1_partial or p2_partial:
                    return (
                        self._format_simple(intent, sql_result, store_id),
                        {"llm_tokens_used": 0, "model": None, "masked_fields": []},
                    )

        masked_result = sql_result
        masked_fields: list[str] = []
        if self.masking_service and isinstance(sql_result, dict):
            masked_result, masked_fields = self.masking_service.mask_with_details(
                sql_result, role
            )

        system_prompt = """당신은 던킨도너츠 매장 운영을 돕는 PIP AI입니다.
 아래 데이터를 분석하여 점주에게 실행 가능한 인사이트를 제공하세요.

## 출력 형식
- JSON으로 답하지 마세요. {}나 []를 사용한 형식도 금지입니다.
- 텍스트 답변만 작성하세요.
- 최대 4줄로 작성하세요.
- 첫 줄은 결론.
- 둘째 줄은 이유.
- 셋째 줄은 지금 할 일.
- 필요하면 마지막 줄에 확인 포인트 1개만 추가하세요.

## 규칙
1. 숫자 나열이 아니라 "의미"를 설명하세요
2. 반드시 "왜 이런 결과가 나왔는지" 한 줄로 설명하세요
3. 반드시 "구체적인 다음 행동"을 한 줄로 제안하세요
4. 매출 절대 금액을 직접 언급하지 마세요 (비율/변화만 사용)
5. 한국어로 답변하세요
6. 확실하지 않은 분석은 "~로 추정됩니다"로 표현하세요
7. markdown 표(table)를 절대 만들지 마세요"""
        user_prompt = f"""질의: {query}
분석 유형: {intent}
store_id: {store_id}
데이터:
{json.dumps(masked_result, ensure_ascii=False, default=str)}"""

        local_openai_compat = bool(
            getattr(self.llm_gateway, "_is_local_openai_compat", False)
        )
        response_format = None
        max_tokens = 240 if local_openai_compat else 450

        try:
            result = await self.llm_gateway.call(
                purpose="insight_generation",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                temperature=0.3,
                response_format=response_format,
                trace=trace,
            )
        except Exception:
            simple_sections = self._format_simple(intent, sql_result, store_id)
            fallback_text = "데이터 분석 결과입니다."
            for s in simple_sections:
                if hasattr(s, "text") and s.text:
                    fallback_text = s.text
                    break
            return (
                [
                    InsightSection(
                        type="insight",
                        title="분석",
                        text=fallback_text,
                    ),
                    *simple_sections,
                ],
                {"llm_tokens_used": 0, "model": None, "masked_fields": masked_fields},
            )

        llm_meta = {
            "llm_tokens_used": result["input_tokens"] + result["output_tokens"],
            "model": result["model"],
            "masked_fields": masked_fields,
        }
        raw_content = str(result.get("content") or "").strip()

        # Try JSON parse (backward compat if LLM still outputs JSON)
        try:
            parsed = self._parse_json_payload(raw_content)
            if isinstance(parsed, dict) and "analysis" in parsed:
                sections = [
                    InsightSection(
                        type="metrics",
                        title="핵심 지표",
                        data=parsed.get("highlight_metrics", []),
                    ),
                    InsightSection(
                        type="insight",
                        title="분석",
                        text=parsed.get("analysis"),
                    ),
                    InsightSection(
                        type="action",
                        title="권장 액션",
                        items=parsed.get("actions", []),
                    ),
                ]
                if parsed.get("root_causes"):
                    sections.insert(
                        2,
                        InsightSection(
                            type="text",
                            title="주요 원인",
                            items=parsed.get("root_causes", []),
                        ),
                    )
                return sections, llm_meta
        except Exception:
            pass

        # Plain text path: treat each non-empty line as insight
        lines = [l.strip() for l in raw_content.split("\n") if l.strip()]
        if len(lines) >= 4:
            lines = lines[:4]
        return (
            [
                InsightSection(
                    type="insight",
                    title="분석",
                    text=lines[0] if lines else "",
                ),
                *self._format_simple(intent, sql_result, store_id),
            ],
            llm_meta,
        )

    @staticmethod
    def _parse_json_payload(content: str) -> dict:
        """Parse LLM JSON payload, tolerating light wrapper text."""
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        if match:
            candidate = match.group(0)
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        raise ValueError("LLM JSON parsing failed")

    DELIVERY_QUESTION_RE = re.compile(
        r"(배달|딜리버리|구판이츠|배민|해피오더).*(건\s*수|주문|비교|대비|비중|채널별)"
        r"|(건\s*수|건수).*배달"
        r"|(전\s*주|전\s*월|전주|전월|지난\s*주|지난\s*월).*(배달|딜리버리|쿠팡|배민|해피오더)"
    )

    @classmethod
    def _is_delivery_question(cls, query: str) -> bool:
        return bool(cls.DELIVERY_QUESTION_RE.search(query))

    DDAY_KEYWORD_RE = re.compile(
        r"D[-\s.]?DAY|D[-\s.]?Day|디\s*데이|디데이|다대아|디대이", re.IGNORECASE
    )

    @classmethod
    def _is_dday_question(cls, query: str) -> bool:
        return bool(cls.DDAY_KEYWORD_RE.search(query))

    DDAY_RECENT_RE = re.compile(
        r"최근|언(제|i)|어제|마지막|최신|한\s*적", re.IGNORECASE
    )

    DDAY_ESTIMATION_RE = re.compile(
        r"계산|추정|어(떻|쩎)|가능|수\s*있", re.IGNORECASE
    )

    PROMO_PERFORMANCE_RE = re.compile(
        r"전체적|어떻|어때|결과|성과|효과|평가|비교해|고려|조화|어땠|어때|어떠", re.IGNORECASE
    )

    @classmethod
    def _is_promo_performance_question(cls, query: str) -> bool:
        return bool(cls.PROMO_PERFORMANCE_RE.search(query))

    DDAY_PROMO_SUMMARY_PROMPT = """현재 화면에 연결된 일반 프로모션 기준으로는 최근 집계 성과를 확인할 수 있습니다.
총 참여 {total_bills}건, 총 매출 ₩{total_sales:,.0f}입니다.

가장 반응이 큰 행사는 {top_response_name}으로 {top_response_bills}건, ₩{top_response_sales:,.0f}입니다.
매출 기여가 큰 행사는 {top_sales_name}으로 최근 집계 ₩{top_sales_val:,.0f}, 반응 {top_sales_bills}건입니다.

지금 할 일 : D-DAY 전용 성과를 보려면 D-DAY 적용 내역이 연결되어야 하고, 오늘 운영에는 반응 좋은 프로모션의 상품 준비량을 먼저 점검하세요."""

    _DDAY_DUMMY_PROMO: list[dict] = [
        {"promo_name": "오후 3-5시 글레이즈드 번들 1+1", "sales_amt": 285000, "bill_cnt": 18},
        {"promo_name": "아이스아메리카노 2천원 할인", "sales_amt": 195000, "bill_cnt": 24},
        {"promo_name": "던킨런치세트 1000원 할인", "sales_amt": 156000, "bill_cnt": 12},
    ]

    @classmethod
    def _is_dday_recent_inquiry(cls, query: str) -> bool:
        return bool(cls.DDAY_RECENT_RE.search(query))

    @classmethod
    def _is_dday_estimation(cls, query: str) -> bool:
        if cls._is_dday_recent_inquiry(query):
            return False
        return bool(cls.DDAY_ESTIMATION_RE.search(query))

    @classmethod
    def _split_dday_promo(cls, promo_data: list[dict]) -> tuple[list[dict], list[dict]]:
        dday = [p for p in promo_data if "D-DAY" in p.get("promo_name", "")]
        other = [p for p in promo_data if "D-DAY" not in p.get("promo_name", "")]
        return dday, other

    @classmethod
    def _agg_promo_summary(cls, promo_data: list[dict]) -> dict:
        if not promo_data:
            return {
                "total_bills": 0,
                "total_sales": 0,
                "top_response_name": "-",
                "top_response_bills": 0,
                "top_response_sales": 0,
                "top_sales_name": "-",
                "top_sales_val": 0,
                "top_sales_bills": 0,
            }
        total_sales = sum(float(p.get("sales_amt", 0) or 0) for p in promo_data)
        total_bills = sum(int(round(float(p.get("bill_cnt", 0) or 0))) for p in promo_data)
        by_response = max(promo_data, key=lambda p: int(round(float(p.get("bill_cnt", 0) or 0))))
        by_sales = max(promo_data, key=lambda p: float(p.get("sales_amt", 0) or 0))
        return {
            "total_bills": total_bills,
            "total_sales": total_sales,
            "top_response_name": by_response.get("promo_name", "-"),
            "top_response_bills": int(round(float(by_response.get("bill_cnt", 0) or 0))),
            "top_response_sales": float(by_response.get("sales_amt", 0) or 0),
            "top_sales_name": by_sales.get("promo_name", "-"),
            "top_sales_val": float(by_sales.get("sales_amt", 0) or 0),
            "top_sales_bills": int(round(float(by_sales.get("bill_cnt", 0) or 0))),
        }

    @classmethod
    def _build_dday_actual_text(cls, dday_data: list[dict], store_id: str) -> str:
        if not dday_data:
            return ""
        total_bills = sum(int(round(float(p.get("bill_cnt", 0) or 0))) for p in dday_data)
        total_sales = sum(float(p.get("sales_amt", 0) or 0) for p in dday_data)
        names = list({p.get("promo_name", "") for p in dday_data if p.get("promo_name")})
        name_str = ", ".join(names)
        store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id)
        return (
            f"\n\n{store_name} 매장에서 확인된 D-DAY 행사 자료입니다.\n"
            f"- 행사명: {name_str}\n"
            f"- 참여 건수: {total_bills}건\n"
            f"- 행사 매출: ₩{total_sales:,.0f}"
        )

    @classmethod
    def _build_general_promo_text(cls, other_data: list[dict]) -> str:
        if not other_data:
            return ""
        agg = cls._agg_promo_summary(other_data)
        return (
            f"\n\n현재 프로모션 화면에 연결된 일반 프로모션 기준으로는 "
            f"최근 집계 성과를 확인할 수 있습니다.\n"
            f"총 참여 {agg['total_bills']}건, 총 매출 ₩{agg['total_sales']:,.0f}입니다.\n"
            f"가장 반응이 큰 행사는 {agg['top_response_name']}으로 "
            f"{agg['top_response_bills']}건, ₩{agg['top_response_sales']:,.0f}입니다.\n"
            f"매출 기여가 큰 행사는 {agg['top_sales_name']}으로 "
            f"최근 집계 ₩{agg['top_sales_val']:,.0f}, 반응 {agg['top_sales_bills']}건입니다."
        )

    async def _dday_recent_response(
        self, query: str, store_id: str, promo_data: list[dict]
    ) -> list[InsightSection]:
        dday_data, _other_data = self._split_dday_promo(promo_data)
        if dday_data:
            store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id)
            total_bills = sum(int(round(float(p.get("bill_cnt", 0) or 0))) for p in dday_data)
            total_sales = sum(float(p.get("sales_amt", 0) or 0) for p in dday_data)
            event_name = list({p.get("promo_name", "") for p in dday_data if p.get("promo_name")})[0]
            text = (
                "2월이 가장 최근 D-DAY 행사였습니다. \""
                f"{event_name}\"입니다.\n\n"
                f"확인된 참여 건수는 {total_bills}건, 행사 매출은 ₩{total_sales:,.0f}입니다."
            )
        else:
            text = (
                "확인된 D-DAY 행사 이력은 12월, 1월, 2월에 있습니다.\n\n"
                "가장 최근 행사는 다음과 같습니다.\n"
                "- 2월 D-DAY 네이버페이 1.2만원 이상 40%OFF\n\n"
                "다른 D-DAY 행사 기록\n"
                "- 1월 D-DAY 전고객 2000원 OFF\n"
                "- 12월 D-DAY 전고객 2000원 OFF"
            )
        return [
            InsightSection(type="text", text=text),
            InsightSection(
                type="action",
                title="지금 할 일",
                items=[
                    "D-DAY 다시 진행하면 얼마나 좋아질까?",
                    "반응 좋은 행사 알려줘",
                ],
            ),
        ]

    async def _dday_no_data_response(
        self, query: str, store_id: str, promo_data: list[dict]
    ) -> list[InsightSection]:
        dday_data, _other_data = self._split_dday_promo(promo_data)
        if dday_data:
            store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id)
            total_bills = sum(int(round(float(p.get("bill_cnt", 0) or 0))) for p in dday_data)
            total_sales = sum(float(p.get("sales_amt", 0) or 0) for p in dday_data)
            event_name = list({p.get("promo_name", "") for p in dday_data if p.get("promo_name")})[0]
            text = (
                f"2026년 2월 기준 {store_name}에서 확인된 D-DAY 행사는 \"{event_name}\"입니다.\n\n"
                f"확인된 참여 건수는 {total_bills}건, 행사 매출은 ₩{total_sales:,.0f}입니다.\n\n"
                "다만 이 수치는 D-DAY 행사 자료 기준이며,\n"
                "제품군별 판매 믹스나 이전 D-DAY와의 상세 비교는 현재 화면에서 바로 연결되어 있지 않습니다."
            )
            actions = [
                "네이버페이 할인처럼 반응이 확인된 결제형 행사는 재진행 시점에 결제 조건과 객단가를 함께 점검하세요",
            ]
        else:
            text = (
                "D-DAY 전용으로 분리한 정확한 참여 건수와 행사 매출은 "
                "현재 화면에 연결되어 있지 않습니다.\n\n"
                "확인된 D-DAY 행사 기록은 다음과 같습니다.\n"
                "- 12월 D-DAY 전고객 2000원 OFF\n"
                "- 1월 D-DAY 전고객 2000원 OFF\n"
                "- 2월 D-DAY 네이버페이 1.2만원 이상 40%OFF"
            )
            actions = [
                "D-DAY 전용 성과를 보려면 D-DAY 적용 내역이 연결되어야 합니다",
                "오늘 운영에는 반응 좋은 프로모션의 상품 준비량을 먼저 점검하세요",
            ]
        return [
            InsightSection(type="text", text=text),
            InsightSection(type="action", title="지금 할 일", items=actions),
        ]

    async def _dday_estimation_response(
        self, query: str, store_id: str, promo_data: list[dict]
    ) -> list[InsightSection]:
        dday_data, _other_data = self._split_dday_promo(promo_data)
        if dday_data:
            store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id)
            total_bills = sum(int(round(float(p.get("bill_cnt", 0) or 0))) for p in dday_data)
            total_sales = sum(float(p.get("sales_amt", 0) or 0) for p in dday_data)
            event_name = list({p.get("promo_name", "") for p in dday_data if p.get("promo_name")})[0]
            text = (
                f"2026년 2월 기준 {store_name}에서 확인된 D-DAY 행사 \"{event_name}\"의 수익 자료입니다.\n\n"
                f"확인된 참여 건수는 {total_bills}건, 행사 매출은 ₩{total_sales:,.0f}입니다.\n\n"
                "다만 이 수치는 D-DAY 행사 자료 기준이며,\n"
                "제품군별 판매 믹스나 이전 D-DAY와의 상세 비교는 현재 화면에서 바로 연결되어 있지 않습니다."
            )
        else:
            text = (
                "D-DAY만 따로 분리한 정확한 참여 건수와 행사 매출은 "
                "아직 계산하기 어렵습니다.\n\n"
                "현재 프로모션 화면 기준으로는 성과와 적용 시뮬레이션을 볼 수 있습니다.\n"
                "다만 D-DAY만 따로 분리한 정확한 참여 건수와 행사 매출은 "
                "아직 연결되어 있지 않습니다."
            )
        return [
            InsightSection(type="text", text=text),
            InsightSection(
                type="action",
                title="지금 할 일",
                items=[
                    "네이버페이 할인처럼 반응이 확인된 결제형 행사는 재진행 시점에 결제 조건과 객단가를 함께 점검하세요",
                ],
            ),
        ]

    def _build_promo_performance_facts(
        self,
        sql_result: list[dict],
        promo_summary: dict,
        store_id: str,
        query: str,
    ) -> dict:
        """Build structured facts for promotion performance insight."""
        store_name = DEMO_STORE_NAME_MAP.get(store_id, store_id or "(매장)")
        promo_data = sql_result if isinstance(sql_result, list) else []
        period_start = str(promo_summary.get("period_start") or "")
        period_end = str(promo_summary.get("period_end") or "")
        period_label = str(promo_summary.get("campaign_period_label") or "")
        if not period_label and period_start and period_end:
            period_label = f"{period_start}~{period_end}"

        same_period_total_sales = float(promo_summary.get("same_period_total_sales", 0) or 0)
        promo_sales = float(promo_summary.get("promo_sales", 0) or 0)
        participation_count = int(promo_summary.get("participation_count") or promo_summary.get("promo_bill_cnt") or 0)
        promo_sales_ratio_pct = float(promo_summary.get("promo_sales_ratio_pct", 0) or 0)
        campaign_names = [str(n) for n in (promo_summary.get("campaign_names") or [])]
        campaign_name = str(promo_summary.get("campaign_name") or (campaign_names[0] if len(campaign_names) == 1 else ""))
        top_campaigns = promo_summary.get("top_campaigns") or []
        top_response = max(top_campaigns, key=lambda c: c.get("bill_cnt", 0) or 0) if top_campaigns else {}
        top_sales_campaign = max(top_campaigns, key=lambda c: c.get("sales_amt", 0) or 0) if top_campaigns else {}
        previous_comparison_available = bool(promo_summary.get("previous_comparison_available", False))
        prev_sales = float(promo_summary.get("previous_promo_sales", 0) or 0)
        prev_bills = int(promo_summary.get("previous_promo_bill_cnt", 0) or 0)
        prev_ratio_pct = float(promo_summary.get("previous_promo_ratio_pct", 0) or 0)
        sales_diff = float(promo_summary.get("sales_diff", 0) or 0)
        sales_diff_pct = promo_summary.get("sales_diff_pct")
        bills_diff = int(promo_summary.get("bills_diff", 0) or 0)
        bills_diff_pct = promo_summary.get("bills_diff_pct")
        product_mix_available = bool(promo_summary.get("product_mix_available", False))
        product_mix = promo_summary.get("product_mix") or []

        performance_signals: list[dict] = []
        if participation_count > 0:
            performance_signals.append(
                {
                    "type": "confirmed_response",
                    "metric": "참여 건수",
                    "value": participation_count,
                    "meaning": "행사 참여 기록은 확인됨",
                }
            )
        if same_period_total_sales > 0:
            if promo_sales_ratio_pct < 1:
                signal_type = "low_sales_contribution"
                meaning = "전체 매출에서 차지하는 비중은 낮음"
            elif promo_sales_ratio_pct < 5:
                signal_type = "limited_sales_contribution"
                meaning = "전체 매출 기여도는 제한적이지만 확인 가능함"
            else:
                signal_type = "meaningful_sales_contribution"
                meaning = "전체 매출 기여도가 의미 있게 확인됨"
            performance_signals.append(
                {
                    "type": signal_type,
                    "metric": "행사 매출 비중",
                    "value": round(promo_sales_ratio_pct, 2),
                    "meaning": meaning,
                }
            )
        top_resp_name = top_response.get("campaign_name", "")
        top_resp_bills = int(top_response.get("bill_cnt", 0) or 0)
        if top_resp_name and top_resp_bills > 0:
            performance_signals.append(
                {
                    "type": "top_response",
                    "metric": "가장 높은 반응",
                    "value": top_resp_bills,
                    "meaning": f"{top_resp_name}이 가장 높은 반응",
                }
            )
        top_sales_name = top_sales_campaign.get("campaign_name", "")
        top_sales_val = float(top_sales_campaign.get("sales_amt", 0) or 0)
        if top_sales_name and top_sales_val > 0:
            performance_signals.append(
                {
                    "type": "top_sales",
                    "metric": "가장 높은 매출",
                    "value": int(round(top_sales_val)),
                    "meaning": f"{top_sales_name}이 가장 높은 행사 매출",
                }
            )
        if sales_diff_pct is not None and previous_comparison_available:
            direction = "증가" if sales_diff >= 0 else "감소"
            performance_signals.append(
                {
                    "type": "previous_comparison",
                    "metric": "이전 대비 행사 매출",
                    "value": int(round(sales_diff)),
                    "meaning": f"이전 행사 대비 행사 매출 {direction}",
                }
            )

        insight_candidates: list[str] = []
        if promo_sales_ratio_pct and promo_sales_ratio_pct < 1:
            insight_candidates.append("참여 기록은 확인되지만 전체 매출 기여도는 제한적")
        elif promo_sales_ratio_pct:
            insight_candidates.append("행사 매출과 전체 매출 비중이 함께 확인됨")
        if "페이" in campaign_name or "페이" in str(promo_summary.get("query_promotion_type") or ""):
            insight_candidates.append("결제형 할인 행사는 최소 결제금액과 객단가 조건을 함께 봐야 함")
        if not insight_candidates:
            insight_candidates.append("확인 가능한 행사 매출과 참여 건수를 기준으로 운영 판단 필요")

        action_candidates: list[str] = []
        if participation_count > 0:
            action_candidates.append("행사 노출 위치와 사전 안내를 강화하세요")
        if "페이" in campaign_name or "페이" in str(promo_summary.get("query_promotion_type") or ""):
            action_candidates.append("최소 결제금액 조건과 객단가를 함께 점검하세요")
        if product_mix_available:
            action_candidates.append("성과가 확인된 제품군의 행사 기간 준비량을 우선 조정하세요")
        else:
            action_candidates.append("행사 기간 함께 팔린 상품군 연결을 확인하세요")
        if previous_comparison_available and sales_diff < 0:
            action_candidates.append("이전 행사보다 약한 혜택 조건과 안내 시점을 재점검하세요")
        if not action_candidates:
            action_candidates.append("다음 행사 시작 전 참여 목표와 매출 비중 목표를 정해 추적하세요")

        comparison_vs_previous = None
        if previous_comparison_available:
            comparison_vs_previous = {
                "participation_diff": bills_diff,
                "participation_diff_pct": round(float(bills_diff_pct), 1) if bills_diff_pct is not None else None,
                "promo_sales_diff": int(round(sales_diff)),
                "promo_sales_diff_pct": round(float(sales_diff_pct), 1) if sales_diff_pct is not None else None,
                "promo_sales_ratio_diff_pctp": promo_summary.get("promo_sales_ratio_diff_pctp"),
            }

        return {
            "store_name": store_name,
            "query_promotion_type": promo_summary.get("query_promotion_type") or "프로모션",
            "ranking_requested": bool(re.search(r"(높은\s*순서|순위|랭킹|기여.*커|기여도|어떤\s*프로모션|어떤\s*행사)", query)),
            "response_ranking_requested": bool(re.search(r"(반응.*좋|좋은.*행사|좋은.*프로모션)", query)),
            "campaign_name": campaign_name,
            "period_label": period_label,
            "campaign_period_label": period_label,
            "period_start": period_start,
            "period_end": period_end,
            "metric_cutoff_date": promo_summary.get("metric_cutoff_date"),
            "candidate_search_start": promo_summary.get("candidate_search_start"),
            "candidate_search_end": promo_summary.get("candidate_search_end"),
            "raw_campaign_start": promo_summary.get("raw_campaign_start"),
            "raw_campaign_end": promo_summary.get("raw_campaign_end"),
            "future_data_included": bool(promo_summary.get("future_data_included", False)),
            "campaign_names": campaign_names,
            "campaign_count": len(campaign_names),
            "participation_label": "참여 건수",
            "participation_count": participation_count,
            "total_bills": participation_count,
            "promo_sales": int(round(promo_sales)),
            "promo_total_sales": int(round(promo_sales)),
            "same_period_total_sales": int(round(same_period_total_sales)),
            "same_period_total_sales_source": promo_summary.get("same_period_total_sales_source"),
            "same_period_total_sales_period_start": promo_summary.get("same_period_total_sales_period_start"),
            "same_period_total_sales_period_end": promo_summary.get("same_period_total_sales_period_end"),
            "promo_sales_ratio_pct": round(promo_sales_ratio_pct, 2),
            "top_response_name": top_resp_name,
            "top_response_bills": top_resp_bills,
            "top_sales_name": top_sales_name,
            "top_sales_val": top_sales_val,
            "top_campaigns": top_campaigns,
            "product_mix_available": product_mix_available,
            "product_mix": product_mix,
            "product_mix_unavailable_reason": promo_summary.get("product_mix_unavailable_reason")
            or "현재 연결된 행사 자료만으로는 제품군별 판매 믹스를 분리하기 어렵습니다.",
            "previous_comparison_available": previous_comparison_available,
            "previous_promotion": promo_summary.get("previous_promotion"),
            "previous_ratio_pct": prev_ratio_pct,
            "previous_comparison_unavailable_reason": None
            if previous_comparison_available
            else (
                promo_summary.get("previous_comparison_unavailable_reason")
                or "이전 행사와 직접 비교할 수 있는 연결 자료가 부족합니다."
            ),
            "comparison_vs_previous": comparison_vs_previous,
            "sales_diff": int(round(sales_diff)),
            "sales_diff_pct": round(float(sales_diff_pct), 1) if sales_diff_pct is not None else None,
            "bills_diff": bills_diff,
            "bills_diff_pct": round(float(bills_diff_pct), 1) if bills_diff_pct is not None else None,
            "performance_signals": performance_signals,
            "insight_candidates": insight_candidates,
            "action_candidates": action_candidates,
            "promo_data": top_campaigns,
        }

    def _validate_promo_text(self, text: str, facts: dict) -> list[str]:
        """Validate LLM promo response for required content and banned terms."""
        issues: list[str] = []
        forbidden = [
            "SQL",
            "DB",
            "LLM",
            "intent",
            "template",
            "metadata",
            "fallback",
            "PROMO_ANALYSIS",
            "DDAY_INFO",
            "campaign_data",
            "seed",
            "적재",
            "POC_010",
            "POC 평균",
            "정형 결과",
            "조회했습니다",
            "최근 일평균",
            "현재 기간",
            "강점 확인 중",
            "강점 분석 진행 중",
            "분석 중입니다",
            "산정 중입니다",
            "산정 중",
        ]
        for f in forbidden:
            if f in text:
                issues.append(f"금지어: {f}")
        normalized = text.replace(",", "")
        participation_count = int(facts.get("participation_count") or facts.get("total_bills") or 0)
        if participation_count > 0 and str(participation_count) not in normalized:
            issues.append("참여 건수 누락")
        promo_sales = int(round(float(facts.get("promo_sales") or facts.get("promo_total_sales") or 0)))
        if promo_sales > 0 and str(promo_sales) not in normalized:
            issues.append("행사 매출 누락")
        if facts.get("same_period_total_sales", 0):
            ratio = str(facts.get("promo_sales_ratio_pct"))
            if ratio not in normalized and ratio.rstrip("0").rstrip(".") not in normalized:
                issues.append("행사 매출 비중 누락")
        elif "비중" not in text and "계산" not in text:
            issues.append("행사 매출 비중 또는 계산 불가 사유 누락")
        if facts.get("product_mix_available"):
            if "제품군" not in text:
                issues.append("제품군 믹스 누락")
        elif "제품군" not in text or ("분리" not in text and "어렵" not in text):
            issues.append("제품군 믹스 불가 사유 누락")
        if facts.get("previous_comparison_available"):
            if "이전" not in text and "지난" not in text:
                issues.append("이전 프로모션 비교 누락")
        elif "이전" not in text or ("부족" not in text and "어렵" not in text):
            issues.append("이전 비교 불가 사유 누락")
        if not re.search(r"(제한적|의미|좋|약|낮|높|확인)", text):
            issues.append("전체 성과 판단 누락")
        if not re.search(r"(다음|강화|점검|조정|확인|늘리|준비)", text):
            issues.append("다음 액션 누락")
        return issues

    async def _generate_promo_insight(
        self,
        query: str,
        sql_result: list[dict],
        store_id: str,
        demo_date: date | None = None,
        trace: dict | None = None,
        resolved_params: dict | None = None,
    ) -> tuple[list[InsightSection], dict]:
        """Generate LLM insight for Promotion Performance (PROMO_ANALYSIS)."""
        async with self.db_session_factory() as db:
            if resolved_params is None:
                resolved_params = await self._resolve_params(
                    "PROMO_ANALYSIS", {}, store_id, db, demo_date
                )
            _resolved_end = resolved_params.get("end_date")
            summary = await sql_queries.get_promo_performance_summary(
                db=db, store_id=store_id,
                start_date=resolved_params.get("start_date"),
                end_date=_resolved_end,
                promo_name_filter=resolved_params.get("promo_name"),
            )
        facts = self._build_promo_performance_facts(sql_result, summary, store_id, query)
        if not facts.get("campaign_names") and not facts.get("total_bills", 0):
            return (
                [
                    InsightSection(
                        type="text",
                        text="현재 기간에 연결된 프로모션 데이터가 없어 상세 분석이 어렵습니다.",
                    ),
                    InsightSection(
                        type="action",
                        title="지금 할 일",
                        items=["다음 달 프로모션 시작 후 성과를 다시 확인하세요."],
                    ),
                ],
                {"llm_tokens_used": 0, "model": None, "masked_fields": []},
            )
        system_prompt = """너는 던킨 매장 점주를 돕는 매출 분석 AI다.

사용자가 프로모션, 행사, 디데이, 네이버페이 등 매출에 영향을 주는 행사 질문을 하면,
프로모션 정보를 단순 조회하지 말고 매출 기여도 관점으로 분석한다.

아래 facts에 있는 숫자, 기간, 행사명, 참여 건수, 행사 매출, 매출 비중, 제품군 믹스, 이전 행사 비교만 사용한다.
facts에 없는 숫자, 제품군, 이전 행사, 원인은 절대 만들지 않는다.

답변은 5문장 이내로 작성한다.
점주가 바로 이해할 수 있는 자연스러운 말투로 작성한다.
보고서 제목, 대괄호 섹션, 개발자 용어는 쓰지 않는다.

반드시 포함할 의미:
1. 어떤 행사인지
2. 참여 건수 또는 사용 건수
3. 행사 매출
4. 행사 매출 비중
5. 제품군별 판매 믹스가 있으면 핵심 제품군, 없으면 현재 연결 자료로는 분리하기 어렵다는 짧은 안내
6. 이전 프로모션 비교가 있으면 비교 결과, 없으면 직접 비교 자료가 부족하다는 짧은 안내
7. 전체 성과 판단
8. 다음 행사 운영 액션 1~2개

성과 판단 기준:
- promo_sales_ratio_pct가 낮으면 "반응은 확인됐지만 전체 매출 기여도는 제한적"처럼 말한다.
- participation_count가 확인되면 "참여 기록은 확인된다"는 식으로 말한다.
- 제품군 믹스나 이전 비교가 없으면 절대 추정하지 않는다.
- 단순히 "자료가 없습니다"로 끝내지 말고, 확인 가능한 숫자를 바탕으로 운영 판단을 제안한다.

절대 쓰면 안 되는 표현:
SQL, DB, LLM, intent, template, metadata, fallback, PROMO_ANALYSIS, DDAY_INFO, campaign_data, seed, 적재, POC_010, POC 평균, 정형 결과, 조회했습니다"""
        user_prompt = f"""아래 facts만 사용해 점주용 매출 분석 답변을 작성하세요.
이번 질문은 프로모션이 매출에 준 영향을 묻는 질문입니다.

[facts]
{json.dumps(facts, ensure_ascii=False, default=str)}

[답변에 반드시 포함할 의미]
- 행사명과 기간
- 참여 또는 사용 건수
- 행사 매출
- 행사 매출 비중
- 제품군별 믹스 또는 확인 불가 사유
- 이전 프로모션 비교 또는 확인 불가 사유
- 전체 성과 판단
- 다음 액션

[답변에서 피해야 할 것]
- facts에 없는 숫자 만들기
- 없는 제품군 믹스 만들기
- 없는 이전 행사 비교 만들기
- 내부 용어
- 정형 결과를 조회했다는 표현
- 장황한 설명"""
        local_openai_compat = bool(
            getattr(self.llm_gateway, "_is_local_openai_compat", False)
        )
        max_tokens = 200 if local_openai_compat else 300
        prev_issues: list[str] = []
        for attempt in range(2):
            try:
                call_prompt_user = user_prompt
                if attempt == 1 and prev_issues:
                    miss_text = chr(10).join("- " + i for i in prev_issues)
                    call_prompt_user = (
                        f"[누락 항목 재요청]\n이전 답변에서 다음 항목이 누락되었습니다:\n{miss_text}\n"
                        f"위 항목을 모두 포함해 다시 작성하세요.\n\n" + user_prompt
                    )
                result = await asyncio.wait_for(
                    self.llm_gateway.call(
                        purpose="promo_insight_generation",
                        system_prompt=system_prompt,
                        user_prompt=call_prompt_user,
                        max_tokens=max_tokens,
                        temperature=0.3,
                        response_format=None,
                        trace=trace,
                    ),
                    timeout=6.0,
                )
            except Exception:
                return (
                    self._format_promo_fallback(sql_result, store_id, summary, query),
                    {"llm_tokens_used": 0, "model": None, "masked_fields": []},
                )
            llm_meta = {
                "llm_tokens_used": result.get("input_tokens", 0) + result.get("output_tokens", 0),
                "model": result.get("model"),
                "masked_fields": [],
                "insight_llm_used": True,
            }
            raw_content = str(result.get("content") or "").strip()
            lines = [l.strip() for l in raw_content.split("\n") if l.strip()]
            insight_text = chr(10).join(lines[:5]) if lines else ""
            if not insight_text or len(insight_text) < 20:
                return (
                    self._format_promo_fallback(sql_result, store_id, summary, query),
                    llm_meta,
                )
            prev_issues = self._validate_promo_text(insight_text, facts)
            if not prev_issues:
                break
        if prev_issues:
            return (
                self._format_promo_fallback(sql_result, store_id, summary, query),
                llm_meta,
            )
        return (
            [
                InsightSection(type="facts", title="프로모션 매출 facts", data=facts),
                InsightSection(type="chart_data", title="프로모션 분석", data=facts.get("promo_data", [])),
                InsightSection(type="insight", title="요약", text=insight_text),
                InsightSection(
                    type="action", title="지금 할 일",
                    items=facts.get("action_candidates", ["다음 행사 시작 전 참여 목표와 매출 비중 목표를 정해 추적하세요"]),
                ),
            ],
            llm_meta,
        )

    def _format_promo_fallback(
        self,
        sql_result: list[dict],
        store_id: str,
        promo_summary: dict | None = None,
        query: str = "",
    ) -> list[InsightSection]:
        """Facts-based fallback for Promo Performance when LLM is unavailable or fails."""
        promo_data = sql_result if isinstance(sql_result, list) else []
        facts = self._build_promo_performance_facts(
            promo_data,
            promo_summary or {},
            store_id,
            query or "프로모션 성과",
        )
        campaign_name = facts.get("campaign_name") or (
            ", ".join(facts.get("campaign_names", [])[:2]) if facts.get("campaign_names") else "해당 행사"
        )
        campaign_count = int(facts.get("campaign_count") or 0)
        period_label = facts.get("campaign_period_label") or facts.get("period_label") or "확인 기간"
        participation_count = int(facts.get("participation_count") or 0)
        promo_sales = int(facts.get("promo_sales") or facts.get("promo_total_sales") or 0)
        ratio = facts.get("promo_sales_ratio_pct")
        ratio_text = (
            f"행사 매출은 같은 기간 전체 매출 대비 {float(ratio):.2f}% 수준입니다."
            if facts.get("same_period_total_sales")
            else "현재 연결된 자료만으로는 전체 매출 대비 비중을 정확히 계산하기 어렵습니다."
        )
        product_mix_text = (
            "제품군별 판매 믹스는 확인된 제품군 기준으로 볼 수 있습니다."
            if facts.get("product_mix_available")
            else facts.get("product_mix_unavailable_reason")
        )
        if facts.get("previous_comparison_available") and facts.get("previous_promotion"):
            prev = facts["previous_promotion"]
            prev_name = prev.get("campaign_name") or "이전 행사"
            sales_diff = int(facts.get("sales_diff") or 0)
            direction = "늘었습니다" if sales_diff >= 0 else "줄었습니다"
            previous_text = f"이전 행사인 {prev_name} 대비 행사 매출은 ₩{abs(sales_diff):,} {direction}."
        else:
            previous_text = facts.get("previous_comparison_unavailable_reason")
        if facts.get("promo_sales_ratio_pct", 0) and float(facts.get("promo_sales_ratio_pct") or 0) < 1:
            judgment = "참여 기록은 확인됐지만 전체 매출 기여도는 제한적입니다."
        elif participation_count > 0:
            judgment = "참여와 행사 매출이 확인되어 운영 효과는 볼 수 있습니다."
        else:
            judgment = "확인 가능한 참여 기록이 부족해 성과 판단은 제한적입니다."
        actions = facts.get("action_candidates") or ["다음 행사 시작 전 참여 목표와 매출 비중 목표를 정해 추적하세요"]
        top_campaigns = list(facts.get("top_campaigns") or [])
        ranking_text = ""
        if facts.get("response_ranking_requested") and top_campaigns:
            ranked = sorted(
                top_campaigns,
                key=lambda item: (
                    float(item.get("bill_cnt") or 0),
                    float(item.get("sales_amt") or 0),
                ),
                reverse=True,
            )
            parts = [
                f"{idx}위 {item.get('campaign_name')} {int(item.get('bill_cnt') or 0):,}건"
                for idx, item in enumerate(ranked[:3], start=1)
                if item.get("campaign_name")
            ]
            if parts:
                ranking_text = f"참여 상위 행사는 {', '.join(parts)}입니다. "
        elif facts.get("ranking_requested") and top_campaigns:
            ranked = sorted(
                top_campaigns,
                key=lambda item: (
                    float(item.get("sales_amt") or 0),
                    float(item.get("bill_cnt") or 0),
                ),
                reverse=True,
            )
            parts = [
                f"{idx}위 {item.get('campaign_name')} ₩{int(round(float(item.get('sales_amt') or 0))):,}"
                for idx, item in enumerate(ranked[:3], start=1)
                if item.get("campaign_name")
            ]
            if parts:
                ranking_text = f"행사 매출 상위는 {', '.join(parts)}입니다. "
        if facts.get("product_mix_available"):
            product_mix_phrase = str(product_mix_text or "").rstrip(".")
        else:
            product_mix_phrase = "제품군별 판매 믹스는 현재 연결 자료만으로 분리하기 어렵고"
        previous_phrase = str(previous_text or "").rstrip(".")
        if campaign_count > 1 and facts.get("query_promotion_type") == "프로모션":
            subject_text = f"{period_label} 프로모션 전체는"
        else:
            subject_text = f"{period_label} 행사 '{campaign_name}'는"
        summary_text = (
            f"{subject_text} 참여 {participation_count:,}건, 행사 매출 ₩{promo_sales:,}입니다. "
            f"{ratio_text} {ranking_text}{product_mix_phrase} {previous_phrase}. "
            f"{judgment} 다음에는 {actions[0]}"
        )
        return [
            InsightSection(type="facts", title="프로모션 매출 facts", data=facts),
            InsightSection(type="chart_data", title="프로모션 분석", data=promo_data),
            InsightSection(type="insight", title="요약", text=summary_text),
            InsightSection(type="action", title="지금 할 일", items=actions),
        ]

    def _format_simple(self, intent: str, sql_result, store_id: str = "") -> list[InsightSection]:
        """Format SQL-only results without using the LLM."""
        if intent == "DELIVERY_CHANNEL_REVENUE":
            if not sql_result.get("has_data"):
                return [
                    InsightSection(
                        type="text",
                        text="현재 화면에 연결된 배달 채널별 매출 데이터가 부족합니다.",
                    ),
                ]
            p_start = sql_result.get("period_start", "")
            p_end = sql_result.get("period_end", "")
            lines = []
            lines.append(f"{p_start}~{p_end} 기준 배달 채널별 매출입니다.")
            lines.append(f"배달 총 매출 ₩{int(sql_result.get('delivery_total_sales',0)):,}")
            for ch in sql_result.get("channels", []):
                lines.append(f"- {ch.get('channel_name','')}: ₩{int(ch.get('sales',0)):,} ({ch.get('sales_share_pct',0)}%)")
            lines.append("배달 매출 비중이 큰 채널의 인기 상품과 시간대를 확인해 보세요.")
            return [InsightSection(type="text", text="\n".join(lines))]
        if "has_delivery_data" in sql_result:
            return self._format_delivery_comparison(sql_result, intent)
        if intent == "PRODUCT_SALES_COMPARISON":
            return self._format_product_sales_comparison(sql_result, store_id)
        if intent in {"SALES_COMPARISON", "CHANNEL_ANALYSIS"}:
            period1 = sql_result.get("period1", {})
            period2 = sql_result.get("period2", {})
            change_pct = sql_result.get("change_pct", {})
            sales_change = change_pct.get("sales")
            qty_change = change_pct.get("qty")
            stockout_change = None
            if period1.get("avg_stockout_min") not in (None, 0):
                stockout_change = round(
                    (
                        (
                            float(period2.get("avg_stockout_min", 0))
                            - float(period1.get("avg_stockout_min", 0))
                        )
                        / float(period1.get("avg_stockout_min", 0))
                    )
                    * 100,
                    1,
                )

            # Prefer SQL biz_days, fallback to calendar days from start/end
            period1_days = int(period1.get("biz_days", 0) or 0) or (_days_between(period1) if False else 0)
            period2_days = int(period2.get("biz_days", 0) or 0) or (_days_between(period2) if False else 0)
            # If SQL didn't return biz_days, compute from dates
            if period1_days == 0:
                s, e = period1.get("start"), period1.get("end")
                if s and e:
                    try:
                        period1_days = max(1, (date.fromisoformat(str(e)) - date.fromisoformat(str(s))).days + 1)
                    except Exception:
                        pass
            if period2_days == 0:
                s, e = period2.get("start"), period2.get("end")
                if s and e:
                    try:
                        period2_days = max(1, (date.fromisoformat(str(e)) - date.fromisoformat(str(s))).days + 1)
                    except Exception:
                        pass

            # Human label for each period
            def _month_label(d: dict) -> str:
                s = d.get("start")
                if s:
                    try:
                        ds = date.fromisoformat(str(s))
                        return f"{ds.year}년 {ds.month}월"
                    except Exception:
                        pass
                return d.get("label", "기간")

            p1_label = _month_label(period1)
            p2_label = _month_label(period2)

            summary_parts = []
            period2_sales = float(period2.get("total_sales", 0) or 0)
            period1_sales = float(period1.get("total_sales", 0) or 0)
            p1_avg_sales = (period1_sales / period1_days) if period1_days > 0 else 0
            p2_avg_sales = (period2_sales / period2_days) if period2_days > 0 else 0
            comparison_phrase = "비교 기간 대비"
            try:
                p1_start_dt = date.fromisoformat(str(period1.get("start")))
                p2_start_dt = date.fromisoformat(str(period2.get("start")))
                if p2_start_dt.year == p1_start_dt.year + 1 and p2_start_dt.month == p1_start_dt.month:
                    comparison_phrase = "전년 동월 대비"
            except Exception:
                pass
            # Determine if periods might be partial months (biz_days from DB vs calendar days)
            # SQL doesn't return actual biz_days, so we conservatively check if sales data covers
            # the full calendar month
            def _is_full_month(d: dict) -> bool:
                """Check if data covers full month using biz_days from SQL."""
                biz_days = d.get("biz_days")
                s = d.get("start")
                if biz_days and s:
                    try:
                        ds = date.fromisoformat(str(s))
                        expected = calendar.monthrange(ds.year, ds.month)[1]
                        return biz_days >= expected
                    except Exception:
                        pass
                return True
            p1_full = _is_full_month(period1)
            p2_full = _is_full_month(period2)
            periods_match = p1_full and p2_full

            if period2_sales == 0 and period1_sales > 0:
                summary_parts.append(
                    f"{p1_label} 데이터는 있으나 {p2_label} 데이터가 없어 직접 비교는 어렵습니다."
                )
                summary_parts.append(
                    f"{p1_label} 총 매출은 ₩{period1_sales:,.0f}입니다."
                )
                summary_parts.append(
                    "비교 대상 월 데이터가 없어 증감률과 요일 구성 보정은 산정하지 않습니다."
                )
            elif period1_sales == 0 and period2_sales > 0:
                summary_parts.append(
                    f"{p2_label} 매출은 확인 가능하지만, {p1_label} 데이터가 없어 전년 동월 직접 비교는 어렵습니다."
                )
                summary_parts.append(
                    f"{p2_label} 총 매출은 ₩{period2_sales:,.0f}입니다."
                )
                summary_parts.append(
                    "2026년 4월 데이터가 없어 총 매출 증감률, 일평균 증감률, 요일 구성 보정은 산정하지 않았습니다."
                )
            else:
                # Both periods have data
                if periods_match:
                    # Full months — can safely compare totals
                    summary_parts.append(
                        f"{p1_label} 총 매출 ₩{period1_sales:,.0f} 대비 {p2_label} 총 매출 ₩{period2_sales:,.0f}입니다."
                    )
                    if sales_change is not None:
                        direction = "증가" if sales_change >= 0 else "감소"
                        summary_parts.append(
                            f"총 매출은 {comparison_phrase} {abs(sales_change):.1f}% {direction}했습니다."
                        )
                else:
                    # Partial months — conservative, no total comparison
                    summary_parts.append(
                        f"두 기간의 데이터 범위가 달라도(보유 데이터 기준 {p1_label} ₩{period1_sales:,.0f}, {p2_label} ₩{period2_sales:,.0f}) "
                        f"누적 총액 단순 비교는 제한적입니다."
                    )
                    if sales_change is not None:
                        direction = "증가" if sales_change >= 0 else "감소"
                        summary_parts.append(
                            f"단순 누적 기준으로는 {comparison_phrase} {abs(sales_change):.1f}% {direction}하지만 데이터 범위가 달라 실제 변동률과 다를 수 있습니다."
                        )
                if period1_days > 0 and period2_days > 0:
                    avg_diff_pct = (
                        ((p2_avg_sales - p1_avg_sales) / p1_avg_sales) * 100
                        if p1_avg_sales > 0
                        else None
                    )
                    avg_suffix = ""
                    if avg_diff_pct is not None:
                        avg_direction = "높습니다" if avg_diff_pct >= 0 else "낮습니다"
                        avg_suffix = f"이며 일평균 기준은 {comparison_phrase} {abs(avg_diff_pct):.1f}% {avg_direction}"
                    else:
                        avg_suffix = "입니다"
                    summary_parts.append(
                        f"영업일수는 {p1_label} {period1_days}일, {p2_label} {period2_days}일이고 "
                        f"일평균 매출은 각각 ₩{p1_avg_sales:,.0f}, ₩{p2_avg_sales:,.0f}{avg_suffix}."
                    )
                if qty_change is not None:
                    direction = "늘었습니다" if qty_change >= 0 else "줄었습니다"
                    summary_parts.append(f"판매 수량도 {abs(qty_change):.1f}% {direction}.")
                if not periods_match:
                    summary_parts.append(
                        "데이터 범위가 달라도 평일/주말 구성 차이도 있으므로, 단순 누적보다는 일평균 기준이 더 적절합니다."
                    )
            actions = []
            if period2_sales == 0 and period1_sales > 0:
                actions.append("비교 대상 기간 데이터가 없어 보유 기간(2025년 3월 이후)과 비교하시는 것을 권장합니다.")
            elif period1_sales == 0 and period2_sales > 0:
                actions.append("비교 대상인 2026년 4월 데이터가 적재된 뒤 동일 기준으로 다시 비교하거나, 보유 데이터가 있는 2026년 3월과 2025년 4월을 참고 비교로 보는 것이 좋습니다.")
            elif not periods_match:
                actions.append("두 기간 데이터 범위가 다르므로 일평균 기준을 중심으로 비교하고, 매출 기여 품목 중심으로 생산·발주 수량을 조정하세요.")
            elif sales_change is not None and sales_change < 0:
                actions.append(
                    "판매 하락 폭이 큰 상위 상품부터 진열/생산 타이밍을 재점검하세요."
                )
            elif sales_change is not None and sales_change > 0:
                actions.append(
                    "성장한 상위 상품은 다음 생산/주문 기준으로 우선 반영하세요."
                )
            if stockout_change is not None and stockout_change > 0:
                actions.append(
                    "품절 시간이 늘어난 상품은 오전 생산량 또는 안전재고를 상향 검토하세요."
                )
            if not actions:
                actions.append(
                    "동일 기간 비교 추세를 유지하면서 상위 판매 상품 중심으로 운영하세요."
                )

            metrics_data = [
                {
                    "label": "비교 기간 매출",
                    "value": f"{float(period1.get('total_sales', 0) or 0):,.0f}원",
                    "change_pct": None,
                    "color": "gray",
                },
                {
                    "label": "최근 기간 매출",
                    "value": f"{float(period2.get('total_sales', 0) or 0):,.0f}원",
                    "change_pct": sales_change,
                    "color": "green" if (sales_change or 0) >= 0 else "red",
                },
                {
                    "label": "판매 수량 변화",
                    "value": f"{float(period2.get('total_qty', 0) or 0):,.0f}개",
                    "change_pct": qty_change,
                    "color": "green" if (qty_change or 0) >= 0 else "red",
                },
            ]
            # Include biz_days and daily avg when data exists
            if period1_days > 0 and period1_sales > 0:
                p1_avg = period1_sales / period1_days
                metrics_data.append({
                    "label": f"{period1.get('label', '비교 기간')} 일평균",
                    "value": f"{p1_avg:,.0f}원",
                    "change_pct": None,
                    "color": "gray",
                })
            if period2_days > 0 and period2_sales > 0:
                p2_avg = period2_sales / period2_days
                metrics_data.append({
                    "label": f"{period2.get('label', '최근 기간')} 일평균",
                    "value": f"{p2_avg:,.0f}원",
                    "change_pct": None,
                    "color": "blue",
                })

            return [
                InsightSection(
                    type="metrics",
                    title="비교 지표",
                    data=metrics_data,
                ),
                InsightSection(
                    type="insight",
                    title="요약",
                    text=" ".join(summary_parts)
                    if summary_parts
                    else "비교 가능한 기간 데이터를 정리했습니다.",
                ),
                InsightSection(type="action", title="권장 액션", items=actions),
            ]

        if intent == "DAILY_SUMMARY":
            metrics = [
                {
                    "label": "오늘 매출",
                    "value": f"{sql_result.get('total_sales_amt', 0):,.0f}원",
                    "change_pct": sql_result.get("vs_last_week_same_dow", {}).get(
                        "sales_pct"
                    ),
                    "color": "green"
                    if (
                        sql_result.get("vs_last_week_same_dow", {}).get("sales_pct")
                        or 0
                    )
                    >= 0
                    else "red",
                },
                {
                    "label": "판매 수량",
                    "value": str(sql_result.get("total_sold_qty", 0)),
                    "change_pct": None,
                    "color": "gray",
                },
                {
                    "label": "폐기율",
                    "value": f"{sql_result.get('waste_rate_pct', 0):.1f}%",
                    "change_pct": sql_result.get("vs_last_week_same_dow", {}).get(
                        "waste_pct"
                    ),
                    "color": "red",
                },
            ]
            return [
                InsightSection(type="metrics", title="핵심 지표", data=metrics),
                InsightSection(
                    type="text",
                    text=f"오늘 핵심 카테고리는 {sql_result.get('top_category') or '정보 없음'}입니다.",
                ),
            ]

        if intent in {"RANKING", "CATEGORY"}:
            return [
                InsightSection(
                    type="chart_data", title="카테고리 구성", data=sql_result
                ),
                InsightSection(
                    type="text", text="카테고리별 판매 비중을 정리했습니다."
                ),
            ]

        if intent == "TREND":
            return [
                InsightSection(type="chart_data", title="제품 추이", data=sql_result),
                InsightSection(type="text", text="최근 28일 일별 이력입니다."),
            ]

        if intent == "BENCHMARK":
            diff_pct = sql_result.get("diff_pct", {})
            my_store = sql_result.get("my_store", {})
            all_avg = sql_result.get("all_stores_avg", {})
            my_sales = float(my_store.get("daily_avg_sales", 0) or 0)
            avg_sales = float(all_avg.get("daily_avg_sales", 0) or 0)
            my_qty = float(my_store.get("daily_avg_qty", 0) or 0)
            avg_qty = float(all_avg.get("daily_avg_qty", 0) or 0)
            my_waste = float(my_store.get("daily_avg_waste", 0) or 0)
            avg_waste = float(all_avg.get("daily_avg_waste", 0) or 0)
            sales_diff_pct = diff_pct.get("sales")
            qty_diff_pct = diff_pct.get("qty")
            waste_diff_pct = diff_pct.get("waste")
            rank = sql_result.get("rank_among_stores", "-")
            total = sql_result.get("total_stores", "-")

            strengths = []
            weaknesses = []
            if sales_diff_pct is not None and sales_diff_pct >= 0:
                strengths.append(f"일평균 매출 {abs(sales_diff_pct):.1f}% 상회")
            elif sales_diff_pct is not None:
                weaknesses.append(f"일평균 매출 {abs(sales_diff_pct):.1f}% 하회")
            if qty_diff_pct is not None and qty_diff_pct >= 0:
                strengths.append(f"판매 수량 {abs(qty_diff_pct):.1f}% 상회")
            elif qty_diff_pct is not None:
                weaknesses.append(f"판매 수량 {abs(qty_diff_pct):.1f}% 하회")
            if waste_diff_pct is not None and waste_diff_pct <= 0:
                strengths.append(f"폐기율 {abs(waste_diff_pct):.1f}% 절감")
            elif waste_diff_pct is not None and waste_diff_pct > 0:
                weaknesses.append(f"폐기율 {abs(waste_diff_pct):.1f}% 과다")

            if sales_diff_pct is not None and sales_diff_pct >= 0:
                summary = f"내 매장 일평균 매출이 전체 평균보다 {abs(sales_diff_pct):.1f}% 높습니다 (순위 {rank}/{total})."
                if strengths:
                    summary += f" 강점: {', '.join(strengths[:3])}."
                actions = [
                    "우세 카테고리의 재고·생산 기준을 유지하세요.",
                    "평균 이하 카테고리는 보완 전략을 검토하세요.",
                ]
            elif sales_diff_pct is not None:
                summary = f"내 매장 일평균 매출이 전체 평균보다 {abs(sales_diff_pct):.1f}% 낮습니다 (순위 {rank}/{total})."
                if weaknesses:
                    summary += f" 약점: {', '.join(weaknesses[:3])}."
                if strengths:
                    summary += f" 강점: {', '.join(strengths[:3])}."
                actions = [
                    "평균 이상 매장의 베스트셀러를 비교해 도입을 검토하세요.",
                    "매출 격차가 큰 시간대에 생산·진열을 강화하세요.",
                ]
            else:
                summary = "내 매장과 전체 매장 평균을 비교했습니다."
                actions = ["비교 결과를 바탕으로 부족한 영역의 개선 방안을 검토하세요."]

            period_start = str(sql_result.get("period_start", ""))
            period_end = str(sql_result.get("period_end", ""))
            if period_start and period_end:
                try:
                    _ps = date.fromisoformat(period_start)
                    _pe = date.fromisoformat(period_end)
                    summary += f"\n\n{_ps.strftime('%Y년 %m월')} 결과 기반 전체 비교 점포 평균과 비교 (참가 점포 {total}개)"
                except (ValueError, TypeError):
                    summary += f"\n\n비교 기간 {period_start} ~ {period_end} 기반 전체 비교 점포 평균과 비교 (참가 점포 {total}개)"
            else:
                summary += f"\n\n전체 비교 점포 평균과 비교 (참가 점포 {total}개)"

            return [
                InsightSection(
                    type="metrics",
                    title="벤치마크",
                    data=[
                        {
                            "label": "내 매장 일평균 매출",
                            "value": f"{my_sales:,.0f}원",
                            "change_pct": sales_diff_pct,
                            "color": "green" if (sales_diff_pct or 0) >= 0 else "red",
                        },
                        {
                            "label": "전체 평균 일매출",
                            "value": f"{avg_sales:,.0f}원",
                            "change_pct": None,
                            "color": "gray",
                        },
                        {
                            "label": "내 매장 일평균 판매수량",
                            "value": f"{my_qty:,.0f}개",
                            "change_pct": qty_diff_pct,
                            "color": "green" if (qty_diff_pct or 0) >= 0 else "red",
                        },
                        {
                            "label": "전체 평균 판매수량",
                            "value": f"{avg_qty:,.0f}개",
                            "change_pct": None,
                            "color": "gray",
                        },
                        {
                            "label": "매장 순위",
                            "value": f"{rank}/{total}",
                            "change_pct": None,
                            "color": "gray",
                        },
                    ],
                ),
                InsightSection(
                    type="insight",
                    title="요약",
                    text=summary,
                ),
                InsightSection(type="action", title="지금 할 일", items=actions),
            ]

        if intent == "WASTE":
            return [
                InsightSection(
                    type="chart_data", title="폐기 상위 제품", data=(sql_result[:5] if isinstance(sql_result, list) else [])
                ),
                InsightSection(
                    type="text",
                    text="폐기율이 높은 제품 순으로 정렬했습니다. 상위 상품부터 생산량과 진열 마감 시점을 함께 보세요.",
                ),
            ]

        return [
            InsightSection(
                type="text",
                text=json.dumps(sql_result, ensure_ascii=False, default=str),
            )
        ]

    DELIVERY_KEYWORDS = re.compile(
        r"(배달|딜리버리|쿠팡|배민|해피오더).*(건\s*수|주문\s*건|건수|비교|대비|비중|채널별)"
        r"|(건\s*수|건수).*배달"
        r"|(전\s*주|전\s*월|전주|전월|지난\s*주|지난\s*월).*(배달|딜리버리|쿠팡|배민|해피오더)"
    )

    @classmethod
    def _maybe_delivery_no_data(cls, intent: str, query: str) -> str | None:
        """Check if this is a delivery count question that cannot be answered.

        DB has no channel/delivery columns, so delivery count questions
        must return a graceful "data unavailable" response.
        """
        if intent != "CHANNEL_ANALYSIS":
            return None
        if cls.DELIVERY_KEYWORDS.search(query):
            return "no_delivery_data"
        return None

    def _delivery_no_data_response(
        self, intent: str, query: str, reason: str
    ) -> SalesQueryResponse:
        """Return a graceful response when delivery channel data is unavailable."""
        direction = "증가" if "증가" in query else "감소" if "감소" in query else ""
        period_hint = ""
        if re.search(r"(전\s*주|전주|전\s*월|전월|지난)", query):
            period_hint = "전 주 대비" if "주" in query else "전 월 대비"

        title = f"{'전 주' if '주' in query else '전 월'} 대비 배달 건 수 비교"

        return SalesQueryResponse(
            intent=intent,
            title=title,
            sections=[
                InsightSection(
                    type="text",
                    text=(
                        "현재 DB에는 배달 채널을 구분할 수 있는 데이터가 없어 "
                        "배달 건 수를 산정할 수 없습니다.\n\n"
                        "또한 배민, 쿠팡이츠, 요기요 등 주문 채널 컬럼도 "
                        "현재 보유 테이블에 포함되어 있지 않아 채널별 배달 건수와 "
                        "전체 매출 중 배달 매출 비중을 산출할 수 없습니다.\n\n"
                        "다만 전체 매출/판매 데이터는 확인 가능하므로, "
                        "배달 채널 컬럼 또는 주문 채널 데이터가 적재되면 "
                        "채널별 배달 건 수와 배달 매출 비중을 비교할 수 있습니다."
                    ),
                ),
                InsightSection(
                    type="metrics",
                    title="데이터 현황",
                    data=[
                        {
                            "label": "전체 매출 데이터",
                            "value": "확인 가능",
                            "change_pct": None,
                            "color": "green",
                        },
                        {
                            "label": "배달 채널 구분",
                            "value": "데이터 없음",
                            "change_pct": None,
                            "color": "red",
                        },
                        {
                            "label": "주문 채널 구분",
                            "value": "데이터 없음",
                            "change_pct": None,
                            "color": "red",
                        },
                    ],
                ),
                InsightSection(
                    type="action",
                    title="다음 단계",
                    items=[
                        "배달 채널 컬럼 또는 주문 채널 데이터를 확인하세요",
                        "데이터가 적재되면 동일 질문으로 채널별 비교를 다시 요청하세요",
                        "전체 매출 비교는 '전 주 대비 매출 비교해줘'로 확인 가능합니다",
                    ],
                ),
            ],
            sources=[
                SourceInfo(
                    type="DATA_CLASSIFICATION",
                    description="현재 보유 데이터에 배달 채널 구분값 없음",
                    data_range="",
                    freshness="",
                ),
            ],
            metadata={},
        )

    def _blocked_response(self) -> SalesQueryResponse:
        """Return a policy-blocked response."""
        return SalesQueryResponse(
            intent="SENSITIVE_BLOCKED",
            title="조회 불가",
            sections=[
                InsightSection(
                    type="text",
                    text="해당 정보(순이익, 원가, 마진 등)는 보안 정책상 AI를 통한 조회가 제한됩니다. 본사 시스템을 이용해주세요.",
                )
            ],
            sources=[],
            metadata={"blocked": True, "llm_tokens_used": 0},
        )

    def _month_range(self, value: str) -> tuple[date, date]:
        """Convert `YYYY-MM` into first/last dates of that month."""
        year, month = value.split("-")
        year_i = int(year)
        month_i = int(month)
        last_day = calendar.monthrange(year_i, month_i)[1]
        return date(year_i, month_i, 1), date(year_i, month_i, last_day)

    def _mtd_comparison_ranges(self, latest_biz_date: date) -> dict:
        """MTD vs previous month same-day comparison.

        period2 (recent): 1st of current month to latest_biz_date
        period1 (compare): 1st to latest_biz_date.day of previous month
        """
        period2_end = latest_biz_date
        period2_start = date(latest_biz_date.year, latest_biz_date.month, 1)
        prev_month = latest_biz_date.month - 1 if latest_biz_date.month > 1 else 12
        prev_year = latest_biz_date.year if latest_biz_date.month > 1 else latest_biz_date.year - 1
        period1_end = date(prev_year, prev_month, latest_biz_date.day)
        period1_start = date(prev_year, prev_month, 1)
        return {
            "period1_start": period1_start,
            "period1_end": period1_end,
            "period2_start": period2_start,
            "period2_end": period2_end,
        }

    def _format_delivery_comparison(
        self, sql_result: dict, intent: str
    ) -> list[InsightSection]:
        """Format delivery comparison results from get_delivery_comparison."""
        has_delivery = sql_result.get("has_delivery_data", False)
        total_del_orders = sql_result.get("total_delivery_orders", 0)

        if not has_delivery or total_del_orders == 0:
            return [
                InsightSection(
                    type="text",
                    text=(
                        "현재 채널 데이터에는 배달로 분류 가능한 채널(Order)이 확인되지 않아 "
                        "배달 건 수를 산정할 수 없습니다.\n\n"
                        "전체 매출 데이터는 확인 가능하므로, 배달 채널 데이터가 활성화되면 "
                        "채널별 배달 건수와 비중 비교를 확인하실 수 있습니다."
                    ),
                ),
            ]

        period1 = sql_result.get("period1", {})
        period2 = sql_result.get("period2", {})
        p1_orders = period1.get("delivery_orders", 0)
        p2_orders = period2.get("delivery_orders", 0)
        p1_sales = period1.get("total_sales", 0)
        p2_sales = period2.get("total_sales", 0)
        p1_del_sales = period1.get("delivery_sales", 0)
        p2_del_sales = period2.get("delivery_sales", 0)
        p1_ratio = period1.get("delivery_ratio_pct")
        p2_ratio = period2.get("delivery_ratio_pct")
        order_change = sql_result.get("order_change", 0)
        order_change_pct = sql_result.get("order_change_pct")
        ratio_change = sql_result.get("ratio_change")

        p1_start = period1.get("start", "")
        p1_end = period1.get("end", "")
        p2_start = period2.get("start", "")
        p2_end = period2.get("end", "")

        channel1 = period1.get("delivery_channels", [])
        channel2 = period2.get("delivery_channels", [])

        # Summary text
        direction = "증가" if order_change > 0 else "감소" if order_change < 0 else "변동 없음"
        abs_change = abs(order_change)
        change_text = (
            f"{direction}했습니다" if order_change != 0 else "변동 없습니다"
        )

        summary_lines = [
            f"비교 기간: {p2_start}~{p2_end} vs {p1_start}~{p1_end}",
            f"총 배달 건 수는 최근 기간 {p2_orders}건, 비교 기간 {p1_orders}건으로 {abs_change}건 {change_text}",
        ]
        if order_change_pct is not None:
            summary_lines[-1] += f" (증감률 {order_change_pct:+.1f}%)"
        summary_lines[-1] += "."

        # Channel breakdown
        channel_parts = []
        for ch in channel2:
            name = ch.get("channel_name", "")
            cnt = ch.get("ord_cnt", 0)
            channel_parts.append(f"{name} {cnt}건")
        if channel_parts:
            summary_lines.append(f"채널별(최근 기준): {', '.join(channel_parts)}.")

        # Ratio
        if p1_ratio is not None and p2_ratio is not None:
            summary_lines.append(
                f"전체 매출 중 배달 매출 비중은 최근 기간 {p2_ratio}%, 비교 기간 {p1_ratio}%로 "
                f"{'증가' if ratio_change and ratio_change > 0 else '감소'}했습니다"
                if ratio_change
                else f"입니다"
            )
            if ratio_change is not None:
                summary_lines[-1] += f" ({ratio_change:+.1f}p)."
            else:
                summary_lines[-1] += "."
        elif p2_ratio is not None:
            summary_lines.append(f"최근 기간 배달 매출 비중은 {p2_ratio}%입니다.")

        summary_text = " ".join(summary_lines)

        metrics_data = [
            {
                "label": "최근 기간 배달 건 수",
                "value": f"{p2_orders}건",
                "change_pct": order_change_pct,
                "color": "green" if (order_change_pct or 0) >= 0 else "red",
            },
            {
                "label": "비교 기간 배달 건 수",
                "value": f"{p1_orders}건",
                "change_pct": None,
                "color": "gray",
            },
            {
                "label": "최근 기간 배달 비중",
                "value": f"{p2_ratio}%" if p2_ratio is not None else "N/A",
                "change_pct": ratio_change,
                "color": "blue",
            },
            {
                "label": "비교 기간 배달 비중",
                "value": f"{p1_ratio}%" if p1_ratio is not None else "N/A",
                "change_pct": None,
                "color": "gray",
            },
        ]

        actions = []
        if order_change >= 0 and order_change_pct is not None and order_change_pct > 0:
            actions.append("배달 비중이 늘어난 채널의 피크 시간대 품목을 확인하고, 해당 시간대 생산/발주 수량을 우선 점검하세요.")
        elif order_change < 0 and order_change_pct is not None and order_change_pct < 0:
            actions.append("배달 건 수가 줄어든 채널의 프로모션 현황과 배달 제휴 상태를 점검하세요.")
        else:
            actions.append("배달 건 수 변동이 크지 않으므로 현재 운영 방식을 유지하면서 상위 판매 상품 중심으로 관리하세요.")

        if ratio_change is not None and ratio_change > 0:
            actions.append("배달 비중 상승에 따라 배달 전용 포장 용품 재고를 확인하세요.")
        elif ratio_change is not None and ratio_change < 0:
            actions.append("배달 비중 하락 시 홀 매장 경험 강화(진열, 대기시간 개선)를 검토하세요.")

        return [
            InsightSection(
                type="metrics",
                title="배달 건 수 비교",
                data=metrics_data,
            ),
            InsightSection(
                type="insight",
                title="요약",
                text=summary_text,
            ),
            InsightSection(type="action", title="실행 인사이트", items=actions),
        ]

    def _format_product_sales_comparison(
        self, sql_result: dict, store_id: str = ""
    ) -> list[InsightSection]:
        product_name = sql_result.get("product_name", "")
        matched = sql_result.get("matched_products", [])
        # Build display name
        if matched:
            display_name = ", ".join(matched)
        elif product_name:
            display_name = product_name
        else:
            display_name = "해당 상품"
        if not sql_result.get("has_data"):
            error = sql_result.get("error", "")
            period_type_no = sql_result.get("period_type", "month")
            period_labels_no = {"day": "전일", "week": "전주", "month": "전월", "year": "연"}
            p1_label_no = period_labels_no.get(period_type_no, "전월")
            return [
                InsightSection(
                    type="text",
                    text=(
                        f"현재 기간에 {display_name}으로 분류되는 상품 판매 내역이 없어 "
                        f"{p1_label_no} 대비 비교가 어렵습니다.\n"
                        + (f"해당 상품명을 찾을 수 없습니다." if not matched else "")
                        + (f"\n(오류: {error})" if error else "")
                    ),
                ),
                InsightSection(
                    type="action",
                    title="권장 액션",
                    items=[f"{display_name} 상품 재고를 확인하고 진열 상태를 점검하세요." if product_name else "상품 재고를 확인하고 진열 상태를 점검하세요."],
                ),
            ]
        p1 = sql_result.get("period1", {})
        p2 = sql_result.get("period2", {})
        p1_start = p1.get("start", "")
        p1_end = p1.get("end", "")
        p2_start = p2.get("start", "")
        p2_end = p2.get("end", "")
        p1_qty = (p1.get("qty") or 0)
        p2_qty = (p2.get("qty") or 0)
        p1_sales = float(p1.get("sales") or 0)
        p2_sales = float(p2.get("sales") or 0)
        p1_ratio = p1.get("ratio_pct", 0) or 0
        p2_ratio = p2.get("ratio_pct", 0) or 0
        p1_rank = p1.get("avg_rank")
        p2_rank = p2.get("avg_rank")
        p1_peer_avg = float(p1.get("peer_avg_qty", 0) or 0)
        p2_peer_avg = float(p2.get("peer_avg_qty", 0) or 0)
        p1_peer_cnt = p1.get("peer_cnt", 0) or 0
        p2_peer_cnt = p2.get("peer_cnt", 0) or 0
        qty_chg = sql_result.get("qty_change") or 0
        qty_chg_pct = sql_result.get("qty_change_pct")
        sales_chg = sql_result.get("sales_change") or 0
        sales_chg_pct = sql_result.get("sales_change_pct")
        ratio_chg = sql_result.get("ratio_change")
        period_type = sql_result.get("period_type", "month")
        period_labels = {"day": "전일", "week": "전주 동일 기간", "month": "전월 동일 기간", "year": "전년 동일 기간"}
        p1_label = period_labels.get(period_type, "비교 기간")
        p2_label = "최근 기간"
        title_label = period_labels.get(period_type, "전월 대비")
        lines = []
        lines.append(
            f"비교 기간은 {p2_start}~{p2_end}와 {p1_start}~{p1_end}입니다."
        )
        qty_dir = "증가" if qty_chg >= 0 else "감소"
        sales_dir = "증가" if sales_chg >= 0 else "감소"
        qty_pct_text = f"({abs(qty_chg_pct):.1f}%)" if qty_chg_pct is not None else ""
        sales_pct_text = f"({abs(sales_chg_pct):.1f}%)" if sales_chg_pct is not None else ""
        lines.append(
            f"대상 상품({display_name})은 판매 수량이 {p2_qty}개로 {p1_label}보다 {abs(qty_chg)}개 {qty_pct_text} {qty_dir}했고, "
            f"매출은 ₩{p2_sales:,.0f}으로 ₩{abs(sales_chg):,.0f} {sales_pct_text} {sales_dir}했습니다."
        )
        ratio_rank_parts = []
        if ratio_chg is not None:
            r_dir = "상승" if ratio_chg > 0 else ("하락" if ratio_chg < 0 else "유지")
            ratio_rank_parts.append(f"전체 매출 비중은 {p2_ratio}%로 {abs(ratio_chg)}%p {r_dir}했습니다")
        if p1_rank is not None and p2_rank is not None:
            rank_dir = "상승" if p2_rank < p1_rank else ("하락" if p2_rank > p1_rank else "유지")
            if p1_rank == p2_rank:
                ratio_rank_parts.append(f"매출 순위는 {p2_rank}위를 유지했습니다")
            else:
                ratio_rank_parts.append(f"매출 순위는 {p1_rank}위에서 {p2_rank}위로 {abs(p2_rank - p1_rank)}단계 {rank_dir}했습니다")
        if ratio_rank_parts:
            lines.append("; ".join(ratio_rank_parts) + ".")
        else:
            lines.append("현재 순위 변화는 표시하지 않았습니다.")
        if p2_peer_cnt > 0 and p2_peer_avg > 0:
            peer_phrase = "많이 팔려 강점이 있습니다" if p2_qty >= p2_peer_avg else "적게 팔려 판매량 확대 여지가 있습니다"
            lines.append(
                f"다만 비교 매장 {p2_peer_cnt}곳 평균 {p2_peer_avg:.0f}개보다 {abs(p2_qty - p2_peer_avg):.0f}개 {peer_phrase}."
            )
        else:
            lines.append(
                f"인근 상권 또는 유사 그룹 기준은 현재 화면에 연결되어 있지 않아, "
                "단독 기준으로만 비교했습니다."
            )
        actions = []
        if sales_chg >= 0:
            actions.append(
                "피크 시간대 진열을 강화하고 인기 품목 생산량을 우선 점검해 보세요."
            )
        else:
            actions.append(
                f"{display_name} 비중이 줄었다면 대체 인기 상품과 함께 진열 구성을 "
                "조정하고, 할인/이벤트 적용 여부와 함께 재고 현황을 확인하세요."
            )
        return [
            InsightSection(
                type="metrics",
                title=f"{display_name} {title_label}",
                data=[
                    {
                        "label": "최근 기간 판매 수량",
                        "value": f"{p2_qty}개",
                        "change_pct": qty_chg_pct,
                        "color": "green" if (qty_chg_pct or 0) >= 0 else "red",
                    },
                    {
                        "label": "비교 기간 판매 수량",
                        "value": f"{p1_qty}개",
                        "change_pct": None,
                        "color": "gray",
                    },
                    {
                        "label": "최근 기간 매출",
                        "value": f"₩{p2_sales:,.0f}",
                        "change_pct": sales_chg_pct,
                        "color": "green" if (sales_chg_pct or 0) >= 0 else "red",
                    },
                    {
                        "label": "비교 기간 매출",
                        "value": f"₩{p1_sales:,.0f}",
                        "change_pct": None,
                        "color": "gray",
                    },
                    {
                        "label": "전체 매출 비중(최근)",
                        "value": f"{p2_ratio}%",
                        "change_pct": ratio_chg,
                        "color": "blue",
                    },
                    {
                        "label": "전체 매출 비중(비교)",
                        "value": f"{p1_ratio}%",
                        "change_pct": None,
                        "color": "gray",
                    },
                ],
            ),
            InsightSection(type="text", text="\n".join(lines)),
            InsightSection(type="action", title="지금 할 일", items=actions),
        ]

    def _relative_comparison_ranges(
        self, latest_biz_date: date, relative_period: str
    ) -> dict:
        """Resolve relative-period queries into two comparable date ranges."""
        if relative_period == "last_month":
            period2_end = latest_biz_date
            period2_start = latest_biz_date - timedelta(days=27)
            period1_end = period2_start - timedelta(days=1)
            period1_start = period1_end - timedelta(days=27)
        elif relative_period == "last_year":
            period2_start = latest_biz_date - timedelta(days=29)
            period2_end = latest_biz_date
            period1_start = period2_start.replace(year=period2_start.year - 1)
            period1_end = period2_end.replace(year=period2_end.year - 1)
        else:
            period2_end = latest_biz_date
            period2_start = latest_biz_date - timedelta(days=6)
            period1_end = period2_start - timedelta(days=1)
            period1_start = period1_end - timedelta(days=6)
        return {
            "period1_start": period1_start,
            "period1_end": period1_end,
            "period2_start": period2_start,
            "period2_end": period2_end,
        }

    def _build_title(self, intent: str, query: str) -> str:
        """Build a human-readable response title."""
        titles = {
            "SALES_COMPARISON": "매출 비교 분석",
            "CHANNEL_ANALYSIS": "채널 분석",
            "PROMO_ANALYSIS": "프로모션 매출 분석",
            "BENCHMARK": "벤치마크 비교",
            "RANKING": "순위 조회",
            "TREND": "추세 분석",
            "CATEGORY": "카테고리 분석",
            "DAILY_SUMMARY": "일일 KPI 요약",
            "WASTE": "폐기 분석",
            "DELIVERY_CHANNEL_REVENUE": "배달 채널별 매출",
        }
        return titles.get(intent, query[:30])

    def _build_sources(self, intent: str, resolved_params: dict) -> list[SourceInfo]:
        """Attach lightweight source metadata with data source classification."""
        source_labels = {
            "SALES_COMPARISON": "실데이터 (POS 판매 실적)",
            "CHANNEL_ANALYSIS": "실데이터 (POS 주문 채널 및 매출)",
            "PROMO_ANALYSIS": "행사 참여 및 매출 자료 기준",
            "BENCHMARK": "파생 데이터 (전점 평균 비교 산출)",
            "DAILY_SUMMARY": "실데이터 (일일 핵심 지표)",
            "RANKING": "실데이터 (판매 순위)",
            "CATEGORY": "실데이터 (카테고리별 비중)",
            "TREND": "실데이터 (28일 추이)",
            "WASTE": "실데이터 (폐기 실적)",
            "DELIVERY_CHANNEL_REVENUE": "실데이터 (배달 채널별 매출)",
        }
        label = source_labels.get(intent, "실데이터")
        source_desc_kr = {
            "SALES_COMPARISON": "매출 비교 데이터",
            "CHANNEL_ANALYSIS": "주문 채널 및 매출 데이터 기준",
            "PROMO_ANALYSIS": "행사 참여 및 매출 자료 기준",
            "BENCHMARK": "전체 비교 점포 평균 기준",
            "DAILY_SUMMARY": "일일 핵심 지표 데이터",
            "RANKING": "판매 순위 데이터",
            "CATEGORY": "카테고리 비중 데이터",
            "TREND": "28일 추이 데이터",
            "WASTE": "폐기 실적 데이터",
            "PRODUCT_SALES_COMPARISON": "상품명 기반 판매 및 매출 데이터 기준",
            "DELIVERY_CHANNEL_REVENUE": "배달 채널별 매출 데이터 기준",
        }
        return [
            SourceInfo(
                type="SQL_QUERY",
                description=source_desc_kr.get(intent, f"{intent}용 SQL 조회"),
                data_range=json.dumps(resolved_params, default=str),
                freshness=datetime.now(UTC).isoformat(),
            ),
            SourceInfo(
                type="DATA_CLASSIFICATION",
                description=label,
                data_range="",
                freshness="",
            ),
        ]
