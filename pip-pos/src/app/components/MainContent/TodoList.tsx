import { useState, useEffect, useCallback, useMemo } from "react";
import ContentWrapper from "./ContentWrapper";
import {
  getProductionBatchItems,
  getProductionSummary,
  getInventoryChanceLoss,
  registerProduction,
  getRegisterableProducts,
  batchRegisterProduction,
  getValidationReport,
  getInventorySnapshot,
  type RegisterableProductItem as RegisterableProductItemAPI,
  type RegisterableProductsResult,
  type BatchRegisterItemPayload,
  type InventorySnapshotResult,
  type ValidationReport,
} from "../../../lib/api";
import { getProductImageByName } from "../../../lib/productImages";
import { resolveProductDisplayName } from "../../../lib/productNameResolver";
import { getDemoTime, getDemoDate, useDemoDateTime } from "../../../lib/demoDateTime";
import type { ProductionBatchItem, ProductionBatchStatus, ProductionSummary } from "../../../types";
import icoReset from "../../../assets/ico-rest.svg";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

const GRADIENT = "linear-gradient(96deg, #3FAF60 50.65%, #3AAEDD 121.87%)";
const TOP_N = 8;

// 영업 종료 Mute 로직 (backend production.py과 동일 기준)
const BUSINESS_END = 22;
const MUTE_BEFORE_CLOSE_MINUTES = 60;

function computeMuteState(demoTime: string) {
  const [h, m] = demoTime.split(":").map(Number);
  const totalMinutes = h * 60 + m;
  const closeMinutes = BUSINESS_END * 60;

  if (totalMinutes >= closeMinutes) {
    return { muted: true, level: "closed" as const, message: "영업 종료 이후입니다. 생산 등록 추천과 알림을 차단합니다." };
  }
  if (totalMinutes >= closeMinutes - MUTE_BEFORE_CLOSE_MINUTES) {
    const remaining = closeMinutes - totalMinutes;
    return { muted: true, level: "approaching" as const, message: `영업 종료까지 ${remaining}분 남았습니다. 신규 생산 알림을 차단했습니다.` };
  }
  return { muted: false, level: "normal" as const, message: "" };
}

/* ── 1차/2차 생산 구간 해석 ── */
function getProductionPhase(demoTime: string, items: ProductionBatchItem[]): string {
  const [h, m] = demoTime.split(":").map(Number);
  const totalMinutes = h * 60 + m;
  const phases: Array<{ firstTime: number; secondTime: number }> = items
    .filter((it) => it.firstProductionTime && it.secondProductionTime)
    .map((it) => {
      const parseTime = (t: string) => {
        const parts = t.split(":").map(Number);
        return parts[0] * 60 + parts[1];
      };
      return {
        firstTime: parseTime(it.firstProductionTime!),
        secondTime: parseTime(it.secondProductionTime!),
      };
    });
  if (phases.length === 0) return "";
  const avgFirst = Math.round(phases.reduce((s, p) => s + p.firstTime, 0) / phases.length);
  const avgSecond = Math.round(phases.reduce((s, p) => s + p.secondTime, 0) / phases.length);
  if (totalMinutes < avgFirst - 30 || totalMinutes <= avgFirst) return `1차 생산 준비 구간`;
  if (totalMinutes < avgSecond - 15) return `2차 생산 전 보충 확인 구간`;
  if (totalMinutes <= avgSecond + 15) return `2차 생산 전후 보충 확인 구간`;
  return `2차 이후 추가 보충 구간`;
}

/* ── 1차/2차 패턴 문자열 (역사/패턴 구별) ── */
function makeTimeLabel(item: ProductionBatchItem, prefix: "first" | "second", isHistory: boolean): string | null {
  const regTime = prefix === "first" ? item.firstRegisterTime : item.secondRegisterTime;
  const avTime = prefix === "first" ? item.firstAvailableTime : item.secondAvailableTime;
  if (!regTime) return null;
  return `${regTime} 등록 / ${avTime} 진열`;
}
function getBatchPatternLine(item: ProductionBatchItem): string {
  const parts: string[] = [];
  const isHistory = item.productionSource === "history";
  if (item.firstProductionTime && item.firstProductionQty != null && item.firstProductionQty > 0) {
    const timeLabel = makeTimeLabel(item, "first", isHistory) ?? item.firstProductionTime;
    const label = isHistory ? `최근 생산 이력 평균 1차 생산 ${timeLabel}` : `1차 추천 ${timeLabel} · ${item.firstProductionQty}개`;
    parts.push(isHistory ? label : `1차 추천 ${timeLabel} · ${item.firstProductionQty}개`);
  }
  if (item.secondProductionTime && item.secondProductionQty != null && item.secondProductionQty > 0) {
    const timeLabel = makeTimeLabel(item, "second", isHistory) ?? item.secondProductionTime;
    const label = isHistory ? `최근 생산 이력 평균 2차 생산 ${timeLabel}` : `2차 추천 ${timeLabel} · ${item.secondProductionQty}개`;
    parts.push(isHistory ? label : `2차 추천 ${timeLabel} · ${item.secondProductionQty}개`);
  }
  return parts.length > 0 ? parts.join(" · ") : "";
}

function getStatusBadgeStyle(status: ProductionBatchStatus) {
  switch (status) {
    case "즉시 생산 필요":
      return { background: "#ff522c", color: "#fff" };
    case "보충 필요":
      return { background: "#ff9c7a", color: "#fff" };
    case "주의":
      return { background: "#f2c94c", color: "#3a2d00" };
    case "재고 적정":
      return { background: "#38a9d7", color: "#fff" };
    default:
      return null;
  }
}

/* ── Urgent scoring ── */
function urgencyScore(item: ProductionBatchItem): number {
  let score = 0;
  const shortage = item.targetShortfall ?? 0;
  if (item.status === "즉시 생산 필요") score += 1000;
  else if (item.status === "보충 필요") score += 500;
  score += shortage * 50;
  score += (item.hourlyBurnRate ?? 0) * 20;
  if (item.predictedStock1h == null || item.predictedStock1h < 0) score += 200;
  else if (item.predictedStock1h === 0) score += 100;
  return score;
}

/* ── 개별 생산 등록 확인 모달 ── */
interface SingleProdModalProps {
  item: ProductionBatchItem;
  onClose: () => void;
  onSuccess: () => void;
}

function SingleProdModal({ item, onClose, onSuccess }: SingleProdModalProps) {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<"success" | "failure" | null>(null);
  const displayName = resolveProductDisplayName(item.name);
  const oneHourQty = item.oneHourShortfall ?? item.targetShortfall ?? 0;
  const dailyQty = item.dailyRecommendedQty ?? 0;

  const groundingLines: string[] = [];
  if (item.currentStockLabel) {
    groundingLines.push(`현재 재고:${item.currentStockLabel}`);
  }
  if (oneHourQty > 0) {
    groundingLines.push(`1시간 뒤 부족 예상: ${oneHourQty}개`);
  }
  const br = item.hourlyBurnRate ?? 0;
  if (br > 0) {
    const burnLabel = item.burnRateSource === "actual" ? "최근 판매 속도" : "시간대 판매 패턴";
    groundingLines.push(`${burnLabel}: ${br.toFixed(1)}개/시간`);
  }
  if (oneHourQty > 0) {
    groundingLines.push(`즉시 생산 필요: ${oneHourQty}개`);
  }
  const etaModal = item.etaMinutes ?? null;
  const lossAmtModal = item.estimatedLossAmount;
  const lossQtyModal = item.estimatedLossQty ?? 0;
  if (etaModal !== null && etaModal > 0 && lossQtyModal > 0) {
    groundingLines.push(`품절 예상: 현재 시각 + ${etaModal.toFixed(0)}분`);
    groundingLines.push(`진열 가능: 현재 시각 + 리드타임 60분`);
    groundingLines.push(`예상 손실: ${lossQtyModal}개${lossAmtModal != null && lossAmtModal > 0 ? ` / ₩${lossAmtModal.toLocaleString()}` : " (금액 산정 불가)"}`);
  }
  const modalFirstLabel = item.productionSource === "history"
    ? "최근 생산 이력 평균 1차 생산"
    : "판매 패턴 기반 1차 추천";
  const modalSecondLabel = item.productionSource === "history"
    ? "최근 생산 이력 평균 2차 생산"
    : "판매 패턴 기반 2차 추천";
  if (item.firstProductionTime && item.firstProductionQty != null && item.firstProductionQty > 0) {
    const t = item.firstRegisterTime ? `${item.firstRegisterTime} 등록 / ${item.firstAvailableTime} 진열` : item.firstProductionTime;
    groundingLines.push(`${modalFirstLabel}: ${t} · ${item.firstProductionQty}개`);
  }
  if (item.secondProductionTime && item.secondProductionQty != null && item.secondProductionQty > 0) {
    const t = item.secondRegisterTime ? `${item.secondRegisterTime} 등록 / ${item.secondAvailableTime} 진열` : item.secondProductionTime;
    groundingLines.push(`${modalSecondLabel}: ${t} · ${item.secondProductionQty}개`);
  }
  if (dailyQty > 0) {
    groundingLines.push(`일일 권장 생산: ${dailyQty}개`);
  }
  groundingLines.push("생산 리드타임: 1시간 반영");

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const res = await registerProduction(item.product_id, oneHourQty);
      setResult(res ? "success" : "failure");
    } catch {
      setResult("failure");
    }
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-sm mx-[16px] px-[20px] pt-[18px] pb-[16px] flex flex-col gap-[12px]" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-[14px] text-[#000] leading-[20px]">
          생산 등록 확인
        </p>

        {result === null ? (
          <>
            <p className="text-[11px] text-[#525252] leading-[16px]">
              <span className="font-bold text-[#222]">{displayName}</span> <span className="text-[#3aaedd] font-bold">{oneHourQty}개</span>를 생산 등록할까요?
            </p>
            {groundingLines.length > 0 && (
              <div className="flex flex-col gap-[7px] px-[10px] py-[8px]" style={{ backgroundColor: "#f6f8fa", borderRadius: "10px" }}>
                {groundingLines.map((line, i) => (
                  <p key={i} className="text-[11px] font-bold text-[#333] leading-[13px]">
                    {line}
                  </p>
                ))}
              </div>
            )}
            <div className="flex items-center gap-[8px]">
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-white cursor-pointer transition-opacity disabled:opacity-50"
                style={{ background: GRADIENT }}
              >
                {processing ? "등록 중..." : "생산 등록"}
              </button>
              <button
                onClick={onClose}
                disabled={processing}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-[#525252] border border-[#d8d8d8] cursor-pointer transition-opacity disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              className="text-[11px] leading-[16px] font-bold"
              style={{ color: result === "success" ? "#3faf60" : "#ff522c" }}
            >
              {result === "success"
                ? `${displayName} ${oneHourQty}개 생산 등록이 완료되었습니다.`
                : "생산 등록에 실패했습니다. 잠시 후 다시 시도해 주세요."
              }
            </p>
            <button
              onClick={() => {
                if (result === "success") onSuccess();
                onClose();
              }}
              className="w-full py-[8px] rounded-[20px] font-bold text-[11px] text-white cursor-pointer"
              style={{ background: GRADIENT }}
            >
              확인
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 일괄 생산 등록 모달 ── */
interface BatchProdModalProps {
  items: ProductionBatchItem[];
  onClose: () => void;
  onSuccess: () => void;
}

type BatchPhase = "confirm" | "processing" | "result";

function BatchProdModal({ items, onClose, onSuccess }: BatchProdModalProps) {
  const [phase, setPhase] = useState<BatchPhase>("confirm");
  const [results, setResults] = useState<Map<string, { success: boolean; name: string; qty: number }>>(new Map());

  const totalQty = items.reduce((s, i) => s + (i.oneHourShortfall ?? i.targetShortfall ?? 0), 0);

  const handleConfirm = async () => {
    setPhase("processing");
    const resultMap = new Map<string, { success: boolean; name: string; qty: number }>();
    for (const item of items) {
      const qty = item.oneHourShortfall ?? item.targetShortfall ?? 0;
      if (qty <= 0) continue;
      try {
        const res = await registerProduction(item.product_id, qty);
        resultMap.set(item.id, { success: !!res, name: resolveProductDisplayName(item.name), qty });
      } catch {
        resultMap.set(item.id, { success: false, name: resolveProductDisplayName(item.name), qty });
      }
    }
    setResults(resultMap);
    setPhase("result");
  };

  const succeeded = [...results.values()].filter((r) => r.success).length;
  const failed = [...results.values()].filter((r) => !r.success).length;
  const failedItems = [...results.values()].filter((r) => !r.success);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-sm mx-[16px] px-[20px] pt-[18px] pb-[16px] flex flex-col gap-[12px]" onClick={(e) => e.stopPropagation()}>
        {phase === "confirm" && (
          <>
            <p className="font-bold text-[14px] text-[#222] leading-[20px]">
              긴급 품목 일괄 생산
            </p>
            <p className="text-[11px] text-[#525252] leading-[16px]">
              기본 화면에 선별된 긴급 품목 {items.length}개를 생산 등록합니다.
            </p>
            <div className="flex flex-col gap-[6px] max-h-[200px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-[2px] py-[6px] border-b border-[#f0f1f3]">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-[#222] font-bold leading-[14px]">
                      {resolveProductDisplayName(item.name)}
                    </p>
                    <p className="text-[10px] text-[#525252] leading-[14px] shrink-0">
                      {item.oneHourShortfall ?? item.targetShortfall ?? 0}개
                    </p>
                  </div>
                  {item.predictedStock1h != null && item.predictedStock1h !== undefined && (
                    <p className="text-[8px] text-[#aaa] leading-[12px]">
                      {item.oneHourShortfall ?? item.targetShortfall ?? 0}개 생산 필요 · 1시간 뒤 예상 재고: {item.predictedStock1h}개
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-[8px]">
              <button
                onClick={handleConfirm}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-white cursor-pointer"
                style={{ background: GRADIENT }}
              >
                일괄 생산 등록 ({items.length}개)
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-[#525252] border border-[#d8d8d8] cursor-pointer"
              >
                취소
              </button>
            </div>
          </>
        )}

        {phase === "processing" && (
          <>
            <p className="font-bold text-[14px] text-[#222] leading-[20px]">
              일괄 생산 등록 중
            </p>
            <p className="text-[11px] text-[#888] leading-[16px]">
              품목별 생산 등록을 진행 중입니다. 잠시만 기다려 주세요.
            </p>
          </>
        )}

        {phase === "result" && (
          <>
            <p className="font-bold text-[14px] text-[#222] leading-[20px]">
              일괄 생산 등록 결과
            </p>
            <p
              className="text-[11px] leading-[16px] font-bold"
              style={{ color: failed === 0 ? "#3faf60" : "#ff9c7a" }}
            >
              총 {results.size}개 품목 중 {succeeded}개 성공{failed > 0 ? `, ${failed}개 실패` : ""}했습니다.
            </p>
            {failedItems.length > 0 && (
              <div className="flex flex-col gap-[4px] max-h-[120px] overflow-y-auto">
                <p className="text-[10px] text-[#ff522c] font-bold leading-[12px]">실패 품목:</p>
                {failedItems.map((r, i) => (
                  <p key={i} className="text-[10px] text-[#525252] leading-[12px]">
                    - {r.name} {r.qty}개
                  </p>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                if (succeeded > 0) onSuccess();
                onClose();
              }}
              className="w-full py-[8px] rounded-[20px] font-bold text-[11px] text-white cursor-pointer"
              style={{ background: GRADIENT }}
            >
              확인
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 수동 생산 등록 모달 (전체 제품) ── */
type ManualProdTab = "urgent" | "supplement" | "all";

interface ManualProdRegisterModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function ManualProdRegisterModal({ onClose, onSuccess }: ManualProdRegisterModalProps) {
  const [tab, setTab] = useState<ManualProdTab>("urgent");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RegisterableProductItemAPI[]>([]);
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "failure" | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const [summary, setSummary] = useState<RegisterableProductsResult["summary"]>({
    total_count: 0, urgent_count: 0, supplement_count: 0, normal_count: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRegisterableProducts(search, tab === "urgent" ? "urgent" : tab === "supplement" ? "supplement" : "all");
        if (!cancelled && res) {
          setItems(res.items);
          setSummary(res.summary);
          const q = new Map<string, number>();
          for (const it of res.items) {
            if (it.recommended_production_qty > 0) {
              q.set(it.product_id, it.recommended_production_qty);
            }
          }
          setQuantities(q);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, search]);

  const setQty = (pid: string, v: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      if (v > 0) next.set(pid, v); else next.delete(pid);
      return next;
    });
  };

  const handleRegister = async () => {
    const selected = items
      .filter((it) => (quantities.get(it.product_id) || 0) > 0)
      .map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: quantities.get(it.product_id) || 0,
        source: it.is_urgent ? "ai_urgent" : "manual",
      }));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const res = await batchRegisterProduction(selected);
      if (res && res.registered_count > 0) {
        setResult("success");
        setResultMsg(`${res.registered_count}개 품목 생산 등록 완료${res.failed_count > 0 ? ` (${res.failed_count}개 실패)` : ""}`);
      } else {
        setResult("failure");
        setResultMsg("생산 등록에 실패했습니다.");
      }
    } catch {
      setResult("failure");
      setResultMsg("통신 오류가 발생했습니다.");
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    if (result && result === "success") onSuccess();
    onClose();
  };

  const filteredItems = tab === "all" ? items : tab === "urgent" ? items.filter((i) => i.is_urgent) : items.filter((i) => i.is_supplement);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={handleClose}>
      <div className="bg-white rounded-[20px] w-full max-w-md mx-[16px] flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-[18px] pt-[16px] pb-[10px] shrink-0">
          <p className="font-bold text-[15px] text-[#000]">생산 등록</p>
          <button onClick={handleClose} className="w-[28px] h-[28px] flex items-center justify-center rounded-full hover:bg-gray-100">
            <span className="text-[18px] text-gray-500">✕</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-[8px] px-[18px] pb-[10px] shrink-0">
          {(["urgent", "supplement", "all"] as ManualProdTab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); }}
              className={`px-[12px] py-[5px] rounded-[18px] text-[10px] font-bold transition-colors ${
                tab === t ? "bg-[#ff522c] text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {t === "urgent" ? `긴급 (${summary.urgent_count})` : t === "supplement" ? `재고 주의 (${summary.supplement_count})` : `전체 (${summary.total_count})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-[18px] pb-[8px] shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명 또는 코드 검색"
            className="w-full px-[12px] py-[7px] rounded-[14px] border border-gray-200 text-[11px] outline-none focus:border-blue-400 placeholder:text-gray-300"
          />
        </div>

        {/* Result state */}
        {result !== null ? (
          <div className="px-[18px] pb-[16px] flex flex-col gap-[10px]">
            <p className={`text-[12px] font-bold ${result === "success" ? "text-green-600" : "text-red-500"}`}>
              {resultMsg}
            </p>
            <button
              onClick={handleClose}
              className="w-full py-[8px] rounded-[20px] font-bold text-[11px] text-white"
              style={{ background: GRADIENT }}
            >
              확인
            </button>
          </div>
        ) : (
          <>
            {/* Product list */}
            <div className="flex-1 overflow-y-auto px-[18px] pb-[12px]">
              {loading ? (
                <p className="text-center text-[11px] text-gray-400 py-8">로딩 중...</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-center text-[11px] text-gray-400 py-8">표시할 품목이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-[10px]">
                  {filteredItems.map((item) => {
                    const qty = quantities.get(item.product_id) || 0;
                    const displayName = resolveProductDisplayName(item.product_name);
                    return (
                      <div key={item.product_id} className="flex flex-col gap-[4px] px-[10px] py-[8px] rounded-[12px]" style={{ backgroundColor: item.is_urgent ? "#fff5f5" : "#f9fafb" }}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-[11px] text-[#222]">{displayName}</p>
                          {item.is_urgent && (
                            <span className="text-[9px] font-bold text-[#ff522c] bg-red-50 px-[6px] py-[1px] rounded-[10px]">긴급</span>
                          )}
                        </div>
                        <div className="flex gap-[4px] text-[9px] text-gray-500">
                          <span>재고 {item.current_stock}개</span>
                          {item.predicted_stock_1h != null && <span>· 1시간 뒤 {item.predicted_stock_1h}개</span>}
                          {item.daily_recommended_qty > 0 && <span>· 일일 권장 {item.daily_recommended_qty}개</span>}
                        </div>
                        <div className="flex items-center gap-[6px]">
                          <span className="text-[10px] text-gray-500">생산 수량</span>
                          <button
                            onClick={() => setQty(item.product_id, Math.max(0, qty - 1))}
                            className="w-[22px] h-[22px] rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-200"
                          >−</button>
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => setQty(item.product_id, Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-[48px] h-[22px] text-center text-[11px] border border-gray-200 rounded-[8px] outline-none"
                          />
                          <button
                            onClick={() => setQty(item.product_id, qty + 1)}
                            className="w-[22px] h-[22px] rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-200"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-[8px] px-[18px] py-[12px] border-t border-gray-100 shrink-0">
              <button
                onClick={handleRegister}
                disabled={submitting || Array.from(quantities.values()).every((v) => v <= 0)}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-white cursor-pointer disabled:opacity-40"
                style={{ background: GRADIENT }}
              >
                {submitting ? "등록 중..." : "생산 등록"}
              </button>
              <button
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 py-[8px] rounded-[20px] font-bold text-[11px] text-gray-500 border border-gray-200 disabled:opacity-40"
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function TodoList({ isAiPanelOpen, isSidebarOpen }: MenuProps) {
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [items, setItems] = useState<ProductionBatchItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllItems, setShowAllItems] = useState(false);
  // inventory-snapshot: 전체 제품 + 시간별 예상 재고
  const [snapshot, setSnapshot] = useState<InventorySnapshotResult | null>(null);
  const [hasData, setHasData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [singleItem, setSingleItem] = useState<ProductionBatchItem | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [inventoryChanceLoss, setInventoryChanceLoss] = useState<number | null>(null);

  const demoDateTime = useDemoDateTime();

  // 예측 정확도 검증 데이터
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  // 영업 종료 Mute 상태
  const muteState = useMemo(() => computeMuteState(getDemoTime()), []);

  // 현재 시간 기준 1차/2차 생산 구간
  const productionPhase = useMemo(() => {
    const demoTime = getDemoTime();
    return getProductionPhase(demoTime, items);
  }, [items]);

  const loadItems = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setIsLoading(true);
      setErrorMessage(null);
    }
    try {
       const d = getDemoDate();
       const t = getDemoTime();
       const [s, it, snap, invLoss] = await Promise.all([
         getProductionSummary(),
         getProductionBatchItems(),
         d && t ? getInventorySnapshot(d, t, "", "all") : Promise.resolve(null),
         getInventoryChanceLoss(),
       ]);
       setSummary(s);
       setItems(it);
       setSnapshot(snap);
       setInventoryChanceLoss(Math.round(invLoss));
      if (!isRefresh) setHasData(true);
      getValidationReport().then(setValidationReport).catch(() => {});
    } catch {
      if (isRefresh) {
        setErrorMessage("최신 데이터 갱신 실패 · 이전 기준 데이터를 표시 중입니다.");
      }
    } finally {
      if (!isRefresh) setIsLoading(false);
    }
  }, []);

  // Initial load: only once on mount
  useEffect(() => {
    loadItems(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when demo date/time changes (refresh, keep existing data)
  const demoDateTimeKey = `${demoDateTime.date}T${demoDateTime.time}`;
  useEffect(() => {
    if (hasData) {
      loadItems(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoDateTimeKey]);

  // Urgent 분류: TOP N(urgency 기준) + rest
  const urgentItems = useMemo(() => {
    const actionable = items.filter(
      (item) => (item.status === "즉시 생산 필요" || item.status === "보충 필요") && (item.targetShortfall ?? 0) > 0,
    );
    return [...actionable].sort((a, b) => urgencyScore(b) - urgencyScore(a));
  }, [items]);

  const topItems = urgentItems.slice(0, TOP_N);
  const restItems = urgentItems.slice(TOP_N);

  // 일괄 생산 대상: TOP紧急品목만
  const batchProductionItems = useMemo(() => topItems.filter((item) => !muteState.muted), [topItems, muteState]);

  // inventory-snapshot.items(전체 40개)를 ProductionBatchItem 형태로 매핑
  const snapshotDisplayItems = useMemo((): ProductionBatchItem[] => {
    if (!snapshot?.items || snapshot.items.length === 0) return [];
    return snapshot.items.map((si) => {
      const isUrgent = si.is_urgent;
      const isSupplement = si.is_supplement;
      let status: ProductionBatchStatus = "재고 적정";
      if (isUrgent) status = "즉시 생산 필요";
      else if (isSupplement) status = "보충 필요";
      else if (si.risk_level === "LOW") status = "재고 적정";
      else if (si.risk_level === "MEDIUM") status = "주의";
      else status = "보충 필요";
      const curr = si.current_stock ?? 0;
      const pred = si.predicted_stock_1h ?? 0;
      const shortfall = pred < 0 ? Math.abs(pred) : null;
      return {
        id: `ss-${si.product_id}`,
        name: si.product_name,
        product_id: si.product_id,
        bgColor: "#f5f7fa",
        status,
        aiWarning: isUrgent ? "소진 위험" : null,
        lossAmount: null,
        currentCount: curr,
        targetShortfall: shortfall,
        progressPercent: Math.min(100, Math.max(0, (curr / Math.max(si.daily_recommended_qty, 1)) * 100)),
        predictedStock1h: pred,
        hourlyBurnRate: si.last_1h_sales_rate ?? null,
        burnRateSource: si.is_estimated ? "estimated" : "actual",
        dailyRecommendedQty: si.daily_recommended_qty ?? 0,
        isEstimatedStock: si.is_estimated,
      };
    });
  }, [snapshot]);

  // ── 정렬: 긴급 → 재고 주의 → 재고 적정 (predictedStock 낮은 순) ──
  const sortedStatus = { "즉시 생산 필요": 0, "보충 필요": 1, "주의": 2, "재고 적정": 3 };

  const allDisplayItems = useMemo(() => {
    if (snapshotDisplayItems.length > 0) {
      return [...snapshotDisplayItems].sort((a, b) => {
        const sa = sortedStatus[a.status] ?? 9;
        const sb = sortedStatus[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        const pa = a.predictedStock1h ?? 9999;
        const pb = b.predictedStock1h ?? 9999;
        return pa - pb;
      });
    }
    return [...urgentItems, ...items.filter((i) => !urgentItems.includes(i))];
  }, [snapshotDisplayItems, items, urgentItems]);

  const PAGE_SIZE = 5;
  const totalPages = Math.ceil(allDisplayItems.length / PAGE_SIZE);
  const pagedItems = allDisplayItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when data source changes
  useEffect(() => { setPage(1); }, [snapshot?.as_of]);

  // Refresh: loading with existing data
  const isRefreshing = isLoading && hasData;
  // Initial: loading without any data yet
  const isInitialLoading = isLoading && !hasData;

  const refresh = useCallback(() => {
    loadItems();
  }, [loadItems]);

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      {/* 개별 생산 확인 모달 */}
      {singleItem && (
        <SingleProdModal
          item={singleItem}
          onClose={() => setSingleItem(null)}
          onSuccess={refresh}
        />
      )}

      {/* 일괄 생산 모달 - TOP紧急品목만 */}
      {showBatchModal && batchProductionItems.length > 0 && (
        <BatchProdModal
          items={batchProductionItems}
          onClose={() => setShowBatchModal(false)}
          onSuccess={refresh}
        />
      )}

      {/* 수동 생산 등록 모달 */}
      {showManualModal && (
        <ManualProdRegisterModal
          onClose={() => setShowManualModal(false)}
          onSuccess={() => { setShowManualModal(false); }}
        />
      )}

      {isInitialLoading ? (
        <>
          {/* ── 초기 로딩 스켈레톤 ── */}
          <div className="bg-[#1d1d1d] border border-[#ebebeb] rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <div className="h-[14px] w-[140px] rounded bg-[rgba(255,255,255,0.2)] animate-pulse" />
                <div className="w-[1px] h-[10px] bg-white opacity-40" />
                <div className="h-[12px] w-[80px] rounded bg-[rgba(255,255,255,0.15)] animate-pulse" />
              </div>
              <div className="h-[18px] w-[100px] rounded bg-[rgba(255,255,255,0.2)] animate-pulse" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-[14px] w-[160px] rounded bg-[rgba(255,255,255,0.2)] animate-pulse" />
              <div className="h-[20px] w-[50px] rounded bg-[rgba(255,255,255,0.15)] animate-pulse" />
            </div>
          </div>

          <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden p-[15px] block mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-[6px]">
                <div className="w-[7px] h-[4px] bg-[#e0e0e0] rounded-[30px]" />
                <div className="h-[14px] w-[100px] rounded bg-[#eef0f2] animate-pulse" />
              </div>
              <div className="flex gap-[6px]">
                <div className="h-[18px] w-[80px] rounded-[20px] bg-[#f5f6f8] animate-pulse" />
                <div className="h-[18px] w-[60px] rounded-[20px] bg-[#f5f6f8] animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col gap-[15px]">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`sk-${idx}`} className="flex gap-[10px]">
                  <div className="w-[37px] h-[37px] rounded-[10px] bg-[#eef0f2] animate-pulse shrink-0" />
                  <div className="flex flex-col flex-1 gap-[4px]">
                    <div className="flex items-center justify-between">
                      <div className="h-[12px] w-[120px] rounded bg-[#eef0f2] animate-pulse" />
                      <div className="h-[16px] w-[55px] rounded-[20px] bg-[#f5f6f8] animate-pulse" />
                    </div>
                    <div className="h-[12px] w-[200px] rounded bg-[#f5f6f8] animate-pulse" />
                    <div className="h-[10px] w-[160px] rounded bg-[#f5f6f8] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-[5px] mt-2">
              <div className="w-[20px] h-[20px] rounded bg-[#f5f6f8] animate-pulse" />
              <div className="h-[10px] w-[40px] rounded bg-[#eef0f2] animate-pulse" />
              <div className="w-[20px] h-[20px] rounded bg-[#f5f6f8] animate-pulse" />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ── 생산 관리 배너 ── */}
          {(() => {
            const s = snapshot?.summary;
            const lossValue = inventoryChanceLoss > 0 ? inventoryChanceLoss : (summary?.totalEstimatedLoss ?? 0);
            if (s && getDemoTime()) {
              return (
                <div className="bg-[#1d1d1d] border border-[#ebebeb] rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[12px] text-white leading-[21px] whitespace-nowrap">
                      전체 판매 제품 {s.total_count}개 중 긴급 {s.urgent_count}개 · 재고 주의 {s.supplement_count}개
                    </p>
                    <div className="flex items-center gap-[6px]">
                      <div className="bg-[rgba(255,255,255,0.15)] rounded-[10px] px-[8px]">
                        <p className="font-bold text-[10px] text-white leading-[21px]">
                          {s.urgent_count}개
                        </p>
                      </div>
                      <p className="text-[9px] text-white opacity-60 leading-[21px] whitespace-nowrap">
                        리드타임 1시간 기준
                      </p>
                    </div>
                  </div>
                  {lossValue > 0 && (
                    <p className="text-[9px] text-white opacity-80 leading-[21px] whitespace-nowrap">
                      금일 AI 예상 기회손실 ₩{Math.round(lossValue).toLocaleString()} · 리드타임 1시간 기준
                    </p>
                  )}
                </div>
              );
            }
            if (summary) {
              return (
                <div className="bg-[#1d1d1d] border border-[#ebebeb] rounded-[20px] px-[20px] py-[15px] flex flex-col gap-[10px]">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[12px] text-white leading-[21px] whitespace-nowrap">
                      {summary.bannerLabel}
                    </p>
                    <div className="flex items-center gap-[6px]">
                      <div className="bg-[rgba(255,255,255,0.15)] rounded-[10px] px-[8px]">
                        <p className="font-bold text-[10px] text-white leading-[21px]">
                          {summary.urgentCount}개
                        </p>
                      </div>
                      {summary.restCount > 0 && (
                        <p className="text-[9px] text-white opacity-60 leading-[21px] whitespace-nowrap">
                          외 {summary.restCount}개 재고 주의
                        </p>
                      )}
                    </div>
                  </div>
                  {lossValue > 0 && (
                    <p className="text-[9px] text-white opacity-80 leading-[21px] whitespace-nowrap">
                      금일 AI 예상 기회손실 ₩{Math.round(lossValue).toLocaleString()} · 리드타임 1시간 기준
                    </p>
                  )}
                </div>
              );
            }
            return null;
          })()}

          {/* ── 생산관리 에이전트 카드 ── */}
          <div className="bg-white border border-[#ebebeb] rounded-[20px] overflow-hidden p-[15px] block mb-2">
            {/* 헤더 */}
            <div className="items-center mb-2">
              <div className="flex items-center gap-[6px] justify-between">
                <div className="flex items-center gap-[6px]">
                  <div className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
                    <p className="font-bold text-[12px] text-[#555] leading-[20px]">
                      생산관리 에이전트
                    </p>
                </div>
                <div className="flex ml-auto">
	                  <p className="text-[10px] text-[#555] leading-[20px] mr-2">
	                    {snapshot?.summary
	                      ? <span>전체 판매 제품 <span className="font-bold text-[#3aaedd]">{snapshot.summary.total_count}개</span></span>
	                      : "오늘 생산 배치 현황"}
	                  </p>
                  {productionPhase ? (
                    <p className="text-[8px] text-[#3aaedd] font-bold leading-[20px]">
                      {getDemoTime()} 기준 · {productionPhase}
                    </p>
                  ) : snapshot ? (
                    <p className="text-[8px] text-[#3aaedd] font-bold leading-[20px]">
                      {getDemoTime()} 기준 · 시간대 판매 패턴 기반 추정
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-[6px] mt-2 ml-auto justify-end">
                {/* 예측 정확도 배지 */}
                {validationReport?.summary && (() => {
                  const summary = validationReport.summary;
                  const backtest = validationReport.backtest;
                  const backtestError = backtest?.avg_error_pct ?? 0;
                  const errorPct = backtestError > 0 ? backtestError : summary.avg_error_pct;
                  const isPass = errorPct <= 10;
                  let label: string;
                  let bgColor: string;
                  let accentColor: string;
                  if (errorPct === 0) {
                    label = "예측 검증 제한적";
                    bgColor = "#fff8e8";
                    accentColor = "#c17d00";
                  } else if (errorPct <= 10) {
                    label = `검증 오차 ±${errorPct}% · ±10% 충족`;
                    bgColor = "#e8f8ee";
                    accentColor = "#3faf60";
                  } else {
                    label = `검증 오차 ±${errorPct}% · 기준 초과`;
                    bgColor = "#fff3e8";
                    accentColor = "#ff522c";
                  }
                  return (
                    <div
                      className="shrink-0 px-[10px] py-[4px] rounded-[10px] h-[22px] flex items-center"
                      style={{ background: bgColor }}
                    >
                      <p className="text-[8px] text-[#525252] leading-[8px] whitespace-nowrap">
                        <span className="font-bold" style={{ color: accentColor }}>
                          {label}
                        </span>
                      </p>
                    </div>
                  );
                })()}
                {validationReport === null && isLoading === false && (
                  <div className="shrink-0 px-[10px] py-[4px] rounded-[10px] h-[22px] flex items-center bg-[#f1f1f1]">
                    <p className="text-[8px] text-[#aaa] leading-[8px] whitespace-nowrap">
                      검증 확인 필요
                    </p>
                  </div>
                )}
                {/* 영업 종료 Mute 배지 */}
                {muteState.muted && (
                  <div
                    className="shrink-0 px-[10px] py-[4px] rounded-[10px] h-[22px] flex items-center"
                    style={{ background: muteState.level === "closed" ? "#ffecec" : "#fff8e8" }}
                  >
                    <p
                      className="text-[8px] leading-[8px] whitespace-nowrap"
                      style={{
                        color: muteState.level === "closed" ? "#ff522c" : "#c17d00",
                        fontWeight: 700,
                      }}
                    >
                      {muteState.level === "closed"
                        ? "영업 종료 후 알림 차단"
                        : "영업 종료 임박 알림 차단"}
                    </p>
                  </div>
                )}
                {batchProductionItems.length > 0 && (
                  <button
                    onClick={() => setShowBatchModal(true)}
                    disabled={muteState.muted}
                    className="h-[22px] px-[10px] rounded-[10px] flex items-center cursor-pointer transition-opacity shrink-0 disabled:opacity-40"
                    style={{ background: muteState.muted ? "#d0d0d0" : GRADIENT }}
                  >
                    <p className="font-bold text-[10px] text-white leading-[14px]">
                      {muteState.muted ? "긴급 품목 일괄(차단)" : "긴급 품목 일괄 생산"}
                    </p>
                  </button>
                )}
                  <div className="flex items-center gap-[6px] bg-[#f1f1f1] rounded-[10px] px-[10px] py-[4px] h-[22px]">
                  <img src={icoReset} alt="" />
                  <p className="text-[9px] text-[#525252] leading-[8px] text-right">
                    5분전 갱신
                  </p>
                </div>
              </div>
            </div>

            {/* 전체 제품 표시 안내 */}
            {snapshot?.summary && (
              <div className="flex items-center justify-between py-[6px] px-[10px] rounded-[10px]" style={{ backgroundColor: "#f6f8fa" }}>
                <p className="text-[9px] text-[#888] leading-[13px]">
                  전체 판매 제품 {snapshot.summary.total_count}개 · 긴급/재고 주의 품목 우선 정렬
                </p>
                <button
                  onClick={() => setShowManualModal(true)}
                  disabled={muteState.muted}
                  className="text-[9px] font-bold leading-[13px] text-[#3aaedd] cursor-pointer whitespace-nowrap disabled:opacity-40"
                >
                  수동 생산 등록 →
                </button>
              </div>
            )}

            {/* 데이터 한계 안내 */}
            {validationReport?.summary && validationReport.summary.avg_error_pct === 0 && (
              <p className="text-[8px] text-[#aaa] leading-[12px]">
                현재 재고 데이터가 0값 중심으로 수집되어 생산 필요 품목이 과다 감지될 수 있습니다. 판매 속도와 리드타임 기준으로 우선순위 상위 품목만 표시됩니다.
              </p>
            )}

            {/* 재고 주의 기준 설명 */}
            {snapshot && snapshot.summary.supplement_count > 0 && (
              <p className="text-[7px] text-[#aaa] leading-[10px]">
                재고 주의: 선택 시간 기준 예상 재고가 낮거나 1시간 뒤 부족 예상 품목
              </p>
            )}

            {/* 아이템 목록 */}
            <div className="flex flex-col gap-[15px] mt-2">
              {pagedItems.map((item) => {
                const oneHourQty = item.oneHourShortfall ?? item.targetShortfall ?? 0;
                const dailyQty = item.dailyRecommendedQty ?? 0;
                const isActionable =
                  (item.status === "즉시 생산 필요" || item.status === "보충 필요") &&
                  (oneHourQty > 0 || item.currentCount === 0);
                const hasSingleModal = !!singleItem;
                const isMuted = muteState.muted;

                // 상단 요약 라인: 시간 기준 예상 재고
                const summaryWarning = (() => {
                  const demoTime = getDemoTime();
                  const current = item.currentStockLabel ?? `${item.currentCount}개`;
                  const oneHourText = oneHourQty > 0 ? `1시간 뒤 부족 ${oneHourQty}개` : `1시간 뒤 ${item.predictedStock1h ?? "??"}개`;
                  return `${demoTime} 기준 예상 재고 ${current} · ${oneHourText}`;
                })();

                // 라인 2: 판매 패턴/속도 + 즉시 생산 필요
                const detailLine = (() => {
                  const parts: string[] = [];
                  const br2 = item.hourlyBurnRate ?? 0;
                  if (br2 > 0) {
                    const burnLabel = item.burnRateSource === "actual" ? "최근 판매 속도" : "시간대 판매 패턴";
                    parts.push(`${burnLabel} ${br2.toFixed(1)}개/시간`);
                  }
                  if (oneHourQty > 0) {
                    parts.push(`즉시 생산 필요 ${oneHourQty}개`);
                  }
                  return parts.join(" · ");
                })();

                // ETA 기반 찬스로스 라인 (리드타임 1시간 기준)
                const lossLine = (() => {
                  const eta = item.etaMinutes ?? null;
                  const lossAmt = item.estimatedLossAmount;
                  const lossQty = item.estimatedLossQty ?? 0;
                  if (eta !== null && eta > 0 && lossQty > 0) {
                    const lossText = lossAmt != null && lossAmt > 0
                      ? `손실 ${lossQty}개/₩${lossAmt.toLocaleString()}`
                      : `손실 ${lossQty}개 (금액 산정 불가)`;
                    return `ETA ${eta.toFixed(0)}분 · ${lossText}`;
                  }
                  if (eta !== null && eta > 0 && lossQty === 0) {
                    return `ETA ${eta.toFixed(0)}분`;
                  }
                  return "";
                })();

                // 라인 3: 1차/2차 평균 패턴 (4주 평균)
                const batchPatternLine = getBatchPatternLine(item);

                // 라인 4: 일일 권장 생산 (참고값)
                const dailyRecLine = dailyQty > 0 ? `일일 권장 생산 ${dailyQty}개` : "";

                return (
                  <div key={item.id} className="flex flex-col gap-[6px]">
                    <div className="flex items-center gap-[10px]">
                      <img
                        src={getProductImageByName(item.name)}
                        alt={resolveProductDisplayName(item.name)}
                        className="w-[37px] h-[37px] rounded-[10px] shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/products/coming-soon.png";
                        }}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-[11px] text-[#222] leading-[14px] truncate w-[215px]">
                            {resolveProductDisplayName(item.name)}
                          </p>
                          <div className="flex items-center gap-[6px] shrink-0">
                            {item.status && getStatusBadgeStyle(item.status) && (
                              <div
                                className="flex items-center justify-center px-[12px] py-[2px] rounded-[20px] shrink-0"
                                style={getStatusBadgeStyle(item.status) ?? undefined}
                              >
                                <p
                                  className="font-bold text-[9px] leading-[14px]"
                                  style={{ color: getStatusBadgeStyle(item.status)?.color }}
                                >
                                  {item.status}
                                </p>
                              </div>
                             )}
                             <button
                               onClick={() => setSingleItem(item)}
                               disabled={isMuted || hasSingleModal}
                               className="px-[12px] py-[2px] rounded-[20px] cursor-pointer transition-opacity shrink-0 disabled:opacity-40"
                               style={{ background: isMuted ? "#e8e8e8" : GRADIENT }}
                             >
                               <p className="font-bold text-[9px] leading-[14px] whitespace-nowrap text-white">
                                 {isMuted ? "알림 차단됨" : "생산 등록"}
                               </p>
                             </button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[2px]">
                          <p
                            className="text-[9px] leading-[13px]"
                            style={{
                              color:
                                item.status === "즉시 생산 필요" || item.status === "보충 필요"
                                  ? "#ff522c"
                                  : item.status === "주의"
                                    ? "#c17d00"
                                    : "#4d4d4d",
                            }}
                          >
                            {summaryWarning}
                          </p>
                          {detailLine && (
                            <p className="text-[8px] text-[#555] leading-[12px]">
                              {detailLine}
                            </p>
                          )}
                          {lossLine && (
                            <p className="text-[7px] text-[#ff522c] leading-[11px]">
                              {lossLine} · 리드타임 1시간
                            </p>
                          )}
                          {batchPatternLine && (
                            <p className="text-[7px] text-[#888] leading-[11px]">
                              생산 패턴: {batchPatternLine}
                            </p>
                          )}
                          {dailyRecLine && (
                            <p className="font-bold text-[8px] text-[#888] leading-[12px]">
                              · {dailyRecLine}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-[6px]">
                      <div className="relative h-[10px] rounded-[100px] overflow-hidden bg-[#e6e6e6]">
                        <div
                          className="absolute left-0 top-0 h-full rounded-[100px] transition-all duration-500"
                          style={{
                            width: `${item.progressPercent}%`,
                            backgroundImage:
                              "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            <div className="flex items-center justify-end gap-[5px] mt-2">
              {page > 1 && (
                <button
                  onClick={() => setPage((p) => p - 1)}
                  className="shrink-0 rotate-180"
                  aria-label="이전 페이지"
                >
                  <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
                    <path
                      d="M1 1l3 2.5L1 6"
                      stroke="#595959"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <p className="font-bold text-[9px] text-[#595959] leading-[10px] text-right ">
                {page} / {totalPages || 1}
              </p>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="shrink-0 disabled:opacity-30"
                aria-label="다음 페이지"
              >
                <svg width="5" height="7" viewBox="0 0 5 7" fill="none">
                  <path
                    d="M1 1l3 2.5L1 6"
                    stroke="#595959"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </ContentWrapper>
  );
}
