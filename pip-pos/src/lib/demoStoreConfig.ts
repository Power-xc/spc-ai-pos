export const DEMO_PRIMARY_STORE_ID = "POC_010";
export const DEMO_PRIMARY_STORE_NAME = "강서구01";

export const DEMO_STORE_NAME_MAP: Record<string, string> = {
  POC_001: "고양시02",
  POC_003: "노원구01",
  POC_009: "마포구02",
  POC_010: "강서구01",
  POC_011: "안양시01",
  POC_012: "마포구01",
  POC_030: "성남시01",
  POC_031: "수원시01",
  POC_032: "여수시01",
  POC_033: "고양시01",
};

export const DEMO_BENCHMARK_COMPARE_STORES = [
  { storeId: "POC_001", storeName: "고양시02" },
  { storeId: "POC_011", storeName: "안양시01" },
  { storeId: "POC_030", storeName: "성남시01" },
  { storeId: "POC_031", storeName: "수원시01" },
  { storeId: "POC_012", storeName: "마포구01" },
  { storeId: "POC_009", storeName: "마포구02" },
] as const;

export const DEMO_BENCHMARK_COMPARE_CANDIDATES = [
  ...DEMO_BENCHMARK_COMPARE_STORES,
  { storeId: "POC_003", storeName: "노원구01" },
] as const;

export const DEMO_BENCHMARK_STORE_COUNT = 31;
export const DEMO_ACTIVE_MASTER_STORE_COUNT = 33;

export function resolveDemoStoreName(storeId: string | null | undefined, fallback?: string | null): string {
  const normalized = String(storeId ?? "").trim().toUpperCase();
  if (normalized && DEMO_STORE_NAME_MAP[normalized]) return DEMO_STORE_NAME_MAP[normalized];
  const fallbackValue = String(fallback ?? "").trim();
  return fallbackValue || normalized;
}
