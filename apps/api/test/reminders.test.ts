import { eq, reminder, reminderTag } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

const REMIND_AT = "2030-01-15T12:00:00.000Z";

describe("reminders routes", () => {
  let app: App;
  let session: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(app.db);
    session = await signUpAndLogin(app);
  });

  afterAll(async () => {
    if (app) {
      await truncateAll(app.db);
      await app.close();
    }
  });

  async function createReminder(payload: Record<string, unknown>, cookie = session.cookie) {
    const res = await app.inject({
      method: "POST",
      url: "/reminders",
      headers: { cookie },
      payload: { title: "Pagar aluguel", kind: "reminder", remindAt: REMIND_AT, ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  describe("authentication", () => {
    it.each([
      ["GET", "/reminders"],
      ["POST", "/reminders"],
      ["GET", "/reminders/00000000-0000-4000-8000-000000000000"],
      ["PATCH", "/reminders/00000000-0000-4000-8000-000000000000"],
      ["DELETE", "/reminders/00000000-0000-4000-8000-000000000000"],
      ["POST", "/reminders/00000000-0000-4000-8000-000000000000/done"],
      ["POST", "/reminders/00000000-0000-4000-8000-000000000000/snooze"],
      ["POST", "/reminders/00000000-0000-4000-8000-000000000000/dismiss"],
      ["GET", "/tags"],
    ] as const)("%s %s responds 401 without a session", async (method, url) => {
      const payload =
        method === "GET" || method === "DELETE"
          ? undefined
          : url.endsWith("/snooze")
            ? { until: "2030-01-01T00:00:00.000Z" }
            : { title: "x", kind: "note" };
      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /reminders", () => {
    it("creates a reminder with defaults", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/reminders",
        headers: { cookie: session.cookie },
        payload: { title: "  Pagar aluguel ", kind: "reminder", remindAt: REMIND_AT },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        id: expect.any(String),
        title: "Pagar aluguel",
        content: null,
        kind: "reminder",
        remindAt: REMIND_AT,
        recurrence: null,
        status: "scheduled",
        snoozedUntil: null,
        nextFireAt: REMIND_AT,
        tags: [],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const [row] = await app.db.select().from(reminder);
      expect(row).toMatchObject({ userId: session.user.id, deletedAt: null, nextFireAt: new Date(REMIND_AT) });
    });

    it("normalizes tags", async () => {
      const created = await createReminder({ tags: [" Casa", "casa", "TRABALHO "] });

      expect(created.tags).toEqual(["casa", "trabalho"]);
      expect(await app.db.select().from(reminderTag)).toHaveLength(2);
    });

    it("stores content and recurrence", async () => {
      const recurrence = { freq: "weekly", interval: 2, byWeekday: [1, 3], until: null };

      const created = await createReminder({ content: "# Notas\nem markdown", recurrence });

      expect(created).toMatchObject({ content: "# Notas\nem markdown", recurrence });
    });

    it("creates a note without a date and without a next fire time", async () => {
      const created = await createReminder({ kind: "note", remindAt: undefined, title: "Ideia" });

      expect(created).toMatchObject({ kind: "note", remindAt: null, nextFireAt: null, status: "scheduled" });
    });

    it("accepts a remindAt in the past and schedules it to fire right away", async () => {
      const past = "2020-01-01T00:00:00.000Z";

      const created = await createReminder({ remindAt: past });

      expect(created).toMatchObject({ remindAt: past, nextFireAt: past });
    });

    it("starts a weekly reminder on the first listed weekday", async () => {
      // Wed Sep 9 2026 anchored, firing on Fridays: first occurrence is Fri Sep 11.
      const created = await createReminder({
        remindAt: "2026-09-09T12:00:00.000Z",
        recurrence: { freq: "weekly", interval: 1, byWeekday: [5] },
      });

      expect(created.nextFireAt).toBe("2026-09-11T12:00:00.000Z");
    });

    it("rejects a recurrence that ends before its first occurrence", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/reminders",
        headers: { cookie: session.cookie },
        payload: {
          title: "Curto",
          kind: "reminder",
          remindAt: REMIND_AT,
          recurrence: { freq: "daily", interval: 1, until: "2029-12-31T00:00:00.000Z" },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("until");
    });

    it("rejects a reminder without remindAt", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/reminders",
        headers: { cookie: session.cookie },
        payload: { title: "Sem data", kind: "reminder" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("remindAt");
    });

    it("rejects a recurrence on a note", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/reminders",
        headers: { cookie: session.cookie },
        payload: { title: "Nota", kind: "note", recurrence: { freq: "daily", interval: 1 } },
      });

      expect(res.statusCode).toBe(400);
    });

    it.each([
      ["empty title", { title: "  " }],
      ["unknown kind", { kind: "task" }],
      ["invalid date", { remindAt: "amanhã" }],
      ["invalid recurrence", { recurrence: { freq: "hourly", interval: 1 } }],
      ["weekday out of range", { recurrence: { freq: "weekly", interval: 1, byWeekday: [7] } }],
      ["too many tags", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ])("rejects %s with 400", async (_label, payload) => {
      const res = await app.inject({
        method: "POST",
        url: "/reminders",
        headers: { cookie: session.cookie },
        payload: { title: "Ok", kind: "reminder", remindAt: REMIND_AT, ...payload },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /reminders/:id", () => {
    it("returns the reminder", async () => {
      const created = await createReminder({ tags: ["casa"] });

      const res = await app.inject({ method: "GET", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(created);
    });

    it("responds 404 for an unknown or malformed id", async () => {
      for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
        const res = await app.inject({ method: "GET", url: `/reminders/${id}`, headers: { cookie: session.cookie } });
        expect(res.statusCode).toBe(404);
      }
    });

    it("responds 404 for another user's reminder", async () => {
      const created = await createReminder({});
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const res = await app.inject({ method: "GET", url: `/reminders/${created.id}`, headers: { cookie: other.cookie } });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /reminders/:id", () => {
    it("updates fields and tags", async () => {
      const created = await createReminder({ tags: ["casa"] });

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { title: "Pagar condomínio", content: "até dia 10", tags: ["Financeiro", "casa"] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: created.id,
        title: "Pagar condomínio",
        content: "até dia 10",
        remindAt: REMIND_AT,
        tags: ["casa", "financeiro"],
      });
      expect(new Date(res.json().updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
    });

    it("keeps tags when they are not sent and clears them with an empty list", async () => {
      const created = await createReminder({ tags: ["casa"] });

      const kept = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { title: "Outro" },
      });
      expect(kept.json().tags).toEqual(["casa"]);

      const cleared = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { tags: [] },
      });
      expect(cleared.json().tags).toEqual([]);
    });

    it("reschedules when remindAt changes", async () => {
      const created = await createReminder({});
      await app.db.update(reminder).set({ status: "done", nextFireAt: null });
      const later = "2030-02-01T09:00:00.000Z";

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { remindAt: later },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ remindAt: later, nextFireAt: later, status: "scheduled", snoozedUntil: null });
    });

    it("turning a reminder into a note clears the next fire time", async () => {
      const created = await createReminder({});

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { kind: "note" },
      });

      expect(res.json()).toMatchObject({ kind: "note", remindAt: REMIND_AT, nextFireAt: null });
    });

    it("rejects removing the date of a reminder", async () => {
      const created = await createReminder({});

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: { remindAt: null },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns the reminder unchanged with an empty body", async () => {
      const created = await createReminder({});

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: session.cookie },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(created);
    });

    it("responds 404 for another user's reminder", async () => {
      const created = await createReminder({});
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const res = await app.inject({
        method: "PATCH",
        url: `/reminders/${created.id}`,
        headers: { cookie: other.cookie },
        payload: { title: "Invadido" },
      });

      expect(res.statusCode).toBe(404);
      const [row] = await app.db.select().from(reminder);
      expect(row?.title).toBe("Pagar aluguel");
    });
  });

  describe("DELETE /reminders/:id", () => {
    it("soft deletes and hides the reminder", async () => {
      const created = await createReminder({ tags: ["casa"] });

      const res = await app.inject({ method: "DELETE", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      const [row] = await app.db.select().from(reminder);
      expect(row?.deletedAt).toBeInstanceOf(Date);

      const get = await app.inject({ method: "GET", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });
      expect(get.statusCode).toBe(404);
      const list = await app.inject({ method: "GET", url: "/reminders", headers: { cookie: session.cookie } });
      expect(list.json().items).toEqual([]);
      const tags = await app.inject({ method: "GET", url: "/tags", headers: { cookie: session.cookie } });
      expect(tags.json().items).toEqual([]);
    });

    it("responds 404 when deleting twice or another user's reminder", async () => {
      const created = await createReminder({});
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const foreign = await app.inject({ method: "DELETE", url: `/reminders/${created.id}`, headers: { cookie: other.cookie } });
      expect(foreign.statusCode).toBe(404);

      await app.inject({ method: "DELETE", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });
      const again = await app.inject({ method: "DELETE", url: `/reminders/${created.id}`, headers: { cookie: session.cookie } });
      expect(again.statusCode).toBe(404);
    });
  });

  describe("POST /reminders/:id/done", () => {
    it("completes a one-off reminder", async () => {
      const created = await createReminder({});

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/done`, headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: created.id, status: "done", nextFireAt: null, snoozedUntil: null });
      const list = await app.inject({ method: "GET", url: "/reminders?status=done", headers: { cookie: session.cookie } });
      expect(list.json().items).toHaveLength(1);
    });

    it("moves a recurring reminder to the next occurrence in the user's time zone", async () => {
      const tz = await signUpAndLogin(app, { email: "carla@example.com", timezone: "America/Sao_Paulo" });
      const past = "2020-01-01T12:00:00.000Z";
      const created = await createReminder({ remindAt: past, recurrence: { freq: "daily", interval: 1 } }, tz.cookie);
      expect(created.nextFireAt).toBe(past);

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/done`, headers: { cookie: tz.cookie } });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ status: "scheduled", remindAt: past, snoozedUntil: null });
      expect(new Date(body.nextFireAt).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(body.nextFireAt).getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      expect(body.nextFireAt).toMatch(/T12:00:00\.000Z$/);
    });

    it("finishes a recurring reminder that has no occurrence left", async () => {
      const created = await createReminder({
        remindAt: "2020-01-01T12:00:00.000Z",
        recurrence: { freq: "daily", interval: 1, until: "2020-01-05T12:00:00.000Z" },
      });

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/done`, headers: { cookie: session.cookie } });

      expect(res.json()).toMatchObject({ status: "done", nextFireAt: null });
    });

    it("also works for notes and responds 404 for other users", async () => {
      const note = await createReminder({ kind: "note", remindAt: undefined });
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const foreign = await app.inject({ method: "POST", url: `/reminders/${note.id}/done`, headers: { cookie: other.cookie } });
      expect(foreign.statusCode).toBe(404);

      const res = await app.inject({ method: "POST", url: `/reminders/${note.id}/done`, headers: { cookie: session.cookie } });
      expect(res.json()).toMatchObject({ status: "done", nextFireAt: null });
    });
  });

  describe("POST /reminders/:id/snooze", () => {
    it("snoozes until the given instant", async () => {
      const created = await createReminder({});
      const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const res = await app.inject({
        method: "POST",
        url: `/reminders/${created.id}/snooze`,
        headers: { cookie: session.cookie },
        payload: { until },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "snoozed", snoozedUntil: until, nextFireAt: until, remindAt: REMIND_AT });
    });

    it("clears the snooze when completed", async () => {
      const created = await createReminder({});
      const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await app.inject({ method: "POST", url: `/reminders/${created.id}/snooze`, headers: { cookie: session.cookie }, payload: { until } });

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/done`, headers: { cookie: session.cookie } });

      expect(res.json()).toMatchObject({ status: "done", snoozedUntil: null, nextFireAt: null });
    });

    it("rejects an instant in the past or an invalid body", async () => {
      const created = await createReminder({});

      for (const payload of [{ until: "2020-01-01T00:00:00.000Z" }, { until: "logo" }, {}]) {
        const res = await app.inject({
          method: "POST",
          url: `/reminders/${created.id}/snooze`,
          headers: { cookie: session.cookie },
          payload,
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it("refuses to snooze a note", async () => {
      const note = await createReminder({ kind: "note", remindAt: undefined });

      const res = await app.inject({
        method: "POST",
        url: `/reminders/${note.id}/snooze`,
        headers: { cookie: session.cookie },
        payload: { until: new Date(Date.now() + 60_000).toISOString() },
      });

      expect(res.statusCode).toBe(409);
    });

    it("responds 404 for another user's reminder", async () => {
      const created = await createReminder({});
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const res = await app.inject({
        method: "POST",
        url: `/reminders/${created.id}/snooze`,
        headers: { cookie: other.cookie },
        payload: { until: new Date(Date.now() + 60_000).toISOString() },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /reminders/:id/dismiss", () => {
    it("dismisses the reminder and stops it from firing", async () => {
      const created = await createReminder({ recurrence: { freq: "weekly", interval: 1 } });

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/dismiss`, headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "dismissed", nextFireAt: null, snoozedUntil: null });
    });

    it("responds 404 for another user's reminder", async () => {
      const created = await createReminder({});
      const other = await signUpAndLogin(app, { email: "bia@example.com" });

      const res = await app.inject({ method: "POST", url: `/reminders/${created.id}/dismiss`, headers: { cookie: other.cookie } });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /reminders", () => {
    it("orders by remindAt with notes last and newest first among ties", async () => {
      const later = await createReminder({ title: "later", remindAt: "2030-03-01T00:00:00.000Z" });
      const noteOld = await createReminder({ title: "note-old", kind: "note", remindAt: undefined });
      const sooner = await createReminder({ title: "sooner", remindAt: "2030-01-01T00:00:00.000Z" });
      const noteNew = await createReminder({ title: "note-new", kind: "note", remindAt: undefined });

      const res = await app.inject({ method: "GET", url: "/reminders", headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json().nextCursor).toBeNull();
      expect(res.json().items.map((r: { id: string }) => r.id)).toEqual([sooner.id, later.id, noteNew.id, noteOld.id]);
    });

    it("paginates with a cursor without skipping or repeating items", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const remindAt = i < 3 ? `2030-01-0${i + 1}T00:00:00.000Z` : undefined;
        const kind = remindAt ? "reminder" : "note";
        ids.push((await createReminder({ title: `r${i}`, kind, remindAt })).id);
      }
      // Two items share the same remindAt to exercise the createdAt/id tie-break.
      ids.push((await createReminder({ title: "tie", remindAt: "2030-01-02T00:00:00.000Z" })).id);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
        const res = await app.inject({ method: "GET", url: `/reminders${query}`, headers: { cookie: session.cookie } });
        expect(res.statusCode).toBe(200);
        const page: { items: { id: string }[]; nextCursor: string | null } = res.json();
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(6);
      expect(new Set(seen).size).toBe(6);
      expect(seen.sort()).toEqual([...ids].sort());
    });

    it("filters by status, tag and date range", async () => {
      const casa = await createReminder({ title: "casa", tags: ["casa"], remindAt: "2030-01-10T00:00:00.000Z" });
      const trabalho = await createReminder({ title: "trabalho", tags: ["trabalho"], remindAt: "2030-02-10T00:00:00.000Z" });
      await app.db.update(reminder).set({ status: "done" }).where(eq(reminder.id, trabalho.id));
      const cookie = session.cookie;

      const byTag = await app.inject({ method: "GET", url: "/reminders?tag=casa", headers: { cookie } });
      expect(byTag.json().items.map((r: { id: string }) => r.id)).toEqual([casa.id]);

      const byRange = await app.inject({
        method: "GET",
        url: "/reminders?from=2030-02-01T00:00:00.000Z&to=2030-02-28T00:00:00.000Z",
        headers: { cookie },
      });
      expect(byRange.json().items.map((r: { id: string }) => r.id)).toEqual([trabalho.id]);

      const scheduled = await app.inject({ method: "GET", url: "/reminders?status=scheduled", headers: { cookie } });
      expect(scheduled.json().items.map((r: { id: string }) => r.id)).toEqual([casa.id]);
      const done = await app.inject({ method: "GET", url: "/reminders?status=done", headers: { cookie } });
      expect(done.json().items.map((r: { id: string }) => r.id)).toEqual([trabalho.id]);
    });

    it("only lists the current user's reminders", async () => {
      await createReminder({ title: "mine" });
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      await createReminder({ title: "theirs" }, other.cookie);

      const res = await app.inject({ method: "GET", url: "/reminders", headers: { cookie: session.cookie } });

      expect(res.json().items.map((r: { title: string }) => r.title)).toEqual(["mine"]);
    });

    it.each(["?limit=0", "?limit=101", "?status=archived", "?from=ontem", "?cursor=garbage"])(
      "rejects %s with 400",
      async (query) => {
        const res = await app.inject({ method: "GET", url: `/reminders${query}`, headers: { cookie: session.cookie } });

        expect(res.statusCode).toBe(400);
      },
    );
  });

  describe("GET /tags", () => {
    it("counts tags of the current user's active reminders", async () => {
      await createReminder({ tags: ["casa", "financeiro"] });
      await createReminder({ tags: ["casa"] });
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      await createReminder({ tags: ["casa", "viagem"] }, other.cookie);

      const res = await app.inject({ method: "GET", url: "/tags", headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [{ name: "casa", count: 2 }, { name: "financeiro", count: 1 }] });
    });
  });
});
