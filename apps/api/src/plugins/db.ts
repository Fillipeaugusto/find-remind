import { createDb, type Database } from "@findremind/db";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const dbPlugin: FastifyPluginAsync = async (app) => {
  const db = createDb(app.env.DATABASE_URL);

  app.decorate("db", db);
  app.addHook("onClose", async () => {
    await db.$client.end();
  });
};

export default fp(dbPlugin, {
  name: "db",
  fastify: "5.x",
  decorators: { fastify: ["env"] },
});

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}
