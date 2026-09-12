import { buildApp, type App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

export async function createTestApp(): Promise<App> {
  const app = await buildApp({ env: loadEnv(), logger: false });
  await app.ready();
  return app;
}
