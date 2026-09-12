// Rebuilds the reminders index from Postgres: pnpm --filter @findremind/api reindex
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { reindexAll } from "../search/indexer.js";

const app = await buildApp({ env: { ...loadEnv(), RUN_WORKERS: false } });
try {
  const result = await reindexAll(app);
  app.log.info(result, "Reindex finished");
} finally {
  await app.close();
}
