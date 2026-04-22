"""Modal lifecycle management and SSE fan-out."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from core.schemas import Modal

SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


class NotificationHub:
    """SSE pub/sub keyed by store_id."""

    def __init__(self) -> None:
        self.subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, store_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self.subscribers[store_id].add(queue)
        return queue

    def unsubscribe(self, store_id: str, queue: asyncio.Queue) -> None:
        self.subscribers[store_id].discard(queue)

    async def publish(self, store_id: str, event: str, data: dict) -> None:
        for queue in list(self.subscribers[store_id]):
            await queue.put({"event": event, "data": data, "timestamp": datetime.now(UTC).isoformat()})


class ModalManager:
    """Create, deduplicate, resolve, and broadcast pending modals."""

    def __init__(self, notification_hub: NotificationHub, suppress_minutes: int, max_daily_modals: int) -> None:
        self.notification_hub = notification_hub
        self.suppress_minutes = suppress_minutes
        self.max_daily_modals = max_daily_modals
        self._modals: dict[str, dict] = {}
        self._recent_by_key: dict[str, datetime] = {}

    async def create_modal(self, store_id: str, dedup_key: str | None = None, expires_minutes: int = 60, **kwargs) -> Modal | None:
        now = datetime.now(UTC)
        if dedup_key:
            last = self._recent_by_key.get(dedup_key)
            if last and now - last < timedelta(minutes=self.suppress_minutes):
                return None
        today_count = sum(
            1
            for item in self._modals.values()
            if item["modal"].created_at.date() == now.date() and item["modal"].data.get("store_id") == store_id
        )
        if today_count >= self.max_daily_modals and kwargs.get("severity") != "critical":
            return None
        modal = Modal(
            modal_id=f"MDL-{uuid4().hex[:10]}",
            created_at=now,
            expires_at=now + timedelta(minutes=expires_minutes),
            data={"store_id": store_id, **kwargs.pop("data", {})},
            **kwargs,
        )
        self._modals[modal.modal_id] = {"modal": modal, "resolved": False, "dedup_key": dedup_key}
        if dedup_key:
            self._recent_by_key[dedup_key] = now
        await self.notification_hub.publish(store_id, "modal", modal.model_dump(mode="json"))
        return modal

    async def get_pending(self, store_id: str) -> list[Modal]:
        now = datetime.now(UTC)
        modals = [
            item["modal"]
            for item in self._modals.values()
            if not item["resolved"] and item["modal"].data.get("store_id") == store_id and item["modal"].expires_at > now
        ]
        return sorted(modals, key=lambda modal: (SEVERITY_ORDER.get(modal.severity, 9), modal.created_at))

    async def resolve(self, modal_id: str, action_type: str) -> None:
        if modal_id in self._modals:
            self._modals[modal_id]["resolved"] = True
            self._modals[modal_id]["resolved_action"] = action_type

    def stats(self) -> dict:
        resolved = [item for item in self._modals.values() if item["resolved"]]
        return {
            "modals_created": len(self._modals),
            "modals_confirmed": sum(1 for item in resolved if item.get("resolved_action") == "confirm"),
            "modals_dismissed": sum(1 for item in resolved if item.get("resolved_action") == "dismiss"),
        }
