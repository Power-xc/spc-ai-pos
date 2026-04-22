import type {
  MobileStore,
  NoticeItem,
  PipAiAlert,
  DailySalesData,
  AiAction,
  EventScheduleData,
  ReviewData,
  StorePageData,
  OrderPageData,
} from "../types";

import aiAction01 from "@/mobile/assets/ico-action01.svg"
import aiAction02 from "@/mobile/assets/ico-action02.svg"

function mockDelay<T>(data: T): Promise<T> {
  return Promise.resolve(data);
}

const mockStore: MobileStore = {
  id: "store-001",
  name: "강남 1호점",
  notificationCount: 3,
};

export function getMobileStore(): Promise<MobileStore> {
  return mockDelay(mockStore);
}

const mockNotices: NoticeItem[] = [
  { id: "notice-001", text: "점주앱 공지사항 사용 테스트" },
  { id: "notice-002", text: "4월 신메뉴 출시 안내" },
];

export function getMobileNotices(): Promise<NoticeItem[]> {
  return mockDelay(mockNotices);
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
  calendarRange: "2026.03.01 ~ 03.14",
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

// ========== 매장 탭 - 근무팀 현황 / 재고현황 / 생산지시 ==========
const mockStorePageData: StorePageData = {
  staffCount: 4,
  staff: [
    { id: "s1", name: "김하나", role: "점주",      startTime: "08:00", endTime: "18:00", status: "현장", avatar: "avatar-female-01" },
    { id: "s2", name: "이수진", role: "스태프",    startTime: "08:00", endTime: "18:00", status: "현장", avatar: "avatar-female-02" },
    { id: "s3", name: "박민준", role: "스태프",    startTime: "09:00", endTime: "18:00", status: "퇴근", avatar: "avatar-male-01" },
    { id: "s4", name: "최지은", role: "피트타이머", startTime: "10:00", endTime: "15:00", status: "퇴근", avatar: "avatar-male-02" },
  ],
  inventory: {
    urgentCount: 4,
    lastChecked: "화 15:34",
    // 재고 긴급 항목 - startHour/endHour: 09:00 기준 오프셋(시간), 재고 가용 범위
    urgentItems: [
      { id: "inv-1", name: "초코링",    startHour: 0,   endHour: 2   },
      { id: "inv-2", name: "아메리카노", startHour: 1,   endHour: 3.5 },
      { id: "inv-3", name: "보스턴크림", startHour: 2,   endHour: 5   },
      { id: "inv-4", name: "글레이즈드", startHour: 0.5, endHour: 3   },
    ],
    // 여유재고 목록 (10개 초과 시 페이지네이션 동작 확인용)
    slackItems: [
      { id: "slack-1",  name: "딸기도넛",      quantity: 30, unit: "개" },
      { id: "slack-2",  name: "먼치킨",         quantity: 30, unit: "개" },
      { id: "slack-3",  name: "초코 먼치킨",    quantity: 30, unit: "개" },
      { id: "slack-4",  name: "시나몬 먼치킨",  quantity: 30, unit: "개" },
      { id: "slack-5",  name: "파우더 먼치킨",  quantity: 30, unit: "개" },
      { id: "slack-6",  name: "더블 먼치킨",    quantity: 30, unit: "개" },
      { id: "slack-7",  name: "설탕 먼치킨",    quantity: 30, unit: "개" },
      { id: "slack-8",  name: "스트로베리필드", quantity: 30, unit: "개" },
      { id: "slack-9",  name: "더블초코",       quantity: 30, unit: "개" },
      { id: "slack-10", name: "보스턴크림",     quantity: 25, unit: "개" },
      { id: "slack-11", name: "글레이즈드",     quantity: 20, unit: "개" },
      { id: "slack-12", name: "올드패션드",     quantity: 18, unit: "개" },
      { id: "slack-13", name: "시나몬트위스트", quantity: 15, unit: "개" },
      { id: "slack-14", name: "블루베리도넛",   quantity: 12, unit: "개" },
      { id: "slack-15", name: "초코스프링클",   quantity: 10, unit: "개" },
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
  deliveryDate: "4/20",
  aiAccuracy: 89,
  aiItems: [
    { id: "ai-1", name: "글레이즈드 도넛", recommendedQty: 120, currentStock: 150, unit: "개" },
    { id: "ai-2", name: "보스턴크림 도넛", recommendedQty: 120, currentStock: 92,  unit: "개" },
    { id: "ai-3", name: "초코링 도넛",     recommendedQty: 120, currentStock: 71,  unit: "개" },
    { id: "ai-4", name: "아메리카노 원두",  recommendedQty: 120, currentStock: 50,  unit: "개" },
    { id: "ai-5", name: "초코 먼치킨",     recommendedQty: 60,  currentStock: 30,  unit: "개" },
  ],
  items: [
    { id: "ord-01", name: "초코링",          category: "도넛",   stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 1800  },
    { id: "ord-02", name: "아메리카노 원두", category: "원재료", stock: 12,  unit: "개", recommendedQty: 30,  unitPrice: 15000 },
    { id: "ord-03", name: "보스턴크림",      category: "도넛",   stock: 8,   unit: "개", recommendedQty: 24,  unitPrice: 2000  },
    { id: "ord-04", name: "초코 먼치킨",     category: "먼치킨", stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 900   },
    { id: "ord-05", name: "두바이떠먹케",    category: "도넛",   stock: 6,   unit: "개", recommendedQty: 12,  unitPrice: 2200  },
    { id: "ord-06", name: "두바이 도넛",     category: "도넛",   stock: 1,   unit: "개", recommendedQty: 18,  unitPrice: 2500  },
    { id: "ord-07", name: "달고나 츄이스티 약과", category: "포장", stock: 1, unit: "개", recommendedQty: 30,  unitPrice: 4500  },
    { id: "ord-08", name: "모짜렐라 핫도그", category: "포장",   stock: 1,   unit: "개", recommendedQty: 30,  unitPrice: 3200  },
    { id: "ord-09", name: "글레이즈드 도넛", category: "도넛",   stock: 150, unit: "개", recommendedQty: 120, unitPrice: 1500  },
    { id: "ord-10", name: "블루베리 도넛",   category: "도넛",   stock: 12,  unit: "개", recommendedQty: 24,  unitPrice: 1800  },
    { id: "ord-11", name: "올드패션드",      category: "도넛",   stock: 18,  unit: "개", recommendedQty: 12,  unitPrice: 1600  },
    { id: "ord-12", name: "스트로베리필드",  category: "도넛",   stock: 20,  unit: "개", recommendedQty: 18,  unitPrice: 1900  },
    { id: "ord-13", name: "먼치킨",          category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 800   },
    { id: "ord-14", name: "시나몬 먼치킨",   category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 900   },
    { id: "ord-15", name: "파우더 먼치킨",   category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 24,  unitPrice: 850   },
    { id: "ord-16", name: "더블 먼치킨",     category: "먼치킨", stock: 30,  unit: "개", recommendedQty: 18,  unitPrice: 1100  },
    { id: "ord-17", name: "우유 (1L)",       category: "원재료", stock: 5,   unit: "개", recommendedQty: 20,  unitPrice: 2800  },
    { id: "ord-18", name: "에스프레소 파우더", category: "원재료", stock: 3, unit: "개", recommendedQty: 10,  unitPrice: 8000  },
  ],
};

export function getOrderPageData(): Promise<OrderPageData> {
  return mockDelay(mockOrderPageData);
}
