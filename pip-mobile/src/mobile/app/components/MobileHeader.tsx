import { useState } from "react";
import mb_logo from "../../assets/mb_logo.svg";
import type { MobileStore } from "@/mobile/types";

interface MobileHeaderProps {
  stores: MobileStore[];
  selectedStoreId: string;
  onSelectStore: (id: string) => void;
  notificationCount: number;
  onBellClick?: () => void;
  onBack?: () => void;
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function MobileHeader({
  stores,
  selectedStoreId,
  onSelectStore,
  notificationCount,
  onBellClick,
  onBack,
  title,
  rightSlot,
}: MobileHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = stores.find((s) => s.id === selectedStoreId) ?? null;

  if (title) {
    return (
      <header className="bg-white border-b border-[#ebebeb] flex items-center justify-between gap-[10px] px-[20px] py-[14px] relative">
        <div className="flex items-center gap-[10px] min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="뒤로 가기"
              className="flex items-center justify-center w-[20px] h-[20px] cursor-pointer"
            >
              <svg width="8" height="14" viewBox="0 0 7 12" fill="none">
                <path
                  d="M6 1L1 6L6 11"
                  stroke="#111"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <h1 className="text-[#111] text-[16px] font-bold leading-[20px] truncate">
            {title}
          </h1>
        </div>
        {rightSlot && <div className="flex items-center shrink-0">{rightSlot}</div>}
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-[#ebebeb] flex items-center justify-between px-[20px] py-[14px] relative">
      <div className="flex items-center gap-[8px]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로 가기"
            className="flex items-center justify-center w-[20px] h-[20px] cursor-pointer"
          >
            <svg width="8" height="14" viewBox="0 0 7 12" fill="none">
              <path
                d="M6 1L1 6L6 11"
                stroke="#111"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-[8px]"
        >
          <div className="flex items-center justify-center w-[32px] h-[20px]">
            <img src={mb_logo} alt="" />
          </div>
          <span className="text-[#111] text-[15px] font-bold leading-[20px]">
            {selected?.name ?? ""}
          </span>
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            <path d="M1 1L5 5L9 1" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <ul className="absolute left-[16px] top-[48px] z-50 w-[160px] bg-white rounded-[14px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
            {stores.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectStore(s.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-[20px] py-[12px] text-[14px] ${
                    s.id === selectedStoreId
                      ? "text-[#38a9d7] font-bold"
                      : "text-[#111]"
                  } ${i < stores.length - 1 ? "border-b border-[#f0f0f0]" : ""}`}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="relative" onClick={onBellClick} aria-label="알림 열기">
        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="20" viewBox="0 0 19 20" fill="none">
<path opacity="0.2" d="M16.173 15.7894H1.99792C1.87387 15.7886 1.75219 15.7553 1.64504 15.6929C1.53788 15.6304 1.44902 15.5409 1.38731 15.4333C1.32561 15.3257 1.29324 15.2038 1.29343 15.0798C1.29362 14.9558 1.32636 14.834 1.38839 14.7266C1.97223 13.7169 2.70667 11.8756 2.70667 8.70399C2.70667 7.01274 3.37872 5.39077 4.57498 4.19488C5.77123 2.99899 7.3937 2.32714 9.08547 2.32714C10.7772 2.32714 12.3997 2.99899 13.596 4.19488C14.7922 5.39077 15.4643 7.01274 15.4643 8.70399C15.4643 11.8765 16.1996 13.7169 16.7843 14.7266C16.8464 14.8341 16.8792 14.956 16.8793 15.0802C16.8794 15.2044 16.8469 15.3264 16.7849 15.434C16.723 15.5417 16.6339 15.6311 16.5265 15.6935C16.4191 15.7559 16.2972 15.7889 16.173 15.7894Z" fill="#A1A1A1"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M11.9195 17.7146C12.1604 17.7146 12.3916 17.8109 12.562 17.9812C12.7325 18.1516 12.8286 18.3828 12.8286 18.6238C12.8286 18.8646 12.7324 19.0961 12.562 19.2664C12.3917 19.4364 12.1602 19.532 11.9195 19.532H6.24954C6.00879 19.5319 5.77727 19.4365 5.60697 19.2664C5.43672 19.0961 5.34046 18.8646 5.34036 18.6238C5.34036 18.383 5.43675 18.1516 5.60697 17.9812C5.77729 17.8109 6.00871 17.7147 6.24954 17.7146H11.9195ZM9.0845 1.41871C11.0172 1.41871 12.8712 2.18633 14.2378 3.5525C15.6044 4.91872 16.3725 6.77175 16.3726 8.70386C16.3726 11.0102 16.793 12.9296 17.5689 14.2664H17.5679C17.7111 14.5119 17.7876 14.7907 17.7886 15.075C17.7896 15.3592 17.7153 15.639 17.5738 15.8855C17.4322 16.132 17.228 16.3377 16.982 16.4802C16.7361 16.6226 16.4565 16.6978 16.1724 16.698H1.99661C1.71253 16.6974 1.43271 16.6219 1.18704 16.4793C0.941513 16.3366 0.737462 16.1309 0.596223 15.8845C0.455125 15.6382 0.38134 15.3588 0.382356 15.075C0.38342 14.791 0.459101 14.5117 0.602082 14.2664L0.743684 14.0095C1.42783 12.6895 1.79738 10.867 1.79739 8.70386C1.79744 6.77192 2.56483 4.91868 3.93118 3.5525C5.29775 2.18635 7.15193 1.41884 9.0845 1.41871ZM9.0845 3.23609C7.63393 3.23623 6.24204 3.81226 5.21634 4.83765C4.19092 5.86307 3.61482 7.25393 3.61478 8.70386C3.61476 11.1837 3.18947 13.263 2.33646 14.8806H15.8326C14.9782 13.2622 14.5542 11.1828 14.5542 8.70386C14.5542 7.25376 13.9783 5.8631 12.9527 4.83765C11.9269 3.81224 10.5352 3.23609 9.0845 3.23609ZM3.96927 0.0134326C4.08692 -0.00722822 4.20814 -0.00374603 4.32474 0.0222217C4.4414 0.0483001 4.55218 0.09698 4.64993 0.165776C4.74777 0.234688 4.83115 0.322416 4.89505 0.423589C4.95893 0.524784 5.00186 0.637663 5.022 0.75562C5.04213 0.873582 5.03893 0.994437 5.01224 1.11109C4.98553 1.22757 4.93605 1.33796 4.86673 1.43531C4.79755 1.53228 4.70892 1.61431 4.60794 1.6775C3.37468 2.46194 2.37553 3.56514 1.71536 4.8689L1.71439 4.87085C1.63779 5.01841 1.52246 5.14285 1.3804 5.22925C1.2384 5.31553 1.07489 5.36094 0.908723 5.36109H0.907746C0.752064 5.36088 0.598127 5.3212 0.462434 5.24488C0.326748 5.16844 0.213276 5.05763 0.132356 4.92457C0.0514553 4.79148 0.00591491 4.63978 0.000519657 4.48414C-0.00478669 4.32862 0.0306486 4.17412 0.102082 4.03589H0.101106C0.913736 2.44809 2.13451 1.10465 3.63724 0.143315V0.142339C3.73799 0.078027 3.85156 0.0342272 3.96927 0.0134326ZM13.8443 0.0222217C13.961 -0.00383107 14.0829 -0.0072568 14.2007 0.0134326C14.2888 0.028987 14.3741 0.0581072 14.4536 0.0983936L14.5318 0.142339V0.143315C15.9407 1.04456 17.1014 2.28146 17.9107 3.74097L18.0679 4.03589L18.0699 4.0398C18.173 4.25281 18.1894 4.49783 18.1148 4.72242C18.0401 4.94675 17.8803 5.13309 17.6704 5.24195C17.4604 5.35066 17.2152 5.37386 16.9888 5.30542C16.7625 5.23685 16.5711 5.08263 16.4566 4.87574L16.4536 4.8689C15.7934 3.56498 14.7936 2.46291 13.5601 1.67847V1.6775C13.4595 1.61433 13.3712 1.53207 13.3023 1.43531C13.233 1.33795 13.1834 1.22757 13.1568 1.11109C13.1301 0.994496 13.1269 0.873526 13.147 0.75562C13.1671 0.637792 13.2102 0.524697 13.274 0.423589C13.3378 0.322525 13.4214 0.234666 13.5191 0.165776C13.6167 0.0970043 13.7277 0.0483534 13.8443 0.0222217Z" fill="#A1A1A1"/>
</svg>
        {notificationCount > 0 && (
          <span className="absolute -top-[4px] -right-[4px] bg-[#3AAEDD] text-white text-[9px] font-bold rounded-full w-[14px] h-[14px] flex items-center justify-center">
            {notificationCount}
          </span>
        )}
      </button>
    </header>
  );
}
