// ── 대시보드 통계 ───────────────────────────────────────────────
// label, subLabel은 고정값이므로 컴포넌트에서 직접 정의
export interface StatCardData {
  id: string;
  value: string;
  unit: string;
  changeValue: string;
  changeType: "up" | "down";
  sparkData: number[];
  /* 기회손실 카드 전용 필드 */
  urgentCount?: number;
  restCount?: number;
  isLossEstimated?: boolean;
  isCumulative?: boolean;
  marginPct?: number;
  subLabelOverride?: string;
}

// ── 이벤트 캘린더 ───────────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  month: string;
  day: string;
  title: string;
  subtitle: string;
  isActive: boolean;
}

// ── 지금 할일 ──────────────────────────────────────────────────
export interface TodoItem {
  id: string;
  label: string;
  completed: boolean;
}

// ── 발주 관리 ──────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  itemName: string;
  quantity: string;
  status: "발주 대기" | "발주 중" | "발주 완료" | "입고 완료";
}

// ── 발주 관리 상세 (Figma 디자인) ──────────────────────────────
export type OrderDetailStatus = "발주 완료" | "납품 완료" | null;
export type OrderDetailCategory =
  | "도넛"
  | "음료"
  | "커피원두"
  | "냉동/냉장"
  | "용품/상품"
  | "기타";

export interface OrderDetailItem {
  id: string;
  name: string;
  bgColor: string;
  unitPrice: string;
  stockInfo: string;
  stockWarning: boolean;
  category: OrderDetailCategory;
  orderDate: string;
  orderQty: string;
  status: OrderDetailStatus;
}

export interface OrderMonthSummary {
  totalAmount: string;
  weekLabel: string;
  reportDate: string;
  reportTime: string;
  totalCount: number;
}

// ── AI 인사이트 ────────────────────────────────────────────────
export interface AgentLink {
  id: string;
}

export interface AiInsight {
  message: string;
  boldPart: string;
  suffix?: string;
  agents: AgentLink[];
}

// ── AI 실시간 현황 ─────────────────────────────────────────────
export interface RealtimeMetric {
  id: string;
  label: string;
  value: string;
  trend: string;
  trendType: "up" | "down" | "neutral";
}

// ── 프로모션 ──────────────────────────────────────────────────
export type PromotionChannel = "배달" | "매장" | "이벤트" | "전체";
export type PromotionStatus = "active" | "scheduled" | "ended" | "ai";

export interface SimulationScenarioRow {
  label: string;
  valueA: string;
  valueB: string;
}

export interface SimulationMetric {
  label: string;
  valueA: number;
  valueB: number;
  unit: string;
  diffPct: number;
}

export interface SimulationRadarPoint {
  subject: string;
  A: number;
  B: number;
}

export interface SimulationData {
  scenarioRows: SimulationScenarioRow[];
  radarData: SimulationRadarPoint[];
  metrics: SimulationMetric[];
  resultSummary: string;
  expectedRevenue: string;
}

export interface Promotion {
  id: string;
  status: PromotionStatus;
  statusLabel?: string | null;
  title: string;
  description: string;
  channel?: PromotionChannel;
  daysLeft?: number | null;
  periodLabel?: string | null;
  lunaLabel?: string;
  lunaMetric?: string;
  startDate: string;
  endDate: string;
  simulation: SimulationData;
  actualSales?: number;
  actualBills?: number;
  estimatedLiftPct?: number;
  estimatedSalesAfter?: number;
  estimatedBillsAfter?: number;
  comparisonNote?: string;
  performanceTone?: "high" | "watch" | "low" | "ai";
}

export interface AiPromotion {
  id: string;
  title: string;
  description: string;
  lunaMetric: string;
  simulation: SimulationData;
}

// ── AI 검증 ───────────────────────────────────────────────────
export interface AiValidationMetric {
  id: string;
  label: string;
  accuracy: number;
  color: string;
}

export type HypothesisTag =
  | "검증완료"
  | "검증중"
  | "반증됨"
  | "생산관리"
  | "운영관리"
  | "제품분석"
  | "재고분석"
  | "프로모션";

export interface HypothesisSubItem {
  label: string;
}

export interface HypothesisCard {
  id: string;
  tags: HypothesisTag[];
  date: string;
  title: string;
  detail: string;
  subItem: HypothesisSubItem;
  confidence: number; // 0~100
}

export interface AgentLogItem {
  id: string;
  time: string;
  category: "생산관리" | "운영관리" | "제품분석";
  title: string;
  description: string;
}

export interface AiQualityDimension {
  subject: string;
  value: number;
}

// ── 벤치마킹 ──────────────────────────────────────────────────
export interface BenchmarkItem {
  id: string;
  storeName: string;
  distance: string;
  salesDiff: number;
  conversionDiff: number;
  mainProduct: string;
  marketingStrategy: string;
  isRecommended: boolean;
}

// ── 알람 설정 ─────────────────────────────────────────────────
export interface AlarmSetting {
  id: string;
  label: string;
  enabled: boolean;
}
export type AlarmCategory = "재고" | "배송" | "Agent";

export type AlarmFilterTab = "전체" | AlarmCategory;

export interface AlarmCard {
  id: string;
  code: string;
  categories: AlarmCategory[];
  datetime: string;
  title: string;
  description: string;
  condition: string;
  tags: string[];
  enabled: boolean;
}

export interface AlarmHistoryItem {
  id: string;
  time: string;
  description: string;
}

export interface KakaoAlarmConfig {
  receiverNumber: string;
  quietHours: string;
  urgentAlarm: string;
  dailySummary: string;
}

// ── 추천 액션 ─────────────────────────────────────────────────
export interface RecommendedAction {
  id: string;
  title: string;
  subtitle: string;
  badgeType: "추천" | "긴급";
  avatarInitial: string;
}

// ── 생산관리 에이전트 ──────────────────────────────────────────
export interface ProductionItem {
  id: string;
  name: string;
  quantity: number;
  isLow: boolean;
  shortage?: number;
  oneHourShortfall?: number;
  badgeLabel?: string;
  statusLabel?: "즉시 생산 필요" | "보충 필요" | "주의" | "재고 적정";
  statusDescription?: string;
  currentLabel?: string;
  detailLabel?: string;
  predictedStock1h?: number;
  predictedLabel?: string;
  recommendedProductionQty?: number;
  dailyRecommendedQty?: number;
  hourlyBurnRate?: number;
  burnRateSource?: "actual" | "estimated" | "none";
  riskLevel?: string;
  stockoutProbability?: number;
  groundingLabel?: string;
  actionLabel?: string;
  firstProductionTime?: string | null;
  firstProductionQty?: number | null;
  firstRegisterTime?: string | null;
  firstAvailableTime?: string | null;
  secondProductionTime?: string | null;
  secondProductionQty?: number | null;
  secondRegisterTime?: string | null;
  secondAvailableTime?: string | null;
  productionSource?: "history" | "pattern" | null;
  leadTimeLabel?: string;
  /* ETA 기반 찬스로스 */
  etaMinutes?: number | null;
  estimatedLossQty?: number | null;
  estimatedLossAmount?: number | null;
  unitPrice?: number | null;
}

export interface ProductionAgentData {
  items: ProductionItem[];
  aiRecommendation: string;
  lastUpdated: string;
}

// ── 생산관리 예상 추가 매출 배너 ────────────────────────────────
export interface ProductionSummary {
  bannerLabel: string;
  urgentCount: number;
  urgentLabel: string;
  restCount: number;
  /* ETA 기반.expected loss */
  totalEstimatedLoss: number;
  lossItems: Array<{
    id: string;
    name: string;
    estimatedLossQty: number;
    estimatedLossAmount: number;
    etaMinutes: number;
    hourlyBurnRate: number;
  }>;
}

// ── 생산관리 배치 현황 ──────────────────────────────────────────
export type ProductionBatchStatus =
  | "즉시 생산 필요"
  | "보충 필요"
  | "주의"
  | "재고 적정"
  | null;

export interface ProductionBatchItem {
  id: string;
  name: string;
  product_id: string;
  bgColor: string;
  status: ProductionBatchStatus;
  aiWarning: string | null;
  lossAmount: string | null;
  currentCount: number;
  targetShortfall: number | null;
  progressPercent: number;
  currentStockLabel?: string | null;
  currentLabel?: string | null;
  shortageLabel?: string | null;
  detailLabel?: string;
  shortageCount?: number;
  predictedStock1h?: number | null;
  hourlyBurnRate?: number | null;
  burnRateSource?: "actual" | "estimated" | "none" | null;
  firstProductionTime?: string | null;
  firstProductionQty?: number | null;
  firstRegisterTime?: string | null;
  firstAvailableTime?: string | null;
  secondProductionTime?: string | null;
  secondProductionQty?: number | null;
  secondRegisterTime?: string | null;
  secondAvailableTime?: string | null;
  productionSource?: "history" | "pattern" | null;
  oneHourShortfall?: number | null;
  dailyRecommendedQty?: number | null;
  isEstimatedStock?: boolean | null;
  recommendedProductionQty?: number | null;
  predictedLabel?: string | null;
  statusLabel?: "즉시 생산 필요" | "보충 필요" | "주의" | "재고 적정" | null;
  statusDescription?: string | null;
  groundingLabel?: string | null;
  actionLabel?: string | null;
  shortage?: number | null;
  /* ETA 기반 찬스로스 */
  etaMinutes?: number | null;
  estimatedLossQty?: number | null;
  estimatedLossAmount?: number | null;
  unitPrice?: number | null;
}

// ── 제품분석 에이전트 ──────────────────────────────────────────
export interface ProductAnalysisItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  salesContribution: number;
  promotionEffect: number;
  trend: "up" | "down";
}

export interface ProductAnalysisData {
  tabs: string[];
  itemsByTab: Record<string, ProductAnalysisItem[]>;
  aiStatus: string;
}

// ── 주문관리 에이전트 ──────────────────────────────────────────
export interface RealtimeOrderItem {
  id: string;
  orderId: string;
  status: string;
  productName: string;
  type: string;
  currentQty?: number;
  endOfDayQty?: number;
}

export interface OrderHourlyPoint {
  time: string;
  value: number;
}

export interface OrderAgentData {
  items: RealtimeOrderItem[];
  todaySales: string;
  todaySalesLabel?: string;
  sectionLabel?: string;
  emptyMessage?: string;
  chartData: OrderHourlyPoint[];
}

// ── 사이드바 이슈 카운트 ────────────────────────────────────────
export interface MenuIssueCount {
  menu: string;
  count: number;
}

// ── 오늘의 발주 요약 ────────────────────────────────────────────
export interface TodayOrderSummaryItem {
  name: string;
  quantity: string;
}

export interface TodayOrderSummary {
  deadlineLabel: string;
  deadline: string;
  items: TodayOrderSummaryItem[];
  note: string;
}

// ── 오늘의 매출 스냅샷 ──────────────────────────────────────────
export interface SalesHourlyPoint {
  time: string;
  value: number;
}

export interface SalesTopItem {
  rank: number;
  name: string;
  count: string;
}

export interface TodaySalesSnapshot {
  trendValue: string;
  trendType: "up" | "down";
  hourlyData: SalesHourlyPoint[];
  topItems: SalesTopItem[];
}

// ── 실적 기반 발주 추천 ───────────────────────────────────────────────
export type AiOrderStatus = "발주 완료" | "납품 완료" | null;

export interface AiOrderSummary {
  weekLabel: string;
  reportDate: string;
  reportTime: string;
  totalCount: number;
  aiScore: string; // 과거 실적 기반 편차 지표 (예: "4주 평균 편차 ±12%")
}

export interface OrderConfirmResponse {
  order_id: string;
  confirmed_at: string;
  status: string;
  total_qty: number;
  total_amount: number;
  message: string;
}

export interface OrderOptionSummary {
  option_id: string;
  label: string;
  reference_date?: string;
  total_qty: number;
  total_amount: number;
  deviation_label?: string;
  flags?: string[];
  itemCount: number;
}

export interface AiOrderItem {
  id: string;
  name: string;
  bgColor: string;
  unitPrice: string;
  stockInfo: string;
  stockWarning: boolean;
  category: OrderDetailCategory;
  orderDate: string;
  aiRecommendedQty: string; // AI가 추천한 발주 수량
  aiReason: string; // AI 추천 사유
  status: AiOrderStatus;
}

// ── AI 기반 성과 분석 ───────────────────────────────────────────
export type PerformanceTab = "일별" | "주별" | "월별";

export interface HourlySalesPoint {
  time: string; // "09시"
  pos: number;
  delivery: number;
  prevAvg: number;
}

export interface CategorySalesItem {
  id: string;
  name: string;
  today: number;
  goal: number;
  color: string;
}

export interface PromotionWeeklyPoint {
  week: string; // campaign name
  billShare: number;
  salesShare: number;
  salesContribution: number;
}

export interface PaymentTypeItem {
  id: string;
  label: string;
  count: number;
  percent: number;
  color: string;
}

export interface PerformanceKpiItem {
  id: string;
  label: string;
  value: string;
  change: string;
  changeType: "up" | "down";
}

export interface AiPerformanceData {
  tab: PerformanceTab;
  hourlySales: HourlySalesPoint[];
  categorySales: CategorySalesItem[];
  promotionWeekly: PromotionWeeklyPoint[];
  paymentTypes: PaymentTypeItem[];
  kpis: PerformanceKpiItem[];
}

// ── 프로모션 실적 분석 ──────────────────────────────────────────
export interface PromoResponseItem {
  id: string;
  name: string;
  billCnt: number;
  salesAmt: number;
  tone: "high" | "medium" | "low";
  interpretation: string;
  action: string;
}

export interface PromoPerformanceSummary {
  topByResponse: PromoResponseItem[];
  lowByResponse: PromoResponseItem[];
  totalBills: number;
  totalSales: number;
  grounding: string;
  action: string;
}

export interface PromoSalesItem {
  id: string;
  name: string;
  salesAmt: number;
  billCnt: number;
  efficiency: number;
  tone: "high" | "medium" | "low";
  interpretation: string;
  action: string;
}

export interface PromoSalesSummary {
  topBySales: PromoSalesItem[];
  highEfficiency: PromoSalesItem[];
  totalSales: number;
  avgEfficiency: number;
  grounding: string;
  action: string;
}

export interface PromoHourlyItem {
  hour: number;
  qty: number;
  salesAmt: number;
}

export interface PromoHourlySummary {
  promoId: string;
  promoName: string;
  hourlyData: PromoHourlyItem[];
  peakHours: number[];
  weakHours: number[];
  interpretation: string;
  action: string;
}

export interface PromoStoreCompareItem {
  storeId: string;
  storeName: string;
  billCnt: number;
  salesAmt: number;
  diffBillCnt: number;
  diffSalesAmt: number;
  isOurs: boolean;
  tone: "higher" | "lower" | "same";
}

export interface PromoStoreCompareSummary {
  promoId: string;
  promoName: string;
  ourBillCnt: number;
  ourSalesAmt: number;
  stores: PromoStoreCompareItem[];
  interpretation: string;
  grounding: string;
  action: string;
}

export interface PromoPerformanceData {
  response: PromoPerformanceSummary;
  sales: PromoSalesSummary;
  hourly: PromoHourlySummary;
  storeCompare: PromoStoreCompareSummary;
}

// ── 오늘의 AI 브리핑 ───────────────────────────────────────────
export type BriefingIssueSeverity = "긴급" | "주의" | "확인";

export interface BriefingIssue {
  id: string;
  severity: BriefingIssueSeverity;
  title: string;
  detail: string;
  detectedAt: string;
  actionLabel: string;
  route: string;
}

export interface AiBriefing {
  date: string;
  store: string;
  summaryPoints: string[];
  issues: BriefingIssue[];
}

// ── POC 매출 분석 6 개 질문 API ─────────────────────────────────
export interface MonthlyCompareResponse {
  current_month: string;
  compare_month: string;
  current_total_sales: number;
  compare_total_sales: number;
  current_business_days: number;
  compare_business_days: number;
  current_daily_avg: number;
  compare_daily_avg: number;
  daily_change_pct: number;
  action: string;
  data_source: string;
}

export interface DeliveryOrdersResponse {
  current_month: string;
  compare_month: string;
  current_period_start: string;
  current_period_end: string;
  compare_period_start: string;
  compare_period_end: string;
  current_delivery_orders: number;
  compare_delivery_orders: number;
  current_delivery_sales: number;
  compare_delivery_sales: number;
  order_change_pct: number;
  action: string;
  data_source: string;
}

export interface CampaignEffectItem {
  campaign_id: string;
  campaign_name: string;
  total_lift: number;
  total_redemptions: number;
  active_days: number;
}

export interface CampaignEffectResponse {
  campaign_keyword: string;
  matched_campaigns: CampaignEffectItem[];
  match_basis: "exact_tday" | "dday_candidate" | "keyword_search";
  total_campaigns: number;
  total_redemptions: number;
  total_lift: number;
  action: string;
  data_source: string;
  mapping_note?: string;
}

export interface ProductCompareItem {
  product_name: string;
  current_qty: number;
  compare_qty: number;
  qty_change_pct: number;
  current_sales: number;
  compare_sales: number;
  sales_change_pct: number;
  current_rank: number;
  compare_rank: number | null;
  sales_basis: "actual_sales" | "estimated_by_unit_price" | "quantity_only";
  limitation_note?: string | null;
}

export interface ProductCompareResponse {
  products: ProductCompareItem[];
  current_month: string;
  compare_month: string;
  store_id: string;
  action: string;
  data_source: string;
}

export interface ChannelSalesItem {
  channel_name: string;
  channel_sales: number;
  channel_orders: number;
  avg_sales_ratio: number;
}

export interface ChannelSalesResponse {
  month: string;
  channels: ChannelSalesItem[];
  total_delivery_sales: number;
  action: string;
  data_source: string;
}

export interface PeerCompareResponse {
  month: string;
  store_daily_avg: number;
  peer_daily_avg: number;
  vs_peer_delta_pct: number;
  business_days: number;
  action: string;
  note: string;
  data_source: string;
}

// ── 캠페인 영향 보정 (Campaign Impact) ──────────────────────────
export interface CampaignAffectedProduct {
  product_id: string;
  product_name: string;
  category: string;
  baseline_avg_qty: number;
  campaign_avg_qty: number;
  base_recommended_qty: number;
  campaign_adjustment_qty: number;
  final_recommended_qty: number;
  impact_direction: "increase" | "decrease";
  impact_rate: number;
  confidence: "high" | "medium" | "low";
  guide: string;
}

export interface CampaignImpactCampaign {
  campaign_id: string;
  campaign_name: string;
  period: { start_date: string; end_date: string };
  total_sales_amt: number;
  total_bill_cnt: number;
  active_days: number;
  affected_product_count: number;
  affected_products: CampaignAffectedProduct[];
}

export interface CampaignImpact {
  store_id: string;
  demo_date: string;
  active_campaign_count: number;
  affected_product_count: number;
  campaigns: CampaignImpactCampaign[];
  summary: {
    total_base_qty: number;
    total_adjustment_qty: number;
    total_final_qty: number;
  };
  note: string;
}

export interface CampaignDashboardResponse {
  store_id: string;
  demo_date: string;
  demo_time: string;
  active_campaign_count: number;
  total_campaign_sales: number;
  total_campaign_bills: number;
  affected_product_count: number;
  campaigns: Array<{
    campaign_id: string;
    campaign_name: string;
    start_date: string;
    end_date: string;
    total_sales_amt: number;
    total_bill_cnt: number;
    active_days: number;
  }>;
  campaign_impact: CampaignImpact;
  data_source: string;
}
