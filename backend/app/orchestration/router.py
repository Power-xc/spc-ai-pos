"""Agent router for the unified chat endpoint."""

from __future__ import annotations

import asyncio
from collections import deque
from datetime import date, datetime
import logging
import re
from time import perf_counter
from time import time
from uuid import uuid4

from app.db.session import is_postgres_mode
from app.schemas.chat import ChatResponse
from app.services.chat_trace import add_elapsed, add_ms, set_field

logger = logging.getLogger(__name__)


class AgentRouter:
    """통합 채팅의 Agent 라우팅."""

    def __init__(
        self,
        production_agent,
        order_agent,
        sales_agent,
        intent_classifier,
        audit_logger=None,
        actions_todo_service=None,
        dashboard_service=None,
    ) -> None:
        self.production_agent = production_agent
        self.order_agent = order_agent
        self.sales_agent = sales_agent
        self.intent_classifier = intent_classifier
        self.audit_logger = audit_logger
        self.actions_todo_service = actions_todo_service
        self.dashboard_service = dashboard_service
        self._session_memory: dict[str, deque[dict[str, str | None]]] = {}
        self._memory_limit = 8
        self._status_cache: dict[str, dict] = {}
        self._status_refresh_tasks: dict[str, asyncio.Task] = {}
        self._status_cache_ttl_sec = 20.0

    def _assistant_text(self, response: ChatResponse) -> str:
        if response.response_type == "text" and isinstance(response.content, str):
            return response.content
        if response.response_type == "order_card":
            return "주문 추천 옵션을 생성했습니다."
        if response.response_type == "alert_card":
            return "재고/알림 상태를 분석했습니다."
        if response.response_type == "insight_card":
            content = response.content if isinstance(response.content, dict) else {}
            sections = content.get("sections") if isinstance(content, dict) else []
            if isinstance(sections, list):
                for section in sections:
                    if isinstance(section, dict) and section.get("text"):
                        return str(section["text"])
            return str(content.get("title") or "매출 인사이트를 생성했습니다.")
        return ""

    @staticmethod
    def _action_priority(severity: str | None) -> str:
        normalized = str(severity or "MEDIUM").upper()
        if normalized == "HIGH":
            return "긴급"
        if normalized == "LOW":
            return "일반"
        return "중요"

    @staticmethod
    def _action_status_mode(message: str) -> str:
        if re.search(
            r"(완료된|완료한).*(항목|액션|할\s*일)", message
        ) and not re.search(
            r"(제외|빼고|안|미완료)",
            message,
        ):
            return "completed_only"
        if re.search(r"(보류|hold|on\s*hold|나중에)", message, re.IGNORECASE):
            return "on_hold_only"
        if re.search(r"(완료\s*안|완료안|미완료|미처리|제외)", message):
            return "incomplete_only"
        if re.search(r"(대기|진행\s*중|실행\s*중)", message):
            return "pending_only"
        return "incomplete_only"

    @staticmethod
    def _action_status_mode_by_sub_intent(message: str, sub_intent: str | None) -> str:
        normalized = str(sub_intent or "").upper()
        if normalized == "ACTIONS_COMPLETED":
            return "completed_only"
        if normalized == "ACTIONS_HOLD":
            return "on_hold_only"
        if normalized in {
            "ACTIONS_SCREEN_GUIDE",
            "ACTIONS_PRIORITY",
            "ACTIONS_SUMMARY",
            "ACTIONS_INCOMPLETE",
        }:
            return "incomplete_only"
        return AgentRouter._action_status_mode(message)

    @staticmethod
    def _filter_action_items(items: list[dict], query_mode: str) -> list[dict]:
        if query_mode == "completed_only":
            return [item for item in items if item.get("status") == "완료"]
        if query_mode == "on_hold_only":
            return [item for item in items if item.get("status") == "보류"]
        if query_mode == "pending_only":
            return [item for item in items if item.get("status") in {"대기", "실행중"}]
        if query_mode == "incomplete_only":
            return [item for item in items if item.get("status") != "완료"]
        return list(items)

    @staticmethod
    def _actions_status_counts(items: list[dict]) -> dict[str, int]:
        counts = {"대기": 0, "실행중": 0, "완료": 0, "보류": 0}
        urgent_count = 0
        for item in items:
            status = str(item.get("status") or "")
            if status in counts:
                counts[status] += 1
            if str(item.get("priority") or "") == "긴급" and status != "완료":
                urgent_count += 1
        incomplete_count = counts["대기"] + counts["실행중"] + counts["보류"]
        return {
            "waiting_count": counts["대기"],
            "running_count": counts["실행중"],
            "completed_count": counts["완료"],
            "hold_count": counts["보류"],
            "incomplete_count": incomplete_count,
            "urgent_count": urgent_count,
            "total_count": len(items),
        }

    @staticmethod
    def _format_actions_screen_guide(
        items: list[dict], snapshot: dict[str, int]
    ) -> str:
        incomplete_count = int(snapshot.get("incomplete_count") or 0)
        if incomplete_count <= 0:
            return (
                "이 화면에서는 미완료(대기/실행중/보류) 항목을 우선 확인합니다.\n"
                "현재 미완료 항목이 없습니다. 완료 항목을 검토하거나 새 경보를 기다리세요."
            )
        return (
            "이 화면에서는 미완료(대기/실행중/보류) 항목을 우선 확인합니다.\n"
            f"현재 미완료 {incomplete_count}건, 긴급 {int(snapshot.get('urgent_count') or 0)}건입니다.\n"
            f"대기 {int(snapshot.get('waiting_count') or 0)} · 실행중 {int(snapshot.get('running_count') or 0)} · 보류 {int(snapshot.get('hold_count') or 0)}\n"
            "권장 순서: 긴급 → 실행중 → 대기 → 보류 재검토"
        )

    @staticmethod
    def _format_actions_priority(items: list[dict]) -> str:
        if not items:
            return "현재 우선 처리할 미완료 항목이 없습니다."
        priority_rank = {"긴급": 0, "중요": 1, "일반": 2}
        status_rank = {"실행중": 0, "대기": 1, "보류": 2, "완료": 3}
        ranked = sorted(
            items,
            key=lambda item: (
                priority_rank.get(str(item.get("priority") or "중요"), 9),
                status_rank.get(str(item.get("status") or "대기"), 9),
            ),
        )
        lines = []
        for idx, item in enumerate(ranked[:5], start=1):
            lines.append(
                f"{idx}. [{item.get('priority') or '중요'}|{item.get('status') or '대기'}] "
                f"{item.get('title') or '할일'}"
            )
        return "지금 할 일 우선순위입니다.\n" + "\n".join(lines)

    @staticmethod
    def _format_actions_issue_summary(
        items: list[dict], snapshot: dict[str, int]
    ) -> str:
        incomplete_count = int(snapshot.get("incomplete_count") or 0)
        urgent_count = int(snapshot.get("urgent_count") or 0)
        if incomplete_count <= 0:
            return "현재 /actions 기준 핵심 이슈(미완료/보류)가 없습니다."
        top = []
        for item in items[:3]:
            summary = str(item.get("summary") or "").strip()
            if summary:
                top.append(f"- {item.get('title')}: {summary}")
            else:
                top.append(f"- {item.get('title')}")
        base = (
            f"/actions 기준 핵심 이슈 요약: 미완료 {incomplete_count}건, 긴급 {urgent_count}건, "
            f"보류 {int(snapshot.get('hold_count') or 0)}건입니다."
        )
        if not top:
            return base
        return base + "\n" + "\n".join(top)

    async def _build_action_todos(
        self,
        *,
        store_id: str,
        user_id: str,
        role: str,
        query_mode: str,
        trace: dict | None = None,
    ) -> list[dict]:
        fetch_started_at = perf_counter()
        if self.actions_todo_service is not None and is_postgres_mode():
            started_at = perf_counter()
            try:
                return await self.actions_todo_service.list_todos(
                    store_id=store_id,
                    # Always read from one shared snapshot and filter later so
                    # ActionsPage body and chat use the same status universe.
                    query_mode="all",
                    limit=100,
                    user_id=user_id,
                    role=role,
                )
            except Exception:
                logger.exception(
                    "actions_todo: service lookup failed for store_id=%s", store_id
                )
            finally:
                elapsed = add_elapsed(trace, "domain_service_ms", started_at)
                add_ms(trace, "db_ms", elapsed)
                add_elapsed(trace, "actions_todo_fetch_ms", fetch_started_at)

        todos: list[dict] = []

        concurrent_started_at = perf_counter()
        production_task = asyncio.create_task(
            asyncio.wait_for(
                self.production_agent.get_current_alerts(
                    store_id,
                    user_id=user_id,
                    role=role,
                ),
                timeout=1.5,
            )
        )
        deadline_task = asyncio.create_task(
            asyncio.wait_for(
                self.order_agent.check_deadlines(
                    store_id,
                    publish=False,
                    user_id=user_id,
                    role=role,
                ),
                timeout=1.5,
            )
        )
        production_alerts: list = []
        deadline_alerts: list = []
        try:
            production_alerts = await production_task
        except Exception:
            logger.exception(
                "actions_todo: failed to fetch production alerts for store_id=%s",
                store_id,
            )
        try:
            deadline_alerts = await deadline_task
        except Exception:
            logger.exception(
                "actions_todo: failed to fetch order deadlines for store_id=%s",
                store_id,
            )
        finally:
            add_elapsed(trace, "domain_service_ms", concurrent_started_at)

        for alert in production_alerts[:4]:
            severity = str(getattr(alert, "severity", "MEDIUM"))
            title = f"{getattr(alert, 'product_name', '상품')} 재고 대응"
            message = str(getattr(alert, "message", "") or "").strip()
            todos.append(
                {
                    "id": str(getattr(alert, "id", f"prod-{len(todos) + 1}")),
                    "title": title,
                    "status": "대기",
                    "priority": self._action_priority(severity),
                    "source": "production",
                    "summary": message,
                    "route": "/actions",
                }
            )

        for raw in deadline_alerts[:4]:
            if isinstance(raw, dict):
                title = str(raw.get("title") or "주문 마감 확인")
                severity = str(raw.get("severity") or "MEDIUM")
                subtitle = str(raw.get("subtitle") or "")
                message = str(raw.get("message") or "")
                alert_id = str(raw.get("id") or f"order-{len(todos) + 1}")
            else:
                title = str(getattr(raw, "title", "주문 마감 확인"))
                severity = str(getattr(raw, "severity", "MEDIUM"))
                subtitle = str(getattr(raw, "subtitle", "") or "")
                message = str(getattr(raw, "message", "") or "")
                alert_id = str(getattr(raw, "id", f"order-{len(todos) + 1}"))
            summary = subtitle if subtitle else message
            todos.append(
                {
                    "id": alert_id,
                    "title": title,
                    "status": "대기",
                    "priority": self._action_priority(severity),
                    "source": "orders",
                    "summary": summary,
                    "route": "/actions",
                }
            )

        deduped: list[dict] = []
        seen: set[str] = set()
        for item in todos:
            key = str(item.get("title") or "")
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        priority_rank = {"긴급": 0, "중요": 1, "일반": 2}
        deduped.sort(key=lambda item: priority_rank.get(str(item.get("priority")), 9))
        add_elapsed(trace, "actions_todo_fetch_ms", fetch_started_at)
        return deduped[:6]

    @staticmethod
    def _format_actions_answer(items: list[dict], query_mode: str) -> str:
        if not items:
            if query_mode == "completed_only":
                return "현재 완료 항목이 없습니다."
            if query_mode == "on_hold_only":
                return "현재 보류 항목이 없습니다."
            if query_mode == "pending_only":
                return "현재 대기/실행중 항목이 없습니다."
            return "현재 확인된 미완료 항목이 없습니다."

        if query_mode == "completed_only":
            header = f"현재 완료 항목 {len(items)}건입니다."
        elif query_mode == "on_hold_only":
            header = f"현재 보류 항목 {len(items)}건입니다."
        elif query_mode == "pending_only":
            header = f"현재 대기/실행중 항목 {len(items)}건입니다."
        else:
            header = f"현재 미완료 항목 {len(items)}건입니다."
        lines = []
        for idx, item in enumerate(items, start=1):
            priority = item.get("priority") or "중요"
            title = item.get("title") or "할일"
            summary = str(item.get("summary") or "").strip()
            if summary:
                lines.append(f"{idx}. [{priority}] {title} - {summary}")
            else:
                lines.append(f"{idx}. [{priority}] {title}")
        return header + "\n" + "\n".join(lines)

    def _remember_turn(
        self,
        *,
        session_id: str,
        user_message: str,
        response: ChatResponse,
        intent: str,
    ) -> None:
        memory = self._session_memory.setdefault(
            session_id, deque(maxlen=self._memory_limit)
        )
        memory.append({"role": "user", "content": user_message, "intent": intent})
        memory.append(
            {
                "role": "assistant",
                "content": self._assistant_text(response),
                "intent": intent,
            }
        )

    def _merge_recent_messages(
        self,
        session_id: str,
        recent_messages: list[dict] | None,
    ) -> list[dict]:
        merged: list[dict] = []
        if recent_messages:
            merged.extend(recent_messages[-self._memory_limit :])
        if session_id in self._session_memory:
            merged.extend(list(self._session_memory[session_id])[-self._memory_limit :])
        return merged[-self._memory_limit :]

    @staticmethod
    def _page_bucket(context: dict | None) -> str:
        current_page = str((context or {}).get("current_page") or "").lower()
        page_key = str((context or {}).get("page_key") or "").lower()
        page_context = str((context or {}).get("page_context") or "").lower()
        normalized = f"{current_page} {page_key} {page_context}"
        if "/orders" in normalized or "orders" in normalized or "발주" in normalized:
            return "orders"
        if (
            "/actions" in normalized
            or "actions" in normalized
            or "todo" in normalized
            or "할일" in normalized
        ):
            return "actions"
        if (
            "/dashboard" in normalized
            or current_page in {"/", "/realtime"}
            or "dashboard" in normalized
        ):
            return "dashboard"
        return "general"

    @staticmethod
    def _dedupe_questions(items: list[dict], *, limit: int = 5) -> list[dict]:
        deduped: list[dict] = []
        seen: set[str] = set()
        for item in items:
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            if text in seen:
                continue
            seen.add(text)
            deduped.append(
                {
                    "text": text,
                    "source": item.get("source"),
                    "reason": item.get("reason"),
                }
            )
            if len(deduped) >= limit:
                break
        return deduped

    @staticmethod
    def _last_user_message(recent_messages: list[dict] | None) -> str:
        for item in reversed(recent_messages or []):
            if str(item.get("role") or "").lower() == "user":
                content = str(item.get("content") or "").strip()
                if content:
                    return content
        return ""

    @staticmethod
    def _count_critical_alerts(alert_rows: list) -> int:
        critical = 0
        for alert in alert_rows:
            if isinstance(alert, dict):
                severity = str(alert.get("severity") or "").upper()
            else:
                severity = str(getattr(alert, "severity", "")).upper()
            if severity in {"CRITICAL", "HIGH"}:
                critical += 1
        return critical

    @staticmethod
    def _count_inventory_risk(items: list) -> int:
        risky = 0
        for item in items:
            if isinstance(item, dict):
                level = str(
                    item.get("risk_level") or item.get("stockout_risk") or ""
                ).upper()
            else:
                level = str(
                    getattr(item, "risk_level", "")
                    or getattr(item, "stockout_risk", "")
                ).upper()
            if level in {"CRITICAL", "HIGH", "MEDIUM"}:
                risky += 1
        return risky

    @staticmethod
    def _base_snapshot_from_response(
        intent: str, response: ChatResponse
    ) -> dict[str, int | None]:
        snapshot: dict[str, int | None] = {
            "alert_count": None,
            "critical_alert_count": None,
            "pending_todo_count": None,
            "order_deadline_count": None,
            "inventory_risk_count": None,
            "recent_order_count": None,
        }
        metadata = response.metadata if isinstance(response.metadata, dict) else {}
        if intent == "PRODUCTION" and isinstance(response.content, list):
            snapshot["alert_count"] = len(response.content)
            snapshot["critical_alert_count"] = AgentRouter._count_critical_alerts(
                response.content
            )
        if intent == "PRODUCTION":
            if metadata.get("alert_count") is not None:
                snapshot["alert_count"] = int(metadata.get("alert_count") or 0)
            if metadata.get("critical_alert_count") is not None:
                snapshot["critical_alert_count"] = int(
                    metadata.get("critical_alert_count") or 0
                )
            if metadata.get("inventory_risk_count") is not None:
                snapshot["inventory_risk_count"] = int(
                    metadata.get("inventory_risk_count") or 0
                )
        if intent == "ACTIONS_TODO":
            todo_snapshot = metadata.get("todo_snapshot")
            if isinstance(todo_snapshot, dict):
                pending = todo_snapshot.get("incomplete_count")
                if pending is not None:
                    snapshot["pending_todo_count"] = int(pending or 0)
            todo_items = response.metadata.get("todo_items")
            if isinstance(todo_items, list) and snapshot["pending_todo_count"] is None:
                snapshot["pending_todo_count"] = len(
                    [item for item in todo_items if str(item.get("status")) != "완료"]
                )
        if intent == "ORDER":
            if isinstance(response.content, dict):
                options = response.content.get("options")
                if isinstance(options, list):
                    snapshot["recent_order_count"] = len(options)
            adjusted_items = response.metadata.get("adjusted_items")
            if (
                isinstance(adjusted_items, list)
                and snapshot["recent_order_count"] is None
            ):
                snapshot["recent_order_count"] = len(adjusted_items)
        return snapshot

    @staticmethod
    def _snapshot_has_signal(snapshot: dict[str, int | None]) -> bool:
        return any(value is not None for value in snapshot.values())

    async def _refresh_store_status_cache(
        self,
        *,
        store_id: str,
        context: dict | None,
        intent: str,
        response: ChatResponse,
        user_id: str,
        role: str,
        cache_key: str,
    ) -> None:
        try:
            snapshot = await self._collect_store_status(
                store_id=store_id,
                context=context,
                intent=intent,
                response=response,
                user_id=user_id,
                role=role,
                trace=None,
            )
            self._status_cache[cache_key] = {
                "expires_at": time() + self._status_cache_ttl_sec,
                "snapshot": snapshot,
            }
        except Exception:
            logger.debug(
                "suggested_questions: status cache refresh failed", exc_info=True
            )
        finally:
            self._status_refresh_tasks.pop(cache_key, None)

    def _schedule_status_refresh(
        self,
        *,
        store_id: str,
        context: dict | None,
        intent: str,
        response: ChatResponse,
        user_id: str,
        role: str,
        cache_key: str,
    ) -> None:
        task = self._status_refresh_tasks.get(cache_key)
        if task is not None and not task.done():
            return
        self._status_refresh_tasks[cache_key] = asyncio.create_task(
            self._refresh_store_status_cache(
                store_id=store_id,
                context=context,
                intent=intent,
                response=response,
                user_id=user_id,
                role=role,
                cache_key=cache_key,
            )
        )

    def _get_cached_snapshot(self, cache_key: str) -> dict[str, int | None] | None:
        cached = self._status_cache.get(cache_key)
        if not isinstance(cached, dict):
            return None
        expires_at = float(cached.get("expires_at", 0) or 0)
        if expires_at < time():
            return None
        snapshot = cached.get("snapshot")
        return dict(snapshot) if isinstance(snapshot, dict) else None

    async def _resolve_status_for_suggestions(
        self,
        *,
        store_id: str,
        context: dict | None,
        intent: str,
        response: ChatResponse,
        user_id: str,
        role: str,
    ) -> dict[str, int | None]:
        cache_key = f"{store_id}:{self._page_bucket(context)}"
        base_snapshot = self._base_snapshot_from_response(intent, response)
        if self._snapshot_has_signal(base_snapshot):
            if base_snapshot.get("pending_todo_count") is None:
                fallback_count = int(
                    base_snapshot.get("critical_alert_count") or 0
                ) + int(base_snapshot.get("order_deadline_count") or 0)
                base_snapshot["pending_todo_count"] = fallback_count
            self._status_cache[cache_key] = {
                "expires_at": time() + self._status_cache_ttl_sec,
                "snapshot": base_snapshot,
            }
            self._schedule_status_refresh(
                store_id=store_id,
                context=context,
                intent=intent,
                response=response,
                user_id=user_id,
                role=role,
                cache_key=cache_key,
            )
            return base_snapshot

        cached_snapshot = self._get_cached_snapshot(cache_key)
        if cached_snapshot is not None:
            return cached_snapshot

        self._schedule_status_refresh(
            store_id=store_id,
            context=context,
            intent=intent,
            response=response,
            user_id=user_id,
            role=role,
            cache_key=cache_key,
        )
        if base_snapshot.get("pending_todo_count") is None:
            fallback_count = int(base_snapshot.get("critical_alert_count") or 0) + int(
                base_snapshot.get("order_deadline_count") or 0
            )
            base_snapshot["pending_todo_count"] = fallback_count
        return base_snapshot

    async def _collect_store_status(
        self,
        *,
        store_id: str,
        context: dict | None,
        intent: str,
        response: ChatResponse,
        user_id: str,
        role: str,
        trace: dict | None = None,
    ) -> dict:
        snapshot: dict[str, int | None] = {
            "alert_count": None,
            "critical_alert_count": None,
            "pending_todo_count": None,
            "order_deadline_count": None,
            "inventory_risk_count": None,
            "recent_order_count": None,
        }

        if intent == "PRODUCTION" and isinstance(response.content, list):
            snapshot["alert_count"] = len(response.content)
            snapshot["critical_alert_count"] = self._count_critical_alerts(
                response.content
            )
        if intent == "ACTIONS_TODO":
            todo_snapshot = (
                response.metadata.get("todo_snapshot")
                if isinstance(response.metadata, dict)
                else None
            )
            if isinstance(todo_snapshot, dict):
                pending = todo_snapshot.get("incomplete_count")
                if pending is not None:
                    snapshot["pending_todo_count"] = int(pending or 0)
            todo_items = response.metadata.get("todo_items")
            if isinstance(todo_items, list) and snapshot["pending_todo_count"] is None:
                snapshot["pending_todo_count"] = len(
                    [item for item in todo_items if str(item.get("status")) != "완료"]
                )
        if intent == "ORDER" and isinstance(response.content, dict):
            options = response.content.get("options")
            if isinstance(options, list):
                snapshot["recent_order_count"] = len(options)

        alerts_task = asyncio.create_task(
            asyncio.wait_for(
                self.production_agent.get_current_alerts(
                    store_id, user_id=user_id, role=role
                ),
                timeout=1.5,
            )
        )
        deadlines_task = asyncio.create_task(
            asyncio.wait_for(
                self.order_agent.check_deadlines(
                    store_id, publish=False, user_id=user_id, role=role
                ),
                timeout=1.5,
            )
        )
        inventory_task = asyncio.create_task(
            asyncio.wait_for(
                self.production_agent.get_inventory_status(
                    store_id, user_id=user_id, role=role
                ),
                timeout=1.5,
            )
        )

        todos_task = None
        if self.actions_todo_service is not None and is_postgres_mode():
            todos_task = asyncio.create_task(
                asyncio.wait_for(
                    self.actions_todo_service.list_todos(
                        store_id=store_id,
                        query_mode="incomplete_only",
                        limit=50,
                        user_id=user_id,
                        role=role,
                    ),
                    timeout=1.5,
                )
            )

        dashboard_task = None
        if self.dashboard_service is not None and is_postgres_mode():
            dashboard_task = asyncio.create_task(
                asyncio.wait_for(
                    self.dashboard_service.get_dashboard_bundle(store_id), timeout=1.5
                )
            )

        alerts = deadlines = inventory_items = None
        try:
            alerts = await alerts_task
        except Exception:
            logger.debug(
                "suggested_questions: alert snapshot fetch failed", exc_info=True
            )
        try:
            deadlines = await deadlines_task
        except Exception:
            logger.debug(
                "suggested_questions: deadline snapshot fetch failed", exc_info=True
            )
        try:
            inventory_items = await inventory_task
        except Exception:
            logger.debug(
                "suggested_questions: inventory snapshot fetch failed", exc_info=True
            )

        if isinstance(alerts, list):
            if snapshot["alert_count"] is None:
                snapshot["alert_count"] = len(alerts)
            if snapshot["critical_alert_count"] is None:
                snapshot["critical_alert_count"] = self._count_critical_alerts(alerts)
        if isinstance(deadlines, list):
            snapshot["order_deadline_count"] = len(deadlines)
        if isinstance(inventory_items, list):
            snapshot["inventory_risk_count"] = self._count_inventory_risk(
                inventory_items
            )

        if todos_task is not None:
            try:
                todos = await todos_task
            except Exception:
                todos = None
                logger.debug(
                    "suggested_questions: todo snapshot fetch failed", exc_info=True
                )
            if isinstance(todos, list):
                snapshot["pending_todo_count"] = len(
                    [item for item in todos if str(item.get("status")) != "완료"]
                )

        if dashboard_task is not None:
            try:
                bundle = await dashboard_task
            except Exception:
                bundle = None
                logger.debug(
                    "suggested_questions: dashboard bundle fetch failed", exc_info=True
                )
            if isinstance(bundle, dict):
                recent_orders = bundle.get("recent_orders")
                if isinstance(recent_orders, list):
                    snapshot["recent_order_count"] = len(recent_orders)
                if snapshot["inventory_risk_count"] is None:
                    snapshots = bundle.get("inventory_snapshots")
                    if isinstance(snapshots, list):
                        snapshot["inventory_risk_count"] = self._count_inventory_risk(
                            snapshots
                        )

        if snapshot["pending_todo_count"] is None:
            fallback_count = int(snapshot["critical_alert_count"] or 0) + int(
                snapshot["order_deadline_count"] or 0
            )
            snapshot["pending_todo_count"] = fallback_count

        del context  # reserved for next-round richer status policy filters
        return snapshot

    async def _build_suggested_questions(
        self,
        *,
        store_id: str,
        context: dict | None,
        recent_messages: list[dict] | None,
        message: str,
        intent: str,
        response: ChatResponse,
        user_id: str,
        role: str,
        trace: dict | None = None,
    ) -> list[dict]:
        page_bucket = self._page_bucket(context)
        status = await self._resolve_status_for_suggestions(
            store_id=store_id,
            context=context,
            intent=intent,
            response=response,
            user_id=user_id,
            role=role,
        )
        suggestions: list[dict] = []

        if page_bucket == "actions":
            suggestions.extend(
                [
                    {
                        "text": "완료 안 된 항목 보여줘",
                        "source": "page",
                        "reason": "actions_context",
                    },
                    {
                        "text": "긴급 항목부터 처리 순서 알려줘",
                        "source": "page",
                        "reason": "actions_context",
                    },
                    {
                        "text": "보류 항목만 보여줘",
                        "source": "page",
                        "reason": "actions_context",
                    },
                ]
            )
        elif page_bucket == "orders":
            suggestions.extend(
                [
                    {
                        "text": "추천 주문 보여줘",
                        "source": "page",
                        "reason": "orders_context",
                    },
                    {
                        "text": "전주 대비 추천 수량 근거 설명해줘",
                        "source": "page",
                        "reason": "orders_context",
                    },
                    {
                        "text": "추천 주문 확정해줘",
                        "source": "page",
                        "reason": "orders_context",
                    },
                ]
            )
        elif page_bucket == "dashboard":
            suggestions.extend(
                [
                    {
                        "text": "오늘 가장 위험한 이슈가 뭐야?",
                        "source": "page",
                        "reason": "dashboard_context",
                    },
                    {
                        "text": "왜 오후 매출이 떨어졌는지 요약해줘",
                        "source": "page",
                        "reason": "dashboard_context",
                    },
                    {
                        "text": "재고 소진 위험 품목 알려줘",
                        "source": "page",
                        "reason": "dashboard_context",
                    },
                ]
            )
        else:
            suggestions.extend(
                [
                    {
                        "text": "지금 할 일 우선순위 정리해줘",
                        "source": "page",
                        "reason": "general_context",
                    },
                    {
                        "text": "추천 주문 보여줘",
                        "source": "page",
                        "reason": "general_context",
                    },
                    {
                        "text": "오늘 핵심 이슈 요약해줘",
                        "source": "page",
                        "reason": "general_context",
                    },
                ]
            )

        if int(status.get("critical_alert_count") or 0) > 0:
            suggestions.append(
                {
                    "text": f"긴급 경보 {int(status['critical_alert_count'])}건 기준으로 대응 순서 알려줘",
                    "source": "store_status",
                    "reason": "critical_alerts",
                }
            )
        if int(status.get("pending_todo_count") or 0) > 0:
            suggestions.append(
                {
                    "text": f"미완료 항목 {int(status['pending_todo_count'])}건 중 지금 할 일만 보여줘",
                    "source": "store_status",
                    "reason": "pending_todos",
                }
            )
        if int(status.get("order_deadline_count") or 0) > 0:
            suggestions.append(
                {
                    "text": f"주문 마감 임박 {int(status['order_deadline_count'])}건 먼저 보여줘",
                    "source": "store_status",
                    "reason": "order_deadlines",
                }
            )
        if int(status.get("inventory_risk_count") or 0) > 0:
            suggestions.append(
                {
                    "text": f"소진 위험 품목 {int(status['inventory_risk_count'])}개 대응 방안 알려줘",
                    "source": "store_status",
                    "reason": "inventory_risk",
                }
            )
        if int(status.get("recent_order_count") or 0) > 0:
            suggestions.append(
                {
                    "text": f"최근 주문 {int(status['recent_order_count'])}건 기준으로 오늘 발주 조정해줘",
                    "source": "store_status",
                    "reason": "recent_orders",
                }
            )

        latest_user = self._last_user_message(recent_messages)
        if re.search(r"(왜|무슨\s*뜻|다시\s*설명)", message, re.IGNORECASE):
            suggestions.append(
                {
                    "text": "직전 답변을 3줄로 다시 요약해줘",
                    "source": "recent_messages",
                    "reason": "followup_clarification",
                }
            )
        if re.search(r"(주문|발주)", latest_user, re.IGNORECASE):
            suggestions.append(
                {
                    "text": "방금 논의한 주문안을 기준으로 확정 전 체크리스트 보여줘",
                    "source": "recent_messages",
                    "reason": "recent_order_topic",
                }
            )
        if re.search(r"(완료|미완료|보류|할\s*일|todo)", latest_user, re.IGNORECASE):
            suggestions.append(
                {
                    "text": "직전 할 일 문맥으로 대기 중 항목만 다시 보여줘",
                    "source": "recent_messages",
                    "reason": "recent_actions_topic",
                }
            )
        if re.search(r"(매출|손익|마진|급감|이슈|경보)", latest_user, re.IGNORECASE):
            suggestions.append(
                {
                    "text": "직전 이슈를 실행 가능한 액션 3개로 바꿔줘",
                    "source": "recent_messages",
                    "reason": "recent_dashboard_topic",
                }
            )

        deduped = self._dedupe_questions(suggestions, limit=5)
        if len(deduped) >= 3:
            return deduped
        fallback = self._dedupe_questions(
            deduped
            + [
                {
                    "text": "오늘 핵심 이슈 요약해줘",
                    "source": "fallback",
                    "reason": "default",
                },
                {"text": "추천 주문 보여줘", "source": "fallback", "reason": "default"},
                {
                    "text": "지금 할 일만 보여줘",
                    "source": "fallback",
                    "reason": "default",
                },
            ],
            limit=5,
        )
        return fallback

    @staticmethod
    def _build_order_confirm_prepare_cards(items: list[dict]) -> list[dict]:
        if not items:
            return []
        return [
            {
                "card_type": "order_confirm_prepare",
                "title": "추천 주문 최종 확인",
                "body": f"{len(items)}개 품목을 확인한 뒤 확정하세요.",
                "actions": [
                    {
                        "label": "최종 확인 후 발주 실행",
                        "action_type": "order_confirm",
                        "api_endpoint": "/api/order/confirm",
                        "params": {"items": items},
                    },
                    {
                        "label": "발주 화면에서 검토",
                        "action_type": "navigate",
                        "api_endpoint": "/orders",
                        "params": {"route": "/orders"},
                    },
                ],
            }
        ]

    @staticmethod
    def _summarize_needed_items(
        items: list[dict], *, limit: int = 5
    ) -> tuple[str, list[dict]]:
        candidates = [
            {
                "product_id": str(item.get("product_id") or ""),
                "product_name": str(item.get("product_name") or "상품"),
                "quantity": int(float(item.get("quantity", 0) or 0)),
                "base_price": float(item.get("base_price", 0) or 0),
            }
            for item in items
            if float(item.get("quantity", 0) or 0) > 0
        ]
        candidates.sort(key=lambda row: row["quantity"], reverse=True)
        trimmed = candidates[: max(limit, 1)]
        if not trimmed:
            return "현재 발주가 필요한 품목을 찾지 못했습니다.", []
        # Structured: one-line summary + top items
        total_count = len(candidates)
        total_qty = sum(r["quantity"] for r in candidates)
        header = f"📋 발주 필요 품목 {total_count}종, 총 {total_qty}개"
        lines = [f"  • {row['product_name']}: {row['quantity']}개" for row in trimmed]
        if total_count > limit:
            lines.append(f"  … 외 {total_count - limit}종")
        evidence = "📊 근거: 전주 동요일 주문 패턴 + 소진 위험 분석"
        return f"{header}\n" + "\n".join(lines) + f"\n{evidence}", trimmed

    @staticmethod
    def _format_order_evidence(
        recent_orders: list[dict], *, max_orders: int = 3
    ) -> list[dict]:
        """Format recent order evidence for display with trust labels."""
        evidence = []
        for order in recent_orders[:max_orders]:
            items_summary = []
            for item in (order.get("items") or [])[:3]:
                items_summary.append(
                    f"{item.get('product_name', '?')} {item.get('quantity', 0)}개"
                )
            extra = len(order.get("items") or []) - 3
            if extra > 0:
                items_summary.append(f"… 외 {extra}종")
            evidence.append(
                {
                    "order_id": order.get("order_id") or order.get("id", "-"),
                    "order_date": order.get("order_date") or order.get("biz_date", "-"),
                    "total_qty": order.get("total_qty", 0),
                    "total_amount": order.get("total_amount", 0),
                    "representative_items": items_summary,
                    "label": "📦 실제 주문 근거",
                }
            )
        return evidence

    @staticmethod
    def _format_recent_orders_summary(recent_orders: list[dict]) -> str:
        """Create a concise text summary of recent orders for evidence block."""
        if not recent_orders:
            return "📦 최근 주문 근거: 데이터 없음"
        lines = ["📦 최근 주문 근거 (실제 주문 내역)"]
        for order in recent_orders[:3]:
            order_id = order.get("order_id") or order.get("id", "-")
            order_date = order.get("order_date") or order.get("biz_date", "-")
            total_qty = order.get("total_qty", 0)
            items_preview = []
            for item in (order.get("items") or [])[:3]:
                items_preview.append(
                    f"{item.get('product_name', '?')} {item.get('quantity', 0)}개"
                )
            items_text = ", ".join(items_preview)
            extra = len(order.get("items") or []) - 3
            if extra > 0:
                items_text += f" …외 {extra}종"
            lines.append(f"  {order_date} | {order_id} | {total_qty}개 | {items_text}")
        return "\n".join(lines)

    @staticmethod
    def _format_preconfirm_checklist(option) -> tuple[str, list[dict]]:
        if option is None:
            return (
                "직전 주문안 정보를 찾지 못했습니다. 먼저 '추천 주문 보여줘'를 실행해 주세요.",
                [],
            )

        items = [item.model_dump(mode="json") for item in option.items]
        total_qty = int(sum(int(float(item.get("quantity", 0) or 0)) for item in items))
        total_amount = float(option.total_amount or 0)
        checklist_lines = [
            f"선택안: {option.label}",
            f"품목 수: {len(items)}개",
            f"총 수량: {total_qty}개",
            "체크 1) 품목별 수량 확정",
            "체크 2) 주문 마감 시간 재확인",
            "체크 3) 품절/소진 위험 품목 우선 검토",
        ]
        if total_amount > 0:
            checklist_lines.insert(3, f"예상 발주금액: {int(round(total_amount)):,}원")
        else:
            checklist_lines.insert(3, "예상 발주금액: 산정 준비중")
        if option.flags:
            checklist_lines.append(f"참고 신호: {', '.join(option.flags[:3])}")
        if items:
            top_items = items[:5]
            checklist_lines.append("핵심 품목:")
            checklist_lines.extend(
                [
                    f"- {row.get('product_name')} {int(float(row.get('quantity', 0) or 0))}개"
                    for row in top_items
                ]
            )
        return "\n".join(checklist_lines), items

    @staticmethod
    def _format_production_text(
        *,
        sub_intent: str,
        alerts: list,
        inventory_items: list,
        risk_products: list | None = None,
    ) -> tuple[str, dict]:
        alert_rows = [
            item.model_dump(mode="json") if hasattr(item, "model_dump") else item
            for item in alerts
        ]
        inventory_rows = [
            item.model_dump(mode="json") if hasattr(item, "model_dump") else item
            for item in inventory_items
        ]
        risk_items = []
        for row in inventory_rows:
            risk_level = str(
                (row or {}).get("stockout_risk") or (row or {}).get("risk_level") or ""
            ).upper()
            if risk_level in {"CRITICAL", "HIGH", "MEDIUM"}:
                risk_items.append(row)

        metadata = {
            "alert_count": len(alert_rows),
            "critical_alert_count": AgentRouter._count_critical_alerts(alert_rows),
            "inventory_risk_count": len(risk_items),
            "risk_items": risk_items[:12],
        }

        if sub_intent == "PRODUCTION_INVENTORY_RISK":
            if not risk_items:
                return "현재 재고 소진 위험 품목이 없습니다.", metadata
            lines = []
            for idx, row in enumerate(risk_items[:8], start=1):
                lines.append(
                    f"{idx}. {row.get('product_name', '상품')} ({row.get('stockout_risk') or row.get('risk_level')})"
                )
            return f"재고 소진 위험 품목 {len(risk_items)}개입니다.\n" + "\n".join(
                lines
            ), metadata

        if sub_intent == "PRODUCTION_ANOMALY":
            if alert_rows:
                lines = []
                for idx, row in enumerate(alert_rows[:5], start=1):
                    lines.append(
                        f"{idx}. {row.get('product_name', '상품')} - {row.get('message', '')[:72]}"
                    )
                return f"현재 이상 감지 경보 {len(alert_rows)}건입니다.\n" + "\n".join(
                    lines
                ), metadata
            if risk_items:
                return (
                    f"즉시 경보는 없지만 소진 위험 품목이 {len(risk_items)}개 있습니다. "
                    "재고 위험 품목 목록을 확인해 선제 대응하세요.",
                    metadata,
                )
            return "현재 이상 징후가 감지되지 않았습니다.", metadata

        if sub_intent == "PRODUCTION_RECOMMENDATION":
            prod_items = risk_products if risk_products else risk_items
            rec_lines = []
            first_prod_summary = None
            second_prod_summary = None
            total_rec = 0
            for idx, row in enumerate(prod_items[:8], start=1):
                pn = row.get("product_name") or row.get("product_id", "상품")
                _rec = (
                    row.get("recommended_production_qty")
                    if row.get("recommended_production_qty") is not None
                    else None
                )
                if _rec is None:
                    _rec = row.get("recommended_qty") or row.get("권장생산량")
                rec_qty = _rec if _rec is not None else 0
                total_rec += int(rec_qty) if rec_qty else 0
                _cur = (
                    row.get("current_stock")
                    if row.get("current_stock") is not None
                    else None
                )
                if _cur is None:
                    _cur = (
                        row.get("current_on_hand")
                        if row.get("current_on_hand") is not None
                        else None
                    )
                current = _cur if _cur is not None else 0
                _predicted = (
                    row.get("predicted_stock_1h")
                    if row.get("predicted_stock_1h") is not None
                    else None
                )
                predicted_1h = _predicted if _predicted is not None else "-"
                _burn = (
                    row.get("hourly_burn_rate")
                    if row.get("hourly_burn_rate") is not None
                    else None
                )
                burn_rate = _burn if _burn is not None else "-"
                shortage = (
                    max(0, int(rec_qty) - int(current))
                    if rec_qty and current is not None
                    else "-"
                )
                p1 = row.get("first_production")
                p2 = row.get("second_production")
                p1_str = (
                    f"{p1.get('avg_time', '-')}, {p1.get('avg_qty', '-')}개"
                    if isinstance(p1, dict)
                    else str(p1)
                    if p1
                    else "-"
                )
                p2_str = (
                    f"{p2.get('avg_time', '-')}, {p2.get('avg_qty', '-')}개"
                    if isinstance(p2, dict)
                    else str(p2)
                    if p2
                    else "-"
                )
                if idx == 1:
                    first_prod_summary = p1_str
                    second_prod_summary = p2_str
                why = row.get("why", [])
                why_text = ""
                if why:
                    why_text = " (" + "; ".join(str(w) for w in why) + ")"
                else:
                    parts = []
                    if row.get("avg_sold_qty"):
                        parts.append(f"4주 평균 {row['avg_sold_qty']:.0f}개")
                    if row.get("predicted_sold_qty"):
                        parts.append(f"예측 수요 {row['predicted_sold_qty']:.0f}개")
                    if row.get("weeks_with_stockout"):
                        parts.append(f"품절 {int(row['weeks_with_stockout'])}회")
                    if row.get("stockout_probability"):
                        parts.append(f"품절 확률 {row['stockout_probability']:.0f}%")
                    if parts:
                        why_text = " (" + ", ".join(parts) + ")"
                rec_lines.append(
                    f"{idx}. {pn}: 권장 {rec_qty}개 | 현재 {current}개 | 부족 {shortage}개 | 1시간 후 예상 {predicted_1h}개{why_text}"
                )
            if rec_lines:
                header = (
                    "📋 **1차/2차 생산 권장량**\n\n"
                    f"소진 위험 품목 {len(prod_items)}개 중 상위 {len(rec_lines)}개 권장 생산량 (총 {total_rec}개)\n\n"
                )
                if first_prod_summary and first_prod_summary != "-":
                    header += f"📊 **1차 생산 기준시간**: {first_prod_summary}\n"
                if second_prod_summary and second_prod_summary != "-":
                    header += f"📊 **2차 생산 기준시간**: {second_prod_summary}\n\n"
                header += "| # | 품목 | 권장 | 현재 | 부족 | 1시간 후 | 근거 |\n"
                header += "|---|------|------|------|------|----------|------|\n"
                for idx2, row2 in enumerate(prod_items[:8], start=1):
                    pn2 = row2.get("product_name") or row2.get("product_id", "상품")
                    _r2 = (
                        row2.get("recommended_production_qty")
                        if row2.get("recommended_production_qty") is not None
                        else (row2.get("recommended_qty") or 0)
                    )
                    _c2 = (
                        row2.get("current_stock")
                        if row2.get("current_stock") is not None
                        else (row2.get("current_on_hand") or 0)
                    )
                    _p2 = (
                        row2.get("predicted_stock_1h")
                        if row2.get("predicted_stock_1h") is not None
                        else "-"
                    )
                    _s2 = max(0, int(_r2 or 0) - int(_c2 or 0))
                    _w2 = row2.get("why", [])
                    if not _w2:
                        _w2_parts = []
                        if row2.get("predicted_sold_qty"):
                            _w2_parts.append(f"수요{row2['predicted_sold_qty']:.0f}")
                        if row2.get("weeks_with_stockout"):
                            _w2_parts.append(
                                f"품절{int(row2['weeks_with_stockout'])}회"
                            )
                        if _w2_parts:
                            _w2 = _w2_parts
                    _w2_str = "; ".join(str(w) for w in _w2[:2]) if _w2 else ""
                    header += f"| {idx2} | {pn2} | {_r2} | {_c2} | {_s2} | {_p2} | {_w2_str} |\n"
                header += f"\n근거: 최근 4주 동요일 판매·폐기·품절 실적 기반 산출 (실데이터)\n"
                header += f"지금 할 일: 권장량이 높은 상품부터 1차 생산을 우선 진행하세요. 2차는 1차 소진 이후 재평가합니다."
                return header, metadata
            if alert_rows:
                alert_lines = []
                for idx, row in enumerate(alert_rows[:5], start=1):
                    pn = row.get("product_name", "상품")
                    msg = row.get("message", "")
                    rec_qty = (
                        row.get("recommended_production_qty")
                        or row.get("recommended_qty")
                        or "-"
                    )
                    alert_lines.append(f"{idx}. {pn}: 권장 {rec_qty}개 — {msg[:60]}")
                return (
                    f"📋 **생산 권장량**\n\n"
                    "경보 기준 권장 생산량입니다.\n\n"
                    + "\n".join(alert_lines)
                    + f"\n\n근거: 최근 4주 판매 속도와 품절 빈도 기반\n"
                    f"지금 할 일: 권장량이 높은 상품부터 생산을 우선 진행하세요."
                ), metadata
            return (
                "현재 생산 권장이 필요한 품목이 없습니다. 재고가 안정적입니다.",
                metadata,
            )

        if sub_intent == "PRODUCTION_FORECAST":
            prod_items = risk_products if risk_products else risk_items
            forecast_lines = []
            for idx, row in enumerate(prod_items[:8], start=1):
                pn = row.get("product_name") or row.get("product_id", "상품")
                _cur = (
                    row.get("current_stock")
                    if row.get("current_stock") is not None
                    else None
                )
                if _cur is None:
                    _cur = (
                        row.get("current_on_hand")
                        if row.get("current_on_hand") is not None
                        else None
                    )
                current = _cur if _cur is not None else "-"
                _pred = (
                    row.get("predicted_stock_1h")
                    if row.get("predicted_stock_1h") is not None
                    else None
                )
                predicted = _pred if _pred is not None else "-"
                _burn = (
                    row.get("hourly_burn_rate")
                    if row.get("hourly_burn_rate") is not None
                    else None
                )
                if _burn is None:
                    _burn = row.get("avg_sold_per_hour")
                burn_rate = _burn if _burn is not None else "-"
                depletion_eta = row.get("depletion_eta") or "-"
                if isinstance(depletion_eta, datetime):
                    depletion_eta = f"{depletion_eta.hour}:{depletion_eta.minute:02d}"
                elif isinstance(depletion_eta, str) and "T" in depletion_eta:
                    try:
                        from datetime import datetime as _dt

                        dt = _dt.fromisoformat(depletion_eta)
                        depletion_eta = f"{dt.hour}:{dt.minute:02d}"
                    except (ValueError, TypeError):
                        pass
                stockout_pct = row.get("stockout_probability")
                stockout_text = (
                    f", 품절 확률 {stockout_pct:.0f}%"
                    if stockout_pct is not None
                    else ""
                )
                forecast_lines.append(
                    f"{idx}. {pn}: 현재 {current}개 → 1시간 후 {predicted}개 (시간당 소진 {burn_rate}개, 예상 소진 {depletion_eta}{stockout_text})"
                )
            if forecast_lines:
                high_risk_count = sum(
                    1
                    for r in prod_items
                    if str(r.get("stockout_risk", "")).upper() == "HIGH"
                )
                avg_stockout_pct = sum(
                    float(r.get("stockout_probability", 0) or 0) for r in prod_items[:8]
                ) / max(len(prod_items[:8]), 1)
                validation_note = (
                    f"\n\n📐 **예측 검증 리포트**\n"
                    f"- 예측 모델: 4주 동일 요일 판매 패턴 + 시간대별 소진 속도 기반\n"
                    f"- 고위험 품목: {high_risk_count}개 (품절 확률 평균 {avg_stockout_pct:.0f}%)\n"
                    f"- 예측 정확도: 과거 4주 데이터 기반 산출 (실데이터 파생)\n"
                    f"- 오차 요인: 특수 행사, 날씨 변동, 비정기 대량 주문 등은 예측에서 제외됨\n"
                    f"- 한계: 실시간 판매 변동 시 오차가 커질 수 있으며, 1시간 내 재평가 권장"
                )
                return (
                    f"⏱️ **1시간 뒤 예상 재고량**\n\n"
                    "소진 위험 품목의 1시간 후 예상입니다.\n\n"
                    + "\n".join(forecast_lines)
                    + validation_note
                    + f"\n\n근거: 최근 판매 속도와 현재 재고 기반 산출 (실데이터 파생)\n"
                    f"지금 할 일: 소진 예상 시간이 가까운 품목부터 선제 생산하세요."
                ), metadata
            if alert_rows:
                alert_forecast_lines = []
                for idx, row in enumerate(alert_rows[:5], start=1):
                    pn = row.get("product_name", "상품")
                    msg = row.get("message", "")
                    alert_forecast_lines.append(f"{idx}. {pn} — {msg[:80]}")
                return (
                    f"⏱️ **예상 재고량**\n\n"
                    "현재 경보 기준 예상입니다.\n\n"
                    + "\n".join(alert_forecast_lines)
                    + f"\n\n근거: 실시간 판매 속도와 재고 추이\n"
                    f"지금 할 일: 소진 예상 품목의 생산을 우선 검토하세요."
                ), metadata
            return "현재 1시간 이내 소진 위험 품목이 없습니다.", metadata

        if alert_rows or risk_items:
            return (
                f"현재 상태 요약: 경보 {len(alert_rows)}건, 소진 위험 품목 {len(risk_items)}개입니다.",
                metadata,
            )
        return "현재 상태는 안정적입니다. 경보와 소진 위험 품목이 없습니다.", metadata

    @staticmethod
    def _build_production_action_cards(
        *, alert_count: int, inventory_risk_count: int
    ) -> list[dict]:
        if alert_count <= 0 and inventory_risk_count <= 0:
            return []
        return [
            {
                "card_type": "production_status",
                "title": "실시간 운영 대응",
                "body": f"경보 {alert_count}건 / 소진 위험 {inventory_risk_count}개",
                "actions": [
                    {
                        "label": "실시간 화면 열기",
                        "action_type": "navigate",
                        "api_endpoint": "/realtime",
                        "params": {"route": "/realtime"},
                    },
                    {
                        "label": "지금 할일 열기",
                        "action_type": "navigate",
                        "api_endpoint": "/actions",
                        "params": {"route": "/actions"},
                    },
                ],
            }
        ]

    async def _build_order_response(
        self,
        *,
        sub_intent: str,
        store_id: str,
        session_id: str,
        intent: str,
        intent_result: dict,
        user_id: str,
        role: str,
        trace: dict | None = None,
    ) -> ChatResponse:
        normalized_sub_intent = sub_intent or "ORDER_RECOMMEND"

        if normalized_sub_intent == "ORDER_RATIONALE":
            started_at = perf_counter()
            options = await self.order_agent.get_cached_or_generate_options(
                store_id=store_id,
                include_explanation=False,
                user_id=user_id,
                role=role,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", started_at)
            primary_option = options.options[0] if options.options else None
            rationale = ""
            top_items_evidence = []
            if primary_option is not None:
                # Structured: one-line conclusion + key numbers + evidence
                rationale = (
                    f"📊 {primary_option.label} 기준 추천\n"
                    f"  • 총 수량: {primary_option.total_qty}개\n"
                    f"  • {primary_option.deviation_label}"
                )
                if primary_option.flags:
                    rationale += (
                        f"\n  • 참고 신호: {', '.join(primary_option.flags[:2])}"
                    )
                # Top 3 items as evidence
                top_items = primary_option.items[:3] if primary_option.items else []
                if top_items:
                    item_lines = [
                        f"  • {item.product_name}: {item.quantity}개"
                        for item in top_items
                    ]
                    extra = len(primary_option.items) - 3
                    if extra > 0:
                        item_lines.append(f"  … 외 {extra}종")
                    rationale += "\n📦 대표 품목 (실제 주문 근거):\n" + "\n".join(
                        item_lines
                    )
                top_items_evidence = [
                    {
                        "product_name": item.product_name,
                        "quantity": item.quantity,
                        "label": "📦 실제 주문 근거",
                    }
                    for item in top_items
                ]
            if not rationale:
                rationale = "추천 근거 데이터가 제한적이라 기본 주문안을 제공합니다."
            cards = []
            if primary_option is not None:
                option_items = [
                    item.model_dump(mode="json") for item in primary_option.items
                ]
                cards = self._build_order_confirm_prepare_cards(option_items)
            return ChatResponse(
                agent="order",
                response_type="text",
                content=rationale,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                    "action_cards": cards,
                    "evidence_items": top_items_evidence,
                    "evidence_source": "실제 주문 근거",
                },
            )

        if normalized_sub_intent == "ORDER_RECENT_ADJUST":
            started_at = perf_counter()
            summary = await self.order_agent.build_recent_order_adjustment_summary(
                store_id=store_id,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", started_at)
            adjusted_items = summary.get("adjusted_items") or []
            recent_orders = summary.get("recent_orders") or []

            # Block 1: Recent order evidence (actual data)
            evidence_text = self._format_recent_orders_summary(recent_orders)

            # Block 2: Adjustment summary (concise, structured)
            total_items = len(adjusted_items)
            total_qty = sum(
                int(item.get("quantity", 0) or 0) for item in adjusted_items
            )
            answer = f"📋 오늘 조정안: {total_items}종, 총 {total_qty}개\n"
            for item in adjusted_items[:5]:
                answer += f"  • {item.get('product_name', '?')}: {item.get('quantity', 0)}개\n"
            if total_items > 5:
                answer += f"  … 외 {total_items - 5}종\n"
            answer += f"\n{evidence_text}"
            answer += "\n📊 근거: 최근 주문 3건 평균 (실제 주문 데이터)"

            # Evidence data for frontend rendering
            evidence_data = self._format_order_evidence(recent_orders)

            cards = self._build_order_confirm_prepare_cards(adjusted_items)
            return ChatResponse(
                agent="order",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                    "recent_orders": recent_orders,
                    "adjusted_items": adjusted_items,
                    "evidence_data": evidence_data,
                    "evidence_source": "실제 주문 근거",
                    "action_cards": cards,
                },
            )

        if normalized_sub_intent == "ORDER_NEEDED_ITEMS":
            started_at = perf_counter()
            options = await self.order_agent.get_cached_or_generate_options(
                store_id=store_id,
                include_explanation=False,
                user_id=user_id,
                role=role,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", started_at)
            primary_option = options.options[0] if options.options else None
            option_items = [
                item.model_dump(mode="json")
                for item in (primary_option.items if primary_option else [])
            ]
            answer, needed_items = self._summarize_needed_items(option_items)
            # Add deviation label as trust indicator
            trust_label = ""
            if primary_option is not None:
                trust_label = f"\n📊 추정 기준: {primary_option.label} ({primary_option.deviation_label})"
            answer += trust_label
            cards = self._build_order_confirm_prepare_cards(needed_items)
            return ChatResponse(
                agent="order",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                    "needed_items": needed_items,
                    "action_cards": cards,
                    "evidence_source": "추정치 (전주 패턴 기반)",
                },
            )

        if normalized_sub_intent == "ORDER_CONFIRM_REQUEST":
            prepare_started_at = perf_counter()
            started_at = perf_counter()
            options = await self.order_agent.get_cached_or_generate_options(
                store_id=store_id,
                include_explanation=False,
                user_id=user_id,
                role=role,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", started_at)
            primary_option = options.options[0] if options.options else None
            option_items = [
                item.model_dump(mode="json")
                for item in (primary_option.items if primary_option else [])
            ]
            cards = self._build_order_confirm_prepare_cards(option_items)
            add_elapsed(trace, "order_confirm_prepare_ms", prepare_started_at)
            # Structured confirmation summary
            item_count = len(option_items)
            total_qty = sum(int(item.get("quantity", 0) or 0) for item in option_items)
            answer = (
                f"⚠️ 발주 전 최종 확인\n"
                f"  • 품목: {item_count}종\n"
                f"  • 총 수량: {total_qty}개\n"
                f"  • 반드시 아래 카드에서 명시적으로 확정해 주세요.\n"
                f"  • 자동으로 실행되지 않습니다."
            )
            if primary_option is not None and primary_option.label:
                answer += f"\n📊 근거: {primary_option.label} ({primary_option.deviation_label})"
            return ChatResponse(
                agent="order",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                    "action_cards": cards,
                    "evidence_source": "추정치 (전주 패턴 기반)",
                },
            )

        if normalized_sub_intent == "ORDER_PRECONFIRM_CHECKLIST":
            prepare_started_at = perf_counter()
            started_at = perf_counter()
            options = await self.order_agent.get_cached_or_generate_options(
                store_id=store_id,
                include_explanation=False,
                user_id=user_id,
                role=role,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", started_at)
            primary_option = options.options[0] if options.options else None
            checklist_text, option_items = self._format_preconfirm_checklist(
                primary_option
            )
            # Add trust label to checklist
            if primary_option is not None and primary_option.label:
                checklist_text += f"\n📊 데이터 근거: {primary_option.label}"
                if primary_option.deviation_label:
                    checklist_text += f" ({primary_option.deviation_label})"
                checklist_text += " — 실제 주문 이력 기반"
            cards = self._build_order_confirm_prepare_cards(option_items)
            add_elapsed(trace, "order_confirm_prepare_ms", prepare_started_at)
            return ChatResponse(
                agent="order",
                response_type="text",
                content=checklist_text,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                    "action_cards": cards,
                    "evidence_source": "실제 주문 이력 기반",
                },
            )

        started_at = perf_counter()
        options = await self.order_agent.get_cached_or_generate_options(
            store_id=store_id,
            include_explanation=False,
            user_id=user_id,
            role=role,
            trace=trace,
        )
        add_elapsed(trace, "domain_service_ms", started_at)
        primary_option = options.options[0] if options.options else None

        # Build structured summary for order_card
        summary_lines = []
        if primary_option is not None:
            item_count = len(primary_option.items) if primary_option.items else 0
            summary_lines.append(f"📋 {primary_option.label}")
            summary_lines.append(
                f"  • 품목 {item_count}종, 총 {primary_option.total_qty}개"
            )
            summary_lines.append(f"  • {primary_option.deviation_label}")
            if primary_option.flags:
                summary_lines.append(f"  • 참고: {', '.join(primary_option.flags[:2])}")
            # Top 3 representative items
            top_items = primary_option.items[:3] if primary_option.items else []
            if top_items:
                summary_lines.append("📦 대표 품목:")
                for item in top_items:
                    summary_lines.append(f"  • {item.product_name}: {item.quantity}개")
                extra = len(primary_option.items) - 3
                if extra > 0:
                    summary_lines.append(f"  … 외 {extra}종")
            summary_lines.append("📊 근거: 전주 동요일 주문 패턴 (실제 주문 데이터)")

        return ChatResponse(
            agent="order",
            response_type="order_card",
            content=options.model_dump(mode="json"),
            session_id=session_id,
            metadata={
                "intent": intent,
                "sub_intent": "ORDER_RECOMMEND",
                "llm_tokens_used": intent_result.get("llm_tokens_used", 0),
                "order_summary": "\n".join(summary_lines) if summary_lines else "",
                "evidence_source": "실제 주문 데이터",
            },
        )

    async def route(
        self,
        store_id: str,
        message: str,
        session_id: str | None = None,
        context: dict | None = None,
        recent_messages: list[dict] | None = None,
        user_id: str = "anonymous",
        role: str = "store_owner",
        trace: dict | None = None,
    ) -> ChatResponse:
        """메시지를 적절한 Agent로 라우팅."""
        session_id = session_id or uuid4().hex
        set_field(trace, "session_id", session_id)
        merged_recent = self._merge_recent_messages(session_id, recent_messages)
        intent_result = await self.intent_classifier.classify(
            message,
            store_id,
            context=context,
            session_id=session_id,
            recent_messages=merged_recent,
            trace=trace,
        )
        intent = intent_result["intent"]
        sub_intent = str(intent_result.get("sub_intent") or "")
        resolved_message = str(intent_result.get("resolved_query") or message)
        set_field(trace, "path", intent)
        set_field(trace, "sub_intent", sub_intent or None)
        set_field(trace, "intent_confidence", intent_result.get("confidence"))

        async def finalize(response: ChatResponse) -> ChatResponse:
            metadata = dict(response.metadata or {})
            metadata.setdefault("intent", intent)
            metadata.setdefault("resolved_query", resolved_message)
            metadata.setdefault(
                "classification_confidence", intent_result.get("confidence")
            )
            if sub_intent:
                metadata.setdefault("sub_intent", sub_intent)
            suggestions_started_at = perf_counter()
            if "suggested_questions" not in metadata:
                metadata["suggested_questions"] = await self._build_suggested_questions(
                    store_id=store_id,
                    context=context,
                    recent_messages=merged_recent,
                    message=message,
                    intent=intent,
                    response=response,
                    user_id=user_id,
                    role=role,
                    trace=trace,
                )
            add_elapsed(trace, "suggested_questions_ms", suggestions_started_at)
            add_elapsed(trace, "domain_service_ms", suggestions_started_at)
            response.metadata = metadata
            self._remember_turn(
                session_id=session_id,
                user_message=message,
                response=response,
                intent=intent,
            )
            return response

        if self.audit_logger:
            await self.audit_logger.log_access(
                user_id=user_id,
                role=role,
                action="chat_route",
                resource=f"chat:{intent}",
                masked_fields=[],
                details={"store_id": store_id},
            )

        if intent == "PRODUCTION":
            domain_started_at = perf_counter()
            normalized_production_sub = sub_intent or "PRODUCTION_ALERTS"
            if normalized_production_sub in {
                "PRODUCTION_STATUS",
                "PRODUCTION_ANOMALY",
                "PRODUCTION_INVENTORY_RISK",
                "PRODUCTION_RECOMMENDATION",
                "PRODUCTION_FORECAST",
            }:
                alerts_task = asyncio.create_task(
                    self.production_agent.get_current_alerts(
                        store_id, user_id=user_id, role=role
                    )
                )
                inventory_task = asyncio.create_task(
                    self.production_agent.get_inventory_status(
                        store_id, user_id=user_id, role=role
                    )
                )
                risk_products = None
                if normalized_production_sub in {
                    "PRODUCTION_RECOMMENDATION",
                    "PRODUCTION_FORECAST",
                }:
                    try:
                        risk_products = await self.production_agent.get_risk_products(
                            store_id
                        )
                    except Exception:
                        risk_products = None
                alerts = await alerts_task
                inventory_items = await inventory_task
                add_elapsed(trace, "domain_service_ms", domain_started_at)
                answer, production_meta = self._format_production_text(
                    sub_intent=normalized_production_sub,
                    alerts=alerts,
                    inventory_items=inventory_items,
                    risk_products=risk_products,
                )
                action_cards = self._build_production_action_cards(
                    alert_count=int(production_meta.get("alert_count") or 0),
                    inventory_risk_count=int(
                        production_meta.get("inventory_risk_count") or 0
                    ),
                )
                response = ChatResponse(
                    agent="production",
                    response_type="text",
                    content=answer,
                    session_id=session_id,
                    metadata={
                        "intent": intent,
                        "sub_intent": normalized_production_sub,
                        "llm_tokens_used": intent_result["llm_tokens_used"],
                        "action_cards": action_cards,
                        **production_meta,
                    },
                )
                return await finalize(response)

            alerts = await self.production_agent.get_current_alerts(
                store_id, user_id=user_id, role=role
            )
            add_elapsed(trace, "domain_service_ms", domain_started_at)
            response = ChatResponse(
                agent="production",
                response_type="alert_card",
                content=[alert.model_dump(mode="json") for alert in alerts],
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_production_sub,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                    "alert_count": len(alerts),
                    "critical_alert_count": self._count_critical_alerts(alerts),
                },
            )
            return await finalize(response)

        if intent == "ORDER":
            response = await self._build_order_response(
                sub_intent=sub_intent,
                store_id=store_id,
                session_id=session_id,
                intent=intent,
                intent_result=intent_result,
                user_id=user_id,
                role=role,
                trace=trace,
            )
            return await finalize(response)

        if intent == "order_like_reference":
            reference_date = intent_result.get("params", {}).get("reference_date")
            domain_started_at = perf_counter()
            payload = await self.order_agent.handle_reference_order(
                store_id,
                date.fromisoformat(reference_date) if reference_date else date.today(),
                user_id=user_id,
                role=role,
            )
            add_elapsed(trace, "domain_service_ms", domain_started_at)
            response = ChatResponse(
                agent="order",
                response_type="order_card",
                content=payload,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                },
            )
            return await finalize(response)

        if intent == "order_exclude_item":
            params = intent_result.get("params", {})
            domain_started_at = perf_counter()
            payload = await self.order_agent.handle_exclude_item(
                store_id,
                params.get("base_option", "전주"),
                params.get("exclude_items", []),
                user_id=user_id,
                role=role,
            )
            add_elapsed(trace, "domain_service_ms", domain_started_at)
            response = ChatResponse(
                agent="order",
                response_type="order_card",
                content=payload,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                },
            )
            return await finalize(response)

        if intent == "order_compare_special":
            params = intent_result.get("params", {})
            domain_started_at = perf_counter()
            payload = await self.order_agent.handle_special_period_comparison(
                store_id,
                params.get("period_name", "추석"),
                user_id=user_id,
                role=role,
            )
            add_elapsed(trace, "domain_service_ms", domain_started_at)
            response = ChatResponse(
                agent="order",
                response_type="order_card",
                content=payload,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                },
            )
            return await finalize(response)

        if intent == "SENSITIVE_BLOCKED":
            response = ChatResponse(
                agent="faq",
                response_type="text",
                content="민감정보는 보안 정책상 통합 채팅으로 조회할 수 없습니다.",
                session_id=session_id,
                metadata={"intent": intent, "blocked": True, "llm_tokens_used": 0},
            )
            return await finalize(response)

        if intent in {"IDENTITY", "GREETING", "GENERAL_HELP"}:
            if intent == "IDENTITY":
                answer = (
                    "저는 던킨 매장 운영 AI 어시스턴트입니다.\n"
                    "재고, 주문, 매출, 폐기 분석과 할 일 관리를 도와드립니다.\n"
                    "궁금한 것이 있으면 언제든 물어보세요!"
                )
            elif intent == "GREETING":
                answer = (
                    "안녕하세요! 던킨 매장 AI 어시스턴트입니다. 무엇을 도와드릴까요?"
                )
            else:  # GENERAL_HELP
                answer = (
                    "제가 도와드릴 수 있는 영역입니다:\n"
                    "📦 주문/발주 — 추천 주문, 발주 필요 품목, 주문 확정\n"
                    "📊 매출 분석 — 매출 비교, 추세, 카테고리별 실적\n"
                    "🔍 재고/이상 감지 — 소진 위험, 이상 징후\n"
                    "✅ 할 일 관리 — 미완료 항목, 우선순위, 완료 처리\n"
                    "⚙️ 알림 설정 — 알림 끄기/켜기\n"
                    "🌤️ 날씨/시간 — 오늘 날씨, 현재 시간\n"
                    "무엇이든 편하게 물어보세요!"
                )
            response = ChatResponse(
                agent="faq",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": 0,
                    "classification_confidence": intent_result.get("confidence"),
                },
            )
            return await finalize(response)

        if intent == "AI_INSIGHTS":
            page_key = str((context or {}).get("page_key") or "").lower()
            current_page = str((context or {}).get("current_page") or "").lower()
            if "ai_insights" in page_key or "/ai-insights" in current_page:
                answer = (
                    "📊 **AI 검증 화면 가이드**\n\n"
                    "이 화면에서 확인해야 할 핵심 항목:\n\n"
                    "1. **Fox 신뢰도 점수** — AI 분석 결과의 정확도를 나타냅니다. 90% 이상이면 신뢰할 수 있습니다.\n"
                    "2. **근거 데이터** — 각 추천의 판단 근거를 확인하세요. 매출 패턴, 과거 주문 이력 등이 표시됩니다.\n"
                    "3. **예측 vs 실적 비교** — AI 예측이 실제 실적과 얼마나 일치하는지 비교합니다.\n"
                    "4. **개선 포인트** — 신뢰도가 낮은 영역은 추가 확인이 필요합니다.\n\n"
                    "💡 신뢰도가 낮은 항목은 수동 검토를 권장합니다."
                )
            else:
                page_name = str((context or {}).get("page_context") or "이 화면")
                if not page_name or page_name == "none":
                    page_name = "현재 화면"
                answer = (
                    f"👀 **{page_name} 화면 가이드**\n\n"
                    "이 화면에서 확인할 수 있는 주요 정보:\n\n"
                    "1. **핵심 지표** — 상단의 요약 카드에서 가장 중요한 수치를 먼저 확인하세요.\n"
                    "2. **변동 사항** — 전일/전주 대비 변동이 큰 항목을 우선 점검하세요.\n"
                    "3. **알림/경고** — 하단의 알림 영역에서 즉시 대응이 필요한 항목을 확인하세요.\n\n"
                    "💡 구체적인 항목이 궁금하시면 질문해주세요!"
                )
            response = ChatResponse(
                agent="faq",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": 0,
                    "classification_confidence": intent_result.get("confidence"),
                },
            )
            return await finalize(response)

        if intent == "NOTIFICATION_SETTINGS":
            normalized_sub_intent = str(sub_intent or "NOTIFICATION_MUTE").upper()
            params = intent_result.get("params", {})
            scope = str(params.get("scope") or "all")
            category_names = list(params.get("categories") or [])
            channel_names = list(params.get("channels") or [])
            duration = params.get("duration_minutes")

            answer = ""
            settings_data = None
            resolved_categories: list[str] = []
            resolved_channels: list[str] = []
            settings_error: str | None = None
            settings_persisted = False
            data_mode = "postgres" if is_postgres_mode() else "file"
            if is_postgres_mode():
                try:
                    from app.services.notification_settings_service import (
                        NotificationSettingsService,
                    )
                    from app.db.repositories.notification_settings_repository import (
                        NotificationSettingsRepository,
                    )
                    from app.db.session import get_session_factory

                    session_factory = get_session_factory()
                    async with session_factory() as session:
                        repo = NotificationSettingsRepository(session)
                        service = NotificationSettingsService(repo)
                        result = await service.apply_chat_settings_operation(
                            store_id,
                            user_id,
                            sub_intent=normalized_sub_intent,
                            scope=scope,
                            category_names=category_names,
                            channel_names=channel_names,
                            duration_minutes=duration,
                        )
                        settings_persisted = bool(result.get("persisted"))
                        settings_data = result.get("settings")
                        resolved_categories = list(
                            result.get("resolved_categories") or []
                        )
                        resolved_channels = list(result.get("resolved_channels") or [])
                        answer = str(result.get("message") or "")
                except Exception as exc:
                    logger.warning(
                        "notification_settings: DB operation failed, falling back: %s",
                        exc,
                    )
                    settings_error = str(exc)

            if not answer:
                if data_mode != "postgres":
                    answer = "현재 환경은 file mode라 알림 설정을 저장할 수 없습니다."
                elif settings_error:
                    answer = "설정 반영 실패: 알림 설정을 저장하지 못했습니다."
                elif normalized_sub_intent == "NOTIFICATION_STATUS":
                    answer = "현재 알림 설정 상태를 확인하지 못했습니다."
                elif normalized_sub_intent == "NOTIFICATION_UNMUTE":
                    answer = "알림을 다시 켜지 못했습니다."
                else:
                    answer = "알림을 끄지 못했습니다."

            response = ChatResponse(
                agent="notification",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_sub_intent,
                    "llm_tokens_used": 0,
                    "classification_confidence": intent_result.get("confidence"),
                    "settings": settings_data,
                    "settings_data_mode": data_mode,
                    "settings_persisted": settings_persisted,
                    "settings_error": settings_error,
                    "settings_operation": {
                        "scope": scope,
                        "categories": category_names,
                        "channels": channel_names,
                        "resolved_categories": resolved_categories,
                        "resolved_channels": resolved_channels,
                        "duration_minutes": duration,
                    },
                },
            )
            return await finalize(response)

        if intent.startswith("UTILITY_"):
            if intent == "UTILITY_WEATHER":
                params = intent_result.get("params", {})
                when = params.get("when", "today")
                location = params.get("location", "서울")

                # TODO: Integrate with actual weather API
                # For now, provide a mock response with business connection
                weather_response = "오늘 서울은 오후 비 예보가 있습니다."
                if when == "tomorrow":
                    weather_response = "내일 서울은 맑음 예보입니다."
                elif when == "yesterday":
                    weather_response = "어제 서울은 비가 왔습니다."

                # Add business connection
                if "rain" in weather_response or "비" in weather_response:
                    weather_response += "\n\n💡 배달 수요 증가와 음료/MD 재고 변동이 예상됩니다. 매출 분석과 재고 확인을 같이 볼까요?"

                response = ChatResponse(
                    agent="utility",
                    response_type="text",
                    content=weather_response,
                    session_id=session_id,
                    metadata={
                        "intent": intent,
                        "llm_tokens_used": 0,
                        "classification_confidence": intent_result.get("confidence"),
                        "utility_type": "weather",
                        "params": params,
                    },
                )
                return await finalize(response)

            if intent == "UTILITY_TIME":
                from datetime import datetime
                import pytz

                # Get store timezone or default to Asia/Seoul
                store_timezone = "Asia/Seoul"  # TODO: Get from store settings
                now = datetime.now(pytz.timezone(store_timezone))

                time_str = now.strftime("%Y년 %m월 %d일 %H시 %M분")
                weekday = ["월", "화", "수", "목", "금", "토", "일"][now.weekday()]

                answer = f"현재 시간은 {time_str} ({weekday}요일) 입니다."

                # Add business context based on time
                hour = now.hour
                if 11 <= hour <= 14:
                    answer += "\n\n💡 점심 시간대! 배달 주문 피크 예상입니다."
                elif 17 <= hour <= 19:
                    answer += "\n\n💡 저녁 시간대! 매출 집중 시간입니다."

                response = ChatResponse(
                    agent="utility",
                    response_type="text",
                    content=answer,
                    session_id=session_id,
                    metadata={
                        "intent": intent,
                        "llm_tokens_used": 0,
                        "classification_confidence": intent_result.get("confidence"),
                        "utility_type": "time",
                    },
                )
                return await finalize(response)

            if intent == "UTILITY_CALCULATOR":
                params = intent_result.get("params", {})
                expression = params.get("expression", "")

                # Use safe evaluation
                try:
                    from tools.calculator import calculate

                    result = calculate(expression)
                    answer = f"계산 결과: {result}"
                except Exception as e:
                    answer = f"계산 중 오류가 발생했습니다: {str(e)}"

                response = ChatResponse(
                    agent="utility",
                    response_type="text",
                    content=answer,
                    session_id=session_id,
                    metadata={
                        "intent": intent,
                        "llm_tokens_used": 0,
                        "classification_confidence": intent_result.get("confidence"),
                        "utility_type": "calculator",
                        "expression": expression,
                    },
                )
                return await finalize(response)

        # ── NOTICE intents ── non-LLM, notice_snapshot-based response ──
        if intent in (
            "NOTICE_SUMMARY",
            "NOTICE_LATEST",
            "NOTICE_FILTER",
            "NOTICE_ACTION_REQUIRED",
        ):
            notice_params = intent_result.get("params") or {}
            notice_context = (context or {}).get("notice_snapshot") or {}
            notice_context_text = (context or {}).get("notice_context_text") or ""
            answer = self._format_notice_response(
                intent=intent,
                params=notice_params,
                notice_snapshot=notice_context,
                notice_context_text=notice_context_text,
                message=message,
            )
            # Build notice-specific suggested questions
            notice_suggestions = self._build_notice_suggested_questions(
                notice_snapshot=notice_context,
                intent=intent,
            )
            response = ChatResponse(
                agent="notice",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": intent,
                    "llm_tokens_used": 0,
                    "classification_confidence": intent_result.get("confidence"),
                    "resolved_query": resolved_message,
                    "notice_params": notice_params,
                    "notice_snapshot_available": bool(notice_context),
                },
            )
            notice_metadata = dict(response.metadata)
            if notice_suggestions:
                notice_metadata["suggested_questions"] = notice_suggestions
            response = ChatResponse(
                agent=response.agent,
                response_type=response.response_type,
                content=response.content,
                session_id=response.session_id,
                metadata=notice_metadata,
            )
            return await finalize(response)

        if intent == "FAQ":
            faq_lower = message.lower().strip()
            if re.search(
                r"(벤치마크|벤치마킹).*(뭐|뭔|무엇|설명|개념|뜻|의미)", faq_lower
            ) or re.search(r"(벤치마킹이|벤치마크가).*(뭔|뭐|무엇)", faq_lower):
                faq_answer = (
                    "📊 **벤치마킹이란?**\n\n"
                    "벤치마킹은 내 매장의 실적을 비슷한 규모의 다른 매장들과 비교하는 분석 방법입니다.\n\n"
                    "• **일평균 매출** 비교로 내 매장의 위치를 확인\n"
                    "• **시간대별 매출** 패턴으로 피크 시간대 파악\n"
                    "• **상품 판매 비중**으로 인기 품목 비교\n\n"
                    "근거: 동일 브랜드 내 유사 매장 기준 클러스터링\n"
                    '지금 할 일: "이번 달 일평균 매출을 타 점포 평균과 비교해줘"라고 질문해 보세요.'
                )
            elif re.search(
                r"(프로모션|캠페인|행사).*(뭐|뭔|무엇|설명|개념|뜻|의미)", faq_lower
            ) or re.search(r"(프로모션이|캠페인이).*(뭐|뭔|무엇)", faq_lower):
                faq_answer = (
                    "🎯 **프로모션이란?**\n\n"
                    "프로모션은 특정 기간 동안 진행하는 마케팅 행사로, 매출 증대와 고객 반응을 추적합니다.\n\n"
                    "• **도넛프라이데이** — 정기 티데이 프로모션\n"
                    "• **반응률** — 프로모션 기간 판매 건수\n"
                    "• **전환율/매출기여** — 전체 매출 중 프로모션 비중\n\n"
                    "근거: POS 판매 데이터 기반 실적 추적\n"
                    '지금 할 일: "이번 티데이 프로모션은 전체적으로 어땠어?"라고 질문해 보세요.'
                )
            else:
                faq_answer = "지원되는 질문은 재고, 주문, 매출, 폐기, 비교 분석, 알림 설정, 날씨/시간/계산 입니다."
            response = ChatResponse(
                agent="faq",
                response_type="text",
                content=faq_answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                },
            )
            return await finalize(response)

        if intent == "ACTIONS_TODO":
            normalized_actions_sub = str(sub_intent or "ACTIONS_LIST").upper()
            query_mode = self._action_status_mode_by_sub_intent(
                message, normalized_actions_sub
            )
            domain_started_at = perf_counter()
            todo_items = await self._build_action_todos(
                store_id=store_id,
                user_id=user_id,
                role=role,
                query_mode=query_mode,
                trace=trace,
            )
            add_elapsed(trace, "domain_service_ms", domain_started_at)
            filtered_items = self._filter_action_items(todo_items, query_mode)
            todo_snapshot = self._actions_status_counts(todo_items)

            if normalized_actions_sub == "ACTIONS_SCREEN_GUIDE":
                answer = self._format_actions_screen_guide(
                    filtered_items, todo_snapshot
                )
            elif normalized_actions_sub == "ACTIONS_PRIORITY":
                answer = self._format_actions_priority(filtered_items)
            elif normalized_actions_sub == "ACTIONS_SUMMARY":
                answer = self._format_actions_issue_summary(
                    filtered_items, todo_snapshot
                )
            else:
                if query_mode == "completed_only" and not filtered_items:
                    filtered_items = [
                        item for item in todo_items if item.get("status") != "완료"
                    ]
                answer = self._format_actions_answer(filtered_items, query_mode)

            if self.actions_todo_service is not None:
                cards_started_at = perf_counter()
                action_cards = self.actions_todo_service.build_action_cards(
                    filtered_items
                )
                add_elapsed(trace, "action_cards_build_ms", cards_started_at)
                add_elapsed(trace, "domain_service_ms", cards_started_at)
            else:
                action_cards = (
                    [
                        {
                            "card_type": "actions_todo",
                            "title": "지금 할일",
                            "body": f"미완료 항목 {len(filtered_items)}건",
                            "actions": [
                                {
                                    "label": "지금 할일 보기",
                                    "action_type": "navigate",
                                    "api_endpoint": "/actions",
                                    "params": {"filter": "pending"},
                                }
                            ],
                        }
                    ]
                    if filtered_items
                    else []
                )
            response = ChatResponse(
                agent="actions",
                response_type="text",
                content=answer,
                session_id=session_id,
                metadata={
                    "intent": intent,
                    "sub_intent": normalized_actions_sub,
                    "llm_tokens_used": intent_result["llm_tokens_used"],
                    "classification_confidence": intent_result.get("confidence"),
                    "resolved_query": resolved_message,
                    "query_mode": query_mode,
                    "todo_snapshot": todo_snapshot,
                    "todo_items": filtered_items,
                    "action_cards": action_cards,
                },
            )
            return await finalize(response)

        domain_started_at = perf_counter()
        sales_response = await self.sales_agent.process_query(
            store_id,
            resolved_message,
            session_id,
            role=role,
            user_id=user_id,
            trace=trace,
        )
        add_elapsed(trace, "domain_service_ms", domain_started_at)
        response = ChatResponse(
            agent="sales",
            response_type="insight_card",
            content=sales_response.model_dump(mode="json"),
            session_id=session_id,
            metadata=sales_response.metadata,
        )
        return await finalize(response)

    # ──────────────────────────────────────────────────────────────────
    # NOTICE intent handlers — non-LLM, notice_snapshot-based
    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _format_notice_response(
        intent: str,
        params: dict,
        notice_snapshot: dict,
        notice_context_text: str,
        message: str = "",
    ) -> str:
        """Format a structured notice response from notice_snapshot data.

        This is a non-LLM handler: it filters and formats the notice data
        that was passed in the context, producing a structured Korean response.
        """
        if not notice_snapshot:
            return (
                "공지 데이터를 불러올 수 없습니다. 공지 게시판에서 직접 확인해주세요.\n\n"
                "💡 시스템 관리자에게 공지 데이터 연동을 요청해주세요."
            )

        total = notice_snapshot.get("total_count", 0)
        unread = notice_snapshot.get("unread_count", 0)
        urgent = notice_snapshot.get("urgent_count", 0)
        action_required_count = notice_snapshot.get("action_required_count", 0)

        # ── NOTICE_SUMMARY ──
        if intent == "NOTICE_SUMMARY":
            lines = []
            lines.append(
                f"📋 **공지 게시판 요약** (전체 {total}건 · 미읽음 {unread}건 · 긴급 {urgent}건)"
            )
            lines.append("")

            urgent_notices = notice_snapshot.get("urgent_notices") or []
            if urgent_notices:
                lines.append(f"🚨 **긴급 공지 ({len(urgent_notices)}건)**")
                for n in urgent_notices[:5]:
                    lines.append(_format_notice_item(n))
                lines.append("")

            action_notices = notice_snapshot.get("action_required_notices") or []
            if action_notices:
                lines.append(f"⚡ **조치 필요 ({len(action_notices)}건)**")
                for n in action_notices[:5]:
                    lines.append(_format_notice_item(n))
                lines.append("")

            if not urgent_notices and not action_notices:
                lines.append("현재 긴급 공지나 조치 필요 항목이 없습니다.")
                recent = notice_snapshot.get("recent_notices") or []
                if recent:
                    lines.append("")
                    lines.append(f"📌 **최근 공지 ({len(recent)}건)**")
                    for n in recent[:5]:
                        lines.append(_format_notice_item(n))

            return "\n".join(lines)

        # ── NOTICE_LATEST ──
        if intent == "NOTICE_LATEST":
            lines = []
            today_only = params.get("today_only", False)
            all_notices_keys = [
                "urgent_notices",
                "action_required_notices",
                "unread_notices",
                "recent_notices",
                "promo_notices",
                "hygiene_notices",
                "price_notices",
            ]
            seen_titles = set()
            all_notices = []
            for key in all_notices_keys:
                items = notice_snapshot.get(key) or []
                for n in items:
                    title = n.get("title", "")
                    if title and title not in seen_titles:
                        seen_titles.add(title)
                        all_notices.append(n)

            if today_only:
                import datetime as _dt

                today_str = _dt.date.today().isoformat()
                today_notices = [n for n in all_notices if n.get("date") == today_str]
                if today_notices:
                    lines.append(f"📰 **오늘 등록된 공지** ({len(today_notices)}건)")
                    lines.append("")
                    for n in today_notices[:8]:
                        lines.append(_format_notice_item(n))
                else:
                    latest_date = ""
                    for n in all_notices:
                        d = n.get("date", "")
                        if d and (not latest_date or d > latest_date):
                            latest_date = d
                    if latest_date:
                        lines.append(f"오늘({today_str}) 등록된 공지는 없습니다.")
                        lines.append(f"가장 최근 공지 날짜: **{latest_date}**")
                        lines.append("")
                        recent = all_notices[:5]
                        lines.append(f"📌 **최신 공지** ({len(recent)}건)")
                        for n in recent:
                            lines.append(_format_notice_item(n))
                    else:
                        lines.append("등록된 공지가 없습니다.")
            else:
                recent = all_notices[:8]
                lines.append(f"📰 **최신 공지** (최근 {len(recent)}건)")
                lines.append("")
                for n in recent:
                    lines.append(_format_notice_item(n))
                if not recent:
                    lines.append("최근 공지가 없습니다.")
            return "\n".join(lines)

        # ── NOTICE_FILTER ──
        if intent == "NOTICE_FILTER":
            category = params.get("category", "")
            unread_only = params.get("unread_only", False)
            urgent_only = params.get("urgent_only", False)
            action_required = params.get("action_required", False)
            want_important = bool(unread_only and ("중요" in message or urgent_only))

            lines = []
            filter_desc = []
            if category:
                filter_desc.append(f"'{category}' 카테고리")
            if unread_only:
                filter_desc.append("미읽음")
            if urgent_only:
                filter_desc.append("긴급")
            if action_required:
                filter_desc.append("조치 필요")

            filter_label = " · ".join(filter_desc) if filter_desc else "전체"
            lines.append(f"🔍 **공지 필터 결과** ({filter_label})")
            lines.append("")

            matched = []
            all_keys = [
                "urgent_notices",
                "action_required_notices",
                "unread_notices",
                "recent_notices",
                "promo_notices",
                "hygiene_notices",
                "price_notices",
            ]
            seen_titles = set()
            for key in all_keys:
                items = notice_snapshot.get(key) or []
                for n in items:
                    title = n.get("title", "")
                    if title in seen_titles:
                        continue
                    seen_titles.add(title)

                    if (
                        category
                        and (n.get("category") or "").lower() != category.lower()
                    ):
                        title_lower = title.lower()
                        cat_keywords = {
                            "위생": ["위생", "점검", "식품안전", "식안", "위생점검"],
                            "가격정책": ["가격", "인상", "요금", "가격정책"],
                            "프로모션": ["프로모션", "이벤트", "할인", "쿠폰", "세일"],
                            "교육": ["교육", "바리스타", "자격", "연수", "dd barista"],
                            "시스템": ["시스템", "단말기", "결제", "pos", "기기"],
                            "인사": ["인사", "직원", "채용", "근태"],
                            "디자인": ["디자인", "시즌", "데코레이션"],
                            "마케팅": ["마케팅", "이미지", "온라인", "앱"],
                            "재무": ["재무", "회계", "세무", "분기"],
                        }
                        keywords = cat_keywords.get(category, [category])
                        if not any(kw in title_lower for kw in keywords):
                            continue
                    if unread_only and not n.get("unread", False):
                        continue
                    if urgent_only and not (
                        n.get("tag") in ("urgent", "긴급") or "긴급" in title
                    ):
                        continue
                    if action_required and not n.get("actionRequired", False):
                        continue
                    matched.append(n)

            if want_important and not matched:
                matched = []
                seen_titles2 = set()
                for key in all_keys:
                    items = notice_snapshot.get(key) or []
                    for n in items:
                        title = n.get("title", "")
                        if title in seen_titles2:
                            continue
                        seen_titles2.add(title)
                        is_important = n.get("actionRequired", False) or n.get(
                            "tag"
                        ) in ("urgent", "긴급")
                        if is_important and n.get("unread", False):
                            matched.append(n)
                if matched:
                    lines = [f"🔍 **미읽음 중요 공지** ({len(matched)}건)", ""]

            if matched:
                for n in matched[:10]:
                    lines.append(_format_notice_item(n))
            else:
                lines.append("해당 조건에 맞는 공지가 없습니다.")
                if unread_only:
                    lines.append("")
                    lines.append(
                        '💡 모든 미읽음 공지를 확인하려면 "미읽음 공지 전체"라고 물어보세요.'
                    )

            return "\n".join(lines)

        # ── NOTICE_ACTION_REQUIRED ──
        if intent == "NOTICE_ACTION_REQUIRED":
            lines = []
            action_notices = notice_snapshot.get("action_required_notices") or []
            lines.append(f"⚡ **즉시 조치 필요 공지** ({len(action_notices)}건)")
            lines.append("")
            if action_notices:
                for n in action_notices[:8]:
                    lines.append(_format_notice_item(n))
            else:
                urgent_notices = notice_snapshot.get("urgent_notices") or []
                if urgent_notices:
                    lines.append(
                        "조치 필요 태그가 있는 공지는 없지만, 긴급 공지가 있습니다:"
                    )
                    lines.append("")
                    for n in urgent_notices[:5]:
                        lines.append(_format_notice_item(n))
                else:
                    lines.append("현재 즉시 조치가 필요한 공지가 없습니다. ✅")
            return "\n".join(lines)

        # Fallback
        return "공지 정보를 처리 중입니다. 잠시 후 다시 시도해주세요."

    @staticmethod
    def _build_notice_suggested_questions(
        notice_snapshot: dict,
        intent: str,
    ) -> list[dict]:
        """Build notice-specific suggested questions based on the current notice state."""
        suggestions = []
        urgent = notice_snapshot.get("urgent_count", 0)
        unread = notice_snapshot.get("unread_count", 0)
        action_required = notice_snapshot.get("action_required_count", 0)
        promo = notice_snapshot.get("promo_count", 0)
        hygiene = len(notice_snapshot.get("hygiene_notices") or [])
        price = len(notice_snapshot.get("price_notices") or [])

        if urgent > 0:
            suggestions.append(
                {
                    "text": f"긴급 공지 {urgent}건 요약해줘",
                    "source": "notice",
                    "reason": "urgent_notice",
                }
            )
        if unread > 0:
            suggestions.append(
                {
                    "text": f"미읽음 공지 {unread}건 중 중요한 것만",
                    "source": "notice",
                    "reason": "unread_notice",
                }
            )
        if action_required > 0:
            suggestions.append(
                {
                    "text": f"⚡ 조치 필요 공지 {action_required}건 보여줘",
                    "source": "notice",
                    "reason": "action_required",
                }
            )
        if price > 0:
            suggestions.append(
                {
                    "text": "가격 인상 공지 핵심만 알려줘",
                    "source": "notice",
                    "reason": "price_notice",
                }
            )
        if hygiene > 0:
            suggestions.append(
                {
                    "text": "위생점검 관련 공지 확인사항",
                    "source": "notice",
                    "reason": "hygiene_notice",
                }
            )
        if promo > 0:
            suggestions.append(
                {
                    "text": "프로모션 공지 점주 영향 있는 것만",
                    "source": "notice",
                    "reason": "promo_notice",
                }
            )

        return suggestions[:4]


def _format_notice_item(n: dict) -> str:
    """Format a single notice item into a readable string."""
    title = n.get("title", "")
    date = n.get("date", "")
    category = n.get("category", "")
    action_required = n.get("actionRequired", False)
    summary = n.get("summary", "")
    impact = n.get("impact", "")
    action_items = n.get("actionItems") or []

    parts = []
    prefix = ""
    if action_required:
        prefix = "⚡ "
    elif n.get("unread", False):
        prefix = "🔵 "
    elif n.get("tag") in ("urgent", "긴급") or "긴급" in title:
        prefix = "🚨 "

    header = f"{prefix}[{date}] {title}"
    if category:
        header += f" [{category}]"
    parts.append(header)

    if summary:
        parts.append(f"   요약: {summary}")
    if impact:
        parts.append(f"   영향: {impact}")
    if action_items:
        parts.append(f"   조치: {', '.join(action_items[:3])}")

    return "\n".join(parts)
