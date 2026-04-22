import { useState, useEffect } from "react";
import { useDemoNotifications, getDemoDateLabel, getDemoTimeLabel } from "../../lib/demoNotifications";
import type { NotificationItem, ToastItem } from "../../lib/demoNotifications";

interface Props {
  selectedMenu: string;
  onNavigate: (menu: string) => void;
}

const severityConfig = {
  urgent: { bg: "#feecec", border: "#ff522c", color: "#ff522c", icon: "!", label: "긴급" },
  caution: { bg: "#eaf6ff", border: "#3aaedd", color: "#3aaedd", icon: "i", label: "주의" },
  info: { bg: "#f0f7ee", border: "#3faf60", color: "#3faf60", icon: "✓", label: "안내" },
};

function EntryModal({ alerts, onClose, onNavigate }: { alerts: NotificationItem[]; onClose: () => void; onNavigate: (menu: string) => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[20px] shadow-xl w-[340px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-[20px] py-[14px] flex items-center justify-between"
          style={{ background: "linear-gradient(121deg, #3faf60 50.65%, #3aaedd 121.87%)" }}
        >
          <div className="flex items-center gap-[8px]">
            <div className="w-[20px] h-[20px] rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-[11px] text-white font-bold">!</span>
            </div>
            <span className="text-[13px] text-white font-bold">알림</span>
            <span className="text-[11px] text-white/70">{getDemoDateLabel()} {getDemoTimeLabel()}</span>
          </div>
          <button
            onClick={onClose}
            className="w-[22px] h-[22px] rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 cursor-pointer"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-[16px] py-[12px] max-h-[320px] overflow-y-auto">
          {alerts.map((alert, idx) => {
            const cfg = severityConfig[alert.severity];
            return (
              <div
                key={alert.id}
                className={`mb-[10px] rounded-[12px] border p-[12px] ${idx === 0 ? "" : ""}`}
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              >
                <div className="flex items-start gap-[8px]">
                  <div
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 mt-[1px]"
                    style={{ backgroundColor: cfg.color }}
                  >
                    <span className="text-[10px] text-white font-bold">{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6px] mb-[4px]">
                      <span
                        className="text-[9px] font-bold px-[6px] py-[1px] rounded-[4px]"
                        style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[12px] font-bold text-[#222]">{alert.title}</span>
                    </div>
                    <p className="text-[11px] text-[#555] leading-[16px]">{alert.detail}</p>
                    {alert.actionLabel && (
                      <button
                        onClick={() => {
                          if (alert.actionMenu) onNavigate(alert.actionMenu);
                          onClose();
                        }}
                        className="mt-[6px] text-[11px] font-bold cursor-pointer hover:opacity-80"
                        style={{ color: cfg.color }}
                      >
                        {alert.actionLabel} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-[#f0f1f3] px-[16px] py-[10px] flex justify-center">
          <button
            onClick={onClose}
            className="text-[11px] text-[#888] cursor-pointer hover:text-[#555]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast, onNavigate, onDismiss }: { toast: ToastItem; onNavigate: (menu: string) => void; onDismiss: () => void }) {
  const cfg = severityConfig[toast.severity];
  return (
    <div
      className="flex items-start gap-[8px] rounded-[12px] border p-[10px] shadow-lg min-w-[240px] max-w-[300px] animate-in"
      style={{
        backgroundColor: "#fff",
        borderColor: cfg.border,
        animation: "slideIn 0.3s ease-out",
      }}
    >
      <div
        className="w-[16px] h-[16px] rounded-full flex items-center justify-center shrink-0 mt-[1px]"
        style={{ backgroundColor: cfg.color }}
      >
        <span className="text-[9px] text-white font-bold">{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[4px]">
          <span className="text-[11px] font-bold text-[#222]">{toast.title}</span>
          <span className="text-[9px] text-[#aaa]">{toast.timestamp}</span>
        </div>
        <p className="text-[10px] text-[#555] leading-[14px] mt-[2px]">{toast.detail}</p>
        {toast.actionMenu && (
          <button
            onClick={() => {
              onNavigate(toast.actionMenu!);
              onDismiss();
            }}
            className="mt-[4px] text-[10px] font-bold cursor-pointer hover:opacity-80"
            style={{ color: cfg.color }}
          >
            보기 →
          </button>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-[#ccc] hover:text-[#999] cursor-pointer">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default function DemoNotificationOverlay({ selectedMenu, onNavigate }: Props) {
  const { entryAlerts, showEntryModal, setShowEntryModal, toasts, dismissToast } = useDemoNotifications(selectedMenu);

  return (
    <>
      {showEntryModal && entryAlerts.length > 0 && (
        <EntryModal alerts={entryAlerts} onClose={() => setShowEntryModal(false)} onNavigate={onNavigate} />
      )}
      {toasts.length > 0 && (
        <div className="fixed top-[16px] right-[16px] z-[65] flex flex-col gap-[8px]">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onNavigate={onNavigate}
              onDismiss={() => dismissToast(toast.id)}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-in { animation: slideIn 0.3s ease-out; }
      `}</style>
    </>
  );
}