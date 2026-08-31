// Simple in-memory TTL cache to avoid re-billing SerpApi credits for repeat
// searches. This lives in the server process's memory, so it resets on
// restart and isn't shared across instances in a multi-instance/serverless
// deployment — fine for a single dev/small-scale deployment, but a shared
// store (Redis, Vercel KV) would be needed to make caching effective once
// this runs on more than one instance.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
