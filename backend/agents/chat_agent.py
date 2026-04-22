"""Hybrid chat orchestrator for complex natural-language requests."""

from __future__ import annotations

from time import perf_counter

from core.schemas import ChatResponse, Complexity


class ChatAgent:
    """Classify chat requests and route to fast-path or complex agent loop."""

    def __init__(self, classifier, fast_path, agent_loop, auditor, security_gate) -> None:
        self.classifier = classifier
        self.fast_path = fast_path
        self.agent_loop = agent_loop
        self.auditor = auditor
        self.security_gate = security_gate

    async def handle(self, message: str, context) -> ChatResponse:
        start = perf_counter()
        classifier_result = await self.classifier.classify(message, context)
        if classifier_result.complexity == Complexity.REJECT:
            return ChatResponse(answer="매장 운영과 관련된 질문만 도와드릴 수 있습니다.", path="fast", latency_ms=0, token_usage=0)
        if classifier_result.complexity == Complexity.SIMPLE:
            tool_name, payload = await self.fast_path.execute(classifier_result, context)
            response = self.fast_path.format(tool_name, payload, int((perf_counter() - start) * 1000))
            await self.auditor.log(context=context, action="chat_fast", tool_name=tool_name, params={"message": message})
            return response
        response = await self.agent_loop.run(message, context)
        response.latency_ms = int((perf_counter() - start) * 1000)
        response.answer = self.security_gate.scan_answer(response.answer, context.role)
        await self.auditor.log(context=context, action="chat_agent", params={"message": message}, token_usage=response.token_usage)
        return response
