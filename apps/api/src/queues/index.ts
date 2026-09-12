import type { Processor, Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

export type JobData = Record<string, unknown>;

export interface QueueDefinition {
  createProcessor(app: FastifyInstance): Processor<JobData, unknown>;
}

export type QueueDefinitions = Readonly<Record<string, QueueDefinition>>;
export type AppQueues = Record<string, Queue<JobData, unknown>>;

// Add domain queue definitions here as their processors are implemented.
export const queueDefinitions: QueueDefinitions = {};

export function queuePrefix(environment: Env["NODE_ENV"]): string {
  return `findremind:${environment}`;
}
