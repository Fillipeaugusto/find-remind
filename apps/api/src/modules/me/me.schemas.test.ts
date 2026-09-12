import { describe, expect, it } from "vitest";
import { isSupportedTimezone, updateProfileSchema } from "./me.schemas.js";

describe("me schemas", () => {
  it("accepts IANA time zones and UTC", () => {
    expect(isSupportedTimezone("UTC")).toBe(true);
    expect(isSupportedTimezone("America/Sao_Paulo")).toBe(true);
    expect(isSupportedTimezone("Europe/Lisbon")).toBe(true);
  });

  it("rejects unknown or non-canonical time zones", () => {
    expect(isSupportedTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isSupportedTimezone("america/sao_paulo")).toBe(false);
    expect(isSupportedTimezone("")).toBe(false);
  });

  it("trims the name and allows partial updates", () => {
    expect(updateProfileSchema.parse({ name: "  Ana  " })).toEqual({ name: "Ana" });
    expect(updateProfileSchema.parse({})).toEqual({});
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});
