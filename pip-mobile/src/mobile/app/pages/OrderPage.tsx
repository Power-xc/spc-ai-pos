import { useState, useEffect, useMemo } from "react";
import { usePagination } from "@/mobile/hooks/usePagination";
import type {
  OrderPageData,
  OrderItem,
  AiRecommendedItem,
  OrderSubmitResult,
} from "@/mobile/types";
import { getOrderPageData, submitOrder } from "@/mobile/lib/api";
import { Toast } from "@/mobile/app/components/Toast";
import { ProductImage } from "../components/ProductImage";
import icoPipAi from "@/mobile/assets/icons/ico-recent-pip-ai.svg";

type OrderFlowStep = "list" | "confirm" | "done";
const SUCCESS_GRADIENT = "linear-gradient(97deg, #3faf60 0%, #3aaedd 100%)";

const PAGE_SIZE = 4;
const PAGE_SIZE_CONFIRM = 5;
const CATEGORIES = ["전체", "도넛", "먼치킨", "원재료", "포장"] as const;
const SORTS = ["최신순", "이름순", "단가 낮은순", "단가 높은순"] as const;

const CATEGORY_BG: Record<string, string> = {
  도넛: "bg-[#ebedef]",
  먼치킨: "bg-[#f0e6ff]",
  원재료: "bg-[#e8f5e9]",
  포장: "bg-[#fde8e8]",
};

// ──────────────────────────────────────────────
// AI 추천 캐러셀 카드
// ──────────────────────────────────────────────
function AiProductCard({
  item,
  added,
  onAdd,
}: {
  item: AiRecommendedItem;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="bg-[#f6f7f9] border border-[#ebedef] rounded-[20px] px-[12px] py-[11px] flex flex-col gap-[10px] w-[136px] shrink-0">
      <p className="text-center text-[11px] leading-[14px]">
        <span className="text-[#6f6f6f]">추천 </span>
        <span className="font-bold text-[13px] text-black">
          {item.recommendedQty}
        </span>
        <span className="text-[#6f6f6f]">개</span>
      </p>
      <div
        className={`w-full aspect-square rounded-[21px] border border-[#dfdfdf] overflow-hidden ${CATEGORY_BG["도넛"]}`}
      >
        <ProductImage
          name={item.name}
          className="w-full h-full object-cover"
        />
      </div>
      <p className="text-[#555] text-[11px] text-center leading-[15px]">
        {item.name}
      </p>
      <p className="text-[#0f87c8] text-[11px] text-center leading-[15px] font-bold">
        {item.unitPrice.toLocaleString()}원
      </p>
      <p className="text-center text-[11px] leading-[14px]">
        <span className="text-[#6f6f6f]">재고 </span>
        <span className="font-bold text-[13px] text-black">
          {item.currentStock}
        </span>
        <span className="text-[#6f6f6f]">개</span>
      </p>
      <button
        onClick={onAdd}
        className={`w-full h-[28px] rounded-[14px] text-[12px] font-bold transition-colors ${
          added ? "bg-[#888] text-white" : "bg-[#0f87c8] text-white"
        }`}
      >
        {added ? "담김" : "담기"}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// 발주 목록 행
// ──────────────────────────────────────────────
function OrderItemRow({
  item,
  qty,
  onQtyChange,
}: {
  item: OrderItem;
  qty: number;
  onQtyChange: (delta: number) => void;
}) {
  return (
    <div className="bg-white rounded-[20px] px-[12px] py-[10px] flex items-center justify-between">
      <div className="flex items-center gap-[10px]">
        <div
          className={`w-[48px] h-[48px] rounded-[16px] shrink-0 overflow-hidden ${CATEGORY_BG[item.category] ?? "bg-[#ebedef]"}`}
        >
          <ProductImage
            name={item.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col">
          <p className="text-[#222] text-[15px] font-bold leading-[22px]">
            {item.name}
          </p>
          <p className="text-[#636363] text-[12px] leading-[18px]">
            {item.category}류 / 재고{" "}
            <span className="font-bold">{item.stock}</span>개 /{" "}
            <span className="text-[#0f87c8] font-bold">{item.unitPrice.toLocaleString()}원</span>
          </p>
        </div>
      </div>
      {/* 수량 스테퍼 */}
      <div className="flex items-center gap-[6px]">
        <button
          onClick={() => onQtyChange(-1)}
          className="w-[22px] h-[22px] rounded-full border border-[#ccc] flex items-center justify-center shrink-0"
        >
          <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
            <line
              x1="1"
              y1="1"
              x2="7"
              y2="1"
              stroke="#555"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <p className="font-bold text-[15px] text-black min-w-[34px] text-center">
          {qty}개
        </p>
        <button
          onClick={() => onQtyChange(1)}
          className="w-[22px] h-[22px] rounded-full bg-[#2892c2] flex items-center justify-center shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line
              x1="4"
              y1="1"
              x2="4"
              y2="7"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="1"
              y1="4"
              x2="7"
              y2="4"
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

// ──────────────────────────────────────────────
// AI 발주 바텀시트
// ──────────────────────────────────────────────
function AiOrderSheet({
  items,
  quantities,
  allAdded,
  onClose,
  onConfirm,
  onQtyChange,
}: {
  items: AiRecommendedItem[];
  quantities: Record<string, number>;
  allAdded: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onQtyChange: (id: string, delta: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const totalQty = items.reduce((sum, item) => sum + (quantities[item.id] ?? item.recommendedQty), 0);

  return (
    <>
      {/* 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/50 z-[9998] transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* 시트 패널 */}
      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white rounded-t-[20px] z-[9999] max-h-[80vh] flex flex-col transition-transform duration-300 ease-out ${visible ? "translate-y-0" : "translate-y-full"}`}>
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-[10px] pb-[4px] shrink-0">
          <div className="w-[36px] h-[4px] rounded-full bg-[#d8d8d8]" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-[20px] pt-[10px] pb-[14px] shrink-0">
          <div className="flex items-center gap-[8px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="13" viewBox="0 0 12 13" fill="none">
              <path
                d="M10.8674 6.47235L7.2792 7.8858L5.97448 11.7731C5.94402 11.862 5.88917 11.9386 5.8173 11.9928C5.74543 12.0469 5.65999 12.076 5.57245 12.076C5.48491 12.076 5.39947 12.0469 5.3276 11.9928C5.25573 11.9386 5.20088 11.862 5.17042 11.7731L3.86785 7.8858L0.279604 6.47235C0.197536 6.43935 0.126756 6.37993 0.0767734 6.30207C0.0267908 6.22422 0 6.13165 0 6.03682C0 5.94199 0.0267908 5.84942 0.0767734 5.77157C0.126756 5.69371 0.197536 5.63429 0.279604 5.60129L3.86785 4.19017L5.17256 0.302904C5.20303 0.213997 5.25788 0.137319 5.32974 0.0831711C5.40161 0.0290234 5.48705 0 5.57459 0C5.66213 0 5.74758 0.0290234 5.81944 0.0831711C5.89131 0.137319 5.94616 0.213997 5.97662 0.302904L7.28134 4.19017L10.8696 5.60361C10.9509 5.63728 11.0208 5.69694 11.07 5.77467C11.1192 5.8524 11.1455 5.94451 11.1453 6.03878C11.145 6.13305 11.1183 6.22502 11.0687 6.30246C11.0191 6.3799 10.9489 6.43915 10.8674 6.47235Z"
                fill="#0f87c8"
              />
            </svg>
            <span className="font-bold text-[14px] text-black">실적 기반 추천 전체</span>
            <span className="bg-[#ebedef] text-[#555] text-[12px] font-bold px-[8px] py-[2px] rounded-full">
              {items.length}건
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] flex items-center justify-center rounded-full bg-[#f2f2f2]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="1" y1="1" x2="9" y2="9" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 아이템 목록 */}
        <div className="overflow-y-auto flex-1">
          {items.map((item, idx) => {
            const qty = quantities[item.id] ?? item.recommendedQty;
            return (
              <div key={item.id}>
                <div className="flex items-center px-[20px] py-[14px] gap-[14px]">
                  {/* 이미지 */}
                  <div className="w-[52px] h-[52px] rounded-[14px] shrink-0 overflow-hidden bg-[#ebedef]">
                    <ProductImage
                      name={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-[15px] text-black leading-[22px] truncate block">
                      {item.name}
                    </span>
                    <p className="text-[12px] text-[#888] leading-[18px] truncate">
                      재고 {item.currentStock}개
                      <span className="text-[#0f87c8] font-bold"> · AI 예측 {item.recommendedQty}개</span>
                    </p>
                  </div>
                  {/* 스테퍼 */}
                  <div className="flex items-center gap-[6px] shrink-0">
                    <button
                      onClick={() => onQtyChange(item.id, -1)}
                      className="w-[26px] h-[26px] rounded-full border border-[#ddd] flex items-center justify-center"
                    >
                      <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
                        <line x1="1" y1="1" x2="7" y2="1" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    <span className="font-bold text-[14px] text-black min-w-[36px] text-center">{qty}개</span>
                    <button
                      onClick={() => onQtyChange(item.id, 1)}
                      className="w-[26px] h-[26px] rounded-full bg-[#0f87c8] flex items-center justify-center"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <line x1="4" y1="1" x2="4" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="1" y1="4" x2="7" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                {idx < items.length - 1 && (
                  <div className="h-[1px] bg-[#ebedef] mx-[20px]" />
                )}
              </div>
            );
          })}
        </div>

        {/* 담기 버튼 */}
        <div className="px-[16px] py-[14px] shrink-0">
          <button
            onClick={onConfirm}
            className="w-full h-[50px] rounded-[24px] font-bold text-[13px] text-white flex items-center justify-center gap-[6px]"
            style={{ background: SUCCESS_GRADIENT }}
          >
            <span>
              {items.length}건 {allAdded ? "담기 완료" : "담기"}
            </span>
            <span className="opacity-60 font-normal">·</span>
            <span>총 {totalQty}개</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// 발주 확인 페이지 - 품목 행
// ──────────────────────────────────────────────
function ConfirmItemRow({
  item,
  qty,
  onQtyChange,
}: {
  item: OrderItem;
  qty: number;
  onQtyChange: (delta: number) => void;
}) {
  return (
    <div className="bg-white rounded-[20px] px-[12px] py-[10px] flex items-center justify-between">
      <div className="flex items-center gap-[10px]">
        <div
          className={`w-[48px] h-[48px] rounded-[16px] shrink-0 overflow-hidden ${CATEGORY_BG[item.category] ?? "bg-[#ebedef]"}`}
        >
          <ProductImage
            name={item.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col">
          <p className="text-[#222] text-[15px] font-bold leading-[22px]">{item.name}</p>
          <p className="text-[#636363] text-[12px] leading-[18px]">
            {item.category}류 / 재고 <span className="font-bold">{item.stock}</span>개
          </p>
        </div>
      </div>
      <div className="flex items-center gap-[10px]">
        <button
          onClick={() => onQtyChange(-1)}
          className="w-[22px] h-[22px] rounded-full border border-[#ccc] flex items-center justify-center shrink-0"
        >
          <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
            <line x1="1" y1="1" x2="7" y2="1" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <p className="font-bold text-[15px] text-black min-w-[34px] text-right">{qty}개</p>
        <button
          onClick={() => onQtyChange(1)}
          className="w-[22px] h-[22px] rounded-full bg-[#2892c2] flex items-center justify-center shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line x1="4" y1="1" x2="4" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="4" x2="7" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 발주 확인 페이지 (납품 시간대별 그룹)
// ──────────────────────────────────────────────
function OrderConfirmPage({
  data,
  quantities,
  submitting,
  onQtyChange,
  onBack,
  onSubmit,
}: {
  data: OrderPageData;
  quantities: Record<string, number>;
  submitting: boolean;
  onQtyChange: (id: string, delta: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const orderedItems = data.items.filter((item) => (quantities[item.id] ?? 0) > 0);

  const [slotPages, setSlotPages] = useState<Record<string, number>>({});

  const slotOrder: string[] = [];
  const groupMap: Record<string, { time: string; items: OrderItem[] }> = {};
  for (const item of orderedItems) {
    const slot = item.deliverySlot ?? "새벽 납품";
    const time = item.deliveryTime ?? "";
    if (!groupMap[slot]) {
      slotOrder.push(slot);
      groupMap[slot] = { time, items: [] };
    }
    groupMap[slot].items.push(item);
  }

  const totalItems = orderedItems.length;
  const totalQty = orderedItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);
  const totalAmount = orderedItems.reduce(
    (sum, item) => sum + (quantities[item.id] ?? 0) * item.unitPrice,
    0
  );

  return (
    <div className="px-[15px] pt-[12px] flex flex-col gap-[12px] pb-[100px]">
      {/* 총 발주 금액 카드 */}
      <div className="bg-black rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[7px]">
            <div className="bg-[#fed400] h-[3.675px] w-[6.972px] rounded-full shrink-0" />
            <span className="text-white font-bold text-[13px] leading-[20px]">총 발주 금액</span>
          </div>
          <span className="text-white text-[12px] leading-[18px]">
            <span className="font-bold">{totalItems}</span>{" "}
            <span className="font-normal">품목</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-white text-[18px] leading-[24px]">
            <span className="font-normal">₩</span>
            <span className="font-bold">{totalAmount.toLocaleString()}</span>
          </p>
          <p className="text-white text-[12px] leading-[20px]">
            총 <span className="text-[#fed400] font-bold">{totalQty}</span> 개
          </p>
        </div>
      </div>

      {/* 납품 시간대별 섹션 */}
      {slotOrder.map((slot) => {
        const { time, items: slotItems } = groupMap[slot];
        const subtotal = slotItems.reduce(
          (sum, item) => sum + (quantities[item.id] ?? 0) * item.unitPrice,
          0
        );
        const slotTotalPages = Math.max(
          1,
          Math.ceil(slotItems.length / PAGE_SIZE_CONFIRM)
        );
        const rawSlotPage = slotPages[slot] ?? 1;
        const slotPage = Math.min(Math.max(1, rawSlotPage), slotTotalPages);
        const pagedSlotItems = slotItems.slice(
          (slotPage - 1) * PAGE_SIZE_CONFIRM,
          slotPage * PAGE_SIZE_CONFIRM
        );
        return (
          <div key={slot} className="flex flex-col gap-[10px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <span className="font-bold text-[13px] text-[#222] leading-[20px]">{slot}</span>
                <span className="text-[#636363] text-[12px] leading-[20px]">{time}</span>
              </div>
              <span className="text-[12px] leading-[20px]">
                <span className="font-bold text-black">{slotItems.length}</span>{" "}
                <span className="text-[#636363]">품목</span>
              </span>
            </div>

            <div className="flex flex-col gap-[8px]">
              {pagedSlotItems.map((item) => (
                <ConfirmItemRow
                  key={item.id}
                  item={item}
                  qty={quantities[item.id] ?? item.recommendedQty}
                  onQtyChange={(delta) => onQtyChange(item.id, delta)}
                />
              ))}
            </div>

            {/* 슬롯별 페이지네이션 */}
            {slotTotalPages > 1 && (
              <div className="flex items-center justify-center gap-[25px] py-[6px]">
                <button
                  onClick={() =>
                    setSlotPages((prev) => ({
                      ...prev,
                      [slot]: Math.max(1, (prev[slot] ?? 1) - 1),
                    }))
                  }
                  disabled={slotPage === 1}
                  className="cursor-pointer disabled:opacity-30"
                >
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path
                      d="M5 1L1 5L5 9"
                      stroke="#555"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <span className="text-[#555] text-[11px]">
                  <span className="font-bold">{slotPage}</span>
                  {` / ${slotTotalPages}`}
                </span>
                <button
                  onClick={() =>
                    setSlotPages((prev) => ({
                      ...prev,
                      [slot]: Math.min(slotTotalPages, (prev[slot] ?? 1) + 1),
                    }))
                  }
                  disabled={slotPage === slotTotalPages}
                  className="cursor-pointer disabled:opacity-30"
                >
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                    <path
                      d="M1 1L5 5L1 9"
                      stroke="#555"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex justify-end pr-[4px]">
              <p className="text-[#222] text-[12px] leading-[18px]">
                소계 ₩<span className="font-bold">{subtotal.toLocaleString()}</span>
              </p>
            </div>
          </div>
        );
      })}

      {/* 최종 발주 확정 바 */}
      <div className="fixed bottom-[80px] left-1/2 -translate-x-1/2 w-full max-w-[390px] px-[20px] z-30 flex items-center gap-[8px]">
        <button
          onClick={onBack}
          aria-label="발주 목록으로"
          className="shrink-0 w-[46px] h-[46px] rounded-[20px] bg-white border border-[#d8d8d8] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M7 1L1 7L7 13" stroke="#555" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || totalItems === 0}
          className="flex-1 bg-black rounded-[20px] flex items-center justify-between px-[19px] py-[9px] disabled:opacity-70"
        >
          <div className="flex items-center gap-[7px]">
            <div className="bg-[#aed6e8] h-[3.675px] w-[6.972px] rounded-full shrink-0" />
            <div className="bg-white/20 rounded-full px-[15px] py-[4px]">
              <span className="text-white text-[12px] leading-[18px]">
                <span className="font-normal">₩</span>
                <span className="font-bold">{totalAmount.toLocaleString()}</span>
              </span>
            </div>
          </div>
          <span className="text-white font-medium text-[13px] leading-[20px]">
            {submitting ? "전송 중…" : "최종 발주 확정"}
          </span>
          {submitting ? (
            <span className="w-[11px]" aria-hidden />
          ) : (
            <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
              <path d="M1 1L5 5.5L1 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 발주 완료 페이지
// ──────────────────────────────────────────────

// 메인 탭 패턴: 작은 SVG 아이콘 + 한글 굵은 라벨 + 영문 UPPERCASE 부제
function CardHeader({
  icon,
  label,
  sublabel,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-[20px] pt-[15px] pb-[10px]">
      <div className="flex items-center gap-[7px]">
        {icon}
        <span className="text-[#555] text-[13px] font-bold leading-[20px]">{label}</span>
        <span className="text-[#787878] text-[9px] leading-[20px]">{sublabel}</span>
      </div>
      {right}
    </div>
  );
}

const ITEM_DETAIL_PAGE_SIZE = 10;

function OrderCompletePage({
  result,
  onHome,
  onViewHistory,
}: {
  result: OrderSubmitResult;
  onHome: () => void;
  onViewHistory: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [itemPage, setItemPage] = useState(1);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const itemTotalPages = Math.max(
    1,
    Math.ceil(result.confirmedItems.length / ITEM_DETAIL_PAGE_SIZE),
  );
  const safeItemPage = Math.min(Math.max(1, itemPage), itemTotalPages);
  const pagedItems = result.confirmedItems.slice(
    (safeItemPage - 1) * ITEM_DETAIL_PAGE_SIZE,
    safeItemPage * ITEM_DETAIL_PAGE_SIZE,
  );

  return (
    <div
      className={`px-[15px] pt-[12px] flex flex-col gap-[12px] transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 검정 요약 카드 — OrderPage의 AI 추천 카드 스타일 계승(검정+옐로 도트) */}
      <div className="bg-black rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[12px]">
        <div className="flex items-center justify-between gap-[8px]">
          <div className="flex items-center gap-[7px] min-w-0">
            <div className="bg-[#fed400] h-[3.675px] w-[6.972px] rounded-full shrink-0" />
            <span className="text-white font-bold text-[13px] leading-[20px] shrink-0">
              발주 완료 요약
            </span>
          </div>
          <span className="shrink-0 px-[8px] py-[2px] rounded-full bg-[rgba(255,255,255,0.12)] text-white text-[10px] font-medium leading-[16px]">
            {result.orderId}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <p className="text-white">
            <span className="text-[13px] font-normal">₩ </span>
            <span className="text-[24px] font-bold leading-[30px]">
              {result.totalAmount.toLocaleString()}
            </span>
          </p>
          <p className="text-white/80 text-[11px]">
            총 <span className="text-[#fed400] font-bold">{result.totalQty}</span> 개
          </p>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/60">발주일시</span>
            <span className="text-white">{result.submittedAt}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/60">품목수</span>
            <span className="text-white">{result.totalItems} 품목</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/60">납품구분</span>
            <span className="text-white">{result.slotCount}개 시간대</span>
          </div>
        </div>
      </div>

      {/* 납품 일정 — DailySalesCard 구조(흰 카드+아이콘 헤더+중첩 회색 영역) */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[14px]">
        <CardHeader
          icon={
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#555" strokeWidth="1.3" />
              <path d="M6 3V6L8 7.5" stroke="#555" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          label="납품 일정"
          sublabel="DELIVERY SCHEDULE"
          right={
            <span className="text-[#787878] text-[10px]">
              <span className="font-bold text-[#1f97d3]">{result.slotCount}</span>회
            </span>
          }
        />
        <div className="px-[20px] pt-[2px] pb-[4px]">
          <div className="flex flex-col">
            {result.slots.map((slot, idx) => {
              const isLast = idx === result.slots.length - 1;
              return (
                <div key={slot.slot} className="flex gap-[12px]">
                  <div className="flex flex-col items-center pt-[4px]">
                    <div
                      className={`w-[9px] h-[9px] rounded-full ${
                        isLast
                          ? "border-[1.5px] border-[#1f97d3] bg-white"
                          : "bg-[#1f97d3]"
                      }`}
                    />
                    {!isLast && (
                      <div className="w-[1.5px] flex-1 bg-[#d6e4ec] my-[2px]" />
                    )}
                  </div>
                  <div className={`flex-1 ${isLast ? "" : "pb-[12px]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[#333] text-[13px] font-bold leading-[18px]">
                        {slot.slot}
                      </span>
                      <span className="text-[#333] text-[13px] font-bold leading-[18px]">
                        ₩ {slot.amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-[2px]">
                      <span className="text-[#787878] text-[10px]">
                        {slot.time}
                      </span>
                      <span className="text-[#787878] text-[10px]">
                        {slot.itemCount} 품목
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 품목 상세 — DailySalesCard의 '접기/펼치기' 점선 버튼 패턴 */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[10px]">
        <CardHeader
          icon={
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="2" width="9" height="1.4" rx="0.7" fill="#555" />
              <rect x="1.5" y="5.3" width="9" height="1.4" rx="0.7" fill="#555" />
              <rect x="1.5" y="8.6" width="9" height="1.4" rx="0.7" fill="#555" />
            </svg>
          }
          label="품목 상세"
          sublabel="ITEM DETAIL"
          right={
            <span className="text-[#787878] text-[10px]">
              <span className="font-bold text-[#333]">{result.totalItems}</span> 품목
            </span>
          }
        />
        <div
          className={`transition-[max-height] duration-300 overflow-hidden ${
            expanded ? "max-h-[2000px]" : "max-h-0"
          }`}
        >
          <div className="mx-[20px] bg-[#f6f7f9] rounded-[20px] px-[16px] py-[10px] flex flex-col gap-[6px]">
            <div className="flex justify-between text-[10px] text-[#333] mb-[2px]">
              <span>ITEM</span>
              <span>AMOUNT</span>
            </div>
            <div className="h-px bg-[#e5e5e5]" />
            {pagedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-[4px]"
              >
                <div className="flex-1 min-w-0 pr-[8px]">
                  <p className="text-[#333] text-[13px] font-medium truncate leading-[18px]">
                    {item.name}
                  </p>
                  <p className="text-[#787878] text-[10px] leading-[14px] mt-[1px]">
                    {item.deliverySlot} · {item.qty} {item.unit}
                  </p>
                </div>
                <span className="text-[#333] text-[13px] font-bold shrink-0">
                  ₩ {(item.qty * item.unitPrice).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {itemTotalPages > 1 && (
            <div className="flex items-center justify-center gap-[25px] py-[8px]">
              <button
                onClick={() => setItemPage((p) => Math.max(1, p - 1))}
                disabled={safeItemPage === 1}
                aria-label="이전 페이지"
                className="cursor-pointer disabled:opacity-30"
              >
                <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                  <path
                    d="M5 1L1 5L5 9"
                    stroke="#555"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="text-[#555] text-[11px]">
                <span className="font-bold">{safeItemPage}</span>
                {` / ${itemTotalPages}`}
              </span>
              <button
                onClick={() =>
                  setItemPage((p) => Math.min(itemTotalPages, p + 1))
                }
                disabled={safeItemPage === itemTotalPages}
                aria-label="다음 페이지"
                className="cursor-pointer disabled:opacity-30"
              >
                <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                  <path
                    d="M1 1L5 5L1 9"
                    stroke="#555"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-[10px] mx-[20px] w-[calc(100%-40px)] h-[32px] cursor-pointer border border-dashed border-[#1f97d3] rounded-[20px] flex items-center justify-center gap-[8px]"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path
              d="M1 2L4 6L7 2"
              stroke="#1f97d3"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[#1f97d3] text-[11px] font-bold">
            {expanded ? "접기" : "펼치기"}
          </span>
        </button>
      </div>

      {/* 이후 안내 — 연한 회색 카드, 불릿 리스트 */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[14px]">
        <CardHeader
          icon={
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#555" strokeWidth="1.3" />
              <line x1="6" y1="5" x2="6" y2="9" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="6" cy="3.2" r="0.75" fill="#555" />
            </svg>
          }
          label="이후 진행 안내"
          sublabel="NEXT STEPS"
        />
        <ul className="px-[20px] flex flex-col gap-[6px] text-[#333] text-[12px] leading-[18px]">
          <li className="flex items-start gap-[6px]">
            <span className="text-[#1f97d3] mt-[1px]">•</span>
            <span>각 납품 시간 <span className="font-bold">1시간 전 알림톡</span>이 발송됩니다</span>
          </li>
          <li className="flex items-start gap-[6px]">
            <span className="text-[#1f97d3] mt-[1px]">•</span>
            <span>납품 직전까지 <span className="font-bold">공급사 콜센터</span>에서 변경 요청 가능</span>
          </li>
          <li className="flex items-start gap-[6px]">
            <span className="text-[#1f97d3] mt-[1px]">•</span>
            <span>발주서 PDF는 <span className="font-bold">[전체] 탭 &gt; 발주 내역</span>에서 확인</span>
          </li>
        </ul>
      </div>

      <div className="h-[100px]" />

      {/* 하단 고정 CTA — 보조(흰) + 메인(검정) */}
      <div className="fixed bottom-[90px] left-1/2 -translate-x-1/2 w-full max-w-[390px] px-[15px] z-30 flex gap-[8px]">
        <button
          onClick={onViewHistory}
          className="w-[108px] h-[48px] rounded-[20px] bg-white border border-[#d8d8d8] text-[#333] text-[13px] font-bold shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
        >
          내역 보기
        </button>
        <button
          onClick={onHome}
          className="flex-1 h-[48px] rounded-[20px] bg-[#222] text-white text-[13px] font-bold flex items-center justify-center gap-[8px] shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
        >
          홈으로 돌아가기
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path
              d="M1 1L5 5.5L1 10"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 발주 탭 메인 페이지
// ──────────────────────────────────────────────
interface OrderPageProps {
  initMode?: "approve" | "edit" | null;
  onConsumeInitMode?: () => void;
  onRequestHome?: () => void;
}

export default function OrderPage({ initMode, onConsumeInitMode, onRequestHome }: OrderPageProps = {}) {
  const [data, setData] = useState<OrderPageData | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [aiQuantities, setAiQuantities] = useState<Record<string, number>>({});
  const [addedAi, setAddedAi] = useState<Set<string>>(new Set());
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [step, setStep] = useState<OrderFlowStep>("list");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderSubmitResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sort, setSort] = useState<string>("최신순");
  const [category, setCategory] = useState<string>("전체");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getOrderPageData().then((d) => {
      setData(d);
      const init: Record<string, number> = {};
      d.items.forEach((item) => {
        init[item.id] = item.recommendedQty;
      });
      setQuantities(init);
      const aiInit: Record<string, number> = {};
      d.aiItems.forEach((item) => {
        aiInit[item.id] = item.recommendedQty;
      });
      setAiQuantities(aiInit);
    });
  }, []);

  useEffect(() => {
    if (!data || !initMode) return;
    if (initMode === "approve") {
      setAddedAi(new Set(data.aiItems.map((i) => i.id)));
    }
    onConsumeInitMode?.();
  }, [data, initMode, onConsumeInitMode]);

  // 필터 + 정렬 (hooks must be before any early return)
  const filtered = useMemo(
    () =>
      (data?.items ?? [])
        .filter((item) => {
          const matchCat = category === "전체" || item.category === category;
          const matchSearch = item.name.includes(search);
          return matchCat && matchSearch;
        })
        .sort((a, b) => {
          if (sort === "이름순") return a.name.localeCompare(b.name, "ko");
          if (sort === "단가 낮은순") return a.unitPrice - b.unitPrice;
          if (sort === "단가 높은순") return b.unitPrice - a.unitPrice;
          return 0;
        }),
    [data?.items, category, search, sort],
  );

  const {
    items: visibleItems,
    page,
    totalPages,
    setPage,
    resetPage,
  } = usePagination(filtered, PAGE_SIZE);

  if (!data) {
    return (
      <div className="px-[15px] pt-[12px] flex flex-col gap-[12px]">
        <div className="bg-white rounded-[20px] h-[40px] animate-pulse" />
        <div className="bg-[#222] rounded-[20px] h-[120px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[300px] animate-pulse" />
      </div>
    );
  }

  async function handleSubmit() {
    if (submitting || !data) return;
    setSubmitting(true);
    try {
      const res = await submitOrder(data, quantities);
      setResult(res);
      setStep("done");
    } catch {
      setToast("발주 전송에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRequestHome() {
    setStep("list");
    setResult(null);
    setAddedAi(new Set());
    if (data) {
      const init: Record<string, number> = {};
      data.items.forEach((item) => {
        init[item.id] = item.recommendedQty;
      });
      setQuantities(init);
    }
    onRequestHome?.();
  }

  if (step === "confirm") {
    return (
      <>
        <OrderConfirmPage
          data={data}
          quantities={quantities}
          submitting={submitting}
          onQtyChange={(id, delta) =>
            setQuantities((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 0) + delta) }))
          }
          onBack={() => setStep("list")}
          onSubmit={handleSubmit}
        />
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  if (step === "done" && result) {
    return (
      <>
        <OrderCompletePage
          result={result}
          onHome={handleRequestHome}
          onViewHistory={() =>
            setToast("발주 내역 페이지는 곧 제공될 예정입니다")
          }
        />
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  function changeQty(id: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, (prev[id] ?? 0) + delta),
    }));
  }

  function changeAiQty(id: string, delta: number) {
    setAiQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, (prev[id] ?? 1) + delta),
    }));
  }

  function toggleAiAdd(id: string) {
    setAddedAi((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addAllAi() {
    if (!data) return;
    setAddedAi(new Set(data.aiItems.map((i) => i.id)));
  }

  const allAiAdded =
    data.aiItems.length > 0 &&
    data.aiItems.every((item) => addedAi.has(item.id));

  function toggleAllAi() {
    if (allAiAdded) {
      setAddedAi(new Set());
    } else {
      addAllAi();
    }
  }

  const totalAiQty = Array.from(addedAi).reduce(
    (sum, id) => sum + (aiQuantities[id] ?? 0),
    0
  );

  function handleCategoryChange(cat: string) {
    setCategory(cat);
    resetPage();
  }

  function handleSortChange(s: string) {
    setSort(s);
    resetPage();
  }

  function handleSearchChange(v: string) {
    setSearch(v);
    resetPage();
  }

  return (
    <>
      <div className="px-[15px] pt-[12px] flex flex-col gap-[12px] pb-[12px]">
        {/* AI 자동 발주 버튼 */}
        <button
          onClick={() => setShowAiSheet(true)}
          className="w-full bg-[#fed400] flex items-center px-[20px] py-[3px] rounded-[20px] min-h-[40px] gap-[4px]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="13"
            viewBox="0 0 12 13"
            fill="none"
          >
            <path
              d="M10.8674 6.47235L7.2792 7.8858L5.97448 11.7731C5.94402 11.862 5.88917 11.9386 5.8173 11.9928C5.74543 12.0469 5.65999 12.076 5.57245 12.076C5.48491 12.076 5.39947 12.0469 5.3276 11.9928C5.25573 11.9386 5.20088 11.862 5.17042 11.7731L3.86785 7.8858L0.279604 6.47235C0.197536 6.43935 0.126756 6.37993 0.0767734 6.30207C0.0267908 6.22422 0 6.13165 0 6.03682C0 5.94199 0.0267908 5.84942 0.0767734 5.77157C0.126756 5.69371 0.197536 5.63429 0.279604 5.60129L3.86785 4.19017L5.17256 0.302904C5.20303 0.213997 5.25788 0.137319 5.32974 0.0831711C5.40161 0.0290234 5.48705 0 5.57459 0C5.66213 0 5.74758 0.0290234 5.81944 0.0831711C5.89131 0.137319 5.94616 0.213997 5.97662 0.302904L7.28134 4.19017L10.8696 5.60361C10.9509 5.63728 11.0208 5.69694 11.07 5.77467C11.1192 5.8524 11.1455 5.94451 11.1453 6.03878C11.145 6.13305 11.1183 6.22502 11.0687 6.30246C11.0191 6.3799 10.9489 6.43915 10.8674 6.47235Z"
              fill="black"
            />
          </svg>
          <span className="text-black font-bold text-[13px] leading-[20px] flex-1 text-left ml-[4px]">
            AI 자동 발주 전체 보기
          </span>
          <svg width="11" height="6" viewBox="0 0 11 6" fill="none">
            <path
              d="M1 1L5.5 5L10 1"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* AI 추천 카드 (검정 배경) */}
        <div className="bg-black rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
          <div className="flex items-center justify-between gap-[8px]">
            <div className="flex items-center gap-[8px] min-w-0">
              <img
                src={icoPipAi}
                alt="PIP AI"
                className="w-[28px] h-[28px] rounded-full shrink-0"
              />
              <span className="text-white font-bold text-[13px] leading-[20px] shrink-0">
                실적 기반 추천
              </span>
              <span className="text-white text-[11px] leading-[18px] truncate">
                내일 (<span className="font-[700]">{data.deliveryDate}</span>)
                납품분
              </span>
            </div>
            <span className="shrink-0 px-[8px] py-[3px] rounded-full bg-[rgba(255,255,255,0.12)] text-white text-[11px] leading-[15px]">
               실적 근거{" "}
               <span className="text-[#fed400] font-[700]">{data.aiAccuracy}%</span>
             </span>
          </div>
          <div className="text-white text-[12px] leading-[18px] font-[400]">
            <p>
              전주 매출·날씨·프로모션을 반영한
              <br />
              내일 <span className="font-[700]">필요 수량</span>을 추출했어요.
            </p>
          </div>
        </div>

        {/* AI 추천 상품 캐러셀 + 원클릭 버튼 */}
        <div className="bg-white rounded-[20px] overflow-hidden">
          <div
            className="flex gap-[10px] pl-[15px] pt-[11px] pb-[8px] overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {data.aiItems.map((item) => (
              <AiProductCard
                key={item.id}
                item={item}
                added={addedAi.has(item.id)}
                onAdd={() => toggleAiAdd(item.id)}
              />
            ))}
            <div className="w-[5px] shrink-0" aria-hidden />
          </div>
          <div className="px-[20px] pb-[14px]">
            <button
              onClick={toggleAllAi}
              className={`w-full flex items-center pl-[20px] pr-[10px] py-[3px] rounded-[20px] min-h-[40px] gap-[6px] transition-colors ${
                allAiAdded ? "bg-[#555]" : "bg-[#0f87c8]"
              }`}
            >
              <img src={icoPipAi} alt="PIP AI" className="w-[13px] h-[13px] shrink-0" />
              <span className="text-white font-bold text-[12px] leading-[18px] flex-1 text-left">
                {allAiAdded
                  ? `실적 기반 추천 전체 취소 · ${data.aiItems.length}품목`
                  : `실적 기반 추천 원클릭 · ${data.aiItems.length}품목`}
              </span>
              {!allAiAdded && (
                <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
                  <path
                    d="M1 1L5 5.5L1 10"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 검색 바 */}
        <div className="bg-white border border-[#c1c1c1] rounded-[20px] flex items-center px-[14px] h-[42px] gap-[8px]">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#aaa" strokeWidth="1.3" />
            <line
              x1="10"
              y1="10"
              x2="13"
              y2="13"
              stroke="#aaa"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            className="flex-1 text-[12px] text-[#555] bg-transparent outline-none placeholder:text-[#bbb]"
            placeholder="품목명 검색"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* 정렬 탭 */}
        <div className="">
          <div className="flex">
            {SORTS.map((s) => (
              <button
                key={s}
                onClick={() => handleSortChange(s)}
                className={`flex-1 py-[11px] text-[12px] tracking-[-0.1px] text-center border-b transition-colors ${
                  sort === s
                    ? "border-black text-black font-bold"
                    : "border-[#d8d8d8] text-[#555]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* 카테고리 필터: 총개수 고정 + 칩만 터치 슬라이드 */}
          <div className="flex items-center py-[8px]">
            <span className="text-[#3e3e3e] text-[12px] shrink-0 pr-[8px]">
              총 <span className="font-bold">{filtered.length}</span>개
            </span>
            <div className="flex flex-1 items-center gap-[6px]">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`flex-1 py-[7px] rounded-[20px] text-[11px] text-center font-medium transition-colors ${
                    category === cat
                      ? "bg-[#3caadd] text-white font-bold"
                      : "border border-[#d8d8d8] text-[#555]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 발주 목록 */}
        <div className="flex flex-col gap-[8px]">
          {visibleItems.map((item) => (
            <OrderItemRow
              key={item.id}
              item={item}
              qty={quantities[item.id] ?? item.recommendedQty}
              onQtyChange={(delta) => changeQty(item.id, delta)}
            />
          ))}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-[25px] py-[6px]">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="cursor-pointer disabled:opacity-30"
            >
              <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                <path
                  d="M5 1L1 5L5 9"
                  stroke="#555"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className="text-[#555] text-[11px]">
              <span className="font-bold">{page}</span>
              {` / ${totalPages}`}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="cursor-pointer disabled:opacity-30"
            >
              <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                <path
                  d="M1 1L5 5L1 9"
                  stroke="#555"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* AI 발주 바텀시트 */}
      {showAiSheet && (
        <AiOrderSheet
          items={data.aiItems}
          quantities={aiQuantities}
          allAdded={allAiAdded}
          onClose={() => setShowAiSheet(false)}
          onConfirm={() => {
            addAllAi();
            setShowAiSheet(false);
          }}
          onQtyChange={changeAiQty}
        />
      )}

      {/* 플로팅 발주 버튼 */}
      <div
        className={`fixed bottom-[90px] left-1/2 -translate-x-1/2 w-full max-w-[390px] px-[16px] z-30 pointer-events-none transition-all duration-300 ease-out ${
          addedAi.size > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <button
          onClick={() => addedAi.size > 0 && setStep("confirm")}
          className="w-full pointer-events-auto bg-[#222] text-white flex items-center justify-between pl-[6px] pr-[20px] h-[52px] rounded-[26px] shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
        >
          <span className="text-white font-bold text-[12px] px-[14px] h-[40px] rounded-[20px] flex items-center gap-[4px]" style={{ background: "linear-gradient(97deg, #3faf60 0%, #3aaedd 100%)" }}>
            <span>{addedAi.size}종</span>
            <span className="opacity-60 font-normal">·</span>
            <span>{totalAiQty}개</span>
          </span>
          <span className="font-bold text-[14px]">발주하기</span>
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path d="M1 1L5 5.5L1 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

    </>
  );
}
