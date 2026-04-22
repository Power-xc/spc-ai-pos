import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { emitTodoUpdated, subscribeTodoUpdated } from "../components/todo-sync";

type TodoStatus = "대기" | "실행중" | "완료" | "보류";
type TodoPriority = "긴급" | "중요" | "일반";
type TodoFilter = "미완료" | "대기" | "실행중" | "완료" | "보류";

interface TodoItem {
  id: string;
  title: string;
  summary: string;
  status: TodoStatus;
  priority: TodoPriority;
  source: string;
  route: string;
  occurred_at: string;
}

const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || "POC_001";
const DEFAULT_USER_ROLE = import.meta.env.VITE_USER_ROLE || "store_owner";
const DEFAULT_USER_ID = import.meta.env.VITE_USER_ID || "U001";

const FILTERS: TodoFilter[] = ["미완료", "대기", "실행중", "완료", "보류"];

const QUERY_BY_FILTER: Record<TodoFilter, "pending" | "incomplete" | "completed" | "hold"> = {
  미완료: "incomplete",
  대기: "pending",
  실행중: "pending",
  완료: "completed",
  보류: "hold",
};

const priorityStyle: Record<TodoPriority, { color: string; bg: string }> = {
  긴급: { color: "#dc2626", bg: "#feecec" },
  중요: { color: "#d97706", bg: "#fff7e8" },
  일반: { color: "#2563eb", bg: "#eaf2ff" },
};

const statusStyle: Record<TodoStatus, { color: string; bg: string }> = {
  대기: { color: "#6b7280", bg: "#f3f4f6" },
  실행중: { color: "#2563eb", bg: "#eaf2ff" },
  완료: { color: "#16a34a", bg: "#ebf9ef" },
  보류: { color: "#d97706", bg: "#fff7e8" },
};

function formatOccurredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActionsPage() {
  const [filter, setFilter] = useState<TodoFilter>("미완료");
  const filterRef = useRef<TodoFilter>("미완료");
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoadingById, setActionLoadingById] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const fetchTodos = useCallback(async (nextFilter: TodoFilter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const queryStatus = QUERY_BY_FILTER[nextFilter];
      const response = await api.getActionTodos({
        store_id: DEFAULT_STORE_ID,
        status: queryStatus,
        limit: 100,
      });
      const fetched = Array.isArray((response.data as any)?.items)
        ? ((response.data as any).items as TodoItem[])
        : [];

      if (nextFilter === "대기") {
        setItems(fetched.filter((item) => item.status === "대기"));
      } else if (nextFilter === "실행중") {
        setItems(fetched.filter((item) => item.status === "실행중"));
      } else {
        setItems(fetched);
      }
    } catch (error: any) {
      const message =
        error?.error?.message || error?.message || "할일 목록을 불러오지 못했습니다.";
      setItems([]);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTodos(filter);
  }, [filter, fetchTodos]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const unsubscribe = subscribeTodoUpdated(() => {
      void fetchTodos(filter);
    });
    return unsubscribe;
  }, [fetchTodos, filter]);

  useEffect(() => {
    const params = new URLSearchParams({
      store_id: DEFAULT_STORE_ID,
      role: DEFAULT_USER_ROLE,
      user_id: DEFAULT_USER_ID,
    });
    const source = new EventSource(`/api/notifications/stream?${params.toString()}`);
    const refreshFromRealtime = () => {
      void fetchTodos(filterRef.current);
    };

    source.addEventListener("todo_updated", refreshFromRealtime as EventListener);
    source.addEventListener("order_confirmed", refreshFromRealtime as EventListener);
    source.addEventListener("refresh", refreshFromRealtime as EventListener);
    source.onopen = () => setRealtimeConnected(true);
    source.onerror = () => setRealtimeConnected(false);

    return () => {
      source.removeEventListener("todo_updated", refreshFromRealtime as EventListener);
      source.removeEventListener("order_confirmed", refreshFromRealtime as EventListener);
      source.removeEventListener("refresh", refreshFromRealtime as EventListener);
      source.close();
    };
  }, [fetchTodos]);

  const runTodoAction = useCallback(
    async (todoId: string, action: "complete" | "hold") => {
      setActionLoadingById((prev) => ({ ...prev, [todoId]: true }));
      setNotice(null);
      try {
        if (action === "complete") {
          await api.completeActionTodo({ store_id: DEFAULT_STORE_ID, todo_id: todoId });
        } else {
          await api.holdActionTodo({ store_id: DEFAULT_STORE_ID, todo_id: todoId });
        }
        setNotice({
          kind: "success",
          text: action === "complete" ? "완료 처리되었습니다." : "보류 처리되었습니다.",
        });
        emitTodoUpdated({
          todoId,
          action: action === "complete" ? "complete" : "hold",
          updatedAt: new Date().toISOString(),
        });
        await fetchTodos(filter);
      } catch (error: any) {
        const message =
          error?.error?.message || error?.message || "상태 변경 요청에 실패했습니다.";
        setNotice({ kind: "error", text: `${message} (다시 시도하세요)` });
      } finally {
        setActionLoadingById((prev) => ({ ...prev, [todoId]: false }));
      }
    },
    [fetchTodos, filter],
  );

  const summary = useMemo(
    () => ({
      total: items.length,
      urgent: items.filter((item) => item.priority === "긴급").length,
      waiting: items.filter((item) => item.status === "대기").length,
      running: items.filter((item) => item.status === "실행중").length,
      done: items.filter((item) => item.status === "완료").length,
      hold: items.filter((item) => item.status === "보류").length,
    }),
    [items],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e7ebf3",
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
          padding: "18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>정식 Todo API 연동</div>
          <div style={{ marginTop: 4, fontSize: 20, color: "#111827", fontWeight: 800 }}>
            지금 할일 {summary.total}건
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
            긴급 {summary.urgent} · 대기 {summary.waiting} · 실행중 {summary.running} · 완료{" "}
            {summary.done} · 보류 {summary.hold}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: realtimeConnected ? "#16a34a" : "#9ca3af", fontWeight: 700 }}>
            {realtimeConnected ? "실시간 이벤트 연결됨" : "실시간 이벤트 재연결 중"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchTodos(filter)}
          disabled={loading}
          style={{
            height: 34,
            padding: "0 14px",
            borderRadius: 999,
            border: "1px solid #e7ebf3",
            background: loading ? "#f3f4f6" : "#fff",
            color: loading ? "#9ca3af" : "#374151",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          새로고침
        </button>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e7ebf3",
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {FILTERS.map((candidate) => {
          const selected = candidate === filter;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => setFilter(candidate)}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 999,
                border: selected ? 0 : "1px solid #e7ebf3",
                background: selected ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
                color: selected ? "#fff" : "#374151",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {candidate}
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: `1px solid ${notice.kind === "success" ? "#bbf7d0" : "#fecaca"}`,
            background: notice.kind === "success" ? "#f0fdf4" : "#fef2f2",
            color: notice.kind === "success" ? "#166534" : "#991b1b",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{notice.text}</span>
          {notice.kind === "error" && (
            <button
              type="button"
              onClick={() => void fetchTodos(filter)}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid #fecaca",
                background: "#fff",
                color: "#991b1b",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              재시도
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 14,
            padding: "32px 16px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          할일 목록을 불러오는 중입니다...
        </div>
      ) : loadError ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #fecaca",
            borderRadius: 14,
            padding: "24px 16px",
            textAlign: "center",
            color: "#991b1b",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchTodos(filter)}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #fecaca",
              background: "#fff",
              color: "#991b1b",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            다시 불러오기
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf3",
            borderRadius: 14,
            padding: "36px 16px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          조건에 맞는 항목이 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => {
            const busy = Boolean(actionLoadingById[item.id]);
            const pStyle = priorityStyle[item.priority];
            const sStyle = statusStyle[item.status];

            return (
              <div
                key={item.id}
                style={{
                  background: "#fff",
                  border: "1px solid #e7ebf3",
                  borderRadius: 14,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  opacity: busy ? 0.75 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span
                      style={{
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        background: pStyle.bg,
                        color: pStyle.color,
                        fontWeight: 800,
                        fontSize: 11,
                      }}
                    >
                      {item.priority}
                    </span>
                    <span
                      style={{
                        height: 22,
                        padding: "0 8px",
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        background: sStyle.bg,
                        color: sStyle.color,
                        fontWeight: 800,
                        fontSize: 11,
                      }}
                    >
                      {item.status}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>
                      {item.id}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>
                      {formatOccurredAt(item.occurred_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#111827",
                      lineHeight: 1.4,
                      marginBottom: 6,
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{item.summary}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {item.status !== "완료" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runTodoAction(item.id, "complete")}
                      style={{
                        height: 34,
                        padding: "0 12px",
                        borderRadius: 999,
                        border: 0,
                        background: busy ? "#86efac" : "#16a34a",
                        color: "#fff",
                        cursor: busy ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      완료 처리
                    </button>
                  )}
                  {item.status !== "보류" && item.status !== "완료" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runTodoAction(item.id, "hold")}
                      style={{
                        height: 34,
                        padding: "0 12px",
                        borderRadius: 999,
                        border: "1px solid #f59e0b",
                        background: busy ? "#fef3c7" : "#fff",
                        color: "#b45309",
                        cursor: busy ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      보류
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
