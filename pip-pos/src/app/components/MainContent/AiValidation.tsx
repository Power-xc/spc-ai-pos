import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import {
  getHypothesisCards,
  getAgentLogs,
  getAiQualityDimensions,
} from "../../../lib/api";
import type {
  HypothesisCard,
  AgentLogItem,
  AiQualityDimension,
  HypothesisTag,
} from "../../../types";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "../../../lib/recharts";

function RadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { subject, value } = payload[0].payload;
  return (
    <div
      className="flex flex-col gap-[2px] rounded-[10px] px-[10px] py-[8px]"
      style={{
        background: "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <p className="text-[9px] text-white font-bold leading-[14px]">
        {subject}
      </p>
      <p className="text-[9px] text-white leading-[14px]">AI 품질 : {value}</p>
    </div>
  );
}

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

// ── 태그 스타일 ──────────────────────────────────────────────
const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  생산관리: { bg: "#3BB1E1", color: "#fff" },
  운영관리: { bg: "#3faf60", color: "#fff" },
  제품분석: { bg: "#fed400", color: "#000" },
  재고분석: { bg: "#ff8a4c", color: "#fff" },
  프로모션: { bg: "#e06090", color: "#fff" },
  검증완료: { bg: "#222", color: "#fff" },
  검증중: { bg: "#222", color: "#fff" },
  반증됨: { bg: "#ff522c", color: "#fff" },
};

const FALLBACK_TAG_STYLE = { bg: "#888", color: "#fff" };

function getTagStyle(tag: string): { bg: string; color: string } {
  return TAG_STYLES[tag] ?? FALLBACK_TAG_STYLE;
}

// ── 신뢰도 → 색상 ────────────────────────────────────────────
function confidenceColor(v: number): string {
  if (v >= 80) return "#3faf60";
  if (v >= 60) return "#3aaedd";
  return "#ff522c";
}

// ── Agent 로그 카테고리 → 색상/아이콘 ───────────────────────
const LOG_CAT: Record<string, { color: string }> = {
  생산관리: { color: "#3aaedd" },
  운영관리: { color: "#3faf60" },
  제품분석: { color: "#ff522c" },
};

const FALLBACK_LOG_CAT = { color: "#888" };

export default function AiValidation({
  isAiPanelOpen,
  isSidebarOpen,
}: MenuProps) {
  const [cards, setCards] = useState<HypothesisCard[]>([]);
  const [logs, setLogs] = useState<AgentLogItem[]>([]);
  const [quality, setQuality] = useState<AiQualityDimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getHypothesisCards(),
      getAgentLogs(),
      getAiQualityDimensions(),
    ])
      .then(([nextCards, nextLogs, nextQuality]) => {
        setCards(nextCards);
        setLogs(nextLogs);
        setQuality(nextQuality);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      <div className="flex flex-col gap-[14px]">
        {/* ── 가설 검증 현황 ── */}
        <div className="bg-white rounded-[20px] px-[16px] pt-[14px] pb-[14px] flex flex-col gap-[12px]">
          <div>
            <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
              <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]"></span>
              가설 검증 현황
            </p>
            <p className="text-[9px] text-[#888] leading-[14px]">
              실데이터와 파생 점수를 함께 사용해 오늘 기준 검증 우선순위를 정리합니다.
            </p>
          </div>

          {loading && (
            <div className="flex flex-col gap-[10px]">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`validation-skeleton-${index}`}
                  className="border border-[#f0f1f3] rounded-[14px] px-[14px] py-[12px] flex gap-[14px] items-start animate-pulse"
                >
                  <div className="flex-1 flex flex-col gap-[8px]">
                    <div className="flex gap-[4px]">
                      <div className="h-[18px] w-[42px] rounded-full bg-[#eef0f2]" />
                      <div className="h-[18px] w-[42px] rounded-full bg-[#eef0f2]" />
                      <div className="h-[12px] w-[48px] rounded bg-[#f2f3f5]" />
                    </div>
                    <div className="h-[14px] w-[80%] rounded bg-[#eef0f2]" />
                    <div className="h-[30px] w-full rounded bg-[#f5f6f8]" />
                    <div className="h-[28px] w-full rounded-[8px] bg-[#eef8f2]" />
                  </div>
                  <div className="flex flex-col items-center gap-[6px] shrink-0 w-[40px]">
                    <div className="h-[18px] w-[28px] rounded bg-[#eef0f2]" />
                    <div className="w-[6px] h-[52px] rounded-full bg-[#eef0f2]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && cards.length > 0 && (
            <div className="flex flex-col gap-[10px]">
            {cards.map((card) => {
              const color = confidenceColor(card.confidence);
              const isDisproven = card.tags.includes("반증됨");
              const gaugeColor = isDisproven ? "#ff522c" : color;
              const insightBg = isDisproven
                ? "#fff4f1"
                : card.confidence >= 80
                  ? "#f4fbf6"
                  : "#eef8ff";
              return (
                <div
                  key={card.id}
                  className="border border-[#f0f1f3] rounded-[14px] px-[14px] py-[12px] flex gap-[14px] items-start"
                  style={{
                    boxShadow: card.confidence >= 80 ? "inset 0 0 0 1px rgba(63, 175, 96, 0.12)" : undefined,
                  }}
                >
                  {/* 좌측: 태그 + 텍스트 + 서브아이템 */}
                  <div className="flex-1 flex flex-col gap-[6px]">
                    {/* 태그 + 날짜 */}
                    <div className="flex items-center gap-[4px] flex-wrap">
                      {[...card.tags]
                        .sort((a, b) => {
                          const STATUS = ["검증완료", "검증중", "반증됨"];
                          const aIsStatus = STATUS.includes(a);
                          const bIsStatus = STATUS.includes(b);
                          if (aIsStatus && !bIsStatus) return -1;
                          if (!aIsStatus && bIsStatus) return 1;
                          return 0;
                        })
                        .map((tag) => (
                          <span
                            key={tag}
                            className="px-[6px] py-[2px] rounded-full text-[8px] font-bold"
                            style={{
                              background: getTagStyle(tag).bg,
                              color: getTagStyle(tag).color,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      <span className="text-[8px] text-[#aaa] ml-[2px]">
                        {card.date}
                      </span>
                    </div>

                    {/* 제목 */}
                    <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                      {card.title}
                    </p>

                    {/* 상세 */}
                    <p className="text-[9px] text-[#888] leading-[14px]">
                      {card.detail}
                    </p>

                    {/* AI 해결 방안 */}
                    <div
                      className="flex items-center gap-[6px] mt-[2px] rounded-[8px] px-[8px] py-[6px]"
                      style={{ backgroundColor: insightBg }}
                    >
                      <svg
                        className="shrink-0"
                        width="11"
                        height="10"
                        viewBox="0 0 13.5 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z" fill="black"/>
                      </svg>
                      <p className="text-[9px] text-[#222] leading-[14px]">
                        {card.subItem.label}
                      </p>
                    </div>
                  </div>

                  {/* 우측: 신뢰도 */}
                  <div className="flex flex-col items-center gap-[6px] shrink-0 w-[40px]">
                    <p
                      className="font-bold text-[16px] leading-none"
                      style={{ color: gaugeColor }}
                    >
                      {card.confidence}%
                    </p>
                    <div className="w-[6px] h-[52px] bg-[#f0f1f3] rounded-full overflow-hidden flex flex-col justify-end">
                      <div
                        className="w-full rounded-full transition-all duration-500"
                        style={{
                          height: `${card.confidence}%`,
                          backgroundColor: gaugeColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {!loading && cards.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#d8dbe0] bg-[#fafbfc] px-[14px] py-[20px]">
              <p className="text-[11px] font-bold text-[#555]">표시할 검증 카드가 없습니다.</p>
              <p className="mt-[4px] text-[9px] leading-[14px] text-[#888]">
                실데이터가 다시 들어오면 재고, 발주, 프로모션 근거를 기반으로 검증 카드를 자동 생성합니다.
              </p>
            </div>
          )}
        </div>

        {/* ── Row 2: 분석 품질 지표 + Agent 활동 로그 ── */}
        <div className="flex gap-[14px]">
          {/* AI 분석 품질 지표 */}
          <div className="w-[250px] bg-white rounded-[20px] px-[16px] pt-[14px] pb-[14px] flex flex-col gap-[8px]">
            <div>
              <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
                <span className="w-[7px] h-[4px] bg-[#3faf60] rounded-[30px]"></span>
                AI 분석 품질 지표
              </p>
              <p className="text-[9px] text-[#888] leading-[14px] tracking-tight">
                실데이터 지표와 파생 점수를 함께 사용한 오늘 기준 품질 상태
              </p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart
                data={quality}
                margin={{ top: 10, right: 20, left: 60, bottom: 10 }}
                style={{marginTop: "15px"}}
              >
                <PolarGrid stroke="#f0f1f3" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 8, fill: "#888" }}
                />
                <Tooltip content={<RadarTooltip />} />
                <Radar
                  dataKey="value"
                  stroke="#3faf60"
                  fill="#3faf60"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Agent 활동 로그 */}
          <div className="flex-1 bg-white rounded-[20px] px-[16px] pt-[14px] pb-[14px] flex flex-col gap-[10px] overflow-hidden">
            <div>
              <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
                <span className="w-[7px] h-[4px] bg-[#ff522c] rounded-[30px]"></span>
                Agent 활동 로그
              </p>
              <p className="text-[9px] text-[#888] leading-[14px]">
                현재 화면 데이터 기준으로 재구성한 Agent 분석/검증 활동 로그
              </p>
            </div>

            <div className="flex flex-col gap-[8px]">
              {!loading && logs.map((log) => {
                const cat = LOG_CAT[log.category] ?? FALLBACK_LOG_CAT;
                return (
                  <div key={log.id} className="flex gap-[8px] items-start">
                    {/* 시간 */}
                    <p className="text-[8px] text-[#000] shrink-0 w-[28px] pt-[1px]">
                      {log.time}
                    </p>

                    {/* 내용 */}
                    <div className="flex flex-col gap-[1px]">
                      <p className="font-bold text-[10px] leading-[14px] text-[#222]">
                        {log.title}
                      </p>
                      <p className="text-[8px] text-[#888] leading-[12px]">
                        {log.description}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!loading && logs.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#e1e4e8] bg-[#fafbfc] px-[12px] py-[14px]">
                  <p className="text-[10px] font-bold text-[#555]">활동 로그가 없습니다.</p>
                  <p className="mt-[4px] text-[9px] leading-[14px] text-[#888]">
                    검증 카드가 생성되면 같은 데이터 기준으로 활동 로그도 함께 구성됩니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ContentWrapper>
  );
}
