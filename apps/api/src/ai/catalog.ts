import type { ProviderKind } from "@findremind/db";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { providerConnection, providerFetch, type ProviderRow } from "./registry.js";

export interface ModelEntry { id: string; label: string }
export interface ProviderModels { chat: ModelEntry[]; embedding: ModelEntry[] }
const entries = (...ids: string[]): ModelEntry[] => ids.map((id) => ({ id, label: id }));

export const modelCatalog: Record<ProviderKind, ProviderModels> = {
  openai: { chat: entries("gpt-4.1-mini", "gpt-5-mini", "gpt-5.4"), embedding: entries("text-embedding-3-small", "text-embedding-3-large") },
  anthropic: { chat: entries("claude-sonnet-4-6", "claude-haiku-4-5"), embedding: [] },
  google: { chat: entries("gemini-2.5-flash", "gemini-3.5-flash"), embedding: entries("gemini-embedding-001", "gemini-embedding-2") },
  ollama: { chat: [], embedding: [] },
};

function unique(models: ModelEntry[]) {
  return [...new Map(models.map((model) => [model.id, model])).values()];
}

export function configuredCatalog(row: ProviderRow): ProviderModels {
  const catalog = modelCatalog[row.kind];
  return {
    chat: unique([...catalog.chat, ...entries(...(row.defaultChatModel ? [row.defaultChatModel] : []))]),
    embedding: row.kind === "anthropic" ? [] : unique([...catalog.embedding, ...entries(...(row.defaultEmbeddingModel ? [row.defaultEmbeddingModel] : []))]),
  };
}

export async function listProviderModels(row: ProviderRow, env: Env): Promise<ProviderModels> {
  const { baseURL, apiKey } = providerConnection(row, env);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    if (row.kind === "anthropic") headers["x-api-key"] = apiKey;
    else if (row.kind === "google") headers["x-goog-api-key"] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
  }
  if (row.kind === "anthropic") headers["anthropic-version"] = "2023-06-01";
  async function request(path: string, body?: object): Promise<unknown> {
    const response = await providerFetch(`${baseURL}${path}`, {
      headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error("Unable to list provider models");
    return response.json();
  }

  if (row.kind === "ollama") {
    const tags = z.object({ models: z.array(z.object({ name: z.string().min(1) })) }).parse(await request("/tags"));
    const models: ProviderModels = { chat: [], embedding: [] };
    for (const { name } of tags.models) {
      const info = z.object({ capabilities: z.array(z.string()) }).parse(await request("/show", { model: name }));
      if (info.capabilities.includes("completion")) models.chat.push({ id: name, label: name });
      if (info.capabilities.includes("embedding")) models.embedding.push({ id: name, label: name });
    }
    return { chat: unique(models.chat), embedding: unique(models.embedding) };
  }

  const models = configuredCatalog(row);
  if (!apiKey && !row.baseUrl) return models;
  try {
    let page: string | undefined;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams();
      if (page) query.set(row.kind === "google" ? "pageToken" : "after_id", page);
      const result = await request(`/models${query.size ? `?${query}` : ""}`);
      if (row.kind === "google") {
        const data = z.object({ models: z.array(z.object({ name: z.string(), displayName: z.string().optional(), supportedGenerationMethods: z.array(z.string()).default([]) })).default([]), nextPageToken: z.string().optional() }).parse(result);
        for (const item of data.models) {
          const model = { id: item.name.replace(/^models\//, ""), label: item.displayName ?? item.name.replace(/^models\//, "") };
          if (item.supportedGenerationMethods.includes("generateContent")) models.chat.push(model);
          if (item.supportedGenerationMethods.includes("embedContent")) models.embedding.push(model);
        }
        page = data.nextPageToken;
      } else {
        const data = z.object({ data: z.array(z.object({ id: z.string(), display_name: z.string().optional() })), has_more: z.boolean().optional(), last_id: z.string().nullable().optional() }).parse(result);
        for (const item of data.data) {
          const model = { id: item.id, label: item.display_name ?? item.id };
          if (row.kind === "anthropic") models.chat.push(model);
          else if (item.id.includes("embedding")) models.embedding.push(model);
          else if (/^(gpt-|chatgpt-|o[1-9](?:-|$))/.test(item.id) || row.baseUrl) models.chat.push(model);
        }
        page = row.kind === "anthropic" && data.has_more ? data.last_id ?? undefined : undefined;
      }
      if (page && seen.has(page)) break;
      if (page) seen.add(page);
    } while (page);
  } catch {
    // Some compatible endpoints do not expose a model catalog.
  }
  return { chat: unique(models.chat), embedding: unique(models.embedding) };
}
