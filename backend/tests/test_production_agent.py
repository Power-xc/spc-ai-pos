from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agents.production_agent import ProductionAgent
from app.services.scheduler import setup_scheduler
from app.tools import sql_queries
from app.tools.prediction import InventoryPredictor
from app.tools.templates import TemplateEngine


class DummySession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class DummySessionFactory:
    def __call__(self):
        return DummySession()


class DummyNotificationService:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str, dict]] = []

    async def publish(self, store_id: str, event_type: str, data: dict) -> None:
        self.messages.append((store_id, event_type, data))


@pytest.mark.asyncio
async def test_scheduler_runs_production_check_every_five_minutes(monkeypatch):
    calls: list[str] = []

    async def fake_get_store_list(_db):
        return [{"store_id": "S1"}, {"store_id": "S2"}]

    monkeypatch.setattr(sql_queries, "get_store_list", fake_get_store_list)

    class ProductionStub:
        async def check_production_needs(self, store_id: str):
            calls.append(store_id)
            return []

    scheduler = setup_scheduler(
        production_agent=ProductionStub(),
        order_agent=SimpleNamespace(check_deadlines=AsyncMock(return_value=[])),
        notification_service=DummyNotificationService(),
        db_session_factory=DummySessionFactory(),
    )
    production_job = next(
        job
        for job in scheduler.get_jobs()
        if getattr(job.trigger, "interval", None)
        and job.trigger.interval.total_seconds() == 300
    )

    assert production_job.trigger.interval.total_seconds() == 300
    await production_job.func()
    assert calls == ["S1", "S2"]


@pytest.mark.asyncio
async def test_predict_hourly_depletion_returns_stock_and_eta(monkeypatch):
    predictor = InventoryPredictor()
    now = datetime(2026, 4, 7, 12, 0, tzinfo=UTC)

    async def fake_get_inventory(_db, _store_id):
        return [{"product_id": "P001", "on_hand_eod": 5}]

    async def fake_get_history(_db, _store_id, _product_id, days=35):
        return [
            {"biz_date": "2026-03-10", "sold_qty": 40, "stockout_minutes": 0},
            {"biz_date": "2026-03-17", "sold_qty": 50, "stockout_minutes": 15},
            {"biz_date": "2026-03-24", "sold_qty": 60, "stockout_minutes": 20},
            {"biz_date": "2026-03-31", "sold_qty": 70, "stockout_minutes": 25},
            {"biz_date": "2026-04-07", "sold_qty": 65, "stockout_minutes": 0},
        ]

    monkeypatch.setattr(sql_queries, "get_store_inventory_today", fake_get_inventory)
    monkeypatch.setattr(sql_queries, "get_product_history", fake_get_history)

    result = await predictor.predict_hourly_depletion(object(), "STORE001", "P001", reference_time=now)

    assert result["current_stock"] == 5
    assert result["predicted_stock_1h"] < 5
    assert result["hourly_burn_rate"] > 0
    assert result["depletion_eta"] is not None


@pytest.mark.asyncio
async def test_production_alert_payload_includes_prediction_and_patterns():
    now = datetime.now(UTC)
    predictor = SimpleNamespace(
        get_all_risk_products=AsyncMock(
            return_value=[
                {
                    "product_id": "P001",
                    "product_name": "글레이즈드 도넛",
                    "category": "도넛",
                    "current_date_on_hand": 6,
                    "current_stock": 6,
                    "predicted_sold_qty": 52,
                    "predicted_stock_1h": 0,
                    "depletion_eta": now + timedelta(minutes=45),
                    "hourly_burn_rate": 6.5,
                    "stockout_probability": 75.0,
                    "avg_stockout_minutes_4w": 38.0,
                    "avg_stockout_minutes": 38.0,
                    "weeks_with_stockout": 3,
                    "avg_sold_qty": 48.0,
                    "recommended_production_qty": 18,
                    "chance_loss_if_no_action": 15000,
                    "first_production": {"avg_time": "09:15", "avg_qty": 48},
                    "second_production": {"avg_time": "13:40", "avg_qty": 32},
                }
            ]
        )
    )
    notifications = DummyNotificationService()
    agent = ProductionAgent(
        db_session_factory=DummySessionFactory(),
        predictor=predictor,
        chance_loss_calculator=SimpleNamespace(),
        template_engine=TemplateEngine(),
        notification_service=notifications,
    )

    alerts = await agent.check_production_needs("STORE001")

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.detail.current_stock == 6
    assert alert.detail.predicted_stock_1h == 0
    assert alert.detail.first_production is not None
    assert alert.detail.second_production is not None
    assert notifications.messages[0][1] == "production_alert"
    assert notifications.messages[0][2]["detail"]["first_production"]["avg_time"] == "09:15"


@pytest.mark.asyncio
async def test_register_production_returns_positive_feedback_before_depletion(monkeypatch):
    async def fake_get_inventory(_db, _store_id):
        return [{"product_id": "P001", "base_price": 1800, "on_hand_eod": 5}]

    monkeypatch.setattr(sql_queries, "get_store_inventory_today", fake_get_inventory)

    agent = ProductionAgent(
        db_session_factory=DummySessionFactory(),
        predictor=SimpleNamespace(),
        chance_loss_calculator=SimpleNamespace(
            calculate_daily_chance_loss=AsyncMock(return_value={"products": []}),
            generate_feedback_message=AsyncMock(
                return_value={
                    "type": "NEGATIVE",
                    "message": "fallback",
                    "impact_pct": 0.0,
                    "estimated_amount": 0.0,
                }
            ),
        ),
        template_engine=TemplateEngine(),
        notification_service=DummyNotificationService(),
    )
    alert_id = "alert-1"
    agent._alert_lookup[alert_id] = {
        "store_id": "STORE001",
        "detail": {
            "depletion_eta": (datetime.now(UTC) + timedelta(minutes=20)).isoformat(),
            "hourly_burn_rate": 6.0,
            "predicted_sold_qty": 60,
            "chance_loss_if_no_action": 10800,
        },
    }

    response = await agent.register_production("STORE001", "P001", 12, alert_id=alert_id)

    assert response.feedback.type == "POSITIVE"
    assert "찬스 로스" in response.feedback.message
    assert response.feedback.impact_pct > 0
