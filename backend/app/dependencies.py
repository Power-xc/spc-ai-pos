"""Shared FastAPI dependency helpers."""

import base64
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import HTTPException, Request

from app.agents.order_agent import OrderAgent
from app.agents.production_agent import ProductionAgent
from app.agents.sales_agent import SalesAnalysisAgent
from app.orchestration.router import AgentRouter
from app.security.audit import AuditLogger
from app.security.masking import DataMaskingService
from app.services.alert_service import AlertService
from app.services.actions_todo_service import ActionsTodoService
from app.services.chat_service import ChatService
from app.services.dashboard_service import DashboardService
from app.services.notification import NotificationService
from app.services.order_service import OrderService
from app.demo_store_config import is_hidden_store_id, normalize_store_id

VALID_ROLES = {"store_owner", "area_manager", "hq_admin"}


def get_production_agent(request: Request) -> ProductionAgent:
    """Return the shared production agent from app state."""
    return request.app.state.production_agent


def get_order_agent(request: Request) -> OrderAgent:
    """Return the shared order agent from app state."""
    return request.app.state.order_agent


def get_sales_agent(request: Request) -> SalesAnalysisAgent:
    """Return the shared sales agent from app state."""
    return request.app.state.sales_agent


def get_agent_router(request: Request) -> AgentRouter:
    """Return the unified agent router from app state."""
    return request.app.state.agent_router


def get_notification_service(request: Request) -> NotificationService:
    """Return the notification service from app state."""
    return request.app.state.notification_service


def get_alert_service(request: Request) -> AlertService:
    """Return the DB-backed alert persistence service."""
    return request.app.state.alert_service


def get_actions_todo_service(request: Request) -> ActionsTodoService:
    """Return the actions/todo read+update service."""
    return request.app.state.actions_todo_service


def get_order_service(request: Request) -> OrderService:
    """Return the DB-backed order persistence service."""
    return request.app.state.order_service


def get_dashboard_service(request: Request) -> DashboardService:
    """Return the DB-backed dashboard query service."""
    return request.app.state.dashboard_service


def get_chat_service(request: Request) -> ChatService:
    """Return the DB-backed chat persistence service."""
    return request.app.state.chat_service


def get_request_store_id(request: Request, explicit_store_id: str | None = None) -> str:
    """Resolve store_id from body, query, or legacy `X-Store-Id` header."""

    resolved = (
        explicit_store_id
        or request.query_params.get("store_id")
        or request.headers.get("X-Store-Id")
    )
    if not resolved:
        raise HTTPException(status_code=400, detail="store_id is required")
    normalized = normalize_store_id(resolved)
    if is_hidden_store_id(normalized):
        raise HTTPException(status_code=404, detail="Store not found")
    return normalized


def get_audit_logger(request: Request) -> AuditLogger:
    """Return the shared audit logger from app state."""
    return request.app.state.audit_logger


def get_masking_service(request: Request) -> DataMaskingService:
    """Return the shared masking service from app state."""
    return request.app.state.masking_service


def _decode_jwt_claims(token: str) -> dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return {}


def get_current_user_role(request: Request) -> str:
    """Extract the caller role from headers or a JWT payload."""
    role = request.headers.get("X-User-Role") or request.query_params.get("role")
    if not role:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            claims = _decode_jwt_claims(auth_header.split(" ", 1)[1].strip())
            role = claims.get("role") or claims.get("user_role")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=403, detail="Forbidden: valid role required")
    return str(role)


def get_current_user_context(request: Request, role: str = None) -> dict[str, str]:
    """Return normalized user context for audit and masking."""
    resolved_role = role or get_current_user_role(request)
    user_id = request.headers.get("X-User-Id") or request.query_params.get("user_id")
    if not user_id:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            claims = _decode_jwt_claims(auth_header.split(" ", 1)[1].strip())
            user_id = claims.get("sub") or claims.get("user_id")
    return {"user_id": user_id or "anonymous", "role": resolved_role}


async def get_db(request: Request) -> AsyncGenerator[Any, None]:
    """Yield an async database session from the shared session factory."""
    session_factory = getattr(
        request.app.state,
        "analytics_session_factory",
        request.app.state.db_session_factory,
    )
    async with session_factory() as session:
        yield session


async def get_postgres_db(request: Request) -> AsyncGenerator[Any, None]:
    """Yield the primary DB session factory instead of the file-backed analytics factory."""

    session_factory = request.app.state.db_session_factory
    async with session_factory() as session:
        yield session
