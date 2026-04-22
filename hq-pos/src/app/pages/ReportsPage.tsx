import { useState } from "react";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, formatKRW, getFilterLabel } from "../../lib/hqData";

const reportTemplates = [
  { id: "HQ-RPT-001", title: "전체 점포 일일 영업 보고서", type: "일간", date: "2026-03-10", status: "완료", summary: "33개 점포 일일 매출 종합 · 전일/전주 대비 분석 · 위험 점포 인사이트 포함" },
  { id: "HQ-RPT-002", title: "주간 점포별 매출 비교 리포트", type: "주간", date: "2026-03-04 ~ 2026-03-10", status: "완료", summary: "점포 간 매출 편차 분석 · 상위/하위 점포 심층 분석 · 지역별 트렌드" },
  { id: "HQ-RPT-003", title: "월간 종합 운영 보고서", type: "월간", date: "2026-02-01 ~ 2026-02-28", status: "완료", summary: "월 매출 추이 · 재고 회전율 · 캠페인 성과 · 점포 운영 효율 분석" },
  { id: "HQ-RPT-004", title: "캠페인 성과 분석 리포트", type: "특별", date: "2026-03-01 ~ 2026-03-10", status: "완료", summary: "캠페인 참여 점포 성과 비교 · 매출 기여도 · ROI 분석" },
  { id: "HQ-RPT-005", title: "재고 위험 점포 종합 분석", type: "특별", date: "2026-03-10", status: "완료", summary: "재고 소진 위험 품목 TOP 10 · 위험 점포별 대응 방안 · 발주 권장" },
  { id: "HQ-RPT-006", title: "오늘 일일 HQ 종합 리포트", type: "일간", date: "2026-03-10", status: "생성 중", summary: "AI가 전체 점포 데이터를 분석 중입니다. 완료 시 자동 알림" },
];

const typeColor: Record<string, { color: string; bg: string }> = {
  일간: { color: "#2563eb", bg: "#eaf2ff" },
  주간: { color: "#7c3aed", bg: "#f5f3ff" },
  월간: { color: "#ff6e00", bg: "#fff3e8" },
  특별: { color: "#16a34a", bg: "#ebf9ef" },
};

const statCards = [
  { label: "전체 점포 매출", value: "—", sub: "전일 대비", color: "#ff6e00" },
  { label: "점포 평균 매출", value: "—", sub: "33개 점포 기준", color: "#2563eb" },
  { label: "캠페인 참여율", value: "76%", sub: "25/33개 점포", color: "#7c3aed" },
  { label: "재고 위험 점포", value: "—", sub: "즉시 대응 필요", color: "#dc2626" },
];

export function ReportsPage() {
  const { filter } = useStoreFilter();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const filterLabel = getFilterLabel(filter);
  const activeStores = STORE_LIST.filter((s) => s.annual_sales != null);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {statCards.map((card) => (
          <div key={card.label} style={{ padding: 16, borderRadius: 16, background: "#fff", border: "1px solid #e7ebf3", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: card.color, letterSpacing: "-0.03em" }}>{card.value}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: 24, background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)", color: "#fff", borderRadius: 20, border: "1px solid #e7ebf3", boxShadow: "0 10px 30px rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>HQ 영업 보고서 자동 생성</h3>
            <p style={{ margin: 0, color: "rgba(255,255,255,.72)", fontSize: 13, lineHeight: 1.6 }}>
              {filterLabel} 데이터를 자동 분석하여 일·주·월 단위의 영업 보고서를 생성합니다.
              채널/결제/캠페인 성과 분석이 포함됩니다.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              height: 48, padding: "0 24px", borderRadius: 999, border: 0,
              background: generating ? "rgba(255,255,255,.2)" : "linear-gradient(135deg, #ff6e00, #e91e8c)",
              color: "#fff", fontWeight: 800, cursor: generating ? "not-allowed" : "pointer", fontSize: 15,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {generating ? "⏳ 생성 중..." : generated ? "✅ 다시 생성" : "⚡ 리포트 생성"}
          </button>
        </div>
        {generated && (
          <div style={{ marginTop: 16, padding: 14, background: "rgba(255,255,255,.08)", borderRadius: 14, border: "1px solid rgba(255,255,255,.15)", fontSize: 13, color: "rgba(255,255,255,.9)", lineHeight: 1.6 }}>
            ✅ {filterLabel} 일일 영업 보고서가 생성되었습니다. 주요 발견사항: 전일 대비 매출 변동, 위험 점포 {activeStores.filter((s) => s.campaign_share > 0.05).length}개 식별, 캠페인 참여 점포 평균 성과 분석 완료.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>리포트 목록</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>일·주·월·특별 분석 리포트</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reportTemplates.map((r) => {
              const tc = typeColor[r.type];
              return (
                <div key={r.id} style={{ padding: "16px 18px", borderRadius: 14, border: "1px solid #e7ebf3", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: tc.bg, display: "grid", placeItems: "center", fontSize: 20, flexShrink: 0 }}>📄</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, color: tc.color, background: tc.bg }}>{r.type}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{r.date}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{r.summary}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, color: r.status === "완료" ? "#16a34a" : "#d97706", background: r.status === "완료" ? "#ebf9ef" : "#fff7e8" }}>
                      {r.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>채널/결제 성과</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "오프라인 매장", value: "72%", sub: "전체 매출 기준" },
                { label: "배달 채널", value: "28%", sub: "배민/요기요/쿠팡이츠" },
                { label: "신용/체크카드", value: "70%", sub: "결제 수단 비중" },
                { label: "모바일 결제", value: "18%", sub: "증가 추세" },
                { label: "캠페인 매출 기여", value: "3.8%", sub: "전체 점포 평균" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 10, color: "#9ca3af" }}>{item.sub}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>캠페인 성과 TOP 점포</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STORE_LIST
                .filter((s) => s.campaign_share > 0)
                .sort((a, b) => b.campaign_share - a.campaign_share)
                .slice(0, 5)
                .map((s, i) => (
                  <div key={s.store_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", width: 20 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", flex: 1 }}>{s.store_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#ff6e00" }}>{(s.campaign_share * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>
              캠페인 매출 비중 기준 · 프로모션 전용 데이터가 없어 캠페인 성과로 해석
            </p>
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>점포 비교 통계</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9ca3af" }}>연간 매출 기준 상/하위 점포 비교 · 지역별 분포</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>최고 매출 점포</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
              {STORE_LIST.filter((s) => s.annual_sales).sort((a, b) => (b.annual_sales || 0) - (a.annual_sales || 0))[0]?.store_name || "—"}
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>
              {formatKRW(STORE_LIST.filter((s) => s.annual_sales).sort((a, b) => (b.annual_sales || 0) - (a.annual_sales || 0))[0]?.annual_sales || 0)}
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 14, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>점포 평균 매출</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
              {formatKRW(STORE_LIST.filter((s) => s.annual_sales).reduce((sum, s) => sum + (s.annual_sales || 0), 0) / STORE_LIST.filter((s) => s.annual_sales).length)}
            </div>
            <div style={{ fontSize: 12, color: "#2563eb", marginTop: 4 }}>
              {STORE_LIST.filter((s) => s.annual_sales).length}개 점포 기준
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 14, background: "#fef2f2", border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>최저 매출 점포</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
              {STORE_LIST.filter((s) => s.annual_sales).sort((a, b) => (a.annual_sales || 0) - (b.annual_sales || 0))[0]?.store_name || "—"}
            </div>
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
              {formatKRW(STORE_LIST.filter((s) => s.annual_sales).sort((a, b) => (a.annual_sales || 0) - (b.annual_sales || 0))[0]?.annual_sales || 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}