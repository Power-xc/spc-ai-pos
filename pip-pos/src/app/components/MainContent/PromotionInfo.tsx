import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import { getPromotions, getPromoPerformanceData, getCampaignDashboard } from "../../../lib/api";
import type { Promotion, SimulationData, PromotionChannel, PromoPerformanceData, CampaignDashboardResponse } from "../../../types";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "../../../lib/recharts";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

const CHANNEL_STYLE: Record<PromotionChannel, { bg: string; color: string }> = {
  배달: { bg: "#e8f4fd", color: "#3aaedd" },
  매장: { bg: "#f0f1f3", color: "#555" },
  이벤트: { bg: "#f0f1f3", color: "#555" },
  전체: { bg: "#f0f1f3", color: "#888" },
};

function PipIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 12 / 14)} viewBox="0 0 14 12" fill="none">
      <path
        d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── 시뮬레이션 뷰 ────────────────────────────────────────────
function SimulationView({
  promo,
  onBack,
}: {
  promo: Promotion;
  onBack: () => void;
}) {
  const sim: SimulationData = promo.simulation;
  const maxMetricA = Math.max(...sim.metrics.map((m) => m.valueA));
  const maxMetricB = Math.max(...sim.metrics.map((m) => m.valueB));
  const maxMetric = Math.max(maxMetricA, maxMetricB);

  function formatPct(value: number | null | undefined, signed = false) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    const sign = signed && value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* 헤더 */}
      <div className="bg-[#30343b] rounded-[20px] px-[20px] py-[16px] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-[6px] mb-[4px]">
            <span className="text-[#3aaedd]"><PipIcon size={13} /></span>
            <p className="font-bold text-[14px] text-white leading-[20px]">
              AI 에이전트 시뮬레이터
            </p>
          </div>
          <p className="text-[10px] text-[#aaa] leading-[16px]">
            현재 운영 방식과 AI 최적화 시나리오를 비교하여 예상 성과를 분석합니다.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-[5px] bg-white text-[#222] text-[10px] font-bold px-[10px] h-[28px] rounded-full shrink-0 cursor-pointer"
        >
          <svg width="5" height="9" viewBox="0 0 6 11" fill="none" style={{ transform: "rotate(180deg)" }}>
            <path d="M1 1L5 5.5L1 10" stroke="#222" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          목록
        </button>
      </div>

      {/* 시나리오 카드 */}
      <div className="flex gap-[10px]">
        {/* 현재 운영 */}
        <div className="flex-1 bg-white border border-[#f0f1f3] rounded-[14px] px-[14px] py-[12px] flex flex-col gap-[10px]">
          <div className="flex items-center gap-[8px]">
            <p className="font-bold text-[12px] text-[#222]">현재 운영</p>
          </div>
          <div className="flex flex-col gap-[6px]">
            {sim.scenarioRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between bg-[#f8f9fa] rounded-[8px] px-[10px] h-[32px]"
              >
                <p className="text-[10px] text-[#888]">{row.label}</p>
                <p className="text-[10px] font-bold text-[#333]">{row.valueA}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI 최적화 */}
        <div className="flex-1 bg-white border-[1.5px] border-[#3aaedd] rounded-[14px] px-[14px] py-[12px] flex flex-col gap-[10px] relative">
          <span className="absolute -top-[1px] right-[12px] bg-[#3aaedd] text-white text-[9px] font-bold px-[8px] py-[3px] rounded-b-[8px] leading-none">
            ✦ AI 최적화
          </span>
          <div className="flex items-center gap-[8px]">
            <span className="w-[24px] h-[24px] rounded-[8px] bg-[#e8f4fd] text-[#3aaedd] flex items-center justify-center shrink-0">
              <PipIcon size={13} />
            </span>
            <p className="font-bold text-[12px] text-[#222]">실적 기반 시뮬레이션</p>
          </div>
          <div className="flex flex-col gap-[6px]">
            {sim.scenarioRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between bg-[#f0f8fe] rounded-[8px] px-[10px] h-[32px]"
              >
                <p className="text-[10px] text-[#888]">{row.label}</p>
                <p className="text-[10px] font-bold" style={{ color: "#3aaedd" }}>
                  {row.valueB}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="flex gap-[10px]">
        {/* 레이더 차트 */}
        <div className="bg-white border border-[#f0f1f3] rounded-[14px] px-[14px] py-[12px] flex flex-col gap-[6px] w-[240px] shrink-0">
          <div>
            <p className="font-bold text-[11px] text-[#222] flex items-center gap-[6px]">
              <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
              시나리오 종합 비교
            </p>
            <p className="text-[9px] text-[#888]">6개 지표 레이더 차트</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={sim.radarData} margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
              <PolarGrid stroke="#f0f1f3" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "#888" }} />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border border-[#f0f1f3] rounded-[8px] px-[8px] py-[6px] text-[10px] shadow">
                      <p className="text-[#888]">현재: {payload[0]?.value}</p>
                      <p className="text-[#3aaedd]">AI: {payload[1]?.value}</p>
                    </div>
                  );
                }}
              />
              <Radar dataKey="A" stroke="#888" fill="#888" fillOpacity={0.12} strokeWidth={1.5} />
              <Radar dataKey="B" stroke="#3aaedd" fill="#3aaedd" fillOpacity={0.2} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-[12px] justify-center">
            <div className="flex items-center gap-[4px]">
              <span className="w-[10px] h-[3px] rounded-full bg-[#888]" />
              <span className="text-[9px] text-[#888]">현재</span>
            </div>
            <div className="flex items-center gap-[4px]">
              <span className="w-[10px] h-[3px] rounded-full bg-[#3aaedd]" />
              <span className="text-[9px] text-[#888]">AI 최적화</span>
            </div>
          </div>
        </div>

        {/* 핵심 지표 비교 */}
        <div className="flex-1 bg-white border border-[#f0f1f3] rounded-[14px] px-[14px] py-[12px] flex flex-col gap-[10px]">
          <div>
            <p className="font-bold text-[11px] text-[#222] flex items-center gap-[6px]">
              <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
              핵심 지표 비교
            </p>
            <p className="text-[9px] text-[#888]">예상 성과 수치 비교</p>
          </div>
          <div className="flex flex-col gap-[10px]">
            {sim.metrics.map((m) => {
              const barMaxA = (m.valueA / maxMetric) * 100;
              const barMaxB = (m.valueB / maxMetric) * 100;
              const positive = m.diffPct >= 0;
              const formatted = (v: number) =>
                m.unit === "원"
                  ? v.toLocaleString("ko-KR") + "원"
                  : v + m.unit;
              return (
                <div key={m.label} className="flex flex-col gap-[4px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-[#333]">{m.label}</p>
                    <p
                      className="text-[10px] font-bold"
                      style={{ color: positive ? "#3aaedd" : "#ff522c" }}
                    >
                      {formatPct(m.diffPct, true)}
                    </p>
                  </div>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[9px] text-[#222] font-bold shrink-0 w-[22px]">현재</span>
                    <div className="flex-1 h-[6px] bg-[#f0f1f3] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barMaxA}%`, backgroundColor: "#3aaedd" }}
                      />
                    </div>
                    <span className="text-[9px] text-[#888] w-[70px] text-right">{formatted(m.valueA)}</span>
                  </div>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[9px] text-[#222] font-bold shrink-0 w-[22px]">AI</span>
                    <div className="flex-1 h-[6px] bg-[#f0f1f3] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barMaxB}%`, background: "linear-gradient(92deg, #3faf60 0%, #3aaedd 120%)" }}
                      />
                    </div>
                    <span className="text-[9px] text-[#888] w-[70px] text-right">{formatted(m.valueB)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 결과 요약 */}
      <div className="bg-[#f0f8fe] border border-[#c8e8f7] rounded-[14px] px-[16px] py-[14px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-[8px]">
          <p className="font-bold text-[12px] text-[#222]">시뮬레이션 결과: AI 최적화 권장</p>
        </div>
        <p className="text-[10px] text-[#555] leading-[16px]">{sim.resultSummary}</p>
        <div className="flex items-center gap-[8px] mt-[2px]">
          <button className="h-[36px] px-[18px] rounded-full text-[11px] font-bold text-white bg-[#3aaedd] cursor-pointer">
            AI 시나리오 적용
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 프로모션 아이템 (리스트) ─────────────────────────────────
function PromotionItem({
  promo,
  onClick,
}: {
  promo: Promotion;
  onClick: () => void;
}) {
  const channelStyle = promo.channel ? CHANNEL_STYLE[promo.channel] : null;

  if (promo.status === "ai") {
    return (
      <div
        className="flex items-start justify-between gap-[10px] cursor-pointer py-[10px]"
        onClick={onClick}
      >
        <div className="flex flex-col gap-[6px] flex-1">
          <p className="font-bold text-[11px] leading-[16px]" style={{ color: "#3aaedd" }}>
            {promo.title}
          </p>
          <p className="text-[9px] text-[#888] leading-[14px]">{promo.description}</p>
          {promo.lunaMetric && (
            <div className="flex items-center gap-[5px]">
              <span className="flex items-center gap-[4px] bg-[#f0f1f3] px-[7px] py-[3px] rounded-full">
                <span className="text-[#222]"><PipIcon size={10} /></span>
                <span className="text-[9px] font-bold text-[#222]">PIP AI</span>
              </span>
              <span className="text-[9px] font-bold text-[#333]">
                {promo.lunaMetric}
              </span>
            </div>
          )}
        </div>
        <button
          className="shrink-0 h-[30px] px-[14px] rounded-full text-[10px] font-bold text-white bg-[#222] cursor-pointer flex items-center gap-[6px]"
        >
          적용
          <svg width="5" height="9" viewBox="0 0 6 11" fill="none">
            <path d="M1 1L5 5.5L1 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-start justify-between gap-[10px] cursor-pointer py-[10px]"
      onClick={onClick}
    >
      <div className="flex flex-col gap-[4px] flex-1">
        <p className="font-bold text-[11px] leading-[16px]" style={{ color: "#3aaedd" }}>
          {promo.title}
        </p>
        <p className="text-[9px] text-[#888] leading-[14px]">{promo.description}</p>
        <div className="flex items-center gap-[6px] mt-[2px]">
          {channelStyle && (
            <span
              className="text-[9px] font-bold px-[8px] py-[2px] rounded-full"
              style={{ backgroundColor: channelStyle.bg, color: channelStyle.color }}
            >
              {promo.channel}
            </span>
          )}
          {promo.periodLabel ? (
            <span className="text-[9px] text-[#aaa] leading-[14px]">{promo.periodLabel}</span>
          ) : promo.daysLeft != null ? (
            <span className="text-[9px] text-[#aaa] flex items-center gap-[3px]">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" stroke="#aaa" strokeWidth="1" />
                <path d="M5 3v2l1.5 1" stroke="#aaa" strokeWidth="1" strokeLinecap="round" />
              </svg>
              {promo.status === "active" ? `${promo.daysLeft}일 남음` : `${promo.daysLeft}일 후 시작`}
            </span>
          ) : null}
        </div>
        {!promo.periodLabel && (
          <p className="text-[9px] text-[#bbb] leading-[14px]">{promo.startDate} – {promo.endDate}</p>
        )}
      </div>
      <span
        className="shrink-0 text-[9px] font-bold px-[10px] py-[4px] rounded-full border mt-[2px]"
        style={
          promo.status === "active"
            ? { color: "#3aaedd", borderColor: "#3aaedd", backgroundColor: "#e8f4fd" }
            : promo.status === "ended"
            ? { color: "#999", borderColor: "#ddd", backgroundColor: "#f5f5f5" }
            : { color: "#888", borderColor: "#ccc", backgroundColor: "#f5f5f5" }
        }
      >
        {promo.statusLabel ?? (promo.status === "active" ? "진행중" : promo.status === "ended" ? "종료" : "예정")}
      </span>
    </div>
  );
}

function fmtKRW(value: number | null | undefined) {
  return `₩${Math.round(Number(value ?? 0)).toLocaleString("ko-KR")}`;
}

function PromotionToneBadge({
  tone,
}: {
  tone: Promotion["performanceTone"];
}) {
  const label =
    tone === "high"
      ? "성과 높음"
      : tone === "low"
        ? "보강 필요"
        : tone === "watch"
          ? "관찰"
          : "추천 시뮬";
  const style =
    tone === "high"
      ? { bg: "#edf7f0", color: "#2f8a51" }
      : tone === "low"
        ? { bg: "#fff4f1", color: "#ff522c" }
        : tone === "watch"
          ? { bg: "#f5f6f7", color: "#666" }
          : { bg: "#e8f4fd", color: "#3aaedd" };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[8px] py-[3px] text-[9px] font-bold leading-[14px]"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {label}
    </span>
  );
}

function PromotionCompareCard({
  promo,
  onClick,
}: {
  promo: Promotion;
  onClick: () => void;
}) {
  const currentSales = Number(promo.actualSales ?? 0);
  const projectedSales = Number(promo.estimatedSalesAfter ?? currentSales);
  const diffSales = Math.max(0, projectedSales - currentSales);
  const currentBills = Number(promo.actualBills ?? 0);
  const projectedBills = Number(promo.estimatedBillsAfter ?? currentBills);

  return (
    <button
      onClick={onClick}
      className="rounded-[14px] border border-[#f0f1f3] bg-white px-[12px] py-[12px] flex flex-col gap-[8px] text-left cursor-pointer"
    >
      <div className="flex items-start justify-between gap-[8px]">
        <div className="min-w-0">
          <p className="font-bold text-[11px] text-[#222] leading-[16px]">
            {promo.title}
          </p>
          <p className="text-[9px] text-[#888] leading-[14px] mt-[2px]">
            {promo.comparisonNote ?? "최근 집계 기준 추정"}
          </p>
        </div>
        <PromotionToneBadge tone={promo.performanceTone ?? "watch"} />
      </div>

      <div className="grid grid-cols-2 gap-[8px]">
        <div className="rounded-[10px] bg-[#f8f9fb] px-[10px] py-[8px]">
          <p className="text-[8px] text-[#aaa]">현재 집계</p>
          <p className="font-bold text-[11px] text-[#222] leading-[16px]">
            {fmtKRW(currentSales)}
          </p>
          <p className="text-[9px] text-[#666] leading-[14px]">
            반응 {Math.round(currentBills).toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="rounded-[10px] bg-[#f0f8fe] px-[10px] py-[8px]">
          <p className="text-[8px] text-[#7bb6d5]">적용 예상</p>
          <p className="font-bold text-[11px] text-[#3aaedd] leading-[16px]">
            {fmtKRW(projectedSales)}
          </p>
          <p className="text-[9px] text-[#555] leading-[14px]">
            반응 {Math.round(projectedBills).toLocaleString("ko-KR")}건
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-[8px]">
        <p className="text-[9px] text-[#555] leading-[14px]">
          예상 증분 매출 {fmtKRW(diffSales)}
        </p>
        <p className="text-[10px] font-bold text-[#3aaedd]">
          +{Math.round(Number(promo.estimatedLiftPct ?? 0))}%
        </p>
      </div>
    </button>
  );
}

// ── 메인 ────────────────────────────────────────────────────
export default function PromotionInfo({ isAiPanelOpen, isSidebarOpen }: MenuProps) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selected, setSelected] = useState<Promotion | null>(null);
  const [perfData, setPerfData] = useState<PromoPerformanceData | null>(null);
  const [campaignDashboard, setCampaignDashboard] = useState<CampaignDashboardResponse | null>(null);

  useEffect(() => {
    getPromotions().then(setPromotions);
    getPromoPerformanceData().then(setPerfData).catch(() => {});
    getCampaignDashboard().then(setCampaignDashboard).catch(() => {});
  }, []);

  const aiPromos = promotions.filter((p) => p.status === "ai");
  const activePromos = promotions.filter((p) => p.status === "active");
  const scheduledPromos = promotions.filter((p) => p.status === "scheduled");
  const highPerformers = activePromos.filter((p) => p.performanceTone === "high");
  const watchPromos = activePromos.filter((p) => p.performanceTone !== "high");
  const comparisonPromos = [...aiPromos, ...activePromos].slice(0, 4);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      {selected ? (
        <SimulationView promo={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="flex flex-col gap-[14px]">
          <div className="bg-[#30343b] rounded-[20px] px-[20px] py-[16px] flex flex-col gap-[12px]">
            <div>
              <p className="font-bold text-[14px] text-white leading-[20px]">
                프로모션 성과 및 적용 시뮬레이션
              </p>
              <p className="text-[10px] text-[#aaa] leading-[16px] mt-[2px]">
                최근 집계된 프로모션 성과를 프로모션 관점으로 묶어 적용 전후 차이를 함께 보여줍니다.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-[8px]">
              <div className="rounded-[12px] bg-[rgba(255,255,255,0.07)] px-[12px] py-[10px]">
                <p className="text-[9px] text-[#888]">시뮬레이션</p>
                <p className="font-bold text-[16px] text-white leading-none">{aiPromos.length}건</p>
              </div>
              <div className="rounded-[12px] bg-[rgba(255,255,255,0.07)] px-[12px] py-[10px]">
                <p className="text-[9px] text-[#888]">최근 집계 프로모션 실적</p>
                <p className="font-bold text-[16px] text-[#3aaedd] leading-none">{activePromos.length}건</p>
              </div>
              <div className="rounded-[12px] bg-[rgba(255,255,255,0.07)] px-[12px] py-[10px]">
                <p className="text-[9px] text-[#888]">성과 높은 프로모션</p>
                <p className="font-bold text-[16px] text-[#c0e183] leading-none">{highPerformers.length}건</p>
              </div>
              <div className="rounded-[12px] bg-[rgba(255,255,255,0.07)] px-[12px] py-[10px]">
                <p className="text-[9px] text-[#888]">관찰 필요</p>
                <p className="font-bold text-[16px] text-[#ff8a65] leading-none">{watchPromos.length}건</p>
              </div>
            </div>
          </div>

          {comparisonPromos.length > 0 && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
                  적용 전 / 적용 후 비교
                </p>
                <span className="text-[9px] text-[#aaa]">최근 집계 기준 추정</span>
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                {comparisonPromos.map((promo) => (
                  <PromotionCompareCard
                    key={`${promo.id}-compare`}
                    promo={promo}
                    onClick={() => setSelected(promo)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 캠페인 영향 보정 */}
          {campaignDashboard && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#f0ad4e] rounded-[30px]" />
                  캠페인 영향 보정
                </p>
                <span className="text-[9px] text-[#aaa]">{campaignDashboard.demo_date.replace(/-/g, ".")} {campaignDashboard.demo_time}</span>
              </div>
              {campaignDashboard.campaign_impact.campaigns.length === 0 ? (
                <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                  <p className="text-[9px] text-[#888] leading-[14px]">현재 적용 중인 캠페인이 없습니다</p>
                  <p className="text-[9px] text-[#aaa] mt-[4px] leading-[14px]" style={{ color: "#aaa" }}>{campaignDashboard.campaign_impact.note}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-[8px] mb-[10px]">
                    <div className="bg-[#f0f8fe] rounded-[12px] px-[10px] py-[8px]">
                      <p className="text-[8px] text-[#888]">진행 캠페인</p>
                      <p className="font-bold text-[14px] text-[#3aaedd]">{campaignDashboard.campaign_impact.active_campaign_count}개</p>
                    </div>
                    <div className="bg-[#f0f8fe] rounded-[12px] px-[10px] py-[8px]">
                      <p className="text-[8px] text-[#888]">해당 품목</p>
                      <p className="font-bold text-[14px] text-[#3aaedd]">{campaignDashboard.campaign_impact.affected_product_count}개</p>
                    </div>
                    <div className="bg-[#f0f8fe] rounded-[12px] px-[10px] py-[8px]">
                      <p className="text-[8px] text-[#888]">보정 수량</p>
                      <p className="font-bold text-[14px] text-[#3aaedd]">
                        {campaignDashboard.campaign_impact.summary.total_adjustment_qty > 0 ? "+" : ""}{campaignDashboard.campaign_impact.summary.total_adjustment_qty}
                      </p>
                    </div>
                  </div>
                  {campaignDashboard.campaign_impact.campaigns.map((campaign) => (
                    <div key={campaign.campaign_id} className="mb-[10px] bg-[#f8f9fa] rounded-[12px] px-[12px] py-[10px]">
                      <div className="flex items-center justify-between mb-[6px]">
                        <p className="font-bold text-[11px] text-[#222]">{campaign.campaign_name}</p>
                        <div className="flex items-center gap-[6px]">
                          <span className="text-[9px] text-[#888]">{campaign.period.start_date?.replace(/-/g, ".")} ~ {campaign.period.end_date?.replace(/-/g, ".")}</span>
                          <span className="text-[9px] font-bold text-[#555]">{campaign.affected_product_count}개 품목 해당</span>
                        </div>
                      </div>
                      {campaign.affected_products.map((product) => (
                        <div key={product.product_id} className="flex items-start justify-between gap-[6px] py-[6px] border-b border-[#eee] last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-[4px] mb-[2px]">
                              <span className="text-[10px] font-bold text-[#333]">{product.product_name}</span>
                              <span
                                className="text-[8px] font-bold px-[4px] py-[1px] rounded-full"
                                style={{
                                  backgroundColor: product.confidence === "high" ? "#edf7f0" : product.confidence === "medium" ? "#fff8e8" : "#f5f5f5",
                                  color: product.confidence === "high" ? "#2f8a51" : product.confidence === "medium" ? "#c4910a" : "#888",
                                }}
                              >
                                {product.confidence === "high" ? "신뢰도 높음" : product.confidence === "medium" ? "신뢰도 중간" : "참고"}
                              </span>
                            </div>
                            <div className="flex items-center gap-[6px] mb-[3px]">
                              <span className="text-[9px] text-[#666]">
                                기준 {product.base_recommended_qty}개
                                {product.campaign_adjustment_qty !== 0 ? ` → 보정 ${product.campaign_adjustment_qty > 0 ? "+" : ""}${product.campaign_adjustment_qty}개 → 최종 ${product.final_recommended_qty}개` : ` → 유지`}
                              </span>
                            </div>
                            <p className="text-[8px] text-[#888] leading-[12px]">{product.guide}</p>
                          </div>
                          <span
                            className="text-[9px] font-bold shrink-0 flex items-center gap-[2px]"
                            style={{
                              color: product.impact_direction === "increase" ? "#3aaedd" : "#ff522c",
                            }}
                          >
                            {product.impact_direction === "increase" ? "▲" : "▼"}
                            {Number.isFinite(product.impact_rate) ? `${Math.abs(product.impact_rate * 100).toFixed(0)}%` : "-"}
                          </span>
                        </div>
                      ))}
                      <p className="text-[9px] text-[#aaa] mt-[4px] leading-[14px]">{campaign.campaign_name} 캠페인 매출 {fmtKRW(campaign.total_sales_amt)} / {campaign.total_bill_cnt}건</p>
                    </div>
                  ))}
                  <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                    <p className="text-[9px] text-[#555] leading-[14px]">보정 기준: 기준 {campaignDashboard.campaign_impact.summary.total_base_qty}개 → 보정 {campaignDashboard.campaign_impact.summary.total_adjustment_qty > 0 ? "+" : ""}{campaignDashboard.campaign_impact.summary.total_adjustment_qty}개 → 최종 {campaignDashboard.campaign_impact.summary.total_final_qty}개</p>
                    <p className="text-[9px] text-[#888] mt-[2px] leading-[14px]">
                      {campaignDashboard.campaign_impact.note}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI 추천 프로모션 */}
          {aiPromos.length > 0 && (
            <div
              className="bg-white rounded-[20px] px-[16px] pt-[14px] pb-[4px]"
              style={{ border: "1.5px solid #3aaedd" }}
            >
              <div className="flex items-center justify-between mb-[2px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="text-[#3aaedd]"><PipIcon size={13} /></span>
                  시뮬레이션 프로모션
                </p>
                <span className="w-[22px] h-[22px] rounded-full bg-[#3aaedd] text-white text-[10px] font-bold flex items-center justify-center">
                  {aiPromos.length}
                </span>
              </div>
              <div className="divide-y divide-[#f5f5f5]">
                {aiPromos.map((p) => (
                  <PromotionItem key={p.id} promo={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}

          {highPerformers.length > 0 && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[4px]">
              <div className="flex items-center justify-between mb-[2px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#3faf60] rounded-[30px]" />
                  성과 높은 프로모션
                </p>
                <span className="text-[10px] text-[#aaa]">{highPerformers.length}건</span>
              </div>
              <div className="divide-y divide-[#f5f5f5]">
                {highPerformers.map((p) => (
                  <PromotionItem key={p.id} promo={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}

          {/* 진행 중 */}
          {watchPromos.length > 0 && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[4px]">
              <div className="flex items-center justify-between mb-[2px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#ff8a65] rounded-[30px]" />
                  관찰 필요 프로모션
                </p>
                <span className="text-[10px] text-[#aaa]">{watchPromos.length}건</span>
              </div>
              <div className="divide-y divide-[#f5f5f5]">
                {watchPromos.map((p) => (
                  <PromotionItem key={p.id} promo={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}

          {/* 예정 프로모션 */}
          {scheduledPromos.length > 0 && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[4px]">
              <div className="flex items-center justify-between mb-[2px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#aaa] rounded-[30px]" />
                  예정 프로모션
                </p>
                <span className="text-[10px] text-[#aaa]">{scheduledPromos.length}건</span>
              </div>
              <div className="divide-y divide-[#f5f5f5]">
                {scheduledPromos.map((p) => (
                  <PromotionItem key={p.id} promo={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}

          {/* ── A. 프로모션 반응 ── */}
          {perfData && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
                  프로모션 반응
                </p>
                <span className="text-[9px] text-[#aaa]">최근 집계 기준</span>
              </div>
              <div className="flex gap-[10px] mb-[10px]">
                <div className="flex-1 bg-[#f0f8fe] rounded-[12px] px-[10px] py-[8px]">
                  <p className="text-[8px] text-[#888]">총 참여 건수</p>
                  <p className="font-bold text-[14px] text-[#3aaedd]">{perfData.response.totalBills.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="flex-1 bg-[#f0f8fe] rounded-[12px] px-[10px] py-[8px]">
                  <p className="text-[8px] text-[#888]">총 매출</p>
                  <p className="font-bold text-[14px] text-[#222]">{fmtKRW(perfData.response.totalSales)}</p>
                </div>
              </div>
              {perfData.response.topByResponse.length > 0 && (
                <div className="mb-[8px]">
                  <p className="text-[10px] font-bold text-[#555] mb-[4px]">반응 상위 프로모션</p>
                  {perfData.response.topByResponse.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-[4px] border-b border-[#f5f5f5] last:border-b-0">
                      <div className="flex items-center gap-[6px] min-w-0">
                        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: item.tone === "high" ? "#3aaedd" : item.tone === "medium" ? "#f0ad4e" : "#ff522c" }} />
                        <span className="text-[10px] text-[#222] truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-[8px] shrink-0">
                        <span className="text-[10px] font-bold text-[#222]">{item.billCnt}건</span>
                        <span className="text-[9px] text-[#888]">{fmtKRW(item.salesAmt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {perfData.response.lowByResponse.length > 0 && (
                <div className="mb-[8px]">
                  <p className="text-[10px] font-bold text-[#555] mb-[4px]">반응 낮은 프로모션</p>
                  {perfData.response.lowByResponse.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-[4px] border-b border-[#f5f5f5] last:border-b-0">
                      <div className="flex items-center gap-[6px] min-w-0">
                        <span className="w-[6px] h-[6px] rounded-full bg-[#ff522c] shrink-0" />
                        <span className="text-[10px] text-[#222] truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-[8px] shrink-0">
                        <span className="text-[10px] font-bold text-[#222]">{item.billCnt}건</span>
                        <span className="text-[9px] text-[#888]">{fmtKRW(item.salesAmt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                <p className="text-[9px] text-[#555] leading-[14px]">{perfData.response.topByResponse[0]?.interpretation ?? "프로모션 반응 데이터를 불러오는 중입니다."}</p>
                <p className="text-[9px] font-bold text-[#3aaedd] mt-[4px]">지금 할 일: {perfData.response.action}</p>
              </div>
            </div>
          )}

          {/* ── B. 프로모션 매출 ── */}
          {perfData && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#3faf60] rounded-[30px]" />
                  프로모션 매출
                </p>
                <span className="text-[9px] text-[#aaa]">최근 집계 기준</span>
              </div>
              <div className="flex gap-[10px] mb-[10px]">
                <div className="flex-1 bg-[#edf7f0] rounded-[12px] px-[10px] py-[8px]">
                  <p className="text-[8px] text-[#888]">총 매출</p>
                  <p className="font-bold text-[14px] text-[#2f8a51]">{fmtKRW(perfData.sales.totalSales)}</p>
                </div>
                <div className="flex-1 bg-[#edf7f0] rounded-[12px] px-[10px] py-[8px]">
                  <p className="text-[8px] text-[#888]">평균 건단가</p>
                  <p className="font-bold text-[14px] text-[#222]">{fmtKRW(perfData.sales.avgEfficiency)}</p>
                </div>
              </div>
              {perfData.sales.topBySales.length > 0 && (
                <div className="mb-[8px]">
                  <p className="text-[10px] font-bold text-[#555] mb-[4px]">매출 상위 프로모션</p>
                  {perfData.sales.topBySales.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-[4px] border-b border-[#f5f5f5] last:border-b-0">
                      <div className="flex items-center gap-[6px] min-w-0">
                        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: item.tone === "high" ? "#3faf60" : item.tone === "medium" ? "#f0ad4e" : "#ff522c" }} />
                        <span className="text-[10px] text-[#222] truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-[8px] shrink-0">
                        <span className="text-[10px] font-bold text-[#222]">{fmtKRW(item.salesAmt)}</span>
                        <span className="text-[9px] text-[#888]">반응 {item.billCnt}건</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {perfData.sales.highEfficiency.length > 0 && (
                <div className="mb-[8px]">
                  <p className="text-[10px] font-bold text-[#555] mb-[4px]">반응 대비 매출 효율 상위</p>
                  {perfData.sales.highEfficiency.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-[4px] border-b border-[#f5f5f5] last:border-b-0">
                      <div className="flex items-center gap-[6px] min-w-0">
                        <span className="w-[6px] h-[6px] rounded-full bg-[#3faf60] shrink-0" />
                        <span className="text-[10px] text-[#222] truncate">{item.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#3faf60] shrink-0">{fmtKRW(item.efficiency)}/건</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                <p className="text-[9px] text-[#555] leading-[14px]">{perfData.sales.topBySales[0]?.interpretation ?? "프로모션 매출 데이터를 불러오는 중입니다."}</p>
                <p className="text-[9px] font-bold text-[#3faf60] mt-[4px]">지금 할 일: {perfData.sales.action}</p>
              </div>
            </div>
          )}

          {/* ── C. 시간대별 성과 ── */}
          <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
            <div className="flex items-center justify-between mb-[10px]">
              <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                <span className="w-[7px] h-[4px] bg-[#f0ad4e] rounded-[30px]" />
                시간대별 성과
              </p>
              {perfData && (
                <span className="text-[9px] text-[#aaa]">{perfData.hourly.promoName}</span>
              )}
            </div>
            {perfData && (() => {
              const activeHours = perfData.hourly.hourlyData.filter((h) => h.qty > 0);
              if (activeHours.length === 0) {
                return (
                  <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                    <p className="text-[9px] text-[#555] leading-[14px]">시간대별 성과 데이터는 아직 연결되지 않았습니다.</p>
                    <p className="text-[9px] text-[#888] mt-[3px] leading-[14px]">현재는 캠페인 기간과 상품 반응 기준으로만 분석 중입니다.</p>
                    <p className="text-[9px] text-[#888] mt-[1px] leading-[14px]">시간대 매출 데이터가 연결되면 강한 시간대를 표시하겠습니다.</p>
                  </div>
                );
              }
              const maxQty = Math.max(...activeHours.map((h) => h.qty), 1);
              return (
                <>
                  <div className="mb-[10px]">
                    <div className="flex items-end gap-[2px] h-[60px]">
                      {perfData.hourly.hourlyData.map((h) => {
                        const isActive = h.qty > 0;
                        const isPeak = perfData.hourly.peakHours.includes(h.hour);
                        const isWeak = perfData.hourly.weakHours.includes(h.hour);
                        const heightPct = isActive ? Math.max((h.qty / maxQty) * 100, 4) : 2;
                        return (
                          <div key={h.hour} className="flex-1 flex flex-col items-center gap-[2px]">
                            <div
                              className="w-full rounded-t-[2px] transition-all"
                              style={{
                                height: `${heightPct}%`,
                                background: isPeak ? "#3aaedd" : isWeak ? "#ff8a65" : isActive ? "#d0d0d0" : "#f0f1f3",
                                minHeight: isActive ? "4px" : "2px",
                              }}
                            />
                            {h.hour % 3 === 0 && (
                              <span className="text-[7px] text-[#aaa] leading-none">{String(h.hour).padStart(2, "0")}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-[8px] mt-[6px]">
                      <div className="flex items-center gap-[3px]"><span className="w-[8px] h-[3px] rounded bg-[#3aaedd]" /><span className="text-[8px] text-[#888]">강한 시간대</span></div>
                      <div className="flex items-center gap-[3px]"><span className="w-[8px] h-[3px] rounded bg-[#ff8a65]" /><span className="text-[8px] text-[#888]">약한 시간대</span></div>
                    </div>
                  </div>
                  <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                    <p className="text-[9px] text-[#555] leading-[14px]">{perfData.hourly.interpretation}</p>
                    <p className="text-[9px] font-bold text-[#f0ad4e] mt-[4px]">지금 할 일: {perfData.hourly.action}</p>
                  </div>
                </>
              );
            })()}
            {!perfData && (
              <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                <p className="text-[9px] text-[#555] leading-[14px]">시간대별 성과 데이터는 아직 연결되지 않았습니다.</p>
                <p className="text-[9px] text-[#888] mt-[3px] leading-[14px]">현재는 캠페인 기간과 상품 반응 기준으로만 분석 중입니다.</p>
                <p className="text-[9px] text-[#888] mt-[1px] leading-[14px]">시간대 매출 데이터가 연결되면 강한 시간대를 표시하겠습니다.</p>
              </div>
            )}
          </div>

          {/* ── D. 점포 간 비교 ── */}
          {perfData && perfData.storeCompare.stores.length > 0 && (
            <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px]">
              <div className="flex items-center justify-between mb-[10px]">
                <p className="font-bold text-[12px] text-[#222] flex items-center gap-[6px]">
                  <span className="w-[7px] h-[4px] bg-[#7c5cbf] rounded-[30px]" />
                  점포 간 비교
                </p>
                <span className="text-[9px] text-[#aaa]">{perfData.storeCompare.promoName}</span>
              </div>
              <div className="flex flex-col gap-[6px] mb-[8px]">
                {perfData.storeCompare.stores.map((store) => (
                  <div key={store.storeId} className="flex items-center justify-between bg-[#f8f9fa] rounded-[10px] px-[10px] py-[6px]">
                    <div className="flex items-center gap-[6px] min-w-0">
                      <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: store.isOurs ? "#3aaedd" : store.tone === "higher" ? "#3faf60" : "#ff8a65" }} />
                      <span className="text-[10px] font-bold text-[#222] truncate">{store.storeName}</span>
                      {store.isOurs && <span className="text-[8px] text-[#3aaedd] font-bold shrink-0">기준</span>}
                    </div>
                    <div className="flex items-center gap-[8px] shrink-0">
                      <span className="text-[9px] text-[#555]">반응 {store.billCnt}건</span>
                      <span className="text-[9px] text-[#555]">매출 {fmtKRW(store.salesAmt)}</span>
                      {!store.isOurs && (
                        <span className="text-[9px] font-bold" style={{ color: store.diffBillCnt > 0 ? "#3faf60" : store.diffBillCnt < 0 ? "#ff522c" : "#888" }}>
                          {store.diffBillCnt > 0 ? "+" : ""}{store.diffBillCnt}건
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#f5f6f7] rounded-[12px] px-[10px] py-[8px]">
                <p className="text-[9px] text-[#555] leading-[14px]">{perfData.storeCompare.interpretation}</p>
                <p className="text-[9px] font-bold text-[#7c5cbf] mt-[4px]">지금 할 일: {perfData.storeCompare.action}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </ContentWrapper>
  );
}
