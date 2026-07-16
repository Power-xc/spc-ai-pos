export interface MobileStore {
  id: string;
  name: string;
  notificationCount: number;
}

export interface NoticeItem {
  id: string;
  text: string;
}

export interface PipAiAlert {
  id: string;
  message: string;
}

export type NotificationCategory = "발송로그" | "운영알림";

export interface NotificationItem {
  id: string;
  title: string;
  time: string;
  category: NotificationCategory;
  isRead: boolean;
  isDispatched?: boolean;
  isUrgent?: boolean;
}

export interface SalesHourlyPoint {
  time: string;
  myStore: number;
  nearby: number;
}

export interface DailySalesData {
  date: string;
  isToday: boolean;
  sales: number;
  laborCost: number;
  materialCost: number;
  netProfit: number;
  chartData: SalesHourlyPoint[];
}

export interface AiAction {
  id: string;
  title: string;
  subtitle: string;
  badgeType: "추천" | "긴급";
  iconUrl: string;
}

export interface EventItem {
  id: string;
  month: string;
  day: string;
  title: string;
  subtitle: string;
  isActive: boolean;
}

export interface EventScheduleData {
  thisMonthCount: number;
  aiRecommendation: string;
  events: EventItem[];
  calendarRange: string;
  highlightedDays: number[];
}

export interface ReviewData {
  averageRating: number;
  totalReviews: number;
  responseRate: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
}

export type ReviewSentiment = "긍정" | "혼합" | "부정";
export type ReviewPlatform = "배민" | "쿠팡이츠" | "네이버";

export interface ReviewKeywordInsight {
  keyword: string;
  type: "개선" | "유지";
  summary: string;
}

export interface ReviewKeywordItem {
  keyword: string;
  count: number;
  icon: string;
  highlight?: boolean;
}

export interface ReviewListItem {
  id: string;
  reviewerName: string;
  platform: ReviewPlatform;
  rating: number;
  date: string;
  content: string;
  tags: string[];
  sentiment: ReviewSentiment;
}

export interface ReviewFullData {
  periodLabel: string;
  totalCount: number;
  averageRating: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  analysisText: string;
  insights: ReviewKeywordInsight[];
  positiveKeywords: ReviewKeywordItem[];
  positiveMentionCount: number;
  negativeKeywords: ReviewKeywordItem[];
  negativeMentionCount: number;
  reviews: ReviewListItem[];
}

// ========== 성과 시뮬레이터 ==========
export interface HourlySalesRow {
  hour: string;
  today: number;
  yesterday: number;
  lastWeek: number;
  isPeak?: boolean;
}

export interface PerformanceSummary {
  todayTotal: number;
  deltaPct: number;
  peakHour: string;
  peakSales: number;
  txCount: number;
  avgTicket: number;
}

export interface GoalMetric {
  value: number;
  target: number;
  unit: string;
}

export interface GoalAchievement {
  sales: GoalMetric;
  tx: GoalMetric;
  avgTicket: GoalMetric;
}

export interface NearbyStore {
  rank: number;
  distanceKm: number;
  sales: number;
  isOurs: boolean;
}

export type PromotionCategory = "커피/음료" | "도넛/먼치킨" | "계절상품" | "핫밀";

export interface PromotionItem {
  id: string;
  name: string;
  category: PromotionCategory;
  oldPrice: number;
  newPrice: number;
  deltaPrice: number;
  profitRate: number;
  recommended: boolean;
}

export interface PerformanceSimulatorData {
  hourly: HourlySalesRow[];
  summary: PerformanceSummary;
  goal: GoalAchievement;
  nearby: NearbyStore[];
  promotion: {
    categories: PromotionCategory[];
    items: PromotionItem[];
  };
}

// ========== 발주 탭 ==========
export interface AiRecommendedItem {
  id: string;
  name: string;
  recommendedQty: number;
  currentStock: number;
  unit: string;
  weeklyDemandDelta: number;
  unitPrice: number;
}

export interface OrderItem {
  id: string;
  name: string;
  category: "도넛" | "먼치킨" | "원재료" | "포장";
  stock: number;
  unit: string;
  recommendedQty: number;
  unitPrice: number;
  deliverySlot?: string;
  deliveryTime?: string;
}

export interface OrderPageData {
  deliveryDate: string;
  aiAccuracy: number;
  aiItems: AiRecommendedItem[];
  items: OrderItem[];
}

export interface OrderSubmitSlot {
  slot: string;
  time: string;
  itemCount: number;
  amount: number;
}

export interface OrderItemConfirmed {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  deliverySlot: string;
}

export interface OrderSubmitResult {
  orderId: string;
  submittedAt: string;
  totalItems: number;
  totalQty: number;
  totalAmount: number;
  slotCount: number;
  slots: OrderSubmitSlot[];
  confirmedItems: OrderItemConfirmed[];
}

// ========== 매장 탭 ==========
export interface StaffMember {
  id: string;
  name: string;
  role: "점주" | "스태프" | "피트타이머";
  startTime: string;
  endTime: string;
  status: "현장" | "퇴근";
  avatar?: string;
}

export interface InventoryUrgentItem {
  id: string;
  name: string;
  // 09:00 기준 오프셋(시간): startHour~endHour 구간이 재고 가용 범위
  startHour: number;
  endHour: number;
}

export interface InventorySlackItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface ProductionOrder {
  id: string;
  name: string;
  deadline: string;
  quantity: number;
  unit: string;
  isUrgent: boolean;
}

export interface StorePageData {
  staffCount: number;
  staff: StaffMember[];
  inventory: {
    urgentCount: number;
    lastChecked: string;
    urgentItems: InventoryUrgentItem[];
    slackItems: InventorySlackItem[];
  };
  production: {
    urgentCount: number;
    orders: ProductionOrder[];
  };
}

export type TodoCategory = "긴급" | "발주" | "프로모션" | "일반";
export type TodoStatus = "대기" | "진행중" | "완료" | "보류";

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  category: TodoCategory;
  status: TodoStatus;
  deadline: string;
  expectedImpact?: string;
}
