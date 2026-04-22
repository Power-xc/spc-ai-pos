"""Repositories for alert state and alert event history."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select

from app.db.base import AlertEventType, AlertSeverity, AlertSource, AlertStatus, utc_now
from app.db.repositories.base import RepositoryBase
from app.models import Alert, AlertEvent


class AlertRepository(RepositoryBase):
    """Persistence helpers for current alerts and alert events."""

    async def create_alert(
        self,
        *,
        store_id: str,
        severity: AlertSeverity,
        source: AlertSource,
        title: str,
        summary: str,
        message: str | None = None,
        source_agent: str | None = None,
        related_entity_type: str | None = None,
        related_entity_id: str | None = None,
        cta_action: str | None = None,
        cta_label: str | None = None,
        cta_route: str | None = None,
        occurred_at=None,
        payload: dict[str, Any] | None = None,
    ) -> Alert:
        await self.ensure_store(store_id)
        alert = Alert(
            store_id=store_id,
            severity=severity,
            status=AlertStatus.OPEN,
            source=source,
            source_agent=source_agent,
            title=title,
            summary=summary,
            message=message,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            cta_action=cta_action,
            cta_label=cta_label,
            cta_route=cta_route,
            occurred_at=occurred_at or utc_now(),
            payload=payload or {},
        )
        self.session.add(alert)
        await self.session.flush()
        return alert

    async def append_alert_event(
        self,
        *,
        alert_id: uuid.UUID,
        store_id: str,
        event_type: AlertEventType,
        actor_user_id: str | None = None,
        from_status: AlertStatus | None = None,
        to_status: AlertStatus | None = None,
        details: dict[str, Any] | None = None,
        event_at=None,
    ) -> AlertEvent:
        await self.ensure_store(store_id)
        await self.ensure_user(actor_user_id, store_id=store_id)
        event = AlertEvent(
            alert_id=alert_id,
            store_id=store_id,
            actor_user_id=actor_user_id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            event_at=event_at or utc_now(),
            details=details or {},
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def add_event(self, **kwargs) -> AlertEvent:
        return await self.append_alert_event(**kwargs)

    async def list_active_alerts(
        self,
        store_id: str,
        *,
        include_resolved: bool = False,
        limit: int = 50,
    ) -> list[Alert]:
        stmt = select(Alert).where(Alert.store_id == store_id)
        if not include_resolved:
            stmt = stmt.where(Alert.status.not_in([AlertStatus.RESOLVED, AlertStatus.DISMISSED]))
        stmt = stmt.order_by(Alert.occurred_at.desc()).limit(limit)
        return list((await self.session.scalars(stmt)).all())

    async def list_current_alerts(
        self,
        store_id: str,
        *,
        include_resolved: bool = False,
        limit: int = 50,
    ) -> list[Alert]:
        return await self.list_active_alerts(
            store_id,
            include_resolved=include_resolved,
            limit=limit,
        )

    async def mark_alert_read(self, alert_id: uuid.UUID, *, actor_user_id: str | None = None) -> Alert:
        alert = await self.session.get(Alert, alert_id)
        if alert is None:
            raise ValueError(f"Alert not found: {alert_id}")
        previous_status = alert.status
        alert.read_at = alert.read_at or utc_now()
        if alert.status == AlertStatus.OPEN:
            alert.status = AlertStatus.READ
        await self.append_alert_event(
            alert_id=alert.id,
            store_id=alert.store_id,
            actor_user_id=actor_user_id,
            event_type=AlertEventType.READ,
            from_status=previous_status,
            to_status=alert.status,
            details={},
        )
        return alert

    async def mark_read(self, alert_id: uuid.UUID, *, actor_user_id: str | None = None) -> Alert:
        return await self.mark_alert_read(alert_id, actor_user_id=actor_user_id)
