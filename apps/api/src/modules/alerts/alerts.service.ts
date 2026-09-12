import type { Alert } from "./alerts.schemas.js";
import type { AlertWithReminder } from "./alerts.repository.js";

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
