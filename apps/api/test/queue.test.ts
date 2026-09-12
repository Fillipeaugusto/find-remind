import { randomUUID } from "node:crypto";
import { Worker, type Processor } from "bullmq";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import queuePlugin from "../src/plugins/queue.js";
import redisPlugin from "../src/plugins/redis.js";
import { queuePrefix, type JobData, type QueueDefinitions } from "../src/queues/index.js";
import { createTestApp } from "./helpers.js";

describe("BullMQ queue plugin", () => {
  let mainApp: App;
  let name: string;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    mainApp = await createTestApp();
  });

  beforeEach(() => {
    name = `test-${randomUUID()}`;
  });

  afterEach(async () => {
    try {
      for (const app of apps.splice(0)) await app.close();
    } finally {
      vi.restoreAllMocks();
      if (mainApp) await mainApp.cache.invalidate(`${queuePrefix("test")}:${name}:*`);
    }
  });

  afterAll(async () => {
    if (mainApp) await mainApp.close();
  });

  async function createQueueApp(runWorkers: boolean, definitions: QueueDefinitions) {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.decorate("env", { ...loadEnv(), RUN_WORKERS: runWorkers });
    await app.register(redisPlugin);
    await app.register(queuePlugin, { definitions });
    await app.ready();
    return app;
  }

  it("registers the queues decorator in the real app", () => {
    expect(mainApp.hasDecorator("queues")).toBe(true);
    expect(mainApp.env.RUN_WORKERS).toBe(false);
  });

  it("enqueues with workers disabled and processes the job with an inline worker", async () => {
    const createProcessor = vi.fn(() => vi.fn());
    const run = vi.spyOn(Worker.prototype, "run");
    const app = await createQueueApp(false, { [name]: { createProcessor } });
    const queue = app.queues[name]!;
    const job = await queue.add("double", { value: 21 });

    expect(await job.getState()).toBe("waiting");
    expect(createProcessor).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();

    const connection = app.redis.duplicate({ maxRetriesPerRequest: null });
    const worker = new Worker<JobData, number>(name, async (job) => Number(job.data.value) * 2, {
      connection,
      prefix: queuePrefix("test"),
    });
    try {
      await worker.waitUntilReady();
      await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), { timeout: 5_000 });
      expect((await queue.getJob(job.id!))?.returnvalue).toBe(42);
    } finally {
      await worker.close();
      await connection.quit();
    }
  });

  it("runs registered processors when workers are enabled", async () => {
    const processor = vi.fn<Processor<JobData, unknown>>(async (job) => ({ received: job.data }));
    const createProcessor = vi.fn(() => processor);
    const app = await createQueueApp(true, { [name]: { createProcessor } });
    const job = await app.queues[name]!.add("echo", { message: "hello" });

    await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), { timeout: 5_000 });

    expect(createProcessor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledTimes(1);
    expect((await app.queues[name]!.getJob(job.id!))?.returnvalue).toEqual({ received: { message: "hello" } });
    expect(app.redis.options.maxRetriesPerRequest).toBe(1);
  });

  it("records processor failures as failed jobs", async () => {
    const app = await createQueueApp(true, {
      [name]: { createProcessor: () => async () => { throw new Error("processing failed"); } },
    });
    const job = await app.queues[name]!.add("failing", {});

    await vi.waitFor(async () => expect(await job.getState()).toBe("failed"), { timeout: 5_000 });

    expect((await app.queues[name]!.getJob(job.id!))?.failedReason).toBe("processing failed");
  });

  it("waits for active jobs and closes workers before the shared Redis connection", async () => {
    let release!: () => void;
    const processing = new Promise<void>((resolve) => { release = resolve; });
    const processor = vi.fn(async () => { await processing; return "done"; });
    const closeWorker = vi.spyOn(Worker.prototype, "close");
    const app = await createQueueApp(true, { [name]: { createProcessor: () => processor } });
    const queue = app.queues[name]!;
    const closeQueue = vi.spyOn(queue, "close");
    const quitRedis = vi.spyOn(app.redis, "quit");
    let closing: Promise<void> | undefined;
    try {
      const job = await queue.add("blocking", {});
      await vi.waitFor(async () => expect(await job.getState()).toBe("active"), { timeout: 5_000 });

      closing = app.close();
      await vi.waitFor(() => expect(closeWorker).toHaveBeenCalled());
      expect(quitRedis).not.toHaveBeenCalled();
      expect(closeQueue).not.toHaveBeenCalled();
    } finally {
      release();
      await closing;
    }

    expect(closeQueue).toHaveBeenCalledTimes(1);
    expect(quitRedis).toHaveBeenCalledTimes(1);
    expect(closeQueue.mock.invocationCallOrder[0]).toBeLessThan(quitRedis.mock.invocationCallOrder[0]!);
    await expect(queue.closing).resolves.toBeUndefined();
  });

  it("closes queues and the worker connection after processor initialization fails", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.decorate("env", { ...loadEnv(), RUN_WORKERS: true });
    await app.register(redisPlugin);
    const duplicate = vi.spyOn(app.redis, "duplicate");

    await expect(app.register(queuePlugin, {
      definitions: {
        [name]: { createProcessor: () => { throw new Error("initialization failed"); } },
      },
    })).rejects.toThrow("initialization failed");
    await app.close();

    await expect(app.queues[name]!.closing).resolves.toBeUndefined();
    const connection = duplicate.mock.results[0]!.value;
    await vi.waitFor(() => expect(connection.status).toBe("end"));
  });

  it("registers job schedulers only when workers run", async () => {
    const definitions: QueueDefinitions = {
      [name]: {
        createProcessor: () => async () => "tick",
        schedulers: [{ id: "tick", name: "tick", every: 60_000, data: { source: "test" } }],
      },
    };

    const idle = await createQueueApp(false, definitions);
    expect(await idle.queues[name]!.getJobSchedulers()).toEqual([]);

    const running = await createQueueApp(true, definitions);
    const schedulers = await running.queues[name]!.getJobSchedulers();

    expect(schedulers).toMatchObject([{ key: "tick", name: "tick", every: 60_000, template: { data: { source: "test" } } }]);
    // The scheduler keeps the next run waiting in the delayed set (the first
    // one may still be running when checked).
    await vi.waitFor(async () => expect(await running.queues[name]!.getDelayedCount()).toBe(1), { timeout: 5_000 });
  });

  it("uses different key prefixes for each environment", () => {
    expect(new Set([queuePrefix("test"), queuePrefix("development"), queuePrefix("production")]).size).toBe(3);
  });
});
