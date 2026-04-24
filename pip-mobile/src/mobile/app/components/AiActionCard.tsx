import type { AiAction } from "@/mobile/types";
import { getAiActions } from "@/mobile/lib/api";
import { useFetchData } from "@/mobile/hooks/useFetchData";
import { ActionBadge } from "./Badge";

interface ActionRowProps {
  action: AiAction;
}

function ActionRow({ action }: ActionRowProps) {
  return (
    <div className="flex items-center gap-[10px] p-3 border-[#ebebeb] rounded-[30px] border-[1px]">
      <div className="w-[36px] h-[36px] rounded-full bg-[] flex-shrink-0 overflow-hidden">
        <img
          src={action.iconUrl}
          alt={action.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-black text-[12px] font-bold leading-[14px] truncate">
          {action.title}
        </p>
        <p className="text-[#6f6f6f] text-[10px] leading-[14px] truncate">
          {action.subtitle}
        </p>
      </div>
      <ActionBadge type={action.badgeType} />
    </div>
  );
}

export default function AiActionCard() {
  const { data } = useFetchData<AiAction[]>(
    () => getAiActions(),
    { cacheKey: "getAiActions" },
  );
  const actions = data ?? [];

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] pt-[15px] pb-[12px]">
        <div className="flex items-center gap-[6px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="14"
            viewBox="0 0 13 14"
            fill="none"
          >
            <path
              d="M11.4941 7.13458L7.90589 8.54803L6.60117 12.4353C6.57071 12.5242 6.51586 12.6009 6.44399 12.655C6.37212 12.7092 6.28668 12.7382 6.19914 12.7382C6.1116 12.7382 6.02616 12.7092 5.95429 12.655C5.88242 12.6009 5.82757 12.5242 5.79711 12.4353L4.49454 8.54803L0.906294 7.13458C0.824226 7.10158 0.753446 7.04216 0.703463 6.96431C0.653481 6.88645 0.62669 6.79389 0.62669 6.69905C0.62669 6.60422 0.653481 6.51165 0.703463 6.4338C0.753446 6.35594 0.824226 6.29652 0.906294 6.26352L4.49454 4.8524L5.79925 0.965136C5.82972 0.876228 5.88457 0.79955 5.95643 0.745403C6.0283 0.691255 6.11374 0.662231 6.20128 0.662231C6.28882 0.662231 6.37427 0.691255 6.44613 0.745403C6.518 0.79955 6.57285 0.876228 6.60331 0.965136L7.90803 4.8524L11.4963 6.26584C11.5776 6.29951 11.6475 6.35917 11.6967 6.4369C11.7459 6.51463 11.7722 6.60674 11.7719 6.70101C11.7717 6.79529 11.745 6.88725 11.6954 6.96469C11.6458 7.04213 11.5756 7.10139 11.4941 7.13458Z"
              fill="#555555"
            />
            <path
              d="M6.2002 0C6.41998 0 6.63317 0.0733893 6.81055 0.207031C6.94322 0.307068 7.05142 0.437001 7.12793 0.585938L7.19336 0.741211L7.19434 0.742188L8.39941 4.33691L11.7139 5.64258L11.7158 5.64355C11.9202 5.72578 12.0936 5.8727 12.2148 6.06152C12.336 6.25032 12.4004 6.47323 12.4004 6.7002C12.4004 6.92716 12.336 7.15007 12.2148 7.33887C12.0936 7.52769 11.9202 7.67461 11.7158 7.75684L11.7139 7.75781L8.40039 9.0625L7.19434 12.6582L7.19336 12.6592C7.12013 12.8729 6.98752 13.0599 6.81055 13.1934C6.63317 13.327 6.41998 13.4004 6.2002 13.4004C5.98041 13.4004 5.76722 13.327 5.58984 13.1934C5.41287 13.0599 5.28026 12.8729 5.20703 12.6592L5.20605 12.6582L4 9.0625L0.686523 7.75781L0.68457 7.75684C0.480203 7.67461 0.306804 7.52769 0.185547 7.33887C0.0643454 7.15007 0 6.92716 0 6.7002C0 6.47323 0.0643454 6.25032 0.185547 6.06152C0.306804 5.8727 0.480203 5.72578 0.68457 5.64355L0.686523 5.64258L4 4.33691L5.20605 0.742188L5.20703 0.741211C5.28026 0.527491 5.41287 0.340465 5.58984 0.207031C5.76722 0.0733893 5.98041 0 6.2002 0ZM5.08691 5.0752C5.05685 5.16461 5.00908 5.24721 4.94531 5.31641C4.8813 5.38575 4.80258 5.44098 4.71484 5.47559L1.60547 6.7002L4.71484 7.9248C4.80258 7.95941 4.8813 8.01464 4.94531 8.08398C5.00908 8.15318 5.05685 8.23578 5.08691 8.3252L6.2002 11.6406L7.31348 8.3252L7.37207 8.19727C7.39583 8.15685 7.4232 8.11857 7.45508 8.08398C7.51909 8.01464 7.59781 7.95941 7.68555 7.9248L10.7939 6.7002L7.68555 5.47559C7.59781 5.44098 7.51909 5.38575 7.45508 5.31641C7.4232 5.28182 7.39583 5.24354 7.37207 5.20312L7.31348 5.0752L6.2002 1.75879L5.08691 5.0752Z"
              fill="#555555"
            />
          </svg>
          <span className="text-[#555] text-[14px] font-bold leading-[20px]">
            AI 추천 액션
          </span>
          <span className="bg-[#429ddd] text-white text-[10px] font-bold w-[17px] h-[17px] rounded-full flex items-center justify-center">
            {actions.length}
          </span>
        </div>
        <span className="text-[#787878] text-[10px]">
          지금 바로 할 수 있어요
        </span>
      </div>

      {/* 액션 목록 */}
      <div className="px-[20px] overflow-y-auto scrolled max-h-[165px] mr-2">
        {actions.map((action, idx) => (
          <div key={action.id}>
            <ActionRow action={action} />
            {idx < actions.length - 1 && <div className=" my-[2px] py-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}
