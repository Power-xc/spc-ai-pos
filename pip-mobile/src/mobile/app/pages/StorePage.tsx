import { useState, useEffect } from "react";
import avatarFemale01 from "@/mobile/assets/avatar-female-01.png";
import avatarFemale02 from "@/mobile/assets/avatar-female-02.png";
import avatarMale01 from "@/mobile/assets/avatar-male-01.png";
import avatarMale02 from "@/mobile/assets/avatar-male-02.png";
import { getProductImageByName } from "@/lib/productImages";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type {
  StorePageData,
  StaffMember,
  InventoryUrgentItem,
  InventorySlackItem,
  ProductionOrder,
} from "@/mobile/types";
import { getStorePageData, sendProductionOrderToPOS } from "@/mobile/lib/api";
import { ProductImage } from "../components/ProductImage";
import {
  ProductionOrderConfirmModal,
  type ProductionModalVariant,
} from "@/mobile/app/components/ProductionOrderConfirmModal";
import { Toast } from "@/mobile/app/components/Toast";
import { useFetchData } from "@/mobile/hooks/useFetchData";

const avatarMap: Record<string, string> = {
  "avatar-female-01": avatarFemale01,
  "avatar-female-02": avatarFemale02,
  "avatar-male-01": avatarMale01,
  "avatar-male-02": avatarMale02,
  "staff-01": "/images/staff/staff-01.png",
  "staff-02": "/images/staff/staff-02.png",
  "staff-03": "/images/staff/staff-03.png",
  "staff-04": "/images/staff/staff-04.png",
};

// ──────────────────────────────────────────────
// 근무팀 현황 카드
// ──────────────────────────────────────────────
function StaffRow({ staff }: { staff: StaffMember }) {
  const isPresent = staff.status === "현장";
  return (
    <div className="flex items-center gap-[8px]">
      {/* 아바타 */}
      <div className="w-[48px] h-[48px] bg-[#ebedef] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
        {staff.avatar && avatarMap[staff.avatar] ? (
          <img src={avatarMap[staff.avatar]} alt={staff.name} className="w-full h-full object-cover" />
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" fill="#bbb" />
            <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" fill="#bbb" />
          </svg>
        )}
      </div>
      {/* 이름/시간 */}
      <div className="flex-1 min-w-0">
        <p className="text-[#222] text-[13px] font-bold leading-[20px]">
          {staff.name}{" "}
          <span className="font-normal text-[11px] text-[#222]">
            ({staff.role})
          </span>
        </p>
        <p className="text-[#636363] text-[11px] leading-[20px]">
          {staff.startTime} ~ {staff.endTime}
        </p>
      </div>
      {/* 상태 배지 */}
      <div
        className={`px-[14px] py-[3px] rounded-[20px] text-[12px] font-bold flex-shrink-0 ${isPresent
          ? "bg-[rgba(60,180,229,0.15)] text-[#3cb4e5]"
          : "bg-[rgba(255,82,44,0.1)] text-[#ff522c]"
          }`}
      >
        {staff.status}
      </div>
    </div>
  );
}

function StaffStatusCard({
  staffCount,
  staff,
}: {
  staffCount: number;
  staff: StaffMember[];
}) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] px-[20px] pt-[15px] pb-[16px]">
      <div className="flex items-center justify-between mb-[14px]">
        <div className="flex items-center gap-[7px]">
          {/* 사람 아이콘 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
          >
            <path
              d="M13 4.6803C13.0001 4.78832 12.9665 4.89367 12.9039 4.98173C12.8414 5.0698 12.753 5.13619 12.6509 5.1717L1.04 9.21015V11.9603C1.04 12.0982 0.985214 12.2305 0.887695 12.328C0.790177 12.4255 0.657913 12.4803 0.52 12.4803C0.382087 12.4803 0.249824 12.4255 0.152305 12.328C0.0547857 12.2305 8.8412e-08 12.0982 8.8412e-08 11.9603V0.520303C-4.83081e-05 0.437301 0.0197731 0.355493 0.0578074 0.281719C0.0958417 0.207944 0.150984 0.144346 0.218624 0.0962401C0.286264 0.0481347 0.364438 0.01692 0.446609 0.0052053C0.52878 -0.00650937 0.612562 0.0016162 0.69095 0.0289031L12.6509 4.1889C12.753 4.22441 12.8414 4.29081 12.9039 4.37887C12.9665 4.46693 13.0001 4.57229 13 4.6803Z"
              fill="#515151"
            />
          </svg>
          <span className="text-[#555] text-[14px] font-bold">근무팀 현황</span>
        </div>
        <span className="text-[#555] text-[13px]">
          현재 <span className="text-black font-bold">{staffCount}</span>명
        </span>
      </div>
      <div className="flex flex-col gap-[12px]">
        {staff.map((s) => (
          <StaffRow key={s.id} staff={s} />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 재고현황 타임라인 (09~21시, Figma 커스텀 레이아웃)
// ──────────────────────────────────────────────
const STOCK_HOURS_TOTAL = 12;
const TICK_HOURS = [9, 11, 13, 15, 17, 19, 21];

// 재고 그래프 그라데이션 — 좌→우 X축, 0% #3FAF60 → 100% #3AAEDD
const INVENTORY_BAR_GRADIENT =
  "linear-gradient(90deg, #3FAF60 0%, #3AAEDD 100%)";
const INVENTORY_CAP_COLOR = "#3AAEDD";

function InventoryChart({
  items,
}: {
  items: InventoryUrgentItem[];
}) {
  const [currentAbs, setCurrentAbs] = useState(() => {
    const now = new Date();
    return Math.min(21, Math.max(9, now.getHours() + now.getMinutes() / 60));
  });
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setCurrentAbs(Math.min(21, Math.max(9, now.getHours() + now.getMinutes() / 60)));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const currentOffset = currentAbs - 9; // 0~12
  // startHour/endHour 은 09:00 기준 오프셋(0~12). 그대로 pct 변환.
  const offsetToPct = (o: number) => (o / STOCK_HOURS_TOTAL) * 100;
  // 현재시각에 가장 가까운 tick 을 볼드 처리 (15:34 → 15, Math.round 15.57 → 16 버그 방지)
  const boldTick = TICK_HOURS.reduce((a, b) =>
    Math.abs(b - currentAbs) < Math.abs(a - currentAbs) ? b : a
  );
  const currentPct = offsetToPct(currentOffset);

  return (
    <div className="flex flex-col relative">
      {/* 현재시각 세로선 — x축(눈금 16px + 구분선 1px + 여백 8px) 아래부터 시작 */}
      <div
        className="absolute bottom-0 pointer-events-none z-30"
        style={{
          top: "25px",
          left: `calc(120px + (100% - 148px) * ${currentPct / 100})`,
          width: "3px",
          background: "rgba(33, 149, 206, 0.18)",
          transform: "translateX(-50%)",
        }}
      />

      {/* 시간 눈금 — 절대 위치로 바 좌표와 정확히 일치 */}
      <div className="flex items-end">
        <div className="w-[120px] shrink-0" />
        <div className="flex-1 relative h-[16px]">
          {TICK_HOURS.map((h, i) => {
            const pct = (i / (TICK_HOURS.length - 1)) * 100;
            const transform =
              i === 0
                ? "translateX(0)"
                : i === TICK_HOURS.length - 1
                  ? "translateX(-100%)"
                  : "translateX(-50%)";
            return (
              <div
                key={h}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${pct}%`, transform }}
              >
                <span
                  className={`text-[8px] leading-none uppercase tracking-[0.48px] ${h === boldTick
                    ? "font-bold text-[#222]"
                    : "text-[#615e83]"
                    }`}
                >
                  {String(h).padStart(2, "0")}
                </span>
                {h === boldTick && (
                  <div className="w-[8px] h-[8px] rounded-full bg-[#3aaedd] mt-[2px]" />
                )}
              </div>
            );
          })}
        </div>
        <div className="w-[28px] shrink-0" />
      </div>

      {/* 시간축 하단 구분선 */}
      <div className="flex mb-[8px]">
        <div className="w-[120px] shrink-0" />
        <div className="flex-1 h-[1px] bg-[#ebedef]" />
        <div className="w-[28px] shrink-0" />
      </div>

      {/* 아이템 행 */}
      <div className="flex flex-col" style={{ gap: "20px" }}>
        {items.map((item) => {
          const startPct = offsetToPct(item.startHour);
          const endPct = offsetToPct(item.endHour);
          const fillWidth = Math.max(0, endPct - startPct);
          return (
            <div key={item.id} className="flex items-center">
              {/* 상품 컬럼 */}
              <div className="w-[120px] shrink-0 flex items-center gap-[6px]">
                <ProductImage name={item.name} className="w-[33px] h-[33px] rounded-full object-cover bg-[#ebedef] shrink-0" />
                <span className="text-[#222] text-[12px] font-bold whitespace-nowrap">
                  {item.name}
                </span>
              </div>

              {/* 타임라인 컬럼 — 막대/엔드캡만 높이에 포함, 버블은 아래로 overflow */}
              <div className="flex-1 relative" style={{ height: "20px" }}>
                {/* 배경 트랙 */}
                <div
                  className="absolute left-0 right-0 h-[14px] rounded-full bg-[#ebedef]"
                  style={{ top: "3px" }}
                />
                {/* 채움 막대 — 좌→우 X축 그라데이션 */}
                <div
                  className="absolute h-[14px] rounded-full"
                  style={{
                    left: `${startPct}%`,
                    width: `${fillWidth}%`,
                    top: "3px",
                    background: INVENTORY_BAR_GRADIENT,
                  }}
                />
                {/* 원형 엔드캡 — 원(6px) + 흰색 링(3px) = 총 12px, 바(14px) 대비 상하 1px씩 그라데이션 노출, x축 -6px 인셋 */}
                <div
                  className="absolute w-[6px] h-[6px] rounded-full -translate-x-1/2 z-10"
                  style={{
                    left: `calc(${endPct}% - 8px)`,
                    top: "7px",
                    background: INVENTORY_CAP_COLOR,
                    boxShadow:
                      "0 0 0 3px #ffffff, 0 1px 3px rgba(0,0,0,0.18)",
                  }}
                />
                {/* "지금 제작!" 버블 — 컬럼 밖으로 overflow, 행 높이 계산 제외 */}
                <div
                  className="absolute -translate-x-1/2 z-10"
                  style={{ left: `calc(${endPct}% - 8px)`, top: "26px" }}
                >
                  <div className="absolute left-1/2 -translate-x-1/2 -top-[5px] w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#32586C]" />
                  <div className="bg-[#32586C] text-white text-[10px] font-bold leading-none px-[8px] py-[4px] rounded-[4px] whitespace-nowrap">
                    지금 제작!
                  </div>
                </div>
              </div>

              {/* 긴급 컬럼 */}
              <div className="w-[28px] shrink-0 text-right">
                <span className="text-[#ff522c] text-[10px] font-bold">
                  긴급
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InventoryCard({
  urgentCount,
  lastChecked,
  urgentItems,
  slackItems,
}: {
  urgentCount: number;
  lastChecked: string;
  urgentItems: InventoryUrgentItem[];
  slackItems: InventorySlackItem[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [slackPage, setSlackPage] = useState(1);

  // 9개 초과 시 페이지네이션 적용, 페이지당 9개 (Figma 디자인 기준)
  const usePagination = slackItems.length > 9;
  const totalPages = usePagination ? Math.ceil(slackItems.length / 9) : 1;
  const visibleItems = usePagination
    ? slackItems.slice((slackPage - 1) * 9, slackPage * 9)
    : slackItems;

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pt-[15px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] mb-[10px]">
        <div className="flex items-center gap-[7px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
          >
            <path
              d="M6.02051 0C6.20462 3.28906e-05 6.3867 0.0466982 6.54785 0.135742L6.54688 0.136719L11.4717 2.83008C11.6439 2.92437 11.7885 3.06358 11.8887 3.23242C11.9887 3.40131 12.0419 3.5947 12.042 3.79102V9.14355L12.0312 9.29004C12.0114 9.43464 11.9628 9.57485 11.8877 9.70117C11.7875 9.86961 11.6436 10.0085 11.4717 10.1025L6.54688 12.7988L6.5459 12.7979C6.38504 12.8865 6.20418 12.9336 6.02051 12.9336C5.83678 12.9335 5.656 12.8866 5.49512 12.7979V12.7988L0.569336 10.1025C0.397638 10.0085 0.254414 9.86939 0.154297 9.70117C0.0541625 9.53268 0.000519685 9.33955 0 9.14355V3.79004C0.000466027 3.59408 0.0542559 3.40189 0.154297 3.2334C0.254384 3.06498 0.397535 2.92617 0.569336 2.83203L5.49414 0.136719C5.65523 0.0477099 5.83647 6.98513e-05 6.02051 0ZM1.2959 9.02539L5.37305 11.2549V6.90918L1.2959 4.67773V9.02539ZM9.35547 5.44043V7.81055C9.35536 7.98219 9.28642 8.14717 9.16504 8.26855C9.04362 8.38989 8.87868 8.45893 8.70703 8.45898C8.53552 8.45888 8.37038 8.38975 8.24902 8.26855C8.12785 8.14721 8.05968 7.98203 8.05957 7.81055V6.14941L6.66895 6.91113V11.2549L10.7461 9.02344V4.67871L9.35547 5.44043ZM1.93945 3.55664L6.02051 5.79199L7.50195 4.98047L3.4209 2.74609L1.93945 3.55664ZM4.77051 2.00684L8.85059 4.24121L10.1006 3.55664L6.02051 1.32227L4.77051 2.00684Z"
              fill="#555555"
            />
            <path
              d="M5.98855 6.6521L0.88015 3.9711V9.5867L5.98855 12.4851V6.6521Z"
              fill="#555555"
            />
          </svg>
          <span className="text-[#555] text-[14px] font-bold">재고현황</span>
        </div>
        <div className="flex items-center gap-[10px]">
          <div className="h-[20px] border border-[#dadada] rounded-[20px] px-[8px] flex items-center gap-[4px]">
            <div className="w-[4px] h-[4px] rounded-full bg-[#aaa]" />
            <span className="text-[#7e7e7e] text-[12px] leading-none">{lastChecked}</span>
          </div>
          <div
            className="h-[20px] px-[8px] rounded-[10px] flex items-center justify-center"
            style={{
              background: "linear-gradient(96.82deg, #3faf60 50.65%, #3aaedd 121.87%)",
            }}
          >
            <span className="text-white text-[12px] font-bold leading-none">
              긴급 {urgentCount}건
            </span>
          </div>
        </div>
      </div>

      {/* 재고 소진 타임라인 차트 */}
      <div className="px-[20px] mb-[6px]">
        <InventoryChart items={urgentItems} />
      </div>

      {/* 여유재고 목록 */}
      {collapsed && (
        <>
          <div className="flex items-center mb-[10px] px-[15px]">
            <p className="text-[#636363] text-[11px] mr-2">여유재고</p>
            <div className="h-[1px] bg-[#ebedef] mx-[0] flex-1" />
          </div>
          <div className="mx-[15px] mb-[8px] bg-[#f6f7f9] rounded-[20px] p-[15px] flex flex-col gap-[8px]">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-[6px]">
                  <div className="bg-[#b9b9b9] w-[5px] h-[3px] rounded-[30px] shrink-0" />
                  <span className="text-[#222] text-[11px] font-medium">
                    {item.name}
                  </span>
                </div>
                <span className="text-[11px] font-bold">
                  {item.quantity}{" "}
                  <span className="text-[#444] font-normal">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 페이지네이션 - 10개 초과 시만 표시 */}
      {collapsed && usePagination && (
        <div className="flex items-center justify-center gap-[25px] mb-[10px]">
          <button
            onClick={() => setSlackPage((p) => Math.max(1, p - 1))}
            disabled={slackPage === 1}
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
            <span className="font-bold">{slackPage}</span>
            {` / ${totalPages}`}
          </span>
          <button
            onClick={() => setSlackPage((p) => Math.min(totalPages, p + 1))}
            disabled={slackPage === totalPages}
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

      {/* 접기/펼치기 버튼 */}
      <div className="px-[20px]">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full border border-dashed border-[#1f97d3] rounded-[20px] h-[32px] flex items-center justify-center gap-[8px] cursor-pointer"
        >
          <svg
            width="8"
            height="7"
            viewBox="0 0 8 7"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: collapsed ? "none" : "rotate(180deg)" }}
          >
            <path
              d="M4 0.5L7.5 6H0.5L4 0.5Z"
              fill="#1f97d3"
            />
          </svg>
          <span className="text-[#1f97d3] text-[11px] font-bold leading-none">
            {collapsed ? "접기" : "여유 재고"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 생산지시 카드
// ──────────────────────────────────────────────
function ProductionOrderRow({
  order,
  onSelect,
}: {
  order: ProductionOrder;
  onSelect: (order: ProductionOrder) => void;
}) {
  return (
    <div className="flex items-center gap-[12px] py-[8px] border-[#ebebeb] rounded-[20px] border-[1px] px-3 mb-3 ">
      {/* 제품 썸네일 */}
      <div className="w-[42px] h-[42px] bg-[#f6f7f9] rounded-[20px] flex items-center justify-center flex-shrink-0 overflow-hidden">
        <ProductImage name={order.name} className="w-full h-full object-cover" />
      </div>
      {/* 제품 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-black text-[12px] font-bold leading-[14px]">
          {order.name}
        </p>
        <p className="text-[#6f6f6f] text-[10px] leading-[14px] mt-[4px]">
          {order.deadline} · {order.quantity}
          {order.unit} 추가
        </p>
      </div>
      {/* 생산 지시 버튼 */}
      <button
        onClick={() => onSelect(order)}
        className="px-[10px] h-[22px] rounded-[20px] text-white text-[12px] font-bold flex-shrink-0 cursor-pointer"
        style={{
          background: order.isUrgent
            ? "linear-gradient(81deg, #000 -90.9%, #797979 163.33%)"
            : "#797979",
        }}
      >
        생산 지시
      </button>
    </div>
  );
}

function resolveVariantFromUrl(): ProductionModalVariant {
  if (typeof window === "undefined") return "center";
  const raw = new URLSearchParams(window.location.search).get("variant");
  if (raw === "sheet" || raw === "compact" || raw === "center") return raw;
  return "center";
}

function ProductionCard({
  urgentCount,
  orders,
}: {
  urgentCount: number;
  orders: ProductionOrder[];
}) {
  const [selected, setSelected] = useState<ProductionOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [variant, setVariant] = useState<ProductionModalVariant>(() =>
    resolveVariantFromUrl(),
  );

  useEffect(() => {
    const onPop = () => setVariant(resolveVariantFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleConfirm = async (order: ProductionOrder) => {
    setSubmitting(true);
    try {
      await sendProductionOrderToPOS(order);
      setSelected(null);
      setToast(`${order.name} ${order.quantity}${order.unit} · POS로 생산지시를 전송했어요`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pt-[15px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] mb-[12px]">
        <div className="flex items-center gap-[7px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="13"
            viewBox="0 0 12 13"
            fill="none"
          >
            <path
              d="M10.8674 6.47235L7.2792 7.8858L5.97448 11.7731C5.94402 11.862 5.88917 11.9386 5.8173 11.9928C5.74543 12.0469 5.65999 12.076 5.57245 12.076C5.48491 12.076 5.39947 12.0469 5.3276 11.9928C5.25573 11.9386 5.20088 11.862 5.17042 11.7731L3.86785 7.8858L0.279604 6.47235C0.197536 6.43935 0.126756 6.37993 0.0767734 6.30207C0.0267908 6.22422 0 6.13165 0 6.03682C0 5.94199 0.0267908 5.84942 0.0767734 5.77157C0.126756 5.69371 0.197536 5.63429 0.279604 5.60129L3.86785 4.19017L5.17256 0.302904C5.20303 0.213997 5.25788 0.137319 5.32974 0.0831711C5.40161 0.0290234 5.48705 0 5.57459 0C5.66213 0 5.74758 0.0290234 5.81944 0.0831711C5.89131 0.137319 5.94616 0.213997 5.97662 0.302904L7.28134 4.19017L10.8696 5.60361C10.9509 5.63728 11.0208 5.69694 11.07 5.77467C11.1192 5.8524 11.1455 5.94451 11.1453 6.03878C11.145 6.13305 11.1183 6.22502 11.0687 6.30246C11.0191 6.3799 10.9489 6.43915 10.8674 6.47235Z"
              fill="#555555"
            />
          </svg>
          <span className="text-[#555] text-[14px] font-bold">생산지시</span>
        </div>
        <div
          className="px-[8px] py-[2px] rounded-[10px] text-white text-[12px] font-bold"
          style={{
            background: "linear-gradient(97deg, #3faf60 51%, #3aaedd 122%)",
          }}
        >
          긴급 {urgentCount}건
        </div>
      </div>

      {/* 생산지시 목록 */}
      <div className="px-[20px] flex flex-col divide-y divide-[#f0f0f0] scrolled overflow-y-auto max-h-[165px] mr-2">
        {orders.map((order) => (
          <ProductionOrderRow
            key={order.id}
            order={order}
            onSelect={setSelected}
          />
        ))}
      </div>

      <ProductionOrderConfirmModal
        order={selected}
        variant={variant}
        submitting={submitting}
        onConfirm={handleConfirm}
        onCancel={() => !submitting && setSelected(null)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ──────────────────────────────────────────────
// 매장 탭 메인 페이지
// ──────────────────────────────────────────────
export default function StorePage() {
  const { data } = useFetchData<StorePageData>(
    () => getStorePageData(),
    { cacheKey: "getStorePageData" },
  );

  if (!data) {
    return (
      <div className="px-[15px] pt-[12px] flex flex-col gap-[12px]">
        <div className="bg-white rounded-[20px] h-[220px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[300px] animate-pulse" />
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-[15px] pt-[12px] pb-[24px] flex flex-col gap-[12px]">
      {/* 근무팀 현황 */}
      <div id="section-staff">
        <StaffStatusCard staffCount={data.staffCount} staff={data.staff} />
      </div>
      {/* 재고현황 - recharts 수평 막대 차트 포함 */}
      <div id="section-inventory">
        <InventoryCard
          urgentCount={data.inventory.urgentCount}
          lastChecked={data.inventory.lastChecked}
          urgentItems={data.inventory.urgentItems}
          slackItems={data.inventory.slackItems}
        />
      </div>
      {/* 생산지시 */}
      <div id="section-production">
        <ProductionCard
          urgentCount={data.production.urgentCount}
          orders={data.production.orders}
        />
      </div>
    </div>
  );
}
