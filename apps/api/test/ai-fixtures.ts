import type { ProviderRow } from "../src/ai/registry.js";
import { createKeyCipher } from "../src/ai/crypto.js";
import { loadEnv } from "../src/config/env.js";

export function providerFixture(patch: Partial<ProviderRow> = {}): ProviderRow {
  return {
    id: "11111111-1111-4111-8111-111111111111", userId: "owner", kind: "openai", label: "Test provider",
    baseUrl: null, apiKeyEncrypted: createKeyCipher(loadEnv().AI_KEYS_ENCRYPTION_KEY).encrypt("test-provider-key"),
    enabled: true, defaultChatModel: "gpt-4.1-mini", defaultEmbeddingModel: "text-embedding-3-small",
    lastCheckedAt: new Date(), lastCheckStatus: "ok", lastCheckError: null,
    createdAt: new Date(), updatedAt: new Date(), ...patch,
  };
}
