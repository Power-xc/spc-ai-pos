"""Chat session and message models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, ChatRole, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin, enum_value_type


class ChatSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Persisted chat session keyed by the frontend session_id."""

    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_chat_sessions_store_last_message_at", "store_id", "last_message_at"),
        Index("ix_chat_sessions_user_last_message_at", "user_id", "last_message_at"),
    )

    session_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    route_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # TODO: page/action context contract is still evolving, keep this payload loose.
    context_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    store: Mapped["Store"] = relationship(back_populates="chat_sessions")
    user: Mapped["User | None"] = relationship(back_populates="chat_sessions")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.message_order",
    )


class ChatMessage(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Single persisted chat message or assistant reply."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("chat_session_id", "message_order", name="uq_chat_messages_chat_session_order"),
        Index("ix_chat_messages_chat_session_id", "chat_session_id"),
        Index("ix_chat_messages_role_created_at", "role", "created_at"),
    )

    chat_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id"),
        nullable=False,
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    role: Mapped[ChatRole] = mapped_column(enum_value_type(ChatRole), nullable=False)
    message_order: Mapped[int] = mapped_column(Integer, nullable=False)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    message_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_call_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # TODO: retention/masking policy for raw model payloads is not finalized yet.
    raw_model_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    token_usage: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
    user: Mapped["User | None"] = relationship(back_populates="chat_messages")
