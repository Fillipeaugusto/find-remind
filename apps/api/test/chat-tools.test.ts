import { randomUUID } from "node:crypto";
import { reminder, eq } from "@findremind/db";
import type { Tool } from "ai";
import type { z } from "zod";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { createChatTools } from "../src/chat/tools.js";
import { createRemindersRepository } from "../src/modules/reminders/reminders.repository.js";
import type { Reminder } from "../src/modules/reminders/reminders.schemas.js";
import * as searchIndex from "../src/search/index.js";
import { toDocument } from "../src/search/indexer.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

const options = { toolCallId: "call-1", messages: [], context: undefined };

describe("chat tools", () => {
  let app: App;
  let session: TestSession;
  let index: string;
  let tools: Record<string, Tool>;

  beforeAll(async () => {
    app = await createTestApp();
    index = `test-reminders-chat-${randomUUID()}`;
    await searchIndex.ensureIndex(app.es, index);
  });
  beforeEach(async () => {
    await clearQueues(app);
    await truncateAll(app.db);
    await app.cache.invalidate("search:*");
    await app.es.deleteByQuery({ index, query: { match_all: {} }, refresh: true, conflicts: "proceed" });
    vi.spyOn(searchIndex, "remindersIndexName").mockReturnValue(index);
    vi.useFakeTimers({ now: new Date("2026-09-16T15:00:00Z"), toFake: ["Date"] });
    session = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });
    tools = createChatTools(app, { id: session.user.id, timezone: "America/Sao_Paulo" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => {
    if (app) { await clearQueues(app); await truncateAll(app.db); await app.es.indices.delete({ index }); await app.close(); }
  });

  async function run<T = unknown>(name: string, input: unknown): Promise<T> {
    return (await tools[name]!.execute!(input, options)) as T;
  }
  function schema(name: string): z.ZodType {
    return tools[name]!.inputSchema as z.ZodType;
  }
  async function create(patch: Partial<typeof reminder.$inferInsert> = {}, tags = ["casa"], userId = session.user.id) {
    const row = await createRemindersRepository(app.db).create(
      { userId, title: "Pagar aluguel", content: "Apartamento", kind: "reminder", remindAt: new Date("2026-09-09T12:00:00Z"), ...patch },
      tags,
    );
    await app.es.index({ index, id: row.id, document: toDocument(row), refresh: true });
    return row;
  }

  it("exposes every tool of the contract", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "askUser", "completeReminder", "createReminder", "getReminder", "listTags", "resolveDateRange", "searchReminders", "updateReminder",
    ]);
  });

  describe("searchReminders", () => {
    it("falls back to keyword search without an embedding provider and applies filters", async () => {
      const wanted = await create();
      await create({ title: "Pagar aluguel", remindAt: new Date("2026-10-09T12:00:00Z") });
      await create({ title: "Dentista" });
      const result = await run<{ items: Reminder[] }>("searchReminders", { query: "aluguel", from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:59:59Z", tags: ["CASA"] });
      expect(result.items.map((item) => item.id)).toEqual([wanted.id]);
    });
    it("lists by period, tags and status when the query is empty", async () => {
      const wanted = await create();
      await create({ status: "done" });
      await create({}, ["trabalho"]);
      const result = await run<{ items: Reminder[] }>("searchReminders", { query: "", from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:59:59Z", tags: ["casa"], status: "scheduled" });
      expect(result.items.map((item) => item.id)).toEqual([wanted.id]);
    });
    it("never returns another user's reminders", async () => {
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      await create({}, ["casa"], other.user.id);
      const result = await run<{ items: Reminder[] }>("searchReminders", { query: "aluguel" });
      expect(result.items).toEqual([]);
    });
  });

  describe("getReminder", () => {
    it("returns the reminder through the service", async () => {
      const row = await create();
      expect(await run<Reminder>("getReminder", { id: row.id })).toMatchObject({ id: row.id, title: "Pagar aluguel", tags: ["casa"] });
    });
    it("rejects ids of other users", async () => {
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      const row = await create({}, [], other.user.id);
      await expect(run("getReminder", { id: row.id })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("createReminder", () => {
    it("creates a reminder when remindAt is given and normalizes tags", async () => {
      const created = await run<Reminder>("createReminder", { title: "Dentista", remindAt: "2026-09-20T14:00:00-03:00", tags: [" Saúde ", "saúde"] });
      expect(created).toMatchObject({ kind: "reminder", remindAt: "2026-09-20T17:00:00.000Z", nextFireAt: "2026-09-20T17:00:00.000Z", tags: ["saúde"], status: "scheduled" });
      const [row] = await app.db.select().from(reminder).where(eq(reminder.id, created.id));
      expect(row?.userId).toBe(session.user.id);
    });
    it("creates a note without remindAt", async () => {
      expect(await run<Reminder>("createReminder", { title: "Ideia", content: "Texto" })).toMatchObject({ kind: "note", remindAt: null, nextFireAt: null, content: "Texto" });
    });
    it("propagates service validation errors", async () => {
      await expect(run("createReminder", { title: "Sem data", recurrence: { freq: "daily", interval: 1 } })).rejects.toMatchObject({ statusCode: 400 });
    });
    it("accepts null for optional fields", async () => {
      const input = { title: "Almoço", content: null, remindAt: "2026-09-20T12:00:00-03:00", recurrence: null, tags: null };
      expect(schema("createReminder").safeParse(input)).toMatchObject({ success: true });
      expect(await run<Reminder>("createReminder", input)).toMatchObject({ kind: "reminder", recurrence: null, tags: [] });
      expect(schema("searchReminders").safeParse({ query: "", from: null, to: null, tags: null, status: null })).toMatchObject({ success: true });
      expect(await run<{ items: Reminder[] }>("searchReminders", { query: "", from: null, to: null, tags: null, status: null })).toMatchObject({ items: [expect.objectContaining({ title: "Almoço" })] });
    });
  });

  describe("askUser", () => {
    it("validates the question and options and returns immediately", async () => {
      const ask = schema("askUser");
      expect(ask.safeParse({ question: "Que horas?", options: [{ label: "9h" }, { label: "12h", description: null }], allowFreeText: true })).toMatchObject({ success: true });
      expect(ask.safeParse({ question: "Que horas?", options: null })).toMatchObject({ success: true });
      expect(ask.safeParse({ question: "Que horas?", options: ["9h", "12h"] })).toMatchObject({ success: true });
      expect(ask.safeParse({ question: "" })).toMatchObject({ success: false });
      expect(ask.safeParse({ question: "Q", options: Array.from({ length: 7 }, () => ({ label: "x" })) })).toMatchObject({ success: false });
      expect(await run("askUser", { question: "Que horas?" })).toEqual({ awaitingUser: true });
    });
  });

  describe("updateReminder", () => {
    it("patches fields and reschedules", async () => {
      const row = await create();
      const updated = await run<Reminder>("updateReminder", { id: row.id, patch: { title: "Pagar condomínio", remindAt: "2026-09-10T12:00:00Z", tags: ["casa", "contas"] } });
      expect(updated).toMatchObject({ title: "Pagar condomínio", remindAt: "2026-09-10T12:00:00.000Z", nextFireAt: "2026-09-10T12:00:00.000Z", tags: ["casa", "contas"] });
    });
  });

  describe("completeReminder", () => {
    it("marks a reminder as done", async () => {
      const row = await create();
      expect(await run<Reminder>("completeReminder", { id: row.id })).toMatchObject({ status: "done", nextFireAt: null });
    });
    it("advances a recurring reminder to the next occurrence", async () => {
      const row = await create({ recurrence: { freq: "daily", interval: 1 }, nextFireAt: new Date("2026-09-16T12:00:00Z") });
      expect(await run<Reminder>("completeReminder", { id: row.id })).toMatchObject({ status: "scheduled", nextFireAt: "2026-09-17T12:00:00.000Z" });
    });
  });

  describe("resolveDateRange", () => {
    it("resolves expressions in the user's time zone", async () => {
      expect(await run("resolveDateRange", { expression: "semana passada" })).toEqual({ from: "2026-09-07T03:00:00.000Z", to: "2026-09-14T02:59:59.999Z", label: "semana passada" });
    });
    it("rejects unsupported expressions", async () => {
      await expect(run("resolveDateRange", { expression: "em alguma época" })).rejects.toThrow("Unsupported date expression");
    });
  });

  describe("listTags", () => {
    it("counts the user's tags", async () => {
      await create({}, ["casa", "contas"]);
      await create({}, ["casa"]);
      expect(await run("listTags", {})).toEqual({ items: [{ name: "casa", count: 2 }, { name: "contas", count: 1 }] });
    });
  });
});
