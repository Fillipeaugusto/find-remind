import type { EmbeddingModel, LanguageModel } from "ai";
import type { App } from "../app.js";
import { createAiProvidersRepository } from "../modules/ai-providers/ai-providers.repository.js";
import { NoProviderError, type ModelKind } from "./errors.js";
import { createProviderRegistry } from "./registry.js";

export function parseModelReference(value: string) {
  const colon = value.indexOf(":");
  const providerId = value.slice(0, colon);
  const model = value.slice(colon + 1);
  if (colon < 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId) || !model.trim()) return null;
  return { providerId, model };
}

export function createModelResolver(app: App) {
  const repository = createAiProvidersRepository(app.db);
  async function resolveModel(userId: string, reference: string | undefined, kind: "chat"): Promise<LanguageModel>;
  async function resolveModel(userId: string, reference: string | undefined, kind: "embedding"): Promise<EmbeddingModel>;
  async function resolveModel(userId: string, reference: string | undefined, kind: ModelKind): Promise<LanguageModel | EmbeddingModel> {
    const selected = reference ?? (await repository.getSettings(userId))[kind];
    const parsed = selected ? parseModelReference(selected) : null;
    if (!parsed) throw new NoProviderError(kind);
    const row = await repository.findById(userId, parsed.providerId);
    if (!row?.enabled || row.lastCheckStatus !== "ok" || (kind === "embedding" && row.kind === "anthropic")) {
      throw new NoProviderError(kind);
    }
    const registry = createProviderRegistry(row, app.env);
    return kind === "chat" ? registry.chat(parsed.model) : registry.embedding(parsed.model);
  }
  return resolveModel;
}
