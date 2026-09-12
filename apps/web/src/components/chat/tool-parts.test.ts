import { describe, expect, it } from "vitest";
import { extractReminders, extractTags } from "./tool-parts";

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
