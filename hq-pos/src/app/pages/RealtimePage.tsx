import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import type { CSSProperties } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── helpers ──────────────────────────────────────────────────
const panel = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

const badge = (color: string, bg: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  height: 26,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  color,
  background: bg,
});

// ── data ──────────────────────────────────────────────────────
const agentA_stock = [
  { name: "아메리카노", stock: 340, alert: false },
  { name: "카페라떼", stock: 22, alert: true },
  { name: "아이스티", stock: 78, alert: false },
  { name: "시그니처블렌드", stock: 14, alert: true },
  { name: "에이드", stock: 95, alert: false },
  { name: "디저트A", stock: 6, alert: true },
];

const agentB_orders = [
  {
    id: "ORD-2841",
    menu: "아메리카노 L",
    channel: "배달",
    status: "완료",
    time: "14:22",
  },
  {
    id: "ORD-2842",
    menu: "카페라떼 세트",
    channel: "POS",
    status: "준비중",
    time: "14:28",
  },
  {
    id: "ORD-2843",
    menu: "시그니처블렌드",
    channel: "요기요",
    status: "준비중",
    time: "14:31",
  },
  {
    id: "ORD-2844",
    menu: "아이스티 2잔",
    channel: "쿠팡이츠",
    status: "대기",
    time: "14:35",
  },
  {
    id: "ORD-2845",
    menu: "에이드 콤보",
    channel: "POS",
    status: "완료",
    time: "14:38",
  },
];

const agentC_products = [
  {
    name: "아메리카노",
    profit: 82,
    promo: 91,
    recommend: true,
    category: "커피/음료",
  },
  {
    name: "카페라떼",
    profit: 67,
    promo: 74,
    recommend: true,
    category: "커피/음료",
  },
  {
    name: "시그니처블렌드",
    profit: 54,
    promo: 88,
    recommend: false,
    category: "커피/음료",
  },
  {
    name: "도넛 A",
    profit: 43,
    promo: 52,
    recommend: false,
    category: "도넛/먼치킨",
  },
  {
    name: "먼치킨 세트",
    profit: 58,
    promo: 70,
    recommend: true,
    category: "도넛/먼치킨",
  },
  {
    name: "계절 스무디",
    profit: 75,
    promo: 82,
    recommend: true,
    category: "계절상품",
  },
  {
    name: "핫밀 샌드위치",
    profit: 62,
    promo: 78,
    recommend: true,
    category: "핫밀",
  },
];

const generateOrderTrend = () =>
  Array.from({ length: 12 }, (_, i) => ({
    time: `${8 + i}시`,
    orders: Math.floor(20 + Math.random() * 60),
    avg: 38,
  }));

const posChannels = [
  {
    label: "POS 터미널",
    status: "정상",
    color: "#16a34a",
    bg: "#ebf9ef",
    ping: true,
  },
  {
    label: "배달의민족",
    status: "정상",
    color: "#16a34a",
    bg: "#ebf9ef",
    ping: true,
  },
  {
    label: "요기요",
    status: "정상",
    color: "#16a34a",
    bg: "#ebf9ef",
    ping: true,
  },
  {
    label: "쿠팡이츠",
    status: "지연",
    color: "#d97706",
    bg: "#fff7e8",
    ping: false,
  },
  {
    label: "모바일 앱",
    status: "정상",
    color: "#16a34a",
    bg: "#ebf9ef",
    ping: true,
  },
];

const statusStyle: Record<string, CSSProperties> = {
  완료: { background: "#ebf9ef", color: "#16a34a" },
  준비중: { background: "#eaf2ff", color: "#2563eb" },
  대기: { background: "#fff7e8", color: "#d97706" },
};

export function RealtimePage() {
  const navigate = useNavigate();
  const [orderTrend] = useState(generateOrderTrend);
  const [tick, setTick] = useState(0);
  const [activeCTab, setActiveCTab] = useState<"커피/음료" | "도넛/먼치킨" | "계절상품" | "핫밀">("커피/음료");

  const handleOrder = (itemName: string) => {
    alert(
      `🛒 [${itemName}] 발주 요청이 성공적으로 접수되었습니다.\n발주 관리 페이지로 이동합니다.`,
    );
    navigate("/orders");
  };

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Status Bar */}
      <div style={panel({ padding: "12px 16px" })}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#16a34a",
                  display: "inline-block",
                  boxShadow: "0 0 0 3px rgba(22,163,74,0.2)",
                  animation: "pulse 2s infinite",
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                실시간 모니터링 중
              </span>
            </div>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              갱신: {timeStr}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {posChannels.map((ch) => (
              <div
                key={ch.label}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: ch.color,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}
                >
                  {ch.label}
                </span>
                <span style={{ ...badge(ch.color, ch.bg), fontSize: 10, height: 20 }}>
                  {ch.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three Agents */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, minWidth: 0, alignItems: "stretch" }}
      >
        {/* Agent A */}
        <div style={panel({ display: "flex", flexDirection: "column" })}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              A
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>
                생산관리 에이전트
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                재고 소진 예측 · 5분 갱신
              </div>
            </div>
          </div>

          <div
            className="premium-scrollbar"
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {agentA_stock.map((item) => (
              <div
                key={item.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${item.alert ? "#feecec" : "#e7ebf3"}`,
                  background: item.alert ? "#fff8f8" : "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: item.alert ? "#dc2626" : "#16a34a",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}
                  >
                    {item.name}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: item.alert ? "#dc2626" : "#111827",
                    }}
                  >
                    {item.stock}개
                  </span>
                  {item.alert && (
                    <button
                      onClick={() => handleOrder(item.name)}
                      style={{
                        ...badge("#dc2626", "#feecec"),
                        border: "1px solid #dc2626",
                        cursor: "pointer",
                        fontWeight: 900,
                        transition: "all 0.15s",
                      }}
                      onMouseOver={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#dc2626";
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "#fff";
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#feecec";
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "#dc2626";
                      }}
                    >
                      부족 · 발주
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, rgba(255,110,0,.06), rgba(233,30,140,.04))",
              border: "1px solid rgba(255,110,0,.15)",
              fontSize: 12,
              color: "#374151",
              lineHeight: 1.6,
            }}
          >
            💡 AI 추정: 카페라떼·시그니처블렌드 약 <strong>1시간 30분</strong>{" "}
            내 소진 예상. 즉시 발주 권장.
          </div>
        </div>

        {/* Agent B */}
        <div style={panel({ display: "flex", flexDirection: "column" })}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              B
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>
                주문관리 에이전트
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                실시간 주문 큐 · 마감 20분 전 제안
              </div>
            </div>
          </div>

          <div
            className="premium-scrollbar"
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {agentB_orders.map((ord) => (
              <div
                key={ord.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e7ebf3",
                  background: "#fff",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}
                  >
                    {ord.id}
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}
                  >
                    {ord.menu}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                  }}
                >
                  <span style={badge("#6b7280", "#f3f4f6")}>{ord.channel}</span>
                  <span
                    style={{ ...statusStyle[ord.status], ...badge("", "") }}
                  >
                    {ord.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={orderTrend}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#eef2f7"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e7ebf3",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  name="주문수"
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#e7ebf3"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                  name="평균"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Agent C */}
        <div style={panel({ display: "flex", flexDirection: "column" })}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "linear-gradient(135deg, #16a34a, #0d9488)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              C
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>
                제품분석 에이전트
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                실제 이익률 · 프로모션 시뮬레이터
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
              borderBottom: "1px solid #f1f5f9",
              paddingBottom: 8,
              overflowX: "auto",
              padding: "4px 0",
            }}
            className="premium-scrollbar"
          >
            {(["커피/음료", "도넛/먼치킨", "계절상품", "핫밀"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCTab(tab)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeCTab === tab ? "#0F9779" : "#e7ebf3",
                  background: activeCTab === tab ? "#0F9779" : "#fff",
                  color: activeCTab === tab ? "#fff" : "#64748b",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            className="premium-scrollbar"
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 6,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {agentC_products
              .filter((p) => p.category === activeCTab)
              .map((p) => (
                <div
                  key={p.name}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e7ebf3",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#374151",
                      }}
                    >
                      {p.name}
                    </span>
                    {p.recommend && (
                      <span style={badge("#16a34a", "#ebf9ef")}>추천</span>
                    )}
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {[
                      { label: "이익률", val: p.profit, color: "#ff6e00" },
                      { label: "프로모션", val: p.promo, color: "#2563eb" },
                    ].map((bar) => (
                      <div
                        key={`${p.name}-${bar.label}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "52px 1fr 36px",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                            fontWeight: 600,
                          }}
                        >
                          {bar.label}
                        </span>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: "#eef2f7",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 999,
                              background: bar.color,
                              width: `${bar.val}%`,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            textAlign: "right",
                            color: "#111827",
                          }}
                        >
                          {bar.val}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              fontSize: 12,
              color: "#374151",
              lineHeight: 1.6,
            }}
          >
            📈 프로모션 시뮬레이터: T계획 달성 시 +12% 매출 / 기화율 -15%p 개선
            예측
          </div>
        </div>
      </div>

      {/* POS & Mobile Status Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* POS */}
        <div style={panel()}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
              포스기 연결 현황
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              배달앱 3사 동시 물류 연동 상태
            </p>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            {[
              {
                label: "POS 메인 터미널",
                val: "온라인",
                status: "good",
                uptime: "99.9%",
                latency: "12ms",
              },
              {
                label: "배달의민족",
                val: "연동 정상",
                status: "good",
                uptime: "99.2%",
                latency: "45ms",
              },
              {
                label: "요기요",
                val: "연동 정상",
                status: "good",
                uptime: "98.8%",
                latency: "52ms",
              },
              {
                label: "쿠팡이츠",
                val: "지연 발생",
                status: "warn",
                uptime: "97.1%",
                latency: "210ms",
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${c.status === "warn" ? "#fde68a" : "#e7ebf3"}`,
                  background: c.status === "warn" ? "#fffbeb" : "#fafafa",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: c.status === "warn" ? "#d97706" : "#111827",
                  }}
                >
                  {c.val}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 4,
                    fontSize: 10,
                    color: "#9ca3af",
                  }}
                >
                  <span>가동률 {c.uptime}</span>
                  <span>•</span>
                  <span>지연 {c.latency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile */}
        <div style={panel()}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
              모바일 앱 현황
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              고객 앱 · 직원 앱 · 알림 상태
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              {
                label: "카카오톡 알림",
                value: "발송 12건",
                sub: "오늘 발송 총계",
                icon: "💬",
              },
              {
                label: "Push 수신율",
                value: "94.2%",
                sub: "최근 7일 평균",
                icon: "📲",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e7ebf3",
                  background: "#fff",
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}
                  >
                    {item.value}
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                    {item.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
