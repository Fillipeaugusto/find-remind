import type { Redis } from "ioredis";

export function createCache(redis: Redis) {
  return {
    // Values must be JSON-serializable; dates should be represented as ISO strings.
    async cached<T>(key: string, ttlSeconds: number, fn: () => T | Promise<T>): Promise<T> {
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new RangeError("Cache TTL must be a positive integer in seconds");
      }

      const stored = await redis.get(key);
      if (stored !== null) return JSON.parse(stored) as T;

      const value = await fn();
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new TypeError("Cache values must be JSON-serializable");
      }
      await redis.set(key, serialized, "EX", ttlSeconds);
      return value;
    },

    async invalidate(pattern: string): Promise<void> {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
