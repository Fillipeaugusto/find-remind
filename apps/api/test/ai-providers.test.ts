import { aiProvider, aiUserSettings, eq } from "@findremind/db";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as catalog from "../src/ai/catalog.js";
import { createKeyCipher } from "../src/ai/crypto.js";
import * as registry from "../src/ai/registry.js";
import type { AiProvider, CreateProviderInput } from "../src/modules/ai-providers/ai-providers.schemas.js";
import { signUpAndLogin } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

function textResult() {
  return {
    content: [{ type: "text" as const, text: "OK" }], finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }, warnings: [],
  };
}

describe("AI provider routes", () => {
  let app: App;
  let cookie: string;
  let userId: string;
  let chat: MockLanguageModelV4;
  let embedding: MockEmbeddingModelV4;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await truncateAll(app.db);
    const session = await signUpAndLogin(app);
    cookie = session.cookie;
    userId = session.user.id;
    chat = new MockLanguageModelV4({ doGenerate: async () => textResult() });
    embedding = new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [[0.1, 0.2]], usage: { tokens: 1 }, warnings: [] }) });
    vi.spyOn(registry, "createProviderRegistry").mockImplementation(() => ({ chat: () => chat, embedding: () => embedding }));
    vi.spyOn(catalog, "listProviderModels").mockImplementation(async (row) => catalog.configuredCatalog(row));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (app) { await truncateAll(app.db); await app.close(); } });

  async function create(patch: Partial<CreateProviderInput> = {}, sessionCookie = cookie) {
    const res = await app.inject({ method: "POST", url: "/ai/providers", headers: { cookie: sessionCookie }, payload: {
      kind: "openai", label: "My provider", apiKey: "sk-private-test-key", defaultChatModel: "gpt-4.1-mini", ...patch,
    } });
    expect(res.statusCode).toBe(201);
    return res.json<AiProvider>();
  }
  async function check(id: string) {
    return app.inject({ method: "POST", url: `/ai/providers/${id}/test`, headers: { cookie } });
  }
  async function defaults(payload: { chat?: string; embedding?: string }, sessionCookie = cookie) {
    return app.inject({ method: "PUT", url: "/ai/defaults", headers: { cookie: sessionCookie }, payload });
  }

  it.each([
    ["GET", "/ai/providers", undefined], ["POST", "/ai/providers", { kind: "ollama", label: "Local" }],
    ["PATCH", "/ai/providers/11111111-1111-4111-8111-111111111111", {}],
    ["DELETE", "/ai/providers/11111111-1111-4111-8111-111111111111", undefined],
    ["POST", "/ai/providers/11111111-1111-4111-8111-111111111111/test", undefined],
    ["GET", "/ai/providers/11111111-1111-4111-8111-111111111111/models", undefined],
    ["GET", "/ai/models", undefined], ["PUT", "/ai/defaults", {}],
  ] as const)("requires authentication for %s %s", async (method, url, payload) => {
    const res = await app.inject({ method, url, payload });
    expect(res.statusCode).toBe(401);
  });

  it("creates and lists providers while storing only encrypted keys", async () => {
    const provider = await create({ label: "  Personal  ", baseUrl: "https://compatible.example/v1/" });
    expect(provider).toMatchObject({ label: "Personal", baseUrl: "https://compatible.example/v1", hasApiKey: true, enabled: true, lastCheckStatus: null });
    const [stored] = await app.db.select().from(aiProvider);
    expect(stored?.apiKeyEncrypted).toMatch(/^v1:/);
    expect(createKeyCipher(app.env.AI_KEYS_ENCRYPTION_KEY).decrypt(stored!.apiKeyEncrypted!)).toBe("sk-private-test-key");
    const list = await app.inject({ method: "GET", url: "/ai/providers", headers: { cookie } });
    expect(list.json()).toEqual({ items: [provider] });
    for (const secret of ["sk-private-test-key", "apiKeyEncrypted", "userId"]) expect(list.body).not.toContain(secret);
  });

  it("accepts a local provider without an API key and ignores ownership supplied in the body", async () => {
    const res = await app.inject({ method: "POST", url: "/ai/providers", headers: { cookie }, payload: { kind: "ollama", label: "Local", userId: "someone-else", apiKeyEncrypted: "injected" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ hasApiKey: false, kind: "ollama" });
    expect((await app.db.select().from(aiProvider))[0]).toMatchObject({ userId, apiKeyEncrypted: null });
  });

  it("preserves the encrypted key on partial updates and replaces it only when sent", async () => {
    const provider = await create();
    const before = (await app.db.select().from(aiProvider))[0]!.apiKeyEncrypted;
    const updated = await app.inject({ method: "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, payload: { label: "Renamed" } });
    expect(updated.statusCode).toBe(200);
    expect((await app.db.select().from(aiProvider))[0]!.apiKeyEncrypted).toBe(before);
    const replaced = await app.inject({ method: "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, payload: { apiKey: "replacement-secret" } });
    expect(replaced.statusCode).toBe(200);
    const after = (await app.db.select().from(aiProvider))[0]!.apiKeyEncrypted!;
    expect(after).not.toBe(before);
    expect(createKeyCipher(app.env.AI_KEYS_ENCRYPTION_KEY).decrypt(after)).toBe("replacement-secret");
    expect(replaced.body).not.toContain("replacement-secret");
  });

  it("tests chat and embeddings with SDK mocks and records success", async () => {
    const provider = await create({ defaultEmbeddingModel: "text-embedding-3-small" });
    const res = await check(provider.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ lastCheckStatus: "ok", lastCheckError: null });
    expect(res.json().lastCheckedAt).toMatch(/^\d{4}-/);
    expect(chat.doGenerateCalls).toHaveLength(1);
    expect(chat.doGenerateCalls[0]?.maxOutputTokens).toBe(5);
    expect(embedding.doEmbedCalls).toHaveLength(1);
  });

  it("tests an embedding-only provider without invoking chat", async () => {
    const provider = await create({ kind: "ollama", defaultChatModel: null, defaultEmbeddingModel: "nomic-embed-text:latest" });
    expect((await check(provider.id)).json().lastCheckStatus).toBe("ok");
    expect(chat.doGenerateCalls).toHaveLength(0);
    expect(embedding.doEmbedCalls).toHaveLength(1);
  });

  it("selects a curated chat model if none was configured", async () => {
    const provider = await create({ defaultChatModel: null });
    expect((await check(provider.id)).json().lastCheckStatus).toBe("ok");
    expect(chat.doGenerateCalls).toHaveLength(1);
  });

  it("records failures without leaking remote error details or API keys", async () => {
    const provider = await create({ defaultEmbeddingModel: "text-embedding-3-small" });
    await check(provider.id);
    expect((await defaults({ chat: `${provider.id}:gpt-4.1-mini` })).statusCode).toBe(204);
    embedding.doEmbed = async () => { throw new Error("request failed: sk-private-test-key Authorization Bearer secret"); };
    const res = await check(provider.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().lastCheckStatus).toBe("error");
    expect(res.json().lastCheckError).toContain("Connection check failed");
    expect(res.body).not.toContain("sk-private-test-key");
    expect(res.body).not.toContain("Authorization");
    const [settings] = await app.db.select().from(aiUserSettings);
    expect(settings?.defaultChat).toBeNull();
  });

  it("reports real configuration errors without contacting a provider", async () => {
    vi.mocked(registry.createProviderRegistry).mockRestore();
    const res = await app.inject({ method: "POST", url: "/ai/providers", headers: { cookie }, payload: { kind: "openai", label: "Incomplete" } });
    expect(res.statusCode).toBe(201);
    const tested = await check(res.json().id);
    expect(tested.json()).toMatchObject({ lastCheckStatus: "error", lastCheckError: "An API key is required for this provider" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ apiKey: "new-secret" }, { baseUrl: "https://new.example/v1" }, { defaultChatModel: "new-model" }])("invalidates checks and defaults on connection/model changes %j", async (patch) => {
    const provider = await create();
    await check(provider.id);
    await defaults({ chat: `${provider.id}:gpt-4.1-mini` });
    const res = await app.inject({ method: "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, payload: patch });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ lastCheckStatus: null, lastCheckedAt: null, lastCheckError: null });
    expect((await app.db.select().from(aiUserSettings))[0]?.defaultChat).toBeNull();
  });

  it("does not invalidate checks on label edits or empty patches", async () => {
    const provider = await create();
    await check(provider.id);
    for (const payload of [{ label: "Renamed" }, {}]) {
      const res = await app.inject({ method: "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, payload });
      expect(res.statusCode).toBe(200);
      expect(res.json().lastCheckStatus).toBe("ok");
    }
  });

  it("does not mark new credentials checked when an older connection test finishes", async () => {
    const provider = await create();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn(async () => { await gate; return textResult(); });
    chat.doGenerate = generate;
    const pending = app.inject({ method: "POST", url: `/ai/providers/${provider.id}/test`, headers: { cookie } }).then((res) => res);
    try {
      await vi.waitFor(() => expect(generate).toHaveBeenCalled());
      const update = await app.inject({ method: "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, payload: { apiKey: "new-secret" } });
      expect(update.statusCode).toBe(200);
    } finally { release(); }
    expect((await pending).json().lastCheckStatus).toBeNull();
  });

  it("only lists models of enabled, checked providers belonging to the user", async () => {
    const ready = await create();
    await check(ready.id);
    await create({ label: "Unchecked" });
    const disabled = await create({ enabled: false });
    await check(disabled.id);
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    const foreign = await create({}, other.cookie);
    await app.db.update(aiProvider).set({ lastCheckStatus: "ok" }).where(eq(aiProvider.id, foreign.id));
    const res = await app.inject({ method: "GET", url: "/ai/models", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().chat.length).toBeGreaterThan(0);
    expect(new Set(res.json().chat.map((item: { providerId: string }) => item.providerId))).toEqual(new Set([ready.id]));
    expect(res.json().defaults).toEqual({ chat: null, embedding: null });
  });

  it("persists both defaults, supports partial updates, and returns them in available models", async () => {
    const provider = await create({ defaultEmbeddingModel: "text-embedding-3-small" });
    await check(provider.id);
    expect((await defaults({ chat: `${provider.id}:gpt-4.1-mini`, embedding: `${provider.id}:text-embedding-3-small` })).statusCode).toBe(204);
    expect((await defaults({ chat: `${provider.id}:gpt-5-mini` })).statusCode).toBe(204);
    expect((await defaults({})).statusCode).toBe(204);
    const res = await app.inject({ method: "GET", url: "/ai/models", headers: { cookie } });
    expect(res.json().defaults).toEqual({ chat: `${provider.id}:gpt-5-mini`, embedding: `${provider.id}:text-embedding-3-small` });
  });

  it("rejects unavailable defaults with typed 409 errors", async () => {
    const provider = await create();
    for (const kind of ["chat", "embedding"] as const) {
      const res = await defaults({ [kind]: `${provider.id}:model` });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe(kind === "chat" ? "NO_CHAT_PROVIDER" : "NO_EMBEDDING_PROVIDER");
    }
  });

  it("rejects unknown models and leaves both defaults unchanged on invalid input", async () => {
    const provider = await create();
    await check(provider.id);
    await defaults({ chat: `${provider.id}:gpt-4.1-mini` });
    const res = await defaults({ chat: `${provider.id}:gpt-5-mini`, embedding: `${provider.id}:unknown` });
    expect(res.statusCode).toBe(400);
    expect((await app.db.select().from(aiUserSettings))[0]?.defaultChat).toBe(`${provider.id}:gpt-4.1-mini`);
  });

  it.each(["disable", "delete"])("clears defaults when providers %s", async (action) => {
    const provider = await create({ defaultEmbeddingModel: "text-embedding-3-small" });
    await check(provider.id);
    await defaults({ chat: `${provider.id}:gpt-4.1-mini`, embedding: `${provider.id}:text-embedding-3-small` });
    const res = await app.inject({ method: action === "delete" ? "DELETE" : "PATCH", url: `/ai/providers/${provider.id}`, headers: { cookie }, ...(action === "disable" ? { payload: { enabled: false } } : {}) });
    expect(res.statusCode).toBe(action === "delete" ? 204 : 200);
    const available = await app.inject({ method: "GET", url: "/ai/models", headers: { cookie } });
    expect(available.json()).toEqual({ chat: [], embedding: [], defaults: { chat: null, embedding: null } });
  });

  it("isolates all provider actions and defaults from other users", async () => {
    const provider = await create();
    await check(provider.id);
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    for (const [method, path, payload] of [
      ["PATCH", "", { label: "Stolen" }], ["DELETE", "", undefined], ["POST", "/test", undefined], ["GET", "/models", undefined],
    ] as const) {
      const res = await app.inject({ method, url: `/ai/providers/${provider.id}${path}`, headers: { cookie: other.cookie }, payload });
      expect(res.statusCode).toBe(404);
    }
    expect((await defaults({ chat: `${provider.id}:gpt-4.1-mini` }, other.cookie)).statusCode).toBe(409);
    const list = await app.inject({ method: "GET", url: "/ai/providers", headers: { cookie: other.cookie } });
    expect(list.json()).toEqual({ items: [] });
  });

  it("returns discovered provider models and handles unavailable Ollama catalogs", async () => {
    const provider = await create({ kind: "ollama" });
    vi.mocked(catalog.listProviderModels).mockResolvedValueOnce({ chat: [{ id: "local:latest", label: "Local" }], embedding: [] });
    const res = await app.inject({ method: "GET", url: `/ai/providers/${provider.id}/models`, headers: { cookie } });
    expect(res.json()).toEqual({ chat: [{ id: "local:latest", label: "Local" }], embedding: [] });
    vi.mocked(catalog.listProviderModels).mockRejectedValueOnce(new Error("secret internal detail"));
    const failed = await app.inject({ method: "GET", url: `/ai/providers/${provider.id}/models`, headers: { cookie } });
    expect(failed.statusCode).toBe(502);
    expect(failed.body).not.toContain("secret internal detail");
  });

  it.each([
    { kind: "invalid" }, { label: " " }, { apiKey: "" }, { baseUrl: "file:///tmp/secret" },
    { baseUrl: "not-a-url" },
    { baseUrl: "http://user:password@host" }, { baseUrl: "https://host/?api_key=secret" },
    { kind: "anthropic", defaultEmbeddingModel: "unsupported" }, { defaultChatModel: " " },
  ])("rejects invalid provider settings %j", async (patch) => {
    const res = await app.inject({ method: "POST", url: "/ai/providers", headers: { cookie }, payload: { kind: "openai", label: "Provider", ...patch } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects malformed identifiers and defaults", async () => {
    const res = await app.inject({ method: "PATCH", url: "/ai/providers/not-a-uuid", headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(400);
    expect((await defaults({ chat: "bad-reference" })).statusCode).toBe(400);
  });
});
