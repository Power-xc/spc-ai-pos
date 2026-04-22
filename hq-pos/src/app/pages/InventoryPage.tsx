import { useState, useEffect } from "react";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, formatKRW, getFilterLabel } from "../../lib/hqData";
import { fetchHQInventorySummary, type HQInventorySummary } from "../../lib/hqApi";

export function InventoryPage() {
  const { filter } = useStoreFilter();
  const [inventory, setInventory] = useState<HQInventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "risk" | "store">("overview");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchHQInventorySummary(filter);
        if (!cancelled) setInventory(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  const riskColor = (level: string) => level === "HIGH" ? "#dc2626" : level === "MEDIUM" ? "#d97706" : "#16a34a";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "전체 품목수", value: inventory?.totalItems ?? "—", color: "#2563eb", bg: "#eff6ff" },
          { label: "재고 위험 점포", value: `${(inventory?.criticalStores.length ?? 0) + (inventory?.lowStockStores.length ?? 0)}`, color: "#dc2626", bg: "#fef2f2" },
          { label: "위험 점포 (HIGH)", value: `${inventory?.criticalStores.length ?? 0}`, color: "#dc2626", bg: "#fef2f2" },
          { label: "주의 점포 (MEDIUM)", value: `${inventory?.lowStockStores.length ?? 0}`, color: "#d97706", bg: "#fffbeb" },
        ].map((card) => (
          <div key={card.label} style={{ padding: 16, borderRadius: 16, background: card.bg, border: `1px solid ${card.color}20` }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color, letterSpacing: "-0.03em" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {(["overview", "risk", "store"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 36, padding: "0 16px", borderRadius: 999,
              border: tab === t ? 0 : "1px solid #e7ebf3",
              background: tab === t ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
              color: tab === t ? "#fff" : "#374151",
              fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}
          >
            {t === "overview" ? "식재료/포장재 재고" : t === "risk" ? "부족 품목" : "점포별 이슈"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>식재료 / 포장재 / 원부자재 재고 현황</h3>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9ca3af" }}>
            {getFilterLabel(filter)} · 각 점포의 현재 재고 데이터를 기반으로 집계
          </p>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</div>
          ) : inventory && inventory.topRiskItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px", gap: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>
                <div>품목명</div>
                <div>카테고리</div>
                <div>평균 재고</div>
                <div>해당 점포수</div>
              </div>
              {inventory.topRiskItems.map((item) => (
                <div key={item.product_name} style={{
                  display: "grid", gridTemplateColumns: "1fr 100px 80px 80px",
                  gap: 8, padding: "8px 12px", borderRadius: 10,
                  background: item.avg_stock <= 1 ? "#fef2f2" : "#fffbeb",
                  border: `1px solid ${item.avg_stock <= 1 ? "#fecaca" : "#fde68a"}`,
                  alignItems: "center", fontSize: 13,
                }}>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{item.product_name}</div>
                  <div style={{ color: "#6b7280" }}>{item.category}</div>
                  <div style={{ fontWeight: 700, color: item.avg_stock <= 1 ? "#dc2626" : "#d97706" }}>{item.avg_stock}개</div>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{item.stores_at_risk}개</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "#16a34a" }}>
              현재 재고 위험 품목이 없습니다
            </div>
          )}
        </div>
      )}

      {tab === "risk" && (
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>부족 품목 · 재고 위험 점포</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#dc2626" }}>위험 점포 (HIGH)</h4>
              {inventory && inventory.criticalStores.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {inventory.criticalStores.map((name) => (
                    <div key={name} style={{ padding: "8px 12px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {name} <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>HIGH</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#16a34a", fontSize: 13 }}>위험 점포 없음</p>
              )}
            </div>
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#d97706" }}>주의 점포 (MEDIUM)</h4>
              {inventory && inventory.lowStockStores.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {inventory.lowStockStores.map((name) => (
                    <div key={name} style={{ padding: "8px 12px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {name} <span style={{ fontSize: 11, color: "#d97706", fontWeight: 800 }}>MEDIUM</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#16a34a", fontSize: 13 }}>주의 점포 없음</p>
              )}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#111827" }}>발주 권장 연결</h4>
            <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
              위험/주의 점포의 부족 품목은 AI 발주 시스템에서 자동 발주 추천이 가능합니다. 
              점포별 발주 관리에서 확인하거나 AI 채팅에서 "발주가 필요한 점포/품목 알려줘"로 질문하세요.
            </p>
          </div>
        </div>
      )}

      {tab === "store" && (
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 17, color: "#111827" }}>점포별 재고 이슈</h3>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>불러오는 중...</div>
          ) : inventory && inventory.storeInventory.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 500, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 80px 100px 100px 80px", gap: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>
                <div>점포명</div>
                <div>지역</div>
                <div>전체 품목</div>
                <div>저재고 품목</div>
                <div>위험도</div>
              </div>
              {inventory.storeInventory.map((si) => (
                <div key={si.store_id} style={{
                  display: "grid", gridTemplateColumns: "80px 80px 100px 100px 80px",
                  gap: 8, padding: "8px 12px", borderRadius: 10,
                  background: si.risk_level === "HIGH" ? "#fef2f2" : si.risk_level === "MEDIUM" ? "#fffbeb" : "#fff",
                  border: `1px solid ${si.risk_level === "HIGH" ? "#fecaca" : si.risk_level === "MEDIUM" ? "#fde68a" : "#e7ebf3"}`,
                  alignItems: "center", fontSize: 13,
                }}>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{si.store_name}</div>
                  <div style={{ color: "#6b7280" }}>{STORE_LIST.find((s) => s.store_id === si.store_id)?.city || ""}</div>
                  <div style={{ color: "#111827" }}>{si.total_items}</div>
                  <div style={{ fontWeight: 700, color: si.low_stock_count > 0 ? "#dc2626" : "#16a34a" }}>{si.low_stock_count}</div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: `${riskColor(si.risk_level)}15`, color: riskColor(si.risk_level), border: `1px solid ${riskColor(si.risk_level)}30` }}>
                      {si.risk_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>데이터 없음</div>
          )}
        </div>
      )}
    </div>
  );
}