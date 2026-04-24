import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductionOrder } from "@/mobile/types";
import { ProductImage } from "./ProductImage";

export type ProductionModalVariant = "center" | "sheet" | "compact";

type Props = {
  order: ProductionOrder | null;
  variant?: ProductionModalVariant;
  onConfirm: (order: ProductionOrder) => void;
  onCancel: () => void;
  submitting?: boolean;
};

const URGENT_GRADIENT = "linear-gradient(97deg, #3faf60 51%, #3aaedd 122%)";
const CTA_GRADIENT = "linear-gradient(97deg, #3faf60 0%, #3aaedd 100%)";

function UrgentBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-[3px] text-white font-bold rounded-[10px] ${
        compact ? "text-[10px] px-[6px] py-[1px]" : "text-[11px] px-[8px] py-[2px]"
      }`}
      style={{ background: URGENT_GRADIENT }}
    >
      <svg width={compact ? 8 : 9} height={compact ? 9 : 10} viewBox="0 0 9 10" fill="none">
        <path d="M5.25 0L0 5.75h3.375L3 10l5.25-5.75H4.875L5.25 0z" fill="#fff" />
      </svg>
      긴급
    </span>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="닫기"
      className="w-[26px] h-[26px] rounded-full bg-[#f3f3f3] flex items-center justify-center hover:bg-[#eaeaea] transition-colors"
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M1 1L8 8M8 1L1 8" stroke="#8e8e8e" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Overlay({
  visible,
  onClick,
  opacity = 0.45,
}: {
  visible: boolean;
  onClick: () => void;
  opacity?: number;
}) {
  return (
    <div
      onClick={onClick}
      className={`fixed inset-0 z-[9998] transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: `rgba(0,0,0,${opacity})` }}
    />
  );
}

// ──────────────────────────────────────────────
// 시안 A — 센터 카드 모달 (첨부 이미지 충실 재현)
// ──────────────────────────────────────────────
function CenterCard({
  order,
  visible,
  submitting,
  onConfirm,
  onCancel,
}: {
  order: ProductionOrder;
  visible: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed left-1/2 top-1/2 z-[9999] w-[320px] -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out ${
        visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
    >
      <div className="bg-white rounded-[24px] px-[22px] pt-[18px] pb-[18px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between mb-[14px]">
          <span className="text-[12px] text-[#8e8e8e] font-medium">생산지시 전송</span>
          <CloseButton onClick={onCancel} />
        </div>

        <div className="flex items-center gap-[12px] mb-[16px]">
          <div className="w-[48px] h-[48px] rounded-full bg-[#f6f7f9] overflow-hidden flex-shrink-0">
            <ProductImage name={order.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-black text-[16px] font-bold leading-[20px] mb-[4px] truncate">
              {order.name}
            </p>
            <div className="flex items-center gap-[6px]">
              {order.isUrgent && <UrgentBadge />}
              <span className="text-[#6f6f6f] text-[12px] font-medium">
                {order.quantity}
                {order.unit}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[#6f6f6f] text-[13px] leading-[18px] mb-[18px]">
          POS 기기에 생산지시를 전송하시겠습니까?
        </p>

        <div className="flex gap-[8px]">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-[46px] rounded-[14px] bg-[#f3f3f3] text-[#333] text-[14px] font-bold disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-[1.4] h-[46px] rounded-[14px] text-white text-[14px] font-bold flex items-center justify-center gap-[6px] disabled:opacity-70"
            style={{ background: CTA_GRADIENT }}
          >
            {submitting ? "전송 중…" : (
              <>
                생산지시 전송
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h7M6 3l3 3-3 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 시안 B — 바텀시트
// ──────────────────────────────────────────────
function BottomSheet({
  order,
  visible,
  submitting,
  onConfirm,
  onCancel,
}: {
  order: ProductionOrder;
  visible: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed left-0 right-0 bottom-0 z-[9999] transition-transform duration-250 ease-out ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div
        className="bg-white rounded-t-[28px] px-[20px] pt-[10px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <div className="w-[36px] h-[4px] bg-[#d9d9d9] rounded-full mx-auto mb-[14px]" />

        {order.isUrgent && (
          <div
            className="flex items-center justify-center gap-[6px] rounded-[12px] py-[8px] mb-[14px] text-white text-[12px] font-bold"
            style={{ background: URGENT_GRADIENT }}
          >
            <svg width="10" height="11" viewBox="0 0 9 10" fill="none">
              <path d="M5.25 0L0 5.75h3.375L3 10l5.25-5.75H4.875L5.25 0z" fill="#fff" />
            </svg>
            긴급 생산지시
          </div>
        )}

        <h2 className="text-center text-black text-[17px] font-bold mb-[14px]">
          생산지시 보내기
        </h2>

        <div className="bg-[#f8f8f8] rounded-[16px] p-[14px] flex items-center gap-[12px] mb-[14px]">
          <div className="w-[48px] h-[48px] rounded-[16px] bg-white overflow-hidden flex-shrink-0">
            <ProductImage name={order.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-black text-[14px] font-bold leading-[18px] mb-[2px] truncate">
              {order.name}
            </p>
            <p className="text-[#6f6f6f] text-[12px] leading-[16px]">
              {order.deadline} · {order.quantity}
              {order.unit}
            </p>
          </div>
        </div>

        <p className="text-center text-[#6f6f6f] text-[13px] mb-[16px]">
          POS 기기에 생산지시를 전송하시겠습니까?
        </p>

        <button
          onClick={onConfirm}
          disabled={submitting}
          className="w-full h-[52px] rounded-[14px] text-white text-[15px] font-bold flex items-center justify-center gap-[6px] disabled:opacity-70 mb-[4px]"
          style={{ background: CTA_GRADIENT }}
        >
          {submitting ? "전송 중…" : (
            <>
              지금 POS로 전송
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h7M6 3l3 3-3 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="w-full h-[44px] text-[#8e8e8e] text-[14px] font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 시안 C — 미니멀 컴팩트 컨펌
// ──────────────────────────────────────────────
function Compact({
  order,
  visible,
  submitting,
  onConfirm,
  onCancel,
}: {
  order: ProductionOrder;
  visible: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed left-1/2 top-1/2 z-[9999] w-[280px] -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out ${
        visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
    >
      <div className="bg-white rounded-[20px] px-[20px] pt-[22px] pb-[16px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]">
        <div className="flex justify-center mb-[12px]">
          <div
            className="w-[56px] h-[56px] rounded-full flex items-center justify-center"
            style={{
              background: order.isUrgent ? URGENT_GRADIENT : "#eef0f2",
            }}
          >
            <svg width="20" height="22" viewBox="0 0 9 10" fill="none">
              <path
                d="M5.25 0L0 5.75h3.375L3 10l5.25-5.75H4.875L5.25 0z"
                fill={order.isUrgent ? "#fff" : "#8e8e8e"}
              />
            </svg>
          </div>
        </div>

        <p className="text-center text-black text-[15px] font-bold leading-[20px] mb-[4px]">
          {order.name} {order.quantity}
          {order.unit}
          <br />
          POS로 보낼까요?
        </p>
        <p className="text-center text-[#8e8e8e] text-[11px] mb-[16px]">
          {order.deadline}
        </p>

        <div className="flex gap-[8px]">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-[44px] rounded-[12px] bg-[#f3f3f3] text-[#333] text-[13px] font-bold disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 h-[44px] rounded-[12px] text-white text-[13px] font-bold disabled:opacity-70"
            style={{ background: CTA_GRADIENT }}
          >
            {submitting ? "전송 중…" : "전송"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 메인 export — variant 분기
// ──────────────────────────────────────────────
export function ProductionOrderConfirmModal({
  order,
  variant = "center",
  onConfirm,
  onCancel,
  submitting = false,
}: Props) {
  const [mounted, setMounted] = useState<ProductionOrder | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (order) {
      setMounted(order);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(null), 220);
    return () => clearTimeout(t);
  }, [order]);

  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, submitting, onCancel]);

  if (!mounted) return null;

  const handleOverlay = () => {
    if (!submitting) onCancel();
  };
  const handleConfirm = () => onConfirm(mounted);

  const overlayOpacity = variant === "compact" ? 0.3 : 0.45;

  return createPortal(
    <>
      <Overlay visible={visible} onClick={handleOverlay} opacity={overlayOpacity} />
      {variant === "sheet" && (
        <BottomSheet
          order={mounted}
          visible={visible}
          submitting={submitting}
          onConfirm={handleConfirm}
          onCancel={onCancel}
        />
      )}
      {variant === "compact" && (
        <Compact
          order={mounted}
          visible={visible}
          submitting={submitting}
          onConfirm={handleConfirm}
          onCancel={onCancel}
        />
      )}
      {variant === "center" && (
        <CenterCard
          order={mounted}
          visible={visible}
          submitting={submitting}
          onConfirm={handleConfirm}
          onCancel={onCancel}
        />
      )}
    </>,
    document.body,
  );
}
