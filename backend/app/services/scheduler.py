"""APScheduler configuration helpers."""

from __future__ import annotations

import logging

from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.tools import sql_queries

logger = logging.getLogger(__name__)


def setup_scheduler(
    production_agent,
    order_agent,
    notification_service,
    db_session_factory,
) -> AsyncIOScheduler:
    """Configure background jobs for production scanning and order deadlines."""
    scheduler = AsyncIOScheduler()

    @scheduler.scheduled_job(IntervalTrigger(minutes=5))
    async def production_scan_all() -> None:
        try:
            async with db_session_factory() as db:
                stores = await sql_queries.get_store_list(db)
            for store in stores:
                await production_agent.check_production_needs(store["store_id"])
        except Exception:  # pragma: no cover - scheduler side effects
            logger.exception("Scheduled production scan failed")

    @scheduler.scheduled_job("cron", hour=14, minute=40)
    async def order_deadline_check() -> None:
        try:
            async with db_session_factory() as db:
                stores = await sql_queries.get_store_list(db)
            for store in stores:
                await order_agent.check_deadlines(store["store_id"])
        except Exception:  # pragma: no cover - scheduler side effects
            logger.exception("Scheduled order deadline check failed")

    return scheduler
