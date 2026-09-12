import { z } from "zod";

const isoDatetime = z.iso.datetime({ offset: true });

export const reminderKindSchema = z.enum(["reminder", "note"]);
export const reminderStatusSchema = z.enum(["scheduled", "done", "dismissed", "snoozed"]);

export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  until: isoDatetime.nullable().optional(),
});

export const tagNameSchema = z.string().trim().min(1).max(50);

export const reminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  kind: reminderKindSchema,
  remindAt: isoDatetime.nullable(),
  recurrence: recurrenceSchema.nullable(),
  status: reminderStatusSchema,
  snoozedUntil: isoDatetime.nullable(),
  nextFireAt: isoDatetime.nullable(),
  tags: z.array(z.string()),
  createdAt: isoDatetime,
  updatedAt: isoDatetime,
});

const reminderFields = {
  title: z.string().trim().min(1).max(200),
  content: z.string().max(20_000).nullable(),
  kind: reminderKindSchema,
  remindAt: isoDatetime.nullable(),
  recurrence: recurrenceSchema.nullable(),
  tags: z.array(tagNameSchema).max(20),
};

export const createReminderSchema = z.object({
  ...reminderFields,
  content: reminderFields.content.default(null),
  remindAt: reminderFields.remindAt.default(null),
  recurrence: reminderFields.recurrence.default(null),
  tags: reminderFields.tags.default([]),
});

export const updateReminderSchema = z.object(reminderFields).partial();

export const reminderParamsSchema = z.object({ id: z.string() });

export const listRemindersQuerySchema = z.object({
  status: reminderStatusSchema.optional(),
  tag: tagNameSchema.optional(),
  from: isoDatetime.optional(),
  to: isoDatetime.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const reminderPageSchema = z.object({
  items: z.array(reminderSchema),
  nextCursor: z.string().nullable(),
});

export const tagsResponseSchema = z.object({
  items: z.array(z.object({ name: z.string(), count: z.number().int() })),
});

export type Reminder = z.infer<typeof reminderSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
export type ReminderPage = z.infer<typeof reminderPageSchema>;
export type TagsResponse = z.infer<typeof tagsResponseSchema>;

export const snoozeReminderSchema = z.object({ until: isoDatetime });

export type SnoozeReminderInput = z.infer<typeof snoozeReminderSchema>;
