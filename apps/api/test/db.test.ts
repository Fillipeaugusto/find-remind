import { account, session, sql, user, verification } from "@findremind/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { migrateTestDb, truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("database plugin", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(app.db);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (app) {
      await truncateAll(app.db);
      await app.close();
    }
  });

  it("executes SQL through app.db against Postgres", async () => {
    const result = await app.db.execute(sql`select 1 as value`);
    expect(result[0]).toEqual({ value: 1 });
  });

  it("migrates the schema and preserves migration history when truncating all tables", async () => {
    const history = await app.db.execute(sql`select * from drizzle.__drizzle_migrations order by id`);
    expect(history.length).toBeGreaterThan(0);

    await app.db.insert(user).values({ id: "user-1", name: "Test", email: "test@example.com" });
    await app.db.insert(account).values({
      id: "account-1", userId: "user-1", accountId: "user-1", providerId: "credential",
    });
    await app.db.insert(session).values({
      id: "session-1", userId: "user-1", token: "test-token", expiresAt: new Date(),
    });
    await app.db.insert(verification).values({
      id: "verification-1", identifier: "test@example.com", value: "code", expiresAt: new Date(),
    });

    await truncateAll(app.db);

    expect(await app.db.select().from(user)).toEqual([]);
    expect(await app.db.select().from(account)).toEqual([]);
    expect(await app.db.select().from(session)).toEqual([]);
    expect(await app.db.select().from(verification)).toEqual([]);
    await migrateTestDb(app.db);
    expect(await app.db.execute(sql`select * from drizzle.__drizzle_migrations order by id`)).toEqual(history);
  });

  it.each(["development", "production"])("rejects test database helpers in %s", async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    await expect(migrateTestDb(app.db)).rejects.toThrow("NODE_ENV=test");
    await expect(truncateAll(app.db)).rejects.toThrow("NODE_ENV=test");
  });

  it("rejects test database helpers against a different database", async () => {
    const url = new URL(loadEnv().DATABASE_URL);
    url.pathname = "/postgres";
    const otherApp = await buildApp({ env: { ...loadEnv(), DATABASE_URL: url.href }, logger: false });
    try {
      await expect(migrateTestDb(otherApp.db)).rejects.toThrow("findremind_test");
      await expect(truncateAll(otherApp.db)).rejects.toThrow("findremind_test");
    } finally {
      await otherApp.close();
    }
  });

  it("closes the underlying connection when the app closes", async () => {
    const otherApp = await createTestApp();
    await otherApp.db.execute(sql`select 1`);
    await otherApp.close();
    await expect(otherApp.db.$client`select 1`).rejects.toMatchObject({ code: "CONNECTION_ENDED" });
  });

  it.each(["development", "production"] as const)("does not connect or migrate on boot in %s", async (mode) => {
    const otherApp = await buildApp({
      env: { ...loadEnv(), NODE_ENV: mode, DATABASE_URL: "postgres://localhost:1/unavailable" },
      logger: false,
    });
    try {
      await otherApp.ready();
      expect(otherApp.hasDecorator("db")).toBe(true);
    } finally {
      await otherApp.close();
    }
  });
});
