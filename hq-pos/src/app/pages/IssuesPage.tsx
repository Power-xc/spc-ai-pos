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

type Severity = "긴급" | "주의" | "정보";
type IssueStatus = "열림" | "처리중" | "해결됨" | "무시됨";

interface Issue {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  desc: string;
  time: string;
  status: IssueStatus;
  relatedAgent?: string;
}

const allIssues: Issue[] = [
  { id: "ISS-128", category: "매출", severity: "긴급", title: "오후 음료 카테고리 매출 급감", desc: "예상 대비 -12.4% 하락. AI는 날씨 변화와 프로모션 노출 축소를 복합 원인으로 지목.", time: "14:22", status: "처리중", relatedAgent: "C" },
  { id: "ISS-129", category: "재고", severity: "긴급", title: "시그니처블렌드 1시간 내 소진 예상", desc: "현재 재고 14개. 추세 기준 오후 3시 30분 전 소진 가능성 92%.", time: "14:35", status: "열림", relatedAgent: "A" },
  { id: "ISS-130", category: "재고", severity: "긴급", title: "카페라떼 재고 임계치 돌파", desc: "잔여 22개, 소진 예상 시간 2시간 이내. 발주 처리 필요.", time: "14:38", status: "처리중", relatedAgent: "A" },
  { id: "ISS-131", category: "배달", severity: "주의", title: "쿠팡이츠 응답 지연 210ms", desc: "정상 기준 50ms 대비 4배 지연. CS팀 에스컬레이션 진행 중.", time: "13:55", status: "처리중" },
  { id: "ISS-132", category: "프로모션", severity: "주의", title: "오후 배너 노출량 22% 하락", desc: "동시간대 배너 노출이 예상보다 22% 줄어 반응률에 영향을 준 것으로 추정.", time: "14:10", status: "열림", relatedAgent: "B" },
  { id: "ISS-133", category: "전환", severity: "주의", title: "세트 업셀 전환율 정체", desc: "방문 수 증가에도 세트 구성 전환이 -2.2% 하락. 카피 메시지 개선 필요.", time: "13:40", status: "열림", relatedAgent: "C" },
  { id: "ISS-134", category: "고객", severity: "정보", title: "VIP 고객 재방문 주기 늘어남", desc: "상위 20% 고객의 평균 방문 주기가 12일→15일로 늘어남. 리텐션 캠페인 검토.", time: "12:00", status: "열림", relatedAgent: "C" },
  { id: "ISS-135", category: "매출", severity: "정보", title: "MD 카테고리 목표 대비 75%", desc: "현재 MD 카테고리는 목표 달성률 75%. 시즌 상품 노출 확대 고려.", time: "11:30", status: "열림" },
  { id: "ISS-136", category: "배달", severity: "정보", title: "디저트 배달 포장 리뷰 감소", desc: "최근 7일간 포장 관련 부정 리뷰 3건. 포장 개선 소재 검토 권장.", time: "09:00", status: "해결됨" },
  { id: "ISS-137", category: "시스템", severity: "정보", title: "POS 단말기 소프트웨어 업데이트", desc: "새벽 2시 자동 업데이트 예정. 결제 서비스 중단 없음.", time: "08:15", status: "해결됨" },
  { id: "ISS-138", category: "매출", severity: "주의", title: "신규 메뉴 '오렌지 슈페너' 초기 반응 저조", desc: "기대 대비 판매량 -15%. 노출 위치 및 할인 혜택 강화 검토.", time: "07:30", status: "열림", relatedAgent: "C" },
  { id: "ISS-139", category: "재고", severity: "정보", title: "우유 재고 넉넉함 (보충 필요 없음)", desc: "유통기한 3일 남은 우유 45팩. 소진 속도 조절 불필요.", time: "06:45", status: "해결됨", relatedAgent: "A" },
  { id: "ISS-127", category: "재고", severity: "주의", title: "어제 디저트A 실제 소진 누락", desc: "어제 POS 재고와 실제 소진량 불일치 4개 차이 발생. 재고 감사 필요.", time: "어제", status: "해결됨", relatedAgent: "A" },
];

const severityStyle: Record<Severity, { color: string; bg: string }> = {
  긴급: { color: "#dc2626", bg: "#feecec" },
  주의: { color: "#d97706", bg: "#fff7e8" },
  정보: { color: "#2563eb", bg: "#eaf2ff" },
};

const statusStyle: Record<IssueStatus, { color: string; bg: string }> = {
  열림: { color: "#dc2626", bg: "#feecec" },
  처리중: { color: "#2563eb", bg: "#eaf2ff" },
  해결됨: { color: "#16a34a", bg: "#ebf9ef" },
  무시됨: { color: "#9ca3af", bg: "#f3f4f6" },
};

const agentColor: Record<string, string> = { A: "#ff6e00", B: "#2563eb", C: "#16a34a" };

export function IssuesPage() {
  const [severityFilter, setSeverityFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [issueStates, setIssueStates] = useState<IssueStatus[]>(
    allIssues.map((i) => i.status)
  );
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const categories = ["전체", ...Array.from(new Set(allIssues.map((i) => i.category)))];
  const severities = ["전체", "긴급", "주의", "정보"];
  const statuses = ["전체", "열림", "처리중", "해결됨", "무시됨"];

  const filtered = allIssues.filter((issue, idx) => {
    const sv = severityFilter === "전체" || issue.severity === severityFilter;
    const ct = categoryFilter === "전체" || issue.category === categoryFilter;
    const st = statusFilter === "전체" || issueStates[idx] === statusFilter;
    return sv && ct && st;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedIssues = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const updateStatus = (id: string, status: IssueStatus) => {
    const idx = allIssues.findIndex((i) => i.id === id);
    if (idx >= 0) setIssueStates((prev) => prev.map((s, i) => (i === idx ? status : s)));
  };

  // Stats
  const stats = {
    total: allIssues.length,
    open: issueStates.filter((s) => s === "열림").length,
    urgent: allIssues.filter((i) => i.severity === "긴급").length,
    resolved: issueStates.filter((s) => s === "해결됨").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { label: "전체 이슈", val: stats.total, icon: "🗂", color: "#374151" },
          { label: "열린 이슈", val: stats.open, icon: "🔴", color: "#dc2626" },
          { label: "긴급 이슈", val: stats.urgent, icon: "⚡", color: "#d97706" },
          { label: "해결 완료", val: stats.resolved, icon: "✅", color: "#16a34a" },
        ].map((s) => (
          <div key={s.label} style={p({ padding: 18 })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, letterSpacing: "-0.04em" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={p({ padding: "14px 20px" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "심각도", current: severityFilter, set: setSeverityFilter, opts: severities },
            { label: "카테고리", current: categoryFilter, set: setCategoryFilter, opts: categories },
            { label: "상태", current: statusFilter, set: setStatusFilter, opts: statuses },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", width: 60, flexShrink: 0 }}>
                {row.label}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {row.opts.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => row.set(opt)}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: row.current === opt ? 0 : "1px solid #e7ebf3",
                      background: row.current === opt ? "#111827" : "#fff",
                      color: row.current === opt ? "#fff" : "#374151",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Issue list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {paginatedIssues.length === 0 && (
          <div style={p({ padding: 40, textAlign: "center" as const, color: "#9ca3af", fontSize: 14 })}>
            조건에 맞는 이슈가 없습니다.
          </div>
        )}
        {paginatedIssues.map((issue) => {
          const origIdx = allIssues.findIndex((i) => i.id === issue.id);
          const currentStatus = issueStates[origIdx];
          const sv = severityStyle[issue.severity];
          const ss = statusStyle[currentStatus];

          return (
            <div
              key={issue.id}
              style={p({
                padding: "16px 20px",
                borderLeft: `4px solid ${sv.color}`,
              })}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{issue.id}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        color: sv.color,
                        background: sv.bg,
                      }}
                    >
                      {issue.severity}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#6b7280",
                        background: "#f3f4f6",
                      }}
                    >
                      {issue.category}
                    </span>
                    {issue.relatedAgent && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 22,
                          padding: "0 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          color: agentColor[issue.relatedAgent],
                          background: "#fff",
                          border: `1px solid ${agentColor[issue.relatedAgent]}40`,
                        }}
                      >
                        Agent {issue.relatedAgent}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{issue.time}</span>
                  </div>
                  <h4 style={{ margin: "0 0 4px", fontSize: 15, color: "#111827" }}>{issue.title}</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{issue.desc}</p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 26,
                      padding: "0 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      color: ss.color,
                      background: ss.bg,
                    }}
                  >
                    {currentStatus}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {currentStatus === "열림" && (
                      <button
                        onClick={() => updateStatus(issue.id, "처리중")}
                        style={{
                          height: 32,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        처리 시작
                      </button>
                    )}
                    {currentStatus === "처리중" && (
                      <button
                        onClick={() => updateStatus(issue.id, "해결됨")}
                        style={{
                          height: 32,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: 0,
                          background: "#16a34a",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        해결 완료
                      </button>
                    )}
                    {currentStatus !== "해결됨" && currentStatus !== "무시됨" && (
                      <button
                        onClick={() => updateStatus(issue.id, "무시됨")}
                        style={{
                          height: 32,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: "1px solid #e7ebf3",
                          background: "#fff",
                          color: "#6b7280",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        무시
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            marginTop: 20,
            padding: "20px 0",
          }}
        >
          <button
            disabled={currentPage === 1}
            onClick={() => {
              setCurrentPage((p) => Math.max(1, p - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              border: "1px solid #e7ebf3",
              background: "#fff",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              opacity: currentPage === 1 ? 0.5 : 1,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            이전
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => {
                  setCurrentPage(num);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: num === currentPage ? 0 : "1px solid #e7ebf3",
                  background: num === currentPage ? "#111827" : "#fff",
                  color: num === currentPage ? "#fff" : "#374151",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {num}
              </button>
            ))}
          </div>
          <button
            disabled={currentPage === totalPages}
            onClick={() => {
              setCurrentPage((p) => Math.min(totalPages, p + 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              border: "1px solid #e7ebf3",
              background: "#fff",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              opacity: currentPage === totalPages ? 0.5 : 1,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}