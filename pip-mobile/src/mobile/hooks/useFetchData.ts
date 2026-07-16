import { useState, useEffect, useRef, type DependencyList } from "react";
import { cacheGet, cacheSet } from "@/mobile/lib/cache";

interface UseFetchDataOptions {
  cacheKey?: string;
  ttlMs?: number;
}

interface UseFetchDataResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const inflightRequests = new Map<string, Promise<unknown>>();

export function useFetchData<T>(
  fetcher: () => Promise<T>,
  options: UseFetchDataOptions = {},
  deps: DependencyList = [],
): UseFetchDataResult<T> {
  const { cacheKey, ttlMs } = options;
  const [data, setData] = useState<T | null>(() =>
    cacheKey ? (cacheGet<T>(cacheKey) ?? null) : null,
  );
  const [loading, setLoading] = useState<boolean>(!data);
  const [error, setError] = useState<Error | null>(null);
  const tickRef = useRef(0);

  function run() {
    if (cacheKey) {
      const cached = cacheGet<T>(cacheKey);
      if (cached !== undefined) {
        setData(cached);
        setLoading(false);
        return;
      }
      const inflight = inflightRequests.get(cacheKey) as Promise<T> | undefined;
      if (inflight) {
        setLoading(true);
        const tick = ++tickRef.current;
        inflight.then((result) => {
          if (tick !== tickRef.current) return;
          setData(result);
          setLoading(false);
        }).catch((err: unknown) => {
          if (tick !== tickRef.current) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        });
        return;
      }
    }
    const tick = ++tickRef.current;
    setLoading(true);
    setError(null);
    const promise = fetcher()
      .then((result) => {
        if (cacheKey) {
          inflightRequests.delete(cacheKey);
          cacheSet(cacheKey, result, ttlMs);
        }
        if (tick !== tickRef.current) return result;
        setData(result);
        setLoading(false);
        return result;
      })
      .catch((err: unknown) => {
        if (cacheKey) inflightRequests.delete(cacheKey);
        if (tick !== tickRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    if (cacheKey) inflightRequests.set(cacheKey, promise);
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run };
}