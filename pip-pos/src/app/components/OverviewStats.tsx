import { useState, useEffect } from "react";
import SalesAreaChart from "./SalesAreaChart";
import SparklineChart from "./SparklineChart";
import icoActionTitle from "../../assets/ico-action-title.svg";
import icoCalendarTitle from "../../assets/ico-event-title.svg";
import icoOrdering from "../../assets/ico-order-title.svg";
import icoSales from "../../assets/ico-sales-title.svg";
import {
  getStatCards,
  getCalendarEvents,
  getRecommendedActions,
  getTodayOrderSummary,
  getTodaySalesSnapshot,
} from "../../lib/api";
import type {
  StatCardData,
  CalendarEvent,
  RecommendedAction,
  TodayOrderSummary,
  TodaySalesSnapshot,
} from "../../types";

// label, subLabel은 고정값 — API에서 받지 않음
const STAT_CARD_META: Record<string, { label: string; subLabel: string }> = {
  "stat-daily-sales": { label: "금일 매출", subLabel: "전일대비" },
  "stat-ai-net-sales": { label: "AI 실매출", subLabel: "인건비·재료비 제외" },
  "stat-opportunity-loss": { label: "기회손실 추정", subLabel: "오후 집중" },
};

const formatKRW = (val: number) =>
  "₩" + val.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

interface OverviewStatsProps {
  cardLeft: number;
  cardWidth: number;
}

export default function OverviewStats({
  cardLeft,
  cardWidth,
}: OverviewStatsProps) {
  const [statCards, setStatCards] = useState<StatCardData[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [actions, setActions] = useState<RecommendedAction[]>([]);
  const [orderSummary, setOrderSummary] = useState<TodayOrderSummary | null>(
    null,
  );
  const [salesSnapshot, setSalesSnapshot] = useState<TodaySalesSnapshot | null>(
    null,
  );

  useEffect(() => {
    getStatCards().then(setStatCards);
    getCalendarEvents().then(setEvents);
    getRecommendedActions().then(setActions);
    getTodayOrderSummary().then(setOrderSummary);
    getTodaySalesSnapshot().then(setSalesSnapshot);
  }, []);

  return (
    <>
      {/* ── Stat cards row ── */}
      <div
        className="absolute flex gap-[20px] top-[217.5px] transition-all duration-300 h-auto"
        style={{ left: `${cardLeft}px`, width: `${cardWidth}px` }}
      >
        {statCards.map((card) => (
          <div
            key={card.id}
            className="flex-1 bg-white border border-[#ebebeb] border-solid rounded-[20px] px-[20px] py-[10px] flex flex-col justify-between min-w-0 h-auto"
          >
            <div className="flex items-center justify-between">
              <p className="[font-weight:700] leading-[20px] not-italic text-[12px] text-[#333] whitespace-nowrap">
                {STAT_CARD_META[card.id]?.label}
              </p>
              <p className="leading-[20px] not-italic text-[#787878] text-[8px] whitespace-nowrap">
                {STAT_CARD_META[card.id]?.subLabel}
              </p>
            </div>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-end justify-between">
                <p className="leading-[0] not-italic text-[#1e1b39] text-[0px] whitespace-nowrap">
                  <span className="[font-weight:700] leading-[22px] text-[15px]">
                    {card.value}
                  </span>
                  <span className="leading-[22px] text-[13px]">
                    {card.unit}
                  </span>
                </p>
                <div className="flex items-center gap-[4px]">
                  <p
                    className={`leading-[20px] not-italic text-[8px] whitespace-nowrap ${
                      card.changeType === "up"
                        ? "text-[#3faf60]"
                        : "text-[#ff522c]"
                    }`}
                  >
                    {card.changeValue}
                  </p>
                  {card.changeType === "up" ? (
                    <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
                      <path d="M3.5 0L6.5 5.5H0.5L3.5 0Z" fill="#3faf60" />
                    </svg>
                  ) : (
                    <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
                      <path d="M3.5 6L6.5 0.5H0.5L3.5 6Z" fill="#ff522c" />
                    </svg>
                  )}
                </div>
              </div>
              {/* 스파크라인 */}
              <SparklineChart
                data={card.sparkData}
                color={card.changeType === "up" ? "#3BB1E1" : "#ff522c"}
                gradientId={`spark-${card.id}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── 추천액션 / 이벤트 캘린더 섹션 레이블 ── */}
      <div
        className="absolute flex items-start gap-[20px] top-[330.54px] transition-all duration-300"
        style={{ left: `${cardLeft}px`, width: `${cardWidth}px` }}
      >
        {/* ── 추천 액션 카드 ── */}
        <div className="flex-1 bg-white border border-[#ebebeb] border-solid rounded-[20px] relative pb-2">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-[20px] pt-[12px] pb-[8px]">
            <div className="flex items-center gap-[8px]">
              <img src={icoActionTitle} alt="" className="max-w-none" />
              <p className="font-bold leading-[20px] not-italic text-[#333] text-[12px] whitespace-nowrap">
                추천 액션
              </p>
            </div>
            <p className="leading-[20px] not-italic text-[#787878] text-[8px] whitespace-nowrap">
              AI 즉시 실행 제안
            </p>
          </div>

          {/* 액션 목록 */}
          <div className="flex flex-col gap-[8px] px-[8px] overflow-y-auto mr-2 scrolled max-h-[114px]">
            {actions.map((action) => (
              <div
                key={action.id}
                className="relative bg-[#fff] border border-[#ebedef] border-solid rounded-[20px] px-[8px] py-[6px] flex gap-[8px] items-center"
              >
                {/* 아바타 */}
                <div className="shrink-0 size-[29px] rounded-full bg-[#fff] flex items-center justify-center overflow-hidden">
                  <img
                    src={action.avatarInitial}
                    alt="icon"
                    className="w-full h-full object-contain"
                  />
                </div>
                {/* 텍스트 */}
                <div className="flex flex-col gap-[2px] min-w-0 flex-1">
                  <p className="text-[10px] font-bold leading-[12px] text-black truncate">
                    {action.title}
                  </p>
                  <p className="text-[8px] leading-[12px] text-[#6f6f6f] truncate">
                    {action.subtitle}
                  </p>
                </div>
                {/* 배지 */}
                <div
                  className="shrink-0 px-[8px] py-[1px] rounded-[15px] text-[8px] font-[400] text-white leading-[13px]"
                  style={{
                    background:
                      action.badgeType === "추천"
                        ? "linear-gradient(95deg, #429ddd 50%, #3aaedd 122%)"
                        : "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                  }}
                >
                  {action.badgeType}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 이벤트 캘린더 카드 ── */}
        <div className="flex-1 bg-white border border-[#ebebeb] border-solid rounded-[20px] relative pb-2">
          {/* 헤더 */}
          <div className="flex items-center gap-[8px] px-[20px] pt-[12px] pb-[8px]">
            <img src={icoCalendarTitle} alt="" className="max-w-none" />

            <p className="font-bold leading-[20px] not-italic text-[#333] text-[12px] whitespace-nowrap">
              이벤트 캘린더
            </p>
            <p className="ml-auto leading-[20px] not-italic text-[#787878] text-[8px] whitespace-nowrap">
              {events.length} 건
            </p>
          </div>

          {/* 이벤트 목록 */}
          <div className="flex flex-col gap-[8px] px-[8px] max-h-[114px] scrolled mr-2 overflow-auto">
            {events.map((event) => (
              <div
                key={event.id}
                className={`rounded-[20px] p-[6px] flex gap-[8px] items-center border-solid border-1 border-[#EBEDEF] ${
                  event.isActive ? "bg-[#F0F1F3]" : "bg-[#FBFBFB]"
                }`}
              >
                <div className="bg-white border-[1.35px] border-[#ebebeb] border-solid rounded-[13.5px] size-[36px] flex flex-col items-center justify-center shrink-0">
                  <p
                    className={`text-[8px] font-bold leading-[16px]  ${
                      event.isActive ? "text-[#2d9bcb]" : "text-[#3bb1e1]"
                    }`}
                  >
                    {event.month}
                  </p>
                  <p className="text-[14px] font-bold leading-[16px] mt-[-2px]">
                    {event.day}
                  </p>
                </div>
                <div className="flex flex-col gap-[2px] min-w-0">
                  <p
                    className={`text-[10px] font-bold leading-[12px] mb-1 ${
                      event.isActive ? "text-black" : "text-black"
                    }`}
                  >
                    {event.title}
                  </p>
                  <p
                    className={`text-[8px] leading-[12px] ${
                      event.isActive ? "text-black" : "text-[#6f6f6f]"
                    }`}
                  >
                    {event.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 오늘의 발주 요약 / 매출 스냅샷 ── */}
      <div
        className="absolute flex items-start gap-[20px] top-[511px] transition-all duration-300"
        style={{ left: `${cardLeft}px`, width: `${cardWidth}px` }}
      >
        {/* ── 오늘의 발주 요약 ── */}
        <div className="flex-1 bg-white border border-[#ebebeb] border-solid rounded-[20px] overflow-hidden pb-[10px]">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-[16px] pt-[12px] pb-[8px]">
            <div className="flex items-center gap-[6px]">
              <img src={icoOrdering} alt="" className="max-w-none" />
              <p className="font-bold text-[12px] text-[#333] leading-[20px] whitespace-nowrap">
                오늘의 발주 요약
              </p>
            </div>
            <p className="text-[8px] text-[#787878] leading-[20px] whitespace-nowrap">
              발주 관리
            </p>
          </div>

          {/* 마감 정보 pill */}
          {orderSummary && (
            <div className="mx-[10px] mb-[8px] bg-[#f0f1f3] rounded-[20px] h-[22px] flex items-center justify-between px-[10px]">
              <p className="text-[8px] text-[#555] font-[500]">
                {orderSummary.deadlineLabel}
              </p>
              <p className="text-[8px] text-[#3BB1E1] font-bold">
                {orderSummary.deadline}
              </p>
            </div>
          )}

          {/* 막대 차트 + 아이템 목록 */}
          {orderSummary && (
            <div className="flex flex-col gap-[5px] px-[15px] max-h-[60px] scrolled overflow-y-auto mr-2">
              {orderSummary.items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-[6px] justify-between"
                >
                  <p className="text-[8px] text-[#222] w-[70px] shrink-0 truncate font-bold">
                    {item.name}
                  </p>
                  <p className="text-[8px] font-[400] text-[#2A2A2A] w-[28px] shrink-0 text-right">
                    {item.quantity}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 하단 안내 pill */}
          {orderSummary && (
            <div className="mx-[10px] mt-[8px] bg-[#f0f1f3] rounded-[20px] px-[10px] py-[4px]">
              <p className="text-[7px] text-[#6f6f6f] leading-[12px]">
                {orderSummary.note}
              </p>
            </div>
          )}
        </div>

        {/* ── 오늘의 매출 스냅샷 ── */}
        <div className="flex-1 bg-white border border-[#ebebeb] border-solid rounded-[20px] overflow-hidden pb-[10px]">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-[16px] pt-[12px] pb-[6px]">
            <div className="flex items-center gap-[6px]">
              <img src={icoSales} alt="" className="max-w-none" />
              <p className="font-bold text-[12px] text-[#555] leading-[20px] whitespace-nowrap">
                오늘의 매출 스냅샷
              </p>
            </div>
            {salesSnapshot && (
              <div className="flex items-center gap-[3px]">
                <p className="text-[8px] leading-[10px] text-[#787878] whitespace-nowrap">
                  전일 대비
                </p>
                <p
                  className={`text-[8px] leading-[10px] font-bold whitespace-nowrap ${salesSnapshot.trendType === "up" ? "text-[#3faf60]" : "text-[#ff522c]"}`}
                >
                  {salesSnapshot.trendType === "up" ? "+" : "-"}
                  {salesSnapshot.trendValue}
                </p>
                {salesSnapshot.trendType === "up" ? (
                  <svg
                    width="7"
                    height="6"
                    viewBox="0 0 7 6"
                    fill="none"
                    className="left-2"
                  >
                    <path d="M3.5 0L6.5 5.5H0.5L3.5 0Z" fill="#3faf60" />
                  </svg>
                ) : (
                  <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
                    <path d="M3.5 6L6.5 0.5H0.5L3.5 6Z" fill="#ff522c" />
                  </svg>
                )}
              </div>
            )}
          </div>

          {/* Recharts 라인 차트 */}
          {salesSnapshot && (
            <SalesAreaChart
              data={salesSnapshot.hourlyData}
              formatKRW={formatKRW}
            />
          )}

          {/* 판매 순위 */}
          {salesSnapshot && (
            <div className="flex gap-[10px] px-[10px] scrolled max-h-[45px] mt-[-10px] overflow-y-auto mr-2">
              {/* 순위 번호 원형 */}
              <div className="flex flex-col gap-[8px] shrink-0">
                {salesSnapshot.topItems.map((item) => (
                  <div
                    key={item.rank}
                    className="size-[13px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: item.rank === 1 ? "#3BB1E1" : "#aaa" }}
                  >
                    <span className="text-[7px] font-bold text-white leading-none">
                      {item.rank}
                    </span>
                  </div>
                ))}
              </div>
              {/* 아이템 목록 */}
              <div className="flex flex-col gap-[8px] flex-1">
                {salesSnapshot.topItems.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center justify-between"
                  >
                    <p className="text-[8px] font-bold text-[#222] leading-[13px]">
                      {item.name}
                    </p>
                    <p className="text-[8px] text-[#2A2A2A] leading-[13px]">
                      {item.count}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
