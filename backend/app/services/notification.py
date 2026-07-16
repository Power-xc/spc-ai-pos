"""Notification service with in-memory SSE fan-out."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any


class NotificationService:
    """SSE 기반 실시간 알림 관리."""

    def __init__(self, redis_client=None) -> None:
        self.redis_client = redis_client
        self.subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self.history: dict[str, list[dict[str, Any]]] = defaultdict(list)

    def subscribe(self, store_id: str) -> asyncio.Queue:
        """Register an SSE subscriber queue for a store."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.subscribers[store_id].add(queue)
        return queue

    def unsubscribe(self, store_id: str, queue: asyncio.Queue) -> None:
        """Remove an SSE subscriber queue."""
        self.subscribers[store_id].discard(queue)

    async def publish(self, store_id: str, event_type: str, data: dict) -> None:
        """Fan out a message to all subscribers of the store."""
        message = {
            "event_type": event_type,
            "data": data,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        self.history[store_id].insert(0, message)
        self.history[store_id] = self.history[store_id][:200]
        dead_queues: list[asyncio.Queue] = []
        for queue in list(self.subscribers[store_id]):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                dead_queues.append(queue)
        for queue in dead_queues:
            self.subscribers[store_id].discard(queue)

    def get_recent(
        self,
        store_id: str,
        *,
        hours: int = 24,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return recent notification history for a store."""
        cutoff = datetime.now(UTC)
        recent: list[dict[str, Any]] = []
        for message in self.history.get(store_id, []):
            try:
                timestamp = datetime.fromisoformat(message["timestamp"])
            except Exception:
                continue
            age_seconds = (cutoff - timestamp).total_seconds()
            if age_seconds <= hours * 3600:
                recent.append(message)
            if len(recent) >= limit:
                break
        return recent
