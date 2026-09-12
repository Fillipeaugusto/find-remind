import { aiProvider, aiUserSettings, eq, user } from "@findremind/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { createKeyCipher } from "../src/ai/crypto.js";
import { truncateAll } from "./db.js";
import { createTestApp } from "./helpers.js";

describe("AI provider schema", () => {
  let app: App;
  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await truncateAll(app.db); });
  afterAll(async () => { if (app) { await truncateAll(app.db); await app.close(); } });

  it("stores encrypted keys, defaults and timestamps, and cascades user deletion", async () => {
    await app.db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com" });
    const cipher = createKeyCipher(app.env.AI_KEYS_ENCRYPTION_KEY);
    const [provider] = await app.db.insert(aiProvider).values({
      userId: "owner", kind: "openai", label: "My provider", apiKeyEncrypted: cipher.encrypt("sk-secret"),
    }).returning();
    expect(provider).toMatchObject({ enabled: true, lastCheckStatus: null, defaultChatModel: null });
    expect(provider?.createdAt).toBeInstanceOf(Date);
    expect(provider?.apiKeyEncrypted).not.toContain("sk-secret");
    expect(cipher.decrypt(provider!.apiKeyEncrypted!)).toBe("sk-secret");
    await app.db.insert(aiUserSettings).values({ userId: "owner", defaultChat: `${provider!.id}:model` });
    await app.db.delete(user).where(eq(user.id, "owner"));
    expect(await app.db.select().from(aiProvider)).toEqual([]);
    expect(await app.db.select().from(aiUserSettings)).toEqual([]);
  });
});
