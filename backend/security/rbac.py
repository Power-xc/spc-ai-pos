"""Role-based access helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Header, HTTPException, Request

from core.schemas import StoreContext


async def get_current_user(
    request: Request,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    x_store_id: str | None = Header(default=None, alias="X-Store-Id"),
) -> StoreContext:
    """Build StoreContext from request headers."""

    x_user_id = x_user_id or request.query_params.get("user_id")
    x_user_role = x_user_role or request.query_params.get("role")
    x_store_id = x_store_id or request.query_params.get("store_id")

    if not x_user_id or not x_user_role or not x_store_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id/X-User-Role/X-Store-Id")
    bindings = getattr(request.app.state, "user_store_bindings", {})
    bound_store = bindings.get((x_user_role, x_user_id))
    if x_user_role == "store_owner" and bound_store and bound_store != x_store_id:
        raise HTTPException(status_code=403, detail="Other store access blocked")
    return StoreContext(
        store_id=x_store_id,
        user_id=x_user_id,
        role=x_user_role,
        current_time=datetime.now(UTC),
    )
