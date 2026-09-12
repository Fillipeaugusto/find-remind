import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFixture } from "../../test/ai-fixtures.js";
import { loadEnv } from "../config/env.js";
import { listProviderModels } from "./catalog.js";

afterEach(() => vi.unstubAllGlobals());

describe("provider model catalogs", () => {
  it("lists installed Ollama models by their capabilities", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ models: [{ name: "local:latest" }, { name: "vectors:v2" }] }))
      .mockResolvedValueOnce(Response.json({ capabilities: ["completion", "tools"] }))
      .mockResolvedValueOnce(Response.json({ capabilities: ["embedding"] }));
    vi.stubGlobal("fetch", request);
    const models = await listProviderModels(providerFixture({ kind: "ollama", baseUrl: "http://ollama.local:11434" }), loadEnv());
    expect(models).toEqual({ chat: [{ id: "local:latest", label: "local:latest" }], embedding: [{ id: "vectors:v2", label: "vectors:v2" }] });
    expect(String(request.mock.calls[0]?.[0])).toBe("http://ollama.local:11434/api/tags");
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({ model: "local:latest" });
  });

  it("propagates an unavailable Ollama catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(listProviderModels(providerFixture({ kind: "ollama" }), loadEnv())).rejects.toThrow("Unable to list");
  });

  it("merges OpenAI models with curated entries without duplicates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "gpt-4.1-mini" }, { id: "gpt-new" }, { id: "new-embedding" }, { id: "dall-e-3" }] })));
    const result = await listProviderModels(providerFixture(), loadEnv());
    expect(result.chat.filter((m) => m.id === "gpt-4.1-mini")).toHaveLength(1);
    expect(result.chat.some((m) => m.id === "gpt-new")).toBe(true);
    expect(result.chat.some((m) => m.id === "dall-e-3")).toBe(false);
    expect(result.embedding.some((m) => m.id === "new-embedding")).toBe(true);
  });

  it("paginates Google catalogs and classifies supported operations", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ models: [{ name: "models/new-chat", supportedGenerationMethods: ["generateContent"] }], nextPageToken: "next" }))
      .mockResolvedValueOnce(Response.json({ models: [{ name: "models/new-embedding", supportedGenerationMethods: ["embedContent"] }] }));
    vi.stubGlobal("fetch", request);
    const result = await listProviderModels(providerFixture({ kind: "google", defaultChatModel: null, defaultEmbeddingModel: null }), loadEnv());
    expect(result.chat.some((m) => m.id === "new-chat")).toBe(true);
    expect(result.embedding.some((m) => m.id === "new-embedding")).toBe(true);
    expect(String(request.mock.calls[1]?.[0])).toContain("pageToken=next");
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("test-provider-key");
  });

  it("paginates Anthropic catalogs", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ id: "claude-first", display_name: "First" }], has_more: true, last_id: "claude-first" }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "claude-second" }], has_more: false }));
    vi.stubGlobal("fetch", request);
    const result = await listProviderModels(providerFixture({ kind: "anthropic" }), loadEnv());
    expect(result.chat.some((m) => m.id === "claude-second")).toBe(true);
    expect(result.embedding).toEqual([]);
    expect(String(request.mock.calls[1]?.[0])).toContain("after_id=claude-first");
  });

  it("retains configured compatible models when catalog discovery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await listProviderModels(providerFixture({ baseUrl: "http://local/v1", defaultChatModel: "custom" }), loadEnv());
    expect(result.chat.some((m) => m.id === "custom")).toBe(true);
  });
});
