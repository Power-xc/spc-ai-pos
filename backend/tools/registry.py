"""Tool registry used by the complex chat agent."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict
    handler: Callable[..., Awaitable[Any]]
    required_role: str = "any"
    is_write: bool = False
    timeout: float = 5.0


class ToolRegistry:
    """Registers tools once and exposes them in OpenAI tool format."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> None:
        self._tools[definition.name] = definition

    def get(self, name: str) -> ToolDefinition:
        return self._tools[name]

    def get_tools_for_role(self, role: str) -> list[dict]:
        tools = []
        for definition in self._tools.values():
            if definition.required_role not in {"any", role} and role != "hq_admin":
                continue
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": definition.name,
                        "description": definition.description,
                        "parameters": definition.parameters,
                    },
                }
            )
        return tools

    async def execute(self, name: str, **kwargs) -> Any:
        definition = self.get(name)
        return await asyncio.wait_for(definition.handler(**kwargs), timeout=definition.timeout)
