import { useState } from "react";

interface ChatItem {
  id: string;
  title: string;
  preview: string;
  time: string;
  unread?: number;
  dimmed?: boolean;
}

const CHAT_ITEMS: ChatItem[] = [
  {
    id: "c1",
    title: "오늘 재고 현황",
    preview: "도넛 재고가 부족해요. 내일 발주를...",
    time: "10분 전",
    unread: 2,
  },
  {
    id: "c2",
    title: "이번 주 매출 분석",
    preview: "전주 대비 12% 상승했어요",
    time: "어제",
    dimmed: true,
  },
  {
    id: "c3",
    title: "AI 발주 추천",
    preview: "내일 발주 목록을 정리해드렸어요",
    time: "3일전",
    dimmed: true,
  },
];

const QUICK_BUTTONS = ["매장", "발주", "한눈에", "채팅", "분석", "기타"];

function PipAiBird({ color = "#38a9d7" }: { color?: string }) {
  return (
    <svg width="22" height="20" viewBox="0 0 13.5 12" fill="none">
      <path
        d="M12.9408 2.28111L11.1299 4.09196C10.7641 8.33264 7.18784 11.6285 2.9078 11.6285C2.02842 11.6285 1.30347 11.4892 0.752942 11.2143C0.309009 10.992 0.127318 10.754 0.0818953 10.6862C0.0413929 10.6254 0.0151406 10.5563 0.0051001 10.484C-0.00494041 10.4117 0.00149054 10.338 0.0239122 10.2686C0.0463338 10.1991 0.0841663 10.1356 0.134583 10.0828C0.185 10.03 0.246698 9.98923 0.315066 9.96362C0.330812 9.95757 1.78313 9.39978 2.70552 8.33809C2.19399 7.91752 1.74745 7.42364 1.38038 6.87245C0.629392 5.75747 -0.211234 3.82064 0.0479795 0.926295C0.0561958 0.834326 0.0905207 0.74662 0.146912 0.673505C0.203303 0.60039 0.279413 0.544911 0.366277 0.513602C0.453142 0.482292 0.547145 0.476456 0.637215 0.49678C0.727286 0.517105 0.809673 0.562743 0.874675 0.628321C0.895873 0.649518 2.89024 2.63298 5.32854 3.27617V2.90734C5.32761 2.52057 5.40408 2.13753 5.55344 1.78077C5.7028 1.42401 5.92203 1.10074 6.19823 0.829998C6.46647 0.56214 6.78564 0.350722 7.13691 0.208216C7.48818 0.0657112 7.86443 -0.0049935 8.24347 0.000274099C8.75194 0.00528934 9.25046 0.141783 9.69056 0.396485C10.1307 0.651188 10.4974 1.01543 10.7551 1.45381H12.598C12.6939 1.45373 12.7876 1.4821 12.8674 1.53534C12.9471 1.58857 13.0093 1.66427 13.046 1.75285C13.0827 1.84143 13.0923 1.93891 13.0736 2.03294C13.0548 2.12698 13.0086 2.21335 12.9408 2.28111Z"
        fill={color}
      />
    </svg>
  );
}

function ChatListItem({ item }: { item: ChatItem }) {
  return (
    <div
      className="bg-white border border-[#efefef] rounded-[20px] shadow-[0px_1px_2px_0px_rgba(216,216,216,0.25)] p-[15px] flex items-center justify-between w-full"
      style={{ opacity: item.dimmed ? 0.5 : 1 }}
    >
      <div className="flex items-center gap-[6px]">
        <div
          className="relative rounded-[14px] shrink-0 size-[42px] flex items-center justify-center"
          style={{
            background: "linear-gradient(90deg, rgba(56,169,215,0.1) 0%, rgba(235,237,239,1) 100%)",
          }}
        >
          <PipAiBird />
          {item.unread != null && (
            <span
              className="absolute -top-[5px] -right-[5px] text-white text-[8px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full border-[1.5px] border-white"
              style={{
                background: "linear-gradient(92deg, #3faf60 50%, #3aaedd 122%)",
              }}
            >
              {item.unread}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-[2px]">
          <p className="text-[#222] text-[13px] font-bold leading-[20px]">{item.title}</p>
          <p className="text-[#636363] text-[10px] leading-[20px]">{item.preview}</p>
        </div>
      </div>

      <p
        className="text-[9px] leading-[20px] shrink-0 ml-[8px]"
        style={{ color: item.unread ? "#38a9d7" : "#888" }}
      >
        {item.time}
      </p>
    </div>
  );
}

function NewChatView({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f5f6f7] max-w-[390px] mx-auto" style={{ bottom: "80px" }}>
      {/* 헤더 */}
      <div className="bg-black flex items-center justify-between h-[44px] rounded-[20px] mx-[20px] mt-[16px] pl-[12px] pr-[8px] shrink-0">
        <div className="flex items-center gap-[8px]">
          <button onClick={onBack} className="flex items-center justify-center w-[28px] h-[28px] cursor-pointer">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path d="M7 1L1 7L7 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex items-center gap-[6px]">
            <div
              className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(90deg, rgba(56,169,215,0.2) 0%, rgba(235,237,239,0.3) 100%)",
              }}
            >
              <PipAiBird color="#fff" />
            </div>
            <div className="flex flex-col">
              <span className="text-white text-[13px] font-bold leading-[18px]">PIP AI 채팅</span>
              <span className="text-[#aaa] text-[9px] leading-[12px]">AI 어시스턴트</span>
            </div>
          </div>
        </div>
        <button className="flex items-center gap-[4px] bg-[rgba(240,241,243,0.2)] border border-[#dadada] rounded-[20px] h-[30px] px-[10px] text-white text-[12px] cursor-pointer">
          <span>+</span>
          <span>새 채팅</span>
        </button>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto px-[20px] py-[20px] flex flex-col gap-[12px]">
        {/* 시간 표시 */}
        <p className="text-center text-[9px] text-[#aaa]">오늘 오전 10:24</p>

        {/* AI 메시지 버블 */}
        <div className="flex items-start gap-[8px]">
          <div
            className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(90deg, rgba(56,169,215,0.15) 0%, rgba(235,237,239,1) 100%)",
            }}
          >
            <PipAiBird />
          </div>
          <div className="flex flex-col gap-[8px] max-w-[270px]">
            <div className="bg-white rounded-[16px] rounded-tl-[4px] px-[14px] py-[12px] shadow-[0px_1px_4px_0px_rgba(0,0,0,0.06)]">
              <p className="text-[#222] text-[12px] leading-[18px]">
                안녕하세요! 저는 <span className="font-bold text-[#38a9d7]">PIP AI</span>입니다.{"\n"}
                어떤 것을 도와드릴까요?
              </p>
            </div>

            {/* 빠른 선택 버튼 */}
            <div className="flex flex-wrap gap-[6px]">
              {QUICK_BUTTONS.map((label) => (
                <button
                  key={label}
                  className="px-[12px] h-[30px] rounded-full text-[11px] font-bold cursor-pointer border transition-colors"
                  style={{
                    backgroundColor: "#fff",
                    borderColor: "#e0e0e0",
                    color: "#444",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 입력창 */}
      <div className="shrink-0 px-[16px] py-[12px] bg-white border-t border-[#f0f0f0]">
        <div className="flex items-center gap-[8px] bg-[#f5f6f7] rounded-[24px] px-[14px] h-[42px]">
          <input
            type="text"
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-transparent text-[12px] text-[#222] placeholder-[#bbb] outline-none"
          />
          <button
            className="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #38a9d7 0%, #3faf60 100%)" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 11L11 1M11 1H4M11 1V8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PipAiPage() {
  const [showNewChat, setShowNewChat] = useState(false);

  return (
    <>
      <div className="bg-white min-h-screen px-[20px] pt-[16px] flex flex-col gap-[15px]">
        {/* 채팅 헤더 바 */}
        <div className="bg-black flex items-center justify-between h-[44px] rounded-[20px] pl-[20px] pr-[8px]">
          <span className="text-white text-[14px] font-bold leading-[21px]">채팅</span>
          <button
            onClick={() => setShowNewChat(true)}
            className="flex items-center gap-[4px] bg-[rgba(240,241,243,0.2)] border border-[#dadada] rounded-[20px] h-[30px] px-[10px] text-white text-[12px] cursor-pointer"
          >
            <span>+</span>
            <span>새 채팅</span>
          </button>
        </div>

        {/* 채팅 목록 */}
        <div className="flex flex-col gap-[7px]">
          {CHAT_ITEMS.map((item) => (
            <ChatListItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      {showNewChat && <NewChatView onBack={() => setShowNewChat(false)} />}
    </>
  );
}
