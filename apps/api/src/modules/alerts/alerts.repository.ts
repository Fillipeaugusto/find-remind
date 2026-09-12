import {
  alert,
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  reminder,
  user,
  type Database,
  type SQL,
} from "@findremind/db";
import type { ReminderRow } from "../reminders/reminders.repository.js";

export type AlertRow = typeof alert.$inferSelect;

export interface AlertReminder {
  id: string;
  title: string;
  remindAt: Date | null;
}

export type AlertWithReminder = AlertRow & { reminder: AlertReminder };

// Keyset position matching the list ordering (`firedAt desc, id desc`).
export interface AlertCursor {
  firedAt: Date;
  id: string;
}

export interface ListOptions {
  limit: number;
  cursor?: AlertCursor;
  unread?: boolean;
}

// A reminder whose `nextFireAt` is due, with the owner's time zone for
// computing the next occurrence.
export type DueReminder = ReminderRow & { timezone: string };

export type FiredState = Pick<ReminderRow, "status" | "snoozedUntil" | "nextFireAt">;

const alertReminder = { id: reminder.id, title: reminder.title, remindAt: reminder.remindAt };

function scope(userId: string, id?: string): SQL {
  return and(
    eq(alert.userId, userId),
    isNull(reminder.deletedAt),
    ...(id === undefined ? [] : [eq(alert.id, id)]),
  )!;
}

function afterCursor({ firedAt, id }: AlertCursor): SQL {
  return or(lt(alert.firedAt, firedAt), and(eq(alert.firedAt, firedAt), lt(alert.id, id)))!;
}

export function createAlertsRepository(db: Database) {
  const selection = { ...getTableColumns(alert), reminder: alertReminder };

  // Alerts of soft-deleted reminders are hidden along with the reminder.
  const scoped = () => db.select(selection).from(alert).innerJoin(reminder, eq(reminder.id, alert.reminderId));

  return {
    async list(userId: string, { limit, cursor, unread }: ListOptions): Promise<AlertWithReminder[]> {
      const conditions: SQL[] = [scope(userId)];
      if (unread) conditions.push(isNull(alert.readAt));
      if (cursor) conditions.push(afterCursor(cursor));

      return scoped()
        .where(and(...conditions))
        .orderBy(desc(alert.firedAt), desc(alert.id))
        .limit(limit);
    },

    async findById(userId: string, id: string): Promise<AlertWithReminder | undefined> {
      const [row] = await scoped().where(scope(userId, id)).limit(1);
      return row;
    },

    async markRead(userId: string, id: string, readAt: Date): Promise<AlertWithReminder | undefined> {
      const current = await this.findById(userId, id);
      if (!current) return undefined;
      if (current.readAt) return current;

      const [row] = await db.update(alert).set({ readAt }).where(eq(alert.id, id)).returning();
      return { ...row!, reminder: current.reminder };
    },

    async markAllRead(userId: string, readAt: Date): Promise<number> {
      const rows = await db
        .update(alert)
        .set({ readAt })
        .where(and(eq(alert.userId, userId), isNull(alert.readAt)))
        .returning({ id: alert.id });
      return rows.length;
    },

    // Claims due reminders with `FOR UPDATE SKIP LOCKED` so concurrent scans
    // never fire the same row twice, records one alert per occurrence (the
    // unique `(reminderId, firedAt)` index absorbs retries) and moves each
    // reminder to the state given by `advance`.
    async fireDue(now: Date, limit: number, advance: (row: DueReminder) => FiredState): Promise<AlertWithReminder[]> {
      return db.transaction(async (tx) => {
        const due = await tx
          .select({ ...getTableColumns(reminder), timezone: user.timezone })
          .from(reminder)
          .innerJoin(user, eq(user.id, reminder.userId))
          .where(
            and(
              isNull(reminder.deletedAt),
              eq(reminder.kind, "reminder"),
              inArray(reminder.status, ["scheduled", "snoozed"]),
              isNotNull(reminder.nextFireAt),
              lte(reminder.nextFireAt, now),
            ),
          )
          .orderBy(asc(reminder.nextFireAt), asc(reminder.id))
          .limit(limit)
          .for("update", { of: reminder, skipLocked: true });

        const fired: AlertWithReminder[] = [];
        for (const row of due) {
          const [created] = await tx
            .insert(alert)
            .values({ reminderId: row.id, userId: row.userId, firedAt: row.nextFireAt! })
            .onConflictDoNothing({ target: [alert.reminderId, alert.firedAt] })
            .returning();
          await tx
            .update(reminder)
            .set({ ...advance(row), updatedAt: now })
            .where(eq(reminder.id, row.id));
          if (created) {
            fired.push({ ...created, reminder: { id: row.id, title: row.title, remindAt: row.remindAt } });
          }
        }
        return fired;
      });
    },
  };
}

export type AlertsRepository = ReturnType<typeof createAlertsRepository>;
