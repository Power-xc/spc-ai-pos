import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import { getAiPerformanceData } from "../../../lib/api";
import { resolveProductDisplayName } from "../../../lib/productNameResolver";
import { getDemoDate } from "../../../lib/demoDateTime";
import type { AiPerformanceData, PerformanceTab } from "../../../types";
import {
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "../../../lib/recharts";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

const TABS: PerformanceTab[] = ["일별", "주별", "월별"];

function fmt(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K";
  return String(n);
}

function fmtWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export default function AiPerformance({
  isAiPanelOpen,
  isSidebarOpen,
}: MenuProps) {
  const [activeTab, setActiveTab] = useState<PerformanceTab>("일별");
  const [data, setData] = useState<AiPerformanceData | null>(null);

  useEffect(() => {
    getAiPerformanceData(activeTab).then(setData);
  }, [activeTab]);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      <div className="flex flex-col gap-[14px]">
        {/* ── 탭 ── */}
        <div className="flex items-center gap-[4px]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-[10px] py-[3px] rounded-[20px] text-[10px] font-bold cursor-pointer transition-colors"
                style={
                  isActive
                    ? {
                        backgroundImage:
                          "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                        color: "#fff",
                      }
                    : {
                        border: "1px solid #d8d8d8",
                        color: "#555",
                        backgroundColor: "#fff",
                      }
                }
              >
                {tab}
              </button>
            );
          })}
        </div>

        {data && (
          <>
            {/* ── Row 1: 시간대별 + 카테고리별 ── */}
            <div className="flex gap-[14px]">
              {/* 시간대별 매출 추이 */}
              <div className="flex-1 bg-white rounded-[20px] px-[16px] pt-[14px] pb-[10px] flex flex-col gap-[8px]">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[4px]">
                    <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]"></span>
                    시간대별 매출 추이
                  </p>
                  <p className="text-[9px] text-[#888] leading-[14px]">
                    오늘 vs 전주 평균 · POS vs 배달
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart
                    data={data.hourlySales}
                    margin={{ top: 4, right: 4, left: -35, bottom: -10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f0f1f3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 8, fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 8, fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmt}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        fmt(v),
                        name === "pos"
                          ? "POS"
                          : name === "delivery"
                            ? "배달"
                            : "전주평균",
                      ]}
                      contentStyle={{
                        fontSize: 9,
                        borderRadius: 8,
                        border: "1px solid #f0f1f3",
                      }}
                    />
                    <Bar
                      dataKey="pos"
                      stackId="a"
                      fill="#3aaedd"
                      radius={[0, 0, 0, 0]}
                      barSize={14}
                    />
                    <Bar
                      dataKey="delivery"
                      stackId="a"
                      fill="#3faf60"
                      radius={[3, 3, 0, 0]}
                      barSize={14}
                    />
                    <Line
                      type="monotone"
                      dataKey="prevAvg"
                      stroke="#333"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {/* 범례 */}
                <div className="flex items-center gap-[10px] justify-center">
                  {[
                    { color: "#3aaedd", label: "POS 추정" },
                    { color: "#3faf60", label: "배달 추정" },
                    { color: "#333", label: "비교 기준선", line: true },
                  ].map(({ color, label, line }) => (
                    <div key={label} className="flex items-center gap-[3px]">
                      {line ? (
                        <div
                          className="w-[14px] h-[2px] rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ) : (
                        <div
                          className="w-[8px] h-[8px] rounded-[2px]"
                          style={{ backgroundColor: color }}
                        />
                      )}
                  <p className="text-[8px] text-[#888]">{label}</p>
                  </div>
                  ))}
                </div>
                <p className="text-[7px] text-[#aaa] text-center leading-[10px]">
                  채널별 금액은 총매출 기준 추정값이며, 기준선은 전일 동시간 수익 프로필입니다.
                </p>
              </div>

              {/* 상품별 목표 달성률 */}
                <div className="w-[220px] shrink-0 bg-white rounded-[20px] px-[14px] pt-[14px] pb-[14px] flex flex-col gap-[7px]">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[4px]">
                    <span className="w-[7px] h-[4px] bg-[#888] rounded-[30px]"></span>
                    상품별 매출 기준선
                  </p>
                  <p className="text-[9px] text-[#888] leading-[14px]">
                    오늘 매출 / 기준선
                  </p>
                </div>
                <div className="flex flex-col gap-[10px]">
                  {data.categorySales.map((cat) => {
                    const pct = Math.round((cat.today / cat.goal) * 100);
                    const color =
                      pct >= 90 ? "#3faf60" : pct >= 70 ? "#f0ad4e" : "#ff522c";
                    return (
                      <div key={cat.id} className="flex flex-col gap-[4px]">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-[10px] text-[#222]">
                            {resolveProductDisplayName(cat.name)}
                          </p>
                          <p
                            className="font-bold text-[9px]"
                            style={{ color }}
                          >
                            기준선 대비 {pct}%
                          </p>
                        </div>
                        <p className="text-[8px] text-[#888] leading-none">
                          {fmtWon(cat.today)} / {fmtWon(cat.goal)}
                        </p>
                        <div className="w-full h-[6px] bg-[#f0f1f3] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Row 2: 프로모션 성과 분석 ── */}
            <div className="bg-white rounded-[20px] px-[16px] pt-[14px] pb-[10px] flex flex-col gap-[8px]">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[4px]">
                  <span className="w-[7px] h-[4px] bg-[#3faf60] rounded-[30px]"></span>
                  프로모션 성과 분석
                </p>
                <p className="text-[9px] text-[#888] leading-[14px]">
                  캠페인별 결제건수/매출 점유율 · 매출 기여도
                </p>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart
                  data={data.promotionWeekly}
                  margin={{ top: 4, right: 8, left: -40, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f0f1f3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 8, fill: "#888" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: "#888" }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 80]}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      v + "%",
                      name === "billShare"
                        ? "결제건수 점유율"
                        : name === "salesShare"
                          ? "매출 점유율"
                          : "매출 기여도",
                    ]}
                    contentStyle={{
                      fontSize: 9,
                      borderRadius: 8,
                      border: "1px solid #f0f1f3",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="billShare"
                    stroke="#333"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#333" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="salesShare"
                    stroke="#3aaedd"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3aaedd" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="salesContribution"
                    stroke="#3faf60"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3faf60" }}
                  />
                </LineChart>
              </ResponsiveContainer>
              {/* 범례 */}
              <div className="flex items-center gap-[10px] justify-center">
                {[
                    { color: "#333", label: "결제건수 점유율" },
                    { color: "#3aaedd", label: "매출 점유율" },
                    { color: "#3faf60", label: "매출 기여도" },
                  ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-[3px]">
                    <div
                      className="w-[14px] h-[2px] rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <p className="text-[8px] text-[#888]">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[7px] text-[#aaa] leading-[10px] text-center">
                캠페인별 결제건수와 매출의 상대적 점유율입니다. (집계 기준: {getDemoDate()}까지)
              </p>
            </div>

            {/* ── Row 3: 결제 유형 + KPI ── */}
            <div className="flex gap-[14px]">
              {/* 결제 유형 분석 */}
              <div className="flex-1 bg-white rounded-[20px] px-[16px] pt-[14px] pb-[14px] flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[4px]">
                    <span className="w-[7px] h-[4px] bg-[#888] rounded-[30px]"></span>
                    결제수단별 매출 비중
                  </p>
                  <p className="text-[9px] text-[#888] leading-[14px]">
                    매출 비중 기준
                  </p>
                </div>
                <div className="flex flex-col gap-[10px]">
                  {data.paymentTypes.map((pt) => (
                    <div key={pt.id} className="flex flex-col gap-[4px]">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-[#222] font-bold">
                          {pt.label}
                        </p>
                        <p
                          className="font-bold text-[9px]"
                          style={{ color: pt.color }}
                        >
                          매출 비중 {pt.percent}%
                        </p>
                      </div>
                      <div className="w-full h-[6px] bg-[#f0f1f3] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pt.percent}%`,
                            backgroundColor: pt.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 우리 매장 핵심 지표 */}
              <div className="flex-1 bg-white rounded-[20px] px-[16px] pt-[14px] pb-[15px] flex flex-col gap-[10px]">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[4px]">
                    <span className="w-[7px] h-[4px] bg-[#3faf60] rounded-[30px]"></span>
                    우리 매장 핵심 지표
                  </p>
                  <p className="text-[9px] text-[#888] leading-[14px]">
                    총매출 및 전일비
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-[10px]">
                  {data.kpis.map((kpi) => (
                    <div
                      key={kpi.id}
                      className="flex flex-col gap-[2px] border border-[#f0f1f3] rounded-[12px] px-[10px] py-[8px]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] text-[#888] leading-[13px]">
                          {kpi.label}
                        </p>
                        <div className="flex items-center gap-[2px]">
                          <span
                            className="text-[7px] font-bold leading-none "
                            style={{
                              color:
                                kpi.changeType === "up" ? "#3faf60" : "#888",
                            }}
                          >
                            {kpi.changeType === "up" ? "▲" : "▼"}
                          </span>
                          <p
                            className="text-[8px] font-bold leading-none"
                            style={{
                              color:
                                kpi.changeType === "up" ? "#3faf60" : "#888",
                            }}
                          >
                            {kpi.change}
                          </p>
                        </div>
                      </div>

                      <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[7px] text-[#aaa] leading-[10px] text-center">
                  주문 수와 객단가는 실제 주문 기준 데이터 연결 후 표시됩니다.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </ContentWrapper>
  );
}
