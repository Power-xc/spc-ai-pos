import { useState } from "react";
import type { CSSProperties } from "react";

const p = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

interface AlertRule {
  id: string;
  category: "재고" | "매출" | "Agent" | "배달" | "고객";
  title: string;
  desc: string;
  enabled: boolean;
  threshold: string;
  channel: string[];
  lastFired?: string;
}

const initialRules: AlertRule[] = [
  {
    id: "ALT-001",
    category: "재고",
    title: "재고 임계치 도달 알림",
    desc: "특정 메뉴 재고가 설정 임계치 이하로 내려갈 경우 즉시 알림",
    enabled: true,
    threshold: "잔여 재고 ≤ 20개",
    channel: ["카카오톡", "앱 Push"],
    lastFired: "14:35",
  },
  {
    id: "ALT-002",
    category: "재고",
    title: "재고 소진 예상 1시간 전 알림",
    desc: "AI가 예측한 소진 예상 시간 1시간 전에 발주 권장 알림",
    enabled: true,
    threshold: "소진 예상 ≤ 60분",
    channel: ["카카오톡"],
    lastFired: "14:20",
  },
  {
    id: "ALT-003",
    category: "재고",
    title: "배달앱 재고 불일치 감지",
    desc: "POS 재고와 배달앱 노출 재고 간 차이 발생 시 알림",
    enabled: false,
    threshold: "불일치 ≥ 3개",
    channel: ["앱 Push"],
  },
  {
    id: "ALT-004",
    category: "매출",
    title: "시간대별 매출 이상 감지",
    desc: "동일 시간대 전주 대비 매출 하락이 기준치 이상 시 알림",
    enabled: true,
    threshold: "전주 대비 ≤ -10%",
    channel: ["카카오톡", "앱 Push", "이메일"],
    lastFired: "14:22",
  },
  {
    id: "ALT-005",
    category: "매출",
    title: "일 목표 달성률 경보",
    desc: "오후 특정 시간 기준 일 목표 달성이 어려운 경우 알림",
    enabled: true,
    threshold: "17시 기준 목표 달성률 ≤ 70%",
    channel: ["카카오톡"],
  },
  {
    id: "ALT-006",
    category: "Agent",
    title: "Agent A 긴급 알림",
    desc: "Agent A가 긴급 재고 이슈를 감지했을 때 자동 에스컬레이션",
    enabled: true,
    threshold: "신뢰도 ≥ 80%",
    channel: ["카카오톡", "앱 Push"],
    lastFired: "14:35",
  },
  {
    id: "ALT-007",
    category: "Agent",
    title: "Agent B 주문 마감 추천",
    desc: "마감 20분 전 Agent B의 추가 주문 추천을 알림으로 전달",
    enabled: true,
    threshold: "마감 20분 전 자동",
    channel: ["앱 Push"],
  },
  {
    id: "ALT-008",
    category: "Agent",
    title: "AI 신뢰도 낮은 추천 검수 요청",
    desc: "신뢰도 70% 미만의 AI 추천은 관리자 검수 알림으로 전송",
    enabled: false,
    threshold: "신뢰도 < 70%",
    channel: ["이메일"],
  },
  {
    id: "ALT-009",
    category: "배달",
    title: "배달 채널 지연 감지",
    desc: "배달앱 응답 지연이 기준치 이상 발생 시 알림",
    enabled: true,
    threshold: "응답 지연 ≥ 150ms",
    channel: ["앱 Push"],
    lastFired: "13:55",
  },
  {
    id: "ALT-010",
    category: "고객",
    title: "VIP 고객 미방문 알림",
    desc: "상위 고객이 일정 기간 이상 미방문 시 리텐션 캠페인 알림",
    enabled: false,
    threshold: "마지막 방문 ≥ 21일",
    channel: ["카카오톡"],
  },
];

const categoryColor: Record<string, { color: string; bg: string }> = {
  재고: { color: "#ff6e00", bg: "#fff3e8" },
  매출: { color: "#dc2626", bg: "#feecec" },
  Agent: { color: "#7c3aed", bg: "#f5f3ff" },
  배달: { color: "#2563eb", bg: "#eaf2ff" },
  고객: { color: "#16a34a", bg: "#ebf9ef" },
};

const channelIcons: Record<string, string> = {
  "카카오톡": "💬",
  "앱 Push": "📲",
  "이메일": "📧",
};

const recentAlerts = [
  { time: "14:35", title: "카페라떼 재고 임계치 도달", category: "재고", severity: "긴급" },
  { time: "14:22", title: "오후 음료 매출 -12.4% 감지", category: "매출", severity: "긴급" },
  { time: "14:20", title: "시그니처블렌드 소진 1시간 전", category: "재고", severity: "주의" },
  { time: "13:55", title: "쿠팡이츠 응답 지연 210ms", category: "배달", severity: "주의" },
  { time: "12:00", title: "오전 목표 달성률 82%", category: "매출", severity: "정보" },
];

export function AlertsPage() {
  const [rules, setRules] = useState(initialRules);
  const [categoryFilter, setCategoryFilter] = useState("전체");

  const toggle = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const categories = ["전체", "재고", "매출", "Agent", "배달", "고객"];
  const filtered =
    categoryFilter === "전체" ? rules : rules.filter((r) => r.category === categoryFilter);

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { label: "전체 규칙", val: rules.length, icon: "🔔", color: "#374151" },
          { label: "활성 알림", val: enabledCount, icon: "✅", color: "#16a34a" },
          { label: "비활성", val: rules.length - enabledCount, icon: "🔕", color: "#9ca3af" },
          { label: "오늘 발송", val: 12, icon: "📨", color: "#2563eb" },
        ].map((s) => (
          <div key={s.label} style={p({ padding: 18 })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, letterSpacing: "-0.04em" }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {/* Main: Rules + Recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 20 }}>
        {/* Rules */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Category filter */}
          <div style={p({ padding: "14px 18px" })}>
            <div style={{ display: "flex", gap: 8 }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  style={{
                    height: 34,
                    padding: "0 14px",
                    borderRadius: 999,
                    border: categoryFilter === c ? 0 : "1px solid #e7ebf3",
                    background: categoryFilter === c ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
                    color: categoryFilter === c ? "#fff" : "#374151",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Alert rule cards */}
          {filtered.map((rule) => {
            const cc = categoryColor[rule.category];
            return (
              <div key={rule.id} style={p({ padding: "16px 20px" })}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{rule.id}</span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 22,
                          padding: "0 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          color: cc.color,
                          background: cc.bg,
                        }}
                      >
                        {rule.category}
                      </span>
                      {rule.lastFired && (
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>마지막 발동: {rule.lastFired}</span>
                      )}
                    </div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 15, color: "#111827" }}>{rule.title}</h4>
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{rule.desc}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div
                        style={{
                          padding: "5px 10px",
                          borderRadius: 8,
                          background: "#f8fafc",
                          border: "1px solid #e7ebf3",
                          fontSize: 12,
                          color: "#374151",
                          fontWeight: 600,
                        }}
                      >
                        조건: {rule.threshold}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {rule.channel.map((ch) => (
                          <span
                            key={ch}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              borderRadius: 8,
                              background: "#f3f4f6",
                              fontSize: 12,
                              color: "#374151",
                              fontWeight: 600,
                            }}
                          >
                            {channelIcons[ch]} {ch}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Toggle */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => toggle(rule.id)}
                      style={{
                        width: 52,
                        height: 28,
                        borderRadius: 999,
                        border: 0,
                        background: rule.enabled ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#e7ebf3",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          left: rule.enabled ? 26 : 4,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                        }}
                      />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: rule.enabled ? "#16a34a" : "#9ca3af" }}>
                      {rule.enabled ? "활성" : "비활성"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Recent + KakaoTalk */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Recent alerts */}
          <div style={p()}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>최근 발동 이력</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>오늘 발동된 알림</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recentAlerts.map((al, idx) => {
                const sv =
                  al.severity === "긴급"
                    ? { color: "#dc2626", bg: "#feecec" }
                    : al.severity === "주의"
                    ? { color: "#d97706", bg: "#fff7e8" }
                    : { color: "#2563eb", bg: "#eaf2ff" };
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #e7ebf3",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#9ca3af",
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {al.time}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 18,
                            padding: "0 6px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            color: sv.color,
                            background: sv.bg,
                          }}
                        >
                          {al.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", lineHeight: 1.4 }}>
                        {al.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KakaoTalk settings */}
          <div style={p()}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>카카오톡 알림 설정</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>수신자 및 발송 시간 관리</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "수신 번호", val: "010-1234-5678" },
                { label: "조용한 시간", val: "22:00 ~ 07:00" },
                { label: "긴급 알림", val: "24시간 허용" },
                { label: "일일 요약", val: "매일 08:30" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e7ebf3",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{item.val}</span>
                </div>
              ))}
            </div>
            <button
              style={{
                marginTop: 14,
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: 0,
                background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              💬 테스트 알림 발송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}