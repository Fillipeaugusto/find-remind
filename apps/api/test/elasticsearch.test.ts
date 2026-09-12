import { randomUUID } from "node:crypto";
import { Client } from "@elastic/elasticsearch";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ensureIndex, remindersIndexName } from "../src/search/index.js";
import { createTestApp } from "./helpers.js";

describe("Elasticsearch plugin and index bootstrap", () => {
  let app: App;
  let index: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    index = `${remindersIndexName("test")}-${randomUUID()}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) await app.es.indices.delete({ index }, { ignore: [404] });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("exposes a working client and bootstraps the test index", async () => {
    expect(await app.es.ping()).toBe(true);
    expect(await app.es.indices.exists({ index: remindersIndexName("test") })).toBe(true);
  });

  it.each(["development", "test", "production"] as const)("prefixes the index for %s", (environment) => {
    expect(remindersIndexName(environment)).toBe(`${environment}-reminders`);
  });

  it("creates the index with the required mapping and language multi-fields", async () => {
    expect(await app.es.indices.exists({ index })).toBe(false);
    await ensureIndex(app.es, index);
    const result = await app.es.indices.getMapping({ index });

    expect(result[index]?.mappings.properties).toEqual({
      title: {
        type: "text",
        analyzer: "portuguese",
        fields: {
          keyword: { type: "keyword" },
          english: { type: "text", analyzer: "english" },
        },
      },
      content: {
        type: "text",
        analyzer: "portuguese",
        fields: { english: { type: "text", analyzer: "english" } },
      },
      tags: { type: "keyword" },
      remindAt: { type: "date" },
      createdAt: { type: "date" },
      status: { type: "keyword" },
      userId: { type: "keyword" },
    });
  });

  it("preserves an existing index and its documents without recreating it", async () => {
    await ensureIndex(app.es, index);
    const before = await app.es.indices.getSettings({ index });
    const uuid = before[index]?.settings?.index?.uuid;
    expect(uuid).toBeTruthy();
    const document = { title: "Comprar livros", userId: "user-1" };
    await app.es.index({ index, id: "reminder-1", document });
    const create = vi.spyOn(app.es.indices, "create");

    await ensureIndex(app.es, index);

    expect(create).not.toHaveBeenCalled();
    const after = await app.es.indices.getSettings({ index });
    expect(after[index]?.settings?.index?.uuid).toBe(uuid);
    expect((await app.es.get({ index, id: "reminder-1" }))._source).toEqual(document);
  });

  it("handles concurrent creation when both instances see an absent index", async () => {
    vi.spyOn(app.es.indices, "exists").mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const create = vi.spyOn(app.es.indices, "create");

    await Promise.all([ensureIndex(app.es, index), ensureIndex(app.es, index)]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(await app.es.indices.exists({ index })).toBe(true);
    const attempts = await Promise.allSettled(create.mock.results.map(({ value }) => value));
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("propagates creation errors other than an existing index", async () => {
    const failure = new Error("creation unavailable");
    vi.spyOn(app.es.indices, "create").mockRejectedValueOnce(failure);

    await expect(ensureIndex(app.es, index)).rejects.toBe(failure);
    expect(await app.es.indices.exists({ index })).toBe(false);
  });

  it("analyzes Portuguese and English text while retaining exact keyword values", async () => {
    await ensureIndex(app.es, index);
    await app.es.index({
      index,
      id: "reminder-1",
      refresh: true,
      document: {
        title: "Comprar livros",
        content: "Running errands",
        tags: ["work"],
        remindAt: "2026-09-12T12:00:00.000Z",
        createdAt: "2026-09-11T12:00:00.000Z",
        status: "scheduled",
        userId: "user-1",
      },
    });

    const portuguese = await app.es.search({ index, query: { match: { title: "livro" } } });
    const english = await app.es.search({ index, query: { match: { "content.english": "run" } } });
    const exact = await app.es.search({ index, query: { term: { "title.keyword": "Comprar livros" } } });

    for (const result of [portuguese, english, exact]) {
      expect(result.hits.hits.map(({ _id }) => _id)).toEqual(["reminder-1"]);
    }
  });

  it("closes the Elasticsearch connection when the app closes", async () => {
    const otherApp = await createTestApp();
    const close = vi.spyOn(otherApp.es, "close");
    await otherApp.close();

    expect(close).toHaveBeenCalledTimes(1);
    await expect(otherApp.es.info()).rejects.toThrow();
  });

  it("closes Elasticsearch and Redis when index bootstrap fails", async () => {
    const close = vi.spyOn(Client.prototype, "close");
    const quit = vi.spyOn(Redis.prototype, "quit");

    await expect(buildApp({
      env: { ...loadEnv(), ELASTICSEARCH_URL: "http://127.0.0.1:1" },
      logger: false,
    })).rejects.toThrow();

    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
