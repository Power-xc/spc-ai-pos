import { useState } from "react";

interface CalEvent {
  date: number;
  label: string;
  type: "promo" | "deadline" | "holiday" | "training";
}

const TYPE_META = {
  promo:    { color: "#ff6e00", bg: "#fff4ec", label: "프로모션" },
  deadline: { color: "#dc2626", bg: "#feecec", label: "마감"     },
  holiday:  { color: "#7c3aed", bg: "#f5f3ff", label: "공휴일"   },
  training: { color: "#2563eb", bg: "#eaf2ff", label: "교육"     },
} as const;

const EVENTS: CalEvent[] = [
  { date: 5,  label: "봄 프로모션 시작",       type: "promo"    },
  { date: 10, label: "발주 마감",               type: "deadline" },
  { date: 14, label: "신메뉴 출시",             type: "promo"    },
  { date: 17, label: "직원 위생 교육",          type: "training" },
  { date: 22, label: "스프링 시즌 캠페인 종료", type: "promo"    },
  { date: 25, label: "월말 재고 마감",          type: "deadline" },
  { date: 30, label: "5월 발주 예비 마감",      type: "deadline" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function EventCalendar() {
  const year = 2026;
  const month = 3;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = 7;

  const [selected, setSelected] = useState<number | null>(null);
  const eventMap = new Map<number, CalEvent[]>();
  EVENTS.forEach((ev) => {
    if (!eventMap.has(ev.date)) eventMap.set(ev.date, []);
    eventMap.get(ev.date)!.push(ev);
  });

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedEvents = selected !== null ? (eventMap.get(selected) ?? []) : [];

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e7ebf3",
        borderRadius: 20,
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid #e7ebf3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}>이벤트 캘린더</h3>
        <span style={{ fontSize: 11, color: "#6b7280" }}>2026년 4월</span>
      </div>

      <div style={{ padding: "8px 12px 10px" }}>
        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 11,
                fontWeight: 800,
                color: i === 0 ? "#dc2626" : i === 6 ? "#2563eb" : "#9ca3af",
                padding: "4px 0",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />;
            const evs = eventMap.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selected;
            const col = idx % 7;

            return (
              <button
                key={day}
                onClick={() => setSelected(isSelected ? null : day)}
                style={{
                  position: "relative",
                  height: 24,
                  borderRadius: 8,
                  border: isSelected ? "2px solid #ff6e00" : "1px solid transparent",
                  background: isToday
                    ? "linear-gradient(135deg, #ff6e00, #e91e8c)"
                    : isSelected
                      ? "#fff4ec"
                      : "transparent",
                  color: isToday ? "#fff" : col === 0 ? "#dc2626" : col === 6 ? "#2563eb" : "#111827",
                  fontWeight: isToday ? 800 : 600,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: 0,
                }}
              >
                {day}
                {evs.length > 0 && (
                  <div style={{ display: "flex", gap: 2 }}>
                    {evs.slice(0, 3).map((ev, ei) => (
                      <span
                        key={ei}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: isToday ? "rgba(255,255,255,.8)" : TYPE_META[ev.type].color,
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 선택된 날짜 이벤트 */}
        {selectedEvents.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e7ebf3",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#374151" }}>
              4월 {selected}일 일정
            </p>
            {selectedEvents.map((ev, i) => {
              const meta = TYPE_META[ev.type];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: meta.bg,
                      color: meta.color,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{ev.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
