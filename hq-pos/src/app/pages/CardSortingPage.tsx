import { useState, useRef } from "react";
import { useNavigate } from "react-router";

type FeatureCard = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tag: string;
  to: string;
  color: string;
  bg: string;
};

const initialCards: FeatureCard[] = [
  {
    id: "kpi",
    icon: "◈",
    title: "KPI 요약",
    desc: "오늘 매출, 방문 고객, 전환율, 위험 알림을 한 눈에 확인하는 핵심 지표 패널",
    tag: "종합 현황",
    to: "/",
    color: "#2563eb",
    bg: "#eaf2ff",
  },
  {
    id: "issues",
    icon: "!",
    title: "지금 봐야 할 이슈",
    desc: "이상 징후를 우선순위별로 정렬해 보여주고, 바로 후속 액션으로 연결되는 영역",
    tag: "이상 감지",
    to: "/issues",
    color: "#dc2626",
    bg: "#feecec",
  },
  {
    id: "ai-briefing",
    icon: "✦",
    title: "AI 한줄 브리핑",
    desc: "현재 이슈를 가장 짧게 이해할 수 있는 AI 요약. 복합 원인을 3줄 이내로 압축",
    tag: "AI 분석",
    to: "/ai-insights",
    color: "#7c3aed",
    bg: "#f5f0ff",
  },
  {
    id: "causal",
    icon: "▣",
    title: "원인 분석",
    desc: "시간대별 매출/방문 추이 차트와 카테고리 기여도를 나란히 보여주는 분석 영역",
    tag: "성과 분석",
    to: "/analytics",
    color: "#0891b2",
    bg: "#e0f7fa",
  },
  {
    id: "ai-verify",
    icon: "◎",
    title: "AI 검증",
    desc: "데이터 해석, 원인 추정, 추천 우선순위를 단계적으로 분리해 보여주는 우측 패널",
    tag: "AI 분석",
    to: "/ai-insights",
    color: "#111827",
    bg: "#f3f4f6",
  },
  {
    id: "actions",
    icon: "→",
    title: "추천 액션",
    desc: "설명에서 끝나지 않고 실행 가능한 액션으로 이어지는 영역. 예상 효과 수치 포함",
    tag: "지금 할일",
    to: "/actions",
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  {
    id: "ai-qa",
    icon: "?",
    title: "AI에게 바로 묻기",
    desc: "운영자가 자연어로 추가 분석을 요청하는 인터랙티브 Q&A 영역",
    tag: "AI 분석",
    to: "/ai-insights",
    color: "#d97706",
    bg: "#fff7e8",
  },
];

export function CardSortingPage() {
  const [cards, setCards] = useState(initialCards);
  const dragIdx = useRef<number | null>(null);
  const navigate = useNavigate();

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...cards];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setCards(next);
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...cards];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setCards(next);
  };

  const moveDown = (idx: number) => {
    if (idx === cards.length - 1) return;
    const next = [...cards];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setCards(next);
  };

  const reset = () => setCards(initialCards);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>
              주요 기능 카드 소팅
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
              드래그하거나 ▲▼ 버튼으로 기능 카드의 우선순위를 재정렬하세요.
            </p>
          </div>
          <button
            onClick={reset}
            style={{
              height: 38,
              padding: "0 16px",
              border: "1px solid #e7ebf3",
              borderRadius: 12,
              background: "#f8fafc",
              color: "#374151",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            초기화
          </button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map((card, idx) => (
          <div
            key={card.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 48px 1fr auto",
              alignItems: "center",
              gap: 16,
              background: "#fff",
              border: "1px solid #e7ebf3",
              borderRadius: 18,
              padding: "16px 20px",
              boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
              cursor: "grab",
              transition: "box-shadow 0.15s",
              userSelect: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(15,23,42,0.10)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(15,23,42,0.04)";
            }}
          >
            {/* Rank */}
            <div style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", textAlign: "center" }}>
              {idx + 1}
            </div>

            {/* Icon */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: card.bg,
                color: card.color,
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {card.icon}
            </div>

            {/* Content */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#111827" }}>
                  {card.title}
                </h3>
                <span
                  style={{
                    height: 22,
                    padding: "0 8px",
                    borderRadius: 999,
                    background: card.bg,
                    color: card.color,
                    fontSize: 11,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {card.tag}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
                {card.desc}
              </p>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid #e7ebf3",
                    background: idx === 0 ? "#f8fafc" : "#fff",
                    color: idx === 0 ? "#d1d5db" : "#374151",
                    cursor: idx === 0 ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === cards.length - 1}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid #e7ebf3",
                    background: idx === cards.length - 1 ? "#f8fafc" : "#fff",
                    color: idx === cards.length - 1 ? "#d1d5db" : "#374151",
                    cursor: idx === cards.length - 1 ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => navigate(card.to)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: "1px solid #e7ebf3",
                  background: "#f8fafc",
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                바로가기
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
