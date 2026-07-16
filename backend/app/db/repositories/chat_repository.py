"""Repositories for chat session and message persistence."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db.base import ChatRole, utc_now
from app.db.repositories.base import RepositoryBase
from app.models import ChatMessage, ChatSession


class ChatRepository(RepositoryBase):
    """Persistence helpers for chat sessions and message history."""

    async def get_or_create_session(
        self,
        *,
        session_id: str,
        store_id: str,
        user_id: str | None = None,
        route_path: str | None = None,
        page_key: str | None = None,
        title: str | None = None,
        context_payload: dict[str, Any] | None = None,
    ) -> ChatSession:
        await self.ensure_store(store_id)
        await self.ensure_user(user_id, store_id=store_id)
        stmt = select(ChatSession).where(ChatSession.session_id == session_id)
        existing = await self.session.scalar(stmt)
        if existing is not None:
            existing.user_id = user_id or existing.user_id
            existing.route_path = route_path or existing.route_path
            existing.page_key = page_key or existing.page_key
            existing.title = title or existing.title
            if context_payload:
                merged = dict(existing.context_payload or {})
                merged.update(context_payload)
                existing.context_payload = merged
            existing.last_message_at = utc_now()
            return existing

        now = utc_now()
        chat_session = ChatSession(
            session_id=session_id,
            store_id=store_id,
            user_id=user_id,
            route_path=route_path,
            page_key=page_key,
            title=title,
            context_payload=context_payload or {},
            started_at=now,
            last_message_at=now,
            extra_data={},
        )
        self.session.add(chat_session)
        try:
            await self.session.flush()
            return chat_session
        except IntegrityError:
            # Another request inserted the same session_id concurrently.
            await self.session.rollback()
            existing_after_race = await self.session.scalar(stmt)
            if existing_after_race is None:
                raise
            existing_after_race.user_id = user_id or existing_after_race.user_id
            existing_after_race.route_path = route_path or existing_after_race.route_path
            existing_after_race.page_key = page_key or existing_after_race.page_key
            existing_after_race.title = title or existing_after_race.title
            if context_payload:
                merged = dict(existing_after_race.context_payload or {})
                merged.update(context_payload)
                existing_after_race.context_payload = merged
            existing_after_race.last_message_at = utc_now()
            return existing_after_race

    async def append_message(
        self,
        *,
        session_id: str,
        role: ChatRole,
        content_text: str | None = None,
        content_payload: dict[str, Any] | None = None,
        message_type: str | None = None,
        user_id: str | None = None,
        tool_name: str | None = None,
        tool_call_id: str | None = None,
        model_name: str | None = None,
        request_context: dict[str, Any] | None = None,
        raw_model_response: dict[str, Any] | None = None,
        token_usage: dict[str, Any] | None = None,
        extra_data: dict[str, Any] | None = None,
    ) -> ChatMessage:
        session_stmt = select(ChatSession).where(ChatSession.session_id == session_id)
        chat_session = await self.session.scalar(session_stmt)
        if chat_session is None:
            raise ValueError(f"Chat session not found: {session_id}")
        await self.ensure_user(user_id, store_id=chat_session.store_id)

        order_stmt = select(func.coalesce(func.max(ChatMessage.message_order), 0)).where(
            ChatMessage.chat_session_id == chat_session.id
        )
        next_order = int((await self.session.scalar(order_stmt)) or 0) + 1
        now = utc_now()

        message = ChatMessage(
            chat_session_id=chat_session.id,
            user_id=user_id,
            role=role,
            message_order=next_order,
            content_text=content_text,
            content_payload=content_payload,
            message_type=message_type,
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            model_name=model_name,
            request_context=request_context or {},
            raw_model_response=raw_model_response,
            token_usage=token_usage or {},
            extra_data=extra_data or {},
        )
        chat_session.last_message_at = now
        self.session.add(message)
        await self.session.flush()
        return message

    async def list_messages_by_session(self, session_id: str, *, limit: int = 100) -> list[ChatMessage]:
        session_stmt = select(ChatSession.id).where(ChatSession.session_id == session_id)
        chat_session_id = await self.session.scalar(session_stmt)
        if chat_session_id is None:
            return []
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.chat_session_id == chat_session_id)
            .order_by(ChatMessage.message_order.asc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def list_messages(self, session_id: str, *, limit: int = 100) -> list[ChatMessage]:
        return await self.list_messages_by_session(session_id, limit=limit)
