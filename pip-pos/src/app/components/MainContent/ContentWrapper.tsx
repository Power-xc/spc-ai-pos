import React from "react";

interface ContentWrapperProps {
  children: React.ReactNode;
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
  title?: string;
}

export default function ContentWrapper({
  children,
  isAiPanelOpen,
  isSidebarOpen,
  title,
}: ContentWrapperProps) {
  const sidebarW = isSidebarOpen ? 188 : 0;
  // 좌측 시작점: 사이드바 유무에 따라 20px 혹은 sidebarW + 20px
  const contentLeft = isSidebarOpen ? sidebarW + 20 : 20;
  // 우측 끝점: AI 패널 유무에 따라 787px 혹은 1004px (전체 1024px 기준)
  const contentRight = isAiPanelOpen ? 787 : 1004;
  // 유동적 너비 계산
  const contentWidth = contentRight - contentLeft;

  return (
    <div
      className="absolute rounded-[10px] transition-all duration-300 max-h-[670px] overflow-y-auto NoScroll"
      style={{
        left: `${contentLeft}px`,
        top: "77.51px",
        width: `${contentWidth}px`,
      }}
    >
      <div className="flex flex-col gap-[20px]">
        {title && (
          <h2 className="[font-weight:700] text-[20px] text-[#0f1f2f]">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
