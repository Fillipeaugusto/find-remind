import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { NoProviderError } from "../../ai/errors.js";
import { noProviderErrorSchema } from "../ai-providers/ai-providers.schemas.js";
import { toActor } from "../reminders/reminders.service.js";
import { createChatStreamService } from "./chat-stream.service.js";
import {
  conversationDetailSchema,
  conversationPageSchema,
  conversationParamsSchema,
  conversationSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  sendMessagesSchema,
} from "./chat.schemas.js";
import { createChatService } from "./chat.service.js";

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createChatService(app);
  const streaming = createChatStreamService(app);

  app.get(
    "/chat/conversations",
    {
      schema: {
        tags: ["chat"],
        querystring: listConversationsQuerySchema,
        response: { 200: conversationPageSchema },
      },
    },
    async (request) => service.list(request.user!.id, request.query),
  );

  app.post(
    "/chat/conversations",
    {
      schema: {
        tags: ["chat"],
        // Sent without a body by clients that just want the default model.
        body: createConversationSchema.nullable().optional(),
        response: { 201: conversationSchema, 409: noProviderErrorSchema },
      },
    },
    async (request, reply) => {
      try {
        const conversation = await service.create(request.user!.id, request.body ?? {});
        return reply.status(201).send(conversation);
      } catch (error) {
        if (error instanceof NoProviderError) {
          return reply.status(409).send({ statusCode: 409, error: "Conflict", message: error.message, code: error.code });
        }
        throw error;
      }
    },
  );

  app.get(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["chat"],
        params: conversationParamsSchema,
        response: { 200: conversationDetailSchema },
      },
    },
    async (request) => service.get(request.user!.id, request.params.id),
  );

  app.delete(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["chat"],
        params: conversationParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.remove(request.user!.id, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/chat/conversations/:id/messages",
    {
      schema: {
        tags: ["chat"],
        description: "Streams the assistant reply in the AI SDK UI Message Stream protocol (Server-Sent Events).",
        params: conversationParamsSchema,
        body: sendMessagesSchema,
        produces: ["text/event-stream"],
        response: { 200: z.string(), 409: noProviderErrorSchema },
      },
    },
    async (request, reply) => {
      const actor = toActor(request.user!);
      const conversation = await service.getOrThrow(actor.id, request.params.id);
      try {
        await streaming.stream(actor, conversation, request.body, request, reply);
      } catch (error) {
        if (error instanceof NoProviderError) {
          return reply.status(409).send({ statusCode: 409, error: "Conflict", message: error.message, code: error.code });
        }
        throw error;
      }
    },
  );
};
