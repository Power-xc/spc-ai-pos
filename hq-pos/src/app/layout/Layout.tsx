import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { AgentChatPanel } from "../components/AgentChatPanel";
import { StoreFilterProvider } from "../../lib/StoreFilterContext";
import { StoreFilterBar } from "../components/StoreFilterBar";

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/": {
    title: "HQ POS",
    sub: "본사 운영 대시보드 · 전체 33개 점포 통합 현황",
  },
  "/store-ops": {
    title: "점포 운영 현황",
    sub: "전체 점포 운영 상태 · 혼잡도 추정 · 이슈 요약",
  },
  "/sales": {
    title: "매출 분석",
    sub: "일별/주별/월별 매출 리포트 · 점포별 비교 · 채널/결제 분석",
  },
  "/inventory": {
    title: "재고 관리",
    sub: "식재료/포장재 재고 · 부족 품목 · 재고 위험 점포",
  },
  "/reports": {
    title: "리포트",
    sub: "영업 보고서 · 통계 카드 · 점포 비교 · 캠페인 성과",
  },
  "/ai-insights": {
    title: "AI 인사이트",
    sub: "전체 점포 기반 AI 분석 · 예측 · 인사이트 통합 뷰",
  },
  "/actions": {
    title: "지금 할일",
    sub: "전체 점포 우선 대응 과제 · 긴급 이슈 관리",
  },
  "/issues": {
    title: "이상 감지 현황",
    sub: "전체 점포 카테고리·심각도별 이상 감지 현황",
  },
  "/alerts": {
    title: "알림 설정",
    sub: "점포별 재고·매출·알림 조건 및 임계값 관리",
  },
};

const NAV_WIDTH_PERCENT = "16%";
const CHAT_WIDTH_PERCENT = "22%";
const MIN_NAV_WIDTH = 220;
const MAX_NAV_WIDTH = 280;
const COLLAPSED_NAV_WIDTH = 56;
const MIN_CHAT_WIDTH = 260;
const MAX_CHAT_WIDTH = 300;

export function Layout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? PAGE_META["/"];

  const [chatOpen, setChatOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <StoreFilterProvider>
      <div
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateColumns: `${
            sidebarOpen
              ? `clamp(${MIN_NAV_WIDTH}px, ${NAV_WIDTH_PERCENT}, ${MAX_NAV_WIDTH}px)`
              : `${COLLAPSED_NAV_WIDTH}px`
          } 1fr ${
            chatOpen ? `clamp(${MIN_CHAT_WIDTH}px, ${CHAT_WIDTH_PERCENT}, ${MAX_CHAT_WIDTH}px)` : "0px"
          }`,
          gridTemplateRows: "64px 1fr",
          gridTemplateAreas: `"sidebar header header" "sidebar main chatpanel"`,
          background: "#f5f7fb",
          fontFamily: `Inter, Pretendard, "Noto Sans KR", system-ui, sans-serif`,
          minWidth: 960,
          transition: "grid-template-columns 0.28s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        <Header
          title={meta.title}
          sub={meta.sub}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((v) => !v)}
        />
        <main
          style={{
            gridArea: "main",
            overflow: "auto",
            padding: 20,
            minWidth: 0,
          }}
        >
          <StoreFilterBar />
          <div style={{ height: 12 }} />
          <Outlet />
        </main>

        <div
          style={{
            gridArea: "chatpanel",
            overflow: "hidden",
            height: "100%",
            opacity: chatOpen ? 1 : 0,
            transition: "opacity 0.2s ease",
            pointerEvents: chatOpen ? "auto" : "none",
          }}
        >
          <AgentChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
        </div>
      </div>
    </StoreFilterProvider>
  );
}