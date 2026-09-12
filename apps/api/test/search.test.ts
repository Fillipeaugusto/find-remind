import { aiProvider, aiUserSettings, eq, reminder, reminderEmbedding } from "@findremind/db";
import { randomUUID } from "node:crypto";
import { MockEmbeddingModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as registry from "../src/ai/registry.js";
import { createRemindersRepository, type NewReminder } from "../src/modules/reminders/reminders.repository.js";
import * as searchIndex from "../src/search/index.js";
import { toDocument, indexReminder } from "../src/search/indexer.js";
import { providerFixture } from "./ai-fixtures.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

describe("search routes", () => {
  let app: App;
  let session: TestSession;
  let model: MockEmbeddingModelV4;
  let reference: string;
  let index: string;
  beforeAll(async () => {
    app = await createTestApp();
    index = `test-reminders-search-${randomUUID()}`;
    await searchIndex.ensureIndex(app.es, index);
  });
  beforeEach(async () => {
    vi.spyOn(searchIndex, "remindersIndexName").mockReturnValue(index);
    await clearQueues(app);
    await truncateAll(app.db);
    await app.cache.invalidate("search:*");
    await app.es.deleteByQuery({ index, query: { match_all: {} }, refresh: true, conflicts: "proceed" });
    session = await signUpAndLogin(app);
    const provider = providerFixture({ userId: session.user.id });
    await app.db.insert(aiProvider).values(provider);
    reference = `${provider.id}:text-embedding-3-small`;
    await app.db.insert(aiUserSettings).values({ userId: session.user.id, defaultEmbedding: reference });
    model = new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [[1, 0, 0]], warnings: [] }) });
    vi.spyOn(registry, "createProviderRegistry").mockReturnValue({ embedding: () => model, chat: () => { throw new Error("Unexpected chat"); } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => {
    if (app) {
      await clearQueues(app); await app.cache.invalidate("search:*"); await truncateAll(app.db);
      await app.es.indices.delete({ index });
      await app.close();
    }
  });
  async function create(patch: Partial<NewReminder> = {}, vector = [1, 0, 0], tags = ["casa"]) {
    const row = await createRemindersRepository(app.db).create({ userId: session.user.id, kind: "reminder", title: "Pagar aluguel", content: "Pagamento mensal", remindAt: new Date("2030-01-15T12:00:00Z"), ...patch }, tags);
    await app.db.insert(reminderEmbedding).values({ reminderId: row.id, model: reference, dims: vector.length, embedding: vector });
    await app.es.index({ index, id: row.id, document: toDocument(row) });
    return row;
  }
  async function search(params: Record<string, string> = {}, cookie = session.cookie) {
    await app.es.indices.refresh({ index });
    return app.inject({ method: "GET", url: `/search?${new URLSearchParams({ q: "aluguel", mode: "keyword", ...params })}`, headers: { cookie } });
  }
  function ids(response: Awaited<ReturnType<typeof search>>) { return response.json().items.map((item: { reminder: { id: string } }) => item.reminder.id); }

  it("requires authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/search?q=aluguel" })).statusCode).toBe(401);
  });
  it("searches keywords with title boost and highlights without calling a provider", async () => {
    const title = await create({ title: "Aluguel", content: "mensal" });
    const content = await create({ title: "Pagamento", content: "aluguel" });
    const doEmbed = vi.spyOn(model, "doEmbed");
    const res = await search();
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual([title.id, content.id]);
    expect(res.json().items[0].highlights.join(" ").toLowerCase()).toContain("<em>aluguel</em>");
    expect(res.json()).toMatchObject({ mode: "keyword", cached: false });
    expect(res.json().tookMs).toBeGreaterThanOrEqual(0);
    expect(doEmbed).not.toHaveBeenCalled();
  });
  it("ranks semantic results by cosine distance with no lexical overlap", async () => {
    const exact = await create({ title: "Moradia" }, [1, 0, 0]);
    const close = await create({ title: "Condomínio" }, [1, 1, 0]);
    const distant = await create({ title: "Viagem" }, [0, 1, 0]);
    const res = await search({ mode: "semantic", q: "habitação" });
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual([exact.id, close.id, distant.id]);
    expect(res.json().items[0].score).toBeCloseTo(1);
    expect(res.json().items[1].score).toBeCloseTo(Math.SQRT1_2);
  });
  it("fuses keyword and semantic ranks instead of adding unrelated score scales", async () => {
    const shared = await create({ title: "Aluguel" }, [1, 0, 0]);
    const semanticOnly = await create({ title: "Moradia" }, [1, 1, 0]);
    const res = await search({ mode: "hybrid" });
    expect(ids(res)).toEqual([shared.id, semanticOnly.id]);
    expect(res.json().items[0].score).toBeCloseTo(2 / 61);
    expect(res.json().items[1].score).toBeCloseTo(1 / 62);
    expect(res.json().items[0].highlights).toBeDefined();
  });
  it.each(["keyword", "semantic", "hybrid"])("applies date, status, all tags and ownership filters in %s mode", async (mode) => {
    const wanted = await create({ status: "done", nextFireAt: new Date("2030-06-01T12:00:00Z") }, [1, 0, 0], ["casa", "financeiro"]);
    await create({ status: "scheduled" }, [1, 0, 0], ["casa", "financeiro"]);
    await create({ status: "done", remindAt: new Date("2030-02-01T00:00:00Z") }, [1, 0, 0], ["casa", "financeiro"]);
    await create({ status: "done" }, [1, 0, 0], ["casa"]);
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    await create({ userId: other.user.id, status: "done" }, [1, 0, 0], ["casa", "financeiro"]);
    const res = await search({ mode, status: "done", tags: " CASA,financeiro,casa ", from: "2030-01-15T12:00:00Z", to: "2030-01-15T12:00:00Z" });
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual([wanted.id]);
  });
  it("accepts repeated tag parameters", async () => {
    const row = await create({}, [1, 0, 0], ["casa", "financeiro"]);
    await app.es.indices.refresh({ index });
    const res = await app.inject({ method: "GET", url: "/search?q=aluguel&mode=keyword&tags=casa&tags=financeiro", headers: { cookie: session.cookie } });
    expect(ids(res)).toEqual([row.id]);
  });
  it.each(["keyword", "semantic", "hybrid"])("never returns deleted or foreign rows even when the %s cache/index is stale", async (mode) => {
    const removed = await create();
    const live = await create();
    const initial = await search({ mode });
    expect(ids(initial)).toHaveLength(2);
    await app.db.update(reminder).set({ deletedAt: new Date() }).where(eq(reminder.id, removed.id));
    const cached = await search({ mode });
    expect(cached.json().cached).toBe(true);
    expect(ids(cached)).toEqual([live.id]);
  });
  it("ignores embeddings of different models and dimensions", async () => {
    const match = await create();
    const oldModel = await create();
    await app.db.update(reminderEmbedding).set({ model: `${reference}-old` }).where(eq(reminderEmbedding.reminderId, oldModel.id));
    await create({}, [1, 0]);
    expect(ids(await search({ mode: "semantic" }))).toEqual([match.id]);
  });
  it.each([768, 1024, 1536, 3072])("queries %i dimensional vectors alongside other dimensions", async (dims) => {
    const vector = Array.from({ length: dims }, (_, i) => i === 0 ? 1 : 0);
    model.doEmbed = async () => ({ embeddings: [vector], warnings: [] });
    const match = await create({}, vector);
    await create({}, [1, 0]);
    expect(ids(await search({ mode: "semantic" }))).toEqual([match.id]);
  });
  it("caches for 60 seconds and avoids regenerating query embeddings", async () => {
    await create();
    const doEmbed = vi.spyOn(model, "doEmbed");
    expect((await search({ mode: "semantic" })).json().cached).toBe(false);
    expect((await search({ mode: "semantic" })).json().cached).toBe(true);
    expect(doEmbed).toHaveBeenCalledTimes(1);
    const keys: string[] = [];
    for await (const chunk of app.redis.scanStream({ match: `search:${session.user.id}:*` })) keys.push(...chunk);
    expect(keys).toHaveLength(1);
    expect(await app.redis.ttl(keys[0]!)).toBeGreaterThan(55);
    expect(await app.redis.ttl(keys[0]!)).toBeLessThanOrEqual(60);
  });
  it("keeps caches separate by user, filters and default model", async () => {
    await create();
    expect((await search({ mode: "semantic" })).json().cached).toBe(false);
    expect((await search({ mode: "semantic", status: "done" })).json().cached).toBe(false);
    await app.db.update(aiUserSettings).set({ defaultEmbedding: `${reference}-large` });
    const changed = await search({ mode: "semantic" });
    expect(changed.json().cached).toBe(false);
    expect(ids(changed)).toEqual([]);
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    expect(ids(await search({}, other.cookie))).toEqual([]);
  });
  it("rechecks provider availability before returning cached semantic results", async () => {
    await create();
    await search({ mode: "semantic" });
    await app.db.update(aiProvider).set({ enabled: false });
    const res = await search({ mode: "semantic" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NO_EMBEDDING_PROVIDER");
  });
  it("invalidates a cached empty keyword result once indexing becomes visible", async () => {
    const row = await create();
    await app.es.delete({ index, id: row.id, refresh: true });
    expect(ids(await search())).toEqual([]);
    await indexReminder(app, row.id);
    const res = await search();
    expect(res.json().cached).toBe(false);
    expect(ids(res)).toEqual([row.id]);
  });
  it.each(["semantic", "hybrid"])("requires an embedding default for %s, including the default mode", async (mode) => {
    await app.db.delete(aiUserSettings);
    const res = await search({ mode });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NO_EMBEDDING_PROVIDER");
    const implicit = await app.inject({ method: "GET", url: "/search?q=aluguel", headers: { cookie: session.cookie } });
    expect(implicit.statusCode).toBe(409);
    expect((await search()).statusCode).toBe(200);
  });
  it("returns sanitized errors for failed embeddings and Elasticsearch", async () => {
    model.doEmbed = async () => { throw new Error("private-key response body"); };
    const embedding = await search({ mode: "semantic" });
    expect(embedding.statusCode).toBe(502);
    expect(embedding.body).not.toContain("private-key");
    vi.spyOn(app.es, "search").mockRejectedValueOnce(new Error("private response body"));
    const keyword = await search();
    expect(keyword.statusCode).toBe(502);
    expect(keyword.body).not.toContain("private response body");
  });
  it("respects limit and returns an empty result when no documents match", async () => {
    await create(); await create();
    expect(ids(await search({ limit: "1" }))).toHaveLength(1);
    expect(ids(await search({ q: "inexistente" }))).toEqual([]);
  });
  it.each<Record<string, string>>([{ q: " " }, { mode: "invalid" }, { limit: "0" }, { limit: "101" }, { status: "invalid" }, { from: "invalid" }, { from: "2031-01-01T00:00:00Z", to: "2030-01-01T00:00:00Z" }])("validates query %j", async (params) => {
    expect((await search(params)).statusCode).toBe(400);
  });
});
