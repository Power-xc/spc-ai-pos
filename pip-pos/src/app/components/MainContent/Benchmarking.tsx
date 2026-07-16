import { type ReactNode, useEffect, useMemo, useState } from "react";
import ContentWrapper from "./ContentWrapper";
import { getBenchmarkSnapshot, invalidateDemoRuntimeData } from "@/lib/api";
import type { BenchmarkSnapshot } from "@/lib/api";
import {
  BENCHMARK_COMPARE_STORE_OPTIONS,
  resetBenchmarkCompareStoreIds,
  setBenchmarkCompareStoreIds,
  useBenchmarkCompareStores,
} from "@/lib/benchmarkCompareStores";

interface MenuProps {
  isAiPanelOpen: boolean;
  isSidebarOpen: boolean;
}

function fmtKRW(value: number) {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

function normalizeCampaignYear(name: string): string {
  return name
    .replace(/20[12]\d\s*년\s*/g, "")
    .replace(/\d{2}년\s*/g, "")
    .replace(/20[12]\d\.\d{2}\.\d{2}/g, "")
    .replace(/^[A-Z]+\)\s*/, "")
    .trim()
    .replace(/^\s*[\-\s]+\s*/, "")
    .trim();
}

function cleanProductName(name: string): string {
  return name
    .replace(/\?쫀득\?/g, "쫀득")
    .replace(/\?/g, "")
    .replace(/^[A-Z]+\)\s*/, "")
    .trim() || "상위 상품 없음";
}

function formatDiff(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "비교 없음";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function SummaryChip({
  label,
  value,
  accent = "#fff",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex-1 bg-[rgba(255,255,255,0.07)] rounded-[12px] px-[12px] py-[10px] flex flex-col gap-[2px]">
      <p className="text-[9px] text-[#888]">{label}</p>
      <p className="font-bold text-[16px] leading-none" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function MetricBadge({ value }: { value: number | null | undefined }) {
  const tone: { color: string; bg?: string } =
    typeof value !== "number" || Number.isNaN(value)
      ? {  color: "#333" }
      : value >= 0
        ? {  color: "#ff522c" }
        : {  color: "#2f8a51" };
  return (
    <span
      className="text-[10px] font-bold px-[0px] py-[] rounded-full"
      style={{ backgroundColor: tone.bg, color: tone.color }}
    >
      {formatDiff(value)}
    </span>
  );
}

function PeerCard({
  peer,
}: {
  peer: BenchmarkSnapshot["peerCards"][number];
}) {
  return (
    <div
      className="bg-white rounded-[14px] px-[14px] py-[12px] flex flex-col gap-[8px]"
      style={{
        border: peer.isRecommended ? "1.5px solid #3aaedd" : "1px solid #f0f1f3",
      }}
    >
      <div className="flex items-start justify-between gap-[8px]">
        <div className="min-w-0">
          <p className="font-bold text-[12px] text-[#222] leading-[18px]">
            {peer.storeName}
          </p>
          <p className="text-[9px] text-[#aaa] leading-[14px]">
            피크 {peer.peakHourLabel}
          </p>
        </div>
        {peer.isRecommended && (
          <span className="text-[9px] font-bold text-[#3aaedd] bg-[#e8f4fd] px-[8px] py-[3px] rounded-full shrink-0">
            비교 권장
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-[6px]">
        <div className="flex flex-col gap-[2px]">
          <p className="text-[8px] text-[#333]">매출 격차</p>
          <MetricBadge value={peer.salesDiff} />
        </div>
        <div className="flex flex-col gap-[2px]">
          <p className="text-[8px] text-[#333]">판매수량</p>
          <MetricBadge value={peer.quantityDiff} />
        </div>
        <div className="flex flex-col gap-[2px]">
          <p className="text-[8px] text-[#333]">폐기</p>
          <MetricBadge value={peer.wasteDiff} />
        </div>
      </div>

      <div className="flex flex-col gap-[1px]">
        <p className="text-[9px] text-[#bbb]">상위 상품</p>
        <p className="font-bold text-[10px] text-[#333]">{peer.mainProduct}</p>
      </div>

      <div className="rounded-[8px] px-[8px] py-[6px] gap-[6px]" style={{ backgroundColor: "#f5f9fd" }}>
        <span className="text-[9px] text-[#3aaedd] font-bold shrink-0 mt-[1px]">
          포인트
        </span>
        <p className="text-[9px] text-[#555] leading-[14px] tracking-[-0.3px]">
          {peer.recommendation}
        </p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-[#f0f1f3] rounded-[20px] px-[16px] pt-[14px] pb-[14px] flex flex-col gap-[10px]">
      <div className="flex items-end justify-between gap-[8px]">
        <p className="font-bold text-[12px] text-[#222] leading-[18px] flex items-center gap-[6px]">
          <span className="w-[7px] h-[4px] bg-[#3aaedd] rounded-[30px]" />
          {title}
        </p>
        {subtitle ? (
          <span className="text-[9px] text-[#aaa]">{subtitle}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function CompareStoreChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-[28px] rounded-full px-[12px] text-[10px] font-bold transition-colors cursor-pointer"
      style={
        selected
          ? { backgroundColor: "#e8f4fd", color: "#3aaedd", border: "1px solid #3aaedd" }
          : { backgroundColor: "#f4f5f6", color: "#666", border: "1px solid #ebebeb" }
      }
    >
      {label}
    </button>
  );
}

function SimilarPeerCard({
  peer,
}: {
  peer: BenchmarkSnapshot["similarPeers"][number];
}) {
  return (
    <div className="rounded-[14px] border border-[#d8eef9] bg-[#f6fbfe] px-[12px] py-[10px] flex flex-col gap-[6px]">
      <span className="block w-[35px] rounded-full bg-white px-[8px] py-[3px] text-[9px] font-bold text-[#3aaedd] border border-[#d8eef9]">
          추천
      </span>
      <div className="justify-between gap-[8px]">
        <div>
          <p className="font-bold text-[11px] text-[#222]">{peer.storeName}</p>
          <p className="text-[9px] text-[#888] leading-[14px]">
            유사도 {peer.similarityScore}% · 매출 격차 {formatDiff(peer.salesDiff)}
          </p>
        </div>
        
      </div>
      <p className="text-[9px] text-[#555] leading-[14px] tracking-[-0.2px]">
        {peer.reasons.join(" · ")}
      </p>
      <p className="text-[9px] text-[#222] leading-[14px] tracking-[-0.3px]">
        {peer.whyBetter}
      </p>
    </div>
  );
}

const ACTIVE_BTN_CLASS = "h-[30px] rounded-full px-[12px] text-[10px] font-bold text-white cursor-pointer";
const INACTIVE_BTN_CLASS = "h-[30px] rounded-full px-[12px] text-[10px] font-bold text-[#666] border border-[#d9d9d9] cursor-pointer";
const ACTIVE_BTN_STYLE: React.CSSProperties = { backgroundImage: "linear-gradient(96deg, #3FAF60 50.65%, #3AAEDD 121.87%)" };

export default function Benchmarking({
  isAiPanelOpen,
  isSidebarOpen,
}: MenuProps) {
  const selectedCompareStores = useBenchmarkCompareStores();
  const [snapshot, setSnapshot] = useState<BenchmarkSnapshot | null>(null);
  const [peerMode, setPeerMode] = useState<'default' | 'similar'>('default');

  useEffect(() => {
    getBenchmarkSnapshot({ compareStoreIds: selectedCompareStores }).then(setSnapshot);
  }, [selectedCompareStores]);

  useEffect(() => {
    if (!snapshot?.similarPeers?.length) {
      setPeerMode('default');
      return;
    }
    const similarIds = snapshot.similarPeers.map((p) => p.storeId);
    const isSimilar =
      selectedCompareStores.length === similarIds.length &&
      similarIds.every((id) => selectedCompareStores.includes(id));
    setPeerMode(isSimilar ? 'similar' : 'default');
  }, [snapshot, selectedCompareStores]);

  const derived = useMemo(() => {
    if (!snapshot) {
      return {
        recommended: [] as BenchmarkSnapshot["peerCards"],
        strongestPeer: null as BenchmarkSnapshot["peerCards"][number] | null,
        weakestMetric: null as BenchmarkSnapshot["metrics"][number] | null,
      };
    }
    const recommended = snapshot.peerCards.filter((peer) => peer.isRecommended);
    const strongestPeer = recommended[0] ?? snapshot.peerCards[0] ?? null;
    const weakestMetric =
      snapshot.metrics
      .filter((metric) => typeof metric.diff_pct === "number")
      .slice()
      .sort((a, b) => Number(a.diff_pct ?? 0) - Number(b.diff_pct ?? 0))[0] ?? null;
    return { recommended, strongestPeer, weakestMetric };
  }, [snapshot]);

  const handleToggleCompareStore = (storeId: string) => {
    const next = selectedCompareStores.includes(storeId)
      ? selectedCompareStores.filter((value) => value !== storeId)
      : [...selectedCompareStores, storeId];
    if (next.length === 0) return;
    setBenchmarkCompareStoreIds(next);
    invalidateDemoRuntimeData();
  };

  const handleApplySuggestedPeers = () => {
    if (!snapshot?.similarPeers?.length) return;
    setPeerMode('similar');
    setBenchmarkCompareStoreIds(snapshot.similarPeers.map((peer) => peer.storeId));
    invalidateDemoRuntimeData();
  };

  const handleResetCompareStores = () => {
    setPeerMode('default');
    resetBenchmarkCompareStoreIds();
    invalidateDemoRuntimeData();
  };

  if (!snapshot) {
    return (
      <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
        <div className="bg-white border border-[#ebebeb] rounded-[20px] px-[20px] py-[24px] text-[12px] text-[#555]">
          벤치마킹 데이터를 불러오는 중입니다.
        </div>
      </ContentWrapper>
    );
  }

  const allPeers = snapshot.peerCards;
  const hourlyRows = snapshot.hourlyStores.map((store) => {
    const peakPoint =
      store.points
        .slice()
        .sort((a, b) => Number(b.sales ?? 0) - Number(a.sales ?? 0))[0] ?? null;
    return {
      storeId: store.store_id,
      storeName: store.store_name,
      peakHour: peakPoint?.hour != null ? `${peakPoint.hour}시` : "-",
      peakSales: peakPoint?.sales ?? 0,
      peakQty: peakPoint?.qty ?? 0,
    };
  });
  const topItemRows = snapshot.topItemStores.map((store) => ({
    storeId: store.store_id,
    storeName: store.store_name,
    item: store.items[0] ? { ...store.items[0], product_name: cleanProductName(store.items[0].product_name) } : null,
  }));
  const channelRows = snapshot.channelStores.map((store) => ({
    storeId: store.store_id,
    storeName: store.store_name,
    channel: store.channels[0] ?? null,
  }));
  const paymentRows = snapshot.paymentStores.map((store) => ({
    storeId: store.store_id,
    storeName: store.store_name,
    method: store.methods[0] ?? null,
  }));
  const promotionRows = snapshot.promotionStores.map((store) => ({
    storeId: store.store_id,
    storeName: store.store_name,
    promo: store.promotions[0] ?? null,
  }));

  return (
    <ContentWrapper isAiPanelOpen={isAiPanelOpen} isSidebarOpen={isSidebarOpen}>
      <div className="flex flex-col gap-[14px]">
        <div className="bg-[#30343b] rounded-[20px] px-[20px] py-[16px] flex flex-col gap-[14px]">
          <div>
            <p className="font-bold text-[14px] text-white leading-[20px]">
              타 매장 벤치마킹
            </p>
            <p className="text-[10px] text-[#aaa] leading-[16px] mt-[2px]">
              {snapshot.storeName} 기준 비교 매장 {allPeers.length}곳의 매출, 상품,
              채널, 결제, 프로모션 반응을 실데이터로 비교합니다.
            </p>
            {snapshot.note ? (
              <p className="text-[9px] text-[#7cb6d7] leading-[14px] mt-[4px]">
                {snapshot.note}
              </p>
            ) : null}
          </div>

          <div className="flex gap-[8px]">
            <SummaryChip
              label="현재 순위"
              value={
                snapshot.rankAmongStores != null && snapshot.totalStores != null
                  ? `${snapshot.rankAmongStores}/${snapshot.totalStores}`
                  : "-"
              }
            />
            <SummaryChip
              label="비교 매장"
              value={`${allPeers.length}개`}
              accent="#3aaedd"
            />
            <SummaryChip
              label="최대 격차"
              value={formatDiff(derived.weakestMetric?.diff_pct ?? null)}
              accent="#ff8a65"
            />
            <SummaryChip
              label="우선 참고"
              value={snapshot.similarPeers[0]?.storeName ?? derived.strongestPeer?.storeName ?? "-"}
              accent="#C0E183"
            />
          </div>
        </div>

        <SectionCard title="비교 매장 선택" subtitle={`현재 ${selectedCompareStores.length}개 선택`}>
          <div className="flex flex-wrap gap-[8px]">
            {BENCHMARK_COMPARE_STORE_OPTIONS.map((store) => (
              <CompareStoreChip
                key={store.storeId}
                label={store.storeName}
                selected={selectedCompareStores.includes(store.storeId)}
                onClick={() => handleToggleCompareStore(store.storeId)}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-[10px] rounded-[12px] bg-[#f8f9fb] px-[12px] py-[10px]">
            <p className="text-[9px] text-[#666] leading-[14px]">
              선택한 비교 매장만 하단 카드와 채팅 비교 기준으로 사용합니다.
            </p>
            <div className="flex items-center gap-[8px] shrink-0">
              <button
                onClick={handleResetCompareStores}
                className={peerMode === 'default' ? ACTIVE_BTN_CLASS : INACTIVE_BTN_CLASS}
                style={peerMode === 'default' ? ACTIVE_BTN_STYLE : undefined}
              >
                기본 비교군 복원
              </button>
              <button
                onClick={handleApplySuggestedPeers}
                className={peerMode === 'similar' ? ACTIVE_BTN_CLASS : INACTIVE_BTN_CLASS}
                style={peerMode === 'similar' ? ACTIVE_BTN_STYLE : undefined}
              >
                유사 매장 추천 적용
              </button>
            </div>
          </div>
        </SectionCard>

        {snapshot.similarPeers.length > 0 && (
          <SectionCard title="우리매장 보다 매출이 높지만 운영이 비슷한 매장" subtitle="시간대·상품·채널·결제 패턴 기준">
            <div className="grid grid-cols-3 gap-[8px]">
              {snapshot.similarPeers.map((peer) => (
                <SimilarPeerCard key={peer.storeId} peer={peer} />
              ))}
            </div>
          </SectionCard>
        )}

        {derived.recommended.length > 0 && (
          <SectionCard title="우선 비교 매장" subtitle="매출 격차 및 피크 시간 기준">
            <div className="grid grid-cols-2 gap-[8px]">
              {derived.recommended.map((peer) => (
                <PeerCard key={peer.id} peer={peer} />
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard title="비교 매장 전체" subtitle="2026.03.10 기준">
          <div className="grid grid-cols-2 gap-[8px]">
            {allPeers.map((peer) => (
              <PeerCard key={peer.id} peer={peer} />
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-2 gap-[12px]">
          <SectionCard title="시간대별 비교" subtitle="피크 시간 기준">
            <div className="flex flex-col gap-[8px]">
              {hourlyRows.map((row) => (
                <div key={row.storeId} className="rounded-[12px] bg-[#f8f9fb] px-[10px] py-[8px] flex items-center justify-between gap-[8px]">
                  <div>
                    <p className="font-bold text-[11px] text-[#222]">{row.storeName}</p>
                    <p className="text-[9px] text-[#888]">피크 {row.peakHour} · 판매 {row.peakQty.toLocaleString("ko-KR")}개</p>
                  </div>
                  <p className="text-[11px] font-bold text-[#3aaedd]">
                    {fmtKRW(row.peakSales)}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="상위 상품 비교" subtitle="점포별 TOP 1">
            <div className="flex flex-col gap-[8px]">
              {topItemRows.map((row) => (
                <div key={row.storeId} className="rounded-[12px] bg-[#f8f9fb] px-[10px] py-[8px] flex flex-col gap-[2px]">
                  <div className="flex items-center justify-between gap-[8px]">
                    <p className="font-bold text-[11px] text-[#222]">{row.storeName}</p>
                    <p className="text-[9px] text-[#888]">
                      {row.item ? `${Math.round(row.item.sold_qty).toLocaleString("ko-KR")}개` : "-"}
                    </p>
                  </div>
                  <p className="text-[10px] text-[#555]">
                    {row.item?.product_name ?? "상품 데이터 없음"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-2 gap-[12px]">
          <SectionCard title="온/오프라인 비교" subtitle="매출 비중 기준">
            <div className="flex flex-col gap-[8px]">
              {channelRows.map((row) => (
                <div key={row.storeId} className="rounded-[12px] bg-[#f8f9fb] px-[10px] py-[8px] flex items-center justify-between gap-[8px]">
                  <div>
                    <p className="font-bold text-[11px] text-[#222]">{row.storeName}</p>
                    <p className="text-[9px] text-[#888]">{row.channel?.channel_group ?? "채널 데이터 없음"}</p>
                  </div>
                  <p className="text-[11px] font-bold text-[#222]">
                    {row.channel ? `${Math.round(row.channel.pct_of_total).toLocaleString("ko-KR")}%` : "-"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="결제수단 비교" subtitle="점포별 비중 TOP 1">
            <div className="flex flex-col gap-[8px]">
              {paymentRows.map((row) => (
                <div key={row.storeId} className="rounded-[12px] bg-[#f8f9fb] px-[10px] py-[8px] flex items-center justify-between gap-[8px]">
                  <div>
                    <p className="font-bold text-[11px] text-[#222]">{row.storeName}</p>
                    <p className="text-[9px] text-[#888]">{row.method?.payment_group ?? "결제 데이터 없음"}</p>
                  </div>
                  <p className="text-[11px] font-bold text-[#222]">
                    {row.method ? `${Math.round(row.method.pct_of_total).toLocaleString("ko-KR")}%` : "-"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="프로모션 반응 비교" subtitle="점포별 상위 프로모션">
          <div className="grid grid-cols-2 gap-[8px]">
            {promotionRows.map((row) => (
              <div key={row.storeId} className="rounded-[12px] bg-[#f8f9fb] px-[10px] py-[10px] flex flex-col gap-[4px]">
                <div className="flex items-center justify-between gap-[8px]">
                  <p className="font-bold text-[11px] text-[#222]">{row.storeName}</p>
                  <p className="text-[9px] text-[#3aaedd]">
                    {row.promo ? `${Math.round(row.promo.bill_cnt).toLocaleString("ko-KR")}건` : "-"}
                  </p>
                </div>
                <p className="text-[10px] text-[#555] leading-[14px]">
                  {row.promo ? normalizeCampaignYear(row.promo.campaign_name ?? "프로모션 데이터 없음") : "프로모션 데이터 없음"}
                </p>
                <p className="text-[10px] font-bold text-[#222]">
                  {row.promo ? fmtKRW(row.promo.sales_amt) : "-"}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </ContentWrapper>
  );
}
