"""Intent classifier for routing chat and sales-analysis requests."""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from time import perf_counter
from typing import Any

from app.services.chat_trace import add_elapsed


class IntentClassifier:
    """질의 의도 분류기 — 규칙 우선, LLM fallback."""

    WEEKDAY_MAP = {
        "월요일": 0,
        "화요일": 1,
        "수요일": 2,
        "목요일": 3,
        "금요일": 4,
        "토요일": 5,
        "일요일": 6,
    }

    RULES = [
        # Identity / Greeting / General — these must come first to prevent context bleed
        (
            r"(너\s*는|너\s*누구|당신\s*는|당신\s*누구|who\s*are\s*you|what\s*are\s*you|자기소개|봇\s*이야|ai\s*야|누구\s*야|누구\s*세요|너\s*뭐\s*야)",
            "IDENTITY",
        ),
        (
            r"(안녕|하이|헬로|hello|hi\s*there|반갑|좋은\s*아침|좋은\s*오후|좋은\s*저녁)",
            "GREETING",
        ),
        (
            r"(도움말|도와줘|도움\s*필요|help\s*me|사용법|이용\s*방법|어떻게\s*쓰|뭘\s*할\s*수\s*있|무엇을\s*도와|뭘\s*도와|뭘\s*할\s*줄|무엇을\s*할\s*수|어떤\s*질문|어떤\s*기능|도와줄\s*수|어떤\s*것을\s*도와|능력|기능\s*소개|질문\s*가능|할\s*수\s*있어|할\s*줄\s*알아)",
            "GENERAL_HELP",
        ),
        # Notification settings — must come before ORDER to prevent "알림 꺼줘" being classified as ORDER
        (
            r"(알림|通知|notification).*(꺼줘|끄기|mute|off|disable|꺼|끄|음소거|조용히|다이나믹|방해금지)",
            "NOTIFICATION_SETTINGS",
        ),
        (
            r"(알림|通知|notification).*(켜줘|켜기|unmute|on|enable|다시\s*켜|알림\s*복구)",
            "NOTIFICATION_SETTINGS",
        ),
        (
            r"(알림|通知|notification).*(설정|변경|조정|조회|상태)",
            "NOTIFICATION_SETTINGS",
        ),
        # Utility: Weather — "비" requires weather context (와/온다/예보/etc) to avoid matching "비교"
        (
            r"(오늘|내일|어제|이번주|주말).*(날씨|weather|기온|눈|맑음|흐림)",
            "UTILITY_WEATHER",
        ),
        (
            r"(오늘|내일|어제|이번주|주말).*(비).*?(와|온다|예보|오나요|올까|올|줄|왔다|오네|오나)",
            "UTILITY_WEATHER",
        ),
        (r"(날씨|weather).*(알려|어때|어떻|뭐|보여|말해|알려줘)", "UTILITY_WEATHER"),
        (r"(비|눈|맑음|흐림).*(와|온다|예보|오나요|올까)", "UTILITY_WEATHER"),
        # Utility: Time
        (r"(지금|현재|now).*(몇시|시간|time|몇\s*시)", "UTILITY_TIME"),
        (r"(오늘|today).*(날짜|며칠|date|몇\s*일)", "UTILITY_TIME"),
        (r"(몇\s*시|시간\s*알려|시간\s*말해|지금\s*시각|현재\s*시간)", "UTILITY_TIME"),
        # Utility: Calculator
        (r"(^[\d\s\+\-\*\/\^\.\(\)]+=[\d\s]*$)", "UTILITY_CALCULATOR"),
        (r"(계산|calc|calculate).*?[\d\+\-\*\/]", "UTILITY_CALCULATOR"),
        (
            r"([\d\s]+[\+\-\*\/][\d\s]+(은|는|이|가|을|를)?\s*얼마)",
            "UTILITY_CALCULATOR",
        ),
        # ORDER — specific patterns must come before generic "주문|발주|order"
        (
            r"(방금|직전|논의한).*(주문안|추천\s*주문|발주안).*(확정\s*전|최종\s*확정).*(체크리스트|점검)",
            "ORDER",
        ),
        (
            r"(주문안|추천\s*주문|발주안).*(확정\s*전).*(체크리스트|점검)",
            "ORDER",
        ),
        (
            r"(완료\s*안\s*된|완료안된|미완료|대기\s*중|대기중|미처리|보류).*(항목|액션|할\s*일|todo)",
            "ACTIONS_TODO",
        ),
        (
            r"(지금\s*할\s*일|할\s*일만|해야\s*할\s*일|to-?do|todo|체크리스트)",
            "ACTIONS_TODO",
        ),
        (
            r"(완료된\s*(것|항목|액션).*(제외|빼고)|완료\s*제외)",
            "ACTIONS_TODO",
        ),
        (
            r"(지난주|전주|저번주).*(월요일|화요일|수요일|목요일|금요일|토요일|일요일).*(처럼|같이|주문해줘|주문해 줘|주문)",
            "order_like_reference",
        ),
        # ── Screen guide / AI insights — must come before ORDER ──
        (
            r"(이\s*화면|이\s*페이지|지금\s*이\s*화면|여기\s*화면).*(뭘|무엇|어떤|뭐).*(봐|보면|확인|중요|핵심|요약|설명)",
            "AI_INSIGHTS",
        ),
        (
            r"(화면|페이지|이\s*화면|이\s*페이지).*(요약|설명|가이드|정리|핵심|중요|요점)",
            "AI_INSIGHTS",
        ),
        (
            r"(지금\s*뭘|지금\s*무엇을|뭘\s*먼저|무엇을\s*먼저).*(보면|봐|확인|중요|핵심)",
            "AI_INSIGHTS",
        ),
        (
            r"(AI\s*검증|ai\s*insights|검증\s*화면|검증\s*결과|신뢰도).*(요약|설명|알려|보여|확인|정리|핵심|근거)",
            "AI_INSIGHTS",
        ),
        (
            r"(개선\s*포인트|개선\s*사항|더\s*나은\s*방법|어떻게\s*개선|개선\s*방안)",
            "AI_INSIGHTS",
        ),
        (r"(주문|발주).*(빼고|제외|빼줘)", "order_exclude_item"),
        # ── BENCHMARK — must come before PRODUCT_SALES_COMPARISON (일평균/타점포/다른매장) ──
        (
            r"(오늘|금일).*(일평균|일\s*평균).*(타\s*점포|다른\s*매장|다른\s*점포|평균).*(비교|대비|차이|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(오늘|금일).*(매출).*(타\s*점포|다른\s*매장|다른\s*점포|평균).*(비교|대비|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(이번\s*달|이번\s*월|이번\s*기간).*(일평균|일\s*평균).*(타\s*점포|다른\s*매장|다른\s*점포|평균|벤치마크).*(비교|대비|차이|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(타\s*점포|다른\s*매장|다른\s*점포|전체\s*평균|비교군).*(매출|평균|비교|대비|차이)",
            "BENCHMARK",
        ),
        (
            r"(매출|실적|판매|수익).*?(타\s*점포|다른\s*매장|전체\s*평균|벤치마크).*(비교|대비|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(일평균|일\s*평균).*(타\s*점포|다른\s*매장|전체\s*평균|벤치마크)",
            "BENCHMARK",
        ),
        (
            r"우리\s*매장.*(일평균|평균).*매출.*(다른\s*점포|타\s*점포|평균).*(어때|어떻|위치|비교)",
            "BENCHMARK",
        ),
        (
            r"(클러스터|상권|타\s*점포|점포 평균).*평균.*(강점|약점|차이|위치|비교)",
            "BENCHMARK",
        ),
        # ── DELIVERY COUNT / CHANNEL ORDER ANALYSIS ──
        # Must come before product/order comparison rules: "배달 주문 건수" is
        # channel order-count analysis, not 발주 주문량 or a product name.
        (
            r"(전\s*월|전월|지난\s*달|전\s*주|전주|지난\s*주).*(배달|딜리버리|쿠팡|쿠팡이츠|배민|해피오더|BM1).*(건\s*수|건수|주문\s*건\s*수|주문건수|주문\s*수|비교|대비)",
            "CHANNEL_ANALYSIS",
        ),
        (
            r"(배달|딜리버리|쿠팡|쿠팡이츠|배민|해피오더|BM1).*(건\s*수|건수|주문\s*건\s*수|주문건수|주문\s*수).*(전\s*월|전월|지난\s*달|전\s*주|전주|지난\s*주|비교|대비|알려|보여)?",
            "CHANNEL_ANALYSIS",
        ),
        (
            r"(배달|딜리버리|쿠팡|쿠팡이츠|배민|해피오더|BM1).*(채널\s*별|채널별).*(주문|건\s*수|건수)",
            "CHANNEL_ANALYSIS",
        ),
        # ── PRODUCT_SALES_COMPARISON — must come before ORDER rules (전주/전월 비교해) ──
        # Short-form: "글레이즈드 전월 비교" (no 매출 keyword needed)
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*[a-zA-Z가-힣]{2,20}.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년).*비교",
            "PRODUCT_SALES_COMPARISON",
        ),
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*비교.*[가-힣a-zA-Z]{2,20}.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년)",
            "PRODUCT_SALES_COMPARISON",
        ),
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*[가-힣a-zA-Z]{2,20}.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년).*(매출|수량|판매|금액)",
            "PRODUCT_SALES_COMPARISON",
        ),
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*[가-힣a-zA-Z]{2,20}.*매출.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년|대비|비교|vs|차이|변화)",
            "PRODUCT_SALES_COMPARISON",
        ),
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*[가-힣a-zA-Z]{2,20}.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년|비교|대비|어때|더\s*좋|얼마|얼마나).*(매출|수량|판매|금액|어때)",
            "PRODUCT_SALES_COMPARISON",
        ),
        (
            r"(?!.*(일평균|타\s*점포|다른\s*매장|다른\s*점포|점포\s*평균|그룹\s*평균|상권\s*평균)).*[가-힣a-zA-Z]{2,20}.*매출.*(전일|전\s*일|어제|전날|전주|전\s*주|지난주|지난\s*주|전월|전\s*월|지난달|지난\s*달|저번달|저번\s*달|전년|전\s*년|작년|비교|대비|어때|더\s*좋|얼마|얼마나)",
            "PRODUCT_SALES_COMPARISON",
        ),
        # ── ORDER ──
        (r"(전주|전전주|전월).*(기준|옵션|비교|차이|요약|비교해)", "ORDER"),
        (r"(옵션|추천\s*옵션|마감\s*전).*(보여|알려|비교|차이|요약|근거)", "ORDER"),
        (r"(각\s*옵션|각각|비교).*(근거|이유|왜|설명|기준|차이|요약)", "ORDER"),
        (r"(최종\s*선택|선택\s*전|확정\s*전).*(차이|요약|비교|정리)", "ORDER"),
        (
            r"(단체\s*주문|단체주문).*(제외|빼고|빼줘|제외하고\s*다시|재계산)",
            "order_exclude_item",
        ),
        (
            r"(작년|전년).*(추석|설|크리스마스|T데이|티데이).*(주문).*(비교|처럼|참고)",
            "order_compare_special",
        ),
        (
            r"(이상\s*감지|이상\s*징후|이상\s*있어|문제\s*있어|문제\s*있나)",
            "PRODUCTION",
        ),
        (r"(지금\s*상태|현재\s*상태).*(어때|어떻|요약|보여)", "PRODUCTION"),
        (r"(소진\s*위험\s*품목|재고\s*소진\s*위험|품절\s*위험)", "PRODUCTION"),
        (r"(위험|이슈|경보|알림).*(재고|소진|품절|혼잡|피크)", "PRODUCTION"),
        (r"(1차|2차|1\s*차|2\s*차).*(생산|권장|추천|수량|기준)", "PRODUCTION"),
        (
            r"(생산\s*권장|권장\s*생산|생산\s*추천|추천\s*생산|생산량|몇\s*개\s*만들)",
            "PRODUCTION",
        ),
        (
            r"(1시간|한\s*시간|\d\s*시간).*(뒤|후|이후|나중).*(재고|예상|예측|남아|소진)",
            "PRODUCTION",
        ),
        (
            r"(현재\s*재고|재고\s*현황|재고\s*상태|부족\s*예상|부족\s*품목)",
            "PRODUCTION",
        ),
        (r"(왜|어째서|무슨).*(알림|경보|알림이\s*뜬|알림이\s*떴)", "PRODUCTION"),
        (r"(재고|품절|stockout|생산|만들)", "PRODUCTION"),
        (r"(주문|발주|order)", "ORDER"),
        (r"(미대응|찬스\s*로스|기회\s*손실|예상\s*손실|손실\s*확인|손실\s*예상).*(생산|재고|품절|부족)?", "PRODUCTION"),
        (r"(손실|찬스\s*로스|기회\s*손실|미대응).*(확인|알려|보여|어려|분석|계산)", "PRODUCTION"),
        (r"(폐기|waste|버린|로스)", "WASTE"),
        (
            r"(이번\s*달|이번\s*월|이번\s*기간).*(일평균|일\s*평균).*(타\s*점포|다른\s*매장|다른\s*점포|평균|벤치마크).*(비교|대비|차이|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(타\s*점포|다른\s*매장|다른\s*점포|전체\s*평균|비교군).*(매출|평균|비교|대비|차이)",
            "BENCHMARK",
        ),
        (
            r"(매출|실적|판매|수익).*?(타\s*점포|다른\s*매장|전체\s*평균|벤치마크).*(비교|대비|어떻|어때)",
            "BENCHMARK",
        ),
        (
            r"(일평균|일\s*평균).*(타\s*점포|다른\s*매장|전체\s*평균|벤치마크)",
            "BENCHMARK",
        ),
        # ── DELIVERY_CHANNEL_REVENUE: single-period delivery channel breakdown ──
        (
            r"(이번\s*?[1-9]\s*월|이번[1-9]\s*?\s*월|1[0-2]\s*월|[1-9]\s*월).*(배달|채널).*매출",
            "DELIVERY_CHANNEL_REVENUE",
        ),
        (
            r"(배달|채널|딜리버리|쿠팡|배민|해피오더).*(매출|비중|기여도).*(알려|보여|어때|현황)?",
            "DELIVERY_CHANNEL_REVENUE",
        ),
        (
            r"((20\d{2}|2026)\s*년\s*[1-9]?[0-2]\s*월|[1-9]?[0-2]\s*월).*?(배달|채널).*매출",
            "DELIVERY_CHANNEL_REVENUE",
        ),
        # ── CHANNEL_ANALYSIS (comparison-type delivery queries) ──
        (
            r"(채널|배달|딜리버리|쿠팡|배민|해피오더).*(매출|실적|판매|비교|분석|현황)",
            "CHANNEL_ANALYSIS",
        ),
        (
            r"(매출|실적|판매|수익).*(채널|배달|딜리버리|쿠팡|배민|해피오더)",
            "CHANNEL_ANALYSIS",
        ),
        (
            r"(배달|딜리버리|쿠팡|배민|해피오더).*(건\s*수|주문|비교|대비|어때|현황)",
            "CHANNEL_ANALYSIS",
        ),
        (
            r"(프로모션이|프로모션이란|프로모션\s*이|벤치마킹이|벤치마킹이란|벤치마크이).*(뭐|무슨|뭔|어떤|설명|정의|개념|알려)",
            "FAQ",
        ),
        # PROMO_ANALYSIS rules — must come before SALES_COMPARISON (매출 keyword overlap)
        (r"(프로모션|캠페인|행사|이벤트|T데이|티데이|D-day|D-Day|디데이|디\s*데이|다대아|디대이).*(기여|비교|대조|성과|결과|효과|어떻|어때|어땠|총|전체)", "PROMO_ANALYSIS"),
        (r"(어떤|어떤지|어떤\s*).*(프로모션|캠페인|행사|이벤트).*(기여|효과|성과|매출|반응|좋|높)", "PROMO_ANALYSIS"),
        (r"(이전|지난|직전|마지막).*(디데이|T데이|티데이|D-day|D-Day|디\s*데이|행사|프로모션|캠페인)", "PROMO_ANALYSIS"),
        (r"(비교|대비|차이).*?(프로모션|캠페인|행사|이벤트|T데이|티데이|D-day|D-Day|디데이|디\s*데이)", "PROMO_ANALYSIS"),
        (
            r"(T데이|티데이|행사|캠페인|프로모션|이벤트).*(어때|어떻|결과|성과|효과|전체적|요약|분석)",
            "PROMO_ANALYSIS",
        ),
        (
            r"(이번|금번|올해|올해\s*상반기|올해\s*하반기).*(T데이|티데이|행사|캠페인|프로모션|이벤트)",
            "PROMO_ANALYSIS",
        ),
        (r"(T데이|티데이|행사|캠페인|프로모션|이벤트)", "PROMO_ANALYSIS"),
        (r"(매출|실적|판매|수역)", "SALES_COMPARISON"),
        (r"(매출|실적|수입|수익).*?(비교|대비|vs|차이)", "SALES_COMPARISON"),
        (r"(전주|전월|전년|지난).*(매출|실적|판매)", "SALES_COMPARISON"),
        (r"(배달|딜리버리|쿠팡|배민|해피오더)", "CHANNEL_ANALYSIS"),
        (r"(상권|평균|다른\s*매장|벤치마크|벤치마킹|비교군)", "BENCHMARK"),
        (r"(순위|탑|top|가장\s*(많|높|인기))", "RANKING"),
        (r"(추세|트렌드|변화|추이|최근)", "TREND"),
        (r"(카테고리|종류|분류).*?(매출|판매|비율)", "CATEGORY"),
        (r"(오늘|어제|금일).*(매출|판매|실적|손익|이익|마진)", "DAILY_SUMMARY"),
        (r"(순이익|영업이익|원가|마진|이익률)", "SENSITIVE_BLOCKED"),
        (
            r"(system\s*prompt|시스템\s*프롬프트|프롬프트\s*보여|프롬프트\s*출력|prompt\s*injection)",
            "SENSITIVE_BLOCKED",
        ),
        (
            r"(hidden\s*store|STORE_001|다른\s*점포\s*데이터|다른\s*매장\s*비밀|다른\s*매장\s*원가|타\s*점포\s*마진)",
            "SENSITIVE_BLOCKED",
        ),
        (
            r"(env|environment|환경\s*변수|API\s*key|secret|token|password|비밀번호|인증\s*토큰)",
            "SENSITIVE_BLOCKED",
        ),
        # ── NOTICE intents — ordered: ACTION_REQUIRED > FILTER > LATEST > SUMMARY ──
        # More specific patterns first; SUMMARY is the catch-all at the end.
        (
            r"(조치\s*필요|바로\s*해야|즉시\s*처리|긴급\s*조치|점주.*해야|해야\s*할\s*것|바로\s*조치).*(공지|안내|알림)?",
            "NOTICE_ACTION_REQUIRED",
        ),
        (
            r"(공지|안내).*(조치\s*필요|바로\s*해야|즉시|긴급\s*조치|action\s*required)",
            "NOTICE_ACTION_REQUIRED",
        ),
        (
            r"(위생|점검|식품\s*안전|위생\s*점검|가격\s*인상|가격\s*정책|프로모션|공지).*(관련|공지|안내|만\s*보여|필터|검색|찾아|골라|선택)",
            "NOTICE_FILTER",
        ),
        (
            r"(위생|점검|식품\s*안전).*(공지|안내|관련|체크리스트|확인\s*사항|대비)",
            "NOTICE_FILTER",
        ),
        (
            r"(가격\s*인상|가격\s*변경|가격\s*정책).*(공지|안내|핵심|알려|요약|정리)",
            "NOTICE_FILTER",
        ),
        (
            r"(프로모션|이벤트|할인|쿠폰).*(공지|안내|점주|영향|관련)",
            "NOTICE_FILTER",
        ),
        (
            r"(미읽음|안\s*읽|읽지\s*않).*(공지|중요|긴급|필수|바로|조치|중요한)",
            "NOTICE_FILTER",
        ),
        (
            r"(공지|안내).*(미읽음|안\s*읽|읽지\s*않)",
            "NOTICE_FILTER",
        ),
        (
            r"(최신\s*공지|최근\s*공지|새\s*공지|오늘.*(공지|안내)|오늘\s*올라온|오늘\s*등록|공지\s*최신|공지\s*최근|공지\s*업데이트|신규\s*공지)",
            "NOTICE_LATEST",
        ),
        (
            r"(긴급\s*공지|공지\s*요약|공지\s*정리|공지\s*핵심|공지\s*중요|공지\s*요약해|공지\s*정리해|공지\s*알려|공지\s*무야|공지\s*뭐야|공지\s*뭐$)",
            "NOTICE_SUMMARY",
        ),
    ]

    def __init__(self, llm_gateway) -> None:
        self.llm = llm_gateway

    @staticmethod
    def _is_explicit_new_topic(query: str) -> bool:
        """Return True if the query is clearly a new topic, not a follow-up to the current page context.

        These questions should NEVER be routed to ORDER/ACTIONS/PRODUCTION just because
        the user happens to be on that page.
        """
        normalized = re.sub(r"\s+", "", query.strip().lower())
        if not normalized:
            return False

        # Identity / self-reference
        if re.search(
            r"(너는|너누구|당신는|당신누구|자기소개|봇이야|ai야|whoareyou|whatareyou|누구야|누구세요)",
            normalized,
        ):
            return True

        # Greetings
        if re.search(
            r"^(안녕|하이|헬로|hello|hi|반갑|좋은아침|좋은오후|좋은저녁|잘지내|어떻게지내)[!??.]*$",
            normalized,
        ):
            return True

        # General help / meta questions / capability questions
        if re.search(
            r"(도움말|도와줘|도움필요|helpme|사용법|이용방법|어떻게쓰|뭘할수있|뭐할수있|무엇을할수있|무엇을도와|뭘도와|뭘할줄|무엇을할수|어떤질문|어떤기능|도와줄수|어떤것을도와|기능소개|질문가능|할수있어|할줄알아)",
            normalized,
        ):
            return True

        # Weather / time / calculator — explicit utility questions
        if re.search(
            r"(날씨|weather|몇시|시간|지금시|오늘날짜|계산|calc|지금몇시|몇시야|시간알려|시간알려줘)",
            normalized,
        ):
            return True

        # Notification settings
        if re.search(
            r"(알림.*꺼|알림.*끄|알림.*켜|알림.*조용|알림.*음소거|notification.*mute|notification.*off|notification.*unmute|notification.*on|알림설정)",
            normalized,
        ):
            return True

        return False

    @staticmethod
    def _is_followup_query(query: str) -> bool:
        """Return True only for short deictic/anaphoric follow-up queries.

        Only truly ambiguous follow-up expressions qualify — these cannot
        stand alone as a complete question and MUST reference a prior turn.

        Explicit new-topic questions (identity, weather, time, calculator,
        notification, greeting, help) are NEVER follow-ups even if short.
        """
        normalized = re.sub(r"\s+", "", query.strip().lower())
        if not normalized:
            return False

        # Guard: if the query is an explicit new topic, it is NEVER a follow-up
        if IntentClassifier._is_explicit_new_topic(query):
            return False

        # Only short deictic/anaphoric expressions that cannot stand alone
        strict_patterns = {
            "왜",
            "왜?",
            "무슨뜻이야",
            "무슨뜻이야?",
            "그게무슨뜻이야",
            "그게무슨뜻이야?",
            "자세히",
            "다시설명",
            "다시설명해줘",
            "근거보여줘",
            "근거보여",
            "그거기준으로",
            "방금주문안기준으로",
            "이대로",
            "그대로",
        }
        return normalized in strict_patterns

    @staticmethod
    def _is_ambiguous_query(query: str) -> bool:
        compact = re.sub(r"\s+", "", query.strip())
        return len(compact) <= 8

    @staticmethod
    def _looks_like_opaque_token(query: str) -> bool:
        compact = re.sub(r"\s+", "", query.strip())
        return bool(re.fullmatch(r"[A-Za-z0-9_-]{2,16}", compact))

    @staticmethod
    def _looks_like_sales_period_comparison(query: str) -> bool:
        """Return true for store-level period sales comparisons, not product comparisons."""
        q = query.strip()
        has_sales_metric = bool(
            re.search(r"(매출|실적|총매출|누적\s*매출|전체\s*매출|일평균|영업일수|요일\s*구성)", q)
        )
        if not has_sales_metric:
            return False
        explicit_months = re.findall(r"\d{2,4}\s*년\s*\d{1,2}\s*월", q)
        if len(explicit_months) >= 2 and re.search(r"(비교|대비|차이|어때|어떻)", q):
            return True
        if re.search(r"(전년|작년|동월)", q) and re.search(
            r"(비교|대비|차이|어때|어떻)", q
        ):
            return True
        if re.search(r"(전체\s*매출|총매출|누적\s*매출|영업일수|요일\s*구성)", q) and re.search(
            r"(비교|대비|차이)", q
        ):
            return True
        return False

    @staticmethod
    def _normalize_history_intent(raw_intent: str | None) -> str | None:
        if not raw_intent:
            return None
        upper = str(raw_intent).upper()
        if upper in {
            "ACTIONS_TODO",
            "PRODUCTION",
            "ORDER",
            "WASTE",
            "FAQ",
            "SENSITIVE_BLOCKED",
            "IDENTITY",
            "GREETING",
            "GENERAL_HELP",
            "UTILITY_WEATHER",
            "UTILITY_TIME",
            "UTILITY_CALCULATOR",
            "NOTIFICATION_SETTINGS",
            "NOTICE_SUMMARY",
            "NOTICE_LATEST",
            "NOTICE_FILTER",
            "NOTICE_ACTION_REQUIRED",
            "AI_INSIGHTS",
        }:
            return upper
        if upper == "PRODUCT_SALES_COMPARISON":
            return "PRODUCT_SALES_COMPARISON"
        if upper in {
            "SALES",
            "SALES_COMPARISON",
            "DAILY_SUMMARY",
            "TREND",
            "CATEGORY",
            "CHANNEL_ANALYSIS",
            "PROMO_ANALYSIS",
            "BENCHMARK",
            "RANKING",
        }:
            return "SALES_COMPARISON" if upper == "SALES" else upper
        # order_like_reference, order_exclude_item, order_compare_special
        if upper.startswith("ORDER_"):
            return "ORDER"
        return None

    @staticmethod
    def _looks_like_actions_query(query: str) -> bool:
        if re.search(r"(할\s*일|to-?do|todo|액션|체크리스트)", query, re.IGNORECASE):
            return True
        if re.search(
            r"(이\s*화면|현재\s*화면|여기).*(뭘|무엇).*(봐|확인)", query, re.IGNORECASE
        ):
            return True
        if re.search(
            r"(우선순위|먼저|가장\s*급한|핵심\s*이슈|핵심\s*할\s*일)",
            query,
            re.IGNORECASE,
        ):
            return True
        if re.search(r"(오늘|지금).*(핵심\s*이슈|요약|상태)", query, re.IGNORECASE):
            return True
        if re.search(
            r"(완료\s*안|완료안|미완료|대기|미처리|보류)", query, re.IGNORECASE
        ) and re.search(
            r"(항목|리스트|목록|건|것)",
            query,
            re.IGNORECASE,
        ):
            return True
        return bool(re.search(r"(뭘|무엇).*(먼저|우선).*처리", query))

    @staticmethod
    def _actions_sub_intent(query: str) -> str:
        normalized = str(query or "")
        if re.search(
            r"(이\s*화면|현재\s*화면|여기).*(뭘|무엇).*(봐|확인)",
            normalized,
            re.IGNORECASE,
        ):
            return "ACTIONS_SCREEN_GUIDE"
        if re.search(
            r"(우선순위|먼저|가장\s*급한|급한\s*것|핵심\s*할\s*일)",
            normalized,
            re.IGNORECASE,
        ):
            return "ACTIONS_PRIORITY"
        if re.search(
            r"(오늘|지금).*(핵심\s*이슈|요약|상태)", normalized, re.IGNORECASE
        ):
            return "ACTIONS_SUMMARY"
        if re.search(
            r"(완료된|완료한).*(항목|액션|할\s*일)", normalized, re.IGNORECASE
        ) and not re.search(
            r"(제외|빼고|미완료|안)",
            normalized,
            re.IGNORECASE,
        ):
            return "ACTIONS_COMPLETED"
        if re.search(r"(보류|hold|on\s*hold|나중에)", normalized, re.IGNORECASE):
            return "ACTIONS_HOLD"
        if re.search(
            r"(완료\s*안|완료안|미완료|미처리|대기\s*중|대기중)",
            normalized,
            re.IGNORECASE,
        ):
            return "ACTIONS_INCOMPLETE"
        return "ACTIONS_LIST"

    @staticmethod
    def _notice_sub_intent(query: str) -> tuple[str, dict[str, Any]]:
        """Parse notice-related query into sub-intent and filter parameters."""
        normalized = str(query or "").lower()
        params: dict[str, Any] = {}

        # Category filter extraction
        if re.search(r"(위생|점검|식품\s*안전|식안)", normalized):
            params["category"] = "위생"
        elif re.search(
            r"(가격\s*인상|가격\s*변경|가격\s*정책|요금\s*인상)", normalized
        ):
            params["category"] = "가격정책"
        elif re.search(r"(프로모션|이벤트|할인|쿠폰)", normalized):
            params["category"] = "프로모션"
        elif re.search(r"(교육|바리스타|자격|연수)", normalized):
            params["category"] = "교육"
        elif re.search(r"(시스템|단말기|결제|pos|기기)", normalized):
            params["category"] = "시스템"
        elif re.search(r"(인사|직원|채용|근태)", normalized):
            params["category"] = "인사"
        elif re.search(r"(디자인|시즌|데코레이션|매장\s*디자인)", normalized):
            params["category"] = "디자인"
        elif re.search(r"(마케팅|이미지|온라인|앱)", normalized):
            params["category"] = "마케팅"
        elif re.search(r"(재무|회계|세무|분기\s*보고)", normalized):
            params["category"] = "재무"

        # Action required filter
        if re.search(
            r"(조치\s*필요|바로\s*해야|즉시|긴급\s*조치|action\s*required|필수|바로\s*처리)",
            normalized,
        ):
            params["action_required"] = True

        # Unread filter
        if re.search(r"(미읽음|안\s*읽|읽지\s*않)", normalized):
            params["unread_only"] = True

        # Urgent filter
        if re.search(r"(긴급|urgent|필수|즉시)", normalized):
            params["urgent_only"] = True

        # Today/recent filter
        if re.search(r"(오늘|금일|이번\s*시작)", normalized):
            params["today_only"] = True

        # Determine sub-intent
        if re.search(
            r"(조치\s*필요|바로\s*해야|즉시\s*처리|긴급\s*조치|점주.*해야|해야\s*할\s*것|바로\s*조치)",
            normalized,
        ):
            return "NOTICE_ACTION_REQUIRED", params
        if re.search(r"(최신|최근|새\s*공지|오늘\s*공지|업데이트)", normalized):
            return "NOTICE_LATEST", params
        if (
            params.get("category")
            or params.get("unread_only")
            or params.get("urgent_only")
        ):
            return "NOTICE_FILTER", params
        return "NOTICE_SUMMARY", params

    @staticmethod
    def _notification_settings_sub_intent(query: str) -> tuple[str, dict[str, Any]]:
        """Parse notification settings query for sub-intent and parameters."""
        import re

        normalized = str(query or "")
        lowered = normalized.lower()
        params: dict[str, Any] = {}

        is_status_query = bool(
            re.search(r"(설정|조회|상태|어떻게|확인|보여)", normalized, re.IGNORECASE)
        )
        is_unmute_query = bool(
            re.search(r"(켜줘|켜기|on|enable|다시.*켜)", normalized, re.IGNORECASE)
        )
        is_mute_query = bool(
            re.search(
                r"(꺼줘|끄기|mute|off|disable|꺼|끄|음소거|조용히|방해금지)",
                normalized,
                re.IGNORECASE,
            )
        )

        if is_status_query and not is_mute_query and not is_unmute_query:
            sub_intent = "NOTIFICATION_STATUS"
        elif is_unmute_query:
            sub_intent = "NOTIFICATION_UNMUTE"
        else:
            sub_intent = "NOTIFICATION_MUTE"

        # Extract duration
        hour_match = re.search(r"(\d+)\s*시간", normalized)
        minute_match = re.search(r"(\d+)\s*분", normalized)
        if hour_match:
            params["duration_minutes"] = int(hour_match.group(1)) * 60
        elif minute_match:
            params["duration_minutes"] = int(minute_match.group(1))
        elif "오늘" in normalized:
            # Snooze until end of day
            from datetime import datetime, timedelta

            now = datetime.now()
            end_of_day = now.replace(hour=23, minute=59, second=59)
            params["duration_minutes"] = int((end_of_day - now).total_seconds() / 60)

        # Extract categories
        categories = []
        if "재고" in normalized or "inventory" in lowered:
            categories.append("재고")
        if "주문" in normalized or "발주" in normalized or "order" in lowered:
            categories.append("주문")
        if "할일" in normalized or "할 일" in normalized or "actions" in lowered:
            categories.append("할일")
        if "매출" in normalized or "analytics" in lowered:
            categories.append("매출")
        if "실시간" in normalized or "생산" in normalized or "production" in lowered:
            categories.append("실시간")
        if categories:
            params["categories"] = categories

        channels = []
        if (
            "앱내" in normalized
            or "앱 내" in normalized
            or "인앱" in normalized
            or "in-app" in lowered
            or "in_app" in lowered
        ):
            channels.append("앱 내")
        if "푸시" in normalized or "push" in lowered:
            channels.append("푸시")
        if "이메일" in normalized or "메일" in normalized or "email" in lowered:
            channels.append("이메일")
        if channels:
            params["channels"] = channels

        # Check scope
        if sub_intent == "NOTIFICATION_STATUS":
            params["scope"] = "status"
        elif (
            "전체" in normalized or "모든" in normalized or not (categories or channels)
        ):
            params["scope"] = "all"
        elif channels and categories:
            params["scope"] = "mixed"
        elif channels:
            params["scope"] = "channels"
        else:
            params["scope"] = "categories"

        return sub_intent, params

    @staticmethod
    def _utility_weather_params(query: str) -> dict[str, Any]:
        """Extract weather query parameters."""
        normalized = str(query or "")
        params: dict[str, Any] = {"location": "서울"}  # Default location

        if "내일" in normalized or "tomorrow" in normalized.lower():
            params["when"] = "tomorrow"
        elif "어제" in normalized or "yesterday" in normalized.lower():
            params["when"] = "yesterday"
        else:
            params["when"] = "today"

        # Check for specific weather interest
        if "비" in normalized or "rain" in normalized.lower():
            params["focus"] = "rain"
        elif "눈" in normalized or "snow" in normalized.lower():
            params["focus"] = "snow"
        elif "추위" in normalized or "cold" in normalized.lower():
            params["focus"] = "temperature"
        elif "더위" in normalized or "hot" in normalized.lower():
            params["focus"] = "temperature"

        return params

    @staticmethod
    def _utility_calculator_params(query: str) -> dict[str, Any]:
        """Extract calculator parameters."""
        import re

        normalized = str(query or "")
        params: dict[str, Any] = {}

        # Extract expression
        # Remove Korean text and keep only math expression
        expr = re.sub(r"[^\d\s\+\-\*\/\^\.\(\)]", "", normalized)
        expr = expr.strip()

        if expr:
            params["expression"] = expr

        return params

    def _context_hint_intent(self, context: dict[str, Any] | None) -> str | None:
        if not context:
            return None
        current_page = str(context.get("current_page") or "")
        page_key = str(context.get("page_key") or "").lower()
        page_context = str(context.get("page_context") or "").lower()
        normalized = f"{current_page} {page_key} {page_context}"
        if "orders" in normalized or "발주" in normalized:
            return "ORDER"
        if "actions" in normalized or "할일" in normalized or "todo" in normalized:
            return "ACTIONS_TODO"
        if "/realtime" in normalized or "실시간" in normalized:
            return "PRODUCTION"
        if "dashboard" in normalized or "대시보드" in normalized:
            return "PRODUCTION"

        if current_page.startswith("/orders"):
            return "ORDER"
        if current_page.startswith("/actions"):
            return "ACTIONS_TODO"
        if current_page in {"/", "/dashboard"}:
            return "SALES_COMPARISON"
        if current_page == "/realtime":
            return "PRODUCTION"
        if current_page == "/ai-insights" or page_key == "ai_insights":
            return "AI_INSIGHTS"
        # POS notice-board context — notice questions get NOTICE_SUMMARY hint
        if "notice" in normalized or "공지" in normalized or page_key == "pos_notice":
            return "NOTICE_SUMMARY"
        return None

    @staticmethod
    def _order_sub_intent(query: str, *, is_followup: bool = False) -> str:
        normalized = str(query or "")
        if re.search(
            r"(방금|직전|논의한).*(주문안|추천\s*주문|발주안).*(확정\s*전|최종\s*확정).*(체크리스트|점검)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_PRECONFIRM_CHECKLIST"
        if re.search(
            r"(주문안|추천\s*주문|발주안).*(확정\s*전).*(체크리스트|점검)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_PRECONFIRM_CHECKLIST"
        if re.search(
            r"(추천\s*주문|추천안|발주안).*(확정|실행|진행|발주해)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_CONFIRM_REQUEST"
        if re.search(
            r"(최근\s*주문\s*\d*건|최근\s*주문).*(기준|조정|맞춰|반영)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_RECENT_ADJUST"
        if re.search(
            r"(발주|주문).*(필요한\s*품목|필요\s*품목|부족\s*품목|품목만)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_NEEDED_ITEMS"
        if re.search(r"(전주.*대비|근거|이유|왜|설명|수치)", normalized, re.IGNORECASE):
            return "ORDER_RATIONALE"
        if re.search(
            r"(추천\s*주문|주문\s*추천|발주\s*추천|보여줘|보여 줘)",
            normalized,
            re.IGNORECASE,
        ):
            return "ORDER_RECOMMEND"
        if is_followup and re.search(
            r"(왜|무슨\s*뜻|다시\s*설명|근거)", normalized, re.IGNORECASE
        ):
            return "ORDER_RATIONALE"
        return "ORDER_RECOMMEND"

    @staticmethod
    def _looks_like_order_query(query: str) -> bool:
        return bool(
            re.search(
                r"(주문|발주|추천\s*주문|확정|수량|옵션|납품)",
                query,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _looks_like_dashboard_issue_query(query: str) -> bool:
        return bool(
            re.search(
                r"(위험|이슈|경보|알림|문제|급감|소진|혼잡|피크)",
                query,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _looks_like_notice_query(query: str) -> bool:
        """Return True if the query appears to be about notices/announcements."""
        return bool(
            re.search(
                r"(공지|안내|긴급|미읽음|점검|위생|가격\s*인상|가격\s*정책|프로모션\s*공지|조치\s*필요|공지\s*요약|공지\s*핵심|공지\s*정리)",
                query,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _looks_like_status_query(query: str) -> bool:
        return bool(
            re.search(
                r"(지금\s*상태|현재\s*상태|상태\s*어때|이상\s*감지|이상\s*징후)",
                query,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _production_sub_intent(query: str) -> str:
        normalized = str(query or "")
        if re.search(
            r"(1차|2차|1\s*차|2\s*차).*(생산|권장|추천|수량|기준)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_RECOMMENDATION"
        if re.search(
            r"(생산\s*권장|권장\s*생산|생산\s*추천|추천\s*생산|생산량|몇\s*개\s*만들)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_RECOMMENDATION"
        if re.search(
            r"(1시간|한\s*시간|\d\s*시간).*(뒤|후|이후|나중).*(재고|예상|예측|남아|소진)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_FORECAST"
        if re.search(
            r"(현재\s*재고|재고\s*현황|재고\s*상태|부족\s*예상|부족\s*품목)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_INVENTORY_RISK"
        if re.search(
            r"(소진\s*위험\s*품목|재고\s*소진\s*위험|품절\s*위험)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_INVENTORY_RISK"
        if re.search(
            r"(왜|어째서|무슨).*(알림|경보|알림이\s*뜬|알림이\s*떴)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_ANOMALY"
        if re.search(
            r"(이상\s*감지|이상\s*징후|문제\s*있어|문제\s*있나)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_ANOMALY"
        if re.search(
            r"(지금\s*상태|현재\s*상태|상태\s*어때|상태\s*요약)",
            normalized,
            re.IGNORECASE,
        ):
            return "PRODUCTION_STATUS"
        return "PRODUCTION_ALERTS"

    def _resolve_followup_query(
        self, query: str, recent_messages: list[dict] | None
    ) -> tuple[str, str | None]:
        """Resolve a short deictic follow-up by attaching anchor context.

        CRITICAL: Only resolves when the query is a true follow-up (per
        _is_followup_query) AND the current RULES classification does NOT
        match any explicit new-topic intent. This prevents context bleed
        where identity/weather/time/notification questions get hijacked
        by the previous ORDER/ACTIONS anchor.
        """
        if not self._is_followup_query(query):
            return query, None
        if not recent_messages:
            return query, None

        # Double-check: if the current query matches a RULE for an
        # explicit new topic (IDENTITY, GREETING, UTILITY_*, NOTIFICATION),
        # do NOT attach anchor — return as-is so the rule match wins.
        explicit_new_topic_intents = {
            "IDENTITY",
            "GREETING",
            "GENERAL_HELP",
            "UTILITY_WEATHER",
            "UTILITY_TIME",
            "UTILITY_CALCULATOR",
            "NOTIFICATION_SETTINGS",
        }
        for pattern, intent in self.RULES:
            if intent in explicit_new_topic_intents and re.search(
                pattern, query, re.IGNORECASE
            ):
                return query, None

        anchor_user = None
        anchor_intent = None
        for item in reversed(recent_messages):
            role = str(item.get("role") or "").lower()
            content = str(item.get("content") or "").strip()
            if not anchor_intent:
                anchor_intent = self._normalize_history_intent(item.get("intent"))
            if role == "user" and content and not self._is_followup_query(content):
                anchor_user = content
                break

        if anchor_user:
            if not anchor_intent:
                for pattern, intent in self.RULES:
                    if re.search(pattern, anchor_user, re.IGNORECASE):
                        anchor_intent = self._normalize_history_intent(intent) or intent
                        break
            compact_query = re.sub(r"\s+", "", query.strip().lower())
            if compact_query.startswith("왜"):
                return anchor_user, anchor_intent
            if "근거" in compact_query:
                return f"{anchor_user} 근거를 보여줘", anchor_intent
            if "자세히" in compact_query or "설명" in compact_query:
                return f"{anchor_user} 자세히 설명해줘", anchor_intent
            return f"{anchor_user} (후속 질문: {query})", anchor_intent
        return query, anchor_intent

    async def classify(
        self,
        query: str,
        store_id: str,
        *,
        context: dict[str, Any] | None = None,
        session_id: str | None = None,
        recent_messages: list[dict] | None = None,
        trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Classify a query and extract basic parameters."""
        started_at = perf_counter()
        try:
            resolved_query, anchor_intent = self._resolve_followup_query(
                query, recent_messages
            )
            if self._is_followup_query(query) and anchor_intent:
                payload = {
                    "intent": anchor_intent,
                    "confidence": "SESSION",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                }
                if anchor_intent == "ORDER":
                    payload["sub_intent"] = self._order_sub_intent(
                        resolved_query, is_followup=True
                    )
                if anchor_intent == "PRODUCTION":
                    payload["sub_intent"] = self._production_sub_intent(
                        resolved_query
                    )
                if anchor_intent == "ACTIONS_TODO":
                    payload["sub_intent"] = self._actions_sub_intent(resolved_query)
                return payload
            if self._looks_like_sales_period_comparison(resolved_query):
                return {
                    "intent": "SALES_COMPARISON",
                    "confidence": "RULE",
                    "params": self._extract_params_by_rule(
                        resolved_query, "SALES_COMPARISON"
                    ),
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                }
            for pattern, intent in self.RULES:
                if re.search(pattern, resolved_query, re.IGNORECASE):
                    payload = {
                        "intent": intent,
                        "confidence": "RULE",
                        "params": self._extract_params_by_rule(resolved_query, intent),
                        "llm_tokens_used": 0,
                        "resolved_query": resolved_query,
                    }
                    if intent == "ORDER":
                        payload["sub_intent"] = self._order_sub_intent(resolved_query)
                    if intent == "PRODUCTION":
                        payload["sub_intent"] = self._production_sub_intent(
                            resolved_query
                        )
                    if intent == "ACTIONS_TODO":
                        payload["sub_intent"] = self._actions_sub_intent(resolved_query)
                    if intent == "NOTIFICATION_SETTINGS":
                        notification_sub_intent, notification_params = (
                            self._notification_settings_sub_intent(resolved_query)
                        )
                        payload["sub_intent"] = notification_sub_intent
                        payload["params"].update(notification_params)
                    if intent in (
                        "NOTICE_SUMMARY",
                        "NOTICE_LATEST",
                        "NOTICE_FILTER",
                        "NOTICE_ACTION_REQUIRED",
                    ):
                        _, nparams = self._notice_sub_intent(resolved_query)
                        payload["params"].update(nparams)
                    if intent.startswith("order_"):
                        payload["sub_intent"] = intent.upper()
                    return payload

            if self._is_followup_query(query) and anchor_intent:
                payload = {
                    "intent": anchor_intent,
                    "confidence": "SESSION",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                }
                if anchor_intent == "ORDER":
                    payload["sub_intent"] = self._order_sub_intent(
                        resolved_query, is_followup=True
                    )
                return payload

            context_hint = self._context_hint_intent(context)
            # CRITICAL: If the query is an explicit new topic (identity, greeting,
            # utility, notification), NEVER fall through to context hint.
            # These must be classified by their own intent, not by the page context.
            if self._is_explicit_new_topic(query):
                # Let it fall through to LLM classification or RULES
                # (IDENTITY/GREETING/GENERAL_HELP/UTILITY_* should have been caught by RULES already)
                pass
            elif context_hint == "ACTIONS_TODO" and self._looks_like_actions_query(
                query
            ):
                return {
                    "intent": "ACTIONS_TODO",
                    "confidence": "CONTEXT",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                    "sub_intent": self._actions_sub_intent(resolved_query),
                }
            elif context_hint == "ORDER" and self._looks_like_order_query(query):
                return {
                    "intent": "ORDER",
                    "confidence": "CONTEXT",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                    "sub_intent": self._order_sub_intent(resolved_query),
                }
            elif (
                context_hint == "PRODUCTION"
                and self._looks_like_dashboard_issue_query(query)
            ):
                return {
                    "intent": "PRODUCTION",
                    "confidence": "CONTEXT",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                    "sub_intent": self._production_sub_intent(resolved_query),
                }
            elif context_hint == "NOTICE_SUMMARY" and self._looks_like_notice_query(
                query
            ):
                sub, nparams = self._notice_sub_intent(resolved_query)
                return {
                    "intent": sub,
                    "confidence": "CONTEXT",
                    "params": nparams,
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                }
            elif context_hint and self._is_followup_query(query):
                # Only use context hint for true follow-up phrases.
                # that are NOT explicit new topics.
                # CRITICAL: Short arbitrary inputs like "DKSS" must not be
                # hijacked by page context.
                # Also, NOTICE context must only be used for notice-like queries.
                if self._is_explicit_new_topic(query):
                    pass  # fall through to LLM classification
                elif (
                    context_hint == "NOTICE_SUMMARY"
                    and not self._looks_like_notice_query(query)
                ):
                    pass  # don't hijack non-notice queries to notice intent
                else:
                    payload = {
                        "intent": context_hint,
                        "confidence": "CONTEXT",
                        "params": {},
                        "llm_tokens_used": 0,
                        "resolved_query": resolved_query,
                    }
                    if context_hint == "ORDER":
                        payload["sub_intent"] = self._order_sub_intent(
                            resolved_query, is_followup=True
                        )
                    if context_hint == "PRODUCTION":
                        payload["sub_intent"] = self._production_sub_intent(
                            resolved_query
                        )
                    if context_hint == "ACTIONS_TODO":
                        payload["sub_intent"] = self._actions_sub_intent(resolved_query)
                    return payload

            if self._looks_like_opaque_token(query):
                return {
                    "intent": "FAQ",
                    "confidence": "RULE",
                    "params": {},
                    "llm_tokens_used": 0,
                    "resolved_query": resolved_query,
                }

            llm_result = await self._classify_with_llm(
                resolved_query,
                store_id,
                context=context,
                session_id=session_id,
                recent_messages=recent_messages,
                trace=trace,
            )
            llm_result["resolved_query"] = resolved_query
            if llm_result.get("intent") == "ORDER":
                llm_result["sub_intent"] = self._order_sub_intent(resolved_query)
            if llm_result.get("intent") == "PRODUCTION":
                llm_result["sub_intent"] = self._production_sub_intent(resolved_query)
            if llm_result.get("intent") == "ACTIONS_TODO":
                llm_result["sub_intent"] = self._actions_sub_intent(resolved_query)
            if llm_result.get("intent") == "NOTIFICATION_SETTINGS":
                notification_sub_intent, notification_params = (
                    self._notification_settings_sub_intent(resolved_query)
                )
                llm_result["sub_intent"] = notification_sub_intent
                llm_result.setdefault("params", {})
                llm_result["params"].update(notification_params)
            return llm_result
        finally:
            add_elapsed(trace, "classify_ms", started_at)

    def _extract_params_by_rule(self, query: str, intent: str) -> dict[str, Any]:
        """Extract lightweight parameters from a rule-matched query."""
        params: dict[str, Any] = {"intent": intent}
        year_month_patterns = [
            r"(\d{2,4})\s*년\s*(\d{1,2})\s*월",
            r"(20\d{2})[.-](\d{1,2})",
        ]
        dates_found: list[str] = []
        for pattern in year_month_patterns:
            matches = re.findall(pattern, query)
            for year_raw, month_raw in matches:
                year = int(year_raw)
                if year < 100:
                    year += 2000
                dates_found.append(f"{year}-{int(month_raw):02d}")

        if len(dates_found) >= 2:
            ordered_months = sorted(dates_found[:2])
            params["period1_month"] = ordered_months[0]
            params["period2_month"] = ordered_months[1]
        elif len(dates_found) == 1:
            params["period1_month"] = dates_found[0]

        if re.search(r"전\s*주|전주|지난\s*주", query):
            params["relative_period"] = "last_week"
        elif re.search(r"전\s*월|전월|지난\s*달|지난달", query):
            params["relative_period"] = "last_month"
        elif re.search(r"전년|작년|지난\s*해", query):
            params["relative_period"] = "last_year"
        elif re.search(r"어제", query):
            params["relative_period"] = "yesterday"
        elif re.search(r"오늘|금일", query):
            params["relative_period"] = "today"

        product_match = re.search(
            r'["\'](.+?)["\']|(\S+도넛|\S+크림|\S+글레이즈드|\S+라떼|\S+아메리카노)',
            query,
        )
        if product_match:
            params["product_name"] = product_match.group(1) or product_match.group(2)

        code_match = re.search(r"\b(\d{6})\b", query)
        if code_match:
            params["product_id"] = code_match.group(1)

        if intent == "order_like_reference":
            weekday_match = re.search(
                r"(월요일|화요일|수요일|목요일|금요일|토요일|일요일)", query
            )
            if weekday_match:
                target_weekday = self.WEEKDAY_MAP[weekday_match.group(1)]
                today = date.today()
                monday_this_week = today - timedelta(days=today.weekday())
                reference_date = (
                    monday_this_week
                    - timedelta(days=7)
                    + timedelta(days=target_weekday)
                )
                params["reference_date"] = reference_date.isoformat()
                params["reference_weekday"] = weekday_match.group(1)

        if intent == "order_exclude_item":
            option_match = re.search(r"(전주|전전주|전월)", query)
            if option_match:
                params["base_option"] = option_match.group(1)
            exclude_match = re.search(r"(.+?)(?:만)?\s*(빼고|제외|빼줘)", query)
            if exclude_match:
                raw_items = exclude_match.group(1)
                cleaned = re.sub(
                    r"(주문|발주|기준|옵션|에서|는|은|를|을)", " ", raw_items
                )
                params["exclude_items"] = [
                    item.strip()
                    for item in re.split(r"[,/]|그리고|\s+", cleaned)
                    if item.strip()
                ]

        if intent == "order_compare_special":
            period_match = re.search(r"(추석|설|크리스마스|T데이|티데이)", query)
            if period_match:
                period = period_match.group(1)
                params["period_name"] = "T데이" if period == "티데이" else period

        if intent == "PROMO_ANALYSIS":
            normalized = query.lower()
            promo_keywords = [
                (r"d[-\s.]?day|디\s*데이|디데이|다대아|디대이", "D-DAY"),
                (r"네이버\s*페이|네이버페이", "네이버페이"),
                (r"카카오\s*페이|카카오페이", "카카오페이"),
                (r"토스\s*페이|토스페이", "토스페이"),
                (r"해피\s*앱|해피앱", "해피앱"),
                (r"도넛\s*프라이데이|도넛프라이데이", "도넛프라이데이"),
                (r"글레이즈드", "글레이즈드"),
                (r"아메리카노", "아메리카노"),
                (r"런치\s*세트|런치세트", "런치세트"),
            ]
            for pattern, keyword in promo_keywords:
                if re.search(pattern, normalized, re.IGNORECASE):
                    params["promo_name"] = keyword
                    break
            if re.search(r"(높은\s*순서|순위|랭킹|기여.*커|기여도|매출.*높|반응.*좋)", query):
                params["analysis_mode"] = "ranking"
            elif re.search(r"(이전|지난|직전|비교|대비)", query):
                params["analysis_mode"] = "comparison"
            else:
                params["analysis_mode"] = "summary"

        if intent == "PRODUCT_SALES_COMPARISON":
            if re.search(r'전\s*일|어제|전날', query):
                params['period_type'] = 'day'
            elif re.search(r'전주|전\s*주|지난주|지난\s*주', query):
                params['period_type'] = 'week'
            elif re.search(r'전년|전\s*년|작년', query):
                params['period_type'] = 'year'
            elif re.search(r'전\s*월|전월|지난달|지난\s*달|저번달|저번\s*달', query):
                params['period_type'] = 'month'
            else:
                params['period_type'] = 'month'
            stripped = re.sub(
                r'(전\s*일|어제|전날|전주|전\s*주|지난주| 지난\s*주|'
                r'전\s*월|전월|지난달|지난\s*달|저번달|저번\s*달|'
                r'전년|전\s*년|작년|'
                r'대비|비교|vs|차이|변화|매출|수량|판매|금액|'
                r'전\s*월\s*대비|전\s*일\s*대비|'
                r'\s*(비교)?해줘|\s*(알려)?줘|'
                r'\s*어때?\s*?|보다?|얼마나|얼마|더\s*좋?|'
                r'오늘|금일|금액\s*비교)',
                ' ',
                query,
            ).strip().strip('? ')
            if stripped:
                params['product_name'] = stripped

        return params

    @staticmethod
    def _extract_json_object(raw: str) -> dict[str, Any] | None:
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
        return None

    def _fallback_intent_payload(
        self,
        query: str,
        *,
        context: dict[str, Any] | None = None,
        llm_tokens_used: int = 0,
    ) -> dict[str, Any]:
        # CRITICAL: Never let context hint override an explicit new topic.
        # If the query is identity/weather/time/notification/help, classify
        # as FAQ (generic) rather than hijacking it to ORDER/ACTIONS/PRODUCTION.
        if self._is_explicit_new_topic(query):
            return {
                "intent": "FAQ",
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": llm_tokens_used,
            }

        context_hint = self._context_hint_intent(context)
        if self._looks_like_order_query(query):
            return {
                "intent": "ORDER",
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": llm_tokens_used,
                "sub_intent": self._order_sub_intent(query),
            }
        if self._looks_like_actions_query(query):
            return {
                "intent": "ACTIONS_TODO",
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": llm_tokens_used,
                "sub_intent": self._actions_sub_intent(query),
            }
        if self._looks_like_dashboard_issue_query(
            query
        ) or self._looks_like_status_query(query):
            return {
                "intent": "PRODUCTION",
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": llm_tokens_used,
                "sub_intent": self._production_sub_intent(query),
            }
        if self._looks_like_notice_query(query):
            sub, nparams = self._notice_sub_intent(query)
            return {
                "intent": sub,
                "confidence": "FALLBACK",
                "params": nparams,
                "llm_tokens_used": llm_tokens_used,
            }
        if context_hint and self._is_followup_query(query):
            # NOTICE context must only be used for notice-like queries;
            # non-notice queries on a notice page should fall through to FAQ.
            if context_hint == "NOTICE_SUMMARY" and not self._looks_like_notice_query(
                query
            ):
                return {
                    "intent": "FAQ",
                    "confidence": "FALLBACK",
                    "params": {},
                    "llm_tokens_used": llm_tokens_used,
                }
            payload: dict[str, Any] = {
                "intent": context_hint,
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": llm_tokens_used,
            }
            if context_hint == "ORDER":
                payload["sub_intent"] = self._order_sub_intent(query, is_followup=True)
            if context_hint == "PRODUCTION":
                payload["sub_intent"] = self._production_sub_intent(query)
            if context_hint == "ACTIONS_TODO":
                payload["sub_intent"] = self._actions_sub_intent(query)
            return payload
        return {
            "intent": "FAQ",
            "confidence": "FALLBACK",
            "params": {},
            "llm_tokens_used": llm_tokens_used,
        }

    async def _classify_with_llm(
        self,
        query: str,
        store_id: str,
        *,
        context: dict[str, Any] | None = None,
        session_id: str | None = None,
        recent_messages: list[dict] | None = None,
        trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Fallback LLM classification when rules do not match."""
        if not self.llm.api_key:
            return {
                "intent": "FAQ",
                "confidence": "FALLBACK",
                "params": {},
                "llm_tokens_used": 0,
            }

        system_prompt = """당신은 던킨도너츠 매장 운영 AI의 질의 분류기입니다.
사용자 질의를 아래 카테고리 중 하나로 분류하고, 필요한 파라미터를 추출하세요.

카테고리: SALES_COMPARISON, CHANNEL_ANALYSIS, PRODUCT_SALES_COMPARISON,
PROMO_ANALYSIS, BENCHMARK, RANKING, TREND, CATEGORY, DAILY_SUMMARY,
PRODUCTION, ORDER, WASTE, order_like_reference, order_exclude_item,
order_compare_special, SENSITIVE_BLOCKED, FAQ

예시:
- "지난주 화요일처럼 주문해줘" -> {"intent":"order_like_reference","params":{"reference_date":"2026-04-07"}}
- "전주 주문안에서 빨대만 빼고" -> {"intent":"order_exclude_item","params":{"base_option":"전주","exclude_items":["빨대"]}}
- "작년 추석 연휴 전 주문과 비교해줘" -> {"intent":"order_compare_special","params":{"period_name":"추석"}}

반드시 JSON으로 응답:
{"intent": "...", "params": {"period1_month": "...", "period2_month": "...", "product_name": "...", "relative_period": "..."}}"""

        recent_context = []
        for item in (recent_messages or [])[-4:]:
            recent_context.append(
                {
                    "role": item.get("role"),
                    "content": item.get("content"),
                    "intent": item.get("intent"),
                }
            )

        try:
            result = await self.llm.call(
                purpose="intent_classification",
                system_prompt=system_prompt,
                user_prompt=(
                    f"store_id={store_id}\n"
                    f"session_id={session_id or '-'}\n"
                    f"context={json.dumps(context or {}, ensure_ascii=False)}\n"
                    f"recent_messages={json.dumps(recent_context, ensure_ascii=False)}\n"
                    f"질의: {query}"
                ),
                max_tokens=200,
                response_format={"type": "json_object"},
                trace=trace,
            )
        except Exception:
            return self._fallback_intent_payload(
                query, context=context, llm_tokens_used=0
            )

        llm_tokens = int(result.get("input_tokens", 0) or 0) + int(
            result.get("output_tokens", 0) or 0
        )
        parsed = self._extract_json_object(str(result.get("content") or ""))
        if not parsed:
            return self._fallback_intent_payload(
                query, context=context, llm_tokens_used=llm_tokens
            )

        intent = str(parsed.get("intent") or "FAQ")
        valid_intents = {
            "SALES_COMPARISON",
            "CHANNEL_ANALYSIS",
            "PRODUCT_SALES_COMPARISON",
            "PROMO_ANALYSIS",
            "BENCHMARK",
            "RANKING",
            "TREND",
            "CATEGORY",
            "DAILY_SUMMARY",
            "PRODUCTION",
            "ORDER",
            "WASTE",
            "order_like_reference",
            "order_exclude_item",
            "order_compare_special",
            "SENSITIVE_BLOCKED",
            "FAQ",
            "ACTIONS_TODO",
            "NOTICE_SUMMARY",
            "NOTICE_LATEST",
            "NOTICE_FILTER",
            "NOTICE_ACTION_REQUIRED",
        }
        if intent not in valid_intents:
            return self._fallback_intent_payload(
                query, context=context, llm_tokens_used=llm_tokens
            )

        return {
            "intent": intent,
            "confidence": "LLM",
            "params": parsed.get("params", {}),
            "llm_tokens_used": llm_tokens,
        }
