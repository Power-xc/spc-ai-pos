"""Service for `/actions` todo read/update paths."""

from __future__ import annotations

import uuid

from app.db.base import AlertSeverity, AlertStatus
from app.db.repositories import ActionsTodoRepository
from app.db.session import get_session_factory


class ActionsTodoService:
    """Bridge chat/actions endpoints to alert-backed todo rows."""

    def __init__(self, session_factory=None) -> None:
        self.session_factory = session_factory or get_session_factory()

    async def list_todos(
        self,
        *,
        store_id: str,
        query_mode: str = "pending_only",
        limit: int = 20,
        user_id: str | None = None,
        role: str | None = None,
    ) -> list[dict]:
        del user_id, role  # reserved for policy filters in next round
        async with self.session_factory() as session:
            repo = ActionsTodoRepository(session)
            alerts = await repo.list_todos(
                store_id=store_id,
                status_mode=query_mode,
                limit=limit,
            )
        return [self._to_todo_item(alert) for alert in alerts]

    async def complete_todo(
        self,
        *,
        store_id: str,
        todo_id: str,
        actor_user_id: str | None = None,
    ) -> dict:
        async with self.session_factory() as session:
            repo = ActionsTodoRepository(session)
            alert = await repo.complete_todo(
                store_id=store_id,
                todo_id=uuid.UUID(todo_id),
                actor_user_id=actor_user_id,
            )
            await session.commit()
            await session.refresh(alert)
        return self._to_todo_item(alert)

    async def hold_todo(
        self,
        *,
        store_id: str,
        todo_id: str,
        actor_user_id: str | None = None,
    ) -> dict:
        async with self.session_factory() as session:
            repo = ActionsTodoRepository(session)
            alert = await repo.hold_todo(
                store_id=store_id,
                todo_id=uuid.UUID(todo_id),
                actor_user_id=actor_user_id,
            )
            await session.commit()
            await session.refresh(alert)
        return self._to_todo_item(alert)

    def build_action_cards(self, items: list[dict], *, include_complete: bool = True) -> list[dict]:
        cards: list[dict] = []
        for item in items[:3]:
            actions = []
            if include_complete and item.get("status") != "완료":
                actions.append(
                    {
                        "label": "완료 처리",
                        "action_type": "todo_complete",
                        "api_endpoint": f"/api/v1/actions/todos/{item['id']}/complete",
                        "params": {"todo_id": item["id"], "route": "/actions"},
                    }
                )
            if item.get("status") not in {"완료", "보류"}:
                actions.append(
                    {
                        "label": "보류",
                        "action_type": "todo_hold",
                        "api_endpoint": f"/api/v1/actions/todos/{item['id']}/hold",
                        "params": {"todo_id": item["id"], "route": "/actions"},
                    }
                )
            actions.append(
                {
                    "label": "지금 할일 보기",
                    "action_type": "navigate",
                    "api_endpoint": "/actions",
                    "params": {"route": "/actions"},
                }
            )
            cards.append(
                {
                    "card_type": "actions_todo",
                    "title": str(item.get("title") or "지금 할일"),
                    "body": str(item.get("summary") or item.get("status") or ""),
                    "actions": actions,
                }
            )
        return cards

    @staticmethod
    def _status_label(status: AlertStatus) -> str:
        if status == AlertStatus.RESOLVED:
            return "완료"
        if status == AlertStatus.DISMISSED:
            return "보류"
        if status in {AlertStatus.READ, AlertStatus.ACKNOWLEDGED}:
            return "실행중"
        return "대기"

    @staticmethod
    def _priority_label(severity: AlertSeverity) -> str:
        if severity in {AlertSeverity.CRITICAL, AlertSeverity.HIGH}:
            return "긴급"
        if severity == AlertSeverity.MEDIUM:
            return "중요"
        return "일반"

    @classmethod
    def _to_todo_item(cls, alert) -> dict:
        status_label = cls._status_label(alert.status)
        return {
            "id": str(alert.id),
            "title": alert.title,
            "summary": alert.message or alert.summary or "",
            "status": status_label,
            "priority": cls._priority_label(alert.severity),
            "source": alert.source.value,
            "route": alert.cta_route or "/actions",
            "occurred_at": alert.occurred_at.isoformat(),
        }
