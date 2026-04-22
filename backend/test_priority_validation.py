"""Test script to validate priority responses with pending/running data."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.orchestration.router import AgentRouter


def test_priority_responses():
    """Test priority formatting with sample data including running items."""

    # Sample data with various statuses including running (실행중)
    sample_items = [
        {
            "id": "1",
            "title": "재고 부족 알림",
            "priority": "긴급",
            "status": "대기",
            "source": "production",
        },
        {
            "id": "2",
            "title": "주문 마감 임박",
            "priority": "중요",
            "status": "실행중",
            "source": "orders",
        },
        {
            "id": "3",
            "title": "폐기 예정 상품",
            "priority": "긴급",
            "status": "실행중",
            "source": "production",
        },
        {
            "id": "4",
            "title": "일반 점검",
            "priority": "일반",
            "status": "대기",
            "source": "system",
        },
        {
            "id": "5",
            "title": "완료된 작업",
            "priority": "중요",
            "status": "완료",
            "source": "system",
        },
        {
            "id": "6",
            "title": "보류 중인 작업",
            "priority": "일반",
            "status": "보류",
            "source": "system",
        },
    ]

    print("=" * 60)
    print("테스트 1: 우선순위 정렬 (지금 할 일 우선순위)")
    print("=" * 60)
    priority_result = AgentRouter._format_actions_priority(
        sample_items[:4]
    )  # Exclude completed/hold for priority
    print(priority_result)
    print()

    # Check sorting: should be 긴급/실행중 first, then 긴급/대기, then 중요/실행중, then 일반/대기
    # Expected order:
    # 1. [긴급|실행중] 폐기 예정 상품 (긴급 + 실행중 = top priority)
    # 2. [긴급|대기] 재고 부족 알림 (긴급 + 대기)
    # 3. [중요|실행중] 주문 마감 임박 (중요 + 실행중)
    # 4. [일반|대기] 일반 점검 (일반 + 대기)
    print(
        "기대 순서: 긴급/실행중 → 긴급/대기 → 중요/실행중 → 중요/대기 → 일반/실행중 → 일반/대기"
    )
    print()

    print("=" * 60)
    print("테스트 2: 미완료 항목 필터링 (완료 안 된 항목)")
    print("=" * 60)
    filtered = AgentRouter._filter_action_items(sample_items, "incomplete_only")
    print(f"필터링 결과: {len(filtered)}개 항목")
    for item in filtered:
        print(f"  - [{item['priority']}|{item['status']}] {item['title']}")
    print()

    print("=" * 60)
    print("테스트 3: 대기/실행중 항목 필터링 (대기 중인 항목)")
    print("=" * 60)
    filtered = AgentRouter._filter_action_items(sample_items, "pending_only")
    print(f"필터링 결과: {len(filtered)}개 항목")
    for item in filtered:
        print(f"  - [{item['priority']}|{item['status']}] {item['title']}")
    print()

    print("=" * 60)
    print("테스트 4: 상태 카운트 (todo_snapshot)")
    print("=" * 60)
    snapshot = AgentRouter._actions_status_counts(sample_items)
    print(f"상태 스냅샷: {snapshot}")
    print()

    print("=" * 60)
    print("테스트 5: 화면 가이드 포맷")
    print("=" * 60)
    guide = AgentRouter._format_actions_screen_guide(filtered, snapshot)
    print(guide)
    print()

    print("=" * 60)
    print("테스트 6: 미완료 항목 답변 포맷")
    print("=" * 60)
    answer = AgentRouter._format_actions_answer(filtered, "incomplete_only")
    print(answer)
    print()

    print("=" * 60)
    print("테스트 7: 대기/실행중 답변 포맷")
    print("=" * 60)
    answer = AgentRouter._format_actions_answer(filtered, "pending_only")
    print(answer)
    print()

    # Validate that execution status is properly recognized
    running_items = [item for item in sample_items if item["status"] == "실행중"]
    print("=" * 60)
    print(f"실행중 항목 수: {len(running_items)}")
    print("=" * 60)
    for item in running_items:
        print(f"  - [{item['priority']}] {item['title']}")
    print()

    print("✅ 모든 테스트 완료!")
    return True


if __name__ == "__main__":
    try:
        test_priority_responses()
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
