import type { ModelEntry } from "@/lib/types";

/**
 * Junta os modelos que o provedor de fato expõe com a lista sugerida.
 * Sem lista do provedor (cadastro novo, carregando ou erro), usa só as sugestões.
 * Sugeridos ausentes na lista do provedor recebem `suffix` no rótulo — no Ollama,
 * isso sinaliza que o modelo ainda precisa ser baixado.
 */
export function mergeModelOptions(
  listed: ModelEntry[] | undefined,
  suggested: string[],
  suffix?: string,
): ModelEntry[] {
  if (!listed) return suggested.map((id) => ({ id, label: id }));
  const ids = new Set(listed.map((m) => m.id));
  const extras = suggested
    .filter((id) => !ids.has(id))
    .map((id) => ({ id, label: suffix ? `${id} · ${suffix}` : id }));
  return [...listed, ...extras];
}
