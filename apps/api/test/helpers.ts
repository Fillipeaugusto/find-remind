import { buildApp, type App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { migrateTestDb } from "./db.js";

export async function createTestApp(): Promise<App> {
  const app = await buildApp({ env: loadEnv(), logger: false });
  try {
    await migrateTestDb(app.db);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
