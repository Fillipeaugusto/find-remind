import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "0123456789abcdef",
  AI_KEYS_ENCRYPTION_KEY: "0123456789abcdef",
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.RUN_WORKERS).toBe(true);
  });

  it("throws with a readable message on missing vars", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each(["development", "test", "production"])("defaults workers by environment in %s", (mode) => {
    expect(loadEnv({ ...valid, NODE_ENV: mode }).RUN_WORKERS).toBe(mode !== "test");
  });

  it.each(["development", "test", "production"])("accepts explicit worker overrides in %s", (mode) => {
    expect(loadEnv({ ...valid, NODE_ENV: mode, RUN_WORKERS: "true" }).RUN_WORKERS).toBe(true);
    expect(loadEnv({ ...valid, NODE_ENV: mode, RUN_WORKERS: "false" }).RUN_WORKERS).toBe(false);
  });

  it.each(["0", "1", "yes", "", "FALSE"])("rejects invalid RUN_WORKERS value %j", (value) => {
    expect(() => loadEnv({ ...valid, RUN_WORKERS: value })).toThrow(/RUN_WORKERS/);
  });
});
