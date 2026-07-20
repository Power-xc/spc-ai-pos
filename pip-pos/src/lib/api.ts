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
  ProductionItem,
  ProductAnalysisData,
  OrderAgentData,
  AiOrderSummary,
  AiOrderItem,
  AiPerformanceData,
  AiBriefing,
  BriefingIssue,
  SimulationData,
  MonthlyCompareResponse,
  DeliveryOrdersResponse,
  CampaignEffectResponse,
  ProductCompareResponse,
  ChannelSalesResponse,
  PeerCompareResponse,
  OrderConfirmResponse,
  OrderOptionSummary,
  PerformanceKpiItem,
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
  PRODUCT_CODE_NAME_MAP,
  resolveProductDisplayName as resolveProductDisplayNameFromMap,
  resolveProductNamesInText,
} from "./productNameResolver";
import {
  appendDemoQueryParams,
  getDemoDate,
  getDemoDateObject,
  getDemoDateTimeLabel,
  getDemoDateTimeState,
  getDemoTime,
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

const DEMO_DATETIME_ENDPOINTS = ["/order/deadlines", "/v1/dashboard/production", "/home/sales-summary"];

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

const _inflightRequests = new Map<string, Promise<unknown>>();
const _responseCache = new Map<string, { data: unknown; timestamp: number }>();
const RESPONSE_CACHE_TTL = 15_000;

async function apiGet<T>(path: string): Promise<T> {
  const key = `GET:${path}`;
  const now = Date.now();
  const cached = _responseCache.get(key);
  if (cached && now - cached.timestamp < RESPONSE_CACHE_TTL) {
    return cached.data as T;
  }
  const inflight = _inflightRequests.get(key);
  if (inflight) return inflight as Promise<T>;
  const promise = fetch(buildApiUrl(path), { headers: AUTH_HEADERS })
    .then(async (res) => {
      if (!res.ok) throw new Error(`API ${path} ${res.status}`);
      const json = await res.json();
      const data = unwrapApiData<T>(json);
      _responseCache.set(key, { data, timestamp: Date.now() });
      _inflightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      _inflightRequests.delete(key);
      throw err;
    });
  _inflightRequests.set(key, promise);
  return promise as Promise<T>;
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
        : currentCount === 0
          ? "보충 필요"
          : `${formatNumber(currentCount)}개`,
    currentLabel: `${formatNumber(currentCount)}개`,
    detailLabel:
      shortage > 0
        ? `${formatNumber(currentCount)}개 · 부족 ${formatNumber(shortage)}개`
        : currentCount === 0
          ? `${formatNumber(currentCount)}개 · 보충 필요`
          : `${formatNumber(currentCount)}개`,
  };
}

type ProductionStatusLabel = "즉시 생산 필요" | "보충 필요" | "주의" | "재고 적정";

function getPredictedStockLabel(predicted: InventoryDisplayMetrics) {
  return predicted.shortage > 0
    ? `1시간 뒤 예상 0개 · 부족 ${formatNumber(predicted.shortage)}개`
    : `1시간 뒤 예상 ${formatNumber(predicted.currentCount)}개`;
}

function deriveProductionStatus(params: {
  current: InventoryDisplayMetrics;
  predicted: InventoryDisplayMetrics;
  recommendedQty: number;
  riskLevel: string;
  stockoutProbability: number;
}): {
  statusLabel: ProductionStatusLabel;
  statusDescription: string;
  actionText: string;
} {
  const { current, predicted, recommendedQty, riskLevel, stockoutProbability } = params;
  const probabilityPct = Math.round(Math.max(0, stockoutProbability) * 100);

  if (
    predicted.shortage > 0 ||
    riskLevel === "HIGH" ||
    (current.currentCount === 0 && recommendedQty > 0)
  ) {
    return {
      statusLabel: "즉시 생산 필요",
      statusDescription:
        current.currentCount === 0
          ? `현재 보유가 0개이며 최근 동일 시간대 판매 패턴 기준으로 즉시 보충이 필요합니다.`
          : `최근 동일 시간대 패턴 기준 1시간 뒤 예상 재고가 부족할 가능성이 있습니다.`,
      actionText: `${formatNumber(Math.max(recommendedQty, predicted.shortage || current.shortage || 1))}개 생산 등록을 우선 검토하세요.`,
    };
  }

  if (
    current.currentCount === 0 ||
    predicted.currentCount === 0 ||
    recommendedQty > 0
  ) {
    return {
      statusLabel: "보충 필요",
      statusDescription:
        probabilityPct >= 40
          ? `현재 보유가 낮고 같은 시간대 판매 속도 기준으로 빠르게 소진될 수 있습니다.`
          : `현재 보유가 없어 바로 진열 가능한 보충 수량을 점검할 시점입니다.`,
      actionText: `${formatNumber(Math.max(recommendedQty, 1))}개 보충 또는 생산 가능 여부를 확인하세요.`,
    };
  }

  if (riskLevel === "MEDIUM" || stockoutProbability >= 0.35) {
    return {
      statusLabel: "주의",
      statusDescription:
        `현재는 버틸 수 있지만 같은 시간대 판매 속도 기준으로 빠르게 줄어들 수 있습니다.`,
      actionText: `다음 판매 피크 전에 진열 수량과 보충 계획을 다시 확인하세요.`,
    };
  }

  return {
    statusLabel: "재고 적정",
    statusDescription:
       `최근 동일 시간대 판매 패턴 기준으로 1시간 내 품절 위험은 낮습니다.`,
    actionText: `현재 재고를 유지하면서 다음 알림 시점까지 모니터링하세요.`,
  };
}

export function humanizeDeadlineStatus(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return "확인 필요";
  if (normalized === "scheduled") return "예정";
  if (normalized === "soon") return "마감 임박";
  if (normalized === "urgent") return "긴급";
  if (normalized === "past_due") return "마감 지남";
  if (normalized === "confirmed") return "확정 완료";
  return String(status ?? "").trim();
}

export function estimateRevenueAtDemoTime(
  totalRevenue: number | null | undefined,
  hourlyTrend: Array<{ hour?: number | string | null; revenue?: number | null }> | null | undefined,
): number {
  const total = Math.max(0, Math.round(Number(totalRevenue ?? 0)));
  const rows = Array.isArray(hourlyTrend) ? hourlyTrend : [];
  if (rows.length === 0) return total;

  const demo = new Date(getDemoDateTimeState().timestamp);
  const currentHour = demo.getHours();
  const currentMinutes = demo.getMinutes();
  let estimated = 0;

  rows.forEach((row) => {
    const hour = Number(row.hour ?? -1);
    const revenue = Math.max(0, Number(row.revenue ?? 0));
    if (!Number.isFinite(hour) || revenue <= 0) return;

    if (hour < currentHour) {
      estimated += revenue;
      return;
    }

    if (hour === currentHour && currentMinutes > 0) {
      estimated += revenue * (currentMinutes / 60);
    }
  });

  if (estimated <= 0) {
    return total;
  }
  return Math.min(total, Math.round(estimated));
}

export function invalidateDemoRuntimeData() {
  _cache.clear();
  _responseCache.clear();
  _inflightRequests.clear();
  _orderRecCache = null;
  _benchmarkSnapshotPromiseMap.clear();
}

function isMeaningfulLabel(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= 1 || normalized === "B" || normalized === "미분류") return false;
  return true;
}

function isProductionEligible(
  product_id: string,
  product_name: string | null | undefined,
  category: string | null | undefined,
): boolean {
  const pid = String(product_id).trim();
  if (pid.startsWith("7")) return false;
  const name = String(product_name ?? "").trim();
  const cat = String(category ?? "").trim();
  if (cat === "냉동/냉장" || cat === "냉동" || cat === "냉장") return false;
  if (cat === "용품/상품" || cat === "포장재" || cat === "원자재") return false;
  if (name === "B" || name === "미분류") return true;
  const keywords = [
    "파우더", "시럽", "컵", "리드", "빨대", "스트로우", "소스", "원두",
    "포장", "필링", "우유", "토핑", "베이컨", "체다", "치즈", "설탕",
    "유산지", "봉투", "쇼핑백", "왁스티슈", "스푼", "포크", "용기",
    "오링", "드롭", "사이드", "팩", "얼음", "페퍼", "밑지",
    "꼬지", "베이스", "쿨라타", "완제", "패티", "필름",
  ];
  for (const kw of keywords) {
    if (name.includes(kw)) return false;
  }
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
  return cleanProductName(resolveProductDisplayNameFromMap(value));
}

function joinCompact(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(" · ");
}

function humanizeInternalReasonFlag(flag: string): string | null {
  const normalized = String(flag ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "ESTIMATED_FROM_SALES") return "실적 기반 추정";
  if (normalized === "CAMPAIGN_PERIOD") return "프로모션 기간 보정";
  if (normalized === "EVENT_ADJUSTED") return "이벤트 영향 반영";
  if (/^[A-Z0-9_]+$/.test(normalized)) return null;
  return String(flag ?? "").trim();
}

function sanitizeUserFacingReason(reason: string | null | undefined): string {
  const normalized = String(reason ?? "").trim();
  if (!normalized) return "";

  return normalized
    .split("·")
    .map((part) => part.trim())
    .map((part) => humanizeInternalReasonFlag(part) ?? part)
    .filter((part) => part && !/^[A-Z0-9_]+$/.test(part))
    .join(" · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatBurnRate(value: number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
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

async function safePost<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    return await apiPost<T>(path, body);
  } catch {
    return null;
  }
}

export interface ProductionRegisterResult {
  production_id: string;
  registered_at: string;
  feedback?: { type: string; message: string; impact_pct: number; estimated_amount: number };
}

export async function registerProduction(
  productId: string,
  quantity: number,
  alertId?: string,
): Promise<ProductionRegisterResult | null> {
  return safePost<ProductionRegisterResult>("/v1/production/register", {
    store_id: STORE_ID,
    product_id: productId,
    quantity,
    alert_id: alertId || undefined,
  });
}

export interface RegisterableProductItem {
  product_id: string;
  product_name: string;
  category: string;
  current_stock: number;
  predicted_stock_1h: number | null;
  risk_level: string;
  is_urgent: boolean;
  is_supplement: boolean;
  recommended_production_qty: number;
  daily_recommended_qty: number;
  last_1h_sales_rate: number | null;
  unit_price: number | null;
}

export interface RegisterableProductsResult {
  items: RegisterableProductItem[];
  summary: {
    total_count: number;
    urgent_count: number;
    supplement_count: number;
    normal_count: number;
  };
}

export interface BatchRegisterItemPayload {
  product_id: string;
  product_name: string;
  quantity: number;
  source: string;
}

export interface InventorySnapshotItemAPI {
  product_id: string;
  product_name: string;
  category: string;
  current_stock: number;
  predicted_stock_1h: number | null;
  risk_level: string;
  is_urgent: boolean;
  is_supplement: boolean;
  recommended_production_qty: number;
  daily_recommended_qty: number;
  last_1h_sales_rate: number | null;
  unit_price: number | null;
  stock_basis: string;
  is_estimated: boolean;
}

export interface InventorySnapshotResult {
  as_of: string;
  is_estimated: boolean;
  basis: string;
  summary: { total_count: number; urgent_count: number; supplement_count: number; normal_count: number };
  items: InventorySnapshotItemAPI[];
}

export async function getRegisterableProducts(
  q = "",
  risk = "all",
): Promise<RegisterableProductsResult | null> {
  const params = new URLSearchParams({ q, risk });
  return safeGet<RegisterableProductsResult>(`/v1/production/registerable-products?${params}`);
}

export async function getInventorySnapshot(
  demoDate: string,
  demoTime: string,
  q = "",
  risk = "all",
): Promise<InventorySnapshotResult | null> {
  const params = new URLSearchParams({ store_id: STORE_ID, demo_date: demoDate, demo_time: demoTime, q, risk });
  return safeGet<InventorySnapshotResult>(`/v1/production/inventory-snapshot?${params}`);
}

export async function batchRegisterProduction(
  items: BatchRegisterItemPayload[],
): Promise<{ registered_count: number; failed_count: number; results: any[] } | null> {
  return safePost<{ registered_count: number; failed_count: number; results: any[] }>(
    "/v1/production/batch-register",
    { store_id: STORE_ID, items },
  );
}

export interface ValidationReportSummary {
  avg_error_pct: number;
  within_10pct_ratio: number;
  total_products: number;
  within_10pct: number;
  high_error_products: number;
}

export interface ValidationReport {
  summary: ValidationReportSummary;
  backtest: {
    avg_error_pct: number;
    within_10pct_ratio: number;
    total_products: number;
    within_10pct: number;
  } | null;
}

export async function getValidationReport(): Promise<ValidationReport | null> {
  return safeGet<ValidationReport>(`/v1/production/${STORE_ID}/validation-report`);
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
    case "综合 현황":
      return {
        ...common,
        summaryPoints: [
          "현재 화면의 주요 이슈를 기준으로 임시 브리핑을 표시합니다.",
          "생산/재고/발주 데이터 조회가 지연되어 상세 요약은 제한됩니다.",
          "API 응답이 복구되면 자동 반영됩니다.",
        ],
        issues: [
          makeBriefingIssue("fallback-overview", "확인", "임시 브리핑", "데이터가 복구되면 종합 브리핑을 다시 생성합니다. 현재 생산관리, 발주관리 메뉴에서 직접 확인해 주세요.", "종합 현황", "화면 보기"),
        ],
      };
    default:
      return {
        ...common,
        summaryPoints: [
          "현재 화면의 주요 이슈를 기준으로 임시 브리핑을 표시합니다.",
          `${selectedMenu} 화면으로 이동하여 직접 확인해 주세요.`,
          "API 응답이 복구되면 자동 반영됩니다.",
        ],
        issues: [
          makeBriefingIssue("fallback-default", "확인", "임시 브리핑", `${selectedMenu} 데이터 조회가 지연되고 있습니다. 해당 메뉴에서 직접 확인해 주세요.`, selectedMenu, "화면 보기"),
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
  { menu: "알람 설정", count: 0 },
];

export function getMenuIssueCounts(): Promise<MenuIssueCount[]> {
  return cached("menuIssueCounts", () => mockDelay(mockMenuIssueCounts));
}

function resolveInventoryChanceLoss(
  invItems: InventoryCurrentItem[] | null | undefined,
  productionEstimatedLoss = 0,
): number {
  const lossFromInventory = (invItems ?? [])
    .reduce((sum, item) => sum + (Number(item.estimated_chance_loss ?? 0) || 0), 0);
  return Math.round(Math.max(lossFromInventory, productionEstimatedLoss));
}

// ══════════════════════════════════════════════════════════════════
//  대시보드 통계 카드 — API: /home/sales-summary
// ══════════════════════════════════════════════════════════════════

export async function getStatCards(): Promise<StatCardData[]> {
  try {
    const [data, prodSummary, invItems, snapData] = await Promise.all([
      apiGet<{
        today_revenue: number;
        cumulative_revenue_until: number | null;
        today_qty: number;
        vs_yesterday_same_time_pct: number;
        vs_last_week_same_day_pct: number;
        hourly_trend: { hour: number; revenue: number }[];
        profitability: { gross_profit_margin_pct: number | null } | null;
      }>("/home/sales-summary"),
      getProductionSummary(),
      safeGet<InventoryCurrentItem[]>("/inventory/current"),
      getInventorySnapshotSummary(),
    ]);
    const snapSummary = snapData;

    const sparkData = (data.hourly_trend || []).map((h) => h.revenue);
    const yesterdayPct = data.vs_yesterday_same_time_pct ?? 0;
    const weekPct = data.vs_last_week_same_day_pct ?? 0;
    const hasCumulative = data.cumulative_revenue_until != null && data.cumulative_revenue_until > 0;
    const displayRevenue = hasCumulative ? data.cumulative_revenue_until! : data.today_revenue;
    const profitability = data.profitability;
    const marginPct = (profitability?.gross_profit_margin_pct != null && profitability?.gross_profit_margin_pct > 0)
      ? Math.max(0.3, Math.min(0.8, profitability.gross_profit_margin_pct / 100))
      : 0.68;

    const lossValue = resolveInventoryChanceLoss(invItems, prodSummary.totalEstimatedLoss);
    const isLossEstimated = lossValue > 0;
    // Use inventory-snapshot summary for consistent counts across all screens
    const urgentCount = snapSummary?.urgentCount ?? prodSummary.urgentCount;
    const restCount = snapSummary?.supplementCount ?? prodSummary.restCount;
    const lossChangeValue = urgentCount > 0 || restCount > 0
      ? `긴급 ${urgentCount}개 · 재고 주의 ${restCount}개`
      : "적정 재고";

    return [
      {
        id: "stat-daily-sales",
        value: fmtKRW(displayRevenue),
        unit: "",
        changeValue: `${yesterdayPct > 0 ? "+" : ""}${yesterdayPct}%`,
        changeType: yesterdayPct >= 0 ? "up" : "down",
        sparkData,
        isCumulative: hasCumulative,
      },
      {
        id: "stat-ai-net-sales",
        value: fmtKRW(Math.round(displayRevenue * marginPct)),
        unit: "",
        changeValue: `${weekPct > 0 ? "+" : ""}${weekPct}%`,
        changeType: weekPct >= 0 ? "up" : "down",
        sparkData: sparkData.map((v) => Math.round(v * marginPct)),
        isCumulative: hasCumulative,
        marginPct,
      },
      {
        id: "stat-opportunity-loss",
        value: fmtKRW(lossValue),
        unit: "",
        changeValue: lossChangeValue,
        changeType: lossValue > 0 ? "down" : "up",
        sparkData: sparkData.slice(0, 9),
        urgentCount,
        restCount,
        isLossEstimated: true,
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
          value: "₩0",
          unit: "",
          changeValue: "적정 재고",
          changeType: "up",
          sparkData: [1000, 750, 510, 1130, 2000, 1500, 170, 155, 150],
          urgentCount: 0,
          restCount: 0,
          isLossEstimated: true,
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
      name: resolveProductDisplayName(item.product_name),
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
  boldPart: "생산·발주·성과 우선순위 점검이 필요합니다.",
  suffix: "",
  agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
};

export async function getAiInsight(): Promise<AiInsight> {
  try {
    const [production, orderSummary, salesSnapshot, snapSummary] = await Promise.all([
      getProductionAgent(),
      getTodayOrderSummary(),
      getTodaySalesSnapshot(),
      getInventorySnapshotSummary(),
    ]);
    const lowItems = production.items.filter((item) => item.isLow);
    const topItem = salesSnapshot.topItems[0];
    const orderItem = orderSummary.items[0];

    if (lowItems.length > 0) {
      const topRisk = lowItems[0];
      const topName = resolveProductDisplayName(topRisk.name);
      const shortageCount = topRisk.shortage && topRisk.shortage > 0
        ? `${formatNumber(topRisk.shortage)}개`
        : topRisk.badgeLabel ?? `${formatNumber(topRisk.quantity)}개`;
      const totalCount = snapSummary?.totalCount ?? 0;
      const urgentCount = snapSummary?.urgentCount ?? lowItems.length;
      const supplementCount = snapSummary?.supplementCount ?? 0;
      return {
        message: `${getDemoDateTimeLabel()} 기준, 전체 판매 제품 ${formatNumber(totalCount || 40)}개 중 긴급 ${formatNumber(urgentCount)}개 · 재고 주의 ${formatNumber(supplementCount)}개입니다. `,
        boldPart: topName + (urgentCount > 1 ? " 등" : ""),
        suffix: `생산관리 에이전트에서 권장 수량을 확인하세요.`,
        agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
      };
    }

    if (orderItem) {
      return {
        message: `${getDemoDateTimeLabel()} 기준, `,
        boldPart: `${resolveProductDisplayName(orderItem.name)} ${orderItem.quantity}`,
        suffix: "으로(로) 추천 발주를 우선 검토하세요.",
        agents: [{ id: "agent-001" }, { id: "agent-002" }, { id: "agent-003" }],
      };
    }

    if (topItem) {
      return {
        message: `${getDemoDateTimeLabel()} 기준, `,
        boldPart: `${resolveProductDisplayName(topItem.name)} ${topItem.count}`,
        suffix: "으로(로) 오늘 상위 판매입니다.",
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
  resultSummary: "추천 시나리오(B)가 핵심 지표 전반에서 우세합니다. 시나리오는 과거 실적 기반 추정이며 실제 결과는 달라질 수 있습니다.",
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

const mockPromotionData: Array<Omit<Promotion, "daysLeft"> & { startDate: string; endDate: string }> = [
  { id: "promo-ai-001", status: "ai", title: "오후 3~5시 글레이즈드 번들 할인 권장", description: "해당 시간대 글레이즈드 소진율 높고, 재고 잉여 패턴 감지. 과거 실적 기반 추정이며 실제 결과는 달라질 수 있습니다.", lunaMetric: "₩12만 추가 매출 추정", startDate: "2026.03.01", endDate: "2026.03.15", simulation: glazedSim },
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
      const demo = getDemoDate();
      const response = await apiGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}&demo_date=${encodeURIComponent(demo)}`);
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
        const topTitle = normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "상위 프로모션");
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
            comparisonLabel: "상위 프로모션 재적용",
          }),
        });
      }

      if (weakPromo) {
        const weakTitle = normalizeCampaignYear(weakPromo.campaign_name ?? weakPromo.promo_name ?? "관찰 프로모션");
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
              : `${weakTitle}은 최근 집계 매출 ${fmtKRW(weakSales)} · 반응 ${formatNumber(weakBills)}건으로 상위 프로모션 대비 약합니다.`,
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
            comparisonLabel: "부진 프로모션 개선",
          }),
        });
      }

      if (topPromo) {
        const bundleTitle = `${normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "상위 프로모션")} 연계 번들`;
        const baseSales = Math.round(Number(topPromo.sales_amt ?? 0));
        const baseBills = Math.round(Number(topPromo.bill_cnt ?? 0));
        const bundleLift = clampPromotionValue(7 + promotions.length * 2 + (baseBills >= 5 ? 2 : 0), 8, 17);
        aiPromotions.push({
          id: "promo-ai-live-bundle",
          status: "ai",
          title: `${bundleTitle} 시뮬레이션`,
          description: `${normalizeCampaignYear(topPromo.campaign_name ?? topPromo.promo_name ?? "프로모션")}과 상위 상품을 묶어 적용했을 때의 최근 집계 기준 추정입니다.`,
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
          statusLabel: "집계 기준",
          title: normalizeCampaignYear(promo.campaign_name ?? promo.promo_name ?? `프로모션 ${index + 1}`),
          description:
            promo.note ??
            `매출 ${fmtKRW(sales)} · 반응 ${formatNumber(bills)}건`,
          channel: "전체",
          daysLeft: null,
          periodLabel: `최근 집계일 ${toPromoDate(promo.biz_date)} 기준`,
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
              ? "최근 집계 기준 성과 상위 프로모션"
              : tone === "low"
                ? "최근 집계 기준 성과 보강 필요"
                : "최근 집계 기준 관찰 필요",
          performanceTone: tone,
          simulation: buildPromotionSimulation({
            title: normalizeCampaignYear(promo.campaign_name ?? promo.promo_name ?? `프로모션 ${index + 1}`),
            channel: "전체",
            actualSales: sales <= 0 ? Math.max(Math.round(avgSales * 0.35), 4000) : sales,
            actualBills: bills <= 0 ? 2 : bills,
            estimatedLiftPct: liftPct,
            comparisonLabel:
              tone === "high"
                ? "상위 프로모션 유지"
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
//  프로모션 실적 분석 — 반응 / 매출 / 시간대별 / 점포 비교
// ══════════════════════════════════════════════════════════════════

type PromoPerfRaw = {
  promo_id?: string | null;
  promo_name?: string | null;
  campaign_name?: string | null;
  biz_date?: string | null;
  sales_amt?: number | null;
  bill_cnt?: number | null;
  status?: string | null;
  note?: string | null;
  QTY_00?: number | null; QTY_01?: number | null; QTY_02?: number | null; QTY_03?: number | null;
  QTY_04?: number | null; QTY_05?: number | null; QTY_06?: number | null; QTY_07?: number | null;
  QTY_08?: number | null; QTY_09?: number | null; QTY_10?: number | null; QTY_11?: number | null;
  QTY_12?: number | null; QTY_13?: number | null; QTY_14?: number | null; QTY_15?: number | null;
  QTY_16?: number | null; QTY_17?: number | null; QTY_18?: number | null; QTY_19?: number | null;
  QTY_20?: number | null; QTY_21?: number | null; QTY_22?: number | null; QTY_23?: number | null;
  ACT_AMT_00?: number | null; ACT_AMT_01?: number | null; ACT_AMT_02?: number | null; ACT_AMT_03?: number | null;
  ACT_AMT_04?: number | null; ACT_AMT_05?: number | null; ACT_AMT_06?: number | null; ACT_AMT_07?: number | null;
  ACT_AMT_08?: number | null; ACT_AMT_09?: number | null; ACT_AMT_10?: number | null; ACT_AMT_11?: number | null;
  ACT_AMT_12?: number | null; ACT_AMT_13?: number | null; ACT_AMT_14?: number | null; ACT_AMT_15?: number | null;
  ACT_AMT_16?: number | null; ACT_AMT_17?: number | null; ACT_AMT_18?: number | null; ACT_AMT_19?: number | null;
  ACT_AMT_20?: number | null; ACT_AMT_21?: number | null; ACT_AMT_22?: number | null; ACT_AMT_23?: number | null;
  MASKED_STOR_CD?: string | null;
  MASKED_STOR_NM?: string | null;
};

type PromoPerfResponse = {
  data_source?: string;
  note?: string;
  promotions?: PromoPerfRaw[];
};

const HOUR_KEYS = [...Array(24)].map((_, i) => `${String(i).padStart(2, "0")}`);
type HourKey = (typeof HOUR_KEYS)[number];

function getHourlyField(item: PromoPerfRaw, prefix: "QTY" | "ACT_AMT"): number[] {
  return HOUR_KEYS.map((h) => {
    const key = `${prefix}_${h}` as keyof PromoPerfRaw;
    return Number((item as Record<string, unknown>)[key] ?? 0);
  });
}

function promoName(item: PromoPerfRaw): string {
  return normalizeCampaignYear(item.campaign_name ?? item.promo_name ?? "프로모션");
}

function fetchPromoPerfItems(): Promise<PromoPerfRaw[]> {
  const demo = getDemoDate();
  return apiGet<PromoPerfResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}&demo_date=${encodeURIComponent(demo)}`)
    .then((res) => res.promotions ?? [])
    .catch(() => []);
}

function buildMockHourly(): number[] {
  const base = [0,0,0,0,0,0,2,8,35,62,48,30,55,70,42,25,18,12,38,22,8,3,0,0];
  return base;
}

export async function getPromoResponseSummary(): Promise<import("../types").PromoPerformanceSummary> {
  const items = await fetchPromoPerfItems();
  const sorted = items.slice().sort((a, b) => Number(b.bill_cnt ?? 0) - Number(a.bill_cnt ?? 0));
  const totalBills = sorted.reduce((s, i) => s + Number(i.bill_cnt ?? 0), 0);
  const totalSales = sorted.reduce((s, i) => s + Number(i.sales_amt ?? 0), 0);

  if (sorted.length === 0) {
    return {
      topByResponse: [], lowByResponse: [], totalBills: 0, totalSales: 0,
      grounding: "최근 집계 기준 프로모션 실적 데이터", action: "프로모션 실적이 확인되면 반응 상위 프로모션을 우선 검토하세요.",
    };
  }

  const top3 = sorted.slice(0, 3).map((item, i) => {
    const bills = Math.round(Number(item.bill_cnt ?? 0));
    const sales = Math.round(Number(item.sales_amt ?? 0));
    const tone: "high" | "medium" | "low" = i === 0 ? "high" : bills > totalBills / sorted.length ? "medium" : "low";
    return {
      id: item.promo_id ?? `promo-res-${i}`,
      name: promoName(item),
      billCnt: bills, salesAmt: sales, tone,
      interpretation: i === 0
        ? `최근 집계 기준 반응이 가장 높은 프로모션입니다. 참여 건수 ${bills}건, 매출 ${fmtKRW(sales)}입니다.`
        : `반응 ${bills}건, 매출 ${fmtKRW(sales)}입니다.`,
      action: i === 0 ? "반응이 높은 프로모션을 우선 재활용 검토하세요." : "반응 대비 매출 전환을 점검하세요.",
    };
  });

  const bottom3 = sorted.slice(-3).reverse().map((item, i) => {
    const bills = Math.round(Number(item.bill_cnt ?? 0));
    const sales = Math.round(Number(item.sales_amt ?? 0));
    return {
      id: item.promo_id ?? `promo-low-${i}`,
      name: promoName(item),
      billCnt: bills, salesAmt: sales, tone: "low" as const,
      interpretation: `반응 ${bills}건으로 상위 프로모션 대비 낮습니다. 매출 ${fmtKRW(sales)}입니다.`,
      action: "구성이나 노출 시간대 조정을 검토하세요.",
    };
  });

  return {
    topByResponse: top3, lowByResponse: bottom3, totalBills, totalSales,
    grounding: "최근 집계 기준 프로모션 실적",
    action: "반응은 높고 매출 전환이 낮은 프로모션부터 구성과 가격을 다시 점검하세요.",
  };
}

export async function getPromoSalesSummary(): Promise<import("../types").PromoSalesSummary> {
  const items = await fetchPromoPerfItems();
  const sorted = items.slice().sort((a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0));
  const totalSales = sorted.reduce((s, i) => s + Number(i.sales_amt ?? 0), 0);
  const avgEfficiency = sorted.length > 0
    ? sorted.reduce((s, i) => {
        const bills = Number(i.bill_cnt ?? 0);
        const sales = Number(i.sales_amt ?? 0);
        return s + (bills > 0 ? sales / bills : 0);
      }, 0) / sorted.length
    : 0;

  if (sorted.length === 0) {
    return {
      topBySales: [], highEfficiency: [], totalSales: 0, avgEfficiency: 0,
      grounding: "최근 집계 기준 프로모션 실적 데이터", action: "프로모션 실적이 확인되면 매출 기여 상위를 우선 검토하세요.",
    };
  }

  const top3 = sorted.slice(0, 3).map((item, i) => {
    const sales = Math.round(Number(item.sales_amt ?? 0));
    const bills = Math.round(Number(item.bill_cnt ?? 0));
    const eff = bills > 0 ? Math.round(sales / bills) : 0;
    const tone: "high" | "medium" | "low" = i === 0 ? "high" : eff >= avgEfficiency ? "medium" : "low";
    return {
      id: item.promo_id ?? `promo-sales-${i}`,
      name: promoName(item),
      salesAmt: sales, billCnt: bills, efficiency: eff, tone,
      interpretation: i === 0
        ? `최근 집계 기준 매출 기여가 가장 큰 프로모션입니다. 반응 ${bills}건, 매출 ${fmtKRW(sales)}입니다.`
        : `반응 ${bills}건, 매출 ${fmtKRW(sales)}입니다.`,
      action: i === 0 ? "동일 반응 대비 매출 효율이 높은 프로모션을 우선 재활용 검토하세요." : "매출 기여도를 지속 모니터링하세요.",
    };
  });

  const effSorted = sorted.slice().sort((a, b) => {
    const effA = Number(a.bill_cnt ?? 0) > 0 ? Number(a.sales_amt ?? 0) / Number(a.bill_cnt ?? 1) : 0;
    const effB = Number(b.bill_cnt ?? 0) > 0 ? Number(b.sales_amt ?? 0) / Number(b.bill_cnt ?? 1) : 0;
    return effB - effA;
  });
  const highEff = effSorted.slice(0, 3).map((item, i) => {
    const sales = Math.round(Number(item.sales_amt ?? 0));
    const bills = Math.round(Number(item.bill_cnt ?? 0));
    const eff = bills > 0 ? Math.round(sales / bills) : 0;
    return {
      id: item.promo_id ?? `promo-eff-${i}`,
      name: promoName(item),
      salesAmt: sales, billCnt: bills, efficiency: eff, tone: "high" as const,
      interpretation: `반응 대비 매출 효율 ${fmtKRW(eff)}/건으로 높은 편입니다.`,
      action: "효율이 높은 프로모션 패턴을 다른 프로모션에도 적용해보세요.",
    };
  });

  return {
    topBySales: top3, highEfficiency: highEff, totalSales, avgEfficiency: Math.round(avgEfficiency),
    grounding: "최근 집계 기준 프로모션 실적",
    action: "반응 대비 매출 효율이 높은 프로모션을 우선 재활용 검토하세요.",
  };
}

export async function getPromoHourlySummary(): Promise<import("../types").PromoHourlySummary> {
  try {
    const detail = await getPromoPerformanceDetail();
    if (detail && detail.hourly) {
      const hourlyKeys = Object.keys(detail.hourly);
      if (hourlyKeys.length > 0) {
        const topKey = hourlyKeys[0];
        const topHourly = (detail.hourly as Record<string, { cpi_cd?: string; cpi_nm?: string; total_bill_cnt?: number; stores?: Array<{ store_id?: string; hourly_qty?: number[]; hourly_amt?: number[] }> }>)[topKey];
        if (topHourly && topHourly.stores && topHourly.stores.length > 0) {
          const allQty = new Array(24).fill(0) as number[];
          const allAmt = new Array(24).fill(0) as number[];
          for (const store of topHourly.stores) {
            const qty = store.hourly_qty ?? [];
            const amt = store.hourly_amt ?? [];
            for (let h = 0; h < 24; h++) {
              allQty[h] += Number(qty[h] ?? 0);
              allAmt[h] += Number(amt[h] ?? 0);
            }
          }
          const hourlyData = allQty.map((qty, h) => ({
            hour: h,
            qty: Math.round(qty),
            salesAmt: Math.round(allAmt[h]),
          }));
          const activeHours = hourlyData.filter((h) => h.qty > 0);
          if (activeHours.length > 0) {
            const maxQty = Math.max(...activeHours.map((h) => h.qty), 1);
            const minQty = Math.min(...activeHours.map((h) => h.qty), 0);
            const peakHours = activeHours.filter((h) => h.qty >= maxQty * 0.7).map((h) => h.hour);
            const weakHours = activeHours.filter((h) => h.qty <= minQty * 1.3 + maxQty * 0.2).map((h) => h.hour).filter((h) => !peakHours.includes(h));
            const peakLabel = peakHours.length > 0 ? `${peakHours[0]}시~${peakHours[peakHours.length - 1]}시` : "활성 시간대";
            const weakLabel = weakHours.length > 0 ? `${weakHours[0]}시~${weakHours[weakHours.length - 1]}시` : "";
            const promoLabel = topHourly.cpi_nm ?? topKey;
            const interpretation = `${normalizeCampaignYear(promoLabel)} 프로모션은 ${peakLabel}에 반응이 집중됩니다.`
              + (weakLabel ? ` ${weakLabel} 시간대 성과가 약하므로 노출 시간 조정이 필요합니다.` : "");
            return {
              promoId: topKey,
              promoName: normalizeCampaignYear(promoLabel),
              hourlyData,
              peakHours,
              weakHours,
              interpretation,
              action: weakLabel ? `${weakLabel} 시간대 노출을 줄이고 ${peakLabel}에 집중하세요.` : "반응이 집중된 시간대에 프로모션 노출을 강화하세요.",
            };
          }
        }
      }
    }
  } catch { /* fall through to legacy */ }

  const items = await fetchPromoPerfItems();
  const topItem = items.slice().sort((a, b) => Number(b.bill_cnt ?? 0) - Number(a.bill_cnt ?? 0))[0];
  if (!topItem) {
    const mockHours = buildMockHourly();
    return {
      promoId: "promo-hourly-mock", promoName: "프로모션",
      hourlyData: mockHours.map((qty, h) => ({ hour: h, qty, salesAmt: Math.round(qty * 3500) })),
      peakHours: [9, 10, 11], weakHours: [15, 16, 17],
      interpretation: "프로모션 시간대별 데이터를 확인할 수 없습니다.",
      action: "실적 데이터가 적재되면 시간대별 성과 분석이 가능합니다.",
    };
  }

  const qtyFields = getHourlyField(topItem, "QTY");
  const amtFields = getHourlyField(topItem, "ACT_AMT");
  const hourlyData = qtyFields.map((qty, h) => ({
    hour: h,
    qty: Math.round(qty),
    salesAmt: Math.round(Number(amtFields[h]) ?? 0),
  }));

  const activeHours = hourlyData.filter((h) => h.qty > 0);
  const maxQty = Math.max(...activeHours.map((h) => h.qty), 1);
  const minQty = Math.min(...activeHours.map((h) => h.qty), 0);
  const peakHours = activeHours.filter((h) => h.qty >= maxQty * 0.7).map((h) => h.hour);
  const weakHours = activeHours.filter((h) => h.qty <= minQty * 1.3 + maxQty * 0.2).map((h) => h.hour).filter((h) => !peakHours.includes(h));

  const peakLabel = peakHours.length > 0 ? `${peakHours[0]}시~${peakHours[peakHours.length - 1]}시` : "활성 시간대";
  const weakLabel = weakHours.length > 0 ? `${weakHours[0]}시~${weakHours[weakHours.length - 1]}시` : "";

  const interpretation = `${promoName(topItem)} 프로모션은 ${peakLabel}에 반응이 집중됩니다.`
    + (weakLabel ? ` ${weakLabel} 시간대 성과가 약하므로 노출 시간 조정이 필요합니다.` : "");

  return {
    promoId: topItem.promo_id ?? "promo-hourly-top",
    promoName: promoName(topItem),
    hourlyData,
    peakHours,
    weakHours,
    interpretation,
    action: weakLabel ? `${weakLabel} 시간대 노출을 줄이고 ${peakLabel}에 집중하세요.` : "반응이 집중된 시간대에 프로모션 노출을 강화하세요.",
  };
}

export async function getPromoStoreCompare(): Promise<import("../types").PromoStoreCompareSummary> {
  try {
    const detail = await getPromoPerformanceDetail();
    if (detail && detail.store_comparison && detail.store_comparison.stores.length > 0) {
      const ourStoreId = DEMO_PRIMARY_STORE_ID;
      const ourStoreData = detail.store_comparison.stores.find((s) => s.store_id === ourStoreId);
      const ourBillCnt = ourStoreData?.bill_cnt ?? 0;
      const ourSalesAmt = ourStoreData?.sales_amt ?? 0;
      const stores: import("../types").PromoStoreCompareItem[] = detail.store_comparison.stores.map((s) => {
        const isOurs = s.store_id === ourStoreId;
        const diffBill = s.bill_cnt - ourBillCnt;
        const diffSales = s.sales_amt - ourSalesAmt;
        const tone: "higher" | "lower" | "same" = diffBill > 0 ? "higher" : diffBill < 0 ? "lower" : "same";
        return {
          storeId: s.store_id,
          storeName: resolveDemoStoreName(s.store_id, s.store_id),
          billCnt: s.bill_cnt,
          salesAmt: s.sales_amt,
          diffBillCnt: isOurs ? 0 : diffBill,
          diffSalesAmt: isOurs ? 0 : diffSales,
          isOurs,
          tone,
        };
      });
      const higherStores = stores.filter((s) => s.diffBillCnt > 0 && !s.isOurs);
      const promoLabel = detail.store_comparison.top_promo_name ?? "프로모션";
      const interpretation = higherStores.length > 0
        ? `${DEMO_PRIMARY_STORE_NAME} 기준으로 보면 ${normalizeCampaignYear(promoLabel)} 프로모션은 ${higherStores[0].storeName}에서 반응이 더 높습니다. 반응 건수는 ${Math.abs(higherStores[0].diffBillCnt)}건 차이, 매출은 ${fmtKRW(Math.abs(higherStores[0].diffSalesAmt))} 차이입니다.`
        : `${DEMO_PRIMARY_STORE_NAME} 기준으로 상위 반응 프로모션의 점포 간 차이는 크지 않습니다.`;
      return {
        promoId: detail.store_comparison.top_promo_id ?? "promo-store-detail",
        promoName: normalizeCampaignYear(promoLabel),
        ourBillCnt,
        ourSalesAmt,
        stores,
        interpretation,
        grounding: "최근 집계 기준 프로모션 실적 (new_sales_campaign_hourly)",
        action: higherStores.length > 0
          ? `${higherStores[0].storeName}의 강한 시간대를 참고해 운영 시간대를 조정하세요.`
          : "현재 프로모션 운영 방식을 유지하면서 점포 간 우수 사례를 공유하세요.",
      };
    }
  } catch { /* fall through to legacy */ }

  const allItems = await fetchPromoPerfItems();
  const topItem = allItems.slice().sort((a, b) => Number(b.bill_cnt ?? 0) - Number(a.bill_cnt ?? 0))[0];

  if (!topItem) {
    return {
      promoId: "promo-store-mock", promoName: "프로모션",
      ourBillCnt: 0, ourSalesAmt: 0, stores: [],
      interpretation: "점포 간 비교 데이터를 확인할 수 없습니다.",
      grounding: "최근 집계 기준 프로모션 실적",
      action: "실적 데이터가 적재되면 점포 간 비교가 가능합니다.",
    };
  }

  const targetPromoId = topItem.promo_id ?? topItem.campaign_name ?? "promo-top";
  const ourStoreId = DEMO_PRIMARY_STORE_ID;

  const byStore = new Map<string, { billCnt: number; salesAmt: number; storeName: string }>();
  for (const item of allItems) {
    const matches = (item.promo_id ?? item.campaign_name ?? "") === targetPromoId
      || (topItem.campaign_name && item.campaign_name === topItem.campaign_name);
    if (!matches) continue;
    const sid = item.MASKED_STOR_CD ?? ourStoreId;
    const sname = item.MASKED_STOR_NM ?? resolveDemoStoreName(sid, sid);
    const prev = byStore.get(sid) ?? { billCnt: 0, salesAmt: 0, storeName: sname };
    prev.billCnt += Math.round(Number(item.bill_cnt ?? 0));
    prev.salesAmt += Math.round(Number(item.sales_amt ?? 0));
    byStore.set(sid, { ...prev, storeName: sname });
  }

  if (byStore.size === 0) {
    byStore.set(ourStoreId, {
      billCnt: Math.round(Number(topItem.bill_cnt ?? 0)),
      salesAmt: Math.round(Number(topItem.sales_amt ?? 0)),
      storeName: resolveDemoStoreName(ourStoreId, DEMO_PRIMARY_STORE_NAME),
    });
  }

  const ourData = byStore.get(ourStoreId) ?? { billCnt: 0, salesAmt: 0, storeName: DEMO_PRIMARY_STORE_NAME };

  const stores: import("../types").PromoStoreCompareItem[] = Array.from(byStore.entries()).map(([sid, data]) => {
    const isOurs = sid === ourStoreId;
    const diffBill = data.billCnt - ourData.billCnt;
    const diffSales = data.salesAmt - ourData.salesAmt;
    const tone: "higher" | "lower" | "same" = diffBill > 0 ? "higher" : diffBill < 0 ? "lower" : "same";
    return { storeId: sid, storeName: data.storeName, billCnt: data.billCnt, salesAmt: data.salesAmt, diffBillCnt: diffBill, diffSalesAmt: diffSales, isOurs, tone };
  });

  const higherStores = stores.filter((s) => s.diffBillCnt > 0 && !s.isOurs);
  const interpretation = higherStores.length > 0
    ? `${ourData.storeName} 기준으로 보면 ${topItem.campaign_name ?? promoName(topItem)} 프로모션은 ${higherStores[0].storeName}에서 반응이 더 높습니다. 반응 건수는 ${Math.abs(higherStores[0].diffBillCnt)}건 차이, 매출은 ${fmtKRW(Math.abs(higherStores[0].diffSalesAmt))} 차이입니다.`
    : `${ourData.storeName} 기준으로 상위 반응 프로모션의 점포 간 차이는 크지 않습니다.`;

  return {
    promoId: topItem.promo_id ?? "promo-store-top",
    promoName: promoName(topItem),
    ourBillCnt: ourData.billCnt,
    ourSalesAmt: ourData.salesAmt,
    stores,
    interpretation,
    grounding: "최근 집계 기준 프로모션 실적",
    action: higherStores.length > 0
      ? `${higherStores[0].storeName}의 강은 시간대를 참고해 운영 시간대를 조정하세요.`
      : "현재 프로모션 운영 방식을 유지하면서 점포 간 우수 사례를 공유하세요.",
  };
}
export async function getPromoPerformanceData(): Promise<import("../types").PromoPerformanceData> {
  const [response, sales, hourly, storeCompare] = await Promise.all([
    getPromoResponseSummary(),
    getPromoSalesSummary(),
    getPromoHourlySummary(),
    getPromoStoreCompare(),
  ]);
  return { response, sales, hourly, storeCompare };
}

// ══════════════════════════════════════════════════════════════════
//  매출 분석 추가 API — 월간 매출, 배달 비교, 상품 비교, 점포 평균 비교, 배달 건수 비교, 프로모션 상세
// ══════════════════════════════════════════════════════════════════

type MonthlySalesItem = { month: string; total_sales: number; total_qty: number };
type DeliveryChannelItem = { channel_name: string; total_sales: number; total_orders: number; share_pct: number };
type ProductComparisonItem = { month: string; total_qty: number; total_sales: number };
type StoreAvgComparisonData = { store_id: string; latest_date: string | null; period_start: string | null; our_avg_daily: number; all_stores_avg_daily: number; diff_pct: number; total_stores: number; data_source: string };
type DeliveryCountComparisonData = { store_id: string; latest_date: string | null; weekly: { this_week_orders: number; last_week_orders: number; diff_pct: number }; monthly: { this_month: { month: string | null; total_orders: number; total_sales: number }; last_month: { month: string | null; total_orders: number; total_sales: number }; diff_pct: number }; data_source: string };
type PromoPerformanceDetailData = { store_id: string; promotions: Array<{ campaign_id: string; campaign_name: string; total_bill_cnt: number; total_sales_amt: number; store_count: number }>; hourly: Record<string, unknown>; store_comparison: { top_promo_id: string | null; top_promo_name: string; stores: Array<{ store_id: string; bill_cnt: number; sales_amt: number }> } | null; data_source: string };

export async function getMonthlySales(months = 6): Promise<MonthlySalesItem[]> {
  try {
    const data = await apiGet<{ months: MonthlySalesItem[] }>(`/v1/analytics/monthly-sales?store_id=${STORE_ID}&months=${months}`);
    return data.months ?? [];
  } catch {
    return [];
  }
}

export async function getDeliveryComparison(days = 30): Promise<{ channels: DeliveryChannelItem[]; total_sales: number; latest_date: string | null }> {
  try {
    const data = await apiGet<{ channels: DeliveryChannelItem[]; total_sales: number; latest_date: string | null }>(`/v1/analytics/delivery-comparison?store_id=${STORE_ID}&days=${days}`);
    return { channels: data.channels ?? [], total_sales: data.total_sales ?? 0, latest_date: data.latest_date ?? null };
  } catch {
    return { channels: [], total_sales: 0, latest_date: null };
  }
}

export async function getProductComparison(productName = "글레이즈드", months = 3): Promise<ProductComparisonItem[]> {
  try {
    const data = await apiGet<{ months: ProductComparisonItem[] }>(`/v1/analytics/product-comparison?store_id=${STORE_ID}&product_name=${encodeURIComponent(productName)}&months=${months}`);
    return data.months ?? [];
  } catch {
    return [];
  }
}

export async function getStoreAvgComparison(): Promise<StoreAvgComparisonData | null> {
  try {
    return await apiGet<StoreAvgComparisonData>(`/v1/analytics/store-avg-comparison?store_id=${STORE_ID}`);
  } catch {
    return null;
  }
}

export async function getDeliveryCountComparison(): Promise<DeliveryCountComparisonData | null> {
  try {
    return await apiGet<DeliveryCountComparisonData>(`/v1/analytics/delivery-count-comparison?store_id=${STORE_ID}`);
  } catch {
    return null;
  }
}

export async function getPromoPerformanceDetail(): Promise<PromoPerformanceDetailData | null> {
  try {
    const demo = getDemoDate();
    return await apiGet<PromoPerformanceDetailData>(`/v1/analytics/promo-performance-detail?store_id=${STORE_ID}&demo_date=${encodeURIComponent(demo)}`);
  } catch {
    return null;
  }
}

export async function getCampaignDashboard(): Promise<import("../types").CampaignDashboardResponse | null> {
  try {
    const demo = getDemoDate();
    return await apiGet<import("../types").CampaignDashboardResponse>(`/v1/promotions/dashboard?store_id=${STORE_ID}&demo_date=${encodeURIComponent(demo)}`);
  } catch {
    return null;
  }
}

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

type HourlySalesItemWithHour = {
  hour: string;
  sales_estimated: number;
  pct_of_daily?: number;
};

type HourlySalesResponse = {
  data_source?: string;
  note?: string;
  today?: HourlySalesItemWithHour[];
  last_week?: HourlySalesItemWithHour[];
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
  const raw = item?.promo_name || item?.campaign_name || "프로모션";
  return raw.replace(/20[12]\d\s*년\s*/g, "").replace(/20[12]\d\.\d{2}\.\d{2}/g, "").replace(/\d{2}년\s*/g, "").trim().replace(/^\s*[\-\s]+\s*/, "").trim() || "프로모션";
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
    { id: "validation-promo-coverage", label: "프로모션 실적 연동 상태", accuracy: 66, color: "#7c5cbf" },
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
    { subject: "프로모션", value: 66 },
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
      description: "카테고리, 시간대, 프로모션 축은 기본 점수로 유지 중입니다.",
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
    safeGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}&demo_date=${encodeURIComponent(getDemoDate())}`),
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
        { id: "validation-promo-coverage", label: "프로모션 실적 연동 상태", accuracy: 74, color: "#7c5cbf" },
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
    { subject: "프로모션", value: promoScore },
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
      title: `${resolveProductDisplayName(topRiskItem.product_name)} 재고 부족이 손실의 직접 원인으로 확인됩니다`,
      detail: `현재 재고 ${formatNumber(Math.round(Number(topRiskItem.on_hand_eod ?? 0)))}개, 판매 ${formatNumber(
        Math.round(Number(topRiskItem.sold_qty ?? 0)),
      )}개, 품절 ${formatNumber(Math.round(Number(topRiskItem.stockout_minutes ?? 0)))}분으로 ${
        lossAmt > 0 ? `${fmtKRW(Math.round(lossAmt))} 손실이 추정됩니다.` : "기회손실 추정치는 아직 없습니다."
      }`,
      subItem: {
        label: `${resolveProductDisplayName(topRiskItem.product_name)}은 최소 ${formatNumber(recommendedQty)}개 수준까지 생산·보충 기준을 상향하는 것이 안전합니다.`,
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
      .map((item) => `${resolveProductDisplayName(item.product_name)} ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`)
      .join(", ");
    cards.push({
      id: "validation-order-pattern",
      tags: ["검증완료", "운영관리", "제품분석"],
      date: buildValidationDate(22),
      title: `${topOption.label} 추천안이 현재 수요 패턴과 가장 가깝습니다`,
      detail: `총 ${formatNumber(Math.round(Number(topOption.total_qty ?? 0)))}개로 4주 평균 ${formatNumber(
        Math.round(Number(orderRecommendations?.four_week_avg_qty ?? 0)),
      )}개 대비 ${sanitizeUserFacingReason(topOption.deviation_label ?? "평균 수준") || "평균 수준"}입니다. 상위 품목은 ${topItemsLabel}입니다.`,
      subItem: {
        label:
          orderRecommendations?.explanation ||
          `${resolveProductDisplayName(topRecommendedItems[0]?.product_name) ?? "상위 품목"} 중심으로 먼저 발주를 확정하고 나머지 품목은 재고 상황을 함께 보세요.`,
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
      tags: ["검증중", "프로모션", "제품분석"],
      date: buildValidationDate(31),
      title: "프로모션 성과 편차는 동일 메시지라도 크게 다르게 나타납니다",
      detail: `${topPromoName(topPromo)}는 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))} / ${formatNumber(
        Math.round(Number(topPromo.bill_cnt ?? 0)),
      )}건 반응을 기록했습니다.${
        weakPromo
          ? ` 반면 ${topPromoName(weakPromo)}는 ${fmtKRW(Math.round(Number(weakPromo.sales_amt ?? 0)))} 수준이라 메시지·노출 경로 재검증이 필요합니다.`
          : " 현재 프로모션은 모두 실적 추적 상태입니다."
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
      title: "프로모션 실적 비교 완료",
      description: topPromo
        ? `${topPromoName(topPromo)} 성과를 기준으로 프로모션 편차 검증 카드를 생성했습니다.`
        : "프로모션 실적 데이터가 없어 편차 분석은 제한적으로 유지합니다.",
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
      `재고 위험 ${formatNumber(riskItems.length)}개, 추천 발주 옵션 ${formatNumber(options.length)}개, 프로모션 ${formatNumber(promoItems.length)}건을 근거로 생성했습니다.`,
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
  hourlyDataSource: string;
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
    { id: "bench-anyang", storeId: "POC_011", storeName: resolveDemoStoreName("POC_011", "안양시01"), salesDiff: 305.2, quantityDiff: 219.3, wasteDiff: 0, mainProduct: "도넛프라이데이", peakHourLabel: "19시", recommendation: "오후 피크 대응과 프로모션 결합 강도가 높습니다.", isRecommended: true },
    { id: "bench-seongnam", storeId: "POC_030", storeName: resolveDemoStoreName("POC_030", "성남시01"), salesDiff: 269.1, quantityDiff: 183.7, wasteDiff: 0, mainProduct: "먼치킨팩", peakHourLabel: "16시", recommendation: "패키지/행사 상품 매출이 강합니다.", isRecommended: true },
    { id: "bench-suwon", storeId: "POC_031", storeName: resolveDemoStoreName("POC_031", "수원시01"), salesDiff: 429.1, quantityDiff: 294.1, wasteDiff: 0, mainProduct: "신용카드 결제 중심", peakHourLabel: "15시", recommendation: "퇴근 시간대 매출과 객수 집중이 가장 강합니다.", isRecommended: true },
    { id: "bench-gangseo", storeId: "POC_010", storeName: resolveDemoStoreName("POC_010", "강서구01"), salesDiff: 241.4, quantityDiff: 188.5, wasteDiff: -12.5, mainProduct: "카페모카", peakHourLabel: "17시", recommendation: "오후 매출 집중과 결제수단 구성이 안정적입니다.", isRecommended: true },
    { id: "bench-mapo1", storeId: "POC_012", storeName: resolveDemoStoreName("POC_012", "마포구01"), salesDiff: 198.7, quantityDiff: 164.2, wasteDiff: -8.2, mainProduct: "아메리카노", peakHourLabel: "18시", recommendation: "도심 상권 특성상 퇴근 전후 수요와 프로모션 반응이 강합니다.", isRecommended: true },
    { id: "bench-mapo2", storeId: "POC_009", storeName: resolveDemoStoreName("POC_009", "마포구02"), salesDiff: 226.8, quantityDiff: 176.4, wasteDiff: -4.8, mainProduct: "글레이즈드", peakHourLabel: "16시", recommendation: "상위 상품 판매력과 프로모션 건수가 고르게 유지됩니다.", isRecommended: true },
  ].filter((peer) => selectedStoreIds.includes(peer.storeId));
  return {
    status: "fallback",
    dataSource: "fallback",
    hourlyDataSource: "none",
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
        "비교 매장들은 15~19시 매출 집중과 프로모션 반응이 더 강합니다.",
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
    safeGet<{ stores?: BenchmarkHourlyStore[]; data_source?: string; status?: string }>(`/v1/benchmarking/hourly-sales?${query}`),
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
      normalizeCampaignYear(promotions?.stores?.find((store) => store.store_id === peer.store_id)?.promotions?.[0]?.campaign_name ?? "프로모션 데이터 없음");
    const topProductDisplay = resolveProductDisplayName(peer.top_product);
    const recommendation =
      peer.sales_diff_pct != null && peer.sales_diff_pct > 0
        ? `${peerName}은 ${peer.peak_hour != null ? `${peer.peak_hour}시 피크` : "피크 운영"}와 ${promotionFocus} 반응이 강합니다.`
        : `${peerName}은 ${paymentFocus} 비중과 ${topProductDisplay} 구성이 비교 포인트입니다.`;
    return {
      id: `benchmark-${peer.store_id}`,
      storeId: peer.store_id,
      storeName: peerName,
      salesDiff: Number(peer.sales_diff_pct ?? 0),
      quantityDiff: Number(peer.qty_diff_pct ?? 0),
      wasteDiff: Number(peer.waste_diff_pct ?? 0),
      mainProduct: topProductDisplay,
      peakHourLabel: peer.peak_hour != null ? `${peer.peak_hour}시` : "-",
      recommendation: resolveProductNamesInText(recommendation),
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
        ? `우리 매장의 대표 상품은 ${resolveProductDisplayName(strongestItem.product_name)}이고 판매수량은 ${formatNumber(Math.round(strongestItem.sold_qty))}개입니다.`
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
    hourlyDataSource: hourly?.data_source ?? (hourly?.status === "no_data" ? "fallback" : "real"),
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
  { id: "ALT-006", code: "ALT-006", categories: ["Agent"], datetime: "발생일시 발생 16:35", title: "생산관리 에이전트 긴급 감지", description: "생산관리 에이전트가 긴급 이벤트를 감지하여 해당 내용을 즉시 알림", condition: "조건: 신뢰도 × 80%", tags: ["Push"], enabled: true },
  { id: "ALT-007", code: "ALT-007", categories: ["Agent"], datetime: "발생일시 발생 13:10", title: "주문관리 에이전트 주문 추천", description: "최근 20분 간 주문 분석 후 추가 주문 추천이 발생했을 경우 알림", condition: "조건: 재고 20개 한  Push", tags: ["Push"], enabled: true },
];

export function getAlarmCards(): Promise<AlarmCard[]> {
  return cached("alarmCards", () => mockDelay(mockAlarmCards));
}

const mockAlarmHistory: AlarmHistoryItem[] = [];

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
        product_name: resolveProductDisplayName(item.product_name),
        recommended_qty: Math.max(
          Math.round(Number(item.sold_qty ?? 0) + Math.abs(Math.min(0, Number(item.on_hand_eod ?? 0)))),
          8,
        ),
        urgency: item.stockout_risk === "HIGH" ? "high" : "medium",
        reason:
          Number(item.estimated_chance_loss ?? 0) > 0
            ? `${resolveProductDisplayName(item.product_name)} 기회손실 ${fmtKRW(Math.round(Number(item.estimated_chance_loss ?? 0)))} 추정`
            : `${resolveProductDisplayName(item.product_name)} ${getInventoryDisplayMetrics(Number(item.on_hand_eod ?? 0)).detailLabel}`,
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
        subtitle: recs.length > 1 ? `${resolveProductDisplayName(recs[1].product_name)} 외 ${Math.max(0, recs.length - 2)}건` : "확인 필요",
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
      name: resolveProductDisplayName(it.product_name),
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
      note: `과거 실적 기반 추천 기준으로 ${items.length}개 품목 발주가 필요합니다.`,
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
      name: resolveProductDisplayName(item.product_name),
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

// 매장 영업 시간별 판매 분포 (8시~21시, 합=1.0)
const HOURLY_PROFILE = {
  8: 0.03, 9: 0.04, 10: 0.06, 11: 0.08,
  12: 0.1, 13: 0.09, 14: 0.08, 15: 0.07,
  16: 0.08, 17: 0.1, 18: 0.11, 19: 0.09,
  20: 0.04, 21: 0.03,
};

/* ── 데모 폴백 데이터 — 백엔드 미연결(정적 데모 배포) 시 원시 데이터 소스로 주입.
 * 실제 API 응답 형태를 유지해 소진 속도·생산 계획·기회손실 계산 로직이 그대로 동작한다. */
type DemoFallbackProduct = {
  product_id: string;
  product_name: string;
  stock: number;
  predicted_stock_1h: number;
  sold_qty: number;
  base_price: number;
  hourly_burn_rate: number;
  stockout_probability: number;
  recommended_production_qty: number;
  estimated_chance_loss: number;
  risk_level: string;
  first_production: { avg_time: string; avg_qty: number } | null;
  second_production: { avg_time: string; avg_qty: number } | null;
  why: string;
};

const DEMO_FALLBACK_PRODUCTS: DemoFallbackProduct[] = [
  { product_id: "2001", product_name: "초코링", stock: 4, predicted_stock_1h: 0, sold_qty: 36, base_price: 1300, hourly_burn_rate: 3.8, stockout_probability: 0.88, recommended_production_qty: 28, estimated_chance_loss: 8900, risk_level: "HIGH", first_production: { avg_time: "10:00", avg_qty: 30 }, second_production: { avg_time: "15:00", avg_qty: 20 }, why: "최근 4주 동일 요일 오후 판매 패턴" },
  { product_id: "2002", product_name: "글레이즈드", stock: 6, predicted_stock_1h: 1, sold_qty: 48, base_price: 1500, hourly_burn_rate: 4.5, stockout_probability: 0.82, recommended_production_qty: 24, estimated_chance_loss: 13900, risk_level: "HIGH", first_production: { avg_time: "10:30", avg_qty: 24 }, second_production: { avg_time: "15:30", avg_qty: 18 }, why: "베스트셀러 · 오후 피크 소진 가속" },
  { product_id: "2003", product_name: "보스턴크림", stock: 5, predicted_stock_1h: 2, sold_qty: 28, base_price: 1500, hourly_burn_rate: 3.2, stockout_probability: 0.74, recommended_production_qty: 18, estimated_chance_loss: 7500, risk_level: "HIGH", first_production: { avg_time: "11:00", avg_qty: 18 }, second_production: { avg_time: "16:00", avg_qty: 12 }, why: "주말 대비 평일 오후 수요 상승" },
  { product_id: "2004", product_name: "에그타르트", stock: 12, predicted_stock_1h: 9, sold_qty: 20, base_price: 1800, hourly_burn_rate: 2.6, stockout_probability: 0.42, recommended_production_qty: 8, estimated_chance_loss: 0, risk_level: "MEDIUM", first_production: null, second_production: null, why: "오후 간식 수요 증가 패턴" },
  { product_id: "2005", product_name: "베이글", stock: 11, predicted_stock_1h: 8, sold_qty: 14, base_price: 1600, hourly_burn_rate: 2.2, stockout_probability: 0.38, recommended_production_qty: 0, estimated_chance_loss: 0, risk_level: "MEDIUM", first_production: null, second_production: null, why: "판매 속도 완만 상승" },
  { product_id: "2006", product_name: "먼치킨", stock: 30, predicted_stock_1h: 27, sold_qty: 24, base_price: 700, hourly_burn_rate: 2.4, stockout_probability: 0.08, recommended_production_qty: 0, estimated_chance_loss: 0, risk_level: "LOW", first_production: null, second_production: null, why: "재고 여유" },
  { product_id: "2007", product_name: "딸기 크림 도넛", stock: 30, predicted_stock_1h: 28, sold_qty: 18, base_price: 1600, hourly_burn_rate: 1.8, stockout_probability: 0.05, recommended_production_qty: 0, estimated_chance_loss: 0, risk_level: "LOW", first_production: null, second_production: null, why: "재고 여유" },
];

const DEMO_FALLBACK_INVENTORY: InventoryCurrentItem[] = DEMO_FALLBACK_PRODUCTS.map((p) => ({
  product_id: p.product_id,
  product_name: p.product_name,
  category: "도넛",
  on_hand_eod: p.stock,
  sold_qty: p.sold_qty,
  stockout_minutes: 0,
  base_price: p.base_price,
  estimated_chance_loss: p.estimated_chance_loss,
  stockout_risk: p.risk_level,
}));

const DEMO_FALLBACK_COCKPIT_ITEMS = DEMO_FALLBACK_PRODUCTS.map((p) => ({
  product_id: p.product_id,
  product_name: p.product_name,
  category: "도넛",
  current_stock: p.stock,
  predicted_stock_1h: p.predicted_stock_1h,
  hourly_burn_rate: p.hourly_burn_rate,
  stockout_probability: p.stockout_probability,
  recommended_production_qty: p.recommended_production_qty,
  first_production: p.first_production,
  second_production: p.second_production,
  risk_level: p.risk_level,
  why: [p.why],
}));

const DEMO_FALLBACK_SALES_SUMMARY = {
  today_revenue: 1489959,
  hourly_trend: [
    { hour: 8, revenue: 45000 }, { hour: 9, revenue: 60000 }, { hour: 10, revenue: 89000 },
    { hour: 11, revenue: 119000 }, { hour: 12, revenue: 149000 }, { hour: 13, revenue: 134000 },
    { hour: 14, revenue: 119000 }, { hour: 15, revenue: 104000 }, { hour: 16, revenue: 119000 },
    { hour: 17, revenue: 149000 }, { hour: 18, revenue: 164000 }, { hour: 19, revenue: 134000 },
    { hour: 20, revenue: 60000 }, { hour: 21, revenue: 45000 },
  ],
};

export async function getProductionAgent(): Promise<ProductionAgentData> {
  try {
    const demoHour = getDemoDateObject().getHours();
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

    const hasLiveData =
      (inventoryRaw?.length ?? 0) > 0 || (cockpitRaw?.items?.length ?? 0) > 0;
    const inventoryItems = hasLiveData
      ? (inventoryRaw ?? [])
      : DEMO_FALLBACK_INVENTORY;
    const inventoryMap = new Map(
      inventoryItems.map((item) => [String(item.product_id), item]),
    );
    const cockpitItems = hasLiveData
      ? (cockpitRaw?.items ?? [])
      : DEMO_FALLBACK_COCKPIT_ITEMS;

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
       // hourly_burn_rate: cockpit API에서 제공되거나, 없으면 sold_qty * HOURLY_PROFILE로 계산
       const rawBurnFromCockpit = "hourly_burn_rate" in item ? item.hourly_burn_rate : null;
       const computedBurn = (inventoryItem?.sold_qty ?? 0) > 0
         ? (inventoryItem?.sold_qty ?? 0) * (HOURLY_PROFILE[demoHour as keyof typeof HOURLY_PROFILE] ?? 1 / 14)
         : null;
       const hourlyBurnRate = Number(
         rawBurnFromCockpit ?? computedBurn ?? 0,
       );
       const burnRateSource: "actual" | "estimated" | "none" =
         rawBurnFromCockpit != null && rawBurnFromCockpit > 0
           ? "actual"
           : computedBurn != null && computedBurn > 0
             ? "estimated"
             : "none";
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
      /* ── 패턴 기반 1차/2차 추천 (backend 이력 데이터 없을 때 HOURLY_PROFILE 기반 계산) ── */
      const dailyDemand = recommendedProductionQty + Math.max(0, rawCurrentStock);
      const SAFETY_STOCK = 3;
      const profileKeys = Object.keys(HOURLY_PROFILE).map(Number).sort((a, b) => a - b);
      const totalProfileShare = profileKeys.reduce((s, h) => s + HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE], 0);
      /* hour → expected hourly demand */
      const hourlyDemand = (h: number) => {
        const share = totalProfileShare > 0 ? HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE] / totalProfileShare : 1 / profileKeys.length;
        return dailyDemand > 0 ? dailyDemand * share : 0;
      };
      /* cumulative demand from hour `from` to hour `to` (inclusive) */
      const demandBetween = (from: number, to: number) => {
        let sum = 0;
        for (const h of profileKeys) {
          if (h >= from && h <= to) sum += hourlyDemand(h);
        }
        return sum;
      };
       /* 1차 available(진열 가능) 시각: 오전 피크 시간 (12:00) → production 시점 */
      const morningHours = profileKeys.filter((h) => h <= 12);
      const morningPeakH = morningHours.length > 0 ? morningHours.reduce((best, h) => {
        const s = HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE];
        return s > HOURLY_PROFILE[best as keyof typeof HOURLY_PROFILE] ? h : best;
      }, morningHours[0]) : 12;
      const firstAvailableHour = Math.max(8, morningPeakH);
      const firstRegisterHour = Math.max(8, firstAvailableHour - 1);
      /* 2차 available 시각: 오후 피크 시간 (18:00) → production 시점 */
      const afternoonHours = profileKeys.filter((h) => h > 12);
      let maxAfternoonShare = 0, afternoonPeakH = 18;
      for (const h of afternoonHours) {
        const s = HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE];
        if (s > maxAfternoonShare) { maxAfternoonShare = s; afternoonPeakH = h; }
      }
      const secondAvailableHour = afternoonPeakH;
      const secondRegisterHour = Math.max(8, secondAvailableHour - 1);
      const fmtH = (h: number) => `${h.toString().padStart(2, "0")}:00`;
      const firstRegisterTime = fmtH(firstRegisterHour);
      const firstAvailableTime = fmtH(firstAvailableHour);
      const secondRegisterTime = fmtH(secondRegisterHour);
      const secondAvailableTime = fmtH(secondAvailableHour);
       /* 1차 수량: 1차 available~2차 available까지 예상 판매량 + 안전재고 - 1차 시점 잔여 재고
        * 1차 생산분은 firstAvailableHour 진열 이후부터 대응 가능하므로
        * 8:00~firstAvailableHour 수요는 즉시 생산 필요 수량 또는 현재 재고로 대응
        */
       const demandMorning = demandBetween(8, firstAvailableHour - 1);
       const stockAtFirst = Math.max(0, rawCurrentStock - demandMorning);
       const demandForFirst = demandBetween(firstAvailableHour, secondAvailableHour - 1);
       const firstPatternQty = dailyDemand > 0 ? Math.max(1, Math.round(demandForFirst - stockAtFirst + SAFETY_STOCK)) : null;
       /* 2차 수량: 2차 available~마감까지 예상 판매량 + 안전재고 - 2차 시점 잔여 재고 */
       const demandForSecond = demandBetween(secondAvailableHour, 21);
       const stockAtSecond = Math.max(0, stockAtFirst + (firstPatternQty ?? 0) - demandForFirst);
       const secondPatternQty = dailyDemand > 0 ? Math.max(1, Math.round(demandForSecond - stockAtSecond + SAFETY_STOCK)) : null;
     const rawWhy = "why" in item ? (item as any).why : null;
       const why = Array.isArray(rawWhy) ? (rawWhy ?? []).filter(Boolean) : [];
      const shortage = Math.max(current.shortage, predicted.shortage);
      const status = deriveProductionStatus({
        current,
        predicted,
        recommendedQty: recommendedProductionQty,
        riskLevel: stockoutRisk,
        stockoutProbability: Number(
          ("stockout_probability" in item ? item.stockout_probability : null) ?? 0,
        ),
      });
      const currentPhrase = current.currentLabel;
      const predictedPhrase = getPredictedStockLabel(predicted);
       const burnRateText = formatBurnRate(hourlyBurnRate);
       const burnLabelPrefix =
         burnRateSource === "actual"
           ? "근거: 최근 1시간 판매 속도"
           : burnRateSource === "estimated"
             ? "근거: 시간대 판매 패턴"
             : null;
       const groundingLabel = joinCompact([
         burnLabelPrefix && burnRateText ? `${burnLabelPrefix} ${burnRateText}` : null,
        firstProduction?.avg_time
           ? `최근 생산 이력 1차 ${firstProduction.avg_time} / ${formatNumber(
              Number(firstProduction.avg_qty ?? 0),
            )}개`
           : "최근 생산 이력 기반 1차 생산 패턴 부족",
        secondProduction?.avg_time
          ? `2차 ${secondProduction.avg_time} / ${formatNumber(
              Number(secondProduction.avg_qty ?? 0),
            )}개`
           : "2차 생산 패턴 부족 — 생산 이력 부족 시 판매 패턴 기준",
        "리드타임 1시간 반영",
        why[0] ? `실적 기반 추정 (${why[0]})` : "실적 기반 추정",
      ]);
      const actionLabel =
        status.statusLabel === "재고 적정"
          ? `${productName}은 현재 모니터링 유지 대상입니다.`
          : `${productName} ${status.actionText}`;

       const oneHourShortfall = Math.max(
         0,
         Math.ceil(hourlyBurnRate * 1 - rawCurrentStock),
       );
        /* ── ETA 기반 찬스로스 계산 (리드타임 1시간) ──
         * 품절 예상 시각 = 현재 시각 + ETA
         * 진열 가능 시각 = 현재 시각 + 생산 리드타임 60분
         * 품절 위험 구간 = 품절 예상 시각 ~ 진열 가능 시각
         * 예상 손실 수량 = hourlyBurnRate × max(60 - ETA, 0) / 60
         * inventory/current의 estimated_chance_loss는 일일 기준이므로, ETA 기반 계산과 비교 후 큰 값 사용
         */
        const invItemForPrice = inventoryMap.get(productId);
        const unitPrice = estimateUnitPrice(productId, productName, invItemForPrice);
        const inventoryLoss = Number(inventoryItem?.estimated_chance_loss ?? 0);
        let etaMinutes: number | null = null;
        let estLossQty: number | null = null;
        let estLossAmount: number | null = null;
        if (hourlyBurnRate > 0 && rawCurrentStock >= 0) {
          etaMinutes = (rawCurrentStock / hourlyBurnRate) * 60;
          const leadTimeMin = 60;
          if (etaMinutes < leadTimeMin) {
            const riskMinutes = leadTimeMin - etaMinutes;
            estLossQty = Math.max(0, Math.round(hourlyBurnRate * riskMinutes / 60));
            estLossAmount = unitPrice != null && unitPrice > 0 ? estLossQty * unitPrice : null;
          } else {
            estLossQty = 0;
            estLossAmount = null;
          }
        }
        // ETA 기반 손실보다 inventory/current 추정 손실이 크면 큰 값 사용
        if (inventoryLoss > 0) {
          estLossAmount = estLossAmount != null ? Math.max(estLossAmount, inventoryLoss) : inventoryLoss;
        }
       return {
        id: `prod-${productId}`,
        name: productName,
        quantity: current.currentCount,
        isLow: status.statusLabel !== "재고 적정",
        shortage,
        oneHourShortfall,
        badgeLabel:
          shortage > 0
            ? `부족 ${formatNumber(shortage)}개`
            : recommendedProductionQty > 0
              ? `권장 ${formatNumber(recommendedProductionQty)}개`
              : current.badgeLabel,
        statusLabel: status.statusLabel,
        statusDescription: status.statusDescription,
        detailLabel: joinCompact([currentPhrase, predictedPhrase]),
        currentLabel: currentPhrase,
        predictedStock1h: predicted.currentCount,
        predictedLabel: predictedPhrase,
        recommendedProductionQty,
        dailyRecommendedQty: recommendedProductionQty,
         hourlyBurnRate,
         burnRateSource,
        riskLevel: stockoutRisk,
        stockoutProbability: Number(
          ("stockout_probability" in item ? item.stockout_probability : null) ?? 0,
        ),
        groundingLabel,
        actionLabel: `지금 할 일: ${actionLabel}`,
        firstProductionTime: firstProduction?.avg_time ?? (firstPatternQty ? firstRegisterTime : null),
        firstProductionQty: Number(firstProduction?.avg_qty ?? 0) || firstPatternQty || null,
        firstRegisterTime: (firstProduction || firstPatternQty) ? firstRegisterTime : null,
        firstAvailableTime: (firstProduction || firstPatternQty) ? firstAvailableTime : null,
        secondProductionTime: secondProduction?.avg_time ?? (secondPatternQty ? secondRegisterTime : null),
        secondProductionQty: Number(secondProduction?.avg_qty ?? 0) || secondPatternQty || null,
        secondRegisterTime: (secondProduction || secondPatternQty) ? secondRegisterTime : null,
        secondAvailableTime: (secondProduction || secondPatternQty) ? secondAvailableTime : null,
         productionSource: (firstProduction || secondProduction) ? ("history" as const) : ("pattern" as const),
         leadTimeLabel: "리드타임 1시간 반영",
         etaMinutes,
         estimatedLossQty: estLossQty,
         estimatedLossAmount: estLossAmount,
         unitPrice,
       };
    })
    .filter((item) => {
      const invItem = inventoryMap.get(item.id.replace(/^prod-/, ""));
      return isProductionEligible(item.id, item.name, invItem?.category ?? undefined);
    })
    .sort((a, b) => {
      const rank = (label?: string) =>
        label === "즉시 생산 필요" ? 0 : label === "보충 필요" ? 1 : label === "주의" ? 2 : 3;
      const aHasPattern = (a.firstProductionTime || a.secondProductionTime) ? 1 : 0;
      const bHasPattern = (b.firstProductionTime || b.secondProductionTime) ? 1 : 0;
      return (
        bHasPattern - aHasPattern ||
        rank(a.statusLabel) - rank(b.statusLabel) ||
        Number(b.recommendedProductionQty ?? 0) - Number(a.recommendedProductionQty ?? 0) ||
        Number(b.shortage ?? 0) - Number(a.shortage ?? 0)
      );
    });

    const lowItems = items.filter((i) => i.isLow);
    const topItem = lowItems[0] ?? items[0];
    const aiRec = topItem
      ? [
          `${topItem.name} ${topItem.currentLabel ?? `${formatNumber(topItem.quantity)}개`} · ${topItem.predictedLabel ?? "1시간 뒤 예상 계산 중"}입니다.`,
          topItem.statusLabel
            ? `상태는 ${topItem.statusLabel}입니다. ${topItem.statusDescription ?? ""}`.trim()
            : "",
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
//  생산관리 예상 추가 매출 배너 — production agent 기준 TOP_N으로 계산
// ══════════════════════════════════════════════════════════════════

const PRODUCTION_TOP_N = 8;

function urgencyScoreItem(item: ProductionItem): number {
  let score = 0;
  const shortage = item.shortage ?? 0;
  if (item.statusLabel === "즉시 생산 필요") score += 1000;
  else if (item.statusLabel === "보충 필요") score += 500;
  score += shortage * 50;
  score += (item.hourlyBurnRate ?? 0) * 20;
  const ps1h = item.predictedStock1h ?? 0;
  if (ps1h < 0) score += 200;
  else if (ps1h === 0) score += 100;
  return score;
}

export async function getInventorySnapshotSummary(): Promise<{
  totalCount: number;
  urgentCount: number;
  supplementCount: number;
  normalCount: number;
} | null> {
  try {
    const demoDate = getDemoDate();
    const demoTime = getDemoTime();
    if (!demoDate || !demoTime) return null;
    const snap = await getInventorySnapshot(demoDate, demoTime, "", "all");
    if (!snap?.summary) return null;
    return {
      totalCount: snap.summary.total_count,
      urgentCount: snap.summary.urgent_count,
      supplementCount: snap.summary.supplement_count,
      normalCount: snap.summary.normal_count,
    };
  } catch {
    return null;
  }
}

export async function getInventoryChanceLoss(): Promise<number> {
  try {
    const [raw, prodSummary] = await Promise.all([
      safeGet<InventoryCurrentItem[]>("/inventory/current"),
      getProductionSummary().catch(() => null),
    ]);
    return resolveInventoryChanceLoss(raw, prodSummary?.totalEstimatedLoss ?? 0);
  } catch {
    return 0;
  }
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  try {
    const production = await getProductionAgent();
    const items = production.items;
    const actionable = items.filter(
      (it) => (it.statusLabel === "즉시 생산 필요" || it.statusLabel === "보충 필요")
        && ((it.shortage ?? 0) > 0 || (it.recommendedProductionQty ?? 0) > 0 || it.quantity === 0),
    );
    const sorted = [...actionable].sort((a, b) => urgencyScoreItem(b) - urgencyScoreItem(a));
    const topCount = Math.min(sorted.length, PRODUCTION_TOP_N);
    const restCount = sorted.length - topCount;

    /* ETA 기반 찬스로스 합계 (actionable 품목만, unitPrice > 0) */
    const lossItems = sorted
      .filter((it) => (it.estimatedLossAmount ?? 0) > 0)
      .map((it) => ({
        id: it.id,
        name: it.name,
        estimatedLossQty: it.estimatedLossQty ?? 0,
        estimatedLossAmount: it.estimatedLossAmount ?? 0,
        etaMinutes: it.etaMinutes ?? 0,
        hourlyBurnRate: it.hourlyBurnRate ?? 0,
      }));
    const totalEstimatedLoss = lossItems.reduce((s, it) => s + it.estimatedLossAmount, 0);

    const urgentLabel = topCount > 0
      ? `${topCount}개 선별`
      : "적정 재고 수준 유지 중";

    const bannerLabel = topCount > 0
      ? `긴급 생산 대상 ${topCount}개 선별 · 리드타임 1시간 기준`
      : "적정 재고 수준 유지 중";

    return {
      bannerLabel,
      urgentCount: topCount,
      urgentLabel,
      restCount,
      totalEstimatedLoss,
      lossItems,
    };
  } catch {
    return mockDelay({
      bannerLabel: "적정 재고 수준 유지 중",
      urgentCount: 0,
      urgentLabel: "적정 재고 수준 유지 중",
      restCount: 0,
      totalEstimatedLoss: 0,
      lossItems: [],
    });
  }
}

function estimateUnitPrice(
  productId: string,
  productName: string,
  inventoryItem: InventoryCurrentItem | undefined,
): number | null {
  const basePrice = inventoryItem?.base_price ?? null;
  if (basePrice != null && basePrice > 0) return basePrice;
  return null;
}

// ══════════════════════════════════════════════════════════════════
//  생산관리 배치 현황 — API: /inventory/current (mapped)
// ══════════════════════════════════════════════════════════════════

const BATCH_COLORS = ["#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8", "#e8d5b0", "#c8b8a0", "#f0c8c8"];

export async function getProductionBatchItems(): Promise<ProductionBatchItem[]> {
  try {
    const production = await getProductionAgent();
    return production.items.map((item, idx) => {
      const targetBase = Math.max(
        item.quantity,
        item.predictedStock1h ?? 0,
        item.recommendedProductionQty ?? 0,
        item.shortage ?? 0,
        1,
      );
      const progressPercent = Math.max(
        8,
        Math.min(100, Math.round((item.quantity / targetBase) * 100)),
      );
      return {
        id: `batch-${item.id}`,
        name: item.name,
        product_id: item.id.replace(/^prod-/, ""),
        bgColor: BATCH_COLORS[idx % BATCH_COLORS.length],
        status: item.statusLabel ?? null,
        aiWarning: [item.statusDescription, item.actionLabel].filter(Boolean).join(" · ") || null,
        lossAmount:
          item.dailyRecommendedQty && item.dailyRecommendedQty > 0
            ? `일일 권장 ${formatNumber(item.dailyRecommendedQty ?? 0)}개`
            : null,
        currentCount: item.quantity,
        targetShortfall: item.oneHourShortfall ?? item.shortage ?? null,
        progressPercent,
        currentStockLabel: item.currentLabel,
        shortageLabel: item.predictedLabel ?? null,
        detailLabel: item.detailLabel,
        shortageCount: item.shortage,
        predictedStock1h: item.predictedStock1h ?? null,
        hourlyBurnRate: item.hourlyBurnRate ?? null,
        burnRateSource: item.burnRateSource ?? null,
        firstProductionTime: item.firstProductionTime ?? null,
        firstProductionQty: item.firstProductionQty ?? null,
        firstRegisterTime: item.firstRegisterTime ?? null,
        firstAvailableTime: item.firstAvailableTime ?? null,
        secondProductionTime: item.secondProductionTime ?? null,
        secondProductionQty: item.secondProductionQty ?? null,
        secondRegisterTime: item.secondRegisterTime ?? null,
        secondAvailableTime: item.secondAvailableTime ?? null,
        productionSource: item.productionSource ?? null,
        oneHourShortfall: item.oneHourShortfall ?? null,
        dailyRecommendedQty: item.dailyRecommendedQty ?? null,
        recommendedProductionQty: item.recommendedProductionQty ?? null,
        predictedLabel: item.predictedLabel ?? null,
        statusLabel: item.statusLabel ?? null,
        statusDescription: item.statusDescription ?? null,
        groundingLabel: item.groundingLabel ?? null,
        actionLabel: item.actionLabel ?? null,
        shortage: item.shortage ?? null,
        etaMinutes: item.etaMinutes ?? null,
        estimatedLossQty: item.estimatedLossQty ?? null,
        estimatedLossAmount: item.estimatedLossAmount ?? null,
        unitPrice: item.unitPrice ?? null,
      };
    });
  } catch {
    return mockDelay([
       { id: "batch-001", name: "초코링", product_id: "1001", bgColor: "#f9e4c8", status: "즉시 생산 필요" as const, aiWarning: "현재 보유가 낮아 즉시 생산 검토가 필요합니다. · 지금 할 일: 우선 생산 수량을 확인하세요.", lossAmount: "권장 28개", currentCount: 4, targetShortfall: 28, progressPercent: 14, currentStockLabel: "4개", shortageLabel: "1시간 뒤 예상 0개 · 부족 24개" },
       { id: "batch-002", name: "아메리카노 원두", product_id: "1002", bgColor: "#d4b896", status: "보충 필요" as const, aiWarning: "현재 보유가 낮아 보충 계획을 확인해야 합니다. · 지금 할 일: 보충 또는 생산 가능 여부를 확인하세요.", lossAmount: "권장 12개", currentCount: 4, targetShortfall: 12, progressPercent: 18, currentStockLabel: "4개", shortageLabel: "1시간 뒤 예상 1개" },
       { id: "batch-003", name: "달고나 츄이스티 약과", product_id: "1003", bgColor: "#e8d5b0", status: "재고 적정" as const, aiWarning: "다음 1시간 예상 판매량 기준으로 즉시 생산 필요는 없습니다. · 지금 할 일: 현재 재고를 유지하면서 모니터링하세요.", lossAmount: null, currentCount: 4, targetShortfall: null, progressPercent: 40, currentStockLabel: "4개", shortageLabel: "1시간 뒤 예상 3개" },
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════
//  주문관리 에이전트 — sales-summary + inventory/current 기반 실데이터
// ══════════════════════════════════════════════════════════════════

export async function getOrderAgent(): Promise<OrderAgentData> {
  const summaryPath = appendDemoQueryParams("/home/sales-summary", {
    includeBizDate: true,
  });
  const inventoryPath = appendDemoQueryParams("/inventory/current", {
    includeBizDate: true,
  });

  try {
    const [summaryRaw, inventoryRaw] = await Promise.all([
      safeGet<{
        today_revenue?: number;
        hourly_trend?: { hour: number; revenue: number }[];
      }>(summaryPath),
      safeGet<InventoryCurrentItem[]>(inventoryPath),
    ]);
    const summaryData = summaryRaw ?? DEMO_FALLBACK_SALES_SUMMARY;
    const inventoryItems =
      (inventoryRaw?.length ?? 0) > 0 ? inventoryRaw : DEMO_FALLBACK_INVENTORY;

    /* "시각까지의 누적" 규칙: 8~(H-1)시 전체 + H시×(M/60) */
    const demoDateObj = getDemoDateObject();
    const demoAsOfHour = demoDateObj.getHours() + demoDateObj.getMinutes() / 60;
    const demoHour = demoDateObj.getHours();
    const hourlyRows = (summaryData?.hourly_trend ?? [])
      .filter((row) => Number(row.hour) < demoAsOfHour)
      .sort((a, b) => Number(a.hour) - Number(b.hour));
    let cumulativeSales = hourlyRows.reduce(
      (sum, row) => sum + Number(row.revenue ?? 0),
      0,
    );
    if (demoAsOfHour - demoHour > 0) {
      const partialRow = (summaryData?.hourly_trend ?? []).find(
        (row) => Number(row.hour) === demoHour
      );
      if (partialRow) {
        cumulativeSales += Number(partialRow.revenue ?? 0) * (demoAsOfHour - demoHour);
      }
    }
    const chartData =
      hourlyRows.length > 0
        ? hourlyRows.map((row) => ({
            time: `${String(row.hour).padStart(2, "0")}:00`,
            value: Math.round(Number(row.revenue ?? 0)),
          }))
        : [];

    const rankedItems = (inventoryItems ?? [])
      .filter((item) => isMeaningfulLabel(item.product_name))
      .sort((a, b) => {
        const salesA =
          Number(a.base_price ?? 0) * Math.max(Number(a.sold_qty ?? 0), 0);
        const salesB =
          Number(b.base_price ?? 0) * Math.max(Number(b.sold_qty ?? 0), 0);
        return salesB - salesA;
      })
      .slice(0, 6);

    const currentHourLabel = `${String(demoHour).padStart(2, "0")}:00`;

    /* HOURLY_PROFILE 기반 cumulative ratio 계산 (시각까지의 누적 규칙) */
    const profileKeys = Object.keys(HOURLY_PROFILE).map(Number).sort((a, b) => a - b);
    const totalProfile = profileKeys.reduce((s, h) => s + HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE], 0);
    let cumulativeRatio = 0;
    if (demoHour >= 8) {
      let ratio = profileKeys.filter(h => h < demoHour).reduce((s, h) => s + HOURLY_PROFILE[h as keyof typeof HOURLY_PROFILE], 0) / totalProfile;
      const frac = demoAsOfHour - demoHour;
      if (frac > 0 && frac < 1 && demoHour <= 21) {
        ratio += (HOURLY_PROFILE[demoHour as keyof typeof HOURLY_PROFILE] ?? 0) * frac / totalProfile;
      }
      cumulativeRatio = ratio;
    }

    const items = rankedItems.map((item, index) => {
      const soldQty = Math.max(Math.round(Number(item.sold_qty ?? 0)), 0);
      const currentEst = soldQty > 0 ? Math.max(1, Math.round(soldQty * cumulativeRatio)) : 0;
      const risk = String(item.stockout_risk ?? "").toLowerCase();
      const status =
        risk === "high" || risk === "critical"
          ? "주의"
          : index < 2
            ? "집중"
            : "안정";
      return {
        id: `sales-${item.product_id}`,
        orderId: `${currentHourLabel} 기준 추정`,
        status,
        productName: resolveProductDisplayName(item.product_name),
        type: `금일 ${formatNumber(soldQty)}개 판매`,
        currentQty: currentEst,
        endOfDayQty: soldQty,
      };
    });

    return {
      items,
      todaySales:
        cumulativeSales > 0
          ? fmtKRW(cumulativeSales)
          : fmtKRW(Math.round(Number(summaryData?.today_revenue ?? 0))),
      todaySalesLabel: "현재 시각 누적",
      sectionLabel: "실시간 판매 흐름",
      emptyMessage:
        items.length === 0
          ? "현재 시각 기준 판매 상위 품목 데이터가 없습니다."
          : undefined,
      chartData,
    };
  } catch {
    return {
      items: [],
      todaySales: "데이터 없음",
      todaySalesLabel: "현재 시각 누적",
      sectionLabel: "실시간 판매 흐름",
      emptyMessage: "실시간 판매 데이터를 불러오지 못했습니다.",
      chartData: [],
    };
  }
}

// ══════════════════════════════════════════════════════════════════
//  제품분석 에이전트 — mock 유지 (백엔드 미제공)
// ══════════════════════════════════════════════════════════════════

const mockProductAnalysis: ProductAnalysisData = {
  tabs: ["도넛", "커피원두", "냉동/냉장", "기타 상품"],
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
    "기타 상품": [
      { id: "pa-010", name: "던킨 텀블러", quantity: 38, revenue: 190000, salesContribution: 72, promotionEffect: 85, trend: "up" },
    ],
  },
  aiStatus: "실시간 판매 데이터를 기준으로 상품별 매출 비중과 프로모션 효과를 분석합니다",
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
    const demoDate = getDemoDateObject().toISOString().slice(0, 10);
    const demoTime = getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    _orderRecCache = apiGet<{
      target_date: string;
      options: {
        label: string;
        reference_date?: string;
        deviation_label?: string;
        flags?: string[];
        items: { product_id: string; product_name: string; quantity: number; base_price: number }[];
      }[];
    }>(`/order/recommendations?demo_date=${demoDate}&demo_time=${demoTime}`).catch(() => null);
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
      weekLabel: `실적 기반 추천 ${data.target_date ?? "최신"} 기준`,
      reportDate: (data.target_date ?? getDemoDate()).replace(/-/g, "."),
      reportTime: getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      totalCount: totalItems,
      aiScore: "4주 평균 편차 ±12%",
    };
  } catch {
    return mockDelay({ weekLabel: "실적 기반 추천 3월 2주차", reportDate: getDemoDate().replace(/-/g, "."), reportTime: getDemoDateObject().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }), totalCount: 12, aiScore: "4주 평균 편차 ±12%" });
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
      name: resolveProductDisplayName(item.product_name),
      bgColor: defaultColors[idx % defaultColors.length],
      unitPrice: fmtKRW(Math.round(item.base_price)),
      stockInfo: `${item.quantity}개`,
      stockWarning: item.quantity > 30,
      category: inferOrderCategory(item.product_name, item.category),
      orderDate,
      aiRecommendedQty: `${item.quantity}개`,
      aiReason: sanitizeUserFacingReason(
        item.rationale ??
          [
            primaryOption?.label ?? "추천 옵션",
            formatShortDate(primaryOption?.reference_date ?? null),
            primaryOption?.deviation_label ?? "실적 기반 추정",
            ...(primaryOption?.flags ?? [])
              .map((flag) => humanizeInternalReasonFlag(String(flag)))
              .filter((flag): flag is string => Boolean(flag)),
          ]
            .filter(Boolean)
            .join(" · "),
      ),
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
      name: resolveProductDisplayName(item.product_name),
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
//  발주 확정 — POST /api/v1/orders/confirm
// ══════════════════════════════════════════════════════════════════

export async function confirmOrder(
  optionId: string,
  items: Array<{ product_id: string; quantity: number }>,
): Promise<OrderConfirmResponse> {
  try {
    const raw = await apiPost<{
      order_id: string;
      confirmed_at: string;
      status: string;
      total_qty: number;
      total_amount: number;
      message: string;
    }>(`/v1/orders/confirm`, {
      store_id: STORE_ID,
      option_id: optionId,
      items,
    });
    return raw;
  } catch (err) {
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════
//  발주 옵션 요약 — /order/recommendations에서 3옵션 summary 추출
// ══════════════════════════════════════════════════════════════════

export async function getOrderOptions(): Promise<OrderOptionSummary[]> {
  try {
    const data = await getOrderRecommendationsOnce() as {
      options: {
        option_id?: string;
        label: string;
        reference_date?: string;
        deviation_label?: string;
        flags?: string[];
        total_qty?: number;
        total_amount?: number;
        items?: { quantity: number; base_price: number }[];
      }[];
    } | null;
    if (!data?.options?.length) return [];
    return data.options.map((opt, idx) => ({
      option_id: opt.option_id ?? `option-${idx}`,
      label: opt.label,
      reference_date: opt.reference_date,
      deviation_label: opt.deviation_label,
      flags: opt.flags,
      total_qty: opt.total_qty ?? (opt.items ?? []).reduce((s, i) => s + Number(i.quantity ?? 0), 0),
      total_amount:
        opt.total_amount ??
        (opt.items ?? []).reduce((s, i) => s + Number(i.base_price ?? 0) * Number(i.quantity ?? 0), 0),
      itemCount: (opt.items ?? []).length,
    }));
  } catch {
    return [];
  }
}

// 옵션별 전체 item 목록 (AiOrderItem[]) — 옵션 변경 시 list 갱신용
export async function getAllOrderItems(): Promise<AiOrderItem[][]> {
  try {
    const data = await getOrderRecommendationsOnce() as {
      target_date?: string;
      options: {
        option_id?: string;
        label: string;
        reference_date?: string;
        deviation_label?: string;
        flags?: string[];
        items: {
          product_id: string;
          product_name: string;
          quantity: number;
          base_price: number;
          category?: string | null;
          rationale?: string | null;
        }[];
      }[];
    } | null;
    if (!data?.options?.length) return [[]];
    const defaultColors = [
      "#f9e4c8", "#c8dcc0", "#d4b896", "#f5e0c8",
      "#e8d5b0", "#f0c8c8", "#c8b8a0", "#c8e0f0",
      "#b8a080", "#e0e8f0", "#f5c9a0", "#d0d0d0",
    ];
    const orderDate = formatShortDate(data?.target_date ?? null);
    return data.options.map((opt, _optIdx) =>
      opt.items.map((item, idx) => ({
        id: `ai-${item.product_id}`,
        name: resolveProductDisplayName(item.product_name),
        bgColor: defaultColors[idx % defaultColors.length],
        unitPrice: fmtKRW(Math.round(item.base_price)),
        stockInfo: `${item.quantity}개`,
        stockWarning: item.quantity > 30,
        category: inferOrderCategory(item.product_name, item.category),
        orderDate,
        aiRecommendedQty: `${item.quantity}개`,
        aiReason: sanitizeUserFacingReason(
          item.rationale ??
            [
              opt.label ?? "추천 옵션",
              formatShortDate(opt.reference_date ?? null),
              opt.deviation_label ?? "실적 기반 추정",
              ...(opt.flags ?? [])
                .map((flag) => humanizeInternalReasonFlag(String(flag)))
                .filter((flag): flag is string => Boolean(flag)),
            ]
              .filter(Boolean)
              .join(" · "),
        ),
        status: null,
      })),
    );
  } catch {
    return [[]];
  }
}

// ══════════════════════════════════════════════════════════════════
//  AI 기반 성과 분석 — API: /home/sales-summary + /sales/ranking
// ══════════════════════════════════════════════════════════════════

function shiftDemoDate(dateValue: string, offsetDays: number): string {
  const base = new Date(`${dateValue}T00:00:00+09:00`);
  base.setDate(base.getDate() + offsetDays);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function formatChangePct(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return "비교 불가";
  }
  const diffPct = ((current - previous) / Math.abs(previous)) * 100;
  return `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
}

function changeTypeFor(current: number, previous: number): "up" | "down" {
  return current >= previous ? "up" : "down";
}

export async function getAiPerformanceData(tab: "일별" | "주별" | "월별"): Promise<AiPerformanceData> {
  try {
    const currentDate = getDemoDate();
    const previousDate = shiftDemoDate(currentDate, -1);
    const [summaryData, previousSummaryData, inventoryItems, paymentMethods, previousPaymentMethods, promoPerformance] = await Promise.all([
      apiGet<{
        today_revenue: number;
        hourly_trend: { hour: number; revenue: number }[];
        vs_yesterday_same_time_pct?: number;
      }>(`/home/sales-summary?biz_date=${encodeURIComponent(currentDate)}`),
      safeGet<{
        today_revenue?: number;
        hourly_trend?: { hour: number; revenue: number }[];
        vs_yesterday_same_time_pct?: number;
      }>(`/home/sales-summary?biz_date=${encodeURIComponent(previousDate)}`),
      apiGet<InventoryCurrentItem[]>(`/inventory/current?biz_date=${encodeURIComponent(currentDate)}`),
      safeGet<{
        methods?: {
          group_name: string;
          code_count?: number;
          sales_amt: number;
          pct_of_total: number;
        }[];
      }>(`/v1/analytics/payment-methods?store_id=${STORE_ID}&biz_date=${encodeURIComponent(currentDate)}`),
      safeGet<{
        methods?: {
          group_name: string;
          code_count?: number;
          sales_amt: number;
          pct_of_total: number;
        }[];
      }>(`/v1/analytics/payment-methods?store_id=${STORE_ID}&biz_date=${encodeURIComponent(previousDate)}`),
    safeGet<PromoPerformanceResponse>(`/v1/analytics/promo-performance?store_id=${STORE_ID}&demo_date=${encodeURIComponent(getDemoDate())}`),
    ]);

    const hourlyTodayData = await safeGet<{
      today?: { hour: string; sales_estimated?: number }[];
    }>(
      `/v1/analytics/hourly-sales?store_id=${STORE_ID}&biz_date=${encodeURIComponent(currentDate)}`,
    );
    const hourlyPrevData = await safeGet<{
      today?: { hour: string; sales_estimated?: number }[];
    }>(
      `/v1/analytics/hourly-sales?store_id=${STORE_ID}&biz_date=${encodeURIComponent(previousDate)}`,
    );

    const prevHourlyMap: Map<number, number> = new Map(
      (hourlyPrevData?.today ?? []).map((h) => {
        const hourNum = parseInt(h.hour.split(":")[0], 10);
        return [hourNum, Math.round(Number(h.sales_estimated ?? 0))];
      }),
    );

    const hourlySales = (summaryData.hourly_trend ?? []).map((h) => ({
      time: `${h.hour}시`,
      pos: Math.round(h.revenue * 0.7),
      delivery: Math.round(h.revenue * 0.3),
      prevAvg: prevHourlyMap.get(h.hour) ?? 0,
    }));

    const totalRev = summaryData.today_revenue ?? 0;
    const previousRev = Number(previousSummaryData?.today_revenue ?? 0);
    const rankedItems = (inventoryItems ?? [])
      .filter((item) => isMeaningfulLabel(item.product_name))
      .sort((a, b) => Number((b.base_price ?? 0) * (b.sold_qty ?? 0)) - Number((a.base_price ?? 0) * (a.sold_qty ?? 0)));
    const categorySales = rankedItems.slice(0, 4).map((r, i) => ({
      id: `c${i + 1}`,
      name: resolveProductDisplayName(r.product_name),
      today: Math.round(Number(r.base_price ?? 0) * Number(r.sold_qty ?? 0)),
      goal: Math.round(Number(r.base_price ?? 0) * Number(r.sold_qty ?? 0) * 1.15),
      color: i === 0 ? "#3aaedd" : i === 1 ? "#3faf60" : "#888",
    }));

    const paymentTypes =
      (paymentMethods?.methods ?? []).slice(0, 4).map((method, index) => ({
        id: `p${index + 1}`,
        label: method.group_name,
        count: Math.round(Number(method.code_count ?? 0)),
        percent: Math.round(Number(method.pct_of_total ?? 0)),
        color: index === 0 ? "#3aaedd" : index === 1 ? "#3faf60" : index === 2 ? "#333" : "#888",
      })) ||
      [];

    const currentOrderCount = Math.round(
      (paymentMethods?.methods ?? []).reduce(
        (sum, method) => sum + Number(method.code_count ?? 0),
        0,
      ),
    );
    const previousOrderCount = Math.round(
      (previousPaymentMethods?.methods ?? []).reduce(
        (sum, method) => sum + Number(method.code_count ?? 0),
        0,
      ),
    );
    const currentAvgTicket = currentOrderCount > 0 ? Math.round(totalRev / currentOrderCount) : 0;
    const previousAvgTicket = previousOrderCount > 0 ? Math.round(previousRev / previousOrderCount) : 0;

    // Aggregate by promo_name (campaign) to avoid duplicate x-axis labels
    const allPromoRows = promoPerformance?.promotions ?? [];
    const aggregated = new Map<string, { billCnt: number; salesAmt: number }>();
    for (const row of allPromoRows) {
      const name = row.promo_name ?? row.campaign_name ?? "기타";
      const existing = aggregated.get(name);
      if (existing) {
        existing.billCnt += Number(row.bill_cnt ?? 0);
        existing.salesAmt += Number(row.sales_amt ?? 0);
      } else {
        aggregated.set(name, {
          billCnt: Number(row.bill_cnt ?? 0),
          salesAmt: Number(row.sales_amt ?? 0),
        });
      }
    }
    const promoRows = [...aggregated.entries()]
      .map(([name, vals]) => ({ name, billCnt: vals.billCnt, salesAmt: vals.salesAmt }))
      .sort((a, b) => b.salesAmt - a.salesAmt)
      .slice(0, 4);
    const totalPromoSales = promoRows.reduce((sum, row) => sum + row.salesAmt, 0);
    const totalPromoBills = promoRows.reduce((sum, row) => sum + row.billCnt, 0);
    const promotionWeekly =
      promoRows.length > 0
        ? promoRows.map((row) => {
            const displayName = normalizeCampaignYear(row.name)
              .replace(/\s+/g, " ")
              .slice(0, 16);
            return {
              week: displayName,
              billShare: Math.min(99, Math.round(((row.billCnt / Math.max(totalPromoBills, 1)) * 100) || 0)),
              salesShare: Math.min(99, Math.round(((row.salesAmt / Math.max(totalPromoSales, 1)) * 100) || 0)),
              salesContribution: Math.min(99, Math.round(((row.salesAmt / Math.max(totalRev, 1)) * 100) || 0)),
            };
          })
        : [
             { week: "1주차", billShare: 38, salesShare: 22, salesContribution: 18 },
            { week: "2주차", billShare: 42, salesShare: 28, salesContribution: 22 },
            { week: "3주차", billShare: 55, salesShare: 32, salesContribution: 26 },
            { week: "4주차", billShare: 70, salesShare: 38, salesContribution: 30 },
          ];

    const kpis: PerformanceKpiItem[] = [
       {
         id: "k1",
         label: "총매출",
         value: fmtKRW(totalRev),
         change: formatChangePct(totalRev, previousRev),
         changeType: changeTypeFor(totalRev, previousRev),
       },
        {
          id: "k2",
          label: "매출 전일비",
          value: `${previousRev > 0 ? formatChangePct(totalRev, previousRev) : "—"}`,
          change: formatChangePct(totalRev, previousRev),
          changeType: changeTypeFor(totalRev, previousRev),
        },
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
        { week: "오후 글레이즈드 번들", billShare: 45, salesShare: 42, salesContribution: 18 },
        { week: "아이스아메리카노 2천원", billShare: 35, salesShare: 28, salesContribution: 14 },
        { week: "던킨런치세트 할인", billShare: 20, salesShare: 30, salesContribution: 22 },
      ],
      paymentTypes: [
        { id: "p1", label: "카드 일반 결제", count: 824, percent: 64, color: "#3aaedd" },
        { id: "p2", label: "분할 결제", count: 142, percent: 11, color: "#3faf60" },
        { id: "p3", label: "카카오페이", count: 218, percent: 17, color: "#333" },
        { id: "p4", label: "현금", count: 100, percent: 8, color: "#888" },
      ],
      kpis: [
        { id: "k1", label: "총매출", value: "₩12,800,000원", change: "+8.2%", changeType: "up" },
        { id: "k2", label: "매출 전일비", value: "+8.2%", change: "+8.2%", changeType: "up" },
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
            `${resolveProductDisplayName(item.name)} 재고 대응 우선`,
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
            `${resolveProductDisplayName(firstRisk.product_name)} 재고 부족 감지`,
            `${resolveProductDisplayName(firstRisk.product_name)} ${stock.detailLabel}, 금일 판매 ${formatNumber(Math.round(Number(firstRisk.sold_qty ?? 0)))}개입니다.`,
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
            ? `재고 부족 우선 품목은 ${resolveProductDisplayName(firstRisk.product_name)}이며 ${getInventoryDisplayMetrics(Number(firstRisk.on_hand_eod ?? 0)).detailLabel}, 품절 위험 시간은 ${formatNumber(Math.round(Number(firstRisk.stockout_minutes ?? 0)))}분입니다.`
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
            `${resolveProductDisplayName(item.product_name)} 권장 발주 ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`,
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
            `${urgentDeadline.product_group} 주문 상태는 ${humanizeDeadlineStatus(urgentDeadline.status)}이며 남은 시간은 ${formatNumber(Math.max(0, Math.round(Number(urgentDeadline.minutes_remaining ?? 0))))}분입니다.`,
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
                .map((item) => `${resolveProductDisplayName(item.product_name)} ${formatNumber(Math.round(Number(item.quantity ?? 0)))}개`)
                .join(", ")}입니다.`
            : "우선 검토 품목 데이터가 없습니다.",
          urgentDeadline
            ? `${urgentDeadline.product_group} 발주 마감은 ${urgentDeadline.deadline}이며 현재 상태는 ${humanizeDeadlineStatus(urgentDeadline.status)}입니다.`
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

      const topProductName = topProduct ? resolveProductDisplayName(topProduct.product_name) : null;
      if (topProduct && issues.length < 5) {
        const stock = getInventoryDisplayMetrics(Number(topProduct.on_hand_eod ?? 0));
        issues.push(
          makeBriefingIssue(
            "analytics-top",
            "주의",
            `${topProductName} 상위 판매`,
            `${topProductName} 금일 판매량은 ${formatNumber(Math.round(Number(topProduct.sold_qty ?? 0)))}개이고 ${stock.detailLabel}입니다.`,
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
            ? `상위 판매 상품은 ${topProductName}이며 현재 판매량은 ${formatNumber(Math.round(Number(topProduct.sold_qty ?? 0)))}개입니다.`
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
      >(`/v1/analytics/promo-performance?store_id=${STORE_ID}&demo_date=${encodeURIComponent(getDemoDate())}`);
      const promoItems = promotions ?? [];
      const topPromo = [...promoItems].sort(
        (a, b) => Number(b.sales_amt ?? 0) - Number(a.sales_amt ?? 0),
      )[0];
      const topPromoName = topPromo ? (topPromo.campaign_name ?? topPromo.promo_name ?? "프로모션").replace(/20[12]\d\s*년\s*/g, "").replace(/20[12]\d\.\d{2}\.\d{2}/g, "").trim().replace(/^\s*[\-\s]+\s*/, "").trim() || "프로모션" : null;
      return {
        date: dateLabel,
        store: STORE_ID,
        summaryPoints: [
          `현재 조회된 프로모션은 ${formatNumber(promoItems.length)}건입니다.`,
          topPromoName
            ? `상위 프로모션은 ${topPromoName}이며 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))}입니다.`
            : "진행 중인 프로모션 데이터가 없습니다.",
          topPromoName
            ? `반응 건수는 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`
            : "프로모션 반응 건수 데이터는 없습니다.",
        ],
        issues: topPromoName
          ? [
              makeBriefingIssue(
                "promo-top",
                "확인",
                `${topPromoName} 성과`,
                `현재 누적 매출 ${fmtKRW(Math.round(Number(topPromo.sales_amt ?? 0)))} / 반응 ${formatNumber(Math.round(Number(topPromo.bill_cnt ?? 0)))}건입니다.`,
                "프로모션",
                "프로모션 성과 보기",
              ),
            ]
          : [makeBriefingIssue("promo-none", "확인", "프로모션 데이터 없음", "현재 프로모션 성과 데이터가 없습니다.", "프로모션", "화면 보기")],
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
        hourly_trend?: { hour: number; revenue: number }[];
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
    const hasHourlyTrend =
      Array.isArray(salesSummary?.hourly_trend) && (salesSummary?.hourly_trend?.length ?? 0) > 0;
    const timeAwareRevenue = hasHourlyTrend
      ? estimateRevenueAtDemoTime(
          salesSummary?.today_revenue,
          salesSummary?.hourly_trend,
        )
      : null;
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
            ? `${resolveProductDisplayName(alert.product_name)} ${alert.alert_type ?? "알림"}`
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
          `${urgentDeadline.product_group} 발주 마감 상태는 ${humanizeDeadlineStatus(urgentDeadline.status)}입니다.`,
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
          `재고 리스크 ${formatNumber(Math.round(Number(analytics.products_with_stockout ?? 0)))}개`,
          `전체 재고 리스크 항목입니다. 생산 대응 대상은 생산관리 화면에서 확인하세요.`,
          "종합 현황",
          "지표 보기",
        ),
      );
    }


    return {
      date: dateLabel,
      store: STORE_ID,
      summaryPoints: [
        timeAwareRevenue != null
          ? `현재 시각 기준 추정 매출은 ${fmtKRW(timeAwareRevenue)}이고 전일 동시간 대비 ${formatPct(salesSummary?.vs_yesterday_same_time_pct)}입니다.`
          : `현재 시각 기준 매출은 시간대 집계 재계산 중이며 전일 동시간 대비 ${formatPct(salesSummary?.vs_yesterday_same_time_pct)}입니다.`,
        `전체 재고 리스크 ${formatNumber(Math.round(Number(analytics?.products_with_stockout ?? 0)))}개입니다. 생산 대응 대상은 생산관리 화면에서 확인하세요.`,
        urgentDeadline
          ? `${urgentDeadline.product_group} 발주 마감은 ${urgentDeadline.deadline}이며 현재 상태는 ${humanizeDeadlineStatus(urgentDeadline.status)}입니다.`
          : topSelling
            ? `현재 상위 판매 상품은 ${resolveProductDisplayName(topSelling.product_name)}입니다.`
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

// ══════════════════════════════════════════════════════════════════
//  POC 매출 분석 6 개 질문 API (Gold View 기반)
// ══════════════════════════════════════════════════════════════════

export async function getMonthlyCompare(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  currentMonth: string = "2026-02",
  compareMonth: string = "2025-02",
): Promise<MonthlyCompareResponse | null> {
  return safeGet<MonthlyCompareResponse>(
    `/api/v1/analytics/monthly-compare?store_id=${storeId}&current_month=${currentMonth}&compare_month=${compareMonth}`,
  );
}

export async function getDeliveryOrders(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  currentMonth: string = "2026-02",
  compareMonth: string = "2026-01",
): Promise<DeliveryOrdersResponse | null> {
  return safeGet<DeliveryOrdersResponse>(
    `/api/v1/analytics/delivery-orders?store_id=${storeId}&current_month=${currentMonth}&compare_month=${compareMonth}`,
  );
}

export async function getCampaignEffect(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  campaignKeyword: string = "",
): Promise<CampaignEffectResponse | null> {
  const keywordParam = campaignKeyword ? `&campaign_keyword=${encodeURIComponent(campaignKeyword)}` : "";
  return safeGet<CampaignEffectResponse>(
    `/api/v1/analytics/campaign-effect?store_id=${storeId}${keywordParam}`,
  );
}

export async function getProductCompare(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  productKeyword: string = "글레이즈드",
  currentMonth: string = "2026-02",
  compareMonth: string = "2026-01",
): Promise<ProductCompareResponse | null> {
  return safeGet<ProductCompareResponse>(
    `/api/v1/analytics/product-compare?store_id=${storeId}&product_keyword=${encodeURIComponent(productKeyword)}&current_month=${currentMonth}&compare_month=${compareMonth}`,
  );
}

export async function getChannelSales(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  month: string = "2026-02",
): Promise<ChannelSalesResponse | null> {
  return safeGet<ChannelSalesResponse>(
    `/api/v1/analytics/channel-sales?store_id=${storeId}&month=${month}`,
  );
}

export async function getPeerCompare(
  storeId: string = DEMO_PRIMARY_STORE_ID,
  month: string = "2026-02",
): Promise<PeerCompareResponse | null> {
  return safeGet<PeerCompareResponse>(
    `/api/v1/analytics/peer-compare?store_id=${storeId}&month=${month}`,
  );
}
