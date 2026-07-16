"""메시지 템플릿 엔진 — LLM 없이 알림 메시지 생성."""

from __future__ import annotations

from datetime import date, timedelta

TEMPLATES = {
    "production_alert": """
판매량 추세를 봤을 때, 약 1시간 뒤 아래 상품 목록 재고가 부족할 것으로 예상됩니다.

■ {product_name} ({category})
  • 현재 재고: {current_stock}개
  • 1시간 후 예상 재고: {predicted_stock_1h}개
  • 예상 소진 시각: {depletion_eta}
  • 최근 4주 {dow_name} 평균 판매: {avg_sold_qty}개
  • 평균 품절 시간: {avg_stockout_minutes}분
  • 품절 발생 빈도: 4주 중 {weeks_with_stockout}주
  • 1차 생산 패턴: {first_production_time} / {first_production_qty}개
  • 2차 생산 패턴: {second_production_time} / {second_production_qty}개
  • 권장 생산량: {recommended_qty}개
  • 미조치 시 예상 기회손실: {chance_loss_est:,}원
""".strip(),
    "production_feedback_positive": """
 생산 조치를 완료하셔서, 과거 동 시간에 발생했던 찬스 로스를 약 {reduction_pct}% 감소시킨 것으로 추정됩니다.
예상 손실 방지 금액: 약 {prevented_amount:,}원
""".strip(),
    "production_feedback_negative": """
 오늘 {product_name}에서 {stockout_minutes}분 품절이 발생했습니다.
추정 기회손실: 약 {chance_loss_amt:,}원
4주 평균 대비 {change_pct:+.1f}% 변화
""".strip(),
    "order_deadline_alert": """
 주문 마감이 임박했습니다!
{category} 카테고리 주문을 확인해주세요.
최근 4주 {dow_name} 평균 주문 기준으로 3가지 옵션을 준비했습니다.
""".strip(),
    "order_option_normal": """
선택하신 '{option_label}'의 경우, 4주 평균 동요일 주문량과 {deviation_label}.
""".strip(),
    "order_option_with_promo": """
선택하신 '{option_label}'의 경우, '{promo_name}' 캠페인으로 인해 4주 평균 동요일 주문량보다 {deviation_pct}% 주문량이 {more_or_less}. {alternative_suggestion}
""".strip(),
}

DOW_NAMES = {
    0: "월요일",
    1: "화요일",
    2: "수요일",
    3: "목요일",
    4: "금요일",
    5: "토요일",
    6: "일요일",
}


def get_same_dow_dates(reference_date: date, weeks_back: int = 4) -> list[date]:
    """기준일과 같은 요일인 과거 N주 날짜 목록."""
    return [reference_date - timedelta(weeks=i) for i in range(1, weeks_back + 1)]


class TemplateEngine:
    """Minimal string-template renderer for non-LLM messaging."""

    def render(self, template_name: str, **kwargs) -> str:
        """Render one of the predefined templates."""
        template = TEMPLATES[template_name]
        return template.format(**kwargs)
