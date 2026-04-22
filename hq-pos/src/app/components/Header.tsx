import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { ExportReportModal } from "./ExportReportModal";

interface HeaderProps {
  title: string;
  sub: string;
  chatOpen?: boolean;
  onToggleChat?: () => void;
}

export function Header({ title, sub, chatOpen, onToggleChat }: HeaderProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Detect if navigated from POS Mockup
  const [fromMockup, setFromMockup] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "pos_mockup") {
      setFromMockup(true);
    }
  }, []);

  const handleGenerateReport = async () => {
    if (!reportRef.current) return;
    setIsExportModalOpen(false);
    setIsGenerating(true);
/* ... (remaining logic of handleGenerateReport) ... */

    try {
      // Ensure any dynamic content is rendered
      await new Promise((resolve) => setTimeout(resolve, 500));

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`AI_Report_${new Date().toISOString().split("T")[0]}.pdf`);

      setIsGenerating(false);
      alert("✅ 한글 지원 AI 리포트가 성공적으로 생성되어 다운로드되었습니다.");
    } catch (error) {
      console.error("PDF Generation Error:", error);
      setIsGenerating(false);
      alert("❌ 리포트 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <>
      <header
        style={{
          gridArea: "header",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid #e7ebf3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: 64,
          minWidth: 0,
        }}
      >
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: "linear-gradient(135deg, #1e3a5f, #2563eb)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 900,
              boxShadow: "0 10px 20px rgba(233,30,140,0.18)",
              fontSize: 14,
              flexShrink: 0,
              letterSpacing: "-0.5px",
            }}
          >
            HQ
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: 1.1,
                color: "#111827",
                fontWeight: 800,
              }}
            >
              {title}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
              {sub && (
                <p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
                  {sub}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
{["2026-03-10", "33개 점포"].map((label) => (
            <button
              key={label}
              style={{
                height: 42,
                borderRadius: 999,
                padding: "0 16px",
                border: "1px solid #e7ebf3",
                background: "#f8fafc",
                color: "#111827",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {label}
            </button>
          ))}

          <button
            onClick={onToggleChat}
            style={{
              height: 42,
              borderRadius: 999,
              padding: "0 16px",
              border: "1px solid #e7ebf3",
              background: chatOpen ? "rgba(255,110,0,0.08)" : "#f8fafc",
              color: chatOpen ? "#ff6e00" : "#111827",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {chatOpen ? "AI 닫기" : "AI 에이전트 Fox"}
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            disabled={isGenerating}
            style={{
              height: 42,
              borderRadius: 999,
              padding: "0 16px",
              border: 0,
              background: isGenerating
                ? "#9ca3af"
                : "linear-gradient(135deg, #ff6e00, #e91e8c)",
              color: "#fff",
              fontWeight: 700,
              cursor: isGenerating ? "not-allowed" : "pointer",
              fontSize: 14,
              transition: "all 0.3s",
              boxShadow: isGenerating
                ? "none"
                : "0 10px 20px rgba(233,30,140,0.18)",
              animation: isGenerating ? "pulse 1.5s infinite" : "none",
            }}
          >
            {isGenerating ? "⏳ 리포트 생성 중..." : "AI 리포트 생성"}
          </button>
        </div>
      </header>

      {isExportModalOpen && (
        <ExportReportModal
          onClose={() => setIsExportModalOpen(false)}
          onExportPdf={handleGenerateReport}
          onExportKakao={() => {
            alert("준비 중인 기능입니다. 카카오톡 메시지 API 연동이 필요합니다.");
            setIsExportModalOpen(false);
          }}
        />
      )}

      {/* Hidden Report Template for PDF Export */}
      <div style={{ position: "absolute", left: -9999, top: -9999 }}>
        <div
          ref={reportRef}
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "20mm",
            background: "#fff",
            color: "#111827",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: "2px solid #ff6e00",
              paddingBottom: 10,
              marginBottom: 30,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>
                AI 인사이트 리포트
              </h1>
              <p style={{ margin: "5px 0 0", color: "#6b7280" }}>
                실시간 운영 데이터 기반 AI 분석 요약
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>BR 코리아 본사 · 전체 33개 점포</p>
              <p style={{ margin: 0, color: "#9ca3af", fontSize: 13 }}>
                {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 30 }}>
            <h2 style={{ fontSize: 20, marginBottom: 15, color: "#111827" }}>
              📊 오늘의 운영 요약
            </h2>
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#ef4444" }}>● 전체 점포 매출 동향:</strong>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>
                  전일 대비 -2.9% 매출 감소. 33개 점포 중 31개 점포가 재고 위험 상태이며,
                  포항시01(-48.5%), 영등포구01(-27.8%) 등 일부 점포 매출 급감.
                </p>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#f59e0b" }}>● 재고 위험 점포 다수:</strong>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>
                  31개 점포가 재고 위험(HIGH) 상태. 초코파우더, 먼치킨류 등 주력 상품의
                  평균 재고가 마이너스 수치를 기록 중입니다.
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 30 }}>
            <h2 style={{ fontSize: 20, marginBottom: 15, color: "#111827" }}>
              💡 AI 권장 전략
            </h2>
            <div style={{ display: "grid", gap: 15 }}>
              {[
                {
                  title: "오후 시간대 프로모션 재배치",
                  desc: "전체 점포 오후 14:00~16:00 구간 매출 하락 완화를 위해 타임세일 프로모션을 권장합니다.",
                },
                {
                  title: "재고 위험 점포 일괄 발주",
                  desc: "31개 위험 점포의 주력 상품(초코파우더, 먼치킨류)에 대해 긴급 발주 승인이 대기 중입니다.",
                },
                {
                  title: "캠페인 미참여 점포 안내",
                  desc: "캠페인 매출 비중 0%인 8개 점포에 참여 안내를 발송하여 매출 기여도를 높이세요.",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 15,
                    borderRadius: 10,
                    borderLeft: "4px solid #ff6e00",
                    background: "#fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    {item.title}
                  </strong>
                  <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              paddingTop: 20,
              borderTop: "1px solid #e2e8f0",
              fontSize: 12,
              color: "#9ca3af",
              textAlign: "center",
            }}
          >
            본 리포트는 HQ Fox AI에 의해 자동 생성되었습니다.
          </div>
        </div>
      </div>
    </>
  );
}
