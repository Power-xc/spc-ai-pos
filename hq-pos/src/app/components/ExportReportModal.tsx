"use client";

import type { CSSProperties } from "react";

interface ExportReportModalProps {
  onClose: () => void;
  onExportPdf: () => void;
  onExportKakao: () => void;
}

export function ExportReportModal({ onClose, onExportPdf, onExportKakao }: ExportReportModalProps) {
  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(15,23,42,0.45)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  };

  const modalStyle: CSSProperties = {
    width: "100%",
    maxWidth: 360,
    background: "#fff",
    borderRadius: 28,
    boxShadow: "0 24px 60px rgba(15,23,42,0.25)",
    overflow: "hidden",
    animation: "modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  const buttonStyle = (isKakao = false): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "18px 20px",
    borderRadius: 20,
    border: "1px solid #e7ebf3",
    background: isKakao ? "#FEE500" : "#fff",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
    marginTop: 12,
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 24px 12px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#111827" }}>리포트 내보내기</h2>
            <button onClick={onClose} style={{ background: "none", border: 0, fontSize: 24, cursor: "pointer", color: "#9ca3af" }}>×</button>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>내보낼 형식을 선택해 주세요</p>
        </div>

        <div style={{ padding: 20 }}>
          <button style={buttonStyle()} onClick={onExportPdf}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#feecec", color: "#dc2626", display: "grid", placeItems: "center", fontSize: 20 }}>PDF</div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#111827" }}>PDF로 내보내기</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>문서 파일로 저장합니다</p>
            </div>
          </button>

          <button style={buttonStyle(true)} onClick={onExportKakao}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#3c1e1e20", color: "#3c1e1e", display: "grid", placeItems: "center", fontSize: 20 }}>💬</div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#3c1e1e" }}>카카오톡으로 내보내기</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#3c1e1e90" }}>모바일로 간편하게 전송합니다</p>
            </div>
          </button>
        </div>

        <div style={{ padding: "16px 20px", background: "#f8fafc", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>
            AI 리포트는 최근 24시간 데이터를 기준으로 생성됩니다.
          </p>
        </div>
      </div>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
