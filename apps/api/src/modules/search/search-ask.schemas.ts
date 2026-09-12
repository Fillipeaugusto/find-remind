import { z } from "zod";
import { reminderStatusSchema, tagNameSchema } from "../reminders/reminders.schemas.js";
import { searchFiltersSchema, searchItemSchema } from "./search.schemas.js";

export const askInputSchema = z.object({ question: z.string().trim().min(1).max(2_000) });
export const extractedSearchSchema = z.object({
  query: z.string().trim().max(1_000),
  from: z.iso.datetime({ offset: true }).nullable().optional(),
  to: z.iso.datetime({ offset: true }).nullable().optional(),
  tags: z.array(tagNameSchema).max(20).nullable().optional(),
  status: reminderStatusSchema.nullable().optional(),
  dateExpression: z.string().trim().min(1).max(200).nullable().optional(),
});
export const askResponseSchema = z.object({ answer: z.string(), filters: searchFiltersSchema, items: z.array(searchItemSchema) });
export type AskInput = z.infer<typeof askInputSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
