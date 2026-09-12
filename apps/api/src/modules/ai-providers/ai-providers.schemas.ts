import { aiProviderKind } from "@findremind/db";
import { z } from "zod";
import { parseModelReference } from "../../ai/resolve.js";

const modelName = z.string().trim().min(1).max(200);
const baseUrl = z.string().trim().url().max(2_048).refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Use an HTTP(S) URL without credentials, query parameters or fragments").transform((value) => value.replace(/\/+$/, ""));

export const createProviderSchema = z.object({
  kind: z.enum(aiProviderKind.enumValues),
  label: z.string().trim().min(1).max(100),
  baseUrl: baseUrl.nullable().optional(),
  apiKey: z.string().trim().min(1).max(8_192).optional(),
  enabled: z.boolean().optional(),
  defaultChatModel: modelName.nullable().optional(),
  defaultEmbeddingModel: modelName.nullable().optional(),
});
export const updateProviderSchema = createProviderSchema.partial();
export const providerParamsSchema = z.object({ id: z.uuid() });

export const providerSchema = z.object({
  id: z.uuid(), kind: z.enum(aiProviderKind.enumValues), label: z.string(), baseUrl: z.string().nullable(),
  hasApiKey: z.boolean(), enabled: z.boolean(), defaultChatModel: z.string().nullable(), defaultEmbeddingModel: z.string().nullable(),
  lastCheckedAt: z.iso.datetime().nullable(), lastCheckStatus: z.enum(["ok", "error"]).nullable(), lastCheckError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const providerListSchema = z.object({ items: z.array(providerSchema) });
const modelEntrySchema = z.object({ id: z.string(), label: z.string() });
export const providerModelsSchema = z.object({ chat: z.array(modelEntrySchema), embedding: z.array(modelEntrySchema) });
const availableModelSchema = z.object({ providerId: z.uuid(), providerKind: z.enum(aiProviderKind.enumValues), model: z.string(), label: z.string() });
export const availableModelsSchema = z.object({
  chat: z.array(availableModelSchema), embedding: z.array(availableModelSchema),
  defaults: z.object({ chat: z.string().nullable(), embedding: z.string().nullable() }),
});
const modelReference = z.string().max(240).refine((value) => parseModelReference(value) !== null, "Expected providerId:model");
export const defaultsInputSchema = z.object({ chat: modelReference.optional(), embedding: modelReference.optional() });
export const noProviderErrorSchema = z.object({
  statusCode: z.literal(409), error: z.string(), message: z.string(), code: z.enum(["NO_CHAT_PROVIDER", "NO_EMBEDDING_PROVIDER"]),
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type AiProvider = z.infer<typeof providerSchema>;
export type DefaultsInput = z.infer<typeof defaultsInputSchema>;
export type AvailableModels = z.infer<typeof availableModelsSchema>;
