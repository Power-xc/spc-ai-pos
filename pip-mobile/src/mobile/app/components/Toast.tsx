import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ToastProps = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
};

export function Toast({ message, onDismiss, durationMs = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), durationMs - 200);
    const removeTimer = setTimeout(onDismiss, durationMs);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return createPortal(
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[10000] pointer-events-none"
      style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
    >
      <div
        className={`bg-[#1f1f1f] text-white text-[13px] font-medium rounded-[14px] px-[18px] py-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-all duration-200 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        {message}
      </div>
    </div>,
    document.body,
  );
}
