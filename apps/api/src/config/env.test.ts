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
  });

  it("throws with a readable message on missing vars", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
