"""OpenAI-compatible vLLM client used only for chat paths."""

from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI, NotFoundError


class LLMClient:
    """Thin AsyncOpenAI wrapper with model auto-discovery."""

    def __init__(self, base_url: str, model: str | None = None) -> None:
        self.client = AsyncOpenAI(base_url=base_url, api_key="EMPTY")
        self.model = model

    async def resolve_model(self) -> str:
        if self.model:
            return self.model
        models = await self.client.models.list()
        self.model = models.data[0].id
        return self.model

    async def _retry_with_detected_model(self, callback):
        try:
            return await callback(await self.resolve_model())
        except NotFoundError:
            self.model = None
            detected = await self.resolve_model()
            return await callback(detected)

    async def classify(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        async def _call(model: str):
            return await self.client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0,
                max_tokens=300,
            )

        response = await self._retry_with_detected_model(_call)
        content = response.choices[0].message.content or "{}"
        return {"data": json.loads(content), "tokens": response.usage.total_tokens if response.usage else 0}

    async def summarize(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 500) -> dict[str, Any]:
        async def _call(model: str):
            return await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=max_tokens,
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            )

        response = await self._retry_with_detected_model(_call)
        return {
            "content": response.choices[0].message.content or "",
            "tokens": response.usage.total_tokens if response.usage else 0,
        }

    async def complete_with_tools(self, messages: list[dict], tools: list[dict]) -> Any:
        async def _call(model: str):
            return await self.client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=800,
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            )

        return await self._retry_with_detected_model(_call)
