// ── 대시보드 통계 ───────────────────────────────────────────────
// label, subLabel은 고정값이므로 컴포넌트에서 직접 정의
export interface StatCardData {
  id: string;
  value: string;
  unit: string;
  changeValue: string;
  changeType: "up" | "down";
  sparkData: number[];
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
  title: string;
  description: string;
  channel?: PromotionChannel;
  daysLeft?: number;
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
  | "프로모션"
  | "캠페인";

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

export type AlarmCategory = "재고" | "배송" | "Agent" | "배달" | "고객";
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
  badgeLabel?: string;
  currentLabel?: string;
  detailLabel?: string;
  predictedStock1h?: number;
  predictedLabel?: string;
  recommendedProductionQty?: number;
  hourlyBurnRate?: number;
  riskLevel?: string;
  stockoutProbability?: number;
  groundingLabel?: string;
  actionLabel?: string;
  firstProductionTime?: string | null;
  firstProductionQty?: number | null;
  secondProductionTime?: string | null;
  secondProductionQty?: number | null;
  leadTimeLabel?: string;
}

export interface ProductionAgentData {
  items: ProductionItem[];
  aiRecommendation: string;
  lastUpdated: string;
}

// ── 생산관리 예상 추가 매출 배너 ────────────────────────────────
export interface ProductionSummary {
  expectedRevenue: string;
  urgentCount: number;
  urgentLabel: string;
}

// ── 생산관리 배치 현황 ──────────────────────────────────────────
export type ProductionBatchStatus = "생산 완료" | "재고적정" | null;

export interface ProductionBatchItem {
  id: string;
  name: string;
  bgColor: string;
  status: ProductionBatchStatus;
  aiWarning: string | null;
  lossAmount: string | null;
  currentCount: number;
  targetShortfall: number | null;
  progressPercent: number;
  currentStockLabel?: string;
  shortageLabel?: string | null;
  detailLabel?: string;
  shortageCount?: number;
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
  status: "완료" | "준비" | "수령";
  productName: string;
  type: "배달" | "POS";
}

export interface OrderHourlyPoint {
  time: string;
  value: number;
}

export interface OrderAgentData {
  items: RealtimeOrderItem[];
  todaySales: string;
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

// ── AI 추천 발주 ───────────────────────────────────────────────
export type AiOrderStatus = "발주 완료" | "납품 완료" | null;

export interface AiOrderSummary {
  weekLabel: string;
  reportDate: string;
  reportTime: string;
  totalCount: number;
  aiScore: string; // AI 추천 신뢰도 (예: "98.2%")
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
  week: string; // "1주차"
  responseRate: number;
  conversionRate: number;
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
