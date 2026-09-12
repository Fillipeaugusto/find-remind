import { buildApp, type App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { migrateTestDb } from "./db.js";

export interface CreateTestAppOptions {
  // Runs before `ready()`, e.g. to register extra routes for a test.
  configure?: (app: App) => Promise<void> | void;
}

export async function createTestApp({ configure }: CreateTestAppOptions = {}): Promise<App> {
  const app = await buildApp({ env: loadEnv(), logger: false });
  try {
    await migrateTestDb(app.db);
    await configure?.(app);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
