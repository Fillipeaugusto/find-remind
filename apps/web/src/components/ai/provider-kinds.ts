import type { ProviderKind } from "@/lib/types";

export type ProviderKindMeta = {
  label: string;
  description: string;
  needsApiKey: boolean;
  supportsBaseUrl: boolean;
  defaultBaseUrl?: string;
  apiKeyHint?: string;
  /** Marca curta usada como ícone. */
  mark: string;
};

export const PROVIDER_KINDS: Record<ProviderKind, ProviderKindMeta> = {
  ollama: {
    label: "Ollama",
    description: "Modelos locais, sem chave de API.",
    needsApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
    mark: "OL",
  },
  openai: {
    label: "OpenAI",
    description: "GPT e embeddings da OpenAI (ou endpoints compatíveis).",
    needsApiKey: true,
    supportsBaseUrl: true,
    apiKeyHint: "Começa com sk-",
    mark: "AI",
  },
  anthropic: {
    label: "Anthropic",
    description: "Modelos Claude.",
    needsApiKey: true,
    supportsBaseUrl: false,
    apiKeyHint: "Começa com sk-ant-",
    mark: "A",
  },
  google: {
    label: "Google",
    description: "Modelos Gemini.",
    needsApiKey: true,
    supportsBaseUrl: false,
    mark: "G",
  },
};

export const PROVIDER_KIND_OPTIONS = (Object.keys(PROVIDER_KINDS) as ProviderKind[]).map((kind) => ({
  value: kind,
  label: PROVIDER_KINDS[kind].label,
}));
