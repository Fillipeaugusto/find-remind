import { z } from "zod";
import { modelReferenceSchema } from "../ai-providers/ai-providers.schemas.js";

const isoDatetime = z.iso.datetime({ offset: true });

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  model: z.string(),
  createdAt: isoDatetime,
  updatedAt: isoDatetime,
});

export const conversationParamsSchema = z.object({ id: z.string() });

export const createConversationSchema = z.object({ model: modelReferenceSchema.optional() });

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const conversationPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
});

// Stored messages follow the AI SDK `UIMessage` shape; parts are returned as
// persisted (text, tool calls, tool results, step markers).
export const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.looseObject({ type: z.string() })),
  metadata: z.unknown().optional(),
});

export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(uiMessageSchema),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ConversationPage = z.infer<typeof conversationPageSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type StoredUIMessage = z.infer<typeof uiMessageSchema>;
