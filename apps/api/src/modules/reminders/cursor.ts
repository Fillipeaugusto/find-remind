import type { ListCursor } from "./reminders.repository.js";

// Opaque, URL-safe cursor carrying the sort key of the last item in a page.
export function encodeCursor({ remindAt, createdAt, id }: ListCursor): string {
  const payload = JSON.stringify([remindAt?.toISOString() ?? null, createdAt.toISOString(), id]);
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(value: string): ListCursor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return undefined;

  const [remindAt, createdAt, id] = parsed as unknown[];
  if ((remindAt !== null && typeof remindAt !== "string") || typeof createdAt !== "string" || typeof id !== "string") {
    return undefined;
  }
  const cursor = {
    remindAt: remindAt === null ? null : new Date(remindAt),
    createdAt: new Date(createdAt),
    id,
  };
  if (Number.isNaN(cursor.createdAt.getTime()) || (cursor.remindAt && Number.isNaN(cursor.remindAt.getTime()))) {
    return undefined;
  }
  return cursor;
}
