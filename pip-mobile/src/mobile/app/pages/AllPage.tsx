import React, { useState } from "react";
import type { OrderInitMode } from "../App";
import icoSearch from "@/mobile/assets/icons/ico-search.svg";
import icoMic from "@/mobile/assets/icons/ico-mic.svg";
import icoAiStar from "@/mobile/assets/icons/ico-ai-star.svg";
import icoAiBadge from "@/mobile/assets/icons/ico-ai-badge.svg";
import icoRecentOrder from "@/mobile/assets/icons/ico-recent-order.svg";
import icoRecentPipAi from "@/mobile/assets/icons/ico-recent-pip-ai.svg";
import icoAiAction from "@/mobile/assets/icons/ico-ai-action.svg";
import icoAiOrder from "@/mobile/assets/icons/ico-ai-order.svg";
import icoAiReview from "@/mobile/assets/icons/ico-ai-review.svg";
import icoAiChat from "@/mobile/assets/icons/ico-ai-chat.svg";
import icoSales from "@/mobile/assets/icons/ico-sales.svg";
import icoOrders from "@/mobile/assets/icons/ico-orders.svg";
import icoStore from "@/mobile/assets/icons/ico-store.svg";
import icoInventory from "@/mobile/assets/icons/ico-inventory.svg";
import icoAiActionSm from "@/mobile/assets/icons/ico-ai-action-sm.svg";
import icoSendLog from "@/mobile/assets/icons/ico-send-log.svg";
import icoAiOrderSm from "@/mobile/assets/icons/ico-ai-order-sm.svg";
import icoManualOrder from "@/mobile/assets/icons/ico-manual-order.svg";
import icoOrderCheck from "@/mobile/assets/icons/ico-order-check.svg";
import icoAnalytics from "@/mobile/assets/icons/ico-analytics.svg";
import icoPromotion from "@/mobile/assets/icons/ico-promotion.svg";
import icoReviewMgmt from "@/mobile/assets/icons/ico-review-mgmt.svg";
import icoAlarm from "@/mobile/assets/icons/ico-alarm.svg";
import icoAccount from "@/mobile/assets/icons/ico-account.svg";

const FILTER_CHIPS = ["오늘 매출", "소진 예측", "재고 부족", "AI 발주", "수동 발주", "소진 예측"];

type NavigateFn = (
  tab: string,
  initMode?: OrderInitMode,
  sectionId?: string,
  initialQuery?: string
) => void;

type MenuKind = "ai" | "regular";

interface MenuItemDef {
  kind: MenuKind;
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}

interface MenuSectionDef {
  title: string;
  aiIcon?: boolean;
  items: MenuItemDef[];
}

function MenuSection({ title, aiIcon = false, children }: {
  title: string;
  aiIcon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[10px] w-full">
      <div className="flex items-center gap-[3px]">
        {aiIcon && <img src={icoAiStar} alt="" className="w-[12px] h-[12px]" />}
        <span className="text-[#333] text-[13px] font-bold leading-[20px]">{title}</span>
      </div>
      <div className="flex flex-col gap-[20px] w-full">{children}</div>
    </div>
  );
}

function AiMenuItem({ icon, title, subtitle, onClick }: {
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full text-left"
    >
      <div className="flex gap-[10px] items-center">
        <div className="bg-[#b1daea] rounded-full w-[55px] h-[55px] flex items-center justify-center overflow-hidden shrink-0">
          <img src={icon} alt="" className="w-[24px] h-[24px] object-contain" />
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-[#333] text-[13px] font-bold leading-[20px] whitespace-nowrap">{title}</span>
          <span className="text-[#777] text-[11px] font-medium leading-[20px] whitespace-nowrap">{subtitle}</span>
        </div>
      </div>
      <div className="bg-black rounded-[20px] h-[30px] px-[8px] flex items-center gap-[4px] shrink-0 border border-[#dadada]">
        <img src={icoAiBadge} alt="" className="w-[12px] h-[12px]" />
        <span className="text-white text-[12px] font-medium">AI</span>
      </div>
    </button>
  );
}

function RegularMenuItem({ icon, title, subtitle, onClick }: {
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full text-left"
    >
      <div className="flex gap-[10px] items-center">
        <div className="bg-[#f5f5f5] rounded-full w-[37px] h-[37px] flex items-center justify-center overflow-hidden shrink-0">
          <img src={icon} alt="" className="w-[18px] h-[18px] object-contain" />
        </div>
        <span className="text-[#333] text-[11px] font-bold leading-[20px] whitespace-nowrap">{title}</span>
      </div>
      <span className="text-[#777] text-[12px] font-medium whitespace-nowrap">{subtitle}</span>
    </button>
  );
}

function PipAiRecommendCard({ query, onClick }: { query: string; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-[12px] w-full -mt-[15px]">
      <span className="text-[#333] text-[13px] font-medium leading-[20px]">
        「{query}」에 딱 맞는 메뉴가 없어요
      </span>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-between w-full bg-[#f5f9fc] border border-[#d3e7f2] rounded-[16px] p-[14px] text-left"
      >
        <div className="flex gap-[10px] items-center">
          <div className="w-[40px] h-[40px] rounded-full shrink-0 flex items-center justify-center bg-[#38a9d7]">
            <img src={icoRecentPipAi} alt="" className="w-[24px] h-[24px] object-contain" />
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[#222] text-[13px] font-bold leading-[20px]">
              PIP AI에게 물어보기
            </span>
            <span className="text-[#38a9d7] text-[11px] font-medium leading-[20px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[220px]">
              “{query}”
            </span>
          </div>
        </div>
        <span className="text-[#38a9d7] text-[16px] font-bold shrink-0">›</span>
      </button>
    </div>
  );
}

interface AllPageProps {
  onNavigate: NavigateFn;
}

export default function AllPage({ onNavigate }: AllPageProps) {
  const goStore = (section?: string) => onNavigate("매장", null, section);
  const goOrder = (mode: OrderInitMode = null) => onNavigate("발주", mode);
  const goHanune = (section?: string) => onNavigate("한눈에", null, section);
  const goPipAi = () => onNavigate("PIP AI");

  const [searchQuery, setSearchQuery] = useState("");

  const MENU_SECTIONS: MenuSectionDef[] = [
    {
      title: "AI 기능",
      aiIcon: true,
      items: [
        { kind: "ai", icon: icoAiAction, title: "AI 추천 액션", subtitle: "AI가 고른 오늘 할 일", onClick: () => goHanune("section-ai-action") },
        { kind: "ai", icon: icoAiOrder,  title: "AI 발주 제안", subtitle: "AI가 계산한 수량",       onClick: () => goOrder("approve") },
        { kind: "ai", icon: icoAiReview, title: "AI 리뷰 요약", subtitle: "감성 분석 · 키워드",     onClick: () => goHanune("section-review") },
        { kind: "ai", icon: icoAiChat,   title: "채팅",         subtitle: "AI 매장 도우미",         onClick: goPipAi },
      ],
    },
    {
      title: "매장",
      items: [
        { kind: "regular", icon: icoSales,      title: "매출관리",    subtitle: "매장 현재 상태",             onClick: () => goHanune("section-sales") },
        { kind: "regular", icon: icoOrders,     title: "주문관리",    subtitle: "예약 · 픽업 · 단체주문",     onClick: () => goStore("section-production") },
        { kind: "regular", icon: icoStore,      title: "매장관리",    subtitle: "영업상태 · 직원 · 생산요청", onClick: () => goStore("section-staff") },
        { kind: "regular", icon: icoInventory,  title: "재고관리",    subtitle: "재고 · 소진예측 · 입출고",   onClick: () => goStore("section-inventory") },
        { kind: "regular", icon: icoAiActionSm, title: "AI 추천 액션", subtitle: "AI가 고른 오늘 할 일",       onClick: () => goHanune("section-ai-action") },
        { kind: "regular", icon: icoSendLog,    title: "발송로그",    subtitle: "발송 내역 · 알림 로그",      onClick: () => goStore() },
      ],
    },
    {
      title: "발주",
      items: [
        { kind: "regular", icon: icoAiOrderSm,   title: "AI 발주 제안", subtitle: "AI가 계산한 수량",       onClick: () => goOrder("approve") },
        { kind: "regular", icon: icoManualOrder, title: "수동 발주",    subtitle: "상품 검색 · 카테고리",   onClick: () => goOrder("edit") },
        { kind: "regular", icon: icoOrderCheck,  title: "발주 확인",    subtitle: "선택 상품 · 수량 조정",  onClick: () => goOrder() },
      ],
    },
    {
      title: "성과",
      items: [
        { kind: "regular", icon: icoAnalytics,  title: "성과 분석", subtitle: "매출 · KPI · 리포트",   onClick: () => goHanune("section-sales") },
        { kind: "regular", icon: icoPromotion,  title: "프로모션",  subtitle: "캠페인 · 할인 · 반응률", onClick: () => goHanune("section-event") },
        { kind: "regular", icon: icoReviewMgmt, title: "리뷰 관리", subtitle: "고객 리뷰 분석 · 대응",  onClick: () => goHanune("section-review") },
      ],
    },
    {
      title: "설정",
      items: [
        { kind: "regular", icon: icoAlarm,   title: "알림 설정", subtitle: "푸시 · 운영 알림", onClick: () => goStore() },
        { kind: "regular", icon: icoAccount, title: "계정 설정", subtitle: "계정 · 권한",      onClick: () => goStore() },
      ],
    },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredSections = isSearching
    ? MENU_SECTIONS
        .map((s) => ({
          ...s,
          items: s.items.filter((i) =>
            (i.title + " " + i.subtitle).toLowerCase().includes(normalizedQuery)
          ),
        }))
        .filter((s) => s.items.length > 0)
    : MENU_SECTIONS;

  const hasResults = filteredSections.some((s) => s.items.length > 0);

  const handleRecommendClick = () => {
    onNavigate("PIP AI", null, undefined, searchQuery.trim());
  };

  return (
    <div className="flex flex-col gap-[30px] px-[20px] pt-[20px] pb-[40px] bg-white min-h-full">

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-[10px] w-full">
        <div className="flex items-center justify-between border border-[#d8d8d8] rounded-[20px] h-[36px] px-[12px] w-full">
          <div className="flex items-center gap-[6px] flex-1 min-w-0">
            <img src={icoSearch} alt="" className="w-[18px] h-[18px] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="메뉴 이름 또는 하고 싶은 일을 입력하세요"
              className="flex-1 min-w-0 bg-transparent outline-none text-[#333] placeholder:text-[#888] text-[12px] leading-[20px]"
            />
          </div>
          <img src={icoMic} alt="" className="w-[16px] h-[16px] shrink-0 ml-[8px]" />
        </div>
        <div className="flex gap-[10px] overflow-x-auto pb-[2px] [&::-webkit-scrollbar]:hidden">
          {FILTER_CHIPS.map((chip, i) => (
            <button key={i} className="border border-[#ddd] rounded-[20px] h-[33px] px-[15px] text-[#777] text-[11px] font-medium whitespace-nowrap shrink-0">
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* 최근메뉴 - 검색 중에는 숨김 */}
      {!isSearching && (
        <div className="flex flex-col gap-[10px] w-full">
          <span className="text-[#333] text-[13px] font-bold leading-[20px]">최근메뉴</span>
          <div className="flex gap-[10px] items-start">
            <button
              type="button"
              onClick={() => goOrder()}
              className="flex flex-col gap-[8px] items-center w-[61px]"
            >
              <div className="bg-[#f5f5f5] rounded-full w-[55px] h-[55px] flex items-center justify-center overflow-hidden">
                <img src={icoRecentOrder} alt="" className="w-[30px] h-[30px] object-contain" />
              </div>
              <span className="text-[#777] text-[11px] font-bold leading-[20px] text-center w-full">발주</span>
            </button>
            <button
              type="button"
              onClick={goPipAi}
              className="flex flex-col gap-[8px] items-center w-[61px]"
            >
              <div className="w-[55px] h-[55px] rounded-full overflow-hidden shrink-0">
                <img src={icoRecentPipAi} alt="" className="w-full h-full object-cover" />
              </div>
              <span className="text-[#777] text-[11px] font-bold leading-[20px] text-center w-full">PIP AI</span>
            </button>
          </div>
        </div>
      )}

      {/* 결과 없음: PIP AI 추천 카드 */}
      {isSearching && !hasResults && (
        <PipAiRecommendCard query={searchQuery.trim()} onClick={handleRecommendClick} />
      )}

      {/* 메뉴 섹션 */}
      {filteredSections.map((section) => (
        <MenuSection key={section.title} title={section.title} aiIcon={section.aiIcon}>
          {section.items.map((item, idx) =>
            item.kind === "ai" ? (
              <AiMenuItem
                key={`${section.title}-${idx}`}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                onClick={item.onClick}
              />
            ) : (
              <RegularMenuItem
                key={`${section.title}-${idx}`}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                onClick={item.onClick}
              />
            )
          )}
        </MenuSection>
      ))}
    </div>
  );
}
