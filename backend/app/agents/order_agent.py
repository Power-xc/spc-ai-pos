"""Order management agent."""

from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.schemas.common import AlertCard
from app.schemas.orders import (
    DraftOrderResponse,
    OrderConfirmResponse,
    OrderItem,
    OrderOption,
    OrderOptionsResponse,
    OrderRiskItem,
    OrderRiskResponse,
)
from app.services.chat_trace import add_elapsed, add_ms
from app.tools import sql_queries
from app.tools.templates import DOW_NAMES

logger = logging.getLogger(__name__)

ORDER_DEADLINES = {
    "도넛": "15:00",
    "음료": "17:00",
    "기타": "16:00",
}


class OrderAgent:
    """Create order options, analyze anomalies, and manage draft approval flow."""

    def __init__(
        self,
        db_session_factory,
        template_engine,
        llm_gateway,
        notification_service,
        audit_logger=None,
    ) -> None:
        self.db_session_factory = db_session_factory
        self.template_engine = template_engine
        self.llm_gateway = llm_gateway
        self.notification_service = notification_service
        self.audit_logger = audit_logger
        self._confirmed_orders: dict[str, list[dict]] = {}
        self._last_generated_options: dict[str, OrderOptionsResponse] = {}
        self._category_generated_options: dict[str, OrderOptionsResponse] = {}
        self._draft_orders: dict[str, dict] = {}
        self._events_cache: list[dict[str, Any]] | None = None

    @staticmethod
    def _llm_enabled(llm_gateway) -> bool:
        api_key = str(getattr(llm_gateway, "api_key", "") or "").strip()
        return bool(api_key) and api_key.upper() != "EMPTY"

    def _build_option_explanation_fallback(
        self,
        *,
        option_id: str,
        option_data: dict[str, Any],
        flags: list[str],
        anomalies: list[str],
        explanation_parts: list[str],
        period_event: dict[str, Any] | None,
        deviation_pct: float,
    ) -> str:
        if explanation_parts:
            return " ".join(explanation_parts)
        if "CAMPAIGN_PERIOD" in anomalies:
            return self.template_engine.render(
                "order_option_with_promo",
                option_label=option_data.get("label", option_id),
                promo_name="프로모션",
                deviation_pct=abs(deviation_pct),
                more_or_less="많았습니다" if deviation_pct >= 0 else "적었습니다",
                alternative_suggestion=(
                    "최근 판매·폐기·품절 실적 기준 추정 주문안이므로 평균에 가까운 옵션과 함께 비교해보세요."
                ),
            )
        if period_event is not None:
            return " ".join(explanation_parts)
        if "ESTIMATED_FROM_SALES" in flags:
            return (
                f"{option_data.get('label', option_id)}은 최근 동요일 판매·폐기·품절 실적을 기준으로 추정한 주문안입니다. "
                f"{option_data.get('deviation_label', '평균 수준')}이며 판매 gold 데이터를 근거로 계산했습니다."
            )
        return self.template_engine.render(
            "order_option_normal",
            option_label=option_data.get("label", option_id),
            deviation_label=option_data.get("deviation_label", "유사합니다"),
        )

    async def generate_order_options(
        self,
        store_id: str,
        category: str | None = None,
        reference_date: date | None = None,
        include_explanation: bool = True,
        user_id: str = "anonymous",
        role: str = "store_owner",
        trace: dict[str, Any] | None = None,
    ) -> OrderOptionsResponse:
        """Generate three baseline order options and optional special-period option."""
        try:
            if self.audit_logger:
                await self.audit_logger.log_access(
                    user_id=user_id,
                    role=role,
                    action="order_options",
                    resource="order:options",
                    masked_fields=[],
                    details={"store_id": store_id, "category": category or "도넛"},
                )

            effective_category = category or "도넛"
            db_started_at = perf_counter()
            async with self.db_session_factory() as db:
                reference = await sql_queries.get_order_reference_data(
                    db,
                    store_id,
                    effective_category,
                    reference_date=reference_date,
                )
            db_elapsed = add_elapsed(trace, "order_options_fetch_ms", db_started_at)
            add_ms(trace, "db_ms", db_elapsed)

            latest_biz_date = (
                date.fromisoformat(reference["latest_biz_date"])
                if reference.get("latest_biz_date")
                else datetime.now().date()
            )

            four_week_avg_rows = reference.get("four_week_avg", [])
            four_week_avg_qty = sum(
                float(
                    row.get(
                        "effective_order_qty",
                        row.get("confirmed_qty", row.get("order_qty", 0)),
                    )
                    or 0
                )
                for row in four_week_avg_rows
            )

            promo_names = {
                promo.get("promo_name")
                for promo in reference.get("active_promos", [])
                if promo.get("promo_name")
            }
            promo_dates = {
                str(promo.get("biz_date"))
                for promo in reference.get("active_promos", [])
                if promo.get("biz_date")
            }
            option_reference_dates = {
                "option_last_week": latest_biz_date - timedelta(days=7),
                "option_2weeks_ago": latest_biz_date - timedelta(days=14),
                "option_last_month": latest_biz_date - timedelta(days=28),
            }

            def build_option(
                option_id: str, label: str, rows: list[dict]
            ) -> OrderOption:
                total_qty = sum(
                    int(
                        round(
                            float(
                                row.get(
                                    "effective_order_qty",
                                    row.get("confirmed_qty", row.get("order_qty", 0)),
                                )
                                or 0
                            )
                        )
                    )
                    for row in rows
                )
                total_amount = round(
                    sum(
                        float(row.get("effective_order_amt", 0) or 0)
                        if float(row.get("effective_order_amt", 0) or 0) > 0
                        else (
                            float(
                                row.get(
                                    "effective_order_qty",
                                    row.get("confirmed_qty", row.get("order_qty", 0)),
                                )
                                or 0
                            )
                            * float(row.get("base_price", 0) or 0)
                        )
                        for row in rows
                    ),
                    2,
                )
                deviation_pct = (
                    round(
                        ((total_qty - four_week_avg_qty) / four_week_avg_qty) * 100, 1
                    )
                    if four_week_avg_qty
                    else 0.0
                )
                if abs(deviation_pct) <= 5:
                    deviation_label = "평균 수준"
                elif deviation_pct > 0:
                    deviation_label = f"평균 대비 {deviation_pct}% 많음"
                else:
                    deviation_label = f"평균 대비 {abs(deviation_pct)}% 적음"

                flags: list[str] = []
                reference_date = option_reference_dates.get(option_id, latest_biz_date)
                if reference_date.isoformat() in promo_dates or promo_names:
                    flags.append("CAMPAIGN_PERIOD")
                flags.append("ESTIMATED_FROM_SALES")
                if total_qty <= 0:
                    flags.append("DATA_UNAVAILABLE")

                return OrderOption(
                    option_id=option_id,
                    label=label,
                    reference_date=str(reference_date),
                    total_qty=total_qty,
                    total_amount=total_amount,
                    deviation_from_avg_pct=deviation_pct,
                    deviation_label=deviation_label,
                    items=[
                        OrderItem(
                            product_id=row["product_id"],
                            product_name=row["product_name"],
                            quantity=int(
                                round(
                                    float(
                                        row.get(
                                            "effective_order_qty",
                                            row.get(
                                                "confirmed_qty", row.get("order_qty", 0)
                                            ),
                                        )
                                        or 0
                                    )
                                )
                            ),
                            base_price=float(row.get("base_price", 0) or 0),
                        )
                        for row in rows
                    ],
                    flags=flags,
                )

            options = [
                build_option(
                    "option_last_week",
                    "전주 동요일",
                    reference.get("option_last_week", []),
                ),
                build_option(
                    "option_2weeks_ago",
                    "전전주 동요일",
                    reference.get("option_2weeks_ago", []),
                ),
                build_option(
                    "option_last_month",
                    "전월 동요일",
                    reference.get("option_last_month", []),
                ),
            ]

            special_option = await self._build_special_period_option(
                store_id, latest_biz_date, effective_category
            )
            if special_option is not None:
                options.append(special_option)

            best_option = (
                min(options, key=lambda option: abs(option.deviation_from_avg_pct))
                if options
                else None
            )
            explanation = None
            if include_explanation and best_option is not None:
                explanation = await self.analyze_option(
                    store_id,
                    best_option.option_id,
                    best_option.model_dump(mode="python"),
                    category=effective_category,
                    user_id=user_id,
                    role=role,
                    trace=trace,
                )

            response = OrderOptionsResponse(
                store_id=store_id,
                product_group=None,
                category=effective_category,
                deadline=ORDER_DEADLINES.get(
                    effective_category, ORDER_DEADLINES.get("기타")
                ),
                options=options,
                four_week_avg_qty=round(four_week_avg_qty, 2),
                explanation=explanation,
            )
            self._last_generated_options[store_id] = response
            self._category_generated_options[
                self._category_cache_key(store_id, effective_category)
            ] = response
            return response
        except Exception as exc:
            if self.audit_logger:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    role=role,
                    action="order_options",
                    resource="order:options",
                    error=str(exc),
                    details={"store_id": store_id, "category": category},
                )
            logger.exception(
                "Failed to generate order options for store_id=%s", store_id
            )
            return OrderOptionsResponse(
                store_id=store_id,
                product_group=None,
                category=category,
                deadline=ORDER_DEADLINES.get(category or "도넛"),
                options=[],
                four_week_avg_qty=0,
                explanation="처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            )

    async def get_cached_or_generate_options(
        self,
        *,
        store_id: str,
        category: str | None = None,
        include_explanation: bool = False,
        user_id: str = "anonymous",
        role: str = "store_owner",
        trace: dict[str, Any] | None = None,
    ) -> OrderOptionsResponse:
        """Reuse previously generated options when possible to avoid redundant query cost."""
        cached = self.get_cached_options(store_id=store_id, category=category)
        if cached is not None and not include_explanation:
            return cached
        return await self.generate_order_options(
            store_id=store_id,
            category=category,
            include_explanation=include_explanation,
            user_id=user_id,
            role=role,
            trace=trace,
        )

    @staticmethod
    def _category_cache_key(store_id: str, category: str | None) -> str:
        return f"{store_id}::{category or '도넛'}"

    def get_cached_options(
        self,
        *,
        store_id: str,
        category: str | None = None,
    ) -> OrderOptionsResponse | None:
        if category:
            exact = self._category_generated_options.get(
                self._category_cache_key(store_id, category)
            )
            if exact is not None:
                return exact
        return self._last_generated_options.get(store_id)

    async def get_deadline_snapshots(
        self,
        *,
        store_id: str,
        reference_datetime: datetime | None = None,
    ) -> list[dict[str, Any]]:
        async with self.db_session_factory() as db:
            store = await sql_queries.get_store_info(db, store_id)
            timezone_name = (store or {}).get("timezone") or "Asia/Seoul"
            timezone = ZoneInfo(timezone_name)
            if reference_datetime is None:
                now = datetime.now(timezone)
            elif reference_datetime.tzinfo is None:
                now = reference_datetime.replace(tzinfo=timezone)
            else:
                now = reference_datetime.astimezone(timezone)
            confirmed = await sql_queries.get_today_confirmed_order_status(
                db,
                store_id,
                now.date(),
            )

        snapshots: list[dict[str, Any]] = []
        for category, deadline in ORDER_DEADLINES.items():
            deadline_dt = datetime.combine(
                now.date(),
                datetime.strptime(deadline, "%H:%M").time(),
                tzinfo=now.tzinfo,
            )
            minutes_remaining = int((deadline_dt - now).total_seconds() // 60)
            confirmed_info = (confirmed.get("categories") or {}).get(category, {})
            confirmed_count = int(confirmed_info.get("confirmed_order_count") or 0)
            status = (
                "confirmed"
                if confirmed_count > 0
                else ("past_due" if minutes_remaining < 0 else "pending")
            )
            snapshots.append(
                {
                    "category": category,
                    "deadline": deadline,
                    "minutes_remaining": minutes_remaining,
                    "confirmed_order_count": confirmed_count,
                    "last_confirmed_at": confirmed_info.get("last_confirmed_at"),
                    "status": status,
                    "now_local": now.isoformat(),
                }
            )
        return snapshots

    async def build_recent_order_adjustment_summary(
        self,
        *,
        store_id: str,
        category: str | None = None,
        limit: int = 3,
        trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build adjustment guidance from recent order snapshots."""
        db_started_at = perf_counter()
        async with self.db_session_factory() as db:
            snapshots = await sql_queries.get_recent_order_snapshots(
                db,
                store_id,
                category=category,
                limit=limit,
            )
        db_elapsed = add_elapsed(trace, "order_recent_history_ms", db_started_at)
        add_ms(trace, "db_ms", db_elapsed)

        if not snapshots:
            return {
                "message": "최근 영업 실적 데이터가 부족해 조정안을 계산하지 못했습니다.",
                "recent_orders": [],
                "adjusted_items": [],
            }

        aggregate: dict[str, dict[str, Any]] = {}
        for snapshot in snapshots:
            for item in snapshot.get("top_items") or []:
                product_id = str(item.get("product_id") or "")
                if not product_id:
                    continue
                row = aggregate.setdefault(
                    product_id,
                    {
                        "product_id": product_id,
                        "product_name": str(item.get("product_name") or ""),
                        "base_price": float(item.get("base_price", 0) or 0),
                        "quantity_sum": 0.0,
                        "count": 0,
                    },
                )
                row["quantity_sum"] += float(item.get("quantity", 0) or 0)
                row["count"] += 1

        adjusted_items = []
        for row in aggregate.values():
            avg_qty = row["quantity_sum"] / max(int(row["count"]), 1)
            adjusted_items.append(
                {
                    "product_id": row["product_id"],
                    "product_name": row["product_name"],
                    "quantity": max(int(round(avg_qty)), 1),
                    "base_price": row["base_price"],
                }
            )
        adjusted_items.sort(key=lambda item: item["quantity"], reverse=True)
        adjusted_items = adjusted_items[:8]

        total_qty = sum(item["quantity"] for item in adjusted_items)
        date_list = [
            str(snapshot.get("biz_date") or "")
            for snapshot in snapshots
            if snapshot.get("biz_date")
        ]
        message = (
            f"최근 영업 실적 {len(snapshots)}일({', '.join(date_list)})을 기준으로 "
            f"총 {total_qty}개 추정 주문 조정안을 계산했습니다."
            if date_list
            else f"최근 영업 실적 {len(snapshots)}일을 기준으로 총 {total_qty}개 추정 주문 조정안을 계산했습니다."
        )
        return {
            "message": message,
            "recent_orders": snapshots,
            "adjusted_items": adjusted_items,
        }

    async def analyze_option(
        self,
        store_id: str,
        option_id: str,
        option_data: dict,
        category: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
        trace: dict[str, Any] | None = None,
    ) -> str:
        """Analyze anomalies for a chosen option and generate an explanation."""
        try:
            if self.audit_logger:
                await self.audit_logger.log_access(
                    user_id=user_id,
                    role=role,
                    action="order_analyze",
                    resource="order:analysis",
                    masked_fields=[],
                    details={"store_id": store_id, "option_id": option_id},
                )

            deviation_pct = float(option_data.get("deviation_from_avg_pct", 0) or 0)
            flags = list(option_data.get("flags", []))
            anomalies: list[str] = []
            explanation_parts: list[str] = []

            if flags:
                anomalies.extend(flags)

            reference_date_raw = option_data.get("reference_date")
            reference_date = (
                date.fromisoformat(reference_date_raw) if reference_date_raw else None
            )
            period_event = (
                self._event_for_date(reference_date) if reference_date else None
            )
            if period_event is not None:
                anomalies.append("EVENT_PERIOD")
                more_or_less = "많았습니다" if deviation_pct >= 0 else "적었습니다"
                explanation_parts.append(
                    f"선택하신 '{option_data.get('label', option_id)}'의 경우, "
                    f"'{period_event['name']}' 이벤트로 인해 4주 평균 대비 {abs(deviation_pct):.1f}% 주문량이 {more_or_less}"
                )

            upcoming_event = self._find_upcoming_special_period(datetime.now().date())
            if upcoming_event is not None:
                anomalies.append("UPCOMING_SPECIAL_PERIOD")
                explanation_parts.append(
                    f"이번 주는 {upcoming_event['name']}을 앞두고 있어 판매량이 오를 것으로 보입니다. "
                    f"전년 {upcoming_event['name']} 주문과 동일하게 주문할 수 있는 옵션도 있습니다."
                )

            if abs(deviation_pct) > 15:
                anomalies.append("LARGE_DEVIATION")
            if reference_date and reference_date.month in {1, 2, 9, 12}:
                anomalies.append("SEASONAL")

            fallback = self._build_option_explanation_fallback(
                option_id=option_id,
                option_data=option_data,
                flags=flags,
                anomalies=anomalies,
                explanation_parts=explanation_parts,
                period_event=period_event,
                deviation_pct=deviation_pct,
            )
            if len(anomalies) <= 1:
                return fallback

            if not self._llm_enabled(self.llm_gateway):
                return fallback

            system_prompt = """당신은 던킨도너츠 발주 보조 AI입니다.
아래 주문 옵션의 특이사항을 2~3문장으로 설명하세요.

규칙:
1. 캠페인/이벤트/시즌 요인을 우선 설명하세요.
2. 4주 평균 대비 차이를 숫자와 함께 요약하세요.
3. 점주가 이해하기 쉬운 한국어로 답하세요.
4. 추정인 경우 '~로 보입니다'로 표현하세요."""
            user_prompt = json.dumps(
                {
                    "store_id": store_id,
                    "option_id": option_id,
                    "option_data": option_data,
                    "anomalies": anomalies,
                    "draft_explanation": explanation_parts,
                },
                ensure_ascii=False,
                default=str,
            )
            result = await self.llm_gateway.call(
                purpose="explanation_generation",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=220,
                temperature=0.3,
                trace=trace,
            )
            content = str(result.get("content") or "").strip()
            return content or fallback
        except Exception as exc:
            if self.audit_logger:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    role=role,
                    action="order_analyze",
                    resource="order:analysis",
                    error=str(exc),
                    details={"store_id": store_id, "option_id": option_id},
                )
            return self._build_option_explanation_fallback(
                option_id=option_id,
                option_data=option_data,
                flags=list(option_data.get("flags", [])),
                anomalies=list(option_data.get("flags", [])),
                explanation_parts=[],
                period_event=None,
                deviation_pct=float(option_data.get("deviation_from_avg_pct", 0) or 0),
            )

    async def handle_reference_order(
        self,
        store_id: str,
        reference_date: date,
        category: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> dict[str, Any]:
        """Create an order draft from an explicit reference date."""
        try:
            async with self.db_session_factory() as db:
                rows = await sql_queries.get_order_rows_for_date(
                    db, store_id, reference_date, category
                )
            items = self._rows_to_items(rows)
            total_qty, total_amount = self._totals(items)
            return {
                "mode": "reference_order",
                "reference_date": reference_date.isoformat(),
                "items": [item.model_dump(mode="json") for item in items],
                "total_qty": total_qty,
                "total_amount": total_amount,
                "message": f"{reference_date.isoformat()} 영업 실적을 기준으로 추정 주문 초안을 만들었습니다.",
            }
        except Exception as exc:
            await self._log_error(user_id, role, "order_reference", store_id, exc)
            return {
                "message": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                "items": [],
            }

    async def handle_exclude_item(
        self,
        store_id: str,
        base_option: str,
        exclude_items: list[str],
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> dict[str, Any]:
        """Remove selected items from a stored option."""
        try:
            options_response = self._last_generated_options.get(store_id)
            if options_response is None:
                options_response = await self.generate_order_options(
                    store_id,
                    include_explanation=False,
                    user_id=user_id,
                    role=role,
                )

            option = self._find_option(options_response, base_option)
            if option is None:
                return {"message": "기준 주문 옵션을 찾지 못했습니다.", "items": []}

            normalized_excludes = [
                name.strip().lower() for name in exclude_items if name.strip()
            ]
            original_qty = option.total_qty or 0
            original_amount = option.total_amount or 0
            filtered_items = [
                item
                for item in option.items
                if not any(
                    term in item.product_name.lower() for term in normalized_excludes
                )
            ]
            total_qty, total_amount = self._totals(filtered_items)
            qty_diff = original_qty - total_qty
            amount_diff = original_amount - total_amount

            is_group_exclude = any(
                t in " ".join(exclude_items).lower()
                for t in ["단체", "예약", "대량", "특수"]
            )

            if is_group_exclude:
                message = (
                    f"📋 **단체/예약 주문 분리 결과** ({option.label})\n\n"
                    f"**일반 수요 기준 추천** (단체/예약 제외)\n"
                    f"- 총 수량: {total_qty}개 (원안 {original_qty}개에서 {qty_diff}개 감소)\n"
                    f"- 예상 금액: {int(total_amount):,}원 (원안 {int(original_amount):,}원에서 {int(amount_diff):,}원 감소)\n\n"
                    f"**포함 기준**: 전주 동일 요일의 일반 판매 실적 기반\n"
                    f"**제외 기준**: '{', '.join(exclude_items)}' 항목 제외\n"
                    f"**한계**: 현재 POS 데이터에서 단체/예약 주문을 자동 분리할 수 있는 별도 태그가 없어, "
                    f"상품명 기반으로만 제외 처리합니다. 실제 단체 주문은 점주 확인이 필요합니다.\n\n"
                    f"근거: 전주 동일 요일 판매 데이터 (실데이터 파생)\n"
                    f"지금 할 일: 제외 후 수량을 최종 확인하고 필요 시 추가 조정하세요."
                )
            else:
                message = (
                    f"{option.label} 기준 주문안에서 {', '.join(exclude_items)} 항목을 제외했습니다.\n\n"
                    f"**제외 전**: {original_qty}개 / {int(original_amount):,}원\n"
                    f"**제외 후**: {total_qty}개 / {int(total_amount):,}원 ({qty_diff}개, {int(amount_diff):,}원 감소)\n\n"
                    f"근거: 전주 동일 요일 판매 데이터 기반\n"
                    f"지금 할 일: 조정된 수량으로 주문을 확정하세요."
                )

            return {
                "mode": "exclude_item",
                "base_option": option.label,
                "excluded_items": exclude_items,
                "items": [item.model_dump(mode="json") for item in filtered_items],
                "total_qty": total_qty,
                "total_amount": total_amount,
                "message": message,
                "original_total_qty": original_qty,
                "original_total_amount": original_amount,
                "qty_diff": qty_diff,
                "amount_diff": amount_diff,
            }
        except Exception as exc:
            await self._log_error(user_id, role, "order_exclude", store_id, exc)
            return {
                "message": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                "items": [],
            }

    async def handle_special_period_comparison(
        self,
        store_id: str,
        period_name: str,
        category: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> dict[str, Any]:
        """Compare current recommendation with a historical special period."""
        try:
            current_year = datetime.now().year
            previous_event = self._find_period_by_name(
                period_name, year=current_year - 1
            )
            if previous_event is None:
                previous_event = self._find_period_by_name(period_name)
            if previous_event is None:
                return {
                    "period_name": period_name,
                    "message": "해당 특별 기간 설정을 찾지 못했습니다.",
                    "comparison": [],
                }

            async with self.db_session_factory() as db:
                rows = await sql_queries.get_order_rows_for_period(
                    db,
                    store_id,
                    previous_event["start_date"],
                    previous_event["end_date"],
                    category,
                )

            options_response = self._last_generated_options.get(store_id)
            if options_response is None:
                options_response = await self.generate_order_options(
                    store_id,
                    category=category,
                    include_explanation=False,
                    user_id=user_id,
                    role=role,
                )
            base_option = (
                min(
                    options_response.options,
                    key=lambda option: abs(option.deviation_from_avg_pct),
                )
                if options_response.options
                else None
            )

            special_total_qty = sum(
                int(round(float(row.get("effective_order_qty", 0) or 0)))
                for row in rows
            )
            base_total_qty = base_option.total_qty if base_option else 0
            diff_pct = (
                round(((special_total_qty - base_total_qty) / base_total_qty) * 100, 1)
                if base_total_qty
                else None
            )

            return {
                "mode": "special_period_compare",
                "period_name": previous_event["name"],
                "reference_period": {
                    "start": previous_event["start_date"].isoformat(),
                    "end": previous_event["end_date"].isoformat(),
                },
                "special_total_qty": special_total_qty,
                "base_total_qty": base_total_qty,
                "diff_pct": diff_pct,
                "comparison": rows,
                "message": (
                    f"전년 {previous_event['name']} 판매 실적 기반 추정 주문량은 기준 옵션 대비 "
                    f"{abs(diff_pct or 0):.1f}% {'많았습니다' if (diff_pct or 0) >= 0 else '적었습니다'}."
                ),
            }
        except Exception as exc:
            await self._log_error(user_id, role, "order_special_compare", store_id, exc)
            return {
                "message": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                "comparison": [],
            }

    async def create_draft_order(
        self,
        store_id: str,
        option_id: str,
        items: list[dict[str, Any]] | list[OrderItem],
        category: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> DraftOrderResponse:
        """Create or overwrite a draft order state."""
        normalized_items = self._normalize_items(items)
        total_qty, total_amount = self._totals(normalized_items)
        draft_id = f"draft-{uuid4().hex[:12]}"
        self._draft_orders[draft_id] = {
            "draft_order_id": draft_id,
            "store_id": store_id,
            "category": category,
            "option_id": option_id,
            "status": "draft_order",
            "items": [item.model_dump(mode="json") for item in normalized_items],
            "baseline_items": [
                item.model_dump(mode="json") for item in normalized_items
            ],
            "updated_at": datetime.now(UTC).isoformat(),
        }
        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="order_draft_create",
                resource="order:draft",
                masked_fields=[],
                details={"store_id": store_id, "option_id": option_id},
            )
        return DraftOrderResponse(
            draft_order_id=draft_id,
            status="draft_order",
            store_id=store_id,
            option_id=option_id,
            items=normalized_items,
            total_qty=total_qty,
            total_amount=total_amount,
            message="주문 초안을 저장했습니다.",
        )

    async def recalculate_risk(
        self,
        draft_order_id: str,
        items: list[dict[str, Any]] | list[OrderItem] | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> OrderRiskResponse:
        """Recalculate shortage/waste risk for a draft order."""
        draft = self._draft_orders.get(draft_order_id)
        if draft is None:
            return OrderRiskResponse(
                draft_order_id=draft_order_id,
                overall_risk="UNKNOWN",
                summary="주문 초안을 찾지 못했습니다.",
                items=[],
            )

        if items is not None:
            normalized_items = self._normalize_items(items)
            draft["items"] = [item.model_dump(mode="json") for item in normalized_items]
            draft["updated_at"] = datetime.now(UTC).isoformat()
        else:
            normalized_items = self._normalize_items(draft["items"])

        baseline_items = self._normalize_items(
            draft.get("baseline_items", draft["items"])
        )
        expected_map = {
            item.product_id: max(float(item.quantity), 1.0) for item in baseline_items
        }

        risk_items: list[OrderRiskItem] = []
        for item in normalized_items:
            expected_qty = expected_map.get(
                item.product_id, max(float(item.quantity), 1.0)
            )
            if item.quantity < expected_qty * 0.8:
                risk_items.append(
                    OrderRiskItem(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=item.quantity,
                        expected_qty=expected_qty,
                        risk_type="SHORTAGE",
                        message=f"예상 수요의 80% 미만이라 품절 리스크가 있습니다.",
                    )
                )
            elif item.quantity > expected_qty * 1.3:
                risk_items.append(
                    OrderRiskItem(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        quantity=item.quantity,
                        expected_qty=expected_qty,
                        risk_type="WASTE",
                        message=f"예상 수요의 130% 초과라 폐기 리스크가 있습니다.",
                    )
                )

        if any(item.risk_type == "SHORTAGE" for item in risk_items):
            overall_risk = "HIGH"
        elif risk_items:
            overall_risk = "MEDIUM"
        else:
            overall_risk = "LOW"

        if risk_items:
            summary = f"리스크 {len(risk_items)}건이 감지되었습니다."
        else:
            summary = "현재 수량은 예상 수요 범위 내입니다."

        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="order_draft_risk",
                resource="order:risk",
                masked_fields=[],
                details={
                    "draft_order_id": draft_order_id,
                    "overall_risk": overall_risk,
                },
            )

        return OrderRiskResponse(
            draft_order_id=draft_order_id,
            overall_risk=overall_risk,
            summary=summary,
            items=risk_items,
        )

    async def check_deadlines(
        self,
        store_id: str,
        publish: bool = True,
        user_id: str = "system",
        role: str = "hq_admin",
        reference_datetime: datetime | None = None,
    ) -> list[AlertCard]:
        """Check imminent order deadlines and optionally publish alerts."""
        try:
            if self.audit_logger:
                await self.audit_logger.log_access(
                    user_id=user_id,
                    role=role,
                    action="order_deadline_check",
                    resource="order:deadlines",
                    masked_fields=[],
                    details={"store_id": store_id, "publish": publish},
                )
            snapshots = await self.get_deadline_snapshots(
                store_id=store_id,
                reference_datetime=reference_datetime,
            )
            if reference_datetime is None:
                now = datetime.now(ZoneInfo("Asia/Seoul"))
            elif reference_datetime.tzinfo is None:
                now = reference_datetime.replace(tzinfo=ZoneInfo("Asia/Seoul"))
            else:
                now = reference_datetime.astimezone(ZoneInfo("Asia/Seoul"))
            alerts: list[AlertCard] = []
            for snapshot in snapshots:
                category = snapshot["category"]
                deadline = snapshot["deadline"]
                minutes_remaining = int(snapshot["minutes_remaining"])
                if int(snapshot.get("confirmed_order_count") or 0) > 0:
                    continue
                if 0 <= minutes_remaining <= 20:
                    message = self.template_engine.render(
                        "order_deadline_alert",
                        category=category,
                        dow_name=DOW_NAMES.get(now.weekday(), "오늘"),
                    )
                    alert = AlertCard(
                        id=f"order-deadline-{category}-{now.strftime('%Y%m%d%H%M')}",
                        severity="HIGH" if minutes_remaining <= 10 else "MEDIUM",
                        type="order",
                        title=f"{category} 주문 마감 {minutes_remaining}분 전",
                        subtitle=deadline,
                        message=message,
                        cta={
                            "label": "주문 확인하기",
                            "action": "ORDER_OPTIONS",
                            "route": "/orders",
                        },
                        created_at=datetime.now(UTC).isoformat(),
                        read=False,
                    )
                    alerts.append(alert)
                    if publish:
                        await self.notification_service.publish(
                            store_id,
                            "order_deadline",
                            alert.model_dump(mode="json"),
                        )
            return alerts
        except Exception as exc:
            await self._log_error(user_id, role, "order_deadline_check", store_id, exc)
            return []

    async def confirm_draft_order(
        self,
        draft_order_id: str,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> OrderConfirmResponse:
        """Finalize a previously saved draft order."""
        draft = self._draft_orders.get(draft_order_id)
        if draft is None:
            return OrderConfirmResponse(
                order_id="",
                confirmed_at=datetime.now(UTC).isoformat(),
                total_qty=0,
                total_amount=0,
                message="주문 초안을 찾지 못했습니다.",
            )

        risk = await self.recalculate_risk(draft_order_id, user_id=user_id, role=role)
        normalized_items = self._normalize_items(draft["items"])
        total_qty, total_amount = self._totals(normalized_items)
        order_id = f"order-{uuid4().hex[:12]}"
        confirmed_at = datetime.now(UTC).isoformat()
        draft["status"] = "confirmed"
        draft["confirmed_at"] = confirmed_at
        self._confirmed_orders.setdefault(draft["store_id"], []).append(
            {
                "order_id": order_id,
                "option_id": draft["option_id"],
                "confirmed_at": confirmed_at,
                "items": draft["items"],
                "risk_summary": risk.summary,
            }
        )
        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="order_confirm",
                resource="order:confirm",
                masked_fields=[],
                details={
                    "draft_order_id": draft_order_id,
                    "store_id": draft["store_id"],
                    "overall_risk": risk.overall_risk,
                },
            )
        return OrderConfirmResponse(
            order_id=order_id,
            confirmed_at=confirmed_at,
            total_qty=total_qty,
            total_amount=total_amount,
            message=f"주문이 확정되었습니다. 최종 수량 {total_qty}개 / 리스크 요약: {risk.summary}",
        )

    async def confirm_order(
        self,
        store_id: str,
        option_id: str | None,
        items: list[dict[str, Any]],
        draft_order_id: str | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
    ) -> OrderConfirmResponse:
        """Confirm an order, creating a draft first if needed."""
        try:
            if draft_order_id:
                return await self.confirm_draft_order(
                    draft_order_id, user_id=user_id, role=role
                )

            draft = await self.create_draft_order(
                store_id=store_id,
                option_id=option_id or "manual",
                items=items,
                user_id=user_id,
                role=role,
            )
            return await self.confirm_draft_order(
                draft.draft_order_id,
                user_id=user_id,
                role=role,
            )
        except Exception as exc:
            await self._log_error(user_id, role, "order_confirm", store_id, exc)
            return OrderConfirmResponse(
                order_id="",
                confirmed_at=datetime.now(UTC).isoformat(),
                total_qty=0,
                total_amount=0,
                message="처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            )

    def _normalize_items(
        self, items: list[dict[str, Any]] | list[OrderItem]
    ) -> list[OrderItem]:
        return [
            item
            if isinstance(item, OrderItem)
            else OrderItem(
                product_id=item["product_id"],
                product_name=item.get("product_name") or str(item["product_id"]),
                quantity=max(0, int(item.get("quantity", 0))),
                base_price=float(item.get("base_price", 0) or 0),
            )
            for item in items
            if int(
                (
                    item.quantity
                    if isinstance(item, OrderItem)
                    else item.get("quantity", 0)
                )
                or 0
            )
            >= 0
        ]

    def _totals(self, items: list[OrderItem]) -> tuple[int, float]:
        total_qty = sum(item.quantity for item in items)
        total_amount = round(sum(item.quantity * item.base_price for item in items), 2)
        return total_qty, total_amount

    def _rows_to_items(self, rows: list[dict[str, Any]]) -> list[OrderItem]:
        return [
            OrderItem(
                product_id=row["product_id"],
                product_name=row["product_name"],
                quantity=int(
                    round(
                        float(
                            row.get(
                                "effective_order_qty",
                                row.get("confirmed_qty", row.get("order_qty", 0)),
                            )
                            or 0
                        )
                    )
                ),
                base_price=float(row.get("base_price", 0) or 0),
            )
            for row in rows
        ]

    def _find_option(
        self, response: OrderOptionsResponse, base_option: str
    ) -> OrderOption | None:
        needle = (base_option or "").strip().lower()
        for option in response.options:
            if (
                option.option_id == base_option
                or option.label.lower() == needle
                or needle in option.label.lower()
            ):
                return option
        return response.options[0] if response.options else None

    async def _build_special_period_option(
        self,
        store_id: str,
        latest_biz_date: date,
        category: str | None,
    ) -> OrderOption | None:
        upcoming = self._find_upcoming_special_period(latest_biz_date)
        if upcoming is None:
            return None
        previous = self._find_period_by_name(
            upcoming["name"], year=upcoming["year"] - 1
        )
        if previous is None:
            return None
        async with self.db_session_factory() as db:
            rows = await sql_queries.get_order_rows_for_period(
                db,
                store_id,
                previous["start_date"],
                previous["end_date"],
                category,
            )
        if not rows:
            return None

        items = self._rows_to_items(rows)
        total_qty, total_amount = self._totals(items)
        return OrderOption(
            option_id="option_special_period",
            label=f"전년 {upcoming['name']} 주문",
            reference_date=previous["start_date"].isoformat(),
            total_qty=total_qty,
            total_amount=total_amount,
            deviation_from_avg_pct=0.0,
            deviation_label=f"전년 {upcoming['name']} 특수수요 기준",
            items=items,
            flags=["SPECIAL_PERIOD"],
        )

    def _load_events(self) -> list[dict[str, Any]]:
        if self._events_cache is not None:
            return self._events_cache

        settings = get_settings()
        events_path = Path(settings.events_config_path)
        if not events_path.is_absolute():
            events_path = Path(__file__).resolve().parents[2] / events_path

        try:
            raw_events = json.loads(events_path.read_text(encoding="utf-8"))
            events: list[dict[str, Any]] = []
            for item in raw_events:
                events.append(
                    {
                        "name": item["name"],
                        "aliases": item.get("aliases", []),
                        "year": int(item["year"]),
                        "start_date": date.fromisoformat(item["start_date"]),
                        "end_date": date.fromisoformat(item["end_date"]),
                    }
                )
            self._events_cache = events
        except Exception:
            logger.exception("Failed to load events configuration")
            self._events_cache = []
        return self._events_cache

    def _find_period_by_name(
        self, period_name: str, year: int | None = None
    ) -> dict[str, Any] | None:
        normalized = period_name.strip().lower()
        matches = []
        for event in self._load_events():
            names = [event["name"], *event.get("aliases", [])]
            if any(normalized == name.lower() for name in names):
                if year is None or event["year"] == year:
                    matches.append(event)
        if not matches:
            return None
        return sorted(
            matches, key=lambda item: (item["year"], item["start_date"]), reverse=True
        )[0]

    def _event_for_date(self, target_date: date | None) -> dict[str, Any] | None:
        if target_date is None:
            return None
        for event in self._load_events():
            if event["start_date"] <= target_date <= event["end_date"]:
                return event
        return None

    def _find_upcoming_special_period(self, target_date: date) -> dict[str, Any] | None:
        for event in self._load_events():
            lead_days = (event["start_date"] - target_date).days
            if 0 <= lead_days <= 7 and event["year"] == target_date.year:
                return event
        return None

    async def _log_error(
        self,
        user_id: str,
        role: str,
        action: str,
        store_id: str,
        exc: Exception,
    ) -> None:
        if self.audit_logger:
            await self.audit_logger.log_error(
                user_id=user_id,
                role=role,
                action=action,
                resource="order",
                error=str(exc),
                details={"store_id": store_id},
            )
        logger.exception(
            "Order agent error for store_id=%s action=%s", store_id, action
        )
