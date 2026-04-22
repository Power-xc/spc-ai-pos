import { useNavigate } from "react-router";
import type { AlertCard } from "@/types/api";

interface IssuesPanelProps {
  issues?: AlertCard[];
}

const defaultIssues = [
  {
    variant: "amber",
    severity: "정보",
    title: "조기 경보 베타",
    desc: "현재 활성 경보가 없습니다. SSE 또는 알림 데이터를 대기 중입니다.",
    warningKind: "데이터 대기",
    pill: { label: "알림 설정", to: "/alerts" },
  },
];

const severityBar: Record<string, { borderColor: string; badgeBg: string; badgeColor: string }> = {
  red:   { borderColor: "#dc2626", badgeBg: "#feecec", badgeColor: "#dc2626" },
  amber: { borderColor: "#d97706", badgeBg: "#fff7e8", badgeColor: "#d97706" },
};

export function IssuesPanel({ issues: issuesProp }: IssuesPanelProps) {
  const navigate = useNavigate();
  const displayIssues = issuesProp && issuesProp.length > 0
    ? issuesProp.slice(0, 5).map((alert) => ({
        variant: alert.severity === "HIGH" ? "red" : "amber",
        severity: alert.severity === "HIGH" ? "긴급" : "주의",
        title: alert.title,
        desc: alert.subtitle || alert.message || "",
        warningKind: (alert as any).warning_kind || (
          alert.type === "production"
            ? "소진 속도 경보"
            : alert.type === "order"
              ? "제조 준비 필요"
              : "혼잡/피크 또는 품절 대응"
        ),
        warningMode: (alert as any).warning_mode || "beta",
        pill: alert.cta ? { label: alert.cta.label, to: alert.cta.route || "/issues" } : { label: "상세 보기", to: "/issues" },
      }))
    : defaultIssues;
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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}>
          지금 봐야 할 이슈
        </h3>
        <button
          onClick={() => navigate("/issues")}
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

      {/* Issue List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayIssues.map((issue) => {
          const sb = severityBar[issue.variant];
          return (
            <div
              key={issue.title}
              style={{
                border: "1px solid #e7ebf3",
                borderLeft: `3px solid ${sb.borderColor}`,
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: sb.badgeBg,
                      color: sb.badgeColor,
                      flexShrink: 0,
                    }}
                  >
                    {issue.severity}
                  </span>
                  <h4 style={{ margin: 0, fontSize: 13, color: "#111827", fontWeight: 700 }}>
                    {issue.title}
                  </h4>
                </div>
                {"warningKind" in issue && (
                  <div style={{ marginBottom: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 18,
                        padding: "0 7px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#374151",
                        background: "#f3f4f6",
                      }}
                    >
                      {(issue as any).warningKind}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 18,
                        padding: "0 7px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#9ca3af",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      {((issue as any).warningMode || "beta") === "actual" ? "실데이터" : "조기 경보 베타"}
                    </span>
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                  {issue.desc}
                </p>
              </div>
              <button
                onClick={() => navigate(issue.pill.to)}
                style={{
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${sb.borderColor}30`,
                  background: sb.badgeBg,
                  color: sb.badgeColor,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {issue.pill.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
