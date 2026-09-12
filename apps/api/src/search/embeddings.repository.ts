import { aiProvider, aiUserSettings, and, asc, eq, gt, isNull, reminder, reminderEmbedding, reminderTag, user, type Database } from "@findremind/db";
import type { ReminderWithTags } from "../modules/reminders/reminders.repository.js";
import type { EmbeddingContext } from "./embedding-context.js";

export function embeddingText(row: Pick<ReminderWithTags, "title" | "content" | "tags">): string {
  return [row.title, row.content ?? "", [...row.tags].sort().join(" ")].join("\n");
}

export function createEmbeddingsRepository(db: Database) {
  return {
    async remove(reminderId: string) {
      await db.delete(reminderEmbedding).where(eq(reminderEmbedding.reminderId, reminderId));
    },
    scan(userId: string, afterId: string | undefined, limit: number) {
      return db.select({ id: reminder.id }).from(reminder).where(and(
        eq(reminder.userId, userId), isNull(reminder.deletedAt), afterId ? gt(reminder.id, afterId) : undefined,
      )).orderBy(asc(reminder.id)).limit(limit);
    },
    async save(snapshot: ReminderWithTags, context: EmbeddingContext, embedding: number[]): Promise<boolean> {
      return db.transaction(async (tx) => {
        // Same lock order as provider settings; external calls finish before this transaction.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, snapshot.userId)).for("update");
        const [current] = await tx.select().from(reminder).where(eq(reminder.id, snapshot.id)).for("update");
        if (!current || current.deletedAt || current.updatedAt.getTime() !== snapshot.updatedAt.getTime()) return false;
        const tags = await tx.select({ tag: reminderTag.tag }).from(reminderTag).where(eq(reminderTag.reminderId, snapshot.id));
        if (embeddingText({ ...current, tags: tags.map(({ tag }) => tag) }) !== embeddingText(snapshot)) return false;
        const [settings] = await tx.select().from(aiUserSettings).where(eq(aiUserSettings.userId, snapshot.userId));
        const [provider] = await tx.select().from(aiProvider).where(and(eq(aiProvider.id, context.provider.id), eq(aiProvider.userId, snapshot.userId)));
        if (settings?.defaultEmbedding !== context.reference || !provider?.enabled || provider.lastCheckStatus !== "ok" || provider.updatedAt.getTime() !== context.provider.updatedAt.getTime()) return false;
        const values = { reminderId: snapshot.id, model: context.reference, dims: embedding.length, embedding };
        await tx.insert(reminderEmbedding).values(values).onConflictDoUpdate({ target: reminderEmbedding.reminderId, set: values });
        return true;
      });
    },
  };
}
