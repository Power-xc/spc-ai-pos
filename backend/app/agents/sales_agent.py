"""Sales analysis agent."""

from __future__ import annotations

import calendar
import json
from datetime import UTC, date, datetime, timedelta
from time import perf_counter
import re
from uuid import uuid4

from app.schemas.sales import InsightSection, SalesQueryResponse, SourceInfo
from app.services.chat_trace import add_elapsed, add_ms
from app.tools import sql_queries


class SalesAnalysisAgent:
    """매출 분석 Agent."""

    TOOL_MAP = {
        "SALES_COMPARISON": "get_sales_comparison",
        "CHANNEL_ANALYSIS": "get_sales_comparison",
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
    }

    NEEDS_LLM = {
        "SALES_COMPARISON": True,
        "CHANNEL_ANALYSIS": True,
        "PROMO_ANALYSIS": True,
        "BENCHMARK": True,
        "RANKING": False,
        "TREND": True,
        "CATEGORY": False,
        "DAILY_SUMMARY": False,
        "WASTE": True,
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
                    intent, intent_result.get("params", {}), store_id, db
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
                    trace=trace,
                )
                metadata["llm_tokens_used"] += llm_meta.get("llm_tokens_used", 0)
                metadata["llm_model"] = llm_meta.get("model")
                metadata["masked_fields"] = llm_meta.get("masked_fields", [])
            else:
                sections = self._format_simple(intent, sql_result)

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
    ) -> dict:
        """Convert extracted params into SQL function args."""
        latest_biz_date = await sql_queries.get_latest_biz_date(db, store_id)
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
            return self._relative_comparison_ranges(latest_biz_date, relative)

        if intent == "PROMO_ANALYSIS":
            return {
                "promo_name": params.get("product_name") or params.get("promo_name"),
                "start_date": latest_biz_date - timedelta(days=30),
                "end_date": latest_biz_date,
            }

        if intent == "BENCHMARK":
            return {
                "start_date": latest_biz_date - timedelta(days=6),
                "end_date": latest_biz_date,
            }

        if intent in {"RANKING", "CATEGORY"}:
            return {
                "start_date": latest_biz_date - timedelta(days=6),
                "end_date": latest_biz_date,
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
                target_date = latest_biz_date
            return {"biz_date": target_date}

        if intent == "WASTE":
            return {"days": 7, "top_n": 10}

        return {}

    async def _lookup_product_id(self, db, product_name: str) -> str | None:
        """Resolve a product name to the closest matching product_id."""
        return await sql_queries.lookup_product_id(db, product_name)

    async def _generate_insight(
        self,
        query: str,
        intent: str,
        sql_result,
        store_id: str,
        role: str,
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
                    *self._format_simple(intent, sql_result),
                ],
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
            simple_sections = self._format_simple(intent, sql_result)
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
                *self._format_simple(intent, sql_result),
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

    def _format_simple(self, intent: str, sql_result) -> list[InsightSection]:
        """Format SQL-only results without using the LLM."""
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

            summary_parts = []
            period2_sales = float(period2.get("total_sales", 0) or 0)
            period1_sales = float(period1.get("total_sales", 0) or 0)
            if period2_sales == 0 and period1_sales > 0:
                summary_parts.append(
                    "비교 대상 기간의 매출 데이터가 없습니다. 해당 기간의 POS 데이터가 존재하지 않아 비교가 어렵습니다."
                )
                summary_parts.append(
                    f"비교 기간({period1.get('label', '기준 기간')}) 매출은 {period1_sales:,.0f}원입니다."
                )
            elif period1_sales == 0 and period2_sales > 0:
                summary_parts.append(
                    "기준 기간의 매출 데이터가 없습니다. 해당 기간의 POS 데이터가 존재하지 않아 비교가 어렵습니다."
                )
                summary_parts.append(f"최근 기간 매출은 {period2_sales:,.0f}원입니다.")
            else:
                if sales_change is not None:
                    direction = "증가" if sales_change >= 0 else "감소"
                    summary_parts.append(
                        f"매출은 비교 기간 대비 {abs(sales_change):.1f}% {direction}했습니다."
                    )
                if qty_change is not None:
                    direction = "늘었고" if qty_change >= 0 else "줄었고"
                    summary_parts.append(
                        f"판매 수량도 {abs(qty_change):.1f}% {direction}"
                    )
                if stockout_change is not None:
                    direction = "증가" if stockout_change >= 0 else "감소"
                    summary_parts.append(
                        f"평균 품절 시간은 {abs(stockout_change):.1f}% {direction}했습니다."
                    )

            actions = []
            if period2_sales == 0 and period1_sales > 0:
                actions.append(
                    "비교 대상 기간 데이터가 없어 최근 실적 위주로 점검하세요."
                )
            elif period1_sales == 0 and period2_sales > 0:
                actions.append("기준 기간 데이터가 없어 최근 실적 위주로 점검하세요.")
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

            return [
                InsightSection(
                    type="metrics",
                    title="비교 지표",
                    data=[
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
                    ],
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

            summary += f"\n\n근거: 최근 7일 실적 기반 클러스터 내 점포 평균과 비교 (참여 점포 {total}개)"

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

        if intent == "PROMO_ANALYSIS":
            promo_data = sql_result if isinstance(sql_result, list) else []
            if promo_data:
                top_promo = promo_data[0] if promo_data else {}
                top_name = top_promo.get("promo_name", "프로모션")
                top_sales = float(top_promo.get("sales_amt", 0) or 0)
                top_bills = int(top_promo.get("bill_cnt", 0) or 0)
                total_promo_sales = sum(
                    float(p.get("sales_amt", 0) or 0) for p in promo_data
                )
                total_promo_bills = sum(
                    int(p.get("bill_cnt", 0) or 0) for p in promo_data
                )
                top_conv = float(
                    top_promo.get("전환율", 0)
                    or top_promo.get("conversion_rate", 0)
                    or 0
                )
                top_contrib = float(
                    top_promo.get("매출기여", 0)
                    or top_promo.get("sales_contribution", 0)
                    or 0
                )

                summary_parts = [
                    f"최근 집계 기준, '{top_name}'이 가장 높은 성과를 기록했습니다 (매출 {top_sales:,.0f}원, {top_bills}건)."
                ]

                if len(promo_data) > 1:
                    second = promo_data[1]
                    second_name = second.get("promo_name", "")
                    second_sales = float(second.get("sales_amt", 0) or 0)
                    summary_parts.append(
                        f"2위는 '{second_name}' (매출 {second_sales:,.0f}원)입니다."
                    )

                if total_promo_sales > 0:
                    top_share = (top_sales / total_promo_sales) * 100
                    summary_parts.append(
                        f"전체 프로모션 매출 중 '{top_name}' 비중은 {top_share:.1f}%입니다."
                    )

                if top_conv > 0:
                    summary_parts.append(f"전환율은 {top_conv:.1f}%입니다.")

                low_promos = [
                    p
                    for p in promo_data
                    if float(p.get("전환율", 0) or p.get("conversion_rate", 0) or 0)
                    < 10
                    and p.get("promo_name") != top_name
                ]
                if low_promos:
                    low_names = ", ".join(
                        p.get("promo_name", "")[:15] for p in low_promos[:2]
                    )
                    summary_parts.append(f"반응률이 낮은 프로모션: {low_names}")

                summary = " ".join(summary_parts)
                summary += f"\n\n근거: 최근 집계 기준 캠페인 실적 데이터 (총 참여 {total_promo_bills:,.0f}건)"

                actions = [
                    f"성과가 높은 '{top_name}' 유형의 프로모션 구성을 다음 기획에 반영하세요.",
                    "반응률이 낮은 프로모션은 타겟팅과 시간대를 재검토하세요.",
                ]
                if top_contrib > 0:
                    actions.append(
                        f"매출 기여도 {top_contrib:.1f}% 유지를 위해 주력 상품 재고를 충분히 확보하세요."
                    )
            else:
                summary = "최근 프로모션 실적 데이터가 없습니다."
                actions = ["프로모션 기간이 설정되면 실적을 다시 확인하세요."]

            return [
                InsightSection(
                    type="chart_data", title="프로모션 분석", data=promo_data
                ),
                InsightSection(type="insight", title="요약", text=summary),
                InsightSection(type="action", title="지금 할 일", items=actions),
            ]

        if intent == "WASTE":
            top_items = sql_result[:5] if isinstance(sql_result, list) else []
            return [
                InsightSection(
                    type="chart_data", title="폐기 상위 제품", data=top_items
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
            "PROMO_ANALYSIS": "프로모션 분석",
            "BENCHMARK": "벤치마크 비교",
            "RANKING": "순위 조회",
            "TREND": "추세 분석",
            "CATEGORY": "카테고리 분석",
            "DAILY_SUMMARY": "일일 KPI 요약",
            "WASTE": "폐기 분석",
        }
        return titles.get(intent, query[:30])

    def _build_sources(self, intent: str, resolved_params: dict) -> list[SourceInfo]:
        """Attach lightweight source metadata with data source classification."""
        source_labels = {
            "SALES_COMPARISON": "실데이터 (POS 판매 실적)",
            "CHANNEL_ANALYSIS": "실데이터 (POS 채널별 판매 실적)",
            "PROMO_ANALYSIS": "실데이터 (캠페인 실적 집계)",
            "BENCHMARK": "파생 데이터 (전점 평균 비교 산출)",
            "DAILY_SUMMARY": "실데이터 (일일 핵심 지표)",
            "RANKING": "실데이터 (판매 순위)",
            "CATEGORY": "실데이터 (카테고리별 비중)",
            "TREND": "실데이터 (28일 추이)",
            "WASTE": "실데이터 (폐기 실적)",
        }
        label = source_labels.get(intent, "실데이터")
        return [
            SourceInfo(
                type="SQL_QUERY",
                description=f"{intent}용 SQL 조회",
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
