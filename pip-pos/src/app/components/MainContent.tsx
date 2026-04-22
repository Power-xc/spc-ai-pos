import React from "react";
import RealtimeStatus from "./MainContent/RealtimeStatus";
import TodoList from "./MainContent/TodoList";
import OrderManagement from "./MainContent/OrderManagement";
import PromotionInfo from "./MainContent/PromotionInfo";
import AiValidation from "./MainContent/AiValidation";
import AiPerformance from "./MainContent/AiPerformance";
import Benchmarking from "./MainContent/Benchmarking";
import AlarmSettings from "./MainContent/AlarmSettings";

interface MainContentProps {
  selectedMenu: string;
  setSelectedMenu: (menu: string) => void;
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

export default function MainContent({
  selectedMenu,
  setSelectedMenu,
  isAiPanelOpen,
  isSidebarOpen,
}: MainContentProps) {
  const commonProps = { isAiPanelOpen, isSidebarOpen };

  switch (selectedMenu) {
    case "종합 현황":
      return null;

    case "AI 실시간 현황":
      return <RealtimeStatus {...commonProps} setSelectedMenu={setSelectedMenu} />;

    case "생산관리":
      return <TodoList {...commonProps} />;

    case "발주 관리":
      return <OrderManagement {...commonProps} />;

    case "프로모션":
      return <PromotionInfo {...commonProps} />;

    case "AI 검증":
      return <AiValidation {...commonProps} />;

    case "AI 기반 성과 분석":
      return <AiPerformance {...commonProps} />;

    case "벤치마킹":
      return <Benchmarking {...commonProps} />;

    case "알람 설정":
      return <AlarmSettings {...commonProps} />;

    default:
      return null;
  }
}
