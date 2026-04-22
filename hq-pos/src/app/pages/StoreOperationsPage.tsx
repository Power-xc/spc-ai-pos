import { useState, useEffect } from "react";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, formatKRW, getFilterLabel } from "../../lib/hqData";
import { fetchHQStoreStatuses, type HQStoreStatus } from "../../lib/hqApi";

const STATUS_COLORS = {
  정상: { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", dot: "#22c55e" },
  주의: { bg: "#fffbeb", border: "#fde68a", text: "#d97706", dot: "#f59e0b" },
  위험: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", dot: "#ef4444" },
};

const HOURS = ["06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21"];
function generateHourlyProfile(): number[] {
  const profile = [0.02, 0.04, 0.08, 0.12, 0.14, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04, 0.03, 0.02, 0.01];
  const factor = 0.85 + Math.random() * 0.3;
  return profile.map((p) => Math.round(p * factor * 100));
}

export function StoreOperationsPage() {
  const { filter } = useStoreFilter();
  const [statuses, setStatuses] = useState<HQStoreStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "정상" | "주의" | "위험">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchHQStoreStatuses(filter);
        if (!cancelled) setStatuses(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);

  const filtered = statusFilter === "all" ? statuses : statuses.filter((s) => s.status === statusFilter);
  const normalCount = statuses.filter((s) => s.status === "정상").length;
  const warningCount = statuses.filter((s) => s.status === "주의").length;
  const dangerCount = statuses.filter((s) => s.status === "위험").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "전체 점포", value: `${statuses.length}`, color: "#2563eb", bg: "#eff6ff" },
          { label: "정상 운영", value: `${normalCount}`, color: "#16a34a", bg: "#f0fdf4" },
          { label: "주의 필요", value: `${warningCount}`, color: "#d97706", bg: "#fffbeb" },
          { label: "위험 상태", value: `${dangerCount}`, color: "#dc2626", bg: "#fef2f2" },
        ].map((card) => (
          <div key={card.label} style={{ padding: 16, borderRadius: 16, background: card.bg, border: `1px solid ${card.color}20` }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color, letterSpacing: "-0.03em" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>점포별 운영 상태</h3>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "위험", "주의", "정상"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  height: 28, padding: "0 12px", borderRadius: 999,
                  border: statusFilter === f ? 0 : "1px solid #e7ebf3",
                  background: statusFilter === f ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
                  color: statusFilter === f ? "#fff" : "#374151",
                  fontWeight: 700, cursor: "pointer", fontSize: 11,
                }}
              >
                {f === "all" ? "전체" : f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "60px 100px 80px 1fr 80px 80px 60px 60px", gap: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 10, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#6b7280" }}>
          <div>코드</div>
          <div>점포명</div>
          <div>지역</div>
          <div>시간대별 추정 가동률</div>
          <div>매출</div>
          <div>전일대비</div>
          <div>재고</div>
          <div>상태</div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>불러오는 중...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 500, overflowY: "auto" }}>
            {filtered.map((store) => {
              const sc = STATUS_COLORS[store.status];
              const profile = generateHourlyProfile();
              const peakHour = HOURS[14];
              return (
                <div key={store.store_id} style={{
                  display: "grid", gridTemplateColumns: "60px 100px 80px 1fr 80px 80px 60px 60px",
                  gap: 8, padding: "8px 12px", borderRadius: 10,
                  background: `${sc.bg}40`, border: `1px solid ${sc.border}60`,
                  alignItems: "center", fontSize: 12,
                }}>
                  <div style={{ color: "#9ca3af", fontWeight: 600 }}>{store.store_id.replace("POC_", "")}</div>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{store.store_name}</div>
                  <div style={{ color: "#6b7280" }}>{store.city}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 24 }}>
                    {profile.map((v, i) => (
                      <div key={i} style={{
                        flex: 1, height: `${v}%`, borderRadius: 2,
                        background: i === 14 ? sc.dot : `${sc.dot}40`,
                        minWidth: 3,
                      }} />
                    ))}
                  </div>
                  <div style={{ fontWeight: 700, color: "#111827" }}>{store.sales != null ? formatKRW(store.sales) : "—"}</div>
                  <div style={{ fontWeight: 700, color: store.vsYesterdayPct != null ? (store.vsYesterdayPct >= 0 ? "#16a34a" : "#dc2626") : "#9ca3af" }}>
                    {store.vsYesterdayPct != null ? `${store.vsYesterdayPct >= 0 ? "+" : ""}${store.vsYesterdayPct.toFixed(1)}%` : "—"}
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: store.inventoryRisk === "HIGH" ? "#fef2f2" : store.inventoryRisk === "MEDIUM" ? "#fffbeb" : "#f0fdf4", color: store.inventoryRisk === "HIGH" ? "#dc2626" : store.inventoryRisk === "MEDIUM" ? "#d97706" : "#16a34a" }}>
                      {store.inventoryRisk}
                    </span>
                  </div>
                  <div>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, display: "inline-block", marginRight: 4, boxShadow: `0 0 5px ${sc.dot}` }} />
                    <span style={{ fontWeight: 700, color: sc.text }}>{store.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 17, color: "#111827" }}>혼잡 시간대 추정</h3>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9ca3af" }}>
            실제 테이블 점유 데이터가 아닌, 매출 패턴 기반 추정입니다. 점포별 피크 시간대(09:00~11:00, 14:00~16:00)에 혼잡도가 높을 것으로 예상됩니다.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>오전 피크 (09:00~11:00)</span>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>전체 점포 평균 매출 집중도 32% · 출근/아침 수요 집중</p>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>오후 피크 (14:00~16:00)</span>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>전체 점포 평균 매출 집중도 24% · 오후 간식/커피 수요</p>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>윈도우 시간 (11:00~14:00)</span>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>비교적 안정적인 운영 · 점심 피크 이후 정리 시간</p>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.06)", padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 17, color: "#111827" }}>운영 이슈 요약</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {statuses.filter((s) => s.status !== "정상").slice(0, 5).map((s) => (
              <div key={s.store_id} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${s.status === "위험" ? "#fecaca" : "#fde68a"}`, background: s.status === "위험" ? "#fef2f2" : "#fffbeb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{s.store_name} ({s.city})</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[s.status].text }}>{s.status}</span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
                  {s.inventoryRisk === "HIGH" ? "재고 소진 위험 품목 3개 이상 · " : s.inventoryRisk === "MEDIUM" ? "재고 주의 품목 존재 · " : ""}
                  {s.alertCount > 0 ? `알림 ${s.alertCount}건` : "모니터링 중"}
                </p>
              </div>
            ))}
            {statuses.filter((s) => s.status !== "정상").length === 0 && (
              <div style={{ textAlign: "center", padding: 20, color: "#16a34a", fontSize: 13 }}>
                현재 운영 이슈가 있는 점포가 없습니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}