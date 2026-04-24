import { useState, useEffect } from "react";
import { getAiInsight } from "../../lib/api";
import type { AiInsight } from "../../types";
import icoStar from "../../assets/top_star.svg";

interface AiInsightCardProps {
  cardLeft: number;
  cardWidth: number;
  setSelectedMenu: (menu: string) => void;
  onOpenBriefing: () => void;
}

// 에이전트 이름은 고정값 — API에서 받지 않음
const AGENT_META: Record<string, string> = {
  "agent-001": "생산관리 에이전트",
  "agent-002": "주문관리 에이전트",
  "agent-003": "매출관리 에이전트",
};

export default function AiInsightCard({
  cardLeft,
  cardWidth,
  setSelectedMenu,
  onOpenBriefing,
}: AiInsightCardProps) {
  const [insight, setInsight] = useState<AiInsight | null>(null);

  useEffect(() => {
    getAiInsight().then(setInsight);
  }, []);

  if (!insight)
    return (
      <div
        className="absolute border border-[#ebebeb] border-solid content-stretch flex flex-col h-[119.673px] items-start pl-[15px] pr-[15px] py-[16px] rounded-[20px] top-[77.51px] transition-all duration-300"
        style={{
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
          background: "linear-gradient(89deg, #008EE0 1.2%, #38A6D3 105.18%)",
        }}
      >
        <div className="flex flex-col gap-[13px] w-full animate-pulse">
          <div className="h-[12px] bg-white/30 rounded w-[200px]" />
          <div className="h-[13px] bg-white/30 rounded w-[280px]" />
          <div className="h-[12px] bg-white/20 rounded w-[100px]" />
        </div>
      </div>
    );

  return (
    <div
      className="absolute border border-[#ebebeb] border-solid content-stretch flex flex-col h-[119.673px] items-start pl-[15px] pr-[15px] py-[16px] rounded-[20px] top-[77.51px] transition-all duration-300 cursor-pointer"
      style={{
        left: `${cardLeft}px`,
        width: `${cardWidth}px`,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E"), linear-gradient(89deg, #008EE0 1.2%, #38A6D3 105.18%)`,
      }}
      onClick={onOpenBriefing}
    >
      <div className="content-stretch flex flex-col gap-[13px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
          <div className="content-stretch flex flex-col gap-[6px] items-start relative shrink-0 w-full">
            <div className="content-stretch flex gap-[4px] items-center relative shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="12"
                viewBox="0 0 14 12"
                fill="none"
              >
                <path
                  d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
                  fill="#E8F1EA"
                />
              </svg>
              <p className="[font-weight:700] leading-[21px] not-italic relative shrink-0 text-white text-[12px] whitespace-nowrap">
                PIP AI
                <span className="[font-weight:200] leading-[21px] text-[12px] text-white whitespace-nowrap ml-2">
                  데이터 근거 생산 + 매출 에이전트
                </span>
              </p>
            </div>
            <img src={icoStar} alt="" className="absolute right-0 top-0" />
            <div className="content-stretch flex items-center justify-center relative shrink-0 w-full">
              <p className="flex-[1_0_0] leading-[0] min-h-px min-w-px not-italic relative text-white text-[0px]">
                <span className="leading-[21px] text-[13px]">
                  {insight.message}
                </span>
                <span className="[font-weight:600] leading-[21px] text-[13px]">
                  {insight.boldPart}
                </span>
                <span className="leading-[21px] text-[13px]">
                  할 것으로 예측됩니다.
                </span>
              </p>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-1px_0_0_0] bg-[rgba(255,255,255,0.3)]" />
          </div>
        </div>
        <div className="gap-x-[29px] gap-y-[29px] grid grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[repeat(1,fit-content(100%))] relative shrink-0 w-full">
          {insight.agents.map((agent) => (
            <div
              key={agent.id}
              className="content-stretch flex gap-[8px] items-center justify-self-start relative self-start shrink-0"
            >
              <div className="content-stretch flex gap-[8px] items-center relative shrink-0">
                <div className="bg-white h-[4.729px] rounded-[30px] shrink-0 w-[8.972px]" />
                <p className="[font-weight:500] leading-[21px] not-italic relative shrink-0 text-white text-[12px] whitespace-nowrap">
                  {AGENT_META[agent.id]}
                </p>
              </div>
              <div className="content-stretch flex items-center justify-center relative shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const targetMenu =
                      agent.id === "agent-001"
                        ? "생산관리"
                        : agent.id === "agent-002"
                          ? "발주 관리"
                          : "AI 실시간 현황";
                    setSelectedMenu(targetMenu);
                  }}
                  className="bg-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.25)] transition-colors content-stretch flex items-center justify-center px-[8px] relative rounded-[10px] shrink-0 cursor-pointer"
                >
                  <p className="[font-weight:500] leading-[21px] not-italic relative shrink-0 text-white text-[10px] whitespace-nowrap">
                    바로가기
                  </p>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
