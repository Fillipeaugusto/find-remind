import { describe, expect, it } from "vitest";
import { askUserOptions, describeToolError, extractReminders, extractTags } from "./tool-parts";

const reminder = { id: "1", title: "A", tags: [], kind: "reminder", status: "scheduled" };

describe("extractReminders", () => {
  it("accepts a plain array", () => {
    expect(extractReminders([reminder])).toHaveLength(1);
  });

  it("accepts { items } and search items with { reminder }", () => {
    expect(extractReminders({ items: [reminder] })).toHaveLength(1);
    expect(extractReminders({ items: [{ reminder, score: 1 }] })[0].id).toBe("1");
  });

  it("ignores garbage", () => {
    expect(extractReminders(null)).toEqual([]);
    expect(extractReminders({ items: [1, "x", {}] })).toEqual([]);
  });
});

describe("extractTags", () => {
  it("normalizes strings and objects", () => {
    expect(extractTags(["a", { name: "b", count: 3 }])).toEqual([
      { name: "a", count: 0 },
      { name: "b", count: 3 },
    ]);
    expect(extractTags({ items: [{ name: "c" }] })).toEqual([{ name: "c", count: 0 }]);
  });
});

describe("askUserOptions", () => {
  it("accepts strings and objects and drops blanks", () => {
    expect(askUserOptions({ options: ["9h", { label: "12h", description: "almoço" }, " ", { label: "" }] })).toEqual([
      { label: "9h" },
      { label: "12h", description: "almoço" },
    ]);
    expect(askUserOptions({ options: null })).toEqual([]);
    expect(askUserOptions(undefined)).toEqual([]);
  });
});

describe("describeToolError", () => {
  it("translates known backend messages and keeps the rest", () => {
    expect(describeToolError("Reminder not found")).toBe("lembrete não encontrado");
    expect(describeToolError("Something else")).toBe("Something else");
    expect(describeToolError(undefined)).toBe("falha inesperada");
  });
});
