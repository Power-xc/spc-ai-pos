import type {
  MobileStore,
  NoticeItem,
  NotificationItem,
  PipAiAlert,
  DailySalesData,
  AiAction,
  EventScheduleData,
  ReviewData,
  ReviewFullData,
  StorePageData,
  OrderPageData,
  OrderSubmitResult,
  OrderSubmitSlot,
  OrderItemConfirmed,
  ProductionOrder,
  PerformanceSimulatorData,
  TodoItem,
} from "../types";

import aiAction01 from "@/mobile/assets/ico-action01.svg"
import aiAction02 from "@/mobile/assets/ico-action02.svg"

function mockDelay<T>(data: T): Promise<T> {
  return Promise.resolve(data);
}

const mockStores: MobileStore[] = [
  { id: "store-001", name: "강남 1호점", notificationCount: 3 },
  { id: "store-002", name: "강남 2호점", notificationCount: 0 },
  { id: "store-003", name: "홍대점",     notificationCount: 1 },
];

export function getMobileStore(): Promise<MobileStore> {
  return mockDelay(mockStores[0]);
}

export function getMobileStores(): Promise<MobileStore[]> {
  return mockDelay(mockStores);
}

const mockNotices: NoticeItem[] = [
  { id: "notice-001", text: "점주앱 공지사항 사용 테스트" },
  { id: "notice-002", text: "4월 신메뉴 출시 안내" },
];

export function getMobileNotices(): Promise<NoticeItem[]> {
  return mockDelay(mockNotices);
}

const mockNotifications: NotificationItem[] = [
  { id: "n-001", title: "초코 먼치킨 재고 5개 — 긴급 발주 필요", time: "14:30",
    category: "발송로그", isRead: false, isDispatched: true, isUrgent: true },
  { id: "n-002", title: "발주 수량 검토 필요 — AI 재추천 완료", time: "14:00",
    category: "운영알림", isRead: false, isUrgent: true },
  { id: "n-003", title: "오전 매출 목표 달성! (목표 대비 102%)", time: "11:00",
    category: "발송로그", isRead: true, isDispatched: true },
  { id: "n-004", title: "매출 전일 대비 -22% 감지", time: "10:30",
    category: "운영알림", isRead: true },
  { id: "n-005", title: "AI 추천: 오전 도넛 세트 프로모션 제안", time: "09:15",
    category: "발송로그", isRead: true, isDispatched: true },
  { id: "n-006", title: "주말 재고 부족 예측 — 토핑류 3종", time: "09:00",
    category: "운영알림", isRead: true },
  { id: "n-007", title: "본사 발주 물품 도착 예정 (14시)", time: "08:00",
    category: "발송로그", isRead: true, isDispatched: true },
];

export function getNotifications(): Promise<NotificationItem[]> {
  return mockDelay(mockNotifications);
}

const mockPipAiAlert: PipAiAlert = {
  id: "ai-alert-001",
  message:
    "오늘 기온이 8°C로 떨어집니다.\n핫 음료 수요 급증 예상 원두 재고를 미리 확인하세요.",
};

export function getPipAiAlert(): Promise<PipAiAlert> {
  return mockDelay(mockPipAiAlert);
}

const TODAY = new Date("2026-04-14");
const HOURS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const BASE_MY =    [120000, 280000, 500000, 420000, 350000, 480000, 390000, 310000, 260000];
const BASE_NEARBY = [95000, 210000, 380000, 500000, 320000, 290000, 440000, 370000, 300000];

function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function getDailySales(date: Date): Promise<DailySalesData> {
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isToday = isSameDay(date, TODAY);
  const isFuture = date > TODAY;

  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  const seed = date.getDate() + date.getMonth() * 31;

  const factor = isFuture ? 0 : 0.7 + seededRand(seed) * 0.6;

  const chartData = HOURS.map((time, i) => ({
    time,
    myStore: Math.round(BASE_MY[i] * factor),
    nearby: Math.round(BASE_NEARBY[i] * (0.7 + seededRand(seed + i) * 0.6)),
  }));

  const sales = chartData.reduce((s, d) => s + d.myStore, 0);
  const laborCost = Math.round(sales * 0.18);
  const materialCost = Math.round(sales * 0.62);

  return mockDelay({
    date: dateStr,
    isToday,
    sales,
    laborCost,
    materialCost,
    netProfit: sales - laborCost - materialCost,
    chartData,
  });
}

const mockAiActions: AiAction[] = [
  {
    id: "action-001",
    title: "내 생산 계획",
    subtitle: "매출 예측 기반 권장",
    badgeType: "추천",
    iconUrl:aiAction01,
  },
  {
    id: "action-002",
    title: "부족 자재",
    subtitle: "우유, 파우더 외 3건",
    badgeType: "긴급",
    iconUrl:aiAction02,
  },
  {
    id: "action-003",
    title: "내 생산 계획",
    subtitle: "매출 예측 기반 권장",
    badgeType: "추천",
    iconUrl:aiAction01,
  },
  {
    id: "action-004",
    title: "내 생산 계획",
    subtitle: "매출 예측 기반 권장",
    badgeType: "추천",
    iconUrl:aiAction02,
  },
  {
    id: "action-005",
    title: "내 생산 계획",
    subtitle: "매출 예측 기반 권장",
    badgeType: "추천",
    iconUrl:aiAction01,
  },
  {
    id: "action-006",
    title: "내 생산 계획",
    subtitle: "매출 예측 기반 권장",
    badgeType: "추천",
    iconUrl:aiAction02,
  },
];

export function getAiActions(): Promise<AiAction[]> {
  return mockDelay(mockAiActions);
}

const mockEventSchedule: EventScheduleData = {
  thisMonthCount: 5,
  aiRecommendation: "셋째 주 이벤트 집중!",
  calendarRange: "2026.04.01 ~ 04.14",
  highlightedDays: [7, 10, 14],
  events: [
    {
      id: "evt-001",
      month: "4월",
      day: "07",
      title: "신제품 출시 프로모션",
      subtitle: "베라망고 쿨라타 할인 이벤트",
      isActive: true,
    },
    {
      id: "evt-002",
      month: "4월",
      day: "05",
      title: "신제품 출시 프로모션",
      subtitle: "베라망고 쿨라타 할인 이벤트",
      isActive: false,
    },
    {
      id: "evt-003",
      month: "4월",
      day: "05",
      title: "신제품 출시 프로모션",
      subtitle: "베라망고 쿨라타 할인 이벤트",
      isActive: false,
    },
    {
      id: "evt-004",
      month: "4월",
      day: "21",
      title: "신제품 출시 프로모션",
      subtitle: "베라망고 쿨라타 할인 이벤트",
      isActive: false,
    },
  ],
};

export function getEventSchedule(): Promise<EventScheduleData> {
  return mockDelay(mockEventSchedule);
}

const mockReviews: ReviewData = {
  averageRating: 4.1,
  totalReviews: 42,
  responseRate: 57,
  positivePercent: 62,
  neutralPercent: 16,
  negativePercent: 12,
};

export function getReviewData(): Promise<ReviewData> {
  return mockDelay(mockReviews);
}

const mockReviewFullData: ReviewFullData = {
  periodLabel: "최근 30일",
  totalCount: 42,
  averageRating: 4.1,
  positivePercent: 58,
  neutralPercent: 28,
  negativePercent: 14,
  analysisText:
    "최근 30일간 **42건**의 리뷰를 분석했습니다. 전반적인 만족도는 **4.1/5.0**으로 양호하며, **신선**이 가장 높은 긍정 키워드, **대기시간**이 주요 개선 키워드입니다.",
  insights: [
    {
      keyword: "품질",
      type: "개선",
      summary: "\"품질\" 키워드 증가 → 오후 제조 타이밍 30분 앞당기기 권장",
    },
    {
      keyword: "대기시간",
      type: "개선",
      summary: "\"대기시간\" 부정 리뷰 → 피크타임 인력 1명 추가 배치 검토",
    },
    {
      keyword: "신선도",
      type: "유지",
      summary: "\"신선도\" 긍정 유지 → 현재 제조 주기 유지 권장",
    },
  ],
  positiveKeywords: [
    { keyword: "신선",   count: 24, icon: "🍩", highlight: true },
    { keyword: "품질",   count: 18, icon: "⭐" },
    { keyword: "도넛",   count: 15, icon: "🎉" },
    { keyword: "가성비", count: 12, icon: "🧡" },
    { keyword: "커피",   count:  9, icon: "☕" },
  ],
  positiveMentionCount: 78,
  negativeKeywords: [
    { keyword: "대기시간", count: 11, icon: "⏱️" },
  ],
  negativeMentionCount: 11,
  reviews: [
    {
      id: "rev-1",
      reviewerName: "배달의민족",
      platform: "배민",
      rating: 4,
      date: "2026-04-01",
      content: "도넛이 항상 신선해서 좋아요! 글레이즈드 최고",
      tags: ["신선", "글레이즈드"],
      sentiment: "긍정",
    },
    {
      id: "rev-2",
      reviewerName: "김*현",
      platform: "배민",
      rating: 5,
      date: "2026-04-12",
      content: "도넛이 정말 신선하고 맛있어요! 매일 오고 싶을 정도입니다. 커피도 훌륭해요.",
      tags: ["신선", "도넛", "커피"],
      sentiment: "긍정",
    },
    {
      id: "rev-3",
      reviewerName: "이*지",
      platform: "쿠팡이츠",
      rating: 5,
      date: "2026-04-11",
      content: "품질이 정말 좋아요. 글레이즈드 도넛 최고! 가성비도 좋아서 자주 시킵니다.",
      tags: ["품질", "도넛", "가성비"],
      sentiment: "긍정",
    },
    {
      id: "rev-4",
      reviewerName: "박*수",
      platform: "배민",
      rating: 4,
      date: "2026-04-10",
      content: "맛은 좋은데 대기시간이 조금 길었어요. 그래도 전체적으로 만족합니다.",
      tags: ["대기시간"],
      sentiment: "혼합",
    },
  ],
};

export function getReviewFullData(): Promise<ReviewFullData> {
  return mockDelay(mockReviewFullData);
}

// ========== 매장 탭 - 근무팀 현황 / 재고현황 / 생산지시 ==========
const mockStorePageData: StorePageData = {
  staffCount: 4,
  staff: [
    { id: "s1", name: "김하나", role: "점주",      startTime: "08:00", endTime: "18:00", status: "현장", avatar: "staff-01" },
    { id: "s2", name: "이수진", role: "스태프",    startTime: "08:00", endTime: "18:00", status: "현장", avatar: "staff-02" },
    { id: "s3", name: "박민준", role: "스태프",    startTime: "09:00", endTime: "18:00", status: "퇴근", avatar: "staff-03" },
    { id: "s4", name: "최지은", role: "피트타이머", startTime: "10:00", endTime: "15:00", status: "퇴근", avatar: "staff-04" },
  ],
  inventory: {
    urgentCount: 4,
    lastChecked: "화 15:34",
    // 재고 긴급 항목 - startHour/endHour: 09:00 기준 오프셋(시간), 재고 가용 범위
    // 현재시각 15:34 = 오프셋 6.57, 이후 소진 예정 → 긴급
    urgentItems: [
      { id: "inv-1", name: "초코링",    startHour: 0, endHour: 7.5 },
      { id: "inv-2", name: "아메리카노", startHour: 0, endHour: 8.5 },
      { id: "inv-3", name: "보스턴크림", startHour: 0, endHour: 7   },
      { id: "inv-4", name: "글레이즈드", startHour: 0, endHour: 8   },
    ],
    // 여유재고 목록 (9개/페이지 × 5페이지 = "1 / 5" 페이지네이션 재현)
    slackItems: [
      { id: "slack-1",  name: "딸기도넛",        quantity: 30, unit: "개" },
      { id: "slack-2",  name: "먼치킨",          quantity: 30, unit: "개" },
      { id: "slack-3",  name: "초코 먼치킨",      quantity: 30, unit: "개" },
      { id: "slack-4",  name: "시나몬 먼치킨",    quantity: 30, unit: "개" },
      { id: "slack-5",  name: "파우더 먼치킨",    quantity: 30, unit: "개" },
      { id: "slack-6",  name: "더블 먼치킨",      quantity: 30, unit: "개" },
      { id: "slack-7",  name: "설탕 먼치킨",      quantity: 30, unit: "개" },
      { id: "slack-8",  name: "스트로베리필드",   quantity: 30, unit: "개" },
      { id: "slack-9",  name: "더블초코",         quantity: 30, unit: "개" },
      { id: "slack-10", name: "보스턴크림",       quantity: 30, unit: "개" },
      { id: "slack-11", name: "글레이즈드",       quantity: 30, unit: "개" },
      { id: "slack-12", name: "올드패션드",       quantity: 30, unit: "개" },
      { id: "slack-13", name: "시나몬트위스트",   quantity: 30, unit: "개" },
      { id: "slack-14", name: "블루베리도넛",     quantity: 30, unit: "개" },
      { id: "slack-15", name: "초코스프링클",     quantity: 30, unit: "개" },
      { id: "slack-16", name: "바닐라도넛",       quantity: 30, unit: "개" },
      { id: "slack-17", name: "민트초코도넛",     quantity: 30, unit: "개" },
      { id: "slack-18", name: "카페라떼",         quantity: 30, unit: "개" },
      { id: "slack-19", name: "카푸치노",         quantity: 30, unit: "개" },
      { id: "slack-20", name: "카라멜마끼아또",   quantity: 30, unit: "개" },
      { id: "slack-21", name: "딸기라떼",         quantity: 30, unit: "개" },
      { id: "slack-22", name: "녹차라떼",         quantity: 30, unit: "개" },
      { id: "slack-23", name: "초코케이크",       quantity: 30, unit: "개" },
      { id: "slack-24", name: "당근케이크",       quantity: 30, unit: "개" },
      { id: "slack-25", name: "치즈케이크",       quantity: 30, unit: "개" },
      { id: "slack-26", name: "티라미수",         quantity: 30, unit: "개" },
      { id: "slack-27", name: "마카롱",           quantity: 30, unit: "개" },
      { id: "slack-28", name: "쿠키",             quantity: 30, unit: "개" },
      { id: "slack-29", name: "스콘",             quantity: 30, unit: "개" },
      { id: "slack-30", name: "크로플",           quantity: 30, unit: "개" },
      { id: "slack-31", name: "와플",             quantity: 30, unit: "개" },
      { id: "slack-32", name: "에그타르트",       quantity: 30, unit: "개" },
      { id: "slack-33", name: "샌드위치",         quantity: 30, unit: "개" },
      { id: "slack-34", name: "베이글",           quantity: 30, unit: "개" },
      { id: "slack-35", name: "크림번",           quantity: 30, unit: "개" },
      { id: "slack-36", name: "시나몬롤",         quantity: 30, unit: "개" },
      { id: "slack-37", name: "아이스티",         quantity: 30, unit: "개" },
      { id: "slack-38", name: "요거트",           quantity: 30, unit: "개" },
      { id: "slack-39", name: "오렌지주스",       quantity: 30, unit: "개" },
      { id: "slack-40", name: "에스프레소",       quantity: 30, unit: "개" },
      { id: "slack-41", name: "플랫화이트",       quantity: 30, unit: "개" },
    ],
  },
  production: {
    urgentCount: 4,
    // 생산지시 목록 - isUrgent: true면 즉시 지시(검정버튼), false면 일반(회색버튼)
    orders: [
      { id: "prod-1", name: "먼치킨", deadline: "지금 즉시", quantity: 24, unit: "개", isUrgent: true },
      { id: "prod-2", name: "두바이 도넛", deadline: "15:45 까지", quantity: 18, unit: "개", isUrgent: false },
      { id: "prod-3", name: "먼치킨", deadline: "지금 즉시", quantity: 24, unit: "개", isUrgent: false },
    ],
  },
};

export function getStorePageData(): Promise<StorePageData> {
  return mockDelay(mockStorePageData);
}

// ========== 발주 탭 ==========
const mockOrderPageData: OrderPageData = {
  deliveryDate: "4/22",
  aiAccuracy: 89,
  aiItems: [
    { id: "ai-1", name: "글레이즈드 도넛", recommendedQty: 120, currentStock: 150, unit: "개", weeklyDemandDelta: 15, unitPrice: 1500 },
    { id: "ai-2", name: "보스턴크림 도넛", recommendedQty: 120, currentStock: 92,  unit: "개", weeklyDemandDelta: 8,  unitPrice: 2000 },
    { id: "ai-3", name: "초코링 도넛",     recommendedQty: 120, currentStock: 71,  unit: "개", weeklyDemandDelta: 22, unitPrice: 1800 },
    { id: "ai-4", name: "아메리카노 원두",  recommendedQty: 120, currentStock: 50,  unit: "개", weeklyDemandDelta: -5, unitPrice: 15000 },
    { id: "ai-5", name: "초코 먼치킨",     recommendedQty: 60,  currentStock: 30,  unit: "개", weeklyDemandDelta: 12, unitPrice: 900  },
  ],
  items: [
    { id: "ord-01", name: "초코링",          category: "도넛",   stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 1800,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-02", name: "아메리카노 원두", category: "원재료", stock: 12,  unit: "개", recommendedQty: 30,  unitPrice: 15000, deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-03", name: "보스턴크림",      category: "도넛",   stock: 8,   unit: "개", recommendedQty: 24,  unitPrice: 2000,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-04", name: "초코 먼치킨",     category: "먼치킨", stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 900,   deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-05", name: "두바이떠먹케",    category: "도넛",   stock: 6,   unit: "개", recommendedQty: 12,  unitPrice: 2200,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-06", name: "두바이 도넛",     category: "도넛",   stock: 1,   unit: "개", recommendedQty: 18,  unitPrice: 2500,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-07", name: "달고나 츄이스티 약과", category: "포장", stock: 1, unit: "개", recommendedQty: 30,  unitPrice: 4500,  deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-08", name: "모짜렐라 핫도그", category: "포장",   stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 3200,  deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-09", name: "글레이즈드 도넛", category: "도넛",   stock: 150, unit: "개", recommendedQty: 120, unitPrice: 1500,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-10", name: "블루베리 도넛",   category: "도넛",   stock: 12,  unit: "개", recommendedQty: 24,  unitPrice: 1800,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-11", name: "올드패션드",      category: "도넛",   stock: 18,  unit: "개", recommendedQty: 12,  unitPrice: 1600,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-12", name: "스트로베리필드",  category: "도넛",   stock: 20,  unit: "개", recommendedQty: 18,  unitPrice: 1900,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-13", name: "먼치킨",          category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 800,   deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-14", name: "시나몬 먼치킨",   category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 900,   deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-15", name: "파우더 먼치킨",   category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 850,   deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-16", name: "더블 먼치킨",     category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 18,  unitPrice: 1100,  deliverySlot: "점심 납품(냉동)", deliveryTime: "4월 22일(수) 오후 12:00 예정" },
    { id: "ord-17", name: "우유 (1L)",       category: "원재료", stock: 5,   unit: "개", recommendedQty: 20,  unitPrice: 2800,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
    { id: "ord-18", name: "에스프레소 파우더", category: "원재료", stock: 3, unit: "개", recommendedQty: 10,  unitPrice: 8000,  deliverySlot: "새벽 납품",      deliveryTime: "4월 22일(수) 오전 5:00 예정"  },
  ],
};

export function getOrderPageData(): Promise<OrderPageData> {
  return mockDelay(mockOrderPageData);
}

export function submitOrder(
  data: OrderPageData,
  quantities: Record<string, number>,
): Promise<OrderSubmitResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const orderedItems = data.items.filter(
        (item) => (quantities[item.id] ?? 0) > 0,
      );

      const slotMap = new Map<string, OrderSubmitSlot>();
      const confirmedItems: OrderItemConfirmed[] = [];

      for (const item of orderedItems) {
        const qty = quantities[item.id] ?? 0;
        const amount = qty * item.unitPrice;
        const slot = item.deliverySlot ?? "새벽 납품";
        const time = (item.deliveryTime ?? "").replace(" 예정", "");

        const existing = slotMap.get(slot);
        if (existing) {
          existing.itemCount += 1;
          existing.amount += amount;
        } else {
          slotMap.set(slot, { slot, time, itemCount: 1, amount });
        }

        confirmedItems.push({
          id: item.id,
          name: item.name,
          qty,
          unit: item.unit,
          unitPrice: item.unitPrice,
          deliverySlot: slot,
        });
      }

      const slots = Array.from(slotMap.values());
      const totalItems = orderedItems.length;
      const totalQty = orderedItems.reduce(
        (s, it) => s + (quantities[it.id] ?? 0),
        0,
      );
      const totalAmount = orderedItems.reduce(
        (s, it) => s + (quantities[it.id] ?? 0) * it.unitPrice,
        0,
      );

      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const seq = String(Math.floor(Math.random() * 9000) + 1000);
      const orderId = `ORD-${yy}${mm}${dd}-${seq}`;

      const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const submittedAt = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayNames[now.getDay()]}) ${hh}:${min}`;

      console.log("[ORDER] 발주 확정", {
        orderId,
        totalItems,
        totalQty,
        totalAmount,
        slotCount: slots.length,
      });

      resolve({
        orderId,
        submittedAt,
        totalItems,
        totalQty,
        totalAmount,
        slotCount: slots.length,
        slots,
        confirmedItems,
      });
    }, 700);
  });
}

// ========== 성과 시뮬레이터 ==========
const mockPerformanceSimulator: PerformanceSimulatorData = {
  hourly: [
    { hour: "8시",  today: 370000, yesterday: 310000, lastWeek: 330000 },
    { hour: "9시",  today: 430000, yesterday: 380000, lastWeek: 400000 },
    { hour: "10시", today: 290000, yesterday: 260000, lastWeek: 270000 },
    { hour: "11시", today: 400000, yesterday: 350000, lastWeek: 370000 },
    { hour: "12시", today: 580000, yesterday: 480000, lastWeek: 510000, isPeak: true },
    { hour: "13시", today: 470000, yesterday: 400000, lastWeek: 420000 },
    { hour: "14시", today: 320000, yesterday: 290000, lastWeek: 300000 },
    { hour: "15시", today: 360000, yesterday: 340000, lastWeek: 350000 },
    { hour: "16시", today: 280000, yesterday: 270000, lastWeek: 270000 },
    { hour: "17시", today: 340000, yesterday: 310000, lastWeek: 320000 },
  ],
  summary: {
    todayTotal: 3830000,
    deltaPct: 13,
    peakHour: "12시",
    peakSales: 580000,
    txCount: 242,
    avgTicket: 20000,
  },
  goal: {
    sales:     { value: 2400000, target: 2800000, unit: "원" },
    tx:        { value: 242,     target: 300,     unit: "건" },
    avgTicket: { value: 8500,    target: 9200,    unit: "원" },
  },
  nearby: [
    { rank: 1, distanceKm: 1.2, sales: 3200000, isOurs: false },
    { rank: 2, distanceKm: 2.5, sales: 2800000, isOurs: false },
    { rank: 3, distanceKm: 3.1, sales: 2600000, isOurs: false },
    { rank: 4, distanceKm: 0,   sales: 2400000, isOurs: true  },
  ],
  promotion: {
    categories: ["커피/음료", "도넛/먼치킨", "계절상품", "핫밀"],
    items: [
      { id: "promo-c-1", name: "아이스 아메리카노", category: "커피/음료",   oldPrice: 280000, newPrice: 340000, deltaPrice: 60000, profitRate: 82, recommended: true  },
      { id: "promo-c-2", name: "딸기쿨라타",        category: "커피/음료",   oldPrice: 180000, newPrice: 240000, deltaPrice: 60000, profitRate: 68, recommended: true  },
      { id: "promo-c-3", name: "카페라떼",          category: "커피/음료",   oldPrice: 220000, newPrice: 240000, deltaPrice: 20000, profitRate: 74, recommended: false },
      { id: "promo-d-1", name: "글레이즈드 도넛",    category: "도넛/먼치킨", oldPrice: 150000, newPrice: 210000, deltaPrice: 60000, profitRate: 71, recommended: true  },
      { id: "promo-d-2", name: "초코 먼치킨",       category: "도넛/먼치킨", oldPrice: 120000, newPrice: 160000, deltaPrice: 40000, profitRate: 65, recommended: false },
      { id: "promo-s-1", name: "딸기 시즌 세트",    category: "계절상품",   oldPrice: 260000, newPrice: 320000, deltaPrice: 60000, profitRate: 70, recommended: true  },
      { id: "promo-s-2", name: "체리블라썸 음료",    category: "계절상품",   oldPrice: 220000, newPrice: 260000, deltaPrice: 40000, profitRate: 66, recommended: false },
      { id: "promo-h-1", name: "치즈 핫도그",       category: "핫밀",       oldPrice: 180000, newPrice: 230000, deltaPrice: 50000, profitRate: 63, recommended: true  },
      { id: "promo-h-2", name: "모짜렐라 핫도그",    category: "핫밀",       oldPrice: 200000, newPrice: 230000, deltaPrice: 30000, profitRate: 61, recommended: false },
    ],
  },
};

export function getPerformanceSimulator(): Promise<PerformanceSimulatorData> {
  return mockDelay(mockPerformanceSimulator);
}

export function sendProductionOrderToPOS(
  order: ProductionOrder,
): Promise<{ ok: true; order: ProductionOrder }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("[POS] 생산지시 전송", {
        id: order.id,
        name: order.name,
        quantity: order.quantity,
        unit: order.unit,
        deadline: order.deadline,
        isUrgent: order.isUrgent,
      });
      resolve({ ok: true, order });
    }, 300);
  });
}

const mockTodoItems: TodoItem[] = [
  {
    id: "todo-1",
    category: "긴급",
    status: "대기",
    title: "초코 먼치킨 긴급 발주",
    description: "현재 재고 5개, 예상 소진 40분 후. 본사 긴급 발주 필요.",
    deadline: "오늘 15:00",
    expectedImpact: "기회손실 -12%",
  },
  {
    id: "todo-2",
    category: "프로모션",
    status: "진행중",
    title: "오후 할인 이벤트 세팅",
    description: "14시~17시 도넛 20% 할인 쿠폰 발행 및 POS 연동 확인.",
    deadline: "오늘 14:00",
  },
  {
    id: "todo-3",
    category: "발주",
    status: "대기",
    title: "딸기쿨라타 시럽 발주 확인",
    description: "금주 소진량 확인 후 다음 주 발주 수량 결정 필요.",
    deadline: "내일 10:00",
  },
  {
    id: "todo-4",
    category: "일반",
    status: "대기",
    title: "주간 리포트 확인",
    description: "지난주 매출·운영 지표 리포트를 본사로 제출.",
    deadline: "오늘 18:00",
  },
  {
    id: "todo-5",
    category: "프로모션",
    status: "대기",
    title: "신메뉴 출시 준비",
    description: "다음 주 신메뉴 POS 등록 및 메뉴판 교체 준비.",
    deadline: "4월 25일",
  },
];

export function getTodoItems(): Promise<TodoItem[]> {
  return mockDelay(mockTodoItems);
}
