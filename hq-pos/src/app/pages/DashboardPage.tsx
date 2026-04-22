import { useState, useEffect } from "react";
import { HeroPanel } from "../components/HeroPanel";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, formatKRW, getFilterLabel, type StoreFilter } from "../../lib/hqData";
import { fetchHQSalesSummary, fetchHQStoreStatuses, type HQSalesSummary, type HQStoreStatus } from "../../lib/hqApi";

export function DashboardPage() {
  const { filter } = useStoreFilter();
  const [salesSummary, setSalesSummary] = useState<HQSalesSummary | null>(null);
  const [storeStatuses, setStoreStatuses] = useState<HQStoreStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sales, statuses] = await Promise.all([
          fetchHQSalesSummary(filter),
          fetchHQStoreStatuses(filter),
        ]);
        if (!cancelled) {
          setSalesSummary(sales);
          setStoreStatuses(statuses);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  const filterLabel = getFilterLabel(filter);
  const activeStores = storeStatuses.filter((s) => s.status === "정상").length;
  const warningStores = storeStatuses.filter((s) => s.status === "주의").length;
  const dangerStores = storeStatuses.filter((s) => s.status === "위험").length;
  const totalAlerts = storeStatuses.reduce((s, st) => s + st.alertCount, 0);

  const kpiCards = [
    {
      label: "전체 매출",
      value: salesSummary ? formatKRW(salesSummary.totalSalesAmt) : "...",
      valueFontSize: 18,
      changeDir: (salesSummary?.vsYesterdayPct ?? 0) >= 0 ? "up" as const : "down" as const,
      change: salesSummary?.vsYesterdayPct != null ? `${salesSummary.vsYesterdayPct >= 0 ? "+" : ""}${salesSummary.vsYesterdayPct.toFixed(1)}%` : "—",
      meta: "전일 대비",
    },
    {
      label: "운영 점포",
      value: `${storeStatuses.length}/${STORE_LIST.length}`,
      valueFontSize: 18,
      changeDir: "neutral" as const,
      change: `${filterLabel}`,
      meta: "정상 운영중",
    },
    {
      label: "위험 점포",
      value: `${dangerStores}`,
      valueFontSize: 22,
      changeDir: dangerStores > 0 ? "down" as const : "neutral" as const,
      change: dangerStores > 0 ? `${dangerStores}개 위험` : "없음",
      meta: dangerStores > 0 ? "즉시 확인 필요" : "안정",
    },
    {
      label: "알림 건수",
      value: `${totalAlerts}`,
      valueFontSize: 22,
      changeDir: totalAlerts > 10 ? "down" as const : "neutral" as const,
      change: totalAlerts > 10 ? `${totalAlerts}건` : `${totalAlerts}건`,
      meta: "재고/매출 이슈",
    },
  ];

  const agents = [
    { name: "매출", role: "전체 점포 매출 분석", color: "#ff6e00", confidence: 87, action: `${storeStatuses.length}개 점포 집계 완료`, activity: [40, 55, 70, 65, 80], to: "/sales" },
    { name: "재고", role: "재고 위험 점포 모니터링", color: "#dc2626", confidence: 82, action: `위험 ${dangerStores} · 주의 ${warningStores}`, activity: [60, 50, 80, 70, 55], to: "/inventory" },
    { name: "운영", role: "점포 운영 상태 관리", color: "#2563eb", confidence: 91, action: `정상 ${activeStores} · 이슈 ${dangerStores + warningStores}`, activity: [70, 80, 65, 90, 75], to: "/store-ops" },
  ];

  const briefingText = loading
    ? "데이터를 불러오는 중..."
    : `전체 ${storeStatuses.length}개 점포 · ${formatKRW(salesSummary?.totalSalesAmt ?? 0)} 매출 · 위험 ${dangerStores}개 점포 · 주의 ${warningStores}개 점포`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: "100%",
        margin: "0 auto",
        padding: "0 4px",
      }}
    >
      <HeroPanel kpiCards={kpiCards} agents={agents} briefingText={briefingText} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#111827" }}>점포별 매출 현황</h3>
          {loading ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>데이터를 불러오는 중...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {(salesSummary?.storeBreakdown || []).slice(0, 15).map((s, i) => (
                <div key={s.store_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", width: 20, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", width: 80 }}>{s.store_name}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      background: s.sales > 0 ? "linear-gradient(90deg, #ff6e00, #e91e8c)" : "#ddd",
                      width: `${Math.min(100, (s.sales / ((salesSummary?.topStore?.sales || 1))) * 100)}%`,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", width: 90, textAlign: "right" }}>
                    {formatKRW(s.sales)}
                  </span>
                  {s.vsYesterdayPct != null && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.vsYesterdayPct >= 0 ? "#16a34a" : "#dc2626", width: 60, textAlign: "right" }}>
                      {s.vsYesterdayPct >= 0 ? "+" : ""}{s.vsYesterdayPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#111827" }}>점포 운영 상태</h3>
          {loading ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>데이터를 불러오는 중...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <div style={{ padding: "8px 14px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{activeStores}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>정상</div>
                </div>
                <div style={{ padding: "8px 14px", borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{warningStores}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>주의</div>
                </div>
                <div style={{ padding: "8px 14px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{dangerStores}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>위험</div>
                </div>
              </div>
              {storeStatuses.filter((s) => s.status !== "정상").map((s) => (
                <div key={s.store_id} style={{
                  padding: "8px 12px", borderRadius: 10,
                  background: s.status === "위험" ? "#fef2f2" : "#fffbeb",
                  border: `1px solid ${s.status === "위험" ? "#fecaca" : "#fde68a"}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{s.store_name}</span>
                    <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>({s.city})</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {s.inventoryRisk !== "LOW" && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: s.inventoryRisk === "HIGH" ? "#fef2f2" : "#fffbeb", color: s.inventoryRisk === "HIGH" ? "#dc2626" : "#d97706" }}>
                        재고 {s.inventoryRisk}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 800, color: s.status === "위험" ? "#dc2626" : "#d97706" }}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
              {storeStatuses.filter((s) => s.status !== "정상").length === 0 && (
                <div style={{ textAlign: "center", color: "#16a34a", fontSize: 13, padding: 20 }}>
                  모든 점포가 정상 운영중입니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#111827" }}>지역별 매출 분포</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(
              STORE_LIST.reduce<Record<string, { count: number; totalSales: number }>>((acc, s) => {
                if (!acc[s.region]) acc[s.region] = { count: 0, totalSales: 0 };
                acc[s.region].count++;
                acc[s.region].totalSales += s.annual_sales || 0;
                return acc;
              }, {})
            )
              .sort((a, b) => b[1].totalSales - a[1].totalSales)
              .map(([region, data]) => {
                const maxSales = Math.max(...STORE_LIST.map((s) => s.annual_sales || 0)) * STORE_LIST.length;
                return (
                  <div key={region} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", width: 80 }}>{region}</span>
                    <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999,
                        background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                        width: `${(data.totalSales / (maxSales || 1)) * 100}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#6b7280", width: 60, textAlign: "right" }}>{data.count}개</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#111827" }}>캠페인 성과 상위 점포</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {STORE_LIST
              .filter((s) => s.campaign_share > 0)
              .sort((a, b) => b.campaign_share - a.campaign_share)
              .slice(0, 8)
              .map((s) => (
                <div key={s.store_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", width: 80 }}>{s.store_name}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      background: "linear-gradient(90deg, #ff6e00, #e91e8c)",
                      width: `${(s.campaign_share / 0.1) * 100}%`,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#ff6e00", width: 50, textAlign: "right" }}>
                    {(s.campaign_share * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>
              캠페인 매출 비중 기준 · 전체 {STORE_LIST.filter((s) => s.campaign_share > 0).length}개 점포 참여
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}