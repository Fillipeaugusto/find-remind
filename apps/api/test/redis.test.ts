import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { createTestApp } from "./helpers.js";

describe("Redis plugin and cache", () => {
  let app: App;
  let prefix: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    prefix = `test:cache:${randomUUID()}:`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) await app.cache.invalidate(`${prefix}*`);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("exposes a ready Redis connection", async () => {
    expect(app.redis.status).toBe("ready");
    expect(await app.redis.ping()).toBe("PONG");
  });

  it("loads a cache miss and reuses the stored JSON on a hit", async () => {
    const key = `${prefix}result`;
    const value = { items: [{ id: "reminder-1", tags: ["work"] }], nextCursor: null };
    const load = vi.fn().mockResolvedValue(value);

    expect(await app.cache.cached(key, 30, load)).toEqual(value);
    expect(await app.redis.get(key)).toBe(JSON.stringify(value));
    expect(await app.cache.cached(key, 30, load)).toEqual(value);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([null, false, 0, ""])("caches falsy value %j", async (value) => {
    const load = vi.fn().mockResolvedValue(value);
    const key = `${prefix}falsy`;
    expect(await app.cache.cached(key, 30, load)).toBe(value);
    expect(await app.cache.cached(key, 30, load)).toBe(value);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expires entries in Redis and reloads after the TTL", async () => {
    const key = `${prefix}expiring`;
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    expect(await app.cache.cached(key, 1, load)).toBe("first");
    const ttl = await app.redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1_000);

    await vi.waitFor(async () => {
      expect(await app.redis.exists(key)).toBe(0);
    }, { timeout: 3_000, interval: 25 });

    expect(await app.cache.cached(key, 30, load)).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed loader", async () => {
    const key = `${prefix}failure`;
    const load = vi.fn().mockRejectedValueOnce(new Error("load failed")).mockResolvedValueOnce("ok");
    await expect(app.cache.cached(key, 30, load)).rejects.toThrow("load failed");
    expect(await app.redis.exists(key)).toBe(0);
    expect(await app.cache.cached(key, 30, load)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 0.5, NaN, Infinity])("rejects invalid TTL %s before loading", async (ttl) => {
    const load = vi.fn();
    await expect(app.cache.cached(`${prefix}ttl`, ttl, load)).rejects.toThrow("positive integer");
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects undefined without storing an invalid JSON value", async () => {
    const key = `${prefix}undefined`;
    await expect(app.cache.cached(key, 30, () => undefined)).rejects.toThrow("JSON-serializable");
    expect(await app.redis.exists(key)).toBe(0);
  });

  it("invalidates matching keys across SCAN pages and preserves other keys", async () => {
    const keys = Array.from({ length: 350 }, (_, i) => `${prefix}search:user-1:${i}`);
    const otherKey = `${prefix}search:user-2:result`;
    await app.redis.mset(...keys.flatMap((key) => [key, "cached"]), otherKey, "keep");
    const scan = vi.spyOn(app.redis, "scan");
    const forbiddenKeys = vi.spyOn(app.redis, "keys").mockRejectedValue(new Error("KEYS is forbidden"));

    await app.cache.invalidate(`${prefix}search:user-1:*`);

    expect(await app.redis.mget(...keys)).toEqual(keys.map(() => null));
    expect(await app.redis.get(otherKey)).toBe("keep");
    expect(scan.mock.calls.length).toBeGreaterThan(1);
    expect(forbiddenKeys).not.toHaveBeenCalled();
  });

  it("continues past empty SCAN pages until the cursor is zero", async () => {
    const key = `${prefix}after-empty-page`;
    await app.redis.set(key, "cached");
    const scan = vi.spyOn(app.redis, "scan")
      .mockResolvedValueOnce(["42", []])
      .mockResolvedValueOnce(["0", [key]]);

    await app.cache.invalidate(`${prefix}*`);

    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan.mock.calls[1]?.[0]).toBe("42");
    expect(await app.redis.exists(key)).toBe(0);
  });

  it("accepts an invalidation pattern without matches", async () => {
    await expect(app.cache.invalidate(`${prefix}missing:*`)).resolves.toBeUndefined();
  });

  it("quits and closes the Redis connection when the app closes", async () => {
    const otherApp = await createTestApp();
    const quit = vi.spyOn(otherApp.redis, "quit");
    await otherApp.close();
    expect(quit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(otherApp.redis.status).toBe("end"));
    await expect(otherApp.redis.ping()).rejects.toThrow("Connection is closed");
  });
});
