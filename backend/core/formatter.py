"""Chat response formatters for fast and agent paths."""

from __future__ import annotations

from core.schemas import ActionCard, ChatResponse, ModalAction


def format_fast_response(tool_name: str, payload: dict | list, latency_ms: int) -> ChatResponse:
    if tool_name == "get_order_options":
        options = payload["options"]
        lines = [f"{option['label']}: 총 {option['total_qty']}개" for option in options]
        card = ActionCard(
            card_type="order_draft",
            title="AI 발주 추천",
            body="\n".join(lines),
            actions=[ModalAction(label="발주 화면 보기", action_type="modify", api_endpoint="/api/order/recommendations")],
        )
        return ChatResponse(answer="주문 추천안을 준비했습니다.", action_cards=[card], tools_used=[tool_name], path="fast", latency_ms=latency_ms, token_usage=0)
    if tool_name == "compare_sales":
        body = payload.get("insight", "기간 비교 결과입니다.")
        card = ActionCard(card_type="insight", title="매출 비교", body=body)
        return ChatResponse(answer=body, action_cards=[card], tools_used=[tool_name], path="fast", latency_ms=latency_ms, token_usage=0)
    if tool_name == "get_current_inventory":
        critical = [item["product_name"] for item in payload if item["status"] == "critical"]
        answer = "품절 위험 상품이 있습니다: " + ", ".join(critical[:3]) if critical else "현재 급한 재고 위험은 없습니다."
        return ChatResponse(answer=answer, tools_used=[tool_name], path="fast", latency_ms=latency_ms, token_usage=0)
    return ChatResponse(answer="요청 결과를 준비했습니다.", tools_used=[tool_name], path="fast", latency_ms=latency_ms, token_usage=0)


def format_complex_order(answer: str, card_body: str, actions: list[ModalAction], *, latency_ms: int, token_usage: int, tools_used: list[str]) -> ChatResponse:
    card = ActionCard(card_type="order_draft", title="복합 주문서 초안", body=card_body, actions=actions)
    return ChatResponse(answer=answer, action_cards=[card], tools_used=tools_used, path="agent", latency_ms=latency_ms, token_usage=token_usage)
