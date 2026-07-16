"""Scenario B: complex order drafting via chat."""

from __future__ import annotations


def test_complex_order_via_chat(client, headers, monkeypatch):
    async def fake_summary(system_prompt: str, user_prompt: str, max_tokens: int = 500):  # noqa: ARG001
        return {"content": "지난주 화요일 주문을 기준으로 빨대 품목을 제외한 초안을 만들었습니다.", "tokens": 321}

    monkeypatch.setattr(client.app.state.llm_client, "summarize", fake_summary)
    response = client.post("/api/chat", json={"message": "지난주 화요일처럼 주문해줘 빨대만 빼고"}, headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["path"] == "agent"
    assert payload["action_cards"][0]["card_type"] == "order_draft"
    assert any(action["label"] == "이대로 발주" for action in payload["action_cards"][0]["actions"])
