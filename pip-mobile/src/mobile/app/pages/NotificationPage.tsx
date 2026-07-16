import { useEffect, useState } from "react";
import type { NotificationCategory, NotificationItem } from "@/mobile/types";
import { getNotifications } from "@/mobile/lib/api";

type TabKey = "전체" | NotificationCategory;
export type NotificationViewKey = "list" | "settings";
const TABS: TabKey[] = ["전체", "발송로그", "운영알림"];

interface AlertSetting {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

const INITIAL_ALERT_SETTINGS: AlertSetting[] = [
  {
    id: "low-stock",
    title: "재고 부족 알림",
    description: "최소 기준 이하 시 알림",
    enabled: true,
  },
  {
    id: "sales-drop",
    title: "매출 급감 알림",
    description: "전일 대비 20% 이상 하락 시",
    enabled: true,
  },
  {
    id: "order-arrival",
    title: "발주 도착 알림",
    description: "발주 품목 입고 시 알림",
    enabled: false,
  },
  {
    id: "ai-recommend",
    title: "AI 추천 알림",
    description: "AI가 새 추천을 보낼 때",
    enabled: true,
  },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative inline-flex w-[44px] h-[24px] rounded-full shrink-0 cursor-pointer transition-colors duration-200"
      style={{ backgroundColor: checked ? "#38a9d7" : "#D4D4D4" }}
    >
      <span
        className="absolute top-[2px] left-0 w-[20px] h-[20px] rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function AlertSettingsCard({
  settings,
  onToggle,
}: {
  settings: AlertSetting[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="bg-white rounded-[14px] px-[18px] py-[18px]">
      <h3 className="text-[15px] font-bold text-[#111] mb-[6px]">알림 설정</h3>
      <ul>
        {settings.map((item, i) => (
          <li
            key={item.id}
            className={
              "flex items-center justify-between gap-[12px] py-[14px] " +
              (i < settings.length - 1 ? "border-b border-[#f0f0f0]" : "")
            }
          >
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[#111] leading-[18px]">
                {item.title}
              </p>
              <p className="text-[12px] text-[#888] mt-[4px] leading-[16px]">
                {item.description}
              </p>
            </div>
            <Toggle checked={item.enabled} onChange={() => onToggle(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <div className="flex items-center gap-[22px]">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={
              "relative pb-[10px] text-[14px] leading-[20px] " +
              (isActive
                ? "text-[#ff522c] font-bold"
                : "text-[#888] font-medium")
            }
          >
            {tab}
            {isActive && (
              <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-[#ff522c] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({
  label,
  tone,
}: {
  label: string;
  tone: "unread" | "read";
}) {
  return (
    <div
      className={
        "mt-[18px] mb-[10px] text-[13px] font-bold " +
        (tone === "unread" ? "text-[#ff522c]" : "text-[#888]")
      }
    >
      {label}
    </div>
  );
}

function DispatchedBadge({ dim = false }: { dim?: boolean }) {
  return (
    <span
      className={
        "shrink-0 text-[11px] font-medium px-[10px] py-[3px] rounded-full bg-[rgba(52,199,140,0.15)] text-[#2fb37a] " +
        (dim ? "opacity-60" : "")
      }
    >
      발송완료
    </span>
  );
}

function NotificationRow({
  item,
  unread,
}: {
  item: NotificationItem;
  unread: boolean;
}) {
  const containerClass = unread
    ? "bg-white border border-[#ffd4cc]"
    : "bg-[#f5f6f7] border border-transparent";
  const dotClass = unread
    ? "bg-[#ff522c]"
    : "bg-transparent border border-[#c4c4c4]";
  const titleClass = unread
    ? "text-[13px] font-bold text-[#111] leading-[18px]"
    : "text-[13px] font-medium text-[#888] leading-[18px]";

  return (
    <div
      className={
        "flex items-start gap-[10px] rounded-[14px] px-[16px] py-[14px] mb-[10px] " +
        containerClass
      }
    >
      <span className={"w-[6px] h-[6px] rounded-full mt-[7px] shrink-0 " + dotClass} />
      <div className="flex-1 min-w-0">
        <p className={titleClass}>{item.title}</p>
        <p className="text-[11px] text-[#a4a4a4] mt-[4px] leading-[14px]">
          {item.time}
        </p>
      </div>
      {item.isDispatched && <DispatchedBadge dim={!unread} />}
    </div>
  );
}

interface NotificationPageProps {
  view: NotificationViewKey;
}

export default function NotificationPage({ view }: NotificationPageProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("전체");
  const [settings, setSettings] = useState<AlertSetting[]>(INITIAL_ALERT_SETTINGS);

  useEffect(() => {
    getNotifications().then(setItems);
  }, []);

  function toggleSetting(id: string) {
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }

  if (view === "settings") {
    return (
      <div className="bg-[#f5f6f7] min-h-[calc(100vh-120px)] px-[20px] pt-[14px] pb-[24px]">
        <AlertSettingsCard settings={settings} onToggle={toggleSetting} />
      </div>
    );
  }

  const filtered =
    activeTab === "전체"
      ? items
      : items.filter((n) => n.category === activeTab);
  const unread = filtered.filter((n) => !n.isRead);
  const read = filtered.filter((n) => n.isRead);

  return (
    <div className="bg-white min-h-[calc(100vh-120px)] px-[20px] pt-[14px] pb-[24px]">
      <div className="border-b border-[#ebebeb]">
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {unread.length > 0 && (
        <>
          <SectionHeader label={`읽지 않음 ${unread.length}`} tone="unread" />
          {unread.map((n) => (
            <NotificationRow key={n.id} item={n} unread />
          ))}
        </>
      )}

      {read.length > 0 && (
        <>
          <SectionHeader label="읽음" tone="read" />
          {read.map((n) => (
            <NotificationRow key={n.id} item={n} unread={false} />
          ))}
        </>
      )}

      {filtered.length === 0 && (
        <div className="mt-[60px] text-center text-[13px] text-[#a4a4a4]">
          알림이 없습니다.
        </div>
      )}
    </div>
  );
}
