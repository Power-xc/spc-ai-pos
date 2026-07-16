import { useState, useEffect } from "react";
import type { NoticeItem } from "@/mobile/types";
import { getMobileNotices } from "@/mobile/lib/api";

export default function NoticeBar() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    getMobileNotices().then(setNotices);
  }, []);

  useEffect(() => {
    if (notices.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % notices.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [notices.length]);

  if (notices.length === 0) return null;

  return (
    <div className="bg-white border-t border-b border-[#dfdfdf] flex items-center justify-between px-[20px] py-[8px]">
      <div className="flex items-center gap-[7px] flex-1 min-w-0">
        <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
          <path d="M6.5 0L8.5 4.5L13 5.2L9.75 8.3L10.5 13L6.5 10.8L2.5 13L3.25 8.3L0 5.2L4.5 4.5L6.5 0Z" fill="#ff8c00" />
        </svg>
        <span className="text-[#5b5b5b] text-[12px] leading-[21px] truncate">
          {notices[current]?.text}
        </span>
      </div>
      <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
        <path d="M1 1L5 5L1 9" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
