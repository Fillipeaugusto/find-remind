import { embed } from "ai";
import type { App } from "../app.js";
import { NoProviderError } from "../ai/errors.js";
import { createModelResolver, parseModelReference } from "../ai/resolve.js";
import { createAiProvidersRepository } from "../modules/ai-providers/ai-providers.repository.js";

export async function resolveEmbeddingContext(app: App, userId: string) {
  const repository = createAiProvidersRepository(app.db);
  const reference = (await repository.getSettings(userId)).embedding;
  const parsed = reference ? parseModelReference(reference) : null;
  const provider = parsed ? await repository.findById(userId, parsed.providerId) : undefined;
  if (!reference || !provider?.enabled || provider.lastCheckStatus !== "ok") throw new NoProviderError("embedding");
  // Resolve the captured default explicitly so concurrent default changes cannot mix models.
  const model = await createModelResolver(app)(userId, reference, "embedding");
  return { reference, provider, model };
}

export type EmbeddingContext = Awaited<ReturnType<typeof resolveEmbeddingContext>>;

export async function generateEmbedding(context: EmbeddingContext, value: string): Promise<number[]> {
  try {
    const { embedding } = await embed({ model: context.model, value, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) });
    if (!embedding.length || embedding.length > 16_000 || !embedding.every((entry) => Number.isFinite(entry) && Number.isFinite(Math.fround(entry))) || !embedding.some((entry) => Math.fround(entry) !== 0)) {
      throw new Error("Invalid embedding vector");
    }
    return embedding;
  } catch {
    // Provider exceptions may contain credentials, prompts or remote response bodies.
    throw new Error("Unable to generate embedding");
  }
}
