import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

export interface Nudge {
  page: string;   // route path, e.g. "/orders"
  title: string;
  body: string;
  emoji: string;
  cta: string;
}

const NUDGES: Nudge[] = [
  {
    page: "/orders",
    title: "발주 긴급 알림",
    body: "원두 재고가 1.5시간 내 소진됩니다. AI 자동 발주를 승인하시겠어요?",
    emoji: "📦",
    cta: "자동 발주 실행",
  },
  {
    page: "/analytics",
    title: "매출 기회 감지",
    body: "오후 14~17시 음료 매출이 -12% 하락 중입니다. 프로모션 배너 조정이 권장됩니다.",
    emoji: "📊",
    cta: "매출 분석 보기",
  },
  {
    page: "/actions",
    title: "긴급 액션 대기 중",
    body: "우선순위 1등급 액션이 2건 대기 중입니다. 즉시 처리가 필요합니다.",
    emoji: "⚡",
    cta: "할 일 확인",
  },
  {
    page: "/realtime",
    title: "시스템 지연 감지",
    body: "쿠팡이츠 응답 지연(210ms)이 감지되었습니다. CS 에스컬레이션을 권장합니다.",
    emoji: "⚠️",
    cta: "실시간 현황 보기",
  },
];

interface NudgeContextValue {
  activeNudge: Nudge | null;
  nudgeIndex: number;
  triggerNudge: () => void;
  dismissNudge: () => void;
}

const NudgeCtx = createContext<NudgeContextValue>({
  activeNudge: null,
  nudgeIndex: -1,
  triggerNudge: () => {},
  dismissNudge: () => {},
});

export function NudgeProvider({ children }: { children: ReactNode }) {
  const [idx, setIdx] = useState(-1);

  const triggerNudge = () =>
    setIdx((prev) => (prev + 1) % NUDGES.length);

  const dismissNudge = () => setIdx(-1);

  return (
    <NudgeCtx.Provider
      value={{
        activeNudge: idx >= 0 ? NUDGES[idx] : null,
        nudgeIndex: idx,
        triggerNudge,
        dismissNudge,
      }}
    >
      {children}
    </NudgeCtx.Provider>
  );
}

export function useNudge() {
  return useContext(NudgeCtx);
}

/* ── NudgeBanner ─────────────────────────────────────────────────────
   Pages import this and pass their own route, so it only renders
   when the active nudge matches this page.
   ─────────────────────────────────────────────────────────────────── */
export function NudgeBanner({ page }: { page: string }) {
  const { activeNudge, dismissNudge } = useNudge();
  const navigate = useNavigate();

  if (!activeNudge || activeNudge.page !== page) return null;

  return (
    <>
      <style>{`
        @keyframes nudge-slide-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nudge-glow-border {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,110,0,0); }
          50%      { box-shadow: 0 0 0 6px rgba(255,110,0,0.18); }
        }
      `}</style>
      <div
        style={{
          marginBottom: 16,
          padding: "14px 18px",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: "linear-gradient(135deg, #fff7f1, #fff4fb)",
          border: "1.5px solid rgba(255,110,0,0.35)",
          boxShadow: "0 4px 20px rgba(255,110,0,0.10)",
          animation: "nudge-slide-in 0.35s ease, nudge-glow-border 2s ease-in-out infinite",
          position: "relative",
        }}
      >
        <span style={{ fontSize: 26, flexShrink: 0 }}>{activeNudge.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 3 }}>
            🧠 AI 행동 예측 넛지 &nbsp;
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: "rgba(255,110,0,0.1)", color: "#ff6e00",
              padding: "2px 7px", borderRadius: 999,
            }}>
              {activeNudge.title}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
            {activeNudge.body}
          </p>
        </div>
        <button
          onClick={() => { dismissNudge(); navigate(activeNudge.page); }}
          style={{
            height: 34, padding: "0 14px", borderRadius: 10,
            border: 0, background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
            color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
            flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          {activeNudge.cta} →
        </button>
        <button
          onClick={dismissNudge}
          style={{
            position: "absolute", top: 8, right: 10,
            background: "none", border: "none",
            color: "#9ca3af", fontSize: 16, cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}
