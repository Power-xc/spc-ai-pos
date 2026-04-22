import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import type { DashboardData } from "@/types/api";

export function useDashboard(storeId: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getDashboard(storeId);
      setData(res.data ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.error?.message || "Dashboard 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh };
}
