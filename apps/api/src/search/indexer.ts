import type { estypes } from "@elastic/elasticsearch";
import type { App } from "../app.js";
import { createRemindersRepository, type ReminderWithTags } from "../modules/reminders/reminders.repository.js";
import { remindersIndexName } from "./index.js";
import { searchCacheKey } from "./sync.js";

export interface ReminderDocument {
  userId: string;
  title: string;
  content: string | null;
  tags: string[];
  status: ReminderWithTags["status"];
  remindAt: string | null;
  createdAt: string;
}

export interface ReindexResult {
  indexed: number;
  deleted: number;
}

const REINDEX_BATCH = 500;

// Date filters match the API's remindAt field, including recurring reminders.
export function toDocument(row: ReminderWithTags): ReminderDocument {
  return {
    userId: row.userId,
    title: row.title,
    content: row.content,
    tags: row.tags,
    status: row.status,
    remindAt: row.remindAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// Postgres is the source of truth: the document always reflects the current
// row, and a missing or soft-deleted row removes it.
export async function indexReminder(app: App, reminderId: string): Promise<{ action: "indexed" | "deleted" }> {
  const index = remindersIndexName(app.env.NODE_ENV);
  const row = await createRemindersRepository(app.db).findForIndexing(reminderId);

  if (!row || row.deletedAt) {
    await app.es.delete({ index, id: reminderId, refresh: "wait_for" }, { ignore: [404] });
    if (row) await app.cache.invalidate(searchCacheKey(row.userId, "*"));
    return { action: "deleted" };
  }
  await app.es.index({ index, id: row.id, document: toDocument(row), refresh: "wait_for" });
  await app.cache.invalidate(searchCacheKey(row.userId, "*"));
  return { action: "indexed" };
}

export async function reindexAll(app: App): Promise<ReindexResult> {
  const index = remindersIndexName(app.env.NODE_ENV);
  const repository = createRemindersRepository(app.db);
  const result: ReindexResult = { indexed: 0, deleted: 0 };
  let afterId: string | undefined;

  for (;;) {
    const rows = await repository.scanForIndexing(afterId, REINDEX_BATCH);
    if (rows.length === 0) break;

    const operations: estypes.BulkOperationContainer[] | object[] = [];
    for (const row of rows) {
      if (row.deletedAt) {
        operations.push({ delete: { _index: index, _id: row.id } });
        result.deleted++;
      } else {
        operations.push({ index: { _index: index, _id: row.id } }, toDocument(row));
        result.indexed++;
      }
    }
    const response = await app.es.bulk({ operations });
    if (response.errors) {
      const failed = response.items.find((item) => (item.index ?? item.delete)?.error);
      throw new Error(`Bulk reindex failed: ${JSON.stringify(failed)}`);
    }
    afterId = rows.at(-1)!.id;
  }

  await app.es.indices.refresh({ index });
  await app.cache.invalidate("search:*");
  return result;
}
