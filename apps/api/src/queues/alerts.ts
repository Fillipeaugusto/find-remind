import { SCAN_INTERVAL_MS, scanDueReminders } from "../alerts/scheduler.js";
import type { QueueDefinition } from "./index.js";

export const ALERTS_QUEUE = "alerts";
export const SCAN_DUE_REMINDERS_JOB = "scan-due-reminders";

// Jobs: `scan-due-reminders` ({}), repeated by the scheduler below.
export const alertsQueue: QueueDefinition = {
  schedulers: [{ id: SCAN_DUE_REMINDERS_JOB, name: SCAN_DUE_REMINDERS_JOB, every: SCAN_INTERVAL_MS }],
  createProcessor(app) {
    return async (job) => {
      switch (job.name) {
        case SCAN_DUE_REMINDERS_JOB:
          return scanDueReminders(app);
        default:
          throw new Error(`Unknown alerts job: ${job.name}`);
      }
    };
  },
};
