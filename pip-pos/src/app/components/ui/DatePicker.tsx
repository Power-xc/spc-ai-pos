import { useState, useRef, useEffect } from "react";

interface Props {
  value: string; // "YYYY-MM-DD"
  onChange: (val: string) => void;
  placeholder?: string;
  minDate?: string; // "YYYY-MM-DD" — 이 날짜 이전은 선택 불가
  maxDate?: string; // "YYYY-MM-DD" — 이 날짜 이후는 선택 불가
  triggerClassName?: string; // 트리거 버튼 커스텀 클래스
}

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDisplay(val: string) {
  if (!val) return null;
  const [y, m, d] = val.split("-");
  return `${y}.${m}.${d}`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "연도 - 월 - 일",
  minDate,
  maxDate,
  triggerClassName,
}: Props) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    value ? parseInt(value.slice(0, 4)) : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    value ? parseInt(value.slice(5, 7)) - 1 : today.getMonth(),
  );
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };

  // 해당 월의 날짜 그리드 생성
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 6행 맞추기
  while (cells.length % 7 !== 0) cells.push(null);

  const handleSelect = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  };

  const dayToStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const isDisabled = (day: number) => {
    const s = dayToStr(day);
    if (minDate && s < minDate) return true;
    if (maxDate && s > maxDate) return true;
    return false;
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    return value === dayToStr(day);
  };
  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  return (
    <div ref={ref} className="relative">
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName ?? "flex items-center gap-[4px] border border-[#d8d8d8] rounded-[20px] px-[10px] py-[4px] h-[19px] bg-white cursor-pointer"}
      >
        <svg
          width="7"
          height="7"
          viewBox="0 0 7 7"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M2.33333 0V0.666667H4.33333V0H5V0.666667H6.33333C6.51743 0.666667 6.66667 0.815907 6.66667 1V6.33333C6.66667 6.51743 6.51743 6.66667 6.33333 6.66667H0.333333C0.14924 6.66667 0 6.51743 0 6.33333V1C0 0.815907 0.14924 0.666667 0.333333 0.666667H1.66667V0H2.33333ZM6 3.33333H0.666667V6H6V3.33333ZM2 4V4.66667H1.33333V4H2ZM3.66667 4V4.66667H3V4H3.66667ZM5.33333 4V4.66667H4.66667V4H5.33333ZM1.66667 1.33333H0.666667V2.66667H6V1.33333H5V2H4.33333V1.33333H2.33333V2H1.66667V1.33333Z"
            fill="#888888"
          />
        </svg>
        <span
          className="text-[9px] leading-[10px] whitespace-nowrap"
          style={{ color: value ? "#555" : "#aaa" }}
        >
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {/* 달력 팝업 */}
      {open && (
        <div
          className="absolute top-[24px] left-0 z-50 bg-white border border-[#e0e0e0] rounded-[12px] shadow-lg p-[10px] w-[180px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-[8px]">
            <button
              type="button"
              onClick={prevMonth}
              className="w-[18px] h-[18px] flex items-center justify-center rounded-full hover:bg-[#f0f0f0] cursor-pointer"
            >
              <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
                <path
                  d="M4 1L1 3.5L4 6"
                  stroke="#555"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <p className="font-bold text-[10px] text-[#333]">
              {viewYear}년 {viewMonth + 1}월
            </p>
            <button
              type="button"
              onClick={nextMonth}
              className="w-[18px] h-[18px] flex items-center justify-center rounded-full hover:bg-[#f0f0f0] cursor-pointer"
            >
              <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
                <path
                  d="M1 1l3 2.5L1 6"
                  stroke="#555"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-[4px]">
            {WEEK_LABELS.map((w, i) => (
              <div
                key={w}
                className="text-center text-[8px] font-bold py-[2px]"
                style={{
                  color: i === 0 ? "#ff522c" : i === 6 ? "#3aaedd" : "#888",
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-y-[2px]">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />;
              const col = idx % 7;
              const selected = isSelected(day);
              const todayMark = isToday(day);
              const disabled = isDisabled(day);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => !disabled && handleSelect(day)}
                  disabled={disabled}
                  className="flex items-center justify-center h-[20px] rounded-full text-[9px] transition-colors"
                  style={{
                    cursor: disabled ? "not-allowed" : "pointer",
                    backgroundColor: selected ? "#3aaedd" : "transparent",
                    color: disabled
                      ? "#ccc"
                      : selected
                        ? "white"
                        : col === 0
                          ? "#ff522c"
                          : col === 6
                            ? "#3aaedd"
                            : "#333",
                    fontWeight: selected || todayMark ? 700 : 400,
                    outline:
                      todayMark && !selected ? "1px solid #3aaedd" : "none",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* 초기화 버튼 */}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-[6px] w-full text-[8px] text-[#aaa] text-center cursor-pointer hover:text-[#ff522c]"
            >
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
