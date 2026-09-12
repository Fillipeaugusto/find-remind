import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createReminderSchema,
  listRemindersQuerySchema,
  reminderPageSchema,
  reminderParamsSchema,
  reminderSchema,
  tagsResponseSchema,
  updateReminderSchema,
} from "./reminders.schemas.js";
import { createRemindersService } from "./reminders.service.js";

export const remindersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", app.requireAuth);
  const service = createRemindersService(app);

  app.get(
    "/reminders",
    {
      schema: {
        tags: ["reminders"],
        querystring: listRemindersQuerySchema,
        response: { 200: reminderPageSchema },
      },
    },
    async (request) => service.list(request.user!.id, request.query),
  );

  app.post(
    "/reminders",
    {
      schema: {
        tags: ["reminders"],
        body: createReminderSchema,
        response: { 201: reminderSchema },
      },
    },
    async (request, reply) => {
      const reminder = await service.create(request.user!.id, request.body);
      return reply.status(201).send(reminder);
    },
  );

  app.get(
    "/reminders/:id",
    {
      schema: {
        tags: ["reminders"],
        params: reminderParamsSchema,
        response: { 200: reminderSchema },
      },
    },
    async (request) => service.get(request.user!.id, request.params.id),
  );

  app.patch(
    "/reminders/:id",
    {
      schema: {
        tags: ["reminders"],
        params: reminderParamsSchema,
        body: updateReminderSchema,
        response: { 200: reminderSchema },
      },
    },
    async (request) => service.update(request.user!.id, request.params.id, request.body),
  );

  app.delete(
    "/reminders/:id",
    {
      schema: {
        tags: ["reminders"],
        params: reminderParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.remove(request.user!.id, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/tags",
    {
      schema: {
        tags: ["reminders"],
        response: { 200: tagsResponseSchema },
      },
    },
    async (request) => service.listTags(request.user!.id),
  );
};
