import { describe, expect, it } from "vitest";
import type { Reminder } from "@/lib/types";
import { toFormValues, toReminderInput } from "./reminder-form";

const base: Reminder = {
  id: "r1",
  title: "Dentista",
  content: "Levar exames",
  kind: "reminder",
  remindAt: "2026-09-15T13:00:00.000Z",
  recurrence: { freq: "weekly", interval: 2, byWeekday: [1, 4], until: new Date(2026, 11, 31, 23, 59, 59).toISOString() },
  status: "scheduled",
  snoozedUntil: null,
  tags: ["saude"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("reminder form mapping", () => {
  it("round-trips a recurring reminder", () => {
    const input = toReminderInput(toFormValues(base));
    expect(input.title).toBe("Dentista");
    expect(input.kind).toBe("reminder");
    expect(input.remindAt).toBe(base.remindAt);
    expect(input.recurrence).toMatchObject({ freq: "weekly", interval: 2, byWeekday: [1, 4] });
    const until = new Date(input.recurrence!.until!);
    expect([until.getFullYear(), until.getMonth(), until.getDate(), until.getHours()]).toEqual([2026, 11, 31, 23]);
    expect(input.tags).toEqual(["saude"]);
  });

  it("drops schedule and recurrence for notes", () => {
    const input = toReminderInput({ ...toFormValues(base), kind: "note" });
    expect(input.remindAt).toBeNull();
    expect(input.recurrence).toBeNull();
  });

  it("sends null content when empty", () => {
    const input = toReminderInput({ ...toFormValues(base), content: "   " });
    expect(input.content).toBeNull();
  });

  it("omits byWeekday outside weekly recurrences", () => {
    const input = toReminderInput({ ...toFormValues(base), freq: "daily", byWeekday: [1] });
    expect(input.recurrence).toEqual({ freq: "daily", interval: 2, until: input.recurrence?.until });
    expect(input.recurrence).not.toHaveProperty("byWeekday");
  });
});
