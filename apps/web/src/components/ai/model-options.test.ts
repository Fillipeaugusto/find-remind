import { describe, expect, it } from "vitest";
import { mergeModelOptions } from "./model-options";

describe("mergeModelOptions", () => {
  it("uses suggestions when the provider list is unavailable", () => {
    expect(mergeModelOptions(undefined, ["a", "b"])).toEqual([
      { id: "a", label: "a" },
      { id: "b", label: "b" },
    ]);
  });

  it("keeps listed models first and appends missing suggestions", () => {
    const listed = [{ id: "b", label: "B" }];
    expect(mergeModelOptions(listed, ["a", "b"])).toEqual([
      { id: "b", label: "B" },
      { id: "a", label: "a" },
    ]);
  });

  it("marks missing suggestions with the suffix", () => {
    expect(mergeModelOptions([], ["nomic-embed-text"], "não instalado")).toEqual([
      { id: "nomic-embed-text", label: "nomic-embed-text · não instalado" },
    ]);
  });
});
