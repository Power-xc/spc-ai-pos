"""Fast path for one-tool chat requests."""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from core.formatter import format_fast_response


class FastPath:
    """Execute simple chat requests without a multi-step agent loop."""

    def __init__(self, registry) -> None:
        self.registry = registry

    async def execute(self, classifier_result, context) -> tuple[str, dict | list]:
        tool_name = classifier_result.tool_name
        message = (classifier_result.tool_params or {}).get("message", "")
        if tool_name == "compare_sales":
            period_a_start, period_a_end, period_b_start, period_b_end = self._resolve_compare_params(message)
            payload = await self.registry.execute(
                "compare_sales",
                store_id=context.store_id,
                period_a_start=period_a_start,
                period_a_end=period_a_end,
                period_b_start=period_b_start,
                period_b_end=period_b_end,
            )
            return tool_name, payload
        if tool_name == "get_order_options":
            return tool_name, await self.registry.execute("get_order_options", store_id=context.store_id)
        if tool_name == "get_current_inventory":
            return tool_name, await self.registry.execute("get_current_inventory", store_id=context.store_id)
        if tool_name == "get_waste_summary":
            return tool_name, await self.registry.execute("get_waste_summary", store_id=context.store_id, period="today")
        return tool_name, {}

    @staticmethod
    def _resolve_compare_params(message: str) -> tuple[str, str, str, str]:
        years = []
        for token in message.replace("년", "-").replace("월", "").replace(".", "-").split():
            if "-" in token:
                parts = token.split("-")
                if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                    year = int(parts[0])
                    years.append((2000 + year if year < 100 else year, int(parts[1])))
        if len(years) >= 2:
            (y1, m1), (y2, m2) = years[0], years[1]
        else:
            today = date.today()
            y1, m1, y2, m2 = today.year, today.month, today.year - 1, today.month
        return (
            f"{y1}-{m1:02d}-01",
            f"{y1}-{m1:02d}-{monthrange(y1, m1)[1]}",
            f"{y2}-{m2:02d}-01",
            f"{y2}-{m2:02d}-{monthrange(y2, m2)[1]}",
        )

    def format(self, tool_name: str, payload: dict | list, latency_ms: int):
        return format_fast_response(tool_name, payload, latency_ms)
