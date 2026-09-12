import { sql } from "@findremind/db";
import type { App } from "../../app.js";

export const readinessChecks = ["postgres", "redis", "elasticsearch"] as const;
export type ReadinessCheck = (typeof readinessChecks)[number];

export interface Readiness {
  status: "ok" | "degraded";
  checks: Record<ReadinessCheck, "ok" | "error">;
}

const CHECK_TIMEOUT_MS = 3_000;

async function withTimeout(promise: Promise<unknown>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Readiness check timed out")), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(app: App): Promise<Readiness> {
  const probes: Record<ReadinessCheck, () => Promise<unknown>> = {
    postgres: () => app.db.execute(sql`select 1`),
    redis: () => app.redis.ping(),
    elasticsearch: () => app.es.cluster.health({ timeout: `${CHECK_TIMEOUT_MS}ms` }),
  };

  const results = await Promise.all(
    readinessChecks.map(async (name) => {
      try {
        await withTimeout(probes[name]());
        return [name, "ok"] as const;
      } catch (err) {
        app.log.warn({ err, check: name }, "Readiness check failed");
        return [name, "error"] as const;
      }
    }),
  );

  const checks = Object.fromEntries(results) as Readiness["checks"];
  const status = results.every(([, result]) => result === "ok") ? "ok" : "degraded";
  return { status, checks };
}
