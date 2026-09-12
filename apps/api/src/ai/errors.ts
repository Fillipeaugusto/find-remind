export type ModelKind = "chat" | "embedding";

export class NoProviderError extends Error {
  readonly statusCode = 409;
  readonly code: "NO_CHAT_PROVIDER" | "NO_EMBEDDING_PROVIDER";

  constructor(kind: ModelKind) {
    super(`No available ${kind} provider configured`);
    this.name = "NoProviderError";
    this.code = kind === "chat" ? "NO_CHAT_PROVIDER" : "NO_EMBEDDING_PROVIDER";
  }
}

export class ProviderConfigurationError extends Error {}
