import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const reminderKind = pgEnum("reminder_kind", ["reminder", "note"]);
export const reminderStatus = pgEnum("reminder_status", ["scheduled", "done", "dismissed", "snoozed"]);

export type ReminderKind = (typeof reminderKind.enumValues)[number];
export type ReminderStatus = (typeof reminderStatus.enumValues)[number];

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byWeekday?: number[];
  until?: string | null;
}

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// `remindAt` anchors the series (first occurrence); `nextFireAt` is the
// instant the scheduler will fire next and moves forward on every occurrence.
export const reminder = pgTable(
  "reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    kind: reminderKind("kind").notNull().default("reminder"),
    remindAt: timestamptz("remind_at"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    status: reminderStatus("status").notNull().default("scheduled"),
    snoozedUntil: timestamptz("snoozed_until"),
    nextFireAt: timestamptz("next_fire_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamptz("deleted_at"),
  },
  (table) => [
    index("reminder_user_id_status_idx").on(table.userId, table.status),
    index("reminder_user_id_next_fire_at_idx").on(table.userId, table.nextFireAt),
  ],
);

export const reminderTag = pgTable(
  "reminder_tag",
  {
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminder.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.reminderId, table.tag] })],
);

export const alert = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminder.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firedAt: timestamptz("fired_at").notNull().defaultNow(),
    readAt: timestamptz("read_at"),
  },
  (table) => [
    index("alert_user_id_fired_at_idx").on(table.userId, table.firedAt),
    index("alert_user_id_read_at_idx").on(table.userId, table.readAt),
    // One alert per occurrence, so a scheduler retry never fires twice.
    uniqueIndex("alert_reminder_id_fired_at_idx").on(table.reminderId, table.firedAt),
  ],
);
