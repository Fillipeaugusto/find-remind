import type { App } from "../../app.js";
import { createAlertsRepository, type AlertWithReminder } from "./alerts.repository.js";
import type { Alert, AlertPage, ListAlertsQuery } from "./alerts.schemas.js";
import { decodeCursor, encodeCursor } from "./cursor.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toAlert(row: AlertWithReminder): Alert {
  return {
    id: row.id,
    reminderId: row.reminderId,
    reminder: {
      id: row.reminder.id,
      title: row.reminder.title,
      remindAt: row.reminder.remindAt?.toISOString() ?? null,
    },
    firedAt: row.firedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export function createAlertsService(app: App) {
  const repository = createAlertsRepository(app.db);

  return {
    async list(userId: string, query: ListAlertsQuery): Promise<AlertPage> {
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor) throw app.httpErrors.badRequest("Invalid cursor");

      const rows = await repository.list(userId, { limit: query.limit + 1, cursor, unread: query.unread });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toAlert),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    },

    // Reading is idempotent: an alert already read keeps its original readAt.
    async markRead(userId: string, id: string): Promise<Alert> {
      const row = UUID_PATTERN.test(id) ? await repository.markRead(userId, id, new Date()) : undefined;
      if (!row) throw app.httpErrors.notFound("Alert not found");
      return toAlert(row);
    },

    async markAllRead(userId: string): Promise<void> {
      await repository.markAllRead(userId, new Date());
    },
  };
}

export type AlertsService = ReturnType<typeof createAlertsService>;
