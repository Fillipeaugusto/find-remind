import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { alertPageSchema, alertParamsSchema, alertSchema, listAlertsQuerySchema } from "./alerts.schemas.js";
import { createAlertsService } from "./alerts.service.js";

export const SSE_PING_INTERVAL_MS = 25_000;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const alertsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createAlertsService(app);

  // Open streams are ended before the HTTP server closes; otherwise they
  // keep it alive and shutdown never completes.
  const openStreams = new Set<() => void>();
  app.addHook("preClose", async () => {
    for (const end of openStreams) end();
  });

  app.get(
    "/alerts",
    {
      schema: {
        tags: ["alerts"],
        querystring: listAlertsQuerySchema,
        response: { 200: alertPageSchema },
      },
    },
    async (request) => service.list(request.user!.id, request.query),
  );

  app.post(
    "/alerts/read-all",
    {
      schema: {
        tags: ["alerts"],
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.markAllRead(request.user!.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/alerts/:id/read",
    {
      schema: {
        tags: ["alerts"],
        params: alertParamsSchema,
        response: { 200: alertSchema },
      },
    },
    async (request) => service.markRead(request.user!.id, request.params.id),
  );

  // Server-Sent Events: the reply is hijacked and written by hand, so the
  // headers set by earlier hooks (CORS, helmet) are copied explicitly.
  async function streamAlerts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(": connected\n\n");

    let unsubscribe: (() => Promise<void>) | undefined;
    let closed = false;
    const ping = setInterval(() => {
      reply.raw.write(sseEvent("ping", { at: new Date().toISOString() }));
    }, SSE_PING_INTERVAL_MS);

    const end = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      openStreams.delete(end);
      void unsubscribe?.().catch((err) => request.log.error({ err }, "Failed to unsubscribe alert stream"));
      reply.raw.end();
    };
    openStreams.add(end);
    request.raw.on("close", end);

    try {
      unsubscribe = await app.alertBus.subscribe(userId, (alert) => {
        if (!closed) reply.raw.write(sseEvent("alert", alert));
      });
    } catch (err) {
      request.log.error({ err }, "Failed to subscribe alert stream");
      end();
      return;
    }
    // The client may have gone away while subscribing.
    if (closed) void unsubscribe().catch(() => undefined);
  }

  app.get(
    "/alerts/stream",
    {
      schema: {
        tags: ["alerts"],
        description: "Server-Sent Events stream. Events: `alert` (payload Alert) and `ping` every 25s.",
        produces: ["text/event-stream"],
        response: { 200: z.string() },
      },
    },
    streamAlerts,
  );
};
