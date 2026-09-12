import { errors, type Client, type estypes } from "@elastic/elasticsearch";
import type { Env } from "../config/env.js";

export function remindersIndexName(environment: Env["NODE_ENV"]): string {
  return `${environment}-reminders`;
}

const mappings: estypes.MappingTypeMapping = {
  properties: {
    title: {
      type: "text",
      analyzer: "portuguese",
      fields: {
        keyword: { type: "keyword" },
        english: { type: "text", analyzer: "english" },
      },
    },
    content: {
      type: "text",
      analyzer: "portuguese",
      fields: { english: { type: "text", analyzer: "english" } },
    },
    tags: { type: "keyword" },
    remindAt: { type: "date" },
    createdAt: { type: "date" },
    status: { type: "keyword" },
    userId: { type: "keyword" },
  },
};

export async function ensureIndex(es: Client, index: string): Promise<void> {
  if (await es.indices.exists({ index })) return;

  try {
    await es.indices.create({ index, mappings });
  } catch (error) {
    // Another instance may create the index between the existence check and creation.
    if (
      error instanceof errors.ResponseError &&
      error.body?.error?.type === "resource_already_exists_exception"
    ) return;
    throw error;
  }
}
