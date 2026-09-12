import { indexReminder, reindexAll } from "../search/indexer.js";
import { embedReminder, reembedUser } from "../search/embedder.js";
import type { QueueDefinition } from "./index.js";

// Index/embedding jobs use { reminderId }; reembed-user uses { userId }.
export const searchQueue: QueueDefinition = {
  createProcessor(app) {
    return async (job) => {
      switch (job.name) {
        case "index-reminder":
          return indexReminder(app, String(job.data.reminderId));
        case "reindex-all":
          return reindexAll(app);
        case "embed-reminder":
          return embedReminder(app, String(job.data.reminderId));
        case "reembed-user":
          return reembedUser(app, String(job.data.userId));
        default:
          throw new Error(`Unknown search job: ${job.name}`);
      }
    };
  },
};
