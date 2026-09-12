import { z } from "zod";

const isoDatetime = z.iso.datetime({ offset: true });

export const alertSchema = z.object({
  id: z.string(),
  reminderId: z.string(),
  reminder: z.object({
    id: z.string(),
    title: z.string(),
    remindAt: isoDatetime.nullable(),
  }),
  firedAt: isoDatetime,
  readAt: isoDatetime.nullable(),
});

export const alertParamsSchema = z.object({ id: z.string() });

export const listAlertsQuerySchema = z.object({
  unread: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const alertPageSchema = z.object({
  items: z.array(alertSchema),
  nextCursor: z.string().nullable(),
});

export type Alert = z.infer<typeof alertSchema>;
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type AlertPage = z.infer<typeof alertPageSchema>;
