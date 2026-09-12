import { createHash } from "node:crypto";
import type { App } from "../../app.js";
import { generateEmbedding, resolveEmbeddingContext } from "../../search/embedding-context.js";
import { reciprocalRankFusion, type RankedHit } from "../../search/rrf.js";
import { searchCacheKey } from "../../search/sync.js";
import { toReminder } from "../reminders/reminders.service.js";
import { createSearchRepository } from "./search.repository.js";
import type { SearchItem, SearchQuery, SearchResponse } from "./search.schemas.js";

export function createSearchService(app: App) {
  const repository = createSearchRepository(app);
  return {
    async search(userId: string, input: SearchQuery): Promise<SearchResponse> {
      const start = performance.now();
      const context = input.mode === "keyword" ? undefined : await resolveEmbeddingContext(app, userId);
      const params = { q: input.q, mode: input.mode, from: input.from ? new Date(input.from).toISOString() : null, to: input.to ? new Date(input.to).toISOString() : null, status: input.status ?? null, tags: [...input.tags].sort(), limit: input.limit, model: context?.reference ?? null, providerVersion: context?.provider.updatedAt.toISOString() ?? null };
      const key = searchCacheKey(userId, createHash("sha256").update(JSON.stringify(params)).digest("hex"));
      let cached = true;
      const hits = await app.cache.cached<RankedHit[]>(key, 60, async () => {
        cached = false;
        const limit = Math.min(500, Math.max(100, input.limit * 5));
        const keyword = async () => {
          try { return await repository.keyword(userId, input, limit); }
          catch { throw app.httpErrors.badGateway("Keyword search is unavailable"); }
        };
        const semantic = async () => {
          let vector;
          try { vector = await generateEmbedding(context!, input.q); }
          catch { throw app.httpErrors.badGateway("Unable to generate search embedding"); }
          return repository.semantic(userId, input, context!.reference, vector, limit);
        };
        if (input.mode === "keyword") return keyword();
        if (input.mode === "semantic") return semantic();
        return reciprocalRankFusion(await Promise.all([keyword(), semantic()]));
      });
      // Recheck ownership, deletion and filters even on cache hits or stale ES documents.
      const rows = new Map((await repository.hydrate(userId, hits.map((hit) => hit.id), input)).map((row) => [row.id, row]));
      const items: SearchItem[] = hits.flatMap((hit) => {
        const row = rows.get(hit.id);
        return row ? [{ reminder: toReminder(row), score: hit.score, ...(hit.highlights ? { highlights: hit.highlights } : {}) }] : [];
      }).slice(0, input.limit);
      return { items, mode: input.mode, tookMs: Math.max(0, Math.round(performance.now() - start)), cached };
    },
  };
}
