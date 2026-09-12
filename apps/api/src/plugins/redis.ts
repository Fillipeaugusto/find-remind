import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { createCache, type Cache } from "../cache.js";

const redisPlugin: FastifyPluginAsync = async (app) => {
  const redis = new Redis(app.env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", (err) => app.log.error({ err }, "Redis connection error"));

  try {
    await redis.connect();
  } catch (error) {
    redis.disconnect();
    throw error;
  }

  app.decorate("redis", redis);
  app.decorate("cache", createCache(redis));
  app.addHook("onClose", async () => {
    if (redis.status === "end") return;
    try {
      await redis.quit();
    } finally {
      redis.disconnect();
    }
  });
};

export default fp(redisPlugin, {
  name: "redis",
  fastify: "5.x",
  decorators: { fastify: ["env"] },
});

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
    cache: Cache;
  }
}
