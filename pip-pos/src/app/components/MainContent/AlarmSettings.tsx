import { useState, useEffect } from "react";
import ContentWrapper from "./ContentWrapper";
import {
  getAlarmCards,
  getAlarmHistory,
  getKakaoAlarmConfig,
} from "../../../lib/api";
import type {
  AlarmCard,
  AlarmHistoryItem,
  KakaoAlarmConfig,
  AlarmCategory,
  AlarmFilterTab,
} from "../../../types";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

const FILTER_TABS: AlarmFilterTab[] = [
  "전체",
  "재고",
  "배송",
  "Agent",
  "배달",
  "고객",
];

const CATEGORY_STYLE: Record<AlarmCategory, { bg: string; color: string }> = {
  재고: { bg: "#fff3e0", color: "#e07820" },
  배송: { bg: "#eaf6ff", color: "#3aaedd" },
  Agent: { bg: "#f3eafe", color: "#7c3cbf" },
  배달: { bg: "#fde8f0", color: "#d0327a" },
  고객: { bg: "#e6f8ee", color: "#2a9a5a" },
};

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className="relative inline-flex w-[36px] h-[20px] rounded-full transition-colors duration-200 cursor-pointer shrink-0"
      style={{ backgroundColor: enabled ? "#3faf60" : "#d1d5db" }}
    >
      <span
        className="absolute top-[2px] w-[16px] h-[16px] bg-white rounded-full shadow transition-transform duration-200"
        style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export default function AlarmSettings({
  isAiPanelOpen,
  isSidebarOpen,
}: MenuProps) {
  const [cards, setCards] = useState<AlarmCard[]>([]);
  const [history, setHistory] = useState<AlarmHistoryItem[]>([]);
  const [kakao, setKakao] = useState<KakaoAlarmConfig | null>(null);
  const [activeFilter, setActiveFilter] = useState<AlarmFilterTab>("전체");
  const [showKakaoEdit, setShowKakaoEdit] = useState(false);
  const [editForm, setEditForm] = useState<KakaoAlarmConfig>({
    receiverNumber: "",
    quietHours: "",
    urgentAlarm: "",
    dailySummary: "",
  });

  useEffect(() => {
    getAlarmCards().then(setCards);
    getAlarmHistory().then(setHistory);
    getKakaoAlarmConfig().then((cfg) => {
      setKakao(cfg);
      setEditForm(cfg);
    });

    const handleNotificationChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        enabled?: boolean;
        muted_categories?: string[];
        in_app_enabled?: boolean;
        push_enabled?: boolean;
        email_enabled?: boolean;
      } | undefined;
      if (!detail) return;
      const allOff = detail.enabled === false || (!detail.in_app_enabled && !detail.push_enabled && !detail.email_enabled);
      setCards((prev) =>
        prev.map((c) => {
          const catMap: Record<string, string> = { inventory: "재고", order: "주문", actions: "할일", analytics: "매출", production: "실시간", general: "일반" };
          if (allOff) return { ...c, enabled: false };
          if (detail.muted_categories && detail.muted_categories.length > 0) {
            const mutedLabels = detail.muted_categories.map((mc: string) => catMap[mc] || mc);
            if (c.categories.some((cat) => mutedLabels.includes(cat))) {
              return { ...c, enabled: false };
            }
          }
          if (detail.enabled === true) return { ...c, enabled: true };
          return c;
        }),
      );
    };

    window.addEventListener("notification-settings-changed", handleNotificationChange);
    return () => window.removeEventListener("notification-settings-changed", handleNotificationChange);
  }, []);

  const handleToggle = (id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const filtered =
    activeFilter === "전체"
      ? cards
      : cards.filter((c) =>
        c.categories.includes(activeFilter as AlarmCategory),
      );

  const totalCount = cards.length;
  const activeCount = cards.filter((c) => c.enabled).length;
  const inactiveCount = cards.filter((c) => !c.enabled).length;
  const todayCount = 12;

  const STATS = [
    { label: "전체 알림", value: totalCount },
    { label: "활성 알림", value: activeCount },
    { label: "비활성화", value: inactiveCount },
    { label: "오늘 발생", value: todayCount },
  ];

  const FORM_FIELDS: {
    key: keyof KakaoAlarmConfig;
    label: string;
    placeholder: string;
  }[] = [
      { key: "receiverNumber", label: "수신 번호", placeholder: "010-0000-0000" },
      { key: "quietHours", label: "알림 차단", placeholder: "22:00 – 07:00" },
      { key: "urgentAlarm", label: "긴급 알람", placeholder: "24시간 적용" },
      { key: "dailySummary", label: "알림 요약", placeholder: "매일 08:30" },
    ];

  return (
    <>
      {/* ── 편집 팝업 ── */}
      {showKakaoEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onClick={() => setShowKakaoEdit(false)}
        >
          <div
            className="bg-white rounded-[20px] px-[15px] py-[20px] flex flex-col gap-[16px] w-[280px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[12px] text-[#222]">
                  카카오톡 알림 설정
                </p>
                <p className="text-[8px] text-[#888]">
                  수신자 및 알림 시간을 수정합니다
                </p>
              </div>
              <button
                onClick={() => setShowKakaoEdit(false)}
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center cursor-pointer text-[#aaa] text-[14px] font-bold"
                style={{ backgroundColor: "#f0f1f3" }}
              >
                ×
              </button>
            </div>

            {/* 입력 필드 */}
            <div className="flex flex-col gap-[10px]">
              {FORM_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} className="flex flex-col gap-[4px]">
                  <p className="text-[9px] text-[#333] font-bold">{label}</p>
                  <input
                    value={editForm[key]}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    className="w-full h-[32px] rounded-[8px] px-[10px] text-[10px] text-[#222] outline-none"
                    style={{ border: "1px solid #e8e8e8" }}
                  />
                </div>
              ))}
            </div>

            {/* 버튼 */}
            <div className="flex gap-[8px]">
              <button
                onClick={() => setShowKakaoEdit(false)}
                className="flex-1 h-[34px] rounded-[20px] text-[10px] font-bold text-[#888] cursor-pointer"
                style={{ border: "1px solid #e8e8e8" }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  setKakao(editForm);
                  setShowKakaoEdit(false);
                }}
                className="flex-1 h-[34px] rounded-[20px] text-[10px] font-bold text-white cursor-pointer"
                style={{
                  backgroundImage:
                    "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      <ContentWrapper
        isAiPanelOpen={isAiPanelOpen}
        isSidebarOpen={isSidebarOpen}
      >
        <div className="flex flex-col gap-[14px]">
          {/* ── 페이지 헤더 ── */}
          <div>
            <p className="font-bold text-[13px] text-[#222] leading-[20px]">
              알림 설정
            </p>
            <p className="text-[9px] text-[#888] leading-[14px]">
              재고 재료 Agent 카테고리 별 알람 조건 및 알림방법 관리
            </p>
          </div>

          {/* ── 2컬럼 레이아웃 ── */}
          <div className="flex gap-[14px] items-start">
            {/* ── 좌측 ── */}
            <div className="flex-1 flex flex-col gap-[12px] min-w-0">
              {/* 통계 카드 4개 */}
              <div className="grid grid-cols-4 gap-[10px]">
                {STATS.map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-white rounded-[16px] px-[14px] py-[12px] flex flex-col gap-[8px]"
                  >
                    <div>
                      <p className="font-bold text-[20px] text-[#222] leading-none">
                        {value}
                      </p>
                      <p className="text-[9px] text-[#888] leading-[14px] mt-[2px]">
                        {label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 필터 탭 */}
              <div className="flex items-center gap-[4px]">
                {FILTER_TABS.map((tab) => {
                  const isActive = activeFilter === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveFilter(tab)}
                      className="px-[12px] h-[28px] rounded-[20px] text-[10px] font-bold cursor-pointer transition-colors"
                      style={
                        isActive
                          ? {
                            backgroundImage:
                              "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                            color: "#fff",
                          }
                          : { border: "1px solid #d8d8d8", color: "#555" }
                      }
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              {/* 알람 카드 목록 */}
              <div className="flex flex-col gap-[8px]">
                {filtered.map((card) => (
                  <div
                    key={card.id}
                    className="bg-white rounded-[16px] px-[14px] py-[12px] flex gap-[12px] items-start"
                  >
                    {/* 좌측 콘텐츠 */}
                    <div className="flex-1 flex flex-col gap-[5px] min-w-0">
                      {/* 코드 + 카테고리 배지 + 날짜 */}
                      <div className="flex items-center gap-[5px] flex-wrap">
                        <span className="text-[8px] font-bold text-[#aaa]">
                          {card.code}
                        </span>
                        {card.categories.map((cat) => (
                          <span
                            key={cat}
                            className="px-[5px] py-[1px] rounded-full text-[7px] font-bold"
                            style={{
                              backgroundColor: CATEGORY_STYLE[cat].bg,
                              color: CATEGORY_STYLE[cat].color,
                            }}
                          >
                            {cat}
                          </span>
                        ))}
                        <span className="text-[8px] text-[#bbb]">
                          {card.datetime}
                        </span>
                      </div>

                      {/* 제목 */}
                      <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                        {card.title}
                      </p>

                      {/* 설명 */}
                      <p className="text-[9px] text-[#888] leading-[13px]">
                        {card.description}
                      </p>

                      {/* 조건 */}
                      <p className="text-[8px] text-[#aaa] leading-[12px]">
                        {card.condition}
                      </p>

                      {/* 태그 */}
                      <div className="flex items-center gap-[4px] flex-wrap mt-[2px]">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-[6px] py-[1px] rounded-[4px] text-[7px] text-[#888] border border-[#e8e8e8]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 우측: 토글 + 상태 */}
                    <div className="flex flex-col items-end gap-[6px] shrink-0">
                      <Toggle
                        enabled={card.enabled}
                        onToggle={() => handleToggle(card.id)}
                      />
                      <span
                        className="text-[8px] font-bold px-[6px] py-[1px] rounded-full"
                        style={
                          card.enabled
                            ? { backgroundColor: "#e6f8ee", color: "#2a9a5a" }
                            : { backgroundColor: "#f0f1f3", color: "#aaa" }
                        }
                      >
                        {card.enabled ? "활성" : "비활성"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 우측 패널 ── */}
            <div className="w-[200px] shrink-0 flex flex-col gap-[12px]">
              {/* 최근 발동 이력 */}
              <div className="bg-white rounded-[16px] px-[14px] py-[12px] flex flex-col gap-[10px]">
                <div>
                  <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                    최근 발동 이력
                  </p>
                  <p className="text-[8px] text-[#888] leading-[12px]">
                    오늘 발생한 알람 이력
                  </p>
                </div>
                <div className="flex flex-col gap-[8px]">
                  {history.map((item) => (
                    <div key={item.id} className="flex gap-[8px] items-start">
                      {/* 타임라인 점 */}
                      <div className="flex flex-col items-center gap-[2px] shrink-0 pt-[3px]">
                        <div className="w-[6px] h-[6px] rounded-full bg-[#3aaedd]" />
                      </div>
                      <div className="flex flex-col gap-[1px]">
                        <p className="text-[8px] text-[#aaa] leading-none">
                          {item.time}
                        </p>
                        <p className="text-[9px] text-[#444] leading-[13px]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 카카오톡 알림 설정 */}
              {kakao && (
                <div className="bg-white rounded-[16px] px-[14px] py-[12px] flex flex-col gap-[10px]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-[11px] text-[#222] leading-[16px]">
                        카카오톡 알림 설정
                      </p>
                      <p className="text-[8px] text-[#888] leading-[12px]">
                        수신자 및 알림 시간 설정
                      </p>
                    </div>
                    {/* 편집 버튼 */}
                    <button
                      onClick={() => {
                        setEditForm(kakao);
                        setShowKakaoEdit(true);
                      }}
                      className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center cursor-pointer shrink-0"
                      style={{ backgroundColor: "#f0f1f3" }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#4d4d4d" viewBox="0 0 256 256">
                        <path d="M230.1,108.76,198.25,90.62c-.64-1.16-1.31-2.29-2-3.41l-.12-36A104.61,104.61,0,0,0,162,32L130,49.89c-1.34,0-2.69,0-4,0L94,32A104.58,104.58,0,0,0,59.89,51.25l-.16,36c-.7,1.12-1.37,2.26-2,3.41l-31.84,18.1a99.15,99.15,0,0,0,0,38.46l31.85,18.14c.64,1.16,1.31,2.29,2,3.41l.12,36A104.61,104.61,0,0,0,94,224l32-17.87c1.34,0,2.69,0,4,0L162,224a104.58,104.58,0,0,0,34.08-19.25l.16-36c.7-1.12,1.37-2.26,2-3.41l31.84-18.1A99.15,99.15,0,0,0,230.1,108.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" opacity="0.2"/>
                        <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.1,8.1,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8,8,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z"/>
                      </svg>
                    </button>
                  </div>

                  <div className="flex flex-col gap-[8px]">
                    {[
                      { label: "수신 번호", value: kakao.receiverNumber },
                      { label: "알림 차단", value: kakao.quietHours },
                      { label: "긴급 알람", value: kakao.urgentAlarm },
                      { label: "알림 요약", value: kakao.dailySummary },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="flex items-center gap-[2px] justify-between border border-[#EBEDEF] px-[10px] py-[5px] rounded-[10px]"
                      >
                        <p className="text-[8px] text-[#222222] leading-none font-bold">
                          {label}
                        </p>
                        <p className="text-[9px] font-bold text-[#333] leading-[13px]">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 테스트 알림 발송 버튼 */}
                  <button
                    className="w-full h-[32px] rounded-[20px] flex items-center justify-center gap-[6px] cursor-pointer mt-[2px]"
                    style={{
                      backgroundImage:
                        "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)",
                    }}
                  >
                    <p className="font-bold text-[10px] text-white">
                      테스트 알림 발송
                    </p>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </ContentWrapper>
    </>
  );
}
