import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const aiProviderKind = pgEnum("ai_provider_kind", ["ollama", "openai", "anthropic", "google"]);
export const aiCheckStatus = pgEnum("ai_check_status", ["ok", "error"]);
export type ProviderKind = (typeof aiProviderKind.enumValues)[number];

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const aiProvider = pgTable("ai_provider", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: aiProviderKind("kind").notNull(),
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  defaultChatModel: text("default_chat_model"),
  defaultEmbeddingModel: text("default_embedding_model"),
  lastCheckedAt: timestamptz("last_checked_at"),
  lastCheckStatus: aiCheckStatus("last_check_status"),
  lastCheckError: text("last_check_error"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("ai_provider_user_id_enabled_idx").on(table.userId, table.enabled)]);

export const aiUserSettings = pgTable("ai_user_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  defaultChat: text("default_chat"),
  defaultEmbedding: text("default_embedding"),
});
