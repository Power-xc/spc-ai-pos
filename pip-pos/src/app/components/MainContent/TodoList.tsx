import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import {
  getProductionBatchItems,
  getProductionSummary,
} from "../../../lib/api";
import { getProductImageByName } from "../../../lib/productImages";
import type { ProductionBatchItem, ProductionSummary } from "../../../types";
import icoReset from "../../../assets/ico-rest.svg";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

const PAGE_SIZE = 5;

export default function TodoList({ isAiPanelOpen, isSidebarOpen }: MenuProps) {
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [items, setItems] = useState<ProductionBatchItem[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getProductionSummary().then(setSummary);
    getProductionBatchItems().then(setItems);
  }, []);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pagedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      {/* ── 추가 생산 예상 매출 배너 ── */}
      {summary && (
        <div className="bg-[#1d1d1d] border border-[#ebebeb] rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
          {/* 상단 행: 라벨 + 금액 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[10px]">
              <p className="font-bold text-[12px] text-white leading-[21px] whitespace-nowrap">
                추가 생산 시 예상 추가 매출
              </p>
              <div className="w-[1px] h-[10px] bg-white opacity-40" />
              <p className="text-[10px] text-white leading-[21px] whitespace-nowrap">
                역추정 기준 (리드타임 1시간)
              </p>
            </div>
            <p className="font-bold text-[15px] text-white leading-[21px] whitespace-nowrap">
              {summary.expectedRevenue}
            </p>
          </div>
          {/* 하단 행: 경고 문구 + 건수 배지 */}
          <div className="flex items-center justify-between">
            <p className="font-bold text-[12px] text-white leading-[21px] whitespace-nowrap">
              {summary.urgentLabel}
            </p>
            <div className="bg-[rgba(255,255,255,0.15)] rounded-[10px] px-[8px]">
              <p className="font-bold text-[10px] text-white leading-[21px]">
                {summary.urgentCount}건
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 생산관리 에이전트 카드 ── */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden p-[15px] flex flex-col gap-[7px]">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <div className="flex items-center gap-[6px]">
              <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
              <p className="font-bold text-[12px] text-[#555] leading-[20px]">
                생산관리 에이전트
              </p>
            </div>
            <p className="text-[10px] text-[#555] leading-[20px]">
              오늘 생산 배치 현황
            </p>
          </div>
          {/* 갱신 배지 */}
          <div className="flex items-center gap-[6px] bg-[#f1f1f1] rounded-[10px] px-[10px] py-[4px] h-[22px]">
            <img src={icoReset} alt="" />
            <p className="text-[9px] text-[#525252] leading-[8px] text-right">
              5분전 갱신
            </p>
          </div>
        </div>

        {/* 아이템 목록 */}
        <div className="flex flex-col gap-[15px] mt-2 min-h-[455px]">
          {pagedItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-[6px]">
              {/* 상품 정보 행 */}
              <div className="flex items-center gap-[10px]">
                {/* 썸네일 */}
                <img
                  src={getProductImageByName(item.name)}
                  alt={item.name}
                  className="w-[37px] h-[37px] rounded-[10px] shrink-0 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                  }}
                />
                {/* 정보 */}
                <div className="flex flex-col flex-1 min-w-0">
                  {/* 이름 + 상태 배지 */}
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[11px] text-[#222] leading-[14px] truncate w-[215px]">
                      {item.name}
                    </p>
                    {item.status === "생산 완료" && (
                      <div className="bg-[#38a9d7] flex items-center justify-center px-[12px] py-[2px] rounded-[20px] shrink-0">
                        <p className="font-bold text-[9px] text-white leading-[14px]">
                          생산 완료
                        </p>
                      </div>
                    )}
                  </div>
                  {/* 경고/상태 텍스트 + 손실 금액 */}
                  <div className="flex items-center justify-between">
                    <p
                      className="text-[9px] leading-[14px] w-[215px]"
                      style={{ color: item.aiWarning ? "#ff522c" : "#4d4d4d" }}
                    >
                      {item.aiWarning ?? item.status ?? ""}
                    </p>
                    {item.lossAmount && (
                      <p className="font-bold text-[9px] text-[#ff522c] leading-[14px] text-right w-[64px] shrink-0">
                        {item.lossAmount}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 프로그레스 바 영역 */}
              <div className="flex flex-col gap-[6px]">
                {/* 레이블 */}
                <div className="flex items-center justify-between text-[9px] text-black leading-[14px] gap-[8px]">
                  <p className="truncate">
                    {item.currentStockLabel ?? `현재 보유 ${item.currentCount}개`}
                  </p>
                  <p className="shrink-0 text-right">
                    {item.shortageLabel ?? "재고 적정"}
                  </p>
                </div>
                {/* 프로그레스 바 (CSS, SVG 미사용) */}
                <div className="relative h-[10px] rounded-[100px] overflow-hidden bg-[#e6e6e6]">
                  <div
                    className="absolute left-0 top-0 h-full rounded-[100px] transition-all duration-500"
                    style={{
                      width: `${item.progressPercent}%`,
                      backgroundImage:
                        "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 페이지네이션 */}
        <div className="flex items-center justify-end gap-[5px] mt-2">
          {page > 1 && (
            <button
              onClick={() => setPage((p) => p - 1)}
              className="shrink-0 rotate-180"
              aria-label="이전 페이지"
            >
              <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
                <path
                  d="M1 1l3 2.5L1 6"
                  stroke="#595959"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <p className="font-bold text-[9px] text-[#595959] leading-[10px] text-right ">
            {page} / {totalPages || 1}
          </p>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
            className="shrink-0 disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
              <path
                d="M1 1l3 2.5L1 6"
                stroke="#595959"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </ContentWrapper>
  );
}
