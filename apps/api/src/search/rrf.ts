export interface RankedHit { id: string; score: number; highlights?: string[] }

// Rank starts at one. Original score scales do not affect fusion.
export function reciprocalRankFusion(lists: RankedHit[][], k = 60): RankedHit[] {
  const scores = new Map<string, RankedHit>();
  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const hit of list) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      rank++;
      const previous = scores.get(hit.id);
      scores.set(hit.id, {
        id: hit.id, score: (previous?.score ?? 0) + 1 / (k + rank),
        ...((previous?.highlights ?? hit.highlights) ? { highlights: previous?.highlights ?? hit.highlights } : {}),
      });
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
