"""Complex chat loop for multi-tool order drafting."""

from __future__ import annotations

import re
from datetime import timedelta

from core.formatter import format_complex_order
from core.schemas import ModalAction
from prompts.examples import COMPLEX_ORDER_EXAMPLE
from prompts.system import SYSTEM_PROMPT

WEEKDAY = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}


class AgentLoop:
    """Minimal multi-step agent path tailored to complex order requests."""

    def __init__(self, registry, llm_client) -> None:
        self.registry = registry
        self.llm_client = llm_client

    async def run(self, message: str, context):
        if "주문" in message and "처럼" in message:
            return await self._order_flow(message, context)
        summary = await self.llm_client.summarize(SYSTEM_PROMPT, f"{COMPLEX_ORDER_EXAMPLE}\n사용자 요청: {message}")
        return format_complex_order(summary["content"], summary["content"], [], latency_ms=0, token_usage=summary["tokens"], tools_used=[])

    async def _order_flow(self, message: str, context):
        weekday = next((value for key, value in WEEKDAY.items() if f"{key}요일" in message), context.current_time.weekday())
        reference = context.current_time - timedelta(days=7)
        while reference.weekday() != weekday:
            reference -= timedelta(days=1)
        history = await self.registry.execute("get_order_history", store_id=context.store_id, date=reference.date().isoformat())
        items = history["items"]
        if "빨대" in message:
            items = [item for item in items if "빨대" not in item["product_name"]]
        risk = await self.registry.execute("calculate_order_risk", store_id=context.store_id, items=items)
        prompt = (
            f"{SYSTEM_PROMPT}\n\n도구결과 주문이력={history}\n리스크={risk}\n"
            "위 결과를 바탕으로 점주에게 보여줄 주문서 요약을 3문장 이내로 작성하세요."
        )
        try:
            summary = await self.llm_client.summarize(SYSTEM_PROMPT, prompt, max_tokens=250)
            answer = summary["content"]
            token_usage = summary["tokens"]
        except Exception:
            answer = "LLM이 연결되지 않아 규칙 기반으로 주문 초안을 만들었습니다. 아래 주문서와 리스크를 확인한 뒤 점주 승인으로 진행해주세요."
            token_usage = 0
        body_lines = [f"📋 지난주 {reference.date().isoformat()} 기준 주문서"]
        body_lines.extend([f"{item['product_name']} {item['quantity']}개" for item in items[:8]])
        body_lines.append(
            f"⚠️ 리스크: 품절 위험 {sum(1 for row in risk['items'] if row['stockout_risk']=='high')}건 / 폐기 위험 {sum(1 for row in risk['items'] if row['waste_risk']=='high')}건"
        )
        actions = [
            ModalAction(label="이대로 발주", action_type="confirm", api_endpoint="/api/order/confirm", params={"items": items}),
            ModalAction(label="수량 수정", action_type="modify", api_endpoint="/api/order/recalculate-risk", params={"items": items}),
            ModalAction(label="취소", action_type="dismiss", api_endpoint="", params={}),
        ]
        return format_complex_order(answer, "\n".join(body_lines), actions, latency_ms=0, token_usage=token_usage, tools_used=["get_order_history", "calculate_order_risk"])
