import { useState, useEffect } from "react";
import type { PipAiAlert, DailySalesData, AiAction, EventScheduleData, ReviewData } from "@/mobile/types";
import { getPipAiAlert, getDailySales, getAiActions, getEventSchedule, getReviewData } from "@/mobile/lib/api";
import { cacheGet, cacheSet } from "@/mobile/lib/cache";
import PipAiCard from "../components/PipAiCard";
import TodoShortcut from "../components/TodoShortcut";
import DailySalesCard from "../components/DailySalesCard";
import AiActionCard from "../components/AiActionCard";
import EventScheduleCard from "../components/EventScheduleCard";
import ReviewCard from "../components/ReviewCard";
import KakaoReportButton from "../components/KakaoReportButton";
import { KakaoReportConfirmModal } from "../components/KakaoReportConfirmModal";
import { Toast } from "../components/Toast";

interface HanunePageProps {
  onNavigate?: (tab: string) => void;
}

function usePrefetchHanuneData() {
  useEffect(() => {
    const prefetches = [
      { fn: getPipAiAlert, key: "pipAiAlert" },
      { fn: getAiActions, key: "getAiActions" },
      { fn: getEventSchedule, key: "getEventSchedule" },
      { fn: getReviewData, key: "getReviewData" },
    ];
    for (const { fn, key } of prefetches) {
      if (cacheGet(key) === undefined) {
        fn().then((data) => cacheSet(key, data));
      }
    }
    const dateKey = new Date("2026-04-14").toISOString().slice(0, 10);
    const salesKey = `getDailySales_${dateKey}`;
    if (cacheGet(salesKey) === undefined) {
      getDailySales(new Date("2026-04-14")).then((data) => cacheSet(salesKey, data, 30 * 1000));
    }
  }, []);
}

export default function HanunePage({ onNavigate }: HanunePageProps = {}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  usePrefetchHanuneData();

  const handleConfirm = () => {
    setConfirmOpen(false);
    setToast("카카오톡으로 리포트가 발송되었어요");
  };

  return (
    <div className="px-[15px] pt-[12px] pb-[24px] flex flex-col gap-[12px]">
      <div id="section-pip-ai"><PipAiCard /></div>
      <div id="section-todo"><TodoShortcut onNavigate={onNavigate} /></div>
      <div id="section-sales"><DailySalesCard /></div>
      <div id="section-ai-action"><AiActionCard /></div>
      <div id="section-event"><EventScheduleCard onNavigate={onNavigate} /></div>
      <div id="section-review">
        <ReviewCard onViewAll={() => onNavigate?.("리뷰현황")} />
      </div>
      <KakaoReportButton onClick={() => setConfirmOpen(true)} />
      <KakaoReportConfirmModal
        open={confirmOpen}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}