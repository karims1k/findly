import { Redis } from "@upstash/redis";

// Prefers a real shared cache (Upstash Redis) so a cache hit is shared
// across all of Vercel's serverless instances, not just one lucky warm
// process. Falls back to a per-instance in-memory Map when no Redis
// credentials are configured (e.g. local dev without the integration
// connected), so the app keeps working either way — just without
// cross-instance sharing in that case. Checks both env var naming
// conventions since Vercel's Upstash integration can surface either
// (`UPSTASH_REDIS_REST_*` or the older `KV_REST_API_*` names).
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

export async function getCached<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const value = await redis.get<T>(key);
      return value ?? null;
    } catch (err) {
      // A transient Redis error should fall through to a live search,
      // not fail the whole request.
      console.error("[cache] Redis read failed, falling back to a live search:", err);
      return null;
    }
  }

  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, value, { px: ttlMs });
    } catch (err) {
      console.error("[cache] Redis write failed (result was still returned to the client):", err);
    }
    return;
  }

  memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}
