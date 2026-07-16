"""데모 시연용 스크립트.

실행:
    python -m scripts.demo_scenario
"""

from __future__ import annotations

import asyncio
import os

import httpx

BASE = os.getenv("DEMO_BASE_URL", "http://localhost:8000/api/v1")
STORE = os.getenv("DEMO_STORE_ID", "POC_001")


async def demo():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        print("=" * 60)
        print("🏪 시나리오 1: 운영 코크핏")
        print("=" * 60)
        dashboard = await client.get(f"/dashboard/{STORE}")
        dashboard_data = dashboard.json()["data"]
        print(f"  매장: {dashboard_data['store_name']}")
        print(f"  긴급 알림: {len(dashboard_data['alerts'])}개")
        for alert in dashboard_data["alerts"]:
            print(f"    [{alert['severity']}] {alert['title']}")
        print(
            f"  오늘 매출: 전주 대비 {dashboard_data['today_sales']['vs_last_week_pct'] or 0:+.1f}%"
        )
        print()

        print("=" * 60)
        print("🏭 시나리오 2: 생산 알림 → 등록 → 피드백")
        print("=" * 60)
        alerts_res = await client.get(f"/production/{STORE}/alerts")
        alerts = alerts_res.json()["data"]
        if alerts:
            alert = alerts[0]
            print(f"  ⚠️ {alert['product_name']}: {alert['message'][:60]}...")
            print(f"  권장 생산량: {alert['detail']['recommended_production_qty']}개")

            register_res = await client.post(
                "/production/register",
                json={
                    "store_id": STORE,
                    "product_id": alert["product_id"],
                    "quantity": alert["detail"]["recommended_production_qty"],
                    "alert_id": alert["id"],
                },
            )
            register_data = register_res.json()["data"]
            print(f"  ✅ {register_data['feedback']['message']}")
        print()

        print("=" * 60)
        print("📦 시나리오 3: 주문 옵션 → 선택 → 확정")
        print("=" * 60)
        options_res = await client.get(f"/orders/{STORE}/options")
        options = options_res.json()["data"]
        for option in options["options"]:
            print(f"  {option['label']}: {option['total_qty']}개 ({option['deviation_label']})")
        print()

        print("=" * 60)
        print("📊 시나리오 4: 매출 분석 자연어 질의")
        print("=" * 60)
        queries = [
            "전주 대비 매출 비교해줘",
            "폐기율 높은 제품 알려줘",
            "우리 매장 다른 매장 평균 대비 어때?",
        ]
        for query in queries:
            print(f'  👤 "{query}"')
            sales_res = await client.post(
                "/sales/query",
                json={"store_id": STORE, "query": query},
            )
            payload = sales_res.json()["data"]
            print(f"  🤖 [{payload['intent']}] {payload['title']}")
            for section in payload.get("sections", []):
                if section.get("text"):
                    print(f"     {section['text'][:80]}...")
            print(f"     (LLM 토큰: {payload['metadata'].get('llm_tokens_used', 0)})")
            print()


if __name__ == "__main__":
    asyncio.run(demo())
