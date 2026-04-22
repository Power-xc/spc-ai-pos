/**
 * FloatingChatbot — 화면 우측 하단 고정 AI 챗봇
 * - 어느 페이지에서도 현재 맥락 유지하며 AI에게 질문
 * - 버튼 클릭 → 채팅 패널 슬라이드 업
 * - 퀵 칩 + 자연어 입력 지원
 */

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

const PAGE_CONTEXT: Record<string, string> = {
  "/":           "종합 현황 대시보드",
  "/realtime":   "AI 실시간 현황",
  "/actions":    "지금 할일",
  "/analytics":  "성과 분석",
  "/reports":    "리포트",
  "/ai-insights":"AI 검증",
  "/orders":     "발주 관리",
  "/issues":     "이상 감지 현황",
  "/scenarios":  "시나리오·벤치마킹",
  "/alerts":     "알림 설정",
};

const QUICK_CHIPS: Record<string, string[]> = {
  "/": ["너는 뭘 할 수 있어", "이번 달 일평균 매출을 타 점포 평균과 비교해줘", "이번 티데이 프로모션은 전체적으로 어땠어?"],
  "/realtime": ["현재 재고 현황과 부족 예상 품목 알려줘", "1시간 뒤 예상 재고량 보여줘"],
  "/actions": ["왜 지금 알림이 떴는지 설명해줘", "주문 마감 전 추천 옵션 보여줘"],
  "/orders": ["1차/2차 생산 권장량 알려줘", "각 옵션의 근거를 보여줘"],
  "/scenarios": ["벤치마킹이 뭔데", "전주/전전주/전월 기준으로 비교해줘"],
};

const DEFAULT_CHIPS = ["너는 뭘 할 수 있어", "니가 뭔데", "이 화면에서 뭘 봐야 해"];

const AI_RESPONSES: Record<string, string> = {
  "왜 오후 매출이 떨어졌지?": "루나 분석 결과, 오후 2~5시 음료 전환율이 전일 대비 -12.4% 하락했습니다. 주원인은 ① 날씨 변화로 인한 차음료 수요 감소 ② 배너 노출 우선순위 변경입니다.",
  "오늘 핵심 이슈 요약해줘": "현재 즉시 대응 필요 이슈 3건 — ① 글레이즈드 재고 소진 임박 ② 오후 전환율 하락 ③ 발주서 미승인 1건. 지금 할일 탭에서 바로 처리 가능합니다.",
  "재고 위험 품목 알려줘": "제이 Agent 분석: 에스프레소 원두 (1.5시간 내 소진), 바닐라 시럽 (3시간 내 소진). 즉시 발주 권장합니다.",
};

/* 모바일 AI비서 스타일 — 텍스트 답변 + 딥링크 액션 카드 */
interface ActionCard {
  label: string;
  sub: string;
  to: string;
}

interface Message {
  role: "user" | "ai";
  text: string;
  cards?: ActionCard[];
}

/* 답변별 액션 카드 정의 */
const AI_ACTION_CARDS: Record<string, ActionCard[]> = {
  "왜 오후 매출이 떨어졌지?": [
    { label: "성과 분석 상세 보기", sub: "시간대별 전환율 차트", to: "/analytics" },
    { label: "AI 검증 확인", sub: "루나 신뢰도 · 근거 데이터", to: "/ai-insights" },
  ],
  "오늘 핵심 이슈 요약해줘": [
    { label: "지금 할일 이동", sub: "긴급 3건 처리 대기 중", to: "/actions" },
    { label: "이상 감지 현황", sub: "전체 이슈 목록", to: "/issues" },
  ],
  "재고 위험 품목 알려줘": [
    { label: "발주 관리 — 즉시 발주", sub: "AI 자동발주 추천 · 정확도 84%", to: "/orders" },
  ],
  "오늘 가장 급한 게 뭐야?": [
    { label: "지금 할일 — 긴급 항목", sub: "우선순위 1 · 3건 대기", to: "/actions" },
  ],
  "발주 필요한 품목은?": [
    { label: "AI 자동발주 화면", sub: "로이 추천 · 승인 대기", to: "/orders" },
  ],
};

export function FloatingChatbot() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  /* 20초 비조작 → 행동 유도 glow 발동 */
  const [isIdle, setIsIdle] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageContext = PAGE_CONTEXT[pathname] ?? "대시보드";
  const chips = QUICK_CHIPS[pathname] ?? DEFAULT_CHIPS;

  /* 새 메시지 오면 스크롤 하단 이동 */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* 패널 열리면 입력창 포커스 + idle 리셋 */
  useEffect(() => {
    if (open) {
      setIsIdle(false);
      setTimeout(() => inputRef.current?.focus(), 150);
      return;
    }
    /* 닫힌 상태 20초 후 glow 유도 */
    const timer = setTimeout(() => setIsIdle(true), 20000);
    return () => clearTimeout(timer);
  }, [open]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    /* mock AI 응답 */
    setTimeout(() => {
      const aiText =
        AI_RESPONSES[text] ??
        `"${text}"에 대한 분석 중입니다. 현재 ${pageContext} 화면 데이터를 기반으로 폭스(Fox)가 답변을 준비하고 있습니다.`;
      const cards = AI_ACTION_CARDS[text];
      setMessages((prev) => [...prev, { role: "ai", text: aiText, cards }]);
      setIsTyping(false);
    }, 900);
  };

  return (
    <>
      {/* ── 패널 오버레이 (딤) ── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
            background: "rgba(15,23,42,0.18)",
          }}
        />
      )}

      {/* ── 채팅 패널 ── */}
      <div
        style={{
          position: "fixed",
          bottom: open ? 88 : -520,
          right: 24,
          zIndex: 50,
          width: 380,
          height: 500,
          background: "#fff",
          borderRadius: 24,
          boxShadow: "0 24px 64px rgba(15,23,42,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "bottom 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          border: "1px solid #e7ebf3",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: "16px 20px",
            background: "linear-gradient(135deg, #111827, #1f2937)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(233,30,140,0.3)",
            }}
          >
            ✦
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>폭스 (Fox)</p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.5)" }}>
              {pageContext} · 맥락 인식 중
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,.15)",
              background: "rgba(255,255,255,.08)",
              color: "rgba(255,255,255,.7)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* 메시지 영역 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* 빈 상태 — 퀵 칩 */}
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", textAlign: "center", paddingTop: 8 }}>
                현재 페이지 맥락으로 바로 질문하세요
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    style={{
                      padding: "7px 13px",
                      borderRadius: 999,
                      border: "1px solid #e7ebf3",
                      background: "#f8fafc",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#374151",
                      cursor: "pointer",
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 메시지 목록 */}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 6,
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  padding: "10px 13px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background:
                    msg.role === "user"
                      ? "linear-gradient(135deg, #ff6e00, #e91e8c)"
                      : "#f3f4f6",
                  color: msg.role === "user" ? "#fff" : "#111827",
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontWeight: 500,
                }}
              >
                {msg.text}
              </div>
              {/* 모바일 AI비서 스타일 — 딥링크 액션 카드 */}
              {msg.role === "ai" && msg.cards && msg.cards.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: "90%" }}>
                  {msg.cards.map((card) => (
                    <button
                      key={card.to}
                      onClick={() => { setOpen(false); navigate(card.to); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: 12,
                        border: "1px solid #e7ebf3",
                        background: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: 8,
                        boxShadow: "0 2px 6px rgba(15,23,42,0.06)",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#111827" }}>{card.label}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{card.sub}</p>
                      </div>
                      <span style={{ fontSize: 14, color: "#9ca3af", flexShrink: 0 }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 타이핑 인디케이터 */}
          {isTyping && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "18px 18px 18px 4px",
                  background: "#f3f4f6",
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#9ca3af",
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력창 */}
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid #e7ebf3",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="폭스에게 질문하기..."
            style={{
              flex: 1,
              height: 42,
              borderRadius: 12,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              padding: "0 14px",
              outline: 0,
              fontSize: 13,
              color: "#111827",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: 0,
              background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 18,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 4px 12px rgba(233,30,140,0.25)",
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* ── 플로팅 버튼 ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: 18,
          border: 0,
          background: open
            ? "#374151"
            : "linear-gradient(135deg, #ff6e00, #e91e8c)",
          color: "#fff",
          fontSize: open ? 22 : 24,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          boxShadow: open
            ? "0 8px 24px rgba(55,65,81,0.3)"
            : "0 8px 24px rgba(233,30,140,0.35)",
          transition: "all 0.2s ease",
          /* idle 상태 — 다음 행동 예측 glow로 클릭 유도 */
          animation: isIdle && !open ? "chatbot-glow 1.8s ease-in-out infinite" : undefined,
        }}
        aria-label="AI 챗봇 열기"
      >
        {open ? "×" : "✦"}
      </button>

      {/* 애니메이션 */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        /* 행동 유도 anticipatory glow — 다음 클릭을 예상하고 시선을 끔 */
        @keyframes chatbot-glow {
          0%, 100% {
            box-shadow: 0 8px 24px rgba(233,30,140,0.35);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 8px 36px rgba(233,30,140,0.75), 0 0 0 6px rgba(255,110,0,0.18);
            transform: scale(1.07);
          }
        }
      `}</style>
    </>
  );
}
