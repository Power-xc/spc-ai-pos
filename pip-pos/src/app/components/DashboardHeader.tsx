import { useState } from "react";
import img3 from "../../assets/reset.svg";
import logo from "../../assets/ico-pos.svg";

interface DashboardHeaderProps {
  isAiPanelOpen: boolean;
  setIsAiPanelOpen: (isOpen: boolean) => void;
  isSidebarOpen: boolean;
  selectedMenu: string;
  headerLeft: number;
  topBtnsLeft: number;
  handleRefresh: () => void;
  isRefreshing: boolean;
}

export default function DashboardHeader({
  isAiPanelOpen,
  setIsAiPanelOpen,
  isSidebarOpen,
  selectedMenu,
  headerLeft,
  topBtnsLeft,
  handleRefresh,
  isRefreshing,
}: DashboardHeaderProps) {
  const [showReportModal, setShowReportModal] = useState(false);

  const handlePdfExport = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    // TODO: PDF 내용은 추후 추가
    doc.text("AI 리포트", 20, 20);
    doc.save("ai-report.pdf");
    setShowReportModal(false);
  };

  return (
    <>
      {/* ─── Main area white header bar ─── */}
      <div
        className="absolute bg-white h-[57.544px] top-0 left-0 transition-all duration-300"
        style={{
          width: isAiPanelOpen ? "807px" : "1024px",
        }}
      />

      {/* BRK POS title in header */}
      <div
        className="absolute flex gap-[15px] items-center top-[18.27px] transition-all duration-300"
        style={{ left: `${headerLeft}px` }}
      >
        <p className="[font-weight:800] flex items-center leading-[0] not-italic text-[#0f1f2f] text-[0px] whitespace-nowrap">
          <img src={logo} alt="" className="mr-3" />
          <span className="leading-[normal] text-[16.728px] mr-1">pos</span>
          <span className="leading-[normal] text-[16.728px] font-light">
            system
          </span>
        </p>
        <div className="flex h-[11.409px] items-center justify-center w-0">
          <div className="flex-none rotate-90">
            <div className="h-0 w-[11.409px]">
              <svg
                className="block size-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox="0 0 12.4091 1"
              >
                <path
                  d="M0.5 0.5H11.9091"
                  stroke="#9C9C9C"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal top divider */}
      <div
        className="absolute h-0 left-0 top-[57.54px] transition-all duration-300"
        style={{ width: isAiPanelOpen ? "807px" : "1024px" }}
      >
        <div className="absolute inset-[-1px_0_0_0]">
          <svg
            className="block size-full"
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 804 1"
          >
            <line
              id="Line 1"
              stroke="var(--stroke-0, #EBEBEB)"
              x2="804"
              y1="0.5"
              y2="0.5"
            />
          </svg>
        </div>
      </div>

      {/* Top action buttons (새로고침, AI 리포터 생성, PIP AI 챗봇) */}
      <div
        className="absolute content-stretch flex gap-[10px] items-center top-[13.77px] transition-all duration-300"
        style={{ left: `${topBtnsLeft}px ` }}
      >
        <div className="content-stretch flex gap-[10px] items-center relative shrink-0">
          <button
            onClick={handleRefresh}
            className="bg-[#f0f1f3] content-stretch flex gap-[8px] items-center justify-center px-[14px] py-[8px] relative rounded-[20px] shrink-0 cursor-pointer transition-opacity"
          >
            <div
              className={`relative shrink-0 size-[14.646px] transition-transform duration-1000 ${isRefreshing ? "rotate-[360deg]" : ""}`}
              data-name="Component 1"
            >
              <div className="absolute left-0 top-0" data-name="2">
                <img alt="" className="block max-w-none size-full" src={img3} />
              </div>
            </div>
            <p className="leading-[normal] not-italic relative shrink-0 text-[#9c9c9c] text-[12px] whitespace-nowrap font-normal">
              새로고침
            </p>
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="content-stretch flex items-center justify-center px-[14px] py-[8px] cursor-pointer relative rounded-[20px] shrink-0"
            style={{
              backgroundImage:
                "linear-gradient(82deg, #98D4EC -26.61%, #3CB4E5 15.47%, #3CB4E5 88.56%)",
            }}
          >
            <p className="[font-weight:700] leading-[normal] not-italic relative shrink-0 text-[12px] text-white whitespace-nowrap">
              AI 리포트 생성
            </p>
          </button>
        </div>
        <div
          className="flex h-[11.409px] items-center justify-center relative shrink-0 w-0"
          style={
            {
              "--transform-inner-width": "1185",
              "--transform-inner-height": "21",
            } as any
          }
        >
          <div className="flex-none rotate-90">
            <div className="h-0 relative w-[11.409px]">
              <div className="absolute inset-[-0.5px_-4.38%]">
                <svg
                  className="block size-full"
                  fill="none"
                  preserveAspectRatio="none"
                  viewBox="0 0 12.4091 1"
                >
                  <path
                    d="M0.5 0.5H11.9091"
                    id="Line 6"
                    stroke="var(--stroke-0, #9C9C9C)"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
          className="bg-[#30343b] content-stretch flex gap-[4px] items-center justify-center px-[14px] py-[8px] relative rounded-[20px] shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="12"
            viewBox="0 0 14 12"
            fill="none"
          >
            <path
              d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
              fill="#E8F1EA"
            />
          </svg>
          <p className="[font-weight:700] leading-[normal] not-italic relative shrink-0 text-[12px] text-[#e8f1ea] whitespace-nowrap">
            PIP AI BOT
          </p>
        </button>
      </div>
      {/* ── 리포트 내보내기 팝업 ── */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="bg-white rounded-[20px] w-[300px] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-[20px] pt-[20px] pb-[6px]">
              <div>
                <p className="font-bold text-[15px] text-[#222] leading-[22px]">
                  리포트 내보내기
                </p>
                <p className="text-[11px] text-[#888] leading-[18px]">
                  내보낼 형식을 선택해 주세요
                </p>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
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

            {/* 옵션 목록 */}
            <div className="flex flex-col gap-[10px] px-[16px] pt-[10px] pb-[16px]">
              {/* PDF 내보내기 */}
              <button
                onClick={handlePdfExport}
                className="flex items-center gap-[14px] bg-white border border-[#ebebeb] rounded-[14px] px-[14px] py-[12px] cursor-pointer hover:bg-[#f9f9f9] transition-colors w-full text-left"
              >
                <div
                  className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#fce8e6" }}
                >
                  <span
                    className="font-bold text-[13px]"
                    style={{ color: "#ff522c" }}
                  >
                    PDF
                  </span>
                </div>
                <div>
                  <p className="font-bold text-[12px] text-[#222] leading-[18px]">
                    PDF로 내보내기
                  </p>
                  <p className="text-[10px] text-[#888] leading-[16px]">
                    문서 파일로 저장합니다
                  </p>
                </div>
              </button>

              {/* 카카오톡 내보내기 */}
              <button
                className="flex items-center gap-[14px] rounded-[14px] px-[14px] py-[12px] cursor-pointer hover:opacity-90 transition-opacity w-full text-left"
                style={{ backgroundColor: "#FEE500" }}
              >
                <div className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center shrink-0 bg-[rgba(0,0,0,0.08)]">
                  <svg width="22" height="20" viewBox="0 0 22 20" fill="none">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M11 0C4.925 0 0 3.857 0 8.614c0 3.047 1.97 5.718 4.944 7.26L3.71 19.49a.4.4 0 0 0 .578.44l4.87-3.076A13.4 13.4 0 0 0 11 17.23c6.075 0 11-3.857 11-8.615C22 3.857 17.075 0 11 0Z"
                      fill="#3A1D1D"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-[12px] text-[#3A1D1D] leading-[18px]">
                    카카오톡으로 내보내기
                  </p>
                  <p className="text-[10px] text-[#3A1D1D] opacity-60 leading-[16px]">
                    모바일로 간편하게 전송합니다
                  </p>
                </div>
              </button>
            </div>

            {/* 하단 안내 */}
            <div className="border-t border-[#f0f1f3] px-[16px] py-[10px]">
              <p className="text-[9px] text-[#aaa] text-center leading-[14px]">
                AI 리포트는 최근 24시간 데이터를 기준으로 생성됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
