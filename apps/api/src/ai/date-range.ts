import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, addWeeks, addYears, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";

export interface DateRange { from: string; to: string; label: string }
export class DateExpressionError extends Error {
  constructor(message = "Unsupported date expression") { super(message); this.name = "DateExpressionError"; }
}

// Inclusive UTC bounds of complete calendar periods in the user's time zone.
export function resolveDateRange(expression: string, now: Date, tz: string): DateRange {
  if (!Number.isFinite(now.getTime())) throw new DateExpressionError("Invalid reference date");
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: tz }); }
  catch { throw new DateExpressionError("Invalid time zone"); }
  const value = expression.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/[-\s]+/g, " ");
  const today = startOfDay(new TZDate(now, tz));
  function range(start: Date, end: Date): DateRange {
    return { from: new Date(start.getTime()).toISOString(), to: new Date(end.getTime() - 1).toISOString(), label: expression.trim() };
  }
  function day(offset: number) { const start = addDays(today, offset); return range(start, addDays(start, 1)); }
  const dayOffsets: Record<string, number> = { hoje: 0, ontem: -1, anteontem: -2, amanha: 1, "depois de amanha": 2 };
  if (Object.hasOwn(dayOffsets, value)) return day(dayOffsets[value]!);

  const weeks: Record<string, number> = { "esta semana": 0, "essa semana": 0, "semana atual": 0, "semana passada": -1, "ultima semana": -1, "semana que vem": 1, "proxima semana": 1 };
  if (Object.hasOwn(weeks, value)) {
    const start = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weeks[value]!);
    return range(start, addWeeks(start, 1));
  }
  const months: Record<string, number> = { "este mes": 0, "esse mes": 0, "mes atual": 0, "mes passado": -1, "mes anterior": -1, "mes que vem": 1, "proximo mes": 1 };
  if (Object.hasOwn(months, value)) {
    const start = addMonths(startOfMonth(today), months[value]!);
    return range(start, addMonths(start, 1));
  }
  const years: Record<string, number> = { "este ano": 0, "ano atual": 0, "ano passado": -1, "ano que vem": 1, "proximo ano": 1 };
  if (Object.hasOwn(years, value)) {
    const start = addYears(startOfYear(today), years[value]!);
    return range(start, addYears(start, 1));
  }

  const weekdays = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const weekday = /^(?:(ultima|ultimo|proxima|proximo) )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?: feira)?(?: (passada|passado|que vem))?$/.exec(value);
  if (weekday && (weekday[1] || weekday[3])) {
    const future = weekday[1]?.startsWith("proxim") || weekday[3] === "que vem";
    const target = weekdays.indexOf(weekday[2]!);
    const difference = future ? (target - today.getDay() + 7) % 7 || 7 : -((today.getDay() - target + 7) % 7 || 7);
    return day(difference);
  }

  const numberedDay = /^dia (\d{1,2})$/.exec(value);
  if (numberedDay) {
    const number = Number(numberedDay[1]);
    const start = new TZDate(today.getFullYear(), today.getMonth(), number, tz);
    if (number < 1 || number > 31 || start.getMonth() !== today.getMonth()) throw new DateExpressionError("Day does not exist in the current month");
    return range(start, addDays(start, 1));
  }
  throw new DateExpressionError();
}
