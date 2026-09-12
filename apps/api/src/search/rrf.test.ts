import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf.js";

describe("reciprocal rank fusion", () => {
  it("adds one-based ranks with k=60 independent of original scores", () => {
    const result = reciprocalRankFusion([[{ id: "a", score: 1000 }, { id: "b", score: 1 }], [{ id: "b", score: 0.9 }, { id: "c", score: 0.1 }]]);
    expect(result.map((hit) => hit.id)).toEqual(["b", "a", "c"]);
    expect(result[0]?.score).toBeCloseTo(1 / 62 + 1 / 61);
  });
  it("preserves highlights and counts each item once per list", () => {
    expect(reciprocalRankFusion([[{ id: "a", score: 4, highlights: ["<em>a</em>"] }, { id: "a", score: 3 }], [{ id: "a", score: 1 }]])).toEqual([{ id: "a", score: 2 / 61, highlights: ["<em>a</em>"] }]);
  });
  it("uses stable id ordering to break ties and accepts empty lists", () => {
    expect(reciprocalRankFusion([[{ id: "b", score: 1 }], [{ id: "a", score: 1 }], []]).map((hit) => hit.id)).toEqual(["a", "b"]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
