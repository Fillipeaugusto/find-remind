import type { App } from "../app.js";

export const SEARCH_QUEUE = "search";

export function searchCacheKey(userId: string, suffix: string): string {
  return `search:${userId}:${suffix}`;
}

// Called after every reminder write. Indexing is asynchronous (the worker
// reads the row from Postgres), so a failure here leaves the index stale
// until the next write or a reindex, never the reminder unsaved.
export function createSearchSync(app: App) {
  return {
    async reminderChanged(reminderId: string, userId: string): Promise<void> {
      try {
        await Promise.all([
          app.queues[SEARCH_QUEUE]!.add(
            "index-reminder",
            { reminderId },
            { removeOnComplete: true, removeOnFail: 1_000, attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
          ),
          app.cache.invalidate(searchCacheKey(userId, "*")),
        ]);
      } catch (err) {
        app.log.error({ err, reminderId }, "Failed to schedule reminder indexing");
      }
    },
  };
}

export type SearchSync = ReturnType<typeof createSearchSync>;
