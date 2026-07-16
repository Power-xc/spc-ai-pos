import { useState, useRef, useEffect } from "react";

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

function ChatListItem({
  item,
  onClick,
}: {
  item: ChatItem;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-[#efefef] rounded-[20px] shadow-[0px_1px_2px_0px_rgba(216,216,216,0.25)] p-[15px] flex items-center justify-between w-full text-left cursor-pointer"
      style={{ opacity: item.unread ? 1 : 0.5 }}
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
    </button>
  );
}

type ChatMessage =
  | { id: string; kind: "ai-intro"; time: string }
  | { id: string; kind: "user"; text: string; time: string }
  | { id: string; kind: "ai-text"; text: string; time: string }
  | { id: string; kind: "ai-order"; time: string };

function AiAvatar() {
  return (
    <div
      className="rounded-[20px] shrink-0 size-[34px] flex items-center justify-center"
      style={{
        background:
          "linear-gradient(90deg, rgba(56,169,215,0.1) 0%, rgba(235,237,239,1) 100%)",
      }}
    >
      <PipAiBird />
    </div>
  );
}

function TimeLabel({
  time,
  align = "left",
}: {
  time: string;
  align?: "left" | "right";
}) {
  return (
    <p
      className="text-[#636363] text-[8px] leading-[20px]"
      style={{ textAlign: align }}
    >
      {time}
    </p>
  );
}

function AiTextBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#f5f5f5] rounded-[10px] rounded-tl-none p-[10px] text-[#111] text-[11px] font-medium leading-[1.5] self-start max-w-[240px]">
      {children}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="bg-[#38a9d7] rounded-[10px] rounded-br-[1px] p-[10px] text-white text-[11px] font-medium leading-[20px] self-end max-w-[240px] whitespace-pre-wrap">
      {text}
    </div>
  );
}

function OrderSummaryCard({
  onApprove,
  onEdit,
}: {
  onApprove?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-[7px] w-[220px]">
      <div className="relative w-full h-[182px] bg-[#f5f5f5] rounded-[10px]">
        {/* Header */}
        <div className="absolute top-[16.69px] left-[20px] right-[20px] flex justify-between">
          <span className="text-[10px] text-[#333] leading-none">ITEM</span>
          <span className="text-[10px] text-[#333] leading-none">AMOUNT</span>
        </div>
        {/* Top divider */}
        <div className="absolute top-[45px] left-[20px] w-[180px] h-px bg-[#d9d9d9]" />
        {/* Left column (labels) */}
        <div className="absolute top-[58.37px] left-[19.83px] flex flex-col gap-[10px] text-[12px] text-[#333] leading-none w-[34px]">
          <span>매출</span>
          <span>인건비</span>
          <span>재료비</span>
        </div>
        {/* Right column (amounts) */}
        <div className="absolute top-[58px] left-[118px] w-[82px] flex flex-col gap-[10px] text-[12px] text-[#333] text-right leading-none">
          <span>₩3,380,000</span>
          <span className="font-bold">- ₩608,400</span>
          <span className="font-bold">- ₩2,095,600</span>
        </div>
        {/* Bottom divider */}
        <div className="absolute top-[139px] left-[20px] w-[180px] h-px bg-[#d9d9d9]" />
        {/* Net income */}
        <span className="absolute top-[151px] left-[20px] text-[11px] font-bold text-black leading-none">
          순이익
        </span>
        <span className="absolute top-[148px] right-[20px] text-[15px] font-bold text-[#1f97d3] leading-none">
          ₩2,095,600
        </span>
      </div>

      {/* 승인 / 수정 */}
      <div className="flex gap-[10px] w-full">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 h-[36px] rounded-[10px] bg-[#38a9d7] text-white text-[11px] font-bold leading-[20px] cursor-pointer"
        >
          승인
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 h-[36px] rounded-[10px] bg-[#f5f5f5] text-black text-[11px] font-bold leading-[20px] cursor-pointer"
        >
          수정
        </button>
      </div>
    </div>
  );
}

function NewChatView({
  onBack,
  onNavigate,
  initialQuery,
}: {
  onBack: () => void;
  onNavigate: (tab: string, initMode?: "approve" | "edit" | null) => void;
  initialQuery?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "ai-intro", kind: "ai-intro", time: "오후 09시:45" },
  ]);
  const [flowStarted, setFlowStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const pushLater = (delay: number, msg: ChatMessage) => {
    const id = window.setTimeout(() => {
      setMessages((prev) => [...prev, msg]);
    }, delay);
    timersRef.current.push(id);
  };

  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || flowStarted) return;
    setFlowStarted(true);
    const stamp = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `user-init-${stamp}`, kind: "user", text: q, time: "오후 10시:10" },
    ]);
    pushLater(700, {
      id: `ai-init-${stamp}`,
      kind: "ai-text",
      text: "곧 답변드릴게요. 잠시만요.",
      time: "오후 10시:10",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const startOrderFlow = () => {
    if (flowStarted) return;
    setFlowStarted(true);

    setMessages((prev) => [
      ...prev,
      { id: `user-pick-${Date.now()}`, kind: "user", text: "발주", time: "오후 10시:10" },
    ]);
    pushLater(700, {
      id: `ai-q-${Date.now()}`,
      kind: "ai-text",
      text: "어떤 점이 궁금하신가요?",
      time: "오후 10시:10",
    });
    pushLater(1600, {
      id: `user-req-${Date.now()}`,
      kind: "user",
      text: "오늘 필요한 발주서 작성해줘",
      time: "오후 10시:22",
    });
    pushLater(2600, {
      id: `ai-order-${Date.now()}`,
      kind: "ai-order",
      time: "오후 10시:23",
    });
  };

  const handleQuickPick = (label: string) => {
    if (label === "발주") startOrderFlow();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-white max-w-[390px] mx-auto"
      style={{
        bottom: "80px",
        fontFamily: '"Spoqa Han Sans Neo", "Pretendard", sans-serif',
      }}
    >
      {/* 헤더 */}
      <div className="bg-white border-t border-b border-[#ebebeb] flex items-center justify-between px-[20px] py-[20px] shrink-0">
        <div className="flex items-center gap-[20px]">
          <button
            onClick={onBack}
            className="flex items-center justify-center cursor-pointer"
            aria-label="뒤로 가기"
          >
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path
                d="M6 1L1 6L6 11"
                stroke="#111"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex items-center gap-[7px]">
            <div
              className="relative rounded-[20px] shrink-0 size-[42px] flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(90deg, rgba(56,169,215,0.1) 0%, rgba(235,237,239,1) 100%)",
              }}
            >
              <PipAiBird />
            </div>
            <div className="flex flex-col gap-[3px]">
              <p className="text-[#111] text-[15px] font-bold leading-[20px]">
                PIP AI 채팅
              </p>
              <p className="text-[#636363] text-[10px] leading-[20px]">
                안녕하세요. 어떤 점이 궁금하신가요?
              </p>
            </div>
          </div>
        </div>
        <button className="flex items-center justify-center gap-[4px] bg-[rgba(240,241,243,0.2)] border border-[#dadada] rounded-[20px] h-[30px] px-[8px] py-[6px] text-black text-[12px] cursor-pointer shrink-0">
          <span>+</span>
          <span>새 채팅</span>
        </button>
      </div>

      {/* 채팅 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-[20px] pt-[20px] pb-[24px] flex flex-col gap-[14px] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {messages.map((msg) => {
          if (msg.kind === "user") {
            return (
              <div
                key={msg.id}
                className="flex flex-col gap-[3px] items-end self-end"
              >
                <UserBubble text={msg.text} />
                <TimeLabel time={msg.time} align="right" />
              </div>
            );
          }

          if (msg.kind === "ai-text") {
            return (
              <div key={msg.id} className="flex items-start gap-[8px]">
                <AiAvatar />
                <div className="flex flex-col gap-[3px] items-start">
                  <AiTextBubble>{msg.text}</AiTextBubble>
                  <TimeLabel time={msg.time} align="left" />
                </div>
              </div>
            );
          }

          if (msg.kind === "ai-order") {
            return (
              <div key={msg.id} className="flex items-start gap-[8px]">
                <AiAvatar />
                <div className="flex flex-col gap-[7px] items-start">
                  <AiTextBubble>
                    <p className="mb-0">오늘 기준 AI 추천 발주서를 작성했어요.</p>
                    <p>확인 후 승인해주세요.</p>
                  </AiTextBubble>
                  <OrderSummaryCard
                    onApprove={() => onNavigate("발주", "approve")}
                    onEdit={() => onNavigate("발주", "edit")}
                  />
                  <TimeLabel time={msg.time} align="left" />
                </div>
              </div>
            );
          }

          // ai-intro
          return (
            <div key={msg.id} className="flex items-start gap-[8px]">
              <AiAvatar />
              <div className="flex flex-col gap-[3px] items-end">
                <div className="bg-[#f5f5f5] rounded-[10px] rounded-tl-none p-[10px] flex flex-col gap-[10px] items-center">
                  <div className="text-[#111] text-[11px] font-medium leading-[1.5] self-stretch">
                    <p className="mb-0">안녕하세요! PIP AI입니다.</p>
                    <p>오늘 매장 운영을 어떻게 도와드릴까요? 😊</p>
                  </div>
                  <div className="flex flex-col gap-[10px] items-start">
                    {QUICK_BUTTONS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleQuickPick(label)}
                        disabled={flowStarted}
                        className="bg-white rounded-[3px] w-[185px] h-[36px] flex items-center justify-center cursor-pointer disabled:cursor-default"
                      >
                        <span className="text-[#636363] text-[11px] font-bold leading-[20px]">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <TimeLabel time={msg.time} align="right" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-[6px]">
      <span className="bg-[#eef0f2] text-[#777] text-[10px] px-[10px] py-[3px] rounded-full leading-none">
        {label}
      </span>
    </div>
  );
}

interface InventoryRow {
  name: string;
  current: number;
  safety: number;
}

const INVENTORY_ROWS: InventoryRow[] = [
  { name: "글레이즈드", current: 12, safety: 30 },
  { name: "초코 글레이즈드", current: 8, safety: 25 },
  { name: "딸기 글레이즈드", current: 5, safety: 20 },
];

function InventoryStatusCard() {
  const totalShort = INVENTORY_ROWS.reduce(
    (sum, r) => sum + Math.max(0, r.safety - r.current),
    0,
  );

  return (
    <div className="relative w-[220px] h-[182px] bg-[#f5f5f5] rounded-[10px]">
      {/* Header */}
      <div className="absolute top-[16.69px] left-[20px] right-[20px] flex justify-between">
        <span className="text-[10px] text-[#333] leading-none">ITEM</span>
        <span className="text-[10px] text-[#333] leading-none">재고 / 안전</span>
      </div>
      {/* Top divider */}
      <div className="absolute top-[45px] left-[20px] w-[180px] h-px bg-[#d9d9d9]" />
      {/* Left column (items) */}
      <div className="absolute top-[58px] left-[20px] flex flex-col gap-[10px] text-[12px] text-[#333] leading-none">
        {INVENTORY_ROWS.map((r) => (
          <span key={r.name}>{r.name}</span>
        ))}
      </div>
      {/* Right column (stock) */}
      <div className="absolute top-[58px] right-[20px] flex flex-col gap-[10px] text-[12px] leading-none text-right">
        {INVENTORY_ROWS.map((r) => (
          <span key={r.name} className="font-bold text-[#e74c3c]">
            {r.current}
            <span className="text-[#999] font-normal"> / {r.safety}</span>
          </span>
        ))}
      </div>
      {/* Bottom divider */}
      <div className="absolute top-[139px] left-[20px] w-[180px] h-px bg-[#d9d9d9]" />
      {/* Shortage total */}
      <span className="absolute top-[151px] left-[20px] text-[11px] font-bold text-black leading-none">
        부족 수량
      </span>
      <span className="absolute top-[148px] right-[20px] text-[15px] font-bold text-[#1f97d3] leading-none">
        {totalShort}개
      </span>
    </div>
  );
}

type InventoryMessage =
  | { id: string; kind: "date"; label: string }
  | { id: string; kind: "ai-text"; text: string; time: string }
  | { id: string; kind: "ai-inventory"; intro: string; time: string }
  | {
      id: string;
      kind: "ai-prompt";
      text: string;
      time: string;
      buttons: string[];
    }
  | { id: string; kind: "user"; text: string; time: string };

const INVENTORY_INITIAL: InventoryMessage[] = [
  { id: "d1", kind: "date", label: "어제" },
  {
    id: "m1",
    kind: "ai-text",
    text: "안녕하세요! 오늘의 재고 현황을 확인해드렸어요.",
    time: "오후 02:30",
  },
  {
    id: "m2",
    kind: "ai-inventory",
    intro: "도넛 3종의 재고가 안전 수량보다 부족해요.",
    time: "오후 02:30",
  },
  {
    id: "m3",
    kind: "ai-text",
    text: "도넛 재고가 부족해요.\n내일 발주를 넣는 걸 추천드려요.",
    time: "오후 02:31",
  },
  { id: "d2", kind: "date", label: "오늘" },
  {
    id: "m4",
    kind: "ai-text",
    text: "아침 판매량이 평소 대비 30% 증가했어요. 📈",
    time: "오전 07:28",
  },
  {
    id: "m5",
    kind: "ai-prompt",
    text: "추가 발주를 진행할까요?",
    time: "오전 07:30",
    buttons: ["네, 진행해줘", "아니오, 나중에"],
  },
];

function InventoryChatView({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<InventoryMessage[]>(INVENTORY_INITIAL);
  const [promptAnswered, setPromptAnswered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handlePromptReply = (label: string) => {
    if (promptAnswered) return;
    setPromptAnswered(true);

    const nowTime = "오전 07:31";
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, kind: "user", text: label, time: nowTime },
    ]);

    const replyText =
      label === "네, 진행해줘"
        ? "네! AI 추천 수량으로 발주서를 작성해드릴게요.\n잠시만 기다려 주세요."
        : "알겠습니다. 재고 상황에 변동이 생기면 다시 알려드릴게요.";

    const id = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          kind: "ai-text",
          text: replyText,
          time: "오전 07:31",
        },
      ]);
    }, 700);
    timersRef.current.push(id);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-white max-w-[390px] mx-auto"
      style={{
        bottom: "80px",
        fontFamily: '"Spoqa Han Sans Neo", "Pretendard", sans-serif',
      }}
    >
      {/* 헤더 */}
      <div className="bg-white border-t border-b border-[#ebebeb] flex items-center justify-between px-[20px] py-[20px] shrink-0">
        <div className="flex items-center gap-[20px]">
          <button
            onClick={onBack}
            className="flex items-center justify-center cursor-pointer"
            aria-label="뒤로 가기"
          >
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path
                d="M6 1L1 6L6 11"
                stroke="#111"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex items-center gap-[7px]">
            <div
              className="relative rounded-[20px] shrink-0 size-[42px] flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(90deg, rgba(56,169,215,0.1) 0%, rgba(235,237,239,1) 100%)",
              }}
            >
              <PipAiBird />
            </div>
            <div className="flex flex-col gap-[3px]">
              <p className="text-[#111] text-[15px] font-bold leading-[20px]">
                오늘 재고 현황
              </p>
              <p className="text-[#636363] text-[10px] leading-[20px]">
                PIP AI · 도넛 재고 알림
              </p>
            </div>
          </div>
        </div>
        <button className="flex items-center justify-center gap-[4px] bg-[rgba(240,241,243,0.2)] border border-[#dadada] rounded-[20px] h-[30px] px-[8px] py-[6px] text-black text-[12px] cursor-pointer shrink-0">
          <span>+</span>
          <span>새 채팅</span>
        </button>
      </div>

      {/* 채팅 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-[20px] pt-[20px] pb-[24px] flex flex-col gap-[14px] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {messages.map((msg) => {
          if (msg.kind === "date") {
            return <DateDivider key={msg.id} label={msg.label} />;
          }

          if (msg.kind === "user") {
            return (
              <div
                key={msg.id}
                className="flex flex-col gap-[3px] items-end self-end"
              >
                <UserBubble text={msg.text} />
                <TimeLabel time={msg.time} align="right" />
              </div>
            );
          }

          if (msg.kind === "ai-text") {
            return (
              <div key={msg.id} className="flex items-start gap-[8px]">
                <AiAvatar />
                <div className="flex flex-col gap-[3px] items-start">
                  <AiTextBubble>
                    {msg.text.split("\n").map((line, i) => (
                      <p key={i} className={i === 0 ? "mb-0" : undefined}>
                        {line}
                      </p>
                    ))}
                  </AiTextBubble>
                  <TimeLabel time={msg.time} align="left" />
                </div>
              </div>
            );
          }

          if (msg.kind === "ai-inventory") {
            return (
              <div key={msg.id} className="flex items-start gap-[8px]">
                <AiAvatar />
                <div className="flex flex-col gap-[7px] items-start">
                  <AiTextBubble>{msg.intro}</AiTextBubble>
                  <InventoryStatusCard />
                  <TimeLabel time={msg.time} align="left" />
                </div>
              </div>
            );
          }

          // ai-prompt
          return (
            <div key={msg.id} className="flex items-start gap-[8px]">
              <AiAvatar />
              <div className="flex flex-col gap-[7px] items-start">
                <AiTextBubble>{msg.text}</AiTextBubble>
                <div className="flex gap-[8px] w-[220px]">
                  {msg.buttons.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handlePromptReply(label)}
                      disabled={promptAnswered}
                      className="flex-1 h-[36px] rounded-[10px] text-[11px] font-bold leading-[20px] cursor-pointer disabled:cursor-default disabled:opacity-60"
                      style={{
                        background: idx === 0 ? "#38a9d7" : "#f5f5f5",
                        color: idx === 0 ? "#fff" : "#333",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <TimeLabel time={msg.time} align="left" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PipAiPage({
  onNavigate,
  initialQuery,
  onConsumeInitialQuery,
}: {
  onNavigate?: (tab: string, initMode?: "approve" | "edit" | null) => void;
  initialQuery?: string;
  onConsumeInitialQuery?: () => void;
} = {}) {
  const [chatItems, setChatItems] = useState<ChatItem[]>(CHAT_ITEMS);
  const [activeChat, setActiveChat] = useState<"new" | "inventory" | null>(null);
  const [newChatQuery, setNewChatQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q) return;
    setNewChatQuery(q);
    setActiveChat("new");
    onConsumeInitialQuery?.();
  }, [initialQuery, onConsumeInitialQuery]);

  const openChat = (id: string) => {
    setChatItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: undefined } : c)),
    );
    if (id === "c1") setActiveChat("inventory");
  };

  return (
    <>
      <div className="bg-white px-[20px] pt-[16px] pb-[24px] flex flex-col gap-[15px]">
        {/* 채팅 헤더 바 */}
        <div className="bg-black flex items-center justify-between h-[44px] rounded-[20px] pl-[20px] pr-[8px]">
          <span className="text-white text-[14px] font-bold leading-[21px]">채팅</span>
          <button
            onClick={() => {
              setNewChatQuery(undefined);
              setActiveChat("new");
            }}
            className="flex items-center gap-[4px] bg-[rgba(240,241,243,0.2)] border border-[#dadada] rounded-[20px] h-[30px] px-[10px] text-white text-[12px] cursor-pointer"
          >
            <span>+</span>
            <span>새 채팅</span>
          </button>
        </div>

        {/* 채팅 목록 */}
        <div className="flex flex-col gap-[7px]">
          {chatItems.map((item) => (
            <ChatListItem
              key={item.id}
              item={item}
              onClick={() => openChat(item.id)}
            />
          ))}
        </div>
      </div>

      {activeChat === "new" && (
        <NewChatView
          key={newChatQuery ?? "blank"}
          initialQuery={newChatQuery}
          onBack={() => {
            setActiveChat(null);
            setNewChatQuery(undefined);
          }}
          onNavigate={(tab, initMode) => {
            setActiveChat(null);
            setNewChatQuery(undefined);
            onNavigate?.(tab, initMode);
          }}
        />
      )}
      {activeChat === "inventory" && (
        <InventoryChatView onBack={() => setActiveChat(null)} />
      )}
    </>
  );
}
