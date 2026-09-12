import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { aiProvider } from "@findremind/db";
import type { EmbeddingModel, LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { Env } from "../config/env.js";
import { createKeyCipher } from "./crypto.js";
import { ProviderConfigurationError } from "./errors.js";

export type ProviderRow = typeof aiProvider.$inferSelect;
export interface ProviderRegistry {
  chat(model: string): LanguageModel;
  embedding(model: string): EmbeddingModel;
}

export function providerConnection(row: ProviderRow, env: Env) {
  const defaults = {
    ollama: env.OLLAMA_BASE_URL,
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
  };
  let baseURL = (row.baseUrl ?? defaults[row.kind]).replace(/\/+$/, "");
  if (row.kind === "ollama" && !baseURL.endsWith("/api")) baseURL += "/api";
  const apiKey = row.apiKeyEncrypted ? createKeyCipher(env.AI_KEYS_ENCRYPTION_KEY).decrypt(row.apiKeyEncrypted) : "";
  return { baseURL, apiKey };
}

// Do not follow redirects carrying a user's provider credentials to another endpoint.
export const providerFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  redirect: "error",
  signal: init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000),
});

export function createProviderRegistry(row: ProviderRow, env: Env): ProviderRegistry {
  const { baseURL, apiKey } = providerConnection(row, env);
  if (row.kind !== "ollama" && !apiKey && !row.baseUrl) {
    throw new ProviderConfigurationError("An API key is required for this provider");
  }
  const settings = { baseURL, apiKey, fetch: providerFetch };
  switch (row.kind) {
    case "openai": {
      const provider = createOpenAI(settings);
      return { chat: (model) => provider.chat(model), embedding: (model) => provider.embeddingModel(model) };
    }
    case "anthropic": {
      const provider = createAnthropic(settings);
      return {
        chat: (model) => provider.languageModel(model),
        embedding: () => { throw new ProviderConfigurationError("Anthropic does not provide embedding models"); },
      };
    }
    case "google": {
      const provider = createGoogleGenerativeAI(settings);
      return { chat: (model) => provider.languageModel(model), embedding: (model) => provider.embeddingModel(model) };
    }
    case "ollama": {
      const provider = createOllama({ baseURL, fetch: providerFetch, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
      return { chat: (model) => provider.chat(model), embedding: (model) => provider.embedding(model) };
    }
  }
}
