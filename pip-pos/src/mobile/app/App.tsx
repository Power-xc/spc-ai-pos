import { useState, useEffect } from "react";
import MobileHeader from "./components/MobileHeader";
import NoticeBar from "./components/NoticeBar";
import BottomNav from "./components/BottomNav";
import HanunePage from "./pages/HanunePage";
import StorePage from "./pages/StorePage";
import OrderPage from "./pages/OrderPage";
import PipAiPage from "./pages/PipAiPage";
import AllPage from "./pages/AllPage";
import type { MobileStore } from "@/mobile/types";
import { getMobileStore } from "@/mobile/lib/api";

function renderPage(tab: string) {
  switch (tab) {
    case "매장": return <StorePage />;
    case "발주": return <OrderPage />;
    case "한눈에": return <HanunePage />;
    case "PIP AI": return <PipAiPage />;
    case "전체": return <AllPage />;
    default: return <HanunePage />;
  }
}

export default function App() {
  const [store, setStore] = useState<MobileStore | null>(null);
  // 새로고침 후에도 마지막 탭 유지
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem("mobileActiveTab") ?? "한눈에"
  );

  function handleTabChange(tab: string) {
    localStorage.setItem("mobileActiveTab", tab);
    setActiveTab(tab);
  }

  useEffect(() => {
    getMobileStore().then(setStore);
  }, []);

  return (
    <div className="bg-[#ebedef] min-h-screen max-w-[390px] mx-auto relative pb-[80px]">
      <MobileHeader storeName={store?.name ?? ""} notificationCount={store?.notificationCount ?? 0} />
      <NoticeBar />
      {renderPage(activeTab)}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
