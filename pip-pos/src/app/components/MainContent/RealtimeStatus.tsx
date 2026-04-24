import { useState, useEffect, useRef } from "react";
import ContentWrapper from "./ContentWrapper";
import {
  getProductionAgent,
  getOrderAgent,
  getProductAnalysis,
} from "../../../lib/api";
import type {
  ProductionAgentData,
  OrderAgentData,
  ProductAnalysisData,
} from "../../../types";
import icoReset from "../../../assets/ico-rest.svg";
import {
  AreaChart,
  Area,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "../../../lib/recharts";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
  setSelectedMenu: (menu: string) => void;
}

export default function RealtimeStatus({
  isAiPanelOpen,
  isSidebarOpen,
  setSelectedMenu,
}: MenuProps) {
  const [data, setData] = useState<ProductionAgentData | null>(null);
  const [orderData, setOrderData] = useState<OrderAgentData | null>(null);
  const [analysisData, setAnalysisData] = useState<ProductAnalysisData | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (sliderRef.current?.offsetLeft ?? 0);
    scrollLeft.current = sliderRef.current?.scrollLeft ?? 0;
    if (sliderRef.current) sliderRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !sliderRef.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (sliderRef.current) sliderRef.current.style.cursor = "grab";
  };

  useEffect(() => {
    getProductionAgent().then(setData);
    getOrderAgent().then(setOrderData);
    getProductAnalysis().then(setAnalysisData);
  }, []);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      {/* ── 생산관리 에이전트 카드 ── */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-[15px] pt-[14px] pb-[10px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555]">
              생산관리 에이전트
            </p>
          </div>
          {data ? (
            <div className="flex items-center gap-[6px] bg-[#f1f1f1] rounded-[10px] px-[10px] py-[4px]">
              {/* 새로고침 아이콘 */}
              <img src={icoReset} alt="" />
              <p className="text-[9px] text-[#525252]">{data.lastUpdated}</p>
            </div>
          ) : (
            <div className="h-[20px] w-[80px] bg-[#f0f1f3] rounded-[10px] animate-pulse" />
          )}
        </div>

        {/* 상품 칩 목록 */}
        {data ? (
          <div className="flex flex-wrap gap-[8px] px-[15px] pb-[10px] overflow-y-auto max-h-[85px] scrolled mr-4 mb-3">
            {data.items.map((item) =>
              item.isLow ? (
                /* 부족 칩 */
                <div
                  key={item.id}
                  className="flex items-center gap-[14px] bg-[#ebedef] border border-[#ebedef] rounded-[20px] px-[7px]"
                >
                  <div className="flex items-center gap-[16px]">
                    <div className="relative flex items-center">
                      <div
                        className="absolute w-[4px] h-[4px] bg-[#ff522c] rounded-full"
                        style={{ left: 0 }}
                      />
                      <p className="font-bold text-[11px] text-[#222] pl-[8px] leading-[14px]">
                        {item.name}
                      </p>
                    </div>
                    <p className="font-bold text-[11px] text-black leading-[14px]">
                      {item.badgeLabel ?? `${item.quantity}개`}
                    </p>
                  </div>
                  <button
                    className="flex items-center justify-center px-[12px] py-[4px] rounded-[20px] cursor-pointer"
                    style={{
                      background:
                        "linear-gradient(96deg, #3FAF60 50.65%, #3AAEDD 121.87%)",
                    }}
                    onClick={() => setSelectedMenu("발주 관리")}
                  >
                    <p className="font-bold text-[10px] text-white leading-[14px]">
                      부족 발주
                    </p>
                  </button>
                </div>
              ) : (
                /* 정상 칩 */
                <div
                  key={item.id}
                  className="flex items-center bg-white rounded-[20px] px-[10px] py-[4px]"
                  style={{ border: "2px solid rgba(58,171,218,0.22)" }}
                >
                  <div className="flex items-center gap-[16px]">
                    <div className="relative flex items-center">
                      <div
                        className="absolute w-[4px] h-[4px] bg-[#3aaedd] rounded-full"
                        style={{ left: 0 }}
                      />
                      <p className="font-bold text-[11px] text-[#222] pl-[8px] leading-[14px]">
                        {item.name}
                      </p>
                    </div>
                    <p className="font-bold text-[11px] text-black leading-[14px]">
                      {item.badgeLabel ?? `${item.quantity}개`}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-[8px] px-[15px] pb-[10px] mr-4 mb-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-[28px] w-[100px] bg-[#f0f1f3] rounded-[20px] animate-pulse" />
            ))}
          </div>
        )}

        {/* AI 추천 pill */}
        {data ? (
          <div className="mx-[15px] mb-[14px] bg-[#f0f1f3] rounded-[20px] px-[10px] py-[10px]">
            <p className="text-[9px] text-black leading-[14px] block">
              <span className="font-bold">실적 기반 추천 </span>
              <span>: </span>
              <span>{data.aiRecommendation}</span>
            </p>
          </div>
        ) : (
          <div className="mx-[15px] mb-[14px] bg-[#f0f1f3] rounded-[20px] px-[10px] py-[10px]">
            <div className="h-[10px] w-[200px] bg-[#e0e0e0] rounded animate-pulse" />
          </div>
        )}
      </div>

      {/* ── 주문관리 에이전트 ── */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-[15px] pt-[14px] pb-[10px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#3FAF60] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555] flex items-center">
              주문관리 에이전트
              <span className="font-normal text-[10px] text-[#555555] ml-[10px]">
                {orderData?.sectionLabel ?? "실시간 판매 흐름"}
              </span>
            </p>
          </div>
          {orderData && (
            <div className="flex items-center gap-[4px]">
              <p className="font-bold text-[12px] text-[#39acdb]">
                {orderData.todaySales}
              </p>
              <p className="text-[9px] text-[#787878] ml-1">
                {orderData.todaySalesLabel ?? "금일"}
              </p>
            </div>
          )}
        </div>

        {/* 주문 카드 목록 */}
        {orderData && (
          orderData.items.length > 0 ? (
            <div
              ref={sliderRef}
              className="flex gap-[8px] pb-[10px] px-[10px] overflow-x-auto select-none ml-3"
              style={{
                scrollSnapType: "x mandatory",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                cursor: "grab",
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {orderData.items.map((item) => {
                const statusColor =
                  item.status === "완료"
                    ? "#3aaedd"
                    : item.status === "수령"
                      ? "#3faf60"
                      : item.status === "안정"
                        ? "#3aaedd"
                        : "#ff522c";
                return (
                  <div
                    key={item.id}
                    className="flex-shrink-0 border border-[#ebedef] rounded-[20px] px-[12px] py-[10px] w-[103px]"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <div className="flex flex-col gap-[4px]">
                      <div className="flex items-center justify-between text-[8px] leading-[15px]">
                        <span className="text-[#555]">{item.orderId}</span>
                        <span
                          className="font-bold"
                          style={{ color: statusColor }}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                        {item.productName}
                      </p>
                      <p className="font-medium text-[8px] text-[#555] leading-[9px]">
                        {item.type}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-[15px] pb-[10px]">
              <div className="rounded-[14px] bg-[#f7f8f9] px-[12px] py-[10px]">
                <p className="text-[10px] text-[#666] leading-[14px]">
                  {orderData.emptyMessage ?? "표시할 주문 데이터가 없습니다."}
                </p>
              </div>
            </div>
          )
        )}

        {/* 시간대별 매출 차트 */}
        {orderData && orderData.chartData.length > 0 && (
          <div className="px-[15px] pb-[14px] time-chart mt-2">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart
                data={orderData.chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="orderGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3BABDD" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#55B796" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 6.5, fill: "#615e83" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <Tooltip
                  formatter={(v: any) => [`₩${(Number(v) || 0).toLocaleString()}`]}
                  labelFormatter={() => ""}
                  contentStyle={{
                    fontSize: 9,
                    borderRadius: 3,
                    border: "1px solid #e2e2e2",
                    padding: "3px 5px",
                    fontWeight: "bold",
                  }}
                  itemStyle={{ color: "#222", padding: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3AAEDD"
                  strokeWidth={1.5}
                  fill="url(#orderGradient)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── 제품분석 에이전트 ── */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-[15px] pt-[14px] pb-[8px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#F2CA00] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555] flex items-center">
              제품분석 에이전트
              <span className="font-normal text-[10px] text-[#555555] ml-[10px]">
                매출 분석 + 프로모션 효과
              </span>
            </p>
          </div>
          {/* 탭 */}
          {analysisData && (
            <div className="flex gap-[6px]">
              {analysisData.tabs.map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i)}
                  className="px-[10px] py-[3px] rounded-[20px] text-[9px] cursor-pointer transition-colors"
                  style={
                    activeTab === i
                      ? {
                          background: "#3CAADD",
                          color: "#fff",
                          fontWeight: 500,
                        }
                      : {
                          border: "1px solid #d8d8d8",
                          color: "#555",
                          background: "transparent",
                        }
                  }
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 테이블 */}
        {analysisData &&
          (() => {
            const tabName = analysisData.tabs[activeTab];
            const items = analysisData.itemsByTab[tabName] ?? [];
            return (
              <>
                {/* 컬럼 헤더 */}
                <div
                  className="grid px-[15px] pb-[4px] mt-1"
                  style={{
                    gridTemplateColumns: "1fr 36px 90px 110px 110px",
                    gap: "7px",
                  }}
                >
                  <p className="text-[8px] font-bold text-[#555]">상품명</p>
                  <p className="text-[8px] font-bold text-[#555]">수량</p>
                  <p className="text-[8px] font-bold text-[#555]">매출액</p>
                  <p className="text-[8px] font-bold text-[#555]">매출기여</p>
                  <p className="text-[8px] font-bold text-[#555]">프로모션</p>
                </div>
                {/* 구분선 */}
                <div className="mx-[15px] h-[2px] bg-[#f0f1f3] rounded-full mb-[6px]" />
                {/* 데이터 행 */}
                <div className="flex flex-col gap-[8px] px-[15px] pb-[10px]">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="grid items-center"
                      style={{
                        gridTemplateColumns: "1fr 36px 90px 110px 110px",
                        gap: "7px",
                      }}
                    >
                      {/* 상품명 + 트렌드 */}
                      <div className="flex items-center gap-[4px]">
                        {item.trend === "up" ? (
                          <svg
                            width="7"
                            height="6"
                            viewBox="0 0 7 6"
                            fill="none"
                          >
                            <path
                              d="M3.5 0L6.5 5.5H0.5L3.5 0Z"
                              fill="#3AAEDD"
                            />
                          </svg>
                        ) : (
                          <svg
                            width="7"
                            height="6"
                            viewBox="0 0 7 6"
                            fill="none"
                          >
                            <path
                              d="M3.5 6L0.5 0.5H6.5L3.5 6Z"
                              fill="#ff522c"
                            />
                          </svg>
                        )}
                        <p className="text-[9px] text-[#555]">{item.name}</p>
                      </div>
                      {/* 수량 */}
                      <p className="text-[9px] text-[#555]">{item.quantity}</p>
                      {/* 매출액 */}
                      <p className="text-[9px] text-[#555]">
                        ₩
                        <span className="font-bold text-[#222]">
                          {(Number(item.revenue) || 0).toLocaleString()}
                        </span>
                        원
                      </p>
                      {/* 매출기여 progress */}
                      <div className="flex items-center gap-[6px]">
                        <div
                          className="relative h-[8px] rounded-full overflow-hidden flex-1"
                          style={{ background: "rgba(121,121,121,0.2)" }}
                        >
                          <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                              width: `${item.salesContribution}%`,
                              background:
                                "linear-gradient(102deg, #429DDD 50.65%, #3AAEDD 121.87%)",
                            }}
                          />
                        </div>
                        <p className="text-[9px] font-bold text-[#3caadd] whitespace-nowrap w-[24px]">
                          {item.salesContribution}
                          <span className="text-[#555] ml-[0.5px]">%</span>
                        </p>
                      </div>
                      {/* 프로모션 progress */}
                      <div className="flex items-center gap-[6px]">
                        <div
                          className="relative h-[10px] rounded-full overflow-hidden flex-1"
                          style={{ background: "rgba(121,121,121,0.2)" }}
                        >
                          <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                              width: `${item.promotionEffect}%`,
                              background:
                                "linear-gradient(102deg, #3FAF60 50.65%, #3AAEDD 121.87%)",
                            }}
                          />
                        </div>
                        <p className="text-[9px] font-bold text-[#3FAF60] whitespace-nowrap w-[24px]">
                          {item.promotionEffect}
                          <span className="text-[#555] ml-[0.5px]">%</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* AI 상태 pill */}
                <div className="mx-[15px] mb-[14px] bg-[#f0f1f3] rounded-[20px] px-[10px] py-[8px]">
                  <p className="text-[9px] text-black leading-[14px]">
                    <span className="font-bold">AI 상태 </span>
                    <span>: </span>
                    <span>{analysisData.aiStatus}</span>
                  </p>
                </div>
              </>
            );
          })()}
      </div>
    </ContentWrapper>
  );
}
