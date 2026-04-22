import type { PosModal } from "@/types/api";

export type SSEHandlers = {
  onModal?: (data: PosModal) => void;
  onRefresh?: (data: any) => void;
  onHeartbeat?: () => void;
  onError?: () => void;
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8100";
const DEFAULT_ROLE = import.meta.env.VITE_USER_ROLE || "store_owner";
const DEFAULT_USER_ID = import.meta.env.VITE_USER_ID || "U001";

export class SSEClient {
  private eventSource: EventSource | null = null;

  connect(storeId: string, handlers: SSEHandlers) {
    const params = new URLSearchParams({
      user_id: DEFAULT_USER_ID,
      role: DEFAULT_ROLE,
      store_id: storeId,
    });
    this.eventSource = new EventSource(
      `${API_BASE}/api/notifications/stream?${params.toString()}`,
    );

    this.eventSource.addEventListener("modal", (event) => {
      handlers.onModal?.(JSON.parse((event as MessageEvent).data));
    });

    this.eventSource.addEventListener("refresh", (event) => {
      handlers.onRefresh?.(JSON.parse((event as MessageEvent).data));
      handlers.onHeartbeat?.();
    });

    this.eventSource.onerror = () => {
      handlers.onError?.();
    };
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
