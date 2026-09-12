import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createAlertBus, type AlertBus } from "../alerts/bus.js";

const alertBusPlugin: FastifyPluginAsync = async (app) => {
  const bus = createAlertBus(app.redis, (err) => app.log.error({ err }, "Alert bus error"));
  await bus.start();

  app.decorate("alertBus", bus);
  app.addHook("onClose", async () => {
    await bus.close();
  });
};

export default fp(alertBusPlugin, {
  name: "alert-bus",
  fastify: "5.x",
  dependencies: ["redis"],
});

declare module "fastify" {
  interface FastifyInstance {
    alertBus: AlertBus;
  }
}
