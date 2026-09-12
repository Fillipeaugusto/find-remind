import { alert, eq } from "@findremind/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../src/app.js";
import { SSE_PING_INTERVAL_MS } from "../src/modules/alerts/alerts.routes.js";
import type { Alert } from "../src/modules/alerts/alerts.schemas.js";
import { signUpAndLogin, type TestSession } from "./auth.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";
import { clearQueues } from "./queues.js";

const REMIND_AT = "2030-01-15T12:00:00.000Z";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("alerts routes", () => {
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
      await clearQueues(app);
      await truncateAll(app.db);
      await app.close();
    }
  });

  async function createReminder(payload: Record<string, unknown> = {}, cookie = session.cookie) {
    const res = await app.inject({
      method: "POST",
      url: "/reminders",
      headers: { cookie },
      payload: { title: "Pagar aluguel", kind: "reminder", remindAt: REMIND_AT, ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // Alerts are normally written by the scheduler; tests insert them directly.
  async function fire(reminder: { id: string }, userId: string, firedAt: string, readAt: string | null = null) {
    const [row] = await app.db
      .insert(alert)
      .values({ reminderId: reminder.id, userId, firedAt: new Date(firedAt), readAt: readAt ? new Date(readAt) : null })
      .returning();
    return row!;
  }

  function get(url: string, cookie = session.cookie) {
    return app.inject({ method: "GET", url, headers: { cookie } });
  }

  describe("authentication", () => {
    it.each([
      ["GET", "/alerts"],
      ["POST", `/alerts/${MISSING_ID}/read`],
      ["POST", "/alerts/read-all"],
      ["GET", "/alerts/stream"],
    ] as const)("%s %s responds 401 without a session", async (method, url) => {
      const res = await app.inject({ method, url });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /alerts", () => {
    it("lists alerts newest first with their reminder", async () => {
      const rent = await createReminder({ title: "Pagar aluguel" });
      const dentist = await createReminder({ title: "Dentista", remindAt: "2030-01-20T15:00:00.000Z" });
      const first = await fire(rent, session.user.id, "2030-01-15T12:00:00.000Z");
      const second = await fire(dentist, session.user.id, "2030-01-20T15:00:00.000Z", "2030-01-20T16:00:00.000Z");

      const res = await get("/alerts");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        items: [
          {
            id: second.id,
            reminderId: dentist.id,
            reminder: { id: dentist.id, title: "Dentista", remindAt: "2030-01-20T15:00:00.000Z" },
            firedAt: "2030-01-20T15:00:00.000Z",
            readAt: "2030-01-20T16:00:00.000Z",
          },
          {
            id: first.id,
            reminderId: rent.id,
            reminder: { id: rent.id, title: "Pagar aluguel", remindAt: REMIND_AT },
            firedAt: REMIND_AT,
            readAt: null,
          },
        ],
        nextCursor: null,
      });
    });

    it("filters unread alerts", async () => {
      const reminder = await createReminder();
      const unread = await fire(reminder, session.user.id, "2030-01-15T12:00:00.000Z");
      await fire(reminder, session.user.id, "2030-01-16T12:00:00.000Z", "2030-01-16T13:00:00.000Z");

      const res = await get("/alerts?unread=true");

      expect(res.json().items.map((a: Alert) => a.id)).toEqual([unread.id]);
      expect((await get("/alerts?unread=false")).json().items).toHaveLength(2);
      expect((await get("/alerts?unread=maybe")).statusCode).toBe(400);
    });

    it("paginates with a cursor", async () => {
      const reminder = await createReminder();
      const ids: string[] = [];
      for (let day = 1; day <= 5; day++) {
        ids.push((await fire(reminder, session.user.id, `2030-01-0${day}T12:00:00.000Z`)).id);
      }
      const expected = [...ids].reverse();

      const first = await get("/alerts?limit=2");
      expect(first.json().items.map((a: Alert) => a.id)).toEqual(expected.slice(0, 2));
      expect(first.json().nextCursor).toEqual(expect.any(String));

      const second = await get(`/alerts?limit=2&cursor=${first.json().nextCursor}`);
      expect(second.json().items.map((a: Alert) => a.id)).toEqual(expected.slice(2, 4));

      const third = await get(`/alerts?limit=2&cursor=${second.json().nextCursor}`);
      expect(third.json().items.map((a: Alert) => a.id)).toEqual(expected.slice(4));
      expect(third.json().nextCursor).toBeNull();

      expect((await get("/alerts?cursor=nope")).statusCode).toBe(400);
    });

    it("only lists the user's alerts and hides deleted reminders", async () => {
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      const mine = await createReminder();
      const deleted = await createReminder({ title: "apagado" });
      const theirs = await createReminder({}, other.cookie);
      const kept = await fire(mine, session.user.id, "2030-01-15T12:00:00.000Z");
      await fire(deleted, session.user.id, "2030-01-16T12:00:00.000Z");
      await fire(theirs, other.user.id, "2030-01-17T12:00:00.000Z");
      await app.inject({ method: "DELETE", url: `/reminders/${deleted.id}`, headers: { cookie: session.cookie } });

      expect((await get("/alerts")).json().items.map((a: Alert) => a.id)).toEqual([kept.id]);
    });
  });

  describe("POST /alerts/:id/read", () => {
    it("marks the alert as read and keeps the first readAt", async () => {
      const reminder = await createReminder();
      const fired = await fire(reminder, session.user.id, REMIND_AT);

      const res = await app.inject({ method: "POST", url: `/alerts/${fired.id}/read`, headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: fired.id, reminder: { id: reminder.id }, readAt: expect.any(String) });
      const readAt = res.json().readAt;
      expect(Date.now() - new Date(readAt).getTime()).toBeLessThan(5_000);

      const again = await app.inject({ method: "POST", url: `/alerts/${fired.id}/read`, headers: { cookie: session.cookie } });
      expect(again.json().readAt).toBe(readAt);
    });

    it("responds 404 for unknown, malformed or other users' alerts", async () => {
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      const theirs = await fire(await createReminder({}, other.cookie), other.user.id, REMIND_AT);

      for (const id of [MISSING_ID, "not-a-uuid", theirs.id]) {
        const res = await app.inject({ method: "POST", url: `/alerts/${id}/read`, headers: { cookie: session.cookie } });
        expect(res.statusCode).toBe(404);
      }
      expect((await app.db.select().from(alert).where(eq(alert.id, theirs.id)))[0]?.readAt).toBeNull();
    });
  });

  describe("POST /alerts/read-all", () => {
    it("marks every unread alert of the user as read", async () => {
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      const reminder = await createReminder();
      await fire(reminder, session.user.id, "2030-01-15T12:00:00.000Z");
      await fire(reminder, session.user.id, "2030-01-16T12:00:00.000Z");
      const earlier = await fire(reminder, session.user.id, "2030-01-17T12:00:00.000Z", "2030-01-17T13:00:00.000Z");
      const theirs = await fire(await createReminder({}, other.cookie), other.user.id, REMIND_AT);

      const res = await app.inject({ method: "POST", url: "/alerts/read-all", headers: { cookie: session.cookie } });

      expect(res.statusCode).toBe(204);
      const mine = (await get("/alerts")).json().items as Alert[];
      expect(mine.every((a) => a.readAt !== null)).toBe(true);
      expect(mine.find((a) => a.id === earlier.id)?.readAt).toBe("2030-01-17T13:00:00.000Z");
      expect((await get("/alerts", other.cookie)).json().items).toEqual([expect.objectContaining({ id: theirs.id, readAt: null })]);
    });
  });

  describe("GET /alerts/stream", () => {
    const streams: { close(): void }[] = [];

    afterEach(async () => {
      for (const stream of streams.splice(0)) stream.close();
      vi.useRealTimers();
      await vi.waitFor(() => expect(app.alertBus.subscriberCount(session.user.id)).toBe(0));
    });

    async function openStream(cookie = session.cookie) {
      const res = await app.inject({ method: "GET", url: "/alerts/stream", headers: { cookie }, payloadAsStream: true });
      const chunks: string[] = [];
      let ended = false;
      const stream = res.stream();
      stream.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
      stream.on("end", () => { ended = true; });
      const handle = {
        res,
        received: () => chunks.join(""),
        ended: () => ended,
        close: () => res.raw.res.req.destroy(),
      };
      streams.push(handle);
      return handle;
    }

    function sampleAlert(reminderId: string): Alert {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        reminderId,
        reminder: { id: reminderId, title: "Pagar aluguel", remindAt: REMIND_AT },
        firedAt: REMIND_AT,
        readAt: null,
      };
    }

    it("streams the user's alerts as server-sent events", async () => {
      const other = await signUpAndLogin(app, { email: "bia@example.com" });
      const stream = await openStream();

      expect(stream.res.statusCode).toBe(200);
      expect(stream.res.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
      expect(stream.res.headers["cache-control"]).toBe("no-cache, no-transform");
      expect(stream.res.headers["access-control-allow-origin"]).toBeUndefined();
      await vi.waitFor(() => expect(stream.received()).toContain(": connected\n\n"));
      await vi.waitFor(() => expect(app.alertBus.subscriberCount(session.user.id)).toBe(1));

      const mine = sampleAlert("22222222-2222-4222-8222-222222222222");
      await app.alertBus.publish(other.user.id, sampleAlert("33333333-3333-4333-8333-333333333333"));
      await app.alertBus.publish(session.user.id, mine);

      await vi.waitFor(() => expect(stream.received()).toContain(`event: alert\ndata: ${JSON.stringify(mine)}\n\n`));
      expect(stream.received()).not.toContain("33333333-3333-4333-8333-333333333333");
    });

    it("keeps cors headers on the hijacked response", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/alerts/stream",
        headers: { cookie: session.cookie, origin: app.env.WEB_URL },
        payloadAsStream: true,
      });
      streams.push({ close: () => res.raw.res.req.destroy() });

      expect(res.headers["access-control-allow-origin"]).toBe(app.env.WEB_URL);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("pings every 25 seconds", async () => {
      // `vi.waitFor` advances fake timers on every check, so this test polls by hand.
      const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const stream = await openStream();
      await settle();
      expect(stream.received()).toContain(": connected");

      vi.advanceTimersByTime(SSE_PING_INTERVAL_MS - 1);
      await settle();
      expect(stream.received()).not.toContain("event: ping");

      vi.advanceTimersByTime(1);
      await settle();
      expect(stream.received()).toMatch(/event: ping\ndata: \{"at":"[^"]+"\}\n\n$/);
      expect(SSE_PING_INTERVAL_MS).toBe(25_000);
    });

    it("ends open streams when the app shuts down", async () => {
      const other = await createTestApp();
      const stream = await openStream();
      const res = await other.inject({ method: "GET", url: "/alerts/stream", headers: { cookie: session.cookie }, payloadAsStream: true });
      let ended = false;
      res.stream().on("end", () => { ended = true; }).resume();
      await vi.waitFor(() => expect(other.alertBus.subscriberCount(session.user.id)).toBe(1));

      await other.close();

      expect(ended).toBe(true);
      // Streams of other instances are unaffected.
      expect(stream.ended()).toBe(false);
      expect(app.alertBus.subscriberCount(session.user.id)).toBe(1);
    });

    it("shares one subscription per user and releases it when the last client leaves", async () => {
      const first = await openStream();
      const second = await openStream();
      await vi.waitFor(() => expect(app.alertBus.subscriberCount(session.user.id)).toBe(2));

      first.close();
      await vi.waitFor(() => expect(first.ended()).toBe(true));
      await vi.waitFor(() => expect(app.alertBus.subscriberCount(session.user.id)).toBe(1));

      const late = sampleAlert("22222222-2222-4222-8222-222222222222");
      await app.alertBus.publish(session.user.id, late);
      await vi.waitFor(() => expect(second.received()).toContain(late.id));
      expect(first.received()).not.toContain(late.id);

      second.close();
      await vi.waitFor(() => expect(app.alertBus.subscriberCount(session.user.id)).toBe(0));
    });
  });
});
