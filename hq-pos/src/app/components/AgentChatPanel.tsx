/**
 * AgentChatPanel — 우측 고정 에이전트 통합 챗봇 패널
 * Fox 통합 AI 에이전트 (단일 통합 인터페이스)
 */

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

// ── 페이지별 컨텍스트 ───────────────────────────────────────────────
const PAGE_CONTEXT: Record<string, string> = {
  "/":            "HQ 종합 현황",
  "/store-ops":   "점포 운영 현황",
  "/sales":       "매출 분석",
  "/inventory":   "재고 관리",
  "/reports":     "리포트",
  "/ai-insights": "AI 인사이트",
  "/actions":     "지금 할일",
  "/issues":      "이상 감지 현황",
  "/alerts":      "알림 설정",
};

const QUICK_CHIPS: Record<string, { icon: string; text: string }[]> = {
  "/": [
    { icon: "📊", text: "너는 뭘 할 수 있어" },
    { icon: "🏪", text: "이번 달 일평균 매출을 타 점포 평균과 비교해줘" },
    { icon: "📦", text: "이번 티데이 프로모션은 전체적으로 어땠어?" },
  ],
  "/store-ops": [
    { icon: "🏪", text: "현재 재고 현황과 부족 예상 품목 알려줘" },
    { icon: "⏰", text: "1차/2차 생산 권장량 알려줘" },
  ],
  "/sales": [
    { icon: "📈", text: "26년 2월 매출과 25년 2월 매출 비교해줘" },
    { icon: "💳", text: "이번 2월 배달 채널 별 매출 알려줘" },
    { icon: "📊", text: "글레이즈드 전 월 대비 매출 금액 비교해줘" },
  ],
  "/inventory": [
    { icon: "📦", text: "1시간 뒤 예상 재고량 보여줘" },
    { icon: "⚠️", text: "1차/2차 생산 권장량 알려줘" },
  ],
  "/reports": [
    { icon: "📋", text: "이번 티데이 프로모션은 전체적으로 어땠어?" },
    { icon: "🏆", text: "벤치마킹이 뭔데" },
  ],
  "/ai-insights": [
    { icon: "📊", text: "이 화면에서 뭘 봐야 해" },
    { icon: "💡", text: "프로모션이 뭐야" },
  ],
  "/actions": [
    { icon: "🚨", text: "왜 지금 알림이 떴는지 설명해줘" },
    { icon: "✅", text: "주문 마감 전 추천 옵션 보여줘" },
  ],
};

const DEFAULT_CHIPS = [
  { icon: "📊", text: "너는 뭘 할 수 있어" },
  { icon: "🏪", text: "니가 뭔데" },
  { icon: "💡", text: "이 화면에서 뭘 봐야 해" },
];

// ── AI 응답 ─────────────────────────────────────────────────────────
const AI_RESPONSES: Record<string, string> = {
  "오늘 전체 매출 요약해줘":
    "📊 **전체 점포 매출 요약 (2026-03-10 기준)**\n\n전체 33개 점포 기준으로 오늘 매출 데이터를 집계했습니다.\n\n• **총 매출**: API 집계 중 (전일 대비 추세 반영)\n• **상위 점포**: 청주시01, 마포구01, 동구01 등 연간 매출 상위 점포가 오늘도 선전\n• **하위 점포**: 고양시02, 성남시01, 수원시01 등은 전일 대비 하락세\n• **주요 이슈**: 재고 위험 점포 2~3개 확인 필요\n\n💡 매출 분석 페이지에서 점포별 상세 비교를 확인하세요.",
  "어느 점포가 가장 강한지 알려줘":
    "🏆 **점포 매출 강도 분석**\n\n연간 매출 기준 TOP 5:\n1. **청주시01** — 연간 약 11.6억 (최고 매출 점포)\n2. **마포구01** — 연간 약 10.4억\n3. **동구01** — 연간 약 9.6억\n4. **익산시01** — 연간 약 8.8억\n5. **부산진구01** — 연간 약 8.5억\n\n캠페인 참여율 TOP 5:\n1. **연제구01** — 캠페인 비중 9.9%\n2. **부산진구01** — 캠페인 비중 8.6%\n3. **성남시01** — 캠페인 비중 8.0%\n4. **시흥시01** — 캠페인 비중 7.7%\n5. **포항시01** — 캠페인 비중 7.9%\n\n💡 매출 분석 탭에서 시간대별/카테고리별 상세 데이터를 확인할 수 있습니다.",
  "재고 부족 점포 알려줘":
    "📦 **재고 위험 점포 현황**\n\n전체 33개 점포의 재고 데이터를 분석한 결과:\n\n• **위험(HIGH)**: 재고 소진 품목 3개 이상인 점포는 실시간 API 데이터 기준으로 확인 중\n• **주의(MEDIUM)**: 일부 품목 재고 부족 점포 존재\n\n**공통 위험 품목**:\n- 도넛류 주력 상품의 오후 소진 패턴 반복\n- 음료 원두 재고는 오후 14:00 이후 급감\n\n💡 재고 관리 탭에서 점포별 상세 재고 현황을 확인하고, 발주 권장 품목을 검토하세요.",
  "위험 상태 점포 요약해줘":
    "🚨 **위험 점포 요약**\n\n현재 위험/주의 상태 점포를 분석합니다:\n\n• 재고 소진 위험이 있는 점포는 재고 관리 탭에서 확인 가능\n• 매출 전일 대비 하락이 큰 점포는 매출 분석에서 비교\n\n**즉시 확인 필요**:\n- 재고 위험 HIGH 점포: 발주 즉시 권장\n- 매출 급감 점포: 프로모션/캠페인 적용 검토\n\n💡 점포 운영 현황에서 전체 점포 상태를 한눈에 볼 수 있습니다.",
  "시간대별로 약한 구간 알려줘":
    "⏰ **시간대별 약한 구간 분석**\n\n전체 33개 점포 평균 기준:\n\n• **가장 약한 구간**: 06:00~08:00 (매출 집중도 약 6%)\n• **피크 구간**: 09:00~11:00 (매출 집중도 약 32%)\n• **오후 하락**: 15:00~17:00 (매출 집중도 약 15%)\n\n**개선 제안**:\n- 오후 14:00~16:00 타임세일 프로모션으로 하락 완화\n- 조조할인 도입으로 06:00~08:00 매출 증대\n\n💡 점포별로 피크 시간대가 다를 수 있으니 매출 분석에서 확인하세요.",
  "점포별 차이 설명해줘":
    "📊 **점포별 매출 차이 분석**\n\n33개 점포의 매출 편차가 큽니다:\n\n• **최고/최소 차이**: 청주시01(약 11.6억) vs 고양시02(약 2.1억) — 약 5.5배 차이\n• **지역별 특징**:\n  - 서울: 마포구01, 강남구01 등 대형 점포 집중\n  - 경기: 안양시01, 광명시01 등 안정권\n  - 지방: 익산시01, 포항시01 등 지역 강자\n\n• **캠페인 영향**: 캠페인 참여율이 높은 점포(연제구01 9.9%)가 상대적으로 견조\n\n💡 매출 분석에서 점포별 상세 비교를 확인하세요.",
  "결제수단 비중 요약해줘":
    "💳 **결제수단 비중 요약**\n\n전체 점포 기준 추정 비중:\n\n• **신용카드**: 약 45%\n• **체크카드**: 약 25%\n• **모바일 결제**: 약 18% (증가 추세)\n• **상품권/쿠폰**: 약 8%\n• **현금**: 약 4%\n\n**특이사항**:\n- 모바일 결제 비중이 전년 대비 지속 증가\n- 캠페인 쿠폰 사용률은 캠페인 참여 점포에서 높게 나타남\n\n💡 결제수단 코드 테이블 기반 추정치이며, POS 연동 후 실데이터 제공 예정",
  "온/오프라인 비중 비교해줘":
    "📱 **온/오프라인 매출 비중 비교**\n\n전체 점포 기준 추정:\n\n• **오프라인 (매장)**: 약 72%\n• **온라인 (배달)**: 약 28%\n\n**점포별 차이**:\n- 대형 점포(마포구01, 청주시01)는 매장 비중이 높음\n- 배달 채널 점유율은 점포 위치와 배달 플랫폼 가입 여부에 따라 차이\n\n💡 배달 채널 POS 연동 후 정확한 데이터 제공 예정",
  "상위 상품 요약해줘":
    "🏆 **상위 판매 상품 요약**\n\n카테고리별 매출 기준:\n\n1. **도넛** — 전체 매출의 약 45% 차지 (주력 카테고리)\n2. **음료** — 약 30% (커피/라떼/에이드 중심)\n3. **푸드** — 약 15% (베이글/샌드위치)\n4. **케이크** — 약 10%\n\n**시간대별 특징**:\n- 오전: 커피/음료 비중 높음\n- 오후: 도넛/푸드 비중 증가\n\n💡 카테고리별 상세 매출은 매출 분석에서 확인 가능",
  "발주가 필요한 점포/품목 알려줘":
    "📦 **발주 권장 점포/품목**\n\n재고 위험 기준으로 발주가 필요한 점포와 품목:\n\n• 재고 위험 HIGH 점포: 실시간 데이터에서 확인 가능\n• 공통 부족 품목:\n  - 도넛 주력 상품 (오후 소진 패턴)\n  - 원두 (오후 14:00 이후 급감)\n  - 포장재 (일부 점포에서 부족)\n\n**권장 사항**:\n- 위험 점포는 AI 자동발주 승인 권장\n- 주의 점포는 다음 발주일에 수량 상향 검토\n\n💡 재고 관리 탭에서 점포별 상세 현황을 확인하세요.",
  "재고 위험 점포만 보여줘":
    "⚠️ **재고 위험 점포**\n\n현재 API 데이터를 기준으로 위험 등급이 할당된 점포:\n\n• **HIGH**: 재고 소진 품목 3개 이상 — 즉시 발주 필요\n• **MEDIUM**: 저재고 품목 존재 — 다음 발주일 확인\n\n위험 점포 목록은 재고 관리 탭의 '위험 점포' 탭에서 실시간 확인 가능합니다.",
  "이번 주 영업 보고서 요약해줘":
    "📋 **이번 주 영업 보고서 요약**\n\n2026-03-04 ~ 2026-03-10 기준:\n\n• **전체 매출**: 전주 대비 추세 반영 (상세 수치는 리포트 생성 후 확인)\n• **주요 이슈**:\n  - 재고 위험 점포 2~3개 지속 모니터링 필요\n  - 캠페인 참여 점포 성과 양호\n  - 오후 시간대 매출 하락 공통 이슈\n\n**개선 권장**:\n1. 오후 타임세일 프로모션 적용\n2. 재고 위험 점포 우선 발주\n3. 상위 점포 벤치마킹 분석\n\n💡 리포트 탭에서 상세 보고서를 생성할 수 있습니다.",
  "최근 집계 기준 반응 좋은 캠페인 알려줘":
    "🏆 **캠페인 성과 TOP 점포**\n\n캠페인 매출 비중 기준:\n\n1. **연제구01** — 9.9% (최고)\n2. **부산진구01** — 8.6%\n3. **성남시01** — 8.0%\n4. **포항시01** — 7.9%\n5. **시흥시01** — 7.7%\n\n총 25개 점포가 캠페인에 참여했으며, 평균 캠페인 비중은 약 3.8%입니다.\n\n💡 프로모션 전용 데이터는 없으므로 캠페인 성과 기준으로 해석합니다.",
  "이 화면에서 뭘 봐야 해?":
    "👀 **이 화면에서 확인할 항목**\n\n1. 📊 **전체 점포 매출 추이** — 상위/하위 점포 파악\n2. ⚠️ **위험 점포** — 재고/매출 이슈 즉시 대응\n3. 📈 **시간대별 패턴** — 약한 구간에 프로모션 적용\n4. 📦 **재고 현황** — 부족 품목 발주 권장\n\n💡 HQ 대시보드는 전체 33개 점포의 통합 뷰입니다. 세부 분석은 각 메뉴에서 확인하세요.",
  "개선 포인트 알려줘":
    "💡 **HQ 개선 포인트**\n\n1. **오후 매출 하락** — 14:00~16:00 타임세일 도입 검토\n2. **재고 위험 점포** — AI 자동발주 시스템 가동\n3. **점포 간 격차** — 하위 점포에 벤치마킹 프로그램 적용\n4. **캠페인 확대** — 비참여 8개 점포 캠페인 참여 유도\n5. **모바일 결제** — 증가 추세에 맞춘 인프라 확충",
  "오늘 가장 긴급한 이슈는?":
    "🚨 **긴급 이슈**\n\n1. **재고 위험 점포** — 소진 임박 품목 즉시 발주 필요\n2. **오후 매출 하락** — 전일 대비 하락세 점포 존재\n3. **캠페인 미참여 점포** — 8개 점포 캠페인 참여 유도\n\n💡 지금 할일 탭에서 우선순위별로 처리 가능합니다.",
  "완료 안 된 항목 보여줘":
    "✅ **미완료 항목**\n\n• 재고 위험 점포 발주 승인 대기\n• 오후 프로모션 조정 검토\n• 캠페인 미참여 점포 안내 발송\n\n지금 할일 탭에서 상태를 업데이트할 수 있습니다.",
};

interface ActionCard { label: string; sub: string; to: string; }
const AI_ACTION_CARDS: Record<string, ActionCard[]> = {
  "오늘 전체 매출 요약해줘": [
    { label: "매출 분석 상세 보기", sub: "시간대별/카테고리별 매출", to: "/sales" },
    { label: "점포 운영 현황", sub: "위험 점포 상태 확인", to: "/store-ops" },
  ],
  "어느 점포가 가장 강한지 알려줘": [
    { label: "점포별 매출 비교", sub: "전체 점포 랭킹", to: "/sales" },
    { label: "리포트 — 점포 비교", sub: "통계 카드 · 영업 보고서", to: "/reports" },
  ],
  "재고 부족 점포 알려줘": [
    { label: "재고 관리 — 위험 점포", sub: "발주 권장 품목 확인", to: "/inventory" },
  ],
  "오늘 가장 긴급한 이슈는?": [
    { label: "지금 할일 — 긴급 항목", sub: "우선순위별 대응", to: "/actions" },
  ],
  "발주가 필요한 점포/품목 알려줘": [
    { label: "재고 관리 — 부족 품목", sub: "점포별 발주 권장", to: "/inventory" },
  ],
};

interface Message {
  role: "user" | "ai";
  text: string;
  cards?: ActionCard[];
}

interface AgentChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AgentChatPanel({ open, onClose }: AgentChatPanelProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageCtx = PAGE_CONTEXT[pathname] ?? "HQ 대시보드";
  const chips = QUICK_CHIPS[pathname] ?? DEFAULT_CHIPS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const base =
        AI_RESPONSES[text] ??
        `이 질문은 Fox AI 백엔드에서 분석 중입니다. 잠시 후 실제 분석 결과가 표시됩니다.`;
      const cards = AI_ACTION_CARDS[text];
      setMessages((prev) => [...prev, { role: "ai", text: base, cards }]);
      setIsTyping(false);
    }, 900);
  };

  return (
    <div
      style={{
        gridArea: "chatpanel",
        display: "flex",
        flexDirection: "row",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 패널 왼쪽 엣지 토글 탭 */}
      <button
        onClick={onClose}
        title={open ? "AI 에이전트 닫기" : "AI 에이전트 열기"}
        style={{
          position: "absolute",
          left: -20,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          width: 20,
          height: 48,
          background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
          border: 0,
          borderRadius: "8px 0 0 8px",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          boxShadow: "-2px 0 8px rgba(233,30,140,0.2)",
          writingMode: "vertical-rl",
          letterSpacing: "0.05em",
        }}
      >
        {open ? "›" : "‹"}
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          background: "#fff",
          borderLeft: "1px solid #e7ebf3",
          overflow: "hidden",
        }}
      >
        {/* ── 헤더 ── */}
        <div
          style={{
            padding: "16px 20px",
            background: "linear-gradient(135deg, #111827, #1f2937)",
            color: "#fff",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
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
              boxShadow: "0 6px 16px rgba(233,30,140,.35)",
            }}
          >
            ✦
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em" }}>
              HQ Fox
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,.5)", fontWeight: 600 }}>
              {pageCtx} · 전체 점포 분석
            </p>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(22,163,74,0.15)",
              border: "1px solid rgba(22,163,74,0.3)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 5px #22c55e",
                animation: "foxPulse 2s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>온라인</span>
          </div>
        </div>

        {/* ── 메시지 영역 ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* 빈 상태 */}
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(255,110,0,.06), rgba(233,30,140,.04))",
                  border: "1px solid rgba(255,110,0,.15)",
                  fontSize: 12,
                  color: "#374151",
                  lineHeight: 1.7,
                  fontWeight: 500,
                }}
              >
                <strong style={{ color: "#ff6e00" }}>HQ Fox</strong>가{" "}
                <strong style={{ color: "#111827" }}>{pageCtx}</strong>를 분석 중입니다.
                전체 33개 점포 매출·재고·운영 데이터를 통합해 최적 답변을 드립니다.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  빠른 질문
                </p>
                {chips.map((chip) => (
                  <button
                    key={chip.text}
                    onClick={() => sendMessage(chip.text)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1px solid #e7ebf3",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#ff6e0055";
                      e.currentTarget.style.background = "#fff8f4";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#e7ebf3";
                      e.currentTarget.style.background = "#fff";
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{chip.icon}</span>
                    {chip.text}
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
              {msg.role === "ai" && (
                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 800, paddingLeft: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Fox AI
                </span>
              )}
              <div
                style={{
                  maxWidth: "88%",
                  padding: "11px 14px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user" ? "linear-gradient(135deg,#ff6e00,#e91e8c)" : "#f3f4f6",
                  color: msg.role === "user" ? "#fff" : "#111827",
                  fontSize: 12,
                  lineHeight: 1.7,
                  fontWeight: 500,
                  boxShadow: msg.role === "user" ? "0 4px 12px rgba(233,30,140,0.2)" : "none",
                }}
              >
                {msg.text}
              </div>

              {/* 딥링크 액션 카드 */}
              {msg.role === "ai" && msg.cards && msg.cards.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%", maxWidth: "92%" }}>
                  {msg.cards.map((card) => (
                    <button
                      key={card.to}
                      onClick={() => { onClose(); navigate(card.to); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid #e7ebf3",
                        background: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: 8,
                        boxShadow: "0 2px 8px rgba(15,23,42,.05)",
                        transition: "transform 0.15s, box-shadow 0.15s",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 14px rgba(15,23,42,.10)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,23,42,.05)";
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#111827" }}>{card.label}</p>
                        <p style={{ margin: "1px 0 0", fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.sub}</p>
                      </div>
                      <span style={{ fontSize: 15, color: "#d1d5db", flexShrink: 0 }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 타이핑 인디케이터 */}
          {isTyping && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "18px 18px 18px 4px",
                  background: "#f3f4f6",
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#9ca3af",
                      animation: `cpBounce 1.2s ease-in-out ${idx * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── 입력창 ── */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e7ebf3",
            display: "flex",
            gap: 8,
            flexShrink: 0,
            background: "#fff",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="Fox에게 질문하기..."
            style={{
              flex: 1,
              height: 40,
              borderRadius: 12,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              padding: "0 14px",
              outline: 0,
              fontSize: 13,
              color: "#111827",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#ff6e00")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#e7ebf3")}
          />
          <button
            onClick={() => sendMessage(input)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: 0,
              background: "linear-gradient(135deg,#ff6e00,#e91e8c)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 17,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 4px 14px rgba(233,30,140,.3)",
            }}
          >
            ↑
          </button>
        </div>

        <style>{`
          @keyframes cpBounce {
            0%,60%,100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
          }
          @keyframes foxPulse {
            0%,100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    </div>
  );
}
