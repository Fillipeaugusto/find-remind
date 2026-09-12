import type { AlertCursor } from "./alerts.repository.js";

// Opaque, URL-safe cursor carrying the sort key of the last alert in a page.
export function encodeCursor({ firedAt, id }: AlertCursor): string {
  return Buffer.from(JSON.stringify([firedAt.toISOString(), id]), "utf8").toString("base64url");
}

export function decodeCursor(value: string): AlertCursor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;

  const [firedAt, id] = parsed as unknown[];
  if (typeof firedAt !== "string" || typeof id !== "string") return undefined;
  const cursor = { firedAt: new Date(firedAt), id };
  return Number.isNaN(cursor.firedAt.getTime()) ? undefined : cursor;
}
