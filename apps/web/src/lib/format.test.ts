import { describe, expect, it } from "vitest";
import { formatDateTime, formatRecurrence, isoToLocal, localToIso, stripMarkdown } from "./format";

describe("formatRecurrence", () => {
  it("describes simple frequencies", () => {
    expect(formatRecurrence({ freq: "daily", interval: 1 })).toBe("todo dia");
    expect(formatRecurrence({ freq: "monthly", interval: 1 })).toBe("todo mês");
    expect(formatRecurrence({ freq: "yearly", interval: 2 })).toBe("a cada 2 anos");
  });

  it("lists weekdays for weekly recurrences", () => {
    expect(formatRecurrence({ freq: "weekly", interval: 1, byWeekday: [1, 3] })).toBe("toda semana (seg, qua)");
  });

  it("returns empty for null", () => {
    expect(formatRecurrence(null)).toBe("");
  });
});

describe("datetime-local conversion", () => {
  it("round-trips through ISO", () => {
    const local = "2026-09-11T14:30";
    const iso = localToIso(local);
    expect(iso).not.toBeNull();
    expect(isoToLocal(iso)).toBe(local);
  });

  it("returns null for invalid or empty values", () => {
    expect(localToIso("")).toBeNull();
    expect(localToIso("not-a-date")).toBeNull();
    expect(isoToLocal(null)).toBe("");
  });
});

describe("formatDateTime", () => {
  it("uses relative day labels", () => {
    const today = new Date();
    today.setHours(9, 5, 0, 0);
    expect(formatDateTime(today.toISOString())).toBe("hoje, 09:05");
  });
});

describe("stripMarkdown", () => {
  it("removes common syntax and collapses whitespace", () => {
    expect(stripMarkdown("Consulta. **Levar** os _exames_ e `cartão`.")).toBe("Consulta. Levar os exames e cartão.");
    expect(stripMarkdown("- RRF vs. re-ranking\n- pgvector [HNSW](http://x) por dimensão\n## Título")).toBe(
      "RRF vs. re-ranking pgvector HNSW por dimensão Título",
    );
  });
});
