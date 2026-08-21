type CacheEntry<T> = { value: T; expiresAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __aiwayTtlCache: Map<string, CacheEntry<unknown>> | undefined;
}

function store() {
  if (!global.__aiwayTtlCache) global.__aiwayTtlCache = new Map();
  return global.__aiwayTtlCache;
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = store().get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store().delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  store().set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string) {
  store().delete(key);
}

export function cacheDeletePrefix(prefix: string) {
  for (const key of store().keys()) {
    if (key.startsWith(prefix)) store().delete(key);
  }
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}
