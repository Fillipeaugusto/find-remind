import { aiProvider, aiUserSettings, and, asc, eq, sql, user, type Database } from "@findremind/db";
import type { ProviderRow } from "../../ai/registry.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ProviderPatch = Partial<Omit<ProviderRow, "id" | "userId" | "createdAt">>;

async function clearDefaults(tx: Transaction, userId: string, id: string) {
  await tx.update(aiUserSettings).set({
    defaultChat: sql`case when ${aiUserSettings.defaultChat} like ${`${id}:%`} then null else ${aiUserSettings.defaultChat} end`,
    defaultEmbedding: sql`case when ${aiUserSettings.defaultEmbedding} like ${`${id}:%`} then null else ${aiUserSettings.defaultEmbedding} end`,
  }).where(eq(aiUserSettings.userId, userId));
}

export function createAiProvidersRepository(db: Database) {
  function write<T>(userId: string, fn: (tx: Transaction) => Promise<T>) {
    return db.transaction(async (tx) => {
      // Serialize provider/default changes for this user without holding locks during network calls.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
      return fn(tx);
    });
  }
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
    async create(values: typeof aiProvider.$inferInsert) {
      const [row] = await db.insert(aiProvider).values(values).returning();
      return row!;
    },
    update(userId: string, id: string, expectedUpdatedAt: Date, patch: ProviderPatch, resetDefaults: boolean) {
      return write(userId, async (tx) => {
        const [row] = await tx.update(aiProvider).set(patch).where(and(
          eq(aiProvider.userId, userId), eq(aiProvider.id, id), eq(aiProvider.updatedAt, expectedUpdatedAt),
        )).returning();
        if (row && resetDefaults) await clearDefaults(tx, userId, id);
        return row;
      });
    },
    delete(userId: string, id: string) {
      return write(userId, async (tx) => {
        const rows = await tx.delete(aiProvider).where(and(eq(aiProvider.userId, userId), eq(aiProvider.id, id))).returning({ id: aiProvider.id });
        if (rows.length) await clearDefaults(tx, userId, id);
        return rows.length > 0;
      });
    },
    setDefaults(userId: string, input: { chat?: string; embedding?: string }, expected: ProviderRow[]) {
      return write(userId, async (tx) => {
        for (const candidate of expected) {
          const [current] = await tx.select().from(aiProvider).where(and(eq(aiProvider.userId, userId), eq(aiProvider.id, candidate.id)));
          if (!current?.enabled || current.lastCheckStatus !== "ok" || current.updatedAt.getTime() !== candidate.updatedAt.getTime()) return false;
        }
        const patch = {
          ...(input.chat !== undefined ? { defaultChat: input.chat } : {}),
          ...(input.embedding !== undefined ? { defaultEmbedding: input.embedding } : {}),
        };
        await tx.insert(aiUserSettings).values({ userId, ...patch }).onConflictDoUpdate({ target: aiUserSettings.userId, set: patch });
        return true;
      });
    },
  };
}
