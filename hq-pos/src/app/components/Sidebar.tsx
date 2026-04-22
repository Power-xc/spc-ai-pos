import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AiBriefingModal } from "./AiBriefingModal";

const mainNav = [
  { icon: "⌂", label: "종합 현황",       to: "/",            },
  { icon: "◪", label: "점포 운영 현황",  to: "/store-ops",   },
  { icon: "▣", label: "매출 분석",       to: "/sales",       },
  { icon: "◧", label: "재고 관리",       to: "/inventory",   },
  { icon: "☰", label: "리포트",          to: "/reports",     },
];

const workspaceNav = [
  { icon: "✦", label: "AI 인사이트",     to: "/ai-insights",  },
  { icon: "→", label: "지금 할일",       to: "/actions",     badge: 8, badgeUrgency: "urgent" as const },
  { icon: "⌕", label: "이상 감지 현황",  to: "/issues",      badge: 3, badgeUrgency: "warning" as const },
  { icon: "◎", label: "알림 설정",       to: "/alerts"       },
];

const badgeColors = {
  urgent:  { bg: "#dc2626", shadow: "rgba(220,38,38,0.3)" },
  warning: { bg: "#d97706", shadow: "rgba(217,119,6,0.3)" },
  info:    { bg: "#2563eb", shadow: "rgba(37,99,235,0.2)" },
  default: { bg: "linear-gradient(135deg, #ff6e00, #e91e8c)", shadow: "rgba(233,30,140,0.2)" },
};

function NavItem({
  icon,
  label,
  to,
  active,
  badge,
  badgeUrgency,
}: {
  icon: string;
  label: string;
  to: string;
  active: boolean;
  badge?: number;
  badgeUrgency?: "urgent" | "warning" | "info";
}) {
  const bc = badgeUrgency ? badgeColors[badgeUrgency] : badgeColors.default;
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        height: 46,
        padding: "0 14px",
        borderRadius: 14,
        color: active ? "#ff6e00" : "#374151",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 700,
        background: active
          ? "linear-gradient(135deg, rgba(255,110,0,.12), rgba(233,30,140,.10))"
          : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            background: active ? "#fff" : "#f3f4f6",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        {label}
      </div>
      {badge && badge > 0 && (
        <span
          style={{
            background: active ? "#ff6e00" : bc.bg,
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 8,
            minWidth: 18,
            textAlign: "center",
            boxShadow: active ? "none" : `0 4px 10px ${bc.shadow}`,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingDismissed, setBriefingDismissed] = useState(false);

  return (
    <>
      <aside
        style={{
          gridArea: "sidebar",
          background: "#ffffff",
          borderRight: "1px solid #e7ebf3",
          padding: open ? "15px 12px" : "15px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          overflowY: "auto",
          overflowX: "visible",
          position: "relative",
          transition: "padding 0.28s",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: open ? 10 : 0,
            padding: open ? "6px 8px 10px" : "10px 0",
            borderBottom: "1px solid #e7ebf3",
            flexShrink: 0,
            justifyContent: open ? "flex-start" : "center",
          }}
        >
          {open && (
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 15,
                background: "linear-gradient(135deg, #1e3a5f, #2563eb)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: 11,
                flexShrink: 0,
                letterSpacing: "-0.5px",
              }}
            >
              HQ
            </div>
          )}
          {open && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 15, color: "#111827" }}>
                BR 코리아 본사
              </strong>
              <span style={{ fontSize: 12, color: "#6b7280" }}>HQ 운영 대시보드</span>
            </div>
          )}
          <button
            onClick={onToggle}
            title={open ? "사이드바 접기" : "사이드바 펼치기"}
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              border: "1px solid #e7ebf3",
              background: "#f8fafc",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: "#9ca3af",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1" y="6.25" width="8" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1" y="9.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <div>
          {open && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#9ca3af",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0 10px",
                marginBottom: 8,
              }}
            >
              HQ Main
            </div>
          )}
          <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mainNav.map((item) =>
              open ? (
                <NavItem key={item.to} {...item} active={pathname === item.to || (item.to === "/" && pathname === "/dashboard")} />
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    height: 40,
                    borderRadius: 12,
                    background:
                      pathname === item.to || (item.to === "/" && pathname === "/dashboard")
                        ? "linear-gradient(135deg, rgba(255,110,0,.12), rgba(233,30,140,.10))"
                        : "transparent",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      background: pathname === item.to || (item.to === "/" && pathname === "/dashboard") ? "#fff" : "#f3f4f6",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                    }}
                  >
                    {item.icon}
                  </span>
                </Link>
              )
            )}
          </nav>
        </div>

        <div>
          {open && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#9ca3af",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0 10px",
                marginBottom: 8,
              }}
            >
              Workspace
            </div>
          )}
          <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {workspaceNav.map((item) =>
              open ? (
                <NavItem key={item.to} {...item} active={pathname === item.to} />
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    height: 40,
                    borderRadius: 12,
                    background:
                      pathname === item.to
                        ? "linear-gradient(135deg, rgba(255,110,0,.12), rgba(233,30,140,.10))"
                        : "transparent",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      background: pathname === item.to ? "#fff" : "#f3f4f6",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                    }}
                  >
                    {item.icon}
                  </span>
                </Link>
              )
            )}
          </nav>
        </div>

        {open && !briefingDismissed && (
          <div
            style={{
              marginTop: "auto",
              background: "linear-gradient(180deg, #111827, #1f2937)",
              color: "#fff",
              borderRadius: 18,
              padding: 18,
              flexShrink: 0,
              zIndex: 10,
              position: "relative",
            }}
          >
            <button
              onClick={() => setBriefingDismissed(true)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 22,
                height: 22,
                border: 0,
                borderRadius: 6,
                background: "rgba(255,255,255,.12)",
                color: "rgba(255,255,255,.6)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                lineHeight: 1,
                fontWeight: 700,
              }}
              title="닫기"
            >
              ✕
            </button>
            <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>본사 AI 브리핑</h3>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 11,
                lineHeight: 1.5,
                color: "rgba(255,255,255,.72)",
              }}
            >
              전체 33개 점포 운영 핵심 이슈 요약
            </p>
            <button
              onClick={() => setBriefingOpen(true)}
              style={{
                width: "100%",
                height: 34,
                border: 0,
                borderRadius: 10,
                background: "linear-gradient(135deg, #ff6e00, #e91e8c)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              브리핑 열기
            </button>
          </div>
        )}

        <button
          onClick={onToggle}
          style={{
            position: "absolute",
            right: -12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 48,
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: "0 10px 10px 0",
            boxShadow: "2px 0 8px rgba(0,0,0,0.06)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            color: "#9ca3af",
            zIndex: 20,
            padding: 0,
          }}
        >
          {open ? "‹" : "›"}
        </button>
      </aside>

      {briefingOpen && (
        <AiBriefingModal onClose={() => setBriefingOpen(false)} />
      )}
    </>
  );
}