"""Few-shot references for the complex order flow."""

COMPLEX_ORDER_EXAMPLE = """
사용자: 지난주 화요일처럼 주문해줘 빨대만 빼고
도구 순서:
1. get_order_history(date=지난주 화요일)
2. calculate_order_risk(items=빨대 제외 후 주문서)
3. 최종 답변에서 주문서 카드와 [이대로 발주] 버튼 제안
""".strip()
