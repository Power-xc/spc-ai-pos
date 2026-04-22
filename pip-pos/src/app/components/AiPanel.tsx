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
  getAiBriefing,
  getAiOrderItems,
  getAiOrderSummary,
  getAiPerformanceData,
  getAiValidationChatSummary,
  getBenchmarkSnapshot,
  getPromotions,
  getTodayOrderSummary,
  getTodaySalesSnapshot,
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
  | "PRODUCTION_RECOMMEND"
  | "CHANCE_LOSS"
  | "MENU_SUMMARY"
  | "UNKNOWN";

type LocalMenuResponse = {
  lines: string[];
  suggestedQuestions?: SuggestedQuestion[];
  actionCards?: ActionCard[];
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
  "AI 실시간 현황": ["이번 티데이 프로모션은 전체적으로 어땠어?", "전 주 대비 배달 건 수 비교해줘", "프로모션이 뭐야"],
  생산관리: ["1차/2차 생산 권장량 알려줘", "1시간 뒤 예상 재고량 보여줘", "현재 재고 현황과 부족 예상 품목 알려줘"],
  "발주 관리": ["주문 마감 전 추천 옵션 보여줘", "전주/전전주/전월 기준으로 비교해줘", "각 옵션의 근거를 보여줘"],
  프로모션: ["이번 티데이 프로모션은 전체적으로 어땠어?", "프로모션이 뭐야", "성과 낮은 캠페인 알려줘"],
  "AI 기반 성과 분석": ["26년 2월 매출과 25년 2월 매출 비교해줘", "글레이즈드 전 월 대비 매출 금액 비교해줘", "이번 2월 배달 채널 별 매출 알려줘"],
  "AI 검증": ["이 화면에서 뭘 봐야 해", "각 옵션의 근거를 보여줘", "최종 선택 전에 차이를 요약해줘"],
  벤치마킹: [
    "이번 달 일평균 매출을 타 점포 평균과 비교해줘",
    "벤치마킹이 뭔데",
    "나보다 매출 높은데 유사한 매장 알려줘",
  ],
  "알람 설정": ["왜 지금 알림이 떴는지 설명해줘", "알림 꺼줘", "알람 상태 알려줘"],
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
  if (/발주|주문 추천|추천 주문|발주서/.test(lower)) return "ORDER_RECOMMEND";
  if (/생산 추천|재고 부족|부족한 재고|생산 계획|품절 위험|재고 현황|부족 예상|1시간 뒤 예상 재고/.test(lower)) {
    return "PRODUCTION_RECOMMEND";
  }
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
    intent === "PRODUCTION_RECOMMEND" ||
    intent === "CHANCE_LOSS" ||
    intent === "MENU_SUMMARY"
  ) {
    return true;
  }
  return selectedMenu === "생산관리" || selectedMenu === "발주 관리" || selectedMenu === "AI 실시간 현황";
}

function shouldPreferSalesQueryFirst(selectedMenu: string, message: string, intent: LocalIntent) {
  if (intent !== "UNKNOWN") return false;
  const lower = message.toLowerCase();
  const isSalesComparison =
    /(비교|전주|전 월|전월|전년|2월|이번 달|일평균|채널|배달 건 수|매출 금액|티데이|글레이즈드)/.test(
      lower,
    ) && /(매출|배달|채널|상품|프로모션|캠페인|평균)/.test(lower);
  if (!isSalesComparison) return false;
  return (
    selectedMenu === "종합 현황" ||
    selectedMenu === "AI 기반 성과 분석" ||
    selectedMenu === "프로모션"
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
  const roleLine =
    menu === "AI 실시간 현황"
      ? "생산·발주·성과 에이전트 관점으로 나눠서 안내합니다."
      : menu === "생산관리"
        ? "현재 보유 수량과 부족 수량을 함께 설명합니다."
        : menu === "발주 관리"
          ? "발주 추천, 마감 상태, 우선 품목을 중심으로 안내합니다."
          : "추천 질문을 누르거나 직접 입력해 주세요.";
  return {
    id: `welcome-${menu}`,
    type: "ai",
    lines: [
      `${menu} 기준으로 도와드릴 준비가 됐습니다.`,
      `${demoLabel} 기준 데이터를 바탕으로 안내합니다.`,
      roleLine,
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

async function buildProductionResponse(selectedMenu: string): Promise<LocalMenuResponse> {
  try {
    const demoLabel = getDemoDateTimeLabel();
    const inventoryRaw =
      (await withTimeout(
        requestJson<
      Array<{
        product_id?: string;
        product_name?: string | null;
        on_hand_eod?: number | null;
        sold_qty?: number | null;
        stockout_risk?: string | null;
      }>
      >("/inventory/current"),
        2500,
      )) ?? [];
    const cockpitRaw =
      (await withTimeout(
        requestJson<{
      items?: Array<{
        product_id?: string;
        product_name?: string | null;
        current_stock?: number | null;
        predicted_stock_1h?: number | null;
        hourly_burn_rate?: number | null;
        recommended_production_qty?: number | null;
        risk_level?: string | null;
        why?: string[] | null;
        first_production?: { avg_time?: string | null; avg_qty?: number | null } | null;
        second_production?: { avg_time?: string | null; avg_qty?: number | null } | null;
      }>;
      }>(`/v1/dashboard/production?store_id=${STORE_ID}`),
        2500,
      )) ?? { items: [] };

    const inventoryMap = new Map(
      (inventoryRaw ?? []).map((item) => [String(item.product_id ?? ""), item]),
    );
    const cockpitItems = cockpitRaw?.items ?? [];
    const baseItems = cockpitItems.length > 0
      ? cockpitItems
      : (inventoryRaw ?? []).map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          current_stock: item.on_hand_eod,
          predicted_stock_1h:
            Number(item.on_hand_eod ?? 0) -
            Math.max(1, Math.round(Number(item.sold_qty ?? 0) / 6)),
          hourly_burn_rate: Math.max(0, Number(item.sold_qty ?? 0) / 10),
          recommended_production_qty: Math.max(
            0,
            Math.round(
              Math.max(0, -Number(item.on_hand_eod ?? 0)) +
                Math.max(6, Number(item.sold_qty ?? 0) * 0.25),
            ),
          ),
          risk_level: item.stockout_risk,
          why: [
            Number(item.sold_qty ?? 0) > 0
              ? `금일 누적 판매 ${formatCount(item.sold_qty)}개 기준 1시간 추정`
              : "실시간 재고 기준 추정",
          ],
          first_production: null,
          second_production: null,
        }));

    const productionItems = baseItems.map((item) => {
      const productId = String(item.product_id ?? "");
      const inventoryItem = inventoryMap.get(productId);
      const name = resolveProductDisplayName(
        String(item.product_name ?? inventoryItem?.product_name ?? productId),
      );
      const current = getStockDisplay(item.current_stock ?? inventoryItem?.on_hand_eod ?? 0);
      const predicted = getStockDisplay(
        item.predicted_stock_1h ?? item.current_stock ?? inventoryItem?.on_hand_eod ?? 0,
      );
      const recommendedQty = Math.max(
        Math.round(Number(item.recommended_production_qty ?? 0)),
        current.shortage,
        predicted.shortage,
        0,
      );
      const burnRate = Number(item.hourly_burn_rate ?? 0);
      const riskLevel = String(
        item.risk_level ?? inventoryItem?.stockout_risk ?? "LOW",
      ).toUpperCase();
      const why = Array.isArray(item.why) ? item.why.filter(Boolean) : [];
      const shortage = Math.max(current.shortage, predicted.shortage);
      const grounding = joinCompact([
        `근거: 최근 1시간 판매 속도 ${formatBurnRate(burnRate)}`,
        item.first_production?.avg_time
          ? `최근 4주 1차 ${item.first_production.avg_time} / ${formatCount(item.first_production.avg_qty)}개`
          : "최근 4주 1차 생산 패턴 부족",
        item.second_production?.avg_time
          ? `2차 ${item.second_production.avg_time} / ${formatCount(item.second_production.avg_qty)}개`
          : "2차 생산 패턴 부족",
        "리드타임 1시간 반영",
        why[0] ? `실적 기반 추정 (${why[0]})` : "실적 기반 추정",
      ]);
      return {
        name,
        shortage,
        currentLabel: current.currentLabel,
        predictedLabel:
          predicted.shortage > 0
            ? `1시간 뒤 예상 0개 · 부족 ${formatCount(predicted.shortage)}개`
            : `1시간 뒤 예상 ${formatCount(predicted.currentCount)}개`,
        recommendedQty,
        riskLevel,
        grounding,
        action:
          recommendedQty > 0 || shortage > 0
            ? `지금 할 일: ${name} ${formatCount(recommendedQty || shortage)}개 1차 생산 등록을 검토하세요.`
            : `지금 할 일: ${name}은 현재 모니터링을 유지하세요.`,
      };
    });

    const lowItems = productionItems.filter(
      (item) =>
        item.shortage > 0 ||
        item.recommendedQty > 0 ||
        item.riskLevel === "HIGH" ||
        item.riskLevel === "MEDIUM",
    );
    const topRecommendation = lowItems[0] ?? productionItems[0];
    const topAction =
      topRecommendation?.action ??
      "지금 할 일: 부족 수량이 큰 품목부터 1차 생산 등록을 검토하세요.";
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 생산 에이전트 요약입니다.`,
          topRecommendation
            ? `${topRecommendation.name} · ${topRecommendation.currentLabel} · ${topRecommendation.predictedLabel}`
            : "현재 추가 생산 추천 품목이 없습니다.",
          topRecommendation && topRecommendation.shortage
            ? `부족 수량은 ${formatCount(topRecommendation.shortage)}개이고 권장 생산 수량은 ${formatCount(topRecommendation.recommendedQty ?? topRecommendation.shortage)}개입니다.`
            : "현재 부족 수량 기준 추가 생산 필요 품목은 확인되지 않았습니다.",
          topRecommendation?.grounding ??
            "근거: 최근 1시간 판매 속도와 최근 4주 생산 패턴을 아직 충분히 계산하지 못했습니다.",
        ],
        topRecommendation?.grounding ?? "실적 기반 추정",
        topAction,
      ),
      suggestedQuestions: toSuggestedQuestions(
        QUICK_CHIPS[selectedMenu] ?? QUICK_CHIPS["생산관리"],
      ),
      actionCards: [
        buildNavigationCard("생산관리 열기", "재고 부족 품목과 생산 권장량을 확인합니다.", "/actions"),
      ],
    };
  } catch {
    return {
      lines: addGroundingAndAction(
        [
          `${getDemoDateTimeLabel()} 기준 생산 에이전트 요약입니다.`,
          "현재 생산 추천 데이터를 안정적으로 읽지 못했습니다.",
          "재고 부족 품목은 생산관리 화면 카드에서 직접 확인할 수 있습니다.",
        ],
        "실시간 재고 재조회 실패",
        "생산관리 화면에서 부족 품목과 권장 생산량을 다시 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(
        QUICK_CHIPS[selectedMenu] ?? QUICK_CHIPS["생산관리"],
      ),
      actionCards: [
        buildNavigationCard("생산관리 열기", "재고 부족 품목과 생산 권장량을 확인합니다.", "/actions"),
      ],
    };
  }
}

async function buildOrderResponse(): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const [briefing, orderSummary, items, todaySummary, recommendations] = await Promise.all([
    getAiBriefing("발주 관리"),
    getAiOrderSummary(),
    getAiOrderItems(),
    getTodayOrderSummary(),
    requestJson<{
      target_date?: string;
      options?: Array<{
        label?: string;
        reference_date?: string;
        total_qty?: number;
        deviation_label?: string;
        flags?: string[];
      }>;
    }>("/order/recommendations").catch(() => null),
  ]);
  const topItems = items.slice(0, 3);
  const options = recommendations?.options ?? [];
  const optionSummary =
    options.length > 0
      ? options
          .slice(0, 3)
          .map((option) =>
            `${option.label ?? "추천 옵션"} ${formatCount(option.total_qty)}개 (${option.reference_date ?? "-"}, ${option.deviation_label ?? "실적 기반 추정"})`,
          )
          .join(" / ")
      : null;
  return {
    lines: addGroundingAndAction(
      [
        `${demoLabel} 기준 발주 에이전트 요약입니다.`,
        ...briefing.summaryPoints.slice(0, 2),
        optionSummary ?? `${orderSummary.weekLabel} / 총 ${orderSummary.totalCount}개 품목 검토 기준입니다.`,
        topItems.length > 0
          ? `상위 품목은 ${topItems.map((item) => `${item.name} ${item.aiRecommendedQty}`).join(", ")}입니다.`
          : "현재 추천 발주 품목을 불러오지 못했습니다.",
        `${todaySummary.deadlineLabel}: ${todaySummary.deadline}`,
        "단체 주문/대형 예약 분리 데이터는 아직 별도 연동되지 않았습니다.",
      ],
      options.length > 0
        ? `전주·전전주·전월 동요일 3옵션과 실적 기반 추정`
        : "실적 기반 추정",
      "세 가지 추천 옵션을 비교한 뒤 점주가 최종 선택을 확정하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["발주 관리"]),
    actionCards: [
      buildNavigationCard("발주 관리 열기", "추천 발주와 수동 발주 목록을 확인합니다.", "/orders"),
    ],
  };
}

async function buildPromotionResponse(message: string): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const promotions = await getPromotions();
  const aiPromotions = promotions.filter((item) => item.status === "ai");
  const actualPromotions = promotions.filter((item) => item.status !== "ai");
  const activePromotions = promotions.filter((item) => item.status !== "ended");
  const topPromotion = actualPromotions[0] ?? activePromotions[0];
  const comparePromotion = aiPromotions[0] ?? topPromotion;
  const lower = message.toLowerCase();
  const weakPromotions = actualPromotions.filter(
    (item) => item.performanceTone === "low" || Number(item.actualSales ?? 0) <= 0,
  );
  const lines = /적용|차이|비교|전후|시뮬/.test(lower)
    ? addGroundingAndAction(
        [
          `${demoLabel} 기준 프로모션 적용 전후 비교입니다.`,
          comparePromotion
            ? `${comparePromotion.title} 현재 ${formatKrw(comparePromotion.actualSales)} → 적용 예상 ${formatKrw(comparePromotion.estimatedSalesAfter)}입니다.`
            : "비교 가능한 캠페인 시뮬레이션이 없습니다.",
          comparePromotion
            ? `예상 증분은 ${formatKrw(Math.max(0, Number(comparePromotion.estimatedSalesAfter ?? 0) - Number(comparePromotion.actualSales ?? 0)))}이며 최근 집계 기준 추정치입니다.`
            : "적용 전후 차이를 계산하지 못했습니다.",
          comparePromotion?.comparisonNote ?? "프로모션 메뉴에서 카드별 시뮬레이션을 열어 상세 비교를 확인할 수 있습니다.",
        ],
        "캠페인 실적 + 최근 집계 기준 파생 시뮬레이션",
        comparePromotion
          ? `${comparePromotion.title} 적용 전후 차이를 확인하고 우선 검토 대상으로 지정하세요.`
          : "프로모션 화면에서 실적 높은 캠페인을 먼저 확인하세요.",
      )
    : /기여|높은|상위|좋은/.test(lower)
      ? addGroundingAndAction(
          [
            `${demoLabel} 기준 성과 높은 캠페인 요약입니다.`,
            topPromotion
              ? `가장 먼저 볼 캠페인은 ${topPromotion.title}이며 최근 집계 매출 ${formatKrw(topPromotion.actualSales)} · 반응 ${formatCount(topPromotion.actualBills)}건입니다.`
              : "프로모션 데이터가 없습니다.",
            ...actualPromotions.slice(1, 3).map(
              (item) =>
                `${item.title} ${formatKrw(item.actualSales)} · 반응 ${formatCount(item.actualBills)}건`,
            ),
          ],
          "new_campaign_day_gold 최근 집계",
          topPromotion
            ? `${topPromotion.title} 성과를 기준선으로 두고 다른 캠페인을 비교하세요.`
            : "프로모션 화면에서 최근 성과 상위 캠페인을 먼저 확인하세요.",
        )
      : /낮은|부진|위험|저조/.test(lower)
        ? addGroundingAndAction(
            [
              `${demoLabel} 기준 관찰 필요 캠페인 요약입니다.`,
              weakPromotions.length > 0
                ? `주의가 필요한 캠페인은 ${weakPromotions.map((item) => item.title).join(", ")}입니다.`
                : "현재 즉시 보강이 필요한 캠페인은 없습니다.",
              weakPromotions[0]
                ? `${weakPromotions[0].title}은 최근 집계 매출 ${formatKrw(weakPromotions[0].actualSales)} · 반응 ${formatCount(weakPromotions[0].actualBills)}건으로 보강 여지가 큽니다.`
                : "성과 낮은 캠페인 데이터가 없습니다.",
            ],
            "캠페인 실적 집계",
            weakPromotions[0]
              ? `${weakPromotions[0].title}의 대상 상품과 채널을 재조정하세요.`
              : "현재는 성과 높은 캠페인을 유지하고 추가 보강 여부만 점검하세요.",
          )
        : addGroundingAndAction(
            [
              `${demoLabel} 기준 프로모션 요약입니다.`,
              `현재 화면 기준 추천/실집계 캠페인은 ${activePromotions.length}건입니다.`,
              topPromotion
                ? `우선 확인 캠페인은 ${topPromotion.title} (${topPromotion.channel ?? "전체"})입니다.`
                : "프로모션 데이터가 없습니다.",
              comparePromotion
                ? `${comparePromotion.title}은 최근 집계 기준 적용 시 ${formatKrw(Math.max(0, Number(comparePromotion.estimatedSalesAfter ?? 0) - Number(comparePromotion.actualSales ?? 0)))} 증분을 추정합니다.`
                : "프로모션 메뉴에서는 최근 집계 기준 캠페인 반응과 진행 상태를 함께 보는 것이 좋습니다.",
            ],
            "캠페인 실적 + 파생 시뮬레이션",
            comparePromotion
              ? `${comparePromotion.title} 적용 전후 차이를 먼저 확인하세요.`
              : "프로모션 화면에서 반응이 높은 캠페인을 먼저 확인하세요.",
          );
  return {
    lines,
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["프로모션"]),
    actionCards: [
      buildNavigationCard("프로모션 화면 열기", "최근 집계 기준 캠페인 성과를 확인합니다.", "/promotions"),
    ],
  };
}

async function buildPerformanceResponse(message: string): Promise<LocalMenuResponse> {
  const demoLabel = getDemoDateTimeLabel();
  const data = await getAiPerformanceData("일별");
  const lower = message.toLowerCase();
  if (/결제|카드|현금|간편결제|포인트/.test(lower)) {
    const topPayment = data.paymentTypes[0];
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 성과 에이전트 요약입니다.`,
          topPayment
            ? `현재 결제수단 비중 1위는 ${topPayment.label} ${topPayment.percent}%입니다.`
            : "결제수단 데이터를 불러오지 못했습니다.",
          ...data.paymentTypes.slice(1, 3).map(
            (item) => `${item.label} 비중은 ${item.percent}%입니다.`,
          ),
        ],
        "결제수단 mix 집계",
        topPayment
          ? `${topPayment.label} 비중 변화가 최근 매출 변화와 연결되는지 확인하세요.`
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
          `${demoLabel} 기준 성과 에이전트 요약입니다.`,
          peak
            ? `${peak.time}가 현재 피크 구간이며 POS ${peak.pos.toLocaleString("ko-KR")} / 배달 ${peak.delivery.toLocaleString("ko-KR")}입니다.`
            : "시간대별 매출 데이터를 불러오지 못했습니다.",
          "시간대별 매출은 직전 평균과 함께 비교해 보는 것이 좋습니다.",
        ],
        "시간대별 매출 집계",
        peak ? `${peak.time} 전후 피크 시간대의 재고와 인력 대응을 점검하세요.` : "시간대별 차트를 다시 확인하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  if (/상품|상위|주력|메뉴/.test(lower)) {
    const topCategory = data.categorySales[0];
    return {
      lines: addGroundingAndAction(
        [
          `${demoLabel} 기준 성과 에이전트 요약입니다.`,
          topCategory
            ? `현재 상위 상품/카테고리는 ${topCategory.name}이며 매출 ${topCategory.today.toLocaleString("ko-KR")}원입니다.`
            : "상위 상품 데이터를 불러오지 못했습니다.",
          ...data.categorySales.slice(1, 3).map(
            (item) => `${item.name} ${item.today.toLocaleString("ko-KR")}원`,
          ),
        ],
        "상위 상품/카테고리 매출 집계",
        topCategory ? `${topCategory.name} 재고와 프로모션 연계를 먼저 점검하세요.` : "상위 상품 데이터를 다시 조회하세요.",
      ),
      suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    };
  }
  return {
    lines: addGroundingAndAction(
      [
        `${demoLabel} 기준 성과 에이전트 요약입니다.`,
        ...data.kpis.map((item) => `${item.label}: ${item.value} (${item.change})`),
      ],
      "실적 기반 요약",
      "하락 중인 KPI가 있다면 원인 화면으로 이동해 세부 지표를 확인하세요.",
    ),
    suggestedQuestions: toSuggestedQuestions(QUICK_CHIPS["AI 기반 성과 분석"]),
    actionCards: [
      buildNavigationCard("성과 분석 화면 열기", "시간대별 매출과 상위 상품을 확인합니다.", "/analytics"),
    ],
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
    if (/적용|차이|비교|전후|시뮬|기여|높은|상위|좋은|낮은|부진|위험|저조|요약|캠페인/.test(lower) || intent === "MENU_SUMMARY") {
      return buildPromotionResponse(message);
    }
    return null;
  }
  if (selectedMenu === "AI 기반 성과 분석") {
    if (/결제|카드|현금|간편결제|포인트|시간대|피크|몇 시|상품|상위|주력|메뉴|요약/.test(lower) || intent === "MENU_SUMMARY") {
      return buildPerformanceResponse(message);
    }
    return null;
  }
  if (selectedMenu === "알람 설정") {
    return buildAlarmSettingsResponse();
  }
  if (selectedMenu === "AI 실시간 현황") {
    if (/(발주|마감|주문)/.test(lower) || intent === "ORDER_RECOMMEND") {
      return buildOrderResponse();
    }
    if (/(상품|상위|카테고리|시간대|매출|성과|결제|피크)/.test(lower)) {
      return buildPerformanceResponse(message);
    }
    return buildProductionResponse(selectedMenu);
  }
  if (selectedMenu === "발주 관리" || intent === "ORDER_RECOMMEND") {
    return buildOrderResponse();
  }
  if (
    selectedMenu === "생산관리" ||
    selectedMenu === "AI 실시간 현황" ||
    intent === "PRODUCTION_RECOMMEND"
  ) {
    return buildProductionResponse(selectedMenu);
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
            ["안녕하세요. PIP AI입니다.", `${selectedMenu} 화면 기준으로 도와드릴게요.`],
            `${DEMO_PRIMARY_STORE_NAME} · ${getDemoDateTimeLabel()} 기준`,
            "원하는 메뉴 지표나 액션을 바로 질문해 주세요.",
          ),
          toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
        );
        return;
      }

      if (localIntent === "IDENTITY") {
        finishWith(
          addGroundingAndAction(
            [
              "저는 BR Korea POS의 PIP AI 어시스턴트입니다.",
              "생산, 발주, 매출, 벤치마킹, 알림 상태를 현재 화면 문맥과 실데이터 기준으로 안내합니다.",
            ],
            "현재 메뉴 컨텍스트 + 선택한 기준 일시",
            "확인하려는 메뉴나 지표를 직접 질문해 주세요.",
          ),
          toSuggestedQuestions(QUICK_CHIPS[selectedMenu] ?? DEFAULT_CHIPS),
        );
        return;
      }

      if (localIntent === "GENERAL_HELP") {
        finishWith(
          addGroundingAndAction(
            [
              "제가 도와드릴 수 있는 항목입니다.",
              "- 생산 추천 및 재고 부족 요약",
              "- 발주 추천과 마감 상태 확인",
              "- 종합 현황/성과 분석/벤치마킹 해석",
              "- 알림 상태 확인과 ON/OFF 제어",
            ],
            "현재 화면 문맥과 실데이터/파생 데이터 기준",
            "추천 질문을 누르거나 매출·재고·발주 질문을 직접 입력해 주세요.",
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
        selectedMenu === "프로모션" ||
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
