// Tags are stored lowercase, trimmed and without duplicates.
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  return [...new Set(normalized)].sort();
}
