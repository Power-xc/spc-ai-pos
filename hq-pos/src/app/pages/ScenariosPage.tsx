import { useState } from "react";
import type { CSSProperties } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const p = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

const radarData = [
  { subject: "매출 증가", A: 72, B: 85 },
  { subject: "전환율", A: 68, B: 74 },
  { subject: "고객 만족", A: 80, B: 76 },
  { subject: "재고 효율", A: 60, B: 88 },
  { subject: "운영 효율", A: 75, B: 79 },
  { subject: "리스크", A: 45, B: 62 },
];

const compareData = [
  { metric: "오후 매출", A: 2100000, B: 2460000, unit: "원" },
  { metric: "방문 전환율", A: 34.7, B: 37.2, unit: "%" },
  { metric: "객단가", A: 9970, B: 10450, unit: "원" },
  { metric: "음료 매출", A: 5200000, B: 6100000, unit: "원" },
  { metric: "세트 전환", A: 18.3, B: 22.1, unit: "%" },
];

const scenarioA = {
  name: "현재 운영 방식",
  color: "#ff6e00",
  settings: [
    { label: "프로모션 배너", val: "기본 배치" },
    { label: "메뉴 순서", val: "기본 순서" },
    { label: "업셀 카피", val: "기존 버전 A" },
    { label: "배달 채널", val: "3사 균등" },
    { label: "재고 알림", val: "소진 30분 전" },
  ],
};

const scenarioB = {
  name: "AI 추천 최적화",
  color: "#2563eb",
  settings: [
    { label: "프로모션 배너", val: "14~17시 음료 우선" },
    { label: "메뉴 순서", val: "날씨 연동 자동" },
    { label: "업셀 카피", val: "신규 버전 B" },
    { label: "배달 채널", val: "배민 우선 60%" },
    { label: "재고 알림", val: "소진 1시간 전" },
  ],
};

/* 탭 타입 */
type ScenarioTab = "compare" | "benchmark";

/* 벤치마킹 데이터 — 인근 가맹점 AI 분석 인사이트 */
const benchmarkStores = [
  {
    name: "강남 2호점",
    distance: "0.4km",
    salesDiff: +8.3,
    convDiff: +2.1,
    topAction: "오후 세트 번들 강화",
    topItem: "베이컨 에그 잉글리쉬머핀",
    marketingStrategy: "14~17시 타임세일 15% 적용",
    highlight: true,
  },
  {
    name: "역삼점",
    distance: "0.8km",
    salesDiff: +3.1,
    convDiff: -0.5,
    topAction: "배달 채널 집중 (배민 60%)",
    topItem: "카페라떼",
    marketingStrategy: "배달 전용 1인 세트 메뉴 구성",
    highlight: false,
  },
  {
    name: "선릉점",
    distance: "1.2km",
    salesDiff: -1.4,
    convDiff: +1.8,
    topAction: "점심 시간 음료 노출 확대",
    topItem: "아이스 아메리카노",
    marketingStrategy: "인근 직장인 대상 대량 주문 할인",
    highlight: false,
  },
  {
    name: "삼성점",
    distance: "1.6km",
    salesDiff: +12.7,
    convDiff: +4.3,
    topAction: "시즌 메뉴 조기 노출 + 재고 선발주",
    topItem: "딸기 듬뿍 도넛",
    marketingStrategy: "인스타그램 감성 포토존 및 굿즈 연계",
    highlight: true,
  },
];

export function ScenariosPage() {
  const [runSim, setRunSim] = useState(false);
  const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [tab, setTab] = useState<ScenarioTab>("compare");

  const handleSimulate = () => {
    setRunSim(true);
    setTimeout(() => {
      setWinner("B");
    }, 1500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 탭 전환 */}
      <div style={{ display: "flex", gap: 6 }}>
        {([
          { key: "compare",   label: "A/B 시나리오 비교" },
          { key: "benchmark", label: "타 매장 벤치마킹" },
        ] as { key: ScenarioTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              height: 38,
              padding: "0 18px",
              borderRadius: 999,
              border: tab === key ? 0 : "1px solid #e7ebf3",
              background: tab === key ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
              color: tab === key ? "#fff" : "#374151",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 벤치마킹 탭 */}
      {tab === "benchmark" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "18px 22px",
              background: "linear-gradient(135deg, #111827, #1f2937)",
              borderRadius: 20,
              color: "#fff",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>타 매장 벤치마킹</h3>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.7)" }}>
              루나 AI가 인근 가맹점 데이터를 분석하여 적용 가능한 전략 인사이트를 추출합니다.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {benchmarkStores.map((store) => (
              <div
                key={store.name}
                style={{
                  ...p({
                    border: store.highlight ? "2px solid #ff6e00" : "1px solid #e7ebf3",
                    position: "relative",
                  }),
                }}
              >
                {store.highlight && (
                  <div
                    style={{
                      position: "absolute",
                      top: -1,
                      right: 16,
                      background: "#ff6e00",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "3px 10px",
                      borderRadius: "0 0 10px 10px",
                    }}
                  >
                    참고 권장
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>{store.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>거리 {store.distance}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: store.salesDiff > 0 ? "#ebf9ef" : "#feecec", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>매출 차이</p>
                    <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: store.salesDiff > 0 ? "#16a34a" : "#dc2626" }}>
                      {store.salesDiff > 0 ? "+" : ""}{store.salesDiff}%
                    </p>
                  </div>
                  <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: store.convDiff > 0 ? "#ebf9ef" : "#feecec", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>전환율 차이</p>
                    <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: store.convDiff > 0 ? "#16a34a" : "#dc2626" }}>
                      {store.convDiff > 0 ? "+" : ""}{store.convDiff}%p
                    </p>
                  </div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e7ebf3", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#9ca3af", marginBottom: 2 }}>주력 제품</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>{store.topItem}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#9ca3af", marginBottom: 2 }}>마케팅 전략</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#ff6e00" }}>{store.marketingStrategy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 시나리오 비교 탭 */}
      {tab === "compare" && <>
      {/* Header action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 22px",
          background: "linear-gradient(135deg, #111827, #1f2937)",
          borderRadius: 20,
          border: "1px solid #e7ebf3",
          color: "#fff",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>
            A/B 시나리오 비교 시뮬레이터
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.7)" }}>
            현재 운영 방식 vs AI 추천 최적화 시나리오를 시뮬레이션하여 예상
            성과를 비교합니다.
          </p>
        </div>
        <button
          onClick={handleSimulate}
          disabled={runSim}
          style={{
            height: 46,
            padding: "0 24px",
            borderRadius: 999,
            border: 0,
            background: runSim
              ? "rgba(255,255,255,.2)"
              : "linear-gradient(135deg, #ff6e00, #e91e8c)",
            color: "#fff",
            fontWeight: 800,
            cursor: runSim ? "not-allowed" : "pointer",
            fontSize: 15,
          }}
        >
          {winner
            ? "✅ 시뮬레이션 완료"
            : runSim
              ? "⏳ 시뮬레이션 중..."
              : "▶ 시뮬레이션 실행"}
        </button>
      </div>

      {/* Scenario cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[scenarioA, scenarioB].map((sc, idx) => {
          const isWinner = (idx === 0 ? "A" : "B") === winner;
          return (
            <div
              key={sc.name}
              style={p({
                border: isWinner
                  ? `2px solid ${sc.color}`
                  : "1px solid #e7ebf3",
                position: "relative",
              })}
            >
              {isWinner && (
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    right: 16,
                    background: sc.color,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "4px 12px",
                    borderRadius: "0 0 10px 10px",
                  }}
                >
                  🏆 우승 시나리오
                </div>
              )}
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
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: sc.color,
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 16,
                  }}
                >
                  {idx === 0 ? "A" : "B"}
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}
                >
                  {sc.name}
                </div>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {sc.settings.map((s) => (
                  <div
                    key={s.label}
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
                    <span
                      style={{
                        fontSize: 13,
                        color: "#6b7280",
                        fontWeight: 600,
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: idx === 1 ? sc.color : "#111827",
                      }}
                    >
                      {s.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Results (shown after simulation) */}
      {winner && (
        <>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
          >
            {/* Radar */}
            <div style={p()}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
                  시나리오 종합 비교
                </h3>
                <p
                  style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}
                >
                  6개 지표 레이더 차트
                </p>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e7ebf3" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                  />
                  <Radar
                    name="시나리오 A"
                    dataKey="A"
                    stroke="#ff6e00"
                    fill="#ff6e00"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Radar
                    name="시나리오 B"
                    dataKey="B"
                    stroke="#2563eb"
                    fill="#2563eb"
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
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Bar comparison */}
            <div style={p()}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
                  핵심 지표 비교
                </h3>
                <p
                  style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}
                >
                  예상 성과 수치 비교
                </p>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {compareData.map((row) => {
                  const maxVal = Math.max(row.A, row.B);
                  return (
                    <div key={row.metric}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#374151",
                          }}
                        >
                          {row.metric}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#16a34a",
                            fontWeight: 800,
                          }}
                        >
                          +{(((row.B - row.A) / row.A) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        {[
                          { label: "A", val: row.A, color: "#ff6e00" },
                          { label: "B", val: row.B, color: "#2563eb" },
                        ].map((bar) => (
                          <div
                            key={bar.label}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "16px 1fr 80px",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: bar.color,
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
                                  width: `${(bar.val / maxVal) * 100}%`,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#111827",
                                textAlign: "right",
                              }}
                            >
                              {bar.val.toLocaleString()}
                              {row.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recommendation box */}
          <div
            style={{
              padding: 22,
              background: "linear-gradient(135deg, #ebf9ef, #fff)",
              borderRadius: 20,
              border: "1px solid #bbf7d0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 28 }}>🏆</span>
              <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>
                시뮬레이션 결과: 시나리오 B 권장
              </h3>
            </div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 14,
                color: "#374151",
                lineHeight: 1.7,
              }}
            >
              AI 추천 최적화 시나리오(B)가 핵심 지표 전반에서 우세합니다. 특히{" "}
              <strong>재고 효율 +28%p</strong>,{" "}
              <strong>오후 매출 +17.1%</strong>,{" "}
              <strong>세트 전환율 +3.8%p</strong> 개선이 예상됩니다. 즉시 적용
              시 오늘 매출 예상 기여액은 <strong>840,000원 추가</strong>입니다.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{
                  height: 42,
                  padding: "0 20px",
                  borderRadius: 999,
                  border: 0,
                  background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                시나리오 B 적용
              </button>
              <button
                style={{
                  height: 42,
                  padding: "0 20px",
                  borderRadius: 999,
                  border: "1px solid #e7ebf3",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                리포트 저장
              </button>
            </div>
          </div>
        </>
      )}
      </>}
    </div>
  );
}
