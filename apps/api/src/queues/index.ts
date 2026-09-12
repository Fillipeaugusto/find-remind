import type { Processor, Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { SEARCH_QUEUE } from "../search/sync.js";
import { ALERTS_QUEUE, alertsQueue } from "./alerts.js";
import { searchQueue } from "./search.js";

export type JobData = Record<string, unknown>;

// A repeatable job upserted whenever workers run (BullMQ job scheduler).
export interface QueueSchedulerDefinition {
  id: string;
  name: string;
  every: number;
  data?: JobData;
}

export interface QueueDefinition {
  createProcessor(app: FastifyInstance): Processor<JobData, unknown>;
  schedulers?: QueueSchedulerDefinition[];
}

export type QueueDefinitions = Readonly<Record<string, QueueDefinition>>;
export type AppQueues = Record<string, Queue<JobData, unknown>>;

export const queueDefinitions: QueueDefinitions = {
  [SEARCH_QUEUE]: searchQueue,
  [ALERTS_QUEUE]: alertsQueue,
};

export function queuePrefix(environment: Env["NODE_ENV"]): string {
  return `findremind:${environment}`;
}
