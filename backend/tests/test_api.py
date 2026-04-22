"""주요 API 엔드포인트 통합 테스트.

DB 연결이 되어 있다는 전제하에 실행한다.
DB 없이 테스트하려면 mock 또는 테스트용 DATABASE_URL을 사용한다.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-User-Role": "store_owner", "X-User-Id": "api-tester"},
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_dashboard(client):
    res = await client.get("/api/v1/dashboard/POC_001")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"


@pytest.mark.asyncio
async def test_production_alerts(client):
    res = await client.get("/api/v1/production/POC_001/alerts")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_order_options(client):
    res = await client.get("/api/v1/orders/POC_001/options")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_sales_query(client):
    res = await client.post(
        "/api/v1/sales/query",
        json={
        "store_id": "POC_001",
            "query": "전주 대비 매출 비교해줘",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["data"]["intent"] is not None


@pytest.mark.asyncio
async def test_chat(client):
    res = await client.post(
        "/api/v1/chat",
        json={
        "store_id": "POC_001",
            "message": "오늘 재고 상황 알려줘",
        },
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_sensitive_blocked(client):
    res = await client.post(
        "/api/v1/sales/query",
        json={
        "store_id": "POC_001",
            "query": "우리 매장 순이익 알려줘",
        },
    )
    data = res.json()
    assert data["data"]["intent"] == "SENSITIVE_BLOCKED"


@pytest.mark.asyncio
async def test_sse_stream(client):
    """SSE 연결 테스트 (heartbeat 수신 전 headers 검증)."""
    async with client.stream(
        "GET",
        "/api/v1/notifications/POC_001/stream",
        headers={"Accept": "text/event-stream", "X-User-Role": "store_owner"},
    ) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
