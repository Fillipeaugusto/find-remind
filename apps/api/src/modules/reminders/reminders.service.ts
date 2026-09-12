import type { App } from "../../app.js";
import type { SessionUser } from "../../plugins/auth.js";
import { createSearchSync } from "../../search/sync.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { nextOccurrence } from "./recurrence.js";
import {
  createRemindersRepository,
  type NewReminder,
  type ReminderPatch,
  type ReminderWithTags,
} from "./reminders.repository.js";
import type {
  CreateReminderInput,
  ListRemindersQuery,
  Reminder,
  ReminderPage,
  SnoozeReminderInput,
  TagsResponse,
  UpdateReminderInput,
} from "./reminders.schemas.js";
import { normalizeTags } from "./tags.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Schedule = Pick<NewReminder, "kind" | "remindAt" | "recurrence">;

// The authenticated user; the time zone drives recurrence calculations.
export interface Actor {
  id: string;
  timezone: string;
}

// Better Auth types the optional `timezone` field loosely; the column defaults to UTC.
export function toActor(user: SessionUser): Actor {
  return { id: user.id, timezone: user.timezone ?? "UTC" };
}

const FIRED = { status: "scheduled", snoozedUntil: null } as const;

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function toReminder(row: ReminderWithTags): Reminder {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    kind: row.kind,
    remindAt: iso(row.remindAt),
    recurrence: row.recurrence ?? null,
    status: row.status,
    snoozedUntil: iso(row.snoozedUntil),
    nextFireAt: iso(row.nextFireAt),
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createRemindersService(app: App) {
  const repository = createRemindersRepository(app.db);
  const search = createSearchSync(app);

  // Notes never fire. A reminder first fires at `remindAt` (or on the first
  // listed weekday from there), even when it is already in the past: the
  // scheduler then raises the alert immediately.
  function initialFireAt({ kind, remindAt, recurrence }: Schedule, timezone: string): Date | null {
    if (kind !== "reminder" || !remindAt) return null;
    const justBefore = new Date(remindAt.getTime() - 1);
    return nextOccurrence({ remindAt, recurrence: recurrence ?? null }, justBefore, timezone);
  }

  function assertValidSchedule(schedule: Schedule, timezone: string): void {
    const { kind, remindAt, recurrence } = schedule;
    if (kind === "reminder" && !remindAt) {
      throw app.httpErrors.badRequest("remindAt is required when kind is reminder");
    }
    if (recurrence && kind !== "reminder") {
      throw app.httpErrors.badRequest("Only reminders can have a recurrence");
    }
    if (recurrence && initialFireAt(schedule, timezone) === null) {
      throw app.httpErrors.badRequest("recurrence.until ends before the first occurrence");
    }
  }

  async function getOrThrow(userId: string, id: string): Promise<ReminderWithTags> {
    const row = UUID_PATTERN.test(id) ? await repository.findById(userId, id) : undefined;
    if (!row) throw app.httpErrors.notFound("Reminder not found");
    return row;
  }

  async function applyState(
    user: Actor,
    id: string,
    state: Pick<ReminderPatch, "status" | "snoozedUntil" | "nextFireAt">,
  ): Promise<Reminder> {
    const row = await repository.update(user.id, id, { ...state, updatedAt: new Date() });
    if (!row) throw app.httpErrors.notFound("Reminder not found");
    await search.reminderChanged(row.id, user.id);
    return toReminder(row);
  }

  return {
    async list(user: Actor, query: ListRemindersQuery): Promise<ReminderPage> {
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) throw app.httpErrors.badRequest("Invalid cursor");

      const rows = await repository.list(user.id, {
        limit: query.limit + 1,
        cursor,
        status: query.status,
        tag: query.tag,
        from: query.from === undefined ? undefined : new Date(query.from),
        to: query.to === undefined ? undefined : new Date(query.to),
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toReminder),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    },

    async get(user: Actor, id: string): Promise<Reminder> {
      return toReminder(await getOrThrow(user.id, id));
    },

    async create(user: Actor, input: CreateReminderInput): Promise<Reminder> {
      const remindAt = input.remindAt === null ? null : new Date(input.remindAt);
      const schedule: Schedule = { kind: input.kind, remindAt, recurrence: input.recurrence };
      assertValidSchedule(schedule, user.timezone);

      const now = new Date();
      const row = await repository.create(
        {
          userId: user.id,
          title: input.title,
          content: input.content,
          ...schedule,
          status: "scheduled",
          nextFireAt: initialFireAt(schedule, user.timezone),
          createdAt: now,
          updatedAt: now,
        },
        normalizeTags(input.tags),
      );
      await search.reminderChanged(row.id, user.id);
      return toReminder(row);
    },

    async update(user: Actor, id: string, input: UpdateReminderInput): Promise<Reminder> {
      const current = await getOrThrow(user.id, id);
      const patch: ReminderPatch = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.content !== undefined) patch.content = input.content;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.remindAt !== undefined) patch.remindAt = input.remindAt === null ? null : new Date(input.remindAt);
      if (input.recurrence !== undefined) patch.recurrence = input.recurrence;

      const scheduleChanged = "kind" in patch || "remindAt" in patch || "recurrence" in patch;
      if (scheduleChanged) {
        const schedule: Schedule = {
          kind: patch.kind ?? current.kind,
          remindAt: "remindAt" in patch ? patch.remindAt : current.remindAt,
          recurrence: "recurrence" in patch ? patch.recurrence : current.recurrence,
        };
        assertValidSchedule(schedule, user.timezone);
        // Changing the schedule restarts the reminder from its new date.
        patch.status = "scheduled";
        patch.snoozedUntil = null;
        patch.nextFireAt = initialFireAt(schedule, user.timezone);
      }

      const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
      if (Object.keys(patch).length === 0 && tags === undefined) return toReminder(current);

      const row = await repository.update(user.id, id, { ...patch, updatedAt: new Date() }, tags);
      if (!row) throw app.httpErrors.notFound("Reminder not found");
      await search.reminderChanged(row.id, user.id);
      return toReminder(row);
    },

    async remove(user: Actor, id: string): Promise<void> {
      const deleted = UUID_PATTERN.test(id) && (await repository.softDelete(user.id, id));
      if (!deleted) throw app.httpErrors.notFound("Reminder not found");
      await search.reminderChanged(id, user.id);
    },

    // Completing a recurring reminder moves it to the next occurrence after
    // now; the series ends (status done) when there is none left.
    async done(user: Actor, id: string): Promise<Reminder> {
      const current = await getOrThrow(user.id, id);
      const next = current.recurrence ? nextOccurrence(current, new Date(), user.timezone) : null;
      return applyState(user, id, next ? { ...FIRED, nextFireAt: next } : { status: "done", snoozedUntil: null, nextFireAt: null });
    },

    async snooze(user: Actor, id: string, input: SnoozeReminderInput): Promise<Reminder> {
      const current = await getOrThrow(user.id, id);
      if (current.kind !== "reminder") throw app.httpErrors.conflict("Notes cannot be snoozed");
      const until = new Date(input.until);
      if (until.getTime() <= Date.now()) throw app.httpErrors.badRequest("until must be in the future");
      return applyState(user, id, { status: "snoozed", snoozedUntil: until, nextFireAt: until });
    },

    async dismiss(user: Actor, id: string): Promise<Reminder> {
      await getOrThrow(user.id, id);
      return applyState(user, id, { status: "dismissed", snoozedUntil: null, nextFireAt: null });
    },

    async listTags(user: Actor): Promise<TagsResponse> {
      return { items: await repository.countTags(user.id) };
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
