import type { App } from "../../app.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
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
  TagsResponse,
  UpdateReminderInput,
} from "./reminders.schemas.js";
import { normalizeTags } from "./tags.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Schedule = Pick<NewReminder, "kind" | "remindAt" | "recurrence">;

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

  function assertValidSchedule({ kind, remindAt, recurrence }: Schedule): void {
    if (kind === "reminder" && !remindAt) {
      throw app.httpErrors.badRequest("remindAt is required when kind is reminder");
    }
    if (recurrence && kind !== "reminder") {
      throw app.httpErrors.badRequest("Only reminders can have a recurrence");
    }
  }

  // Notes never fire. A reminder fires at `remindAt`, even when it is already
  // in the past (the scheduler then raises the alert immediately).
  function initialFireAt({ kind, remindAt }: Schedule): Date | null {
    return kind === "reminder" ? remindAt ?? null : null;
  }

  async function getOrThrow(userId: string, id: string): Promise<ReminderWithTags> {
    const row = UUID_PATTERN.test(id) ? await repository.findById(userId, id) : undefined;
    if (!row) throw app.httpErrors.notFound("Reminder not found");
    return row;
  }

  return {
    async list(userId: string, query: ListRemindersQuery): Promise<ReminderPage> {
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) throw app.httpErrors.badRequest("Invalid cursor");

      const rows = await repository.list(userId, {
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

    async get(userId: string, id: string): Promise<Reminder> {
      return toReminder(await getOrThrow(userId, id));
    },

    async create(userId: string, input: CreateReminderInput): Promise<Reminder> {
      const remindAt = input.remindAt === null ? null : new Date(input.remindAt);
      const schedule: Schedule = { kind: input.kind, remindAt, recurrence: input.recurrence };
      assertValidSchedule(schedule);

      const now = new Date();
      const row = await repository.create(
        {
          userId,
          title: input.title,
          content: input.content,
          ...schedule,
          status: "scheduled",
          nextFireAt: initialFireAt(schedule),
          createdAt: now,
          updatedAt: now,
        },
        normalizeTags(input.tags),
      );
      return toReminder(row);
    },

    async update(userId: string, id: string, input: UpdateReminderInput): Promise<Reminder> {
      const current = await getOrThrow(userId, id);
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
        assertValidSchedule(schedule);
        // Changing the schedule restarts the reminder from its new date.
        patch.status = "scheduled";
        patch.snoozedUntil = null;
        patch.nextFireAt = initialFireAt(schedule);
      }

      const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
      if (Object.keys(patch).length === 0 && tags === undefined) return toReminder(current);

      const row = await repository.update(userId, id, { ...patch, updatedAt: new Date() }, tags);
      if (!row) throw app.httpErrors.notFound("Reminder not found");
      return toReminder(row);
    },

    async remove(userId: string, id: string): Promise<void> {
      const deleted = UUID_PATTERN.test(id) && (await repository.softDelete(userId, id));
      if (!deleted) throw app.httpErrors.notFound("Reminder not found");
    },

    async listTags(userId: string): Promise<TagsResponse> {
      return { items: await repository.countTags(userId) };
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
