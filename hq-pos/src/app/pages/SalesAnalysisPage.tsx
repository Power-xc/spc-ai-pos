import { useState, useEffect } from "react";
import { ComposedChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, formatKRW, getFilterLabel } from "../../lib/hqData";
import { fetchHQSalesSummary, fetchHQHourlySales, fetchHQCategorySales, type HQSalesSummary, type HQHourlySales, type HQCategorySales } from "../../lib/hqApi";

const COLORS = ["#ff6e00", "#e91e8c", "#2563eb", "#7c3aed", "#16a34a", "#d97706"];

export function SalesAnalysisPage() {
  const { filter } = useStoreFilter();
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");
  const [salesSummary, setSalesSummary] = useState<HQSalesSummary | null>(null);
  const [hourlyData, setHourlyData] = useState<HQHourlySales | null>(null);
  const [categoryData, setCategoryData] = useState<HQCategorySales | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sales, hourly, category] = await Promise.all([
          fetchHQSalesSummary(filter),
          fetchHQHourlySales(filter),
          fetchHQCategorySales(filter),
        ]);
        if (!cancelled) {
          setSalesSummary(sales);
          setHourlyData(hourly);
          setCategoryData(category);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  const hourlyChartData = hourlyData
    ? hourlyData.hours.map((h, i) => ({
        time: h,
        금일: hourlyData.today[i] || 0,
        전주평균: hourlyData.lastWeek[i] || 0,
      }))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {(["daily", "weekly", "monthly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              height: 38, padding: "0 18px", borderRadius: 999,
              border: activeTab === t ? 0 : "1px solid #e7ebf3",
              background: activeTab === t ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
              color: activeTab === t ? "#fff" : "#374151",
              fontWeight: 700, cursor: "pointer", fontSize: 14,
            }}
          >
            {t === "daily" ? "일별" : t === "weekly" ? "주별" : "월별"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>전체 매출</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>
            {salesSummary ? formatKRW(salesSummary.totalSalesAmt) : "..."}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: (salesSummary?.vsYesterdayPct ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>
            {salesSummary?.vsYesterdayPct != null ? `${salesSummary.vsYesterdayPct >= 0 ? "+" : ""}${salesSummary.vsYesterdayPct.toFixed(1)}%` : "—"} vs 전일
          </span>
        </div>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>점포 평균</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
            {salesSummary ? formatKRW(salesSummary.avgSalesPerStore) : "..."}
          </div>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{getFilterLabel(filter)} 기준</span>
        </div>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>최고 매출 점포</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
            {salesSummary?.topStore ? salesSummary.topStore.store_name : "—"}
          </div>
          <span style={{ fontSize: 11, color: "#ff6e00" }}>{salesSummary?.topStore ? formatKRW(salesSummary.topStore.sales) : "—"}</span>
        </div>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>최저 매출 점포</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
            {salesSummary?.bottomStore ? salesSummary.bottomStore.store_name : "—"}
          </div>
          <span style={{ fontSize: 11, color: "#dc2626" }}>{salesSummary?.bottomStore ? formatKRW(salesSummary.bottomStore.sales) : "—"}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>시간대별 매출 추이 (전체 점포 합산)</h3>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#9ca3af" }}>추정치 (정적 프로필 분배) · 기준일 2026-03-10</p>
          {loading || !hourlyData ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</div>
          ) : hourlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={hourlyChartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} contentStyle={{ borderRadius: 12, border: "1px solid #e7ebf3", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="금일" name="금일" fill="rgba(255,110,0,0.7)" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="전주평균" name="전주평균" stroke="#2563eb" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>시간대별 데이터 없음</div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>카테고리별 매출</h3>
          {loading || !categoryData ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</div>
          ) : categoryData.categories.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {categoryData.categories.slice(0, 6).map((cat, i) => {
                const maxSales = Math.max(...categoryData.categories.map((c) => c.total_sales), 1);
                return (
                  <div key={cat.category}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{cat.category}</span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {formatKRW(cat.total_sales)} ({cat.pct_of_total.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ position: "relative", height: 10, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 999,
                        background: COLORS[i % COLORS.length],
                        width: `${(cat.total_sales / maxSales) * 100}%`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>카테고리 데이터 없음</div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>점포별 매출 비교</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9ca3af" }}>
          {getFilterLabel(filter)} · 상위 점포부터 정렬 · 전일 대비 증감률 표시
        </p>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
            {(salesSummary?.storeBreakdown || []).map((s, i) => (
              <div key={s.store_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                <span style={{ fontSize: 11, color: "#9ca3af", width: 20, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", width: 90 }}>{s.store_name}</span>
                <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 999,
                    background: i < 3 ? "linear-gradient(90deg, #ff6e00, #e91e8c)" : "#2563eb",
                    width: `${Math.min(100, (s.sales / ((salesSummary?.topStore?.sales || 1))) * 100)}%`,
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", width: 100, textAlign: "right" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>온/오프라인 매출 비중</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>오프라인 (매장)</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>약 72%</span>
              </div>
              <div style={{ height: 16, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "#2563eb", width: "72%" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, marginTop: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>온라인 (배달)</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>약 28%</span>
              </div>
              <div style={{ height: 16, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "#ff6e00", width: "28%" }} />
              </div>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11, color: "#9ca3af" }}>추정치 · 배달 채널 POS 연동 후 실데이터 제공 예정</p>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>결제수단 비중</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { name: "신용카드", pct: 45, color: "#2563eb" },
              { name: "체크카드", pct: 25, color: "#7c3aed" },
              { name: "모바일 결제", pct: 18, color: "#ff6e00" },
              { name: "상품권/쿠폰", pct: 8, color: "#16a34a" },
              { name: "현금", pct: 4, color: "#d97706" },
            ].map((pm) => (
              <div key={pm.name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{pm.name}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{pm.pct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: pm.color, width: `${pm.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11, color: "#9ca3af" }}>참조 데이터 · 결제 수단 코드 테이블 기반 추정치</p>
        </div>
      </div>
    </div>
  );
}