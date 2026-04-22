import { STORE_LIST, getStoresByFilter, type StoreFilter, formatKRW, formatKRWShort } from "./hqData";

const API_BASE = "";

function buildHeaders(storeId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-User-Role": "hq_admin",
    "X-User-Id": "HQ_ADMIN",
    "X-Store-Id": storeId,
  };
}

async function requestJSON<T>(endpoint: string, storeId: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: buildHeaders(storeId),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return (payload?.data ?? payload) as T;
  } catch {
    return null;
  }
}

export interface HQSalesSummary {
  totalStores: number;
  operatingStores: number;
  totalSalesAmt: number;
  avgSalesPerStore: number;
  topStore: { store_id: string; store_name: string; sales: number } | null;
  bottomStore: { store_id: string; store_name: string; sales: number } | null;
  vsYesterdayPct: number | null;
  vsLastWeekPct: number | null;
  storeBreakdown: Array<{
    store_id: string;
    store_name: string;
    sales: number;
    vsYesterdayPct: number | null;
  }>;
}

export interface HQInventorySummary {
  totalItems: number;
  lowStockStores: string[];
  criticalStores: string[];
  topRiskItems: Array<{
    product_name: string;
    category: string;
    stores_at_risk: number;
    avg_stock: number;
  }>;
  storeInventory: Array<{
    store_id: string;
    store_name: string;
    total_items: number;
    low_stock_count: number;
    risk_level: "HIGH" | "MEDIUM" | "LOW";
  }>;
}

export interface HQStoreStatus {
  store_id: string;
  store_name: string;
  region: string;
  city: string;
  status: "정상" | "주의" | "위험";
  sales: number | null;
  vsYesterdayPct: number | null;
  inventoryRisk: "HIGH" | "MEDIUM" | "LOW";
  alertCount: number;
  lastUpdated: string;
}

export interface HQHourlySales {
  hours: string[];
  today: number[];
  lastWeek: number[];
}

export interface HQCategorySales {
  categories: Array<{
    category: string;
    total_sales: number;
    pct_of_total: number;
    store_count: number;
  }>;
}

export interface HQPaymentMethod {
  methods: Array<{
    group_name: string;
    code_count: number;
    transaction_count: number;
  }>;
}

export interface HQCampaignSummary {
  totalCampaignStores: number;
  avgCampaignShare: number;
  topCampaignStores: Array<{
    store_id: string;
    store_name: string;
    campaign_share: number;
    estimatedCampaignSales: number;
  }>;
}

export async function fetchHQSalesSummary(filter: StoreFilter): Promise<HQSalesSummary> {
  const stores = getStoresByFilter(filter);
  const storeSales: Array<{ store_id: string; store_name: string; sales: number; vsYesterdayPct: number | null }> = [];
  
  const results = await Promise.allSettled(
    stores.map(async (store) => {
      const data = await requestJSON<any>(`/api/home/sales-summary`, store.store_id);
      return { store_id: store.store_id, store_name: store.store_name, data };
    })
  );

  let totalSales = 0;
  let operatingCount = 0;
  let totalVsYesterdayPct = 0;
  let vsYesterdayCount = 0;
  let totalVsLastWeekPct = 0;
  let vsLastWeekCount = 0;

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.data) {
      const d = r.value.data;
      const sales = d.today_revenue || d.total_sales_amt || 0;
      const vsY = d.vs_yesterday_same_time_pct ?? d.vs_yesterday_pct ?? null;
      const vsLW = d.vs_last_week_same_day_pct ?? d.vs_last_week_pct ?? null;
      totalSales += sales;
      if (sales > 0) operatingCount++;
      storeSales.push({
        store_id: r.value.store_id,
        store_name: r.value.store_name,
        sales,
        vsYesterdayPct: vsY,
      });
      if (vsY != null) { totalVsYesterdayPct += vsY; vsYesterdayCount++; }
      if (vsLW != null) { totalVsLastWeekPct += vsLW; vsLastWeekCount++; }
    } else if (r.status === "fulfilled") {
      storeSales.push({
        store_id: r.value.store_id,
        store_name: r.value.store_name,
        sales: 0,
        vsYesterdayPct: null,
      });
    }
  }

  storeSales.sort((a, b) => b.sales - a.sales);

  return {
    totalStores: stores.length,
    operatingStores: operatingCount || stores.length,
    totalSalesAmt: totalSales,
    avgSalesPerStore: operatingCount > 0 ? totalSales / operatingCount : 0,
    topStore: storeSales[0] ? { store_id: storeSales[0].store_id, store_name: storeSales[0].store_name, sales: storeSales[0].sales } : null,
    bottomStore: storeSales[storeSales.length - 1] ? { store_id: storeSales[storeSales.length - 1].store_id, store_name: storeSales[storeSales.length - 1].store_name, sales: storeSales[storeSales.length - 1].sales } : null,
    vsYesterdayPct: vsYesterdayCount > 0 ? totalVsYesterdayPct / vsYesterdayCount : null,
    vsLastWeekPct: vsLastWeekCount > 0 ? totalVsLastWeekPct / vsLastWeekCount : null,
    storeBreakdown: storeSales,
  };
}

export async function fetchHQInventorySummary(filter: StoreFilter): Promise<HQInventorySummary> {
  const stores = getStoresByFilter(filter);
  const productRiskMap: Record<string, { product_name: string; category: string; stores: number; totalStock: number }> = {};
  const storeInv: Array<{ store_id: string; store_name: string; total_items: number; low_stock_count: number; risk_level: "HIGH" | "MEDIUM" | "LOW" }> = [];
  const lowStockStores: string[] = [];
  const criticalStores: string[] = [];

  const results = await Promise.allSettled(
    stores.map(async (store) => {
      const data = await requestJSON<any[]>(`/api/inventory/current`, store.store_id);
      return { store_id: store.store_id, store_name: store.store_name, data };
    })
  );

  let totalItems = 0;

  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value.data)) {
      const items = r.value.data;
      let lowCount = 0;
      let criticalCount = 0;
      for (const item of items) {
        totalItems++;
        const stock = item.current_stock ?? item.on_hand_eod ?? 0;
        const name = item.product_name || "알수없음";
        const cat = item.category || "기타";
        const key = `${item.product_id || name}`;
        if (!productRiskMap[key]) {
          productRiskMap[key] = { product_name: name, category: cat, stores: 0, totalStock: 0 };
        }
        productRiskMap[key].stores++;
        productRiskMap[key].totalStock += stock;
        if (stock <= 2) {
          lowCount++;
          if (stock <= 0) criticalCount++;
        }
        if (item.status === "critical" || item.stockout_risk === "HIGH") criticalCount++;
        if (item.status === "warning" || item.stockout_risk === "MEDIUM") lowCount++;
      }
      let riskLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (criticalCount >= 3) { riskLevel = "HIGH"; criticalStores.push(r.value.store_name); }
      else if (lowCount >= 5 || criticalCount >= 1) { riskLevel = "MEDIUM"; lowStockStores.push(r.value.store_name); }
      storeInv.push({
        store_id: r.value.store_id,
        store_name: r.value.store_name,
        total_items: items.length,
        low_stock_count: lowCount,
        risk_level: riskLevel,
      });
    }
  }

  const topRiskItems = Object.values(productRiskMap)
    .map((p) => ({ ...p, stores_at_risk: p.stores, avg_stock: Math.round(p.totalStock / p.stores) }))
    .filter((p) => p.avg_stock <= 5)
    .sort((a, b) => a.avg_stock - b.avg_stock)
    .slice(0, 10);

  storeInv.sort((a, b) => {
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return riskOrder[a.risk_level] - riskOrder[b.risk_level];
  });

  return {
    totalItems,
    lowStockStores,
    criticalStores,
    topRiskItems,
    storeInventory: storeInv,
  };
}

export async function fetchHQStoreStatuses(filter: StoreFilter): Promise<HQStoreStatus[]> {
  const stores = getStoresByFilter(filter);

  const results = await Promise.allSettled(
    stores.map(async (store) => {
      const [salesData, inventoryData] = await Promise.all([
        requestJSON<any>(`/api/home/sales-summary`, store.store_id),
        requestJSON<any[]>(`/api/inventory/current`, store.store_id),
      ]);
      return { store, salesData, inventoryData };
    })
  );

  const statuses: HQStoreStatus[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { store, salesData, inventoryData } = r.value;
    const sales = salesData?.today_revenue || salesData?.total_sales_amt || null;
    const vsPct = salesData?.vs_yesterday_same_time_pct ?? salesData?.vs_last_week_same_day_pct ?? null;
    let invRisk: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let alertCount = 0;
    if (Array.isArray(inventoryData)) {
      const criticals = inventoryData.filter((i: any) => i.status === "critical" || i.stockout_risk === "HIGH");
      const warnings = inventoryData.filter((i: any) => i.status === "warning" || i.stockout_risk === "MEDIUM");
      alertCount = criticals.length + warnings.length;
      if (criticals.length >= 3) invRisk = "HIGH";
      else if (criticals.length >= 1 || warnings.length >= 5) invRisk = "MEDIUM";
    }
    let status: "정상" | "주의" | "위험" = "정상";
    if (invRisk === "HIGH" || (vsPct != null && vsPct < -15)) status = "위험";
    else if (invRisk === "MEDIUM" || (vsPct != null && vsPct < -5)) status = "주의";

    statuses.push({
      store_id: store.store_id,
      store_name: store.store_name,
      region: store.region,
      city: store.city,
      status,
      sales,
      vsYesterdayPct: vsPct,
      inventoryRisk: invRisk,
      alertCount,
      lastUpdated: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  statuses.sort((a, b) => {
    const statusOrder = { 위험: 0, 주의: 1, 정상: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return statuses;
}

export async function fetchHQCategorySales(filter: StoreFilter): Promise<HQCategorySales> {
  const stores = getStoresByFilter(filter);
  const categoryMap: Record<string, { total: number; count: number }> = {};

  const results = await Promise.allSettled(
    stores.slice(0, 10).map((store) =>
      requestJSON<any>(`/api/v1/analytics/category-sales?store_id=${encodeURIComponent(store.store_id)}&days=1`, store.store_id)
    )
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value && typeof r.value === "object") {
      const cats = (r.value as any).categories || (r.value as any).data?.categories || [];
      for (const cat of cats) {
        const name = cat.category || "기타";
        if (!categoryMap[name]) categoryMap[name] = { total: 0, count: 0 };
        categoryMap[name].total += cat.total_sales || 0;
        categoryMap[name].count++;
      }
    }
  }

  const totalSales = Object.values(categoryMap).reduce((s, c) => s + c.total, 0);
  const categories = Object.entries(categoryMap)
    .map(([category, v]) => ({
      category,
      total_sales: v.total,
      pct_of_total: totalSales > 0 ? (v.total / totalSales) * 100 : 0,
      store_count: v.count,
    }))
    .sort((a, b) => b.total_sales - a.total_sales);

  return { categories };
}

export async function fetchHQHourlySales(filter: StoreFilter): Promise<HQHourlySales> {
  const stores = getStoresByFilter(filter);
  const hourLabels = ["06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21"];
  const todayAgg = new Array(16).fill(0);
  const lastWeekAgg = new Array(16).fill(0);
  let storeCount = 0;

  const results = await Promise.allSettled(
    stores.slice(0, 10).map((store) =>
      requestJSON<any>(`/api/v1/analytics/hourly-sales?store_id=${encodeURIComponent(store.store_id)}`, store.store_id)
    )
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const d = r.value;
      storeCount++;
      const todayPoints = d.today || d.data?.today || [];
      const lwPoints = d.last_week || d.data?.last_week || [];
      for (let i = 0; i < Math.min(todayPoints.length, 16); i++) {
        todayAgg[i] += todayPoints[i]?.sales_estimated || todayPoints[i]?.value || 0;
      }
      for (let i = 0; i < Math.min(lwPoints.length, 16); i++) {
        lastWeekAgg[i] += lwPoints[i]?.sales_estimated || lwPoints[i]?.value || 0;
      }
    }
  }

  return {
    hours: hourLabels.map((h) => `${h}시`),
    today: todayAgg,
    lastWeek: lastWeekAgg,
  };
}