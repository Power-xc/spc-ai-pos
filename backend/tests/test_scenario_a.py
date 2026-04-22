"""Scenario A: proactive production modal and confirm flow."""

from __future__ import annotations

import asyncio
from datetime import datetime

from core.schemas import StoreContext


def test_stock_depletion_triggers_modal_and_confirm(client, headers, monkeypatch, store_id):
    async def fake_recommendation(**kwargs):
        return [
            {
                "product_id": "P001",
                "product_name": "글레이즈드",
                "recommended_qty": 48,
                "reason": "현재고 12개, 1시간 후 2개 예상",
                "urgency": "high",
                "pattern": {
                    "first_production": {"avg_time": "09:15", "avg_qty": 48},
                    "second_production": {"avg_time": "13:40", "avg_qty": 32},
                },
            }
        ]

    client.app.state.registry._tools["get_recommended_production"].handler = fake_recommendation
    context = StoreContext(store_id=store_id, user_id="system", role="hq_admin", current_time=datetime.utcnow())
    asyncio.run(client.app.state.proactive_monitor.run(context))

    pending = client.get("/api/modal/pending", headers=headers)
    assert pending.status_code == 200
    modal = pending.json()["data"][0]
    assert modal["modal_type"] == "production_alert"

    response = client.post(f"/api/modal/{modal['modal_id']}/respond", json={"action_type": "confirm", "params": {}}, headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["chance_loss"]["status"] in {"prevented", "occurred"}
