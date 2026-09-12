import { Queue, Worker } from "bullmq";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Redis } from "ioredis";
import {
  queueDefinitions,
  queuePrefix,
  type AppQueues,
  type JobData,
  type QueueDefinitions,
} from "../queues/index.js";

interface QueuePluginOptions {
  definitions?: QueueDefinitions;
}

const queuePlugin: FastifyPluginAsync<QueuePluginOptions> = async (app, options) => {
  const definitions = options.definitions ?? queueDefinitions;
  const queues: AppQueues = Object.create(null);
  const workers: Worker<JobData, unknown>[] = [];
  let workerConnection: Redis | undefined;
  const prefix = queuePrefix(app.env.NODE_ENV);

  app.decorate("queues", queues);
  app.addHook("onClose", async () => {
    const failures: unknown[] = [];
    for (const resources of [workers, Object.values(queues)]) {
      const results = await Promise.allSettled(resources.map((resource) => resource.close()));
      for (const result of results) {
        if (result.status === "rejected") failures.push(result.reason);
      }
    }
    if (workerConnection && workerConnection.status !== "end") {
      try {
        await workerConnection.quit();
      } catch (error) {
        failures.push(error);
      } finally {
        workerConnection.disconnect();
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "Failed to close queues");
  });

  if (app.env.RUN_WORKERS && Object.keys(definitions).length > 0) {
    workerConnection = app.redis.duplicate({ maxRetriesPerRequest: null, lazyConnect: true });
    workerConnection.on("error", (err) => app.log.error({ err }, "Queue worker connection error"));
    try {
      await workerConnection.connect();
    } catch (error) {
      workerConnection.disconnect();
      throw error;
    }
  }

  for (const [name, definition] of Object.entries(definitions)) {
    const queue = new Queue<JobData, unknown>(name, { connection: app.redis, prefix });
    queues[name] = queue;
    queue.on("error", (err) => app.log.error({ err, queue: name }, "Queue error"));
    await queue.waitUntilReady();

    if (workerConnection) {
      const worker = new Worker<JobData, unknown>(name, definition.createProcessor(app), {
        connection: workerConnection,
        prefix,
        autorun: false,
      });
      workers.push(worker);
      worker.on("error", (err) => app.log.error({ err, queue: name }, "Worker error"));
      worker.on("failed", (job, err) => {
        app.log.error({ err, queue: name, jobId: job?.id }, "Queue job failed");
      });
      await worker.waitUntilReady();

      // Upserting is idempotent, so every instance may register the same
      // scheduler; only processes running workers do, to keep repeatable
      // jobs from piling up where nothing consumes them.
      for (const scheduler of definition.schedulers ?? []) {
        await queue.upsertJobScheduler(
          scheduler.id,
          { every: scheduler.every },
          { name: scheduler.name, data: scheduler.data ?? {}, opts: { removeOnComplete: true, removeOnFail: 100 } },
        );
      }
    }
  }

  for (const worker of workers) {
    void worker.run().catch((err) => app.log.error({ err, queue: worker.name }, "Worker stopped"));
  }
};

export default fp(queuePlugin, {
  name: "queue",
  fastify: "5.x",
  dependencies: ["redis"],
});

declare module "fastify" {
  interface FastifyInstance {
    queues: AppQueues;
  }
}
