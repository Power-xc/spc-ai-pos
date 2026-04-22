import type { CSSProperties } from "react";

const rows = [
  { item: "오후 음료 매출",    value: "2,100,000원", change: "-12.4%", status: "주의", statusClass: "bad"  },
  { item: "시그니처 메뉴 재고", value: "잔여 14개",   change: "소진 3h", status: "관찰", statusClass: "warn" },
  { item: "세트 업셀 전환율",  value: "18.3%",       change: "-2.2%",  status: "관찰", statusClass: "warn" },
];

const statusStyle: Record<string, CSSProperties> = {
  good: { background: "#ebf9ef", color: "#16a34a" },
  warn: { background: "#fff7e8", color: "#d97706" },
  bad:  { background: "#feecec", color: "#dc2626" },
};

export function DataTable({ title = "익일 예상 판매 리포트" }: { title?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e7ebf3",
        borderRadius: 20,
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 800 }}>{title}</h3>
        <button
          style={{
            background: "transparent",
            border: 0,
            color: "#ff6e00",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          다운로드
        </button>
      </div>

      <div style={{ border: "1px solid #e7ebf3", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["항목", "현재 값", "기준 대비", "상태"].map((th) => (
                <th
                  key={th}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#6b7280",
                    borderBottom: "1px solid #eef2f7",
                  }}
                >
                  {th}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                style={{ borderBottom: idx < rows.length - 1 ? "1px solid #eef2f7" : "none" }}
              >
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", fontWeight: 600 }}>
                  {row.item}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#111827", fontWeight: 700 }}>
                  {row.value}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: row.change.startsWith("+") ? "#16a34a" : row.change.startsWith("-") ? "#dc2626" : "#d97706",
                  }}
                >
                  {row.change}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 999,
                      ...statusStyle[row.statusClass],
                    }}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
