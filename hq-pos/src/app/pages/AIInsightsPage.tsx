import { useState } from "react";
import type { CSSProperties } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const p = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

const hypotheses = [
  {
    id: "H-001",
    title: "오후 음료 매출 하락은 날씨 변화에 의한 것이다",
    status: "검증됨",
    statusColor: "#16a34a",
    statusBg: "#ebf9ef",
    confidence: 87,
    agents: ["A", "B", "C"],
    finding:
      "기온 하강(-3°C) 시 아이스 음료 수요 12.4% 감소 패턴 확인. 과거 28일 데이터와 상관계수 0.82.",
    action: "날씨 연동 메뉴 자동 전환 설정 권장",
  },
  {
    id: "H-002",
    title: "배너 노출 감소가 프로모션 반응률 하락을 가속했다",
    status: "검증됨",
    statusColor: "#16a34a",
    statusBg: "#ebf9ef",
    confidence: 79,
    agents: ["B", "C"],
    finding:
      "배너 노출량 22% 감소 → 프로모션 반응률 8.6% 하락. 동시 기간 타 지점은 변화 없음.",
    action: "14~17시 배너 우선순위 재조정",
  },
  {
    id: "H-003",
    title: "세트 업셀 메시지 변경이 객단가에 영향을 준다",
    status: "검증 중",
    statusColor: "#d97706",
    statusBg: "#fff7e8",
    confidence: 61,
    agents: ["C"],
    finding:
      "A/B 테스트 진행 중. 현재 변형 B가 전환율 +4.2% 우세하나 표본 미달 (N=142).",
    action: "3일 추가 데이터 수집 후 확정",
  },
  {
    id: "H-004",
    title: "재고 부족이 평점 하락 원인 중 하나다",
    status: "반증됨",
    statusColor: "#dc2626",
    statusBg: "#feecec",
    confidence: 28,
    agents: ["A"],
    finding: "품절 발생 빈도와 리뷰 평점 간 유의미한 상관관계 미확인 (p=0.34).",
    action: "다른 원인 탐색 권장",
  },
];

const radarData = [
  { subject: "데이터 충분성", A: 87, fullMark: 100 },
  { subject: "패턴 일관성", A: 79, fullMark: 100 },
  { subject: "인과관계 강도", A: 68, fullMark: 100 },
  { subject: "재현 가능성", A: 82, fullMark: 100 },
  { subject: "예측 정확도", A: 75, fullMark: 100 },
  { subject: "액션 연결성", A: 91, fullMark: 100 },
];

const aiLogHistory = [
  {
    ts: "14:32",
    agent: "C",
    msg: "음료 카테고리 전환율 이상 감지 → 원인 탐색 시작",
    type: "detect",
  },
  {
    ts: "14:33",
    agent: "B",
    msg: "동시간대 주문 패턴 정상 확인, 배달 채널 지연 없음",
    type: "info",
  },
  {
    ts: "14:35",
    agent: "A",
    msg: "카페라떼·시그니처블렌드 재고 임계치 돌파 경고",
    type: "warn",
  },
  {
    ts: "14:36",
    agent: "C",
    msg: "날씨 API 연동 → 기온 -3.2°C 변화 감지, 음료 연관성 0.82",
    type: "insight",
  },
  {
    ts: "14:38",
    agent: "B",
    msg: "오후 프로모션 배너 노출량 22% 하락 확인",
    type: "insight",
  },
  {
    ts: "14:40",
    agent: "C",
    msg: "최종 원인 추정 완료 → 종합 추천 액션 생성",
    type: "action",
  },
];

const logColors: Record<string, { color: string; bg: string; icon: string }> = {
  detect: { color: "#d97706", bg: "#fff7e8", icon: "🔍" },
  info: { color: "#2563eb", bg: "#eaf2ff", icon: "ℹ️" },
  warn: { color: "#dc2626", bg: "#feecec", icon: "⚠️" },
  insight: { color: "#7c3aed", bg: "#f5f3ff", icon: "💡" },
  action: { color: "#16a34a", bg: "#ebf9ef", icon: "✅" },
};

const trustItems = [
  {
    label: "판단 근거 공개",
    on: true,
    desc: "AI가 왜 이 결론을 냈는지 추론 과정을 표시합니다",
  },
  {
    label: "데이터 출처 표시",
    on: true,
    desc: "분석에 사용된 데이터 소스와 기간을 명시합니다",
  },
  {
    label: "불확실성 표현",
    on: true,
    desc: "확신도가 낮은 추천에는 신뢰도 수치를 함께 표시합니다",
  },
  {
    label: "관리자 검수 요청",
    on: false,
    desc: "신뢰도 70% 미만 추천은 관리자 승인 후 실행합니다",
  },
  {
    label: "AI 추천 누적 공개",
    on: true,
    desc: "과거 모든 AI 추천과 실제 결과를 이력으로 관리합니다",
  },
];

export function AIInsightsPage() {
  const [trustSettings, setTrustSettings] = useState(
    trustItems.map((t) => ({ ...t })),
  );

  const toggle = (idx: number) => {
    setTrustSettings((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, on: !t.on } : t)),
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hypothesis list */}
      <div style={p()}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>
            가설 검증 현황
          </h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
            Agent A·B·C가 공동 검증 중인 운영 가설과 결과
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {hypotheses.map((h) => (
            <div
              key={h.id}
              style={{
                border: "1px solid #e7ebf3",
                borderRadius: 16,
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 20,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#9ca3af",
                      }}
                    >
                      {h.id}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 24,
                        padding: "0 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        color: h.statusColor,
                        background: h.statusBg,
                      }}
                    >
                      {h.status}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {h.agents.map((ag) => (
                        <span
                          key={ag}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 8,
                            background:
                              ag === "A"
                                ? "#fff3e8"
                                : ag === "B"
                                  ? "#eaf2ff"
                                  : "#ebf9ef",
                            color:
                              ag === "A"
                                ? "#ff6e00"
                                : ag === "B"
                                  ? "#2563eb"
                                  : "#16a34a",
                            fontSize: 11,
                            fontWeight: 800,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {ag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: 15,
                      color: "#111827",
                    }}
                  >
                    {h.title}
                  </h4>
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 13,
                      color: "#6b7280",
                      lineHeight: 1.6,
                    }}
                  >
                    {h.finding}
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 999,
                      background: "#f8fafc",
                      border: "1px solid #e7ebf3",
                      fontSize: 12,
                      color: "#374151",
                    }}
                  >
                    💡 {h.action}
                  </div>
                </div>

                {/* Confidence */}
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: h.statusColor,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {h.confidence}%
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>신뢰도</div>
                  <div
                    style={{
                      marginTop: 8,
                      width: 60,
                      height: 6,
                      borderRadius: 999,
                      background: "#eef2f7",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 999,
                        background: h.statusColor,
                        width: `${h.confidence}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle: radar + agent log */}
      <div
        style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 20 }}
      >
        {/* AI quality radar */}
        <div style={p()}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
              AI 분석 품질 지표
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              6개 차원의 AI 신뢰 수준
            </p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e7ebf3" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <Radar
                name="AI 품질"
                dataKey="A"
                stroke="#ff6e00"
                fill="#ff6e00"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e7ebf3",
                  fontSize: 12,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Agent activity log */}
        <div style={p()}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
              Agent 활동 로그
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              오늘 AI 분석 과정 타임라인
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aiLogHistory.map((log, idx) => {
              const lc = logColors[log.type];
              return (
                <div
                  key={idx}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#9ca3af",
                        fontWeight: 700,
                      }}
                    >
                      {log.ts}
                    </span>
                    {idx < aiLogHistory.length - 1 && (
                      <div
                        style={{ width: 1, height: 16, background: "#e7ebf3" }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${lc.bg}`,
                      background: lc.bg,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <span>{lc.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: lc.color,
                          background: "#fff",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        Agent {log.agent}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "#374151",
                        lineHeight: 1.5,
                      }}
                    >
                      {log.msg}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Trust structure */}
      <div style={p()}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>
            AI 신뢰 구조 설정
          </h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
            시스템이 AI 판단을 어떻게 표시하고 검수할지 결정하는 투명성 옵션
          </p>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {trustSettings.map((item, idx) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 14,
                border: `1px solid ${item.on ? "rgba(255,110,0,.2)" : "#e7ebf3"}`,
                background: item.on ? "rgba(255,110,0,.03)" : "#fafafa",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}
                >
                  {item.desc}
                </div>
              </div>
              <button
                onClick={() => toggle(idx)}
                style={{
                  width: 46,
                  height: 26,
                  borderRadius: 999,
                  border: 0,
                  background: item.on
                    ? "linear-gradient(135deg, #ff6e00, #e91e8c)"
                    : "#e7ebf3",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: item.on ? 23 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
