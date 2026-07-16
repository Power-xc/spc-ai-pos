import { useEffect, useMemo, useState } from "react";
import { getTodoItems } from "@/mobile/lib/api";
import type { TodoCategory, TodoItem, TodoStatus } from "@/mobile/types";

type FilterKey = "전체" | TodoCategory;

const FILTERS: FilterKey[] = ["전체", "긴급", "발주", "프로모션"];

const CATEGORY_BADGE: Record<TodoCategory, string> = {
  긴급: "bg-[#fff2ec] text-[#ff522c]",
  발주: "bg-[#fff8dc] text-[#b38500]",
  프로모션: "bg-[#eaf6ff] text-[#38a9d7]",
  일반: "bg-[#f6f7f9] text-[#6f6f6f]",
};

const STATUS_BADGE_PROGRESS = "bg-[#fff2ec] text-[#f85f34]";

export default function TodoShortcutsPage() {
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getTodoItems().then((list) => {
      setItems(list);
      setExpandedId(list[0]?.id ?? null);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (filter === "전체") return items;
    return items.filter((it) => it.category === filter);
  }, [items, filter]);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function updateStatus(id: string, status: TodoStatus) {
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === id ? { ...it, status } : it)) : prev
    );
  }

  return (
    <div className="px-[15px] pt-[12px] pb-[40px] flex flex-col gap-[14px]">
      <div className="flex items-center gap-[8px]">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-full px-[14px] py-[6px] text-[12px] font-bold transition-colors " +
                (active
                  ? "bg-[#38a9d7] text-white"
                  : "bg-white text-[#555] border border-[#ebebeb]")
              }
            >
              {f}
            </button>
          );
        })}
      </div>

      {items === null ? (
        <TodoSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="flex flex-col gap-[10px]">
          {filtered.map((it) => (
            <TodoCard
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => toggle(it.id)}
              onChangeStatus={(s) => updateStatus(it.id, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TodoCardProps {
  item: TodoItem;
  expanded: boolean;
  onToggle: () => void;
  onChangeStatus: (status: TodoStatus) => void;
}

function TodoCard({ item, expanded, onToggle, onChangeStatus }: TodoCardProps) {
  const isProgress = item.status === "진행중";

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] px-[16px] py-[14px]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-[10px] cursor-pointer"
      >
        <div className="flex items-center gap-[8px] min-w-0">
          <span
            className={
              "rounded-full px-[10px] py-[3px] text-[11px] font-bold shrink-0 " +
              CATEGORY_BADGE[item.category]
            }
          >
            {item.category}
          </span>
          {isProgress && (
            <span
              className={
                "rounded-full px-[10px] py-[3px] text-[11px] font-bold shrink-0 " +
                STATUS_BADGE_PROGRESS
              }
            >
              진행중
            </span>
          )}
          <span className="text-[14px] font-bold text-[#1a1a1a] truncate">
            {item.title}
          </span>
        </div>
        <Chevron open={expanded} />
      </button>

      {expanded && (
        <div className="mt-[12px] flex flex-col gap-[10px]">
          <p className="text-[13px] leading-[19px] text-[#555]">
            {item.description}
          </p>

          <div className="flex items-center gap-[10px] text-[12px]">
            <span className="flex items-center gap-[4px] text-[#6f6f6f]">
              <ClockIcon />
              <span>마감: {item.deadline}</span>
            </span>
            {item.expectedImpact && (
              <span className="text-[#ff522c] font-bold ml-auto">
                기대효과: {item.expectedImpact}
              </span>
            )}
          </div>

          <div className="flex items-center gap-[8px] pt-[4px]">
            <button
              onClick={() => onChangeStatus("진행중")}
              className="flex-1 bg-[#38a9d7] text-white rounded-full py-[10px] text-[14px] font-bold cursor-pointer active:opacity-80"
            >
              실행
            </button>
            <button
              onClick={() => onChangeStatus("완료")}
              className="px-[18px] py-[10px] bg-white border border-[#c4c4c4] text-[#555] rounded-full text-[13px] font-bold cursor-pointer"
            >
              완료
            </button>
            <button
              onClick={() => onChangeStatus("보류")}
              className="px-[18px] py-[10px] bg-white border border-[#c4c4c4] text-[#555] rounded-full text-[13px] font-bold cursor-pointer"
            >
              보류
            </button>
          </div>

          {(item.status === "완료" || item.status === "보류") && (
            <div className="text-[11px] text-[#888] text-right">
              현재 상태: {item.status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="7"
      viewBox="0 0 12 7"
      fill="none"
      className={"shrink-0 transition-transform " + (open ? "rotate-180" : "")}
    >
      <path
        d="M1 1L6 6L11 1"
        stroke="#8a8a8a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="#8a8a8a" strokeWidth="1.2" />
      <path
        d="M6 3V6L8 7"
        stroke="#8a8a8a"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TodoSkeleton() {
  return (
    <div className="flex flex-col gap-[10px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white border border-[#ebebeb] rounded-[20px] h-[56px] animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] py-[40px] text-center">
      <p className="text-[13px] text-[#888]">
        {filter === "전체"
          ? "지금 확인할 할 일이 없어요."
          : `'${filter}' 카테고리에 해당하는 할 일이 없어요.`}
      </p>
    </div>
  );
}
