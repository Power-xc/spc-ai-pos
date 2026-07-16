"""Database-backed chat persistence service."""

from __future__ import annotations

from time import perf_counter

from app.db.base import ChatRole
from app.db.repositories import ChatRepository
from app.db.session import get_session_factory, is_postgres_mode
from app.services.chat_trace import add_elapsed, add_ms


class ChatService:
    """Connection point for chat session and message persistence."""

    def __init__(self, session_factory=None) -> None:
        self.session_factory = session_factory or get_session_factory()

    async def ensure_session(
        self,
        *,
        session_id: str,
        store_id: str,
        user_id: str | None = None,
        route_path: str | None = None,
        page_key: str | None = None,
        title: str | None = None,
        context_payload: dict | None = None,
    ):
        """Future router hook: upsert chat_sessions from session_id/context."""

        async with self.session_factory() as session:
            repo = ChatRepository(session)
            chat_session = await repo.get_or_create_session(
                session_id=session_id,
                store_id=store_id,
                user_id=user_id,
                route_path=route_path,
                page_key=page_key,
                title=title,
                context_payload=context_payload,
            )
            await session.commit()
            await session.refresh(chat_session)
            return chat_session

    async def persist_turn(
        self,
        *,
        session_id: str,
        store_id: str,
        user_id: str | None,
        request_text: str,
        request_context: dict | None = None,
        assistant_payload: dict | None = None,
        trace: dict | None = None,
    ):
        """Future router hook: persist user turn and assistant reply in one transaction."""
        started_at = perf_counter()
        try:
            async with self.session_factory() as session:
                repo = ChatRepository(session)
                await repo.get_or_create_session(
                    session_id=session_id,
                    store_id=store_id,
                    user_id=user_id,
                    route_path=(request_context or {}).get("current_page"),
                    page_key=(request_context or {}).get("page_context"),
                    context_payload=request_context,
                )
                user_message = await repo.append_message(
                    session_id=session_id,
                    role=ChatRole.USER,
                    content_text=request_text,
                    user_id=user_id,
                    request_context=request_context,
                )
                assistant_message = None
                if assistant_payload is not None:
                    assistant_message = await repo.append_message(
                        session_id=session_id,
                        role=ChatRole.ASSISTANT,
                        content_text=assistant_payload.get("content_text"),
                        content_payload=assistant_payload.get("content_payload"),
                        message_type=assistant_payload.get("message_type"),
                        model_name=assistant_payload.get("model_name"),
                        request_context=request_context,
                        raw_model_response=assistant_payload.get("raw_model_response"),
                        token_usage=assistant_payload.get("token_usage"),
                        extra_data=assistant_payload.get("extra_data"),
                    )
                await session.commit()
                return {"user_message": user_message, "assistant_message": assistant_message}
        finally:
            add_elapsed(trace, "db_ms", started_at)

    async def get_recent_messages(
        self,
        *,
        session_id: str | None,
        limit: int = 6,
        trace: dict | None = None,
    ) -> list[dict]:
        """Return recent persisted messages for lightweight context carryover."""

        if not session_id or not is_postgres_mode():
            return []

        started_at = perf_counter()
        try:
            async with self.session_factory() as session:
                repo = ChatRepository(session)
                rows = await repo.list_messages(session_id, limit=max(limit, 1))
        finally:
            elapsed = add_elapsed(trace, "recent_messages_ms", started_at)
            add_ms(trace, "db_ms", elapsed)

        normalized: list[dict] = []
        for row in rows[-limit:]:
            role = row.role.value if hasattr(row.role, "value") else str(row.role)
            intent = None
            if isinstance(row.raw_model_response, dict):
                raw_path = row.raw_model_response.get("path")
                intent = str(raw_path) if raw_path else None
            normalized.append(
                {
                    "role": role,
                    "content": row.content_text or "",
                    "intent": intent,
                    "message_type": row.message_type,
                }
            )
        return normalized
