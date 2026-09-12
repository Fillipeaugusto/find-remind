import type { ProviderKind } from "@/lib/types";

export type ProviderKindMeta = {
  label: string;
  description: string;
  needsApiKey: boolean;
  /** Mostra o campo de chave mesmo quando ela não é obrigatória. */
  optionalApiKey?: boolean;
  supportsBaseUrl: boolean;
  defaultBaseUrl?: string;
  apiKeyHint?: string;
  /** Modelos sugeridos antes de o provedor ser salvo/testado. */
  suggestedModels: { chat: string[]; embedding: string[] };
  /** Marca curta usada como ícone. */
  mark: string;
};

export const PROVIDER_KINDS: Record<ProviderKind, ProviderKindMeta> = {
  ollama: {
    label: "Ollama",
    description: "Modelos locais ou Ollama Cloud.",
    needsApiKey: false,
    optionalApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
    apiKeyHint: "Só para o Ollama Cloud (https://ollama.com).",
    suggestedModels: {
      chat: ["llama3.2", "qwen3", "gemma3", "mistral"],
      embedding: ["nomic-embed-text", "qwen3-embedding", "mxbai-embed-large", "bge-m3", "embeddinggemma", "all-minilm"],
    },
    mark: "OL",
  },
  openai: {
    label: "OpenAI",
    description: "GPT e embeddings da OpenAI (ou endpoints compatíveis).",
    needsApiKey: true,
    supportsBaseUrl: true,
    apiKeyHint: "Começa com sk-",
    suggestedModels: {
      chat: ["gpt-4.1-mini", "gpt-5-mini", "gpt-5.4"],
      embedding: ["text-embedding-3-small", "text-embedding-3-large"],
    },
    mark: "AI",
  },
  anthropic: {
    label: "Anthropic",
    description: "Modelos Claude (sem embeddings).",
    needsApiKey: true,
    supportsBaseUrl: false,
    apiKeyHint: "Começa com sk-ant-",
    suggestedModels: { chat: ["claude-sonnet-4-6", "claude-haiku-4-5"], embedding: [] },
    mark: "A",
  },
  google: {
    label: "Google",
    description: "Modelos Gemini.",
    needsApiKey: true,
    supportsBaseUrl: false,
    suggestedModels: {
      chat: ["gemini-2.5-flash", "gemini-3.5-flash"],
      embedding: ["gemini-embedding-001", "gemini-embedding-2"],
    },
    mark: "G",
  },
};

export const PROVIDER_KIND_OPTIONS = (Object.keys(PROVIDER_KINDS) as ProviderKind[]).map((kind) => ({
  value: kind,
  label: PROVIDER_KINDS[kind].label,
}));

/** Ollama Cloud responde na API pública do ollama.com e não oferece embeddings. */
export function isOllamaCloud(kind: ProviderKind, baseUrl: string | null | undefined) {
  return kind === "ollama" && /^https?:\/\/([^/]+\.)?ollama\.com(\/|$)/i.test(baseUrl ?? "");
}
