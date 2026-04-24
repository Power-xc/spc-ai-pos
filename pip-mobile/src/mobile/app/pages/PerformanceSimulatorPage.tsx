import { useMemo, useState } from "react";
import type { PerformanceSimulatorData } from "@/mobile/types";
import { getPerformanceSimulator } from "@/mobile/lib/api";
import { useFetchData } from "@/mobile/hooks/useFetchData";

const BLUE_GRADIENT = "linear-gradient(89deg, #008EE0 1.2%, #38A6D3 105.18%)";
const PROGRESS_GRADIENT =
  "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)";

function formatMan(value: number): string {
  return `${Math.round(value / 10000)}만`;
}

function formatManWon(value: number): string {
  return `${Math.round(value / 10000)}만원`;
}

function formatKRW(value: number): string {
  return value.toLocaleString("ko-KR");
}

interface HourlyTrendCardProps {
  rows: HourlySalesRow[];
  summary: PerformanceSimulatorData["summary"];
}

function HourlyTrendCard({ rows, summary }: HourlyTrendCardProps) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[14px]">
      <div className="px-[20px] pt-[15px] pb-[10px]">
        <span className="text-[#555] text-[14px] font-bold">
          시간대별 매출 추이
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div className="px-[20px] grid grid-cols-[40px_1fr_1fr_1fr] gap-[6px] pb-[6px]">
        <div />
        <div className="text-center text-[#008EE0] text-[11px] font-bold">
          오늘
        </div>
        <div className="text-center text-[#6b8aa3] text-[11px] font-bold">
          어제
        </div>
        <div className="text-center text-[#787878] text-[11px] font-bold">
          지난주
        </div>
      </div>

      {/* 데이터 행 */}
      <div className="px-[20px] flex flex-col gap-[5px]">
        {rows.map((row) => (
          <div
            key={row.hour}
            className="grid grid-cols-[40px_1fr_1fr_1fr] gap-[6px] items-center"
          >
            {/* 시간 + 피크 배지 */}
            <div className="flex flex-col items-start gap-[2px]">
              <span
                className={`text-[11px] ${
                  row.isPeak ? "text-[#008EE0] font-bold" : "text-[#787878]"
                }`}
              >
                {row.hour}
              </span>
              {row.isPeak && (
                <span
                  className="text-[8px] font-bold text-white px-[6px] py-[1px] rounded-[8px]"
                  style={{ background: BLUE_GRADIENT }}
                >
                  피크
                </span>
              )}
            </div>

            {/* 오늘 */}
            <div
              className={`h-[28px] rounded-[14px] flex items-center justify-center text-[12px] font-bold ${
                row.isPeak
                  ? "text-white"
                  : "text-[#008EE0] bg-[#e6f4fc]"
              }`}
              style={row.isPeak ? { background: BLUE_GRADIENT } : undefined}
            >
              {formatMan(row.today)}
            </div>
            {/* 어제 */}
            <div
              className={`h-[28px] rounded-[14px] flex items-center justify-center text-[12px] font-bold ${
                row.isPeak
                  ? "bg-[#cfe3f2] text-[#3f6f92]"
                  : "bg-[#eff6fa] text-[#6b8aa3]"
              }`}
            >
              {formatMan(row.yesterday)}
            </div>
            {/* 지난주 */}
            <div
              className={`h-[28px] rounded-[14px] flex items-center justify-center text-[12px] font-bold ${
                row.isPeak
                  ? "bg-[#d4d8dc] text-[#555]"
                  : "bg-[#f0f1f3] text-[#6f6f6f]"
              }`}
            >
              {formatMan(row.lastWeek)}
            </div>
          </div>
        ))}
      </div>

      {/* 하단 요약 3칸 */}
      <div className="mx-[20px] mt-[14px] bg-[#f6f7f9] rounded-[16px] grid grid-cols-3 py-[10px]">
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#787878] text-[10px]">오늘 누계</span>
          <span className="text-[#333] text-[13px] font-bold">
            {formatMan(summary.todayTotal)}
          </span>
          <span className="text-[#3faf60] text-[10px] font-bold">
            ▲ {summary.deltaPct}%
          </span>
        </div>
        <div className="flex flex-col items-center gap-[2px] border-l border-r border-[#e5e7ea]">
          <span className="text-[#787878] text-[10px]">피크 시간</span>
          <span className="text-[#008EE0] text-[13px] font-bold">
            {summary.peakHour}
          </span>
          <span className="text-[#333] text-[10px]">
            {formatMan(summary.peakSales)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#787878] text-[10px]">총 거래</span>
          <span className="text-[#333] text-[13px] font-bold">
            {summary.txCount}건
          </span>
          <span className="text-[#787878] text-[10px]">
            객단가 {formatMan(summary.avgTicket)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ProgressBarProps {
  percent: number;
  height?: number;
}

function ProgressBar({ percent, height = 10 }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="w-full rounded-[100px] overflow-hidden bg-[#ebedef]"
      style={{ height }}
    >
      <div
        className="h-full rounded-[100px]"
        style={{ width: `${pct}%`, background: PROGRESS_GRADIENT }}
      />
    </div>
  );
}

function pctOf(metric: GoalMetric): number {
  return Math.round((metric.value / metric.target) * 100);
}

interface GoalCardProps {
  goal: PerformanceSimulatorData["goal"];
}

function GoalCard({ goal }: GoalCardProps) {
  const salesPct = pctOf(goal.sales);
  const txPct = pctOf(goal.tx);
  const avgPct = pctOf(goal.avgTicket);
  const remaining = Math.max(0, goal.sales.target - goal.sales.value);

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      <div className="px-[20px] pt-[15px] pb-[10px]">
        <span className="text-[#555] text-[14px] font-bold">
          우리 점포 목표 달성률
        </span>
      </div>

      {/* 일 매출 */}
      <div className="px-[20px]">
        <div className="flex items-end justify-between mb-[8px]">
          <div>
            <span className="text-[#787878] text-[11px]">일 매출</span>
            <div className="text-[#333] text-[22px] font-bold leading-[26px]">
              {formatManWon(goal.sales.value)}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[#008EE0] text-[16px] font-bold">
              {salesPct}%
            </span>
            <span className="text-[#787878] text-[10px]">
              목표 {formatManWon(goal.sales.target)}
            </span>
          </div>
        </div>
        <ProgressBar percent={salesPct} />
        <div className="mt-[6px] text-[#008EE0] text-[11px] font-bold">
          목표까지 {formatManWon(remaining)} 남음
        </div>
      </div>

      {/* 거래 건수 + 객단가 */}
      <div className="px-[20px] mt-[16px] grid grid-cols-2 gap-[14px]">
        <div>
          <span className="text-[#787878] text-[11px]">거래 건수</span>
          <div className="text-[#333] text-[16px] font-bold leading-[20px] mb-[6px]">
            {goal.tx.value}
            <span className="text-[11px] font-normal text-[#787878]">
              {" "}
              {goal.tx.unit}
            </span>
          </div>
          <ProgressBar percent={txPct} height={6} />
          <div className="flex justify-between mt-[4px]">
            <span className="text-[#008EE0] text-[10px] font-bold">
              {txPct}%
            </span>
            <span className="text-[#787878] text-[10px]">
              목표 {goal.tx.target}{goal.tx.unit}
            </span>
          </div>
        </div>
        <div>
          <span className="text-[#787878] text-[11px]">객단가</span>
          <div className="text-[#333] text-[16px] font-bold leading-[20px] mb-[6px]">
            {formatKRW(goal.avgTicket.value)}
            <span className="text-[11px] font-normal text-[#787878]">
              {" "}
              {goal.avgTicket.unit}
            </span>
          </div>
          <ProgressBar percent={avgPct} height={6} />
          <div className="flex justify-between mt-[4px]">
            <span className="text-[#3faf60] text-[10px] font-bold">
              {avgPct}%
            </span>
            <span className="text-[#787878] text-[10px]">
              목표 {formatKRW(goal.avgTicket.target)}
              {goal.avgTicket.unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NearbyCardProps {
  nearby: NearbyStore[];
}

function NearbyCard({ nearby }: NearbyCardProps) {
  const maxSales = Math.max(...nearby.map((s) => s.sales));
  const top = nearby.find((s) => s.rank === 1);
  const ours = nearby.find((s) => s.isOurs);
  const gap = top && ours ? ours.sales - top.sales : 0;
  const gapPct =
    top && ours ? Math.round((gap / top.sales) * 100) : 0;

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      <div className="px-[20px] pt-[15px] pb-[12px] flex items-center gap-[6px]">
        <span className="text-[#555] text-[14px] font-bold">
          내 상권 지금 어때?
        </span>
      </div>

      {/* 세로 막대 차트 */}
      <div className="px-[20px] pb-[10px]">
        <div className="flex items-end justify-between gap-[10px] h-[130px]">
          {nearby.map((store) => {
            const heightPct = (store.sales / maxSales) * 100;
            const isFirst = store.rank === 1;
            const barStyle: React.CSSProperties = isFirst
              ? { background: BLUE_GRADIENT }
              : store.isOurs
                ? { backgroundColor: "#3aaedd" }
                : { backgroundColor: "#d4d8dc" };

            return (
              <div
                key={store.rank}
                className="flex-1 flex flex-col items-center justify-end gap-[4px] h-full"
              >
                {/* 상단 라벨 */}
                <div className="flex flex-col items-center">
                  {store.isOurs && (
                    <span className="text-[#008EE0] text-[10px]">📍</span>
                  )}
                  <span
                    className={`text-[10px] ${
                      store.isOurs
                        ? "text-[#008EE0] font-bold"
                        : "text-[#787878]"
                    }`}
                  >
                    {store.isOurs
                      ? "우리 가게"
                      : `${store.distanceKm}km`}
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      isFirst
                        ? "text-[#008EE0]"
                        : store.isOurs
                          ? "text-[#3aaedd]"
                          : "text-[#555]"
                    }`}
                  >
                    {formatMan(store.sales)}
                  </span>
                </div>
                {/* 막대 */}
                <div
                  className="w-full rounded-t-[8px] rounded-b-[4px]"
                  style={{ ...barStyle, height: `${heightPct}%` }}
                />
                {/* 순위 마커 */}
                <div
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    isFirst
                      ? "text-white"
                      : store.isOurs
                        ? "text-white"
                        : "bg-[#ebedef] text-[#787878]"
                  }`}
                  style={
                    isFirst
                      ? { background: BLUE_GRADIENT }
                      : store.isOurs
                        ? { backgroundColor: "#3aaedd" }
                        : undefined
                  }
                >
                  {store.rank}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 요약 */}
      <div className="mx-[20px] bg-[#f6f7f9] rounded-[14px] px-[14px] py-[10px] flex flex-col gap-[4px]">
        <div className="flex items-center justify-between">
          <span className="text-[#555] text-[11px]">1등이랑 차이</span>
          <span className="text-[#ff522c] text-[12px] font-bold">
            {gap >= 0 ? "+" : "-"}
            {formatManWon(Math.abs(gap))} ({gapPct}%)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#555] text-[11px]">우리 가게 위치</span>
          <span className="text-[#ff522c] text-[12px] font-bold">
            {ours?.rank}등 / {nearby.length}곳 중
          </span>
        </div>
      </div>
    </div>
  );
}

interface PromotionCardProps {
  data: PerformanceSimulatorData["promotion"];
}

function PromotionCard({ data }: PromotionCardProps) {
  const [selected, setSelected] = useState<PromotionCategory>(
    data.categories[0],
  );

  const filtered = useMemo(
    () => data.items.filter((it) => it.category === selected),
    [data.items, selected],
  );
  const recommended = filtered.filter((it) => it.recommended);
  const others = filtered.filter((it) => !it.recommended);

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      <div className="px-[20px] pt-[15px] pb-[4px]">
        <span className="text-[#555] text-[14px] font-bold">
          제품 프로모션 분석
        </span>
      </div>
      <div className="px-[20px] pb-[10px]">
        <span className="text-[#787878] text-[11px]">
          프로모션 진행 시 예상 수익 변화
        </span>
      </div>

      {/* 카테고리 칩 */}
      <div className="flex gap-[8px] px-[20px] pb-[12px] overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {data.categories.map((cat) => {
          const isActive = cat === selected;
          return (
            <button
              key={cat}
              onClick={() => setSelected(cat)}
              className={`h-[30px] px-[14px] rounded-[20px] text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                isActive
                  ? "text-white"
                  : "border border-[#ddd] text-[#777]"
              }`}
              style={isActive ? { background: BLUE_GRADIENT } : undefined}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* 추천 상품 */}
      {recommended.length > 0 && (
        <>
          <div className="px-[20px] pb-[8px] flex items-center gap-[4px]">
            <span className="text-[#ffb800] text-[12px]">☆</span>
            <span className="text-[#333] text-[12px] font-bold">추천 상품</span>
          </div>
          <div className="px-[20px] flex flex-col gap-[8px] pb-[12px]">
            {recommended.map((item) => (
              <PromotionRow key={item.id} item={item} highlighted />
            ))}
          </div>
        </>
      )}

      {/* 전체 상품 */}
      {others.length > 0 && (
        <>
          <div className="px-[20px] pb-[8px] pt-[4px]">
            <span className="text-[#333] text-[12px] font-bold">전체 상품</span>
          </div>
          <div className="px-[20px] flex flex-col gap-[8px]">
            {others.map((item) => (
              <PromotionRow key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {filtered.length === 0 && (
        <div className="px-[20px] py-[20px] text-center text-[#787878] text-[12px]">
          해당 카테고리 상품이 없습니다.
        </div>
      )}
    </div>
  );
}

function PromotionRow({
  item,
  highlighted = false,
}: {
  item: PromotionItem;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] px-[14px] py-[10px] flex items-center justify-between ${
        highlighted
          ? "border border-[#3aaedd] bg-[#f4fafd]"
          : "border border-[#ebebeb] bg-white"
      }`}
    >
      <div className="flex flex-col gap-[2px]">
        <div className="flex items-center gap-[6px]">
          <span className="text-[#333] text-[13px] font-bold">{item.name}</span>
          {item.recommended && (
            <span className="text-[9px] font-bold text-white px-[6px] py-[1px] rounded-[8px] bg-[#3faf60]">
              추천
            </span>
          )}
        </div>
        <span className="text-[#787878] text-[10px]">
          이익률 {item.profitRate}%
        </span>
      </div>
      <div className="flex flex-col items-end gap-[1px]">
        <span className="text-[#a4a4a4] text-[10px] line-through">
          {formatManWon(item.oldPrice)}
        </span>
        <span className="text-[#008EE0] text-[14px] font-bold">
          {formatManWon(item.newPrice)}
        </span>
        <span className="text-[#3faf60] text-[10px] font-bold">
          ▲ +{formatManWon(item.deltaPrice)}
        </span>
      </div>
    </div>
  );
}

export default function PerformanceSimulatorPage() {
  const { data } = useFetchData<PerformanceSimulatorData>(
    () => getPerformanceSimulator(),
    { cacheKey: "performanceSimulator" },
  );

  if (!data) {
    return (
      <div className="px-[15px] pt-[12px] pb-[40px] flex flex-col gap-[12px]">
        <div className="bg-white rounded-[20px] h-[240px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[180px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-[15px] pt-[12px] pb-[40px] flex flex-col gap-[12px]">
      <HourlyTrendCard rows={data.hourly} summary={data.summary} />
      <GoalCard goal={data.goal} />
      <NearbyCard nearby={data.nearby} />
      <PromotionCard data={data.promotion} />
    </div>
  );
}
