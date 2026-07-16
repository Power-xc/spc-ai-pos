import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiState, ApiError } from "../types";

function toApiError(err: unknown): ApiError {
  if (
    err !== null &&
    typeof err === "object" &&
    "status" in err &&
    "message" in err &&
    typeof (err as ApiError).status === "number" &&
    typeof (err as ApiError).message === "string"
  ) {
    return err as ApiError;
  }
  if (err instanceof Error) {
    return { status: 0, message: err.message };
  }
  return { status: 0, message: "알 수 없는 오류가 발생했습니다." };
}

/**
 * API 호출을 loading / success / error 상태로 래핑하는 범용 훅.
 *
 * @param apiFn  인자 없이 호출되는 API 함수. deps 바뀔 때마다 재호출.
 * @param deps   React useEffect deps 배열 (기본값: [])
 * @returns [state, refetch]
 *
 * @example
 * const [state] = useApiCall(() => getStatCards());
 * if (state.status === "loading") return <Spinner />;
 * if (state.status === "error") return <p>{state.error.message}</p>;
 * const cards = state.data;
 */
export function useApiCall<T>(
  apiFn: () => Promise<T>,
  deps: React.DependencyList = [],
): [ApiState<T>, () => void] {
  const [state, setState] = useState<ApiState<T>>({
    status: "idle",
    data: null,
    error: null,
  });

  const isMounted = useRef(true);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    setState({ status: "loading", data: null, error: null });

    apiFn()
      .then((data) => {
        if (isMounted.current) {
          setState({ status: "success", data, error: null });
        }
      })
      .catch((err: unknown) => {
        if (isMounted.current) {
          setState({ status: "error", data: null, error: toApiError(err) });
        }
      });

    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, fetchCount]);

  return [state, refetch];
}
