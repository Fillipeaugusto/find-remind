import { describe, expect, it } from "vitest";
import { DateExpressionError, resolveDateRange } from "./date-range.js";

const now = new Date("2026-09-16T15:00:00Z");
const tz = "America/Sao_Paulo";
describe("resolveDateRange", () => {
  it.each([
    ["hoje", "2026-09-16", "2026-09-17"],
    ["ontem", "2026-09-15", "2026-09-16"],
    ["anteontem", "2026-09-14", "2026-09-15"],
    ["amanhã", "2026-09-17", "2026-09-18"],
    ["depois de amanhã", "2026-09-18", "2026-09-19"],
    ["esta semana", "2026-09-14", "2026-09-21"],
    ["semana passada", "2026-09-07", "2026-09-14"],
    ["próxima semana", "2026-09-21", "2026-09-28"],
    ["este mês", "2026-09-01", "2026-10-01"],
    ["mês passado", "2026-08-01", "2026-09-01"],
    ["mês que vem", "2026-10-01", "2026-11-01"],
    ["segunda passada", "2026-09-14", "2026-09-15"],
    ["última terça-feira", "2026-09-15", "2026-09-16"],
    ["quarta passada", "2026-09-09", "2026-09-10"],
    ["sexta passada", "2026-09-11", "2026-09-12"],
    ["domingo passado", "2026-09-13", "2026-09-14"],
    ["próxima segunda", "2026-09-21", "2026-09-22"],
    ["dia 15", "2026-09-15", "2026-09-16"],
    ["este ano", "2026-01-01", "2027-01-01"],
    ["ano passado", "2025-01-01", "2026-01-01"],
  ])("resolves %s using complete local calendar periods", (expression, start, end) => {
    expect(resolveDateRange(expression!, now, tz)).toEqual({ from: `${start}T03:00:00.000Z`, to: new Date(Date.parse(`${end}T03:00:00Z`) - 1).toISOString(), label: expression });
  });
  it("normalizes casing, accents, whitespace and hyphens", () => {
    expect(resolveDateRange("  ÚLTIMA  TERÇA-FEIRA  ", now, tz)).toMatchObject({ from: "2026-09-15T03:00:00.000Z" });
  });
  it("uses the user's calendar date when UTC is already the next day", () => {
    expect(resolveDateRange("hoje", new Date("2026-09-16T01:00:00Z"), tz)).toMatchObject({ from: "2026-09-15T03:00:00.000Z", to: "2026-09-16T02:59:59.999Z" });
  });
  it("supports a time zone ahead of UTC", () => {
    expect(resolveDateRange("hoje", now, "Pacific/Kiritimati")).toMatchObject({ from: "2026-09-16T10:00:00.000Z", to: "2026-09-17T09:59:59.999Z" });
  });
  it.each([
    ["2026-03-08T12:00:00Z", "2026-03-08T05:00:00.000Z", "2026-03-09T03:59:59.999Z", 23],
    ["2026-11-01T12:00:00Z", "2026-11-01T04:00:00.000Z", "2026-11-02T04:59:59.999Z", 25],
  ] as const)("preserves DST day bounds on %s", (date, from, to, hours) => {
    const range = resolveDateRange("hoje", new Date(date), "America/New_York");
    expect(range).toMatchObject({ from, to });
    expect(Date.parse(range.to) - Date.parse(range.from) + 1).toBe(hours * 3_600_000);
  });
  it("handles leap days and year transitions", () => {
    expect(resolveDateRange("dia 29", new Date("2024-02-10T12:00:00Z"), "UTC")).toMatchObject({ from: "2024-02-29T00:00:00.000Z", to: "2024-02-29T23:59:59.999Z" });
    expect(resolveDateRange("mês que vem", new Date("2026-12-31T12:00:00Z"), "UTC")).toMatchObject({ from: "2027-01-01T00:00:00.000Z", to: "2027-01-31T23:59:59.999Z" });
  });
  it("never treats today as the previous Monday", () => {
    expect(resolveDateRange("segunda passada", new Date("2026-09-14T12:00:00Z"), tz)).toMatchObject({ from: "2026-09-07T03:00:00.000Z" });
  });
  it.each(["", "em algum momento", "dia 0", "dia 31", "constructor"])("rejects unsupported or invalid expressions %s", (expression) => {
    expect(() => resolveDateRange(expression, now, tz)).toThrow(DateExpressionError);
  });
  it("rejects a non-leap February 29, an invalid date and an invalid zone", () => {
    expect(() => resolveDateRange("dia 29", new Date("2026-02-10T12:00:00Z"), tz)).toThrow(DateExpressionError);
    expect(() => resolveDateRange("hoje", new Date("invalid"), tz)).toThrow(DateExpressionError);
    expect(() => resolveDateRange("hoje", now, "Not/A_Zone")).toThrow(DateExpressionError);
  });
});
