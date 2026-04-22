import type { TodoItem } from "@/types/api";

interface RecommendedActionsProps {
  actions?: TodoItem[];
}

const defaultActions = [
  {
    title: "오후 프로모션 재배치",
    desc: "14:00~17:00 음료 노출 집중 + 상단 배너 우선순위 조정",
    effect: "+5~8%",
    btnLabel: "실행안 보기",
  },
  {
    title: "세트 업셀 카피 수정",
    desc: "세트 혜택 메시지 간결화 + 인기 메뉴 묶음 제안 강화",
    effect: "+2~4%",
    btnLabel: "카피 초안",
  },
];

export function RecommendedActions({ actions: actionsProp }: RecommendedActionsProps) {
  const displayActions = actionsProp && actionsProp.length > 0
    ? actionsProp.map((item) => ({
        title: item.label,
        desc: item.deadline ? `마감: ${item.deadline}` : "AI 추천 액션",
        effect: item.priority === "HIGH" ? "긴급" : "대기중",
        btnLabel: "상세 보기",
      }))
    : defaultActions;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e7ebf3",
        borderRadius: 20,
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        padding: 12,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "rgb(255, 110, 0)", fontWeight: 800 }}>
          추천 액션
        </h3>
        <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 11 }}>
          AI 즉시 실행 제안
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayActions.map((action) => (
          <div
            key={action.title}
            style={{
              border: "1px solid #e7ebf3",
              borderRadius: 10,
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: "0 0 2px", fontSize: 12, color: "#111827", fontWeight: 700 }}>
                {action.title}
              </h4>
              <p style={{ margin: 0, fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                {action.desc}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#16a34a" }}>
                {action.effect}
              </span>
              <button
                style={{
                  height: 28,
                  borderRadius: 999,
                  padding: "0 10px",
                  border: "1px solid #e7ebf3",
                  background: "#f8fafc",
                  color: "#111827",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {action.btnLabel}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
