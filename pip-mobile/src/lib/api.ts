import type {
  StatCardData,
  CalendarEvent,
  TodoItem,
  OrderItem,
  OrderDetailItem,
  OrderMonthSummary,
  AiInsight,
  RealtimeMetric,
  Promotion,
  AiValidationMetric,
  HypothesisCard,
  AgentLogItem,
  AiQualityDimension,
  BenchmarkItem,
  AlarmSetting,
  AlarmCard,
  AlarmHistoryItem,
  KakaoAlarmConfig,
  RecommendedAction,
  MenuIssueCount,
  TodayOrderSummary,
  TodaySalesSnapshot,
  ProductionAgentData,
  ProductionSummary,
  ProductionBatchItem,
  ProductAnalysisData,
  OrderAgentData,
  AiOrderSummary,
  AiOrderItem,
  AiPerformanceData,
  AiBriefing,
  BriefingIssue,
  SimulationData,
} from "../types";
import icoAction01 from "../assets/ico-action01.png";
import icoAction02 from "../assets/ico-action02.png";

const RAW_API_BASE =
  typeof import.meta.env.VITE_API_BASE_URL === "string"
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : "";
const API_BASE = RAW_API_BASE || "/api";
const AUTH_HEADERS: Record<string, string> = {
  "X-User-Id": "U001",
  "X-User-Role": "store_owner",
  "X-Store-Id": "POC_001",
};
const STORE_ID = AUTH_HEADERS["X-Store-Id"];

function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

function unwrapApiData<T>(json: unknown): T {
  if (json && typeof json === "object") {
    const envelope = json as { status?: string; success?: boolean; data?: unknown };
    if (envelope.status === "success" || envelope.success === true) {
      return (envelope.data as T) ?? (json as T);
    }
  }
  return json as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  const json = await res.json();
  return unwrapApiData<T>(json);
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  const json = await res.json();
  return unwrapApiData<T>(json);
}

function mockDelay<T>(data: T): Promise<T> {
  return Promise.resolve(data);
}

const _cache = new Map<string, unknown>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (_cache.has(key)) return Promise.resolve(_cache.get(key) as T);
  return fn().then((data) => {
    _cache.set(key, data);
    return data;
  });
}

const fmtKRW = (v: number) =>
  "₩" + v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
const formatNumber = (v: number) => v.toLocaleString("ko-KR");
const formatPct = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "데이터 없음";
const formatShortDate = (value: string | null | undefined) =>
  value ? value.replace(/-/g, ".") : "-";
const nowTimeLabel = () =>
  new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

function isMeaningfulLabel(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  return normalized.length > 1 && normalized !== "B" && normalized !== "미분류";
}

function inferOrderCategory(
  productName: string,
  rawCategory?: string | null,
): "도넛" | "음료" | "커피원두" | "냉동/냉장" | "용품/상품" | "기타" {
  const combined = `${rawCategory ?? ""} ${productName}`.toLowerCase();
  if (/(원두|빈|드립백)/.test(combined)) return "커피원두";
  if (/(우유|버터|크림|치즈|시럽|냉동|냉장|생크림|크림치즈)/.test(combined)) return "냉동/냉장";
  if (/(비닐|쇼핑백|컵|빨대|뚜껑|캐리어|냅킨|포장|박스|세트|팩|개입|먼치킨컵|스푼|포크|홀더|용품|부자재)/.test(combined)) return "용품/상품";
  if (/(아메리카노|라떼|커피|콜드브루|에이드|티|쉐이크|스무디|음료|카페모카|카푸치노|마키아또|마끼아또)/.test(combined)) return "음료";
  return "도넛";
}

async function safeGet<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch {
    return null;
  }
}

function makeBriefingIssue(
  id: string,
  severity: BriefingIssue["severity"],
  title: string,
  detail: string,
  route: string,
  actionLabel = "상세 보기",
): BriefingIssue {
  return {
    id,
    severity,
    title,
    detail,
    detectedAt: nowTimeLabel(),
    actionLabel,
    route,
  };
}

function buildFallbackBriefing(selectedMenu: string): AiBriefing {
  const common = {
    date: new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }),
    store: "POC_001",
  };
  switch (selectedMenu) {
    case "생산관리":
    case "AI 실시간 현황":
      return {
        ...common,
        summaryPoints: [
          "생산 추천 데이터를 불러오지 못했습니다.",
          "재고 부족 품목과 생산 권장량은 API 재시도 후 다시 확인해 주세요.",
          "실시간 화면 기준 요약은 현재 화면 컨텍스트에 맞춰 다시 생성됩니다.",
        ],
        issues: [
          makeBriefingIssue("fallback-prod", "확인", "생산 추천 재확인 필요", "생산/재고 API 응답이 지연되고 있습니다.", "생산관리", "다시 보기"),
        ],
      };
    case "발주 관리":
      return {
        ...common,
        summaryPoints: [
          "발주 추천 데이터를 불러오지 못했습니다.",
          "수동 발주는 전체 품목 카탈로그 기준으로 다시 불러와 주세요.",
          "마감 임박 품목은 재조회 후 안내됩니다.",
        ],
        issues: [
          makeBriefingIssue("fallback-order", "확인", "발주 추천 재확인 필요", "주문 추천/마감 API 응답이 지연되고 있습니다.", "발주 관리", "다시 보기"),
        ],
      };
    case "AI 기반 성과 분석":
      return {
        ...common,
        summaryPoints: [
          "성과 분석 요약을 불러오지 못했습니다.",
          "시간대별 매출과 상위 상품은 API 재시도 후 다시 보여줍니다.",
          "현재는 성과 분석 컨텍스트 기준으로 요약 생성만 유지합니다.",
        ],
        issues: [
          makeBriefingIssue("fallback-analytics", "확인", "성과 분석 재확인 필요", "매출 분석 API 응답이 지연되고 있습니다.", "AI 기반 성과 분석", "다시 보기"),
        ],
      };
    default:
      return {
        ...common,
        summaryPoints: [
          "현재 화면 기반 브리핑 데이터를 불러오지 못했습니다.",
          "실시간 API 응답이 복구되면 매출, 재고, 발주 상태를 다시 요약합니다.",
          "잠시 후 다시 시도해 주세요.",
        ],
        issues: [
          makeBriefingIssue("fallback-default", "확인", "브리핑 재확인 필요", "브리핑 생성에 필요한 데이터 조회가 지연되고 있습니다.", selectedMenu, "다시 보기"),
        ],
      };
  }
}

// ══════════════════════════════════════════════════════════════════
//  사이드바 이슈 카운트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockMenuIssueCounts: MenuIssueCount[] = [
  { menu: "생산관리", count: 1 },
  { menu: "발주 관리", count: 3 },
  { menu: "프로모션", count: 0 },
  { menu: "AI 기반 성과 분석", count: 0 },
  { menu: "AI 검증", count: 0 },
  { menu: "벤치마킹", count: 0 },
  { menu: "알람 설정", count: 2 },
];

export function getMenuIssueCounts(): Promise<MenuIssueCount[]> {
  return cached("menuIssueCounts", () => mockDelay(mockMenuIssueCounts));
}

// ══════════════════════════════════════════════════════════════════
//  대시보드 통계 카드 — API: /home/sales-summary
// ══════════════════════════════════════════════════════════════════

export async function getStatCards(): Promise<StatCardData[]> {
  try {
    const data = await apiGet<{
      today_revenue: number;
      today_qty: number;
      vs_yesterday_same_time_pct: number;
      vs_last_week_same_day_pct: number;
      hourly_trend: { hour: number; revenue: number }[];
    }>("/home/sales-summary");

    const sparkData = (data.hourly_trend || []).map((h) => h.revenue);
    const yesterdayPct = data.vs_yesterday_same_time_pct ?? 0;
    const weekPct = data.vs_last_week_same_day_pct ?? 0;

    const chanceLoss = await apiGet<{
      today: { total_loss_amount: number; incidents: unknown[] };
    }>("/home/chance-loss").catch(() => null);

    return [
      {
        id: "stat-daily-sales",
        value: fmtKRW(data.today_revenue),
        unit: "원",
        changeValue: `${yesterdayPct > 0 ? "+" : ""}${yesterdayPct}%`,
        changeType: yesterdayPct >= 0 ? "up" : "down",
        sparkData,
      },
      {
        id: "stat-ai-net-sales",
        value: fmtKRW(Math.round(data.today_revenue * 0.68)),
        unit: "원",
        changeValue: `${weekPct > 0 ? "+" : ""}${weekPct}%`,
        changeType: weekPct >= 0 ? "up" : "down",
        sparkData: sparkData.map((v) => Math.round(v * 0.68)),
      },
      {
        id: "stat-opportunity-loss",
        value: fmtKRW(chanceLoss?.today?.total_loss_amount ?? 150000),
        unit: "원",
        changeValue:
          chanceLoss?.today?.incidents?.length > 0
            ? `품절 ${chanceLoss.today.incidents.length}건`
            : "품절 0건",
        changeType: "down",
        sparkData: [1000, 750, 510, 1130, 2000, 1500, 170, 155, 150],
      },
    ];
  } catch {
    return cached("statCardsFallback", () =>
      mockDelay([
        {
          id: "stat-daily-sales",
          value: "₩1,250,000",
          unit: "원",
          changeValue: "5.8%",
          changeType: "up",
          sparkData: [320, 900, 560, 250, 1020, 580, 1000, 1180, 1250],
        },
        {
          id: "stat-ai-net-sales",
          value: "₩850,000",
          unit: "원",
          changeValue: "7.8%",
          changeType: "up",
          sparkData: [320, 900, 560, 250, 1020, 580, 1000, 1180, 1250],
        },
        {
          id: "stat-opportunity-loss",
          value: "₩150,000",
          unit: "원",
          changeValue: "품절 2건",
          changeType: "down",
          sparkData: [1000, 750, 510, 1130, 2000, 1500, 170, 155, 150],
        },
      ])
    );
  }
}

// ══════════════════════════════════════════════════════════════════
//  이벤트 캘린더 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockCalendarEvents: CalendarEvent[] = [
  { id: "evt-001", month: "4월", day: "07", title: "신제품 출시 프로모션", subtitle: "베라망고 쿨라타 할인 이벤트", isActive: true },
  { id: "evt-002", month: "4월", day: "09", title: "봄 신메뉴 출시", subtitle: "딸기라떼 & 말차 신제품", isActive: false },
  { id: "evt-003", month: "4월", day: "10", title: "직원 교육의 날", subtitle: "서비스 품질 향상 교육", isActive: false },
  { id: "evt-004", month: "4월", day: "14", title: "매장 정기 점검", subtitle: "설비 및 위생 점검", isActive: false },
  { id: "evt-005", month: "5월", day: "05", title: "어린이날 특별 이벤트", subtitle: "키즈 세트 메뉴 할인", isActive: false },
];

export function getCalendarEvents(): Promise<CalendarEvent[]> {
  return cached("calendarEvents", () => mockDelay(mockCalendarEvents));
}

// ══════════════════════════════════════════════════════════════════
//  지금 할일 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockTodoList: TodoItem[] = [
  { id: "todo-001", label: "재고 확인하기", completed: false },
  { id: "todo-002", label: "발주 승인 처리", completed: false },
  { id: "todo-003", label: "오늘의 프로모션 설정", completed: true },
  { id: "todo-004", label: "직원 일정 확인", completed: false },
  { id: "todo-005", label: "월별 매출 보고서 작성", completed: false },
];

export function getTodoList(): Promise<TodoItem[]> {
  return cached("todoList", () => mockDelay(mockTodoList));
}

// ══════════════════════════════════════════════════════════════════
//  발주 관리 — API: /order/recommendations
// ══════════════════════════════════════════════════════════════════

const mockOrderList: OrderItem[] = [
  { id: "order-001", itemName: "원두", quantity: "10kg", status: "발주 대기" },
  { id: "order-002", itemName: "우유", quantity: "20L", status: "발주 완료" },
  { id: "order-003", itemName: "시럽", quantity: "5병", status: "입고 완료" },
  { id: "order-004", itemName: "종이컵", quantity: "1000개", status: "발주 대기" },
  { id: "order-005", itemName: "파우더", quantity: "3kg", status: "발주 중" },
];

export function getOrderList(): Promise<OrderItem[]> {
  return cached("orderList", () => mockDelay(mockOrderList));
}

// ══════════════════════════════════════════════════════════════════
//  발주 관리 상세 — API: /order/recommendations
// ══════════════════════════════════════════════════════════════════

const CATEGORY_COLORS: Record<string, string> = {
  도넛: "#f9e4c8",
  커피원두: "#d4b896",
  "냉동/냉장": "#c8dcc0",
  "용품/상품": "#c8e0f0",
};

const CATEGORY_MAP: Record<string, string> = {
  도넛: "도넛",
  음료: "커피원두",
  커피원두: "커피원두",
  "냉동/냉장": "냉동/냉장",
  "용품/상품": "용품/상품",
  기타: "용품/상품",
};

export async function getOrderMonthSummary(): Promise<OrderMonthSummary> {
  try {
    const data = await apiGet<{
      target_date: string;
      deadline: string;
      options: { items: { product_name: string; quantity: number; base_price: number; weighted_qty: number }[] }[];
    }>("/order/recommendations");

    const totalItems = data.options?.[0]?.items?.length ?? 0;
    const targetDate = data.target_date ?? "2026-04-08";
    const totalAmount = formatNumber(
      Math.round(
        (data.options?.[0]?.items ?? []).reduce(
          (sum, item) => sum + Number(item.base_price ?? 0) * Number(item.quantity ?? 0),
          0,
        ),
      ),
    );

    return {
      totalAmount,
      weekLabel: `발주관리 ${targetDate.substring(5).replace("-", "월 ")}일 기준`,
      reportDate: targetDate.replace(/-/g, "."),
      reportTime: "09:00",
      totalCount: totalItems,
    };
  } catch {
    return mockDelay({
      totalAmount: "1,085,000",
      weekLabel: "발주관리 7월 3주차",
      reportDate: "2026.04.17",
      reportTime: "09:00",
      totalCount: 24,
    });
  }
}

export async function getOrderDetailItems(): Promise<OrderDetailItem[]> {
  try {
    const data = await apiGet<{
      options: {
        label: string;
        items: {
          product_id: string;
          product_name: string;
          quantity: number;
          base_price: number;
          weighted_qty: number;
        }[];
      }[];
    }>("/order/recommendations");

    const items = data.options?.[0]?.items ?? [];
    const categoryColors = ["#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8", "#e8d5b0", "#f0c8c8", "#c8b8a0", "#c8e0f0"];

    return items.map((item, idx) => ({
      id: `od-${item.product_id}`,
      name: item.product_name,
      bgColor: categoryColors[idx % categoryColors.length],
      unitPrice: fmtKRW(Math.round(item.base_price)),
      stockInfo: `${item.weighted_qty?.toFixed(0) ?? item.quantity}개`,
      stockWarning: item.quantity > 30,
      category: inferOrderCategory(item.product_name),
      orderDate: "2026.04.08",
      orderQty: `${item.quantity}개`,
      status: null,
    }));
  } catch {
    return mockDelay([
      { id: "od-001", name: "초코링", bgColor: "#f9e4c8", unitPrice: "₩1,300", stockInfo: "30개", stockWarning: false, category: "도넛" as const, orderDate: "2026.04.17", orderQty: "30개", status: null },
      { id: "od-002", name: "두바이 떠먹케", bgColor: "#c8dcc0", unitPrice: "₩5,900", stockInfo: "500개", stockWarning: false, category: "도넛" as const, orderDate: "2026.04.17", orderQty: "30개", status: null },
      { id: "od-003", name: "아메리카노 원두", bgColor: "#d4b896", unitPrice: "₩12,000", stockInfo: "1kg 남음", stockWarning: true, category: "커피원두" as const, orderDate: "2026.04.17", orderQty: "2kg", status: null },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 인사이트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockAiInsight: AiInsight = {
  message: "비가 오는 추운 날씨 영향으로 따뜻한 ",
  boldPart: "아메리카노 매출이 20% 상승",
  agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
};

export function getAiInsight(): Promise<AiInsight> {
  return cached("aiInsight", () => mockDelay(mockAiInsight));
}

// ══════════════════════════════════════════════════════════════════
//  프로모션 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const glazedSim: SimulationData = {
  scenarioRows: [
    { label: "프로모션 배너", valueA: "기본 배치", valueB: "14~17시 음료 우선" },
    { label: "할인 대상", valueA: "전 시간대 균등", valueB: "오후 3~5시 집중" },
    { label: "묶음 구성", valueA: "단품 위주", valueB: "글레이즈드 번들 세트" },
    { label: "재고 알림", valueA: "소진 30분 전", valueB: "소진 1시간 전" },
  ],
  radarData: [
    { subject: "매출 증가", A: 60, B: 82 }, { subject: "전환율", A: 55, B: 74 },
    { subject: "고객 만족", A: 70, B: 78 }, { subject: "재고 효율", A: 50, B: 88 },
    { subject: "운영 효율", A: 65, B: 80 }, { subject: "리스크", A: 72, B: 85 },
  ],
  metrics: [
    { label: "오후 매출", valueA: 2100000, valueB: 2460000, unit: "원", diffPct: 17.1 },
    { label: "방문 전환율", valueA: 34.7, valueB: 37.2, unit: "%", diffPct: 7.2 },
    { label: "객단가", valueA: 9970, valueB: 10450, unit: "원", diffPct: 4.8 },
    { label: "음료 매출", valueA: 5200000, valueB: 6100000, unit: "원", diffPct: 17.3 },
    { label: "세트 전환", valueA: 18.3, valueB: 22.1, unit: "%", diffPct: 20.8 },
  ],
  resultSummary: "AI 추천 최적화 시나리오(B)가 핵심 지표 전반에서 우세합니다.",
  expectedRevenue: "840,000원",
};

const mockPromotions: Promotion[] = [
  { id: "promo-ai-001", status: "ai", title: "오후 3~5시 글레이즈드 번들 할인 권장", description: "해당 시간대 글레이즈드 소진율 높고, 재고 잉여 패턴 감지.", lunaMetric: "₩12만 추가 매출 예상", startDate: "2026.04.20", endDate: "2026.04.30", simulation: glazedSim },
  { id: "promo-001", status: "active", title: "아이스 아메리카노 1+1", description: "오후 2시~5시 한정, 배달 앱 전용 이벤트", channel: "배달", daysLeft: 3, startDate: "2026.04.17", endDate: "2026.04.23", simulation: glazedSim },
  { id: "promo-002", status: "active", title: "던킨런치세트 할인", description: "오전 11시~오후 1시, 세트 메뉴 1,000원 할인", channel: "매장", daysLeft: 7, startDate: "2026.04.14", endDate: "2026.04.27", simulation: glazedSim },
  { id: "promo-003", status: "scheduled", title: "어린이날 이벤트 도넛 패키지", description: "5월 5일 하루 한정, 어린이 도넛 세트 구성", channel: "이벤트", daysLeft: 15, startDate: "2026.05.05", endDate: "2026.05.05", simulation: glazedSim },
];

export function getPromotions(): Promise<Promotion[]> {
  return cached("promotions", () => mockDelay(mockPromotions));
}

// ══════════════════════════════════════════════════════════════════
//  AI 검증 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockAiValidationMetrics: AiValidationMetric[] = [
  { id: "valid-001", label: "매출 데이터 가용성", accuracy: 94.5, color: "#0057a9" },
  { id: "valid-002", label: "재고 추천 근거 충실도", accuracy: 89.2, color: "#3c8f7c" },
  { id: "valid-003", label: "수요 추정 패턴 일치도", accuracy: 91.7, color: "#7c5cbf" },
];

export function getAiValidationMetrics(): Promise<AiValidationMetric[]> {
  return cached("aiValidationMetrics", () => mockDelay(mockAiValidationMetrics));
}

const mockHypothesisCards: HypothesisCard[] = [
  { id: "hypo-001", tags: ["생산관리", "운영관리", "제품분석", "검증완료"], date: "19 10:31", title: "오후 음료 매출 하락은 날씨 변화에 의한 것이다", detail: "기상 데이터 연동시 오늘 매출은 온도 12.4°C 조건 전주 대비 -30% 이하 예측.", subItem: { label: "오후 14~17시 핫음료 전면 배치 및 날씨 연동 자동 메뉴 노출 전환을 권장합니다." }, confidence: 87 },
  { id: "hypo-002", tags: ["생산관리", "운영관리", "제품분석", "검증중"], date: "19 11:44", title: "배너 노출 감소가 프로모션 반응률 하락을 가속했다", detail: "메뉴 노출이 22% 감소 → 프로모션 반응률 8.5% 하락.", subItem: { label: "해당 시간대 배너 노출 빈도를 기존 대비 30% 이상 확대할 것을 권장합니다." }, confidence: 79 },
  { id: "hypo-003", tags: ["생산관리", "운영관리", "제품분석", "검증중"], date: "19 13:02", title: "세트 업셀 메시지 변경이 객단가에 영향을 준다", detail: "오늘 오후 3시 이후 전환 비율 3% 이하로 하락.", subItem: { label: "업셀 메시지보다 경쟁사 가격 인하가 주요 원인으로 판단됩니다." }, confidence: 61 },
  { id: "hypo-004", tags: ["생산관리", "운영관리", "제품분석", "반증됨"], date: "19 14:20", title: "재고 부족이 평점 하락 원인 중 하나다", detail: "품절 발생 2건이 고객 불만 리뷰와 시간 상 일치.", subItem: { label: "인기 품목의 최소 안전 재고 기준을 상향하고, 품절 임박 시 자동 발주 알림 설정을 권장합니다." }, confidence: 28 },
];

export function getHypothesisCards(): Promise<HypothesisCard[]> {
  return cached("hypothesisCards", () => mockDelay(mockHypothesisCards));
}

const mockAgentLogs: AgentLogItem[] = [
  { id: "log-001", time: "14:11", category: "생산관리", title: "날씨 API 연동 완료", description: "기온·강수 데이터 수집 → 매출 예측 모델 업데이트 시작" },
  { id: "log-002", time: "14:33", category: "운영관리", title: "프로모션 반응률 분석", description: "오늘 기준 카테고리별 반응률 집계 완료." },
  { id: "log-003", time: "14:48", category: "제품분석", title: "경쟁사 메뉴 변화 감지", description: "A사 김쌈 세트 가격 인하 확인 → 전환 비율 영향 분석 중" },
  { id: "log-004", time: "15:05", category: "생산관리", title: "날씨 API 연동 - 오후 업데이트", description: "오후 기온 12.4°C 기록." },
  { id: "log-005", time: "15:22", category: "운영관리", title: "재방문 패턴 이상 감지", description: "재방문 고객 방문 간격 평균 +1.3일 증가." },
  { id: "log-006", time: "15:41", category: "제품분석", title: "가설 검증 보고서 생성", description: "오늘 기준 4개 가설 검증 완료." },
];

export function getAgentLogs(): Promise<AgentLogItem[]> {
  return cached("agentLogs", () => mockDelay(mockAgentLogs));
}

const mockAiQualityDimensions: AiQualityDimension[] = [
  { subject: "카테고리별", value: 88 }, { subject: "결제방법별", value: 72 },
  { subject: "시간대별", value: 91 }, { subject: "프로모션", value: 65 },
  { subject: "날씨/경쟁사", value: 79 },
];

export function getAiQualityDimensions(): Promise<AiQualityDimension[]> {
  return cached("aiQualityDimensions", () => mockDelay(mockAiQualityDimensions));
}

// ══════════════════════════════════════════════════════════════════
//  벤치마킹 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockBenchmarkItems: BenchmarkItem[] = [
  { id: "bench-001", storeName: "인근 매장 A", distance: "0.2km", salesDiff: 5.2, conversionDiff: 1.4, mainProduct: "아이스 아메리카노", marketingStrategy: "출퇴근 시간대 픽업 전용 할인", isRecommended: false },
  { id: "bench-002", storeName: "인근 매장 B", distance: "0.4km", salesDiff: 8.3, conversionDiff: 2.1, mainProduct: "베이컨 에그 잉글리쉬머핀", marketingStrategy: "14~17시 타임세일 15% 적용", isRecommended: true },
  { id: "bench-003", storeName: "인근 매장 C", distance: "0.8km", salesDiff: 3.1, conversionDiff: -0.5, mainProduct: "카페라떼", marketingStrategy: "배달 전용 1인 세트 메뉴 구성", isRecommended: false },
  { id: "bench-004", storeName: "인근 매장 D", distance: "1.0km", salesDiff: -2.1, conversionDiff: -1.2, mainProduct: "크루아상 세트", marketingStrategy: "오피스 단체 주문 10% 할인", isRecommended: false },
  { id: "bench-005", storeName: "인근 매장 E", distance: "1.2km", salesDiff: -1.4, conversionDiff: 1.8, mainProduct: "아이스 아메리카노", marketingStrategy: "인근 직장인 대상 대량 주문 할인", isRecommended: false },
  { id: "bench-006", storeName: "인근 매장 F", distance: "1.6km", salesDiff: 12.7, conversionDiff: 4.3, mainProduct: "딸기 듬뿍 도넛", marketingStrategy: "인스타그램 감성 포토존 및 굿즈 연계", isRecommended: true },
];

export function getBenchmarkData(): Promise<BenchmarkItem[]> {
  return cached("benchmarkItems", () => mockDelay(mockBenchmarkItems));
}

// ══════════════════════════════════════════════════════════════════
//  알람 설정 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockAlarmSettings: AlarmSetting[] = [
  { id: "alarm-001", label: "재고 부족 알림", enabled: true },
  { id: "alarm-002", label: "매출 목표 달성 알림", enabled: true },
  { id: "alarm-003", label: "긴급 발주 알림", enabled: false },
  { id: "alarm-004", label: "AI 이상 감지 알림", enabled: true },
  { id: "alarm-005", label: "피크타임 알림", enabled: false },
];

export function getAlarmSettings(): Promise<AlarmSetting[]> {
  return cached("alarmSettings", () => mockDelay(mockAlarmSettings));
}

const mockAlarmCards: AlarmCard[] = [
  { id: "ALT-001", code: "ALT-001", categories: ["재고", "배송"], datetime: "발생일시 발생 16:15", title: "재고 임계치 도달 알림", description: "특정 재료 재고가 설정된 임계치 이하로 내려간 경우 즉시 알림", condition: "조건: 잔여 재고 × 20개  카테고리팀  Push", tags: ["카테고리팀", "Push"], enabled: true },
  { id: "ALT-002", code: "ALT-002", categories: ["재고"], datetime: "발생일시 발생 14:20", title: "재고 소진 1시간 전 알림", description: "현재 예상 소진 예상 1시간 전에 재고 발주 권장 알림", condition: "조건: 소진 예상 × 60분  카테고리팀", tags: ["카테고리팀"], enabled: true },
  { id: "ALT-003", code: "ALT-003", categories: ["재고"], datetime: "발생일시 발생 09:42", title: "배달앱 재고 품절시 감지", description: "POS 재고와 배달앱 노출 재고 간 오차 감지 후 자동 알림 발송", condition: "조건: 품절 감지 × 3개  Push", tags: ["Push"], enabled: false },
  { id: "ALT-004", code: "ALT-004", categories: ["배송"], datetime: "발생일시 발생 14:12", title: "시간대별 매출 이상 감지", description: "특정 시간 구간 내 매출이 예상치 기준에서 이탈 시 알림", condition: "조건: 전주 대비 × 40%  카테고리팀  Push  이메일", tags: ["카테고리팀", "Push", "이메일"], enabled: true },
  { id: "ALT-005", code: "ALT-005", categories: ["배송"], datetime: "발생일시 발생 11:30", title: "일 목표 달성률 경보", description: "오후 특정 시간 기준 일 목표 달성률이 낮아질 때 알림", condition: "조건: 일 기간 목표 달성률 × 70%  카테고리팀", tags: ["카테고리팀"], enabled: true },
  { id: "ALT-006", code: "ALT-006", categories: ["Agent"], datetime: "발생일시 발생 16:35", title: "Agent A 긴급 감지", description: "Agent A가 긴급 이벤트를 감지하여 해당 내용을 즉시 알림", condition: "조건: 신뢰도 × 80%", tags: ["Push"], enabled: true },
  { id: "ALT-007", code: "ALT-007", categories: ["Agent"], datetime: "발생일시 발생 13:10", title: "Agent B 주문 미급 추천", description: "최근 20분 간 Agent 분석 후 추가 주문 추천이 발생했을 경우 알림", condition: "조건: 재고 20개 한  Push", tags: ["Push"], enabled: true },
  { id: "ALT-008", code: "ALT-008", categories: ["Agent"], datetime: "발생일시 발생 10:55", title: "AI 신뢰도 부족 추천 감수 요청", description: "신뢰도 70% 미만의 AI 추천 사항에 대해 사람이 검토하도록 요청", condition: "조건: 신뢰도 × 70%  이메일", tags: ["이메일"], enabled: false },
  { id: "ALT-009", code: "ALT-009", categories: ["배달"], datetime: "발생일시 발생 15:48", title: "배달 냄비 지연 감지", description: "배달앱 평균 배달 시간보다 기준치 이상 지연 시 즉시 알림", condition: "조건: 평균 시간 × 100ms  Push", tags: ["Push"], enabled: true },
  { id: "ALT-010", code: "ALT-010", categories: ["고객"], datetime: "발생일시 발생 08:20", title: "VIP 고객 미방문 알림", description: "일정 기간 동안 재방문 이력이 없는 VIP 고객에 대한 알림 발송", condition: "조건: 미방문 기간 × 21일  카테고리팀", tags: ["카테고리팀"], enabled: false },
];

export function getAlarmCards(): Promise<AlarmCard[]> {
  return cached("alarmCards", () => mockDelay(mockAlarmCards));
}

const mockAlarmHistory: AlarmHistoryItem[] = [
  { id: "hist-001", time: "16:15", description: "카테고리별 재고 임계치 도달" },
  { id: "hist-002", time: "15:33", description: "오후 매출 하락 -12.4% 감지" },
  { id: "hist-003", time: "14:08", description: "시그니처라떼 소진 1시간 전" },
  { id: "hist-004", time: "12:51", description: "쿠팡이츠 평균 딜리버리 270ms" },
  { id: "hist-005", time: "11:04", description: "오전 목표 달성률 82%" },
];

export function getAlarmHistory(): Promise<AlarmHistoryItem[]> {
  return cached("alarmHistory", () => mockDelay(mockAlarmHistory));
}

const mockKakaoAlarmConfig: KakaoAlarmConfig = {
  receiverNumber: "010-1234-5678",
  quietHours: "22:00 – 07:00",
  urgentAlarm: "24시간 적용",
  dailySummary: "매일 08:30",
};

export function getKakaoAlarmConfig(): Promise<KakaoAlarmConfig> {
  return cached("kakaoAlarmConfig", () => mockDelay(mockKakaoAlarmConfig));
}

// ══════════════════════════════════════════════════════════════════
//  추천 액션 — API: /inventory/production-guide + /home/alerts
// ══════════════════════════════════════════════════════════════════

export async function getRecommendedActions(): Promise<RecommendedAction[]> {
  try {
    const [prodGuide, alerts] = await Promise.all([
      apiGet<{ recommendations: { product_name: string; recommended_qty: number; urgency: string; reason: string }[] }>("/inventory/production-guide"),
      apiGet<unknown[]>("/home/alerts").catch(() => []),
    ]);

    const recs = prodGuide.recommendations ?? [];
    const actions: RecommendedAction[] = [];

    if (recs.length > 0) {
      const first = recs[0];
      actions.push({
        id: "action-001",
        title: "내 생산 계획",
        subtitle: first.reason ?? "매출 예측 기반 권장",
        badgeType: "추천",
        avatarInitial: icoAction01,
      });
    }
    if (recs.length > 1 || alerts.length > 0) {
      actions.push({
        id: "action-002",
        title: "부족 자재",
        subtitle: recs.length > 1 ? `${recs[1].product_name} 외 ${Math.max(0, recs.length - 2)}건` : "확인 필요",
        badgeType: "긴급",
        avatarInitial: icoAction02,
      });
    }
    actions.push({
      id: "action-003",
      title: "프로모션 업데이트",
      subtitle: "오후 할인 이벤트 등록 권장",
      badgeType: "추천",
      avatarInitial: icoAction01,
    });

    return actions;
  } catch {
    return mockDelay([
      { id: "action-001", title: "내 생산 계획", subtitle: "매출 예측 기반 권장", badgeType: "추천" as const, avatarInitial: icoAction01 },
      { id: "action-002", title: "부족 자재", subtitle: "우유, 파우더 외 3건", badgeType: "긴급" as const, avatarInitial: icoAction02 },
      { id: "action-003", title: "프로모션 업데이트", subtitle: "오후 할인 이벤트 등록 권장", badgeType: "추천" as const, avatarInitial: icoAction01 },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  오늘의 발주 요약 — API: /order/recommendations + /order/deadlines
// ══════════════════════════════════════════════════════════════════

export async function getTodayOrderSummary(): Promise<TodayOrderSummary> {
  try {
    const [recData, deadlineData] = await Promise.all([
      apiGet<{ options: { items: { product_name: string; quantity: number }[] }[] }>("/order/recommendations"),
      apiGet<{ product_group: string; deadline: string; minutes_remaining: number; status: string }[]>("/order/deadlines"),
    ]);

    const items = (recData.options?.[0]?.items ?? []).slice(0, 6).map((it) => ({
      name: it.product_name,
      quantity: `${it.quantity}개`,
    }));

    const firstDeadline = deadlineData?.[0];
    const deadlineStr = firstDeadline?.deadline
      ? new Date(firstDeadline.deadline).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "D-2일 9시까지";

    return {
      deadlineLabel: "원주문 마감",
      deadline: deadlineStr,
      items,
      note: `AI 추천 기준으로 ${items.length}개 품목 발주가 필요합니다.`,
    };
  } catch {
    return mockDelay({
      deadlineLabel: "원주문 마감",
      deadline: "D-2일 9시까지",
      items: [
        { name: "글레이즈드", quantity: "48개" },
        { name: "초코링", quantity: "36개" },
        { name: "아메리카노 원두", quantity: "2kg" },
        { name: "베이글", quantity: "11개" },
      ],
      note: "본사 지시량 기준으로 3개 품목 수량을 조정했습니다.",
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  오늘의 매출 스냅샷 — API: /home/sales-summary + /sales/ranking
// ══════════════════════════════════════════════════════════════════

export async function getTodaySalesSnapshot(): Promise<TodaySalesSnapshot> {
  try {
    const [summaryData, rankingData] = await Promise.all([
      apiGet<{
        today_revenue: number;
        vs_yesterday_same_time_pct: number;
        hourly_trend: { hour: number; revenue: number }[];
      }>("/home/sales-summary"),
      apiGet<{ rank: number; product_name: string; qty: number; revenue: number }[]>("/sales/ranking?period=weekly"),
    ]);

    const pct = summaryData.vs_yesterday_same_time_pct ?? 0;
    const hourlyData = (summaryData.hourly_trend ?? []).map((h) => ({
      time: `${h.hour}:00`,
      value: h.revenue,
    }));

    const topItems = (rankingData ?? []).slice(0, 5).map((r) => ({
      rank: r.rank,
      name: r.product_name,
      count: `${r.qty}개`,
    }));

    return {
      trendValue: `${Math.abs(pct)}%`,
      trendType: pct >= 0 ? "up" : "down",
      hourlyData,
      topItems,
    };
  } catch {
    return mockDelay({
      trendValue: "12.2%",
      trendType: "up",
      hourlyData: [
        { time: "10:00", value: 125000 }, { time: "11:00", value: 210000 },
        { time: "12:00", value: 380000 }, { time: "13:00", value: 574000 },
        { time: "14:00", value: 490000 }, { time: "15:00", value: 320000 },
        { time: "16:00", value: 410000 }, { time: "17:00", value: 350000 },
        { time: "18:00", value: 280000 },
      ],
      topItems: [
        { rank: 1, name: "글레이즈드", count: "48개" },
        { rank: 2, name: "먼치킨", count: "36개" },
        { rank: 3, name: "도너츠", count: "26개" },
        { rank: 4, name: "먼치킨", count: "16개" },
        { rank: 5, name: "도너츠", count: "10개" },
      ],
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 실시간 현황 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockRealtimeMetrics: RealtimeMetric[] = [
  { id: "rt-001", label: "실시간 매출", value: "₩87,500", trend: "전일 동시간 대비 +12%", trendType: "up" },
  { id: "rt-002", label: "현재 주문 수", value: "23건", trend: "처리 대기 3건", trendType: "neutral" },
  { id: "rt-003", label: "객단가", value: "₩14,200", trend: "평균 대비 +5.3%", trendType: "up" },
  { id: "rt-004", label: "피크 예측", value: "오후 2시~4시", trend: "30분 뒤 혼잡 예상", trendType: "down" },
];

export function getRealtimeMetrics(): Promise<RealtimeMetric[]> {
  return cached("realtimeMetrics", () => mockDelay(mockRealtimeMetrics));
}

// ══════════════════════════════════════════════════════════════════
//  생산관리 에이전트 — API: /inventory/current
// ══════════════════════════════════════════════════════════════════

export async function getProductionAgent(): Promise<ProductionAgentData> {
  try {
    const data = await apiGet<{
      product_id: string;
      product_name: string;
      category: string;
      current_stock: number;
      hourly_burn_rate: number;
      depletion_eta: string;
      status: string;
    }[]>("/inventory/current");

    const items = (data ?? []).map((p, idx) => ({
      id: `prod-${p.product_id}`,
      name: p.product_name,
      quantity: Math.round(p.current_stock),
      isLow: p.status === "warning" || p.status === "critical" || p.current_stock < 20,
    }));

    const lowItems = items.filter((i) => i.isLow);
    const aiRec = lowItems.length > 0
      ? `${lowItems.map((i) => i.name).join(", ")}의 재고가 부족합니다. 즉시 생산을 권장합니다.`
      : "현재 모든 제품의 재고가 적정 수준입니다.";

    return {
      items,
      aiRecommendation: aiRec,
      lastUpdated: "실시간 갱신",
    };
  } catch {
    return mockDelay({
      items: [
        { id: "prod-001", name: "아메리카노", quantity: 340, isLow: false },
        { id: "prod-002", name: "카페라떼", quantity: 22, isLow: true },
        { id: "prod-003", name: "에이드", quantity: 22, isLow: true },
        { id: "prod-004", name: "디카페인", quantity: 6, isLow: true },
      ],
      aiRecommendation: "카페라떼, 디카페인 재고 부족, 즉시 발주 권장",
      lastUpdated: "5분전 갱신",
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  생산관리 예상 추가 매출 배너 — API: /inventory/production-guide
// ══════════════════════════════════════════════════════════════════

export async function getProductionSummary(): Promise<ProductionSummary> {
  try {
    const data = await apiGet<{
      recommendations: { urgency: string }[];
      net_profit_bar: { net_profit_delta: number; revenue_impact: number };
    }>("/inventory/production-guide");

    const urgentCount = (data.recommendations ?? []).filter((r) => r.urgency === "high" || r.urgency === "medium").length;
    const revenue = data.net_profit_bar?.revenue_impact ?? 0;

    return {
      expectedRevenue: fmtKRW(revenue),
      urgentCount: urgentCount,
      urgentLabel: urgentCount > 0 ? `${urgentCount}건 긴급 생산 필요!` : "적정 재고 수준 유지 중",
    };
  } catch {
    return mockDelay({
      expectedRevenue: "1,085,000원",
      urgentCount: 2,
      urgentLabel: "1시간 뒤 품절 예상 즉시 생산 필요!",
    });
  }
}

// ══════════════════════════════════════════════════════════════════
//  생산관리 배치 현황 — API: /inventory/current (mapped)
// ══════════════════════════════════════════════════════════════════

const BATCH_COLORS = ["#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8", "#e8d5b0", "#c8b8a0", "#f0c8c8"];

export async function getProductionBatchItems(): Promise<ProductionBatchItem[]> {
  try {
    const data = await apiGet<{
      product_id: string;
      product_name: string;
      category: string;
      current_stock: number;
      status: string;
      depletion_eta: string;
    }[]>("/inventory/current");

    return (data ?? []).map((p, idx) => {
      const isLow = p.status === "warning" || p.status === "critical";
      return {
        id: `batch-${p.product_id}`,
        name: p.product_name,
        bgColor: BATCH_COLORS[idx % BATCH_COLORS.length],
        status: isLow ? "생산 완료" as const : "재고적정" as const,
        aiWarning: isLow ? `품절 예상 시간 임박. 추가 생산을 권장합니다.` : null,
        lossAmount: isLow ? `손실 ${Math.round(p.current_stock * 1143).toLocaleString()}원` : null,
        currentCount: Math.round(p.current_stock),
        targetShortfall: isLow ? Math.round(50 - p.current_stock) : null,
        progressPercent: isLow ? Math.round((p.current_stock / 50) * 100) : 40,
      };
    });
  } catch {
    return mockDelay([
      { id: "batch-001", name: "초코링", bgColor: "#f9e4c8", status: "생산 완료" as const, aiWarning: "피크타임 전 수요 증가가 예상되어 추가 생산을 권장합니다.", lossAmount: "손실 83,000원", currentCount: 4, targetShortfall: 28, progressPercent: 14 },
      { id: "batch-002", name: "아메리카노 원두", bgColor: "#d4b896", status: "생산 완료" as const, aiWarning: "피크타임 전 수요 증가가 예상되어 추가 생산을 권장합니다.", lossAmount: "손실 83,000원", currentCount: 4, targetShortfall: 28, progressPercent: 14 },
      { id: "batch-003", name: "달고나 츄이스티 약과", bgColor: "#e8d5b0", status: "재고적정" as const, aiWarning: null, lossAmount: null, currentCount: 4, targetShortfall: null, progressPercent: 15 },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  주문관리 에이전트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockOrderAgent: OrderAgentData = {
  items: [
    { id: "ord-001", orderId: "ORD-2841", status: "완료", productName: "아메리카노L", type: "배달" },
    { id: "ord-002", orderId: "ORD-2842", status: "준비", productName: "카페라떼 세트", type: "POS" },
    { id: "ord-003", orderId: "ORD-2843", status: "수령", productName: "시그니처블랜드", type: "배달" },
    { id: "ord-004", orderId: "ORD-2844", status: "준비", productName: "아이스티 감귤", type: "배달" },
    { id: "ord-005", orderId: "ORD-2845", status: "준비", productName: "체리 에이드", type: "POS" },
    { id: "ord-006", orderId: "ORD-2846", status: "준비", productName: "블루베리 에이드", type: "POS" },
  ],
  todaySales: "₩2,025만",
  chartData: [
    { time: "08:00", value: 50000 }, { time: "10:00", value: 150000 },
    { time: "12:00", value: 250000 }, { time: "14:00", value: 420000 },
    { time: "16:00", value: 15000 }, { time: "18:00", value: 450000 },
    { time: "20:00", value: 10000 }, { time: "22:00", value: 160000 },
  ],
};

export function getOrderAgent(): Promise<OrderAgentData> {
  return cached("orderAgent", () => mockDelay(mockOrderAgent));
}

// ══════════════════════════════════════════════════════════════════
//  제품분석 에이전트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockProductAnalysis: ProductAnalysisData = {
  tabs: ["도넛", "커피원두", "냉동/냉장", "용품/상품"],
  itemsByTab: {
    도넛: [
      { id: "pa-001", name: "도넛1", quantity: 284, revenue: 200230, salesContribution: 67, promotionEffect: 81, trend: "up" },
      { id: "pa-002", name: "카카오혼스크리드", quantity: 156, revenue: 140100, salesContribution: 52, promotionEffect: 71, trend: "up" },
      { id: "pa-003", name: "올리보후이스티", quantity: 96, revenue: 120100, salesContribution: 42, promotionEffect: 61, trend: "down" },
    ],
    커피원두: [
      { id: "pa-004", name: "아메리카노 원두", quantity: 120, revenue: 180000, salesContribution: 58, promotionEffect: 74, trend: "up" },
      { id: "pa-005", name: "콜드브루 원두", quantity: 88, revenue: 132000, salesContribution: 44, promotionEffect: 60, trend: "up" },
      { id: "pa-006", name: "에스프레소 블렌드", quantity: 64, revenue: 96000, salesContribution: 36, promotionEffect: 48, trend: "down" },
    ],
    "냉동/냉장": [
      { id: "pa-007", name: "딸기라떼 베이스", quantity: 72, revenue: 108000, salesContribution: 48, promotionEffect: 65, trend: "up" },
      { id: "pa-008", name: "말차 파우더", quantity: 56, revenue: 84000, salesContribution: 38, promotionEffect: 52, trend: "down" },
      { id: "pa-009", name: "망고 퓨레", quantity: 44, revenue: 66000, salesContribution: 29, promotionEffect: 40, trend: "up" },
    ],
    "용품/상품": [
      { id: "pa-010", name: "던킨 텀블러", quantity: 38, revenue: 190000, salesContribution: 72, promotionEffect: 85, trend: "up" },
      { id: "pa-011", name: "종이컵 500개", quantity: 20, revenue: 30000, salesContribution: 18, promotionEffect: 22, trend: "down" },
      { id: "pa-012", name: "빨대 묶음", quantity: 15, revenue: 9000, salesContribution: 10, promotionEffect: 14, trend: "down" },
    ],
  },
  aiStatus: "실시간 데이터 7개씩 당시 ±12% 에러 / 기록 -15% / 잔이 에러 없음",
};

export function getProductAnalysis(): Promise<ProductAnalysisData> {
  return cached("productAnalysis", () => mockDelay(mockProductAnalysis));
}

// ══════════════════════════════════════════════════════════════════
//  AI 추천 발주 — API: /order/recommendations
// ══════════════════════════════════════════════════════════════════

let _orderRecCache: Promise<unknown> | null = null;
function getOrderRecommendationsOnce(): Promise<unknown> {
  if (!_orderRecCache) {
    _orderRecCache = apiGet<{
      target_date: string;
      options: { label: string; items: { product_id: string; product_name: string; quantity: number; base_price: number }[] }[];
    }>("/order/recommendations").catch(() => null);
  }
  return _orderRecCache;
}

export function invalidateOrderRecommendationsCache() {
  _orderRecCache = null;
}

export async function getAiOrderSummary(): Promise<AiOrderSummary> {
  try {
    const data = await getOrderRecommendationsOnce() as {
      target_date: string;
      options: { label: string; items: unknown[] }[];
    } | null;
    if (!data) throw new Error("no data");
    const totalItems = data.options?.[0]?.items?.length ?? 0;
    return {
      weekLabel: `AI 추천 ${data.target_date ?? "최신"} 기준`,
      reportDate: (data.target_date ?? "2026-04-08").replace(/-/g, "."),
      reportTime: "09:00",
      totalCount: totalItems,
      aiScore: "98.2%",
    };
  } catch {
    return mockDelay({ weekLabel: "AI 추천 7월 3주차", reportDate: "2026.04.17", reportTime: "09:00", totalCount: 12, aiScore: "98.2%" });
  }
}

export async function getAiOrderItems(): Promise<AiOrderItem[]> {
  try {
    const data = await getOrderRecommendationsOnce() as {
      target_date?: string;
      options: {
        label: string;
        items: { product_id: string; product_name: string; quantity: number; base_price: number; category?: string | null; rationale?: string | null }[];
      }[];
    } | null;
    if (!data) throw new Error("no data");

    const items = data.options?.[0]?.items ?? [];
    const defaultColors = ["#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8", "#e8d5b0", "#f0c8c8", "#c8b8a0", "#c8e0f0", "#b8a080", "#e0e8f0", "#f5c9a0", "#d0d0d0"];
    const orderDate = formatShortDate(data.target_date ?? null);

    return items.map((item, idx) => ({
      id: `ai-${item.product_id}`,
      name: item.product_name,
      bgColor: defaultColors[idx % defaultColors.length],
      unitPrice: fmtKRW(Math.round(item.base_price)),
      stockInfo: `${item.quantity}개`,
      stockWarning: item.quantity > 30,
      category: inferOrderCategory(item.product_name, item.category),
      orderDate,
      aiRecommendedQty: `${item.quantity}개`,
      aiReason: item.rationale ?? "최근 판매·품절 실적 기반 AI 추천 발주량",
      status: null,
    }));
  } catch {
    return mockDelay([
      { id: "ai-001", name: "초코링", bgColor: "#f9e4c8", unitPrice: "₩1,300", stockInfo: "8개", stockWarning: true, category: "도넛" as const, orderDate: "2026.04.17", aiRecommendedQty: "40개", aiReason: "주말 수요 예측 +32%", status: null },
      { id: "ai-002", name: "아메리카노 원두", bgColor: "#d4b896", unitPrice: "₩12,000", stockInfo: "1kg 남음", stockWarning: true, category: "커피원두" as const, orderDate: "2026.04.17", aiRecommendedQty: "3kg", aiReason: "재고 임박·날씨 영향 매출 +20%", status: null },
      { id: "ai-003", name: "글레이즈드", bgColor: "#f5e0c8", unitPrice: "₩1,300", stockInfo: "12개", stockWarning: true, category: "도넛" as const, orderDate: "2026.04.17", aiRecommendedQty: "50개", aiReason: "베스트셀러·재고 부족 임박", status: null },
    ]);
  }
}

export async function getManualOrderItems(): Promise<AiOrderItem[]> {
  try {
    const data = await apiGet<{
      total_count: number;
      items: {
        product_id: string;
        product_name: string;
        category: string;
        base_price: number;
        on_hand_eod: number;
        sold_qty_lookback: number;
        last_sold_date: string | null;
        stock_note: string;
        stock_warning: boolean;
        risk_reason?: string | null;
      }[];
    }>(`/v1/orders/${STORE_ID}/catalog`);
    const defaultColors = ["#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8", "#e8d5b0", "#f0c8c8", "#c8b8a0", "#c8e0f0", "#b8a080", "#e0e8f0", "#f5c9a0", "#d0d0d0"];

    return (data.items ?? []).map((item, idx) => ({
      id: `manual-${item.product_id}`,
      name: item.product_name,
      bgColor: defaultColors[idx % defaultColors.length],
      unitPrice: fmtKRW(Math.round(Number(item.base_price ?? 0))),
      stockInfo: item.stock_note || "재고 정보 없음",
      stockWarning: Boolean(item.stock_warning),
      category: inferOrderCategory(item.product_name, item.category),
      orderDate: formatShortDate(item.last_sold_date),
      aiRecommendedQty: "0개",
      aiReason:
        item.risk_reason ||
        (item.sold_qty_lookback > 0
          ? `최근 90일 판매 ${formatNumber(Math.round(item.sold_qty_lookback))}개`
          : "수동 발주 가능 품목"),
      status: null,
    }));
  } catch {
    return mockDelay([
      { id: "manual-fallback-001", name: "페이머스글레이즈드", bgColor: "#f9e4c8", unitPrice: "₩1,700", stockInfo: "재고 정보 없음", stockWarning: false, category: "도넛" as const, orderDate: "-", aiRecommendedQty: "0개", aiReason: "카탈로그 연동 실패", status: null },
      { id: "manual-fallback-002", name: "아메리카노", bgColor: "#d4b896", unitPrice: "₩2,500", stockInfo: "재고 정보 없음", stockWarning: false, category: "음료" as const, orderDate: "-", aiRecommendedQty: "0개", aiReason: "카탈로그 연동 실패", status: null },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 기반 성과 분석 — API: /home/sales-summary + /sales/ranking
// ══════════════════════════════════════════════════════════════════

export async function getAiPerformanceData(tab: "일별" | "주별" | "월별"): Promise<AiPerformanceData> {
  try {
    const [summaryData, rankingData] = await Promise.all([
      apiGet<{ today_revenue: number; hourly_trend: { hour: number; revenue: number }[] }>("/home/sales-summary"),
      apiGet<{ rank: number; product_name: string; qty: number; revenue: number; revenue_pct: number }[]>("/sales/ranking?period=weekly"),
    ]);

    const hourlySales = (summaryData.hourly_trend ?? []).map((h) => ({
      time: `${h.hour}시`,
      pos: Math.round(h.revenue * 0.7),
      delivery: Math.round(h.revenue * 0.3),
      prevAvg: Math.round(h.revenue * 0.95),
    }));

    const totalRev = summaryData.today_revenue ?? 0;
    const categorySales = (rankingData ?? []).slice(0, 4).map((r, i) => ({
      id: `c${i + 1}`,
      name: r.product_name,
      today: r.revenue,
      goal: Math.round(r.revenue * 1.15),
      color: i === 0 ? "#3aaedd" : i === 1 ? "#3faf60" : "#888",
    }));

    const kpis: PerformanceKpiItem[] = [
      { id: "k1", label: "총매출", value: fmtKRW(totalRev), change: `${summaryData.vs_yesterday_same_time_pct ?? 0 > 0 ? "+" : ""}${summaryData.vs_yesterday_same_time_pct ?? 0}%`, changeType: (summaryData.vs_yesterday_same_time_pct ?? 0) >= 0 ? "up" : "down" },
      { id: "k2", label: "평균 객단가", value: fmtKRW(Math.round(totalRev / ((rankingData?.[0]?.qty ?? 1)))), change: "-1.8%", changeType: "down" },
      { id: "k3", label: "총 주문 수", value: `${rankingData?.reduce((s, r) => s + r.qty, 0) ?? 0}건`, change: "+4.1%", changeType: "up" },
    ];

    return {
      tab,
      hourlySales: hourlySales.length > 0 ? hourlySales : [{ time: "09시", pos: 320, delivery: 180, prevAvg: 480 }],
      categorySales: categorySales.length > 0 ? categorySales : [{ id: "c1", name: "음료", today: 5200000, goal: 6000000, color: "#3aaedd" }],
      promotionWeekly: [
        { week: "1주차", responseRate: 38, conversionRate: 22, salesContribution: 18 },
        { week: "2주차", responseRate: 42, conversionRate: 28, salesContribution: 22 },
        { week: "3주차", responseRate: 55, conversionRate: 32, salesContribution: 26 },
        { week: "4주차", responseRate: 70, conversionRate: 38, salesContribution: 30 },
      ],
      paymentTypes: [
        { id: "p1", label: "카드 일반 결제", count: 824, percent: 64, color: "#3aaedd" },
        { id: "p2", label: "분할 결제", count: 142, percent: 11, color: "#3faf60" },
        { id: "p3", label: "카카오페이", count: 218, percent: 17, color: "#333" },
        { id: "p4", label: "현금", count: 100, percent: 8, color: "#888" },
      ],
      kpis,
    };
  } catch {
    const fallback: AiPerformanceData = {
      tab,
      hourlySales: [{ time: "09시", pos: 320, delivery: 180, prevAvg: 480 }],
      categorySales: [{ id: "c1", name: "음료", today: 5200000, goal: 6000000, color: "#3aaedd" }],
      promotionWeekly: [
        { week: "1주차", responseRate: 38, conversionRate: 22, salesContribution: 18 },
        { week: "2주차", responseRate: 42, conversionRate: 28, salesContribution: 22 },
        { week: "3주차", responseRate: 55, conversionRate: 32, salesContribution: 26 },
        { week: "4주차", responseRate: 70, conversionRate: 38, salesContribution: 30 },
      ],
      paymentTypes: [
        { id: "p1", label: "카드 일반 결제", count: 824, percent: 64, color: "#3aaedd" },
        { id: "p2", label: "분할 결제", count: 142, percent: 11, color: "#3faf60" },
        { id: "p3", label: "카카오페이", count: 218, percent: 17, color: "#333" },
        { id: "p4", label: "현금", count: 100, percent: 8, color: "#888" },
      ],
      kpis: [
        { id: "k1", label: "총매출", value: "₩12,800,000원", change: "+8.2%", changeType: "up" },
        { id: "k2", label: "평균 객단가", value: "₩9,970원", change: "-1.8%", changeType: "down" },
        { id: "k3", label: "총 주문 수", value: "1,284건", change: "+4.1%", changeType: "up" },
      ],
    };
    return mockDelay(fallback);
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 브리핑 — API: /home/briefing
// ══════════════════════════════════════════════════════════════════

export async function getAiBriefing(
  selectedMenu = "종합 현황",
): Promise<AiBriefing> {
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  try {
    if (selectedMenu === "생산관리" || selectedMenu === "AI 실시간 현황") {
      const [production, inventory] = await Promise.all([
        safeGet<{
          items?: {
            product_id?: string;
            product_name: string;
            current_stock?: number;
            recommended_production_qty?: number;
            why?: string[];
          }[];
        }>(`/v1/dashboard/production?store_id=${STORE_ID}`),
        safeGet<
          {
            product_id: string;
            product_name: string;
            on_hand_eod: number;
            sold_qty: number;
            stockout_minutes: number;
            risk_reason?: string | null;
          }[]
        >("/inventory/current"),
      ]);

      const productionItems = production?.items ?? [];
      const inventoryItems = [...(inventory ?? [])].sort(
        (a, b) =>
          Number(a.on_hand_eod ?? 0) - Number(b.on_hand_eod ?? 0) ||
          Number(b.stockout_minutes ?? 0) - Number(a.stockout_minutes ?? 0),
      );
      const firstProduction = productionItems[0];
      const firstRisk = inventoryItems[0];
      const issues: BriefingIssue[] = [];

      productionItems.slice(0, 3).forEach((item, idx) => {
        issues.push(
          makeBriefingIssue(
            `prod-${idx}`,
            Number(item.current_stock ?? 0) <= 0 ? "긴급" : "주의",
            `${item.product_name} 생산 권장 ${formatNumber(Math.round(Number(item.recommended_production_qty ?? 0)))}개`,
            item.why?.[0] ??
              `현재 재고 ${formatNumber(Math.round(Number(item.current_stock ?? 0)))}개 기준으로 생산 권장을 계산했습니다.`,
            "생산관리",
            "생산 바로가기",
          ),
        );
      });

      if (firstRisk && issues.length < 5) {
        issues.push(
          makeBriefingIssue(
            "inv-risk",
            Number(firstRisk.on_hand_eod ?? 0) <= 0 ? "긴급" : "주의",
            `${firstRisk.product_name} 재고 부족 감지`,
            `${firstRisk.product_name} 현재 재고 ${formatNumber(Math.round(Number(firstRisk.on_hand_eod ?? 0)))}개, 금일 판매 ${formatNumber(Math.round(Number(firstRisk.sold_qty ?? 0)))}개입니다.`,
            "생산관리",
            "재고 확인",
          ),
        );
      }

      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          firstProduction
            ? `${firstProduction.product_name} 생산 권장량은 ${formatNumber(Math.round(Number(firstProduction.recommended_production_qty ?? 0)))}개이고 현재 재고는 ${formatNumber(Math.round(Number(firstProduction.current_stock ?? 0)))}개입니다.`
            : "현재 추가 생산 추천 품목이 없습니다.",
          firstRisk
            ? `재고 부족 우선 품목은 ${firstRisk.product_name}이며 품절 위험 시간은 ${formatNumber(Math.round(Number(firstRisk.stockout_minutes ?? 0)))}분입니다.`
            : "현재 재고 부족 품목은 확인되지 않았습니다.",
          `생산 추천 품목 ${formatNumber(productionItems.length)}개와 재고 모니터링 품목 ${formatNumber(inventoryItems.length)}개를 기준으로 현재 화면을 요약했습니다.`,
        ],
        issues:
          issues.length > 0
            ? issues
            : [
                makeBriefingIssue("prod-ok", "확인", "생산 추천 없음", "현재 생산/재고 관점에서 즉시 대응할 이슈가 없습니다.", "생산관리", "화면 보기"),
              ],
      };
    }

    if (selectedMenu === "발주 관리") {
      const [recommendations, deadlines] = await Promise.all([
        safeGet<{
          target_date?: string;
          deadline?: string;
          options?: {
            label: string;
            total_qty: number;
            items: { product_name: string; quantity: number; base_price?: number }[];
          }[];
        }>("/order/recommendations"),
        safeGet<
          {
            product_group: string;
            deadline: string;
            status: string;
            minutes_remaining?: number;
            confirmed_order_count?: number;
          }[]
        >("/order/deadlines"),
      ]);

      const primaryOption = recommendations?.options?.[0];
      const topItems = primaryOption?.items?.slice(0, 3) ?? [];
      const urgentDeadline =
        (deadlines ?? []).find((item) => item.status === "urgent" || item.status === "soon") ??
        (deadlines ?? [])[0];
      const issues: BriefingIssue[] = [];

      topItems.forEach((item, idx) => {
        issues.push(
          makeBriefingIssue(
            `order-item-${idx}`,
            Number(item.quantity ?? 0) >= 30 ? "주의" : "확인",
            `${item.product_name} 권장 발주 ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`,
            `${primaryOption?.label ?? "추천 옵션"} 기준 검토 우선 품목입니다.`,
            "발주 관리",
            "발주 보기",
          ),
        );
      });

      if (urgentDeadline && issues.length < 5) {
        issues.unshift(
          makeBriefingIssue(
            "order-deadline",
            urgentDeadline.status === "urgent" ? "긴급" : "주의",
            `${urgentDeadline.product_group} 주문 마감 ${urgentDeadline.deadline}`,
            `${urgentDeadline.product_group} 주문 상태는 ${urgentDeadline.status}이며 남은 시간은 ${formatNumber(Math.max(0, Math.round(Number(urgentDeadline.minutes_remaining ?? 0))))}분입니다.`,
            "발주 관리",
            "마감 확인",
          ),
        );
      }

      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          primaryOption
            ? `${primaryOption.label} 기준 권장 발주 총수량은 ${formatNumber(Math.round(Number(primaryOption.total_qty ?? 0)))}개입니다.`
            : "현재 발주 추천 옵션을 불러오지 못했습니다.",
          topItems.length > 0
            ? `우선 검토 품목은 ${topItems
                .map((item) => `${item.product_name} ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`)
                .join(", ")}입니다.`
            : "우선 검토 품목 데이터가 없습니다.",
          urgentDeadline
            ? `${urgentDeadline.product_group} 발주 마감은 ${urgentDeadline.deadline}이며 상태는 ${urgentDeadline.status}입니다.`
            : "현재 임박한 발주 마감은 없습니다.",
        ],
        issues:
          issues.length > 0
            ? issues
            : [
                makeBriefingIssue("order-ok", "확인", "발주 위험 없음", "현재 마감 임박이나 긴급 발주 품목이 없습니다.", "발주 관리", "화면 보기"),
              ],
      };
    }

    if (selectedMenu === "AI 기반 성과 분석") {
      const [analytics, hourly, inventory] = await Promise.all([
        safeGet<{
          total_sales_amt?: number;
          vs_yesterday?: { sales_pct?: number };
          chance_loss_est?: number;
          products_with_stockout?: number;
        }>(`/v1/analytics/summary?store_id=${STORE_ID}`),
        safeGet<{
          today?: { hour?: string; sales_estimated?: number; pct_of_daily?: number }[];
          total_sales_today?: number;
        }>(
          `/v1/analytics/hourly-sales?store_id=${STORE_ID}`,
        ),
        safeGet<
          {
            product_name: string;
            sold_qty: number;
            base_price?: number;
            on_hand_eod?: number;
          }[]
        >("/inventory/current"),
      ]);

      const hourlyRows = hourly?.today ?? [];
      const peakHour = [...hourlyRows].sort(
        (a, b) => Number(b.sales_estimated ?? 0) - Number(a.sales_estimated ?? 0),
      )[0];
      const rankedProducts = [...(inventory ?? [])].sort(
        (a, b) => Number(b.sold_qty ?? 0) - Number(a.sold_qty ?? 0),
      );
      const topProduct =
        rankedProducts.find((item) => isMeaningfulLabel(item.product_name)) ??
        rankedProducts[0];
      const issues: BriefingIssue[] = [];

      if (peakHour) {
        const hourLabel = String(peakHour.hour ?? "-");
        issues.push(
          makeBriefingIssue(
            "analytics-peak",
            "확인",
            `${hourLabel} 매출 피크`,
            `${hourLabel} 추정 매출은 ${fmtKRW(Math.round(Number(peakHour.sales_estimated ?? 0)))}입니다.`,
            "AI 기반 성과 분석",
            "차트 보기",
          ),
        );
      }

      if (topProduct && issues.length < 5) {
        issues.push(
          makeBriefingIssue(
            "analytics-top",
            "주의",
            `${topProduct.product_name} 상위 판매`,
            `${topProduct.product_name} 금일 판매량은 ${formatNumber(Math.round(Number(topProduct.sold_qty ?? 0)))}개입니다.`,
            "AI 기반 성과 분석",
            "상품 보기",
          ),
        );
      }

      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          `오늘 매출은 ${fmtKRW(Math.round(Number(analytics?.total_sales_amt ?? 0)))}이고 전일 대비 ${formatPct(analytics?.vs_yesterday?.sales_pct)}입니다.`,
          peakHour
            ? `${String(peakHour.hour ?? "-")}가 매출 피크 구간이며 ${fmtKRW(Math.round(Number(peakHour.sales_estimated ?? 0)))}를 기록했습니다.`
            : "시간대별 매출 피크 데이터는 아직 없습니다.",
          topProduct
            ? `상위 판매 상품은 ${topProduct.product_name}이며 현재 판매량은 ${formatNumber(Math.round(Number(topProduct.sold_qty ?? 0)))}개입니다.`
            : "상위 판매 상품 데이터는 정리 중입니다.",
        ],
        issues:
          issues.length > 0
            ? issues
            : [
                makeBriefingIssue("analytics-ok", "확인", "성과 분석 대기", "현재 분석 화면에서 추가 경고는 없습니다.", "AI 기반 성과 분석", "화면 보기"),
              ],
      };
    }

    if (selectedMenu === "프로모션") {
      const promotions = await safeGet<
        {
          campaign_name?: string;
          promo_name?: string;
          sales_amt?: number;
          bill_cnt?: number;
        }[]
      >(`/v1/analytics/promo-performance?store_id=${STORE_ID}`);
      const promoItems = promotions ?? [];
      const topPromo = [...promoItems].sort(
        (a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0),
      )[0];
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          `현재 조회된 프로모션은 ${formatNumber(promoItems.length)}건입니다.`,
          topPromo
            ? `상위 프로모션은 ${topPromo.campaign_name ?? topPromo.promo_name ?? "프로모션"}이며 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))}입니다.`
            : "진행 중인 프로모션 데이터가 없습니다.",
          topPromo
            ? `반응 건수는 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`
            : "프로모션 반응 건수 데이터는 없습니다.",
        ],
        issues: topPromo
          ? [
              makeBriefingIssue(
                "promo-top",
                "확인",
                `${topPromo.campaign_name ?? topPromo.promo_name ?? "프로모션"} 성과`,
                `현재 누적 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))} / 반응 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`,
                "프로모션",
                "프로모션 보기",
              ),
            ]
          : [makeBriefingIssue("promo-none", "확인", "프로모션 데이터 없음", "현재 프로모션 성과 데이터가 없습니다.", "프로모션", "화면 보기")],
      };
    }

    if (selectedMenu === "AI 검증") {
      const validation = await safeGet<{
        sections?: { title?: string; score_pct?: number; status?: string }[];
        summary?: { completion_pct?: number };
      }>(`/v1/ai-validation/summary?store_id=${STORE_ID}`);
      const sections = validation?.sections ?? [];
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          `AI 검증 지표는 ${formatNumber(sections.length)}개 섹션을 기준으로 수집되었습니다.`,
          validation?.summary?.completion_pct != null
            ? `검증 완료율은 ${formatNumber(Math.round(Number(validation.summary.completion_pct)))}%입니다.`
            : "검증 완료율 데이터는 아직 없습니다.",
          sections[0]?.title ? `현재 대표 검증 영역은 ${sections[0].title}입니다.` : "대표 검증 영역 데이터를 확인 중입니다.",
        ],
        issues:
          sections.slice(0, 3).map((section, idx) =>
            makeBriefingIssue(
              `validation-${idx}`,
              section.status === "risk" ? "주의" : "확인",
              section.title ?? "검증 지표",
              `현재 점수 ${formatNumber(Math.round(Number(section.score_pct ?? 0)))}%`,
              "AI 검증",
              "검증 보기",
            ),
          ) || [makeBriefingIssue("validation-none", "확인", "검증 데이터 없음", "현재 검증 데이터가 없습니다.", "AI 검증", "화면 보기")],
      };
    }

    if (selectedMenu === "벤치마킹") {
      const benchmark = await safeGet<{
        rank_among_stores?: number;
        total_stores?: number;
        sales_gap_pct?: number;
        strengths?: string[];
      }>(`/v1/benchmarking/summary?store_id=${STORE_ID}`);
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          benchmark?.rank_among_stores != null && benchmark?.total_stores != null
            ? `현재 매장 순위는 ${benchmark.rank_among_stores}/${benchmark.total_stores}입니다.`
            : "매장 순위 데이터는 확인 중입니다.",
          benchmark?.sales_gap_pct != null
            ? `상위 매장 대비 매출 격차는 ${formatPct(Number(benchmark.sales_gap_pct))}입니다.`
            : "매출 격차 데이터는 아직 없습니다.",
          benchmark?.strengths?.[0]
            ? `현재 강점으로는 ${benchmark.strengths[0]}이(가) 감지됩니다.`
            : "강점 분석 데이터는 아직 없습니다.",
        ],
        issues: [
          makeBriefingIssue(
            "benchmark-rank",
            "확인",
            "벤치마킹 요약",
            benchmark?.rank_among_stores != null && benchmark?.total_stores != null
              ? `현재 순위 ${benchmark.rank_among_stores}/${benchmark.total_stores}`
              : "순위 데이터 확인 중",
            "벤치마킹",
            "비교 보기",
          ),
        ],
      };
    }

    if (selectedMenu === "알람 설정") {
      const settings = await safeGet<{
        enabled: boolean;
        in_app_enabled: boolean;
        push_enabled: boolean;
        email_enabled: boolean;
        muted_categories: string[];
      }>(`/v1/notification-settings/${STORE_ID}`);
      const disabledTargets = [
        settings?.enabled === false ? "전체" : null,
        settings?.in_app_enabled === false ? "앱내" : null,
        settings?.push_enabled === false ? "푸시" : null,
        settings?.email_enabled === false ? "이메일" : null,
        ...(settings?.muted_categories ?? []),
      ].filter(Boolean) as string[];
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          settings
            ? `현재 알림 기본 상태는 ${settings.enabled ? "활성" : "비활성"}입니다.`
            : "알림 설정 데이터를 불러오지 못했습니다.",
          disabledTargets.length > 0
            ? `꺼진 알림 범위는 ${disabledTargets.join(", ")}입니다.`
            : "현재 모든 알림이 켜져 있습니다.",
          "이 화면의 토글 상태와 채팅 알림 제어는 같은 notification settings 저장 경로를 사용합니다.",
        ],
        issues: [
          makeBriefingIssue(
            "alarm-state",
            disabledTargets.length > 0 ? "주의" : "확인",
            disabledTargets.length > 0 ? "일부 알림 비활성" : "알림 정상",
            disabledTargets.length > 0
              ? `현재 비활성 대상: ${disabledTargets.join(", ")}`
              : "현재 모든 알림이 활성화되어 있습니다.",
            "알람 설정",
            "설정 보기",
          ),
        ],
      };
    }

    const [salesSummary, homeBriefing, analytics, deadlines] = await Promise.all([
      safeGet<{
        today_revenue: number;
        vs_yesterday_same_time_pct?: number;
        vs_last_week_same_day_pct?: number;
        top_selling?: { product_name: string; qty: number; revenue: number }[];
      }>("/home/sales-summary"),
      safeGet<{
        greeting?: string;
        active_alerts?: { alert_type?: string; severity?: string; message: string; product_name?: string }[];
      }>("/home/briefing"),
      safeGet<{
        chance_loss_est?: number;
        products_with_stockout?: number;
      }>(`/v1/analytics/summary?store_id=${STORE_ID}`),
      safeGet<
        {
          product_group: string;
          deadline: string;
          status: string;
          minutes_remaining?: number;
        }[]
      >("/order/deadlines"),
    ]);

    const topSelling = (salesSummary?.top_selling ?? []).find((item) =>
      isMeaningfulLabel(item.product_name),
    );
    const urgentDeadline =
      (deadlines ?? []).find((item) => item.status === "urgent" || item.status === "soon") ??
      (deadlines ?? [])[0];
    const issues: BriefingIssue[] = [];

    (homeBriefing?.active_alerts ?? []).slice(0, 2).forEach((alert, idx) => {
      issues.push(
        makeBriefingIssue(
          `dashboard-alert-${idx}`,
          alert.severity === "critical" || alert.severity === "high" ? "긴급" : "주의",
          alert.product_name
            ? `${alert.product_name} ${alert.alert_type ?? "알림"}`
            : alert.alert_type ?? "알림",
          alert.message,
          "종합 현황",
          "상세 보기",
        ),
      );
    });

    if (urgentDeadline && issues.length < 5) {
      issues.push(
        makeBriefingIssue(
          "dashboard-deadline",
          urgentDeadline.status === "urgent" ? "긴급" : "주의",
          `${urgentDeadline.product_group} 발주 마감 ${urgentDeadline.deadline}`,
          `${urgentDeadline.product_group} 발주 마감 상태는 ${urgentDeadline.status}입니다.`,
          "발주 관리",
          "발주 바로가기",
        ),
      );
    }

    if (analytics?.products_with_stockout != null && issues.length < 5) {
      issues.push(
        makeBriefingIssue(
          "dashboard-stockout",
          Number(analytics.products_with_stockout) > 0 ? "주의" : "확인",
          `품절 위험 상품 ${formatNumber(Math.round(Number(analytics.products_with_stockout ?? 0)))}개`,
          `추정 기회손실은 ${fmtKRW(Math.round(Number(analytics.chance_loss_est ?? 0)))}입니다.`,
          "종합 현황",
          "지표 보기",
        ),
      );
    }

    return {
      date: dateLabel,
      store: STORE_ID,
      summaryPoints: [
        `오늘 매출은 ${fmtKRW(Math.round(Number(salesSummary?.today_revenue ?? 0)))}이고 전일 동시간 대비 ${formatPct(salesSummary?.vs_yesterday_same_time_pct)}입니다.`,
        `현재 추정 기회손실은 ${fmtKRW(Math.round(Number(analytics?.chance_loss_est ?? 0)))}이며 품절 위험 상품은 ${formatNumber(Math.round(Number(analytics?.products_with_stockout ?? 0)))}개입니다.`,
        urgentDeadline
          ? `${urgentDeadline.product_group} 발주 마감은 ${urgentDeadline.deadline}이며 상태는 ${urgentDeadline.status}입니다.`
          : topSelling
            ? `현재 상위 판매 상품은 ${topSelling.product_name}입니다.`
            : "현재 화면에서 즉시 대응할 주요 이슈는 없습니다.",
      ],
      issues:
        issues.length > 0
          ? issues
          : [
              makeBriefingIssue("dashboard-ok", "확인", "운영 안정", "현재 종합 현황 기준으로 긴급 이슈가 없습니다.", "종합 현황", "화면 보기"),
            ],
    };
  } catch {
    return mockDelay(buildFallbackBriefing(selectedMenu));
  }
}
