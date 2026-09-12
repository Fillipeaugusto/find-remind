import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { NoProviderError } from "../../ai/errors.js";
import {
  availableModelsSchema, createProviderSchema, defaultsInputSchema, noProviderErrorSchema,
  providerListSchema, providerModelsSchema, providerParamsSchema, providerSchema, updateProviderSchema,
} from "./ai-providers.schemas.js";
import { createAiProvidersService } from "./ai-providers.service.js";

export const aiProvidersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createAiProvidersService(app);
  const tags = ["ai"];

  app.get("/ai/providers", { schema: { tags, response: { 200: providerListSchema } } },
    async (request) => service.list(request.user!.id));
  app.post("/ai/providers", { schema: { tags, body: createProviderSchema, response: { 201: providerSchema } } },
    async (request, reply) => reply.status(201).send(await service.create(request.user!.id, request.body)));
  app.patch("/ai/providers/:id", { schema: { tags, params: providerParamsSchema, body: updateProviderSchema, response: { 200: providerSchema } } },
    async (request) => service.update(request.user!.id, request.params.id, request.body));
  app.delete("/ai/providers/:id", { schema: { tags, params: providerParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => { await service.delete(request.user!.id, request.params.id); return reply.status(204).send(null); });
  app.post("/ai/providers/:id/test", { schema: { tags, params: providerParamsSchema, response: { 200: providerSchema } } },
    async (request) => service.test(request.user!.id, request.params.id));
  app.get("/ai/providers/:id/models", { schema: { tags, params: providerParamsSchema, response: { 200: providerModelsSchema } } },
    async (request) => service.models(request.user!.id, request.params.id));
  app.get("/ai/models", { schema: { tags, response: { 200: availableModelsSchema } } },
    async (request) => service.availableModels(request.user!.id));
  app.put("/ai/defaults", { schema: { tags, body: defaultsInputSchema, response: { 204: z.null(), 409: noProviderErrorSchema.or(z.object({ statusCode: z.literal(409), error: z.string(), message: z.string() })) } } },
    async (request, reply) => {
      try { await service.setDefaults(request.user!.id, request.body); }
      catch (error) {
        if (error instanceof NoProviderError) return reply.status(409).send({ statusCode: 409, error: "Conflict", message: error.message, code: error.code });
        throw error;
      }
      return reply.status(204).send(null);
    });
};
