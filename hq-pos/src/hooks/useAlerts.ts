import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { SSEClient } from "@/lib/sse-client";
import type { AlertCard, PosModal } from "@/types/api";

function modalToAlert(modal: PosModal): AlertCard {
  return {
    id: modal.modal_id,
    severity:
      modal.severity === "critical" ? "HIGH" : modal.severity === "warning" ? "MEDIUM" : "LOW",
    type:
      modal.modal_type === "production_alert"
        ? "production"
        : modal.modal_type === "order_deadline"
          ? "order"
          : "sales",
    title: modal.title,
    subtitle: modal.data?.items?.[0]?.note,
    message: modal.body,
    cta: modal.actions?.[0]
      ? {
          label: modal.actions[0].label,
          action: modal.actions[0].action_type,
          route: modal.actions[0].api_endpoint,
        }
      : undefined,
    created_at: modal.created_at,
    read: false,
  };
}

export function useAlerts(storeId: string) {
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeModal, setActiveModal] = useState<PosModal | null>(null);
  const sseRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    const sse = new SSEClient();
    sseRef.current = sse;

    sse.connect(storeId, {
      onModal: (modal) => {
        setActiveModal(modal);
        setAlerts((prev) => [modalToAlert(modal), ...prev]);
      },
      onHeartbeat: () => setConnected(true),
      onError: () => setConnected(false),
    });

    return () => sse.disconnect();
  }, [storeId]);

  const markAsRead = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, read: true } : alert,
      ),
    );
  };

  const respondToModal = async (actionType: string, params: Record<string, any> = {}) => {
    if (!activeModal) return null;
    const response = await api.respondToModal(activeModal.modal_id, actionType, params, storeId);
    if (actionType !== "modify") {
      markAsRead(activeModal.modal_id);
      setActiveModal(null);
    }
    return response;
  };

  const dismissModal = () => {
    setActiveModal(null);
  };

  const unreadCount = alerts.filter((alert) => !alert.read).length;

  return { alerts, connected, markAsRead, unreadCount, activeModal, respondToModal, dismissModal };
}
