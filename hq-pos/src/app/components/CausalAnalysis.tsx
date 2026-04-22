import { useNavigate } from "react-router";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const chartData = [
  { time: "09", sales: 38, visit: 45 },
  { time: "11", sales: 61, visit: 120 },
  { time: "13", sales: 70, visit: 140 },
  { time: "14", sales: 44, visit: 90 },
  { time: "17", sales: 76, visit: 130 },
];

const metrics = [
  { label: "음료", value: 72, color: "#ff6e00" },
  { label: "세트", value: 54, color: "#2563eb" },
  { label: "디저트", value: 48, color: "#7c3aed" },
];

export function CausalAnalysis() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e7ebf3",
        borderRadius: 20,
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}>
          원인 분석
        </h3>
        <button
          onClick={() => navigate("/analytics")}
          style={{
            background: "transparent",
            border: 0,
            color: "#ff6e00",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          전체 보기 →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 12 }}>
        {/* Chart */}
        <div style={{ border: "1px solid #e7ebf3", borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
            시간대별 매출·방문 추이
          </p>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}시`} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7ebf3", fontSize: 11 }} />
              <Bar dataKey="sales" name="매출" fill="#93c5fd" radius={[4, 4, 0, 0]} barSize={18} />
              <Line type="monotone" dataKey="visit" name="방문" stroke="#ff6e00" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Category */}
        <div style={{ border: "1px solid #e7ebf3", borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
            카테고리 기여도
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ display: "grid", gridTemplateColumns: "44px 1fr 32px", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 700 }}>{m.label}</span>
                <div style={{ height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: m.color, width: `${m.value}%` }} />
                </div>
                <strong style={{ fontSize: 11, textAlign: "right", color: "#111827" }}>{m.value}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
