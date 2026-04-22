import { useState, useEffect } from "react";
import { getManualOrderItems } from "../../../lib/api";
import { getProductImageByName } from "../../../lib/productImages";
import activeStep1 from "../../../assets/active-step.png";
import type { AiOrderItem, OrderDetailCategory } from "../../../types";

const STEPS = ["수동 발주", "점주 최종 컨펌"];

interface Props {
  onClose?: () => void;
  onOrderComplete?: (items: AiOrderItem[]) => void;
}

const SORT_TABS = [
  "전체",
  "긴급 순",
  "단가 낮은 순",
  "단가 높은 순",
  "이름순",
] as const;
const CATEGORY_TABS: OrderDetailCategory[] = [
  "도넛",
  "음료",
  "커피원두",
  "냉동/냉장",
  "용품/상품",
  "기타",
];
type SortTab = (typeof SORT_TABS)[number];
type ActiveTab = SortTab | OrderDetailCategory;

const PAGE_SIZE = 6;

function parsePrice(str: string): number {
  return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
}

function getUnit(stockInfo: string): string {
  if (stockInfo.includes("kg")) return "kg";
  return "개";
}

export default function ManualOrder({ onClose, onOrderComplete }: Props) {
  const [allItems, setAllItems] = useState<AiOrderItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("전체");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [step, setStep] = useState<0 | 1>(0);
  const [morningPage, setMorningPage] = useState(1);
  const [afternoonPage, setAfternoonPage] = useState(1);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const STEP2_PAGE_SIZE = 3;

  useEffect(() => {
    getManualOrderItems().then((items) => {
      setAllItems(items);
      const init: Record<string, number> = {};
      items.forEach((item) => {
        init[item.id] = 0;
      });
      setQuantities(init);
    });
  }, []);

  const getFiltered = () => {
    let list = [...allItems];
    if (search) {
      list = list.filter((item) => item.name.includes(search));
    }
    if (CATEGORY_TABS.includes(activeTab as OrderDetailCategory)) {
      list = list.filter((item) => item.category === activeTab);
    }
    if (activeTab === "긴급 순") {
      list = list.sort(
        (a, b) => (b.stockWarning ? 1 : 0) - (a.stockWarning ? 1 : 0),
      );
    } else if (activeTab === "단가 낮은 순") {
      list = list.sort(
        (a, b) => parsePrice(a.unitPrice) - parsePrice(b.unitPrice),
      );
    } else if (activeTab === "단가 높은 순") {
      list = list.sort(
        (a, b) => parsePrice(b.unitPrice) - parsePrice(a.unitPrice),
      );
    } else if (activeTab === "이름순") {
      list = list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    return list;
  };

  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const increment = (id: string) => {
    setQuantities((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };
  const decrement = (id: string) => {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) - 1),
    }));
  };

  const orderedItems = allItems.filter(
    (item) => (quantities[item.id] ?? 0) > 0,
  );

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleConfirm = () => {
    const itemsToOrder = orderedItems.map((item) => ({
      ...item,
      aiRecommendedQty: String(quantities[item.id] ?? 0),
    }));
    onOrderComplete?.(itemsToOrder);
    onClose?.();
  };

  const renderStepper = () => (
    <div className="flex items-center justify-center pb-[5px]">
      <div className="flex items-center">
        {STEPS.map((label, idx) => {
          const isActive = idx === step;
          const isPast = idx < step;
          return (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center gap-[5px] w-[50px] relative">
                <div
                  className="relative w-[26px] h-[25px] flex items-center justify-center rounded-full"
                  style={{
                    background:
                      isActive || isPast
                        ? "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)"
                        : "rgba(60,177,225,0.3)",
                  }}
                >
                  <span className="font-bold text-[12px] text-white leading-[20px]">
                    {idx + 1}
                  </span>
                </div>
                {isActive && (
                  <img
                    src={activeStep1}
                    alt=""
                    className="absolute pointer-events-none"
                    style={{
                      top: "-3px",
                      left: "9.5px",
                      width: "31px",
                      height: "31px",
                    }}
                  />
                )}
                {isActive || isPast ? (
                  <p
                    className="text-[9px] font-bold whitespace-nowrap bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(99deg, #3faf60 50.65%, #3aaedd 121.87%)",
                    }}
                  >
                    {label}
                  </p>
                ) : (
                  <p className="text-[9px] text-[#555] whitespace-nowrap">
                    {label}
                  </p>
                )}
              </div>
              {idx < STEPS.length - 1 && (
                <div className="relative w-[160px] h-[3px] bg-[#f0f1f3] rounded-[20px] mb-[13px]">
                  {isPast && (
                    <div
                      className="absolute inset-0 rounded-[20px]"
                      style={{
                        backgroundImage:
                          "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                      }}
                    />
                  )}
                  {isActive && (
                    <div
                      className="absolute left-0 top-0 h-full w-[50%] rounded-[20px]"
                      style={{
                        backgroundImage:
                          "linear-gradient(150deg, #3faf60 50.65%, #3aaedd 121.87%)",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step 2: 최종 검토 ──────────────────────────────────────────
  if (step === 1) {
    const DELIVERY_FEE = 3000;
    const midpoint = Math.ceil(orderedItems.length / 2);
    const morningItems = orderedItems.slice(0, midpoint);
    const afternoonItems = orderedItems.slice(midpoint);

    const morningTotalPages = Math.max(
      1,
      Math.ceil(morningItems.length / STEP2_PAGE_SIZE),
    );
    const afternoonTotalPages = Math.max(
      1,
      Math.ceil(afternoonItems.length / STEP2_PAGE_SIZE),
    );
    const pagedMorning = morningItems.slice(
      (morningPage - 1) * STEP2_PAGE_SIZE,
      morningPage * STEP2_PAGE_SIZE,
    );
    const pagedAfternoon = afternoonItems.slice(
      (afternoonPage - 1) * STEP2_PAGE_SIZE,
      afternoonPage * STEP2_PAGE_SIZE,
    );

    const morningAmt = morningItems.reduce(
      (acc, item) =>
        acc + parsePrice(item.unitPrice) * (quantities[item.id] ?? 0),
      0,
    );
    const afternoonAmt = afternoonItems.reduce(
      (acc, item) =>
        acc + parsePrice(item.unitPrice) * (quantities[item.id] ?? 0),
      0,
    );
    const totalAmt = morningAmt + afternoonAmt + DELIVERY_FEE;

    const renderItemRow = (item: AiOrderItem) => {
      const qty = quantities[item.id] ?? 0;
      const unit = getUnit(item.stockInfo);
      return (
        <div key={item.id} className="flex items-center justify-between">
           <div className="flex items-center gap-[6px]">
             <img
               src={getProductImageByName(item.name)}
               alt={item.name}
               className="w-[37px] h-[37px] rounded-[20px] shrink-0 object-cover"
               onError={(e) => {
                 (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
               }}
             />
            <div className="flex flex-col justify-center">
              <p className="font-bold text-[11px] text-[#222] leading-[20px]">
                {item.name}
              </p>
              <p className="text-[10px] leading-[20px]">
                <span className="text-[#888]">{item.unitPrice}</span>
                {item.stockWarning && (
                  <span className="text-[#ff522c] ml-[4px]">
                    {item.stockInfo}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-[25px] px-[10px]">
            <p className="text-[10px] text-[#787878] leading-[20px] whitespace-nowrap">
              {item.orderDate}
            </p>
            <p className="font-bold text-[11px] text-[#2892c2] w-[60px] text-right leading-[20px]">
              {qty}
              {unit}
            </p>
          </div>
        </div>
      );
    };

    return (
      <div className="relative flex flex-col gap-[20px]">
        {/* ── 최종 발주 확인 모달 ── */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setShowConfirmModal(false)}
            />
            <div className="relative bg-white rounded-[20px] overflow-hidden w-[280px] shadow-xl">
              {/* 모달 헤더 */}
              <div
                className="px-[20px] py-[18px]"
                style={{
                  backgroundImage:
                    "linear-gradient(118deg, #3faf60 50.65%, #3aaedd 121.87%)",
                }}
              >
                <p className="font-bold text-[16px] text-white leading-[1.4]">
                  최종 발주 확인
                </p>
              </div>
              {/* 모달 본문 */}
              <div className="px-[20px] py-[20px]">
                <p className="text-[13px] text-[#222] leading-[1.6]">
                  총{" "}
                  <span className="font-bold text-[#3aaedd]">
                    {orderedItems.length}
                  </span>
                  개 품목을 발주하시겠습니까?
                </p>
                <p className="text-[13px] text-[#222] leading-[1.6]">
                  발주 후 발주 관리 목록에 추가됩니다.
                </p>
              </div>
              {/* 모달 버튼 */}
              <div className="flex border-t border-[#f0f1f3]">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-[14px] text-[13px] font-bold text-[#555] cursor-pointer"
                >
                  아니오
                </button>
                <div className="w-[1px] bg-[#f0f1f3]" />
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-[14px] text-[13px] font-bold text-[#3aaedd] cursor-pointer"
                >
                  예
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 메인 카드 ── */}
        <div className="bg-white rounded-[20px] flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex flex-col gap-[15px] pt-[15px] px-[20px]">
            <div className="flex items-center gap-[6px]">
              <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
              <p className="font-bold text-[12px] text-[#555] leading-[20px]">
                7월 3주차 발주관리
              </p>
              <p className="text-[9px] text-[#787878] leading-[20px]">
                2026.03.10
              </p>
              <p className="text-[9px] text-[#787878] leading-[20px]">09:00</p>
            </div>
            {renderStepper()}
          </div>

          <div className="h-[1px] bg-[#f0f1f3]" />

          {orderedItems.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <p className="text-[10px] text-[#aaa]">
                발주 수량을 입력한 항목이 없습니다.
              </p>
            </div>
          ) : (
            <>
              {/* 새벽 납품 그룹 */}
              <div className="flex flex-col gap-[15px] px-[20px] pt-[10px] pb-[12px]">
                <p className="text-[11px] font-bold text-[#555] leading-[1.5]">
                  새벽 납품{" "}
                  <span className="text-[9px] font-normal text-[#888]">
                    4월 19일(일) 오전 5:00 예정
                  </span>
                </p>
                {pagedMorning.length > 0 ? (
                  <div className="flex flex-col gap-[15px]">
                    {pagedMorning.map(renderItemRow)}
                  </div>
                ) : (
                  <p className="text-[10px] text-[#aaa] text-center py-[8px]">
                    항목 없음
                  </p>
                )}
                <div className="flex items-center justify-end gap-[5px]">
                  <button
                    onClick={() => setMorningPage((p) => Math.max(1, p - 1))}
                    disabled={morningPage <= 1}
                    className="shrink-0 rotate-180 disabled:opacity-30 cursor-pointer"
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
                  <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
                    {morningPage} / {morningTotalPages}
                  </p>
                  <button
                    onClick={() =>
                      setMorningPage((p) => Math.min(p + 1, morningTotalPages))
                    }
                    disabled={morningPage >= morningTotalPages}
                    className="shrink-0 disabled:opacity-30 cursor-pointer"
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

              {afternoonItems.length > 0 && (
                <>
                  <div className="h-[1px] bg-[#f0f1f3]" />
                  {/* 점심 납품 그룹 */}
                  <div className="flex flex-col gap-[15px] px-[20px] pt-[10px] pb-[12px]">
                    <p className="text-[11px] font-bold text-[#555] leading-[1.5]">
                      점심 납품{" "}
                      <span className="text-[9px] font-normal text-[#888]">
                        4월 19일(일) 오후 13:00 예정
                      </span>
                    </p>
                    <div className="flex flex-col gap-[15px]">
                      {pagedAfternoon.map(renderItemRow)}
                    </div>
                    <div className="flex items-center justify-end gap-[5px]">
                      <button
                        onClick={() =>
                          setAfternoonPage((p) => Math.max(1, p - 1))
                        }
                        disabled={afternoonPage <= 1}
                        className="shrink-0 rotate-180 disabled:opacity-30 cursor-pointer"
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
                      <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
                        {afternoonPage} / {afternoonTotalPages}
                      </p>
                      <button
                        onClick={() =>
                          setAfternoonPage((p) =>
                            Math.min(p + 1, afternoonTotalPages),
                          )
                        }
                        disabled={afternoonPage >= afternoonTotalPages}
                        className="shrink-0 disabled:opacity-30 cursor-pointer"
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
                </>
              )}
            </>
          )}
        </div>

        {/* ── 요약 + 버튼 카드 ── */}
        <div className="bg-white rounded-[20px] flex flex-col gap-[10px] px-[15px] py-[11px]">
          {/* 금액 요약 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[20px]">
              <div className="flex flex-col items-center pb-[1px]">
                <p className="text-[11px] text-[#333] leading-[20px]">
                  새벽 납품 금액
                </p>
                <p className="font-semibold text-[12px] text-[#333] leading-[21px]">
                  {morningAmt.toLocaleString("ko-KR")}원
                </p>
              </div>
              <div
                className="w-[18px] h-[18px] flex items-center justify-center rounded-full shrink-0"
                style={{ background: "#b3b4b5" }}
              >
                <span className="text-[9px] font-bold text-white leading-none">
                  +
                </span>
              </div>
              <div className="flex flex-col items-center pb-[1px]">
                <p className="text-[11px] text-[#333] leading-[20px]">
                  점심 납품 금액
                </p>
                <p className="font-semibold text-[12px] text-[#333] leading-[21px]">
                  {afternoonAmt.toLocaleString("ko-KR")}원
                </p>
              </div>
              <div
                className="w-[18px] h-[18px] flex items-center justify-center rounded-full shrink-0"
                style={{ background: "#b3b4b5" }}
              >
                <span className="text-[9px] font-bold text-white leading-none">
                  +
                </span>
              </div>
              <div className="flex flex-col items-center pb-[1px]">
                <p className="text-[11px] text-[#333] leading-[20px]">배송비</p>
                <p className="font-semibold text-[12px] text-[#333] leading-[21px]">
                  {DELIVERY_FEE.toLocaleString("ko-KR")}원
                </p>
              </div>
            </div>
            <div className="flex items-center gap-[2px]">
              <p className="font-bold text-[12px] text-black leading-[21px]">
                총 주문 금액
              </p>
              <p className="font-bold text-[12px] text-[#2892c1] leading-[21px]">
                {totalAmt.toLocaleString("ko-KR")}원
              </p>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-[16px]">
            <button
              onClick={() => setStep(0)}
              className="flex items-center justify-center w-[43px] h-[33px] rounded-[20px] shrink-0 cursor-pointer"
              style={{ background: "#3caadd" }}
            >
              <svg width="7" height="10" viewBox="0 0 7 10" fill="none">
                <path
                  d="M6 1L2 5l4 4"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex-1 flex items-center justify-between px-[10px] gap-[7px] h-[33px] rounded-[20px] cursor-pointer"
              style={{
                backgroundImage:
                  "linear-gradient(118deg, #3faf60 50.65%, #3aaedd 121.87%)",
              }}
            >
              <p className="font-bold text-[13px] text-white leading-[13px] flex items-center gap-[7px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="13"
                  viewBox="0 0 12 13"
                  fill="none"
                >
                  <path
                    d="M5.57422 0.078125C5.64429 0.078125 5.71374 0.101266 5.77246 0.145508C5.8166 0.178767 5.85342 0.222871 5.87988 0.274414L5.90234 0.328125L7.20703 4.21484L7.21875 4.25L7.25293 4.2627L10.8408 5.67578C10.9061 5.70306 10.9631 5.75198 11.0039 5.81641C11.045 5.88125 11.0676 5.95927 11.0674 6.03906C11.0671 6.11868 11.0442 6.19628 11.0029 6.26074C10.9618 6.3248 10.9042 6.37255 10.8389 6.39941L7.25098 7.81348L7.2168 7.82617L7.20508 7.86133L5.90039 11.748C5.87473 11.8227 5.82924 11.8864 5.77051 11.9307C5.71178 11.9749 5.64234 11.998 5.57227 11.998C5.5024 11.998 5.43359 11.9747 5.375 11.9307C5.33095 11.8975 5.29403 11.8532 5.26758 11.8018L5.24414 11.748L3.94238 7.86133L3.93066 7.82617L3.89648 7.81348L0.308594 6.39941C0.242411 6.37273 0.184167 6.32455 0.142578 6.25977C0.100959 6.19492 0.0781794 6.11726 0.078125 6.03711C0.078125 5.95684 0.100891 5.87841 0.142578 5.81348C0.173762 5.76498 0.214564 5.72611 0.260742 5.69824L0.308594 5.67383L3.89648 4.2627L3.93066 4.25L3.94238 4.21484L5.24609 0.327148C5.27179 0.252682 5.31835 0.189662 5.37695 0.145508C5.43554 0.101416 5.50433 0.0782075 5.57422 0.078125Z"
                    fill="white"
                    stroke="white"
                    stroke-width="0.15625"
                  />
                </svg>
                발주 넣기
              </p>
              <svg width="6" height="9" viewBox="0 0 6 9" fill="none">
                <path
                  d="M1 1l4 3.5L1 8"
                  stroke="white"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: 수동 발주 입력 ──────────────────────────────────────
  return (
    <div className="bg-white rounded-[20px] flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex flex-col gap-[15px] pt-[15px] px-[20px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555] leading-[20px]">
              수동 발주 7월 3주차
            </p>
          </div>
          <div className="flex items-center gap-[6px] text-[9px] text-[#787878] leading-[20px]">
            <span>2026.03.10</span>
            <span>09:00</span>
          </div>
        </div>

        {/* 스텝 */}
        {renderStepper()}
      </div>

      {/* 구분선 */}
      <div className="h-[1px] bg-[#f0f1f3]" />

      {/* 필터·검색 영역 */}
      <div className=" items-center justify-between px-[15px] py-[8px]">
        <div
          className="flex items-center gap-[5px] overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <p className="font-bold text-[9px] text-[#3caadd] shrink-0 leading-[10px]">
            총 {filtered.length}개
          </p>
          {([...SORT_TABS, ...CATEGORY_TABS] as ActiveTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className="flex items-center justify-center px-[12px] py-[4px] h-[19px] rounded-[20px] shrink-0 text-[9px] leading-none cursor-pointer transition-colors"
                style={
                  isActive
                    ? { background: "#3caadd", color: "#fff", fontWeight: 700 }
                    : { border: "1px solid #d8d8d8", color: "#555" }
                }
              >
                {tab}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-[2px] mt-2 border border-[#d8d8d8] rounded-[20px] px-[7px] h-[19px] w-[120px] shrink-0 ml-auto">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M3.5 6.5C5.157 6.5 6.5 5.157 6.5 3.5C6.5 1.843 5.157 0.5 3.5 0.5C1.843 0.5 0.5 1.843 0.5 3.5C0.5 5.157 1.843 6.5 3.5 6.5Z"
              stroke="#555"
              strokeWidth="0.8"
            />
            <path
              d="M7.5 7.5L5.5 5.5"
              stroke="#555"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="품목명 검색"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 text-[9px] text-[#555] bg-transparent outline-none leading-none min-w-0"
          />
        </div>
      </div>

      {/* 테이블 헤더 */}
      <div className="flex flex-col px-[15px]">
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center justify-between text-[8px] font-bold text-[#555] leading-[20px]">
            <span className="flex-1">상품명</span>
            <div className="flex gap-[40px] pr-[10px]">
              <span>납부 요청일</span>
              <span>직접 발주 수량</span>
            </div>
          </div>
          <div className="h-[2px] bg-[#f0f1f3] rounded-[20px]" />
        </div>
      </div>

      {/* 아이템 목록 */}
      <div className="flex flex-col gap-[15px] px-[15px] pt-[8px] pb-[12px] min-h-[280px]">
        {pagedItems.map((item) => {
          const qty = quantities[item.id] ?? 0;
          const unit = getUnit(item.stockInfo);
          const isDone =
            item.status === "발주 완료" || item.status === "납품 완료";

          return (
            <div key={item.id} className="flex items-center justify-between">
              {/* 상품명 */}
             <div className="flex items-center gap-[6px] flex-1 min-w-0">
                 <img
                   src={getProductImageByName(item.name)}
                   alt={item.name}
                   className="w-[37px] h-[37px] rounded-[20px] shrink-0 object-cover"
                   style={{ opacity: isDone ? 0.4 : 1 }}
                   onError={(e) => {
                     (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                   }}
                />
                <div className="flex flex-col justify-center min-w-0">
                  <p className="font-bold text-[11px] text-[#222] leading-[20px] truncate">
                    {item.name}
                  </p>
                  <p
                    className={`text-[10px] leading-[20px] ${item.stockWarning ? "text-[#ff522c]" : "text-[#888]"}`}
                  >
                    {item.unitPrice}
                    {item.stockInfo && (
                      <span
                        className={
                          item.stockWarning ? "text-[#ff522c]" : "text-[#888]"
                        }
                      >
                        {" / "}
                        {item.stockInfo}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* 날짜 + 수량 */}
              <div className="flex items-center gap-[25px] px-[10px] shrink-0">
                {/* 상태 배지 (발주 완료 / 납품 완료) */}
                {item.status === "발주 완료" && (
                  <div
                    className="flex items-center justify-center px-[8px] h-[20px] rounded-[10px] shrink-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(96deg, #3faf60 50.65%, #3aaedd 121.87%)",
                    }}
                  >
                    <p className="font-bold text-[9px] text-white leading-[13px]">
                      발주 완료
                    </p>
                  </div>
                )}
                {item.status === "납품 완료" && (
                  <div
                    className="flex items-center justify-center px-[8px] h-[20px] rounded-[10px] shrink-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(96deg, #429ddd 50.65%, #3aaedd 121.87%)",
                    }}
                  >
                    <p className="font-bold text-[9px] text-white leading-[13px]">
                      납품 완료
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-[#787878] leading-[20px] whitespace-nowrap">
                  {item.orderDate}
                </p>

                {/* 수량 컨트롤 */}
                <div
                  className={`flex items-center gap-[10px] w-[80px] ${isDone ? "opacity-30 pointer-events-none" : ""}`}
                >
                  {/* 마이너스 버튼 */}
                  <button
                    onClick={() => decrement(item.id)}
                    disabled={isDone}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                    style={{ border: "1px solid #828282" }}
                  >
                    <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
                      <path
                        d="M1 1h6"
                        stroke="#828282"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  {/* 수량 입력 */}
                  <div className="flex items-center gap-[1px] border-b-[1.5px] border-[#2892c2]">
                    <input
                      type="text"
                      inputMode="numeric"
                      readOnly={isDone}
                      value={qty === 0 ? "0" : String(qty)}
                      onChange={(e) => {
                        if (isDone) return;
                        const num = e.target.value.replace(/[^0-9]/g, "");
                        setQuantities((prev) => ({
                          ...prev,
                          [item.id]: num === "" ? 0 : parseInt(num, 10),
                        }));
                      }}
                      className="font-bold text-[11px] text-[#2892c2] leading-[20px] w-[24px] text-center bg-transparent outline-none"
                      style={{ cursor: isDone ? "not-allowed" : "text" }}
                    />
                    <span className="font-bold text-[11px] text-[#2892c2] leading-[20px]">
                      {unit}
                    </span>
                  </div>

                  {/* 플러스 버튼 */}
                  <button
                    onClick={() => increment(item.id)}
                    disabled={isDone}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded-full shrink-0 cursor-pointer"
                    style={{ background: "#2892c2" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M4 1v6M1 4h6"
                        stroke="white"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-end gap-[5px] px-[15px] pb-[8px] mb-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="shrink-0 rotate-180 disabled:opacity-30 cursor-pointer"
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
        <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
          {page} / {totalPages}
        </p>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
          className="shrink-0 disabled:opacity-30 cursor-pointer"
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

      {/* 하단 버튼 */}
      <div className="flex items-center gap-[16px] px-[15px] pb-[15px]">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-[43px] h-[33px] rounded-[20px] shrink-0 cursor-pointer"
          style={{ background: "#3caadd" }}
        >
          <svg width="7" height="10" viewBox="0 0 7 10" fill="none">
            <path
              d="M6 1L2 5l4 4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={() => setStep(1)}
          className="flex-1 flex items-center justify-between px-4 gap-[7px] h-[33px] rounded-[20px] cursor-pointer"
          style={{
            backgroundImage:
              "linear-gradient(118deg, #3faf60 50.65%, #3aaedd 121.87%)",
          }}
        >
          <p className="font-bold text-[11px] text-white leading-[13px] flex items-center gap-[7px]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="13"
              viewBox="0 0 12 13"
              fill="none"
            >
              <path
                d="M5.57422 0.078125C5.64429 0.078125 5.71374 0.101266 5.77246 0.145508C5.8166 0.178767 5.85342 0.222871 5.87988 0.274414L5.90234 0.328125L7.20703 4.21484L7.21875 4.25L7.25293 4.2627L10.8408 5.67578C10.9061 5.70306 10.9631 5.75198 11.0039 5.81641C11.045 5.88125 11.0676 5.95927 11.0674 6.03906C11.0671 6.11868 11.0442 6.19628 11.0029 6.26074C10.9618 6.3248 10.9042 6.37255 10.8389 6.39941L7.25098 7.81348L7.2168 7.82617L7.20508 7.86133L5.90039 11.748C5.87473 11.8227 5.82924 11.8864 5.77051 11.9307C5.71178 11.9749 5.64234 11.998 5.57227 11.998C5.5024 11.998 5.43359 11.9747 5.375 11.9307C5.33095 11.8975 5.29403 11.8532 5.26758 11.8018L5.24414 11.748L3.94238 7.86133L3.93066 7.82617L3.89648 7.81348L0.308594 6.39941C0.242411 6.37273 0.184167 6.32455 0.142578 6.25977C0.100959 6.19492 0.0781794 6.11726 0.078125 6.03711C0.078125 5.95684 0.100891 5.87841 0.142578 5.81348C0.173762 5.76498 0.214564 5.72611 0.260742 5.69824L0.308594 5.67383L3.89648 4.2627L3.93066 4.25L3.94238 4.21484L5.24609 0.327148C5.27179 0.252682 5.31835 0.189662 5.37695 0.145508C5.43554 0.101416 5.50433 0.0782075 5.57422 0.078125Z"
                fill="white"
                stroke="white"
                stroke-width="0.15625"
              />
            </svg>
            확인하고 최종 검토하기
          </p>
          <svg width="6" height="9" viewBox="0 0 6 9" fill="none">
            <path
              d="M1 1l4 3.5L1 8"
              stroke="white"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
