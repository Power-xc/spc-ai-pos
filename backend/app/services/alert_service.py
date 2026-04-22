"""Database-backed alert persistence service."""

from __future__ import annotations

from datetime import UTC, datetime

from app.db.base import AlertEventType
from app.db.repositories import AlertRepository
from app.db.session import get_session_factory
from app.demo_store_config import canonical_store_name, is_hidden_store_id
from app.models import Store


class AlertService:
    """Connection point for alert persistence plus optional SSE fan-out."""

    def __init__(self, session_factory=None, notification_service=None) -> None:
        self.session_factory = session_factory or get_session_factory()
        self.notification_service = notification_service

    async def list_active_alerts(self, store_id: str, *, limit: int = 20):
        async with self.session_factory() as session:
            repo = AlertRepository(session)
            alerts = await repo.list_active_alerts(store_id, limit=limit)
            return sorted(
                alerts,
                key=lambda alert: (
                    0 if alert.read_at is None else 1,
                    -self._severity_rank(alert.severity.value),
                    -(alert.occurred_at or alert.created_at).timestamp(),
                ),
            )

    async def get_store_name(self, store_id: str) -> str:
        if is_hidden_store_id(store_id):
            return "시연 제외 점포"
        async with self.session_factory() as session:
            store = await session.get(Store, store_id)
            return canonical_store_name(store_id, store.store_name if store is not None else store_id)

    async def list_alert_cards(self, store_id: str, *, limit: int = 20) -> list[dict]:
        alerts = await self.list_active_alerts(store_id, limit=limit)
        return [self._to_alert_card(alert) for alert in alerts]

    async def list_legacy_modals(self, store_id: str, *, limit: int = 20) -> list[dict]:
        alerts = await self.list_active_alerts(store_id, limit=limit)
        return [self._to_legacy_modal(alert) for alert in alerts]

    async def create_and_publish(self, *, publish_event_type: str = "alert", **kwargs):
        """Future router/agent hook: persist alert state, log event, then push SSE."""

        async with self.session_factory() as session:
            repo = AlertRepository(session)
            alert = await repo.create_alert(**kwargs)
            await repo.append_alert_event(
                alert_id=alert.id,
                store_id=alert.store_id,
                event_type=AlertEventType.CREATED,
                details=alert.payload,
            )
            await session.commit()
            await session.refresh(alert)

        if self.notification_service is not None:
            await self.notification_service.publish(
                alert.store_id,
                publish_event_type,
                {
                    "id": str(alert.id),
                    "severity": alert.severity.value,
                    "source": alert.source.value,
                    "title": alert.title,
                    "summary": alert.summary,
                    "message": alert.message,
                    "cta_action": alert.cta_action,
                    "cta_label": alert.cta_label,
                    "cta_route": alert.cta_route,
                    "occurred_at": alert.occurred_at.isoformat(),
                    "payload": alert.payload,
                },
            )
        return alert

    @staticmethod
    def _severity_rank(severity: str) -> int:
        return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(str(severity).lower(), 0)

    @staticmethod
    def _card_type(source: str) -> str:
        mapping = {
            "inventory_agent": "production",
            "order_agent": "order",
            "sales_agent": "sales",
            "chat_agent": "sales",
        }
        return mapping.get(source, "sales")

    @staticmethod
    def _modal_type(source: str) -> str:
        mapping = {
            "inventory_agent": "production_alert",
            "order_agent": "order_deadline",
            "sales_agent": "anomaly_sales",
            "chat_agent": "anomaly_sales",
        }
        return mapping.get(source, "anomaly_sales")

    @staticmethod
    def _legacy_severity(severity: str) -> str:
        mapping = {"critical": "critical", "high": "warning", "medium": "warning", "low": "info"}
        return mapping.get(str(severity).lower(), "info")

    @staticmethod
    def _timestamp(value: datetime | None) -> str:
        return (value or datetime.now(UTC)).isoformat()

    @classmethod
    def _to_alert_card(cls, alert) -> dict:
        return {
            "id": str(alert.id),
            "severity": str(alert.severity.value).upper(),
            "type": cls._card_type(alert.source.value),
            "warning_kind": cls._warning_kind(alert.source.value, alert.title),
            "warning_mode": "actual",
            "title": alert.title,
            "subtitle": (alert.payload or {}).get("subtitle"),
            "message": alert.message or alert.summary,
            "cta": (
                {
                    "label": alert.cta_label,
                    "action": alert.cta_action,
                    "route": alert.cta_route,
                }
                if alert.cta_label or alert.cta_action or alert.cta_route
                else None
            ),
            "created_at": cls._timestamp(alert.occurred_at),
            "read": alert.read_at is not None,
        }

    @classmethod
    def _to_legacy_modal(cls, alert) -> dict:
        return {
            "modal_id": str(alert.id),
            "modal_type": cls._modal_type(alert.source.value),
            "severity": cls._legacy_severity(alert.severity.value),
            "title": alert.title,
            "body": alert.message or alert.summary,
            "data": {
                **(alert.payload or {}),
                "warning_kind": cls._warning_kind(alert.source.value, alert.title),
                "warning_mode": "actual",
            },
            "actions": (
                [
                    {
                        "label": alert.cta_label or "상세 보기",
                        "action_type": alert.cta_action or "modify",
                        "api_endpoint": alert.cta_route or "/alerts",
                        "params": alert.payload or {},
                    }
                ]
                if alert.cta_label or alert.cta_action or alert.cta_route
                else []
            ),
            "created_at": cls._timestamp(alert.occurred_at),
            "expires_at": cls._timestamp(alert.resolved_at or alert.dismissed_at or alert.occurred_at),
            "net_profit_impact": (alert.payload or {}).get("net_profit_impact"),
        }

    @staticmethod
    def _warning_kind(source: str, title: str | None) -> str:
        if source == "inventory_agent":
            return "소진 속도 경보"
        if source == "order_agent":
            return "제조 준비 필요"
        title_value = str(title or "")
        if "혼잡" in title_value or "피크" in title_value:
            return "혼잡/피크 경보"
        return "품절 대응 경보"
