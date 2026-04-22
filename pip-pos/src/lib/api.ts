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
import {
  DEMO_BENCHMARK_COMPARE_STORES,
  DEMO_BENCHMARK_STORE_COUNT,
  DEMO_PRIMARY_STORE_ID,
  DEMO_PRIMARY_STORE_NAME,
  resolveDemoStoreName,
} from "./demoStoreConfig";
import { getBenchmarkCompareStoreIds } from "./benchmarkCompareStores";
import {
  appendDemoQueryParams,
  getDemoDate,
  getDemoDateObject,
  getDemoDateTimeLabel,
} from "./demoDateTime";

const RAW_API_BASE =
  typeof import.meta.env.VITE_API_BASE_URL === "string"
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : "";
const API_BASE = RAW_API_BASE || "/api";
const AUTH_HEADERS: Record<string, string> = {
  "X-User-Id": "U001",
  "X-User-Role": "store_owner",
  "X-Store-Id": DEMO_PRIMARY_STORE_ID,
};
const STORE_ID = AUTH_HEADERS["X-Store-Id"];

const DEMO_BIZ_DATE_ENDPOINTS = [
  "/home/sales-summary",
  "/home/briefing",
  "/inventory/current",
  "/order/recommendations",
  "/v1/dashboard/production",
  "/v1/analytics/summary",
  "/v1/analytics/hourly-sales",
  "/v1/analytics/category-sales",
  "/v1/analytics/promo-performance",
  "/v1/analytics/payment-methods",
  "/v1/benchmarking/summary",
  "/v1/benchmarking/hourly-sales",
  "/v1/benchmarking/top-items",
  "/v1/benchmarking/channel-comparison",
  "/v1/benchmarking/payment-comparison",
  "/v1/benchmarking/promotion-comparison",
];

const DEMO_DATETIME_ENDPOINTS = ["/order/deadlines", "/v1/dashboard/production"];

function applyDemoPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const needsBizDate = DEMO_BIZ_DATE_ENDPOINTS.some((prefix) =>
    normalized.startsWith(prefix),
  );
  const needsDemoDatetime = DEMO_DATETIME_ENDPOINTS.some((prefix) =>
    normalized.startsWith(prefix),
  );
  if (!needsBizDate && !needsDemoDatetime) {
    return normalized;
  }
  return appendDemoQueryParams(normalized, {
    includeBizDate: needsBizDate,
    includeDemoTime: needsDemoDatetime,
    includeDemoDateTime: needsDemoDatetime,
  });
}

function buildApiUrl(path: string): string {
  const normalized = applyDemoPath(path);
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
  getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

const PRODUCT_CODE_NAME_MAP: Record<string, string> = {
  "700721": "초코파우더(길라델리)",
  "811902": "미니글레이즈드",
  "811962": "미니스트로베리필드",
  "811963": "미니초코링",
};

export type InventoryDisplayMetrics = {
  rawStock: number;
  currentCount: number;
  shortage: number;
  badgeLabel: string;
  currentLabel: string;
  detailLabel: string;
};

export function getInventoryDisplayMetrics(rawValue: number | null | undefined): InventoryDisplayMetrics {
  const rawStock = Number(rawValue ?? 0);
  const currentCount = rawStock < 0 ? 0 : Math.round(rawStock);
  const shortage = rawStock < 0 ? Math.abs(Math.round(rawStock)) : 0;
  return {
    rawStock,
    currentCount,
    shortage,
    badgeLabel:
      shortage > 0
        ? `부족 ${formatNumber(shortage)}개`
        : `${formatNumber(currentCount)}개`,
    currentLabel: `현재 보유 ${formatNumber(currentCount)}개`,
    detailLabel:
      shortage > 0
        ? `현재 보유 ${formatNumber(currentCount)}개 · 부족 ${formatNumber(shortage)}개`
        : `현재 보유 ${formatNumber(currentCount)}개`,
  };
}

export function invalidateDemoRuntimeData() {
  _cache.clear();
  _orderRecCache = null;
  _benchmarkSnapshotPromiseMap.clear();
}

function isMeaningfulLabel(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= 1 || normalized === "B" || normalized === "미분류") return false;
  return true;
}

function cleanProductName(name: string): string {
  let cleaned = name
    .replace(/\?쫀득\?/g, "쫀득")
    .replace(/\?/g, "")
    .replace(/^[A-Z]+\)\s*/, "")
    .trim();
  if (!cleaned || cleaned.length <= 1) return "상위 상품 없음";
  return cleaned;
}

function resolveProductDisplayName(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return cleanProductName(PRODUCT_CODE_NAME_MAP[normalized] ?? normalized);
}

function joinCompact(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(" · ");
}

function formatBurnRate(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0개/시간";
  return `${numeric.toFixed(1)}개/시간`;
}

function inferOrderCategory(
  productName: string,
  rawCategory?: string | null,
): "도넛" | "음료" | "커피원두" | "냉동/냉장" | "용품/상품" | "기타" {
  const combined = `${rawCategory ?? ""} ${productName}`.toLowerCase();
  if (/(원두|빈|드립백)/.test(combined)) return "커피원두";
  if (/(우유|버터|크림|치즈|시럽|냉동|냉장|생크림|크림치즈)/.test(combined)) return "냉동/냉장";
  if (/(비닐|쇼핑백|컵|빨대|뚜껑|캐리어|냅킨|포장|박스|세트|팩|개입|먼치킨컵|스푼|포크|홀더|용품|부자재|종이|빨대)/.test(combined)) return "용품/상품";
  if (/(아메리카노|라떼|커피|콜드브루|에이드|티|쉐이크|스무디|음료|카페모카|카푸치노|마키아또|마끼아또)/.test(combined)) return "음료";
  if (/(푸드|케이크|샌드|핫도그|롤|머핀)/.test(combined)) return "도넛";
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
    date: getDemoDateObject().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }),
    store: DEMO_PRIMARY_STORE_ID,
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

    const inventoryItemsRaw = await safeGet<unknown[]>("/inventory/current");
    const inventoryItems = (inventoryItemsRaw ?? []) as Array<Record<string, unknown>>;
    const totalChanceLoss = inventoryItems.reduce(
      (sum, item) => sum + Number(item.estimated_chance_loss ?? 0),
      0,
    );
    const riskCount = inventoryItems.filter((item) => {
      const risk = String(item.stockout_risk ?? item.status ?? "").toUpperCase();
      return risk === "HIGH" || risk === "WARNING" || risk === "CRITICAL" || item.reorder_triggered;
    }).length;

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
        value: fmtKRW(Math.round(totalChanceLoss || 150000)),
        unit: "원",
        changeValue: `품절 ${riskCount}건`,
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
  음료: "음료",
  커피원두: "커피원두",
  "냉동/냉장": "냉동/냉장",
  "용품/상품": "용품/상품",
  기타: "용품/상품",
  푸드: "도넛",
  케이크: "도넛",
};

export async function getOrderMonthSummary(): Promise<OrderMonthSummary> {
  try {
    const data = await apiGet<{
      target_date: string;
      deadline: string;
      options: { items: { product_name: string; quantity: number; base_price: number; weighted_qty: number }[] }[];
    }>("/order/recommendations");

    const totalItems = data.options?.[0]?.items?.length ?? 0;
    const targetDate = data.target_date ?? getDemoDate();
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
      weekLabel: "발주관리 3월 2주차",
      reportDate: "2026.03.10",
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
      orderDate: "2026.03.10",
      orderQty: `${item.quantity}개`,
      status: null,
    }));
  } catch {
    return mockDelay([
      { id: "od-001", name: "초코링", bgColor: "#f9e4c8", unitPrice: "₩1,300", stockInfo: "30개", stockWarning: false, category: "도넛" as const, orderDate: "2026.03.10", orderQty: "30개", status: null },
      { id: "od-002", name: "두바이 떠먹케", bgColor: "#c8dcc0", unitPrice: "₩5,900", stockInfo: "500개", stockWarning: false, category: "도넛" as const, orderDate: "2026.03.10", orderQty: "30개", status: null },
      { id: "od-003", name: "아메리카노 원두", bgColor: "#d4b896", unitPrice: "₩12,000", stockInfo: "1kg 남음", stockWarning: true, category: "커피원두" as const, orderDate: "2026.03.10", orderQty: "2kg", status: null },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 인사이트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockAiInsight: AiInsight = {
  message: "현재 기준 데이터로 볼 때 ",
  boldPart: "생산·발주·성과 우선순위 점검이 필요",
  agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
};

export async function getAiInsight(): Promise<AiInsight> {
  try {
    const [production, orderSummary, salesSnapshot] = await Promise.all([
      getProductionAgent(),
      getTodayOrderSummary(),
      getTodaySalesSnapshot(),
    ]);
    const riskItem = production.items.find((item) => item.isLow);
    const topItem = salesSnapshot.topItems[0];
    const orderItem = orderSummary.items[0];
    if (riskItem) {
      return {
        message: `${getDemoDateTimeLabel()} 기준으로 `,
        boldPart: `${riskItem.name} ${riskItem.shortage && riskItem.shortage > 0 ? `부족 ${formatNumber(riskItem.shortage)}개` : riskItem.badgeLabel ?? `${formatNumber(riskItem.quantity)}개`}`,
        agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
      };
    }
    if (orderItem) {
      return {
        message: `${getDemoDateTimeLabel()} 기준 추천 발주 우선 품목은 `,
        boldPart: `${orderItem.name} ${orderItem.quantity}`,
        agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
      };
    }
    if (topItem) {
      return {
        message: `${getDemoDateTimeLabel()} 기준 상위 판매 품목은 `,
        boldPart: `${topItem.name} ${topItem.count}`,
        agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
      };
    }
    return mockDelay(mockAiInsight);
  } catch {
    return mockDelay(mockAiInsight);
  }
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

function clampPromotionValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPromotionSimulation(params: {
  title: string;
  channel?: Promotion["channel"];
  actualSales: number;
  actualBills: number;
  estimatedLiftPct: number;
  comparisonLabel: string;
}): SimulationData {
  const actualSales = Math.max(0, Math.round(params.actualSales));
  const actualBills = Math.max(0, Math.round(params.actualBills));
  const liftPct = clampPromotionValue(params.estimatedLiftPct, 4, 24);
  const projectedSales = Math.round(actualSales * (1 + liftPct / 100));
  const billLiftPct = clampPromotionValue(Math.round(liftPct * 0.65), 3, 16);
  const projectedBills = Math.max(
    actualBills + 1,
    Math.round(actualBills * (1 + billLiftPct / 100)),
  );
  const currentTicket = actualBills > 0 ? Math.round(actualSales / actualBills) : actualSales;
  const projectedTicket = projectedBills > 0 ? Math.round(projectedSales / projectedBills) : projectedSales;
  const currentResponse = clampPromotionValue(actualBills * 6.5 + (actualSales > 0 ? 18 : 8), 8, 72);
  const projectedResponse = clampPromotionValue(currentResponse + liftPct * 0.7, 12, 86);
  const currentContribution = clampPromotionValue(actualSales / 850, 4, 74);
  const projectedContribution = clampPromotionValue(projectedSales / 820, 8, 88);
  const channel = params.channel ?? "전체";

  return {
    scenarioRows: [
      { label: "운영 채널", valueA: channel, valueB: channel },
      { label: "집계 기준", valueA: "최근 실집계", valueB: params.comparisonLabel },
      { label: "노출 방식", valueA: "현재 운영 유지", valueB: "추천 시간대/세트 보강" },
      { label: "재고 연계", valueA: "수동 점검", valueB: "상위 상품 소진 기준 연동" },
    ],
    radarData: [
      { subject: "매출 증가", A: clampPromotionValue(currentContribution, 20, 72), B: clampPromotionValue(currentContribution + liftPct * 0.9, 28, 94) },
      { subject: "반응도", A: currentResponse, B: projectedResponse },
      { subject: "객단가", A: clampPromotionValue(currentTicket / 220, 18, 84), B: clampPromotionValue(projectedTicket / 210, 24, 92) },
      { subject: "시간 적합도", A: clampPromotionValue(42 + actualBills * 2, 24, 76), B: clampPromotionValue(54 + actualBills * 2 + liftPct, 32, 92) },
      { subject: "재고 효율", A: clampPromotionValue(40 + actualSales / 1300, 26, 70), B: clampPromotionValue(48 + projectedSales / 1250, 34, 88) },
      { subject: "운영 안정성", A: clampPromotionValue(58 + actualBills, 36, 82), B: clampPromotionValue(64 + projectedBills, 42, 94) },
    ],
    metrics: [
      { label: "최근 집계 매출", valueA: actualSales, valueB: projectedSales, unit: "원", diffPct: liftPct },
      { label: "반응 건수", valueA: actualBills, valueB: projectedBills, unit: "건", diffPct: billLiftPct },
      { label: "객단가", valueA: currentTicket, valueB: projectedTicket, unit: "원", diffPct: clampPromotionValue(((projectedTicket - currentTicket) / Math.max(currentTicket, 1)) * 100, 1, 18) },
      { label: "반응률", valueA: currentResponse, valueB: projectedResponse, unit: "%", diffPct: clampPromotionValue(projectedResponse - currentResponse, 2, 18) },
      { label: "매출 기여", valueA: currentContribution, valueB: projectedContribution, unit: "%", diffPct: clampPromotionValue(projectedContribution - currentContribution, 2, 20) },
    ],
    resultSummary:
      `${params.title} 기준 최근 집계 매출 ${fmtKRW(actualSales)}에서 ` +
      `${fmtKRW(projectedSales)} 수준까지 확대 가능한 시나리오입니다. ` +
      "최근 집계 기준 추정치이며 실제 운영 환경에 따라 달라질 수 있습니다.",
    expectedRevenue: fmtKRW(Math.max(0, projectedSales - actualSales)),
  };
}

function parsePromoDate(dateStr: string): Date {
  const parts = dateStr.split(".");
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function toPromoDate(value: string | null | undefined): string {
  if (!value) {
    return getDemoDate().replace(/-/g, ".");
  }
  const normalized = value.slice(0, 10);
  return normalized.replace(/-/g, ".");
}

function computePromoStatus(startDate: string, endDate: string): { status: "active" | "scheduled" | "ended"; daysLeft: number } {
  const start = parsePromoDate(startDate);
  const end = parsePromoDate(endDate);
  const demoDate = getDemoDateObject();
  if (demoDate < start) {
    return { status: "scheduled", daysLeft: Math.ceil((start.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24)) };
  }
  if (demoDate > end) {
    return { status: "ended", daysLeft: 0 };
  }
  return { status: "active", daysLeft: Math.ceil((end.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24)) };
}

const mockPromotionData: Array<Omit<Promotion, "status" | "daysLeft"> & { startDate: string; endDate: string }> = [
  { id: "promo-ai-001", status: "ai", title: "오후 3~5시 글레이즈드 번들 할인 권장", description: "해당 시간대 글레이즈드 소진율 높고, 재고 잉여 패턴 감지.", lunaMetric: "₩12만 추가 매출 예상", startDate: "2026.03.01", endDate: "2026.03.15", simulation: glazedSim },
  { id: "promo-001", status: "active", title: "아이스 아메리카노 1+1", description: "오후 2시~5시 한정, 배달 앱 전용 이벤트", channel: "배달", startDate: "2026.03.05", endDate: "2026.03.18", simulation: glazedSim },
  { id: "promo-002", status: "active", title: "던킨런치세트 할인", description: "오전 11시~오후 1시, 세트 메뉴 1,000원 할인", channel: "매장", startDate: "2026.03.02", endDate: "2026.03.20", simulation: glazedSim },
  { id: "promo-003", status: "scheduled", title: "어린이날 이벤트 도넛 패키지", description: "5월 5일 하루 한정, 어린이 도넛 세트 구성", channel: "이벤트", startDate: "2026.05.05", endDate: "2026.05.05", simulation: glazedSim },
];

const mockPromotions: Promotion[] = mockPromotionData.map((p) => {
  if (p.status === "ai") return { ...p, daysLeft: null } as Promotion;
  const computed = computePromoStatus(p.startDate, p.endDate);
  return { ...p, status: computed.status, daysLeft: computed.daysLeft } as Promotion;
});

export function getPromotions(): Promise<Promotion[]> {
  return cached("promotions", async () => {
    try {
      const response = await apiGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}`);
      const promotions = (response.promotions ?? [])
        .slice()
        .sort((a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0));

      if (promotions.length === 0) {
        return mockPromotions.filter((p) => p.status !== "ended");
      }

      const totalSales = promotions.reduce((sum, item) => sum + Number(item.sales_amt ?? 0), 0);
      const avgSales = totalSales > 0 ? totalSales / promotions.length : 0;
      const topPromo = promotions[0];
      const weakPromo =
        promotions.find((promo) => Number(promo.sales_amt ?? 0) <= 0) ??
        promotions[promotions.length - 1];

      const aiPromotions: Promotion[] = [];

      if (topPromo) {
        const topTitle = normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "상위 캠페인");
        const topSales = Math.round(Number(topPromo.sales_amt ?? 0));
        const topBills = Math.round(Number(topPromo.bill_cnt ?? 0));
        const topLift = clampPromotionValue(
          8 + (avgSales > 0 ? (topSales / avgSales) * 4 : 3) + (topBills >= 6 ? 3 : 1),
          8,
          18,
        );
        aiPromotions.push({
          id: "promo-ai-live-top",
          status: "ai",
          title: `${topTitle} 재적용 시뮬레이션`,
          description: `${topTitle} 기준 최근 집계 매출 ${fmtKRW(topSales)} · 반응 ${formatNumber(topBills)}건입니다. 최근 집계 기준 재적용 시 증분 효과를 추정합니다.`,
          lunaMetric: `${fmtKRW(Math.round(topSales * (topLift / 100)))} 증분 추정`,
          startDate: toPromoDate(topPromo.biz_date),
          endDate: toPromoDate(topPromo.biz_date),
          actualSales: topSales,
          actualBills: topBills,
          estimatedLiftPct: topLift,
          estimatedSalesAfter: Math.round(topSales * (1 + topLift / 100)),
          estimatedBillsAfter: Math.max(topBills + 1, Math.round(topBills * (1 + topLift * 0.0065))),
          comparisonNote: "최근 집계 기준 재적용 추정",
          performanceTone: "ai",
          simulation: buildPromotionSimulation({
            title: topTitle,
            channel: "전체",
            actualSales: topSales,
            actualBills: topBills,
            estimatedLiftPct: topLift,
            comparisonLabel: "상위 캠페인 재적용",
          }),
        });
      }

      if (weakPromo) {
        const weakTitle = normalizeCampaignYear(weakPromo.campaign_name ?? weakPromo.promo_name ?? "관찰 캠페인");
        const weakSales = Math.round(Number(weakPromo.sales_amt ?? 0));
        const weakBills = Math.round(Number(weakPromo.bill_cnt ?? 0));
        const recoveryLift = clampPromotionValue(
          weakSales <= 0 ? 12 + weakBills : 6 + weakBills * 0.8,
          8,
          22,
        );
        aiPromotions.push({
          id: "promo-ai-live-recovery",
          status: "ai",
          title: `${weakTitle} 개선 시뮬레이션`,
          description:
            weakSales <= 0
              ? `${weakTitle}은 반응 ${formatNumber(weakBills)}건 대비 실매출이 낮아 개선 여지가 큽니다. 최근 집계 기준 회복 시나리오를 제안합니다.`
              : `${weakTitle}은 최근 집계 매출 ${fmtKRW(weakSales)} · 반응 ${formatNumber(weakBills)}건으로 상위 캠페인 대비 약합니다.`,
          lunaMetric: `${fmtKRW(Math.max(4000, Math.round(Math.max(weakSales, avgSales * 0.35) * (recoveryLift / 100))))} 개선 여지`,
          startDate: toPromoDate(weakPromo.biz_date),
          endDate: toPromoDate(weakPromo.biz_date),
          actualSales: weakSales,
          actualBills: weakBills,
          estimatedLiftPct: recoveryLift,
          estimatedSalesAfter: Math.round(Math.max(weakSales, avgSales * 0.35) * (1 + recoveryLift / 100)),
          estimatedBillsAfter: Math.max(weakBills + 2, Math.round(Math.max(weakBills, 3) * (1 + recoveryLift * 0.005))),
          comparisonNote: "반응 대비 매출 회복 추정",
          performanceTone: "ai",
          simulation: buildPromotionSimulation({
            title: weakTitle,
            channel: "전체",
            actualSales: Math.max(weakSales, Math.round(avgSales * 0.35)),
            actualBills: Math.max(weakBills, 3),
            estimatedLiftPct: recoveryLift,
            comparisonLabel: "부진 캠페인 개선",
          }),
        });
      }

      if (topPromo) {
        const bundleTitle = `${normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "상위 캠페인")} 연계 번들`;
        const baseSales = Math.round(Number(topPromo.sales_amt ?? 0));
        const baseBills = Math.round(Number(topPromo.bill_cnt ?? 0));
        const bundleLift = clampPromotionValue(7 + promotions.length * 2 + (baseBills >= 5 ? 2 : 0), 8, 17);
        aiPromotions.push({
          id: "promo-ai-live-bundle",
          status: "ai",
          title: `${bundleTitle} 시뮬레이션`,
          description: `${normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "캠페인")}과 상위 상품을 묶어 적용했을 때의 최근 집계 기준 추정입니다.`,
          lunaMetric: `${fmtKRW(Math.round(baseSales * (bundleLift / 100)))} 매출 확대 추정`,
          startDate: toPromoDate(topPromo.biz_date),
          endDate: toPromoDate(topPromo.biz_date),
          actualSales: baseSales,
          actualBills: baseBills,
          estimatedLiftPct: bundleLift,
          estimatedSalesAfter: Math.round(baseSales * (1 + bundleLift / 100)),
          estimatedBillsAfter: Math.max(baseBills + 1, Math.round(baseBills * (1 + bundleLift * 0.005))),
          comparisonNote: "상위 상품 연계 운영 추정",
          performanceTone: "ai",
          simulation: buildPromotionSimulation({
            title: bundleTitle,
            channel: "이벤트",
            actualSales: baseSales,
            actualBills: baseBills,
            estimatedLiftPct: bundleLift,
            comparisonLabel: "상위 상품 번들 운영",
          }),
        });
      }

      const actualPromotions: Promotion[] = promotions.slice(0, 8).map((promo, index) => {
        const sales = Math.round(Number(promo.sales_amt ?? 0));
        const bills = Math.round(Number(promo.bill_cnt ?? 0));
        const tone: Promotion["performanceTone"] =
          sales <= 0 ? "low" : sales >= avgSales ? "high" : "watch";
        const liftPct =
          tone === "high"
            ? clampPromotionValue(7 + bills * 0.6, 8, 16)
            : tone === "watch"
              ? clampPromotionValue(6 + bills * 0.5, 6, 14)
              : clampPromotionValue(10 + bills, 10, 20);
        return {
          id: `promo-live-${index}`,
          status: "active",
          title: normalizeCampaignYear(promo.campaign_name ?? promo.promo_name ?? `캠페인 ${index + 1}`),
          description:
            promo.note ??
            `매출 ${fmtKRW(sales)} · 반응 ${formatNumber(bills)}건`,
          channel: "전체",
          daysLeft: 0,
          startDate: toPromoDate(promo.biz_date),
          endDate: toPromoDate(promo.biz_date),
          actualSales: sales,
          actualBills: bills,
          estimatedLiftPct: liftPct,
          estimatedSalesAfter:
            sales <= 0
              ? Math.round(Math.max(avgSales * 0.35, 4000) * (1 + liftPct / 100))
              : Math.round(sales * (1 + liftPct / 100)),
          estimatedBillsAfter:
            bills <= 0
              ? Math.max(2, Math.round(2 * (1 + liftPct * 0.005)))
              : Math.max(bills + 1, Math.round(bills * (1 + liftPct * 0.0055))),
          comparisonNote:
            tone === "high"
              ? "최근 집계 기준 성과 상위 캠페인"
              : tone === "low"
                ? "최근 집계 기준 성과 보강 필요"
                : "최근 집계 기준 관찰 필요",
          performanceTone: tone,
          simulation: buildPromotionSimulation({
            title: normalizeCampaignYear(promo.campaign_name ?? promo.promo_name ?? `캠페인 ${index + 1}`),
            channel: "전체",
            actualSales: sales <= 0 ? Math.max(Math.round(avgSales * 0.35), 4000) : sales,
            actualBills: bills <= 0 ? 2 : bills,
            estimatedLiftPct: liftPct,
            comparisonLabel:
              tone === "high"
                ? "상위 캠페인 유지"
                : tone === "low"
                  ? "성과 회복 시뮬레이션"
                  : "운영 개선 시뮬레이션",
          }),
        };
      });

      return [...aiPromotions.slice(0, 3), ...actualPromotions];
    } catch {
      return mockPromotions.filter((p) => p.status !== "ended");
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  AI 검증 — 실데이터 + 파생 데이터
// ══════════════════════════════════════════════════════════════════

type ValidationMetricSource = {
  id: string;
  label: string;
  score_pct?: number | null;
  color?: string | null;
  status?: string | null;
  description?: string | null;
  note?: string | null;
};

type ValidationSummaryResponse = {
  status?: string;
  data_source?: string;
  note?: string;
  metrics?: ValidationMetricSource[];
  last_updated_at?: string;
};

type InventoryCurrentItem = {
  product_id: string;
  product_name: string;
  category?: string | null;
  on_hand_eod: number;
  sold_qty: number;
  waste_qty?: number;
  stockout_minutes: number;
  reorder_triggered?: boolean;
  base_price?: number | null;
  estimated_chance_loss?: number | null;
  stockout_risk?: string | null;
};

type OrderRecommendationItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  base_price?: number | null;
};

type OrderRecommendationOption = {
  option_id: string;
  label: string;
  reference_date?: string;
  total_qty: number;
  total_amount?: number | null;
  deviation_from_avg_pct?: number | null;
  deviation_label?: string | null;
  items: OrderRecommendationItem[];
  flags?: string[];
};

type OrderRecommendationResponse = {
  category?: string | null;
  deadline?: string | null;
  options?: OrderRecommendationOption[];
  four_week_avg_qty?: number | null;
  explanation?: string | null;
  rationale?: {
    summary?: string | null;
    stockout_signal?: { count?: number | null; note?: string | null } | null;
  } | null;
};

type OrderDeadlineItem = {
  product_group: string;
  deadline: string;
  minutes_remaining: number;
  status: string;
  confirmed_order_count?: number | null;
};

type PromoPerformanceItem = {
  promo_id?: string | null;
  promo_name?: string | null;
  campaign_name?: string | null;
  biz_date?: string | null;
  sales_amt?: number | null;
  bill_cnt?: number | null;
  status?: string | null;
  note?: string | null;
};

type PromoPerformanceResponse = {
  data_source?: string;
  note?: string;
  promotions?: PromoPerformanceItem[];
};

type HourlySalesItem = {
  hour: string;
  sales_estimated?: number | null;
  pct_of_daily?: number | null;
};

type HourlySalesResponse = {
  data_source?: string;
  note?: string;
  today?: HourlySalesItem[];
};

type SalesSummaryResponse = {
  today_revenue?: number | null;
  vs_yesterday_same_time_pct?: number | null;
  vs_last_week_same_day_pct?: number | null;
  top_selling?: { product_name?: string | null; sales_amt?: number | null }[];
};

type AiValidationChatSummary = {
  overview: string[];
  trust: string[];
  risk: string[];
  summary: string[];
  suggestedQuestions: string[];
};

type AiValidationSnapshot = {
  metrics: AiValidationMetric[];
  cards: HypothesisCard[];
  logs: AgentLogItem[];
  quality: AiQualityDimension[];
  summary: ValidationSummaryResponse | null;
  chatSummary: AiValidationChatSummary;
};

let _aiValidationSnapshotPromise: Promise<AiValidationSnapshot> | null = null;

function clampScore(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildValidationDate(minutesAgo: number): string {
  const date = new Date(Date.now() - minutesAgo * 60_000);
  const day = String(date.getDate()).padStart(2, "0");
  const time = date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${time}`;
}

function buildValidationLogTime(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getValidationMetricScore(
  metrics: ValidationMetricSource[],
  metricId: string,
  fallback: number,
): number {
  const metric = metrics.find((item) => item.id === metricId);
  return clampScore(Number(metric?.score_pct ?? fallback), 0, 100);
}

function isEstimatedSource(value: string | null | undefined): boolean {
  return typeof value === "string" && /(추정치|static|정적)/i.test(value);
}

function pickMeaningfulInventoryItem(items: InventoryCurrentItem[]): InventoryCurrentItem | null {
  return items.find((item) => isMeaningfulLabel(item.product_name)) || items[0] || null;
}

function topPromoName(item: PromoPerformanceItem | null | undefined): string {
  const raw = item?.promo_name || item?.campaign_name || "캠페인";
  return raw.replace(/20[12]\d\s*년\s*/g, "").replace(/20[12]\d\.\d{2}\.\d{2}/g, "").replace(/\d{2}년\s*/g, "").trim().replace(/^\s*[\-\s]+\s*/, "").trim() || "캠페인";
}

function normalizeCampaignYear(name: string): string {
  return name
    .replace(/20[12]\d\s*년\s*/g, "")
    .replace(/\d{2}년\s*/g, "")
    .replace(/20[12]\d\.\d{2}\.\d{2}/g, "")
    .replace(/^[A-Z]+\)\s*/, "")
    .trim()
    .replace(/^\s*[\-\s]+\s*/, "")
    .trim();
}

function buildFallbackAiValidationSnapshot(): AiValidationSnapshot {
  const metrics: AiValidationMetric[] = [
    { id: "validation-dashboard-coverage", label: "대시보드 실데이터 가용성", accuracy: 82, color: "#0057a9" },
    { id: "validation-order-readiness", label: "발주 추천 근거 가용성", accuracy: 78, color: "#3c8f7c" },
    { id: "validation-promo-coverage", label: "캠페인 실적 연동 상태", accuracy: 66, color: "#7c5cbf" },
    { id: "validation-category-coverage", label: "카테고리 매출 근거 가용성", accuracy: 44, color: "#f59e0b" },
  ];

  const cards: HypothesisCard[] = [
    {
      id: "validation-fallback-1",
      tags: ["검증완료", "생산관리", "재고분석"],
      date: buildValidationDate(11),
      title: "재고 부족 검증은 실제 데이터 재조회가 필요합니다",
      detail: "재고 API 응답이 없어서 품절 위험과 기회손실 근거를 다시 읽지 못했습니다.",
      subItem: { label: "inventory/current 응답이 복구되면 재고 부족 상품과 권장 생산량을 다시 계산합니다." },
      confidence: 82,
    },
    {
      id: "validation-fallback-2",
      tags: ["검증중", "운영관리", "제품분석"],
      date: buildValidationDate(19),
      title: "발주 추천 근거는 마지막 성공 응답 기준으로만 유지됩니다",
      detail: "주문 추천 API 응답이 없어서 상위 품목과 편차를 다시 계산하지 못했습니다.",
      subItem: { label: "order/recommendations 재연결 후 추천 발주량과 마감 리스크를 즉시 갱신합니다." },
      confidence: 68,
    },
    {
      id: "validation-fallback-3",
      tags: ["반증됨", "제품분석"],
      date: buildValidationDate(27),
      title: "카테고리성 평가는 실데이터가 없으면 신뢰하기 어렵습니다",
      detail: "카테고리 매핑과 시간대 매출 근거가 없으면 검증 점수는 참고용으로만 사용해야 합니다.",
      subItem: { label: "카테고리/시간대 실적 API를 우선 연결해 신뢰도를 다시 계산하세요." },
      confidence: 39,
    },
  ];

  const quality: AiQualityDimension[] = [
    { subject: "카테고리성", value: 44 },
    { subject: "시간대별", value: 58 },
    { subject: "채널/경쟁사", value: 36 },
    { subject: "캠페인", value: 66 },
    { subject: "재현성/정합성", value: 74 },
  ];

  const logs: AgentLogItem[] = [
    {
      id: "validation-log-fallback-1",
      time: buildValidationLogTime(4),
      category: "운영관리",
      title: "AI 검증 화면 fallback 생성",
      description: "실데이터 응답이 없어서 마지막 성공 패턴 기반 시연용 검증 카드를 생성했습니다.",
    },
    {
      id: "validation-log-fallback-2",
      time: buildValidationLogTime(12),
      category: "제품분석",
      title: "품질 지표 기본값 적용",
      description: "카테고리, 시간대, 캠페인 축은 기본 점수로 유지 중입니다.",
    },
    {
      id: "validation-log-fallback-3",
      time: buildValidationLogTime(18),
      category: "생산관리",
      title: "재고/발주 API 재시도 대기",
      description: "inventory/current 와 order/recommendations 응답을 다시 기다리고 있습니다.",
    },
  ];

  return {
    metrics,
    cards,
    logs,
    quality,
    summary: {
      status: "warning",
      data_source: "fallback",
      note: "실데이터 응답 실패로 시연용 파생 카드만 유지합니다.",
      metrics: metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        score_pct: metric.accuracy,
        color: metric.color,
      })),
      last_updated_at: new Date().toISOString(),
    },
    chatSummary: {
      overview: [
        "이 화면은 상단 검증 카드, 하단 품질 지표, Agent 활동 로그 순서로 보면 됩니다.",
        "현재는 일부 실데이터 응답이 끊겨 있어서 신뢰도는 참고용으로만 보셔야 합니다.",
        "카테고리성과 채널/경쟁사 축이 특히 낮게 유지되고 있습니다.",
      ],
      trust: [
        "AI 신뢰도는 실데이터 가용성과 검증 근거의 완성도를 함께 뜻합니다.",
        "현재는 fallback 상태라 고신뢰 판단보다 데이터 복구 여부를 먼저 확인해야 합니다.",
        "특히 카테고리성과 채널/경쟁사 축은 아직 mock/derived 비중이 큽니다.",
      ],
      risk: [
        "현재 가장 위험한 항목은 카테고리성 검증입니다.",
        "실데이터가 끊긴 상태라 상품군 해석과 품질 점수를 강하게 신뢰하면 안 됩니다.",
        "재고/발주 API 응답이 복구되면 위험 카드와 권장 조치를 다시 계산합니다.",
      ],
      summary: [
        "AI 검증 카드는 실데이터가 없으면 시연용 파생 카드로만 유지됩니다.",
        "복구 전까지는 고신뢰 항목보다 데이터 공백 여부를 먼저 확인하세요.",
        "우선 확인 포인트는 재고·발주 API 재연결과 카테고리 매핑 상태입니다.",
      ],
      suggestedQuestions: [
        "이 화면에서 뭘 봐야 해?",
        "AI 신뢰도 설명해줘",
        "어떤 검증 결과가 가장 위험해?",
        "점수 낮은 항목 원인 알려줘",
        "검증 결과를 요약해줘",
      ],
    },
  };
}

async function buildAiValidationSnapshot(): Promise<AiValidationSnapshot> {
  const [
    validationSummary,
    inventoryCurrent,
    orderRecommendations,
    orderDeadlines,
    promoPerformance,
    hourlySales,
    salesSummary,
  ] = await Promise.all([
    safeGet<ValidationSummaryResponse>(`/v1/ai-validation/summary?store_id=${STORE_ID}`),
    safeGet<InventoryCurrentItem[]>("/inventory/current"),
    safeGet<OrderRecommendationResponse>("/order/recommendations"),
    safeGet<OrderDeadlineItem[]>("/order/deadlines"),
    safeGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}`),
    safeGet<HourlySalesResponse>(`/v1/analytics/hourly-sales?store_id=${STORE_ID}`),
    safeGet<SalesSummaryResponse>("/home/sales-summary"),
  ]);

  const metricsSource = validationSummary?.metrics ?? [];
  const inventoryItems = Array.isArray(inventoryCurrent) ? inventoryCurrent : [];
  const riskItems = inventoryItems
    .filter((item) => item.stockout_risk === "HIGH" || item.reorder_triggered)
    .sort(
      (a, b) =>
        Number(b.estimated_chance_loss ?? 0) - Number(a.estimated_chance_loss ?? 0) ||
        Number(b.sold_qty ?? 0) - Number(a.sold_qty ?? 0),
    );
  const topRiskItem = pickMeaningfulInventoryItem(riskItems);
  const options = orderRecommendations?.options ?? [];
  const topOption = options.find((option) => (option.items?.length ?? 0) > 0) ?? options[0] ?? null;
  const topRecommendedItems = (topOption?.items ?? []).filter((item) => isMeaningfulLabel(item.product_name)).slice(0, 3);
  const deadlines = (orderDeadlines ?? []).slice().sort(
    (a, b) => Number(a.minutes_remaining ?? 9_999) - Number(b.minutes_remaining ?? 9_999),
  );
  const focusDeadline =
    deadlines.find((item) => ["past_due", "urgent", "soon"].includes(item.status)) ??
    deadlines[0] ??
    null;
  const promoItems = (promoPerformance?.promotions ?? [])
    .slice()
    .sort((a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0));
  const topPromo = promoItems[0] ?? null;
  const weakPromo =
    promoItems.find((item) => Number(item.sales_amt ?? 0) <= 0 || item.status === "tracked") ??
    null;
  const peakHour =
    (hourlySales?.today ?? [])
      .slice()
      .sort((a, b) => Number(b.sales_estimated ?? 0) - Number(a.sales_estimated ?? 0))[0] ?? null;
  const topSellingLabel = salesSummary?.top_selling?.[0]?.product_name ?? null;
  const hasCategoryGap =
    /1개 집계/.test(metricsSource.find((item) => item.id === "validation-category-coverage")?.note ?? "") ||
    !isMeaningfulLabel(topSellingLabel);

  const metrics: AiValidationMetric[] = (metricsSource.length > 0
    ? metricsSource.map((metric) => ({
        id: metric.id,
        label: metric.label,
        accuracy: clampScore(Number(metric.score_pct ?? 0), 0, 100),
        color: metric.color || "#0057a9",
      }))
    : [
        { id: "validation-dashboard-coverage", label: "대시보드 실데이터 가용성", accuracy: 82, color: "#0057a9" },
        { id: "validation-order-readiness", label: "발주 추천 근거 가용성", accuracy: 78, color: "#3c8f7c" },
        { id: "validation-promo-coverage", label: "캠페인 실적 연동 상태", accuracy: 74, color: "#7c5cbf" },
        { id: "validation-category-coverage", label: "카테고리 매출 근거 가용성", accuracy: 52, color: "#f59e0b" },
      ]) as AiValidationMetric[];

  const categoryScore = clampScore(
    getValidationMetricScore(metricsSource, "validation-category-coverage", 68) -
      (hasCategoryGap ? 43 : 8),
    28,
    92,
  );
  const timeScore = clampScore(
    (isEstimatedSource(hourlySales?.data_source) ? 62 : 84) + (peakHour ? 4 : -6),
    36,
    95,
  );
  const channelScore = clampScore(
    (promoItems.length > 0 ? 58 : 42) - (salesSummary?.top_selling?.[0]?.product_name === "B" ? 6 : 0),
    32,
    82,
  );
  const promoScore = clampScore(
    getValidationMetricScore(metricsSource, "validation-promo-coverage", 70) - (weakPromo ? 18 : 4),
    38,
    95,
  );
  const consistencyScore = clampScore(
    Math.round(
      (getValidationMetricScore(metricsSource, "validation-dashboard-coverage", 80) +
        getValidationMetricScore(metricsSource, "validation-order-readiness", 76)) /
        2,
    ) - (riskItems.length >= 10 ? 8 : 0),
    48,
    96,
  );

  const quality: AiQualityDimension[] = [
    { subject: "카테고리성", value: categoryScore },
    { subject: "시간대별", value: timeScore },
    { subject: "채널/경쟁사", value: channelScore },
    { subject: "캠페인", value: promoScore },
    { subject: "재현성/정합성", value: consistencyScore },
  ];

  const cards: HypothesisCard[] = [];

  if (topRiskItem) {
    const lossAmt = Number(topRiskItem.estimated_chance_loss ?? 0);
    const recommendedQty = Math.max(
      Math.round(Number(topRiskItem.sold_qty ?? 0) + Math.abs(Math.min(0, Number(topRiskItem.on_hand_eod ?? 0)))),
      Math.round(Number(topRiskItem.sold_qty ?? 0) * 1.15),
      12,
    );
    cards.push({
      id: "validation-inventory-risk",
      tags: ["검증완료", "생산관리", "재고분석"],
      date: buildValidationDate(7),
      title: `${topRiskItem.product_name} 재고 부족이 손실의 직접 원인으로 확인됩니다`,
      detail: `현재 재고 ${formatNumber(Math.round(Number(topRiskItem.on_hand_eod ?? 0)))}개, 판매 ${formatNumber(
        Math.round(Number(topRiskItem.sold_qty ?? 0)),
      )}개, 품절 ${formatNumber(Math.round(Number(topRiskItem.stockout_minutes ?? 0)))}분으로 ${
        lossAmt > 0 ? `${fmtKRW(Math.round(lossAmt))} 손실이 추정됩니다.` : "기회손실 추정치는 아직 없습니다."
      }`,
      subItem: {
        label: `${topRiskItem.product_name}은 최소 ${formatNumber(recommendedQty)}개 수준까지 생산·보충 기준을 상향하는 것이 안전합니다.`,
      },
      confidence: clampScore(82 + Math.min(12, Math.round(lossAmt / 900)), 82, 96),
    });
  }

  if (focusDeadline) {
    const deadlineConfidenceMap: Record<string, number> = {
      past_due: 92,
      urgent: 88,
      soon: 79,
      scheduled: 63,
    };
    cards.push({
      id: "validation-deadline-risk",
      tags: ["검증중", "운영관리", "제품분석"],
      date: buildValidationDate(14),
      title: `${focusDeadline.product_group} 발주 마감 대응이 운영 리스크에 직접 연결됩니다`,
      detail: `현재 ${focusDeadline.product_group} 마감은 ${focusDeadline.deadline}이며 ${formatNumber(
        Math.max(0, Math.round(Number(focusDeadline.minutes_remaining ?? 0))),
      )}분 남았습니다. 확정 주문은 ${formatNumber(Math.round(Number(focusDeadline.confirmed_order_count ?? 0)))}건입니다.`,
      subItem: {
        label: topOption
          ? `${topOption.label} 추천안 ${formatNumber(Math.round(Number(topOption.total_qty ?? 0)))}개를 기준으로 마감 전 발주 확정 여부를 먼저 확인하세요.`
          : `${focusDeadline.product_group} 카테고리의 확정 주문 상태를 다시 확인하세요.`,
      },
      confidence: clampScore(deadlineConfidenceMap[focusDeadline.status] ?? 64, 58, 94),
    });
  }

  if (topOption && topRecommendedItems.length > 0) {
    const topItemsLabel = topRecommendedItems
      .map((item) => `${item.product_name} ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`)
      .join(", ");
    cards.push({
      id: "validation-order-pattern",
      tags: ["검증완료", "운영관리", "제품분석"],
      date: buildValidationDate(22),
      title: `${topOption.label} 추천안이 현재 수요 패턴과 가장 가깝습니다`,
      detail: `총 ${formatNumber(Math.round(Number(topOption.total_qty ?? 0)))}개로 4주 평균 ${formatNumber(
        Math.round(Number(orderRecommendations?.four_week_avg_qty ?? 0)),
      )}개 대비 ${topOption.deviation_label ?? "평균 수준"}입니다. 상위 품목은 ${topItemsLabel}입니다.`,
      subItem: {
        label:
          orderRecommendations?.explanation ||
          `${topRecommendedItems[0]?.product_name ?? "상위 품목"} 중심으로 먼저 발주를 확정하고 나머지 품목은 재고 상황을 함께 보세요.`,
      },
      confidence: clampScore(
        84 -
          Math.min(22, Math.abs(Number(topOption.deviation_from_avg_pct ?? 0)) * 1.2) +
          (topOption.flags?.includes("CAMPAIGN_PERIOD") ? 4 : 0),
        62,
        91,
      ),
    });
  }

  if (topPromo) {
    cards.push({
      id: "validation-promo-variance",
      tags: ["검증중", "캠페인", "제품분석"],
      date: buildValidationDate(31),
      title: "캠페인 성과 편차는 동일 메시지라도 크게 다르게 나타납니다",
      detail: `${topPromoName(topPromo)}는 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))} / ${formatNumber(
        Math.round(Number(topPromo.bill_cnt ?? 0)),
      )}건 반응을 기록했습니다.${
        weakPromo
          ? ` 반면 ${topPromoName(weakPromo)}는 ${fmtKRW(Math.round(Number(weakPromo.sales_amt ?? 0)))} 수준이라 메시지·노출 경로 재검증이 필요합니다.`
          : " 현재 캠페인은 모두 실적 추적 상태입니다."
      }`,
      subItem: {
        label: weakPromo
          ? `${topPromoName(weakPromo)}는 채널/배너 노출 조건을 다시 검증하고, ${topPromoName(topPromo)}의 조합을 재사용해보세요.`
          : `${topPromoName(topPromo)}의 구성을 유지하면서 반응률이 낮은 시간대만 추가 검증하세요.`,
      },
      confidence: clampScore(weakPromo ? 71 : 79, 56, 88),
    });
  }

  if (hasCategoryGap) {
    cards.push({
      id: "validation-category-gap",
      tags: ["반증됨", "제품분석"],
      date: buildValidationDate(39),
      title: "카테고리 매출 구조 해석은 아직 신뢰하기 어렵습니다",
      detail: metricsSource.find((item) => item.id === "validation-category-coverage")?.note
        ? `현재 카테고리 근거는 ${metricsSource.find((item) => item.id === "validation-category-coverage")?.note} 상태입니다. 상품군 해석보다 상품 단위 실적을 우선 봐야 합니다.`
        : "카테고리 집계가 충분히 정리되지 않아 상품군별 검증 점수는 참고용으로만 보셔야 합니다.",
      subItem: {
        label: "카테고리 매핑이 정비되기 전까지는 재고·발주·상품 판매 데이터를 우선 근거로 사용하세요.",
      },
      confidence: clampScore(categoryScore - 8, 24, 55),
    });
  } else if (peakHour) {
    cards.push({
      id: "validation-peak-hour",
      tags: ["검증중", "운영관리", "제품분석"],
      date: buildValidationDate(39),
      title: `${peakHour.hour} 피크 매출 구간의 재고 정합성 검증이 필요합니다`,
      detail: `최대 매출 시간대는 ${peakHour.hour} (${fmtKRW(
        Math.round(Number(peakHour.sales_estimated ?? 0)),
      )})이며, 이 구간 직전 품절 위험 상품은 ${formatNumber(riskItems.length)}개입니다.`,
      subItem: {
        label: `${peakHour.hour} 1시간 전 기준으로 생산·발주 알람을 앞당겨 운영하는 것이 안전합니다.`,
      },
      confidence: clampScore(timeScore, 50, 84),
    });
  }

  if (cards.length === 0) {
    return buildFallbackAiValidationSnapshot();
  }

  const logs: AgentLogItem[] = [
    {
      id: "validation-log-001",
      time: buildValidationLogTime(4),
      category: "운영관리",
      title: "검증 지표 동기화 완료",
      description: `${formatNumber(metrics.length)}개 검증 항목과 ${validationSummary?.status === "active" ? "실데이터" : "파생"} 점수를 동기화했습니다.`,
    },
    {
      id: "validation-log-002",
      time: buildValidationLogTime(11),
      category: "생산관리",
      title: "재고 부족 상품 분석",
      description: `품절 위험 상품 ${formatNumber(riskItems.length)}개를 재집계하고, 상위 리스크 상품을 카드로 반영했습니다.`,
    },
    {
      id: "validation-log-003",
      time: buildValidationLogTime(17),
      category: "운영관리",
      title: focusDeadline
        ? `${focusDeadline.product_group} 발주 마감 상태 업데이트`
        : "발주 마감 상태 확인",
      description: focusDeadline
        ? `${focusDeadline.deadline} 마감까지 ${formatNumber(Math.max(0, Math.round(Number(focusDeadline.minutes_remaining ?? 0))))}분 남았습니다.`
        : "현재 확인된 발주 마감 데이터가 없습니다.",
    },
    {
      id: "validation-log-004",
      time: buildValidationLogTime(24),
      category: "제품분석",
      title: "캠페인 실적 비교 완료",
      description: topPromo
        ? `${topPromoName(topPromo)} 성과를 기준으로 캠페인 편차 검증 카드를 생성했습니다.`
        : "캠페인 실적 데이터가 없어 편차 분석은 제한적으로 유지합니다.",
    },
    {
      id: "validation-log-005",
      time: buildValidationLogTime(31),
      category: "제품분석",
      title: "시간대 매출 정합성 분석",
      description: peakHour
        ? `${peakHour.hour} 피크 매출 ${fmtKRW(Math.round(Number(peakHour.sales_estimated ?? 0)))}를 기준으로 시간대 품질 점수를 계산했습니다.`
        : "시간대 매출 데이터가 없어 품질 점수를 기본값으로 유지합니다.",
    },
    {
      id: "validation-log-006",
      time: buildValidationLogTime(38),
      category: "운영관리",
      title: "가설 검증 리포트 생성",
      description: `현재 화면 기준 검증 카드 ${formatNumber(cards.length)}개와 활동 로그를 생성했습니다.`,
    },
  ];

  const lowestDimension =
    quality.slice().sort((a, b) => Number(a.value) - Number(b.value))[0] ?? null;
  const highestDimension =
    quality.slice().sort((a, b) => Number(b.value) - Number(a.value))[0] ?? null;
  const primaryRiskCard =
    cards.slice().sort((a, b) => Number(a.confidence) - Number(b.confidence))[0] ?? cards[0];
  const highConfidenceCount = cards.filter((card) => card.confidence >= 80).length;

  const chatSummary: AiValidationChatSummary = {
    overview: [
      "이 화면은 상단 검증 카드, 하단 AI 분석 품질 지표, Agent 활동 로그 순서로 보면 됩니다.",
      cards[0]
        ? `지금 가장 먼저 볼 항목은 "${cards[0].title}"입니다. 현재 신뢰도는 ${cards[0].confidence}%입니다.`
        : "현재 표시된 검증 카드가 없습니다.",
      lowestDimension
        ? `하단 품질 지표에서는 ${lowestDimension.subject} ${lowestDimension.value}%가 가장 낮습니다.`
        : "하단 품질 지표 데이터는 아직 없습니다.",
    ],
    trust: [
      "이 화면의 신뢰도는 모델 확률이 아니라 실데이터 가용성과 검증 근거의 정합성을 뜻합니다.",
      highestDimension && lowestDimension
        ? `현재 가장 높은 축은 ${highestDimension.subject} ${highestDimension.value}%, 가장 낮은 축은 ${lowestDimension.subject} ${lowestDimension.value}%입니다.`
        : "현재 품질 지표 데이터가 충분하지 않습니다.",
      hasCategoryGap
        ? "카테고리 매핑이 아직 약해서 상품군 해석보다는 상품 단위 재고·발주 데이터를 우선 믿는 편이 안전합니다."
        : "카드 우측 퍼센트와 세로 바가 높을수록 현재 실데이터 근거가 더 탄탄합니다.",
    ],
    risk: [
      primaryRiskCard
        ? `가장 위험한 검증 결과는 "${primaryRiskCard.title}"입니다.`
        : "현재 위험 검증 카드를 찾지 못했습니다.",
      primaryRiskCard?.detail ?? "상세 근거 데이터가 아직 없습니다.",
      primaryRiskCard?.subItem.label ?? "우선 재고·발주 데이터를 다시 확인하세요.",
    ],
    summary: [
      `오늘 검증 카드는 ${formatNumber(cards.length)}개이며, 고신뢰 카드(80% 이상)는 ${formatNumber(highConfidenceCount)}개입니다.`,
      `재고 위험 ${formatNumber(riskItems.length)}개, 추천 발주 옵션 ${formatNumber(options.length)}개, 캠페인 ${formatNumber(promoItems.length)}건을 근거로 생성했습니다.`,
      lowestDimension
        ? `보완이 가장 필요한 축은 ${lowestDimension.subject}이며 현재 ${lowestDimension.value}%입니다.`
        : "현재는 실시간 검증 축을 계산하지 못했습니다.",
    ],
    suggestedQuestions: [
      "이 화면에서 뭘 봐야 해?",
      "AI 신뢰도 설명해줘",
      "어떤 검증 결과가 가장 위험해?",
      "점수 낮은 항목 원인 알려줘",
      "검증 결과를 요약해줘",
    ],
  };

  return {
    metrics,
    cards,
    logs,
    quality,
    summary: validationSummary,
    chatSummary,
  };
}

async function getAiValidationSnapshot(): Promise<AiValidationSnapshot> {
  if (_aiValidationSnapshotPromise) return _aiValidationSnapshotPromise;
  _aiValidationSnapshotPromise = buildAiValidationSnapshot()
    .catch(() => buildFallbackAiValidationSnapshot())
    .finally(() => {
      /* keep resolved promise cached for current session */
    });
  return _aiValidationSnapshotPromise;
}

export function getAiValidationMetrics(): Promise<AiValidationMetric[]> {
  return getAiValidationSnapshot().then((snapshot) => snapshot.metrics);
}

export function getHypothesisCards(): Promise<HypothesisCard[]> {
  return getAiValidationSnapshot().then((snapshot) => snapshot.cards);
}

export function getAgentLogs(): Promise<AgentLogItem[]> {
  return getAiValidationSnapshot().then((snapshot) => snapshot.logs);
}

export function getAiQualityDimensions(): Promise<AiQualityDimension[]> {
  return getAiValidationSnapshot().then((snapshot) => snapshot.quality);
}

export function getAiValidationChatSummary(): Promise<AiValidationChatSummary> {
  return getAiValidationSnapshot().then((snapshot) => snapshot.chatSummary);
}

// ══════════════════════════════════════════════════════════════════
//  벤치마킹 — 실데이터 + 파생 비교
// ══════════════════════════════════════════════════════════════════

type BenchmarkMetric = {
  id: string;
  category: string;
  my_store_value: string;
  benchmark_value: string;
  diff_pct: number | null;
  is_higher: boolean | null;
};

type BenchmarkPeerRow = {
  store_id: string;
  store_name: string;
  daily_avg_sales?: number | null;
  daily_avg_qty?: number | null;
  daily_avg_waste?: number | null;
  sales_diff_pct?: number | null;
  qty_diff_pct?: number | null;
  waste_diff_pct?: number | null;
  top_product?: string | null;
  peak_hour?: number | null;
  peak_hour_sales?: number | null;
  is_recommended?: boolean | null;
};

type BenchmarkSummaryResponse = {
  status?: string;
  data_source?: string;
  note?: string | null;
  period?: { start: string; end: string };
  store?: { store_id?: string; store_name?: string };
  compare_stores?: BenchmarkPeerRow[];
  rank_among_stores?: number | null;
  total_stores?: number | null;
  strengths?: string[];
  risks?: string[];
  sales_gap_pct?: number | null;
  metrics?: BenchmarkMetric[];
};

type BenchmarkHourlyStore = {
  store_id: string;
  store_name: string;
  points: { hour: number; sales: number; qty: number; txn_cnt: number }[];
};

type BenchmarkTopItemStore = {
  store_id: string;
  store_name: string;
  items: { product_id: string; product_name: string; sold_qty: number; sales_amt: number }[];
};

type BenchmarkChannelStore = {
  store_id: string;
  store_name: string;
  channels: { channel_group: string; sales_amt: number; order_count: number; pct_of_total: number }[];
};

type BenchmarkPaymentStore = {
  store_id: string;
  store_name: string;
  methods: { payment_group: string; sales_amt: number; pct_of_total: number }[];
};

type BenchmarkPromotionStore = {
  store_id: string;
  store_name: string;
  promotions: { campaign_name: string; sales_amt: number; bill_cnt: number }[];
};

export type BenchmarkPeerCard = {
  id: string;
  storeId: string;
  storeName: string;
  salesDiff: number;
  quantityDiff: number;
  wasteDiff: number;
  mainProduct: string;
  peakHourLabel: string;
  recommendation: string;
  isRecommended: boolean;
  similarityScore?: number;
  similarityReasons?: string[];
  whyBetter?: string;
};

export type BenchmarkSimilarPeer = {
  storeId: string;
  storeName: string;
  similarityScore: number;
  reasons: string[];
  whyBetter: string;
  salesDiff: number;
};

export type BenchmarkSnapshot = {
  status: string;
  dataSource: string;
  note: string | null;
  period: { start: string; end: string };
  storeName: string;
  compareStoreIds: string[];
  metrics: BenchmarkMetric[];
  peerCards: BenchmarkPeerCard[];
  similarPeers: BenchmarkSimilarPeer[];
  strengths: string[];
  risks: string[];
  rankAmongStores: number | null;
  totalStores: number | null;
  hourlyStores: BenchmarkHourlyStore[];
  topItemStores: BenchmarkTopItemStore[];
  channelStores: BenchmarkChannelStore[];
  paymentStores: BenchmarkPaymentStore[];
  promotionStores: BenchmarkPromotionStore[];
  chatSummary: {
    overview: string[];
    risk: string[];
    summary: string[];
    suggestedQuestions: string[];
  };
};

function buildBenchmarkSuggestedQuestions(compareStoreIds: string[]) {
  const compareNames = compareStoreIds
    .map((storeId) =>
      DEMO_BENCHMARK_COMPARE_STORES.find((store) => store.storeId === storeId)?.storeName ??
      resolveDemoStoreName(storeId, storeId),
    )
    .slice(0, 3);
  return [
    `${DEMO_PRIMARY_STORE_NAME}와 ${compareNames[0] ?? "안양시01"} 차이 알려줘`,
    "시간대가 비슷한 매장 알려줘",
    "판매 종류가 비슷한 매장 알려줘",
    "나보다 매출 높은데 유사한 매장 알려줘",
    `${compareNames[1] ?? "강서구01"}과 ${compareNames[2] ?? "마포구01"} 차이 알려줘`,
  ];
}

function buildBenchmarkQuery(compareStoreIds?: string[]): string {
  const params = new URLSearchParams({ store_id: STORE_ID });
  const selectedStoreIds = compareStoreIds ?? getBenchmarkCompareStoreIds();
  selectedStoreIds.forEach((storeId) => params.append("compare_store_ids", storeId));
  params.set("biz_date", getDemoDate());
  return params.toString();
}

function buildFallbackBenchmarkSnapshot(compareStoreIds?: string[]): BenchmarkSnapshot {
  const selectedStoreIds = compareStoreIds ?? getBenchmarkCompareStoreIds();
  const demoDate = getDemoDate();
  const startDate = new Date(`${demoDate}T00:00:00+09:00`);
  startDate.setDate(startDate.getDate() - 6);
  const peerCards = [
    { id: "bench-anyang", storeId: "POC_011", storeName: resolveDemoStoreName("POC_011", "안양시01"), salesDiff: 305.2, quantityDiff: 219.3, wasteDiff: 0, mainProduct: "도넛프라이데이", peakHourLabel: "19시", recommendation: "오후 피크 대응과 캠페인 결합 강도가 높습니다.", isRecommended: true },
    { id: "bench-seongnam", storeId: "POC_030", storeName: resolveDemoStoreName("POC_030", "성남시01"), salesDiff: 269.1, quantityDiff: 183.7, wasteDiff: 0, mainProduct: "먼치킨팩", peakHourLabel: "16시", recommendation: "패키지/행사 상품 매출이 강합니다.", isRecommended: true },
    { id: "bench-suwon", storeId: "POC_031", storeName: resolveDemoStoreName("POC_031", "수원시01"), salesDiff: 429.1, quantityDiff: 294.1, wasteDiff: 0, mainProduct: "신용카드 결제 중심", peakHourLabel: "15시", recommendation: "퇴근 시간대 매출과 객수 집중이 가장 강합니다.", isRecommended: true },
    { id: "bench-gangseo", storeId: "POC_010", storeName: resolveDemoStoreName("POC_010", "강서구01"), salesDiff: 241.4, quantityDiff: 188.5, wasteDiff: -12.5, mainProduct: "카페모카", peakHourLabel: "17시", recommendation: "오후 매출 집중과 결제수단 구성이 안정적입니다.", isRecommended: true },
    { id: "bench-mapo1", storeId: "POC_012", storeName: resolveDemoStoreName("POC_012", "마포구01"), salesDiff: 198.7, quantityDiff: 164.2, wasteDiff: -8.2, mainProduct: "아메리카노", peakHourLabel: "18시", recommendation: "도심 상권 특성상 퇴근 전후 수요와 캠페인 반응이 강합니다.", isRecommended: true },
    { id: "bench-mapo2", storeId: "POC_009", storeName: resolveDemoStoreName("POC_009", "마포구02"), salesDiff: 226.8, quantityDiff: 176.4, wasteDiff: -4.8, mainProduct: "글레이즈드", peakHourLabel: "16시", recommendation: "상위 상품 판매력과 프로모션 건수가 고르게 유지됩니다.", isRecommended: true },
  ].filter((peer) => selectedStoreIds.includes(peer.storeId));
  return {
    status: "fallback",
    dataSource: "fallback",
    note: "벤치마킹 실데이터를 불러오지 못해 기존 시연용 데이터로 표시합니다.",
    period: { start: startDate.toISOString().slice(0, 10), end: demoDate },
    storeName: DEMO_PRIMARY_STORE_NAME,
    compareStoreIds: selectedStoreIds,
    metrics: [
      { id: "benchmark-sales", category: "일평균 매출", my_store_value: "522,660원", benchmark_value: "1,689,079원", diff_pct: -69.1, is_higher: false },
      { id: "benchmark-qty", category: "일평균 판매수량", my_store_value: "280", benchmark_value: "678", diff_pct: -58.7, is_higher: false },
      { id: "benchmark-waste", category: "일평균 폐기수량", my_store_value: "0", benchmark_value: "0", diff_pct: -100, is_higher: true },
    ],
    peerCards,
    similarPeers: peerCards.slice(0, 3).map((peer, index) => ({
      storeId: peer.storeId,
      storeName: peer.storeName,
      similarityScore: 72 - index * 6,
      reasons: ["시간대 패턴이 비슷함", "상위 상품 구성이 비슷함"],
      whyBetter: `${peer.storeName}은 ${peer.peakHourLabel} 피크 대응이 강하고 상위 상품 판매량이 높습니다.`,
      salesDiff: peer.salesDiff,
    })),
    strengths: ["폐기수량은 비교 매장 평균 이하로 관리되고 있습니다."],
    risks: ["비교 매장 평균 대비 일평균 매출과 판매수량이 모두 낮습니다."],
    rankAmongStores: 31,
    totalStores: DEMO_BENCHMARK_STORE_COUNT,
    hourlyStores: [],
    topItemStores: [],
    channelStores: [],
    paymentStores: [],
    promotionStores: [],
    chatSummary: {
      overview: [
        `${DEMO_PRIMARY_STORE_NAME}은 비교 매장 평균 대비 매출과 판매수량이 모두 낮습니다.`,
        "반면 폐기수량은 평균 이하라 운영 손실은 상대적으로 안정적입니다.",
        `${selectedStoreIds.map((storeId) => resolveDemoStoreName(storeId, storeId)).join("·")}와의 차이를 시간대, 상품, 결제수단 기준으로 함께 보는 것이 좋습니다.`,
      ],
      risk: [
        "현재 가장 큰 차이는 오후 피크 시간대와 행사 상품 매출입니다.",
        "비교 매장들은 15~19시 매출 집중과 캠페인 반응이 더 강합니다.",
        "상위 상품과 온라인 채널 구성을 함께 점검해야 합니다.",
      ],
      summary: [
        "우리 매장 vs 비교 매장 벤치마킹 snapshot을 불러오지 못했습니다.",
        "기본 fallback 기준으로는 매출/판매수량 개선이 우선 과제입니다.",
      ],
      suggestedQuestions: buildBenchmarkSuggestedQuestions(selectedStoreIds),
    },
  };
}

function buildNumericProfile(values: Record<string, number>) {
  const entries = Object.entries(values);
  const denominator = Math.sqrt(
    entries.reduce((sum, [, value]) => sum + value * value, 0),
  );
  return { entries, denominator };
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>) {
  const profileA = buildNumericProfile(a);
  const profileB = buildNumericProfile(b);
  if (!profileA.denominator || !profileB.denominator) return 0;
  const mapB = new Map(profileB.entries);
  const dot = profileA.entries.reduce(
    (sum, [key, value]) => sum + value * (mapB.get(key) ?? 0),
    0,
  );
  return clampPromotionValue((dot / (profileA.denominator * profileB.denominator)) * 100, 0, 100);
}

function buildHourlyVector(points: BenchmarkHourlyStore["points"] | undefined) {
  const vector: Record<string, number> = {};
  (points ?? []).forEach((point) => {
    vector[String(point.hour)] = Number(point.sales ?? 0);
  });
  return vector;
}

function buildShareVector<T extends { [key: string]: unknown }>(
  rows: T[] | undefined,
  keyField: keyof T,
  valueField: keyof T,
) {
  const vector: Record<string, number> = {};
  (rows ?? []).forEach((row) => {
    const key = String(row[keyField] ?? "");
    if (!key) return;
    vector[key] = Number(row[valueField] ?? 0);
  });
  return vector;
}

function buildTopItemVector(items: BenchmarkTopItemStore["items"] | undefined) {
  const vector: Record<string, number> = {};
  (items ?? []).slice(0, 5).forEach((item) => {
    const key = cleanProductName(item.product_name);
    vector[key] = Number(item.sales_amt ?? item.sold_qty ?? 0);
  });
  return vector;
}

function buildBenchmarkSimilarity(
  baseStoreId: string,
  peerCards: BenchmarkPeerCard[],
  hourlyStores: BenchmarkSnapshot["hourlyStores"],
  topItemStores: BenchmarkSnapshot["topItemStores"],
  channelStores: BenchmarkSnapshot["channelStores"],
  paymentStores: BenchmarkSnapshot["paymentStores"],
): BenchmarkSimilarPeer[] {
  const baseHourly = buildHourlyVector(
    hourlyStores.find((store) => store.store_id === baseStoreId)?.points,
  );
  const baseItems = buildTopItemVector(
    topItemStores.find((store) => store.store_id === baseStoreId)?.items,
  );
  const baseChannels = buildShareVector(
    channelStores.find((store) => store.store_id === baseStoreId)?.channels,
    "channel_group",
    "pct_of_total",
  );
  const basePayments = buildShareVector(
    paymentStores.find((store) => store.store_id === baseStoreId)?.methods,
    "payment_group",
    "pct_of_total",
  );

  return peerCards
    .filter((peer) => peer.salesDiff > 0)
    .map((peer) => {
      const hourlySimilarity = cosineSimilarity(
        baseHourly,
        buildHourlyVector(hourlyStores.find((store) => store.store_id === peer.storeId)?.points),
      );
      const productSimilarity = cosineSimilarity(
        baseItems,
        buildTopItemVector(topItemStores.find((store) => store.store_id === peer.storeId)?.items),
      );
      const channelSimilarity = cosineSimilarity(
        baseChannels,
        buildShareVector(
          channelStores.find((store) => store.store_id === peer.storeId)?.channels,
          "channel_group",
          "pct_of_total",
        ),
      );
      const paymentSimilarity = cosineSimilarity(
        basePayments,
        buildShareVector(
          paymentStores.find((store) => store.store_id === peer.storeId)?.methods,
          "payment_group",
          "pct_of_total",
        ),
      );

      const similarityScore = Math.round(
        hourlySimilarity * 0.45 +
          productSimilarity * 0.3 +
          channelSimilarity * 0.15 +
          paymentSimilarity * 0.1,
      );
      const reasons: string[] = [];
      if (hourlySimilarity >= 55) reasons.push("시간대 패턴이 비슷함");
      if (productSimilarity >= 45) reasons.push("상위 상품 구성이 비슷함");
      if (channelSimilarity >= 60) reasons.push("채널 비중이 비슷함");
      if (paymentSimilarity >= 60) reasons.push("결제수단 비중이 비슷함");
      if (reasons.length === 0) reasons.push("운영 패턴 일부가 유사함");
      const whyBetter =
        peer.salesDiff > 0
          ? `${peer.storeName}은 ${peer.peakHourLabel} 피크 대응과 ${peer.mainProduct} 판매력이 강해 매출이 더 높습니다.`
          : `${peer.storeName}은 운영 패턴은 비슷하지만 매출 격차는 크지 않습니다.`;
      return {
        storeId: peer.storeId,
        storeName: peer.storeName,
        similarityScore,
        reasons,
        whyBetter,
        salesDiff: peer.salesDiff,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore || b.salesDiff - a.salesDiff)
    .slice(0, 3);
}

async function buildBenchmarkSnapshot(options?: { compareStoreIds?: string[] }): Promise<BenchmarkSnapshot> {
  const selectedStoreIds = options?.compareStoreIds ?? getBenchmarkCompareStoreIds();
  const query = buildBenchmarkQuery(selectedStoreIds);
  const [summary, hourly, topItems, channels, payments, promotions] = await Promise.all([
    safeGet<BenchmarkSummaryResponse>(`/v1/benchmarking/summary?${query}`),
    safeGet<{ stores?: BenchmarkHourlyStore[] }>(`/v1/benchmarking/hourly-sales?${query}`),
    safeGet<{ stores?: BenchmarkTopItemStore[]; period?: { start: string; end: string } }>(`/v1/benchmarking/top-items?${query}`),
    safeGet<{ stores?: BenchmarkChannelStore[] }>(`/v1/benchmarking/channel-comparison?${query}`),
    safeGet<{ stores?: BenchmarkPaymentStore[] }>(`/v1/benchmarking/payment-comparison?${query}`),
    safeGet<{ stores?: BenchmarkPromotionStore[] }>(`/v1/benchmarking/promotion-comparison?${query}`),
  ]);

  if (!summary) {
    return buildFallbackBenchmarkSnapshot(selectedStoreIds);
  }

  const peerCards: BenchmarkPeerCard[] = (summary.compare_stores ?? []).map((peer) => {
    const peerName = resolveDemoStoreName(peer.store_id, peer.store_name);
    const paymentFocus =
      payments?.stores?.find((store) => store.store_id === peer.store_id)?.methods?.[0]?.payment_group ?? "결제 데이터 없음";
    const promotionFocus =
      normalizeCampaignYear(promotions?.stores?.find((store) => store.store_id === peer.store_id)?.promotions?.[0]?.campaign_name ?? "캠페인 데이터 없음");
    const recommendation =
      peer.sales_diff_pct != null && peer.sales_diff_pct > 0
        ? `${peerName}은 ${peer.peak_hour != null ? `${peer.peak_hour}시 피크` : "피크 운영"}와 ${promotionFocus} 반응이 강합니다.`
        : `${peerName}은 ${paymentFocus} 비중과 ${peer.top_product ?? "상위 상품"} 구성이 비교 포인트입니다.`;
    return {
      id: `benchmark-${peer.store_id}`,
      storeId: peer.store_id,
      storeName: peerName,
      salesDiff: Number(peer.sales_diff_pct ?? 0),
      quantityDiff: Number(peer.qty_diff_pct ?? 0),
      wasteDiff: Number(peer.waste_diff_pct ?? 0),
      mainProduct: cleanProductName(peer.top_product ?? "상위 상품 없음"),
      peakHourLabel: peer.peak_hour != null ? `${peer.peak_hour}시` : "-",
      recommendation,
      isRecommended: Boolean(peer.is_recommended),
    };
  });

  const ourHourly = hourly?.stores?.find((store) => store.store_id === STORE_ID);
  const strongestHour = ourHourly?.points?.slice().sort((a, b) => b.sales - a.sales)[0] ?? null;
  const strongestItem = topItems?.stores?.find((store) => store.store_id === STORE_ID)?.items?.[0] ?? null;
  const weakestMetric =
    (summary.metrics ?? [])
      .filter((metric) => typeof metric.diff_pct === "number")
      .slice()
      .sort((a, b) => Number(a.diff_pct ?? 0) - Number(b.diff_pct ?? 0))[0] ?? null;

  const temporarySnapshot = {
    hourlyStores: (hourly?.stores ?? []).map((store) => ({ ...store, store_name: resolveDemoStoreName(store.store_id, store.store_name) })),
    topItemStores: (topItems?.stores ?? []).map((store) => ({ ...store, store_name: resolveDemoStoreName(store.store_id, store.store_name) })),
    channelStores: (channels?.stores ?? []).map((store) => ({ ...store, store_name: resolveDemoStoreName(store.store_id, store.store_name) })),
    paymentStores: (payments?.stores ?? []).map((store) => ({ ...store, store_name: resolveDemoStoreName(store.store_id, store.store_name) })),
  };
  const similarPeers = buildBenchmarkSimilarity(
    STORE_ID,
    peerCards,
    temporarySnapshot.hourlyStores,
    temporarySnapshot.topItemStores,
    temporarySnapshot.channelStores,
    temporarySnapshot.paymentStores,
  );
  const peerCardsWithSimilarity = peerCards.map((peer) => {
    const matched = similarPeers.find((item) => item.storeId === peer.storeId);
    return matched
      ? {
          ...peer,
          similarityScore: matched.similarityScore,
          similarityReasons: matched.reasons,
          whyBetter: matched.whyBetter,
        }
      : peer;
  });

  const chatSummary = {
    overview: [
      `${resolveDemoStoreName(summary.store?.store_id ?? STORE_ID, summary.store?.store_name ?? DEMO_PRIMARY_STORE_NAME)}의 현재 전체 순위는 ${summary.rank_among_stores ?? "-"} / ${summary.total_stores ?? DEMO_BENCHMARK_STORE_COUNT}입니다.`,
      typeof summary.sales_gap_pct === "number"
        ? `비교 매장 평균 대비 일평균 매출 격차는 ${formatPct(summary.sales_gap_pct)}입니다.`
        : "비교 매출 격차는 아직 계산되지 않았습니다.",
      strongestItem
        ? `우리 매장의 대표 상품은 ${strongestItem.product_name}이고 판매수량은 ${formatNumber(Math.round(strongestItem.sold_qty))}개입니다.`
        : "현재 대표 상품 데이터가 없습니다.",
    ],
    risk: [
      weakestMetric
        ? `가장 약한 비교 지표는 ${weakestMetric.category}이며 격차는 ${formatPct(weakestMetric.diff_pct)}입니다.`
        : "가장 약한 비교 지표를 계산하지 못했습니다.",
      strongestHour
        ? `우리 매장 피크 시간은 ${strongestHour.hour}시이고 매출은 ${fmtKRW(Math.round(strongestHour.sales))}입니다.`
        : "우리 매장 피크 시간대 데이터가 없습니다.",
      summary.risks?.[0] ?? "현재 비교 매장 대비 개선 포인트를 추가 확인해 주세요.",
    ],
    summary: [
      `${resolveDemoStoreName(summary.store?.store_id ?? STORE_ID, summary.store?.store_name ?? DEMO_PRIMARY_STORE_NAME)} vs 비교 매장 ${formatNumber(peerCards.length)}곳 기준 벤치마킹입니다.`,
      summary.strengths?.[0] ?? "강점 요약은 아직 없습니다.",
      summary.risks?.[0] ?? "추가 개선 포인트는 화면 하단 비교 카드를 확인해 주세요.",
      similarPeers[0]
        ? `유사 매장 추천 1순위는 ${similarPeers[0].storeName}이며 ${similarPeers[0].reasons.join(", ")} 기준입니다.`
        : "유사 매장 추천은 비교군이 더 필요합니다.",
    ],
    suggestedQuestions: buildBenchmarkSuggestedQuestions(selectedStoreIds),
  };

  return {
    status: summary.status ?? "active",
    dataSource: summary.data_source ?? "benchmarking",
    note: summary.note ?? null,
    period:
      summary.period ??
      {
        start: (() => {
          const start = new Date(`${getDemoDate()}T00:00:00+09:00`);
          start.setDate(start.getDate() - 6);
          return start.toISOString().slice(0, 10);
        })(),
        end: getDemoDate(),
      },
    storeName: resolveDemoStoreName(summary.store?.store_id ?? STORE_ID, summary.store?.store_name ?? DEMO_PRIMARY_STORE_NAME),
    compareStoreIds: selectedStoreIds,
    metrics: summary.metrics ?? [],
    peerCards: peerCardsWithSimilarity,
    similarPeers,
    strengths: summary.strengths ?? [],
    risks: summary.risks ?? [],
    rankAmongStores: summary.rank_among_stores ?? null,
    totalStores: summary.total_stores ?? DEMO_BENCHMARK_STORE_COUNT,
    hourlyStores: temporarySnapshot.hourlyStores,
    topItemStores: temporarySnapshot.topItemStores,
    channelStores: temporarySnapshot.channelStores,
    paymentStores: temporarySnapshot.paymentStores,
    promotionStores: (promotions?.stores ?? []).map((store) => ({ ...store, store_name: resolveDemoStoreName(store.store_id, store.store_name) })),
    chatSummary,
  };
}

const _benchmarkSnapshotPromiseMap = new Map<string, Promise<BenchmarkSnapshot>>();

export function getBenchmarkSnapshot(options?: { compareStoreIds?: string[] }): Promise<BenchmarkSnapshot> {
  const selectedStoreIds = options?.compareStoreIds ?? getBenchmarkCompareStoreIds();
  const key = `${getDemoDate()}::${selectedStoreIds.join(",")}`;
  if (_benchmarkSnapshotPromiseMap.has(key)) {
    return _benchmarkSnapshotPromiseMap.get(key)!;
  }
  const promise = buildBenchmarkSnapshot({ compareStoreIds: selectedStoreIds }).catch(() =>
    buildFallbackBenchmarkSnapshot(selectedStoreIds),
  );
  _benchmarkSnapshotPromiseMap.set(key, promise);
  return promise;
}

export function getBenchmarkChatSummary(options?: { compareStoreIds?: string[] }): Promise<BenchmarkSnapshot["chatSummary"]> {
  return getBenchmarkSnapshot(options).then((snapshot) => snapshot.chatSummary);
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
    const [inventoryItems, alerts] = await Promise.all([
      apiGet<InventoryCurrentItem[]>("/inventory/current"),
      apiGet<unknown[]>("/home/alerts").catch(() => []),
    ]);

    const recs = (inventoryItems ?? [])
      .filter((item) => item.stockout_risk === "HIGH" || item.reorder_triggered)
      .slice(0, 3)
      .map((item) => ({
        product_name: item.product_name,
        recommended_qty: Math.max(
          Math.round(Number(item.sold_qty ?? 0) + Math.abs(Math.min(0, Number(item.on_hand_eod ?? 0)))),
          8,
        ),
        urgency: item.stockout_risk === "HIGH" ? "high" : "medium",
        reason:
          Number(item.estimated_chance_loss ?? 0) > 0
            ? `${item.product_name} 기회손실 ${fmtKRW(Math.round(Number(item.estimated_chance_loss ?? 0)))} 추정`
            : `${item.product_name} ${getInventoryDisplayMetrics(Number(item.on_hand_eod ?? 0)).detailLabel}`,
      }));
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
    title: "캠페인 업데이트",
        subtitle: "오후 할인 이벤트 등록 권장",
      badgeType: "추천",
      avatarInitial: icoAction01,
    });

    return actions;
  } catch {
    return mockDelay([
      { id: "action-001", title: "내 생산 계획", subtitle: "매출 예측 기반 권장", badgeType: "추천" as const, avatarInitial: icoAction01 },
      { id: "action-002", title: "부족 자재", subtitle: "우유, 파우더 외 3건", badgeType: "긴급" as const, avatarInitial: icoAction02 },
      { id: "action-003", title: "캠페인 업데이트", subtitle: "오후 할인 이벤트 등록 권장", badgeType: "추천" as const, avatarInitial: icoAction01 },
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
    let deadlineStr = "D-2일 9시까지";
    if (firstDeadline?.deadline) {
      const d = new Date(firstDeadline.deadline);
      if (!isNaN(d.getTime())) {
        deadlineStr = d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      } else {
        deadlineStr = firstDeadline.deadline;
      }
    }

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
    const [summaryData, inventoryItems] = await Promise.all([
      apiGet<{
        today_revenue: number;
        vs_yesterday_same_time_pct: number;
        hourly_trend: { hour: number; revenue: number }[];
      }>("/home/sales-summary"),
      apiGet<InventoryCurrentItem[]>("/inventory/current"),
    ]);

    const pct = summaryData.vs_yesterday_same_time_pct ?? 0;
    const hourlyData = (summaryData.hourly_trend ?? []).map((h) => ({
      time: `${h.hour}:00`,
      value: h.revenue,
    }));

    const topItems = (inventoryItems ?? [])
      .filter((item) => isMeaningfulLabel(item.product_name))
      .sort((a, b) => Number(b.sold_qty ?? 0) - Number(a.sold_qty ?? 0))
      .slice(0, 5)
      .map((item, index) => ({
      rank: index + 1,
      name: item.product_name,
      count: `${Math.round(Number(item.sold_qty ?? 0))}개`,
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
    const [inventoryRaw, cockpitRaw] = await Promise.all([
      safeGet<InventoryCurrentItem[]>("/inventory/current"),
      safeGet<{
        items?: Array<{
          product_id: string;
          product_name?: string | null;
          category?: string | null;
          current_stock?: number | null;
          predicted_stock_1h?: number | null;
          hourly_burn_rate?: number | null;
          stockout_probability?: number | null;
          recommended_production_qty?: number | null;
          first_production?: { avg_time?: string | null; avg_qty?: number | null } | null;
          second_production?: { avg_time?: string | null; avg_qty?: number | null } | null;
          risk_level?: string | null;
          why?: string[] | null;
        }>;
        last_updated_at?: string;
      }>(`/v1/dashboard/production?store_id=${STORE_ID}`),
    ]);

    const inventoryItems = inventoryRaw ?? [];
    const inventoryMap = new Map(
      inventoryItems.map((item) => [String(item.product_id), item]),
    );
    const cockpitItems = cockpitRaw?.items ?? [];

    const items = (cockpitItems.length > 0 ? cockpitItems : inventoryItems).map((item) => {
      const productId = String(item.product_id);
      const inventoryItem = inventoryMap.get(productId);
      const productName = resolveProductDisplayName(
        String(
          inventoryItem?.product_name ??
            ("product_name" in item ? item.product_name : null) ??
            productId,
        ),
      );
      const rawCurrentStock = Number(
        ("current_stock" in item ? item.current_stock : null) ??
          inventoryItem?.on_hand_eod ??
          0,
      );
      const current = getInventoryDisplayMetrics(rawCurrentStock);
      const rawPredictedStock = Number(
        ("predicted_stock_1h" in item ? item.predicted_stock_1h : null) ??
          rawCurrentStock,
      );
      const predicted = getInventoryDisplayMetrics(rawPredictedStock);
      const stockoutRisk = String(
        inventoryItem?.stockout_risk ?? ("risk_level" in item ? item.risk_level : "LOW") ?? "LOW",
      ).toUpperCase();
      const hourlyBurnRate = Number(
        ("hourly_burn_rate" in item ? item.hourly_burn_rate : null) ?? 0,
      );
      const recommendedProductionQty = Math.max(
        0,
        Math.round(
          Number(
            ("recommended_production_qty" in item ? item.recommended_production_qty : null) ??
              current.shortage,
          ),
        ),
      );
      const firstProduction =
        "first_production" in item ? item.first_production ?? null : null;
      const secondProduction =
        "second_production" in item ? item.second_production ?? null : null;
      const why = Array.isArray("why" in item ? item.why : null)
        ? (item.why ?? []).filter(Boolean)
        : [];
      const shortage = Math.max(current.shortage, predicted.shortage);
      const currentPhrase = current.currentLabel;
      const predictedPhrase =
        predicted.shortage > 0
          ? `1시간 뒤 예상 0개 · 부족 ${formatNumber(predicted.shortage)}개`
          : `1시간 뒤 예상 ${formatNumber(predicted.currentCount)}개`;
      const groundingLabel = joinCompact([
        `근거: 최근 1시간 판매 속도 ${formatBurnRate(hourlyBurnRate)}`,
        firstProduction?.avg_time
          ? `최근 4주 1차 ${firstProduction.avg_time} / ${formatNumber(
              Number(firstProduction.avg_qty ?? 0),
            )}개`
          : "최근 4주 1차 생산 패턴 부족",
        secondProduction?.avg_time
          ? `2차 ${secondProduction.avg_time} / ${formatNumber(
              Number(secondProduction.avg_qty ?? 0),
            )}개`
          : "2차 생산 패턴 부족",
        "리드타임 1시간 반영",
        why[0] ? `실적 기반 추정 (${why[0]})` : "실적 기반 추정",
      ]);
      const actionLabel =
        shortage > 0 || recommendedProductionQty > 0
          ? `${productName} ${formatNumber(
              recommendedProductionQty || shortage,
            )}개 1차 생산 등록을 검토하세요.`
          : `${productName}은 현재 모니터링 유지 대상입니다.`;

      return {
        id: `prod-${productId}`,
        name: productName,
        quantity: current.currentCount,
        isLow:
          stockoutRisk === "HIGH" ||
          stockoutRisk === "MEDIUM" ||
          shortage > 0 ||
          rawCurrentStock <= 0,
        shortage,
        badgeLabel:
          shortage > 0 ? `부족 ${formatNumber(shortage)}개` : current.badgeLabel,
        detailLabel: joinCompact([currentPhrase, predictedPhrase]),
        currentLabel: currentPhrase,
        predictedStock1h: predicted.currentCount,
        predictedLabel: predictedPhrase,
        recommendedProductionQty,
        hourlyBurnRate,
        riskLevel: stockoutRisk,
        stockoutProbability: Number(
          ("stockout_probability" in item ? item.stockout_probability : null) ?? 0,
        ),
        groundingLabel,
        actionLabel: `지금 할 일: ${actionLabel}`,
        firstProductionTime: firstProduction?.avg_time ?? null,
        firstProductionQty: Number(firstProduction?.avg_qty ?? 0) || null,
        secondProductionTime: secondProduction?.avg_time ?? null,
        secondProductionQty: Number(secondProduction?.avg_qty ?? 0) || null,
        leadTimeLabel: "리드타임 1시간 반영",
      };
    });

    const lowItems = items.filter((i) => i.isLow);
    const topItem = lowItems[0] ?? items[0];
    const aiRec = topItem
      ? [
          `${topItem.name} ${topItem.currentLabel ?? `${formatNumber(topItem.quantity)}개`} · ${topItem.predictedLabel ?? "1시간 뒤 예상 계산 중"}입니다.`,
          topItem.recommendedProductionQty && topItem.recommendedProductionQty > 0
            ? `권장 생산 수량은 ${formatNumber(topItem.recommendedProductionQty)}개입니다.`
            : "현재 권장 생산 수량은 없습니다.",
          topItem.groundingLabel ?? "근거: 실적 기반 추정",
          topItem.actionLabel ?? "지금 할 일: 생산 우선순위를 확인하세요.",
        ].join(" ")
      : "현재 모든 제품의 재고가 적정 수준입니다. 근거: 실시간 재고 점검. 지금 할 일: 다음 알림까지 모니터링하세요.";

    return {
      items,
      aiRecommendation: aiRec,
      lastUpdated: cockpitRaw?.last_updated_at ? "실적 기반 추정" : "실시간 갱신",
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
    const rawData = await apiGet<unknown[]>("/inventory/current");
    const data = (rawData ?? []) as Array<Record<string, unknown>>;
    const riskyItems = data.filter((item) => {
      const statusVal = String(item.status ?? item.stockout_risk ?? "ok").toLowerCase();
      return statusVal === "warning" || statusVal === "critical" || statusVal === "high";
    });
    const urgentCount = riskyItems.length;
    const revenue = riskyItems.reduce(
      (sum, item) => sum + Math.round(Number(item.estimated_chance_loss ?? 0)),
      0,
    );

    return {
      expectedRevenue: fmtKRW(Math.round(revenue)),
      urgentCount,
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
    const rawData = await apiGet<unknown[]>("/inventory/current");
    const data = (rawData ?? []) as Array<Record<string, unknown>>;
    return (data ?? []).map((p, idx) => {
      const rawStock = Number(p.current_stock ?? p.on_hand_eod ?? 0);
      const stock = getInventoryDisplayMetrics(rawStock);
      const visualStock = Math.max(rawStock, 0);
      const statusVal = String(p.status ?? p.stockout_risk ?? "ok").toLowerCase();
      const isLow = statusVal === "warning" || statusVal === "critical" || statusVal === "high" || rawStock <= 0;
      return {
        id: `batch-${p.product_id}`,
        name: resolveProductDisplayName(String(p.product_name ?? p.product_id ?? "")),
        bgColor: BATCH_COLORS[idx % BATCH_COLORS.length],
        status: isLow ? "생산 완료" as const : "재고적정" as const,
        aiWarning: isLow
          ? `${stock.detailLabel} · 지금 할 일: 부족 수량 기준으로 추가 생산/보충을 검토하세요.`
          : null,
        lossAmount: stock.shortage > 0 ? `부족 ${formatNumber(Math.round(stock.shortage))}개` : null,
        currentCount: stock.currentCount,
        targetShortfall: isLow ? Math.round(Math.max(0, 50 - visualStock)) : null,
        progressPercent: isLow ? Math.round(Math.max(0, (visualStock / 50) * 100)) : 40,
        currentStockLabel: stock.currentLabel,
        shortageLabel: stock.shortage > 0 ? `부족 ${formatNumber(stock.shortage)}개` : null,
        detailLabel: stock.detailLabel,
        shortageCount: stock.shortage,
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
      options: {
        label: string;
        reference_date?: string;
        deviation_label?: string;
        flags?: string[];
        items: { product_id: string; product_name: string; quantity: number; base_price: number }[];
      }[];
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
      reportDate: (data.target_date ?? getDemoDate()).replace(/-/g, "."),
      reportTime: getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      totalCount: totalItems,
      aiScore: "98.2%",
    };
  } catch {
    return mockDelay({ weekLabel: "AI 추천 3월 2주차", reportDate: getDemoDate().replace(/-/g, "."), reportTime: getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }), totalCount: 12, aiScore: "98.2%" });
  }
}

export async function getAiOrderItems(): Promise<AiOrderItem[]> {
  try {
    const data = await getOrderRecommendationsOnce() as {
      target_date?: string;
      options: {
        label: string;
        reference_date?: string;
        deviation_label?: string;
        flags?: string[];
        items: { product_id: string; product_name: string; quantity: number; base_price: number; category?: string | null; rationale?: string | null }[];
      }[];
    } | null;
    if (!data) throw new Error("no data");

    const primaryOption = data.options?.[0];
    const items = primaryOption?.items ?? [];
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
      aiReason:
        item.rationale ??
        `${primaryOption?.label ?? "추천 옵션"} · ${formatShortDate(primaryOption?.reference_date ?? null)} · ${primaryOption?.deviation_label ?? "실적 기반 추정"}${primaryOption?.flags?.length ? ` · ${primaryOption.flags.join(", ")}` : ""}`,
      status: null,
    }));
  } catch {
    return mockDelay([
      { id: "ai-001", name: "초코링", bgColor: "#f9e4c8", unitPrice: "₩1,300", stockInfo: "8개", stockWarning: true, category: "도넛" as const, orderDate: "2026.03.10", aiRecommendedQty: "40개", aiReason: "주말 수요 예측 +32%", status: null },
      { id: "ai-002", name: "아메리카노 원두", bgColor: "#d4b896", unitPrice: "₩12,000", stockInfo: "1kg 남음", stockWarning: true, category: "커피원두" as const, orderDate: "2026.03.10", aiRecommendedQty: "3kg", aiReason: "재고 임박·날씨 영향 매출 +20%", status: null },
      { id: "ai-003", name: "글레이즈드", bgColor: "#f5e0c8", unitPrice: "₩1,300", stockInfo: "12개", stockWarning: true, category: "도넛" as const, orderDate: "2026.03.10", aiRecommendedQty: "50개", aiReason: "베스트셀러·재고 부족 임박", status: null },
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
    const [summaryData, inventoryItems, paymentMethods, promoPerformance] = await Promise.all([
      apiGet<{ today_revenue: number; hourly_trend: { hour: number; revenue: number }[] }>("/home/sales-summary"),
      apiGet<InventoryCurrentItem[]>("/inventory/current"),
      safeGet<{ methods?: { group_name: string; sales_amt: number; pct_of_total: number }[] }>(`/v1/analytics/payment-methods?store_id=${STORE_ID}`),
      safeGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}`),
    ]);

    const hourlySales = (summaryData.hourly_trend ?? []).map((h) => ({
      time: `${h.hour}시`,
      pos: Math.round(h.revenue * 0.7),
      delivery: Math.round(h.revenue * 0.3),
      prevAvg: Math.round(h.revenue * 0.95),
    }));

    const totalRev = summaryData.today_revenue ?? 0;
    const rankedItems = (inventoryItems ?? [])
      .filter((item) => isMeaningfulLabel(item.product_name))
      .sort((a, b) => Number((b.base_price ?? 0) * (b.sold_qty ?? 0)) - Number((a.base_price ?? 0) * (a.sold_qty ?? 0)));
    const categorySales = rankedItems.slice(0, 4).map((r, i) => ({
      id: `c${i + 1}`,
      name: r.product_name,
      today: Math.round(Number(r.base_price ?? 0) * Number(r.sold_qty ?? 0)),
      goal: Math.round(Number(r.base_price ?? 0) * Number(r.sold_qty ?? 0) * 1.15),
      color: i === 0 ? "#3aaedd" : i === 1 ? "#3faf60" : "#888",
    }));

    const paymentTypes =
      (paymentMethods?.methods ?? []).slice(0, 4).map((method, index) => ({
        id: `p${index + 1}`,
        label: method.group_name,
        count: Math.round(Number(method.sales_amt ?? 0)),
        percent: Math.round(Number(method.pct_of_total ?? 0)),
        color: index === 0 ? "#3aaedd" : index === 1 ? "#3faf60" : index === 2 ? "#333" : "#888",
      })) ||
      [];

    const promoRows = (promoPerformance?.promotions ?? [])
      .slice()
      .sort((a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0))
      .slice(0, 4);
    const totalPromoSales = promoRows.reduce((sum, row) => sum + Number(row.sales_amt ?? 0), 0);
    const totalPromoBills = promoRows.reduce((sum, row) => sum + Number(row.bill_cnt ?? 0), 0);
    const promotionWeekly =
      promoRows.length > 0
        ? promoRows.map((row, index) => ({
            week:
               (row.campaign_name ?? row.promo_name ?? `캠페인 ${index + 1}`)
                 .replace(/\s+/g, " ")
                 .slice(0, 10),
            responseRate: Math.min(99, Math.round(((Number(row.bill_cnt ?? 0) / Math.max(totalPromoBills, 1)) * 100) || 0)),
            conversionRate: Math.min(99, Math.round(((Number(row.sales_amt ?? 0) / Math.max(totalPromoSales, 1)) * 100) || 0)),
            salesContribution: Math.min(99, Math.round(((Number(row.sales_amt ?? 0) / Math.max(totalRev, 1)) * 100) || 0)),
          }))
        : [
            { week: "1주차", responseRate: 38, conversionRate: 22, salesContribution: 18 },
            { week: "2주차", responseRate: 42, conversionRate: 28, salesContribution: 22 },
            { week: "3주차", responseRate: 55, conversionRate: 32, salesContribution: 26 },
            { week: "4주차", responseRate: 70, conversionRate: 38, salesContribution: 30 },
          ];

    const kpis: PerformanceKpiItem[] = [
      { id: "k1", label: "총매출", value: fmtKRW(totalRev), change: `${(summaryData.vs_yesterday_same_time_pct ?? 0) > 0 ? "+" : ""}${summaryData.vs_yesterday_same_time_pct ?? 0}%`, changeType: (summaryData.vs_yesterday_same_time_pct ?? 0) >= 0 ? "up" : "down" },
      { id: "k2", label: "평균 객단가", value: fmtKRW(Math.round(totalRev / Math.max(1, (inventoryItems ?? []).reduce((sum, item) => sum + Math.round(Number(item.sold_qty ?? 0)), 0)))), change: "-1.8%", changeType: "down" },
      { id: "k3", label: "총 주문 수", value: `${(inventoryItems ?? []).reduce((sum, item) => sum + Math.round(Number(item.sold_qty ?? 0)), 0)}건`, change: "+4.1%", changeType: "up" },
    ];

    return {
      tab,
      hourlySales: hourlySales.length > 0 ? hourlySales : [{ time: "09시", pos: 320, delivery: 180, prevAvg: 480 }],
      categorySales: categorySales.length > 0 ? categorySales : [{ id: "c1", name: "음료", today: 5200000, goal: 6000000, color: "#3aaedd" }],
      promotionWeekly,
      paymentTypes:
        paymentTypes.length > 0
          ? paymentTypes
          : [
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
  const dateLabel = getDemoDateObject().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  try {
    if (selectedMenu === "생산관리" || selectedMenu === "AI 실시간 현황") {
      const [production, inventory] = await Promise.all([
        getProductionAgent(),
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
      const lowProductionItems = productionItems.filter((item) => item.isLow);
      const firstProduction = lowProductionItems[0] ?? productionItems[0];
      const firstRisk = inventoryItems[0];
      const issues: BriefingIssue[] = [];

      lowProductionItems.slice(0, 3).forEach((item, idx) => {
        issues.push(
          makeBriefingIssue(
            `prod-${idx}`,
            item.shortage && item.shortage > 0 ? "긴급" : "주의",
            `${item.name} 재고 대응 우선`,
            `${item.detailLabel ?? item.badgeLabel ?? `${formatNumber(item.quantity)}개`} 기준으로 추가 생산/보충 검토가 필요합니다.`,
            "생산관리",
            "생산 바로가기",
          ),
        );
      });

      if (firstRisk && issues.length < 5) {
        const stock = getInventoryDisplayMetrics(Number(firstRisk.on_hand_eod ?? 0));
        issues.push(
          makeBriefingIssue(
            "inv-risk",
            Number(firstRisk.on_hand_eod ?? 0) <= 0 ? "긴급" : "주의",
            `${firstRisk.product_name} 재고 부족 감지`,
            `${firstRisk.product_name} ${stock.detailLabel}, 금일 판매 ${formatNumber(Math.round(Number(firstRisk.sold_qty ?? 0)))}개입니다.`,
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
            ? `${firstProduction.name}은 ${firstProduction.detailLabel ?? firstProduction.badgeLabel ?? `${formatNumber(firstProduction.quantity)}개`} 상태입니다.`
            : "현재 추가 생산 추천 품목이 없습니다.",
          firstRisk
            ? `재고 부족 우선 품목은 ${firstRisk.product_name}이며 ${getInventoryDisplayMetrics(Number(firstRisk.on_hand_eod ?? 0)).detailLabel}, 품절 위험 시간은 ${formatNumber(Math.round(Number(firstRisk.stockout_minutes ?? 0)))}분입니다.`
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
        const stock = getInventoryDisplayMetrics(Number(topProduct.on_hand_eod ?? 0));
        issues.push(
          makeBriefingIssue(
            "analytics-top",
            "주의",
            `${topProduct.product_name} 상위 판매`,
            `${topProduct.product_name} 금일 판매량은 ${formatNumber(Math.round(Number(topProduct.sold_qty ?? 0)))}개이고 ${stock.detailLabel}입니다.`,
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
      const topPromoName = topPromo ? (topPromo.campaign_name ?? topPromo.promo_name ?? "캠페인").replace(/20[12]\d\s*년\s*/g, "").replace(/20[12]\d\.\d{2}\.\d{2}/g, "").trim().replace(/^\s*[\-\s]+\s*/, "").trim() || "캠페인" : null;
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          `현재 조회된 캠페인은 ${formatNumber(promoItems.length)}건입니다.`,
          topPromoName
            ? `상위 캠페인은 ${topPromoName}이며 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))}입니다.`
            : "진행 중인 캠페인 데이터가 없습니다.",
          topPromoName
            ? `반응 건수는 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`
            : "캠페인 반응 건수 데이터는 없습니다.",
        ],
        issues: topPromoName
          ? [
              makeBriefingIssue(
                "promo-top",
                "확인",
                `${topPromoName} 성과`,
                `현재 누적 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))} / 반응 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`,
                "프로모션",
                "캠페인 성과 보기",
              ),
            ]
          : [makeBriefingIssue("promo-none", "확인", "캠페인 데이터 없음", "현재 캠페인 성과 데이터가 없습니다.", "프로모션", "화면 보기")],
      };
    }

    if (selectedMenu === "AI 검증") {
      const validationSnapshot = await getAiValidationSnapshot();
      const sections = validationSnapshot.cards;
      const lowDimension =
        validationSnapshot.quality.slice().sort((a, b) => Number(a.value) - Number(b.value))[0] ?? null;
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: validationSnapshot.chatSummary.summary,
        issues:
          sections.length > 0
            ? sections.slice(0, 3).map((section, idx) =>
                makeBriefingIssue(
                  `validation-${idx}`,
                  section.confidence < 50 ? "주의" : section.confidence >= 80 ? "긴급" : "확인",
                  section.title,
                  `${section.detail} ${section.subItem.label}`,
                  "AI 검증",
                  "검증 보기",
                ),
              )
            : [
                makeBriefingIssue(
                  "validation-none",
                  "확인",
                  "검증 데이터 없음",
                  lowDimension
                    ? `${lowDimension.subject} 축이 ${formatNumber(lowDimension.value)}%로 가장 낮습니다.`
                    : "현재 검증 데이터가 없습니다.",
                  "AI 검증",
                  "화면 보기",
                ),
              ],
      };
    }

    if (selectedMenu === "벤치마킹") {
      const benchmark = await getBenchmarkSnapshot();
      const recommendedPeer = benchmark.peerCards.find((card) => card.isRecommended) ?? benchmark.peerCards[0];
      const strongestRisk = benchmark.risks[0] ?? null;
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: benchmark.chatSummary.summary,
        issues:
          benchmark.peerCards.length > 0
            ? benchmark.peerCards.slice(0, 3).map((peer, index) =>
                makeBriefingIssue(
                  `benchmark-peer-${index}`,
                  peer.salesDiff > 100 ? "주의" : "확인",
                  `${peer.storeName} 비교 포인트`,
                  `${peer.storeName}은 ${peer.peakHourLabel} 피크와 ${peer.mainProduct} 판매가 강합니다. 우리 매장 대비 매출 우위는 ${Math.abs(peer.salesDiff).toFixed(1)}% 수준입니다.`,
                  "벤치마킹",
                  "비교 보기",
                ),
              )
            : [
                makeBriefingIssue(
                  "benchmark-rank",
                  "확인",
                  "벤치마킹 요약",
                  benchmark.rankAmongStores != null && benchmark.totalStores != null
                    ? `현재 순위 ${benchmark.rankAmongStores}/${benchmark.totalStores}`
                    : strongestRisk ?? "비교 데이터를 확인 중입니다.",
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
