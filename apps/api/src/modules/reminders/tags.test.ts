import { describe, expect, it } from "vitest";
import { normalizeTags } from "./tags.js";

describe("normalizeTags", () => {
  it("lowercases, trims, dedupes and sorts", () => {
    expect(normalizeTags([" Trabalho", "casa", "TRABALHO", "casa ", "  "])).toEqual(["casa", "trabalho"]);
  });

  it("returns an empty list for no tags", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});
