import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  isNull,
  lt,
  lte,
  or,
  reminder,
  reminderTag,
  sql,
  type Database,
  type ReminderStatus,
  type SQL,
} from "@findremind/db";

export type ReminderRow = typeof reminder.$inferSelect;
export type NewReminder = typeof reminder.$inferInsert;
export type ReminderPatch = Partial<Omit<NewReminder, "id" | "userId">>;
export type ReminderWithTags = ReminderRow & { tags: string[] };

export interface ListFilters {
  status?: ReminderStatus;
  tag?: string;
  from?: Date;
  to?: Date;
}

// Keyset position matching the list ordering below.
export interface ListCursor {
  remindAt: Date | null;
  createdAt: Date;
  id: string;
}

export interface ListOptions extends ListFilters {
  limit: number;
  cursor?: ListCursor;
}

export interface TagCount {
  name: string;
  count: number;
}

const tagsColumn = sql<string[]>`coalesce((
  select json_agg(${reminderTag.tag} order by ${reminderTag.tag})
  from ${reminderTag}
  where ${reminderTag.reminderId} = ${reminder.id}
), '[]'::json)`;

function scope(userId: string, id?: string): SQL {
  return and(
    eq(reminder.userId, userId),
    isNull(reminder.deletedAt),
    ...(id === undefined ? [] : [eq(reminder.id, id)]),
  )!;
}

// Ordering is `remindAt asc nulls last, createdAt desc, id desc`; this
// predicate selects rows strictly after the cursor in that ordering.
function afterCursor({ remindAt, createdAt, id }: ListCursor): SQL {
  const olderCreation = or(
    lt(reminder.createdAt, createdAt),
    and(eq(reminder.createdAt, createdAt), lt(reminder.id, id)),
  )!;
  if (remindAt === null) return and(isNull(reminder.remindAt), olderCreation)!;
  return or(
    gt(reminder.remindAt, remindAt),
    isNull(reminder.remindAt),
    and(eq(reminder.remindAt, remindAt), olderCreation),
  )!;
}

export function createRemindersRepository(db: Database) {
  const selection = { ...getTableColumns(reminder), tags: tagsColumn };

  return {
    async list(userId: string, { limit, cursor, status, tag, from, to }: ListOptions): Promise<ReminderWithTags[]> {
      const conditions: SQL[] = [scope(userId)];
      if (status) conditions.push(eq(reminder.status, status));
      if (from) conditions.push(gte(reminder.remindAt, from));
      if (to) conditions.push(lte(reminder.remindAt, to));
      if (tag) {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(reminderTag)
              .where(and(eq(reminderTag.reminderId, reminder.id), eq(reminderTag.tag, tag))),
          ),
        );
      }
      if (cursor) conditions.push(afterCursor(cursor));

      return db
        .select(selection)
        .from(reminder)
        .where(and(...conditions))
        .orderBy(sql`${reminder.remindAt} asc nulls last`, desc(reminder.createdAt), desc(reminder.id))
        .limit(limit);
    },

    async findById(userId: string, id: string): Promise<ReminderWithTags | undefined> {
      const [row] = await db.select(selection).from(reminder).where(scope(userId, id)).limit(1);
      return row;
    },

    async create(values: NewReminder, tags: string[]): Promise<ReminderWithTags> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(reminder).values(values).returning();
        if (tags.length > 0) {
          await tx.insert(reminderTag).values(tags.map((tag) => ({ reminderId: row!.id, tag })));
        }
        return { ...row!, tags };
      });
    },

    async update(
      userId: string,
      id: string,
      patch: ReminderPatch,
      tags?: string[],
    ): Promise<ReminderWithTags | undefined> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(reminder).set(patch).where(scope(userId, id)).returning();
        if (!row) return undefined;

        if (tags) {
          await tx.delete(reminderTag).where(eq(reminderTag.reminderId, id));
          if (tags.length > 0) {
            await tx.insert(reminderTag).values(tags.map((tag) => ({ reminderId: id, tag })));
          }
          return { ...row, tags };
        }

        const current = await tx
          .select({ tag: reminderTag.tag })
          .from(reminderTag)
          .where(eq(reminderTag.reminderId, id))
          .orderBy(asc(reminderTag.tag));
        return { ...row, tags: current.map(({ tag }) => tag) };
      });
    },

    async softDelete(userId: string, id: string): Promise<boolean> {
      const deleted = await db
        .update(reminder)
        .set({ deletedAt: new Date() })
        .where(scope(userId, id))
        .returning({ id: reminder.id });
      return deleted.length > 0;
    },

    async countTags(userId: string): Promise<TagCount[]> {
      return db
        .select({ name: reminderTag.tag, count: count() })
        .from(reminderTag)
        .innerJoin(reminder, eq(reminder.id, reminderTag.reminderId))
        .where(scope(userId))
        .groupBy(reminderTag.tag)
        .orderBy(desc(count()), asc(reminderTag.tag));
    },
  };
}

export type RemindersRepository = ReturnType<typeof createRemindersRepository>;
