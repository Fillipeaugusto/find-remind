import type { ConversationCursor } from "./chat.repository.js";

// Opaque, URL-safe cursor carrying the sort key of the last conversation in a page.
export function encodeCursor({ updatedAt, id }: ConversationCursor): string {
  return Buffer.from(JSON.stringify([updatedAt.toISOString(), id]), "utf8").toString("base64url");
}

export function decodeCursor(value: string): ConversationCursor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;

  const [updatedAt, id] = parsed as unknown[];
  if (typeof updatedAt !== "string" || typeof id !== "string") return undefined;
  const cursor = { updatedAt: new Date(updatedAt), id };
  return Number.isNaN(cursor.updatedAt.getTime()) ? undefined : cursor;
}
