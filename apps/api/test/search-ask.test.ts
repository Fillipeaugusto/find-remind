import { randomUUID } from "node:crypto";
import { aiProvider, aiUserSettings, eq, reminderEmbedding } from "@findremind/db";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as registry from "../src/ai/registry.js";
import { createRemindersRepository } from "../src/modules/reminders/reminders.repository.js";
import * as searchIndex from "../src/search/index.js";
import { toDocument } from "../src/search/indexer.js";
import { providerFixture } from "./ai-fixtures.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

function result(text: string) {
  return { content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, warnings: [], usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  } };
}

describe("natural-language search", () => {
  let app: App;
  let session: TestSession;
  let chat: MockLanguageModelV4;
  let embedding: MockEmbeddingModelV4;
  let extracted: Record<string, unknown>;
  let answer: string;
  let reference: string;
  let index: string;
  beforeAll(async () => {
    app = await createTestApp(); index = `test-reminders-ask-${randomUUID()}`;
    await searchIndex.ensureIndex(app.es, index);
  });
  beforeEach(async () => {
    await clearQueues(app); await truncateAll(app.db); await app.cache.invalidate("search:*");
    await app.es.deleteByQuery({ index, query: { match_all: {} }, refresh: true, conflicts: "proceed" });
    vi.spyOn(searchIndex, "remindersIndexName").mockReturnValue(index);
    vi.useFakeTimers({ now: new Date("2026-09-16T15:00:00Z"), toFake: ["Date"] });
    session = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });
    const provider = providerFixture({ userId: session.user.id });
    await app.db.insert(aiProvider).values(provider);
    reference = `${provider.id}:text-embedding-3-small`;
    await app.db.insert(aiUserSettings).values({ userId: session.user.id, defaultEmbedding: reference, defaultChat: `${provider.id}:gpt-4.1-mini` });
    extracted = { query: "aluguel", dateExpression: "semana passada", tags: [" CASA ", "casa"], status: "scheduled" };
    answer = "Encontrei o pagamento do aluguel.";
    chat = new MockLanguageModelV4({ doGenerate: async (options) => result(options.responseFormat?.type === "json" ? JSON.stringify(extracted) : answer) });
    embedding = new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [[1, 0, 0]], warnings: [] }) });
    vi.spyOn(registry, "createProviderRegistry").mockReturnValue({ chat: () => chat, embedding: () => embedding });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => {
    if (app) { await clearQueues(app); await app.cache.invalidate("search:*"); await truncateAll(app.db); await app.es.indices.delete({ index }); await app.close(); }
  });
  async function create(userId = session.user.id, date = "2026-09-09T12:00:00Z") {
    const row = await createRemindersRepository(app.db).create({ userId, title: "Pagar aluguel", content: "Pagamento do apartamento", kind: "reminder", remindAt: new Date(date) }, ["casa"]);
    await app.db.insert(reminderEmbedding).values({ reminderId: row.id, model: reference, dims: 3, embedding: [1, 0, 0] });
    await app.es.index({ index, id: row.id, document: toDocument(row) });
    return row;
  }
  async function ask(question = "Quais aluguéis de casa ficaram agendados na semana passada?") {
    await app.es.indices.refresh({ index });
    return app.inject({ method: "POST", url: "/search/ask", headers: { cookie: session.cookie }, payload: { question } });
  }

  it("extracts filters, resolves the local date range, searches and cites real reminders", async () => {
    const wanted = await create();
    await create(session.user.id, "2026-09-15T12:00:00Z");
    const calls = vi.spyOn(chat, "doGenerate");
    const res = await ask();
    expect(res.statusCode).toBe(200);
    expect(res.json().filters).toEqual({ from: "2026-09-07T03:00:00.000Z", to: "2026-09-14T02:59:59.999Z", tags: ["casa"], status: "scheduled" });
    expect(res.json().items.map((item: { reminder: { id: string } }) => item.reminder.id)).toEqual([wanted.id]);
    expect(res.json().answer).toContain(`](/reminders/${wanted.id})`);
    expect(calls).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(calls.mock.calls[0]?.[0].prompt)).toContain("America/Sao_Paulo");
    expect(JSON.stringify(calls.mock.calls[0]?.[0].prompt)).toContain("2026-09-16T15:00:00.000Z");
  });
  it("never sends another user's reminders to the summarizing model", async () => {
    const own = await create();
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    const foreign = await create(other.user.id);
    extracted.userId = other.user.id;
    const calls = vi.spyOn(chat, "doGenerate");
    const res = await ask();
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(foreign.id);
    const prompt = JSON.stringify(calls.mock.calls[1]?.[0].prompt);
    expect(prompt).toContain(own.id);
    expect(prompt).not.toContain(foreign.id);
  });
  it("preserves an existing valid citation without adding a sources footer", async () => {
    const row = await create(); answer = `Aluguel encontrado [1](/reminders/${row.id}).`;
    expect((await ask()).json().answer).toBe(answer);
  });
  it("returns an explicit empty answer without calling the summary model", async () => {
    const calls = vi.spyOn(chat, "doGenerate");
    const res = await ask();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ answer: "Não encontrei lembretes para essa busca.", items: [] });
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it("lets deterministic date expressions override model-generated absolute dates", async () => {
    extracted.from = "2000-01-01T00:00:00Z"; extracted.to = "2000-01-02T00:00:00Z";
    const res = await ask();
    expect(res.statusCode).toBe(200);
    expect(res.json().filters.from).toBe("2026-09-07T03:00:00.000Z");
  });
  it("accepts explicit date bounds and omitted/null filters", async () => {
    await create();
    extracted = { query: "aluguel", from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:59:59Z", tags: null, status: null, dateExpression: null };
    const res = await ask();
    expect(res.statusCode).toBe(200);
    expect(res.json().filters).toEqual({ from: extracted.from, to: extracted.to });
    expect(res.json().items).toHaveLength(1);
  });
  it("supports a question that contains only date filters", async () => {
    await create(); extracted.query = "";
    const res = await ask("O que ficou para a semana passada?");
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
  });
  it("uses the updated user's time zone for day bounds", async () => {
    await app.inject({ method: "PATCH", url: "/me", headers: { cookie: session.cookie }, payload: { timezone: "America/New_York" } });
    extracted = { query: "aluguel", dateExpression: "hoje" };
    const res = await ask();
    expect(res.json().filters).toEqual({ from: "2026-09-16T04:00:00.000Z", to: "2026-09-17T03:59:59.999Z" });
  });
  it.each(["chat", "embedding"])("returns a typed 409 without a %s default", async (kind) => {
    await app.db.update(aiUserSettings).set(kind === "chat" ? { defaultChat: null } : { defaultEmbedding: null }).where(eq(aiUserSettings.userId, session.user.id));
    const res = await ask();
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(kind === "chat" ? "NO_CHAT_PROVIDER" : "NO_EMBEDDING_PROVIDER");
  });
  it("rejects unsupported date expressions instead of guessing", async () => {
    extracted.dateExpression = "em alguma época";
    const res = await ask();
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Unsupported date expression");
  });
  it("rejects inverted model-generated dates", async () => {
    extracted = { query: "aluguel", from: "2026-10-01T00:00:00Z", to: "2026-09-01T00:00:00Z" };
    expect((await ask()).statusCode).toBe(502);
  });
  it.each(["extraction", "summary", "empty-summary", "invalid-json", "embedding"])("sanitizes %s failures", async (stage) => {
    await create();
    if (stage === "embedding") embedding.doEmbed = async () => { throw new Error("secret-api-key"); };
    else chat.doGenerate = async (options) => {
      if (options.responseFormat?.type === "json") {
        if (stage === "extraction") throw new Error("secret-api-key");
        if (stage === "invalid-json") return result("not json secret-api-key");
        return result(JSON.stringify(extracted));
      }
      if (stage === "empty-summary") return result(" ");
      throw new Error("secret-api-key");
    };
    const res = await ask();
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("secret-api-key");
  });
  it("requires authentication", async () => {
    expect((await app.inject({ method: "POST", url: "/search/ask", payload: { question: "Aluguel?" } })).statusCode).toBe(401);
  });
  it.each([{}, { question: " " }, { question: 1 }, { question: "x".repeat(2_001) }])("validates the question body %j", async (payload) => {
    const res = await app.inject({ method: "POST", url: "/search/ask", headers: { cookie: session.cookie }, payload });
    expect(res.statusCode).toBe(400);
  });
});
