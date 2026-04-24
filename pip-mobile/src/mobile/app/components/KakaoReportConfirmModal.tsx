import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  submitting?: boolean;
};

function Overlay({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`fixed inset-0 z-[9998] transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "rgba(0,0,0,0.4)" }}
    />
  );
}

export function KakaoReportConfirmModal({
  open,
  onConfirm,
  onCancel,
  submitting = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel]);

  if (!mounted) return null;

  const handleOverlay = () => {
    if (!submitting) onCancel();
  };

  return createPortal(
    <>
      <Overlay visible={visible} onClick={handleOverlay} />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed left-1/2 top-1/2 z-[9999] w-[300px] -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="bg-white rounded-[22px] px-[22px] pt-[24px] pb-[18px] shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
          <div className="flex justify-center mb-[14px]">
            <div className="w-[58px] h-[58px] rounded-full bg-[#fef6c5] flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3C6.48 3 2 6.58 2 11c0 2.6 1.6 4.9 4.06 6.36-.18.65-.66 2.42-.76 2.82-.12.5.18.5.39.36.16-.1 2.49-1.69 3.49-2.36.93.13 1.85.2 2.82.2 5.52 0 10-3.58 10-8s-4.48-8-10-8z"
                  fill="#3a1d1d"
                />
              </svg>
            </div>
          </div>

          <p className="text-center text-black text-[16px] font-bold leading-[22px] mb-[6px]">
            카카오톡 리포트 발급
          </p>
          <p className="text-center text-[#6f6f6f] text-[13px] leading-[18px] mb-[18px]">
            오늘 매장 리포트를
            <br />
            카카오톡으로 발송할까요?
          </p>

          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 h-[46px] rounded-[14px] bg-[#f3f3f3] text-[#333] text-[14px] font-bold disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="flex-[1.3] h-[46px] rounded-[14px] bg-[#fed400] text-black text-[14px] font-bold flex items-center justify-center gap-[6px] disabled:opacity-70"
            >
              {submitting ? "발송 중…" : "발송하기"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
