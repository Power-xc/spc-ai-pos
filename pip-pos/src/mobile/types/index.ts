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

// ========== 발주 탭 ==========
export interface AiRecommendedItem {
  id: string;
  name: string;
  recommendedQty: number;
  currentStock: number;
  unit: string;
}

export interface OrderItem {
  id: string;
  name: string;
  category: "도넛" | "먼치킨" | "원재료" | "포장";
  stock: number;
  unit: string;
  recommendedQty: number;
  unitPrice: number;
}

export interface OrderPageData {
  deliveryDate: string;
  aiAccuracy: number;
  aiItems: AiRecommendedItem[];
  items: OrderItem[];
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
