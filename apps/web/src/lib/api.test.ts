import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, buildQuery, errorMessage, isApiError } from "./api";

describe("buildQuery", () => {
  it("skips empty values and joins arrays", () => {
    expect(buildQuery({ q: "x", tags: ["a", "b"], empty: "", missing: undefined, n: 0 })).toBe("?q=x&tags=a%2Cb&n=0");
  });

  it("returns empty string without params", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
  });
});

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends credentials and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{ ok: boolean }>("/me")).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/me$/);
    expect(init.credentials).toBe("include");
  });

  it("returns undefined on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api("/reminders/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError with message and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 409, error: "Conflict", message: "no provider", code: "NO_EMBEDDING_PROVIDER" }), {
          status: 409,
        }),
      ),
    );
    const error = await api("/search").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isApiError(error, 409, "NO_EMBEDDING_PROVIDER")).toBe(true);
    expect(isApiError(error, 404)).toBe(false);
    expect(errorMessage(error)).toBe("no provider");
  });
});
