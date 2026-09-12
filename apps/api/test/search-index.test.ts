import { eq, reminder } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { remindersIndexName } from "../src/search/index.js";
import { reindexAll } from "../src/search/indexer.js";
import { searchCacheKey, SEARCH_QUEUE } from "../src/search/sync.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues, startInlineWorker } from "./queues.js";

const REMIND_AT = "2030-01-15T12:00:00.000Z";

describe("reminder search indexing", () => {
  let app: App;
  let session: TestSession;
  let inline: Awaited<ReturnType<typeof startInlineWorker>>;
  let index: string;

  async function clearIndex() {
    await app.es.deleteByQuery({ index, query: { match_all: {} }, refresh: true, conflicts: "proceed" });
  }

  beforeAll(async () => {
    app = await createTestApp();
    index = remindersIndexName(app.env.NODE_ENV);
    inline = await startInlineWorker(app, SEARCH_QUEUE);
  });

  beforeEach(async () => {
    // Let in-flight jobs finish before wiping the queue, otherwise the
    // inline worker logs errors when it tries to complete a removed job.
    await waitForIdle();
    await clearQueues(app);
    await clearIndex();
    await truncateAll(app.db);
    session = await signUpAndLogin(app);
  });

  afterAll(async () => {
    if (inline) await inline.close();
    if (app) {
      await waitForIdle();
      await clearQueues(app);
      await clearIndex();
      await truncateAll(app.db);
      await app.close();
    }
  });

  async function createReminder(payload: Record<string, unknown>, cookie = session.cookie) {
    const res = await app.inject({
      method: "POST",
      url: "/reminders",
      headers: { cookie },
      payload: { title: "Pagar aluguel", kind: "reminder", remindAt: REMIND_AT, ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function waitForIdle() {
    await vi.waitFor(
      async () => {
        const counts = await app.queues[SEARCH_QUEUE]!.getJobCounts("waiting", "active", "delayed");
        expect(counts).toEqual({ waiting: 0, active: 0, delayed: 0 });
      },
      { timeout: 5_000 },
    );
  }

  async function waitForQueue() {
    await waitForIdle();
    expect(await app.queues[SEARCH_QUEUE]!.getFailedCount()).toBe(0);
  }

  async function getDocument(id: string) {
    const res = await app.es.get<Record<string, unknown>>({ index, id }, { ignore: [404] });
    return res.found ? res._source : undefined;
  }

  it("registers the search queue", () => {
    expect(app.queues[SEARCH_QUEUE]).toBeDefined();
  });

  it("indexes a reminder after it is created", async () => {
    const created = await createReminder({ content: "até dia 10", tags: ["casa", "financeiro"] });

    await waitForQueue();

    expect(await getDocument(created.id)).toEqual({
      userId: session.user.id,
      title: "Pagar aluguel",
      content: "até dia 10",
      tags: ["casa", "financeiro"],
      status: "scheduled",
      remindAt: REMIND_AT,
      createdAt: created.createdAt,
    });
  });

  it("reindexes after updates and status changes", async () => {
    const created = await createReminder({});
    await app.inject({
      method: "PATCH",
      url: `/reminders/${created.id}`,
      headers: { cookie: session.cookie },
      payload: { title: "Pagar condomínio", tags: ["casa"] },
    });
    await waitForQueue();
    expect(await getDocument(created.id)).toMatchObject({ title: "Pagar condomínio", tags: ["casa"], status: "scheduled" });

    await app.inject({ method: "POST", url: `/reminders/${created.id}/done`, headers: { cookie: session.cookie } });
    await waitForQueue();
    expect(await getDocument(created.id)).toMatchObject({ status: "done", remindAt: REMIND_AT });

    const until = new Date(Date.now() + 3_600_000).toISOString();
    await app.inject({ method: "POST", url: `/reminders/${created.id}/snooze`, headers: { cookie: session.cookie }, payload: { until } });
    await waitForQueue();
    expect(await getDocument(created.id)).toMatchObject({ status: "snoozed", remindAt: until });
  });

  it("removes the document when the reminder is deleted", async () => {
    const created = await createReminder({});
    await waitForQueue();
    expect(await getDocument(created.id)).toBeDefined();

    const res = await app.inject({ method: "DELETE", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });
    expect(res.statusCode).toBe(204);
    await waitForQueue();

    expect(await getDocument(created.id)).toBeUndefined();
  });

  it("tolerates an index job for a reminder that no longer exists", async () => {
    const job = await app.queues[SEARCH_QUEUE]!.add("index-reminder", { reminderId: "00000000-0000-4000-8000-000000000000" });

    await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), { timeout: 5_000 });

    expect((await app.queues[SEARCH_QUEUE]!.getJob(job.id!))?.returnvalue).toEqual({ action: "deleted" });
  });

  it("invalidates the user's search cache on every write", async () => {
    const other = await signUpAndLogin(app, { email: "bia@example.com" });
    const mine = searchCacheKey(session.user.id, "abc");
    const theirs = searchCacheKey(other.user.id, "abc");
    await app.redis.set(mine, "1");
    await app.redis.set(theirs, "1");

    try {
      await createReminder({});

      expect(await app.redis.exists(mine)).toBe(0);
      expect(await app.redis.exists(theirs)).toBe(1);
    } finally {
      await app.redis.del(mine, theirs);
    }
  });

  it("rebuilds the whole index from Postgres", async () => {
    const kept = await createReminder({ title: "kept" });
    const removed = await createReminder({ title: "removed" });
    await waitForQueue();
    // Simulate drift: a document that should not exist and a missing one.
    await app.db.update(reminder).set({ deletedAt: new Date() });
    await app.db.update(reminder).set({ deletedAt: null, title: "kept-renamed" }).where(eq(reminder.id, kept.id));
    await app.es.delete({ index, id: kept.id });
    const stale = "00000000-0000-4000-8000-00000000dead";
    await app.es.index({ index, id: stale, document: { userId: "ghost", title: "stale" } });

    const result = await reindexAll(app);

    expect(result).toEqual({ indexed: 1, deleted: 1 });
    expect(await getDocument(kept.id)).toMatchObject({ title: "kept-renamed" });
    expect(await getDocument(removed.id)).toBeUndefined();
    // Documents without a Postgres row are left alone; the index is derived, not authoritative.
    expect(await getDocument(stale)).toBeDefined();
  });

  it("runs reindex-all as a queue job", async () => {
    const created = await createReminder({});
    await waitForQueue();
    await app.es.delete({ index, id: created.id });

    const job = await app.queues[SEARCH_QUEUE]!.add("reindex-all", {});
    await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), { timeout: 10_000 });

    expect((await app.queues[SEARCH_QUEUE]!.getJob(job.id!))?.returnvalue).toEqual({ indexed: 1, deleted: 0 });
    expect(await getDocument(created.id)).toBeDefined();
  });

  it("fails unknown jobs", async () => {
    const job = await app.queues[SEARCH_QUEUE]!.add("unknown", {});

    await vi.waitFor(async () => expect(await job.getState()).toBe("failed"), { timeout: 5_000 });

    expect((await app.queues[SEARCH_QUEUE]!.getJob(job.id!))?.failedReason).toContain("Unknown search job");
  });
});
