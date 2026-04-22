import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  ComposedChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api-client";
import type {
  AnalyticsKPISummary,
  AnalyticsHourlySales,
  AnalyticsCategorySales,
  AnalyticsDeliveryShare,
  AnalyticsPromoPerformance,
  AnalyticsPaymentMethods,
  AnalyticsInventoryTimeline,
  InventoryTimelineItem,
  PromoSimulatorResult,
} from "@/types/api";

const panel = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

const COLORS = ["#ff6e00", "#e91e8c", "#2563eb", "#7c3aed", "#16a34a", "#d97706"];

function formatKRW(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만원`;
  return `${Math.round(n).toLocaleString()}원`;
}

function formatPct(n: number | null | undefined, suffix = "%"): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}${suffix}`;
}

function ChangeBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>;
  const up = value >= 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: up ? "#16a34a" : "#dc2626" }}>
      {up ? "▲" : "▼"} {formatPct(value)}
    </span>
  );
}

function DataSourceBadge({ source }: { source: string }) {
  const isReal = source.includes("실데이터");
  const isEstimate = source.includes("추정치");
  const isPending = source.includes("미연동") || source.includes("미입력") || source.includes("참조");
  const color = isReal ? "#16a34a" : isEstimate ? "#d97706" : isPending ? "#9ca3af" : "#6b7280";
  const label = isReal ? "실데이터" : isEstimate ? "추정치" : isPending ? "미연동" : source;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: `${color}15`,
      padding: "2px 8px", borderRadius: 999, border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
      데이터를 불러오는 중...
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#dc2626", fontSize: 13, gap: 8 }}>
      <span style={{ fontSize: 24 }}>⚠️</span>
      <span>{message}</span>
    </div>
  );
}

// ── Promo Simulator Component ───────────────────────────────────
function PromoSimulator({ baselineSales }: { baselineSales: number }) {
  const [liftPct, setLiftPct] = useState(15);
  const [supportAmt, setSupportAmt] = useState(0);
  const [commissionPct, setCommissionPct] = useState(5);
  const [laborCost, setLaborCost] = useState(0);
  const [promoCost, setPromoCost] = useState(0);
  const [result, setResult] = useState<PromoSimulatorResult | null>(null);
  const [loading, setLoading] = useState(false);

  const simulate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.postPromoSimulator({
        sales_lift_pct: liftPct,
        promo_support_amt: supportAmt,
        commission_pct: commissionPct,
        labor_cost_amt: laborCost,
        promo_cost_amt: promoCost,
      });
      setResult(res.data as PromoSimulatorResult);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [liftPct, supportAmt, commissionPct, laborCost, promoCost]);

  useEffect(() => { simulate(); }, [simulate]);

  const calc = result?.calculation;
  const scenarios = result?.scenarios;

  const inputStyle: CSSProperties = {
    width: "100%", height: 34, borderRadius: 8, border: "1px solid #e7ebf3",
    padding: "0 10px", fontSize: 13, color: "#111827", outline: "none",
  };

  return (
    <div style={panel()}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>프로모션 손익 시뮬레이터</h3>
        <DataSourceBadge source="추정치" />
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "#6b7280" }}>
        기준 매출: <strong>{formatKRW(baselineSales)}</strong> · 아래 값을 조정하면 자동으로 시뮬레이션됩니다
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>매출 증가율(%)</label>
          <input type="number" style={inputStyle} value={liftPct} onChange={(e) => setLiftPct(Number(e.target.value))} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>지원금(원)</label>
          <input type="number" style={inputStyle} value={supportAmt} onChange={(e) => setSupportAmt(Number(e.target.value))} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>수수료율(%)</label>
          <input type="number" style={inputStyle} value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value))} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>인건비(원)</label>
          <input type="number" style={inputStyle} value={laborCost} onChange={(e) => setLaborCost(Number(e.target.value))} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>프로모션 비용(원)</label>
          <input type="number" style={inputStyle} value={promoCost} onChange={(e) => setPromoCost(Number(e.target.value))} />
        </div>
      </div>

      {loading ? <LoadingSkeleton /> : calc && scenarios ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>매출 증가분</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{formatKRW(calc.projected_sales_increase)}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>예상 매출총이익</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{formatKRW(calc.projected_gross_margin)}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: calc.net_profit_delta >= 0 ? "#f0fdf4" : "#fef2f2", border: `1px solid ${calc.net_profit_delta >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>순이익 델타</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: calc.net_profit_delta >= 0 ? "#16a34a" : "#dc2626" }}>
                {calc.net_profit_delta >= 0 ? "+" : ""}{formatKRW(calc.net_profit_delta)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {Object.values(scenarios).map((s) => (
              <div key={s.label} style={{
                flex: 1, padding: 12, borderRadius: 10,
                background: s.recommended ? (s.label === "참여" ? "#f0fdf4" : s.label === "보류" ? "#fffbeb" : "#fef2f2") : "#f9fafb",
                border: `1px solid ${s.recommended ? (s.label === "참여" ? "#16a34a" : s.label === "보류" ? "#d97706" : "#dc2626") : "#e5e7eb"}`,
                opacity: s.recommended ? 1 : 0.6,
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{s.label}</div>
                {s.recommended && <div style={{ fontSize: 10, fontWeight: 700, color: s.label === "참여" ? "#16a34a" : s.label === "보류" ? "#d97706" : "#dc2626" }}>▶ 권장</div>}
                {"roi_pct" in s && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>ROI: {s.roi_pct}%</div>}
                {"note" in s && s.note && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{s.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "#9ca3af" }}>
            {result?.confidence_labels && Object.entries(result.confidence_labels).map(([k, v]) => (
              <span key={k} style={{ marginRight: 10 }}>{k}: <DataSourceBadge source={v as string} /></span>
            ))}
          </div>
        </div>
      ) : <ErrorState message="시뮬레이션 결과를 불러올 수 없습니다" />}
    </div>
  );
}

// ── Inventory Timeline Component ─────────────────────────────────
function InventoryTimelinePanel() {
  const [data, setData] = useState<AnalyticsInventoryTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getAnalyticsInventoryTimeline(DEFAULT_STORE_ID, 15);
        setData(res.data as AnalyticsInventoryTimeline);
      } catch (e: any) {
        setError(e?.message || "재고 타임라인을 불러올 수 없습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={panel()}><LoadingSkeleton /></div>;
  if (error || !data) return <div style={panel()}><ErrorState message={error || "데이터 없음"} /></div>;

  const riskColor = (level: string) => level === "HIGH" ? "#dc2626" : level === "MEDIUM" ? "#d97706" : "#16a34a";

  return (
    <div style={panel()}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>재고/반제 타임라인</h3>
        <DataSourceBadge source={data.data_source} />
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "#6b7280" }}>
        소진 위험 TOP 15 · <span style={{ color: "#dc2626" }}>■</span> HIGH <span style={{ color: "#d97706" }}>■</span> MEDIUM <span style={{ color: "#16a34a" }}>■</span> LOW
        {data.note && <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "#9ca3af" }}>{data.note}</span>}
      </p>

      {data.items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>
          현재 소진 위험 품목이 없습니다
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.items.map((item: InventoryTimelineItem) => (
            <div key={item.product_id} style={{
              display: "grid", gridTemplateColumns: "140px 80px 80px 90px 90px 90px 1fr",
              gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 10,
              background: item.risk_level === "HIGH" ? "#fef2f2" : item.risk_level === "MEDIUM" ? "#fffbeb" : "#f9fafb",
              border: `1px solid ${item.risk_level === "HIGH" ? "#fecaca" : item.risk_level === "MEDIUM" ? "#fde68a" : "#e5e7eb"}`,
              fontSize: 12,
            }}>
              <div>
                <span style={{ fontWeight: 700, color: "#111827" }}>{item.product_name}</span>
                <span style={{ display: "block", fontSize: 10, color: "#9ca3af" }}>{item.category}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>재고</span>
                <span style={{ display: "block", fontWeight: 700, color: "#111827" }}>{item.current_stock}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>소진 예상</span>
                <span style={{ display: "block", fontWeight: 700, color: item.hours_remaining != null && item.hours_remaining < 3 ? "#dc2626" : "#111827" }}>
                  {item.hours_remaining != null ? `${item.hours_remaining}h` : "—"}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>소진 시각</span>
                <span style={{ display: "block", fontWeight: 700, color: "#111827" }}>
                  {item.depletion_time_today || "—"}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>반제 권장</span>
                <span style={{ display: "block", fontWeight: 700, color: item.production_recommend_time ? "#ff6e00" : "#9ca3af" }}>
                  {item.production_recommend_time || "—"}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>권장 수량</span>
                <span style={{ display: "block", fontWeight: 700, color: item.recommended_production_qty > 0 ? "#2563eb" : "#9ca3af" }}>
                  {item.recommended_production_qty > 0 ? `${item.recommended_production_qty}개` : "—"}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                  background: `${riskColor(item.risk_level)}15`, color: riskColor(item.risk_level),
                  border: `1px solid ${riskColor(item.risk_level)}30`,
                }}>
                  {item.risk_level}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || "POC_001";

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");

  // State for each data section
  const [summary, setSummary] = useState<AnalyticsKPISummary | null>(null);
  const [hourlySales, setHourlySales] = useState<AnalyticsHourlySales | null>(null);
  const [categorySales, setCategorySales] = useState<AnalyticsCategorySales | null>(null);
  const [deliveryShare, setDeliveryShare] = useState<AnalyticsDeliveryShare | null>(null);
  const [promoPerformance, setPromoPerformance] = useState<AnalyticsPromoPerformance | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<AnalyticsPaymentMethods | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, hourlyRes, categoryRes, deliveryRes, promoRes, paymentRes] = await Promise.allSettled([
          api.getAnalyticsSummary(DEFAULT_STORE_ID),
          api.getAnalyticsHourlySales(DEFAULT_STORE_ID),
          api.getAnalyticsCategorySales(DEFAULT_STORE_ID, activeTab === "monthly" ? 30 : activeTab === "weekly" ? 7 : 1),
          api.getAnalyticsDeliveryShare(DEFAULT_STORE_ID),
          api.getAnalyticsPromoPerformance(DEFAULT_STORE_ID),
          api.getAnalyticsPaymentMethods(DEFAULT_STORE_ID),
        ]);
        if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.data as AnalyticsKPISummary);
        if (hourlyRes.status === "fulfilled") setHourlySales(hourlyRes.value.data as AnalyticsHourlySales);
        if (categoryRes.status === "fulfilled") setCategorySales(categoryRes.value.data as AnalyticsCategorySales);
        if (deliveryRes.status === "fulfilled") setDeliveryShare(deliveryRes.value.data as AnalyticsDeliveryShare);
        if (promoRes.status === "fulfilled") setPromoPerformance(promoRes.value.data as AnalyticsPromoPerformance);
        if (paymentRes.status === "fulfilled") setPaymentMethods(paymentRes.value.data as AnalyticsPaymentMethods);
      } catch (e: any) {
        setError(e?.message || "데이터를 불러올 수 없습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeTab]);

  // Build hourly chart data
  const hourlyChartData = hourlySales?.today?.map((t, i) => ({
    time: t.hour,
    오늘: t.sales_estimated,
    전주평균: hourlySales?.last_week?.[i]?.sales_estimated ?? 0,
  })) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Tab bar */}
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

      {/* KPI Summary Row */}
      <div style={panel()}>
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>성과 요약 KPI</h3>
          <DataSourceBadge source={summary ? "실데이터" : "로딩중"} />
        </div>
        {loading ? <LoadingSkeleton /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>총 매출</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>
                {formatKRW(summary?.total_sales_amt ?? 0)}
              </div>
              <ChangeBadge value={summary?.vs_last_week_same_dow?.sales_pct} />
            </div>
            <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>총 판매 수량</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
                {summary?.total_sold_qty?.toLocaleString() ?? "—"}건
              </div>
              <ChangeBadge value={summary?.vs_last_week_same_dow?.sales_pct} />
            </div>
            <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>폐기율</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
                {summary?.waste_rate_pct?.toFixed(1) ?? "—"}%
              </div>
              <ChangeBadge value={summary?.vs_last_week_same_dow?.waste_pct} />
            </div>
            <div style={{ padding: 14, borderRadius: 14, border: "1px solid #e7ebf3", background: "#fafafa" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>소진 기회손실</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary?.chance_loss_est && summary.chance_loss_est > 0 ? "#dc2626" : "#111827" }}>
                {formatKRW(summary?.chance_loss_est ?? 0)}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{summary?.products_with_stockout ?? 0}개 품목 소진</div>
            </div>
          </div>
        )}
      </div>

      {/* Top row: hourly + category */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 20 }}>
        {/* Hourly trend */}
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>시간대별 매출 추이</h3>
            {hourlySales && <DataSourceBadge source={hourlySales.data_source} />}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
            {hourlySales?.note ?? "오늘 vs 전주 동요일"}
          </p>
          {loading ? <LoadingSkeleton /> : hourlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={hourlyChartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} contentStyle={{ borderRadius: 12, border: "1px solid #e7ebf3", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar key="bar-today" dataKey="오늘" name="오늘" fill="rgba(255,110,0,0.7)" radius={[6, 6, 0, 0]} />
                <Line key="line-avg" type="monotone" dataKey="전주평균" name="전주평균" stroke="#2563eb" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>시간대별 데이터 없음</div>
          )}
        </div>

        {/* Category contribution */}
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>카테고리별 매출</h3>
            {categorySales && <DataSourceBadge source={categorySales.data_source} />}
          </div>
          {loading ? <LoadingSkeleton /> : categorySales && categorySales.categories.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {categorySales.categories.slice(0, 6).map((cat, i) => {
                const maxSales = Math.max(...categorySales.categories.map((c) => c.total_sales), 1);
                return (
                  <div key={cat.category}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{cat.category}</span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {Math.round(cat.total_sales).toLocaleString()}원 ({cat.pct_of_total?.toFixed(1) ?? "—"}%)
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
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>카테고리 데이터 없음</div>
          )}
        </div>
      </div>

      {/* Middle row: delivery share + promo */}
      <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1.3fr", gap: 20 }}>
        {/* Delivery share */}
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>배달 채널 점유율</h3>
            {deliveryShare && <DataSourceBadge source={deliveryShare.data_source} />}
          </div>
          {deliveryShare?.status === "integration_pending" ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔌</div>
              {deliveryShare.note || "배달 채널 POS 연동 후 실데이터 제공 예정"}
            </div>
          ) : deliveryShare && deliveryShare.channels.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={deliveryShare.channels} cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3} dataKey="value">
                    {deliveryShare.channels.map((_entry, idx) => <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 10, border: "1px solid #e7ebf3", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {deliveryShare.channels.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], display: "inline-block" }} />
                      <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{d.name}</span>
                    </div>
                    <strong style={{ fontSize: 13, color: "#111827" }}>{d.value}%</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>데이터 없음</div>
          )}
        </div>

        {/* Promotion performance */}
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>프로모션 성과 분석</h3>
            {promoPerformance && <DataSourceBadge source={promoPerformance.data_source} />}
          </div>
          {promoPerformance?.status === "no_data" || promoPerformance?.status === "integration_pending" ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              {promoPerformance?.note || "프로모션 실적 데이터가 아직 입력되지 않았습니다"}
            </div>
          ) : promoPerformance && promoPerformance.promotions.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={promoPerformance.promotions} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7ebf3", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="반응률" stroke="#ff6e00" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="전환율" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="매출기여" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>데이터 없음</div>
          )}
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>결제 유형 분석</h3>
            {paymentMethods && <DataSourceBadge source={paymentMethods.data_source} />}
          </div>
          {paymentMethods?.status === "integration_pending" || paymentMethods?.status === "reference_only" ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
              {paymentMethods?.note || "결제 수단별 거래 데이터는 POS 연동 후 제공됩니다"}
            </div>
          ) : paymentMethods && paymentMethods.methods.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {paymentMethods.methods.map((pm) => (
                <div key={pm.group_name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", width: 120 }}>{pm.group_name}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{pm.code_count}건</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>데이터 없음</div>
          )}
        </div>

        {/* Placeholder for profitability */}
        <div style={panel()}>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>수익성 지표</h3>
            <DataSourceBadge source={summary?.profitability ? "실데이터" : "로딩중"} />
          </div>
          {loading ? <LoadingSkeleton /> : summary?.profitability ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "추정 순이익", value: formatKRW(summary.profitability.estimated_net_profit_amt), status: summary.profitability.profit_status },
                { label: "추정 마진율", value: summary.profitability.estimated_margin_rate_pct != null ? `${summary.profitability.estimated_margin_rate_pct}%` : "—", status: summary.profitability.margin_status },
                { label: "손익분기점", value: formatKRW(summary.profitability.break_even_sales_amt), status: summary.profitability.break_even_status },
                { label: "프로모션 영향", value: formatKRW(summary.profitability.promo_profit_impact_amt), status: summary.profitability.promo_status },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{row.value}</span>
                </div>
              ))}
              {summary.profitability.basis && (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                  근거: {summary.profitability.basis.join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#9ca3af", fontSize: 13 }}>수익성 데이터를 불러올 수 없습니다</div>
          )}
        </div>
      </div>

      {/* Promo P&L Simulator */}
      <PromoSimulator baselineSales={summary?.total_sales_amt ?? 0} />

      {/* Inventory Timeline */}
      <InventoryTimelinePanel />
    </div>
  );
}