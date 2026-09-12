import { aiProvider, aiUserSettings, conversation, eq, message } from "@findremind/db";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as registry from "../src/ai/registry.js";
import type { Conversation } from "../src/modules/chat/chat.schemas.js";
import { providerFixture } from "./ai-fixtures.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

describe("chat conversation routes", () => {
  let app: App;
  let session: TestSession;
  let reference: string;
  let chat: MockLanguageModelV4;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await clearQueues(app);
    await truncateAll(app.db);
    session = await signUpAndLogin(app);
    const provider = providerFixture({ userId: session.user.id });
    await app.db.insert(aiProvider).values(provider);
    reference = `${provider.id}:gpt-4.1-mini`;
    await app.db.insert(aiUserSettings).values({ userId: session.user.id, defaultChat: reference });
    chat = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("Unexpected model call"); } });
    vi.spyOn(registry, "createProviderRegistry").mockImplementation(() => ({ chat: () => chat, embedding: () => { throw new Error("Unexpected embedding model"); } }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (app) { await clearQueues(app); await truncateAll(app.db); await app.close(); } });

  async function create(payload: Record<string, unknown> | undefined = {}, cookie = session.cookie) {
    return app.inject({ method: "POST", url: "/chat/conversations", headers: { cookie }, ...(payload === undefined ? {} : { payload }) });
  }
  async function created(payload?: Record<string, unknown>): Promise<Conversation> {
    const res = await create(payload);
    expect(res.statusCode).toBe(201);
    return res.json<Conversation>();
  }

  describe("POST /chat/conversations", () => {
    it("creates a conversation with the user's default chat model", async () => {
      const res = await create();
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        id: expect.any(String), title: null, model: reference,
        createdAt: expect.any(String), updatedAt: expect.any(String),
      });
      const [row] = await app.db.select().from(conversation).where(eq(conversation.userId, session.user.id));
      expect(row?.model).toBe(reference);
    });
    it("accepts a request without a body", async () => {
      expect((await create(undefined)).statusCode).toBe(201);
    });
    it("pins an explicit model reference", async () => {
      const explicit = reference.replace("gpt-4.1-mini", "gpt-4.1");
      expect((await created({ model: explicit })).model).toBe(explicit);
    });
    it("returns a typed 409 without a usable chat model", async () => {
      await app.db.update(aiUserSettings).set({ defaultChat: null }).where(eq(aiUserSettings.userId, session.user.id));
      const res = await create();
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "NO_CHAT_PROVIDER" });
    });
    it("rejects a model whose provider is not available", async () => {
      await app.db.update(aiProvider).set({ enabled: false }).where(eq(aiProvider.userId, session.user.id));
      const res = await create({ model: reference });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("NO_CHAT_PROVIDER");
    });
    it("rejects a model belonging to another user", async () => {
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      const res = await create({ model: reference }, other.cookie);
      expect(res.statusCode).toBe(409);
    });
    it.each([{ model: "not-a-reference" }, { model: 1 }, { model: "" }])("validates the body %j", async (payload) => {
      expect((await create(payload)).statusCode).toBe(400);
    });
  });

  describe("GET /chat/conversations", () => {
    it("lists the most recently updated conversations first with cursor pagination", async () => {
      const first = await created();
      const second = await created();
      const third = await created();
      await app.db.update(conversation).set({ updatedAt: new Date(Date.now() + 60_000) }).where(eq(conversation.id, first.id));

      const page1 = await app.inject({ method: "GET", url: "/chat/conversations?limit=2", headers: { cookie: session.cookie } });
      expect(page1.statusCode).toBe(200);
      expect(page1.json().items.map((item: Conversation) => item.id)).toEqual([first.id, third.id]);
      expect(page1.json().nextCursor).toEqual(expect.any(String));

      const page2 = await app.inject({ method: "GET", url: `/chat/conversations?limit=2&cursor=${page1.json().nextCursor}`, headers: { cookie: session.cookie } });
      expect(page2.json().items.map((item: Conversation) => item.id)).toEqual([second.id]);
      expect(page2.json().nextCursor).toBeNull();
    });
    it("only lists the user's own conversations", async () => {
      const mine = await created();
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      const res = await app.inject({ method: "GET", url: "/chat/conversations", headers: { cookie: other.cookie } });
      expect(res.json().items).toEqual([]);
      expect(res.body).not.toContain(mine.id);
    });
    it.each(["?cursor=nope", "?limit=0", "?limit=101"])("rejects invalid query %s", async (query) => {
      const res = await app.inject({ method: "GET", url: `/chat/conversations${query}`, headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /chat/conversations/:id", () => {
    it("returns the conversation and its messages in order", async () => {
      const item = await created();
      const parts = [{ type: "text", text: "Oi" }];
      await app.db.insert(message).values([
        { conversationId: item.id, id: "m2", role: "assistant", parts: [{ type: "text", text: "Olá!" }], position: 1 },
        { conversationId: item.id, id: "m1", role: "user", parts, position: 0 },
      ]);
      const res = await app.inject({ method: "GET", url: `/chat/conversations/${item.id}`, headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        conversation: item,
        messages: [
          { id: "m1", role: "user", parts },
          { id: "m2", role: "assistant", parts: [{ type: "text", text: "Olá!" }] },
        ],
      });
    });
    it("returns 404 for another user's conversation or an unknown id", async () => {
      const item = await created();
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      expect((await app.inject({ method: "GET", url: `/chat/conversations/${item.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/chat/conversations/not-a-uuid", headers: { cookie: session.cookie } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/chat/conversations/11111111-1111-4111-8111-111111111111", headers: { cookie: session.cookie } })).statusCode).toBe(404);
    });
  });

  describe("DELETE /chat/conversations/:id", () => {
    it("deletes the conversation with its messages", async () => {
      const item = await created();
      await app.db.insert(message).values({ conversationId: item.id, id: "m1", role: "user", parts: [], position: 0 });
      const res = await app.inject({ method: "DELETE", url: `/chat/conversations/${item.id}`, headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(204);
      expect(await app.db.select().from(message).where(eq(message.conversationId, item.id))).toEqual([]);
      expect((await app.inject({ method: "GET", url: `/chat/conversations/${item.id}`, headers: { cookie: session.cookie } })).statusCode).toBe(404);
    });
    it("never deletes another user's conversation", async () => {
      const item = await created();
      const other = await signUpAndLogin(app, { email: "other@example.com" });
      expect((await app.inject({ method: "DELETE", url: `/chat/conversations/${item.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: `/chat/conversations/${item.id}`, headers: { cookie: session.cookie } })).statusCode).toBe(200);
    });
  });

  it.each([
    ["GET", "/chat/conversations"],
    ["POST", "/chat/conversations"],
    ["GET", "/chat/conversations/11111111-1111-4111-8111-111111111111"],
    ["DELETE", "/chat/conversations/11111111-1111-4111-8111-111111111111"],
  ] as const)("%s %s requires authentication", async (method, url) => {
    expect((await app.inject({ method, url })).statusCode).toBe(401);
  });
});
