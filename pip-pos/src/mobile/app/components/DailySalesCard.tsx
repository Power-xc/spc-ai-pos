import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import type { DailySalesData } from "@/mobile/types";
import { getDailySales } from "@/mobile/lib/api";

function formatKRW(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-[#ddd] rounded-[8px] px-[10px] py-[6px] text-[11px] shadow-sm">
      <p className="text-[#333] font-bold mb-[2px]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatKRW(entry.value)}
        </p>
      ))}
    </div>
  );
}

const TODAY = new Date("2026-04-14");

export default function DailySalesCard() {
  const [data, setData] = useState<DailySalesData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(TODAY));
  const [showNearby, setShowNearby] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setData(null);
    getDailySales(selectedDate).then(setData);
  }, [selectedDate]);

  function goToPrev() {
    setSelectedDate((d) => {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - 1);
      return prev;
    });
  }

  function goToNext() {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }

  if (!data)
    return <div className="bg-white rounded-[20px] h-[300px] animate-pulse" />;

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] pt-[15px] pb-[10px]">
        <div className="flex items-center gap-[7px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M4.38394 5.33158C4.45411 5.29107 4.51237 5.2328 4.55287 5.16263C4.59337 5.09246 4.61469 5.01286 4.61467 4.93184V0.778711C4.61426 0.70514 4.59626 0.632734 4.56218 0.567531C4.5281 0.502329 4.47892 0.446221 4.41875 0.403886C4.35858 0.361551 4.28916 0.334217 4.21627 0.324164C4.14339 0.314111 4.06916 0.32163 3.99978 0.346094C2.65288 0.822789 1.5202 1.7643 0.805339 3.00137C0.0904821 4.23844 -0.159662 5.68993 0.0998748 7.09492C0.113328 7.16758 0.14403 7.23594 0.189401 7.29426C0.234772 7.35258 0.293484 7.39915 0.360599 7.43006C0.421082 7.45834 0.487065 7.47292 0.553835 7.47274C0.634828 7.47278 0.714403 7.45149 0.784564 7.41102L4.38394 5.33158ZM3.69175 1.47782V4.66535L0.929923 6.25911C0.923001 6.17201 0.923001 6.08433 0.923001 5.99896C0.92382 5.06356 1.18274 4.14653 1.67125 3.34883C2.15977 2.55113 2.85892 1.9037 3.69175 1.47782ZM11.998 5.99896C11.9985 7.31592 11.5655 8.59644 10.766 9.64294C9.96651 10.6894 8.84484 11.4438 7.57409 11.7895C6.30333 12.1353 4.9541 12.0533 3.73457 11.5562C2.51504 11.0591 1.49298 10.1744 0.826095 9.03882C0.795007 8.98636 0.774623 8.92827 0.766121 8.86789C0.757618 8.80751 0.761166 8.74604 0.77656 8.68705C0.791954 8.62805 0.818887 8.57268 0.855805 8.52415C0.892722 8.47562 0.938891 8.43489 0.991643 8.40431L5.53759 5.75843V0.461459C5.53759 0.339072 5.5862 0.221698 5.67274 0.135158C5.75928 0.0486178 5.87666 0 5.99904 0C7.0459 0.000534146 8.07442 0.274876 8.98247 0.795789C9.89053 1.3167 10.6465 2.06607 11.1755 2.96949C11.1818 2.97871 11.1876 2.98794 11.1933 2.99775C11.1991 3.00756 11.2049 3.01909 11.2101 3.02947C11.7277 3.93345 11.9993 4.95729 11.998 5.99896Z"
              fill="#555555"
            />
          </svg>
          <span className="text-[#555] text-[14px] font-bold leading-[20px]">
            일일 매출
          </span>
          <span className="text-[#787878] text-[9px] leading-[20px]">
            TODAY RECEIPT
          </span>
        </div>
        <div className="flex items-center gap-[6px]">
          <span className="text-[#249dd7] text-[10px] font-bold">주변상권</span>
          <button
            onClick={() => setShowNearby((v) => !v)}
            className={`w-[34px] h-[20px] cursor-pointer rounded-full relative transition-colors ${showNearby ? "bg-[#38a9d7]" : "bg-[#ccc]"}`}
          >
            <span
              className={`absolute top-[2px] w-[16px] h-[16px] bg-white rounded-full shadow transition-all ${showNearby ? "left-[16px]" : "left-[2px]"}`}
            />
          </button>
        </div>
      </div>

      {/* 차트 */}
      <div className="bg-[#fff] mx-[20px] rounded-[20px] pt-[14px] pb-[10px]">
        <div className="px-[8px]">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart
              data={data.chartData}
              margin={{ top: 5, right: 8, left: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="myStoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3aaedd" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3aaedd" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e5e5"
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#615e83" }}
                tickLine={false}
                axisLine={false}
                interval={1}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="myStore"
                name="내 매장"
                stroke="#3aaedd"
                strokeWidth={2}
                fill="url(#myStoreGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#3aaedd" }}
              />
              {showNearby && (
                <Line
                  type="monotone"
                  dataKey="nearby"
                  name="주변상권"
                  stroke="#ff522c"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#ff522c" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* 범례 */}
        <div className="flex items-center justify-center gap-[24px] mt-[4px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[8px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            <span className="text-[#444] text-[9px]">내 매장</span>
          </div>
          {showNearby && (
            <div className="flex items-center gap-[6px]">
              <div className="w-[8px] h-[4px] bg-[#ff522c] rounded-[30px]" />
              <span className="text-[#444] text-[9px]">주변상권</span>
            </div>
          )}
        </div>
      </div>

      {/* 날짜 선택 */}
      <div className="mx-[20px] bg-[#f0f1f3] rounded-[20px] h-[32px] flex items-center justify-center relative mt-[10px]">
        <button
          onClick={goToPrev}
          className="absolute left-[16px] rotate-180 cursor-pointer"
        >
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path
              d="M1 1L5 5.5L1 10"
              stroke="#666"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="text-[#333] text-[12px] font-bold">
          {data.date} {data.isToday ? "(오늘)" : ""}
        </span>
        <button
          onClick={goToNext}
          className="absolute right-[16px] cursor-pointer"
        >
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path
              d="M1 1L5 5.5L1 10"
              stroke="#666"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {/* 매출 테이블 */}
      <div className="bg-[#f6f7f9] mx-[20px] rounded-[20px] mt-[10px] px-[20px] pt-[12px] pb-[8px]">
        {!collapsed && (
          <>
            <div className="flex justify-between text-[10px] text-[#333] mb-[8px]">
              <span>ITEM</span>
              <span>AMOUNT</span>
            </div>
            <div className="h-[1px] bg-[#e5e5e5] mb-[8px]" />
            {[
              { label: "매출", value: formatKRW(data.sales), bold: false },
              {
                label: "인건비",
                value: `- ${formatKRW(data.laborCost)}`,
                bold: true,
              },
              {
                label: "재료비",
                value: `- ${formatKRW(data.materialCost)}`,
                bold: true,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex justify-between items-center mb-[10px]"
              >
                <span className="text-[#333] text-[12px]">{row.label}</span>
                <span
                  className={`text-[#333] text-[13px] ${row.bold ? "font-bold" : ""}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
            <div className="h-[1px] bg-[#e5e5e5] mb-[8px]" />
          </>
        )}
        <div className="flex justify-between items-center">
          <span className="text-black text-[14px] font-bold">순이익</span>
          <span className="text-[#1f97d3] text-[18px] font-bold">
            {formatKRW(data.netProfit)}
          </span>
        </div>
      </div>

      {/* 접기/펼치기 버튼 */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="mt-[10px] mx-[20px] w-[calc(100%-40px)] h-[32px] cursor-pointer border border-dashed border-[#1f97d3] rounded-[20px] flex items-center justify-center gap-[8px]"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
        >
          <path
            d="M1 6L4 2L7 6"
            stroke="#1f97d3"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[#1f97d3] text-[11px] font-bold">
          {collapsed ? "펼치기" : "접기"}
        </span>
      </button>
    </div>
  );
}
