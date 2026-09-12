import { embed } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFixture } from "../../test/ai-fixtures.js";
import { loadEnv } from "../config/env.js";
import { createProviderRegistry, providerConnection } from "./registry.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("provider registry", () => {
  it.each([
    ["openai", "openai.chat"], ["anthropic", "anthropic.messages"],
    ["google", "google.generative-ai"], ["ollama", "ollama.responses"],
  ] as const)("instantiates %s chat models", (kind, provider) => {
    expect(createProviderRegistry(providerFixture({ kind }), loadEnv()).chat("test-model")).toMatchObject({ modelId: "test-model", provider });
  });

  it.each(["openai", "google", "ollama"] as const)("instantiates %s embedding models", (kind) => {
    expect(createProviderRegistry(providerFixture({ kind }), loadEnv()).embedding("embedding-model")).toMatchObject({ modelId: "embedding-model" });
  });

  it("rejects embeddings for Anthropic", () => {
    expect(() => createProviderRegistry(providerFixture({ kind: "anthropic" }), loadEnv()).embedding("embedding")).toThrow("Anthropic does not provide");
  });

  it("uses the stored key and base URL for actual SDK requests", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1, total_tokens: 1 } }));
    vi.stubGlobal("fetch", request);
    const registry = createProviderRegistry(providerFixture({ baseUrl: "https://compatible.example/v1/" }), loadEnv());
    const result = await embed({ model: registry.embedding("custom-embedding"), value: "ping" });
    expect(result.embedding).toEqual([0.1, 0.2]);
    expect(String(request.mock.calls[0]?.[0])).toBe("https://compatible.example/v1/embeddings");
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer test-provider-key");
    expect(request.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("does not fall back to a server API key", () => {
    vi.stubEnv("OPENAI_API_KEY", "server-secret");
    expect(() => createProviderRegistry(providerFixture({ apiKeyEncrypted: null }), loadEnv())).toThrow("API key is required");
  });

  it("normalizes the Ollama API path once and allows a local server without a key", () => {
    for (const baseUrl of ["http://localhost:11434", "http://localhost:11434/api/"]) {
      const row = providerFixture({ kind: "ollama", baseUrl, apiKeyEncrypted: null });
      expect(providerConnection(row, loadEnv()).baseURL).toBe("http://localhost:11434/api");
      expect(createProviderRegistry(row, loadEnv()).chat("llama:latest")).toMatchObject({ modelId: "llama:latest" });
    }
  });
});
