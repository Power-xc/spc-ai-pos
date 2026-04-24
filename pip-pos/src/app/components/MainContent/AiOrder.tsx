import { useState, useEffect } from "react";
import DatePicker from "../ui/DatePicker";
import { getAiOrderSummary, getAiOrderItems } from "../../../lib/api";
import { getProductImageByName } from "../../../lib/productImages";
import FilterReset from "../../../assets/ico-filterReset.svg";
import activeStep1 from "../../../assets/active-step.png";
import type {
  AiOrderItem,
  AiOrderSummary,
  OrderDetailCategory,
} from "../../../types";

interface Props {
  open: boolean;
  onOrderComplete?: (items: AiOrderItem[]) => void;
  onClose?: () => void;
}

const FILTER_TABS = [
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
const PAGE_SIZE = 5;
type FilterTab = (typeof FILTER_TABS)[number];
type ReviewGroup = {
  key: string;
  label?: string | null;
  time?: string | null;
  items: AiOrderItem[];
};

const STEPS = ["실적 기반 발주", "수동발주", "점주 최종 컨펌"];

function parsePrice(price: string): number {
  return parseInt(price.replace(/[^0-9]/g, ""), 10) || 0;
}

function buildReviewGroups(items: AiOrderItem[], reportDate?: string | null): ReviewGroup[] {
  const anyItemHasWindow = items.some(
    (item) => Boolean((item as AiOrderItem & { deliveryLabel?: string; deliveryTime?: string }).deliveryLabel),
  );

  if (!anyItemHasWindow) {
    return [
      {
        key: "default",
        label: null,
        time: null,
        items,
      },
    ];
  }

  const grouped = new Map<string, ReviewGroup>();
  items.forEach((item, idx) => {
    const deliveryLabel =
      (item as AiOrderItem & { deliveryLabel?: string }).deliveryLabel ??
      `납품 ${idx + 1}`;
    const deliveryTime =
      (item as AiOrderItem & { deliveryTime?: string }).deliveryTime ??
      (reportDate ? `${reportDate} 예정` : null);
    if (!grouped.has(deliveryLabel)) {
      grouped.set(deliveryLabel, {
        key: deliveryLabel,
        label: deliveryLabel,
        time: deliveryTime,
        items: [],
      });
    }
    grouped.get(deliveryLabel)?.items.push(item);
  });

  return Array.from(grouped.values());
}

export default function AiOrder({ open, onOrderComplete, onClose }: Props) {
  const [summary, setSummary] = useState<AiOrderSummary | null>(null);
  const [allItems, setAllItems] = useState<AiOrderItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<
    FilterTab | OrderDetailCategory
  >("전체");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [activeStep, setActiveStep] = useState(0);
  const [overLimitItems, setOverLimitItems] = useState<
    { name: string; aiQty: string; inputQty: string }[] | null
  >(null);
  const [step2Pages, setStep2Pages] = useState<[number, number]>([1, 1]);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    getAiOrderSummary().then(setSummary);
    getAiOrderItems().then((items) => {
      setAllItems(items);
      const initQty: Record<string, string> = {};
      items.forEach((i) => {
        initQty[i.id] = i.aiRecommendedQty;
      });
      setQuantities(initQty);
    });
  }, [open]);

  const filtered = allItems
    .filter((item) => {
      if (search && !item.name.includes(search)) return false;
      if (dateFrom && item.orderDate < dateFrom.replaceAll("-", "."))
        return false;
      if (dateTo && item.orderDate > dateTo.replaceAll("-", ".")) return false;
      if (CATEGORY_TABS.includes(activeFilter as OrderDetailCategory))
        return item.category === activeFilter;
      return true;
    })
    .sort((a, b) => {
      if (activeFilter === "단가 낮은 순")
        return parsePrice(a.unitPrice) - parsePrice(b.unitPrice);
      if (activeFilter === "단가 높은 순")
        return parsePrice(b.unitPrice) - parsePrice(a.unitPrice);
      if (activeFilter === "이름순") return a.name.localeCompare(b.name, "ko");
      if (activeFilter === "긴급 순")
        return (b.stockWarning ? 1 : 0) - (a.stockWarning ? 1 : 0);
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const addQty = (id: string) => {
    setQuantities((prev) => {
      const raw = prev[id] ?? "0개";
      const num = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
      const unit = raw.replace(/[0-9]/g, "").trim() || "개";
      return { ...prev, [id]: `${num + 1}${unit}` };
    });
  };

  const subQty = (id: string) => {
    setQuantities((prev) => {
      const raw = prev[id] ?? "0개";
      const num = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
      const unit = raw.replace(/[0-9]/g, "").trim() || "개";
      return { ...prev, [id]: `${Math.max(0, num - 1)}${unit}` };
    });
  };

  const getStatusBadge = (status: AiOrderItem["status"]) => {
    if (status === "발주 완료")
      return (
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
      );
    if (status === "납품 완료")
      return (
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
      );
    return null;
  };

  if (!open) return null;

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-col bg-white rounded-[20px] py-[14px]">
        {/* 카드 헤더 */}
        <div className="flex items-center justify-between px-[20px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555] leading-[20px]">
              {activeStep >= 1
                ? (summary?.weekLabel ?? "").replace("AI 추천", "직접 발주").replace("실적 기반 추천", "직접 발주") || "직접 발주"
                : (summary?.weekLabel ?? "실적 기반 발주")}
            </p>
            {activeStep === 0 && summary?.aiScore && (
              <div className="flex items-center gap-[3px] bg-[#eaf6ff] rounded-[10px] px-[6px] py-[2px]">
                <span className="text-[8px] font-bold text-[#3aaedd]">
                  과거 실적 기반 {summary.aiScore}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-[6px] text-[9px] text-[#787878] leading-[20px]">
            <span>{summary?.reportDate}</span>
            <span>{summary?.reportTime}</span>
          </div>
        </div>
        {/* ── 스텝 위저드 ── */}
        <div className="px-[30px] py-[14px] flex items-center justify-between">
          {STEPS.map((label, idx) => {
            const isActive = idx === activeStep;
            const isPast = idx < activeStep;
            const isFuture = idx > activeStep;
            return (
              <div key={label} className="flex items-center ">
                {/* 스텝 원 + 라벨 */}
                <div className="flex flex-col items-center gap-[5px] w-[50px] relative">
                  {/* 원형 (활성: 그라데이션 + 점선 링, 비활성: 반투명 파란색) */}
                  <div
                    className="relative w-[26px] h-[25px] flex items-center justify-center rounded-full"
                    style={{
                      background:
                        isActive || isPast || isFuture
                          ? "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%), #3DB4E5"
                          : "rgba(60,177,225,0.3)",
                    }}
                  >
                    <span className="font-bold text-[12px] text-white leading-[20px]">
                      {idx + 1}
                    </span>
                    {/* 활성 스텝 점선 외부 링 */}
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
                  {/* 라벨: 활성=그라데이션 텍스트, 비활성=#555 */}
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

                {/* 연결선 */}
                {idx < STEPS.length - 1 && (
                  <div className="relative w-[175px] h-[3px] bg-[#f0f1f3] rounded-[20px] mb-[13px]">
                    {/* 진행된 구간에 그라데이션 오버레이 */}
                    {isPast && (
                      <div
                        className="absolute inset-0 rounded-[20px]"
                        style={{
                          backgroundImage:
                            "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                        }}
                      />
                    )}
                    {/* 현재 스텝 직후 연결선 절반 그라데이션 */}
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

        {/* ── 콘텐츠 (스텝별 분기) ── */}
        {activeStep === 0 && (
          <div className="flex flex-col gap-[15px] pt-[15px] pb-[15px]">
            <div className="flex flex-col gap-[15px] px-[15px]">
              {/* 탭 */}
              <div
                className="flex items-center gap-[5px] overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                <p className="font-bold text-[9px] text-[#3caadd] shrink-0 leading-[10px]">
                  총 {filtered.length}개
                </p>
                {[...FILTER_TABS, ...CATEGORY_TABS].map((tab) => {
                  const isTabActive = activeFilter === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveFilter(tab as FilterTab | OrderDetailCategory);
                        setPage(1);
                      }}
                      className="flex items-center justify-center px-[12px] py-[4px] h-[19px] rounded-[20px] shrink-0 text-[9px] leading-[10px] cursor-pointer transition-colors"
                      style={
                        isTabActive
                          ? {
                              background: "#3caadd",
                              color: "#fff",
                              fontWeight: 700,
                            }
                          : { border: "1px solid #d8d8d8", color: "#555" }
                      }
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              {/* 날짜 + 검색 */}
              <div className="flex items-center justify-between">
                <p className="font-bold text-[8px] text-[#555] leading-[20px]">
                  상품명
                </p>
                <div className="flex items-center gap-[7px]">
                  <div className="flex items-center gap-[5px]">
                    <DatePicker
                      value={dateFrom}
                      maxDate={dateTo || undefined}
                      onChange={(v) => {
                        setDateFrom(v);
                        if (dateTo && v > dateTo) setDateTo("");
                        setPage(1);
                      }}
                      placeholder="시작일"
                    />
                    <p className="font-bold text-[8px] text-[#555]">-</p>
                    <DatePicker
                      value={dateTo}
                      minDate={dateFrom || undefined}
                      onChange={(v) => {
                        setDateTo(v);
                        setPage(1);
                      }}
                      placeholder="종료일"
                    />
                  </div>
                  <div className="flex items-center gap-[2px] border border-[#d8d8d8] rounded-[20px] px-[7px] py-[4px] h-[19px] shrink-0 w-[100px]">
                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                      <circle
                        cx="3.07"
                        cy="3.07"
                        r="2.67"
                        stroke="#555"
                        strokeWidth="0.8"
                      />
                      <path
                        d="M5.33 5.33l1.34 1.34"
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
                      className="flex-1 text-[9px] text-[#555] bg-transparent outline-none leading-[10px] min-w-0"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setActiveFilter("전체");
                      setSearch("");
                      setDateFrom("");
                      setDateTo("");
                      setPage(1);
                    }}
                    className="flex items-center gap-[3px] px-[4px] py-[4px] rounded-[20px] shrink-0 text-[9px] leading-[10px] cursor-pointer border border-[#D8D8D8]"
                    style={{ color: "#ff522c" }}
                  >
                    <img src={FilterReset} alt="" />
                  </button>
                </div>
              </div>
              <div className="h-[2px] bg-[#f0f1f3] rounded-[20px]" />

              {/* 상품 목록 */}
              <div className="flex flex-col gap-[15px] min-h-[325px]">
                {pagedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-[6px] w-[165px] shrink-0">
                      <img
                        src={getProductImageByName(item.name)}
                        alt={item.name}
                        className="w-[37px] h-[37px] rounded-[10px] shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                        }}
                      />
                      <div className="flex flex-col">
                        <p className="font-bold text-[11px] text-[#222] leading-[20px]">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-[#888] leading-[20px]">
                          {item.unitPrice} /{" "}
                          <span
                            style={{
                              color: item.stockWarning ? "#ff522c" : "#888",
                            }}
                          >
                            {item.stockInfo}
                          </span>
                        </p>
                        {item.aiReason && (
                          <p className="text-[8px] text-[#3aaedd] leading-[13px]">
                            AI: {item.aiReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-[25px] justify-end px-[10px] flex-1">
                      {getStatusBadge(item.status)}
                      <p className="text-[10px] text-[#787878] leading-[20px] whitespace-nowrap">
                        {item.orderDate}
                      </p>
                      <div
                        className="flex items-center gap-[10px] w-[80px] relative"
                        style={{ opacity: item.status ? 0.35 : 1 }}
                      >
                        <button
                          onClick={() => subQty(item.id)}
                          disabled={!!item.status}
                          className="w-[18px] h-[18px] rounded-full bg-[#fff] border border-[#828282] flex items-center justify-center shrink-0 disabled:cursor-not-allowed"
                        >
                          <span className="font-bold text-[10px] text-[#828282] leading-none">
                            −
                          </span>
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          readOnly={!!item.status}
                          value={(
                            quantities[item.id] ?? item.aiRecommendedQty
                          ).replace(/[^0-9]/g, "")}
                          onChange={(e) => {
                            if (item.status) return;
                            const raw =
                              quantities[item.id] ?? item.aiRecommendedQty;
                            const unit =
                              raw.replace(/[0-9]/g, "").trim() || "개";
                            const num = e.target.value.replace(/[^0-9]/g, "");
                            setQuantities((prev) => ({
                              ...prev,
                              [item.id]: `${num}${unit}`,
                            }));
                          }}
                          className="font-bold text-[11px] text-[#2892c2] leading-[20px] w-[24px] text-center bg-transparent outline-none"
                          style={{
                            cursor: item.status ? "not-allowed" : "text",
                          }}
                        />
                        <button
                          onClick={() => addQty(item.id)}
                          disabled={!!item.status}
                          className="w-[18px] h-[18px] rounded-full bg-[#2892c2] flex items-center justify-center shrink-0 disabled:cursor-not-allowed"
                        >
                          <span className="font-bold text-[10px] text-white leading-none">
                            +
                          </span>
                        </button>
                        <div className="absolute bottom-0 left-[28px] w-[24px] h-[1px] bg-[#2892c2] rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 페이지네이션 */}
              <div className="flex items-center justify-end gap-[5px]">
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
                <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
                  {page} / {totalPages}
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

            {/* 하단 CTA — 검토 완료 → step 1 */}
            <div className="px-[15px] flex items-center justify-between">
              <button
                onClick={onClose}
                className="w-[43px] h-[33px] px-[12px] py-[4px] rounded-[20px] flex items-center justify-center gap-[7px] cursor-pointer bg-[#3CAADD]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="6"
                  height="9"
                  viewBox="0 0 6 9"
                  fill="none"
                >
                  <path
                    d="M0.204082 4.91567L4.81679 8.82782C4.94678 8.93807 5.12307 9 5.30689 9C5.49072 9 5.66701 8.93807 5.79699 8.82782C5.92698 8.71758 6 8.56806 6 8.41216C6 8.25625 5.92698 8.10673 5.79699 7.99649L1.67381 4.50049L5.79584 1.00351C5.8602 0.948922 5.91126 0.884119 5.94609 0.812799C5.98092 0.741479 5.99885 0.665038 5.99885 0.587842C5.99885 0.510645 5.98092 0.434205 5.94609 0.362884C5.91126 0.291564 5.8602 0.226761 5.79584 0.172175C5.73148 0.117589 5.65507 0.0742887 5.57098 0.0447468C5.48689 0.015205 5.39676 -5.75159e-10 5.30574 0C5.21472 5.75159e-10 5.12459 0.015205 5.0405 0.0447468C4.95641 0.0742887 4.88 0.117589 4.81564 0.172175L0.202929 4.08433C0.138501 4.13892 0.0874095 4.20375 0.0525866 4.27511C0.0177631 4.34648 -0.000106812 4.42297 4.76837e-07 4.5002C0.000107288 4.57744 0.0181904 4.65389 0.0532112 4.72519C0.088232 4.79648 0.139502 4.86121 0.204082 4.91567Z"
                    fill="white"
                  />
                </svg>
              </button>
              <button
                onClick={() => {
                  setActiveStep(1);
                  setPage(1);
                }}
                className="w-full h-[33px] rounded-[20px] flex items-center justify-between px-[20px] cursor-pointer ml-2"
                style={{
                  backgroundImage:
                    "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                }}
              >
                <div className="flex items-center gap-[7px] justify-center">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="shrink-0"
                  >
                    <circle
                      cx="6"
                      cy="6"
                      r="5"
                      stroke="white"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4 6l1.5 1.5L8 4"
                      stroke="white"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="font-bold text-[11px] text-white leading-[13px]">
                    검토 완료
                  </p>
                </div>
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
        )}

        {/* ── Step 2: 수동발주 ── */}
        {activeStep === 1 && (
          <div className="flex flex-col gap-[15px] pt-[0] pb-[10px]">
            <div className="flex flex-col gap-[15px] px-[15px]">
              {/* 안내 배너 */}
              <div className="flex items-center gap-[8px] bg-[#f5fbff] rounded-[10px] px-[12px] py-[10px]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="shrink-0"
                >
                  <circle cx="7" cy="7" r="6" stroke="red" strokeWidth="1.2" />
                  <path
                    d="M7 6v4"
                    stroke="red"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <circle cx="7" cy="4.5" r="0.6" fill="red" />
                </svg>
                <p className="text-[9px] text-[red] leading-[14px]">
                  과거 실적 기반 추천 수량을 직접 수정할 수 있습니다. 수정 후 발주를
                  확정해 주세요.
                </p>
              </div>

              {/* 헤더 행 */}
              <div className="flex items-center justify-between">
                <p className="font-bold text-[8px] text-[#555] leading-[20px]">
                  상품명
                </p>
                <div className="flex items-center gap-[5px]">
                  <div className="flex items-center gap-[2px] border border-[#d8d8d8] rounded-[20px] px-[7px] py-[4px] h-[19px] shrink-0 w-[100px]">
                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                      <circle
                        cx="3.07"
                        cy="3.07"
                        r="2.67"
                        stroke="#555"
                        strokeWidth="0.8"
                      />
                      <path
                        d="M5.33 5.33l1.34 1.34"
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
                      className="flex-1 text-[9px] text-[#555] bg-transparent outline-none leading-[10px] min-w-0"
                    />
                  </div>
                </div>
              </div>
              <div className="h-[2px] bg-[#f0f1f3] rounded-[20px]" />

              {/* 상품 목록 (수동 수정 강조) */}
              <div className="flex flex-col gap-[15px] min-h-[325px]">
                {pagedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-[6px] w-[165px] shrink-0">
                      <img
                        src={getProductImageByName(item.name)}
                        alt={item.name}
                        className="w-[37px] h-[37px] rounded-[10px] shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                        }}
                      />
                      <div className="flex flex-col">
                        <p className="font-bold text-[11px] text-[#222] leading-[20px]">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-[#888] leading-[20px]">
                          {item.unitPrice} /{" "}
                          <span
                            style={{
                              color: item.stockWarning ? "#ff522c" : "#888",
                            }}
                          >
                            {item.stockInfo}
                          </span>
                        </p>
                        <p className="text-[8px] text-[#aaa] leading-[13px]">
                          추천: {item.aiRecommendedQty}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-[25px] justify-end px-[10px] flex-1">
                      {getStatusBadge(item.status)}
                      <p className="text-[10px] text-[#787878] leading-[20px] whitespace-nowrap">
                        {item.orderDate}
                      </p>
                      <div
                        className="flex items-center gap-[10px] w-[80px] relative"
                        style={{ opacity: item.status ? 0.35 : 1 }}
                      >
                        <button
                          onClick={() => subQty(item.id)}
                          disabled={!!item.status}
                          className="w-[18px] h-[18px] rounded-full bg-[#fff] border border-[#828282] flex items-center justify-center shrink-0 disabled:cursor-not-allowed"
                        >
                          <span className="font-bold text-[10px] text-[#828282] leading-none">
                            −
                          </span>
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          readOnly={!!item.status}
                          value={(
                            quantities[item.id] ?? item.aiRecommendedQty
                          ).replace(/[^0-9]/g, "")}
                          onChange={(e) => {
                            if (item.status) return;
                            const raw =
                              quantities[item.id] ?? item.aiRecommendedQty;
                            const unit =
                              raw.replace(/[0-9]/g, "").trim() || "개";
                            const num = e.target.value.replace(/[^0-9]/g, "");
                            setQuantities((prev) => ({
                              ...prev,
                              [item.id]: `${num}${unit}`,
                            }));
                          }}
                          className="font-bold text-[11px] text-[#2892c2] leading-[20px] w-[24px] text-center bg-transparent outline-none"
                          style={{
                            cursor: item.status ? "not-allowed" : "text",
                          }}
                        />
                        <button
                          onClick={() => addQty(item.id)}
                          disabled={!!item.status}
                          className="w-[18px] h-[18px] rounded-full bg-[#2892c2] flex items-center justify-center shrink-0 disabled:cursor-not-allowed"
                        >
                          <span className="font-bold text-[10px] text-white leading-none">
                            +
                          </span>
                        </button>
                        <div className="absolute bottom-0 left-[28px] w-[24px] h-[1px] bg-[#2892c2] rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 페이지네이션 */}
              <div className="flex items-center justify-end gap-[5px]">
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
                <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
                  {page} / {totalPages}
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

            {/* 하단 CTA — 수동발주 완료 → 2배 초과 검증 → step 2 */}
            <div className="px-[15px] flex items-center justify-between">
              <button
                onClick={() => setActiveStep(0)}
                className="w-[43px] h-[33px] px-[12px] py-[4px] rounded-[20px] flex items-center justify-center gap-[7px] cursor-pointer bg-[#3CAADD]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="6"
                  height="9"
                  viewBox="0 0 6 9"
                  fill="none"
                >
                  <path
                    d="M0.204082 4.91567L4.81679 8.82782C4.94678 8.93807 5.12307 9 5.30689 9C5.49072 9 5.66701 8.93807 5.79699 8.82782C5.92698 8.71758 6 8.56806 6 8.41216C6 8.25625 5.92698 8.10673 5.79699 7.99649L1.67381 4.50049L5.79584 1.00351C5.8602 0.948922 5.91126 0.884119 5.94609 0.812799C5.98092 0.741479 5.99885 0.665038 5.99885 0.587842C5.99885 0.510645 5.98092 0.434205 5.94609 0.362884C5.91126 0.291564 5.8602 0.226761 5.79584 0.172175C5.73148 0.117589 5.65507 0.0742887 5.57098 0.0447468C5.48689 0.015205 5.39676 -5.75159e-10 5.30574 0C5.21472 5.75159e-10 5.12459 0.015205 5.0405 0.0447468C4.95641 0.0742887 4.88 0.117589 4.81564 0.172175L0.202929 4.08433C0.138501 4.13892 0.0874095 4.20375 0.0525866 4.27511C0.0177631 4.34648 -0.000106812 4.42297 4.76837e-07 4.5002C0.000107288 4.57744 0.0181904 4.65389 0.0532112 4.72519C0.088232 4.79648 0.139502 4.86121 0.204082 4.91567Z"
                    fill="white"
                  />
                </svg>
              </button>
              <button
                onClick={() => {
                  const over = allItems
                    .filter((item) => {
                      if (item.status) return false;
                      const aiNum =
                        parseInt(
                          item.aiRecommendedQty.replace(/[^0-9]/g, ""),
                          10,
                        ) || 0;
                      const inputNum =
                        parseInt(
                          (
                            quantities[item.id] ?? item.aiRecommendedQty
                          ).replace(/[^0-9]/g, ""),
                          10,
                        ) || 0;
                      return aiNum > 0 && inputNum > aiNum * 2;
                    })
                    .map((item) => ({
                      name: item.name,
                      aiQty: item.aiRecommendedQty,
                      inputQty: quantities[item.id] ?? item.aiRecommendedQty,
                    }));
                  if (over.length > 0) {
                    setOverLimitItems(over);
                  } else {
                    setActiveStep(2);
                    setStep2Pages([1, 1]);
                  }
                }}
                className="w-[90%] h-[33px] rounded-[20px] flex items-center justify-between px-[20px] cursor-pointer"
                style={{
                  backgroundImage:
                    "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                }}
              >
                <div className="flex items-center gap-[7px]">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="shrink-0"
                  >
                    <circle
                      cx="6"
                      cy="6"
                      r="5"
                      stroke="white"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4 6l1.5 1.5L8 4"
                      stroke="white"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="font-bold text-[11px] text-white leading-[13px]">
                    수동발주 완료
                  </p>
                </div>
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
        )}

        {/* ── Step 2: 점주 최종 컨펌 ── */}
        {activeStep === 2 &&
          (() => {
            const groups = buildReviewGroups(allItems, summary?.reportDate);
            const DELIVERY_FEE = 3000;
            const calcTotal = (items: AiOrderItem[], useAi: boolean) =>
              items
                .filter((item) => !item.status)
                .reduce((sum, item) => {
                  const price =
                    parseInt(item.unitPrice.replace(/[^0-9]/g, ""), 10) || 0;
                  const qty =
                    parseInt(
                      (useAi
                        ? item.aiRecommendedQty
                        : (quantities[item.id] ?? item.aiRecommendedQty)
                      ).replace(/[^0-9]/g, ""),
                      10,
                    ) || 0;
                  return sum + price * qty;
                }, 0);
            const dawnTotal = calcTotal(groups[0]?.items ?? [], false);
            const lunchTotal = calcTotal(groups[1]?.items ?? [], false);
            const grandTotal = dawnTotal + lunchTotal + DELIVERY_FEE;
            const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";
            return (
              <div className="flex flex-col gap-[15px] pt-[15px]">
                {groups.map((group, gIdx) => {
                  const G_PAGE_SIZE = 3;
                  const gPage = step2Pages[gIdx as 0 | 1];
                  const gTotalPages = Math.max(
                    1,
                    Math.ceil(group.items.length / G_PAGE_SIZE),
                  );
                  const gItems = group.items.slice(
                    (gPage - 1) * G_PAGE_SIZE,
                    gPage * G_PAGE_SIZE,
                  );
                  const setGPage = (p: number) =>
                    setStep2Pages((prev) => {
                      const next: [number, number] = [...prev] as [
                        number,
                        number,
                      ];
                      next[gIdx] = p;
                      return next;
                    });
                  return (
                    <div
                      key={group.key}
                      className="flex flex-col gap-[10px] px-[15px]"
                    >
                      {(group.label || group.time) && (
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-[0px] text-[#555] leading-[1.5]">
                            {group.label && (
                              <span className="text-[11px]">{group.label} </span>
                            )}
                            {group.time && (
                              <span className="font-normal text-[9px]">
                                {group.time}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* 아이템 목록 */}
                      <div className="flex flex-col gap-[15px] min-h-[150px]">
                        {gItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between"
                          >
                   <div className="flex items-center gap-[6px] w-[165px] shrink-0">
                      <img
                        src={getProductImageByName(item.name)}
                        alt={item.name}
                        className="w-[37px] h-[37px] rounded-[10px] shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                        }}
                      />
                       <div className="flex flex-col">
                         <p className="font-bold text-[11px] text-[#222] leading-[20px]">
                           {item.name}
                                </p>
                                <p className="text-[10px] text-[#888] leading-[20px]">
                                  {item.unitPrice} /{" "}
                                  <span
                                    style={{
                                      color: item.stockWarning
                                        ? "#ff522c"
                                        : "#888",
                                    }}
                                  >
                                    {item.stockInfo}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-[25px] justify-end px-[10px] flex-1">
                              {getStatusBadge(item.status)}
                              <p className="text-[10px] text-[#787878] leading-[20px] whitespace-nowrap">
                                {item.orderDate}
                              </p>
                              <p className="font-bold text-[11px] text-[#2892c2] leading-[20px] w-[80px] text-right">
                                {quantities[item.id] ?? item.aiRecommendedQty}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 페이지네이션 */}
                      <div className="flex items-center justify-end gap-[5px]">
                        {gPage > 1 && (
                          <button
                            onClick={() => setGPage(gPage - 1)}
                            className="shrink-0 rotate-180"
                            aria-label="이전"
                          >
                            <svg
                              width="5"
                              height="7"
                              viewBox="0 0 5 7"
                              fill="none"
                            >
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
                        <p className="font-bold text-[9px] text-[#595959] leading-[10px]">
                          {gPage} / {gTotalPages}
                        </p>
                        <button
                          onClick={() =>
                            setGPage(Math.min(gPage + 1, gTotalPages))
                          }
                          disabled={gPage >= gTotalPages}
                          className="shrink-0 disabled:opacity-30"
                          aria-label="다음"
                        >
                          <svg
                            width="5"
                            height="7"
                            viewBox="0 0 5 7"
                            fill="none"
                          >
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
                  );
                })}

                {/* 하단 금액 요약 + 버튼 카드 */}
                <div className="mx-[0px] bg-white rounded-[20px] px-[15px] py-[11px] flex flex-col gap-[10px]">
                  {/* 금액 요약 행 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[10px]">
                      {groups.length > 1 ? (
                        <>
                          <div className="flex flex-col items-center text-[#333]">
                            <p className="text-[11px] leading-[20px]">
                              새벽 납품 금액
                            </p>
                            <p className="font-semibold text-[12px] leading-[21px]">
                              {fmt(dawnTotal)}
                            </p>
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-[#b3b4b5] flex items-center justify-center shrink-0">
                            <span className="font-bold text-[9px] text-white leading-none">
                              +
                            </span>
                          </div>
                          <div className="flex flex-col items-center text-[#333]">
                            <p className="text-[11px] leading-[20px]">
                              점심 납품 금액
                            </p>
                            <p className="font-semibold text-[12px] leading-[21px]">
                              {fmt(lunchTotal)}
                            </p>
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-[#b3b4b5] flex items-center justify-center shrink-0">
                            <span className="font-bold text-[9px] text-white leading-none">
                              +
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col items-center text-[#333]">
                            <p className="text-[11px] leading-[20px]">
                              발주 금액
                            </p>
                            <p className="font-semibold text-[12px] leading-[21px]">
                              {fmt(grandTotal - DELIVERY_FEE)}
                            </p>
                          </div>
                          <div className="w-[18px] h-[18px] rounded-full bg-[#b3b4b5] flex items-center justify-center shrink-0">
                            <span className="font-bold text-[9px] text-white leading-none">
                              +
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex flex-col items-center text-[#333]">
                        <p className="text-[11px] leading-[20px]">배송비</p>
                        <p className="font-semibold text-[12px] leading-[21px]">
                          {fmt(DELIVERY_FEE)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-[2px]">
                      <p className="font-bold text-[12px] text-black leading-[21px]">
                        총 주문 금액
                      </p>
                      <p className="font-bold text-[12px] text-[#2892c1] leading-[21px]">
                        {fmt(grandTotal)}
                      </p>
                    </div>
                  </div>

                  {/* 버튼 행 */}
                  <div className="flex items-center gap-[16px]">
                    {/* 뒤로 가기 */}
                    <button
                      onClick={() => setActiveStep(1)}
                      className="w-[43px] h-[33px] rounded-[20px] flex items-center justify-center shrink-0 cursor-pointer bg-[#3caadd]"
                    >
                      <svg width="6" height="9" viewBox="0 0 6 9" fill="none">
                        <path
                          d="M5 1L1.5 4.5L5 8"
                          stroke="white"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {/* 발주 넣기 */}
                    <button
                      onClick={() => setShowConfirm(true)}
                      className="flex-1 h-[33px] rounded-[20px] flex items-center justify-between px-[20px] cursor-pointer"
                      style={{
                        backgroundImage:
                          "linear-gradient(119deg, #3faf60 50.65%, #3aaedd 121.87%)",
                      }}
                    >
                      <div className="flex items-center gap-[7px]">
                        <svg
                          width="11"
                          height="12"
                          viewBox="0 0 11 12"
                          fill="none"
                          className="shrink-0"
                        >
                          <path
                            d="M1 6h9M6 1.5l4.5 4.5L6 10.5"
                            stroke="white"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <p className="font-bold text-[13px] text-white leading-[13px]">
                          최종 발주 넣기
                        </p>
                      </div>
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
          })()}
      </div>

      {/* ── 수량 초과 경고 팝업 ── */}
      {overLimitItems && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          <div className="bg-white rounded-[16px] w-[280px] overflow-hidden shadow-xl">
            {/* 헤더 */}
            <div className="px-[18px] pt-[18px] pb-[12px] flex flex-col gap-[8px]">
              <div className="flex items-center gap-[6px]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1.5L14.5 13H1.5L8 1.5Z"
                    stroke="#ff522c"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6v3.5"
                    stroke="#ff522c"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                  <circle cx="8" cy="11.5" r="0.7" fill="#ff522c" />
                </svg>
                <p className="font-bold text-[12px] text-[#222] leading-[18px]">
                  발주 수량 초과 확인
                </p>
              </div>
              <p className="text-[10px] text-[#555] leading-[15px]">
                아래 품목이 추천 수량의{" "}
                <span className="font-bold text-[red]">2배</span>를
                초과했습니다.
                <br />
                그래도 발주를 진행하시겠습니까?
              </p>
              {/* 초과 품목 목록 */}
              <div className="flex flex-col gap-[6px] mt-[2px] max-h-[160px] overflow-y-auto">
                {overLimitItems.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-[#fff] rounded-[8px] px-[10px] py-[6px] border border-[#B3B4B5]"
                  >
                    <p className="font-500 text-[10px] text-[#222]">
                      {it.name}
                    </p>
                    <div className="flex items-center gap-[4px] text-[9px]">
                      <span className="text-[#333]">AI {it.aiQty}</span>
                      <span className="text-[#333]">→</span>
                      <span className="font-bold text-[red]">
                        {it.inputQty.replace(/[^0-9]/g, "")}개
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* 구분선 */}
            <div className="h-[1px] bg-[#f0f1f3]" />
            {/* 버튼 */}
            <div className="flex">
              <button
                onClick={() => setOverLimitItems(null)}
                className="flex-1 h-[42px] flex items-center justify-center text-[11px] text-[#888] font-bold cursor-pointer hover:bg-[#f7f7f7] transition-colors"
              >
                수정하기
              </button>
              <div className="w-[1px] bg-[#f0f1f3]" />
              <button
                onClick={() => {
                  setOverLimitItems(null);
                  setActiveStep(2);
                  setStep2Pages([1, 1]);
                }}
                className="flex-1 h-[42px] flex items-center justify-center text-[11px] font-bold cursor-pointer hover:bg-[#2892C2] transition-colors hover:text-white text-[#2892C2]"
              >
                진행하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 최종 발주 확인 팝업 ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-[10px] w-[280px] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div
              className="px-[18px] py-[10px] flex flex-col gap-[6px]"
              style={{
                backgroundImage:
                  "linear-gradient(119deg, #3faf60 50.65%, #3aaedd 121.87%)",
              }}
            >
              <p className="font-bold text-[14px] text-white leading-[20px]">
                최종 발주 확인
              </p>
            </div>
            {/* 본문 */}
            <div className="px-[18px] py-[14px]">
              <p className="text-[11px] text-[#555] leading-[18px]">
                총{" "}
                <span className="font-bold text-[#2892C2]">
                  {allItems.length}
                </span>
                개 품목을 발주하시겠습니까?
                <br />
                발주 후 발주 관리 목록에 추가됩니다.
              </p>
            </div>
            <div className="h-[1px] bg-[#f0f1f3]" />
            {/* 버튼 */}
            <div className="flex">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-[44px] flex items-center justify-center text-[12px] text-[#888] font-bold cursor-pointer hover:bg-[#f7f7f7] transition-colors"
              >
                아니오
              </button>
              <div className="w-[1px] bg-[#f0f1f3]" />
              <button
                onClick={() => {
                  onOrderComplete?.(allItems);
                  setShowConfirm(false);
                }}
                className="flex-1 h-[44px] flex items-center justify-center text-[12px] font-bold cursor-pointer transition-colors"
                style={{
                  backgroundImage:
                    "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 가상 데이터 (api.ts > mockAiOrderItems / mockAiOrderSummary 참고) ──
// AiOrderSummary: { weekLabel, reportDate, reportTime, totalCount, aiScore }
// AiOrderItem 필드: id, name, bgColor, unitPrice, stockInfo, stockWarning,
//   category("도넛"|"커피원두"|"냉동/냉장"|"용품/상품"),
//   orderDate, aiRecommendedQty, aiReason, status("발주 완료"|"납품 완료"|null)
//
// API 함수: getAiOrderSummary(), getAiOrderItems() → src/lib/api.ts
