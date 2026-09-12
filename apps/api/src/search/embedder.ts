import type { App } from "../app.js";
import { NoProviderError } from "../ai/errors.js";
import { createRemindersRepository } from "../modules/reminders/reminders.repository.js";
import { generateEmbedding, resolveEmbeddingContext } from "./embedding-context.js";
import { createEmbeddingsRepository, embeddingText } from "./embeddings.repository.js";
import { SEARCH_QUEUE, searchCacheKey, searchJobOptions } from "./sync.js";

export async function embedReminder(app: App, reminderId: string) {
  const repository = createEmbeddingsRepository(app.db);
  const row = await createRemindersRepository(app.db).findForIndexing(reminderId);
  if (!row || row.deletedAt) {
    await repository.remove(reminderId);
    return { action: "deleted" };
  }
  let context;
  try { context = await resolveEmbeddingContext(app, row.userId); }
  catch (error) {
    if (error instanceof NoProviderError) return { action: "skipped", reason: "NO_EMBEDDING_PROVIDER" };
    throw new Error("Unable to resolve embedding provider");
  }
  const embedding = await generateEmbedding(context, embeddingText(row));
  if (!await repository.save(row, context, embedding)) return { action: "skipped", reason: "STALE_INPUT" };
  await app.cache.invalidate(searchCacheKey(row.userId, "*"));
  return { action: "embedded", dims: embedding.length };
}

export async function reembedUser(app: App, userId: string) {
  const repository = createEmbeddingsRepository(app.db);
  let afterId: string | undefined;
  let enqueued = 0;
  for (;;) {
    const rows = await repository.scan(userId, afterId, 500);
    if (!rows.length) return { enqueued };
    await app.queues[SEARCH_QUEUE]!.addBulk(rows.map(({ id }) => ({ name: "embed-reminder", data: { reminderId: id }, opts: searchJobOptions })));
    enqueued += rows.length;
    afterId = rows.at(-1)!.id;
  }
}
