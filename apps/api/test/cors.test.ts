import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { createTestApp } from "./helpers.js";

describe("cors", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["PUT", "PATCH", "DELETE"])("allows %s from the web origin in preflight", async (method) => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/ai/defaults",
      headers: {
        origin: app.env.WEB_URL,
        "access-control-request-method": method,
        "access-control-request-headers": "content-type",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(app.env.WEB_URL);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(res.headers["access-control-allow-methods"]).split(/,\s*/)).toContain(method);
  });

  it("rejects other origins", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/ai/defaults",
      headers: { origin: "https://evil.example", "access-control-request-method": "PUT" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
