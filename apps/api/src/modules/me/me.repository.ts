import { eq, user, type Database } from "@findremind/db";

export type UserRow = typeof user.$inferSelect;
export type UserPatch = Partial<Pick<UserRow, "name" | "timezone">>;

export function createMeRepository(db: Database) {
  return {
    async findById(id: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
      return row;
    },

    async update(id: string, patch: UserPatch): Promise<UserRow | undefined> {
      const [row] = await db.update(user).set(patch).where(eq(user.id, id)).returning();
      return row;
    },
  };
}

export type MeRepository = ReturnType<typeof createMeRepository>;
