import { useState, useEffect } from "react";
import avatarFemale01 from "@/mobile/assets/avatar-female-01.png";
import avatarFemale02 from "@/mobile/assets/avatar-female-02.png";
import avatarMale01 from "@/mobile/assets/avatar-male-01.png";
import avatarMale02 from "@/mobile/assets/avatar-male-02.png";
import { getProductImageByName } from "@/lib/productImages";

const avatarMap: Record<string, string> = {
  "avatar-female-01": avatarFemale01,
  "avatar-female-02": avatarFemale02,
  "avatar-male-01": avatarMale01,
  "avatar-male-02": avatarMale02,
};
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type {
  StorePageData,
  StaffMember,
  InventoryUrgentItem,
  InventorySlackItem,
  ProductionOrder,
} from "@/mobile/types";
import { getStorePageData } from "@/mobile/lib/api";

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
        className={`px-[14px] py-[3px] rounded-[20px] text-[12px] font-bold flex-shrink-0 ${
          isPresent
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
// 재고현황 차트 - recharts 수평 막대 차트
// X축: 09~21시, 각 제품이 몇 시간 버티는지 녹색 bar로 표시
// ──────────────────────────────────────────────
const STOCK_HOURS_TOTAL = 12; // 09:00~21:00 = 12시간
const TIME_TICKS = [0, 2, 4, 6, 8, 10, 12];

// recharts 수평 range bar: offset(투명) + filled(녹색, 가용구간) + tail(회색, 소진 후)
// X축: 09~21시, Y축: 제품명, 오른쪽에 "긴급" 레이블
function InventoryChart({ items }: { items: InventoryUrgentItem[] }) {
  const chartData = items.map((item) => ({
    name: item.name,
    offset: item.startHour,
    filled: item.endHour - item.startHour,
    tail: STOCK_HOURS_TOTAL - item.endHour,
  }));

  const CHART_HEIGHT = items.length * 36 + 24;

  const UrgentLabel = (props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => {
    const { x = 0, y = 0, width = 0, height = 0 } = props;
    return (
      <text
        x={x + width + 4}
        y={y + height / 2 + 4}
        fontSize={10}
        fontWeight="bold"
        fill="#ff522c"
      >
        긴급
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 20, right: 36, left: 60, bottom: 0 }}
        barSize={8}
      >
        <defs>
          <linearGradient id="stockGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3faf60" />
            <stop offset="100%" stopColor="#3aaedd" />
          </linearGradient>
        </defs>
        <XAxis
          type="number"
          domain={[0, STOCK_HOURS_TOTAL]}
          ticks={TIME_TICKS}
          tickFormatter={(v) => `${v + 9}`}
          tick={{ fontSize: 8, fill: "#615e83" }}
          tickLine={false}
          axisLine={false}
          orientation="top"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={56}
          tick={{ fontSize: 10, fontWeight: "bold", fill: "#222" }}
          axisLine={false}
          tickLine={false}
        />
        {/* 투명 오프셋: startHour까지 빈 공간 */}
        <Bar dataKey="offset" stackId="s" fill="transparent" />
        {/* 녹색 range bar: startHour~endHour 재고 가용 구간 */}
        <Bar
          dataKey="filled"
          stackId="s"
          fill="url(#stockGrad)"
          radius={[4, 4, 4, 4]}
        />
        {/* 회색 tail: endHour 이후 소진 구간 + 긴급 레이블 */}
        <Bar
          dataKey="tail"
          stackId="s"
          fill="#ebedef"
          radius={[0, 4, 4, 0]}
          label={<UrgentLabel />}
        />
      </BarChart>
    </ResponsiveContainer>
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
  const [collapsed, setCollapsed] = useState(false);
  const [slackPage, setSlackPage] = useState(1);

  // 10개 초과 시 페이지네이션 적용, 페이지당 10개
  const usePagination = slackItems.length > 10;
  const totalPages = usePagination ? Math.ceil(slackItems.length / 10) : 1;
  const visibleItems = usePagination
    ? slackItems.slice((slackPage - 1) * 10, slackPage * 10)
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
        <div className="flex items-center gap-[8px]">
          <div className="border border-[#dadada] rounded-[20px] px-[8px] py-[2px] flex items-center gap-[4px]">
            <div className="w-[4px] h-[4px] rounded-full bg-[#aaa]" />
            <span className="text-[#7e7e7e] text-[11px]">{lastChecked}</span>
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
      </div>

      {/* 재고 소진 타임라인 차트 (recharts) */}
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
          <div className="mx-[15px] mb-[8px] bg-[#f6f7f9] rounded-[20px] py-[12px] px-[15px] flex flex-col gap-[8px]">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-[6px]">
                  <div className="w-[5px] h-[3px] bg-[#b9b9b9] rounded-full" />
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
          className="w-full border border-dashed border-[#1f97d3] rounded-[20px] h-[32px] flex items-center justify-center gap-[6px] cursor-pointer"
        >
          <svg
            width="8"
            height="6"
            viewBox="0 0 8 6"
            fill="none"
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <path
              d="M1 5L4 1L7 5"
              stroke="#1f97d3"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[#1f97d3] text-[11px] font-bold">
            {collapsed ? "여유재고" : "여유재고"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 생산지시 카드
// ──────────────────────────────────────────────
function ProductionOrderRow({ order }: { order: ProductionOrder }) {
  return (
    <div className="flex items-center gap-[12px] py-[8px] border-[#ebebeb] rounded-[20px] border-[1px] px-3 mb-3 ">
      {/* 제품 썸네일 */}
      <img
        src={getProductImageByName(order.name)}
        alt={order.name}
        className="w-[42px] h-[42px] rounded-[20px] flex-shrink-0 object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
        }}
      />
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

function ProductionCard({
  urgentCount,
  orders,
}: {
  urgentCount: number;
  orders: ProductionOrder[];
}) {
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
          <ProductionOrderRow key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 매장 탭 메인 페이지
// ──────────────────────────────────────────────
export default function StorePage() {
  const [data, setData] = useState<StorePageData | null>(null);

  useEffect(() => {
    getStorePageData().then(setData);
  }, []);

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
    <div className="px-[15px] pt-[12px] flex flex-col gap-[12px]">
      {/* 근무팀 현황 */}
      <StaffStatusCard staffCount={data.staffCount} staff={data.staff} />
      {/* 재고현황 - recharts 수평 막대 차트 포함 */}
      <InventoryCard
        urgentCount={data.inventory.urgentCount}
        lastChecked={data.inventory.lastChecked}
        urgentItems={data.inventory.urgentItems}
        slackItems={data.inventory.slackItems}
      />
      {/* 생산지시 */}
      <ProductionCard
        urgentCount={data.production.urgentCount}
        orders={data.production.orders}
      />
    </div>
  );
}
