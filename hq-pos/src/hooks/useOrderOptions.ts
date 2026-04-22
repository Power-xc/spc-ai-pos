import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import type { OrderOptionsData } from "@/types/api";

export function useOrderOptions(storeId: string, category?: string) {
  const [data, setData] = useState<OrderOptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getOrderOptions(storeId, category);
      setData(res.data ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.error?.message || "주문 옵션 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [storeId, category]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
