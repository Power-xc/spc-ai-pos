import { useState } from "react";
import type { CSSProperties } from "react";
import { useOrderOptions } from "@/hooks/useOrderOptions";
import { api } from "@/lib/api-client";

const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || "POC_001";

const card = (extra?: CSSProperties): CSSProperties => ({
  background: "#fff",
  border: "1px solid #e7ebf3",
  borderRadius: 20,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  padding: 20,
  ...extra,
});

type OrderStatus = "대기" | "승인완료" | "발주완료" | "납품완료" | "취소";

interface OrderItem {
  id: string;
  productName: string;
  category: "음료재료" | "식재료" | "포장재" | "소모품" | "장비";
  qty: number;
  unit: string;
  unitPrice: number;
  supplier: string;
  requestDate: string;
  manager: string;
  status: OrderStatus;
  memo: string;
}

const initialOrders: OrderItem[] = [
  {
    id: "PO-2026-041",
    productName: "에스프레소 원두 (시그니처블렌드)",
    category: "음료재료",
    qty: 20,
    unit: "kg",
    unitPrice: 28000,
    supplier: "코리아커피로스터스",
    requestDate: "2026-04-07",
    manager: "김운영",
    status: "대기",
    memo: "긴급 발주 — 재고 1.5시간 내 소진 예상",
  },
  {
    id: "PO-2026-040",
    productName: "카페라떼 베이스 우유 (2L)",
    category: "음료재료",
    qty: 50,
    unit: "팩",
    unitPrice: 3200,
    supplier: "서울우유협동조합",
    requestDate: "2026-04-07",
    manager: "이재고",
    status: "승인완료",
    memo: "",
  },
  {
    id: "PO-2026-039",
    productName: "테이크아웃 컵 (12oz)",
    category: "포장재",
    qty: 2000,
    unit: "개",
    unitPrice: 85,
    supplier: "패키징코리아",
    requestDate: "2026-04-08",
    manager: "박포장",
    status: "발주완료",
    memo: "친환경 소재 변경 적용",
  },
  {
    id: "PO-2026-038",
    productName: "바닐라 시럽 (1L)",
    category: "음료재료",
    qty: 12,
    unit: "병",
    unitPrice: 12500,
    supplier: "토라니코리아",
    requestDate: "2026-04-06",
    manager: "김운영",
    status: "납품완료",
    memo: "",
  },
  {
    id: "PO-2026-037",
    productName: "냅킨 (500매)",
    category: "소모품",
    qty: 10,
    unit: "묶음",
    unitPrice: 4500,
    supplier: "클린서플라이",
    requestDate: "2026-04-05",
    manager: "이재고",
    status: "납품완료",
    memo: "",
  },
  {
    id: "PO-2026-036",
    productName: "샷 글라스 (60ml)",
    category: "장비",
    qty: 20,
    unit: "개",
    unitPrice: 3800,
    supplier: "카페용품닷컴",
    requestDate: "2026-04-04",
    manager: "박포장",
    status: "취소",
    memo: "기존 재고 충분 확인으로 취소",
  },
];

const statusMeta: Record<
  OrderStatus,
  { color: string; bg: string; icon: string }
> = {
  대기: { color: "#6b7280", bg: "#f3f4f6", icon: "⏳" },
  승인완료: { color: "#2563eb", bg: "#eaf2ff", icon: "✔" },
  발주완료: { color: "#d97706", bg: "#fff7e8", icon: "📦" },
  납품완료: { color: "#16a34a", bg: "#ebf9ef", icon: "✅" },
  취소: { color: "#dc2626", bg: "#feecec", icon: "✕" },
};

const categoryColor: Record<string, string> = {
  음료재료: "#ff6e00",
  식재료: "#16a34a",
  포장재: "#2563eb",
  소모품: "#d97706",
  장비: "#7c3aed",
};

const CATEGORIES = ["음료재료", "식재료", "포장재", "소모품", "장비"] as const;
const STATUSES: OrderStatus[] = [
  "대기",
  "승인완료",
  "발주완료",
  "납품완료",
  "취소",
];

// ── Edit / Create Modal ──────────────────────────────────────────────
interface ModalProps {
  initial: Partial<OrderItem> | null;
  nextStatus?: OrderStatus;
  onSave: (item: OrderItem) => void;
  onCancel: () => void;
  isNew: boolean;
}

function OrderModal({
  initial,
  nextStatus,
  onSave,
  onCancel,
  isNew,
}: ModalProps) {
  const blank: OrderItem = {
    id: `PO-2026-${String(Math.floor(Math.random() * 900) + 100)}`,
    productName: "",
    category: "음료재료",
    qty: 1,
    unit: "개",
    unitPrice: 0,
    supplier: "",
    requestDate: new Date().toISOString().slice(0, 10),
    manager: "",
    status: "대기",
    memo: "",
  };
  const [form, setForm] = useState<OrderItem>({
    ...blank,
    ...initial,
  } as OrderItem);

  const set = <K extends keyof OrderItem>(key: K, val: OrderItem[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const total = form.qty * form.unitPrice;

  const inputStyle: CSSProperties = {
    width: "100%",
    border: "1px solid #e7ebf3",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    color: "#111827",
    background: "#f8fafc",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontWeight: "bold",
  };
  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    color: "#9ca3af",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 5,
    display: "block",
  };

  const resolvedStatus = nextStatus ?? form.status;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          background: "#fff",
          borderRadius: 24,
          boxShadow: "0 32px 80px rgba(15,23,42,0.2)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "92vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 18px",
            borderBottom: "1px solid #e7ebf3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                display: "grid",
                placeItems: "center",
                fontSize: 18,
              }}
            >
              📦
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
                {isNew ? "새 발주 등록" : "발주 수정"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                {form.id}
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              color: "#6b7280",
              fontSize: 18,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Status transition notice (edit only) */}
        {!isNew && nextStatus && nextStatus !== initial?.status && (
          <div
            style={{
              margin: "14px 24px 0",
              padding: "10px 14px",
              borderRadius: 12,
              background: `${statusMeta[nextStatus].color}12`,
              border: `1px solid ${statusMeta[nextStatus].color}30`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13 }}>{statusMeta[nextStatus].icon}</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: statusMeta[nextStatus].color,
              }}
            >
              상태 변경:
            </span>
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: statusMeta[initial!.status!].bg,
                color: statusMeta[initial!.status!].color,
                fontWeight: 700,
              }}
            >
              {initial!.status}
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>→</span>
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: statusMeta[nextStatus].bg,
                color: statusMeta[nextStatus].color,
                fontWeight: 800,
              }}
            >
              {nextStatus}
            </span>
          </div>
        )}

        {/* Form */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* 품목명 */}
          <div>
            <label style={labelStyle}>품목명 *</label>
            <input
              name="productName"
              style={inputStyle}
              placeholder="예: 에스프레소 원두 (시그니처블렌드)"
              value={form.productName}
              onChange={(e) => set("productName", e.target.value)}
            />
          </div>

          {/* 카테고리 + 공급업체 */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <label style={labelStyle}>카테고리 *</label>
              <select
                name="category"
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.category}
                onChange={(e) =>
                  set("category", e.target.value as OrderItem["category"])
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>공급업체 *</label>
              <input
                name="supplier"
                style={inputStyle}
                placeholder="예: 코리아커피로스터스"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
              />
            </div>
          </div>

          {/* 수량 + 단위 + 단가 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 0.6fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>수량 *</label>
              <input
                name="qty"
                style={inputStyle}
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => set("qty", Number(e.target.value))}
              />
            </div>
            <div>
              <label style={labelStyle}>단위</label>
              <input
                name="unit"
                style={inputStyle}
                placeholder="개/kg/팩"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>단가 (원) *</label>
              <input
                name="unitPrice"
                style={inputStyle}
                type="number"
                min={0}
                value={form.unitPrice}
                onChange={(e) => set("unitPrice", Number(e.target.value))}
              />
            </div>
          </div>

          {/* 총 금액 미리보기 */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background:
                "linear-gradient(135deg, rgba(255,110,0,.06), rgba(233,30,140,.04))",
              border: "1px solid rgba(255,110,0,.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>
              총 발주금액
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#ff6e00",
                letterSpacing: "-0.03em",
              }}
            >
              {total.toLocaleString()}원
            </span>
          </div>

          {/* 납품 요청일 + 담당자 */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <label style={labelStyle}>납품 요청일 *</label>
              <input
                name="requestDate"
                style={inputStyle}
                type="date"
                value={form.requestDate}
                onChange={(e) => set("requestDate", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>담당자</label>
              <input
                name="manager"
                style={inputStyle}
                placeholder="예: 김운영"
                value={form.manager}
                onChange={(e) => set("manager", e.target.value)}
              />
            </div>
          </div>

          {/* 상태 (편집 시) */}
          {!isNew && (
            <div>
              <label style={labelStyle}>상태</label>
              <select
                name="status"
                style={{ ...inputStyle, cursor: "pointer" }}
                value={resolvedStatus}
                onChange={(e) => set("status", e.target.value as OrderStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label style={labelStyle}>메모 (선택)</label>
            <textarea
              placeholder="특이사항, 납품 조건 등을 입력하세요..."
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 60,
                lineHeight: 1.6,
              }}
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e7ebf3",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              height: 42,
              padding: "0 20px",
              borderRadius: 12,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              color: "#374151",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            취소
          </button>
          <button
            onClick={() => {
              if (!form.productName || !form.supplier || form.unitPrice <= 0)
                return;
              onSave({ ...form, status: resolvedStatus });
            }}
            style={{
              height: 42,
              padding: "0 22px",
              borderRadius: 12,
              border: 0,
              background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {isNew ? "발주 등록" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────
function DetailModal({
  order,
  onClose,
}: {
  order: OrderItem;
  onClose: () => void;
}) {
  const sm = statusMeta[order.status];
  const total = order.qty * order.unitPrice;

  const row = (label: string, value: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "11px 0",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          borderRadius: 24,
          boxShadow: "0 32px 80px rgba(15,23,42,0.2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e7ebf3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
              발주 상세
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              {order.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              color: "#6b7280",
              fontSize: 18,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "6px 24px 20px" }}>
          {row("품목명", order.productName)}
          {row("카테고리", order.category)}
          {row("공급업체", order.supplier)}
          {row("수량", `${order.qty.toLocaleString()} ${order.unit}`)}
          {row("단가", `${order.unitPrice.toLocaleString()}원`)}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "13px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
              총 발주금액
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#ff6e00" }}>
              {total.toLocaleString()}원
            </span>
          </div>
          {row("납품 요청일", order.requestDate)}
          {row("담당자", order.manager || "—")}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "11px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
              상태
            </span>
            <span
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: 999,
                background: sm.bg,
                color: sm.color,
                fontWeight: 800,
              }}
            >
              {sm.icon} {order.status}
            </span>
          </div>
          {order.memo && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e7ebf3",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#9ca3af",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                메모
              </span>
              <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                {order.memo}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* 발주 모드 타입 — 3단계 뎁스 */
type OrderMode = "overview" | "auto" | "manual";

/* 본사 발주 지시 목록 — Step 1 데이터 */
const hqOrderItems = [
  { id: "hq-1", name: "글레이즈드",      qty: 48, aiQty: 56, unit: "개",  note: "본사 기준", aiReason: "주말 판매 +18% 패턴 반영",       confidence: 88 },
  { id: "hq-2", name: "보스턴크림",      qty: 24, aiQty: 28, unit: "개",  note: "본사 기준", aiReason: "전주 동요일 재고 부족 이력",      confidence: 82 },
  { id: "hq-3", name: "초코링",          qty: 30, aiQty: 24, unit: "개",  note: "본사 기준", aiReason: "최근 2주 판매 감소 추세",          confidence: 75 },
  { id: "hq-4", name: "아메리카노 원두", qty: 2,  aiQty: 3,  unit: "kg", note: "본사 기준", aiReason: "재고 1.5시간 내 소진 예상 — 긴급", confidence: 94 },
  { id: "hq-5", name: "먼치킨",          qty: 60, aiQty: 72, unit: "개",  note: "본사 기준", aiReason: "오후 간식 수요 상승 패턴",          confidence: 85 },
];

// ── Main Page ────────────────────────────────────────────────────────
export function OrdersPage() {
  const { data: orderOptionsData, loading: orderOptionsLoading, error: orderOptionsError } = useOrderOptions(DEFAULT_STORE_ID);
  const [mode, setMode] = useState<OrderMode>("overview");
  const [orders, setOrders] = useState<OrderItem[]>(initialOrders);
  const [catFilter, setCatFilter] = useState("전체");
  const [stFilter, setStFilter] = useState("전체");
  /* 자동발주 3단계 플로우 상태 */
  const [autoStep, setAutoStep] = useState<1 | 2 | 3>(1);
  const [qtyAdjustments, setQtyAdjustments] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  /* API 응답 → UI 필드 매핑 (autoStep 2에서 사용) */
  const firstOption = orderOptionsData?.options?.[0];
  const aiRecommendedItems = firstOption?.items?.map((item, idx) => ({
    id: item.product_id || `api-${idx}`,
    name: item.product_name,
    qty: 0, // 본사 지시 수량은 API에 없으므로 0으로 표시
    aiQty: item.quantity,
    unit: "개", // API에 단위 정보가 없음
    note: "AI 추천",
    aiReason: firstOption.deviation_label || "AI 분석 기반 추천",
    confidence: 80, // API에 confidence 정보가 없음 (기본값)
  })) ?? [];

  const hasRealData = orderOptionsData && orderOptionsData.options && orderOptionsData.options.length > 0;
  const optionId = firstOption?.option_id;
  const recommendationRationale = (orderOptionsData as any)?.rationale || {};
  const fmtSignedPct = (value: number | null | undefined) =>
    typeof value === "number" ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "준비중";
  const stockoutSignal = recommendationRationale.stockout_signal || {};
  const wasteSignal = recommendationRationale.waste_signal || {};
  const rationaleRows = [
    {
      key: "전일 대비",
      value: fmtSignedPct(recommendationRationale.vs_yesterday_sales_pct),
      status: typeof recommendationRationale.vs_yesterday_sales_pct === "number" ? "실데이터" : "준비중",
    },
    {
      key: "전주 동요일 대비",
      value: fmtSignedPct(recommendationRationale.vs_last_week_same_dow_sales_pct),
      status: typeof recommendationRationale.vs_last_week_same_dow_sales_pct === "number" ? "실데이터" : "준비중",
    },
    {
      key: "품절/소진 신호",
      value:
        typeof stockoutSignal.count === "number"
          ? `${stockoutSignal.count}건`
          : stockoutSignal.note || "준비중",
      status: stockoutSignal.status || "준비중",
    },
    {
      key: "폐기 위험/상생지원",
      value:
        typeof wasteSignal.waste_rate_pct === "number"
          ? `폐기율 ${wasteSignal.waste_rate_pct.toFixed(1)}%`
          : (recommendationRationale.mutual_support_impact?.note || "준비중"),
      status: wasteSignal.status || recommendationRationale.mutual_support_impact?.status || "준비중",
    },
    {
      key: "날씨/행사/시간대",
      value: [
        recommendationRationale.weather_impact?.note,
        recommendationRationale.event_impact?.note,
        recommendationRationale.time_band_impact?.note,
      ]
        .filter(Boolean)
        .join(" · ") || "준비중",
      status:
        recommendationRationale.weather_impact?.status ||
        recommendationRationale.event_impact?.status ||
        recommendationRationale.time_band_impact?.status ||
        "준비중",
    },
  ];

  const displayItems = hasRealData ? aiRecommendedItems : [];
  const isUsingDemo = !hasRealData && !orderOptionsLoading;

  /* 발주 확정 핸들러 */
  const handleConfirmOrder = async () => {
    if (isUsingDemo) {
      setConfirmError("데모 데이터 상태에서는 실제 발주 확정이 불가합니다. 실제 데이터를 먼저 조회해주세요.");
      return;
    }
    if (displayItems.length === 0) {
      setConfirmError("확정할 주문 품목이 없습니다. 추천 주문을 먼저 조회해주세요.");
      return;
    }

    try {
      setConfirming(true);
      setConfirmError(null);
      
      const items = displayItems.map((item) => ({
        product_id: item.id,
        quantity: qtyAdjustments[item.id] ?? item.aiQty,
      }));

      const result = await api.confirmOrder({
        store_id: DEFAULT_STORE_ID,
        items: items,
      });

      // result.status는 envelope()가 생성한 값, 실제 응답은 result.data에 있음
      // 성공 시 payload.data에 { order_id, confirmed_at, status }가 있음
      if (result.status === "success" && result.data?.order_id) {
        // 성공 시 overview 목록에 새 주문 추가
        // 단가/총금액은 백엔드에서 산정되므로 미확정 상태로 표시
        const newOrder: OrderItem = {
          id: result.data.order_id,
          productName: items.map(i => displayItems.find(d => d.id === i.product_id)?.name || i.product_id).join(", "),
          category: "음료재료",
          qty: result.data.total_qty || items.reduce((s, i) => s + i.quantity, 0),
          unit: "개",
          unitPrice: 0,
          supplier: "AI 추천",
          requestDate: new Date().toISOString().slice(0, 10),
          manager: "AI",
          status: "대기",
          memo: "AI 추천 발주 - 금액 미확정",
        };
        setOrders(prev => [newOrder, ...prev]);
        setConfirmSuccess(true);
      } else {
        setConfirmError(result.error?.message || "발주 확정 실패: 관리자에게 문의하세요.");
      }
    } catch (e: any) {
      if (e?.error?.message?.includes("401") || e?.error?.message?.includes("인증")) {
        setConfirmError("인증 실패: 다시 로그인해주세요.");
      } else if (e?.error?.message?.includes("network") || e?.message?.includes("fetch")) {
        setConfirmError("네트워크 오류: 서버 연결을 확인해주세요.");
      } else {
        setConfirmError(e?.error?.message || "발주 확정 실패: 다시 시도하거나 관리자에게 문의하세요.");
      }
    } finally {
      setConfirming(false);
    }
  };

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    order: OrderItem;
    nextStatus?: OrderStatus;
  } | null>(null);
  const [detailTarget, setDetailTarget] = useState<OrderItem | null>(null);

  const catFilters = ["전체", ...CATEGORIES];
  const stFilters = ["전체", ...STATUSES];

  const filtered = orders.filter((o) => {
    const catOk = catFilter === "전체" || o.category === catFilter;
    const stOk = stFilter === "전체" || o.status === stFilter;
    return catOk && stOk;
  });

  const handleCreate = (item: OrderItem) => {
    setOrders((prev) => [item, ...prev]);
    setCreateOpen(false);
  };

  const handleEdit = (item: OrderItem) => {
    setOrders((prev) => prev.map((o) => (o.id === item.id ? item : o)));
    setEditTarget(null);
  };

  // summary
  // 단가가 0이거나 "금액 미확정" 메모가 있는 주문은 총금액에서 제외
  const totalAmt = orders.reduce(
    (s, o) => s + (o.status !== "취소" && o.unitPrice > 0 && !o.memo?.includes("미확정") ? o.qty * o.unitPrice : 0),
    0,
  );
  const waiting = orders.filter((o) => o.status === "대기").length;
  const inProgress = orders.filter(
    (o) => o.status === "승인완료" || o.status === "발주완료",
  ).length;
  const done = orders.filter((o) => o.status === "납품완료").length;

  const nextStatusMap: Record<OrderStatus, OrderStatus | null> = {
    대기: "승인완료",
    승인완료: "발주완료",
    발주완료: "납품완료",
    납품완료: null,
    취소: null,
  };

  /* 자동 발주 뷰 — 3단계 플로우 */
  if (mode === "auto") {
    const steps = [
      { num: 1 as const, label: "본사 지시 확인" },
      { num: 2 as const, label: "AI 분석 검토" },
      { num: 3 as const, label: "점주 최종 확정" },
    ];

    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "linear-gradient(135deg, #111827, #1f2937)", borderRadius: 20, color: "#fff" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>자동 발주 — 3단계 플로우</h3>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.7)" }}>
                본사 지시 확인 → AI 분석 → 점주 최종 확정 순서로 진행합니다.
              </p>
              {orderOptionsLoading && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#fbbf24" }}>
                  ⏳ 추천 주문 로딩중...
                </p>
              )}
              {orderOptionsError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#f87171" }}>
                  ⚠️ {orderOptionsError}
                </p>
              )}
            </div>
            <button
              onClick={() => { setMode("overview"); setAutoStep(1); }}
              style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
            >
              ← 목록으로
            </button>
          </div>

          {/* 인디케이터 */}
          <div style={card({ padding: "16px 20px", display: "flex", alignItems: "center" })}>
            {steps.map((step, idx) => (
              <div key={step.num} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center",
                    background: autoStep === step.num ? "#ff6e00" : autoStep > step.num ? "#22c55e" : "#f3f4f6",
                    color: autoStep >= step.num ? "#fff" : "#9ca3af",
                    fontWeight: 800, fontSize: 14, flexShrink: 0,
                    boxShadow: autoStep === step.num ? "0 0 0 4px rgba(255,110,0,.18)" : "none",
                  }}>
                    {autoStep > step.num ? "✓" : step.num}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: autoStep === step.num ? "#ff6e00" : autoStep > step.num ? "#22c55e" : "#9ca3af", display: "block" }}>
                      {step.label}
                    </span>
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div style={{ width: 32, height: 2, background: autoStep > step.num ? "#22c55e" : "#e7ebf3", flexShrink: 0, margin: "0 4px" }} />
                )}
              </div>
            ))}
          </div>

          {autoStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                본사에서 내린 발주 지시사항을 확인합니다.
              </p>
              {orderOptionsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                  ⏳ 데이터를 불러오는 중...
                </div>
              ) : hasRealData ? (
                <div style={{ background: "#fff", border: "1px solid #e7ebf3", borderRadius: 16, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#fafafa" }}>
                        <th style={{ padding: "10px 20px", textAlign: "left",  fontSize: 12, fontWeight: 700, color: "#6b7280" }}>품목</th>
                        <th style={{ padding: "10px 20px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#6b7280" }}>지시 수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item) => (
                        <tr key={item.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                          <td style={{ padding: "13px 20px", fontSize: 14, fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: "13px 20px", textAlign: "right", fontSize: 14, fontWeight: 700 }}>{item.qty > 0 ? `${item.qty}${item.unit}` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 16, background: "#fffbeb", borderRadius: 12, border: "1px solid #fcd34d" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                    ⚠️ 추천 주문 데이터 연동 대기
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                    근거 없는 임시 수량은 표시하지 않습니다. `/api/order/recommendations` 응답이 준비되면
                    본사 지시 및 AI 추천 수량을 함께 표시합니다.
                  </p>
                </div>
              )}
              <button
                onClick={() => setAutoStep(2)}
                disabled={orderOptionsLoading}
                style={{ width: "100%", height: 54, borderRadius: 14, border: 0, background: orderOptionsLoading ? "#9ca3af" : "linear-gradient(135deg, #ff6e00, #e91e8c)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: orderOptionsLoading ? "not-allowed" : "pointer", animation: orderOptionsLoading ? "none" : "order-glow 1.8s ease-in-out infinite" }}
              >
                {orderOptionsLoading ? "⏳ 로딩중..." : "확인 — AI 분석으로 넘기기 →"}
              </button>
            </div>
          )}

          {autoStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                로이 AI가 분석한 최적 발주 수량을 제안합니다.
              </p>
              <div style={{ ...card({ padding: 16 }), border: "1px solid #fde68a", background: "#fffbeb" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
                  추천 근거
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.6, marginBottom: 10 }}>
                  {recommendationRationale.summary || orderOptionsData?.explanation || "추천 근거 데이터 연동 대기"}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {rationaleRows.map((row) => (
                    <div
                      key={row.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "150px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #f3f4f6",
                        borderRadius: 10,
                        background: "#fff",
                        padding: "8px 10px",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{row.key}</span>
                      <span style={{ fontSize: 12, color: "#111827", fontWeight: 700 }}>{row.value}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: row.status === "actual" || row.status === "실데이터" ? "#166534" : "#6b7280",
                          background: row.status === "actual" || row.status === "실데이터" ? "#dcfce7" : "#f3f4f6",
                          borderRadius: 999,
                          padding: "2px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.status === "actual" ? "실데이터" : row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {orderOptionsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                  ⏳ AI 분석 중...
                </div>
              ) : orderOptionsError ? (
                <div style={{ padding: 16, background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                    ⚠️ {orderOptionsError}
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b7280" }}>
                    근거 없는 데모 수량은 표시하지 않습니다.
                  </p>
                </div>
              ) : displayItems.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                  추천 주문 데이터 연동 대기
                </div>
              ) : (
                <>
                  {displayItems.map((item) => (
                    <div key={item.id} style={card({ padding: 16 })}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{item.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, background: "#f3f4f6", padding: "2px 8px", borderRadius: 999 }}>{item.confidence}%</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
                        <div style={{ background: "#f3f4f6", borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>본사 지시</div>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{item.qty > 0 ? `${item.qty}${item.unit}` : "-"}</div>
                        </div>
                        <span>→</span>
                        <div style={{ background: "rgba(255,110,0,.07)", border: "1.5px solid rgba(255,110,0,.2)", borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 11, color: "#ff6e00", fontWeight: 700 }}>AI 추천</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#ff6e00" }}>{item.aiQty}{item.unit}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, padding: 8, background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
                        {item.aiReason}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <button onClick={() => setAutoStep(3)} disabled={orderOptionsLoading || displayItems.length === 0} style={{ width: "100%", height: 54, borderRadius: 14, border: 0, background: orderOptionsLoading || displayItems.length === 0 ? "#9ca3af" : "linear-gradient(135deg, #ff6e00, #e91e8c)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: orderOptionsLoading || displayItems.length === 0 ? "not-allowed" : "pointer", animation: orderOptionsLoading || displayItems.length === 0 ? "none" : "order-glow 1.8s ease-in-out infinite" }}>검토 완료 →</button>
            </div>
          )}

          {autoStep === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {confirmSuccess ? (
                <div style={{ padding: 24, background: "#ecfdf5", borderRadius: 16, border: "1px solid #6ee7b7", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#065f46", marginBottom: 8 }}>
                    발주가 확정되었습니다!
                  </div>
                  <div style={{ fontSize: 14, color: "#047857", marginBottom: 16 }}>
                    주문 목록으로 돌아갑니다...
                  </div>
                  <button
                    onClick={() => { setMode("overview"); setAutoStep(1); setConfirmSuccess(false); }}
                    style={{ padding: "12px 24px", borderRadius: 12, border: 0, background: "#059669", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                  >
                    확인
                  </button>
                </div>
              ) : (
                <>
                  {displayItems.map((item) => (
                    <div key={item.id} style={card({ padding: 16 })}>
                      <span style={{ fontSize: 15, fontWeight: 800, display: "block", marginBottom: 10 }}>{item.name}</span>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#6b7280" }}>최종 발주 수량</span>
                        <div style={{ display: "flex", alignItems: "center", border: "1px solid #e7ebf3", borderRadius: 12 }}>
                          <button onClick={() => setQtyAdjustments(p => ({...p, [item.id]: Math.max(0, (p[item.id]??item.aiQty)-1)}))} style={{ width: 34, height: 34, border: 0, background: "#f8fafc", cursor: "pointer" }}>−</button>
                          <span style={{ minWidth: 50, textAlign: "center", fontWeight: 800 }}>{qtyAdjustments[item.id]??item.aiQty}{item.unit}</span>
                          <button onClick={() => setQtyAdjustments(p => ({...p, [item.id]: (p[item.id]??item.aiQty)+1}))} style={{ width: 34, height: 34, border: 0, background: "#f8fafc", cursor: "pointer" }}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {confirmError && (
                    <div style={{ padding: 12, background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca" }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                        ⚠️ {confirmError}
                      </p>
                    </div>
                  )}
                  
                  <button 
                    onClick={handleConfirmOrder} 
                    disabled={confirming || isUsingDemo || displayItems.length === 0}
                    style={{ 
                      width: "100%", height: 54, borderRadius: 14, border: 0, 
                      background: confirming || isUsingDemo || displayItems.length === 0 ? "#9ca3af" : "linear-gradient(135deg, #ff6e00, #e91e8c)", 
                      color: "#fff", fontWeight: 800, fontSize: 15, 
                      cursor: confirming || isUsingDemo || displayItems.length === 0 ? "not-allowed" : "pointer",
                      animation: confirming ? "none" : "order-glow 1.8s ease-in-out infinite"
                    }}
                  >
                    {confirming ? "⏳ 발주 확정 중..." : isUsingDemo ? "데모 데이터로 불가" : "최종 발주 확정"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* 헤더 버튼 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "stretch" }}>
          <button
            onClick={() => setMode("auto")}
            style={{
              padding: "20px 24px",
              borderRadius: 20,
              border: 0,
              background: "linear-gradient(135deg, #111827, #1f2937)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
              animation: "psychology-pulse 2s ease-in-out infinite",
            }}
          >
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#ff6e00" }}>
                🤖 자동 발주 (AI)
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.7)" }}>
                로이 AI가 매장 데이터를 분석해 최적의 발주 리스트를 제안합니다.
              </p>
            </div>
            <span style={{ fontSize: 20, padding: "10px 14px", background: "rgba(255,255,255,.1)", borderRadius: 12, color: "#fff", fontWeight: 800 }}>
              →
            </span>
          </button>

          {/* 수동 개별 발주 버튼 */}
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              padding: "20px 24px",
              borderRadius: 20,
              border: "2px dashed #d1d5db",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minWidth: 140,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#ff6e00";
              e.currentTarget.style.background = "#fff7f0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.background = "#fff";
            }}
          >
            <span style={{ fontSize: 28 }}>✏️</span>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800, color: "#111827" }}>수동 발주</p>
              <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>개별 품목 등록</p>
            </div>
          </button>
        </div>

        {/* 요약 (단일 가로형 배너) */}
        <div style={card({ padding: 0, overflow: "hidden", display: "flex", boxSizing: "border-box" })}>
          <div style={{ flex: 1.5, padding: "20px 24px", background: "linear-gradient(135deg, rgba(255,110,0,.06), rgba(233,30,140,.04))", display: "flex", alignItems: "center", gap: 16 }}>
             <span style={{ fontSize: 32 }}>💰</span>
             <div>
               <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, marginBottom: 4 }}>이번 달 총 발주금액</div>
               <div style={{ fontSize: 26, fontWeight: 800, color: "#ff6e00", letterSpacing: "-0.03em" }}>{totalAmt.toLocaleString()}원</div>
             </div>
          </div>
          <div style={{ flex: 2, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderLeft: "1px solid #e7ebf3" }}>
            {[
              { label: "대기", val: waiting, color: "#6b7280", icon: "⏳" },
              { label: "진행", val: inProgress, color: "#2563eb", icon: "📦" },
              { label: "완료", val: done, color: "#16a34a", icon: "✅" }
            ].map(s => (
              <div key={s.label} style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center", borderRight: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>
                  <span>{s.icon}</span> {s.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}건</div>
              </div>
            ))}
          </div>
        </div>

        {/* 필터 */}
        <div style={card({ padding: "14px 20px" })}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>카테고리</span>
            <div style={{ display: "flex", gap: 7 }}>
              {catFilters.map(c => (
                <button key={c} onClick={() => setCatFilter(c)} style={{ height: 32, padding: "0 13px", borderRadius: 999, border: catFilter === c ? 0 : "1px solid #e7ebf3", background: catFilter === c ? "linear-gradient(135deg,#ff6e00,#e91e8c)" : "#fff", color: catFilter === c ? "#fff" : "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{c}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 22, background: "#e7ebf3" }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>상태</span>
            <div style={{ display: "flex", gap: 7 }}>
              {stFilters.map(s => (
                <button key={s} onClick={() => setStFilter(s)} style={{ height: 32, padding: "0 13px", borderRadius: 999, border: stFilter === s ? 0 : "1px solid #e7ebf3", background: stFilter === s ? "#111827" : "#fff", color: stFilter === s ? "#fff" : "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 테이블 */}
        <div style={card({ padding: 0, overflow: "auto" })}>
          <div style={{ minWidth: 780 }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 80px 100px 90px 160px", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e7ebf3" }}>
              {["발주번호", "품목명", "카테고리", "수량", "총금액", "납품요청일", "상태 · 액션"].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>{h}</span>
              ))}
            </div>
            {filtered.length === 0 && <div style={{ padding: 48, textAlign: "center", color: "#9ca3af" }}>해당 조건의 발주 내역이 없습니다.</div>}
            {filtered.map((order, i) => {
              const sm = statusMeta[order.status];
              const total = order.unitPrice > 0 ? order.qty * order.unitPrice : 0;
              const ns = nextStatusMap[order.status];
              return (
                <div key={order.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 80px 100px 90px 160px", padding: "12px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none", alignItems: "center", background: order.status === "취소" ? "#fafafa" : "#fff", opacity: order.status === "취소" ? 0.6 : 1 }}>
                  <button onClick={() => setDetailTarget(order)} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", textDecoration: "underline" }}>{order.id}</span>
                  </button>
                  <div style={{ fontSize: 13, fontWeight: 700, minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.productName}</div>
                    {order.memo && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {order.memo}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: `${categoryColor[order.category]}18`, color: categoryColor[order.category] }}>{order.category}</span>
                  <span style={{ fontSize: 12 }}>{order.qty.toLocaleString()}{order.unit}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: order.unitPrice > 0 ? "#ff6e00" : "#9ca3af" }}>{order.unitPrice > 0 ? `${total.toLocaleString()}원` : "미확정"}</span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{order.requestDate}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: sm.bg, color: sm.color, whiteSpace: "nowrap" }}>{sm.icon} {order.status}</span>
                    <button onClick={() => setDetailTarget(order)} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e7ebf3", background: "#fff", cursor: "pointer", fontSize: 12 }}>🔍</button>
                    {ns && (
                      <button onClick={() => setEditTarget({ order, nextStatus: ns })} style={{ height: 26, padding: "0 8px", borderRadius: 7, border: 0, background: order.memo?.includes("AI") ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#111827", color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>{order.memo?.includes("AI") ? "추천 적용" : ns}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 상태 범례 */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {STATUSES.map(s => (
            <div key={s} style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: statusMeta[s].bg, color: statusMeta[s].color }}>{statusMeta[s].icon} {s}</div>
          ))}
        </div>
      </div>

      {/* 모달 */}
      {createOpen && <OrderModal initial={null} onSave={handleCreate} onCancel={() => setCreateOpen(false)} isNew />}
      {editTarget && <OrderModal initial={editTarget.order} nextStatus={editTarget.nextStatus} onSave={handleEdit} onCancel={() => setEditTarget(null)} isNew={false} />}
      {detailTarget && <DetailModal order={detailTarget} onClose={() => setDetailTarget(null)} />}

      <style>{`
        @keyframes order-glow {
          0%, 100% { box-shadow: 0 4px 14px rgba(233,30,140,0.3); }
          50% { box-shadow: 0 4px 28px rgba(233,30,140,0.72), 0 0 0 5px rgba(255,110,0,0.16); }
        }
      `}</style>
    </>
  );
}
