import type { App } from "../../app.js";
import { NoProviderError } from "../../ai/errors.js";
import { createModelResolver } from "../../ai/resolve.js";
import { createAiProvidersRepository } from "../ai-providers/ai-providers.repository.js";
import { createChatRepository, type ConversationRow, type MessageRow } from "./chat.repository.js";
import type {
  Conversation,
  ConversationDetail,
  ConversationPage,
  CreateConversationInput,
  ListConversationsQuery,
  StoredUIMessage,
} from "./chat.schemas.js";
import { decodeCursor, encodeCursor } from "./cursor.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUIMessage(row: MessageRow): StoredUIMessage {
  return { id: row.id, role: row.role, parts: row.parts as StoredUIMessage["parts"] };
}

export function createChatService(app: App) {
  const repository = createChatRepository(app.db);
  const providers = createAiProvidersRepository(app.db);
  const resolveModel = createModelResolver(app);

  async function getOrThrow(userId: string, id: string): Promise<ConversationRow> {
    const row = UUID_PATTERN.test(id) ? await repository.findById(userId, id) : undefined;
    if (!row) throw app.httpErrors.notFound("Conversation not found");
    return row;
  }

  return {
    async list(userId: string, query: ListConversationsQuery): Promise<ConversationPage> {
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) throw app.httpErrors.badRequest("Invalid cursor");

      const rows = await repository.list(userId, { limit: query.limit + 1, cursor });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toConversation),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    },

    // The model is pinned at creation: an explicit reference must be usable
    // now, otherwise the user's default chat model is taken.
    async create(userId: string, input: CreateConversationInput): Promise<Conversation> {
      const reference = input.model ?? (await providers.getSettings(userId)).chat;
      if (!reference) throw new NoProviderError("chat");
      await resolveModel(userId, reference, "chat");
      return toConversation(await repository.create({ userId, model: reference }));
    },

    async get(userId: string, id: string): Promise<ConversationDetail> {
      const row = await getOrThrow(userId, id);
      const messages = await repository.listMessages(row.id);
      return { conversation: toConversation(row), messages: messages.map(toUIMessage) };
    },

    async remove(userId: string, id: string): Promise<void> {
      const deleted = UUID_PATTERN.test(id) && (await repository.delete(userId, id));
      if (!deleted) throw app.httpErrors.notFound("Conversation not found");
    },

    getOrThrow,
  };
}

export type ChatService = ReturnType<typeof createChatService>;
