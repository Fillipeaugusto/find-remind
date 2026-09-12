import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  set,
  startOfWeek,
} from "date-fns";
import type { Recurrence } from "./reminders.schemas.js";

export interface RecurringSchedule {
  remindAt: Date | null;
  recurrence: Recurrence | null;
}

// Guards against a rule that never produces a date after `after`.
const MAX_STEPS = 1_000;

type Step = (anchor: TZDate, k: number) => TZDate;

function stepFor(freq: Recurrence["freq"], interval: number): Step {
  switch (freq) {
    case "daily":
      return (anchor, k) => addDays(anchor, k * interval);
    case "weekly":
      return (anchor, k) => addWeeks(anchor, k * interval);
    case "monthly":
      return (anchor, k) => addMonths(anchor, k * interval);
    case "yearly":
      return (anchor, k) => addYears(anchor, k * interval);
  }
}

// Lower bound for the step index whose occurrence may come after `after`.
function firstStep(freq: Recurrence["freq"], interval: number, anchor: TZDate, after: TZDate): number {
  const elapsed = {
    daily: differenceInCalendarDays,
    weekly: differenceInCalendarWeeks,
    monthly: differenceInCalendarMonths,
    yearly: differenceInCalendarYears,
  }[freq](after, anchor);
  return Math.max(0, Math.floor(elapsed / interval));
}

function* simpleOccurrences(anchor: TZDate, after: TZDate, freq: Recurrence["freq"], interval: number) {
  const step = stepFor(freq, interval);
  for (let k = firstStep(freq, interval, anchor, after), i = 0; i < MAX_STEPS; k++, i++) {
    yield step(anchor, k);
  }
}

// Weekly rules with explicit weekdays fire on each listed weekday of every
// N-th week, counting weeks (Sunday to Saturday) from the anchor's week.
function* weekdayOccurrences(anchor: TZDate, after: TZDate, interval: number, byWeekday: number[]) {
  const weekdays = [...new Set(byWeekday)].sort((a, b) => a - b);
  const timeOfDay = {
    hours: anchor.getHours(),
    minutes: anchor.getMinutes(),
    seconds: anchor.getSeconds(),
    milliseconds: anchor.getMilliseconds(),
  };
  const firstWeek = startOfWeek(anchor, { weekStartsOn: 0 });
  const elapsed = differenceInCalendarWeeks(after, firstWeek, { weekStartsOn: 0 });
  let cycle = Math.max(0, Math.floor(elapsed / interval));

  for (let i = 0; i < MAX_STEPS; cycle++, i++) {
    const week = addWeeks(firstWeek, cycle * interval);
    for (const weekday of weekdays) {
      const candidate = set(addDays(week, weekday), timeOfDay);
      if (candidate.getTime() >= anchor.getTime()) yield candidate;
    }
  }
}

// First occurrence of `schedule` strictly after `after`, computed on the
// user's wall clock so times survive DST changes and month-end clamping
// (Jan 31 → Feb 28 → Mar 31) always derives from the anchor date.
// Returns null when the series has no further occurrence.
export function nextOccurrence(schedule: RecurringSchedule, after: Date, timezone: string): Date | null {
  if (!schedule.remindAt) return null;

  const anchor = new TZDate(schedule.remindAt, timezone);
  const rule = schedule.recurrence;
  if (!rule) return anchor.getTime() > after.getTime() ? new Date(anchor.getTime()) : null;

  const until = rule.until ? new Date(rule.until).getTime() : Number.POSITIVE_INFINITY;
  const cutoff = new TZDate(after, timezone);
  const interval = Math.max(1, Math.trunc(rule.interval));
  const occurrences =
    rule.freq === "weekly" && rule.byWeekday && rule.byWeekday.length > 0
      ? weekdayOccurrences(anchor, cutoff, interval, rule.byWeekday)
      : simpleOccurrences(anchor, cutoff, rule.freq, interval);

  for (const candidate of occurrences) {
    if (candidate.getTime() <= after.getTime()) continue;
    return candidate.getTime() <= until ? new Date(candidate.getTime()) : null;
  }
  return null;
}
