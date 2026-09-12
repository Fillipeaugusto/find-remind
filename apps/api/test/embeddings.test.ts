import { aiProvider, aiUserSettings, eq, reminder, reminderEmbedding, sql } from "@findremind/db";
import { MockEmbeddingModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as registry from "../src/ai/registry.js";
import { createRemindersRepository } from "../src/modules/reminders/reminders.repository.js";
import { embedReminder, reembedUser } from "../src/search/embedder.js";
import { searchCacheKey } from "../src/search/sync.js";
import { providerFixture } from "./ai-fixtures.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues, startInlineWorker } from "./queues.js";

describe("reminder embeddings", () => {
  let app: App;
  let session: TestSession;
  let model: MockEmbeddingModelV4;
  let reference: string;
  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await clearQueues(app);
    await truncateAll(app.db);
    session = await signUpAndLogin(app);
    const provider = providerFixture({ userId: session.user.id });
    await app.db.insert(aiProvider).values(provider);
    reference = `${provider.id}:text-embedding-3-small`;
    await app.db.insert(aiUserSettings).values({ userId: session.user.id, defaultEmbedding: reference });
    model = new MockEmbeddingModelV4({ doEmbed: async ({ values }) => ({ embeddings: values.map(() => [1, 0, 0]), warnings: [] }) });
    vi.spyOn(registry, "createProviderRegistry").mockReturnValue({ embedding: () => model, chat: () => { throw new Error("Unexpected chat call"); } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (app) { await clearQueues(app); await app.cache.invalidate("search:*"); await truncateAll(app.db); await app.close(); } });

  async function create(userId = session.user.id) {
    return createRemindersRepository(app.db).create({ userId, title: "Pagar aluguel", content: "Até dia 10", kind: "note", updatedAt: new Date() }, ["casa", "financeiro"]);
  }

  it("stores the full model reference and vector and invalidates cached searches", async () => {
    const row = await create();
    const doEmbed = vi.spyOn(model, "doEmbed");
    const key = searchCacheKey(session.user.id, "embedding-test");
    await app.redis.set(key, "cached");
    expect(await embedReminder(app, row.id)).toEqual({ action: "embedded", dims: 3 });
    expect(doEmbed.mock.calls[0]?.[0].values).toEqual(["Pagar aluguel\nAté dia 10\ncasa financeiro"]);
    expect(await app.db.select().from(reminderEmbedding)).toEqual([{ reminderId: row.id, model: reference, dims: 3, embedding: [1, 0, 0] }]);
    expect(await app.redis.exists(key)).toBe(0);
    await embedReminder(app, row.id);
    expect(await app.db.select().from(reminderEmbedding)).toHaveLength(1);
  });

  it.each([768, 1024, 1536, 3072])("stores %i dimensions without a fixed vector typmod", async (dims) => {
    model.doEmbed = async () => ({ embeddings: [Array.from({ length: dims }, (_, index) => index === 0 ? 1 : 0)], warnings: [] });
    const row = await create();
    expect(await embedReminder(app, row.id)).toEqual({ action: "embedded", dims });
    expect((await app.db.select().from(reminderEmbedding))[0]?.embedding).toHaveLength(dims);
  });

  it("installs the three partial cosine HNSW indexes and enforces matching dimensions", async () => {
    const indexes = await app.db.execute(sql`select indexdef from pg_indexes where tablename = 'reminder_embedding' and indexdef like '%hnsw%'`);
    expect(indexes).toHaveLength(3);
    for (const dims of [768, 1024, 1536]) expect(indexes.some((row) => String(row.indexdef).includes(`vector(${dims})`) && String(row.indexdef).includes(`dims = ${dims}`))).toBe(true);
    const row = await create();
    await expect(app.db.insert(reminderEmbedding).values({ reminderId: row.id, model: reference, dims: 4, embedding: [1, 0, 0] })).rejects.toThrow();
  });

  it("completes a queued job as skipped when no provider is configured", async () => {
    await app.db.delete(aiUserSettings);
    const row = await create();
    const inline = await startInlineWorker(app, "search");
    try {
      const job = await app.queues.search!.add("embed-reminder", { reminderId: row.id });
      await vi.waitFor(async () => expect(await job.getState()).toBe("completed"));
      expect((await app.queues.search!.getJob(job.id!))?.returnvalue).toEqual({ action: "skipped", reason: "NO_EMBEDDING_PROVIDER" });
      expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
    } finally { await inline.close(); }
  });

  it("enqueues both indexing and embedding after a reminder write", async () => {
    const res = await app.inject({ method: "POST", url: "/reminders", headers: { cookie: session.cookie }, payload: { kind: "note", title: "New note" } });
    expect(res.statusCode).toBe(201);
    expect((await app.queues.search!.getJobs(["waiting"])).map((job) => job.name).sort()).toEqual(["embed-reminder", "index-reminder"]);
  });

  it("invalidates the vector on edits and deletes it on soft or hard deletion", async () => {
    const row = await create();
    await embedReminder(app, row.id);
    await createRemindersRepository(app.db).update(session.user.id, row.id, { title: "New title" });
    expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
    await embedReminder(app, row.id);
    await createRemindersRepository(app.db).softDelete(session.user.id, row.id);
    expect(await embedReminder(app, row.id)).toEqual({ action: "deleted" });
    expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
    const live = await create();
    await embedReminder(app, live.id);
    await app.db.delete(reminder).where(eq(reminder.id, live.id));
    expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
  });

  it.each(["content", "default", "provider", "delete"])("discards results if %s changes during generation", async (change) => {
    const row = await create();
    model.doEmbed = async () => {
      if (change === "content") await createRemindersRepository(app.db).update(session.user.id, row.id, { content: "Changed" });
      if (change === "default") await app.db.update(aiUserSettings).set({ defaultEmbedding: `${reference}-large` });
      if (change === "provider") await app.db.update(aiProvider).set({ enabled: false });
      if (change === "delete") await createRemindersRepository(app.db).softDelete(session.user.id, row.id);
      return { embeddings: [[1, 0, 0]], warnings: [] };
    };
    expect(await embedReminder(app, row.id)).toEqual({ action: "skipped", reason: "STALE_INPUT" });
    expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
  });

  it("reembeds only live reminders of the selected user", async () => {
    const mine = await create();
    const removed = await create();
    await createRemindersRepository(app.db).softDelete(session.user.id, removed.id);
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    await create(other.user.id);
    expect(await reembedUser(app, session.user.id)).toEqual({ enqueued: 1 });
    expect((await app.queues.search!.getJobs(["waiting"])).map((job) => job.data)).toEqual([{ reminderId: mine.id }]);
  });

  it("enqueues reembed-user when the default changes but not for an unchanged default", async () => {
    const providerId = reference.split(":")[0];
    const send = () => app.inject({ method: "PUT", url: "/ai/defaults", headers: { cookie: session.cookie }, payload: { embedding: `${providerId}:text-embedding-3-large` } });
    expect((await send()).statusCode).toBe(204);
    expect((await send()).statusCode).toBe(204);
    const jobs = await app.queues.search!.getJobs(["waiting"]);
    expect(jobs.map((job) => ({ name: job.name, data: job.data }))).toEqual([{ name: "reembed-user", data: { userId: session.user.id } }]);
  });

  it.each([[], [0, 0], [Number.NaN], [Number.POSITIVE_INFINITY], [1e40]].map((vector) => ({ vector })))("rejects invalid vectors $vector", async ({ vector }) => {
    const row = await create();
    model.doEmbed = async () => ({ embeddings: [vector], warnings: [] });
    await expect(embedReminder(app, row.id)).rejects.toThrow("Unable to generate embedding");
    expect(await app.db.select().from(reminderEmbedding)).toEqual([]);
  });
});
