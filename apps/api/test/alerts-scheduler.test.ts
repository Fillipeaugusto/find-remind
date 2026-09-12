import { alert, eq, reminder } from "@findremind/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alertChannel } from "../src/alerts/bus.js";
import { SCAN_INTERVAL_MS, scanDueReminders } from "../src/alerts/scheduler.js";
import type { App } from "../src/app.js";
import { ALERTS_QUEUE, SCAN_DUE_REMINDERS_JOB } from "../src/queues/alerts.js";
import { queueDefinitions } from "../src/queues/index.js";
import { SEARCH_QUEUE } from "../src/search/sync.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues, startInlineWorker } from "./queues.js";

const NOW = new Date("2030-03-10T12:00:00.000Z");
const HOUR = 3_600_000;

describe("alert scheduler", () => {
  let app: App;
  let session: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearQueues(app);
    await truncateAll(app.db);
  });

  afterAll(async () => {
    if (app) {
      await clearQueues(app);
      await truncateAll(app.db);
      await app.close();
    }
  });

  async function createReminder(payload: Record<string, unknown>, cookie = session.cookie) {
    const res = await app.inject({
      method: "POST",
      url: "/reminders",
      headers: { cookie },
      payload: { title: "Pagar aluguel", kind: "reminder", ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function findReminder(id: string) {
    const [row] = await app.db.select().from(reminder).where(eq(reminder.id, id));
    return row!;
  }

  async function listAlerts() {
    return app.db.select().from(alert).orderBy(alert.firedAt);
  }

  describe("scanDueReminders", () => {
    // Only the clock is faked: sessions and reminders are created "at" NOW.
    beforeEach(async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      session = await signUpAndLogin(app, { timezone: "America/Sao_Paulo" });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires a due reminder once and leaves it waiting for the user", async () => {
      const remindAt = new Date(NOW.getTime() - HOUR).toISOString();
      const created = await createReminder({ remindAt });
      expect(created.nextFireAt).toBe(remindAt);

      expect(await scanDueReminders(app)).toEqual({ fired: 1 });

      const [fired] = await listAlerts();
      expect(fired).toMatchObject({
        reminderId: created.id,
        userId: session.user.id,
        firedAt: new Date(remindAt),
        readAt: null,
      });
      expect(await findReminder(created.id)).toMatchObject({
        status: "scheduled",
        snoozedUntil: null,
        nextFireAt: null,
        updatedAt: NOW,
      });

      expect(await scanDueReminders(app)).toEqual({ fired: 0 });
      expect(await listAlerts()).toHaveLength(1);
    });

    it("never records two alerts for the same occurrence", async () => {
      const remindAt = new Date(NOW.getTime() - HOUR);
      const created = await createReminder({ remindAt: remindAt.toISOString() });
      await scanDueReminders(app);
      // A retry of a scan that already recorded the alert.
      await app.db.update(reminder).set({ nextFireAt: remindAt }).where(eq(reminder.id, created.id));

      expect(await scanDueReminders(app)).toEqual({ fired: 0 });

      expect(await listAlerts()).toHaveLength(1);
      expect((await findReminder(created.id)).nextFireAt).toBeNull();
    });

    it("advances recurring reminders to the next occurrence after now", async () => {
      // 09:00 in São Paulo, two days ago; the missed day collapses into one alert.
      const remindAt = "2030-03-08T12:00:00.000Z";
      const created = await createReminder({ remindAt, recurrence: { freq: "daily", interval: 1 } });

      expect(await scanDueReminders(app)).toEqual({ fired: 1 });

      const [fired] = await listAlerts();
      expect(fired?.firedAt).toEqual(new Date(remindAt));
      expect(await findReminder(created.id)).toMatchObject({
        status: "scheduled",
        remindAt: new Date(remindAt),
        nextFireAt: new Date("2030-03-11T12:00:00.000Z"),
      });
    });

    it("ends a recurring series that has no occurrence left", async () => {
      const remindAt = "2030-03-09T12:00:00.000Z";
      const created = await createReminder({
        remindAt,
        recurrence: { freq: "daily", interval: 1, until: "2030-03-10T00:00:00.000Z" },
      });

      await scanDueReminders(app);

      expect(await findReminder(created.id)).toMatchObject({ status: "scheduled", nextFireAt: null });
    });

    it("fires snoozed reminders when the snooze ends", async () => {
      const created = await createReminder({ remindAt: new Date(NOW.getTime() - HOUR).toISOString() });
      await scanDueReminders(app);
      const until = new Date(NOW.getTime() + HOUR).toISOString();
      const snoozed = await app.inject({
        method: "POST",
        url: `/reminders/${created.id}/snooze`,
        headers: { cookie: session.cookie },
        payload: { until },
      });
      expect(snoozed.statusCode).toBe(200);

      expect(await scanDueReminders(app)).toEqual({ fired: 0 });
      vi.setSystemTime(new Date(NOW.getTime() + 2 * HOUR));
      expect(await scanDueReminders(app)).toEqual({ fired: 1 });

      const alerts = await listAlerts();
      expect(alerts.map((a) => a.firedAt)).toEqual([new Date(NOW.getTime() - HOUR), new Date(until)]);
      expect(await findReminder(created.id)).toMatchObject({ status: "scheduled", snoozedUntil: null, nextFireAt: null });
    });

    it("ignores notes, finished, deleted and future reminders", async () => {
      const past = new Date(NOW.getTime() - HOUR).toISOString();
      await createReminder({ kind: "note", remindAt: null });
      await createReminder({ remindAt: new Date(NOW.getTime() + HOUR).toISOString() });
      const done = await createReminder({ remindAt: past });
      await app.inject({ method: "POST", url: `/reminders/${done.id}/done`, headers: { cookie: session.cookie } });
      const dismissed = await createReminder({ remindAt: past });
      await app.inject({ method: "POST", url: `/reminders/${dismissed.id}/dismiss`, headers: { cookie: session.cookie } });
      const deleted = await createReminder({ remindAt: past });
      await app.inject({ method: "DELETE", url: `/reminders/${deleted.id}`, headers: { cookie: session.cookie } });

      expect(await scanDueReminders(app)).toEqual({ fired: 0 });
      expect(await listAlerts()).toHaveLength(0);
    });

    it("publishes each alert on the owner's channel and reindexes the reminder", async () => {
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      const remindAt = new Date(NOW.getTime() - HOUR).toISOString();
      const mine = await createReminder({ remindAt, title: "Ligar para o dentista" });
      const theirs = await createReminder({ remindAt }, other.cookie);
      await clearQueues(app);

      const subscriber = app.redis.duplicate();
      const received: { channel: string; message: unknown }[] = [];
      subscriber.on("message", (channel: string, message: string) => received.push({ channel, message: JSON.parse(message) }));
      await subscriber.subscribe(alertChannel(session.user.id), alertChannel(other.user.id));
      try {
        expect(await scanDueReminders(app)).toEqual({ fired: 2 });
        await vi.waitFor(() => expect(received).toHaveLength(2));
      } finally {
        await subscriber.quit();
      }

      const [fired] = await app.db.select().from(alert).where(eq(alert.reminderId, mine.id));
      expect(received).toContainEqual({
        channel: alertChannel(session.user.id),
        message: {
          id: fired!.id,
          reminderId: mine.id,
          reminder: { id: mine.id, title: "Ligar para o dentista", remindAt },
          firedAt: remindAt,
          readAt: null,
        },
      });
      expect(received.map((r) => r.channel)).toContain(alertChannel(other.user.id));

      const jobs = await app.queues[SEARCH_QUEUE]!.getJobs(["waiting", "delayed"]);
      expect(jobs.map((job) => job.data.reminderId).sort()).toEqual([mine.id, theirs.id].sort());
    });
  });

  describe("queue", () => {
    beforeEach(async () => {
      session = await signUpAndLogin(app);
    });

    it("repeats scan-due-reminders every 30 seconds", () => {
      expect(SCAN_INTERVAL_MS).toBe(30_000);
      expect(queueDefinitions[ALERTS_QUEUE]?.schedulers).toEqual([
        { id: SCAN_DUE_REMINDERS_JOB, name: SCAN_DUE_REMINDERS_JOB, every: SCAN_INTERVAL_MS },
      ]);
    });

    it("runs the scan as a queue job", async () => {
      const created = await createReminder({ remindAt: new Date(Date.now() - HOUR).toISOString() });
      const inline = await startInlineWorker(app, ALERTS_QUEUE);
      try {
        const job = await app.queues[ALERTS_QUEUE]!.add(SCAN_DUE_REMINDERS_JOB, {});
        await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), { timeout: 5_000 });

        expect((await app.queues[ALERTS_QUEUE]!.getJob(job.id!))?.returnvalue).toEqual({ fired: 1 });
        expect(await listAlerts()).toMatchObject([{ reminderId: created.id }]);

        const unknown = await app.queues[ALERTS_QUEUE]!.add("unknown", {});
        await vi.waitFor(async () => expect(await unknown.getState()).toBe("failed"), { timeout: 5_000 });
        expect((await app.queues[ALERTS_QUEUE]!.getJob(unknown.id!))?.failedReason).toContain("Unknown alerts job");
      } finally {
        await inline.close();
      }
    });
  });
});
