import { aiProvider, aiUserSettings, user } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { createModelResolver } from "../src/ai/resolve.js";
import { providerFixture } from "./ai-fixtures.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("model resolution", () => {
  let app: App;
  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await truncateAll(app.db);
    await app.db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com" });
  });
  afterAll(async () => { if (app) { await truncateAll(app.db); await app.close(); } });

  it("resolves user defaults and explicit overrides", async () => {
    const row = providerFixture();
    await app.db.insert(aiProvider).values(row);
    await app.db.insert(aiUserSettings).values({ userId: "owner", defaultChat: `${row.id}:default-chat`, defaultEmbedding: `${row.id}:default-embedding` });
    const resolve = createModelResolver(app);
    expect(await resolve("owner", undefined, "chat")).toMatchObject({ modelId: "default-chat" });
    expect(await resolve("owner", undefined, "embedding")).toMatchObject({ modelId: "default-embedding" });
    expect(await resolve("owner", `${row.id}:override`, "chat")).toMatchObject({ modelId: "override" });
  });

  it("preserves colons in Ollama model names", async () => {
    const row = providerFixture({ kind: "ollama", apiKeyEncrypted: null });
    await app.db.insert(aiProvider).values(row);
    expect(await createModelResolver(app)("owner", `${row.id}:llama3.2:latest`, "chat")).toMatchObject({ modelId: "llama3.2:latest" });
  });

  it("isolates providers by user", async () => {
    const row = providerFixture();
    await app.db.insert(aiProvider).values(row);
    await expect(createModelResolver(app)("other", `${row.id}:model`, "chat")).rejects.toMatchObject({ statusCode: 409, code: "NO_CHAT_PROVIDER" });
  });

  it.each([undefined, "invalid", "11111111-1111-4111-8111-111111111111:"])("reports absent or invalid selections %s", async (reference) => {
    await expect(createModelResolver(app)("owner", reference, "embedding")).rejects.toMatchObject({ statusCode: 409, code: "NO_EMBEDDING_PROVIDER" });
  });

  it.each([{ enabled: false }, { lastCheckStatus: null }, { lastCheckStatus: "error" }] as const)("rejects unavailable providers %j", async (patch) => {
    const row = providerFixture(patch);
    await app.db.insert(aiProvider).values(row);
    await expect(createModelResolver(app)("owner", `${row.id}:model`, "chat")).rejects.toMatchObject({ code: "NO_CHAT_PROVIDER" });
  });

  it("rejects Anthropic for embeddings", async () => {
    const row = providerFixture({ kind: "anthropic" });
    await app.db.insert(aiProvider).values(row);
    await expect(createModelResolver(app)("owner", `${row.id}:model`, "embedding")).rejects.toMatchObject({ code: "NO_EMBEDDING_PROVIDER" });
  });
});
