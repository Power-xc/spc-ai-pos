"""Dashboard widget API tests with lightweight stubs."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.common import AlertCard
from app.schemas.orders import OrderOption, OrderOptionsResponse
from app.tools import sql_queries


class DummySession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class DummySessionFactory:
    def __call__(self):
        return DummySession()


@pytest_asyncio.fixture
async def client(monkeypatch):
    async def fake_store_info(_db, store_id: str):
        return {"store_id": store_id, "store_name": "POC 점포", "region": "서울", "city": "강남"}

    async def fake_sales_opportunities(_db, _store_id: str, top_n: int = 3, **_kwargs):
        return [
            {
                "product_id": "P001",
                "product_name": "글레이즈드 도넛",
                "growth_pct": 18.4,
                "current_sales_amt": 120000,
            }
        ][:top_n]

    async def fake_daily_kpis(_db, _store_id: str, **_kwargs):
        return {
            "biz_date": "2026-04-07",
            "total_sales_amt": 1450000,
            "total_sold_qty": 422,
            "vs_yesterday": {"sales_pct": 4.2},
            "vs_last_week_same_dow": {"sales_pct": 8.1},
            "vs_last_month": {"sales_pct": 3.0},
            "top_category": "도넛",
        }

    async def fake_sales_hourly_mini_chart(_db, _store_id: str, **_kwargs):
        return [
            {"label": "08:00", "value": 12000},
            {"label": "09:00", "value": 18000},
            {"label": "10:00", "value": 24000},
        ]

    monkeypatch.setattr(sql_queries, "get_store_info", fake_store_info)
    monkeypatch.setattr(sql_queries, "get_sales_opportunities", fake_sales_opportunities)
    monkeypatch.setattr(sql_queries, "get_daily_kpis", fake_daily_kpis)
    monkeypatch.setattr(sql_queries, "get_sales_hourly_mini_chart", fake_sales_hourly_mini_chart)

    production_alert = SimpleNamespace(
        id="prod-1",
        severity="HIGH",
        product_id="P001",
        product_name="글레이즈드 도넛",
        message="약 1시간 뒤 재고가 부족할 것으로 예상됩니다.",
        cta_label="생산 등록하기",
        cta_action="PRODUCTION_REGISTER",
        created_at="2026-04-07T10:00:00+09:00",
        detail=SimpleNamespace(depletion_eta="2026-04-07T11:00:00+09:00"),
    )

    production_agent = SimpleNamespace(
        get_current_alerts=AsyncMock(return_value=[production_alert]),
        get_inventory_status=AsyncMock(return_value=[]),
        predictor=SimpleNamespace(
            get_all_risk_products=AsyncMock(
                return_value=[
                    {
                        "product_id": "P001",
                        "product_name": "글레이즈드 도넛",
                        "category": "도넛",
                        "current_stock": 8,
                        "predicted_stock_1h": 1,
                        "depletion_eta": "2026-04-07T11:00:00+09:00",
                        "hourly_burn_rate": 6.2,
                        "stockout_probability": 75.0,
                        "recommended_production_qty": 12,
                        "first_production": {"avg_time": "09:15", "avg_qty": 48},
                        "second_production": {"avg_time": "13:40", "avg_qty": 32},
                        "risk_level": "HIGH",
                        "avg_sold_qty": 52.3,
                        "weeks_with_stockout": 3,
                    }
                ]
            )
        ),
    )

    order_agent = SimpleNamespace(
        _confirmed_orders={},
        check_deadlines=AsyncMock(
            return_value=[
                AlertCard(
                    id="order-1",
                    severity="MEDIUM",
                    type="order",
                    title="도넛 주문 마감 18분 전",
                    subtitle="15:00",
                    message="주문 옵션을 확인해주세요.",
                    cta={"label": "주문 확인하기", "action": "OPEN_ORDERS", "route": "/orders"},
                    created_at="2026-04-07T10:00:00+09:00",
                    read=False,
                )
            ]
        ),
        generate_order_options=AsyncMock(
            return_value=OrderOptionsResponse(
                store_id="POC_001",
                product_group=None,
                category="도넛",
                deadline="15:00",
                options=[
                    OrderOption(
                        option_id="option_2weeks_ago",
                        label="전전주 동요일",
                        reference_date="2026-03-24",
                        total_qty=108,
                        total_amount=194400,
                        deviation_from_avg_pct=-1.0,
                        deviation_label="평균 수준",
                        items=[],
                        flags=[],
                    )
                ],
                four_week_avg_qty=109.0,
                explanation=None,
            )
        ),
    )

    notification_service = SimpleNamespace(
        get_recent=lambda *_args, **_kwargs: [],
    )

    app.state.db_session_factory = DummySessionFactory()
    app.state.production_agent = production_agent
    app.state.order_agent = order_agent
    app.state.notification_service = notification_service

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-User-Role": "store_owner", "X-User-Id": "dashboard-tester"},
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_dashboard_briefing_returns_widget_payload(client):
    res = await client.get("/api/v1/dashboard/briefing", params={"store_id": "POC_001"})
    assert res.status_code == 200
    payload = res.json()["data"]
    assert payload["store_id"] == "POC_001"
    assert "last_updated_at" in payload
    assert payload["risks"][0]["title"] == "글레이즈드 도넛 재고 부족 예상"
    assert payload["actions"][0]["action"] == "OPEN_PRODUCTION"


@pytest.mark.asyncio
async def test_dashboard_production_returns_prediction_fields(client):
    res = await client.get("/api/v1/dashboard/production", params={"store_id": "POC_001"})
    assert res.status_code == 200
    payload = res.json()["data"]
    assert payload["store_id"] == "POC_001"
    assert payload["items"][0]["current_stock"] == 8
    assert payload["items"][0]["predicted_stock_1h"] == 1
    assert payload["items"][0]["first_production"]["avg_time"] == "09:15"


@pytest.mark.asyncio
async def test_dashboard_sales_summary_returns_chart(client):
    res = await client.get("/api/v1/dashboard/sales-summary", params={"store_id": "POC_001"})
    assert res.status_code == 200
    payload = res.json()["data"]
    assert payload["today_sales_amt"] == 1450000
    assert payload["vs_last_week_same_dow_pct"] == 8.1
    assert len(payload["mini_chart_data"]) == 3


@pytest.mark.asyncio
async def test_dashboard_alerts_reads_notification_history(client):
    app.state.notification_service = SimpleNamespace(
        get_recent=lambda *_args, **_kwargs: [
            {
                "event_type": "sales_insight",
                "timestamp": "2026-04-07T10:00:00+09:00",
                "data": {
                    "id": "sales-1",
                    "severity": "LOW",
                    "title": "매출 기회 감지",
                    "subtitle": "글레이즈드 급증",
                    "message": "전주 동요일 대비 판매 수량이 증가했습니다.",
                    "cta": {"label": "매출 해석 보기", "action": "OPEN_SALES", "route": "/sales"},
                    "created_at": "2026-04-07T10:00:00+09:00",
                },
            }
        ]
    )
    res = await client.get("/api/v1/dashboard/alerts", params={"store_id": "POC_001"})
    assert res.status_code == 200
    payload = res.json()["data"]
    assert payload["alerts"][0]["title"] == "매출 기회 감지"
