import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { checkReadiness, readinessChecks } from "./health.service.js";

const checkResult = z.enum(["ok", "error"]);
const readinessSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object(Object.fromEntries(readinessChecks.map((name) => [name, checkResult]))),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        response: {
          200: z.object({
            status: z.literal("ok"),
            uptime: z.number(),
            timestamp: z.string(),
          }),
        },
      },
    },
    async () => ({
      status: "ok" as const,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["health"],
        response: { 200: readinessSchema, 503: readinessSchema },
      },
    },
    async (_request, reply) => {
      const readiness = await checkReadiness(app);
      return reply.code(readiness.status === "ok" ? 200 : 503).send(readiness);
    },
  );
};
