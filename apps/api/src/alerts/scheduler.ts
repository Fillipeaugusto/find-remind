import type { App } from "../app.js";
import { toAlert } from "../modules/alerts/alerts.service.js";
import { createAlertsRepository, type DueReminder, type FiredState } from "../modules/alerts/alerts.repository.js";
import { nextOccurrence } from "../modules/reminders/recurrence.js";
import { createSearchSync } from "../search/sync.js";

export const SCAN_INTERVAL_MS = 30_000;

const SCAN_BATCH = 100;

export interface ScanResult {
  fired: number;
}

// After firing, a recurring reminder moves to its next occurrence after
// now; any other reminder stays scheduled with no fire time and waits for
// the user to complete, snooze or dismiss it.
export function advanceAfterFiring(row: DueReminder, now: Date): FiredState {
  const next = row.recurrence ? nextOccurrence(row, now, row.timezone) : null;
  return { status: "scheduled", snoozedUntil: null, nextFireAt: next };
}

// Handler of the repeatable `scan-due-reminders` job. Alerts are published
// after each batch commits so a stream never sees an alert that rolls back.
export async function scanDueReminders(app: App, now = new Date()): Promise<ScanResult> {
  const repository = createAlertsRepository(app.db);
  const search = createSearchSync(app);
  let fired = 0;

  for (;;) {
    const alerts = await repository.fireDue(now, SCAN_BATCH, (row) => advanceAfterFiring(row, now));
    for (const row of alerts) {
      await Promise.all([
        app.alertBus.publish(row.userId, toAlert(row)),
        search.reminderChanged(row.reminderId, row.userId),
      ]);
    }
    fired += alerts.length;
    if (alerts.length < SCAN_BATCH) return { fired };
  }
}
