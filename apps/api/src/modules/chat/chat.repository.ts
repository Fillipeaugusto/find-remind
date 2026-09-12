import { and, asc, conversation, desc, eq, inArray, lt, max, message, or, type Database, type SQL } from "@findremind/db";

export type ConversationRow = typeof conversation.$inferSelect;
export type MessageRow = typeof message.$inferSelect;

// Keyset position matching the list ordering (`updatedAt desc, id desc`).
export interface ConversationCursor {
  updatedAt: Date;
  id: string;
}

export interface ListOptions {
  limit: number;
  cursor?: ConversationCursor;
}

export interface NewMessage {
  id: string;
  role: MessageRow["role"];
  parts: unknown[];
}

function afterCursor({ updatedAt, id }: ConversationCursor): SQL {
  return or(lt(conversation.updatedAt, updatedAt), and(eq(conversation.updatedAt, updatedAt), lt(conversation.id, id)))!;
}

export function createChatRepository(db: Database) {
  return {
    async list(userId: string, { limit, cursor }: ListOptions): Promise<ConversationRow[]> {
      const conditions: SQL[] = [eq(conversation.userId, userId)];
      if (cursor) conditions.push(afterCursor(cursor));
      return db
        .select()
        .from(conversation)
        .where(and(...conditions))
        .orderBy(desc(conversation.updatedAt), desc(conversation.id))
        .limit(limit);
    },

    async findById(userId: string, id: string): Promise<ConversationRow | undefined> {
      const [row] = await db
        .select()
        .from(conversation)
        .where(and(eq(conversation.userId, userId), eq(conversation.id, id)))
        .limit(1);
      return row;
    },

    async create(values: { userId: string; model: string }): Promise<ConversationRow> {
      const [row] = await db.insert(conversation).values(values).returning();
      return row!;
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(conversation)
        .where(and(eq(conversation.userId, userId), eq(conversation.id, id)))
        .returning({ id: conversation.id });
      return rows.length > 0;
    },

    async listMessages(conversationId: string): Promise<MessageRow[]> {
      return db
        .select()
        .from(message)
        .where(eq(message.conversationId, conversationId))
        .orderBy(asc(message.position));
    },

    // Appends messages after the last stored position and bumps the
    // conversation. A message id already stored keeps its position and only
    // has its parts replaced, so a retried request never duplicates a turn.
    async appendMessages(conversationId: string, messages: NewMessage[], patch: { title?: string } = {}): Promise<void> {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ position: max(message.position) })
          .from(message)
          .where(eq(message.conversationId, conversationId));
        const stored = await tx
          .select({ id: message.id })
          .from(message)
          .where(and(eq(message.conversationId, conversationId), inArray(message.id, messages.map((entry) => entry.id))));
        const existing = new Set(stored.map((row) => row.id));
        let position = (current?.position ?? -1) + 1;
        const now = new Date();
        for (const entry of messages) {
          if (existing.has(entry.id)) {
            await tx
              .update(message)
              .set({ role: entry.role, parts: entry.parts })
              .where(and(eq(message.conversationId, conversationId), eq(message.id, entry.id)));
          } else {
            await tx
              .insert(message)
              .values({ conversationId, id: entry.id, role: entry.role, parts: entry.parts, position: position++, createdAt: now });
          }
        }
        await tx
          .update(conversation)
          .set({ updatedAt: now, ...(patch.title === undefined ? {} : { title: patch.title }) })
          .where(eq(conversation.id, conversationId));
      });
    },
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
