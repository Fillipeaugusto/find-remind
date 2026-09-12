import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { createTestApp } from "./helpers.js";

describe("health", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "ok" });
    });
  });

  describe("GET /health/ready", () => {
    it("returns 200 when postgres, redis and elasticsearch respond", async () => {
      const res = await app.inject({ method: "GET", url: "/health/ready" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        status: "ok",
        checks: { postgres: "ok", redis: "ok", elasticsearch: "ok" },
      });
    });

    it("returns 503 when postgres fails", async () => {
      vi.spyOn(app.db, "execute").mockRejectedValueOnce(new Error("connection refused"));

      const res = await app.inject({ method: "GET", url: "/health/ready" });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        status: "degraded",
        checks: { postgres: "error", redis: "ok", elasticsearch: "ok" },
      });
    });

    it("returns 503 when redis fails", async () => {
      vi.spyOn(app.redis, "ping").mockRejectedValueOnce(new Error("connection closed"));

      const res = await app.inject({ method: "GET", url: "/health/ready" });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        status: "degraded",
        checks: { postgres: "ok", redis: "error", elasticsearch: "ok" },
      });
    });

    it("returns 503 when elasticsearch fails", async () => {
      vi.spyOn(app.es.cluster, "health").mockRejectedValueOnce(new Error("no living connections"));

      const res = await app.inject({ method: "GET", url: "/health/ready" });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        status: "degraded",
        checks: { postgres: "ok", redis: "ok", elasticsearch: "error" },
      });
    });

    it("returns 503 when a check hangs", async () => {
      vi.spyOn(app.redis, "ping").mockReturnValueOnce(new Promise(() => {}));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const pending = app.inject({ method: "GET", url: "/health/ready" });
        await vi.advanceTimersByTimeAsync(3_000);
        const res = await pending;

        expect(res.statusCode).toBe(503);
        expect(res.json().checks.redis).toBe("error");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
