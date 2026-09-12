import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { profileSchema, updateProfileSchema } from "./me.schemas.js";
import { createMeService } from "./me.service.js";

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createMeService(app);

  app.get(
    "/me",
    {
      schema: {
        tags: ["me"],
        response: { 200: profileSchema },
      },
    },
    async (request) => service.getProfile(request.user!.id),
  );

  app.patch(
    "/me",
    {
      schema: {
        tags: ["me"],
        body: updateProfileSchema,
        response: { 200: profileSchema },
      },
    },
    async (request) => service.updateProfile(request.user!.id, request.body),
  );
};
