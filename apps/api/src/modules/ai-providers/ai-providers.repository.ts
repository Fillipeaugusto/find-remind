import { aiProvider, aiUserSettings, and, asc, eq, type Database } from "@findremind/db";

export function createAiProvidersRepository(db: Database) {
  return {
    async findById(userId: string, id: string) {
      const [row] = await db.select().from(aiProvider).where(and(eq(aiProvider.userId, userId), eq(aiProvider.id, id)));
      return row;
    },
    list(userId: string) {
      return db.select().from(aiProvider).where(eq(aiProvider.userId, userId)).orderBy(asc(aiProvider.createdAt), asc(aiProvider.id));
    },
    async getSettings(userId: string) {
      const [row] = await db.select().from(aiUserSettings).where(eq(aiUserSettings.userId, userId));
      return { chat: row?.defaultChat ?? null, embedding: row?.defaultEmbedding ?? null };
    },
  };
}
