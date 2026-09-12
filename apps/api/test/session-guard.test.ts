import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { signUpAndLogin } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("session guard", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp({
      configure: (app) => {
        app.get("/protected", { preHandler: app.requireAuth, schema: { hide: true } }, async (request) => ({
          userId: request.user?.id ?? null,
          sessionUserId: request.session?.userId ?? null,
        }));
        app.get("/open", { schema: { hide: true } }, async (request) => ({ userId: request.user?.id ?? null }));
      },
    });
  });

  beforeEach(async () => {
    await truncateAll(app.db);
  });

  afterAll(async () => {
    if (app) {
      await truncateAll(app.db);
      await app.close();
    }
  });

  it("registers the requireAuth decorator", () => {
    expect(app.hasDecorator("requireAuth")).toBe(true);
    expect(app.hasRequestDecorator("user")).toBe(true);
    expect(app.hasRequestDecorator("session")).toBe(true);
  });

  it("responds 401 without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ statusCode: 401, error: "Unauthorized" });
  });

  it("responds 401 with an invalid cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: "better-auth.session_token=not-a-real-token" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("responds 401 after sign-out", async () => {
    const { cookie } = await signUpAndLogin(app);
    await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: { cookie } });

    const res = await app.inject({ method: "GET", url: "/protected", headers: { cookie } });

    expect(res.statusCode).toBe(401);
  });

  it("populates request.user and request.session with a valid cookie", async () => {
    const { cookie, user } = await signUpAndLogin(app);

    const res = await app.inject({ method: "GET", url: "/protected", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: user.id, sessionUserId: user.id });
  });

  it("resolves the session on unguarded routes without blocking them", async () => {
    const { cookie, user } = await signUpAndLogin(app);

    const anonymous = await app.inject({ method: "GET", url: "/open" });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ userId: null });

    const authenticated = await app.inject({ method: "GET", url: "/open", headers: { cookie } });
    expect(authenticated.json()).toEqual({ userId: user.id });
  });

  it("keeps health and auth routes public", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/get-session" })).statusCode).toBe(200);
  });
});
