import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const chatMessageRole = pgEnum("chat_message_role", ["system", "user", "assistant"]);
export type ChatMessageRole = (typeof chatMessageRole.enumValues)[number];

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// `model` is the "providerId:model" reference chosen when the conversation
// was created; the title is filled in after the first assistant reply.
export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    model: text("model").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("conversation_user_id_updated_at_idx").on(table.userId, table.updatedAt)],
);

// Messages are stored in the AI SDK `UIMessage` shape (`parts` holds text,
// tool calls and tool results). Ids come from the client, so they are only
// unique within a conversation; `position` gives the display order.
export const message = pgTable(
  "message",
  {
    id: text("id").notNull(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    role: chatMessageRole("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    position: integer("position").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.id] }),
    index("message_conversation_id_position_idx").on(table.conversationId, table.position),
  ],
);
