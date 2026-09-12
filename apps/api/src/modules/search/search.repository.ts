import type { estypes } from "@elastic/elasticsearch";
import { and, eq, getTableColumns, gte, inArray, isNull, lte, reminder, reminderEmbedding, reminderTag, sql, type SQL } from "@findremind/db";
import type { App } from "../../app.js";
import type { ReminderWithTags } from "../reminders/reminders.repository.js";
import { remindersIndexName } from "../../search/index.js";
import type { RankedHit } from "../../search/rrf.js";
import type { SearchFilters, SearchQuery } from "./search.schemas.js";

function filters(userId: string, input: SearchFilters): SQL[] {
  const conditions = [eq(reminder.userId, userId), isNull(reminder.deletedAt)];
  if (input.status) conditions.push(eq(reminder.status, input.status));
  if (input.from) conditions.push(gte(reminder.remindAt, new Date(input.from)));
  if (input.to) conditions.push(lte(reminder.remindAt, new Date(input.to)));
  for (const tag of input.tags ?? []) conditions.push(sql`exists (select 1 from ${reminderTag} where ${reminderTag.reminderId} = ${reminder.id} and ${reminderTag.tag} = ${tag})`);
  return conditions;
}

export function createSearchRepository(app: App) {
  return {
    async keyword(userId: string, input: SearchQuery, limit: number): Promise<RankedHit[]> {
      const filter: estypes.QueryDslQueryContainer[] = [{ term: { userId } }];
      if (input.status) filter.push({ term: { status: input.status } });
      if (input.from || input.to) filter.push({ range: { remindAt: { gte: input.from, lte: input.to } } });
      for (const tag of input.tags) filter.push({ term: { tags: tag } });
      const result = await app.es.search({
        index: remindersIndexName(app.env.NODE_ENV), size: limit, _source: false,
        query: { bool: { filter, must: [{ multi_match: { query: input.q, fields: ["title^3", "content", "tags", "title.english^3", "content.english"] } }] } },
        highlight: { encoder: "html", fields: { title: {}, content: {}, tags: {} } },
        sort: [{ _score: { order: "desc" } }, { "title.keyword": "asc" }],
      });
      return result.hits.hits.flatMap((hit) => hit._id && /^[0-9a-f-]{36}$/i.test(hit._id) ? [{
        id: hit._id, score: hit._score ?? 0, ...(hit.highlight ? { highlights: Object.values(hit.highlight).flat() } : {}),
      }] : []);
    },
    async semantic(userId: string, input: SearchQuery, model: string, vector: number[], limit: number): Promise<RankedHit[]> {
      const dims = vector.length;
      // Only these constants are interpolated as SQL syntax; all user values are parameters.
      const indexedDims = [768, 1024, 1536].includes(dims) ? sql.raw(String(dims)) : undefined;
      const column = indexedDims ? sql`${reminderEmbedding.embedding}::vector(${indexedDims})` : sql`${reminderEmbedding.embedding}`;
      const distance = sql<number>`${column} <=> ${JSON.stringify(vector)}::vector`;
      return app.db.transaction(async (tx) => {
        await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
        const rows = await tx.select({ id: reminder.id, distance }).from(reminderEmbedding)
          .innerJoin(reminder, eq(reminder.id, reminderEmbedding.reminderId))
          .where(and(...filters(userId, input), eq(reminderEmbedding.model, model), indexedDims ? sql`${reminderEmbedding.dims} = ${indexedDims}` : eq(reminderEmbedding.dims, dims)))
          .orderBy(distance).limit(limit);
        return rows.map((row) => ({ id: row.id, score: Math.max(-1, Math.min(1, 1 - Number(row.distance))) }));
      });
    },
    async hydrate(userId: string, ids: string[], input: SearchFilters): Promise<ReminderWithTags[]> {
      if (!ids.length) return [];
      return app.db.select({
        ...getTableColumns(reminder),
        tags: sql<string[]>`coalesce((select json_agg(${reminderTag.tag} order by ${reminderTag.tag}) from ${reminderTag} where ${reminderTag.reminderId} = ${reminder.id}), '[]'::json)`,
      }).from(reminder).where(and(...filters(userId, input), inArray(reminder.id, ids)));
    },
  };
}
