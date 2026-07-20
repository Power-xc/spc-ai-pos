import { useState, useRef, useEffect } from "react";
import MainContent from "../app/components/MainContent";
import Sidebar from "../app/components/Sidebar";
import DashboardHeader from "../app/components/DashboardHeader";
import AiPanel from "../app/components/AiPanel";
import OverviewStats from "../app/components/OverviewStats";
import AiInsightCard from "../app/components/AiInsightCard";
import AiBriefingModal from "../app/components/AiBriefingModal";
import {
  resetDemoDateTime,
  setDemoDateTime,
  useDemoDateTime,
} from "../lib/demoDateTime";
import { invalidateDemoRuntimeData } from "../lib/api";

export default function Frame({ className }: { className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const demoDateTime = useDemoDateTime();
  const [selectedMenu, setSelectedMenu] = useState(
    () => localStorage.getItem("selectedMenu") ?? "종합 현황",
  );
  const [menuRefreshNonce, setMenuRefreshNonce] = useState(0);
  const demoKey = `${demoDateTime.date}-${demoDateTime.time}`;

  const handleSetSelectedMenu = (menu: string) => {
    localStorage.setItem("selectedMenu", menu);
    setSelectedMenu(menu);
    setMenuRefreshNonce((prev) => prev + 1);
  };

  useEffect(() => {
    const handleNavigateMenu = (e: Event) => {
      const menu = (e as CustomEvent<string>).detail;
      if (menu) {
        handleSetSelectedMenu(menu);
      }
    };
    window.addEventListener("navigate-menu", handleNavigateMenu);
    return () => window.removeEventListener("navigate-menu", handleNavigateMenu);
  }, []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAiBriefingOpen, setIsAiBriefingOpen] = useState(false);
  const [showDemoDateTimeModal, setShowDemoDateTimeModal] = useState(false);
  const [draftDate, setDraftDate] = useState(demoDateTime.date);
  const [draftTime, setDraftTime] = useState(demoDateTime.time);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  useEffect(() => {
    setDraftDate(demoDateTime.date);
    setDraftTime(demoDateTime.time);
  }, [demoDateTime.date, demoDateTime.time]);

  const handleApplyDemoDateTime = () => {
    setDemoDateTime({ date: draftDate, time: draftTime });
    invalidateDemoRuntimeData();
    handleRefresh();
    setShowDemoDateTimeModal(false);
  };

  const handleResetDemoDateTime = () => {
    const resetState = resetDemoDateTime();
    setDraftDate(resetState.date);
    setDraftTime(resetState.time);
    invalidateDemoRuntimeData();
    handleRefresh();
  };

  // Dynamic layout values
  const sidebarW = isSidebarOpen ? 188 : 0;
  const topBtnsRight = (isAiPanelOpen ? 217 : 0) + 20;
  const headerLeft = isSidebarOpen ? sidebarW + 20 : 46;
  const cardLeft = isSidebarOpen ? sidebarW + 20 : 20;
  const contentRight = isAiPanelOpen ? 787 : 1004;
  const cardWidth = contentRight - cardLeft;

  return (
    <div
      ref={frameRef}
      className={
        className || "bg-[#f1f1f1] h-[760px] overflow-clip relative w-[1024px]"
      }
    >
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        selectedMenu={selectedMenu}
        setSelectedMenu={handleSetSelectedMenu}
        sidebarW={sidebarW}
        onOpenDemoDateTime={() => setShowDemoDateTimeModal(true)}
      />

      <DashboardHeader
        isAiPanelOpen={isAiPanelOpen}
        setIsAiPanelOpen={setIsAiPanelOpen}
        isSidebarOpen={isSidebarOpen}
        selectedMenu={selectedMenu}
        headerLeft={headerLeft}
        topBtnsRight={topBtnsRight}
        handleRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <AiPanel
        key={`ai-panel-${selectedMenu}-${demoKey}-${menuRefreshNonce}`}
        isAiPanelOpen={isAiPanelOpen}
        setIsAiPanelOpen={setIsAiPanelOpen}
        selectedMenu={selectedMenu}
        onOpenBriefing={() => setIsAiBriefingOpen(true)}
      />

      {selectedMenu === "종합 현황" && (
        <>
          <OverviewStats
            key={`overview-${demoKey}`}
            cardLeft={cardLeft}
            cardWidth={cardWidth}
          />
          <AiInsightCard
            key={`insight-${demoKey}`}
            cardLeft={cardLeft}
            cardWidth={cardWidth}
            setSelectedMenu={handleSetSelectedMenu}
            onOpenBriefing={() => setIsAiBriefingOpen(true)}
          />
        </>
      )}

      <AiBriefingModal
        key={`briefing-${selectedMenu}-${demoKey}`}
        isOpen={isAiBriefingOpen}
        onClose={() => setIsAiBriefingOpen(false)}
        frameRef={frameRef}
        onNavigate={handleSetSelectedMenu}
        selectedMenu={selectedMenu}
      />

      {showDemoDateTimeModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setShowDemoDateTimeModal(false)}
        >
          <div
            className="w-[320px] rounded-[20px] bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-[20px] pt-[18px] pb-[12px] flex items-start justify-between">
              <div>
                <p className="font-bold text-[15px] text-[#222] leading-[22px]">
                  기준 일자 및 시간
                </p>
                <p className="text-[11px] text-[#888] leading-[17px]">
                  선택한 기준값을 화면, 브리핑, 채팅에 함께 반영합니다.
                </p>
              </div>
              <button
                onClick={() => setShowDemoDateTimeModal(false)}
                className="w-[24px] h-[24px] flex items-center justify-center rounded-full bg-[#f0f1f3] cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path
                    d="M1 1l7 7M8 1L1 8"
                    stroke="#888"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="px-[20px] pb-[18px] flex flex-col gap-[14px]">
              <div className="grid grid-cols-2 gap-[10px]">
                <label className="flex flex-col gap-[6px]">
                  <span className="text-[10px] font-bold text-[#555] leading-[14px]">
                    기준 날짜
                  </span>
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className="h-[38px] rounded-[12px] border border-[#e3e3e3] px-[12px] text-[12px] text-[#222] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-[6px]">
                  <span className="text-[10px] font-bold text-[#555] leading-[14px]">
                    기준 시간
                  </span>
                  <input
                    type="time"
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                    className="h-[38px] rounded-[12px] border border-[#e3e3e3] px-[12px] text-[12px] text-[#222] outline-none"
                  />
                </label>
              </div>
              <div className="rounded-[14px] bg-[#f7f8f9] px-[12px] py-[10px]">
                <p className="text-[10px] text-[#666] leading-[14px]">
                  현재 적용값
                </p>
                <p className="text-[12px] font-bold text-[#222] leading-[16px]">
                  {demoDateTime.date} {demoDateTime.time}
                </p>
              </div>
              <div className="flex items-center justify-between gap-[10px]">
                <button
                  onClick={handleResetDemoDateTime}
                  className="flex-1 h-[38px] rounded-[14px] border border-[#d9d9d9] text-[11px] font-bold text-[#555] cursor-pointer"
                >
                  시연 기준 복원
                </button>
                <button
                  onClick={handleApplyDemoDateTime}
                  className="flex-1 h-[38px] rounded-[14px] text-[11px] font-bold text-white cursor-pointer"
                  style={{
                    backgroundImage:
                      "linear-gradient(96deg, #3FAF60 50.65%, #3AAEDD 121.87%)",
                  }}
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MainContent
        key={`main-${selectedMenu}-${demoKey}-${menuRefreshNonce}`}
        selectedMenu={selectedMenu}
        setSelectedMenu={handleSetSelectedMenu}
        isAiPanelOpen={isAiPanelOpen}
        isSidebarOpen={isSidebarOpen}
      />
    </div>
  );
}
