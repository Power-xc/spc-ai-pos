import { useState, useRef, useEffect, useCallback } from "react";
import mic from "../../assets/mic.svg";
import chatstar from "../../assets/chat-star.svg";
import submit from "../../assets/Submit Icon.svg";
import {
  getDemoDateTimeLabel,
  getDemoDateTimeState,
  appendDemoQueryParams,
} from "../../lib/demoDateTime";
import {
  getAiPerformanceData,
  getProductionAgent,
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
import {
  BENCHMARK_COMPARE_STORE_OPTIONS,
  getBenchmarkCompareStoreIds,
  setBenchmarkCompareStoreIds,
} from "../../lib/benchmarkCompareStores";

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

interface Message {
  id: string;
  type: "user" | "ai";
  lines: string[];
  time: string;
  actionCards?: ActionCard[];
  suggestedQuestions?: SuggestedQuestion[];
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
  | "ORDER_RECOMMEND"
  | "ORDER_COMPARISON"
  | "ORDER_RATIONALE"
  | "ORDER_EXCEPTION"
  | "ORDER_FINAL_SUMMARY"
  | "ORDER_SAFE_OPTION"
  | "INVENTORY_RISK"
  | "FORECAST"
  | "PRODUCTION_RECOMMEND"
  | "PERF_MONTHLY"
  | "PERF_DELIVERY_WEEKLY"
  | "PERF_DELIVERY_MONTHLY"
  | "PERF_CHANNEL_MIX"
  | "PERF_PRODUCT_COMPARE"
  | "PERF_STORE_AVG"
  | "PROMO_RESPONSE"
  | "PROMO_SALES"
  | "PROMO_HOURLY"
  | "PROMO_STORE_COMPARE"
  | "CHANCE_LOSS"
  | "MENU_SUMMARY"
  | "UNKNOWN";

type LocalMenuResponse = {
  lines: string[];
  suggestedQuestions?: SuggestedQuestion[];
  actionCards?: ActionCard[];
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

const QUICK_CHIPS: Record<string, string[]> = {
  "종합 현황": ["오늘 핵심 이슈 요약해줘", "이번 달 일평균 매출을 타 점포 평균과 비교해줘", "벤치마킹이 뭔데"],
  "AI 실시간 현황": ["현재 재고 현황과 부족 예상 품목 알려줘", "1시간 뒤 예상 재고량 보여줘", "1차/2차 생산 권장량 알려줘"],
  생산관리: ["현재 재고 현황과 부족 예상 품목 알려줘", "1시간 뒤 예상 재고량 보여줘", "1차/2차 생산 권장량 알려줘"],
  "발주 관리": [
    "주문 마감 전 추천 옵션 보여줘",
    "전주/전전주/전월 기준으로 비교해줘",
    "각 옵션의 근거를 보여줘",
    "단체 주문은 제외해서 다시 계산해줘",
    "최종 선택 전에 차이를 요약해줘",
    "지금 어떤 옵션이 가장 안전한지 알려줘",
  ],
  프로모션: ["반응 좋은 프로모션", "프로모션 매출 기여도", "시간대별 강한 프로모션", "점포별 프로모션 차이"],
  "AI 기반 성과 분석": [
    "월간 매출 비교",
    "전주 배달 건수 비교",
    "전월 배달 건수 비교",
    "채널별 매출 비중",
    "글레이즈드 전월 비교",
    "타 점포 평균 비교",
    "반응 좋은 프로모션",
    "프로모션 매출 기여도",
  ],
  "AI 검증": ["이 화면에서 뭘 봐야 해", "각 옵션의 근거를 보여줘", "최종 선택 전에 차이를 요약해줘"],
  벤치마킹: [
    "이번 달 일평균 매출을 타 점포 평균과 비교해줘",
    "벤치마킹이 뭔데",
    "나보다 매출 높은데 유사한 매장 알려줘",
  ],
  "알람 설정": ["왜 지금 알림이 떴는지 설명해줘", "알림 꺼줘", "알람 상태 알려줘"],
};

const FOLLOWUP_CHIPS: Record<string, string[]> = {
  INVENTORY_RISK: ["1시간 뒤 예상 재고량", "1차/2차 생산 권장량"],
  FORECAST: ["재고 현황과 부족 품목", "1차/2차 생산 권장량"],
  PRODUCTION_RECOMMEND: ["재고 현황과 부족 품목", "1시간 뒤 예상 재고량"],
  ORDER_RECOMMEND: ["전주/전월 기준 비교", "각 옵션 근거", "가장 안전한 옵션"],
  ORDER_COMPARISON: ["추천 옵션 보여줘", "각 옵션 근거", "최종 선택 차이 요약"],
  ORDER_RATIONALE: ["추천 옵션 보여줘", "단체 주문 제외 계산", "최종 선택 차이 요약"],
  ORDER_EXCEPTION: ["추천 옵션 보여줘", "각 옵션 근거", "가장 안전한 옵션"],
  ORDER_FINAL_SUMMARY: ["전주/전월 기준 비교", "각 옵션 근거", "가장 안전한 옵션"],
  ORDER_SAFE_OPTION: ["추천 옵션 보여줘", "전주/전월 기준 비교", "단체 주문 제외 계산"],
  PERF_MONTHLY: ["전주 배달 건수 비교", "채널별 매출 비중", "글레이즈드 전월 비교"],
  PERF_DELIVERY_WEEKLY: ["전월 배달 건수 비교", "채널별 매출 비중", "타 점포 평균 비교"],
  PERF_DELIVERY_MONTHLY: ["전주 배달 건수 비교", "채널별 매출 비중", "월간 매출 비교"],
  PERF_CHANNEL_MIX: ["전주 배달 건수 비교", "전월 배달 건수 비교", "타 점포 평균 비교"],
  PERF_PRODUCT_COMPARE: ["월간 매출 비교", "타 점포 평균 비교", "채널별 매출 비중"],
  PERF_STORE_AVG: ["월간 매출 비교", "채널별 매출 비중", "글레이즈드 전월 비교"],
  PROMO_RESPONSE: ["매출 기여도", "시간대별 강한 프로모션", "점포별 차이"],
  PROMO_SALES: ["반응 좋은 프로모션", "시간대별 강한 프로모션", "점포별 차이"],
  PROMO_HOURLY: ["반응 좋은 프로모션", "점포별 차이", "매출 기여도"],
  PROMO_STORE_COMPARE: ["반응 좋은 프로모션", "매출 기여도", "시간대별 강한 프로모션"],
};

const DEFAULT_CHIPS = ["너는 뭘 할 수 있어", "니가 뭔데", "이 화면에서 뭘 봐야 해"];

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

const PRODUCT_CODE_NAME_MAP: Record<string, string> = {
  "700721": "초코파우더(길라델리)",
  "811902": "미니글레이즈드",
  "811962": "미니스트로베리필드",
  "811963": "미니초코링",
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

function formatBurnRate(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0개/시간";
  return `${numeric.toFixed(1)}개/시간`;
}

function getStockDisplay(rawValue: number | null | undefined) {
  const numeric = Number(rawValue ?? 0);
  const currentCount = Math.max(0, Math.round(numeric));
  const shortage = Math.max(0, Math.round(-numeric));
  return {
    currentCount,
    shortage,
    currentLabel: `현재 보유 ${formatCount(currentCount)}개`,
    badgeLabel: shortage > 0 ? `부족 ${formatCount(shortage)}개` : `${formatCount(currentCount)}개`,
  };
}

function hasMeaningfulProductName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 1 && normalized !== "B" && normalized !== "미분류";
}

function resolveProductDisplayName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return PRODUCT_CODE_NAME_MAP[normalized] ?? normalized;
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
  if (/(단체 주문|대형 예약|예약 주문|행사 주문).*(제외|빼고|제외해서|다시 계산)/.test(lower)) {
    return "ORDER_EXCEPTION";
  }
  if (/(최종 선택|최종 확정|차이).*(요약|정리)|요약.*최종 선택/.test(lower)) {
    return "ORDER_FINAL_SUMMARY";
  }
  if (/(어떤 옵션|어느 옵션|가장 안전).*(안전|무난|괜찮)|안전한지 알려줘/.test(lower)) {
    return "ORDER_SAFE_OPTION";
  }
  if (/옵션.*근거|근거.*보여|왜.*수량|각.*옵션.*근거/.test(lower)) return "ORDER_RATIONALE";
  if (
    /(전주.*전전주|전전주.*전월|전주.*전월|전주\/전전주\/전월|옵션.*비교|주문.*기준.*비교|발주.*기준.*비교|전주.*기준으로 비교|전전주.*기준으로 비교|전월.*기준으로 비교)/.test(
      lower,
    )
  ) {
    return "ORDER_COMPARISON";
  }
  if (/주문.*추천|추천.*주문|추천.*옵션|옵션.*보여|주문 마감.*추천|발주 추천|발주 옵션|발주 마감/.test(lower)) {
    return "ORDER_RECOMMEND";
  }
  if (/1시간.*뒤.*예상|예상.*재고.*1시간|1시간.*예상.*재고/.test(lower)) return "FORECAST";
  if (/1차.*2차.*생산|생산.*권장량|권장.*생산/.test(lower)) return "PRODUCTION_RECOMMEND";
  if (/(최근.*월간.*매출|월간.*매출.*비교|최근 월간 매출 비교|최근 월간 비교|26년 2월.*26년 1월|2월.*1월.*매출)/.test(lower)) {
    return "PERF_MONTHLY";
  }
  if (/전주.*배달.*건수/.test(lower)) return "PERF_DELIVERY_WEEKLY";
  if (/전월.*배달.*건수|이번 달.*배달.*지난 달|지난달.*배달.*건수/.test(lower)) {
    return "PERF_DELIVERY_MONTHLY";
  }
  if (/배달.*채널.*비중|채널별.*매출.*비중|배달 채널별/.test(lower)) return "PERF_CHANNEL_MIX";
  if (/(글레이즈드|glazed).*(전월|지난달).*매출|글레이즈드.*비교/.test(lower)) {
    return "PERF_PRODUCT_COMPARE";
  }
  if (/(일평균 매출|타 점포 평균|점포 평균과 비교|최근 30일.*평균).*(비교|알려)/.test(lower)) {
    return "PERF_STORE_AVG";
  }
  if (/재고.*현황|부족.*예상|부족.*품목|재고.*부족|품절.*위험|현재.*재고/.test(lower)) return "INVENTORY_RISK";
  if (/생산.*우선순위|지금.*생산|어떤.*품목.*생산/.test(lower)) return "INVENTORY_RISK";
  if (/예측.*정확도|검증|오차|±10/.test(lower)) return "PRODUCTION_RECOMMEND";
  if (/알림.*이유|알림.*뜳|왜.*알림|알림.*시점/.test(lower)) return "INVENTORY_RISK";
  if (/반응.*좋은|반응.*프로모션|좋은.*프로모션/.test(lower)) return "PROMO_RESPONSE";
  if (/매출.*기여|기여도|프로모션.*매출/.test(lower)) return "PROMO_SALES";
  if (/시간대별.*프로모션|시간대별.*강한|강한.*프로모션/.test(lower)) return "PROMO_HOURLY";
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
    joined === "자동 인사이트 생성에 실패해 정형 결과만 제공합니다." ||
    joined === "죄송합니다. 현재 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

function findMentionedBenchmarkStoreIds(message: string) {
  const matches = BENCHMARK_COMPARE_STORE_OPTIONS.filter(
    (store) => message.includes(store.storeName) || message.includes(store.storeId),
  ).map((store) => store.storeId);
  return Array.from(new Set(matches));
}

function shouldPreferLocalFirst(selectedMenu: string, intent: LocalIntent) {
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
    intent === "ORDER_RECOMMEND" ||
    intent === "ORDER_COMPARISON" ||
    intent === "ORDER_RATIONALE" ||
    intent === "ORDER_EXCEPTION" ||
    intent === "ORDER_FINAL_SUMMARY" ||
    intent === "ORDER_SAFE_OPTION" ||
    intent === "INVENTORY_RISK" ||
    intent === "FORECAST" ||
    intent === "PRODUCTION_RECOMMEND" ||
    intent === "PERF_MONTHLY" ||
    intent === "PERF_DELIVERY_WEEKLY" ||
    intent === "PERF_DELIVERY_MONTHLY" ||
    intent === "PERF_CHANNEL_MIX" ||
    intent === "PERF_PRODUCT_COMPARE" ||
    intent === "PERF_STORE_AVG" ||
    intent === "PROMO_RESPONSE" ||
    intent === "PROMO_SALES" ||
    intent === "PROMO_HOURLY" ||
    intent === "PROMO_STORE_COMPARE" ||
    intent === "CHANCE_LOSS" ||
    intent === "MENU_SUMMARY"
  ) {
    return true;
  }
  return selectedMenu === "생산관리" || selectedMenu === "발주 관리" || selectedMenu === "AI 실시간 현황" || selectedMenu === "프로모션";
}

function shouldPreferSalesQueryFirst(selectedMenu: string, message: string, intent: LocalIntent) {
  if (intent !== "UNKNOWN") return false;
  const lower = message.toLowerCase();
  if (/(프로모션|캠페인)/.test(lower)) return false;
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
): Promise<BackendChatResponse> {
  const demo = getDemoDateTimeState();
  return requestJson<BackendChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({
      store_id: STORE_ID,
      message,
      session_id: sessionId,
      context: {
        page: PAGE_CONTEXT[selectedMenu] ?? selectedMenu,
        menu: selectedMenu,
        store_name: DEMO_PRIMARY_STORE_NAME,
        demo_date: demo.date,
        demo_time: demo.time,
        demo_datetime: demo.iso,
        benchmark_compare_store_ids: getBenchmarkCompareStoreIds(),
        benchmark_compare_store_names: getBenchmarkCompareStoreIds().map((storeId) =>
          resolveDemoStoreName(storeId, storeId),
        ),
      },
    }),
  });
}

async function fetchSalesQuery(message: string) {
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
  }>("/v1/sales/query", {
    method: "POST",
    body: JSON.stringify({
      store_id: STORE_ID,
      query: message,
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
          "프로모션 화면은 프로모션 전용 실측이 아니라 캠페인 실적 기반 성과와 적용 시뮬레이션을 함께 보여줍니다.",
          "최근 반응이 좋았던 캠페인과 적용 전후 예상 차이를 같이 확인하도록 구성했습니다.",
        ],
        "new_campaign_day_gold 기반 최근 집계와 파생 시뮬레이션을 함께 사용합니다.",
        "성과 높은 캠페인 1건과 관찰 필요 캠페인 1건을 골라 적용 전후 차이를 확인하세요.",
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
      focus: "성과 높은 캠페인, 관찰 필요 캠페인, 적용 전후 예상 차이를 먼저 보시면 됩니다.",
      action: "적용 전후 증분 매출이 큰 캠페인부터 검토하세요.",
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
      "정형 결과를 기준으로 비교를 정리했습니다.";
    const actions = extractActionItems(sections);
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

async function buildDashboardResponse(message: string): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const [salesSummary, analyticsSummary, deadlines, homeBriefing] = await Promise.all([
    requestJson<{
      today_revenue?: number;
      vs_yesterday_same_time_pct?: number;
      top_selling?: Array<{
        product_name?: string;
        qty?: number;
        revenue?: number;
      }>;
    }>("/home/sales-summary").catch(() => null),
    requestJson<{
      chance_loss_est?: number;
      products_with_stockout?: number;
    }>(`/v1/analytics/summary?store_id=${STORE_ID}`).catch(() => null),
    requestJson<
      Array<{
        product_group?: string;
        deadline?: string;
        status?: string;
        minutes_remaining?: number;
      }>
    >("/order/deadlines").catch(() => []),
    requestJson<{
      active_alerts?: Array<{
        alert_type?: string;
        severity?: string;
        message?: string;
        product_name?: string;
      }>;
    }>("/home/briefing").catch(() => null),
  ]);

  const topItem =
    (salesSummary?.top_selling ?? []).find((item) => hasMeaningfulProductName(item.product_name)) ??
    null;
  const urgentDeadline =
    (deadlines ?? []).find((item) => item.status === "urgent" || item.status === "soon") ??
    (deadlines ?? [])[0] ??
    null;
  const topAlert = homeBriefing?.active_alerts?.[0] ?? null;
  const lines =
    classifyLocalIntent(message) === "CHANCE_LOSS"
      ? addGroundingAndAction(
          [
            `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME} 종합 현황입니다.`,
            `의미: 현재 추정 기회손실은 ${formatKrw(analyticsSummary?.chance_loss_est)}이고 품절 위험 상품은 ${formatCount(analyticsSummary?.products_with_stockout)}개입니다.`,
            topItem
              ? `상위 판매 상품은 ${resolveProductDisplayName(topItem.product_name)} ${formatCount(topItem.qty)}개입니다.`
              : "상위 판매 상품 데이터는 정리 중입니다.",
            topAlert?.message ||
              (urgentDeadline
                ? `${urgentDeadline.product_group ?? "주문"} 발주 마감은 ${urgentDeadline.deadline ?? "-"}이며 상태는 ${urgentDeadline.status ?? "-"}입니다.`
                : "현재 종합 현황 기준 긴급 이슈는 없습니다."),
          ],
          "실적 기반 추정 + 전일 동시간/기회손실 집계",
          urgentDeadline
            ? `${urgentDeadline.product_group ?? "주문"} 마감 전 추천 옵션을 먼저 확인하세요.`
            : topItem
              ? `${resolveProductDisplayName(topItem.product_name)} 재고와 진열 상태를 먼저 점검하세요.`
              : "현재 핵심 수치를 다시 확인하고 다음 액션을 준비하세요.",
        )
      : addGroundingAndAction(
          [
            `${demoLabel} 기준 ${DEMO_PRIMARY_STORE_NAME} 종합 현황입니다.`,
            `의미: 오늘 매출은 ${formatKrw(salesSummary?.today_revenue)}이고 전일 동시간 대비 ${Number(salesSummary?.vs_yesterday_same_time_pct ?? 0) > 0 ? "+" : ""}${Number(salesSummary?.vs_yesterday_same_time_pct ?? 0).toFixed(1)}%입니다.`,
            `현재 추정 기회손실은 ${formatKrw(analyticsSummary?.chance_loss_est)}이며 품절 위험 상품은 ${formatCount(analyticsSummary?.products_with_stockout)}개입니다.`,
            urgentDeadline
              ? `${urgentDeadline.product_group ?? "주문"} 발주 마감은 ${urgentDeadline.deadline ?? "-"}이며 상태는 ${urgentDeadline.status ?? "-"}입니다.`
              : topAlert?.message ||
                (topItem
                  ? `현재 상위 판매 상품은 ${resolveProductDisplayName(topItem.product_name)} ${formatCount(topItem.qty)}개입니다.`
                  : "현재 화면에서 즉시 대응할 주요 이슈는 없습니다."),
          ],
          "전일 동시간 매출, 기회손실 추정, 발주 마감 데이터",
          urgentDeadline
            ? `${urgentDeadline.product_group ?? "주문"} 마감 전 추천 발주를 검토하세요.`
            : analyticsSummary?.products_with_stockout
              ? "품절 위험 상품부터 생산/발주 대응 여부를 확인하세요."
              : "상위 판매 상품과 매출 흐름을 먼저 점검하세요.",
        );
  return {
    lines,
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["종합 현황"]),
    actionCards: [buildNavigationCard("종합 현황 확인", "핵심 수치와 추천 액션을 다시 확인합니다.", "/")],
  };
}

async function buildProductionResponse(message: string): Promise<LocalMenuResponse> {
  const intent = classifyLocalIntent(message);

  try {
    const production = await getProductionAgent();
    const productionItems = production.items;
    const lowItems = productionItems.filter((item) => item.isLow);

    const chips = (key: string) => toSuggestedQuestions(FOLLOWUP_CHIPS[key] ?? QUICK_CHIPS["생산관리"]);

    // === INVENTORY_RISK: 현재 재고 현황과 부족 예상 품목 ===
    if (intent === "INVENTORY_RISK") {
      const top3 = lowItems.slice(0, 3);
      const lines = top3.length > 0
        ? [
            `현재 부족 예상 품목은 ${lowItems.length}개입니다.`,
            ...top3.map((item) => {
              const parts = [
                item.name,
                item.currentLabel,
                item.shortage && item.shortage > 0 ? `부족 ${formatCount(item.shortage)}개` : null,
                item.statusLabel,
              ].filter(Boolean);
              return parts.join(" · ");
            }),
          ]
        : ["현재 부족 예상 품목은 없습니다."];
      const topRec = lowItems[0];
      return {
        lines: addGroundingAndAction(
          lines,
          topRec?.groundingLabel ?? "최근 1시간 판매 속도와 최근 4주 동일 요일 패턴 기준",
          topRec?.actionLabel ?? "생산 우선순위 상위 품목부터 확인하세요.",
        ),
        suggestedQuestions: chips("INVENTORY_RISK"),
      };
    }

    // === FORECAST: 1시간 뒤 예상 재고량 ===
    if (intent === "FORECAST") {
      const items = lowItems.slice(0, 3);
      const lines = items.length > 0
        ? [
            `1시간 뒤 예상 재고 기준 우선 확인 품목입니다.`,
            ...items.map((item) => {
              const probability = Math.round(Number(item.stockoutProbability ?? 0) * 100);
              return [
                item.name,
                item.currentLabel,
                item.predictedLabel,
                probability > 0 ? `품절 확률 ${probability}%` : null,
              ]
                .filter(Boolean)
                .join(" · ");
            }),
          ]
        : ["1시간 내 품절 위험이 높은 품목은 현재 없습니다."];
      if (items[0]?.statusDescription) {
        lines.push(`알림 사유: ${items[0].statusDescription}`);
      }
      return {
        lines: addGroundingAndAction(
          lines,
          items[0]?.groundingLabel ?? "4주 동일 요일 패턴과 현재 판매 속도 기준",
          items[0]?.actionLabel ?? "현재 즉시 대응이 필요한 품목은 없습니다.",
        ),
        suggestedQuestions: chips("FORECAST"),
      };
    }

    // === PRODUCTION_RECOMMEND: 1차/2차 생산 권장량 ===
    if (intent === "PRODUCTION_RECOMMEND") {
      const items = lowItems.slice(0, 3);
      const lines = items.length > 0
        ? [
            `최근 4주 생산 패턴 기준 권장 생산량입니다.`,
            ...items.map((item) => {
              const first = item.firstProductionTime
                ? `${item.firstProductionTime} ${formatCount(Number(item.firstProductionQty ?? 0))}개`
                : "데이터 부족";
              const second = item.secondProductionTime
                ? `${item.secondProductionTime} ${formatCount(Number(item.secondProductionQty ?? 0))}개`
                : "데이터 부족";
              return `${item.name}: 권장 ${formatCount(item.recommendedProductionQty ?? 0)}개 · 1차 ${first} · 2차 ${second}`;
            }),
          ]
        : ["현재 생산 권장 품목이 없습니다."];
      return {
        lines: addGroundingAndAction(
          lines,
          "최근 4주 동일 요일 생산 이력 평균 (2차는 데이터 부족 시 명시)",
          items[0]?.actionLabel ?? "생산 관리 화면에서 권장량을 확인하세요.",
        ),
        suggestedQuestions: chips("PRODUCTION_RECOMMEND"),
      };
    }

    // Default fallback for production menu
    const topRec = lowItems[0] ?? productionItems[0];
    return {
      lines: addGroundingAndAction(
        [
          topRec
            ? [topRec.name, topRec.currentLabel, topRec.predictedLabel, topRec.statusLabel].filter(Boolean).join(" · ")
            : "현재 추가 생산 추천 품목이 없습니다.",
          ...(lowItems.length > 1
            ? [`부족 위험 품목 총 ${lowItems.length}개: ${lowItems.slice(0, 3).map((i) => i.name).join(", ")}${lowItems.length > 3 ? ` 외 ${lowItems.length - 3}개` : ""}`]
            : []),
        ],
        topRec?.groundingLabel ?? "최근 1시간 판매 속도와 리드타임 1시간 기준",
        topRec?.actionLabel ?? "생산관리 화면에서 권장량을 확인하세요.",
      ),
      suggestedQuestions: chips("INVENTORY_RISK"),
    };
  } catch {
    return {
      lines: addGroundingAndAction(
        ["생산 데이터를 불러오지 못했습니다.", "생산관리 화면 카드에서 직접 확인해 주세요."],
        "실시간 재고 재조회 실패",
        "생산관리 화면에서 부족 품목과 권장 생산량을 다시 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["생산관리"]),
    };
  }
}

async function buildOrderResponse(message: string): Promise<LocalMenuResponse> {
  const intent = classifyLocalIntent(message);
  const chips = (key: string) => toSuggestedQuestions(FOLLOWUP_CHIPS[key] ?? QUICK_CHIPS["발주 관리"]);

  const [recommendations, deadlines] = await Promise.all([
    requestJson<{
      target_date?: string;
      category?: string | null;
      deadline?: string | null;
      four_week_avg_qty?: number | null;
      explanation?: string | null;
      rationale?: {
        summary?: string | null;
        weather_impact?: { status?: string | null; note?: string | null } | null;
        event_impact?: { status?: string | null; note?: string | null } | null;
        mutual_support_impact?: { status?: string | null; note?: string | null } | null;
        time_band_impact?: { status?: string | null; note?: string | null } | null;
      } | null;
      options?: Array<{
        label?: string;
        reference_date?: string;
        total_qty?: number;
        total_amount?: number;
        deviation_from_avg_pct?: number | null;
        deviation_label?: string;
        flags?: string[];
        items?: Array<{
          product_id?: string;
          product_name?: string;
          quantity?: number;
          base_price?: number;
          category?: string | null;
          rationale?: string | null;
        }>;
      }>;
    }>("/order/recommendations").catch(() => null),
    requestJson<
      Array<{
        product_group?: string;
        deadline?: string;
        minutes_remaining?: number;
        status?: string;
        confirmed_order_count?: number;
      }>
    >("/order/deadlines").catch(() => []),
  ]);

  type OrderOption = {
    label: string;
    referenceDate: string | null;
    totalQty: number;
    totalAmount: number;
    deviationPct: number | null;
    deviationLabel: string;
    flags: string[];
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      basePrice: number;
    }>;
  };

  const formatReferenceDate = (value: string | null | undefined) =>
    String(value ?? "").trim() ? String(value).replace(/-/g, ".") : "기준일 없음";
  const humanizeDeadlineStatus = (value: string | null | undefined) => {
    const normalized = String(value ?? "").toLowerCase();
    if (normalized === "urgent") return "마감 임박";
    if (normalized === "soon") return "확인 필요";
    if (normalized === "scheduled") return "예정";
    if (normalized === "past_due") return "마감 지남";
    return "확인 필요";
  };
  const humanizeOrderFlag = (flag: string) => {
    const normalized = flag.trim().toUpperCase();
    if (normalized === "ESTIMATED_FROM_SALES") return "최근 실판매 흐름을 기준으로 계산했습니다.";
    if (normalized === "CAMPAIGN_PERIOD") return "최근 프로모션 영향이 일부 반영됐습니다.";
    if (normalized === "EVENT_ADJUSTED") return "행사 영향 가능성을 반영했습니다.";
    return null;
  };
  const getOptionMeaning = (label: string) => {
    if (label.includes("전주")) return "가장 최근 운영 패턴을 그대로 반영한 기본안";
    if (label.includes("전전주")) return "직전주보다 수요를 낮게 본 절감형 안";
    if (label.includes("전월")) return "월간 패턴을 반영한 안정형 안";
    return "실적 흐름을 기준으로 만든 추천안";
  };
  const buildTopItemsLabel = (option: OrderOption, limit = 3) => {
    const topItems = option.items.slice(0, limit);
    if (topItems.length === 0) return "대표 품목 데이터 없음";
    return topItems
      .map((item) => `${resolveProductDisplayName(item.productName)} ${formatCount(item.quantity)}개`)
      .join(", ");
  };
  const buildAverageDeltaText = (option: OrderOption) => {
    if (option.deviationPct == null) return "4주 평균과 비슷한 수준";
    const abs = Math.abs(option.deviationPct).toFixed(1);
    return option.deviationPct > 0
      ? `4주 평균보다 ${abs}% 많은 안`
      : option.deviationPct < 0
        ? `4주 평균보다 ${abs}% 적은 안`
        : "4주 평균과 같은 수준";
  };
  const pickSafestOption = (optionList: OrderOption[]) =>
    optionList
      .slice()
      .sort((a, b) => {
        const aScore = Math.abs(Number(a.deviationPct ?? 0)) + (a.label.includes("전주") ? -1 : 0);
        const bScore = Math.abs(Number(b.deviationPct ?? 0)) + (b.label.includes("전주") ? -1 : 0);
        return aScore - bScore || b.totalQty - a.totalQty;
      })[0] ?? null;
  const buildSpreadItems = (optionList: OrderOption[]) => {
    const spreadMap = new Map<string, { name: string; min: number; max: number }>();
    optionList.forEach((option) => {
      option.items.forEach((item) => {
        const key = item.productId || item.productName;
        const existing = spreadMap.get(key);
        if (!existing) {
          spreadMap.set(key, {
            name: resolveProductDisplayName(item.productName),
            min: item.quantity,
            max: item.quantity,
          });
          return;
        }
        existing.min = Math.min(existing.min, item.quantity);
        existing.max = Math.max(existing.max, item.quantity);
      });
    });
    return Array.from(spreadMap.values())
      .map((item) => ({
        ...item,
        diff: item.max - item.min,
      }))
      .filter((item) => item.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 3);
  };

  const options: OrderOption[] = (recommendations?.options ?? []).slice(0, 3).map((option) => ({
    label: String(option.label ?? "추천 옵션"),
    referenceDate: option.reference_date ?? null,
    totalQty: Math.round(Number(option.total_qty ?? 0)),
    totalAmount: Number(option.total_amount ?? 0),
    deviationPct:
      option.deviation_from_avg_pct == null ? null : Number(option.deviation_from_avg_pct),
    deviationLabel: String(option.deviation_label ?? "평균 수준"),
    flags: Array.isArray(option.flags) ? option.flags.map((flag) => String(flag)) : [],
    items: (option.items ?? []).map((item) => ({
      productId: String(item.product_id ?? ""),
      productName: resolveProductDisplayName(String(item.product_name ?? item.product_id ?? "품목")),
      quantity: Math.round(Number(item.quantity ?? 0)),
      basePrice: Number(item.base_price ?? 0),
    })),
  }));
  const optionSummary = options.map((option) => ({
    ...option,
    meaning: getOptionMeaning(option.label),
    topItemsLabel: buildTopItemsLabel(option, 3),
    avgDeltaText: buildAverageDeltaText(option),
  }));
  const safestOption = pickSafestOption(optionSummary);
  const focusDeadline =
    (deadlines ?? []).find((item) => item.product_group === "도넛") ??
    (deadlines ?? []).slice().sort((a, b) => Number(a.minutes_remaining ?? 9999) - Number(b.minutes_remaining ?? 9999))[0] ??
    null;
  const deadlineLine = focusDeadline
    ? `${focusDeadline.product_group ?? "주문"} 마감은 ${focusDeadline.deadline ?? "-"}이고 지금 ${formatCount(
        Math.max(0, Math.round(Number(focusDeadline.minutes_remaining ?? 0))),
      )}분 남았습니다.`
    : "현재 주문 마감 시간을 불러오지 못했습니다.";
  const deadlineAction = focusDeadline
    ? `${focusDeadline.deadline ?? "-"} 전까지 세 옵션을 비교한 뒤 최종 발주를 확정하세요.`
    : "추천 옵션을 비교해 오늘 발주안을 먼저 정리하세요.";
  const spreadItems = buildSpreadItems(optionSummary);
  const commonGrounding = joinCompact([
    "근거: 전주·전전주·전월 동요일 실적 비교",
    recommendations?.four_week_avg_qty != null
      ? `최근 4주 평균 ${formatCount(recommendations.four_week_avg_qty)}개와 편차 비교`
      : "최근 4주 평균 비교",
    optionSummary
      .flatMap((option) => option.flags.map((flag) => humanizeOrderFlag(flag)).filter(Boolean))
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(" / ") || "프로모션·이벤트 별도 태그는 제한적",
  ]);
  const externalFactorNotes = [
    recommendations?.rationale?.event_impact?.note,
    recommendations?.rationale?.weather_impact?.note,
    recommendations?.rationale?.time_band_impact?.note,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");

  if (optionSummary.length === 0) {
    return {
      lines: addGroundingAndAction(
        ["주문 추천 옵션 데이터를 불러오지 못했습니다.", deadlineLine],
        "발주 추천 API 재조회 실패",
        "발주 관리 화면에서 추천 옵션과 마감 시간을 다시 확인하세요.",
      ),
      suggestedQuestions: chips("ORDER_RECOMMEND"),
    };
  }

  if (intent === "ORDER_EXCEPTION") {
    const variableItems =
      spreadItems.length > 0
        ? spreadItems
            .map((item) => `${item.name} ${formatCount(item.diff)}개 차이`)
            .join(", ")
        : "옵션 간 편차가 큰 품목을 아직 찾지 못했습니다.";
    return {
      lines: addGroundingAndAction(
        [
          "현재 데이터에는 단체 주문이나 대형 예약을 구분하는 전용 태그가 없어 자동 완전 분리는 어렵습니다.",
          `대신 옵션 간 차이가 큰 품목은 ${variableItems}입니다.`,
          "행사나 예약 주문이 있으면 기본안에서 해당 품목 수량을 직접 더하거나 빼서 보정하는 방식이 가장 현실적입니다.",
        ],
        "옵션별 품목 수량 편차와 현재 추천안 비교",
        "행사·예약 주문이 있으면 전주 기준안을 기본으로 두고 해당 품목 수량만 수동 보정하세요.",
      ),
      suggestedQuestions: chips("ORDER_EXCEPTION"),
    };
  }

  if (intent === "ORDER_SAFE_OPTION") {
    return {
      lines: addGroundingAndAction(
        [
          safestOption
            ? `지금 가장 안전한 옵션은 ${safestOption.label}입니다.`
            : "현재 가장 안전한 옵션을 계산하지 못했습니다.",
          safestOption
            ? `${formatReferenceDate(safestOption.referenceDate)} 실적을 그대로 반영했고 총 ${formatCount(safestOption.totalQty)}개로 ${safestOption.avgDeltaText}입니다.`
            : deadlineLine,
          safestOption
            ? `대표 품목은 ${safestOption.topItemsLabel}입니다.`
            : "대표 품목 데이터가 없습니다.",
        ],
        commonGrounding,
        safestOption
          ? `${safestOption.label}을 먼저 검토하고 행사·예약 수요가 있으면 수동 보정하세요.`
          : deadlineAction,
      ),
      suggestedQuestions: chips("ORDER_SAFE_OPTION"),
    };
  }

  if (intent === "ORDER_FINAL_SUMMARY") {
    const conservativeOption =
      optionSummary.slice().sort((a, b) => a.totalQty - b.totalQty)[0] ?? null;
    const aggressiveOption =
      optionSummary.slice().sort((a, b) => b.totalQty - a.totalQty)[0] ?? null;
    return {
      lines: addGroundingAndAction(
        [
          "최종 선택 전에 보면 전주 기준안은 기본안, 전전주 기준안은 절감형, 전월 기준안은 안정형으로 볼 수 있습니다.",
          safestOption
            ? `가장 무난한 안은 ${safestOption.label} ${formatCount(safestOption.totalQty)}개입니다.`
            : "가장 무난한 안을 계산하지 못했습니다.",
          conservativeOption && aggressiveOption
            ? `옵션 간 총량 차이는 ${formatCount(Math.abs(aggressiveOption.totalQty - conservativeOption.totalQty))}개입니다.`
            : "옵션 간 총량 차이는 계산 중입니다.",
          focusDeadline && Number(focusDeadline.minutes_remaining ?? 0) <= 60
            ? "마감이 가까워 지금은 기본안부터 확인하는 편이 안전합니다."
            : "시간 여유가 있으면 세 안을 모두 보고 행사 수요를 함께 반영하세요.",
        ],
        commonGrounding,
        safestOption
          ? `${safestOption.label}을 기준으로 최종 발주를 정하고, 행사·예약 품목만 별도 보정하세요.`
          : deadlineAction,
      ),
      suggestedQuestions: chips("ORDER_FINAL_SUMMARY"),
    };
  }

  if (intent === "ORDER_COMPARISON") {
    const conservativeOption =
      optionSummary.slice().sort((a, b) => a.totalQty - b.totalQty)[0] ?? null;
    const aggressiveOption =
      optionSummary.slice().sort((a, b) => b.totalQty - a.totalQty)[0] ?? null;
    return {
      lines: addGroundingAndAction(
        [
          "세 옵션을 비교하면 전주 기준안이 가장 최근 패턴에 가깝고, 전전주 기준안이 가장 보수적입니다.",
          ...optionSummary.map(
            (option) =>
              `${option.label}: ${formatCount(option.totalQty)}개 · ${option.avgDeltaText} · 기준일 ${formatReferenceDate(option.referenceDate)}`,
          ),
          conservativeOption && aggressiveOption
            ? `최대·최소 차이는 ${formatCount(Math.abs(aggressiveOption.totalQty - conservativeOption.totalQty))}개입니다.`
            : "옵션 간 차이를 계산하지 못했습니다.",
        ],
        commonGrounding,
        safestOption
          ? `${safestOption.label}을 먼저 보고, 더 보수적으로 가려면 ${conservativeOption?.label ?? "보수적 안"}을 검토하세요.`
          : deadlineAction,
      ),
      suggestedQuestions: chips("ORDER_COMPARISON"),
    };
  }

  if (intent === "ORDER_RATIONALE") {
    return {
      lines: addGroundingAndAction(
        [
          "이 수량은 과거 동요일 실적을 기준으로 계산한 화이트박스 추천입니다.",
          recommendations?.explanation
            ? recommendations.explanation
            : "가장 최근 동요일 실적과 4주 평균 편차를 함께 비교해 추천 수량을 만들었습니다.",
          ...optionSummary.map((option) => {
            const flagLabel =
              option.flags
                .map((flag) => humanizeOrderFlag(flag))
                .filter(Boolean)
                .join(" / ") || "일반 판매 패턴 기준";
            return `${option.label}: ${formatReferenceDate(option.referenceDate)} 실적을 기준으로 총 ${formatCount(option.totalQty)}개를 제안합니다. 대표 품목은 ${buildTopItemsLabel(
              option,
              5,
            )}이며 ${option.avgDeltaText}입니다. ${flagLabel}`;
          }),
          externalFactorNotes
            ? `외부 요인 메모: ${externalFactorNotes}`
            : "현재 별도 행사 데이터는 감지되지 않았고, 날씨 영향은 아직 자동 반영되지 않습니다.",
          "현재 데이터에는 단체 주문 전용 태그가 없어 예약·행사 수요는 점주가 수동 확인해야 합니다.",
        ],
        commonGrounding,
        safestOption
          ? `${safestOption.label}을 기본안으로 보고, 예약·행사 수량만 별도로 반영해 최종 발주를 확정하세요.`
          : deadlineAction,
      ),
      suggestedQuestions: chips("ORDER_RATIONALE"),
    };
  }

  return {
    lines: addGroundingAndAction(
      [
        "주문 마감 전에 바로 볼 추천 옵션 3가지입니다.",
        deadlineLine,
        ...optionSummary.map(
          (option) =>
            `${option.label} ${formatCount(option.totalQty)}개 · ${option.meaning} · 대표 품목 ${option.topItemsLabel}`,
        ),
      ],
      commonGrounding,
      safestOption
        ? `${safestOption.label}부터 검토하고, 행사·예약 수요가 있으면 전월 기준안까지 함께 비교하세요.`
        : deadlineAction,
    ),
    suggestedQuestions: chips("ORDER_RECOMMEND"),
  };
}

async function buildPromotionResponse(message: string): Promise<LocalMenuResponse> {
  const intent = classifyLocalIntent(message);
  const [detail, promotions] = await Promise.all([getPromoPerformanceDetail(), getPromotions()]);
  const detailPromotions = detail?.promotions ?? [];
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
              `1위 ${topName} 매출 ${formatKrw(top.total_sales_amt)}${totalSales > 0 ? ` · 전체 프로모션 매출의 ${(Number(top.total_sales_amt) / totalSales * 100).toFixed(1)}%` : ""}`,
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
          `시간대별 프로모션 강세 분석입니다.`,
          `현재 프로모션 데이터는 일일 단위 집계이며, 시간대별 상세 집계는 프로모션 화면에서 확인 가능합니다.`,
          `가장 활성 프로모션: ${promoTitle} (${topPromotion.channel ?? "전체"}) · 매출 ${formatKrw(topPromotion.actualSales)} · 참여 ${formatCount(topPromotion.actualBills)}건`,
        ]
      : ["프로모션 데이터가 없습니다."];
    return {
      lines: addGroundingAndAction(
        lines,
        "프로모션 일일 집계 (시간대별 상세는 프로모션 화면 참조)",
        topPromotion ? `${promoTitle}의 시간대별 판매 패턴을 프로모션 화면에서 확인하세요.` : "프로모션 화면에서 실적을 확인하세요.",
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

  if (intent === "PERF_DELIVERY_WEEKLY") {
    const comparison = await getDeliveryCountComparison();
    if (comparison) {
      return {
        lines: addGroundingAndAction(
          [
            `전주 대비 배달 건수는 ${formatCount(comparison.weekly.this_week_orders)}건으로 ${formatSignedPct(comparison.weekly.diff_pct)}입니다.`,
            `지난주 동기간은 ${formatCount(comparison.weekly.last_week_orders)}건이었습니다.`,
            "주간 배달 건수는 프로모션 노출과 피크 시간 운영 변화에 바로 반응합니다.",
          ],
          "이번 주 누계와 지난주 동기간 배달 건수 비교",
          "배달 건수가 줄었다면 점심 이후 채널 노출과 상위 메뉴 구성을 우선 점검하세요.",
        ),
        suggestedQuestions: chips("PERF_DELIVERY_WEEKLY"),
      };
    }
  }

  if (intent === "PERF_DELIVERY_MONTHLY") {
    const comparison = await getDeliveryCountComparison();
    if (comparison) {
      return {
        lines: addGroundingAndAction(
          [
            `전월 대비 배달 건수는 ${formatCount(comparison.monthly.this_month.total_orders)}건으로 ${formatSignedPct(comparison.monthly.diff_pct)}입니다.`,
            `${comparison.monthly.this_month.month ?? "이번 달"} 매출은 ${formatKrw(comparison.monthly.this_month.total_sales)}, ${comparison.monthly.last_month.month ?? "지난달"}은 ${formatKrw(comparison.monthly.last_month.total_sales)}입니다.`,
            "건수와 매출이 함께 줄면 배달 채널 운영 강도가 약해졌을 가능성이 큽니다.",
          ],
          `${comparison.monthly.last_month.month ?? "지난달"} 대비 ${comparison.monthly.this_month.month ?? "이번 달"} 배달 건수·매출 비교`,
          "배달 채널별 노출과 할인 운영을 다시 점검하고, 하락 폭이 큰 채널부터 보완하세요.",
        ),
        suggestedQuestions: chips("PERF_DELIVERY_MONTHLY"),
      };
    }
  }

  if (intent === "PERF_CHANNEL_MIX") {
    const comparison = await getDeliveryComparison(30);
    const deliveryOnly = comparison.channels.filter((item) => !/^(pos)$/i.test(item.channel_name));
    const totalDeliverySales = deliveryOnly.reduce((sum, item) => sum + Number(item.total_sales ?? 0), 0);
    const top3 = [...deliveryOnly]
      .sort((a, b) => Number(b.total_sales ?? 0) - Number(a.total_sales ?? 0))
      .slice(0, 3);
    if (top3.length > 0) {
      return {
        lines: addGroundingAndAction(
          [
            `최근 30일 배달 채널 비중은 ${top3
              .map((item) => {
                const share = totalDeliverySales > 0 ? (Number(item.total_sales ?? 0) / totalDeliverySales) * 100 : 0;
                return `${item.channel_name} ${share.toFixed(1)}%`;
              })
              .join(", ")}입니다.`,
            `${top3
              .map((item) => `${item.channel_name} ${formatKrw(item.total_sales)} · ${formatCount(item.total_orders)}건`)
              .join(" / ")}`,
            `${top3[0].channel_name} 채널이 현재 가장 강한 배달 채널입니다.`,
          ],
          "최근 30일 배달 채널별 매출·건수 비교",
          `${top3[0].channel_name} 운영을 기본축으로 두고, 2·3위 채널의 노출과 혜택을 보강하세요.`,
        ),
        suggestedQuestions: chips("PERF_CHANNEL_MIX"),
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
            `판매수량은 ${formatCount(latest.total_qty)}개로 ${formatSignedPct(qtyDiff)}입니다.`,
            "글레이즈드는 대표 상품이라 감소 폭이 크면 전체 매출에도 바로 영향이 납니다.",
          ],
          `${formatMonthLabel(previous.month)}와 ${formatMonthLabel(latest.month)} 글레이즈드 매출·수량 비교`,
          "글레이즈드 진열량과 피크 시간 재고를 먼저 점검하고, 연계 프로모션 여부를 검토하세요.",
        ),
        suggestedQuestions: chips("PERF_PRODUCT_COMPARE"),
      };
    }
  }

  if (intent === "PERF_STORE_AVG") {
    const comparison = await getStoreAvgComparison();
    if (comparison) {
      return {
        lines: addGroundingAndAction(
          [
            `최근 30일 기준 ${DEMO_PRIMARY_STORE_NAME}의 일평균 매출은 ${formatKrw(comparison.our_avg_daily)}이며, 전체 ${formatCount(comparison.total_stores)}개 점포 평균 ${formatKrw(comparison.all_stores_avg_daily)}보다 ${formatSignedPct(comparison.diff_pct)}입니다.`,
            `현재는 전체 평균보다 ${comparison.diff_pct < 0 ? "낮은" : "높은"} 위치입니다.`,
            comparison.diff_pct < 0
              ? "강점 상품과 피크 시간 운영을 상위 점포 수준으로 끌어올릴 여지가 있습니다."
              : "현재 강점을 유지하되 상위 상품과 시간대 운영을 표준화할 필요가 있습니다.",
          ],
          `최근 30일 ${DEMO_PRIMARY_STORE_NAME}과 전체 ${formatCount(comparison.total_stores)}개 점포 평균 일매출 비교`,
          comparison.diff_pct < 0
            ? "전체 평균 이상 매장의 상위 상품 운영과 피크 시간 대응 방식을 먼저 비교하세요."
            : "현재 강한 시간대와 상품 구성을 유지하면서 약한 시간대를 보완하세요.",
        ),
        suggestedQuestions: chips("PERF_STORE_AVG"),
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
            ? `상위 카테고리: ${topCategory.name} ${topCategory.today.toLocaleString("ko-KR")}원`
            : "상위 상품 데이터를 불러오지 못했습니다.",
          ...data.categorySales.slice(1, 3).map(
            (item) => `${item.name} ${item.today.toLocaleString("ko-KR")}원`,
          ),
        ],
        "상위 상품/카테고리 매출 집계",
        topCategory ? `${topCategory.name} 재고와 프로모션 연계를 점검하세요.` : "상위 상품 데이터를 다시 조회하세요.",
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
          `${targetPeer.storeName}은 현재 ${targetPeer.peakHourLabel} 피크와 ${targetPeer.mainProduct} 판매력이 강합니다.`,
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
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 벤치마킹 요약입니다.`,
          ourPeak
            ? `${snapshot.storeName}의 피크 시간은 ${ourPeak.hour}시, 피크 매출은 ₩${Math.round(ourPeak.sales).toLocaleString("ko-KR")}입니다.`
            : "우리 매장 피크 시간 데이터가 없습니다.",
          targetPeer
            ? `${targetPeer.storeName}은 ${targetPeer.peakHourLabel} 피크가 강하고 매출 격차는 ${targetPeer.salesDiff > 0 ? "+" : ""}${Math.abs(targetPeer.salesDiff).toFixed(1)}%입니다.`
            : "비교 매장 피크 시간 데이터를 찾지 못했습니다.",
          "시간대별 비교에서는 오후 피크 대응력이 가장 큰 차이를 만듭니다.",
        ],
        "시간대별 매출 패턴 비교",
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
            ? `${snapshot.storeName}의 상위 상품은 ${ourTop.product_name} ${Math.round(ourTop.sold_qty).toLocaleString("ko-KR")}개입니다.`
            : "우리 매장 상위 상품 데이터가 없습니다.",
          targetPeer && peerTop
            ? `${targetPeer.storeName}은 ${peerTop.product_name} ${Math.round(peerTop.sold_qty).toLocaleString("ko-KR")}개입니다.`
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

  // === Production intents ===
  if (intent === "INVENTORY_RISK" || intent === "FORECAST" || intent === "PRODUCTION_RECOMMEND") {
    return buildProductionResponse(message);
  }

  // === Order intents ===
  if (
    intent === "ORDER_RECOMMEND" ||
    intent === "ORDER_COMPARISON" ||
    intent === "ORDER_RATIONALE" ||
    intent === "ORDER_EXCEPTION" ||
    intent === "ORDER_FINAL_SUMMARY" ||
    intent === "ORDER_SAFE_OPTION"
  ) {
    return buildOrderResponse(message);
  }

  // === Promotion intents ===
  if (intent === "PROMO_RESPONSE" || intent === "PROMO_SALES" || intent === "PROMO_HOURLY" || intent === "PROMO_STORE_COMPARE") {
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
      intent === "PERF_DELIVERY_WEEKLY" ||
      intent === "PERF_DELIVERY_MONTHLY" ||
      intent === "PERF_CHANNEL_MIX" ||
      intent === "PERF_PRODUCT_COMPARE" ||
      intent === "PERF_STORE_AVG" ||
      /결제|카드|현금|간편결제|포인트|시간대|피크|몇 시|상품|상위|주력|메뉴|요약/.test(lower) ||
      intent === "MENU_SUMMARY"
    ) {
      return buildPerformanceResponse(message);
    }
    return null;
  }
  if (selectedMenu === "알람 설정") {
    return buildAlarmSettingsResponse();
  }
  if (selectedMenu === "AI 실시간 현황") {
    if (/(발주|마감|주문)/.test(lower)) {
      return buildOrderResponse(message);
    }
    if (/(상품|상위|카테고리|시간대|매출|성과|결제|피크)/.test(lower)) {
      return buildPerformanceResponse(message);
    }
    return buildProductionResponse(message);
  }
  if (selectedMenu === "발주 관리") {
    return buildOrderResponse(message);
  }
  if (selectedMenu === "생산관리") {
    return buildProductionResponse(message);
  }
  if (intent === "CHANCE_LOSS" || intent === "MENU_SUMMARY") {
    return buildDashboardResponse(message);
  }
  if (selectedMenu === "종합 현황") {
    return null;
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
      ) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            type: "ai",
            lines: sanitizeLines(lines),
            time: now(),
            suggestedQuestions,
            actionCards,
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
          );
          return;
        }
      }

      if (!needsBackendFirst && shouldPreferLocalFirst(selectedMenu, localIntent)) {
        try {
          const menuAware = await buildMenuAwareResponse(
            selectedMenu,
            trimmed,
            localIntent,
          );
          if (menuAware) {
            finishWith(
              menuAware.lines,
              menuAware.suggestedQuestions ??
                toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
              menuAware.actionCards,
            );
            return;
          }
        } catch {
          /* local-first response failed; continue to backend fallback */
        }
      }

      let backendLines: string[] | null = null;
      let backendQuestions: SuggestedQuestion[] = [];
      let backendActionCards: ActionCard[] = [];

      try {
        const backend = await fetchChat(trimmed, selectedMenu, sessionId);
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
        backendLines = sanitizeLines(answer.split("\n"));
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

      const shouldUseSalesQuery =
        selectedMenu === "종합 현황" ||
        selectedMenu === "AI 기반 성과 분석" ||
        selectedMenu === "벤치마킹";
      if (shouldUseSalesQuery && isGenericBackendAnswer(backendLines)) {
        const salesQueryResponse = await buildSalesQueryResponse(trimmed, selectedMenu);
        if (salesQueryResponse) {
          finishWith(
            salesQueryResponse.lines,
            salesQueryResponse.suggestedQuestions ??
              toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
            salesQueryResponse.actionCards,
          );
          return;
        }
      }

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
        );
        return;
      }

      finishWith(
        ["죄송합니다. 현재 응답을 생성하지 못했습니다.", "잠시 후 다시 시도해 주세요."],
        toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
      );
    },
    [handleNotificationIntent, isTyping, selectedMenu, sessionId],
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

        <div ref={chatRef} className="chat scrolled relative top-1 mt-2 min-h-0 flex-1 overflow-y-auto px-[14px] py-[14px]">
          {messages.length === 1 && messages[0]?.id.startsWith("welcome-") && (
            <div className="mb-[10px] flex flex-col gap-[4px]">
              <p className="text-[9px] text-[#8a8a8a] font-bold uppercase tracking-[0.06em]">
                빠른 질문
              </p>
              {chips.map((text) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="text-left px-[8px] py-[4px] rounded-[8px] text-[10px] text-[#ebedef] font-[500] leading-[1.4] cursor-pointer hover:bg-[#2a2a2a] transition-colors"
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

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
              <div key={msg.id} className="flex flex-col items-start gap-[4px] mt-5">
                <div className="px-[10px] py-[6px] max-w-[100%] w-full" style={{ background: "#2a97c8", borderRadius: "10px 10px 10px 0px", zIndex: 30 }}>
                  {msg.lines.map((line, i) => (
                    <p key={i} className="text-white text-[10px] font-[500] leading-[1.5]">
                      {line}
                    </p>
                  ))}

                  {msg.actionCards && msg.actionCards.length > 0 && (
                    <div className="mt-[6px] flex flex-col gap-[4px]">
                      {msg.actionCards.map((card, ci) => (
                        <div
                          key={ci}
                          className="rounded-[6px] px-[6px] py-[4px]"
                          style={{ background: "rgba(255,255,255,0.15)" }}
                        >
                          <p className="text-white text-[9px] font-bold leading-[1.3]">
                            {card.title}
                          </p>
                          {card.body && (
                            <p className="text-[rgba(255,255,255,0.8)] text-[8px] leading-[1.3] mt-[2px]">
                              {card.body}
                            </p>
                          )}
                          {card.actions && card.actions.length > 0 && (
                            <div className="mt-[3px] flex flex-wrap gap-[3px]">
                              {card.actions.map((action, ai) => (
                                <div key={ai} className="flex flex-col gap-[2px]">
                                  <button
                                    onClick={() => void handleAction(msg.id, ci, ai, action)}
                                    className="px-[5px] py-[1px] rounded-[4px] text-[8px] text-white font-bold cursor-pointer hover:opacity-80 disabled:opacity-50"
                                    style={{ background: "rgba(255,255,255,0.25)" }}
                                    disabled={actionStates[`${msg.id}-${ci}-${ai}`]?.status === "running"}
                                  >
                                    {action.label}
                                  </button>
                                  {actionStates[`${msg.id}-${ci}-${ai}`]?.message && (
                                    <p
                                      className={`text-[7px] ${
                                        actionStates[`${msg.id}-${ci}-${ai}`]?.status === "failed"
                                          ? "text-[#ffd5d5]"
                                          : "text-[rgba(255,255,255,0.8)]"
                                      }`}
                                    >
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
                  )}
                </div>

                {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-[3px] mt-[2px]">
                    {msg.suggestedQuestions.map((sq, si) => (
                      <button
                        key={si}
                        onClick={() => sendMessage(sq.text)}
                        className="px-[6px] py-[2px] rounded-[10px] text-[8px] text-[#c3e289] font-[500] cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(195, 226, 137, 0.12)", border: "1px solid rgba(195, 226, 137, 0.3)" }}
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
