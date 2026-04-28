"""Unified chat API router."""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.db.session import is_postgres_mode
from app.dependencies import (
    get_agent_router,
    get_chat_service,
    get_current_user_context,
    get_current_user_role,
    get_request_store_id,
)
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.common import APIResponse
from app.services.chat_trace import add_elapsed, new_trace, response_trace, set_field

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])
logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("uvicorn.error")
settings = get_settings()


def _extract_answer(result: ChatResponse) -> str:
    if result.response_type == "text" and isinstance(result.content, str):
        return result.content
    # Use metadata.answer if explicitly set (covers alert_card/order_card with text summary)
    metadata_answer = (result.metadata or {}).get("answer")
    if metadata_answer and isinstance(metadata_answer, str) and len(metadata_answer) > 5:
        return metadata_answer
    if result.response_type == "alert_card" and isinstance(result.content, list):
        count = len(result.content)
        return (
            "현재 확인된 경고가 없습니다."
            if count == 0
            else f"{count}개의 경고를 확인했습니다."
        )
    if result.response_type == "order_card" and isinstance(result.content, dict):
        # Use structured summary from metadata if available
        order_summary = (
            result.metadata.get("order_summary") if result.metadata else None
        )
        if order_summary and isinstance(order_summary, str) and len(order_summary) > 10:
            return order_summary
        # Fallback: build summary from order data
        options = result.content.get("options") or []
        first = options[0] if options else None
        if first:
            top_items = (first.get("items") or [])[:3]
            item_lines = [
                f"  • {it.get('product_name', '?')}: {it.get('quantity', 0)}개"
                for it in top_items
            ]
            extra = max(0, len(first.get("items") or []) - 3)
            extra_text = f"\n  … 외 {extra}종" if extra > 0 else ""
            deviation = first.get("deviation_label", "")
            label = first.get("label", "")
            return (
                f" {label}\n"
                f"  • 품목 {len(first.get('items') or [])}종, 총 {first.get('total_qty', 0)}개\n"
                f"  • {deviation}\n"
                f" 대표 품목:\n"
                + "\n".join(item_lines)
                + extra_text
                + f"\n 근거: 최근 동요일 주문 패턴 (실제 주문 데이터)"
            )
        return f"{len(options)}개의 주문 추천 옵션을 준비했습니다."
    if result.response_type == "insight_card" and isinstance(result.content, dict):
        sections = result.content.get("sections") or []
        llm_fallback = "자동 인사이트 생성에 실패해 정형 결과만 제공합니다."
        for section in sections:
            text = section.get("text")
            if text and str(text).strip() and str(text).strip() != llm_fallback:
                return str(text)
        for section in sections:
            text = section.get("text")
            if text:
                return str(text)
        return str(result.content.get("title") or "분석 결과를 정리했습니다.")
    if isinstance(result.content, str):
        return result.content
    return "요청을 처리했습니다."


def _legacy_tools_used(result: ChatResponse) -> list[str]:
    if result.agent == "order":
        return ["get_order_history"]
    if result.agent == "production":
        return ["get_current_inventory"]
    if result.agent == "actions":
        return ["get_action_todos"]
    if result.agent == "sales":
        return ["compare_sales"]
    return []


def _legacy_action_cards(result: ChatResponse, answer: str) -> list[dict[str, Any]]:
    metadata_cards = result.metadata.get("action_cards")
    if isinstance(metadata_cards, list) and metadata_cards:
        return metadata_cards

    if result.response_type != "order_card" or not isinstance(result.content, dict):
        return []
    options = result.content.get("options") or []
    if not options:
        return []
    first_option = options[0]
    items = first_option.get("items") or []
    if not items:
        return []
    return [
        {
            "card_type": "order_recommendation",
            "title": first_option.get("label") or "추천 발주안",
            "body": answer,
            "actions": [
                {
                    "label": "이대로 발주",
                    "action_type": "order_confirm",
                    "api_endpoint": "/api/order/confirm",
                    "params": {"items": items},
                },
                {
                    "label": "발주 화면 열기",
                    "action_type": "navigate",
                    "api_endpoint": "/orders",
                    "params": {"route": "/orders"},
                },
            ],
        }
    ]


def _to_legacy_chat_payload(
    result: ChatResponse, latency_ms: int, include_diagnostics: bool = False
) -> dict[str, Any]:
    answer = _extract_answer(result)
    action_cards = _legacy_action_cards(result, answer)
    tools_used = _legacy_tools_used(result)
    path = str(result.metadata.get("intent") or result.agent)
    sub_intent = result.metadata.get("sub_intent")
    suggested_questions = (
        result.metadata.get("suggested_questions")
        if isinstance(result.metadata.get("suggested_questions"), list)
        else []
    )
    used_llm = bool(result.metadata.get("used_llm"))
    fallback = not used_llm

    # Build base metadata
    metadata: dict[str, Any] = {
        "answer": answer,
        "action_cards": action_cards,
        "tools_used": tools_used,
        "path": path,
        "sub_intent": sub_intent,
        "intent_confidence": result.metadata.get("classification_confidence"),
        "resolved_query": result.metadata.get("resolved_query"),
        "suggested_questions": suggested_questions,
        "used_llm": used_llm,
        "fallback": fallback,
        "settings": result.metadata.get("settings"),
        "settings_data_mode": result.metadata.get("settings_data_mode"),
        "settings_persisted": result.metadata.get("settings_persisted"),
        "settings_error": result.metadata.get("settings_error"),
        "settings_operation": result.metadata.get("settings_operation"),
    }

    # Add diagnostic fields in dev/debug mode
    if include_diagnostics:
        metadata["query_mode"] = result.metadata.get("query_mode")
        metadata["todo_snapshot"] = result.metadata.get("todo_snapshot")

    return {
        "answer": answer,
        "action_cards": action_cards,
        "suggested_questions": suggested_questions,
        "tools_used": tools_used,
        "path": path,
        "sub_intent": sub_intent,
        "intent_confidence": result.metadata.get("classification_confidence"),
        "resolved_query": result.metadata.get("resolved_query"),
        "latency_ms": latency_ms,
        "token_usage": int(result.metadata.get("llm_tokens_used") or 0),
        "session_id": result.session_id,
        "used_llm": used_llm,
        "fallback": fallback,
        "settings": result.metadata.get("settings"),
        "settings_data_mode": result.metadata.get("settings_data_mode"),
        "settings_persisted": result.metadata.get("settings_persisted"),
        "settings_error": result.metadata.get("settings_error"),
        "settings_operation": result.metadata.get("settings_operation"),
        "metadata": metadata,
    }


def _is_trace_enabled(request: Request) -> bool:
    app_env = str(settings.app_env or "").lower()
    if app_env in {"development", "dev", "local"}:
        return True
    if bool(settings.chat_trace_enabled):
        return True
    if request.headers.get("X-Debug-Trace", "").lower() in {"1", "true", "yes", "on"}:
        return True
    if request.query_params.get("debug_trace", "").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return True
    return False


async def _persist_turn_background(
    *,
    chat_service,
    session_id: str,
    store_id: str,
    user_id: str,
    request_text: str,
    request_context: dict[str, Any],
    assistant_payload: dict[str, Any],
) -> None:
    try:
        await chat_service.persist_turn(
            session_id=session_id,
            store_id=store_id,
            user_id=user_id,
            request_text=request_text,
            request_context=request_context,
            assistant_payload=assistant_payload,
            trace=None,
        )
    except Exception:
        logger.exception("chat.persist_turn background write failed")


async def _handle_chat(
    req: ChatRequest,
    request: Request,
    role: str,
    agent_router,
    chat_service,
) -> tuple[ChatResponse, dict[str, Any]]:
    user = get_current_user_context(request, role)
    store_id = get_request_store_id(request, req.store_id)
    total_started_at = perf_counter()
    trace = new_trace(
        store_id=store_id,
        session_id=req.session_id,
        current_page=str((req.context or {}).get("current_page") or ""),
        page_key=str((req.context or {}).get("page_key") or ""),
    )
    trace_enabled = _is_trace_enabled(request)

    recent_messages: list[dict] = []
    if req.session_id and is_postgres_mode():
        try:
            recent_messages = await chat_service.get_recent_messages(
                session_id=req.session_id,
                limit=6,
                trace=trace,
            )
        except Exception:
            recent_messages = []
    client_recent = (req.context or {}).get("recent_client_messages")
    if isinstance(client_recent, list):
        for item in client_recent[-6:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip().lower()
            content = str(item.get("content") or "").strip()
            if role == "ai":
                role = "assistant"
            if role not in {"user", "assistant"} or not content:
                continue
            recent_messages.append({"role": role, "content": content})
        recent_messages = recent_messages[-8:]

    route_started_at = perf_counter()
    result = await agent_router.route(
        store_id,
        req.message,
        req.session_id,
        context=req.context or {},
        recent_messages=recent_messages,
        user_id=user["user_id"],
        role=user["role"],
        trace=trace,
    )
    add_elapsed(trace, "route_ms", route_started_at)
    set_field(trace, "session_id", result.session_id)
    set_field(trace, "path", str(result.metadata.get("intent") or result.agent))
    set_field(trace, "sub_intent", result.metadata.get("sub_intent"))
    set_field(
        trace, "intent_confidence", result.metadata.get("classification_confidence")
    )

    response_map_started_at = perf_counter()
    legacy_payload = _to_legacy_chat_payload(
        result, 0, include_diagnostics=trace_enabled
    )
    add_elapsed(trace, "response_map_ms", response_map_started_at)

    if is_postgres_mode():
        asyncio.create_task(
            _persist_turn_background(
                chat_service=chat_service,
                session_id=result.session_id,
                store_id=store_id,
                user_id=user["user_id"],
                request_text=req.message,
                request_context=req.context or {},
                assistant_payload={
                    "content_text": legacy_payload["answer"],
                    "content_payload": result.content
                    if not isinstance(result.content, str)
                    else None,
                    "message_type": result.response_type,
                    "model_name": result.agent,
                    "raw_model_response": legacy_payload,
                    "token_usage": {"llm_tokens_used": legacy_payload["token_usage"]},
                    "extra_data": {"metadata": result.metadata},
                },
            )
        )

    add_elapsed(trace, "total_ms", total_started_at)
    trace_payload = response_trace(trace, include_calls=trace_enabled)
    legacy_payload["latency_ms"] = trace_payload.get(
        "total_ms", legacy_payload.get("latency_ms", 0)
    )
    if trace_enabled:
        result.metadata = dict(result.metadata or {})
        result.metadata["trace"] = trace_payload
        legacy_payload["metadata"] = dict(legacy_payload.get("metadata") or {})
        legacy_payload["metadata"]["trace"] = trace_payload

    trace_logger.info(
        json.dumps(
            {
                "event": "chat_trace",
                **response_trace(trace, include_calls=False),
            },
            ensure_ascii=False,
        )
    )

    return result, legacy_payload


@router.post("", response_model=APIResponse)
async def chat(
    req: ChatRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    agent_router=Depends(get_agent_router),
    chat_service=Depends(get_chat_service),
):
    """통합 채팅 엔드포인트."""
    result, _ = await _handle_chat(req, request, role, agent_router, chat_service)
    return APIResponse(data=result)


async def chat_legacy(
    req: ChatRequest,
    request: Request,
    role: str = Depends(get_current_user_role),
    agent_router=Depends(get_agent_router),
    chat_service=Depends(get_chat_service),
):
    """Legacy `/api/chat` response shape used by the current frontend."""

    _, legacy_payload = await _handle_chat(
        req, request, role, agent_router, chat_service
    )
    return legacy_payload
