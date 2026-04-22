import { useState } from "react";

interface AiBriefingModalProps {
  onClose: () => void;
}

const briefingItems = [
  {
    id: 1,
    badge: "🔴 긴급",
    badgeColor: "#dc2626",
    badgeBg: "#feecec",
    title: "재고 위험 점포 다수 감지",
    summary:
      "전체 33개 점포 중 재고 소진 위험 품목 3개 이상인 점포가 감지되었습니다. 도넛 주력 상품과 원두 재고가 오후 기준 임계치 이하입니다.",
    time: "기준 시각: 14:45",
    action: "재고 관리 확인",
  },
  {
    id: 2,
    badge: "🟠 주의",
    badgeColor: "#d97706",
    badgeBg: "#fff7ed",
    title: "오후 시간대 매출 하락세",
    summary:
      "14:00~16:00 구간 전체 점포 평균 매출이 전주 대비 하락 추세. 오프라인 매장 중심 점포에서 특히 두드러집니다.",
    time: "기준 시각: 14:30",
    action: "매출 분석 확인",
  },
  {
    id: 3,
    badge: "🟡 확인",
    badgeColor: "#ca8a04",
    badgeBg: "#fefce8",
    title: "캠페인 미참여 점포 8곳",
    summary:
      "캠페인 매출 비중이 0%인 점포 8곳이 확인되었습니다. 참여율 향상을 위한 안내 발송이 권장됩니다.",
    time: "기준 시각: 14:00",
    action: "리포트 확인",
  },
];

const aiSummaryLines = [
  "전체 33개 점포 운영에서 즉시 대응이 필요한 이슈는 총 3건입니다.",
  "재고 위험 점포와 오후 매출 하락이 가장 큰 영향을 주고 있습니다.",
  "재고 관리 탭에서 위험 점포를 먼저 확인할 것을 권장합니다.",
];

export function AiBriefingModal({ onClose }: AiBriefingModalProps) {
  const [expandedId, setExpandedId] = useState<number | null>(1);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            top: -50,
            right: 0,
            cursor: "pointer",
            background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
            color: "#fff",
            width: 38,
            height: 38,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            boxShadow: "0 4px 14px rgba(233,30,140,0.4)",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          ×
        </div>

        {/* Modal Content */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 560,
            background: "#fff",
            borderRadius: 24,
            boxShadow: "0 32px 80px rgba(15,23,42,0.22)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
          }}
        >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            padding: "24px 24px 20px",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20,
                  boxShadow: "0 8px 20px rgba(233,30,140,0.35)",
                }}
              >
                ✦
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                  오늘의 AI 브리핑
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                  {new Date().toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}{" "}
                  · BR 코리아 본사 · 전체 33개 점포
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.2)",
                background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.8)",
                cursor: "pointer",
                fontSize: 18,
                display: "grid",
                placeItems: "center",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* AI Summary */}
          <div
            style={{
              background: "rgba(255,255,255,.07)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,.5)",
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              AI 종합 요약
            </div>
            {aiSummaryLines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: i < aiSummaryLines.length - 1 ? 7 : 0,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: 1,
                    color: "#fff",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.55 }}>
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Issues */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#9ca3af",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            이슈 상세 ({briefingItems.length}건)
          </div>

          {briefingItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const isDone = checkedIds.has(item.id);

            return (
              <div
                key={item.id}
                style={{
                  border: `1.5px solid ${isExpanded ? "#ff6e00" : "#e7ebf3"}`,
                  borderRadius: 18,
                  overflow: "hidden",
                  opacity: isDone ? 0.5 : 1,
                  transition: "opacity 0.2s, border-color 0.2s",
                  background: isDone ? "#f8fafc" : "#fff",
                }}
              >
                {/* Issue Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  {/* Check button */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCheck(item.id);
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 8,
                      border: isDone ? "none" : "2px solid #d1d5db",
                      background: isDone
                        ? "linear-gradient(135deg, #ff6e00, #e91e8c)"
                        : "transparent",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      color: "#fff",
                      fontSize: 12,
                    }}
                  >
                    {isDone ? "✓" : ""}
                  </div>

                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      background: item.badgeBg,
                      color: item.badgeColor,
                      flexShrink: 0,
                    }}
                  >
                    {item.badge}
                  </span>

                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 700,
                      color: isDone ? "#9ca3af" : "#111827",
                      textDecoration: isDone ? "line-through" : "none",
                    }}
                  >
                    {item.title}
                  </span>

                  <span
                    style={{
                      color: "#9ca3af",
                      fontSize: 18,
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                      lineHeight: 1,
                    }}
                  >
                    ⌄
                  </span>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      padding: "14px 16px 16px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: 13,
                        color: "#374151",
                        lineHeight: 1.65,
                      }}
                    >
                      {item.summary}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{item.time}</span>
                      <button
                        onClick={() => toggleCheck(item.id)}
                        style={{
                          height: 34,
                          padding: "0 16px",
                          borderRadius: 999,
                          border: 0,
                          background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                          color: "#fff",
                          fontWeight: 800,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {isDone ? "✓ 처리 완료" : item.action} →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e7ebf3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            처리 완료: {checkedIds.size} / {briefingItems.length}건
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                height: 38,
                padding: "0 18px",
                borderRadius: 12,
                border: 0,
                background: "linear-gradient(135deg, #111827, #374151)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              리포트로 내보내기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}