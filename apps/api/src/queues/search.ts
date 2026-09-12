import { indexReminder, reindexAll } from "../search/indexer.js";
import type { QueueDefinition } from "./index.js";

// Jobs: `index-reminder` ({ reminderId }) and `reindex-all` ({}).
export const searchQueue: QueueDefinition = {
  createProcessor(app) {
    return async (job) => {
      switch (job.name) {
        case "index-reminder":
          return indexReminder(app, String(job.data.reminderId));
        case "reindex-all":
          return reindexAll(app);
        default:
          throw new Error(`Unknown search job: ${job.name}`);
      }
    };
  },
};
