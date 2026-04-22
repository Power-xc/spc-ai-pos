import { useCallback, useEffect, useState } from "react";

// TODO: 현재 미사용. 주기적 데이터 갱신이 필요한 컴포넌트에서 활용 예정.
// 기존 훅들(useDashboard 등)에 이미 polling이 내장되어 있어 추가 사용처 없음.
// 필요시 web-pos-ai 페이지 등 다른 곳에서 활용 가능.

type PollingResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function usePollingResource<T>(
  loader: () => Promise<T>,
  intervalMs = 30_000,
): PollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const nextData = await loader();
      setData(nextData);
      setError(null);
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, refresh]);

  return { data, loading, error, refresh };
}
