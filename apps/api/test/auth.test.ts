import { session, user } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { defaultCredentials as credentials, sessionCookie } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("auth routes", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
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

  it("registers the auth decorator", () => {
    expect(app.hasDecorator("auth")).toBe(true);
    expect(typeof app.auth.api.getSession).toBe("function");
  });

  it("signs up, signs in and returns the session from the cookie", async () => {
    const signUp = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { ...credentials, timezone: "America/Sao_Paulo" },
    });
    expect(signUp.statusCode).toBe(200);
    expect(signUp.json().user).toMatchObject({ name: "Ana", email: "ana@example.com", timezone: "America/Sao_Paulo" });
    expect(signUp.json().user).not.toHaveProperty("password");
    sessionCookie(signUp);

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: credentials.email, password: credentials.password },
    });
    expect(signIn.statusCode).toBe(200);
    const cookie = sessionCookie(signIn);

    const getSession = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie },
    });
    expect(getSession.statusCode).toBe(200);
    expect(getSession.json()).toMatchObject({
      user: { id: signUp.json().user.id, email: credentials.email, timezone: "America/Sao_Paulo" },
      session: { userId: signUp.json().user.id },
    });

    const [row] = await app.db.select().from(user);
    expect(row).toMatchObject({ email: credentials.email, timezone: "America/Sao_Paulo" });
    expect(await app.db.select().from(session)).toHaveLength(2);
  });

  it("defaults timezone to UTC", async () => {
    const signUp = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", payload: credentials });

    expect(signUp.statusCode).toBe(200);
    expect(signUp.json().user.timezone).toBe("UTC");
  });

  it("rejects wrong password", async () => {
    await app.inject({ method: "POST", url: "/api/auth/sign-up/email", payload: credentials });

    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: credentials.email, password: "wrong-password" },
    });

    expect(signIn.statusCode).toBe(401);
    expect(signIn.cookies).toEqual([]);
  });

  it("returns null session without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/get-session" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("null");
  });

  it("signs out and invalidates the session", async () => {
    const signUp = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", payload: credentials });
    const cookie = sessionCookie(signUp);

    const signOut = await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: { cookie } });
    expect(signOut.statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } });
    expect(res.body).toBe("null");
    expect(await app.db.select().from(session)).toHaveLength(0);
  });
});
