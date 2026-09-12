import { Client } from "@elastic/elasticsearch";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ensureIndex, remindersIndexName } from "../search/index.js";

const elasticsearchPlugin: FastifyPluginAsync = async (app) => {
  const es = new Client({
    node: app.env.ELASTICSEARCH_URL,
    requestTimeout: 5_000,
    maxRetries: 1,
  });

  try {
    await ensureIndex(es, remindersIndexName(app.env.NODE_ENV));
  } catch (error) {
    await es.close();
    throw error;
  }

  app.decorate("es", es);
  app.addHook("onClose", async () => {
    await es.close();
  });
};

export default fp(elasticsearchPlugin, {
  name: "elasticsearch",
  fastify: "5.x",
  decorators: { fastify: ["env"] },
});

declare module "fastify" {
  interface FastifyInstance {
    es: Client;
  }
}
