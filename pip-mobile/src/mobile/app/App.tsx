import { useState, useEffect } from "react";
import MobileHeader from "./components/MobileHeader";
import NoticeBar from "./components/NoticeBar";
import BottomNav from "./components/BottomNav";
import HanunePage from "./pages/HanunePage";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import PipAiPage from "./pages/PipAiPage";
import AllPage from "./pages/AllPage";
import NotificationPage, { type NotificationViewKey } from "./pages/NotificationPage";
import PerformanceSimulatorPage from "./pages/PerformanceSimulatorPage";
import ReviewDetailPage from "./pages/ReviewDetailPage";
import TodoShortcutsPage from "./pages/TodoShortcutsPage";
import type { MobileStore } from "@/mobile/types";
import { getMobileStores } from "@/mobile/lib/api";

export type OrderInitMode = "approve" | "edit" | null;

const SUBPAGE_TITLES: Record<string, string> = {
  "알림": "알림",
  "리뷰현황": "리뷰 현황",
  "할일 바로가기": "지금 할 일",
  "성과시뮬레이터": "성과 시뮬레이터",
};

export default function App() {
  const [stores, setStores] = useState<MobileStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem("mobileActiveTab") ?? "한눈에"
  );
  const [previousTab, setPreviousTab] = useState<string>("한눈에");
  const [orderInitMode, setOrderInitMode] = useState<OrderInitMode>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [pipInitialQuery, setPipInitialQuery] = useState<string | undefined>(undefined);
  const [notificationView, setNotificationView] = useState<NotificationViewKey>("list");

  function handleTabChange(
    tab: string,
    initMode: OrderInitMode = null,
    sectionId?: string,
    initialQuery?: string
  ) {
    localStorage.setItem("mobileActiveTab", tab);
    setActiveTab(tab);
    if (tab === "발주") setOrderInitMode(initMode);
    else setOrderInitMode(null);
    if (tab === "PIP AI") setPipInitialQuery(initialQuery);
    if (tab !== "알림") setNotificationView("list");
    if (sectionId) {
      setScrollTarget(sectionId);
    } else {
      window.scrollTo(0, 0);
      setScrollTarget(null);
    }
  }

  useEffect(() => {
    getMobileStores().then((list) => {
      setStores(list);
      setSelectedStoreId(list[0]?.id ?? "");
    });
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) ?? null;

  useEffect(() => {
    if (!scrollTarget) return;
    let cancelled = false;
    let tries = 0;
    let rafId = 0;
    const attempt = () => {
      if (cancelled) return;
      const el = document.getElementById(scrollTarget);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        setScrollTarget(null);
        return;
      }
      if (tries++ < 40) {
        rafId = requestAnimationFrame(attempt);
      } else {
        setScrollTarget(null);
      }
    };
    rafId = requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [scrollTarget, activeTab]);

  function renderPage(tab: string) {
    switch (tab) {
      case "매장": return <StorePage />;
      case "발주":
        return (
          <OrderPage
            initMode={orderInitMode}
            onConsumeInitMode={() => setOrderInitMode(null)}
            onRequestHome={() => handleTabChange("한눈에")}
          />
        );
      case "한눈에": return <HanunePage onNavigate={handleTabChange} />;
      case "성과시뮬레이터": return <PerformanceSimulatorPage />;
      case "PIP AI":
        return (
          <PipAiPage
            initialQuery={pipInitialQuery}
            onConsumeInitialQuery={() => setPipInitialQuery(undefined)}
            onNavigate={handleTabChange}
          />
        );
      case "전체": return <AllPage onNavigate={handleTabChange} />;
      case "알림": return <NotificationPage view={notificationView} />;
      case "리뷰현황": return <ReviewDetailPage />;
      case "할일 바로가기": return <TodoShortcutsPage />;
      default: return <HanunePage />;
    }
  }

  const headerProps = {
    stores,
    selectedStoreId,
    onSelectStore: setSelectedStoreId,
    notificationCount: selectedStore?.notificationCount ?? 0,
    onBellClick: () => {
      if (activeTab !== "알림" && activeTab !== "리뷰현황") setPreviousTab(activeTab);
      handleTabChange("알림");
    },
    title:
      activeTab === "알림" && notificationView === "settings"
        ? "알림 설정"
        : SUBPAGE_TITLES[activeTab],
    onBack:
      activeTab === "알림"
        ? notificationView === "settings"
          ? () => setNotificationView("list")
          : () => handleTabChange(previousTab)
        : activeTab === "리뷰현황"
        ? () => handleTabChange("한눈에", null, "section-review")
        : activeTab === "할일 바로가기"
        ? () => handleTabChange("한눈에")
        : activeTab === "성과시뮬레이터"
        ? () => handleTabChange("한눈에")
        : undefined,
    rightSlot:
      activeTab === "알림" && notificationView === "list" ? (
        <button
          type="button"
          onClick={() => setNotificationView("settings")}
          aria-label="알림 설정"
          className="flex items-center gap-[6px] px-[10px] py-[6px] rounded-[8px] bg-[#eaf6ff] hover:bg-[#d9eef9] active:bg-[#c5e3f3] transition-colors cursor-pointer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="#38a9d7" strokeWidth="1.8" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.02a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.02a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              stroke="#38a9d7"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[12px] font-bold text-[#38a9d7] leading-[16px]">알림 설정</span>
        </button>
      ) : undefined,
  };

  const isMobile = window.matchMedia("(max-width: 500px)").matches;

  if (isMobile) {
    return (
      <div className="bg-[#ebedef] min-h-screen w-full relative pb-[80px]">
        <MobileHeader {...headerProps} />
        <NoticeBar />
        {renderPage(activeTab)}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #cdd1d8 0%, #b8bdc6 60%, #a8adb8 100%)",
      }}
    >
      <div
        className="relative flex flex-col"
        style={{
          width: 418,
          borderRadius: 58,
          background: "linear-gradient(160deg, #2e3036 0%, #1c1f25 100%)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.6), 0 8px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
          border: "1.5px solid #3e4249",
          padding: "14px",
        }}
      >
        <div className="absolute left-[-4px] top-[130px] w-[4px] h-[36px] rounded-l-[3px]" style={{ background: "#2a2d33", border: "1px solid #444" }} />
        <div className="absolute left-[-4px] top-[184px] w-[4px] h-[68px] rounded-l-[3px]" style={{ background: "#2a2d33", border: "1px solid #444" }} />
        <div className="absolute left-[-4px] top-[268px] w-[4px] h-[68px] rounded-l-[3px]" style={{ background: "#2a2d33", border: "1px solid #444" }} />
        <div className="absolute right-[-4px] top-[184px] w-[4px] h-[96px] rounded-r-[3px]" style={{ background: "#2a2d33", border: "1px solid #444" }} />

        <div
          style={{
            width: 390,
            borderRadius: 46,
            overflow: "hidden",
            boxShadow: "inset 0 3px 10px rgba(0,0,0,0.8)",
          }}
        >
          <div className="bg-white flex justify-center pt-[12px] pb-[6px]">
            <div className="w-[110px] h-[32px] bg-black rounded-full" />
          </div>

          <div style={{ width: 390, height: 820, display: "flex", flexDirection: "column", overflow: "hidden", transform: "translateZ(0)" }}>
            <MobileHeader {...headerProps} />
            <NoticeBar />
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "#ebedef" }}>
              {renderPage(activeTab)}
            </div>
            <BottomNav activeTab={activeTab} onTabChange={handleTabChange} embedded />
          </div>

          <div className="bg-white flex justify-center py-[8px]">
            <div className="w-[120px] h-[4px] rounded-full" style={{ background: "rgba(0,0,0,0.18)" }} />
          </div>
        </div>

        <div className="flex items-center justify-center mt-[10px]">
          <span style={{ color: "#555860", fontSize: "9px", letterSpacing: "0.3em", fontWeight: 500 }}>
            PIP 점주앱
          </span>
        </div>
      </div>
    </div>
  );
}
