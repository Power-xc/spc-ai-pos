import { useNavigate } from "react-router";

interface HeroPanelProps {
  kpiCards?: Array<{
    label: string;
    value: string;
    valueFontSize: number;
    changeDir: "up" | "down" | "neutral";
    change: string;
    meta: string;
  }>;
  agents?: Array<{
    name: string;
    role: string;
    color: string;
    confidence: number;
    action: string;
    activity: number[];
    to: string;
  }>;
  briefingText?: string;
}

const defaultKpiCards = [
  {
    label: "오늘 매출",
    value: "데이터 로딩중",
    valueFontSize: 16,
    changeDir: "neutral",
    change: "-",
    meta: "불러오는 중...",
  },
  {
    label: "AI 실매출",
    value: "준비중",
    valueFontSize: 16,
    changeDir: "neutral",
    change: "-",
    meta: "계산 준비중",
  },
  {
    label: "기회 손실",
    value: "분석중",
    valueFontSize: 16,
    changeDir: "neutral",
    change: "-",
    meta: "데이터 준비중",
  },
  {
    label: "위험 알림",
    value: "--",
    valueFontSize: 20,
    changeDir: "neutral",
    change: "-",
    meta: "알림 로딩중",
  },
];

const agents = [
  { name: "생산",  role: "생산관리 에이전트",  color: "#111827", confidence: 0, action: "데이터 로딩중", activity: [0, 0, 0, 0, 0], to: "/realtime" },
  { name: "발주",  role: "발주최적화 에이전트", color: "#2563eb", confidence: 0, action: "데이터 로딩중", activity: [0, 0, 0, 0, 0], to: "/orders" },
  { name: "매출",  role: "매출분석 에이전트",   color: "#ff6e00", confidence: 0, action: "데이터 로딩중", activity: [0, 0, 0, 0, 0], to: "/analytics" },
];

export function HeroPanel({ kpiCards, agents: agentsProp, briefingText }: HeroPanelProps) {
  const navigate = useNavigate();
  const displayKpiCards = kpiCards ?? defaultKpiCards;
  const displayAgents = agentsProp ?? agents;

  return (
    <div
      style={{
        padding: 16,
        background:
          "linear-gradient(135deg, #fff7f1 0%, #fff 40%, #fff4fb 100%)",
        borderRadius: 16,
        border: "1px solid #e7ebf3",
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
      }}
    >
      {/* Top */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
          flexDirection: "column",
        }}
      >
        {/* 상태 뱃지 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                background: "#f3f4f6",
                border: "1.5px solid #9ca3af",
                height: 24,
                padding: "0 10px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                fontWeight: 800,
                color: "#6b7280",
                boxShadow: "0 0 0 3px rgba(107,114,128,0.12)",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#9ca3af",
                  display: "inline-block",
                }}
              />
              상태 · 확인중
            </span>
          </div>
        </div>

        <h2
          style={{
            margin: "8px 0 0",
            fontSize: 15,
            letterSpacing: "-0.04em",
            lineHeight: 1.2,
            color: "#111827",
            fontWeight: 800,
          }}
        >
          {briefingText || "AI 브리핑을 불러오는 중..."}
        </h2>
        {briefingText && (
        <p
          style={{
            margin: "3px 0 0",
            fontSize: 12,
            fontWeight: 700,
            color: "#374151",
            lineHeight: 1.5,
            background: "rgba(255,110,0,0.06)",
            border: "1px solid rgba(255,110,0,0.15)",
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          근거 기반 지표를 우선 확인하고, 미확정 값은 점주 최종 판단으로 확정하세요.
        </p>
        )}
      </div>

      <style>{`
        @keyframes psychology-pulse {
          0%, 100% {
            box-shadow: 0 0 15px rgba(99, 102, 241, 0.4), 0 0 0 0px rgba(168, 85, 247, 0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 30px rgba(99, 102, 241, 0.8), 0 0 0 10px rgba(168, 85, 247, 0);
            transform: scale(1.05);
          }
        }
      `}</style>

      {/* Agent 3종 상태 바 + 바로가기 통합 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {displayAgents.map((agent) => (
          <div
            key={agent.name}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255,255,255,.9)",
              border: "1px solid rgba(0,0,0,.06)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* 상단: 아이콘 + 이름 + 신뢰도 + 활성 dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: agent.color,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: 9,
                  flexShrink: 0,
                }}
              >
                {agent.name}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#111827" }}>{agent.role}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: agent.color }}>{agent.confidence}%</span>
                </div>
                <div style={{ height: 3, background: "rgba(0,0,0,.08)", borderRadius: 999, overflow: "hidden", marginTop: 3 }}>
                  <div style={{ height: "100%", borderRadius: 999, background: agent.color, width: `${agent.confidence}%` }} />
                </div>
              </div>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0, boxShadow: "0 0 0 2px rgba(34,197,94,.25)" }} />
            </div>

            {/* 중간: 미니 바차트 */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18 }}>
              {agent.activity.map((val, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${val}%`,
                    background: i === 4 ? agent.color : `${agent.color}40`,
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>

            {/* 하단: 액션 텍스트 + 바로가기 버튼 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 9, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {agent.action}
              </p>
              <button
                onClick={() => navigate(agent.to)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: `1px solid ${agent.color}30`,
                  background: `${agent.color}08`,
                  color: agent.color,
                  fontSize: 9,
                  fontWeight: 800,
                  cursor: "pointer",
                  flexShrink: 0,
                  animation: agent.name === "발주" ? "psychology-pulse 2s ease-in-out infinite" : "none",
                  boxShadow: agent.name === "발주" ? `0 0 8px ${agent.color}50` : "none",
                }}
              >
                바로가기
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* KPI Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {displayKpiCards.map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: "rgba(255,255,255,.9)",
              border: "1px solid #eee",
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#6b7280",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                fontSize: kpi.valueFontSize,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: "#111827",
                minHeight: 32,
              }}
            >
              {kpi.value}
            </div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
              }}
            >
              <strong
                style={{
                  color:
                    kpi.changeDir === "up"
                      ? "#16a34a"
                      : kpi.changeDir === "down"
                        ? "#dc2626"
                        : "#d97706",
                }}
              >
                {kpi.change}
              </strong>
              <span style={{ color: "#6b7280" }}>{kpi.meta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
