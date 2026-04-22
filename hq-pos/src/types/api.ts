export interface APIResponse<T = any> {
  status: "success" | "error";
  data?: T;
  error?: { code: string; message: string };
  metadata?: Record<string, any>;
}

export interface DashboardData {
  store_id: string;
  store_name: string;
  biz_date: string;
  last_updated: string;
  alerts: AlertCard[];
  today_sales: TodaySales;
  inventory_status: InventoryItem[];
  todo_list: TodoItem[];
}

export interface DashboardAction {
  label: string;
  action: string;
  route?: string;
}

export interface BriefingOpportunity {
  id: string;
  title: string;
  summary: string;
  metric?: string;
  cta?: DashboardAction;
}

export interface DashboardBriefingData {
  store_id: string;
  store_name: string;
  risks: AlertCard[];
  opportunities: BriefingOpportunity[];
  actions: DashboardAction[];
  last_updated_at: string;
}

export interface ProductionPattern {
  avg_time: string;
  avg_qty: number;
}

export interface ProductionCockpitItem {
  product_id: string;
  product_name: string;
  category: string;
  current_stock: number;
  predicted_stock_1h: number;
  depletion_eta?: string | null;
  hourly_burn_rate: number;
  stockout_probability: number;
  recommended_production_qty: number;
  first_production?: ProductionPattern | null;
  second_production?: ProductionPattern | null;
  risk_level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  why?: string[];
}

export interface DashboardProductionData {
  store_id: string;
  store_name: string;
  items: ProductionCockpitItem[];
  last_updated_at: string;
}

export interface OrderDeadlineCard {
  category: string;
  deadline: string;
  minutes_remaining: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  missing_order_item_count: number;
  recommended_option_label?: string;
  why?: string[];
  cta?: DashboardAction;
}

export interface DashboardOrdersData {
  store_id: string;
  store_name: string;
  today_deadlines: OrderDeadlineCard[];
  imminent_deadline_count: number;
  last_updated_at: string;
}

export interface MiniChartPoint {
  label: string;
  value: number;
}

export interface DashboardSalesSummaryData {
  store_id: string;
  store_name: string;
  biz_date: string;
  today_sales_amt: number;
  vs_yesterday_pct?: number | null;
  vs_last_week_same_dow_pct?: number | null;
  top_category?: string | null;
  mini_chart_data: MiniChartPoint[];
  why?: string[];
  last_updated_at: string;
}

export interface DashboardAlertsData {
  store_id: string;
  store_name: string;
  alerts: AlertCard[];
  last_updated_at: string;
}

export interface AlertCard {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: "production" | "order" | "sales";
  title: string;
  subtitle?: string;
  message?: string;
  cta?: { label: string; action: string; route?: string };
  created_at: string;
  read: boolean;
}

export interface PosModalAction {
  label: string;
  action_type: "confirm" | "dismiss" | "modify" | string;
  api_endpoint: string;
  params: Record<string, any>;
}

export interface PosModal {
  modal_id: string;
  modal_type:
    | "production_alert"
    | "order_deadline"
    | "anomaly_sales"
    | "stockout_risk"
    | "order_anomaly";
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  data: Record<string, any>;
  actions: PosModalAction[];
  created_at: string;
  expires_at: string;
  net_profit_impact?: number | null;
}

export interface InventoryItem {
  product_id: string;
  product_name: string;
  category: string;
  on_hand_eod: number;
  sold_qty: number;
  waste_qty: number;
  stockout_minutes: number;
  reorder_triggered: boolean;
  base_price: number;
  estimated_chance_loss?: number;
  stockout_risk: "HIGH" | "MEDIUM" | "LOW" | "NONE";
}

export interface TodaySales {
  total_sales_amt: number;
  total_sold_qty: number;
  vs_last_week_pct?: number;
  vs_last_month_pct?: number;
  top_category?: string;
}

export interface TodoItem {
  id: string;
  label: string;
  deadline?: string;
  done: boolean;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface ProductionAlert {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  product_id: string;
  product_name: string;
  message: string;
  detail: StockoutRiskItem;
  cta_label: string;
  cta_action: string;
  created_at: string;
}

export interface StockoutRiskItem {
  product_id: string;
  product_name: string;
  category: string;
  current_date_on_hand?: number | null;
  current_stock?: number;
  predicted_sold_qty: number;
  predicted_stock_1h?: number;
  depletion_eta?: string | null;
  hourly_burn_rate?: number;
  stockout_probability: number;
  avg_stockout_minutes_4w: number;
  recommended_production_qty: number;
  chance_loss_if_no_action: number;
  first_production?: ProductionPattern | null;
  second_production?: ProductionPattern | null;
}

export interface ProductionFeedback {
  type: "POSITIVE" | "NEGATIVE";
  message: string;
  impact_pct: number;
  estimated_amount: number;
}

export interface ProductionRegisterResult {
  production_id: string;
  registered_at: string;
  feedback: ProductionFeedback;
}

export interface OrderOption {
  option_id: string;
  label: string;
  reference_date: string;
  total_qty: number;
  total_amount: number;
  deviation_from_avg_pct: number;
  deviation_label: string;
  items: OrderItem[];
  flags: string[];
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  base_price: number;
}

export interface OrderOptionsData {
  store_id: string;
  product_group?: string;
  category?: string;
  deadline?: string;
  options: OrderOption[];
  four_week_avg_qty: number;
  explanation?: string;
}

export interface OrderConfirmResult {
  order_id: string;
  confirmed_at: string;
  total_qty: number;
  total_amount: number;
  message: string;
}

export interface SalesQueryResult {
  intent: string;
  title: string;
  sections: InsightSection[];
  sources: SourceInfo[];
  metadata: Record<string, any>;
}

export interface InsightSection {
  type: "metrics" | "insight" | "action" | "chart_data" | "text";
  title?: string;
  data?: any;
  text?: string;
  items?: string[];
}

export interface SourceInfo {
  type: string;
  description: string;
  data_range?: string;
  freshness?: string;
}

export interface SuggestedQuestion {
  text: string;
  source?: string;
  reason?: string;
}

export interface ChatTrace {
  total_ms?: number;
  classify_ms?: number;
  recent_messages_ms?: number;
  route_ms?: number;
  domain_service_ms?: number;
  db_ms?: number;
  llm_ms?: number;
  response_map_ms?: number;
  suggested_questions_ms?: number;
  sales_sql_ms?: number;
  order_options_fetch_ms?: number;
  order_recent_history_ms?: number;
  actions_todo_fetch_ms?: number;
  action_cards_build_ms?: number;
  order_confirm_prepare_ms?: number;
  order_confirm_execute_ms?: number;
  path?: string;
  sub_intent?: string;
  intent_confidence?: string;
  session_id?: string;
  store_id?: string;
  current_page?: string;
  page_key?: string;
  used_llm?: boolean;
  llm_mode?: "none" | "full" | "summary_only";
  llm_calls?: Array<Record<string, any>>;
}

export interface ChatResult {
  agent: string;
  response_type: "insight_card" | "alert_card" | "order_card" | "text";
  content: any;
  session_id: string;
  metadata: Record<string, any> & {
    suggested_questions?: SuggestedQuestion[];
    trace?: ChatTrace;
    sub_intent?: string;
  };
  suggested_questions?: SuggestedQuestion[];
  answer?: string;  // 백엔드가 직접 반환하는 plain text
}

export interface SSEEvent {
  event_type: "modal" | "refresh" | "heartbeat";
  data: any;
  timestamp: string;
}

export type NotificationPriority = "urgent" | "warning" | "info";

export type InventoryStatus = "urgent" | "warning" | "normal";

export type QueueStatus = "making" | "pickup_ready" | "complete";

export type ChatRole = "user" | "assistant";

export interface OrderDraftItem {
  name: string;
  qty: number;
  productId?: string;
  basePrice?: number;
}

export interface OrderDraft {
  id: string;
  items: OrderDraftItem[];
  generatedAt: string;
  totalAmount: number;
  confirmItems?: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    base_price: number;
  }>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  draft?: OrderDraft;
}

export interface ReviewSentiment {
  rating: number;
  totalCount: number;
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  positiveKeywords: string[];
  improvementKeywords: string[];
  recentReviews: ReviewItem[];
}

export interface ReviewItem {
  id: string;
  content: string;
  rating: number;
  date: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface NotificationItem {
  id: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  time: string;
  isRead: boolean;
  hasAction: boolean;
  actionLabel?: string;
}

export interface QueueItem {
  id: string;
  orderNumber: number;
  status: QueueStatus;
  group: "making" | "pickup";
  items: string[];
  elapsed: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface DailyBriefing {
  summary: string;
  highlights: BriefingHighlight[];
}

export interface BriefingHighlight {
  label: string;
  value: string;
  trend: "up" | "down" | "neutral";
}

// ── Analytics Types ──────────────────────────────────────────────
export interface AnalyticsKPISummary {
  biz_date: string;
  total_sales_amt: number;
  total_sold_qty: number;
  total_waste_qty: number;
  waste_rate_pct: number;
  chance_loss_est: number;
  products_with_stockout: number;
  top_category: string | null;
  vs_yesterday: { sales_pct: number | null; waste_pct: number | null };
  vs_last_week_same_dow: { sales_pct: number | null; waste_pct: number | null };
  vs_4week_avg_same_dow: { sales_pct: number | null; waste_pct: number | null };
  vs_last_month: { sales_pct: number | null; waste_pct: number | null };
  profitability: Record<string, any>;
}

export interface HourlySalesPoint {
  hour: string;
  sales_estimated: number;
  pct_of_daily: number;
}

export interface AnalyticsHourlySales {
  biz_date: string;
  last_week_date: string;
  total_sales_today: number;
  total_sales_last_week: number;
  data_source: string;
  note: string;
  today: HourlySalesPoint[];
  last_week: HourlySalesPoint[];
}

export interface CategorySalesItem {
  category: string;
  total_qty: number;
  total_sales: number;
  pct_of_total: number;
}

export interface AnalyticsCategorySales {
  period: { start: string; end: string };
  days: number;
  data_source: string;
  categories: CategorySalesItem[];
}

export interface AnalyticsDeliveryShare {
  status: string;
  data_source: string;
  note: string;
  channels: { name: string; value: number }[];
}

export interface AnalyticsPromoPerformance {
  status: string;
  data_source: string;
  note?: string;
  period: { start: string; end: string };
  promotions: Record<string, any>[];
}

export interface AnalyticsPaymentMethods {
  status: string;
  data_source: string;
  note: string;
  methods: { group_name: string; code_count: number }[];
}

export interface InventoryTimelineItem {
  product_id: string;
  product_name: string;
  category: string;
  current_stock: number;
  predicted_stock_1h: number;
  hourly_burn_rate: number;
  hours_remaining: number | null;
  depletion_time_today: string | null;
  production_recommend_time: string | null;
  recommended_production_qty: number;
  stockout_probability: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  depletion_eta: string | null;
  reason: string;
}

export interface AnalyticsInventoryTimeline {
  biz_date: string;
  data_source: string;
  note: string;
  items: InventoryTimelineItem[];
  total_items: number;
  high_risk_count: number;
  medium_risk_count: number;
}

export interface PromoSimulatorResult {
  baseline_sales: number;
  baseline_source: string;
  assumptions: {
    sales_lift_pct: number;
    estimated_margin_rate: number;
    margin_rate_source: string;
    promo_support_amt: number;
    commission_pct: number;
    labor_cost_amt: number;
    promo_cost_amt: number;
  };
  calculation: {
    projected_sales_increase: number;
    projected_gross_margin: number;
    commission_cost: number;
    promo_support_amt: number;
    labor_cost_amt: number;
    promo_cost_amt: number;
    net_profit_delta: number;
  };
  scenarios: {
    participate: { label: string; recommended: boolean; net_delta: number; roi_pct: number };
    hold: { label: string; recommended: boolean; net_delta: number; note: string };
    skip: { label: string; recommended: boolean; net_delta: number; note: string };
  };
  confidence_labels: Record<string, string>;
}
