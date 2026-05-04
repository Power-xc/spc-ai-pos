import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import mic from "../../assets/mic.svg";
import chatstar from "../../assets/chat-star.svg";
import submit from "../../assets/Submit Icon.svg";
import {
  getDemoDateTimeLabel,
  getDemoDateTimeState,
  appendDemoQueryParams,
  getDemoTime,
} from "../../lib/demoDateTime";
import {
  getAiPerformanceData,
  getProductionAgent,
  getProductionBatchItems,
  getProductionSummary,
  getInventorySnapshotSummary,
  getAiValidationChatSummary,
  getBenchmarkSnapshot,
  getPromotions,
  getTodaySalesSnapshot,
  getMonthlySales,
  getDeliveryComparison,
  getProductComparison,
  getStoreAvgComparison,
  getDeliveryCountComparison,
  getPromoPerformanceDetail,
} from "../../lib/api";
import {
  DEMO_BENCHMARK_COMPARE_STORES,
  DEMO_PRIMARY_STORE_ID,
  DEMO_PRIMARY_STORE_NAME,
  DEMO_STORE_NAME_MAP,
  resolveDemoStoreName,
} from "../../lib/demoStoreConfig";
import { PRODUCT_CODE_NAME_MAP, resolveProductDisplayName } from "../../lib/productNameResolver";
import {
  BENCHMARK_COMPARE_STORE_OPTIONS,
  getBenchmarkCompareStoreIds,
  setBenchmarkCompareStoreIds,
} from "../../lib/benchmarkCompareStores";

const ENABLE_GOLD_ANALYTICS = false;

type NotificationSettingsData = {
  enabled: boolean;
  muted_categories: string[];
  push_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  is_snoozed?: boolean;
};

interface ActionCard {
  card_type: string;
  title: string;
  body: string;
  actions?: Array<{
    label: string;
    action_type: string;
    api_endpoint: string;
    params?: Record<string, unknown>;
  }>;
}

type ActionCardAction = NonNullable<ActionCard["actions"]>[number];

interface SuggestedQuestion {
  text: string;
  source?: string;
  reason?: string;
}

interface InsightCardRow {
  label: string;
  value?: string;
  current?: number;
  target?: number;
  recommended?: number;
  reason?: string;
  firstProductionInfo?: string;
  secondProductionInfo?: string;
}

interface InsightCard {
  title: string;
  description?: string;
  rows: InsightCardRow[];
  summaryLabel?: string;
  summaryValue?: string;
}

interface ActionButton {
  label: string;
  value: string;
  variant: "primary" | "secondary";
}

interface Message {
  id: string;
  type: "user" | "ai";
  lines: string[];
  markdown?: string;
  time: string;
  actionCards?: ActionCard[];
  suggestedQuestions?: SuggestedQuestion[];
  insightCard?: InsightCard;
  actions?: ActionButton[];
}

interface AiPanelProps {
  isAiPanelOpen: boolean;
  setIsAiPanelOpen: (isOpen: boolean) => void;
  selectedMenu?: string;
  onOpenBriefing: () => void;
}

type NotificationChannel = "in_app" | "push" | "email";
type LocalIntent =
  | "GREETING"
  | "IDENTITY"
  | "GENERAL_HELP"
  | "TERM_EXPLAIN"
  | "SCREEN_GUIDE"
  | "BENCHMARK_SELECT"
  | "SENSITIVE_BLOCKED"
  | "NOTIFICATION_MUTE"
  | "NOTIFICATION_UNMUTE"
  | "NOTIFICATION_STATUS"
  | "PERF_MONTHLY"
  | "PERF_PRODUCT_COMPARE"
  | "PERF_STORE_AVG"
  | "PROMO_RESPONSE"
  | "PROMO_SALES"
  | "PROMO_HOURLY"
  | "PROMO_STORE_COMPARE"
  | "PROMO_ANALYSIS"
  | "CHANCE_LOSS"
  | "MENU_SUMMARY"
  | "SALES_REASON"
  | "NET_SALES_EXPLANATION"
  | "UNKNOWN";

type LocalMenuResponse = {
  lines: string[];
  markdown?: string;
  suggestedQuestions?: SuggestedQuestion[];
  actionCards?: ActionCard[];
  insightCard?: InsightCard;
  actions?: ActionButton[];
  skipIntro?: boolean;
};

type BackendChatResponse = {
  answer?: string;
  content?: string;
  session_id?: string;
  suggested_questions?: Array<string | SuggestedQuestion>;
  action_cards?: ActionCard[];
  path?: string;
  sub_intent?: string;
  settings_data_mode?: string | null;
  settings_operation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> & {
    answer?: string;
    action_cards?: ActionCard[];
    suggested_questions?: Array<string | SuggestedQuestion>;
    path?: string;
    sub_intent?: string;
    settings_data_mode?: string | null;
    settings_operation?: Record<string, unknown> | null;
  };
};

const RAW_API_BASE =
  typeof import.meta.env.VITE_API_BASE_URL === "string"
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : "";
const API_BASE = RAW_API_BASE || "/api";
const STORE_ID = DEMO_PRIMARY_STORE_ID;
const AUTH_HEADERS: Record<string, string> = {
  "X-User-Id": "U001",
  "X-User-Role": "store_owner",
  "X-Store-Id": STORE_ID,
};

const PAGE_CONTEXT: Record<string, string> = {
  "종합 현황": "종합 현황",
  "AI 실시간 현황": "AI 실시간 현황",
  생산관리: "생산관리",
  "발주 관리": "발주 관리",
  프로모션: "프로모션",
  "AI 기반 성과 분석": "AI 기반 성과 분석",
  "AI 검증": "AI 검증",
  벤치마킹: "벤치마킹",
  "알람 설정": "알람 설정",
};

const MENU_TO_CURRENT_PAGE: Record<string, string> = {
  "종합 현황": "/",
  "AI 실시간 현황": "/realtime",
  생산관리: "/actions",
  "발주 관리": "/orders",
  프로모션: "/promotions",
  "AI 기반 성과 분석": "/analytics",
  "AI 검증": "/ai-insights",
  벤치마킹: "/benchmarking",
  "알람 설정": "/alerts",
};

const MENU_TO_PAGE_KEY: Record<string, string> = {
  "종합 현황": "dashboard",
  "AI 실시간 현황": "realtime",
  생산관리: "actions",
  "발주 관리": "orders",
  프로모션: "promotions",
  "AI 기반 성과 분석": "analytics",
  "AI 검증": "ai_insights",
  벤치마킹: "benchmarking",
  "알람 설정": "alerts",
};

const QUICK_CHIPS: Record<string, string[]> = {
  "종합 현황": ["오늘 핵심 이슈 요약해줘", "지금 뭐부터 처리하면 돼?", "AI 추정 순매출이 뭐야?"],
  "AI 실시간 현황": ["긴급 생산 대상 확인", "보충 후보 확인", "미대응 예상 손실 확인"],
  생산관리: ["긴급 생산 대상 확인", "보충 후보 확인", "미대응 예상 손실 확인"],
  "발주 관리": [
    "주문 마감 전 추천 옵션 보여줘",
    "전주/전전주/전월 기준으로 비교해줘",
    "각 옵션의 근거를 보여줘",
    "단체 주문은 제외해서 다시 계산해줘",
    "최종 선택 전에 차이를 요약해줘",
    "지금 어떤 옵션이 가장 안전한지 알려줘",
  ],
  프로모션: ["반응 좋은 행사", "더 준비할 상품", "행사 강한 시간대", "발주 보정 보기"],
  "AI 기반 성과 분석": [
    "월간 매출 비교",
    "글레이즈드 전월 비교",
    "타 점포 평균 비교",
    "반응 좋은 프로모션",
    "프로모션 매출 기여도",
  ],
  "AI 검증": ["이 화면에서 뭘 봐야 해", "각 옵션의 근거를 보여줘", "최종 선택 전에 차이를 요약해줘"],
  벤치마킹: [
    "이번 달 일평균 매출을 타 점포 평균과 비교해줘",
    "나보다 매출 높은데 유사한 매장 알려줘",
  ],
  "알람 설정": ["왜 지금 알림이 떴는지 설명해줘", "알림 꺼줘", "알람 상태 알려줘"],
};

const FOLLOWUP_CHIPS: Record<string, string[]> = {
  PERF_MONTHLY: ["글레이즈드 전월 비교", "타 점포 평균 비교"],
  PERF_PRODUCT_COMPARE: ["월간 매출 비교", "타 점포 평균 비교"],
  PERF_STORE_AVG: ["월간 매출 비교", "글레이즈드 전월 비교"],
  PROMO_RESPONSE: ["더 준비할 상품", "행사 강한 시간대", "발주 보정 보기"],
  PROMO_SALES: ["반응 좋은 행사", "행사 강한 시간대", "발주 보정 보기"],
  PROMO_HOURLY: ["반응 좋은 행사", "발주 보정 보기", "더 준비할 상품"],
  PROMO_STORE_COMPARE: ["반응 좋은 행사", "더 준비할 상품", "행사 강한 시간대"],
  PRODUCTION_DEFAULT: ["1시간 뒤 예상 재고량", "1차/2차 생산 권장량"],
  ORDER_DEFAULT: ["각 옵션의 근거를 보여줘", "최종 선택 전에 차이를 요약해줘"],
};

const DEFAULT_CHIPS = ["너는 뭘 할 수 있어", "니가 뭔데", "이 화면에서 뭘 봐야 해"];

const DELIVERY_CHANNEL_CHIPS: Record<string, string[]> = {
  "AI 기반 성과 분석": ["쿠팡이츠 매출 비중 더 자세히 봐줘", "배달 주문 많은 시간대 알려줘", "배달 매출 높은 상품 알려줘", "지난달 배달 채널과 비교해줘"],
  "종합 현황": ["쿠팡이츠 매출 비중 더 자세히 봐줘", "배달 주문 많은 시간대 알려줘", "배달 매출 높은 상품 알려줘", "지난달 배달 채널과 비교해줘"],
  DEFAULT: ["쿠팡이츠 매출 비중 더 자세히 봐줘", "배달 주문 많은 시간대 알려줘", "배달 매출 높은 상품 알려줘"],
};

/**
 * 백엔드가 실수로 JSON 문자열을 반환할 경우 사람이 읽는 문장으로 변환한다.
 * JSON이 아닌 일반적인 텍스트는 그대로 반환한다.
 */
function formatBackendAnswer(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  const trimmed = raw.trim();

  // JSON으로 보이지 않으면 그대로 반환
  if (!trimmed.startsWith("{")) return trimmed;

  // JSON.parse 시도
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 중괄호 내에 있는 JSON 객체만 추출
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return trimmed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return trimmed;
    }
  }

  // JSON 구조가 아니면 그대로 반환
  if (typeof parsed !== "object" || Array.isArray(parsed)) return trimmed;

  const analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";
  const rootCauses = Array.isArray(parsed.root_causes) ? parsed.root_causes : [];
  const actions = Array.isArray(parsed.actions) || Array.isArray(parsed.recommendations)
    ? (Array.isArray(parsed.actions) ? parsed.actions : parsed.recommendations)
    : [];

  const lines: string[] = [];

  // 핵심 요약 1~2문장
  if (analysis) {
    lines.push(truncateSentence(analysis, 80));
  }

  // 이유 1문장
  if (rootCauses.length > 0) {
    const cause = typeof rootCauses[0] === "string" ? rootCauses[0] : "";
    if (cause) lines.push(truncateSentence(cause, 80));
  }

  // 지금 할 일 1문장
  if (actions.length > 0) {
    const action = typeof actions[0] === "string" ? actions[0] : "";
    if (action) lines.push(truncateSentence(action, 80));
  }

  // 최대 4줄
  return (lines.length > 0 ? lines.slice(0, 4) : [trimmed.slice(0, 200)]).join("\n");
}

function truncateSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const sentenceEnd = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("입니다"), cut.lastIndexOf("습니다"), cut.lastIndexOf("요"));
  if (sentenceEnd > maxChars * 0.5) {
    return cut.slice(0, sentenceEnd + 1);
  }
  return cut + "...";
}

function buildProductionCardActions(): ActionButton[] {
  return [
    { label: "생산 등록", value: "production", variant: "primary" as const },
    { label: "나중에", value: "later", variant: "secondary" as const },
  ];
}

function buildOrderCardActions(): ActionButton[] {
  return [
    { label: "부족 발주 진행", value: "order", variant: "primary" as const },
    { label: "나중에", value: "later", variant: "secondary" as const },
  ];
}

const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  inventory: "재고",
  order: "주문",
  actions: "할일",
  analytics: "매출",
  production: "생산",
  general: "일반",
};

const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "앱 내",
  push: "푸시",
  email: "이메일",
};

const NOTIFICATION_CHANNEL_FIELDS: Record<
  NotificationChannel,
  keyof NotificationSettingsData
> = {
  in_app: "in_app_enabled",
  push: "push_enabled",
  email: "email_enabled",
};

const ROUTE_TO_MENU: Record<string, string> = {
  "/": "종합 현황",
  "/realtime": "AI 실시간 현황",
  "/actions": "생산관리",
  "/orders": "발주 관리",
  "/analytics": "AI 기반 성과 분석",
  "/ai-insights": "AI 검증",
  "/promotions": "프로모션",
  "/benchmarking": "벤치마킹",
  "/alerts": "알람 설정",
};



const ALLOWED_ACTION_ENDPOINT_PREFIXES = [
  "/api/order/confirm",
  "/api/v1/actions/todos/",
  "/api/production/register",
  "/api/modal/",
] as const;

function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${appendDemoQueryParams(normalized, {
    includeBizDate: true,
    includeDemoTime: true,
    includeDemoDateTime: true,
  })}`;
}

function now() {
  const d = new Date(getDemoDateTimeState().timestamp);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sanitizeLines(lines: string[]) {
  return lines
    .map((line) =>
      line
        .replace(/\r/g, "")
        .replace(/##\s*/g, "")
        .replace(/###\s*/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim(),
    )
    .filter(Boolean);
}

function formatKrw(value: number | null | undefined) {
  return `₩${Math.round(Number(value ?? 0)).toLocaleString("ko-KR")}`;
}

function formatCount(value: number | null | undefined) {
  return Math.round(Number(value ?? 0)).toLocaleString("ko-KR");
}

function formatSignedPct(value: number | null | undefined, digits = 1) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "-";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(digits)}%`;
}

function formatMonthLabel(month: string | null | undefined) {
  const raw = String(month ?? "").trim();
  const [year, mon] = raw.split("-");
  if (!year || !mon) return raw;
  return `${year}년 ${Number(mon)}월`;
}

function joinCompact(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(" · ");
}

function formatBurnRate(value: number | null | undefined): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return `${numeric.toFixed(1)}개/시간`;
}

function getStockDisplay(rawValue: number | null | undefined) {
  const numeric = Number(rawValue ?? 0);
  const currentCount = Math.max(0, Math.round(numeric));
  const shortage = Math.max(0, Math.round(-numeric));
  return {
    currentCount,
    shortage,
    currentLabel: `${formatCount(currentCount)}개`,
    badgeLabel: shortage > 0 ? `부족 ${formatCount(shortage)}개` : `${formatCount(currentCount)}개`,
  };
}

function hasMeaningfulProductName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 1 && normalized !== "B" && normalized !== "미분류";
}

function toSuggestedQuestions(values: string[]) {
  return values.map((text) => ({ text }));
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

async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      ...AUTH_HEADERS,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API ${path} ${response.status}`);
  }
  const json = await response.json();
  return unwrapApiData<T>(json);
}

function uniqueStrings(values: unknown[]): string[] {
  const result: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized || result.includes(normalized)) return;
    result.push(normalized);
  });
  return result;
}

function normalizeNotificationCategories(operation: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...(Array.isArray(operation?.resolved_categories) ? operation.resolved_categories : []),
    ...(Array.isArray(operation?.categories) ? operation.categories : []),
  ]).map((value) => {
    const lowered = value.toLowerCase();
    return lowered in NOTIFICATION_CATEGORY_LABELS ? lowered : value;
  });
}

function normalizeNotificationChannels(
  operation: Record<string, unknown>,
): NotificationChannel[] {
  return uniqueStrings([
    ...(Array.isArray(operation?.resolved_channels) ? operation.resolved_channels : []),
    ...(Array.isArray(operation?.channels) ? operation.channels : []),
  ])
    .map((value) => {
      const normalized = value.toLowerCase().replace(/[\s-]/g, "_");
      if (normalized === "앱내" || normalized === "앱_내" || normalized === "인앱") {
        return "in_app";
      }
      if (normalized === "push" || normalized === "푸시") return "push";
      if (normalized === "email" || normalized === "이메일" || normalized === "메일") {
        return "email";
      }
      if (normalized === "in_app") return "in_app";
      return null;
    })
    .filter((value): value is NotificationChannel => Boolean(value));
}

function describeNotificationState(settings: NotificationSettingsData): string {
  if (settings.is_snoozed) {
    return "현재 알림이 일시 중지되어 있습니다.";
  }
  const disabledChannels = (
    Object.entries(NOTIFICATION_CHANNEL_FIELDS) as Array<
      [NotificationChannel, keyof NotificationSettingsData]
    >
  )
    .filter(([, field]) => !settings[field])
    .map(([channel]) => NOTIFICATION_CHANNEL_LABELS[channel]);
  const mutedCategories = (settings.muted_categories || []).map(
    (category) => NOTIFICATION_CATEGORY_LABELS[category] || category,
  );
  if (
    !settings.enabled &&
    !settings.in_app_enabled &&
    !settings.push_enabled &&
    !settings.email_enabled
  ) {
    return "현재 모든 알림이 꺼져 있습니다.";
  }
  if (disabledChannels.length > 0 || mutedCategories.length > 0) {
    return `현재 일부 알림이 꺼져 있습니다. (${[...disabledChannels, ...mutedCategories].join(", ")})`;
  }
  return "현재 모든 알림이 켜져 있습니다.";
}

function buildNotificationPatch(
  current: NotificationSettingsData,
  subIntent: string,
  categories: string[],
  channels: NotificationChannel[],
  durationMinutes: number | null,
) {
  const next = {
    enabled: current.enabled,
    muted_categories: [...(current.muted_categories || [])],
    push_enabled: current.push_enabled,
    email_enabled: current.email_enabled,
    in_app_enabled: current.in_app_enabled,
  };
  let snoozeMinutes: number | null | undefined = undefined;
  const isAllTarget = categories.length === 0 && channels.length === 0;

  if (subIntent === "NOTIFICATION_UNMUTE") {
    next.enabled = true;
    next.muted_categories = next.muted_categories.filter(
      (category) => !categories.includes(category),
    );
    if (isAllTarget) {
      next.muted_categories = [];
      next.in_app_enabled = true;
      next.push_enabled = true;
      next.email_enabled = true;
      snoozeMinutes = 0;
    }
    channels.forEach((channel) => {
      const field = NOTIFICATION_CHANNEL_FIELDS[channel];
      next[field] = true;
    });
  } else {
    if (isAllTarget) {
      if (durationMinutes !== null && durationMinutes > 0) {
        next.enabled = true;
        snoozeMinutes = durationMinutes;
      } else {
        next.enabled = false;
        next.in_app_enabled = false;
        next.push_enabled = false;
        next.email_enabled = false;
        snoozeMinutes = 0;
      }
    } else {
      next.muted_categories = Array.from(
        new Set([...next.muted_categories, ...categories]),
      );
      channels.forEach((channel) => {
        const field = NOTIFICATION_CHANNEL_FIELDS[channel];
        next[field] = false;
      });
      if (durationMinutes !== null && durationMinutes > 0) {
        snoozeMinutes = durationMinutes;
      }
    }
  }

  if (!next.in_app_enabled && !next.push_enabled && !next.email_enabled) {
    next.enabled = false;
  } else if (subIntent === "NOTIFICATION_UNMUTE" && (isAllTarget || channels.length > 0)) {
    next.enabled = true;
  }

  return {
    enabled: next.enabled,
    muted_categories: next.muted_categories,
    push_enabled: next.push_enabled,
    email_enabled: next.email_enabled,
    in_app_enabled: next.in_app_enabled,
    ...(snoozeMinutes !== undefined ? { snooze_minutes: snoozeMinutes } : {}),
  };
}

function matchesNotificationExpectation(
  verified: NotificationSettingsData,
  subIntent: string,
  categories: string[],
  channels: NotificationChannel[],
  durationMinutes: number | null,
) {
  const isAllTarget = categories.length === 0 && channels.length === 0;
  if (subIntent === "NOTIFICATION_STATUS") return true;
  if (subIntent === "NOTIFICATION_UNMUTE") {
    if (isAllTarget) {
      return (
        verified.enabled &&
        verified.in_app_enabled &&
        verified.push_enabled &&
        verified.email_enabled &&
        (verified.muted_categories || []).length === 0 &&
        !verified.is_snoozed
      );
    }
    return (
      categories.every((category) => !(verified.muted_categories || []).includes(category)) &&
      channels.every((channel) => Boolean(verified[NOTIFICATION_CHANNEL_FIELDS[channel]]))
    );
  }
  if (isAllTarget) {
    if (durationMinutes !== null && durationMinutes > 0) {
      return Boolean(verified.is_snoozed);
    }
    return (
      !verified.enabled &&
      !verified.in_app_enabled &&
      !verified.push_enabled &&
      !verified.email_enabled
    );
  }
  return (
    categories.every((category) => (verified.muted_categories || []).includes(category)) &&
    channels.every((channel) => !verified[NOTIFICATION_CHANNEL_FIELDS[channel]])
  );
}

function notificationTargetLabel(categories: string[], channels: NotificationChannel[]) {
  return [
    ...channels.map((channel) => NOTIFICATION_CHANNEL_LABELS[channel]),
    ...categories.map((category) => NOTIFICATION_CATEGORY_LABELS[category] || category),
  ].join(", ");
}

function buildNotificationResultLines(
  verified: NotificationSettingsData,
  subIntent: string,
  categories: string[],
  channels: NotificationChannel[],
  durationMinutes: number | null,
) {
  const reflected = matchesNotificationExpectation(
    verified,
    subIntent,
    categories,
    channels,
    durationMinutes,
  );
  const isAllTarget = categories.length === 0 && channels.length === 0;
  const targetLabel = notificationTargetLabel(categories, channels);

  if (!reflected) {
    return addGroundingAndAction(
      [
        subIntent === "NOTIFICATION_UNMUTE"
          ? "일부 알림만 다시 켜졌습니다."
          : "일부 알림만 꺼졌습니다.",
        describeNotificationState(verified),
      ],
      "notification settings 저장값 재조회",
      "알람 설정 화면에서 실제 저장 상태를 다시 확인하세요.",
    );
  }
  if (subIntent === "NOTIFICATION_STATUS") {
    return addGroundingAndAction(
      [describeNotificationState(verified)],
      "notification settings 저장값",
      "시연 중 불필요한 채널이나 카테고리를 조정하세요.",
    );
  }
  if (subIntent === "NOTIFICATION_UNMUTE") {
    return addGroundingAndAction(
      [isAllTarget ? "모든 알림을 다시 켰습니다." : `${targetLabel} 알림을 다시 켰습니다.`],
      "notification settings 저장값 재조회",
      "필요한 알림만 유지하고 나머지는 카테고리별로 조정하세요.",
    );
  }
  if (isAllTarget) {
    return addGroundingAndAction(
      durationMinutes !== null && durationMinutes > 0
        ? [`모든 알림을 ${durationMinutes}분간 일시 중지했습니다.`]
        : ["모든 알림을 껐습니다."],
      "notification settings 저장값 재조회",
      "시연 중 필요한 알림만 다시 켜서 상태를 확인하세요.",
    );
  }
  return addGroundingAndAction(
    [`${targetLabel} 알림을 껐습니다.`],
    "notification settings 저장값 재조회",
    "다른 채널이나 카테고리도 함께 조정할지 확인하세요.",
  );
}

function cleanPromoName(raw: string | null | undefined): string {
  if (!raw) return "프로모션";
  return raw
    .replace(/^[A-Z]+\)\s*/, "")
    .replace(/20[12]\d\s*년\s*/g, "")
    .replace(/\d{2}년\s*/g, "")
    .replace(/20[12]\d\.\d{2}\.\d{2}/g, "")
    .trim()
    .replace(/^\s*[\-\s]+\s*/, "")
    .trim() || "프로모션";
}

function classifyLocalIntent(message: string): LocalIntent {
  const lower = message.toLowerCase().trim();
  if (/(token|secret|password|env|environment|database url|db url|system prompt|시스템 프롬프트|api key|access key|secret key|store_001|hidden store|비활성 점포)/.test(lower)) {
    return "SENSITIVE_BLOCKED";
  }
  if (
    /^(안녕|안녕하세요|ㅎㅇ)(?:$|[\s!?.~]+)/.test(lower) ||
    /^(hello|hi)(?:$|[\s!?.~]+)/.test(lower)
  ) {
    return "GREETING";
  }
  if (/넌 누구|누구야|니가 뭔데|너가 뭔데|정체|자기소개/.test(lower)) return "IDENTITY";
  if (/뭘 할 수 있어|무엇을 할 수 있어|도와줄 수 있어|도움말|뭐해줄수|할 수 있는 게 뭐야/.test(lower)) {
    return "GENERAL_HELP";
  }
  if (/(벤치마킹(이)?\s*(뭐|뭔데)|벤치마크가 뭐|프로모션(이)?\s*(뭐|뭔데)|캠페인(이)?\s*(뭐|뭔데)|ai 검증(이)?\s*(뭐|뭔데)|성과 분석(이)?\s*(뭐|뭔데))/.test(lower)) {
    return "TERM_EXPLAIN";
  }
  if (/(이 화면|여기서|지금 화면).*(뭘|무엇|어떤).*(봐|보면|확인|중요)|이 화면에서 뭘 봐야/.test(lower)) {
    return "SCREEN_GUIDE";
  }
  if (/(비교 매장|비교군|비교 매장 선택|매장 선택|비교해줘|비교로 바꿔|추가해줘|빼줘).*(안양시01|고양시02|성남시01|수원시01|마포구01|마포구02|강서구01|노원구01)/.test(lower)) {
    return "BENCHMARK_SELECT";
  }
  if (/알림.*상태|알람.*상태/.test(lower)) return "NOTIFICATION_STATUS";
  if (/(알림|알람).*(다시 켜|켜줘|활성화)/.test(lower)) return "NOTIFICATION_UNMUTE";
  if (/(알림|알람).*(꺼줘|끄기|중지|mute)/.test(lower)) return "NOTIFICATION_MUTE";

  if (/(최근.*월간.*매출|월간.*매출.*비교|최근 월간 매출 비교|최근 월간 비교|26년 2월.*26년 1월|2월.*1월.*매출)/.test(lower)) {
    return "PERF_MONTHLY";
  }
    if (/(글레이즈드|glazed).*(전월|지난달).*매출|글레이즈드.*비교/.test(lower)) {
      return "PERF_PRODUCT_COMPARE";
    }
    if (/(일평균 매출|타 점포 평균|점포 평균과 비교|최근 30일.*평균).*(비교|알려)/.test(lower)) {
      return "PERF_STORE_AVG";
    }
    if (/순매출|net\s*sales/.test(lower)) {
      return "NET_SALES_EXPLANATION";
    }

    if (/매출.*(낮은|하락|떨어졌|부진).*이유|이유.*매출.*(낮|하락|떨어)|매출.*(원인|부진).*분석|왜.*매출.*(떨어|낮)/.test(lower)) return "SALES_REASON";
    if (/(d[-\s.]?day|디\s*데이|디데이|다대아|디대이|프로모션|캠페인|행사|이벤트|네이버\s*페이|네이버페이).*(성과|효과|어땠|어때|전체|비교|대비|매출|기여|반응|높은\s*순서|좋은|알려|보여)/.test(lower)) return "PROMO_ANALYSIS";
    if (/반응.*좋은|반응.*프로모션|좋은.*프로모션|반응.*좋은.*행사|좋은.*행사.*알려/.test(lower)) return "PROMO_RESPONSE";
    if (/매출.*기여|기여도|프로모션.*매출|발주.*(보정|바꾸)|더 준비할|준비할.*상품/.test(lower)) return "PROMO_SALES";
    if (/시간대별.*프로모션|시간대별.*강한|강한.*프로모션|강한.*시간대|행사.*강한.*시간대|몇 시에.*효과/.test(lower)) return "PROMO_HOURLY";
   if (/점포.*차이|점포.*성과|다른.*점포|강서구01.*차이|점포.*비교.*프로모션/.test(lower)) return "PROMO_STORE_COMPARE";
  if (/기회손실|손실/.test(lower)) return "CHANCE_LOSS";
  if (/오늘 요약|핵심 이슈|이 화면|지금 상태|요약해줘|정리해줘/.test(lower)) {
    return "MENU_SUMMARY";
  }
  return "UNKNOWN";
}

function addGroundingAndAction(lines: string[], grounding: string, action: string) {
  const normalized = sanitizeLines(lines);
  const groundingLine = grounding.startsWith("근거:") ? grounding : `근거: ${grounding}`;
  const actionLine = action.startsWith("지금 할 일:") ? action : `지금 할 일: ${action}`;
  return [...normalized, groundingLine, actionLine];
}

function latestComparableMonths<T extends { month?: string | null }>(items: T[]) {
  const currentMonth = getDemoDateTimeState().date.slice(0, 7);
  const filtered = items.filter((item) => item?.month && item.month !== currentMonth);
  if (filtered.length >= 2) return filtered.slice(-2);
  return items.slice(-2);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function extractMetricMap(
  sections: Array<{ type?: string; title?: string | null; data?: unknown; text?: string | null; items?: string[] | null }>,
) {
  const metricsSection = sections.find((section) => section.type === "metrics");
  const metrics = Array.isArray(metricsSection?.data)
    ? (metricsSection?.data as Array<{ label?: string; value?: string; change_pct?: number | null }>)
    : [];
  return new Map(metrics.map((item) => [String(item.label ?? ""), item]));
}

function extractActionItems(
  sections: Array<{ type?: string; title?: string | null; data?: unknown; text?: string | null; items?: string[] | null }>,
) {
  const actionSection = sections.find((section) => section.type === "action");
  return Array.isArray(actionSection?.items) ? actionSection.items.filter(Boolean) : [];
}

function isGenericBackendAnswer(lines: string[] | null | undefined) {
  if (!lines || lines.length === 0) return true;
  const joined = lines.join(" ").trim();
  return (
    joined === "분석 결과를 텍스트로 요약했습니다." ||
    joined === "자동 인사이트 생성에 실패해 연결된 자료만 제공합니다." ||
    joined === "죄송합니다. 현재 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

function findMentionedBenchmarkStoreIds(message: string) {
  const matches = BENCHMARK_COMPARE_STORE_OPTIONS.filter(
    (store) => message.includes(store.storeName) || message.includes(store.storeId),
  ).map((store) => store.storeId);
  return Array.from(new Set(matches));
}

function shouldPreferLocalOnly(intent: LocalIntent) {
  if (
    intent === "GREETING" ||
    intent === "IDENTITY" ||
    intent === "GENERAL_HELP" ||
    intent === "TERM_EXPLAIN" ||
    intent === "SCREEN_GUIDE" ||
    intent === "BENCHMARK_SELECT" ||
    intent === "SENSITIVE_BLOCKED" ||
    intent === "NOTIFICATION_MUTE" ||
    intent === "NOTIFICATION_UNMUTE" ||
    intent === "NOTIFICATION_STATUS" ||
    intent === "SALES_REASON" ||
    intent === "NET_SALES_EXPLANATION"
  ) {
    return true;
  }
  return false;
}

function isDeliveryCountAnalysisQuestion(message: string) {
  const lower = message.toLowerCase();
  const hasDelivery = /(배달|딜리버리|쿠팡|쿠팡이츠|배민|해피오더|bm1)/.test(lower);
  if (!hasDelivery) return false;
  return /(건\s*수|건수|주문\s*건\s*수|주문건수|주문\s*수|전\s*월|전월|지난\s*달|전\s*주|전주|지난\s*주|채널\s*별|채널별|비교|대비)/.test(lower);
}

function shouldPreferSalesQueryFirst(selectedMenu: string, message: string, intent: LocalIntent) {
  if (isDeliveryCountAnalysisQuestion(message)) return true;
  if (intent === "PERF_STORE_AVG") return selectedMenu === "종합 현황" || selectedMenu === "AI 기반 성과 분석";
  if (intent === "PROMO_ANALYSIS") return true;
  if (intent !== "UNKNOWN" && intent !== "PERF_PRODUCT_COMPARE") return false;
  const lower = message.toLowerCase();
  if (/(d[-\s.]?day|디\s*데이|디데이|프로모션|캠페인|행사|이벤트|네이버\s*페이|네이버페이).*(성과|효과|어땠|어때|전체|비교|매출|기여|반응|높은\s*순서)/.test(lower)) {
    return true;
  }
  if (intent === "PERF_PRODUCT_COMPARE") return true;
  const isSalesComparison =
    /(비교|전주|전 월|전월|전년|2월|이번 달|일평균|채널|배달 건 수|매출 금액|글레이즈드)/.test(
      lower,
    ) && /(매출|배달|채널|상품|평균)/.test(lower);
  if (!isSalesComparison) return false;
  return (
    selectedMenu === "종합 현황" ||
    selectedMenu === "AI 기반 성과 분석"
  );
}

function buildNavigationCard(title: string, body: string, route: string): ActionCard {
  return {
    card_type: "navigation",
    title,
    body,
    actions: [
      {
        label: "화면 열기",
        action_type: "navigate",
        api_endpoint: route,
        params: { route },
      },
    ],
  };
}

function buildInitialMessage(menu: string): Message {
  const demoLabel = getDemoDateTimeLabel();
  const shortLabel = menu === "AI 기반 성과 분석" ? "성과 분석" : menu;
  return {
    id: `welcome-${menu}`,
    type: "ai",
    lines: [
      `${demoLabel} 기준 ${shortLabel} 데이터입니다.`,
      "추천 질문을 눌러 확인해 주세요.",
    ],
    time: now(),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS[menu] ?? DEFAULT_CHIPS),
  };
}

async function fetchChat(
  message: string,
  selectedMenu: string,
  sessionId?: string,
  recentMessages: Message[] = [],
): Promise<BackendChatResponse> {
  const demo = getDemoDateTimeState();
  const pageContext = PAGE_CONTEXT[selectedMenu] ?? selectedMenu;
  return requestJson<BackendChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({
      store_id: STORE_ID,
      message,
      session_id: sessionId,
      context: {
        page: pageContext,
        menu: selectedMenu,
        current_page: MENU_TO_CURRENT_PAGE[selectedMenu] ?? "/",
        page_context: pageContext,
        page_key: MENU_TO_PAGE_KEY[selectedMenu] ?? "dashboard",
        store_name: DEMO_PRIMARY_STORE_NAME,
        demo_date: demo.date,
        demo_time: demo.time,
        demo_datetime: demo.iso,
        recent_client_messages: recentMessages.slice(-6).map((item) => ({
          role: item.type === "user" ? "user" : "assistant",
          content: item.lines.join("\n"),
        })),
        benchmark_compare_store_ids: getBenchmarkCompareStoreIds(),
        benchmark_compare_store_names: getBenchmarkCompareStoreIds().map((storeId) =>
          resolveDemoStoreName(storeId, storeId),
        ),
      },
    }),
  });
}

async function fetchSalesQuery(message: string) {
  const demo = getDemoDateTimeState();
  return requestJson<{
    intent?: string;
    title?: string;
    sections?: Array<{
      type?: string;
      title?: string | null;
      data?: unknown;
      text?: string | null;
      items?: string[] | null;
    }>;
    sources?: Array<{ type?: string; description?: string; data_range?: string; freshness?: string }>;
    metadata?: Record<string, unknown>;
  }>("/v1/sales/query", {
    method: "POST",
    body: JSON.stringify({
      store_id: STORE_ID,
      query: message,
      demo_date: demo.date,
      demo_time: demo.time,
    }),
  });
}

async function getNotificationSettings() {
  return requestJson<NotificationSettingsData>(`/v1/notification-settings/${STORE_ID}`);
}

async function updateNotificationSettings(body: Record<string, unknown>) {
  return requestJson<NotificationSettingsData>(`/v1/notification-settings/${STORE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function navigateToRoute(route: string | undefined) {
  const normalized = String(route || "").trim();
  if (!normalized) return;
  const menu = ROUTE_TO_MENU[normalized];
  if (menu) {
    window.dispatchEvent(new CustomEvent("navigate-menu", { detail: menu }));
  }
}

async function executeActionCard(action: ActionCardAction) {
  const normalizedAction = String(action.action_type || "").trim().toLowerCase();
  const params = action.params || {};

  if (normalizedAction === "navigate" || normalizedAction === "modify") {
    return {
      message: "관련 화면으로 이동합니다.",
      route: String(params.route || action.api_endpoint || "/"),
    };
  }

  if (action.api_endpoint?.startsWith("/api/")) {
    const isAllowed = ALLOWED_ACTION_ENDPOINT_PREFIXES.some((prefix) =>
      action.api_endpoint.startsWith(prefix),
    );
    if (!isAllowed) {
      throw new Error("허용되지 않은 액션입니다.");
    }
    const payload = await requestJson<Record<string, unknown>>(action.api_endpoint.replace(/^\/api/, ""), {
      method: "POST",
      body: JSON.stringify(params),
    });
    const route =
      String(params.route || "") ||
      (normalizedAction === "order_confirm"
        ? "/orders"
        : normalizedAction === "production_register"
          ? "/realtime"
          : normalizedAction.startsWith("todo_")
            ? "/actions"
            : "/");
    return {
      message: String((payload as { message?: string }).message || "작업을 처리했습니다."),
      route,
    };
  }

  return {
    message: "관련 화면으로 이동합니다.",
    route: String(params.route || action.api_endpoint || "/"),
  };
}

function normalizeSuggestedQuestions(values: Array<string | SuggestedQuestion> | undefined) {
  return (values || [])
    .map((item) => (typeof item === "string" ? { text: item } : item))
    .filter((item): item is SuggestedQuestion => Boolean(item?.text?.trim()));
}

function buildTermExplainResponse(selectedMenu: string, message: string): LocalMenuResponse {
  const lower = message.toLowerCase();
  if (/벤치마킹/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          "벤치마킹은 우리 매장과 비교 매장의 매출, 시간대, 상위 상품, 결제 비중을 함께 보는 기능입니다.",
          `${DEMO_PRIMARY_STORE_NAME}을 기준으로 더 잘하는 매장을 찾고, 무엇이 다른지 설명합니다.`,
        ],
        "실적 집계 점포 31개와 현재 선택된 비교 매장 데이터를 사용합니다.",
        "시간대가 비슷한 매장과 상위 상품 구성이 다른 지점을 먼저 비교해 보세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["벤치마킹"]),
    };
  }
  if (/프로모션|캠페인/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          "프로모션 화면은 프로모션 전용 실측이 아니라 프로모션 실적 기반 성과와 적용 시뮬레이션을 함께 보여줍니다.",
          "최근 반응이 좋았던 프로모션과 적용 전후 예상 차이를 같이 확인하도록 구성했습니다.",
        ],
        "실시간 판매 데이터 기반 최근 집계와 파생 시뮬레이션을 함께 사용합니다.",
        "성과 높은 프로모션 1건과 관찰 필요 프로모션 1건을 골라 적용 전후 차이를 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["프로모션"]),
    };
  }
  return {
    lines: addGroundingAndAction(
      [
        "이 화면은 현재 메뉴 데이터와 AI 요약을 함께 보는 운영 보조 화면입니다.",
        "질문이 화면 의미 설명이면 개념을 먼저 답하고, 실데이터 질문이면 현재 기준값으로 계산합니다.",
      ],
      "현재 메뉴 컨텍스트와 선택한 기준 일시를 함께 사용합니다.",
      "궁금한 메뉴 이름이나 지표를 직접 물어보면 해당 기준으로 다시 설명드리겠습니다.",
    ),
  };
}

function buildScreenGuideResponse(selectedMenu: string): LocalMenuResponse {
  const guides: Record<string, { focus: string; action: string }> = {
    "종합 현황": {
      focus: "오늘 매출, 기회손실, 발주 마감, 추천 액션을 먼저 보시면 됩니다.",
      action: "기회손실이 큰 상품과 마감 임박 항목부터 확인하세요.",
    },
    "AI 실시간 현황": {
      focus: "생산, 주문, 상품 성과를 각각 다른 에이전트 관점으로 보시면 됩니다.",
      action: "생산 부족 품목 → 발주 마감 → 상위 상품 순서로 확인하세요.",
    },
    생산관리: {
      focus: "현재 보유, 1시간 뒤 예상, 부족 수량, 권장 생산 수량을 함께 보시면 됩니다.",
      action: "부족 수량이 큰 품목부터 1차 생산 등록 여부를 확인하세요.",
    },
    "발주 관리": {
      focus: "전주/전전주/전월 기준 3개 추천 옵션과 마감 상태를 함께 보시면 됩니다.",
      action: "15시 마감 전 옵션 차이를 보고 점주 최종 선택을 확정하세요.",
    },
    프로모션: {
      focus: "성과 높은 프로모션, 관찰 필요 프로모션, 적용 전후 예상 차이를 먼저 보시면 됩니다.",
      action: "적용 전후 증분 매출이 큰 프로모션부터 검토하세요.",
    },
    "AI 기반 성과 분석": {
      focus: "시간대별 매출, 상위 상품, 결제 비중을 보시면 됩니다.",
      action: "하락 구간과 상위 상품 재고를 함께 확인하세요.",
    },
    "AI 검증": {
      focus: "상단 검증 카드에서 위험한 항목을 보고, 하단 품질 지표와 Agent 로그를 같이 확인하시면 됩니다.",
      action: "신뢰도가 낮은 검증 카드의 원인을 먼저 확인하세요.",
    },
    벤치마킹: {
      focus: "우리 매장과 비교 매장의 매출 격차, 피크 시간, 상위 상품 차이를 먼저 보면 됩니다.",
      action: "유사한데 더 잘하는 매장을 골라 차이를 확인하세요.",
    },
    "알람 설정": {
      focus: "전체/채널/카테고리별 알림 ON/OFF 상태를 보면 됩니다.",
      action: "시연 중 불필요한 알림이 있으면 카테고리별로 조정하세요.",
    },
  };
  const guide = guides[selectedMenu] ?? guides["종합 현황"];
  return {
    lines: addGroundingAndAction(
      [`${selectedMenu} 화면에서는 ${guide.focus}`],
      "현재 선택된 메뉴와 기준 일시를 기준으로 안내합니다.",
      guide.action,
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
  };
}

async function buildSalesQueryResponse(message: string, selectedMenu: string): Promise<LocalMenuResponse | null> {
  try {
    const result = await fetchSalesQuery(message);
    const sections = result.sections ?? [];
    const metrics = extractMetricMap(sections);
    const insightText =
      sections.find((section) => section.type === "insight" && section.title === "요약")?.text ??
      sections.find((section) => section.type === "text")?.text ??
      sections.find((section) => section.type === "insight")?.text ??
      "연결된 자료 기준으로 비교를 정리했습니다.";
    const actions = extractActionItems(sections);
    const isPromoSalesAnalysis =
      result.intent === "PROMO_ANALYSIS" ||
      String(result.metadata?.analysis_type ?? "") === "promotion_sales";
    const isDirectBackendAnalysis =
      isPromoSalesAnalysis ||
      DIRECT_BACKEND_ANALYSIS_INTENTS.has(String(result.intent ?? ""));
    if (isDirectBackendAnalysis) {
      const benchmarkCountMatch = (insightText || "").match(/(\d+)개\s*(?:전체\s*)?비교\s*점포|(\d+)개\s*중|전체\s*(\d+)개\s*비교\s*점포/);
      const benchmarkCount = benchmarkCountMatch
        ? (benchmarkCountMatch[1] || benchmarkCountMatch[2] || benchmarkCountMatch[3])
        : "";
      const grounding =
        result.intent === "BENCHMARK"
          ? benchmarkCount
            ? `${benchmarkCount}개 비교 점포 평균 기준`
            : "전체 비교 점포 평균 기준"
          :
        String(result.metadata?.grounding ?? "") ||
        result.sources?.[0]?.description ||
        "실적 기반 자료 기준";
      const directLines = sanitizeLines(
        (insightText || "연결된 자료 기준으로 분석했습니다.").split("\n"),
      );
      const firstAction = actions[0];
      if (
        firstAction &&
        !directLines.some((line) => line.includes(firstAction.slice(0, 20)))
      ) {
        directLines.push(`다음 액션: ${firstAction}`);
      }
      directLines.push(grounding.startsWith("근거:") ? grounding : `근거: ${grounding}`);
      return {
        lines: directLines,
        suggestedQuestions: getAnalysisSuggestedQuestions(result.intent, message, selectedMenu),
        actionCards: [],
      };
    }
    const lines = [`${getDemoDateTimeLabel()} 기준 ${selectedMenu} 질의 결과입니다.`];
    if (metrics.size > 0) {
      const metricLines = Array.from(metrics.values())
        .slice(0, 3)
        .map((metric) => `${metric.label}: ${metric.value}${metric.change_pct != null ? ` (${metric.change_pct > 0 ? "+" : ""}${metric.change_pct.toFixed(1)}%)` : ""}`);
      lines.push(...metricLines);
    }
    lines.push(insightText || "분석 결과를 정리했습니다.");
    return {
      lines: addGroundingAndAction(
        lines,
        result.sources?.[0]?.description || "실적 기반 조회",
        actions[0] || "관련 화면에서 세부 지표와 영향 상품을 추가로 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
    };
  } catch {
    return null;
  }
}

async function buildSalesReasonResponse(message: string): Promise<LocalMenuResponse | null> {
  try {
    const demoLabel = getDemoDateTimeLabel();
    const salesSummary: {
      today_revenue?: number;
      vs_yesterday_same_time_pct?: number;
      top_selling?: Array<{ product_name?: string; qty?: number; revenue?: number }>;
    } | null = await requestJson("/home/sales-summary").catch(() => null);

    if (!salesSummary) return null;

    const vsPct = Number(salesSummary.vs_yesterday_same_time_pct ?? 0);
    const topItem = (salesSummary.top_selling ?? []).find(
      (item) => hasMeaningfulProductName(item.product_name) && (item.qty ?? 0) > 0
    ) ?? null;
    const isDown = vsPct < 0;

    const lines: string[] = [
      `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME} 매출 현황입니다.`,
      isDown
        ? `전일 동시간 대비 매출이 ${vsPct.toFixed(1)}% 감소했습니다.`
        : `전일 동시간 대비 매출이 ${vsPct > 0 ? "+" : ""}${vsPct.toFixed(1)}%입니다.`,
    ];

    if (topItem) {
      lines.push(`상위 상품은 ${resolveProductDisplayName(topItem.product_name)} ${formatCount(topItem.qty)}개입니다.`);
    } else {
      lines.push("현재 시간대별 판매 흐름을 다시 확인하세요.");
    }

    return {
      lines: addGroundingAndAction(
        lines,
        "sales-summary API (전일 동시간比对)",
        "실시간 현황 화면에서 시간대별 판매 흐름과 주요 품목 소진 여부를 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
    };
  } catch {
    return null;
  }
}

async function buildDashboardResponse(message: string): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const lower = message.toLowerCase();
  const [salesSummary, prodSummary, invItems, snapSummary, deadlines, orderOptions] = await Promise.all([
    requestJson<{
      today_revenue?: number;
      cumulative_revenue_until?: number | null;
      vs_yesterday_same_time_pct?: number;
      vs_last_week_same_day_pct?: number;
      profitability?: { gross_profit_margin_pct?: number | null } | null;
    }>("/home/sales-summary").catch(() => null),
    getProductionSummary().catch(() => ({
      totalEstimatedLoss: 0,
      urgentCount: 0,
      restCount: 0,
      lossItems: [],
    })),
    requestJson<Array<{
      product_id: string;
      product_name?: string | null;
      estimated_chance_loss?: number | null;
    }>>(`/inventory/current`).catch(() => null),
    getInventorySnapshotSummary().catch(() => null),
    requestJson<
      Array<{
        product_group?: string;
        deadline?: string;
        status?: string;
        minutes_remaining?: number;
      }>
    >("/order/deadlines").catch(() => []),
    requestJson<{
      options?: Array<{ label?: string; total_qty?: number; items?: Array<{ product_id: string; product_name?: string }> }>
    }>(`/v1/orders/${STORE_ID}/options`).catch(() => null),
  ]);

  const hasCumulative = salesSummary?.cumulative_revenue_until != null && salesSummary?.cumulative_revenue_until > 0;
  const displayRevenue = hasCumulative ? salesSummary.cumulative_revenue_until! : salesSummary.today_revenue;
  const lossFromInventory = (invItems ?? []).reduce((s, i) => s + (Number(i.estimated_chance_loss ?? 0) || 0), 0);
  const lossValue = Math.round(Math.max(lossFromInventory, prodSummary.totalEstimatedLoss));
  const marginPct = (salesSummary?.profitability?.gross_profit_margin_pct != null && salesSummary.profitability?.gross_profit_margin_pct > 0)
    ? salesSummary.profitability.gross_profit_margin_pct / 100
    : 0.68;
  const netSales = Math.round(displayRevenue * marginPct);
  const vsPct = Number(salesSummary?.vs_yesterday_same_time_pct ?? 0);
  // Use inventory-snapshot summary for consistent counts across all screens
  const snapUrgent = snapSummary?.urgentCount ?? prodSummary.urgentCount;
  const snapSupplement = snapSummary?.supplementCount ?? prodSummary.restCount;
  const snapTotal = snapSummary?.totalCount ?? 0;

  const orderOpts = orderOptions?.options ?? [];
  const optQtyArr = orderOpts.map((o) => o.total_qty).filter((q): q is number => q != null);

  // === AI 추정 순매출 ===
  if (/순매출|net\s*sales/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME}의 AI 추정 순매출입니다.`,
          `금일 예상 누적 매출 ${formatKrw(displayRevenue)}에 매출이익률 ${Math.round(marginPct * 100)}%를 적용해 ${formatKrw(netSales)}로 표시됩니다.`,
          "실제 회계 확정값이 아니라 시간대 판매 패턴 기반 추정치입니다.",
        ],
        "매출 요약 데이터에 매출이익률 적용",
        "실제 순매출은 정산 완료 후 확인 가능합니다.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
      actionCards: [],
    };
  }

  // === 금일 AI 예상 기회손실 ===
  if (/기회손실|손실.*계산|기회.*손실.*계산/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME}의 금일 AI 예상 기회손실은 ${formatKrw(lossValue)}입니다.`,
          snapTotal > 0
            ? `전체 판매 제품 ${snapTotal}개 중 긴급 ${snapUrgent}개, 재고 주의 ${snapSupplement}개입니다.`
            : "전체 판매 제품 기준 긴급/재고 주의 품목이 있습니다.",
          "리드타임 1시간 기준으로 위험 품목을 처리하지 않았을 때의 예상 손실입니다.",
        ],
        "재고 스냅샷 + 재고 추정 손실 합산",
        snapUrgent > 0
          ? "생산관리에서 긴급 품목부터 확인하세요."
          : "현재 핵심 수치를 다시 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
      actionCards: [],
    };
  }

  // === 지금 뭐부터 처리하면 돼? / 우선순위 ===
  if (/지금.*뭐부터|처리하면|우선순위|먼저/.test(lower)) {
    if (lossValue > 0 && snapUrgent > 0) {
      return {
        lines: addGroundingAndAction(
          [
            `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME}에서는 생산관리부터 확인하는 것이 우선입니다.`,
            `금일 AI 예상 기회손실은 ${formatKrw(lossValue)}이며, 긴급 ${snapUrgent}개 · 재고 주의 ${snapSupplement}개 품목이 있습니다.`,
            `그다음 발주관리에서 ${optQtyArr.length}개 추천 옵션을 비교하세요.`,
          ],
          "매출·재고·발주 추천 데이터 기준",
          "생산관리 → 발주관리 순서로 확인하세요.",
        ),
        suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
        actionCards: [
          buildNavigationCard("생산관리 확인", "긴급 품목과 재고 주의 품목을 확인합니다.", "/production"),
          buildNavigationCard("발주관리 확인", "추천 발주 옵션을 비교합니다.", "/order"),
        ],
      };
    }
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 현재 모든 재고가 적정 수준입니다.`,
          `금일 예상 누적 매출은 ${formatKrw(displayRevenue)}이고 AI 추정 순매출은 ${formatKrw(netSales)}입니다.`,
          `발주관리에서 ${optQtyArr.length}개 추천 옵션을 비교하세요.`,
        ],
        "매출·재고·발주 추천 데이터 기준",
        "발주관리에서 추천 옵션을 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
      actionCards: [buildNavigationCard("발주관리 확인", "추천 발주 옵션을 비교합니다.", "/order")],
    };
  }

  // === 오늘 핵심 이슈 요약 / 기본 종합현황 답변 ===
  const vsText =
    vsPct > 0 ? `${vsPct.toFixed(1)}% 증가` : vsPct < 0 ? `${Math.abs(vsPct).toFixed(1)}% 감소` : "변동 없음";
  const optCards =
    snapUrgent > 0
      ? [
          buildNavigationCard("생산관리 확인", "긴급 품목과 재고 주의 품목을 확인합니다.", "/production"),
          buildNavigationCard("발주관리 확인", "추천 발주 옵션을 비교합니다.", "/order"),
        ]
      : [buildNavigationCard("발주관리 확인", "추천 발주 옵션을 비교합니다.", "/order")];
  return {
    lines: addGroundingAndAction(
      [
        `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME} 종합 현황 요약입니다.`,
        `금일 예상 누적 매출은 ${formatKrw(displayRevenue)}이며, 전일 대비 ${vsText}했습니다.`,
        `AI 추정 순매출은 ${formatKrw(netSales)}입니다. 매출이익률 ${Math.round(marginPct * 100)}%를 적용한 추정값입니다.`,
        snapTotal > 0
          ? `전체 판매 제품 ${snapTotal}개 중 긴급 ${snapUrgent}개 · 재고 주의 ${snapSupplement}개입니다. 금일 AI 예상 기회손실은 ${formatKrw(lossValue)}입니다. 리드타임 1시간 기준 위험 품목을 처리하지 않았을 때의 예상 손실입니다.`
          : `금일 AI 예상 기회손실은 ${formatKrw(lossValue)}입니다. 리드타임 1시간 기준 위험 품목을 처리하지 않았을 때의 예상 손실입니다.`,
        snapUrgent > 0
          ? `생산관리에서 긴급 품목 ${snapUrgent}개, 재고 주의 ${snapSupplement}개 처리가 필요합니다.`
          : "현재 재고는 적정 수준입니다.",
        optQtyArr.length > 0
          ? `발주관리 ${optQtyArr.length}개 옵션(수량 ${optQtyArr.join(", ")})을 검토하세요.`
          : "발주 옵션을 확인하세요.",
      ],
      "매출·재고·발주 추천 데이터 기준",
      lossValue > 0
        ? "생산관리에서 긴급 품목부터 확인한 뒤 발주관리를 검토하세요."
        : "발주관리에서 추천 옵션을 확인하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
    actionCards: optCards,
  };
}


const DDAY_POST_QUESTIONS: SuggestedQuestion[] = [
  { text: "D-DAY 다시 진행하면 얼마나 좋아질까?", action: "click_chips" },
  { text: "반응 좋은 행사 알려줘", action: "click_chips" },
  { text: "더 준비할 상품 알려줘", action: "click_chips" },
  { text: "행사 매출 높은 순서로 보여줘", action: "click_chips" },
];

const PROMO_SALES_ANALYSIS_QUESTIONS: SuggestedQuestion[] = [
  { text: "행사 매출 높은 순서로 보여줘" },
  { text: "이전 행사와 비교해줘" },
  { text: "행사 때 잘 팔린 상품 알려줘" },
  { text: "다음 행사 준비할 상품 알려줘" },
];

const SALES_PERIOD_ANALYSIS_QUESTIONS = [
  "일평균 기준으로 다시 비교해줘",
  "매출이 늘어난 상품 알려줘",
  "요일 차이를 반영해서 봐줘",
  "전월과도 비교해줘",
];

const PRODUCT_SALES_ANALYSIS_QUESTIONS = [
  "글레이즈드 지난주와도 비교해줘",
  "글레이즈드와 보스톤크림 비교해줘",
  "매출 비중 높은 상품 알려줘",
  "평균보다 낮은 상품 알려줘",
];

const DELIVERY_COMPARISON_QUESTIONS = [
  "채널별 배달 건수 자세히 봐줘",
  "배달 비중이 늘어난 이유 알려줘",
  "배달 주문 많은 시간대 알려줘",
  "배달 매출 높은 상품 알려줘",
];

const DELIVERY_REVENUE_QUESTIONS = [
  "쿠팡이츠 매출 비중 더 자세히 봐줘",
  "BM1 주문을 늘릴 방법 알려줘",
  "배달 매출 높은 상품 알려줘",
  "지난달 배달 채널과 비교해줘",
];

const BENCHMARK_ANALYSIS_QUESTIONS = [
  "평균보다 낮은 이유를 더 봐줘",
  "객단가가 높은 이유 알려줘",
  "판매 수량 늘릴 방법 알려줘",
  "비교 점포보다 약한 항목 알려줘",
];

const DIRECT_BACKEND_ANALYSIS_INTENTS = new Set([
  "SALES_COMPARISON",
  "CHANNEL_ANALYSIS",
  "PRODUCT_SALES_COMPARISON",
  "DELIVERY_CHANNEL_REVENUE",
  "PROMO_ANALYSIS",
  "BENCHMARK",
]);

function getAnalysisSuggestedQuestions(intent: string | undefined, message: string, selectedMenu: string) {
  const normalizedIntent = String(intent ?? "");
  const lower = message.toLowerCase();
  if (normalizedIntent === "PROMO_ANALYSIS") return PROMO_SALES_ANALYSIS_QUESTIONS;
  if (normalizedIntent === "PRODUCT_SALES_COMPARISON") return toSuggestedQuestions(PRODUCT_SALES_ANALYSIS_QUESTIONS);
  if (normalizedIntent === "DELIVERY_CHANNEL_REVENUE") return toSuggestedQuestions(DELIVERY_REVENUE_QUESTIONS);
  if (normalizedIntent === "CHANNEL_ANALYSIS" && /(배달|딜리버리|쿠팡|배민|해피오더|건\s*수)/.test(lower)) {
    return toSuggestedQuestions(DELIVERY_COMPARISON_QUESTIONS);
  }
  if (normalizedIntent === "BENCHMARK") return toSuggestedQuestions(BENCHMARK_ANALYSIS_QUESTIONS);
  if (normalizedIntent === "SALES_COMPARISON") return toSuggestedQuestions(SALES_PERIOD_ANALYSIS_QUESTIONS);
  return toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS);
}

async function buildPromotionResponse(message: string): Promise<LocalMenuResponse> {
  const backendPromo = await buildSalesQueryResponse(message, "프로모션");
  if (backendPromo) return backendPromo;

  const intent = classifyLocalIntent(message);
  const lower = message.toLowerCase();
  // D-DAY detection: 디데이/D-Day 관련 질문은 별도 처리 (typo 포함)
  const isDDayQuestion =
    /d[-\s.]?day|디\s*데이|디데이|다대아|디대이/.test(lower) ||
    /(d[-\s.]?day|디\s*데이|디데이|다대아|디대이).*(프로모션|행사|성적|성과|어땠|알려|최근|언제)/.test(lower);

  // Fetch promo data upfront for both D-DAY and general promo responses
  const [detail, promotions] = await Promise.all([getPromoPerformanceDetail(), getPromotions()]);
  const detailPromotions = detail?.promotions ?? [];

  // Build promo summary lines from actual data (total bills, total sales, top by response/sales)
  const promoSummaryLines = (): string[] => {
    if (detailPromotions.length === 0) return [];
    const totalBills = detailPromotions.reduce((s, p) => s + (Number(p.total_bill_cnt) || 0), 0);
    const totalSales = detailPromotions.reduce((s, p) => s + (Number(p.total_sales_amt) || 0), 0);
    const sortedByBills = [...detailPromotions].sort((a, b) => (Number(b.total_bill_cnt) || 0) - (Number(a.total_bill_cnt) || 0));
    const sortedBySales = [...detailPromotions].sort((a, b) => (Number(b.total_sales_amt) || 0) - (Number(a.total_sales_amt) || 0));
    const topResponse = sortedByBills[0];
    const topSales = sortedBySales[0];
    return [
      `총 참여 ${formatCount(totalBills)}건, 총 매출 ${formatKrw(totalSales)}`,
      `가장 반응이 큰 행사는 ${cleanPromoName(topResponse.campaign_name)}으로 ${formatCount(topResponse.total_bill_cnt)}건, ${formatKrw(topResponse.total_sales_amt)}`,
      `매출 기여가 큰 행사는 ${cleanPromoName(topSales.campaign_name)}으로 ${formatKrw(topSales.total_sales_amt)}, 반응 ${formatCount(topSales.total_bill_cnt)}건`,
    ];
  };

  if (isDDayQuestion) {
    return {
      lines: [
        "현재 연결된 행사 참여 및 매출 자료로 해당 행사 성과를 다시 확인하지 못했습니다.",
        "행사명과 기간 연결이 복구되면 참여 건수, 행사 매출, 전체 매출 비중을 기준으로 판단하겠습니다.",
        "근거: 행사 참여 및 매출 자료 기준",
      ],
      suggestedQuestions: PROMO_SALES_ANALYSIS_QUESTIONS,
      actionCards: [],
    };
  }
  const aiPromotions = promotions.filter((item) => item.status === "ai");
  const actualPromotions = promotions.filter((item) => item.status !== "ai");
  const activePromotions = promotions.filter((item) => item.status !== "ended");
  const topPromotion = actualPromotions[0] ?? activePromotions[0];
  const chips = (key: string) => toSuggestedQuestions(FOLLOWUP_CHIPS[key] ?? QUICK_CHIPS["프로모션"]);

  if (intent === "PROMO_RESPONSE") {
    const sortedByBills = [...detailPromotions].sort(
      (a, b) => (Number(b.total_bill_cnt) || 0) - (Number(a.total_bill_cnt) || 0),
    );
    const top3 = sortedByBills.slice(0, 3);
    const top = top3[0];
    const topName = cleanPromoName(top?.campaign_name);
    return {
      lines: addGroundingAndAction(
        top
          ? [
              `최근 집계 기준 반응이 가장 좋은 프로모션은 ${topName}입니다.`,
              `1위 ${topName} 참여 ${formatCount(top.total_bill_cnt)}건 · 매출 ${formatKrw(top.total_sales_amt)}`,
              top3[1]
                ? `2위 ${cleanPromoName(top3[1].campaign_name)} 참여 ${formatCount(top3[1].total_bill_cnt)}건 · 매출 ${formatKrw(top3[1].total_sales_amt)}`
                : null,
              "반응이 높다는 것은 고객 참여가 활발하다는 뜻이므로, 매출 전환이 함께 나는지 같이 봐야 합니다.",
            ].filter(Boolean) as string[]
          : ["최근 집계 기준 프로모션 반응 데이터를 찾지 못했습니다."],
        "최근 집계 기준 프로모션 참여 건수 비교",
        top ? `${topName}처럼 반응이 높은 프로모션부터 유지하고, 구매 전환이 낮으면 혜택 구성을 조정하세요.` : "프로모션 화면에서 최근 실적을 다시 확인하세요.",
      ),
      suggestedQuestions: chips("PROMO_RESPONSE"),
    };
  }

  if (intent === "PROMO_SALES") {
    const totalSales = detailPromotions.reduce((sum, item) => sum + Number(item.total_sales_amt ?? 0), 0);
    const sortedBySales = [...detailPromotions].sort(
      (a, b) => (Number(b.total_sales_amt) || 0) - (Number(a.total_sales_amt) || 0),
    );
    const top = sortedBySales[0];
    const second = sortedBySales[1];
    const topName = cleanPromoName(top?.campaign_name);
    return {
      lines: addGroundingAndAction(
        top
          ? [
              `최근 집계 기준 매출 기여가 가장 큰 프로모션은 ${topName}입니다.`,
              `1위 ${topName} 매출 ${formatKrw(top.total_sales_amt)}${totalSales > 0 ? ` · 전체 프로모션 매출의 ${Number.isFinite(top.total_sales_amt / totalSales) ? `${(top.total_sales_amt / totalSales * 100).toFixed(1)}%` : "-"}` : ""}`,
              second
                ? `2위 ${cleanPromoName(second.campaign_name)} 매출 ${formatKrw(second.total_sales_amt)}`
                : null,
              "매출 기여도가 높은 프로모션은 유지하고, 반응 대비 매출이 낮은 프로모션은 혜택이나 노출 시점을 조정하는 게 좋습니다.",
            ].filter(Boolean) as string[]
          : ["최근 집계 기준 프로모션 매출 데이터를 찾지 못했습니다."],
        "최근 집계 기준 프로모션별 매출 기여도 비교",
        top ? `${topName}처럼 매출 기여가 큰 프로모션을 우선 유지하고, 하위 프로모션은 정리 여부를 검토하세요.` : "프로모션 화면에서 최근 실적을 다시 확인하세요.",
      ),
      suggestedQuestions: chips("PROMO_SALES"),
    };
  }

  // === PROMO_HOURLY: 시간대별로 강한 프로모션 ===
  if (intent === "PROMO_HOURLY") {
    const promoTitle = cleanPromoName(topPromotion?.title);
    const lines = topPromotion
      ? [
          `시간대별 성과 데이터는 아직 연결되지 않았습니다.`,
          `현재는 캠페인 기간과 상품 반응 기준으로만 분석 중입니다.`,
          `${promoTitle}이 가장 활성 프로모션입니다 (${topPromotion.channel ?? "전체"}) · 매출 ${formatKrw(topPromotion.actualSales)} · 참여 ${formatCount(topPromotion.actualBills)}건`,
        ]
      : ["프로모션 데이터가 없습니다."];
    return {
      lines: addGroundingAndAction(
        lines,
        "프로모션 일일 집계 기준 (시간대별 매출 데이터 미연결)",
        "시간대 매출 데이터가 연결되면 강한 시간대를 표시하겠습니다.",
      ),
      suggestedQuestions: chips("PROMO_HOURLY"),
    };
  }

  // === PROMO_STORE_COMPARE: 강서구01과 다른 점포의 프로모션 성과 차이 ===
  if (intent === "PROMO_STORE_COMPARE") {
    const promoTitle = cleanPromoName(topPromotion?.title);
    const lines = topPromotion
      ? [
          `${DEMO_PRIMARY_STORE_NAME}과 타 점포의 프로모션 성과 비교입니다.`,
          `${DEMO_PRIMARY_STORE_NAME}: ${promoTitle} · 매출 ${formatKrw(topPromotion.actualSales)} · 참여 ${formatCount(topPromotion.actualBills)}건`,
          `타 점포와의 상세 비교는 벤치마킹 화면에서 확인 가능합니다.`,
        ]
      : ["프로모션 데이터가 없습니다."];
    return {
      lines: addGroundingAndAction(
        lines,
        "최근 집계 기준 프로모션별 점포 실적",
        "벤치마킹 화면에서 타 점포와 매출·참여 건수를 비교하세요.",
      ),
      suggestedQuestions: chips("PROMO_STORE_COMPARE"),
    };
}

  // Default promotion fallback
  const promoTitleDefault = cleanPromoName(topPromotion?.title);
  const lines = topPromotion
    ? [
        `현재 활성 프로모션 ${activePromotions.length}건입니다.`,
        `우선 확인: ${promoTitleDefault} · 매출 ${formatKrw(topPromotion.actualSales)} · 참여 ${formatCount(topPromotion.actualBills)}건`,
      ]
    : ["프로모션 데이터가 없습니다."];
  return {
    lines: addGroundingAndAction(
      lines,
      "최근 집계 기준 프로모션 실적",
      topPromotion ? `${promoTitleDefault}의 성과를 먼저 확인하세요.` : "프로모션 화면에서 실적을 확인하세요.",
    ),
    suggestedQuestions: chips("PROMO_RESPONSE"),
  };
}

async function buildPerformanceResponse(message: string): Promise<LocalMenuResponse> {
  const intent = classifyLocalIntent(message);
  const lower = message.toLowerCase();
  const chips = (key: string) =>
    toSuggestedQuestions(FOLLOWUP_CHIPS[key] ?? QUICK_CHIPS["AI 기반 성과 분석"]);

  if (intent === "PERF_MONTHLY") {
    const months = await getMonthlySales(4);
    const pair = latestComparableMonths(months);
    const previous = pair[0];
    const latest = pair[1];
    if (previous && latest) {
      const salesDiff = previous.total_sales > 0 ? ((latest.total_sales - previous.total_sales) / previous.total_sales) * 100 : 0;
      const qtyDiff = previous.total_qty > 0 ? ((latest.total_qty - previous.total_qty) / previous.total_qty) * 100 : 0;
      const currentMonth = getDemoDateTimeState().date.slice(0, 7);
      const trend = months
        .slice(-3)
        .map((item) => {
          const isCurrent = item.month === currentMonth;
          const label = isCurrent ? `${formatMonthLabel(item.month)} 누적` : formatMonthLabel(item.month);
          return `${label} ${formatKrw(item.total_sales)}`;
        })
        .join(" → ");
      const latestLabel = latest.month === currentMonth ? `${formatMonthLabel(latest.month)} 누적` : formatMonthLabel(latest.month);
      return {
        lines: addGroundingAndAction(
          [
            `최근 월간 매출은 ${latestLabel} ${formatKrw(latest.total_sales)}로 ${formatMonthLabel(previous.month)}보다 ${formatSignedPct(salesDiff)}입니다.`,
            `판매수량은 ${formatCount(latest.total_qty)}개로 ${formatSignedPct(qtyDiff)}입니다.`,
            `최근 추이: ${trend}`,
          ],
          `${formatMonthLabel(previous.month)}와 ${latestLabel} 매출·판매수량 비교`,
          "감소 폭이 큰 달의 주력 시간대와 상위 상품 운영을 먼저 점검하세요.",
        ),
        suggestedQuestions: chips("PERF_MONTHLY"),
      };
    }
  }

  if (intent === "PERF_PRODUCT_COMPARE") {
    const months = await getProductComparison("글레이즈드", 4);
    const pair = latestComparableMonths(months);
    const previous = pair[0];
    const latest = pair[1];
    if (previous && latest) {
      const salesDiff = previous.total_sales > 0 ? ((latest.total_sales - previous.total_sales) / previous.total_sales) * 100 : 0;
      const qtyDiff = previous.total_qty > 0 ? ((latest.total_qty - previous.total_qty) / previous.total_qty) * 100 : 0;
      return {
        lines: addGroundingAndAction(
          [
            `글레이즈드 매출은 ${formatMonthLabel(latest.month)} ${formatKrw(latest.total_sales)}로 ${formatMonthLabel(previous.month)}보다 ${formatSignedPct(salesDiff)}입니다.`,
            "글레이즈드는 대표 상품이라 감소 폭이 크면 전체 매출에도 바로 영향이 납니다.",
          ],
          `${formatMonthLabel(previous.month)}와 ${formatMonthLabel(latest.month)} 글레이즈드 매출·수량 비교`,
          "글레이즈드 진열량과 피크 시간 재고를 먼저 점검하고, 연계 프로모션 여부를 검토하세요.",
        ),
        suggestedQuestions: chips("PERF_PRODUCT_COMPARE"),
        insightCard: {
          title: resolveProductDisplayName("글레이즈드"),
          description: "월간 제품 비교",
          rows: [
            {
              label: formatMonthLabel(previous.month),
              current: previous.total_sales,
              reason: `${formatCount(previous.total_qty)}개`,
            },
            {
              label: formatMonthLabel(latest.month),
              current: latest.total_sales,
              reason: `${formatCount(latest.total_qty)}개 (${formatSignedPct(qtyDiff)})`,
            },
          ],
          summaryLabel: "매출 차이",
          summaryValue: formatSignedPct(salesDiff),
        },
      };
    }
  }

  // Delivery/channel data not available
  if (/전주.*배달.*건\s*수|전월.*배달.*건\s*수|전\s*주.*배달.*건\s*수|전\s*월.*배달.*건\s*수|이번 달.*배달.*지난 달|지난달.*배달.*건\s*수/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          "현재 배달 채널별 주문 건수 데이터가 없어 배달 건수 비교를 제공할 수 없습니다.",
          "현재 확인 가능한 데이터는 전체 판매량과 재고 데이터입니다.",
        ],
        "배달 건수 비교 데이터 없음",
        "배달 채널 연동 후 다시 확인해 주세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  if (/배달.*채널.*비중|채널별.*매출.*비중|배달 채널별/.test(lower)) {
    return {
      lines: addGroundingAndAction(
        [
          "현재 채널별 매출 데이터가 없어 채널별 매출 비중을 확인할 수 없습니다.",
          "현재 확인 가능한 데이터는 전체 판매량과 재고 데이터입니다.",
        ],
        "채널별 매출 비중 데이터 없음",
        "배달 채널 연동 후 다시 확인해 주세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }

  if (intent === "PERF_STORE_AVG") {
    const apiResult = await fetchSalesQuery(message).catch(() => null);
    if (apiResult) {
      const sections = apiResult.sections ?? [];
      const insightText =
        sections.find((section) => section.type === "insight")?.text ??
        "연결된 자료 기준으로 비교를 정리했습니다.";
      const actions = extractActionItems(sections);
      return {
        lines: addGroundingAndAction(
          [insightText],
          apiResult.sources?.[0]?.description || "전점포 벤치마크 비교 데이터",
          actions[0] || "현재 우세한 시간대와 메뉴 구성을 유지하세요.",
        ),
        suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
      };
    }
  }

  const data = await getAiPerformanceData("일별");
  if (/결제|카드|현금|간편결제|포인트/.test(lower)) {
    const topPayment = data.paymentTypes[0];
    return {
      lines: addGroundingAndAction(
        [
          topPayment
            ? `결제수단 1위: ${topPayment.label} ${topPayment.percent}%`
            : "결제수단 데이터를 불러오지 못했습니다.",
          ...data.paymentTypes.slice(1, 3).map(
            (item) => `${item.label} ${item.percent}%`,
          ),
        ],
        "결제수단 mix 집계",
        topPayment
          ? `${topPayment.label} 비중 변화가 매출 변화와 연결되는지 확인하세요.`
          : "결제수단 데이터를 다시 조회해 주세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  if (/시간대|피크|몇 시/.test(lower)) {
    const peak = [...data.hourlySales].sort((a, b) => b.pos + b.delivery - (a.pos + a.delivery))[0];
    return {
      lines: addGroundingAndAction(
        [
          peak
            ? `피크: ${peak.time} · POS ${peak.pos.toLocaleString("ko-KR")} / 배달 ${peak.delivery.toLocaleString("ko-KR")}`
            : "시간대별 매출 데이터를 불러오지 못했습니다.",
        ],
        "시간대별 매출 집계",
        peak ? `${peak.time} 전후 재고와 인력 대응을 점검하세요.` : "시간대별 차트를 다시 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  if (/상품|상위|주력|메뉴/.test(lower)) {
    const topCategory = data.categorySales[0];
    return {
      lines: addGroundingAndAction(
        [
          topCategory
            ? `상위 카테고리: ${resolveProductDisplayName(topCategory.name)} ${topCategory.today.toLocaleString("ko-KR")}원`
            : "상위 상품 데이터를 불러오지 못했습니다.",
          ...data.categorySales.slice(1, 3).map(
            (item) => `${resolveProductDisplayName(item.name)} ${item.today.toLocaleString("ko-KR")}원`,
          ),
        ],
        "상위 상품/카테고리 매출 집계",
        topCategory ? `${resolveProductDisplayName(topCategory.name)} 재고와 프로모션 연계를 점검하세요.` : "상위 상품 데이터를 다시 조회하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  return {
    lines: addGroundingAndAction(
      [
        ...data.kpis.slice(0, 3).map((item) => `${item.label}: ${item.value} (${item.change})`),
      ],
      "실적 기반 요약",
      "하락 중인 KPI가 있다면 원인 화면에서 세부 지표를 확인하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
  };
}

async function buildValidationResponse(message: string): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const summary = await getAiValidationChatSummary();
  const lower = message.toLowerCase();
  const lines =
    /신뢰도|신뢰|점수/.test(lower)
      ? summary.trust
      : /위험|낮은 항목|원인/.test(lower)
        ? summary.risk
        : /요약|정리/.test(lower)
          ? summary.summary
          : summary.overview;
  return {
    lines: addGroundingAndAction(
      [`${demoLabel} 기준 AI 검증 요약입니다.`, ...lines],
      "실데이터 기반 검증 카드 + 파생 품질 점수",
      "신뢰도가 낮은 카드부터 원인을 확인하고 점검 항목을 정리하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(summary.suggestedQuestions),
    actionCards: [
      buildNavigationCard("AI 검증 화면 열기", "신뢰도와 검증 카드 상세를 확인합니다.", "/ai-insights"),
    ],
  };
}

async function buildBenchmarkResponse(message: string, intent: LocalIntent = "UNKNOWN"): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const snapshot = await getBenchmarkSnapshot();
  const lower = message.toLowerCase();
  const selectedStoreIds = getBenchmarkCompareStoreIds();
  const knownPeerNames = selectedStoreIds.map((storeId) =>
    DEMO_BENCHMARK_COMPARE_STORES.find((store) => store.storeId === storeId)?.storeName ??
    resolveDemoStoreName(storeId, storeId),
  );
  const explicitlyMentionedStore =
    Object.values(DEMO_STORE_NAME_MAP).find((storeName) => message.includes(storeName)) ?? null;
  if (
    explicitlyMentionedStore &&
    explicitlyMentionedStore !== DEMO_PRIMARY_STORE_NAME &&
    !knownPeerNames.includes(explicitlyMentionedStore) &&
    intent !== "BENCHMARK_SELECT"
  ) {
    return {
      lines: addGroundingAndAction(
        [
          `${explicitlyMentionedStore}는 현재 선택된 벤치마킹 비교군에 포함되어 있지 않습니다.`,
          `현재 선택된 비교 매장은 ${knownPeerNames.join(", ")}입니다.`,
          "벤치마킹 화면에서 비교 매장을 직접 선택해서 다시 비교할 수 있습니다.",
        ],
        "현재 선택된 비교 매장 상태",
        "벤치마킹 화면에서 비교 매장을 추가하거나 교체하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }

  if (/선택|바꿔|다른 비교 매장/.test(lower)) {
    const mentionedStoreIds = findMentionedBenchmarkStoreIds(message);
    if (mentionedStoreIds.length > 0) {
      const nextStoreIds = Array.from(new Set([...selectedStoreIds, ...mentionedStoreIds]));
      const updatedStoreIds = setBenchmarkCompareStoreIds(nextStoreIds);
      const updatedStoreNames = updatedStoreIds.map((storeId) => resolveDemoStoreName(storeId, storeId));
      return {
        lines: addGroundingAndAction(
          [
            `${demoLabel} 기준 벤치마킹 비교군을 업데이트했습니다.`,
            `현재 선택된 비교 매장은 ${updatedStoreNames.join(", ")}입니다.`,
            `${mentionedStoreIds.map((storeId) => resolveDemoStoreName(storeId, storeId)).join(", ")}를 비교군에 추가했습니다.`,
          ],
          "비교 매장 선택 상태",
          "벤치마킹 화면으로 이동해 카드와 지표 변화를 확인하세요.",
        ),
        suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
        actionCards: [
          buildNavigationCard("벤치마킹 화면 열기", "비교 매장을 직접 선택하고 실데이터 차이를 확인합니다.", "/benchmarking"),
        ],
      };
    }
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 벤치마킹 비교군입니다.`,
          `현재 선택된 비교 매장은 ${knownPeerNames.join(", ")}입니다.`,
          "벤치마킹 화면 상단에서 매장을 직접 선택하면 카드와 비교 지표가 즉시 바뀝니다.",
        ],
        "현재 선택된 비교 매장 상태",
        "비교 매장을 선택해 우리 매장과 차이가 큰 곳부터 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
      actionCards: [
        buildNavigationCard("벤치마킹 화면 열기", "비교 매장을 직접 선택하고 실데이터 차이를 확인합니다.", "/benchmarking"),
      ],
    };
  }

  if (/비슷|유사/.test(lower)) {
    const similar = snapshot.similarPeers[0];
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 유사 매장 추천입니다.`,
          similar
            ? `${similar.storeName}이 가장 유사하며 유사도는 ${similar.similarityScore}%입니다.`
            : "현재 비교군에서 유사 매장을 계산하지 못했습니다.",
          similar
            ? `${similar.reasons.join(", ")} 기준으로 묶였고, ${similar.whyBetter}`
            : "비교 매장을 더 선택하면 유사도 추천이 더 정확해집니다.",
        ],
        "시간대·상품 구성·채널·결제 비중 유사도",
        similar
          ? `${similar.storeName}과 우리 매장의 피크 시간/상위 상품 차이를 먼저 확인하세요.`
          : "비교 매장을 더 선택한 뒤 다시 질문해 주세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }

  const targetPeer =
    snapshot.peerCards.find(
      (peer) => message.includes(peer.storeName) || message.includes(peer.storeId),
    ) ??
    snapshot.peerCards[0];
  if (/왜|이유|더 성과/.test(lower) && targetPeer) {
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 벤치마킹 설명입니다.`,
          `${targetPeer.storeName}은 현재 ${targetPeer.peakHourLabel} 피크와 ${resolveProductDisplayName(targetPeer.mainProduct)} 판매력이 강합니다.`,
          targetPeer.whyBetter ??
            `${targetPeer.storeName}은 피크 시간 대응과 상위 상품 판매 비중이 높아 ${formatDiff(targetPeer.salesDiff)} 격차를 보입니다.`,
          targetPeer.similarityReasons?.length
            ? `${snapshot.storeName}와는 ${targetPeer.similarityReasons.join(", ")} 기준으로 비교 가치가 높습니다.`
            : "비교 가치가 높은 매장으로 추천된 이유는 화면 카드에서 함께 확인할 수 있습니다.",
        ],
        "유사도 + 매출 격차 분석",
        `${targetPeer.storeName}의 강한 시간대와 주력 상품을 우리 매장 운영에 반영할지 검토하세요.`,
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }
  if (/결제|카드|현금|간편결제|포인트/.test(lower)) {
    const ourPayment = snapshot.paymentStores.find((store) => store.store_id === STORE_ID)?.methods?.[0];
    const peerPayment = targetPeer
      ? snapshot.paymentStores.find((store) => store.store_id === targetPeer.storeId)?.methods?.[0]
      : null;
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 벤치마킹 요약입니다.`,
          ourPayment
            ? `${snapshot.storeName}의 주 결제수단은 ${ourPayment.payment_group} ${Math.round(ourPayment.pct_of_total)}%입니다.`
            : "우리 매장의 결제수단 데이터가 없습니다.",
          targetPeer && peerPayment
            ? `${targetPeer.storeName}은 ${peerPayment.payment_group} ${Math.round(peerPayment.pct_of_total)}%입니다.`
            : "비교 매장의 결제수단 데이터가 충분하지 않습니다.",
          "결제수단 차이는 객단가와 방문 목적 차이를 함께 보는 것이 좋습니다.",
        ],
        "결제수단 mix 비교",
        targetPeer ? `${targetPeer.storeName} 대비 차이가 큰 결제수단의 고객군을 점검하세요.` : "결제수단 비교가 가능한 매장을 선택하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }
  if (/시간대|피크|몇 시/.test(lower)) {
    const ourPeak =
      snapshot.hourlyStores
        .find((store) => store.store_id === STORE_ID)
        ?.points.slice()
        .sort((a, b) => b.sales - a.sales)[0] ?? null;
    const isHourlyFallback = snapshot.hourlyDataSource !== "real";
    const hourlyLines: string[] = [`${demoLabel} 기준 벤치마킹 요약입니다.`];
    if (isHourlyFallback) {
      hourlyLines.push("시간대별 실측 데이터가 없어 일 매출 KPI와 기본 시간대 패턴으로 추정했습니다.");
    }
    hourlyLines.push(
      ourPeak
        ? `${snapshot.storeName}의 피크 시간은 ${ourPeak.hour}시${isHourlyFallback ? " (추정)" : ""}이며 피크 매출은 ₩${Math.round(ourPeak.sales).toLocaleString("ko-KR")}입니다.`
        : "우리 매장 피크 시간 데이터가 없습니다."
    );
    hourlyLines.push(
      targetPeer
        ? `${targetPeer.storeName}은 ${targetPeer.peakHourLabel} 피크가 강하고 매출 격차는 ${targetPeer.salesDiff > 0 ? "+" : ""}${Math.abs(targetPeer.salesDiff).toFixed(1)}%입니다.`
        : "비교 매장 피크 시간 데이터를 찾지 못했습니다."
    );
    hourlyLines.push("시간대별 비교에서는 오후 피크 대응력이 가장 큰 차이를 만듭니다.");
    return {
      lines: addGroundingAndAction(
        hourlyLines,
        isHourlyFallback ? "일별 KPI 기반 시간대 추정값 (실시간 시간대 데이터 미적재)" : "시간대별 매출 패턴 비교",
        targetPeer ? `${targetPeer.storeName}의 강한 피크 시간 운영 방식을 참고하세요.` : "시간대별 비교 가능한 매장을 선택하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }
  if (/상품|품목|메뉴|주력/.test(lower)) {
    const ourTop = snapshot.topItemStores.find((store) => store.store_id === STORE_ID)?.items?.[0];
    const peerTop = targetPeer
      ? snapshot.topItemStores.find((store) => store.store_id === targetPeer.storeId)?.items?.[0]
      : null;
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 벤치마킹 요약입니다.`,
          ourTop
            ? `${snapshot.storeName}의 상위 상품은 ${resolveProductDisplayName(ourTop.product_name)} ${Math.round(ourTop.sold_qty).toLocaleString("ko-KR")}개입니다.`
            : "우리 매장 상위 상품 데이터가 없습니다.",
          targetPeer && peerTop
            ? `${targetPeer.storeName}은 ${resolveProductDisplayName(peerTop.product_name)} ${Math.round(peerTop.sold_qty).toLocaleString("ko-KR")}개입니다.`
            : "비교 매장의 상위 상품 데이터를 찾지 못했습니다.",
          "상위 상품 구성이 매출 차이에 직접 연결됩니다.",
        ],
        "상위 상품 구성 비교",
        targetPeer ? `${targetPeer.storeName}의 상위 상품과 우리 매장의 판매 구성을 비교하세요.` : "상품 비교 가능한 매장을 선택하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    };
  }
  return {
    lines: addGroundingAndAction(
      [
        `${demoLabel} 기준 벤치마킹 요약입니다.`,
        ...(/위험|리스크/.test(lower)
          ? snapshot.chatSummary.risk
          : snapshot.chatSummary.summary),
      ],
      "현재 선택된 비교 매장과 실적 집계 기준",
      "유사한데 더 잘하는 매장을 골라 피크 시간과 주력 상품 차이를 먼저 보세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(snapshot.chatSummary.suggestedQuestions),
    actionCards: [
      buildNavigationCard("벤치마킹 화면 열기", "우리 매장과 비교 매장을 실데이터로 비교합니다.", "/benchmarking"),
    ],
  };
}

async function buildAlarmSettingsResponse(): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const settings = await getNotificationSettings();
  return {
    lines: addGroundingAndAction(
      [
        `${demoLabel} 기준 알림 설정 상태입니다.`,
        describeNotificationState(settings),
        `채널 상태: 앱 내 ${settings.in_app_enabled ? "ON" : "OFF"}, 푸시 ${settings.push_enabled ? "ON" : "OFF"}, 이메일 ${settings.email_enabled ? "ON" : "OFF"}`,
      ],
      "notification settings 저장값",
      "시연 중 불필요한 알림이 있으면 카테고리별로 조정하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["알람 설정"]),
    actionCards: [
      buildNavigationCard("알람 설정 화면 열기", "현재 알림 상태와 저장 값을 확인합니다.", "/alerts"),
    ],
  };
}

async function buildNetSalesExplanation(message: string): Promise<LocalMenuResponse> {
  const { date, time } = getDemoDateTimeState();
  const demoLabel = `${date} ${time} 기준`;
  const salesData = await requestJson<Record<string, unknown>>("/home/sales-summary").catch(() => null);
  const salesSummary = salesData as Record<string, unknown> | null;
  const hasCumulative = salesSummary?.cumulative_revenue_until != null && Number(salesSummary.cumulative_revenue_until) > 0;
  const displayRevenue = hasCumulative ? Number(salesSummary.cumulative_revenue_until) : Number(salesSummary?.today_revenue ?? 0);
  const marginPct = (salesSummary?.profitability as Record<string, unknown> | undefined)?.gross_profit_margin_pct != null && (salesSummary?.profitability as Record<string, unknown>).gross_profit_margin_pct > 0
    ? Number((salesSummary.profitability as Record<string, unknown>).gross_profit_margin_pct) / 100
    : 0.68;
  const netSales = Math.round(displayRevenue * marginPct);

  return {
    lines: [
      `AI 추정 순매출은 현재까지의 판매 흐름을 바탕으로 오늘 예상 누적 매출에 기준 매출이익률을 적용한 참고 지표입니다.`,
      `${demoLabel} ${DEMO_PRIMARY_STORE_NAME} 기준으로는 예상 누적 매출 ${formatKrw(displayRevenue)}에 매출이익률 ${Math.round(marginPct * 100)}%를 적용해 ${formatKrw(netSales)}로 표시됩니다.`,
      "화면에서는 ‘AI 추정 순매출’이라고 표시하지만, 실제 정산 순매출이 아니라 예상 매출에 기준 매출이익률을 적용한 추정값입니다. 실제 확정 매출은 정산 완료 후 확인하는 값입니다.",
    ],
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
    actionCards: [],
  };
}

async function buildMenuAwareResponse(
  selectedMenu: string,
  message: string,
  intent: LocalIntent,
): Promise<LocalMenuResponse | null> {
  const lower = message.toLowerCase();
  if (intent === "SENSITIVE_BLOCKED") {
    return {
      lines: addGroundingAndAction(
        [
          "점포 코드, 토큰, 시크릿, 환경변수, 숨김 점포 같은 민감정보는 안내하지 않습니다.",
          "운영 화면에 필요한 지표와 액션 중심으로만 답변합니다.",
        ],
        "민감정보 보호 및 hidden store 차단 정책",
        "매출·재고·발주 같은 운영 질문으로 다시 요청해 주세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
    };
  }
  if (intent === "TERM_EXPLAIN") {
    return buildTermExplainResponse(selectedMenu, message);
  }
  if (intent === "SCREEN_GUIDE") {
    return buildScreenGuideResponse(selectedMenu);
  }
  if (intent === "BENCHMARK_SELECT") {
    return buildBenchmarkResponse(message, intent);
  }

  // === Sales reason - works across all menus ===
  if (intent === "SALES_REASON") {
    return buildSalesReasonResponse(message);
  }

  // === Net sales explanation - KPI definition across all menus ===
  if (intent === "NET_SALES_EXPLANATION") {
    return buildNetSalesExplanation(message);
  }

  // === Promotion intents ===
  if (intent === "PROMO_RESPONSE" || intent === "PROMO_SALES" || intent === "PROMO_HOURLY" || intent === "PROMO_STORE_COMPARE" || intent === "PROMO_ANALYSIS") {
    return buildPromotionResponse(message);
  }

  if (selectedMenu === "AI 검증") {
    if (intent === "MENU_SUMMARY" || /신뢰도|신뢰|점수|위험|낮은 항목|원인|요약|정리/.test(lower)) {
      return buildValidationResponse(message);
    }
    return null;
  }
  if (selectedMenu === "벤치마킹") {
    if (/비교|유사|비슷|시간대|상품|결제|왜|이유|성과|선택|바꿔|리스크|위험|요약/.test(lower) || intent === "MENU_SUMMARY") {
      return buildBenchmarkResponse(message, intent);
    }
    return null;
  }
  if (selectedMenu === "프로모션") {
    if (/프로모션|캠페인|반응|매출|기여|시간대|점포|성과/.test(lower) || intent === "MENU_SUMMARY") {
      return buildPromotionResponse(message);
    }
    return null;
  }
  if (selectedMenu === "AI 기반 성과 분석") {
    if (
      intent === "PERF_MONTHLY" ||
      intent === "PERF_PRODUCT_COMPARE" ||
      intent === "PERF_STORE_AVG" ||
      /결제|카드|현금|간편결제|포인트|시간대|피크|몇 시|상품|상위|주력|메뉴|요약/.test(lower) ||
      intent === "MENU_SUMMARY"
    ) {
      return buildPerformanceResponse(message);
    }
    // Delivery/channel/promo questions in performance menu: handle via buildPerformanceResponse
    if (
      /전주.*배달.*건\s*수|전월.*배달.*건\s*수|전\s*주.*배달.*건\s*수|전\s*월.*배달.*건\s*수|배달.*채널.*비중|채널별.*매출.*비중/.test(lower) ||
      /반응.*좋은|프로모션.*매출|매출.*기여/.test(lower)
    ) {
      return buildPerformanceResponse(message);
    }
    return null;
  }
  if (selectedMenu === "알람 설정") {
    return buildAlarmSettingsResponse();
  }
  if (intent === "CHANCE_LOSS" || intent === "MENU_SUMMARY") {
    return buildDashboardResponse(message);
  }
  if (selectedMenu === "종합 현황") {
    return buildDashboardResponse(message);
  }
  return null;
}

export default function AiPanel({
  isAiPanelOpen,
  setIsAiPanelOpen,
  selectedMenu = "종합 현황",
  onOpenBriefing,
}: AiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [actionStates, setActionStates] = useState<
    Record<string, { status: "running" | "completed" | "failed"; message?: string }>
  >({});
  const chatRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    setMessages([buildInitialMessage(selectedMenu)]);
    setInput("");
    setSessionId(undefined);
    setActionStates({});
  }, [selectedMenu]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleNotificationIntent = useCallback(
    async (chatData: BackendChatResponse) => {
      const metadata = chatData?.metadata || {};
      const path = String(metadata?.path || chatData?.path || "");
      if (path !== "NOTIFICATION_SETTINGS") {
        return null;
      }

      const subIntent = String(
        metadata?.sub_intent || chatData?.sub_intent || "",
      ).toUpperCase();
      const dataMode = String(
        metadata?.settings_data_mode || chatData?.settings_data_mode || "",
      );
      const operation = ((metadata?.settings_operation ||
        chatData?.settings_operation ||
        {}) as Record<string, unknown>) || {};
      const categories = normalizeNotificationCategories(operation);
      const channels = normalizeNotificationChannels(operation);
      const durationMinutes =
        typeof operation?.duration_minutes === "number"
          ? operation.duration_minutes
          : null;

      if (dataMode && dataMode !== "postgres") {
        return ["현재 환경은 file mode라 알림 설정을 저장할 수 없습니다."];
      }

      const current = await getNotificationSettings();
      if (subIntent === "NOTIFICATION_STATUS") {
        return [describeNotificationState(current)];
      }

      const patchBody = buildNotificationPatch(
        current,
        subIntent,
        categories,
        channels,
        durationMinutes,
      );
      await updateNotificationSettings(patchBody);
      const verified = await getNotificationSettings();

      window.dispatchEvent(
        new CustomEvent("notification-settings-changed", { detail: verified }),
      );

      return buildNotificationResultLines(
        verified,
        subIntent,
        categories,
        channels,
        durationMinutes,
      );
    },
    [],
  );

  const handleAction = useCallback(
    async (messageId: string, cardIndex: number, actionIndex: number, action: ActionCardAction) => {
      const key = `${messageId}-${cardIndex}-${actionIndex}`;
      setActionStates((prev) => ({
        ...prev,
        [key]: { status: "running", message: "실행 중..." },
      }));
      try {
        const result = await executeActionCard(action);
        navigateToRoute(result.route);
        setActionStates((prev) => ({
          ...prev,
          [key]: { status: "completed", message: result.message },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "실행에 실패했습니다.";
        setActionStates((prev) => ({
          ...prev,
          [key]: { status: "failed", message },
        }));
      }
    },
    [],
  );

  const handleActionButton = useCallback(
    (button: ActionButton) => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, type: "user", lines: [button.label], time: now() },
      ]);
      setInput("");
      setIsTyping(true);
      const confirmationMap: Record<string, string[]> = {
        "생산 등록": ["생산관리 화면에서 생산 등록을 확인해 주세요.", "실제 등록은 아직 실행하지 않았습니다."],
        "부족 발주 진행": ["발주관리 화면에서 부족 발주 요청을 준비했어요.", "실제 등록은 아직 실행하지 않았습니다."],
        "나중에": ["네, 나중에 처리하도록 하겠습니다."],
      };
      setTimeout(() => {
        const response = confirmationMap[button.label] ?? ["요청을 처리했습니다."];
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            type: "ai",
            lines: response,
            time: now(),
          },
        ]);
        setIsTyping(false);
      }, 600);
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const localIntent = classifyLocalIntent(trimmed);
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, type: "user", lines: [trimmed], time: now() },
      ]);
      setInput("");
      setIsTyping(true);

      const finishWith = (
        lines: string[],
        suggestedQuestions?: SuggestedQuestion[],
        actionCards?: ActionCard[],
        insightCard?: InsightCard,
        actions?: ActionButton[],
        markdown?: string,
      ) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            type: "ai",
            lines: sanitizeLines(lines),
            markdown: markdown ?? undefined,
            time: now(),
            suggestedQuestions,
            actionCards,
            insightCard,
            actions,
          },
        ]);
        setIsTyping(false);
      };

      if (localIntent === "GREETING") {
        finishWith(
          addGroundingAndAction(
            [`${selectedMenu} 기준으로 도와드릴게요.`],
            `${DEMO_PRIMARY_STORE_NAME} · ${getDemoDateTimeLabel()} 기준`,
            "추천 질문을 누르거나 직접 질문해 주세요.",
          ),
          toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
        );
        return;
      }

      if (localIntent === "IDENTITY") {
        finishWith(
          addGroundingAndAction(
            ["BR Korea POS의 PIP AI 어시스턴트입니다.", "생산, 발주, 매출, 벤치마킹, 알림을 실데이터 기준으로 안내합니다."],
            "현재 메뉴 컨텍스트 + 기준 일시",
            "확인하려는 지표를 직접 질문해 주세요.",
          ),
          toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
        );
        return;
      }

      if (localIntent === "GENERAL_HELP") {
        finishWith(
          addGroundingAndAction(
            [
              "생산 추천·재고 부족, 발주 추천·마감, 성과 분석·벤치마킹, 알림 ON/OFF를 도와드립니다.",
            ],
            "현재 화면 문맥과 실데이터 기준",
            "추천 질문을 누르거나 직접 입력해 주세요.",
          ),
          toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
        );
        return;
      }

      const needsBackendFirst =
        localIntent === "NOTIFICATION_MUTE" ||
        localIntent === "NOTIFICATION_UNMUTE" ||
        localIntent === "NOTIFICATION_STATUS";

      if (shouldPreferSalesQueryFirst(selectedMenu, trimmed, localIntent)) {
        const salesQueryResponse = await buildSalesQueryResponse(trimmed, selectedMenu);
        if (salesQueryResponse) {
          finishWith(
            salesQueryResponse.lines,
            salesQueryResponse.suggestedQuestions ??
              toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
            salesQueryResponse.actionCards,
            salesQueryResponse.insightCard,
            salesQueryResponse.actions,
          );
          return;
        }
      }

      // D-DAY 질문은 로컬 핸들러로 바로 라우팅 (LLM 호출 우회)
      if (/d[-\s.]?day|디\s*데이|디데이|다대아|디대이/.test(trimmed.toLowerCase())) {
        try {
          const promoResp = await buildPromotionResponse(trimmed);
          if (promoResp) {
            finishWith(
              promoResp.lines,
              promoResp.suggestedQuestions ??
                PROMO_SALES_ANALYSIS_QUESTIONS,
              promoResp.actionCards,
              promoResp.insightCard,
              promoResp.actions,
              promoResp.markdown,
            );
            return;
          }
        } catch {
          /* D-DAY local response failed; fall through to LLM */
        }
      }

      if (selectedMenu === "벤치마킹" && !needsBackendFirst) {
        try {
          const bench = await buildMenuAwareResponse(selectedMenu, trimmed, localIntent);
          if (bench) {
            finishWith(
              bench.lines,
              bench.suggestedQuestions ??
                toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
              bench.actionCards,
              bench.insightCard,
              bench.actions,
              bench.markdown,
            );
            return;
          }
        } catch {
          /* local benchmark response failed; fall through to LLM */
        }
      }

      if (!needsBackendFirst && shouldPreferLocalOnly(localIntent)) {
        try {
          const menuAwareLocal = await buildMenuAwareResponse(
            selectedMenu,
            trimmed,
            localIntent,
          );
          if (menuAwareLocal) {
            finishWith(
              menuAwareLocal.lines,
              menuAwareLocal.suggestedQuestions ??
                toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
              menuAwareLocal.actionCards,
              menuAwareLocal.insightCard,
              menuAwareLocal.actions,
              menuAwareLocal.markdown,
            );
            return;
          }
        } catch {
          /* local-first response failed; continue to backend fallback */
        }
      }

      // ── OVERVIEW: force local handler before any backend call ──
      // But sales comparison questions (월 매출 비교, 전년 동월, 25년/26년 기준 등) go to backend
      const isSalesComparisonQuestion =
        /(전년|전년\s*동월|작년\.|25년|2025년?|26년|2026년?|월\s*매출.*비교|매출\s*비교|동월|영업일수|일평균\s*매출|요일\s*구성)/.test(trimmed);
      if (selectedMenu === "종합 현황" && !isSalesComparisonQuestion) {
        try {
          const overviewResp = await buildDashboardResponse(trimmed);
          if (overviewResp) {
            finishWith(
              overviewResp.lines,
              overviewResp.suggestedQuestions,
              overviewResp.actionCards,
              overviewResp.insightCard,
              overviewResp.actions,
              overviewResp.markdown,
            );
            return;
          }
        } catch {
          /* fall through to backend */
        }
      }

      const benchmarkingHandled = false;

      let backendLines: string[] | null = null;
      let backendMarkdown: string | undefined;
      let backendQuestions: SuggestedQuestion[] = [];
      let backendActionCards: ActionCard[] = [];

      if (selectedMenu !== "벤치마킹") {
        try {
          const backend = await fetchChat(trimmed, selectedMenu, sessionId, messages);
          if (backend.session_id) {
            setSessionId(backend.session_id);
          }
          const notificationLines = await handleNotificationIntent(backend);
          if (notificationLines && notificationLines.length > 0) {
            finishWith(
              notificationLines,
              toSuggestedQuestions(QUICK_CHIPS["알람 설정"]),
            );
            return;
          }
          const answer =
            typeof backend.content === "string"
              ? backend.content
              : backend.answer || backend.metadata?.answer || "";
          const processedAnswer = formatBackendAnswer(answer);
          const hasMarkdown = /(^[\s\n]*#{1,3}\s|^[\s\n]*\|.*\|.*\|)/m.test(processedAnswer);
          backendMarkdown = hasMarkdown ? processedAnswer : undefined;
          backendLines = sanitizeLines(processedAnswer.split("\n"));
          backendQuestions = normalizeSuggestedQuestions(
            backend.suggested_questions || backend.metadata?.suggested_questions,
          );
          backendActionCards =
            backend.action_cards ||
            backend.metadata?.action_cards ||
            [];
        } catch {
          backendLines = null;
        }
      }

      const shouldUseSalesQueryFallback =
        selectedMenu === "종합 현황" ||
        selectedMenu === "AI 기반 성과 분석";
      if (shouldUseSalesQueryFallback && isGenericBackendAnswer(backendLines)) {
        const salesQueryResponse = await buildSalesQueryResponse(trimmed, selectedMenu);
        if (salesQueryResponse) {
          finishWith(
            salesQueryResponse.lines,
            salesQueryResponse.suggestedQuestions ??
              toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
            salesQueryResponse.actionCards,
            salesQueryResponse.insightCard,
            salesQueryResponse.actions,
          );
          return;
        }
      }

      if (selectedMenu !== "벤치마킹") {
        try {
          const menuAware = await buildMenuAwareResponse(
            selectedMenu,
            trimmed,
            localIntent,
          );
          if (menuAware && isGenericBackendAnswer(backendLines)) {
            finishWith(
              menuAware.lines,
              menuAware.suggestedQuestions ??
                backendQuestions ??
                toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
              menuAware.actionCards && menuAware.actionCards.length > 0
                ? menuAware.actionCards
                : backendActionCards,
              menuAware.insightCard,
              menuAware.actions,
              menuAware.markdown,
            );
            return;
          }
        } catch {
          /* local menu fallback ignored */
        }

        if (backendLines && backendLines.length > 0) {
          finishWith(
            backendLines,
            backendQuestions.length > 0
              ? backendQuestions
              : toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
            backendActionCards,
            undefined,
            undefined,
            backendMarkdown,
          );
          return;
        }
      }

      finishWith(
        ["죄송합니다. 현재 응답을 생성하지 못했습니다.", "잠시 후 다시 시도해 주세요."],
        toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
      );
    },
    [handleNotificationIntent, isTyping, messages, selectedMenu, sessionId],
  );

  const chips = QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS;

  return (
    <div
      className={`absolute top-0 h-[760px] w-[217px] flex flex-col transition-all duration-300 ${
        isAiPanelOpen ? "left-[807px]" : "left-[1024px]"
      }`}
      style={{ background: "#000" }}
    >
      <div className="flex items-center justify-between px-[15px] pt-[14px] pb-[10px] shrink-0">
        <div className="flex items-center gap-[5px] bg-[#C0E183] rounded-[20px] px-[10px] py-[5px]">
          <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
            <path
              d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
              fill="black"
            />
          </svg>
          <span className="text-[12px] font-bold text-black leading-normal">
            PIP AI
          </span>
        </div>

        <div className="flex items-center gap-[8px]">
          <button className="bg-white rounded-[17px] w-[24px] h-[24px] flex items-center justify-center shrink-0 mr-2">
            <img src={mic} alt="" className="cursor-pointer" />
          </button>
          <button
            onClick={() => setIsAiPanelOpen(false)}
            className="w-[11px] h-[11px] flex items-center justify-center hover:opacity-60 cursor-pointer shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M1 1L10 10M10 1L1 10"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="h-px shrink-0 top-[4px] relative" style={{ background: "#2a2a2a" }} />

      <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="shrink-0">
          <div className="chatIntro relative px-[14px] pt-2">
            <button
              onClick={onOpenBriefing}
              className="flex items-center justify-between px-[10px] py-[3px] mt-2 rounded-[20px] shrink-0 self-start cursor-pointer"
              style={{ background: "#fed400" }}
            >
              <div className="flex items-center gap-[6px]">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="13" viewBox="0 0 12 13" fill="none">
                  <path
                    d="M10.8674 6.47235L7.2792 7.8858L5.97448 11.7731C5.94402 11.862 5.88917 11.9386 5.8173 11.9928C5.74543 12.0469 5.65999 12.076 5.57245 12.076C5.48491 12.076 5.39947 12.0469 5.3276 11.9928C5.25573 11.9386 5.20088 11.862 5.17042 11.7731L3.86785 7.8858L0.279604 6.47235C0.197536 6.43935 0.126756 6.37993 0.0767734 6.30207C0.0267908 6.22422 0 6.13165 0 6.03682C0 5.94199 0.0267908 5.84942 0.0767734 5.77157C0.126756 5.69371 0.197536 5.63429 0.279604 5.60129L3.86785 4.19017L5.17256 0.302904C5.20303 0.213997 5.25788 0.137319 5.32974 0.0831711C5.40161 0.0290234 5.48705 0 5.57459 0C5.66213 0 5.74758 0.0290234 5.81944 0.0831711C5.89131 0.137319 5.94616 0.213997 5.97662 0.302904L7.28134 4.19017L10.8696 5.60361C10.9509 5.63728 11.0208 5.69694 11.07 5.77467C11.1192 5.8524 11.1455 5.94451 11.1453 6.03878C11.145 6.13305 11.1183 6.22502 11.0687 6.30246C11.0191 6.3799 10.9489 6.43915 10.8674 6.47235Z"
                    fill="black"
                  />
                </svg>
                <span className="text-[12px] text-black leading-[21px]">
                  {"Today's "}
                  <span className="font-bold">AI Insights</span>
                </span>
              </div>
              <svg width="6" height="11" viewBox="0 0 6 11" fill="none" className="ml-[29px]">
                <path
                  d="M1 1L5 5.5L1 10"
                  stroke="black"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="flex flex-col gap-[0px] mb-[10px] mt-[10px]">
              <p className="text-[11px] leading-[20px] text-[#ebedef] whitespace-pre-wrap">
                <span className="font-bold text-white">던킨</span>
                <span>의 </span>
                <span className="font-bold text-white">생산·주문·매출</span>
                <span>을 한 번에!! </span>
              </p>
              <p className="text-[11px] leading-[20px] text-[#ebedef]">
                <span>운영을 돕는 </span>
                <span className="font-bold text-[#C0E183]">올인원 </span>
                <span className="font-bold text-white">AI, PIP</span>
              </p>
              <p className="text-[10px] leading-[16px] text-[#8a8a8a] mt-[4px]">
                {PAGE_CONTEXT[selectedMenu] ?? selectedMenu} 분석 중
              </p>
            </div>
          </div>

          <div className="h-px shrink-0 w-full absolute left-0" style={{ background: "#2a2a2a" }} />
        </div>

        <div ref={chatRef} className="chat scrolled relative top-1 min-h-0 flex-1 overflow-y-auto px-[14px] py-[4px]">
          {messages.map((msg) =>
            msg.type === "user" ? (
              <div key={msg.id} className="flex flex-col items-end gap-[4px] mt-5 z-20 scrolled">
                <div className="max-w-[82%] px-[10px] py-[6px]" style={{ background: "#ffffff", borderRadius: "10px 10px 0px 10px", zIndex: 30 }}>
                  {msg.lines.map((line, i) => (
                    <p key={i} className="text-[#2c3036] text-[10px] font-[500] leading-[1.5]">
                      {line}
                    </p>
                  ))}
                </div>
                <p className="text-[#b3b3b3] text-[7px] leading-[20px]">{msg.time}</p>
              </div>
            ) : (
              <div key={msg.id} className="flex flex-col items-start" style={{ marginTop: msg.id.startsWith("welcome-") ? "6px" : "16px" }}>
                <div className="flex flex-col items-start gap-[4px] w-full">
                  {msg.markdown ? (
                      <div className="px-[10px] py-[6px] max-w-[100%] w-full overflow-x-auto" style={{ background: "#2a97c8", borderRadius: "10px 10px 10px 0px", zIndex: 30 }}>
                        <ReactMarkdown
                          components={{
                            table: ({ children }) => <div className="overflow-x-auto"><table className="w-full text-[10px] border-collapse">{children}</table></div>,
                            th: ({ children }) => <th className="border border-white/30 px-[6px] py-[3px] text-white font-bold text-[10px] text-left">{children}</th>,
                            td: ({ children }) => <td className="border border-white/30 px-[6px] py-[3px] text-white text-[10px]">{children}</td>,
                            tr: ({ children }) => <tr className="text-white">{children}</tr>,
                            p: ({ children }) => <p className="text-white text-[10px] font-[500] leading-[1.5] mb-[6px]">{children}</p>,
                            strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                            em: ({ children }) => <em className="italic opacity-80">{children}</em>,
                            h3: ({ children }) => <h3 className="text-[11px] font-bold text-white mb-[4px]">{children}</h3>,
                            ul: ({ children }) => <ul className="list-disc list-inside text-white text-[10px] leading-[1.5] space-y-[2px]">{children}</ul>,
                            li: ({ children }) => <li className="text-white text-[10px] leading-[1.5]">{children}</li>,
                          }}
                        >{msg.markdown}</ReactMarkdown>
                      </div>
                    ) : msg.lines.length > 0 ? (
                      <div className="px-[10px] py-[6px] max-w-[100%] w-full" style={{ background: "#2a97c8", borderRadius: "10px 10px 10px 0px", zIndex: 30 }}>
                        {msg.lines.map((line, i) => (
                          <p key={i} className="text-white text-[10px] font-[500] leading-[1.5]">
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}

                  {msg.insightCard && (
                    <div className="w-full rounded-[10px] overflow-hidden" style={{ background: "#1e2a3a", border: "1px solid rgba(42, 151, 200, 0.3)", zIndex: 30 }}>
                      <div className="px-[10px] pt-[8px] pb-[4px]">
                        <p className="text-[11px] font-bold text-white leading-[1.3]">{msg.insightCard.title}</p>
                        {msg.insightCard.description && (
                          <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-[1.4] mt-[3px]">{msg.insightCard.description}</p>
                        )}
                      </div>
                      <div className="px-[10px] py-[6px]" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {msg.insightCard.rows.length > 0 && (() => {
                          const hasFirst = msg.insightCard.rows.some((r) => r.firstProductionInfo);
                          const hasSecond = msg.insightCard.rows.some((r) => r.secondProductionInfo);
                          if (hasFirst || hasSecond) {
                            return (
                              <div className="mb-[4px]" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", columnGap: "6px", alignItems: "center" }}>
                                <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)]">품목</p>
                                {hasFirst && <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)] text-right">1차 4주 평균</p>}
                                {hasSecond && <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)] text-right">2차 4주 평균</p>}
                              </div>
                            );
                          }
                          return (
                            <div className="mb-[4px]" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 6px", alignItems: "center" }}>
                              <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)]">품목</p>
                            {msg.insightCard.rows.some((r) => r.current != null) && (
                              <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)] text-right">즉시 필요</p>
                            )}
                            {msg.insightCard.rows.some((r) => r.target != null || r.recommended != null) && (
                              <p className="text-[8px] font-bold text-[rgba(255,255,255,0.4)] text-right">일일 권장</p>
                            )}
                            </div>
                          );
                        })()}
                        {msg.insightCard.rows.map((row, ri) => {
                          const hasFirst = row.firstProductionInfo;
                          const hasSecond = row.secondProductionInfo;
                          if (hasFirst || hasSecond) {
                            return (
                              <div key={ri} className="flex flex-col gap-[2px]">
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", columnGap: "6px", alignItems: "center", minHeight: "14px" }}>
                                  <p className="text-[10px] text-white font-[500] leading-[1.3] pr-[4px] truncate">{row.label}</p>
                                  {hasFirst ? (
                                    <p className="text-[9px] text-[rgba(255,255,255,0.8)] text-right font-[500]">{row.firstProductionInfo}</p>
                                  ) : <span />}
                                  {hasSecond ? (
                                    <p className="text-[9px] text-[rgba(255,255,255,0.8)] text-right font-[500]">{row.secondProductionInfo}</p>
                                  ) : <span />}
                                </div>
                                <div className="flex gap-[8px] pl-[4px]">
                                  {row.current != null && (
                                    <p className="text-[8px] text-[#ff7b7b]">즉시 생산 필요 {formatCount(row.current)}개</p>
                                  )}
                                  {row.recommended != null && (
                                    <p className="text-[8px] text-[rgba(255,255,255,0.5)]">일일 권장 {formatCount(row.recommended)}개</p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 6px", alignItems: "center", minHeight: "14px" }}>
                              <p className="text-[10px] text-white font-[500] leading-[1.3] pr-[4px] truncate">{row.label}</p>
                              {row.current != null && (
                                <p className="text-[10px] font-bold text-right" style={{ color: row.target != null && row.current < row.target ? "#ff7b7b" : "#8be08b" }}>
                                  {formatCount(row.current)}
                                </p>
                              )}
                              {row.target != null ? (
                                <p className="text-[10px] text-[rgba(255,255,255,0.7)] text-right">{formatCount(row.target)}</p>
                              ) : row.recommended != null ? (
                                <p className="text-[10px] text-[rgba(255,255,255,0.7)] text-right">{formatCount(row.recommended)}</p>
                              ) : (
                                <span />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(msg.insightCard.summaryLabel || msg.insightCard.summaryValue) && (
                        <div className="px-[10px] py-[6px]" style={{ background: "rgba(42, 151, 200, 0.15)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p className="text-[10px] font-[500] text-[rgba(255,255,255,0.8)]">{msg.insightCard.summaryLabel}</p>
                            <p className="text-[11px] font-bold text-white">{msg.insightCard.summaryValue}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.actionCards && msg.actionCards.length > 0 && (
                    <div className="w-full rounded-[10px] overflow-hidden" style={{ background: "#1e2a3a", border: "1px solid rgba(42, 151, 200, 0.3)", zIndex: 30 }}>
                      <div className="px-[10px] py-[6px]">
                        {msg.actionCards.map((card, ci) => (
                          <div key={ci} className="flex flex-col gap-[3px]">
                            <p className="text-[10px] font-bold text-white">{card.title}</p>
                            {card.body && (
                              <p className="text-[9px] text-[rgba(255,255,255,0.7)] leading-[1.4]">{card.body}</p>
                            )}
                            {card.actions && card.actions.length > 0 && (
                              <div className="flex flex-wrap gap-[3px]">
                                {card.actions.map((action, ai) => (
                                  <div key={ai} className="flex flex-col gap-[2px]">
                                    <button
                                      onClick={() => void handleAction(msg.id, ci, ai, action)}
                                      className="px-[6px] py-[3px] rounded-[6px] text-[9px] text-white font-bold cursor-pointer hover:opacity-80 disabled:opacity-50"
                                      style={{ background: "rgba(255,255,255,0.2)" }}
                                      disabled={actionStates[`${msg.id}-${ci}-${ai}`]?.status === "running"}
                                    >
                                      {action.label}
                                    </button>
                                    {actionStates[`${msg.id}-${ci}-${ai}`]?.message && (
                                      <p className={`text-[7px] ${actionStates[`${msg.id}-${ci}-${ai}`]?.status === "failed" ? "text-[#ffd5d5]" : "text-[rgba(255,255,255,0.6)]"}`}>
                                        {actionStates[`${msg.id}-${ci}-${ai}`]?.message}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-[4px]">
                      {msg.actions.map((btn, bi) => (
                        <button
                          key={bi}
                          onClick={() => handleActionButton(btn)}
                          className="px-[10px] py-[4px] rounded-[8px] text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity"
                          style={btn.variant === "primary"
                            ? { background: "#2a97c8", color: "#fff" }
                            : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }
                          }
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-[5px] mt-[5px]">
                    {msg.suggestedQuestions.map((sq, si) => (
                      <button
                        key={si}
                        onClick={() => sendMessage(sq.text)}
                        className="px-[6px] py-[2px] rounded-[10px] text-[8px] text-[#fff] opacity-80 font-[500] cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(195, 226, 137, 0.12)", border: "1px solid #fff", opacity: 0.8 }}
                      >
                        {sq.text}
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-[#b3b3b3] text-[7px] leading-[20px]">{msg.time}</p>
              </div>
            ),
          )}

          {isTyping && (
            <div className="flex flex-col items-start gap-[4px] mt-5">
              <div className="px-[10px] py-[6px] max-w-[100%] w-full" style={{ background: "#2a97c8", borderRadius: "10px 10px 10px 0px", zIndex: 30 }}>
                <div className="flex gap-[4px] items-center">
                  <span className="inline-block w-[5px] h-[5px] rounded-full bg-white/70" style={{ animation: "pipTyping 1.2s ease-in-out 0s infinite" }} />
                  <span className="inline-block w-[5px] h-[5px] rounded-full bg-white/70" style={{ animation: "pipTyping 1.2s ease-in-out 0.2s infinite" }} />
                  <span className="inline-block w-[5px] h-[5px] rounded-full bg-white/70" style={{ animation: "pipTyping 1.2s ease-in-out 0.4s infinite" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <img src={chatstar} alt="" className="pointer-events-none absolute bottom-[74px] right-[14px] w-[120px] max-w-[45%] opacity-40" />
      </div>

      <div className="shrink-0 px-[14px] pb-[16px] pt-[6px]">
        <div className="h-[37px] flex items-center pl-[12px] pr-[10px] gap-[6px] overflow-hidden" style={{ background: "#3d454f", borderRadius: "10px" }}>
          <input
            className="flex-1 bg-transparent text-[11px] font-bold text-[#b3bac3] placeholder:text-[#b3bac3] outline-none leading-normal min-w-0"
            placeholder="what's in your mind..?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void sendMessage(input);
              }
            }}
            disabled={isTyping}
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={isTyping}
            className="shrink-0 size-[14px] flex items-center justify-center hover:opacity-60 cursor-pointer disabled:opacity-40"
          >
            <img src={submit} alt="" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pipTyping {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
