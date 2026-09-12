import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor.js";

describe("alerts cursor", () => {
  it("round-trips the sort key", () => {
    const cursor = { firedAt: new Date("2026-09-12T10:00:00.123Z"), id: "0b7d7a0c-3a3b-4b2e-9d0a-8a4b0f7f2e11" };

    const encoded = encodeCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeCursor("not-base64-json")).toBeUndefined();
    expect(decodeCursor(Buffer.from("[1]").toString("base64url"))).toBeUndefined();
    expect(decodeCursor(Buffer.from('["not a date","id"]').toString("base64url"))).toBeUndefined();
    expect(decodeCursor(Buffer.from('[null,"id"]').toString("base64url"))).toBeUndefined();
    expect(decodeCursor(Buffer.from('{"id":"x"}').toString("base64url"))).toBeUndefined();
  });
});
