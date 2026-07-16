import { useState, useEffect } from "react";
import type { PipAiAlert } from "@/mobile/types";
import { getPipAiAlert } from "@/mobile/lib/api";

export default function PipAiCard() {
  const [alert, setAlert] = useState<PipAiAlert | null>(null);

  useEffect(() => {
    getPipAiAlert().then(setAlert);
  }, []);

  if (!alert)
    return (
      <div className="h-[110px] bg-[#1f97d3] rounded-[20px] animate-pulse" />
    );

  return (
    <div
      className="rounded-[20px] px-[15px] py-[15px] relative overflow-hidden"
      style={{
        background: "linear-gradient(89deg, #008EE0 1.2%, #38A6D3 105.18%)",
      }}
    >
      <div className="relative z-10">
        <div className="flex items-center gap-[4px] mb-[6px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="11"
            viewBox="0 0 12 11"
            fill="none"
          >
            <path
              d="M11.3108 1.99377L9.72799 3.57653C9.40826 7.28304 6.28245 10.1638 2.54153 10.1638C1.77291 10.1638 1.13928 10.042 0.6581 9.80169C0.270086 9.60742 0.111281 9.39939 0.0715796 9.3401C0.036179 9.28701 0.0132335 9.22661 0.00445768 9.1634C-0.00431811 9.1002 0.00130279 9.03583 0.0209001 8.9751C0.0404975 8.91438 0.0735645 8.85886 0.117631 8.81271C0.161697 8.76656 0.215623 8.73097 0.275379 8.70858C0.289143 8.70329 1.55853 8.21576 2.36473 7.28781C1.91763 6.92022 1.52733 6.48854 1.20651 6.00678C0.550112 5.03225 -0.184626 3.33938 0.0419359 0.809617C0.0491172 0.729232 0.0791185 0.652574 0.128407 0.588669C0.177695 0.524764 0.244217 0.476273 0.32014 0.448907C0.396063 0.421542 0.478225 0.416441 0.55695 0.434205C0.635675 0.451969 0.707685 0.491858 0.764499 0.549176C0.783027 0.567703 2.52618 2.30133 4.65734 2.8635V2.54112C4.65653 2.20308 4.72337 1.86828 4.85392 1.55646C4.98446 1.24464 5.17608 0.962089 5.41749 0.72545C5.65194 0.491332 5.9309 0.306544 6.23793 0.181989C6.54495 0.057434 6.87381 -0.00436451 7.20511 0.000239573C7.64953 0.00462308 8.08525 0.123924 8.46992 0.346543C8.85459 0.569163 9.17511 0.887526 9.40032 1.27068H11.0111C11.0949 1.27061 11.1769 1.29542 11.2466 1.34194C11.3163 1.38847 11.3706 1.45463 11.4027 1.53206C11.4348 1.60948 11.4432 1.69468 11.4268 1.77687C11.4104 1.85906 11.37 1.93455 11.3108 1.99377Z"
              fill="white"
            />
          </svg>
          <span className="text-white text-[14px] font-bold leading-[21px]">
            PIP AI
          </span>
          <div className="w-[1px] h-[11px] bg-[#fff] mx-1"></div>
          <div className=" z-10">
            <span className="text-white text-[10px] block">오늘 날씨 영향</span>
          </div>
        </div>
        <p className="text-white text-[12px] font-[400] leading-[21px] whitespace-pre-line">
          {alert.message}
        </p>
      </div>
    </div>
  );
}
