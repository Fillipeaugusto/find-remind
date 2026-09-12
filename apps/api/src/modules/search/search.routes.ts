import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { NoProviderError } from "../../ai/errors.js";
import { noProviderErrorSchema } from "../ai-providers/ai-providers.schemas.js";
import { searchQuerySchema, searchResponseSchema } from "./search.schemas.js";
import { createSearchService } from "./search.service.js";
import { toActor } from "../reminders/reminders.service.js";
import { askInputSchema, askResponseSchema } from "./search-ask.schemas.js";
import { createSearchAskService } from "./search-ask.service.js";

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createSearchService(app);
  const questions = createSearchAskService(app);
  app.get("/search", { schema: { tags: ["search"], querystring: searchQuerySchema, response: { 200: searchResponseSchema, 409: noProviderErrorSchema } } }, async (request, reply) => {
    try { return await service.search(request.user!.id, request.query); }
    catch (error) {
      if (error instanceof NoProviderError) return reply.status(409).send({ statusCode: 409, error: "Conflict", message: error.message, code: error.code });
      throw error;
    }
  });
  app.post("/search/ask", { schema: { tags: ["search"], body: askInputSchema, response: { 200: askResponseSchema, 409: noProviderErrorSchema } } }, async (request, reply) => {
    try { return await questions.ask(toActor(request.user!), request.body); }
    catch (error) {
      if (error instanceof NoProviderError) return reply.status(409).send({ statusCode: 409, error: "Conflict", message: error.message, code: error.code });
      throw error;
    }
  });
};
