import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getAiBriefing } from "../../lib/api";
import type { AiBriefing, BriefingIssue, BriefingIssueSeverity } from "../../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  frameRef?: React.RefObject<HTMLDivElement>;
  onNavigate?: (route: string) => void;
  selectedMenu?: string;
}

const SEVERITY_STYLE: Record<BriefingIssueSeverity, { bg: string; color: string }> = {
  긴급: { bg: "#feecec", color: "#ff522c" },
  주의: { bg: "#eaf6ff", color: "#3aaedd" },
  확인: { bg: "#f0f0f0", color: "#888" },
};

function IssueCard({
  issue,
  checked,
  onCheck,
  defaultOpen,
  onNavigate,
}: {
  issue: BriefingIssue;
  checked: boolean;
  onCheck: () => void;
  defaultOpen: boolean;
  onNavigate?: (route: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const s = SEVERITY_STYLE[issue.severity];

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: `1px solid ${expanded ? s.color + "44" : "#f0f1f3"}` }}
    >
      <div
        className="flex items-center gap-[10px] px-[14px] py-[11px] cursor-pointer bg-white"
        onClick={() => setExpanded((v) => !v)}
      >
        <div
          onClick={(e) => { e.stopPropagation(); onCheck(); }}
          className="w-[16px] h-[16px] rounded-[4px] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          style={{
            border: `1.5px solid ${checked ? "#3faf60" : "#d0d0d0"}`,
            backgroundColor: checked ? "#3faf60" : "#fff",
          }}
        >
          {checked && (
            <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
              <path d="M1 3.5L3 5.5L7 1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <span
          className="px-[6px] py-[2px] rounded-full text-[8px] font-bold shrink-0"
          style={{ backgroundColor: s.bg, color: s.color }}
        >
          {issue.severity}
        </span>

        <p className="flex-1 font-bold text-[11px] text-[#222] leading-[16px]">
          {issue.title}
        </p>

        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className="shrink-0 transition-transform duration-200"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M1.5 3.5L5 6.5L8.5 3.5" stroke="#bbb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {expanded && (
        <div className="px-[14px] pb-[12px] pt-[10px] flex flex-col gap-[10px] bg-white" style={{ borderTop: "1px solid #f0f1f3" }}>
          <p className="text-[11px] text-[#888] leading-[16px]">{issue.detail}</p>
          <div className="flex items-center justify-between">
            <p className="text-[8px] text-[#aaa]">감지 시각: {issue.detectedAt}</p>
            <button
              className="px-[10px] py-[4px] rounded-full text-[9px] font-bold cursor-pointer text-white"
              style={{ backgroundColor: s.color }}
              onClick={() => onNavigate?.(issue.route)}
            >
              {issue.actionLabel} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiBriefingModal({ isOpen, onClose, frameRef, onNavigate, selectedMenu }: Props) {
  const [briefing, setBriefing] = useState<AiBriefing | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [frameRect, setFrameRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isOpen) {
      getAiBriefing(selectedMenu).then(setBriefing);
      if (frameRef?.current) {
        setFrameRect(frameRef.current.getBoundingClientRect());
      }
    }
  }, [isOpen, frameRef, selectedMenu]);

  if (!isOpen) return null;

  const doneCount = Object.values(checked).filter(Boolean).length;
  const totalCount = briefing?.issues.length ?? 0;
  const toggleCheck = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleNavigate = (route: string) => {
    onNavigate?.(route);
    onClose();
  };

  const overlayStyle: React.CSSProperties = frameRect
    ? { position: "fixed", top: frameRect.top, left: frameRect.left, width: frameRect.width, height: frameRect.height }
    : { position: "fixed", inset: 0 };

  return createPortal(
    <div
      className="z-[60] flex items-center justify-center"
      style={{ ...overlayStyle, backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-[20px] overflow-hidden"
        style={{
          width: "380px",
          maxHeight: "680px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          backgroundColor: "#f1f1f1",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-[18px] py-[16px]"
          style={{ backgroundColor: "#30343b" }}
        >
          <div className="flex items-center gap-[8px]">
            <svg width="13" height="12" viewBox="0 0 13.5 12" fill="none">
              <path
                d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
                fill="#e8f1ea"
              />
            </svg>
            <p className="font-bold text-[13px] text-white leading-[19px]">오늘의 AI 브리핑</p>
          </div>
          <button
            onClick={onClose}
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1 1l7 7M8 1L1 8" stroke="#aaa" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* AI 종합 요약 */}
        <div className="bg-white mx-[14px] mt-[14px] rounded-[16px] px-[14px] py-[12px] flex flex-col gap-[8px]">
          <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
            <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            AI 종합 요약
          </p>
          {briefing?.summaryPoints.map((point, i) => (
            <div key={i} className="flex items-start gap-[8px]">
              <div
                className="w-[17px] h-[17px] rounded-full flex items-center justify-center shrink-0 mt-[1px]"
                style={{ backgroundColor: "#3aaedd" }}
              >
                <span className="text-[9px] font-bold text-white">{i + 1}</span>
              </div>
              <p className="text-[11px] text-[#555] leading-[16px]">{point}</p>
            </div>
          ))}
        </div>

        {/* 이슈 상세 */}
        <div className="flex flex-col overflow-y-auto">
          <div className="px-[14px] pt-[14px] pb-[8px] flex items-center gap-[6px]">
            <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
              <span className="w-[7px] h-[4px] bg-[#ff522c] rounded-[30px]" />
              이슈 상세
            </p>
            <span className="text-[9px] text-[#888]">({totalCount}건)</span>
          </div>
          <div className="flex flex-col gap-[8px] px-[14px] pb-[14px]">
            {briefing?.issues.map((issue, i) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                checked={!!checked[issue.id]}
                onCheck={() => toggleCheck(issue.id)}
                defaultOpen={i === 0}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div
          className="bg-white px-[16px] py-[10px] flex items-center"
          style={{ borderTop: "1px solid #f0f1f3" }}
        >
          <p className="text-[9px] text-[#888]">
            처리 완료: <span className="text-[#222] font-bold">{doneCount}</span> / {totalCount}건
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
