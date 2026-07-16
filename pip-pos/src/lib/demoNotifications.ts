import { useState, useEffect, useCallback, useRef } from "react";
import {
  appendDemoQueryParams,
  getDemoDateObject,
  getDemoDateTimeState,
  useDemoDateTime,
} from "./demoDateTime";
import { DEMO_PRIMARY_STORE_ID } from "./demoStoreConfig";

interface NotificationItem {
  id: string;
  severity: "urgent" | "caution" | "info";
  title: string;
  detail: string;
  actionLabel?: string;
  actionMenu?: string;
}

interface ToastItem {
  id: string;
  severity: "urgent" | "caution" | "info";
  title: string;
  detail: string;
  timestamp: string;
  actionMenu?: string;
}

function getAuthHeaders(): Record<string, string> {
  return {
    "X-User-Id": "U001",
    "X-User-Role": "store_owner",
    "X-Store-Id": DEMO_PRIMARY_STORE_ID,
  };
}

function buildApiUrl(path: string, options?: { includeBizDate?: boolean; includeDemoDateTime?: boolean }) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return appendDemoQueryParams(normalized, {
    includeBizDate: options?.includeBizDate ?? false,
    includeDemoTime: options?.includeDemoDateTime ?? false,
    includeDemoDateTime: options?.includeDemoDateTime ?? false,
  });
}

function normalizeYearInName(name: string): string {
  return name
    .replace(/20[12]\d\s*년\s*/g, "")
    .replace(/20[12]\d\.\d{2}\.\d{2}/g, "")
    .trim()
    .replace(/^\s*[\-\s]+\s*/, "")
    .trim();
}

function formatStockDisplay(value: number): string {
  if (value < 0) return `부족 ${Math.abs(value).toLocaleString("ko-KR")}개`;
  return `${value.toLocaleString("ko-KR")}개`;
}

async function fetchInventoryAlerts(): Promise<NotificationItem[]> {
  try {
    const res = await fetch(buildApiUrl("/api/inventory/current", { includeBizDate: true }), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.data ?? json;
    if (!Array.isArray(data)) return [];
    const items = data as Array<Record<string, unknown>>;
    const alerts: NotificationItem[] = [];
    const risky = items.filter((i) => {
      const statusVal = String(i.status ?? i.stockout_risk ?? "").toLowerCase();
      const stock = Number(i.current_stock ?? i.on_hand_eod ?? 0);
      return statusVal === "warning" || statusVal === "critical" || statusVal === "high" || stock <= 0;
    });
    if (risky.length > 0) {
      const names = risky.slice(0, 3).map((i) => String(i.product_name ?? "")).filter((n) => n.length > 1 && !/^\d+$/.test(n));
      alerts.push({
        id: "inv-risk",
        severity: "urgent",
        title: "재고 부족 경고",
        detail: `${risky.length}개 품목이 품절 위험입니다${names.length > 0 ? ` (${names.join(", ")} 등)` : ""}. 근거: 실시간 재고와 부족 수량 기준입니다. 지금 할 일: 생산관리에서 1차 생산 또는 보충 수량을 확인하세요.`,
        actionLabel: "생산관리 보기",
        actionMenu: "생산관리",
      });
    }
    return alerts;
  } catch {
    return [];
  }
}

function recalcMinutesRemaining(deadline: string): number {
  const dl = new Date(deadline);
  const demoState = getDemoDateTimeState();
  const demoDate = new Date(`${demoState.date}T${dl.toTimeString().slice(0, 8)}+09:00`);
  const diff = (demoDate.getTime() - getDemoDateObject().getTime()) / 60000;
  return Math.max(0, Math.round(diff));
}

function deadlineToStatus(minutes: number): "urgent" | "soon" | "ok" {
  if (minutes <= 60) return "urgent";
  if (minutes <= 180) return "soon";
  return "ok";
}

async function fetchOrderDeadlineAlerts(): Promise<NotificationItem[]> {
  try {
    const res = await fetch(buildApiUrl("/api/order/deadlines", { includeDemoDateTime: true }), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.data ?? json;
    if (!Array.isArray(data)) return [];
    const deadlines = data as Array<Record<string, unknown>>;
    const recalculated = deadlines.map((d) => {
      const dl = String(d.deadline ?? "");
      const min = dl ? recalcMinutesRemaining(dl) : Number(d.minutes_remaining ?? 0);
      return { product_group: String(d.product_group ?? ""), deadline: dl, minutes_remaining: min, status: deadlineToStatus(min) };
    });
    const alerts: NotificationItem[] = [];
    const urgent = recalculated.filter((d) => String(d.status) === "urgent" || String(d.status) === "soon");
    if (urgent.length > 0) {
      const groups = urgent.map((d) => d.product_group).filter((g) => g).join(", ");
      const minutes = Number(urgent[0].minutes_remaining ?? 0);
      const timeLabel = minutes > 0 ? `${minutes}분 남음` : "마감 임박";
      alerts.push({
        id: "order-deadline",
        severity: "urgent",
        title: "발주 마감 임박",
        detail: `${groups} 발주 마감 ${timeLabel}. 근거: 선택한 기준 시각 대비 남은 시간 계산입니다. 지금 할 일: 15시 마감 전 추천 옵션을 검토하세요.`,
        actionLabel: "발주 관리 보기",
        actionMenu: "발주 관리",
      });
    }
    return alerts;
  } catch {
    return [];
  }
}

function isMeaningfulProductName(name: string): boolean {
  if (!name || name.length < 2) return false;
  if (/^\d+$/.test(name)) return false;
  if (/^[A-Z]$/i.test(name)) return false;
  return true;
}

async function fetchSalesAlert(): Promise<NotificationItem[]> {
  try {
    const res = await fetch(buildApiUrl("/api/home/sales-summary", { includeBizDate: true }), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.data ?? json;
    const alerts: NotificationItem[] = [];
    const weekPct = Number(data?.vs_last_week_same_day_pct ?? 0);
    const topSellingList = Array.isArray(data?.top_selling) ? data.top_selling : [];
    const topSelling = topSellingList.find((i: Record<string, unknown>) => isMeaningfulProductName(String(i.product_name ?? ""))) ?? topSellingList[0];
    if (weekPct < -5) {
      alerts.push({
        id: "sales-alert",
        severity: "caution",
        title: "매출 감소 주의",
        detail: `최근 기준일 대비 ${weekPct}%. 근거: 일자별 매출 비교입니다. 지금 할 일: 성과 분석에서 하락 상품과 시간대를 먼저 확인하세요.`,
        actionLabel: "성과 분석 보기",
        actionMenu: "AI 기반 성과 분석",
      });
    }
    if (topSelling) {
      const name = String(topSelling.product_name ?? "");
      const qty = Number(topSelling.qty ?? topSelling.sales_qty ?? 0);
      const revenue = Number(topSelling.revenue ?? topSelling.sales_amt ?? 0);
      if (isMeaningfulProductName(name) && (qty > 0 || revenue > 0)) {
        alerts.push({
          id: "sales-top",
          severity: "info",
          title: "오늘 최다 판매",
          detail: `${name} ${qty}개 판매 (₩${revenue.toLocaleString()}). 근거: 금일 판매 상위 상품입니다. 지금 할 일: 상위 상품 재고와 노출 상태를 점검하세요.`,
        });
      }
    }
    return alerts;
  } catch {
    return [];
  }
}

async function fetchCampaignAlerts(): Promise<NotificationItem[]> {
  try {
    const res = await fetch(
      buildApiUrl(`/api/v1/analytics/promo-performance?store_id=${DEMO_PRIMARY_STORE_ID}`, {
        includeBizDate: true,
      }),
      { headers: getAuthHeaders() },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.data ?? json;
    if (!data || !Array.isArray(data.promotions) || data.promotions.length === 0) return [];
    const promos = data.promotions;
    const alerts: NotificationItem[] = [];
    const topPromo = promos.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (Number(a.bill_cnt ?? 0) > Number(b.bill_cnt ?? 0) ? a : b), promos[0] as Record<string, unknown>);
    const rawName = String(topPromo.campaign_name ?? topPromo.promo_name ?? "");
    const cleanName = normalizeYearInName(rawName);
    if (cleanName) {
      alerts.push({
        id: "campaign-top",
        severity: "info",
        title: "프로모션 성과 알림",
        detail: `최근 집계 기준 반응이 가장 높은 프로모션: "${cleanName}" (건수 ${topPromo.bill_cnt ?? 0}). 근거: 프로모션 반응 집계입니다. 지금 할 일: 프로모션 화면에서 적용 전후 차이를 확인하세요.`,
        actionLabel: "프로모션 성과 보기",
        actionMenu: "프로모션",
      });
    }
    return alerts;
  } catch {
    return [];
  }
}

async function fetchMenuInsights(menu: string): Promise<NotificationItem[]> {
  const alerts: NotificationItem[] = [];
  try {
    switch (menu) {
      case "생산관리": {
        const [invRes, prodRes] = await Promise.all([
          fetch(buildApiUrl("/api/inventory/current", { includeBizDate: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(buildApiUrl("/api/home/briefing", { includeBizDate: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (invRes) {
          const invData = invRes?.data ?? invRes;
          if (Array.isArray(invData)) {
            const risky = invData.filter((i: Record<string, unknown>) => {
              const s = String(i.status ?? i.stockout_risk ?? "").toLowerCase();
              const qty = Number(i.current_stock ?? i.on_hand_eod ?? 0);
              return s === "warning" || s === "critical" || s === "high" || qty <= 0;
            });
            if (risky.length > 0) {
              const names = risky.slice(0, 2).map((i: Record<string, unknown>) => String(i.product_name ?? "")).filter((n: string) => n.length > 1 && !/^\d+$/.test(n));
              const stockInfo = risky.slice(0, 2).map((i: Record<string, unknown>) => {
                const n = String(i.product_name ?? "");
                const q = Number(i.current_stock ?? i.on_hand_eod ?? 0);
                return `${n}: ${formatStockDisplay(Math.round(q))}`;
              }).filter((s: string) => !s.startsWith(":")).join(", ");
              alerts.push({
                id: "menu-prod-risk",
                severity: "urgent",
                title: "재고 위험 품목",
                detail: stockInfo ? `${risky.length}개 품목 품절 위험 (${stockInfo}). 근거: 현재 보유/부족 수량 기준입니다. 지금 할 일: 생산 계획을 다시 확인하세요.` : `${risky.length}개 품목 품절 위험. 근거: 실시간 재고 기준입니다. 지금 할 일: 생산 계획을 확인하세요.`,
              });
            }
          }
        }
        if (prodRes) {
          const bData = prodRes?.data ?? prodRes;
          const prod = bData?.today_production;
          if (prod && Array.isArray(prod) && prod.length > 0) {
            const first = prod[0] as Record<string, unknown>;
            const name = String(first.product_name ?? first.item_name ?? "");
            if (name && !/^\d+$/.test(name)) {
              alerts.push({
                id: "menu-prod-today",
                severity: "info",
                title: "오늘 생산 계획",
                detail: `최우선: ${name} (계획 ${first.planned_qty ?? first.qty ?? 0}개). 근거: 당일 생산 계획입니다. 지금 할 일: 1차 생산 등록 여부를 확인하세요.`,
              });
            }
          }
        }
        break;
      }
      case "발주 관리": {
        const [dlRes, recRes] = await Promise.all([
          fetch(buildApiUrl("/api/order/deadlines", { includeDemoDateTime: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(buildApiUrl("/api/order/recommendations", { includeBizDate: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (dlRes) {
          const dlData = dlRes?.data ?? dlRes;
          if (Array.isArray(dlData)) {
            const recalculated = (dlData as Array<Record<string, unknown>>).map((d) => {
              const dl = String(d.deadline ?? "");
              const min = dl ? recalcMinutesRemaining(dl) : Number(d.minutes_remaining ?? 0);
              return { product_group: String(d.product_group ?? ""), deadline: dl, minutes_remaining: min, status: deadlineToStatus(min) };
            });
            const soon = recalculated.filter((d) => String(d.status) === "urgent" || String(d.status) === "soon");
            if (soon.length > 0) {
              const group = soon[0].product_group;
              const min = Number(soon[0].minutes_remaining ?? 0);
              const label = min > 0 ? `${Math.round(min)}분 남음` : "마감 임박";
              alerts.push({
                id: "menu-order-soon",
                severity: "urgent",
                title: "발주 마감 임박",
                detail: `${group} 마감 ${label}. 근거: 선택 기준시각 대비 남은 시간입니다. 지금 할 일: 추천 옵션을 검토하고 확정 여부를 판단하세요.`,
              });
            }
          }
        }
        if (recRes) {
          const recData = recRes?.data ?? recRes;
          const items = recData?.items;
          if (Array.isArray(items) && items.length > 0) {
            const first = items[0] as Record<string, unknown>;
            const name = String(first.product_name ?? first.item_name ?? "");
            if (name && !/^\d+$/.test(name)) {
              alerts.push({
                id: "menu-order-rec",
                severity: "info",
                title: "AI 발주 추천",
                detail: `최우선: ${name} ${first.recommended_qty ?? first.qty ?? 0}건 발주 권장. 근거: 추천 발주 상위 품목입니다. 지금 할 일: 발주 관리에서 옵션별 근거를 비교하세요.`,
              });
            }
          }
        }
        break;
      }
      case "프로모션": {
        const salesRes = await fetch(buildApiUrl("/api/home/sales-summary", { includeBizDate: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (salesRes) {
          const sData = salesRes?.data ?? salesRes;
          const topSellingList = Array.isArray(sData?.top_selling) ? sData.top_selling : [];
          const topSelling = topSellingList.find((i: Record<string, unknown>) => isMeaningfulProductName(String(i.product_name ?? ""))) ?? topSellingList[0];
          if (topSelling) {
            const name = String(topSelling.product_name ?? "");
            const qty = Number(topSelling.qty ?? topSelling.sales_qty ?? 0);
            const revenue = Number(topSelling.revenue ?? topSelling.sales_amt ?? 0);
            if (isMeaningfulProductName(name) && (qty > 0 || revenue > 0)) {
              alerts.push({
                id: "menu-promo-top",
                severity: "info",
                title: "오늘 최다 판매 상품",
                detail: `${name} ${qty}건 (₩${revenue.toLocaleString()}). 근거: 최근 판매 상위 상품입니다. 지금 할 일: 이 상품과 연계된 프로모션 반응을 확인하세요.`,
              });
            }
          }
          const rev = Number(sData?.today_revenue ?? 0);
          const weekPct = Number(sData?.vs_last_week_same_day_pct ?? 0);
          if (rev > 0) {
            alerts.push({
              id: "menu-promo-rev",
              severity: weekPct < 0 ? "caution" : "info",
              title: weekPct < 0 ? "매출 전주 대비 감소" : "매출 전주 대비 증가",
              detail: `오늘 매출 ₩${rev.toLocaleString()} (전주 대비 ${weekPct > 0 ? "+" : ""}${weekPct}%). 근거: 전주 동요일 비교입니다. 지금 할 일: ${weekPct < 0 ? "프로모션 강화를 검토하세요." : "효과가 좋은 프로모션을 유지하세요."}`,
            });
          }
        }
        break;
      }
      case "AI 기반 성과 분석": {
        const salesRes = await fetch(buildApiUrl("/api/home/sales-summary", { includeBizDate: true }), { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (salesRes) {
          const sData = salesRes?.data ?? salesRes;
          const rev = Number(sData?.today_revenue ?? 0);
          const weekPct = Number(sData?.vs_last_week_same_day_pct ?? 0);
          if (rev > 0) {
              alerts.push({
                id: "menu-perf-summary",
                severity: weekPct < -5 ? "caution" : "info",
                title: "오늘 매출 요약",
                detail: `₩${rev.toLocaleString()} (전주 대비 ${weekPct > 0 ? "+" : ""}${weekPct}%). 근거: 전주 동요일 비교입니다. 지금 할 일: 상세 분석에서 하락 원인을 확인하세요.`,
              });
          }
          const topSelling = Array.isArray(sData?.top_selling) && sData.top_selling.length > 0 ? sData.top_selling.slice(0, 3) : [];
          if (topSelling.length > 0) {
            const names = topSelling.map((i: Record<string, unknown>) => String(i.product_name ?? "")).filter((n: string) => isMeaningfulProductName(n));
            if (names.length > 0) {
              alerts.push({
                id: "menu-perf-top",
                severity: "info",
                title: "상위 판매 상품",
                detail: `${names.join(", ")} — 근거: 금일 상위 판매 기준입니다. 지금 할 일: 매출 기여도와 품절 여부를 함께 확인하세요.`,
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // silent
  }
  return alerts;
}

function getDemoTimeLabel(): string {
  return getDemoDateTimeState().time;
}

function getDemoDateLabel(): string {
  return getDemoDateTimeState().date.replace(/-/g, ".");
}

export function useDemoNotifications(selectedMenu: string) {
  const demoDateTime = useDemoDateTime();
  const [entryAlerts, setEntryAlerts] = useState<NotificationItem[]>([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [hasShownEntry, setHasShownEntry] = useState(false);
  const [toastQueue, setToastQueue] = useState<NotificationItem[]>([]);
  const prevMenuRef = useRef<string>("");
  const shownMenuToastsRef = useRef<Set<string>>(new Set());
  const demoKey = `${demoDateTime.date}-${demoDateTime.time}`;

  const loadAlerts = useCallback(async () => {
    const [inv, order, sales, campaign] = await Promise.all([
      fetchInventoryAlerts(),
      fetchOrderDeadlineAlerts(),
      fetchSalesAlert(),
      fetchCampaignAlerts(),
    ]);
    const all = [...inv, ...order, ...sales, ...campaign];
    const urgent = all.filter((a) => a.severity === "urgent");
    const caution = all.filter((a) => a.severity === "caution");
    const info = all.filter((a) => a.severity === "info");
    const sorted = [...urgent.slice(0, 2), ...caution.slice(0, 1), ...info.slice(0, 1)];
    return sorted.slice(0, 3);
  }, []);

  useEffect(() => {
    if (hasShownEntry) return;
    let cancelled = false;
    (async () => {
      const alerts = await loadAlerts();
      if (cancelled) return;
      if (alerts.length > 0) {
        setEntryAlerts(alerts);
        setShowEntryModal(true);
        setHasShownEntry(true);
        setToastQueue(alerts);
      }
    })();
    return () => { cancelled = true; };
  }, [hasShownEntry, loadAlerts, demoKey]);

  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = setTimeout(() => {
      setToastQueue((prev) => prev.slice(1));
      setToasts((prev) => [
        ...prev,
        {
          ...toastQueue[0],
          id: `toast-${Date.now()}`,
          timestamp: getDemoTimeLabel(),
        },
      ]);
    }, 1200);
    return () => clearTimeout(timer);
  }, [toastQueue]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!hasShownEntry) return;
    if (selectedMenu === prevMenuRef.current) return;
    if (!selectedMenu) return;
    prevMenuRef.current = selectedMenu;
    if (shownMenuToastsRef.current.has(selectedMenu)) return;
    const noInsight = ["종합 현황", "AI 실시간 현황", "알람 설정", "AI 검증", "벤치마킹"];
    if (noInsight.includes(selectedMenu)) return;

    shownMenuToastsRef.current.add(selectedMenu);
    let cancelled = false;
    (async () => {
      const insights = await fetchMenuInsights(selectedMenu);
      if (cancelled || insights.length === 0) return;
      const limited = insights.slice(0, 1);
      setToasts((prev) => [
        ...prev,
        ...limited.map((item, idx) => ({
          ...item,
          id: `menu-toast-${Date.now()}-${idx}`,
          timestamp: getDemoTimeLabel(),
        })),
      ]);
    })();
    return () => { cancelled = true; };
  }, [selectedMenu, hasShownEntry, demoKey]);

  useEffect(() => {
    setEntryAlerts([]);
    setShowEntryModal(false);
    setToasts([]);
    setToastQueue([]);
    setHasShownEntry(false);
    prevMenuRef.current = "";
    shownMenuToastsRef.current.clear();
  }, [demoKey]);

  return {
    entryAlerts,
    showEntryModal,
    setShowEntryModal,
    toasts,
    dismissToast,
    getDemoDateLabel,
    getDemoTimeLabel,
  };
}

export type { NotificationItem, ToastItem };
export { getDemoDateLabel, getDemoTimeLabel };
