import { STORE_LIST, formatKRW } from "../../lib/hqData";

const actions = [
  {
    title: "오후 시간대 프로모션 재배치",
    desc: "전체 점포 오후 14:00~16:00 구간 매출 하락 완화를 위해 타임세일 프로모션을 권장합니다.",
    effect: "매출 +5~8% 예상",
    btnLabel: "매출 분석 보기",
  },
  {
    title: "재고 위험 점포 발주 처리",
    desc: "도넛 주력 상품 및 원두 재고 소진 임박 점포에 대해 자동발주 승인이 대기 중입니다.",
    effect: "리스크 감소",
    btnLabel: "재고 관리",
  },
  {
    title: "캠페인 미참여 점포 안내",
    desc: "캠페인 매출 비중 0%인 8개 점포에 참여 안내를 발송하여 매출 기여도를 높입니다.",
    effect: "참여율 향상",
    btnLabel: "리포트 확인",
  },
];

const topStores = STORE_LIST
  .filter((s) => s.annual_sales != null)
  .sort((a, b) => (b.annual_sales || 0) - (a.annual_sales || 0))
  .slice(0, 5);

export function RightPanel() {
  return (
    <aside
      style={{
        width: 340,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        position: "sticky",
        top: 0,
        alignSelf: "start",
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
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#111827" }}>
            HQ 추천 액션
          </h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
            전체 점포 기반 우선 대응 권장 사항
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {actions.map((action) => (
            <div
              key={action.title}
              style={{
                border: "1px solid #e7ebf3",
                borderRadius: 16,
                padding: 16,
                background: "#fff",
              }}
            >
              <h4 style={{ margin: "0 0 6px", fontSize: 15, color: "#111827" }}>
                {action.title}
              </h4>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  color: "#6b7280",
                  lineHeight: 1.6,
                }}
              >
                {action.desc}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 800, color: "#16a34a" }}
                >
                  {action.effect}
                </span>
                <button
                  style={{
                    height: 36,
                    borderRadius: 999,
                    padding: "0 14px",
                    border: "1px solid #e7ebf3",
                    background: "#f8fafc",
                    color: "#111827",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {action.btnLabel}
                </button>
              </div>
            </div>
          ))}
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
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#111827" }}>
            매출 상위 점포
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
            연간 매출 기준 TOP 5
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topStores.map((s, i) => (
            <div key={s.store_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", width: 20 }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", flex: 1 }}>{s.store_name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ff6e00" }}>{formatKRW(s.annual_sales)}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(255,110,0,.06), rgba(233,30,140,.04))",
          border: "1px dashed rgba(255,110,0,.3)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>✦</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>HQ Fox에게 바로 묻기</p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            화면 우측 하단 채팅에서 전체 점포 데이터 기반 분석을 질문하세요.
          </p>
        </div>
      </div>
    </aside>
  );
}