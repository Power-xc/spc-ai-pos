import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import AiOrder, { getOrderSteps } from "./AiOrder";
import ManualOrder from "./ManualOrder";
import DatePicker from "../ui/DatePicker";

import FilterReset from "../../../assets/ico-filterReset.svg";
import { getOrderMonthSummary, getAiOrderItems } from "../../../lib/api";
import { resolveProductDisplayName } from "../../../lib/productNameResolver";
import { DEMO_PRIMARY_STORE_ID } from "../../../lib/demoStoreConfig";
import { getDemoDate } from "../../../lib/demoDateTime";
import type {
  AiOrderItem,
  OrderMonthSummary,
  OrderDetailCategory,
} from "../../../types";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

type OrderStatus = "대기" | "승인완료" | "발주완료" | "납품완료" | "취소";

const CATEGORY_FILTER_TABS: Array<"전체" | OrderDetailCategory> = [
  "전체",
  "도넛",
  "음료",
  "커피원두",
  "냉동/냉장",
  "용품/상품",
  "기타",
];

const STATUS_FILTER_TABS: Array<"전체" | OrderStatus> = [
  "전체",
  "대기",
  "승인완료",
  "발주완료",
  "납품완료",
  "취소",
];

const PAGE_SIZE = 6;
const ORDER_STATE_STORAGE_KEY_PREFIX = "pip-pos:order-management";

type PersistedOrderManagementState = {
  allItems: AiOrderItem[];
  statusMap: Record<string, OrderStatus>;
  orderNumbers: Record<string, string>;
};

function parseNum(str: string): number {
  return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
}

function calcItemTotal(item: AiOrderItem): string {
  const price = parseNum(item.unitPrice);
  const qty = parseNum(item.aiRecommendedQty);
  return (price * qty).toLocaleString("ko-KR") + "원";
}

function initStatus(status: AiOrderItem["status"]): OrderStatus {
  if (status === "발주 완료") return "발주완료";
  if (status === "납품 완료") return "납품완료";
  return "대기";
}

function getCategoryStyle(category: OrderDetailCategory): {
  bg: string;
  color: string;
} {
  switch (category) {
    case "도넛":
      return { bg: "#fff3e0", color: "#e07820" };
    case "음료":
      return { bg: "#eaf6ff", color: "#3aaedd" };
    case "커피원두":
      return { bg: "#efe7dc", color: "#8a5a2b" };
    case "냉동/냉장":
      return { bg: "#eaf8f0", color: "#3faf60" };
    case "용품/상품":
    case "기타":
      return { bg: "#f0f1f3", color: "#595959" };
    default:
      return { bg: "#f0f1f3", color: "#595959" };
  }
}

function getOrderStateStorageKey() {
  return `${ORDER_STATE_STORAGE_KEY_PREFIX}:${DEMO_PRIMARY_STORE_ID}:${getDemoDate()}`;
}

function loadPersistedOrderState(): PersistedOrderManagementState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getOrderStateStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedOrderManagementState>;
    if (!Array.isArray(parsed.allItems)) return null;
    return {
      allItems: parsed.allItems,
      statusMap: parsed.statusMap ?? {},
      orderNumbers: parsed.orderNumbers ?? {},
    };
  } catch {
    return null;
  }
}

function persistOrderState(state: PersistedOrderManagementState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getOrderStateStorageKey(), JSON.stringify(state));
  } catch {
    // ignore persistence errors in demo mode
  }
}

export default function OrderManagement({
  isAiPanelOpen,
  isSidebarOpen,
}: MenuProps) {
  const [summary, setSummary] = useState<OrderMonthSummary | null>(null);
  const [allItems, setAllItems] = useState<AiOrderItem[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, OrderStatus>>({});
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState<
    "전체" | OrderDetailCategory
  >("전체");
  const [statusFilter, setStatusFilter] = useState<"전체" | OrderStatus>(
    "전체",
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAi, setShowAi] = useState(false);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [detailItem, setDetailItem] = useState<AiOrderItem | null>(null);
  const [manualForm, setManualForm] = useState<{
    itemName: string;
    category: OrderDetailCategory | "";
    supplier: string;
    qty: number;
    unit: string;
    unitPrice: number;
    deliveryDate: string;
    manager: string;
    memo: string;
  }>({
    itemName: "",
    category: "",
    supplier: "",
    qty: 1,
    unit: "개",
    unitPrice: 0,
    deliveryDate: "",
    manager: "",
    memo: "",
  });

  useEffect(() => {
    getOrderMonthSummary().then(setSummary);
    const persisted = loadPersistedOrderState();
    getAiOrderItems().then((items) => {
      const initSt: Record<string, OrderStatus> = {};
      const initNums: Record<string, string> = {};
      items.forEach((item, idx) => {
        initSt[item.id] = initStatus(item.status);
        initNums[item.id] =
          `PO-2026-${String(items.length + 29 - idx).padStart(3, "0")}`;
      });
      const mergedItems = persisted
        ? [
            ...persisted.allItems.filter(
              (storedItem) => !items.some((baseItem) => baseItem.id === storedItem.id),
            ),
            ...items,
          ]
        : items;
      const mergedStatusMap = { ...initSt, ...(persisted?.statusMap ?? {}) };
      const mergedOrderNumbers = { ...initNums, ...(persisted?.orderNumbers ?? {}) };
      setAllItems(mergedItems);
      setStatusMap(mergedStatusMap);
      setOrderNumbers(mergedOrderNumbers);
    });
  }, []);

  useEffect(() => {
    if (!allItems.length) return;
    persistOrderState({ allItems, statusMap, orderNumbers });
  }, [allItems, orderNumbers, statusMap]);

  function handleManualOrderSubmit() {
    setShowManualOrder(false);
    setManualForm({
      itemName: "", category: "", supplier: "", qty: 1,
      unit: "개", unitPrice: 0, deliveryDate: "", manager: "", memo: "",
    });
  }

  const totalAmount = allItems
    .reduce(
      (acc, item) =>
        acc + parseNum(item.unitPrice) * parseNum(item.aiRecommendedQty),
      0,
    )
    .toLocaleString("ko-KR");

  const filtered = allItems.filter((item) => {
    if (search && !item.name.includes(search)) return false;
    if (categoryFilter !== "전체" && item.category !== categoryFilter)
      return false;
    if (statusFilter !== "전체" && statusMap[item.id] !== statusFilter)
      return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const advanceStatus = (id: string) => {
    setStatusMap((prev) => {
      const cur = prev[id];
      const next: OrderStatus =
        cur === "대기"
          ? "승인완료"
          : cur === "승인완료"
            ? "발주완료"
            : cur === "발주완료"
              ? "납품완료"
              : cur;
      return { ...prev, [id]: next };
    });
  };

  const getActionLabel = (status: OrderStatus): string | null => {
    if (status === "대기") return "승인완료";
    if (status === "승인완료") return "발주완료";
    if (status === "발주완료") return "납품완료";
    return null;
  };

  const handleOrderComplete = (newItems: AiOrderItem[]) => {
    const timestamp = Date.now();
    const itemsToAdd: AiOrderItem[] = newItems.map((item, idx) => ({
      ...item,
      id: `new-${timestamp}-${idx}`,
      status: null,
    }));
    setAllItems((prev) => [...itemsToAdd, ...prev]);
    setStatusMap((prev) => {
      const next = { ...prev };
      itemsToAdd.forEach((item) => {
        next[item.id] = "대기";
      });
      return next;
    });
    setOrderNumbers((prev) => {
      const next = { ...prev };
      const base = Date.now();
      itemsToAdd.forEach((item, idx) => {
        next[item.id] =
          `PO-${String(base).slice(-4)}-${String(idx + 1).padStart(3, "0")}`;
      });
      return next;
    });
    setShowAi(false);
  };

  const resetFilters = () => {
    setCategoryFilter("전체");
    setStatusFilter("전체");
    setSearch("");
    setPage(1);
  };

  const getStatusBadge = (status: OrderStatus) => {
    if (status === "대기")
      return (
        <div className="flex items-center justify-center px-[6px] h-[18px] rounded-[10px] border border-[#d8d8d8] shrink-0">
          <p className="text-[8px] text-[#888] leading-none">대기</p>
        </div>
      );
    if (status === "승인완료")
      return (
        <div className="flex items-center justify-center px-[6px] h-[18px] rounded-[10px] border border-[#3faf60] shrink-0">
          <p className="font-bold text-[8px] text-[#3faf60] leading-none">
            ✓ 승인완료
          </p>
        </div>
      );
    if (status === "발주완료")
      return (
        <div
          className="flex items-center justify-center px-[6px] h-[18px] rounded-[10px] shrink-0"
          style={{
            backgroundImage:
              "linear-gradient(96deg, #3faf60 50.65%, #3aaedd 121.87%)",
          }}
        >
          <p className="font-bold text-[8px] text-white leading-none">
            발주완료
          </p>
        </div>
      );
    if (status === "납품완료")
      return (
        <div
          className="flex items-center justify-center px-[6px] h-[18px] rounded-[10px] shrink-0"
          style={{
            backgroundImage:
              "linear-gradient(96deg, #429ddd 50.65%, #3aaedd 121.87%)",
          }}
        >
          <p className="font-bold text-[8px] text-white leading-none">
            ✓ 납품완료
          </p>
        </div>
      );
    return (
      <div className="flex items-center justify-center px-[6px] h-[18px] rounded-[10px] bg-[#ff522c] shrink-0">
        <p className="font-bold text-[8px] text-white leading-none">✗ 취소</p>
      </div>
    );
  };

  if (showAi) {
    return (
      <ContentWrapper
        isAiPanelOpen={isAiPanelOpen}
        isSidebarOpen={isSidebarOpen}
      >
        <AiOrder
          open={true}
          onOrderComplete={handleOrderComplete}
          onClose={() => setShowAi(false)}
        />
      </ContentWrapper>
    );
  }

  if (showManualOrder) {
    return (
      <ContentWrapper
        isAiPanelOpen={isAiPanelOpen}
        isSidebarOpen={isSidebarOpen}
      >
        <AiOrder
          open={true}
          initialStep={0}
          mode="manual"
          onOrderComplete={handleOrderComplete}
          onClose={() => setShowManualOrder(false)}
        />
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      {/* ── 이번달 총 발주 배너 ── */}
      {summary && (
        <div className="bg-black border border-[#ebebeb] rounded-[20px] px-[15px] py-[15px] flex items-center justify-between">
          <div className="flex items-center gap-[12px]">
            <p className="font-bold text-[12px] text-white leading-[21px]">
              이번달 총 발주
            </p>
            <div className="bg-[rgba(255,255,255,0.15)] rounded-[20px] px-[10px] py-[2px]">
              <p className="font-[500] text-[13px] text-white leading-[21px]">
                {totalAmount} 원
              </p>
            </div>
          </div>
          <div className="flex items-center gap-[24px]">
            <div className="flex items-center gap-[8px]">
              <div className="w-[9px] h-[5px] bg-white rounded-[30px]" />
              <p className="font-bold text-[12px] text-white leading-[21px]">
                AI 추천 발주
              </p>
              <button
                onClick={() => setShowAi(true)}
                className="bg-[rgba(255,255,255,0.15)] rounded-[10px] px-[8px] cursor-pointer"
              >
                <p className="font-bold text-[11px] text-white leading-[21px]">
                  바로가기
                </p>
              </button>
            </div>
            <div className="flex items-center gap-[8px]">
              <div className="w-[9px] h-[5px] bg-white rounded-[30px]" />
              <p className="font-bold text-[12px] text-white leading-[21px]">
                수동발주
              </p>
              <button
                onClick={() => setShowManualOrder(true)}
                className="bg-[rgba(255,255,255,0.15)] rounded-[10px] px-[8px] cursor-pointer"
              >
                <p className="font-bold text-[11px] text-white leading-[21px]">
                  바로가기
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 발주 목록 카드 ── */}
      <div className="bg-white border border-[#ebebeb] rounded-[20px] flex flex-col pt-[15px] pb-[15px]">
        {/* 카드 헤더 */}
        <div className="flex items-center justify-between px-[20px] pb-[12px]">
          <div className="flex items-center gap-[6px]">
            <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
            <p className="font-bold text-[12px] text-[#555] leading-[20px]">
              발주 목록
            </p>
            <span className="font-bold text-[9px] text-[#3aaedd] leading-[20px]">
              총 {filtered.length}개
            </span>
          </div>
          {/* 검색 + 초기화 */}
          <div className="flex items-center gap-[5px]">
            <div className="flex items-center gap-[3px] border border-[#d8d8d8] rounded-[20px] px-[7px] h-[22px] w-[110px]">
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <path
                  d="M3.06669 5.73333C4.53945 5.73333 5.73336 4.53942 5.73336 3.06666C5.73336 1.5939 4.53945 0.399994 3.06669 0.399994C1.59393 0.399994 0.400024 1.5939 0.400024 3.06666C0.400024 4.53942 1.59393 5.73333 3.06669 5.73333Z"
                  stroke="#555555"
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.40001 6.39999L4.96667 4.96666"
                  stroke="#555555"
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
            <button
              onClick={resetFilters}
              className="flex items-center px-[5px] py-[4px] rounded-[20px] border border-[#d8d8d8] cursor-pointer"
            >
              <img src={FilterReset} alt="초기화" />
            </button>
          </div>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex items-center gap-[6px] px-[15px] py-[8px] border-t border-[#f0f1f3]">
          <p className="font-bold text-[9px] text-[#555] shrink-0 leading-none w-[45px]">
            카테고리
          </p>
          <div
            className="flex items-center gap-[4px] overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {CATEGORY_FILTER_TABS.map((tab) => {
              const isActive = categoryFilter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setCategoryFilter(tab);
                    setPage(1);
                  }}
                  className="flex items-center justify-center px-[10px] py-[3px] h-[19px] rounded-[20px] shrink-0 text-[9px] leading-none cursor-pointer transition-colors"
                  style={
                    isActive
                      ? {
                          backgroundImage:
                            "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
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
        </div>

        {/* 상태 필터 */}
        <div className="flex items-center gap-[6px] px-[15px] py-[8px] pt-0">
          <p className="font-bold text-[9px] text-[#555] shrink-0 leading-none w-[45px]">
            상태
          </p>
          <div
            className="flex items-center gap-[4px] overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {STATUS_FILTER_TABS.map((tab) => {
              const isActive = statusFilter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setStatusFilter(tab);
                    setPage(1);
                  }}
                  className="flex items-center justify-center px-[10px] py-[3px] h-[19px] rounded-[20px] shrink-0 text-[9px] leading-none cursor-pointer transition-colors"
                  style={
                    isActive
                      ? {
                          background: "#3aaedd",
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
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* 테이블 헤더 */}
          <div className="flex items-center gap-[8px] px-[15px] pt-[10px] pb-[8px] border-t border-[#f0f1f3] w-full">
            <p className="font-bold text-[8px] text-[#555] flex-1 min-w-[100px]">
              발주번호 / 품목명
            </p>
            <p className="font-bold text-[8px] text-[#555] w-[50px] shrink-0 text-center">
              카테고리
            </p>
            <p className="font-bold text-[8px] text-[#555] w-[36px] shrink-0 text-center">
              수량
            </p>
            <p className="font-bold text-[8px] text-[#555] w-[62px] shrink-0 text-right">
              총금액
            </p>
            <p className="font-bold text-[8px] text-[#555] w-[62px] shrink-0 text-center">
              납품요청일
            </p>
            <p className="font-bold text-[8px] text-[#555] w-[130px] shrink-0 text-center">
              상태·액션
            </p>
          </div>

          <div className="h-[1px] bg-[#f0f1f3] " />

          {/* 아이템 목록 */}
          <div className="flex flex-col min-h-[350px]">
            {pagedItems.map((item) => {
              const status = statusMap[item.id] ?? "대기";
              const catStyle = getCategoryStyle(item.category);
              const total = calcItemTotal(item);

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-[8px] px-[15px] py-[10px] border-b border-[#f0f1f3] last:border-b-0 min-w-[520px]"
                >
                  {/* 품목명 */}
                  <div className="flex-1 min-w-[100px] flex flex-col justify-center">
                    <p className="font-bold text-[10px] text-[#222] leading-[16px]">
                      {/* 발주번호 */}
                      <span className="text-[#3aaedd] text-[8px] block mt-[-4px]">
                        {orderNumbers[item.id] ?? ""}
                      </span>

                       {resolveProductDisplayName(item.name)}
                    </p>
                    {item.stockWarning && (
                      <p className="text-[8px] text-[#ff522c] leading-[13px]">
                        {item.aiReason}
                      </p>
                    )}
                  </div>

                  {/* 카테고리 배지 */}
                  <div className="w-[50px] shrink-0 flex justify-center">
                    <div
                      className="flex items-center justify-center px-[6px] h-[18px] rounded-[6px]"
                      style={{
                        backgroundColor: catStyle.bg,
                      }}
                    >
                      <p
                        className="text-[8px] font-bold leading-none"
                        style={{ color: catStyle.color }}
                      >
                        {item.category}
                      </p>
                    </div>
                  </div>

                  {/* 수량 */}
                  <p className="text-[9px] font-bold text-[#3aaedd] w-[36px] shrink-0 text-center leading-[14px]">
                    {item.aiRecommendedQty}
                  </p>

                  {/* 총금액 */}
                  <p
                    className="text-[9px] font-bold w-[62px] shrink-0 text-right leading-[14px]"
                    style={{
                      backgroundImage:
                        "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {total}
                  </p>

                  {/* 납품요청일 */}
                  <p className="text-[8px] text-[#787878] w-[62px] shrink-0 text-center leading-[14px]">
                    {item.orderDate}
                  </p>

                  {/* 상태·액션 */}
                  <div className="w-[130px] shrink-0 flex items-center gap-[4px] justify-end">
                    {getStatusBadge(status)}
                    {/* 돋보기 */}
                    <button
                      onClick={() => setDetailItem(item)}
                      className="w-[18px] h-[18px] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                      >
                        <path
                          d="M4.33337 8.16667C6.44253 8.16667 8.16671 6.44248 8.16671 4.33333C8.16671 2.22418 6.44253 0.5 4.33337 0.5C2.22422 0.5 0.500041 2.22418 0.500041 4.33333C0.500041 6.44248 2.22422 8.16667 4.33337 8.16667Z"
                          stroke="#888"
                          strokeWidth="0.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.5 9.5L7.04167 7.04167"
                          stroke="#888"
                          strokeWidth="0.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {/* 액션 버튼 */}
                    {getActionLabel(status) && (
                      <button
                        onClick={() => advanceStatus(item.id)}
                        className="flex items-center justify-center px-[6px] h-[20px] rounded-[10px] shrink-0 cursor-pointer"
                        style={{
                          backgroundImage:
                            "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                        }}
                      >
                        <p className="font-bold text-[8px] text-white leading-none">
                          {getActionLabel(status)}
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 페이지네이션 */}
        <div className="flex items-center justify-end gap-[5px] px-[15px] pt-[10px]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="shrink-0 rotate-180 disabled:opacity-30"
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

      {/* ── 수동 발주 팝업 ── */}
      {showManualOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowManualOrder(false)}
        >
          <div
            className="bg-white rounded-[20px] w-[340px] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-[20px] pt-[18px] pb-[10px]">
              <div>
                <p className="font-bold text-[15px] text-[#222] leading-[22px]">
                  수동 발주 등록
                </p>
                <p className="text-[11px] text-[#888] leading-[18px]">
                  발주 정보를 직접 입력해 주세요
                </p>
              </div>
              <button
                onClick={() => setShowManualOrder(false)}
                className="w-[24px] h-[24px] flex items-center justify-center rounded-full bg-[#f0f1f3] cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path
                    d="M1 1l7 7M8 1L1 8"
                    stroke="#888"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* 폼 */}
            <div
              className="flex flex-col gap-[10px] px-[20px] pb-[16px] max-h-[70vh] overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {/* 품목명 */}
              <div className="flex flex-col gap-[4px]">
                <p className="text-[11px] font-bold text-[#333]">
                  품목명 <span className="text-[red]">*</span>
                </p>
                <input
                  type="text"
                  placeholder="예: 에스프레소 원두 (시그니처블렌드)"
                  value={manualForm.itemName}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, itemName: e.target.value }))
                  }
                  className="w-full border border-[#e0e0e0] rounded-[10px] px-[12px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors"
                />
              </div>

              {/* 카테고리 + 공급업체 */}
              <div className="flex gap-[8px]">
                <div className="flex flex-col gap-[4px] flex-1">
                  <p className="text-[11px] font-bold text-[#333]">
                    카테고리 <span className="text-[red]">*</span>
                  </p>
                  <div className="select-wrap">
                    <select
                      value={manualForm.category}
                      onChange={(e) =>
                        setManualForm((f) => ({
                          ...f,
                          category: e.target.value as OrderDetailCategory,
                        }))
                      }
                      className="w-full border border-[#e0e0e0] rounded-[10px] px-[10px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors bg-white cursor-pointer"
                    >
                      <option value="">선택</option>
                      <option value="도넛">도넛</option>
                      <option value="커피원두">커피원두</option>
                      <option value="냉동/냉장">냉동/냉장</option>
                      <option value="용품/상품">용품/상품</option>
                    </select>{" "}
                  </div>
                </div>
                <div className="flex flex-col gap-[4px] flex-1">
                  <p className="text-[11px] font-bold text-[#333]">
                    공급업체 <span className="text-[red]">*</span>
                  </p>
                  <input
                    type="text"
                    placeholder="예: 코리아커피로스터스"
                    value={manualForm.supplier}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, supplier: e.target.value }))
                    }
                    className="w-full border border-[#e0e0e0] rounded-[10px] px-[12px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors"
                  />
                </div>
              </div>

              {/* 수량 + 단위 + 단가 */}
              <div className="flex gap-[8px]">
                <div className="flex flex-col gap-[4px] w-[70px]">
                  <p className="text-[11px] font-bold text-[#333]">
                    수량 <span className="text-[red]">*</span>
                  </p>
                  <input
                    type="number"
                    min={1}
                    value={manualForm.qty}
                    onChange={(e) =>
                      setManualForm((f) => ({
                        ...f,
                        qty: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-full border border-[#e0e0e0] rounded-[10px] px-[10px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-[4px] w-[70px]">
                  <p className="text-[11px] font-bold text-[#333]">
                    단위 <span className="text-[red]">*</span>
                  </p>
                  <div className="select-wrap">
                    <select
                      value={manualForm.unit}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, unit: e.target.value }))
                      }
                      className="w-full border border-[#e0e0e0] rounded-[10px] px-[10px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors bg-white cursor-pointer"
                    >
                      <option value="개">개</option>
                      <option value="kg">kg</option>
                      <option value="병">병</option>
                      <option value="박스">박스</option>
                      <option value="봉">봉</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-[4px] flex-1">
                  <p className="text-[11px] font-bold text-[#333]">
                    단가 (원) <span className="text-[red]">*</span>
                  </p>
                  <input
                    type="number"
                    min={0}
                    value={manualForm.unitPrice}
                    onChange={(e) =>
                      setManualForm((f) => ({
                        ...f,
                        unitPrice: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="w-full border border-[#e0e0e0] rounded-[10px] px-[10px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors"
                  />
                </div>
              </div>

              {/* 총 발주금액 */}
              <div className="flex items-center justify-between bg-[#fff8f0] border border-[#ffe0cc] rounded-[10px] px-[14px] py-[10px]">
                <p className="text-[12px] font-bold text-[#333]">총 발주금액</p>
                <p
                  className="text-[14px] font-bold"
                  style={{ color: "#ff522c" }}
                >
                  {(manualForm.qty * manualForm.unitPrice).toLocaleString(
                    "ko-KR",
                  )}
                  원
                </p>
              </div>

              {/* 납품 요청일 + 담당자 */}
              <div className="flex gap-[8px]">
                <div className="flex flex-col gap-[4px] flex-1">
                  <p className="text-[11px] font-bold text-[#333]">
                    납품 요청일 <span className="text-[red]">*</span>
                  </p>
                  <div className="">
                    <DatePicker
                      value={manualForm.deliveryDate}
                      onChange={(val) =>
                        setManualForm((f) => ({ ...f, deliveryDate: val }))
                      }
                      placeholder="연도 - 월 - 일"
                      triggerClassName="flex w-full h-[35px] border border-[#e0e0e0] rounded-[10px] px-[12px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors gap-1 items-center"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-[4px] flex-1">
                  <p className="text-[11px] font-bold text-[#333]">담당자</p>
                  <input
                    type="text"
                    placeholder="예: 김운영"
                    value={manualForm.manager}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, manager: e.target.value }))
                    }
                    className="w-full border border-[#e0e0e0] rounded-[10px] px-[12px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors"
                  />
                </div>
              </div>

              {/* 메모 */}
              <div className="flex flex-col gap-[4px]">
                <p className="text-[11px] font-bold text-[#333]">메모 (선택)</p>
                <textarea
                  placeholder="특이사항, 납품 조건 등을 입력하세요..."
                  value={manualForm.memo}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, memo: e.target.value }))
                  }
                  rows={3}
                  className="w-full border border-[#e0e0e0] rounded-[10px] px-[12px] py-[8px] text-[12px] text-[#333] outline-none focus:border-[#3BB1E1] transition-colors resize-none"
                />
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="border-t border-[#f0f1f3] flex">
              <button
                onClick={() => setShowManualOrder(false)}
                className="flex-1 h-[46px] flex items-center justify-center text-[12px] text-[#888] cursor-pointer hover:bg-[#f9f9f9] transition-colors"
              >
                취소
              </button>
              <div className="w-[1px] bg-[#f0f1f3]" />
              <button
                onClick={handleManualOrderSubmit}
                disabled={
                  !manualForm.itemName ||
                  !manualForm.category ||
                  !manualForm.supplier ||
                  !manualForm.deliveryDate
                }
                className="flex-1 h-[46px] flex items-center justify-center text-[12px] font-bold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                style={{
                  background:
                    "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                }}
              >
                발주 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 발주 상세 팝업 ── */}
      {detailItem &&
        (() => {
          const status = statusMap[detailItem.id] ?? "대기";
          const catStyle = getCategoryStyle(detailItem.category);
          const total = calcItemTotal(detailItem);
          const orderNum = orderNumbers[detailItem.id] ?? "";
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
              onClick={() => setDetailItem(null)}
            >
              <div
                className="bg-white rounded-[15px] w-[280px] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 팝업 헤더 */}
                <div
                  className="flex items-center justify-between px-[15px] py-[10px] pb-0"
                  style={{
                    backgroundImage: "",
                  }}
                >
                  <div className="flex flex-col gap-[2px]">
                    <p className="font-bold text-[13px] text-[#333] leading-[18px]">
                      {resolveProductDisplayName(detailItem.name)}
                    </p>
                    <p className="text-[9px] text-[#333] opacity-80 leading-[14px]">
                      {orderNum}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailItem(null)}
                    className="w-[22px] h-[22px] flex items-center justify-center rounded-full bg-[#eee] cursor-pointer"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1 1l6 6M7 1L1 7"
                        stroke="#333"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* 팝업 본문 */}
                <div className="flex flex-col gap-[10px] px-[15px] py-[15px]">
                  {/* 카테고리 + 상태 */}
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center justify-center px-[8px] h-[20px] rounded-[6px]"
                      style={{ backgroundColor: catStyle.bg }}
                    >
                      <p
                        className="text-[9px] font-bold leading-none"
                        style={{ color: catStyle.color }}
                      >
                        {detailItem.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <p className="text-[9px] text-[#888]">상태</p>
                      <p className="font-bold text-[9px] text-[#3aaedd]">
                        {status}
                      </p>
                    </div>
                  </div>

                  <div className="h-[1px] bg-[#f0f1f3]" />

                  {/* 상세 정보 그리드 */}
                  {[
                    { label: "단가", value: detailItem.unitPrice },
                    { label: "발주 수량", value: detailItem.aiRecommendedQty },
                    { label: "총금액", value: total },
                    { label: "납품요청일", value: detailItem.orderDate },
                    { label: "현재 재고", value: detailItem.stockInfo },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between"
                    >
                      <p className="text-[9px] text-[#727171] leading-[18px]">
                        {label}
                      </p>
                      <p
                        className="font-bold text-[10px] text-[#222] leading-[18px]"
                        style={
                          label === "총금액"
                            ? {
                                color: "#FF522C",
                              }
                            : {}
                        }
                      >
                        {value}
                      </p>
                    </div>
                  ))}

                  {/* AI 추천 사유 */}
                  {detailItem.aiReason && (
                    <>
                      <div className="h-[1px] bg-[#f0f1f3]" />
                      <div className="flex flex-col gap-[4px]">
                        <p className="text-[9px] text-[#888]">추천 사유</p>
                        <p className="text-[10px] text-[#555] leading-[16px]">
                          {detailItem.aiReason}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* 팝업 하단 버튼 */}
                <div className="border-t border-[#f0f1f3] flex">
                  <button
                    onClick={() => setDetailItem(null)}
                    className="flex-1 h-[42px] flex items-center justify-center text-[11px] text-[#888] cursor-pointer hover:bg-[#f9f9f9] transition-colors"
                  >
                    닫기
                  </button>
                  {getActionLabel(status) && (
                    <>
                      <div className="w-[1px] bg-[#f0f1f3]" />
                      <button
                        onClick={() => {
                          advanceStatus(detailItem.id);
                          setDetailItem(null);
                        }}
                        className="flex-1 h-[42px] flex items-center justify-center text-[11px] font-bold cursor-pointer transition-colors"
                        style={{
                          backgroundImage:
                            "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {getActionLabel(status)}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </ContentWrapper>
  );
}
