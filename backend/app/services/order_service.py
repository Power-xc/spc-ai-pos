"""Database-backed order persistence service."""

from __future__ import annotations

from typing import Any

from app.db.session import get_session_factory
from app.db.repositories import OrderRepository


class OrderService:
    """Connection point for confirmOrder and recommendation snapshot persistence."""

    def __init__(self, session_factory=None) -> None:
        self.session_factory = session_factory or get_session_factory()

    async def persist_recommendation(self, **kwargs):
        """Future router hook: order options snapshot persistence."""

        async with self.session_factory() as session:
            repo = OrderRepository(session)
            recommendation = await repo.create_recommendation_snapshot(**kwargs)
            await session.commit()
            await session.refresh(recommendation)
            return recommendation

    async def confirm_order(
        self,
        *,
        store_id: str,
        items: list[dict[str, Any]],
        recommendation_id=None,
        client_draft_id: str | None = None,
        client_option_id: str | None = None,
        category: str | None = None,
        created_by: str | None = None,
        confirmed_by: str | None = None,
        context_payload: dict[str, Any] | None = None,
    ):
        """Future router hook: `/api/v1/orders/confirm` write path."""

        async with self.session_factory() as session:
            repo = OrderRepository(session)
            order = await repo.create_order(
                store_id=store_id,
                items=items,
                recommendation_id=recommendation_id,
                client_draft_id=client_draft_id,
                client_option_id=client_option_id,
                category=category,
                created_by=created_by,
                confirmed_by=confirmed_by,
                context_payload=context_payload,
            )
            await session.commit()
            await session.refresh(order)
            return order
