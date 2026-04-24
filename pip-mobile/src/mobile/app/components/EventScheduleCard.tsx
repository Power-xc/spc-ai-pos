import { useState } from "react";
import type { EventScheduleData, EventItem } from "@/mobile/types";
import { getEventSchedule } from "@/mobile/lib/api";
import icoEvent from "@/mobile/assets/ico-event.svg";
import { useFetchData } from "@/mobile/hooks/useFetchData";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TODAY = new Date("2026-04-14");

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startStr = `${start.getFullYear()}.${pad(start.getMonth() + 1)}.${pad(start.getDate())}`;
  const endStr = sameMonth
    ? pad(end.getDate())
    : `${pad(end.getMonth() + 1)}.${pad(end.getDate())}`;
  return `${startStr} ~ ${endStr}`;
}

interface MiniCalendarProps {
  events: EventItem[];
}

function MiniCalendar({ events }: MiniCalendarProps) {
  const [viewStart, setViewStart] = useState<Date>(() => {
    // 2026-04-01은 수요일(3) → 그 주 일요일로 이동
    const d = new Date("2026-03-30"); // 3/30이 일요일
    return d;
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(viewStart);
    d.setDate(viewStart.getDate() + i);
    return d;
  });

  const viewEnd = days[13];
  const rangeLabel = formatRange(viewStart, viewEnd);

  const eventDates = events.map((e) => ({
    month: parseInt(e.month),
    day: parseInt(e.day),
  }));

  function isEventDay(d: Date): boolean {
    return eventDates.some(
      (e) => e.month === d.getMonth() + 1 && e.day === d.getDate(),
    );
  }

  function isToday(d: Date): boolean {
    return d.toDateString() === TODAY.toDateString();
  }

  function goToPrev() {
    setViewStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 14);
      return d;
    });
  }

  function goToNext() {
    setViewStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 14);
      return d;
    });
  }

  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  function renderDay(day: Date, colIdx: number) {
    const hasEvent = isEventDay(day);
    const todayDay = isToday(day);
    const isSun = colIdx === 0;
    const isSat = colIdx === 6;

    let textColor = "text-[#333]";
    if (isSun) textColor = "text-[#ff522c]";
    else if (isSat) textColor = "text-[#3cabdd]";

    return (
      <div key={colIdx} className="flex items-center justify-center h-[24px]">
        <span
          className={`text-[10.9px] w-[22px] h-[22px] flex items-center justify-center rounded-full
            ${hasEvent ? "bg-[#3cabdd] text-white font-bold" : ""}
            ${todayDay && !hasEvent ? "border border-[#3cabdd] font-bold" : ""}
            ${!hasEvent ? textColor : ""}
          `}
        >
          {day.getDate()}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-[#f6f7f9] rounded-[20px] px-[16px] pt-[10px] pb-[10px]">
      {/* 날짜 범위 + 이전/다음 버튼 */}
      <div className="flex items-center justify-between mb-[8px] ">
        <button onClick={goToPrev} className="p-[4px] cursor-pointer">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path
              d="M6 1L2 6L6 11"
              stroke="#555"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-[#333] text-[12px] font-bold">{rangeLabel}</span>
        <button onClick={goToNext} className="p-[4px] cursor-pointer">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path
              d="M2 1L6 6L2 11"
              stroke="#555"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-[4px]">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-bold ${
              i === 0
                ? "text-[#ff522c]"
                : i === 6
                  ? "text-[#3cabdd]"
                  : "text-black"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 1주차 */}
      <div className="grid grid-cols-7 mb-[2px]">
        {week1.map((day, di) => renderDay(day, di))}
      </div>

      {/* 2주차 */}
      <div className="grid grid-cols-7">
        {week2.map((day, di) => renderDay(day, di))}
      </div>
    </div>
  );
}

interface EventRowProps {
  event: EventItem;
  isFirst: boolean;
}

function EventRow({ event, isFirst }: EventRowProps) {
  return (
    <div
      className={`flex items-center gap-[8px] p-[8px] rounded-[20px] ${
        isFirst ? "bg-[#f0f1f3]" : "bg-[#fbfbfb] border border-[#ebedef]"
      }`}
    >
      <div className="w-[39px] h-[39px] bg-white border border-[#ebebeb] rounded-[14px] flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-[#2d9bcb] text-[10px] font-bold leading-[17px]">
          {event.month}
        </span>
        <span className="text-black text-[15px] font-bold leading-[17px]">
          {event.day}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-black text-[12px] font-bold leading-[14px] truncate">
          {event.title}
        </p>
        <p className="text-[#6f6f6f] text-[10px] leading-[14px] truncate">
          {event.subtitle}
        </p>
      </div>
    </div>
  );
}

interface EventScheduleCardProps {
  onNavigate?: (tab: string) => void;
}

export default function EventScheduleCard({
  onNavigate,
}: EventScheduleCardProps = {}) {
  const { data, loading } = useFetchData<EventScheduleData>(
    () => getEventSchedule(),
    { cacheKey: "getEventSchedule" },
  );

  if (loading || !data)
    return <div className="bg-white rounded-[20px] h-[200px] animate-pulse" />;

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] pt-[15px] pb-[4px]">
        <div className="flex items-center gap-[7px]">
          <img src={icoEvent} alt="" />
          <span className="text-[#555] text-[14px] font-bold">이벤트 일정</span>
        </div>
        <span className="text-[12px]">
          <span className="text-[#333]">이번 달 </span>
          <span className="text-[#3babdd] font-bold">이벤트</span>
          <span className="text-[#ff522c] font-bold">
            {" "}
            {data.thisMonthCount}
          </span>
          <span className="text-[#333]">건</span>
        </span>
      </div>

      {/* AI 추천 배너 */}
      <div className="mx-[20px] mb-[10px] bg-[#f0f1f3] rounded-[20px] px-[12px] py-[6px]">
        <span className="text-black text-[12px] font-bold">AI 추천 </span>
        <span className="text-black text-[12px]">: </span>
        <span className="text-[#555] text-[12px]">{data.aiRecommendation}</span>
      </div>

      {/* 미니 캘린더 */}
      <div className="px-[20px] mb-[10px]">
        <MiniCalendar events={data.events} />
      </div>

      {/* 이벤트 목록 */}
      <div className="px-[20px] pr-[15px] flex flex-col gap-[10px] mb-[12px] scrolled overflow-y-auto h-[190px] mr-3">
        {data.events.map((event, idx) => (
          <EventRow key={event.id} event={event} isFirst={idx === 0} />
        ))}
      </div>

      {/* 성과 시뮬레이터 버튼 */}
      <div className="px-[20px]">
        <button
          onClick={() => onNavigate?.("성과시뮬레이터")}
          className="w-full flex items-center justify-between px-[20px] py-[6px] rounded-[20px] text-white cursor-pointer"
          style={{
            background: "linear-gradient(89deg, #008EE0 1.2%, #38A6D3 105.18%)",
          }}
        >
          <span className="text-[12px] font-bold">성과 시뮬레이터 보기</span>
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path
              d="M1 1L5 5.5L1 10"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
