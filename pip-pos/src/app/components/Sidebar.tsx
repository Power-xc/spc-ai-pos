import { useState, useEffect } from "react";
import { sidebarIcons } from "../../assets/sidebarIcons";
import sideMenu from "../../assets/sideMenu.svg";
import svgPaths from "../../imports/svg-dwfcrot486";
import { getMenuIssueCounts } from "../../lib/api";
import { DEMO_PRIMARY_STORE_NAME } from "../../lib/demoStoreConfig";
import { useDemoDateTime } from "../../lib/demoDateTime";
import type { MenuIssueCount } from "../../types";

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  selectedMenu: string;
  setSelectedMenu: (menu: string) => void;
  sidebarW: number;
  onOpenDemoDateTime: () => void;
}

export default function Sidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  selectedMenu,
  setSelectedMenu,
  sidebarW,
  onOpenDemoDateTime,
}: SidebarProps) {
  const [issueCounts, setIssueCounts] = useState<MenuIssueCount[]>([]);
  const demoDateTime = useDemoDateTime();

  useEffect(() => {
    getMenuIssueCounts().then(setIssueCounts);
  }, []);

  const getCount = (menu: string) =>
    issueCounts.find((c) => c.menu === menu)?.count ?? 0;

  return (
    <>
      {/* ─── LNB Sidebar (collapsible) ─── */}
      <div
        className="absolute left-0 top-0 h-[760px] overflow-hidden transition-all duration-300 z-10"
        style={{ width: `${sidebarW}px` }}
      >
        {/* White sidebar background */}
        <div className="absolute bg-white border-[#ebebeb] border-r border-solid h-[760px] left-0 top-0 w-[188px]" />

        {/* Logo */}
        <div
          className="absolute h-[27.962px] left-[20px] overflow-clip top-[14.79px] w-[84.693px]"
          data-name="logo_core_alt_color_cmyk"
        >
          <div className="absolute inset-[0_44.36%_0_0]" data-name="Group">
            <svg
              className="absolute block inset-0 size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 47.1254 27.9616"
            >
              <g id="Group">
                <path
                  d={svgPaths.p2375bb00}
                  fill="var(--fill-0, #F3C300)"
                  id="Vector"
                />
                <path
                  d={svgPaths.p36463b00}
                  fill="var(--fill-0, #3CB4E5)"
                  id="Vector_2"
                />
              </g>
            </svg>
          </div>
          <div
            className="absolute contents inset-[52.45%_-0.13%_4.34%_55.64%]"
            data-name="Group"
          >
            <div
              className="absolute inset-[52.45%_30.94%_4.75%_55.64%]"
              data-name="Group"
            >
              <svg
                className="absolute block inset-0 size-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 11.3653 11.9674"
              >
                <g id="Group">
                  <path
                    d={svgPaths.p2de1b6f0}
                    fill="var(--fill-0, #727171)"
                    id="Vector"
                  />
                  <path
                    d={svgPaths.p2c489f00}
                    fill="var(--fill-0, #727171)"
                    id="Vector_2"
                  />
                </g>
              </svg>
            </div>
            <div
              className="absolute inset-[53.87%_15.8%_4.34%_71.1%]"
              data-name="Group"
            >
              <svg
                className="absolute block inset-0 size-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 11.0949 11.6832"
              >
                <g id="Group">
                  <path
                    d={svgPaths.p453df00}
                    fill="var(--fill-0, #727171)"
                    id="Vector"
                  />
                  <path
                    d={svgPaths.p15268b00}
                    fill="var(--fill-0, #727171)"
                    id="Vector_2"
                  />
                </g>
              </svg>
            </div>
            <div
              className="absolute inset-[52.58%_-0.13%_4.82%_85.63%]"
              data-name="Group"
            >
              <svg
                className="absolute block inset-0 size-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 12.2747 11.9128"
              >
                <g id="Group">
                  <path
                    d={svgPaths.pe22b7e0}
                    fill="var(--fill-0, #727171)"
                    id="Vector"
                  />
                  <path
                    d={svgPaths.pca04880}
                    fill="var(--fill-0, #727171)"
                    id="Vector_2"
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Greeting - hide in icon-only mode */}
        <div
          className={`relative leading-[0] not-italic border-t-1 border-[#ebebeb] w100 pl-4 pt-4 text-[#777] text-[0px] top-[56px] whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-100 pointer-events-none"}`}
        >
          <p className="leading-[25px] mb-0 text-[14px] whitespace-pre">{`환영합니다. `}</p>
          <p className="text-[14px] whitespace-pre">
            <span className="[font-weight:700] leading-[25px] not-italic text-[#38a9d7]">{`${DEMO_PRIMARY_STORE_NAME} `}</span>
            <span className="text-[#000] font-[500]">운영 화면</span>
          </p>
          <p className="text-[12px] text-[#8a8a8a] leading-[18px] whitespace-pre">
            현재 기준 매장 분석 중
          </p>
        </div>

        {/* Divider line under greeting - hide in icon-only mode */}
        <div
          className={`absolute h-0 left-0 top-[145.54px] w-[188px] transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-100"}`}
        >
          <div className="absolute inset-[-1px_0_0_0]">
            <svg
              className="block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 188 1"
            >
              <line
                id="Line 2"
                stroke="var(--stroke-0, #EEEEEE)"
                x2="188"
                y1="0.5"
                y2="0.5"
              />
            </svg>
          </div>
        </div>

        {/* MAIN menu section */}
        <div className="absolute content-stretch flex flex-col gap-[18px] items-start left-[20px] top-[162.54px] w-[90.972px]">
          <p
            className={`[font-weight:700] leading-[normal] not-italic relative shrink-0 text-[#727171] text-[8px] w-full transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-100"}`}
          >
            MAIN
          </p>
          <div className="content-stretch flex flex-col gap-[14px] items-start relative shrink-0 w-full">
            <button
              onClick={() => setSelectedMenu("종합 현황")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 cursor-pointer transition-opacity ${selectedMenu === "종합 현황" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="h-[13px] relative shrink-0 w-[14px]"
                data-name="Iconly/Bold/Category"
              >
                <div className="absolute" data-name="Category">
                  <img
                    src={sidebarIcons["종합 현황"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "종합 현황" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["종합 현황"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "종합 현황" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`[font-weight:400] leading-[normal] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-1000"} ${selectedMenu === "종합 현황" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                종합 현황
              </p>
            </button>
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
              <button
                onClick={() => setSelectedMenu("AI 실시간 현황")}
                className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "AI 실시간 현황" ? "opacity-100" : "opacity-100"}`}
              >
                <div className="relative shrink-0" data-name="Activity">
                  <img
                    src={sidebarIcons["AI 실시간 현황"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 실시간 현황" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["AI 실시간 현황"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 실시간 현황" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
                <p
                  className={`leading-[normal] not-italic [font-weight:400] relative  shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "AI 실시간 현황" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
                >
                  AI 실시간 현황
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Divider line below MAIN */}
        <div className="absolute h-0 left-0 top-[257.54px] w-[188px]">
          <div className="absolute inset-[-1px_0_0_0]">
            <svg
              className="block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 188 1"
            >
              <line
                id="Line 2"
                stroke="var(--stroke-0, #EEEEEE)"
                x2="188"
                y1="0.5"
                y2="0.5"
              />
            </svg>
          </div>
        </div>

        {/* ACTION menu section */}
        <div className="absolute content-stretch flex flex-col gap-[18px] items-start left-[20px] top-[277.54px] w-[148px]">
          <p
            className={`[font-weight:700] leading-[normal] not-italic relative shrink-0 text-[#727171] text-[8px] w-full transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-100"}`}
          >
            ACTION
          </p>
          <div className="content-stretch flex flex-col gap-[14px] items-start relative shrink-0 w-full">
            <button
              onClick={() => setSelectedMenu("생산관리")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "생산관리" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0"
                data-name="Iconly/Bold/Calendar"
              >
                <div className="relative shrink-0" data-name="Calendar">
                  <img
                    src={sidebarIcons["생산관리"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "생산관리" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["생산관리"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "생산관리" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "생산관리" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"} `}
              >
                생산관리
              </p>
              {isSidebarOpen && getCount("생산관리") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("생산관리")}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedMenu("발주 관리")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer hover:opacity-100 transition-opacity ${selectedMenu === "발주 관리" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Ticket"
              >
                <div className="absolute" data-name="Ticket">
                  <img
                    src={sidebarIcons["발주 관리"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "발주 관리" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["발주 관리"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "발주 관리" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${selectedMenu === "발주 관리" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                발주 관리
              </p>
              {isSidebarOpen && getCount("발주 관리") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("발주 관리")}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedMenu("프로모션")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "프로모션" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Notification"
              >
                <div className="absolute" data-name="Notification">
                  <img
                    src={sidebarIcons["프로모션"].default}
                    alt=""
                    className={`size-full object-contain mt-0.5 ${selectedMenu === "프로모션" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["프로모션"].active}
                    alt=""
                    className={`size-full object-contain mt-0.5 ${selectedMenu === "프로모션" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${selectedMenu === "프로모션" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                프로모션
              </p>
              {isSidebarOpen && getCount("프로모션") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("프로모션")}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Divider line below ACTION */}
        <div className="absolute h-0 left-0 top-[402.54px] w-[188px]">
          <div className="absolute inset-[-1px_0_0_0]">
            <svg
              className="block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 188 1"
            >
              <line
                id="Line 2"
                stroke="var(--stroke-0, #EEEEEE)"
                x2="188"
                y1="0.5"
                y2="0.5"
              />
            </svg>
          </div>
        </div>

        {/* SUB menu section */}
        <div className="absolute content-stretch flex flex-col gap-[18px] items-start left-[20px] top-[422.54px] w-[148px]">
          <p
            className={`[font-weight:700] leading-[normal] not-italic relative shrink-0 text-[#727171] text-[8px] w-full transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-100"}`}
          >
            SUB
          </p>
          <div className="content-stretch flex flex-col gap-[14px] items-start relative shrink-0 w-full">
            <button
              onClick={() => setSelectedMenu("AI 기반 성과 분석")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "AI 기반 성과 분석" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Analysis"
              >
                <div className="absolute">
                  <img
                    src={sidebarIcons["AI 기반 성과 분석"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 기반 성과 분석" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["AI 기반 성과 분석"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 기반 성과 분석" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "AI 기반 성과 분석" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                AI 기반 성과 분석
              </p>
              {isSidebarOpen && getCount("AI 기반 성과 분석") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("AI 기반 성과 분석")}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedMenu("AI 검증")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "AI 검증" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Chart"
              >
                <div className="absolute" data-name="Chart">
                  <img
                    src={sidebarIcons["AI 검증"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 검증" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["AI 검증"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "AI 검증" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "AI 검증" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                AI 검증
              </p>
              {isSidebarOpen && getCount("AI 검증") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("AI 검증")}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedMenu("벤치마킹")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "벤치마킹" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Document"
              >
                <div className="absolute" data-name="Document">
                  <img
                    src={sidebarIcons["벤치마킹"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "벤치마킹" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["벤치마킹"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "벤치마킹" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "벤치마킹" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                벤치마킹
              </p>
              {isSidebarOpen && getCount("벤치마킹") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("벤치마킹")}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedMenu("알람 설정")}
              className={`group content-stretch flex gap-[7px] items-center relative shrink-0 w-full cursor-pointer transition-opacity ${selectedMenu === "알람 설정" ? "opacity-100" : "opacity-100"}`}
            >
              <div
                className="relative shrink-0 size-[14px]"
                data-name="Iconly/Bold/Setting"
              >
                <div className="absolute" data-name="Setting">
                  <img
                    src={sidebarIcons["알람 설정"].default}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "알람 설정" ? "hidden" : "block group-hover:hidden"}`}
                  />
                  <img
                    src={sidebarIcons["알람 설정"].active}
                    alt=""
                    className={`size-full object-contain ${selectedMenu === "알람 설정" ? "block" : "hidden group-hover:block"}`}
                  />
                </div>
              </div>
              <p
                className={`leading-[normal] [font-weight:400] not-italic relative shrink-0 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? "max-w-[120px] opacity-100" : "max-w-0 opacity-100"} ${selectedMenu === "알람 설정" ? "text-[#3BB1E1] [font-weight:700]" : "text-[#727171] group-hover:text-[#3BB1E1]"}`}
              >
                알람 설정
              </p>
              {isSidebarOpen && getCount("알람 설정") > 0 && (
                <span className="ml-auto shrink-0 size-[17px] rounded-full bg-[#3BB1E1] flex items-center justify-center text-[10px] text-white">
                  {getCount("알람 설정")}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Divider line below SUB */}
        {/* <div className="absolute h-0 left-0 top-[585.54px] w-[188px]">
          <div className="absolute inset-[-1px_0_0_0]">
            <svg
              className="block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 188 1"
            >
              <line
                id="Line 3"
                stroke="var(--stroke-0, #EEEEEE)"
                x2="188"
                y1="0.5"
                y2="0.5"
              />
            </svg>
          </div>
        </div> */}

        {isSidebarOpen && (
          <button
            onClick={onOpenDemoDateTime}
            className="absolute left-[20px] bottom-[28px] w-[148px] rounded-[16px] border border-[#dfe4e8] bg-[#f7f8f9] px-[12px] py-[10px] text-left cursor-pointer hover:bg-[#f2f4f6] transition-colors"
            title={`기준 일자 및 시간 설정 (${demoDateTime.date} ${demoDateTime.time})`}
            aria-label="기준 일자 및 시간 설정"
          >
            <div className="flex items-start gap-[10px]">
              <div className="mt-[2px] flex size-[24px] shrink-0 items-center justify-center rounded-[10px] bg-white border border-[#e6eaed]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 1.2V2.4M9 1.2V2.4M1.8 4.2H10.2M2.64 2.04H9.36C10.0231 2.04 10.56 2.57686 10.56 3.24V9.36C10.56 10.0231 10.0231 10.56 9.36 10.56H2.64C1.97686 10.56 1.44 10.0231 1.44 9.36V3.24C1.44 2.57686 1.97686 2.04 2.64 2.04Z"
                    stroke="#606060"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-[#555] leading-[14px]">
                  기준 일자 및 시간
                </p>
                <p className="mt-[2px] text-[11px] font-bold text-[#222] leading-[14px]">
                  {demoDateTime.date} {demoDateTime.time}
                </p>
                <p className="mt-[2px] text-[9px] text-[#888] leading-[14px]">
                  눌러서 시연 기준값 변경
                </p>
              </div>
            </div>
          </button>
        )}
      </div>
      {/* ─── End LNB Sidebar ─── */}

      {/* ─── Hamburger toggle button (always visible, next to logo) ─── */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-[28px] z-20 cursor-pointer hover:opacity-100 transition-all duration-300 rounded-[4px]"
        style={{ left: isSidebarOpen ? `${sidebarW - 30}px` : "10px" }}
        aria-label="사이드바 토글"
      >
        <img src={sideMenu} alt="" className="size-full" />
      </button>
    </>
  );
}
