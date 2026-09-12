import { Worker } from "bullmq";
import type { App } from "../src/app.js";
import { queueDefinitions, queuePrefix, type JobData } from "../src/queues/index.js";

// Removes every job left by tests (workers are disabled under NODE_ENV=test).
export async function clearQueues(app: App): Promise<void> {
  await Promise.all(Object.values(app.queues).map((queue) => queue.obliterate({ force: true })));
}

// Runs the registered processor of `name` inline so tests can await job
// completion. Close the returned worker before closing the app.
export async function startInlineWorker(app: App, name: string) {
  const definition = queueDefinitions[name];
  if (!definition) throw new Error(`Unknown queue: ${name}`);

  const connection = app.redis.duplicate({ maxRetriesPerRequest: null });
  const worker = new Worker<JobData, unknown>(name, definition.createProcessor(app), {
    connection,
    prefix: queuePrefix("test"),
  });
  await worker.waitUntilReady();

  return {
    worker,
    async close() {
      await worker.close();
      await connection.quit();
    },
  };
}
