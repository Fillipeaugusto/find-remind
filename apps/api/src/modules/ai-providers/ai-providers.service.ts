import { embed, generateText } from "ai";
import type { App } from "../../app.js";
import { configuredCatalog, listProviderModels } from "../../ai/catalog.js";
import { createKeyCipher } from "../../ai/crypto.js";
import { NoProviderError, ProviderConfigurationError } from "../../ai/errors.js";
import { createProviderRegistry, type ProviderRow } from "../../ai/registry.js";
import { parseModelReference } from "../../ai/resolve.js";
import { createSearchSync } from "../../search/sync.js";
import { createAiProvidersRepository } from "./ai-providers.repository.js";
import type { AiProvider, AvailableModels, CreateProviderInput, DefaultsInput, UpdateProviderInput } from "./ai-providers.schemas.js";

function toProvider(row: ProviderRow): AiProvider {
  return {
    id: row.id, kind: row.kind, label: row.label, baseUrl: row.baseUrl, hasApiKey: row.apiKeyEncrypted !== null,
    enabled: row.enabled, defaultChatModel: row.defaultChatModel, defaultEmbeddingModel: row.defaultEmbeddingModel,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null, lastCheckStatus: row.lastCheckStatus, lastCheckError: row.lastCheckError,
    createdAt: row.createdAt.toISOString(),
  };
}

function nextUpdatedAt(row: ProviderRow) {
  return new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
}

function checkError(error: unknown): string {
  if (error instanceof ProviderConfigurationError) return error.message;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "Provider connection timed out";
  if (error && typeof error === "object" && "statusCode" in error && [401, 403].includes(Number(error.statusCode))) {
    return "Provider authentication failed. Verify the API key";
  }
  return "Connection check failed. Verify the provider URL, API key and model";
}

export function createAiProvidersService(app: App) {
  const repository = createAiProvidersRepository(app.db);
  const cipher = createKeyCipher(app.env.AI_KEYS_ENCRYPTION_KEY);

  async function requireProvider(userId: string, id: string) {
    const row = await repository.findById(userId, id);
    if (!row) throw app.httpErrors.notFound("Provider not found");
    return row;
  }
  function validateConfiguration(input: { kind: ProviderRow["kind"]; defaultEmbeddingModel?: string | null }) {
    if (input.kind === "anthropic" && input.defaultEmbeddingModel) {
      throw app.httpErrors.badRequest("Anthropic does not provide embedding models");
    }
  }

  return {
    async list(userId: string) {
      return { items: (await repository.list(userId)).map(toProvider) };
    },
    async create(userId: string, input: CreateProviderInput) {
      validateConfiguration(input);
      const { apiKey, ...values } = input;
      const now = new Date();
      return toProvider(await repository.create({
        ...values, userId, apiKeyEncrypted: apiKey === undefined ? null : cipher.encrypt(apiKey), createdAt: now, updatedAt: now,
      }));
    },
    async update(userId: string, id: string, input: UpdateProviderInput) {
      const row = await requireProvider(userId, id);
      const { apiKey, ...values } = input;
      validateConfiguration({ ...row, ...values });
      if (Object.keys(input).length === 0) return toProvider(row);
      const changed = apiKey !== undefined || (["kind", "baseUrl", "defaultChatModel", "defaultEmbeddingModel"] as const)
        .some((key) => values[key] !== undefined && values[key] !== row[key]);
      const updated = await repository.update(userId, id, row.updatedAt, {
        ...values,
        ...(apiKey !== undefined ? { apiKeyEncrypted: cipher.encrypt(apiKey) } : {}),
        ...(changed ? { lastCheckedAt: null, lastCheckStatus: null, lastCheckError: null } : {}),
        updatedAt: nextUpdatedAt(row),
      }, changed || input.enabled === false);
      if (!updated) throw app.httpErrors.conflict("Provider settings changed; try again");
      return toProvider(updated);
    },
    async delete(userId: string, id: string) {
      if (!await repository.delete(userId, id)) throw app.httpErrors.notFound("Provider not found");
    },
    async test(userId: string, id: string) {
      const row = await requireProvider(userId, id);
      let error: string | null = null;
      try {
        const registry = createProviderRegistry(row, app.env);
        let chat = row.defaultChatModel;
        if (!chat && !row.defaultEmbeddingModel) {
          const catalog = row.kind === "ollama" ? await listProviderModels(row, app.env) : configuredCatalog(row);
          chat = catalog.chat[0]?.id ?? null;
        }
        if (!chat && !row.defaultEmbeddingModel) throw new ProviderConfigurationError("Configure an available chat or embedding model");
        const abortSignal = AbortSignal.timeout(30_000);
        if (chat) await generateText({ model: registry.chat(chat), prompt: "Reply OK", maxOutputTokens: 5, maxRetries: 0, abortSignal });
        if (row.defaultEmbeddingModel) await embed({ model: registry.embedding(row.defaultEmbeddingModel), value: "ping", maxRetries: 0, abortSignal });
      } catch (cause) {
        error = checkError(cause);
      }
      const updated = await repository.update(userId, id, row.updatedAt, {
        lastCheckedAt: new Date(), lastCheckStatus: error === null ? "ok" : "error", lastCheckError: error, updatedAt: nextUpdatedAt(row),
      }, error !== null);
      // A concurrent edit must not be marked as checked using the old credentials.
      return toProvider(updated ?? await requireProvider(userId, id));
    },
    async models(userId: string, id: string) {
      const row = await requireProvider(userId, id);
      try { return await listProviderModels(row, app.env); }
      catch { throw app.httpErrors.badGateway("Unable to list provider models"); }
    },
    async availableModels(userId: string): Promise<AvailableModels> {
      const rows = (await repository.list(userId)).filter((row) => row.enabled && row.lastCheckStatus === "ok");
      const result: AvailableModels = { chat: [], embedding: [], defaults: await repository.getSettings(userId) };
      const catalogs = await Promise.all(rows.map(async (row) => {
        try { return { row, models: await listProviderModels(row, app.env) }; }
        catch { return null; }
      }));
      for (const catalog of catalogs) {
        if (!catalog) continue;
        for (const kind of ["chat", "embedding"] as const) {
          result[kind].push(...catalog.models[kind].map((model) => ({
            providerId: catalog.row.id, providerKind: catalog.row.kind, model: model.id, label: model.label,
          })));
        }
      }
      for (const kind of ["chat", "embedding"] as const) {
        if (!result[kind].some((model) => `${model.providerId}:${model.model}` === result.defaults[kind])) result.defaults[kind] = null;
      }
      return result;
    },
    async setDefaults(userId: string, input: DefaultsInput) {
      if (Object.keys(input).length === 0) return;
      const expected: ProviderRow[] = [];
      for (const kind of ["chat", "embedding"] as const) {
        const reference = input[kind];
        if (reference === undefined) continue;
        const parsed = parseModelReference(reference);
        const row = parsed ? await repository.findById(userId, parsed.providerId) : undefined;
        if (!row?.enabled || row.lastCheckStatus !== "ok" || (kind === "embedding" && row.kind === "anthropic")) throw new NoProviderError(kind);
        let models;
        try { models = await listProviderModels(row, app.env); }
        catch { throw new NoProviderError(kind); }
        if (!models[kind].some((model) => model.id === parsed!.model)) throw app.httpErrors.badRequest(`Unknown ${kind} model`);
        expected.push(row);
      }
      const result = await repository.setDefaults(userId, input, expected);
      if (!result) throw app.httpErrors.conflict("Provider settings changed; try again");
      if (result.embeddingChanged) await createSearchSync(app).embeddingDefaultChanged(userId);
    },
  };
}
