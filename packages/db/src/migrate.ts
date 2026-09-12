import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./index.js";

export async function migrateDb(db: Database): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
  });
}
