import { z } from "zod";
import { reminderSchema, reminderStatusSchema, tagNameSchema } from "../reminders/reminders.schemas.js";
import { normalizeTags } from "../reminders/tags.js";

export const searchModeSchema = z.enum(["keyword", "semantic", "hybrid"]);
export const searchFiltersSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  tags: z.array(tagNameSchema).max(20).optional(),
  status: reminderStatusSchema.optional(),
});
export const searchQuerySchema = searchFiltersSchema.extend({
  q: z.string().trim().min(1).max(1_000),
  mode: searchModeSchema.default("hybrid"),
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((value) => normalizeTags((typeof value === "string" ? [value] : value ?? []).flatMap((tag) => tag.split(",")).filter((tag) => tag.trim()))).pipe(z.array(tagNameSchema).max(20)),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), { message: "from must be before or equal to to", path: ["to"] });
export const searchItemSchema = z.object({ reminder: reminderSchema, score: z.number(), highlights: z.array(z.string()).optional() });
export const searchResponseSchema = z.object({ items: z.array(searchItemSchema), mode: searchModeSchema, tookMs: z.number().nonnegative(), cached: z.boolean() });
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchItem = z.infer<typeof searchItemSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
