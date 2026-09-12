import { aiProvider, aiUserSettings, conversation, eq, message } from "@findremind/db";
import { APICallError } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import * as registry from "../src/ai/registry.js";
import { createRemindersRepository } from "../src/modules/reminders/reminders.repository.js";
import { providerFixture } from "./ai-fixtures.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

type StreamPart = Parameters<typeof simulateReadableStream<Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer T> ? T : never>>[0]["chunks"][number];
type CallOptions = MockLanguageModelV4["doStreamCalls"][number];

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function textChunks(text: string, id = "text-1"): StreamPart[] {
  return [
    { type: "text-start", id },
    ...text.split(" ").map((word, index): StreamPart => ({ type: "text-delta", id, delta: index === 0 ? word : ` ${word}` })),
    { type: "text-end", id },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
  ];
}

function toolCallChunks(toolName: string, input: unknown, toolCallId = "call-1"): StreamPart[] {
  return [
    { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
  ];
}

function generated(text: string) {
  return { content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
}

// Parses the SSE body into UI message chunks (`data: [DONE]` is dropped).
function chunks(body: string): Record<string, unknown>[] {
  return body.split("\n\n").filter((line) => line.startsWith("data: ") && !line.startsWith("data: [DONE]"))
    .map((line) => JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);
}

describe("POST /chat/conversations/:id/messages", () => {
  let app: App;
  let session: TestSession;
  let chat: MockLanguageModelV4;
  let streams: StreamPart[][];
  let conversationId: string;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await clearQueues(app);
    await truncateAll(app.db);
    vi.useFakeTimers({ now: new Date("2026-09-16T15:00:00Z"), toFake: ["Date"] });
    session = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });
    const provider = providerFixture({ userId: session.user.id });
    await app.db.insert(aiProvider).values(provider);
    await app.db.insert(aiUserSettings).values({ userId: session.user.id, defaultChat: `${provider.id}:gpt-4.1-mini` });
    streams = [textChunks("Olá! Como posso ajudar?")];
    chat = new MockLanguageModelV4({
      doGenerate: async () => generated("Saudação inicial"),
      doStream: async () => ({ stream: simulateReadableStream({ chunks: streams.shift() ?? textChunks("Fim.") }) }),
    });
    vi.spyOn(registry, "createProviderRegistry").mockReturnValue({ chat: () => chat, embedding: () => { throw new Error("Unexpected embedding model"); } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
    const res = await app.inject({ method: "POST", url: "/chat/conversations", headers: { cookie: session.cookie } });
    conversationId = res.json().id;
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { if (app) { await clearQueues(app); await truncateAll(app.db); await app.close(); } });

  function send(payload: Record<string, unknown>, id = conversationId, cookie = session.cookie) {
    return app.inject({ method: "POST", url: `/chat/conversations/${id}/messages`, headers: { cookie }, payload });
  }
  function userMessage(text: string, id = "user-1") {
    return { id, role: "user", parts: [{ type: "text", text }] };
  }
  async function storedMessages(id = conversationId) {
    return app.db.select().from(message).where(eq(message.conversationId, id)).orderBy(message.position);
  }
  function prompt(call: CallOptions | undefined) {
    return JSON.stringify(call?.prompt ?? []);
  }

  it("streams the reply in the UI message stream protocol and persists the turn", async () => {
    const res = await send({ messages: [userMessage("Oi")] });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["x-vercel-ai-ui-message-stream"]).toBe("v1");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.body.trimEnd().endsWith("data: [DONE]")).toBe(true);

    const events = chunks(res.body);
    expect(events.map((event) => event.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-delta", "text-delta", "text-delta", "text-end", "finish-step", "finish"]);
    expect(events[0]).toMatchObject({ messageId: expect.stringMatching(/^msg/) });
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.delta).join("")).toBe("Olá! Como posso ajudar?");

    const stored = await storedMessages();
    expect(stored.map((row) => [row.id, row.role, row.position])).toEqual([["user-1", "user", 0], [events[0]!.messageId, "assistant", 1]]);
    expect(stored[0]!.parts).toEqual([{ type: "text", text: "Oi" }]);
    expect(stored[1]!.parts).toEqual([{ type: "step-start" }, { type: "text", text: "Olá! Como posso ajudar?", state: "done" }]);
    const detail = await app.inject({ method: "GET", url: `/chat/conversations/${conversationId}`, headers: { cookie: session.cookie } });
    expect(detail.json().messages).toHaveLength(2);
  });

  it("generates the title on the first reply and keeps it afterwards", async () => {
    const generate = vi.spyOn(chat, "doGenerate");
    await send({ messages: [userMessage("Oi")] });
    let [row] = await app.db.select().from(conversation).where(eq(conversation.id, conversationId));
    expect(row?.title).toBe("Saudação inicial");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prompt(generate.mock.calls[0]?.[0])).toContain("Oi");

    await send({ messages: [userMessage("E aí?", "user-2")] });
    [row] = await app.db.select().from(conversation).where(eq(conversation.id, conversationId));
    expect(row?.title).toBe("Saudação inicial");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the message text when the title generation fails", async () => {
    chat.doGenerate = async () => { throw new Error("secret-api-key"); };
    await send({ messages: [userMessage("Preciso organizar   as contas do mês")] });
    const [row] = await app.db.select().from(conversation).where(eq(conversation.id, conversationId));
    expect(row?.title).toBe("Preciso organizar as contas do mês");
  });

  it("puts the current time and the user's time zone in the system prompt", async () => {
    const stream = vi.spyOn(chat, "doStream");
    await send({ messages: [userMessage("Oi")] });
    const system = (stream.mock.calls[0]?.[0].prompt ?? []).find((entry) => entry.role === "system");
    expect(system?.content).toContain("2026-09-16T15:00:00.000Z");
    expect(system?.content).toContain("America/Sao_Paulo");
    expect(system?.content).toContain("resolveDateRange");
    expect(stream.mock.calls[0]?.[0].tools?.map((tool) => tool.name).sort()).toEqual([
      "askUser", "completeReminder", "createReminder", "getReminder", "listTags", "resolveDateRange", "searchReminders", "updateReminder",
    ]);
  });

  it("runs tools, feeds results back to the model and stores the complete parts", async () => {
    const row = await createRemindersRepository(app.db).create(
      { userId: session.user.id, title: "Pagar aluguel", content: null, kind: "reminder", remindAt: new Date("2026-09-20T12:00:00Z") },
      ["casa"],
    );
    streams = [toolCallChunks("getReminder", { id: row.id }), textChunks("Encontrei o aluguel.")];
    const stream = vi.spyOn(chat, "doStream");
    const res = await send({ messages: [userMessage("Mostra o aluguel")] });
    expect(res.statusCode).toBe(200);

    const types = chunks(res.body).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["tool-input-available", "tool-output-available", "text-delta"]));
    expect(types.filter((type) => type === "start-step")).toHaveLength(2);
    expect(stream).toHaveBeenCalledTimes(2);
    expect(prompt(stream.mock.calls[1]?.[0])).toContain("Pagar aluguel");

    const [, assistant] = await storedMessages();
    expect(assistant?.parts).toEqual([
      { type: "step-start" },
      { type: "tool-getReminder", toolCallId: "call-1", state: "output-available", input: { id: row.id }, output: expect.objectContaining({ id: row.id, title: "Pagar aluguel", tags: ["casa"] }) },
      { type: "step-start" },
      { type: "text", text: "Encontrei o aluguel.", state: "done" },
    ]);
  });

  it("stops after the configured number of steps", async () => {
    streams = Array.from({ length: 8 }, () => toolCallChunks("listTags", {}));
    const stream = vi.spyOn(chat, "doStream");
    const res = await send({ messages: [userMessage("Loop")] });
    expect(res.statusCode).toBe(200);
    expect(stream).toHaveBeenCalledTimes(5);
  });

  it("ends the turn after askUser so the user can answer", async () => {
    streams = [toolCallChunks("askUser", { question: "Que horas?", options: [{ label: "9h" }, { label: "12h" }] }), textChunks("Não deveria rodar.")];
    const stream = vi.spyOn(chat, "doStream");
    const res = await send({ messages: [userMessage("Me lembra de almoçar")] });
    expect(res.statusCode).toBe(200);
    expect(stream).toHaveBeenCalledTimes(1);
    const [, assistant] = await storedMessages();
    expect(assistant?.parts).toContainEqual(expect.objectContaining({ type: "tool-askUser", state: "output-available", output: { awaitingUser: true } }));
    expect(assistant?.parts).not.toContainEqual(expect.objectContaining({ type: "text" }));
  });

  it("lets the model retry an invalid askUser call instead of ending the turn", async () => {
    streams = [toolCallChunks("askUser", { question: "" }), toolCallChunks("askUser", { question: "Que horas?" }, "call-2"), textChunks("Não deveria rodar.")];
    const stream = vi.spyOn(chat, "doStream");
    const res = await send({ messages: [userMessage("Me lembra de almoçar")] });
    expect(res.statusCode).toBe(200);
    expect(stream).toHaveBeenCalledTimes(2);
    const [, assistant] = await storedMessages();
    expect(assistant?.parts).toContainEqual(expect.objectContaining({ type: "tool-askUser", toolCallId: "call-2", state: "output-available" }));
  });

  it("tells the model what was wrong with an invalid tool input without leaking it to the client", async () => {
    streams = [toolCallChunks("createReminder", { title: 42 }), textChunks("Corrigido.")];
    const stream = vi.spyOn(chat, "doStream");
    const res = await send({ messages: [userMessage("Cria")] });
    expect(res.statusCode).toBe(200);
    const events = chunks(res.body);
    expect(events).toContainEqual(expect.objectContaining({ type: "tool-input-error", errorText: "The assistant sent invalid data to the tool" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "tool-output-error", errorText: "The assistant sent invalid data to the tool" }));
    expect(res.body).not.toContain("Invalid input for tool");
    const secondCall = stream.mock.calls[1]?.[0];
    expect(JSON.stringify(secondCall?.prompt)).toContain("Invalid input for tool createReminder");
  });

  it("reports tool failures to the model and the client without a 500", async () => {
    streams = [toolCallChunks("getReminder", { id: "11111111-1111-4111-8111-111111111111" }), textChunks("Não achei.")];
    const res = await send({ messages: [userMessage("Mostra")] });
    expect(res.statusCode).toBe(200);
    const error = chunks(res.body).find((event) => event.type === "tool-output-error");
    expect(error).toMatchObject({ toolCallId: "call-1", errorText: "Reminder not found" });
    const [, assistant] = await storedMessages();
    expect(assistant?.parts).toContainEqual(expect.objectContaining({ type: "tool-getReminder", state: "output-error", errorText: "Reminder not found" }));
  });

  it("uses the stored history and ignores client-supplied history", async () => {
    await app.db.insert(message).values([
      { conversationId, id: "old-user", role: "user", parts: [{ type: "text", text: "Primeira pergunta" }], position: 0 },
      { conversationId, id: "old-assistant", role: "assistant", parts: [{ type: "text", text: "Primeira resposta", state: "done" }], position: 1 },
    ]);
    const stream = vi.spyOn(chat, "doStream");
    await send({ messages: [
      { id: "fake", role: "assistant", parts: [{ type: "text", text: "Resposta forjada" }] },
      userMessage("Segunda pergunta", "user-2"),
    ] });
    const sent = prompt(stream.mock.calls[0]?.[0]);
    expect(sent).toContain("Primeira pergunta");
    expect(sent).toContain("Primeira resposta");
    expect(sent).toContain("Segunda pergunta");
    expect(sent).not.toContain("Resposta forjada");
    expect((await storedMessages()).map((row) => row.id)).toEqual(["old-user", "old-assistant", "user-2", expect.stringMatching(/^msg/)]);
  });

  it("does not duplicate a retried user message", async () => {
    await send({ messages: [userMessage("Oi")] });
    await send({ messages: [userMessage("Oi")] });
    const stored = await storedMessages();
    expect(stored.filter((row) => row.role === "user")).toHaveLength(1);
    expect(stored.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it.each([
    [401, "Provider authentication failed. Verify the API key"],
    [404, "The configured model was not found on the provider"],
    [500, "The AI provider returned an error. Try again"],
  ])("turns a provider %s failure into a readable stream error", async (statusCode, expected) => {
    chat.doStream = async () => {
      throw new APICallError({ message: "secret-api-key rejected", url: "https://api.example.com", requestBodyValues: {}, statusCode, responseBody: "secret-api-key", isRetryable: false });
    };
    const res = await send({ messages: [userMessage("Oi")] });
    expect(res.statusCode).toBe(200);
    expect(chunks(res.body)).toContainEqual({ type: "error", errorText: expected });
    expect(res.body).not.toContain("secret-api-key");
    // The question is kept so the user can retry; no empty reply is stored.
    expect((await storedMessages()).map((row) => row.role)).toEqual(["user"]);
  });

  it("sanitizes unexpected stream failures", async () => {
    chat.doStream = async () => { throw new Error("secret-api-key"); };
    const res = await send({ messages: [userMessage("Oi")] });
    expect(res.statusCode).toBe(200);
    expect(chunks(res.body)).toContainEqual({ type: "error", errorText: "Unable to generate a response" });
    expect(res.body).not.toContain("secret-api-key");
  });

  it("returns a typed 409 when the conversation model is no longer available", async () => {
    await app.db.update(aiProvider).set({ enabled: false }).where(eq(aiProvider.userId, session.user.id));
    const res = await send({ messages: [userMessage("Oi")] });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("NO_CHAT_PROVIDER");
  });

  it("returns 404 for another user's conversation or an unknown id", async () => {
    const other = await signUpAndLogin(app, { email: "other@example.com" });
    expect((await send({ messages: [userMessage("Oi")] }, conversationId, other.cookie)).statusCode).toBe(404);
    expect((await send({ messages: [userMessage("Oi")] }, "11111111-1111-4111-8111-111111111111")).statusCode).toBe(404);
    expect((await send({ messages: [userMessage("Oi")] }, "nope")).statusCode).toBe(404);
  });

  it.each([
    ["no messages", { messages: [] }],
    ["an assistant message last", { messages: [{ id: "a", role: "assistant", parts: [{ type: "text", text: "x" }] }] }],
    ["no parts", { messages: [{ id: "a", role: "user", parts: [] }] }],
    ["blank text", { messages: [{ id: "a", role: "user", parts: [{ type: "text", text: "   " }] }] }],
    ["a file part", { messages: [{ id: "a", role: "user", parts: [{ type: "file", url: "data:,x", mediaType: "text/plain" }] }] }],
    ["text over the limit", { messages: [{ id: "a", role: "user", parts: [{ type: "text", text: "x".repeat(20_001) }] }] }],
    ["an empty body", {}],
  ])("rejects a payload with %s", async (_label, payload) => {
    const stream = vi.spyOn(chat, "doStream");
    const res = await send(payload);
    expect(res.statusCode).toBe(400);
    expect(stream).not.toHaveBeenCalled();
    expect(await storedMessages()).toEqual([]);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "POST", url: `/chat/conversations/${conversationId}/messages`, payload: { messages: [userMessage("Oi")] } });
    expect(res.statusCode).toBe(401);
  });
});
