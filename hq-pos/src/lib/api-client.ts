import type {
  APIResponse,
  ChatTrace,
  ChatResult,
  DashboardAlertsData,
  DashboardBriefingData,
  DashboardData,
  DashboardOrdersData,
  DashboardProductionData,
  DashboardSalesSummaryData,
  InventoryItem,
  OrderConfirmResult,
  OrderItem,
  OrderOptionsData,
  PosModal,
  ProductionRegisterResult,
  SalesQueryResult,
} from "@/types/api";

const API_BASE = "";
const DEFAULT_USER_ROLE = import.meta.env.VITE_USER_ROLE || "store_owner";
const DEFAULT_USER_ID = import.meta.env.VITE_USER_ID || "U001";
const DEFAULT_STORE_ID =
  import.meta.env.VITE_STORE_ID ||
  import.meta.env.VITE_DEFAULT_STORE_ID ||
  "POC_001";

type Envelope<T> = { success: boolean; data?: T; error?: string | null };
type ChatCardAction = {
  label: string;
  action_type: string;
  api_endpoint: string;
  params?: Record<string, any>;
};
type ChatActionCard = {
  card_type: string;
  title: string;
  body: string;
  actions?: ChatCardAction[];
};
type ChatSuggestedQuestion = string | { text: string; source?: string; reason?: string };
type ChatApiResponse = {
  answer: string;
  action_cards?: ChatActionCard[];
  suggested_questions?: ChatSuggestedQuestion[];
  tools_used?: string[];
  path: string;
  sub_intent?: string;
  intent_confidence?: string;
  resolved_query?: string;
  latency_ms: number;
  token_usage: number;
  metadata?: Record<string, any> & {
    suggested_questions?: ChatSuggestedQuestion[];
    trace?: ChatTrace;
  };
};
type ActionTodoStatusParam = "pending" | "incomplete" | "completed" | "hold" | "all";
type ActionTodoListResult = {
  items: Array<{
    id: string;
    title: string;
    summary: string;
    status: "대기" | "실행중" | "완료" | "보류";
    priority: "긴급" | "중요" | "일반";
    source: string;
    route: string;
    occurred_at: string;
  }>;
  total: number;
  status_mode: string;
  mode: "file" | "postgres" | string;
};

function buildHeaders(storeId = DEFAULT_STORE_ID, headers?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-User-Role": DEFAULT_USER_ROLE,
    "X-User-Id": DEFAULT_USER_ID,
    "X-Store-Id": storeId,
    ...headers,
  };
}

async function requestJSON<T>(
  endpoint: string,
  options?: RequestInit,
  storeId = DEFAULT_STORE_ID,
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: buildHeaders(storeId, options?.headers),
    cache: "no-store",
    ...options,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw {
      error: {
        code: String(res.status),
        message:
          payload?.detail || payload?.error?.message || payload?.error || res.statusText,
      },
    };
  }
  return payload as T;
}

function envelope<T>(data: T): APIResponse<T> {
  return { status: "success", data };
}

function mapModalToAlert(modal: PosModal) {
  const severity =
    modal.severity === "critical" ? "HIGH" : modal.severity === "warning" ? "MEDIUM" : "LOW";
  const type =
    modal.modal_type === "production_alert"
      ? "production"
      : modal.modal_type === "order_deadline"
        ? "order"
        : "sales";
  return {
    id: modal.modal_id,
    severity,
    type,
    warning_kind: (modal.data as any)?.warning_kind,
    warning_mode: ((modal.data as any)?.warning_mode || "beta") as any,
    title: modal.title,
    subtitle:
      modal.data?.items?.[0]?.note ||
      modal.data?.reason ||
      (typeof modal.data?.section === "string" ? modal.data.section : undefined),
    message: modal.body,
    cta: modal.actions?.[0]
      ? {
          label: modal.actions[0].label,
          action: modal.actions[0].action_type,
          route: modal.actions[0].api_endpoint,
        }
      : undefined,
    created_at: modal.created_at,
    read: false,
  } as DashboardAlertsData["alerts"][number];
}

function mapBriefing(storeId: string, payload: any): DashboardBriefingData {
  const alerts = (payload.active_alerts || []).map(mapModalToAlert);
  const production = payload.today_production?.[0];
  const deadlines = payload.pending_orders || [];
  const opportunities = [];
  if (production) {
    opportunities.push({
      id: `production-${production.product_id}`,
      title: `${production.product_name} 생산 권장`,
      summary: production.reason,
      metric: `${production.recommended_qty}개`,
      cta: { label: "생산 가이드 보기", action: "production", route: "/api/inventory/production-guide" },
    });
  }
  if (payload.yesterday_summary?.insight) {
    opportunities.push({
      id: "sales-insight",
      title: "오늘의 매출 흐름",
      summary: payload.yesterday_summary.insight,
      metric: `${payload.yesterday_summary.vs_last_week_same_day_pct >= 0 ? "+" : ""}${payload.yesterday_summary.vs_last_week_same_day_pct?.toFixed?.(1) ?? payload.yesterday_summary.vs_last_week_same_day_pct}%`,
      cta: { label: "매출 분석 보기", action: "sales", route: "/api/sales/compare" },
    });
  }
  return {
    store_id: storeId,
    store_name: storeId,
    risks: alerts,
    opportunities,
    actions: deadlines.slice(0, 3).map((item: any) => ({
      label: `${item.product_group} 마감 ${item.minutes_remaining}분 전`,
      action: "orders",
      route: "/api/order/recommendations",
    })),
    last_updated_at: payload.last_updated_at,
    customer_insights: payload.customer_insights || {
      status: "integration_pending",
      repeat_customer_count: null,
      repeat_visit_rate_pct: null,
      avg_orders_per_repeat_customer: null,
      reference_period: null,
      data_points: 0,
      source: "missing_customer_id_feed",
      note: "고객 데이터 연동 대기",
    },
  } as any;
}

function mapProduction(storeId: string, payload: any): DashboardProductionData {
  return {
    store_id: storeId,
    store_name: storeId,
    items: (payload.recommendations || []).map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      category: "도넛",
      current_stock: Math.round(item.current_stock || 0),
      predicted_stock_1h: Math.round((item.predicted_stock_1h || 0) * 10) / 10,
      depletion_eta: item.depletion_eta,
      hourly_burn_rate: item.hourly_burn_rate || 0,
      stockout_probability: item.urgency === "high" ? 85 : 60,
      recommended_production_qty: item.recommended_qty,
      first_production: item.pattern?.first_production || null,
      second_production: item.pattern?.second_production || null,
      risk_level: item.urgency === "high" ? "HIGH" : item.urgency === "medium" ? "MEDIUM" : "LOW",
      why: [item.reason],
    })),
    last_updated_at: new Date().toISOString(),
  };
}

function mapOrders(storeId: string, deadlines: any[], recommendations: any): DashboardOrdersData {
  const primaryOption = recommendations?.options?.[0];
  const risk = primaryOption?.risk_summary;
  return {
    store_id: storeId,
    store_name: storeId,
    today_deadlines: (deadlines || []).map((item: any) => ({
      category: item.product_group,
      deadline: item.deadline,
      minutes_remaining: item.minutes_remaining,
      severity: item.status === "urgent" ? "HIGH" : item.status === "soon" ? "MEDIUM" : "LOW",
      missing_order_item_count: risk?.stockout_count ?? 0,
      recommended_option_label: primaryOption?.label,
      why: primaryOption?.event_note ? [primaryOption.event_note] : undefined,
      cta: { label: "주문 추천 보기", action: "orders", route: "/api/order/recommendations" },
    })),
    imminent_deadline_count: (deadlines || []).filter((item: any) => item.status !== "ok").length,
    last_updated_at: new Date().toISOString(),
  };
}

function mapSalesSummary(storeId: string, payload: any): DashboardSalesSummaryData {
  return {
    store_id: storeId,
    store_name: storeId,
    biz_date: new Date().toISOString().slice(0, 10),
    today_sales_amt: payload.today_revenue || 0,
    vs_yesterday_pct: payload.vs_yesterday_same_time_pct,
    vs_last_week_same_dow_pct: payload.vs_last_week_same_day_pct,
    top_category: payload.top_selling?.[0]?.product_name ?? null,
    mini_chart_data: (payload.hourly_trend || []).map((point: any) => ({
      label: `${point.hour}시`,
      value: point.revenue,
    })),
    why: payload.insight ? [payload.insight] : [],
    last_updated_at: payload.last_updated_at,
    profitability: payload.profitability || {
      estimated_net_profit_amt: null,
      estimated_margin_rate_pct: null,
      break_even_sales_amt: null,
      break_even_coverage_pct: null,
      promo_profit_impact_amt: null,
      fixed_cost_amt: null,
      labor_cost_amt: null,
      promo_cost_amt: null,
      profit_status: "insufficient_data",
      margin_status: "insufficient_data",
      break_even_status: "fixed_cost_missing",
      promo_status: "integration_pending",
      basis: ["손익 데이터 준비중"],
      assumptions: [],
    },
  } as any;
}

function mapOrderOptions(storeId: string, payload: any): OrderOptionsData {
  const totalQtys = (payload.options || []).map((option: any) => option.total_qty || 0);
  const avg = totalQtys.length
    ? totalQtys.reduce((sum: number, value: number) => sum + value, 0) / totalQtys.length
    : 0;
  return {
    store_id: storeId,
    category: payload.options?.[0]?.items?.[0]?.category,
    deadline: payload.deadline,
    options: (payload.options || []).map((option: any, index: number) => ({
      option_id: option.source || `option-${index + 1}`,
      label: option.label,
      reference_date: option.reference_date,
      total_qty: option.total_qty,
      total_amount: (option.items || []).reduce(
        (sum: number, item: any) => sum + (item.quantity || 0) * (item.base_price || 0),
        0,
      ),
      deviation_from_avg_pct: avg ? ((option.total_qty - avg) / avg) * 100 : 0,
      deviation_label: option.event_note || "기준 주문안",
      items: (option.items || []).map((item: any) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        base_price: item.base_price || 0,
      })),
      flags: option.event_note ? ["EVENT_NOTE"] : [],
    })),
    four_week_avg_qty: avg,
    explanation: payload.explanation || payload.options?.find((option: any) => option.event_note)?.event_note,
    rationale: payload.rationale || {
      summary: "추천 근거 데이터 일부만 준비되어 있습니다.",
      vs_yesterday_sales_pct: null,
      vs_last_week_same_dow_sales_pct: null,
      stockout_signal: { count: null, note: "연동 대기", status: "integration_pending" },
      waste_signal: { waste_rate_pct: null, status: "integration_pending" },
      weather_impact: { status: "integration_pending", note: "기상 데이터 연동 대기" },
      event_impact: { status: "integration_pending", note: "행사 데이터 연동 대기" },
      mutual_support_impact: { status: "integration_pending", note: "상생지원 데이터 연동 대기" },
      time_band_impact: { status: "integration_pending", note: "시간대 영향 모델 준비중" },
    },
  } as any;
}

function mapInventory(payload: any[]): InventoryItem[] {
  return (payload || []).map((item: any) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    category: item.category,
    on_hand_eod: item.current_stock || 0,
    sold_qty: 0,
    waste_qty: 0,
    stockout_minutes: item.status === "critical" ? 60 : item.status === "warning" ? 20 : 0,
    reorder_triggered: item.status === "critical",
    base_price: 0,
    estimated_chance_loss: undefined,
    stockout_risk: item.status === "critical" ? "HIGH" : item.status === "warning" ? "MEDIUM" : "LOW",
  }));
}

function mapSalesChatResult(message: string, raw: ChatApiResponse): SalesQueryResult {
  return {
    intent: "CHAT",
    title: "AI 분석 응답",
    sections: [{ type: "insight", title: message, text: raw.answer }],
    sources: [{ type: "LLM", description: raw.tools_used?.join(", ") || "chat" }],
    metadata: { path: raw.path, llm_tokens_used: raw.token_usage, latency_ms: raw.latency_ms },
  };
}

function normalizeSuggestedQuestions(...sources: any[]): Array<{ text: string; source?: string; reason?: string }> {
  const merged = sources.flatMap((source) => (Array.isArray(source) ? source : []));
  const deduped: Array<{ text: string; source?: string; reason?: string }> = [];
  const seen = new Set<string>();
  for (const item of merged) {
    const normalized =
      typeof item === "string"
        ? { text: item, source: "backend" }
        : item && typeof item === "object" && typeof item.text === "string"
          ? { text: item.text, source: item.source, reason: item.reason }
          : null;
    if (!normalized) continue;
    const text = normalized.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    deduped.push({ ...normalized, text });
    if (deduped.length >= 5) break;
  }
  return deduped;
}

function mapChatResult(message: string, sessionId: string | undefined, raw: ChatApiResponse): ChatResult {
  const normalizedActionCards = Array.isArray(raw.action_cards) && raw.action_cards.length > 0
    ? raw.action_cards
    : (Array.isArray(raw.metadata?.action_cards) ? raw.metadata?.action_cards : []);
  const normalizedSuggestedQuestions = normalizeSuggestedQuestions(
    raw.suggested_questions,
    raw.metadata?.suggested_questions,
  );
  const firstCard = normalizedActionCards?.[0];
  const firstAction = firstCard?.actions?.[0];
  const items = firstAction?.params?.items;
  let responseType: ChatResult["response_type"] = "text";
  let content: any = raw.answer;
  let agent = "faq";
  if (raw.tools_used?.includes("get_order_history")) {
    agent = "order";
  } else if (raw.tools_used?.includes("compare_sales") || raw.tools_used?.includes("get_waste_summary")) {
    agent = "sales";
  } else if (raw.tools_used?.includes("get_current_inventory")) {
    agent = "production";
  }
  if (Array.isArray(items) && items.length > 0) {
    responseType = "text";
    content = {
      id: `draft-${Date.now()}`,
      generatedAt: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      items: items.map((item: any) => ({
        name: item.product_name,
        qty: item.quantity,
        productId: item.product_id,
        basePrice: item.base_price || 0,
      })),
      totalAmount: items.reduce(
        (sum: number, item: any) => sum + (item.quantity || 0) * (item.base_price || 0),
        0,
      ),
      confirmItems: items.map((item: any) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        base_price: item.base_price || 0,
      })),
    };
  } else if (raw.tools_used?.includes("compare_sales")) {
    agent = "sales";
    responseType = "insight_card";
    content = mapSalesChatResult(message, raw);
  }
  const trace = raw.metadata?.trace;
  return {
    agent,
    response_type: responseType,
    content,
    session_id: sessionId || `session-${Date.now()}`,
    metadata: {
      answer: raw.answer,
      path: raw.path,
      sub_intent: raw.sub_intent || raw.metadata?.sub_intent,
      tools_used: raw.tools_used || [],
      action_cards: normalizedActionCards || [],
      intent_confidence: raw.intent_confidence || raw.metadata?.intent_confidence,
      resolved_query: raw.resolved_query || raw.metadata?.resolved_query,
      token_usage: raw.token_usage,
      latency_ms: raw.latency_ms,
      suggested_questions: normalizedSuggestedQuestions,
      trace,
    },
    suggested_questions: normalizedSuggestedQuestions,
  };
}

export const api = {
  getDashboard: async (storeId: string) => {
    const [briefing, alerts, sales, production] = await Promise.all([
      api.getDashboardBriefing(storeId),
      api.getDashboardAlerts(storeId),
      api.getDashboardSalesSummary(storeId),
      api.getInventory(storeId),
    ]);
    const profitability = (sales.data as any)?.profitability || null;
    const customerInsights = (briefing.data as any)?.customer_insights || null;

    return envelope<DashboardData>({
      store_id: storeId,
      store_name: storeId,
      biz_date: new Date().toISOString().slice(0, 10),
      last_updated: new Date().toISOString(),
      alerts: alerts.data?.alerts || [],
      today_sales: {
        total_sales_amt: sales.data?.today_sales_amt || 0,
        total_sold_qty: 0,
        vs_last_week_pct: sales.data?.vs_last_week_same_dow_pct || 0,
        top_category: sales.data?.top_category || undefined,
      },
      inventory_status: production.data || [],
      todo_list: (briefing.data?.actions || []).map((item, index) => ({
        id: `todo-${index}`,
        label: item.label,
        deadline: undefined,
        done: false,
        priority: "MEDIUM" as const,
      })),
      profitability: profitability,
      customer_insights: customerInsights,
    } as any);
  },

  getDashboardBriefing: async (storeId: string) => {
    const payload = await requestJSON<Envelope<any>>("/api/home/briefing", undefined, storeId);
    return envelope(mapBriefing(storeId, payload.data));
  },

  getDashboardProduction: async (storeId: string) => {
    const payload = await requestJSON<Envelope<any>>("/api/inventory/production-guide", undefined, storeId);
    return envelope(mapProduction(storeId, payload.data));
  },

  getDashboardOrders: async (storeId: string) => {
    const [deadlines, recommendations] = await Promise.all([
      requestJSON<Envelope<any[]>>("/api/order/deadlines", undefined, storeId),
      requestJSON<Envelope<any>>("/api/order/recommendations", undefined, storeId),
    ]);
    return envelope(mapOrders(storeId, deadlines.data || [], recommendations.data));
  },

  getDashboardSalesSummary: async (storeId: string) => {
    const payload = await requestJSON<Envelope<any>>("/api/home/sales-summary", undefined, storeId);
    return envelope(mapSalesSummary(storeId, payload.data));
  },

  getDashboardAlerts: async (storeId: string) => {
    const payload = await requestJSON<Envelope<PosModal[]>>("/api/home/alerts", undefined, storeId);
    return envelope<DashboardAlertsData>({
      store_id: storeId,
      store_name: storeId,
      alerts: (payload.data || []).map(mapModalToAlert),
      last_updated_at: new Date().toISOString(),
    });
  },

  getCustomerInsights: async (storeId: string) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/dashboard/customer-insights?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  upsertFinancialInputs: async (data: {
    store_id: string;
    biz_date: string;
    fixed_cost_amt?: number | null;
    labor_cost_amt?: number | null;
    promo_cost_amt?: number | null;
    promo_sales_lift_amt?: number | null;
    promo_coupon_redemption_amt?: number | null;
    note?: string;
  }) => {
    const payload = await requestJSON<Envelope<any>>(
      "/api/v1/dashboard/inputs/financial",
      {
        method: "POST",
        body: JSON.stringify({
          store_id: data.store_id,
          biz_date: data.biz_date,
          fixed_cost_amt: data.fixed_cost_amt,
          labor_cost_amt: data.labor_cost_amt,
          promo_cost_amt: data.promo_cost_amt,
          promo_sales_lift_amt: data.promo_sales_lift_amt,
          promo_coupon_redemption_amt: data.promo_coupon_redemption_amt,
          note: data.note,
        }),
      },
      data.store_id,
    );
    return envelope(payload.data || {});
  },

  upsertCustomerInsightsInputs: async (data: {
    store_id: string;
    biz_date: string;
    unique_customers?: number | null;
    repeat_customers?: number | null;
    repeat_visit_rate_pct?: number | null;
    orders_from_repeat_customers?: number | null;
    avg_orders_per_repeat_customer?: number | null;
    data_source?: string;
    note?: string;
  }) => {
    const payload = await requestJSON<Envelope<any>>(
      "/api/v1/dashboard/inputs/customer-insights",
      {
        method: "POST",
        body: JSON.stringify({
          store_id: data.store_id,
          biz_date: data.biz_date,
          unique_customers: data.unique_customers,
          repeat_customers: data.repeat_customers,
          repeat_visit_rate_pct: data.repeat_visit_rate_pct,
          orders_from_repeat_customers: data.orders_from_repeat_customers,
          avg_orders_per_repeat_customer: data.avg_orders_per_repeat_customer,
          data_source: data.data_source,
          note: data.note,
        }),
      },
      data.store_id,
    );
    return envelope(payload.data || {});
  },

  getInventory: async (storeId: string) => {
    const payload = await requestJSON<Envelope<any[]>>("/api/inventory/current", undefined, storeId);
    return envelope(mapInventory(payload.data || []));
  },

  registerProduction: async (data: {
    store_id: string;
    product_id: string;
    quantity: number;
    alert_id?: string;
  }) => {
    const payload = await requestJSON<Envelope<any>>(
      "/api/inventory/register-production",
      { method: "POST", body: JSON.stringify({ product_id: data.product_id, quantity: data.quantity }) },
      data.store_id,
    );
    return envelope<ProductionRegisterResult>({
      production_id: payload.data?.production_id,
      registered_at: payload.data?.registered_at,
      feedback: {
        type: payload.data?.chance_loss?.status === "prevented" ? "POSITIVE" : "NEGATIVE",
        message: payload.data?.chance_loss?.message || "생산 등록이 완료되었습니다.",
        impact_pct: payload.data?.chance_loss?.pct || 0,
        estimated_amount: payload.data?.net_profit_bar?.net_profit_delta || 0,
      },
    });
  },

  getOrderOptions: async (storeId: string, _category?: string) => {
    const payload = await requestJSON<Envelope<any>>("/api/order/recommendations", undefined, storeId);
    return envelope(mapOrderOptions(storeId, payload.data));
  },

  getOrderAnalysis: async (optionId: string, storeId: string) => {
    const options = await api.getOrderOptions(storeId);
    const option = options.data?.options.find((item) => item.option_id === optionId);
    return envelope({ option_id: optionId, explanation: option?.deviation_label || "기준 주문안입니다." });
  },

  confirmOrder: async (data: { store_id: string; items: { product_id: string; quantity: number }[] }) => {
    const payload = await requestJSON<Envelope<any>>(
      "/api/order/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          items: data.items,
        }),
      },
      data.store_id,
    );
    const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);
    return envelope<OrderConfirmResult>({
      order_id: payload.data?.order_id,
      confirmed_at: payload.data?.confirmed_at,
      total_qty: totalQty,
      total_amount: 0, // base_price 정보가 프론트에 없음 - 실제 금액은 백엔드에서 산정
      message: payload.data?.status === "confirmed" ? "발주가 확정되었습니다." : "발주 처리 완료",
    });
  },

  querySales: async (data: { store_id: string; query: string; session_id?: string }) => {
    const payload = await requestJSON<ChatApiResponse>(
      "/api/chat",
      { method: "POST", body: JSON.stringify({ message: data.query }) },
      data.store_id,
    );
    return envelope(mapSalesChatResult(data.query, payload));
  },

  chat: async (data: {
    store_id: string;
    message: string;
    session_id?: string;
    context?: Record<string, any>;
  }) => {
    const payload = await requestJSON<ChatApiResponse>(
      "/api/chat",
      { 
        method: "POST", 
        body: JSON.stringify({ 
          message: data.message,
          session_id: data.session_id,
          context: data.context,
        }) 
      },
      data.store_id,
    );
    return envelope(mapChatResult(data.message, data.session_id, payload));
  },

  completeActionTodo: async (data: { store_id: string; todo_id: string }) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/actions/todos/${data.todo_id}/complete`,
      { method: "POST" },
      data.store_id,
    );
    return envelope(payload.data || {});
  },

  holdActionTodo: async (data: { store_id: string; todo_id: string }) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/actions/todos/${data.todo_id}/hold`,
      { method: "POST" },
      data.store_id,
    );
    return envelope(payload.data || {});
  },

  getActionTodos: async (data: { store_id: string; status?: ActionTodoStatusParam; limit?: number }) => {
    const status = data.status || "pending";
    const limit = data.limit ?? 100;
    const payload = await requestJSON<Envelope<ActionTodoListResult>>(
      `/api/v1/actions/todos?status=${encodeURIComponent(status)}&limit=${limit}`,
      undefined,
      data.store_id,
    );
    return envelope<ActionTodoListResult>(
      payload.data || {
        items: [],
        total: 0,
        status_mode: status,
        mode: "file",
      },
    );
  },

  getPendingModals: async (storeId: string) => {
    const payload = await requestJSON<Envelope<PosModal[]>>("/api/modal/pending", undefined, storeId);
    return envelope(payload.data || []);
  },

  respondToModal: async (
    modalId: string,
    actionType: string,
    params: Record<string, any> = {},
    storeId = DEFAULT_STORE_ID,
  ) => {
    return requestJSON<Envelope<any>>(
      `/api/modal/${modalId}/respond`,
      { method: "POST", body: JSON.stringify({ action_type: actionType, params }) },
      storeId,
    );
  },

  // ── Analytics ──────────────────────────────────────────────────
  getAnalyticsSummary: async (storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/summary?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsHourlySales: async (storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/hourly-sales?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsCategorySales: async (storeId = DEFAULT_STORE_ID, days = 1) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/category-sales?store_id=${encodeURIComponent(storeId)}&days=${days}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsDeliveryShare: async (storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/delivery-share?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsPromoPerformance: async (storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/promo-performance?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsPaymentMethods: async (storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/payment-methods?store_id=${encodeURIComponent(storeId)}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  getAnalyticsInventoryTimeline: async (storeId = DEFAULT_STORE_ID, topN = 15) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/inventory-timeline?store_id=${encodeURIComponent(storeId)}&top_n=${topN}`,
      undefined,
      storeId,
    );
    return envelope(payload.data || {});
  },

  postPromoSimulator: async (params: {
    sales_lift_pct?: number;
    promo_support_amt?: number;
    commission_pct?: number;
    labor_cost_amt?: number;
    promo_cost_amt?: number;
  }, storeId = DEFAULT_STORE_ID) => {
    const payload = await requestJSON<Envelope<any>>(
      `/api/v1/analytics/promo-simulator?store_id=${encodeURIComponent(storeId)}`,
      { method: "POST", body: JSON.stringify(params) },
      storeId,
    );
    return envelope(payload.data || {});
  },
};
