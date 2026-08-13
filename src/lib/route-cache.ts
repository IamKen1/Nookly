const store = new Map<string, { value: unknown; expiresAt: number }>();

export async function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await fetcher();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidateCached(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
