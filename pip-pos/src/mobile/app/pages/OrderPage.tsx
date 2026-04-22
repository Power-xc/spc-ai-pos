import { useState, useEffect, useRef } from "react";
import type {
  OrderPageData,
  OrderItem,
  AiRecommendedItem,
} from "@/mobile/types";
import { getOrderPageData } from "@/mobile/lib/api";

const PAGE_SIZE = 4;
const CATEGORIES = ["전체", "도넛", "먼치킨", "원재료", "포장"] as const;
const SORTS = ["최신순", "이름순", "단가 낮은순", "단가 높은순"] as const;

const CATEGORY_BG: Record<string, string> = {
  도넛: "bg-[#fef3cd]",
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
    <div className="bg-[#f6f7f9] border border-[#ebedef] rounded-[20px] px-[12px] py-[11px] flex flex-col gap-[10px] w-[84px] shrink-0">
      <p className="text-center text-[9px] leading-[12px]">
        <span className="text-[#6f6f6f]">추천 </span>
        <span className="font-bold text-[12px] text-black">
          {item.recommendedQty}
        </span>
        <span className="text-[#6f6f6f]">개</span>
      </p>
      <div
        className={`w-full aspect-square rounded-[21px] border border-[#dfdfdf] ${CATEGORY_BG["도넛"]}`}
      />
      <p className="text-[#555] text-[9px] text-center leading-[12px]">
        {item.name}
      </p>
      <p className="text-center text-[9px] leading-[12px]">
        <span className="text-[#6f6f6f]">재고 </span>
        <span className="font-bold text-[12px] text-black">
          {item.currentStock}
        </span>
        <span className="text-[#6f6f6f]">개</span>
      </p>
      <button
        onClick={onAdd}
        className={`w-full h-[21px] rounded-[10px] text-[12px] font-bold transition-colors ${
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
    <div className="bg-white rounded-[20px] px-[12px] py-[8px] flex items-center justify-between">
      <div className="flex items-center gap-[6px]">
        <div
          className={`w-[42px] h-[42px] rounded-[20px] shrink-0 ${CATEGORY_BG[item.category] ?? "bg-[#ebedef]"}`}
        />
        <div className="flex flex-col">
          <p className="text-[#222] text-[13px] font-bold leading-[20px]">
            {item.name}
          </p>
          <p className="text-[#636363] text-[10px] leading-[20px]">
            {item.category}류 / 재고{" "}
            <span className="font-bold">{item.stock}</span>개
          </p>
        </div>
      </div>
      {/* 수량 스테퍼 */}
      <div className="flex items-center gap-[6px]">
        <button
          onClick={() => onQtyChange(-1)}
          className="w-[18px] h-[18px] rounded-full border border-[#ccc] flex items-center justify-center shrink-0"
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
        <p className="font-bold text-[13px] text-black min-w-[30px] text-center">
          {qty}개
        </p>
        <button
          onClick={() => onQtyChange(1)}
          className="w-[18px] h-[18px] rounded-full bg-[#2892c2] flex items-center justify-center shrink-0"
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
// 발주 탭 메인 페이지
// ──────────────────────────────────────────────
export default function OrderPage() {
  const [data, setData] = useState<OrderPageData | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedAi, setAddedAi] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<string>("최신순");
  const [category, setCategory] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // 카테고리 칩 드래그 스크롤
  const chipRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });

  useEffect(() => {
    getOrderPageData().then((d) => {
      setData(d);
      const init: Record<string, number> = {};
      d.items.forEach((item) => {
        init[item.id] = item.recommendedQty;
      });
      setQuantities(init);
    });
  }, []);

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

  function changeQty(id: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, (prev[id] ?? 0) + delta),
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

  // 필터 + 정렬
  const filtered = data.items
    .filter((item) => {
      const matchCat = category === "전체" || item.category === category;
      const matchSearch = item.name.includes(search);
      return matchCat && matchSearch;
    })
    .sort((a, b) => {
      if (sort === "이름순") return a.name.localeCompare(b.name, "ko");
      if (sort === "단가 낮은순") return a.unitPrice - b.unitPrice;
      if (sort === "단가 높은순") return b.unitPrice - a.unitPrice;
      return 0; // 최신순 = 원래 순서
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visibleItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleCategoryChange(cat: string) {
    setCategory(cat);
    setPage(1);
  }

  function handleSortChange(s: string) {
    setSort(s);
    setPage(1);
  }

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }

  return (
    <div className="px-[15px] pt-[12px] flex flex-col gap-[12px] pb-[12px]">
      {/* AI 자동 발주 버튼 */}
      <button className="w-full bg-[#fed400] flex items-center pl-[20px] pr-[10px] py-[3px] rounded-[20px] min-h-[34px] gap-[4px]">
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
        <span className="text-black font-bold text-[14px] leading-[21px] flex-1 text-left ml-[4px]">
          AI 자동 발주
        </span>
        <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
          <path
            d="M1 1L5 5.5L1 10"
            stroke="black"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* AI 추천 카드 (검정 배경) */}
      <div className="bg-black rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[7px]">
            <div className="w-[7px] h-[4px] bg-[#fed400] rounded-[30px]" />
            <span className="text-white font-bold text-[14px] leading-[20px]">
              AI 추천
            </span>
          </div>
          <span className="text-white text-[10px] leading-[20px]">
            내일 (<span className="font-[700]">{data.deliveryDate}</span>)
            납품분
          </span>
        </div>
        <div className="text-white text-[13px] leading-[21px] font-[400]">
          <p>
            전주 매출{" "}
            <span className="font-[700]">데이터 + 날씨 + 프로모션</span>을
            반영해 내일<span className="font-[700]">납품에 필요한 수량</span>을
            추출했어요.
          </p>
        </div>
        <p className="text-white text-[10px] leading-[21px]">
          평균 정확도{" "}
          <span className="text-[#fed400] font-[700]">{data.aiAccuracy}</span> %
        </p>
      </div>

      {/* AI 추천 상품 캐러셀 + 원클릭 버튼 */}
      <div className="bg-white rounded-[20px] overflow-hidden">
        <div
          className="flex gap-[10px] px-[10px] pt-[11px] pb-[8px] overflow-x-auto"
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
        </div>
        <div className="px-[20px] pb-[11px]">
          <button
            onClick={addAllAi}
            className="w-full bg-[#0f87c8] flex items-center pl-[20px] pr-[10px] py-[3px] rounded-[20px] min-h-[30px] gap-[6px]"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle
                cx="5.5"
                cy="5.5"
                r="4.5"
                stroke="white"
                strokeWidth="1.2"
              />
              <path
                d="M5.5 3V8M3 5.5H8"
                stroke="white"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-white font-bold text-[12px] leading-[21px] flex-1 text-left">
              AI 추천 원클릭 · {data.aiItems.length}품목
            </span>
            <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
              <path
                d="M1 1L5 5.5L1 10"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="bg-white border border-[#c1c1c1] rounded-[20px] flex items-center px-[14px] h-[36px] gap-[8px]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
              className={`flex-1 py-[9px] text-[11px] text-center border-b transition-colors ${
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
          <span className="text-[#3e3e3e] text-[11px] shrink-0 pr-[8px]">
            총 <span className="font-bold">{filtered.length}</span>개
          </span>
          <div
            ref={chipRef}
            className="flex items-center gap-[8px] overflow-x-auto pr-[12px] select-none"
            style={{
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              cursor: "grab",
            }}
            onMouseDown={(e) => {
              const el = chipRef.current;
              if (!el) return;
              drag.current = {
                active: true,
                startX: e.clientX,
                scrollLeft: el.scrollLeft,
                moved: false,
              };
              el.style.cursor = "grabbing";
            }}
            onMouseMove={(e) => {
              if (!drag.current.active || !chipRef.current) return;
              const dx = e.clientX - drag.current.startX;
              if (Math.abs(dx) > 4) drag.current.moved = true;
              chipRef.current.scrollLeft = drag.current.scrollLeft - dx;
            }}
            onMouseUp={(e) => {
              if (chipRef.current) chipRef.current.style.cursor = "grab";
              drag.current.active = false;
              if (drag.current.moved) e.stopPropagation();
            }}
            onMouseLeave={() => {
              if (chipRef.current) chipRef.current.style.cursor = "grab";
              drag.current.active = false;
            }}
            onClickCapture={(e) => {
              if (drag.current.moved) {
                e.stopPropagation();
                drag.current.moved = false;
              }
            }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`shrink-0 px-[8px] py-[3px] rounded-[20px] text-[11px] transition-colors ${
                  category === cat
                    ? "bg-[#3caadd] text-white font-[500]"
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
  );
}
