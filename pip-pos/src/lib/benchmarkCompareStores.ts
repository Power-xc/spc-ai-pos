import { useSyncExternalStore } from "react";
import {
  DEMO_BENCHMARK_COMPARE_CANDIDATES,
  DEMO_BENCHMARK_COMPARE_STORES,
} from "./demoStoreConfig";

const STORAGE_KEY = "pip-pos-benchmark-compare-stores";
const QUERY_KEY = "benchmark_peers";
const DEFAULT_STORE_IDS = DEMO_BENCHMARK_COMPARE_STORES.map((store) => store.storeId);
const AVAILABLE_STORE_IDS = new Set(
  DEMO_BENCHMARK_COMPARE_CANDIDATES.map((store) => store.storeId),
);

const listeners = new Set<() => void>();

function normalizeStoreIds(values: Array<string | null | undefined>): string[] {
  const normalized: string[] = [];
  values.forEach((value) => {
    const storeId = String(value ?? "").trim().toUpperCase();
    if (!storeId || !AVAILABLE_STORE_IDS.has(storeId) || normalized.includes(storeId)) {
      return;
    }
    normalized.push(storeId);
  });
  return normalized.length > 0 ? normalized : [...DEFAULT_STORE_IDS];
}

function readInitialState(): string[] {
  if (typeof window === "undefined") {
    return [...DEFAULT_STORE_IDS];
  }

  try {
    const url = new URL(window.location.href);
    const queryStores = normalizeStoreIds(
      (url.searchParams.get(QUERY_KEY) ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (url.searchParams.has(QUERY_KEY)) {
      return queryStores;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return normalizeStoreIds(parsed);
      }
    }
  } catch {
    // ignore and use defaults
  }

  return [...DEFAULT_STORE_IDS];
}

let currentStoreIds = readInitialState();

function persistState(next: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const url = new URL(window.location.href);
    url.searchParams.set(QUERY_KEY, next.join(","));
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore persistence failure in demo mode
  }
}

function emitChange() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("benchmark-compare-stores-changed", {
        detail: currentStoreIds,
      }),
    );
  }
}

export function getBenchmarkCompareStoreIds(): string[] {
  return currentStoreIds;
}

export function setBenchmarkCompareStoreIds(nextIds: string[]): string[] {
  currentStoreIds = normalizeStoreIds(nextIds);
  persistState(currentStoreIds);
  emitChange();
  return currentStoreIds;
}

export function resetBenchmarkCompareStoreIds(): string[] {
  currentStoreIds = [...DEFAULT_STORE_IDS];
  persistState(currentStoreIds);
  emitChange();
  return currentStoreIds;
}

export function subscribeBenchmarkCompareStores(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBenchmarkCompareStores() {
  return useSyncExternalStore(
    subscribeBenchmarkCompareStores,
    getBenchmarkCompareStoreIds,
    getBenchmarkCompareStoreIds,
  );
}

export const BENCHMARK_COMPARE_STORE_OPTIONS = DEMO_BENCHMARK_COMPARE_CANDIDATES.map(
  (store) => ({
    storeId: store.storeId,
    storeName: store.storeName,
  }),
);
