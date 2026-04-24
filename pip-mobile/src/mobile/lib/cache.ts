type CacheEntry<T> = { data: T; expiry: number };

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
  store.set(key, { data, expiry: Date.now() + ttlMs });
}

export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
