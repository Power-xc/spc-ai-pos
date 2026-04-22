"""Repository for `/actions` todo read/update paths."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.db.base import AlertEventType, AlertStatus, utc_now
from app.db.repositories.base import RepositoryBase
from app.models import Alert, AlertEvent


class ActionsTodoRepository(RepositoryBase):
    """Read/update helpers backed by the alerts ledger."""

    _PENDING_STATUSES = (
        AlertStatus.OPEN,
        AlertStatus.READ,
        AlertStatus.ACKNOWLEDGED,
    )

    async def list_todos(
        self,
        *,
        store_id: str,
        status_mode: str = "pending_only",
        limit: int = 20,
    ) -> list[Alert]:
        stmt = select(Alert).where(Alert.store_id == store_id)

        if status_mode == "completed_only":
            stmt = stmt.where(Alert.status == AlertStatus.RESOLVED)
        elif status_mode == "on_hold_only":
            stmt = stmt.where(Alert.status == AlertStatus.DISMISSED)
        elif status_mode == "pending_only":
            stmt = stmt.where(Alert.status.in_(self._PENDING_STATUSES))
        elif status_mode == "incomplete_only":
            stmt = stmt.where(Alert.status != AlertStatus.RESOLVED)

        stmt = stmt.order_by(Alert.occurred_at.desc()).limit(limit)
        return list((await self.session.scalars(stmt)).all())

    async def complete_todo(
        self,
        *,
        store_id: str,
        todo_id: uuid.UUID,
        actor_user_id: str | None = None,
    ) -> Alert:
        alert = await self.session.get(Alert, todo_id)
        if alert is None or alert.store_id != store_id:
            raise ValueError(f"Todo not found: {todo_id}")

        await self.ensure_user(actor_user_id, store_id=store_id)
        previous_status = alert.status
        now = utc_now()

        alert.read_at = alert.read_at or now
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = now

        self.session.add(
            AlertEvent(
                alert_id=alert.id,
                store_id=store_id,
                actor_user_id=actor_user_id,
                event_type=AlertEventType.RESOLVED,
                from_status=previous_status,
                to_status=AlertStatus.RESOLVED,
                event_at=now,
                details={"channel": "actions_todo"},
            )
        )
        await self.session.flush()
        return alert

    async def hold_todo(
        self,
        *,
        store_id: str,
        todo_id: uuid.UUID,
        actor_user_id: str | None = None,
    ) -> Alert:
        alert = await self.session.get(Alert, todo_id)
        if alert is None or alert.store_id != store_id:
            raise ValueError(f"Todo not found: {todo_id}")

        await self.ensure_user(actor_user_id, store_id=store_id)
        previous_status = alert.status
        now = utc_now()

        alert.read_at = alert.read_at or now
        alert.status = AlertStatus.DISMISSED
        alert.dismissed_at = now

        self.session.add(
            AlertEvent(
                alert_id=alert.id,
                store_id=store_id,
                actor_user_id=actor_user_id,
                event_type=AlertEventType.DISMISSED,
                from_status=previous_status,
                to_status=AlertStatus.DISMISSED,
                event_at=now,
                details={"channel": "actions_todo"},
            )
        )
        await self.session.flush()
        return alert
