"""Advanced order intent and approval-flow tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.agents.order_agent import OrderAgent
from app.orchestration.intent import IntentClassifier
from app.orchestration.router import AgentRouter
from app.schemas.orders import OrderItem, OrderOption, OrderOptionsResponse
from app.tools.templates import TemplateEngine


class DummySession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class DummySessionFactory:
    def __call__(self):
        return DummySession()


class DummyLLM:
    api_key = None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("query", "expected_intent", "expected_key"),
    [
        ("지난주 화요일처럼 주문해줘", "order_like_reference", "reference_date"),
        ("전주 주문안에서 빨대만 빼고", "order_exclude_item", "exclude_items"),
        ("작년 추석 연휴 전 주문과 비교해줘", "order_compare_special", "period_name"),
    ],
)
async def test_intent_classifier_recognizes_advanced_order_intents(query, expected_intent, expected_key):
    classifier = IntentClassifier(llm_gateway=DummyLLM())
    result = await classifier.classify(query, "POC_001")
    assert result["intent"] == expected_intent
    assert expected_key in result["params"]


@pytest.mark.asyncio
async def test_handle_exclude_item_removes_selected_items():
    agent = OrderAgent(
        db_session_factory=DummySessionFactory(),
        template_engine=TemplateEngine(),
        llm_gateway=DummyLLM(),
        notification_service=SimpleNamespace(),
    )
    agent._last_generated_options["POC_001"] = OrderOptionsResponse(
        store_id="POC_001",
        product_group=None,
        category="도넛",
        deadline="15:00",
        options=[
            OrderOption(
                option_id="option_last_week",
                label="전주 동요일",
                reference_date="2026-04-01",
                total_qty=20,
                total_amount=20000,
                deviation_from_avg_pct=0,
                deviation_label="평균 수준",
                items=[
                    OrderItem(product_id="A", product_name="빨대", quantity=10, base_price=100),
                    OrderItem(product_id="B", product_name="글레이즈드", quantity=10, base_price=1000),
                ],
                flags=[],
            )
        ],
        four_week_avg_qty=20,
        explanation=None,
    )

    result = await agent.handle_exclude_item("POC_001", "전주", ["빨대"])
    remaining_names = [item["product_name"] for item in result["items"]]
    assert "빨대" not in remaining_names
    assert "글레이즈드" in remaining_names


@pytest.mark.asyncio
async def test_recalculate_risk_and_confirm_draft_order():
    agent = OrderAgent(
        db_session_factory=DummySessionFactory(),
        template_engine=TemplateEngine(),
        llm_gateway=DummyLLM(),
        notification_service=SimpleNamespace(),
    )
    draft = await agent.create_draft_order(
        store_id="POC_001",
        option_id="option_last_week",
        items=[
            {"product_id": "A", "product_name": "글레이즈드", "quantity": 10, "base_price": 1000},
            {"product_id": "B", "product_name": "보스턴크림", "quantity": 10, "base_price": 1200},
        ],
    )
    risk = await agent.recalculate_risk(
        draft.draft_order_id,
        items=[
            {"product_id": "A", "product_name": "글레이즈드", "quantity": 5, "base_price": 1000},
            {"product_id": "B", "product_name": "보스턴크림", "quantity": 14, "base_price": 1200},
        ],
    )
    assert risk.overall_risk == "HIGH"
    assert any(item.risk_type == "SHORTAGE" for item in risk.items)
    assert any(item.risk_type == "WASTE" for item in risk.items)

    confirmed = await agent.confirm_draft_order(draft.draft_order_id)
    assert confirmed.order_id.startswith("order-")
    assert "리스크 요약" in confirmed.message


@pytest.mark.asyncio
async def test_router_routes_reference_order_to_order_agent():
    intent_classifier = SimpleNamespace(
        classify=AsyncMock(
            return_value={
                "intent": "order_like_reference",
                "params": {"reference_date": "2026-04-01"},
                "llm_tokens_used": 0,
            }
        )
    )
    order_agent = SimpleNamespace(
        handle_reference_order=AsyncMock(
            return_value={"mode": "reference_order", "items": [], "message": "초안을 만들었습니다."}
        )
    )
    router = AgentRouter(
        production_agent=SimpleNamespace(),
        order_agent=order_agent,
        sales_agent=SimpleNamespace(),
        intent_classifier=intent_classifier,
    )

    response = await router.route("POC_001", "지난주 화요일처럼 주문해줘")
    assert response.agent == "order"
    assert response.response_type == "order_card"
    assert response.content["mode"] == "reference_order"
