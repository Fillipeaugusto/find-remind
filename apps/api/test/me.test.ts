import { user } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { signUpAndLogin } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("me routes", () => {
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

  describe("GET /me", () => {
    it("requires a session", async () => {
      const res = await app.inject({ method: "GET", url: "/me" });

      expect(res.statusCode).toBe(401);
    });

    it("returns the current user's profile", async () => {
      const { cookie, user: me } = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });

      const res = await app.inject({ method: "GET", url: "/me", headers: { cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: me.id,
        name: "Ana",
        email: "ana@example.com",
        image: null,
        timezone: "America/Sao_Paulo",
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(res.json()).not.toHaveProperty("emailVerified");
    });
  });

  describe("PATCH /me", () => {
    it("requires a session", async () => {
      const res = await app.inject({ method: "PATCH", url: "/me", payload: { name: "Bia" } });

      expect(res.statusCode).toBe(401);
    });

    it("updates name and timezone", async () => {
      const { cookie, user: me } = await signUpAndLogin(app);

      const res = await app.inject({
        method: "PATCH",
        url: "/me",
        headers: { cookie },
        payload: { name: "  Ana Beatriz ", timezone: "Europe/Lisbon" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: me.id, name: "Ana Beatriz", timezone: "Europe/Lisbon" });

      const [row] = await app.db.select().from(user);
      expect(row).toMatchObject({ name: "Ana Beatriz", timezone: "Europe/Lisbon" });

      const session = await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } });
      expect(session.json().user).toMatchObject({ name: "Ana Beatriz", timezone: "Europe/Lisbon" });
    });

    it("updates a single field and keeps the others", async () => {
      const { cookie } = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });

      const res = await app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "Bia" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: "Bia", timezone: "America/Sao_Paulo" });
    });

    it("returns the profile unchanged with an empty body", async () => {
      const { cookie } = await signUpAndLogin(app);

      const res = await app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: {} });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: "Ana", timezone: "UTC" });
    });

    it("rejects an invalid timezone with 400", async () => {
      const { cookie } = await signUpAndLogin(app);

      const res = await app.inject({
        method: "PATCH",
        url: "/me",
        headers: { cookie },
        payload: { timezone: "Mars/Olympus_Mons" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
      expect(res.json().message).toContain("timezone");

      const [row] = await app.db.select().from(user);
      expect(row?.timezone).toBe("UTC");
    });

    it("rejects an empty name with 400", async () => {
      const { cookie } = await signUpAndLogin(app);

      const res = await app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "   " } });

      expect(res.statusCode).toBe(400);
    });

    it("ignores fields outside the contract", async () => {
      const { cookie, user: me } = await signUpAndLogin(app);

      const res = await app.inject({
        method: "PATCH",
        url: "/me",
        headers: { cookie },
        payload: { email: "other@example.com", id: "hacked" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: me.id, email: "ana@example.com" });
    });
  });
});
