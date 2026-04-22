"""Chat request complexity classifier."""

from __future__ import annotations

import re

from core.schemas import ClassifierResult, Complexity
from prompts.classifier import CLASSIFIER_PROMPT


class Classifier:
    """Heuristic-first classifier with LLM fallback."""

    SIMPLE_RULES = [
        (r"(매출|실적).*(비교|대비|차이)", "compare_sales"),
        (r"(재고|품절)", "get_current_inventory"),
        (r"(주문|발주).*(추천|옵션)", "get_order_options"),
        (r"(폐기|로스)", "get_waste_summary"),
    ]

    def __init__(self, llm_client) -> None:
        self.llm_client = llm_client

    async def classify(self, message: str, context) -> ClassifierResult:
        text = message.strip()
        if any(token in text for token in ["처럼", "빼고", "제외", "대신", "수정"]):
            return ClassifierResult(
                complexity=Complexity.COMPLEX,
                reasoning="조건 수정이나 과거 기준 재구성이 필요합니다.",
            )
        for pattern, tool_name in self.SIMPLE_RULES:
            if re.search(pattern, text):
                return ClassifierResult(
                    complexity=Complexity.SIMPLE,
                    tool_name=tool_name,
                    tool_params={"message": text},
                    reasoning="도구 1개로 처리 가능한 단순 조회입니다.",
                )
        if any(token in text for token in ["날씨", "주식", "뉴스"]):
            return ClassifierResult(complexity=Complexity.REJECT, reasoning="매장 운영과 무관한 질의입니다.")

        result = await self.llm_client.classify(
            CLASSIFIER_PROMPT,
            f"매장={context.store_id}\n질문={text}",
        )
        payload = result["data"]
        return ClassifierResult(
            complexity=Complexity(payload.get("complexity", "reject")),
            tool_name=payload.get("tool_name"),
            tool_params=payload.get("tool_params"),
            reasoning=payload.get("reasoning", ""),
        )
