import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./recurrence.js";
import type { Recurrence } from "./reminders.schemas.js";

const at = (iso: string) => new Date(iso);
const schedule = (remindAt: string, recurrence: Recurrence | null = null) => ({ remindAt: at(remindAt), recurrence });
const next = (s: ReturnType<typeof schedule>, after: string, tz = "UTC") =>
  nextOccurrence(s, at(after), tz)?.toISOString() ?? null;

describe("nextOccurrence", () => {
  it("returns null without a date", () => {
    expect(nextOccurrence({ remindAt: null, recurrence: null }, at("2026-01-01T00:00:00Z"), "UTC")).toBeNull();
  });

  describe("without recurrence", () => {
    it("returns the date itself while it is still ahead, then null", () => {
      const s = schedule("2026-09-15T13:00:00.000Z");

      expect(next(s, "2026-09-15T12:59:59.999Z")).toBe("2026-09-15T13:00:00.000Z");
      expect(next(s, "2026-09-15T13:00:00.000Z")).toBeNull();
    });
  });

  describe("daily", () => {
    const s = schedule("2026-03-07T14:00:00.000Z", { freq: "daily", interval: 1 });

    it("keeps the wall-clock time across a DST change", () => {
      // 09:00 in New York: EST (UTC-5) on Mar 7, EDT (UTC-4) from Mar 8 2026.
      expect(next(s, "2026-03-07T14:00:00.000Z", "America/New_York")).toBe("2026-03-08T13:00:00.000Z");
      expect(next(s, "2026-03-08T13:00:00.000Z", "America/New_York")).toBe("2026-03-09T13:00:00.000Z");
    });

    it("keeps the instant when the zone has no DST", () => {
      expect(next(s, "2026-03-07T14:00:00.000Z", "America/Sao_Paulo")).toBe("2026-03-08T14:00:00.000Z");
    });

    it("jumps straight to the first occurrence after a distant instant", () => {
      expect(next(s, "2027-01-01T00:00:00.000Z")).toBe("2027-01-01T14:00:00.000Z");
      expect(next(s, "2027-01-01T14:00:00.000Z")).toBe("2027-01-02T14:00:00.000Z");
    });

    it("honours the interval counted from the anchor", () => {
      const every3 = schedule("2026-01-01T08:00:00.000Z", { freq: "daily", interval: 3 });

      expect(next(every3, "2026-01-01T08:00:00.000Z")).toBe("2026-01-04T08:00:00.000Z");
      expect(next(every3, "2026-01-05T00:00:00.000Z")).toBe("2026-01-07T08:00:00.000Z");
    });

    it("returns the anchor itself when asked for occurrences before it", () => {
      expect(next(s, "2020-01-01T00:00:00.000Z")).toBe("2026-03-07T14:00:00.000Z");
    });
  });

  describe("weekly", () => {
    it("repeats on the anchor weekday", () => {
      const s = schedule("2026-09-09T12:00:00.000Z", { freq: "weekly", interval: 1 }); // Wednesday

      expect(next(s, "2026-09-09T12:00:00.000Z")).toBe("2026-09-16T12:00:00.000Z");
    });

    it("fires on each listed weekday of every n-th week", () => {
      const s = schedule("2026-09-09T12:00:00.000Z", { freq: "weekly", interval: 2, byWeekday: [3, 1] });

      expect(next(s, "2026-09-09T11:59:59.999Z")).toBe("2026-09-09T12:00:00.000Z");
      expect(next(s, "2026-09-09T12:00:00.000Z")).toBe("2026-09-21T12:00:00.000Z");
      expect(next(s, "2026-09-21T12:00:00.000Z")).toBe("2026-09-23T12:00:00.000Z");
      expect(next(s, "2026-09-23T12:00:00.000Z")).toBe("2026-10-05T12:00:00.000Z");
    });

    it("skips listed weekdays that fall before the anchor in its own week", () => {
      const s = schedule("2026-09-09T12:00:00.000Z", { freq: "weekly", interval: 1, byWeekday: [1, 5] });

      expect(next(s, "2026-09-01T00:00:00.000Z")).toBe("2026-09-11T12:00:00.000Z");
    });

    it("evaluates weekdays in the user's time zone", () => {
      // 23:00 on Wednesday in São Paulo is 02:00 Thursday UTC.
      const s = schedule("2026-09-10T02:00:00.000Z", { freq: "weekly", interval: 1, byWeekday: [3] });

      expect(next(s, "2026-09-10T02:00:00.000Z", "America/Sao_Paulo")).toBe("2026-09-17T02:00:00.000Z");
    });
  });

  describe("monthly", () => {
    const s = schedule("2026-01-31T12:00:00.000Z", { freq: "monthly", interval: 1 });

    it("clamps to the end of shorter months without drifting", () => {
      expect(next(s, "2026-01-31T12:00:00.000Z")).toBe("2026-02-28T12:00:00.000Z");
      expect(next(s, "2026-02-28T12:00:00.000Z")).toBe("2026-03-31T12:00:00.000Z");
      expect(next(s, "2026-04-01T00:00:00.000Z")).toBe("2026-04-30T12:00:00.000Z");
    });

    it("honours the interval", () => {
      const quarterly = schedule("2026-01-15T09:00:00.000Z", { freq: "monthly", interval: 3 });

      expect(next(quarterly, "2026-01-15T09:00:00.000Z")).toBe("2026-04-15T09:00:00.000Z");
      expect(next(quarterly, "2026-06-01T00:00:00.000Z")).toBe("2026-07-15T09:00:00.000Z");
    });
  });

  describe("yearly", () => {
    it("clamps Feb 29 to Feb 28 in common years", () => {
      const s = schedule("2028-02-29T10:00:00.000Z", { freq: "yearly", interval: 1 });

      expect(next(s, "2028-02-29T10:00:00.000Z")).toBe("2029-02-28T10:00:00.000Z");
      expect(next(s, "2031-12-31T00:00:00.000Z")).toBe("2032-02-29T10:00:00.000Z");
    });
  });

  describe("until", () => {
    it("allows an occurrence exactly at until and none after it", () => {
      const s = schedule("2026-01-01T08:00:00.000Z", { freq: "daily", interval: 1, until: "2026-01-03T08:00:00.000Z" });

      expect(next(s, "2026-01-02T08:00:00.000Z")).toBe("2026-01-03T08:00:00.000Z");
      expect(next(s, "2026-01-03T08:00:00.000Z")).toBeNull();
    });

    it("ignores a null until", () => {
      const s = schedule("2026-01-01T08:00:00.000Z", { freq: "daily", interval: 1, until: null });

      expect(next(s, "2026-01-01T08:00:00.000Z")).toBe("2026-01-02T08:00:00.000Z");
    });
  });
});
