"""Complex-natural-language chat API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.schemas.chat import ChatRequest
from app.config import get_settings
from security.prompt_guard import check_prompt_safety
from security.rbac import get_current_user

router = APIRouter()
settings = get_settings()


def _is_dev_or_debug(request: Request) -> bool:
    """Check if we're in dev mode or debug mode."""
    app_env = str(getattr(settings, "app_env", "production")).lower()
    if app_env in {"development", "dev", "local"}:
        return True
    if getattr(settings, "chat_trace_enabled", False):
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


@router.post("/api/chat")
async def chat(payload: ChatRequest, request: Request, user=Depends(get_current_user)):
    check_prompt_safety(payload.message)
    from core.schemas import StoreContext
    from datetime import UTC, datetime

    chat_context = StoreContext(
        store_id=user.store_id,
        user_id=user.user_id,
        role=user.role,
        current_time=user.current_time
        if hasattr(user, "current_time")
        else datetime.now(UTC),
    )
    response = await request.app.state.chat_agent.handle(payload.message, chat_context)

    # Add diagnostic fields in dev/debug mode if available in context
    if _is_dev_or_debug(request):
        # Convert to dict to add extra fields
        response_dict = {
            "answer": response.answer,
            "action_cards": response.action_cards,
            "tools_used": response.tools_used,
            "path": response.path,
            "latency_ms": response.latency_ms,
            "token_usage": response.token_usage,
        }

        # Add optional diagnostic fields from context if available
        ctx = payload.context or {}
        if ctx.get("sub_intent"):
            response_dict["sub_intent"] = ctx.get("sub_intent")
        if ctx.get("query_mode"):
            response_dict["query_mode"] = ctx.get("query_mode")
        if ctx.get("todo_snapshot"):
            response_dict["todo_snapshot"] = ctx.get("todo_snapshot")

        return response_dict

    return response
