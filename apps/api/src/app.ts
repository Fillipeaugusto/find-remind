import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Env } from "./config/env.js";
import { alertsRoutes } from "./modules/alerts/alerts.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { meRoutes } from "./modules/me/me.routes.js";
import { remindersRoutes } from "./modules/reminders/reminders.routes.js";
import alertBusPlugin from "./plugins/alert-bus.js";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import elasticsearchPlugin from "./plugins/elasticsearch.js";
import queuePlugin from "./plugins/queue.js";
import redisPlugin from "./plugins/redis.js";

export type App = FastifyInstance;

export interface BuildAppOptions {
  env: Env;
  logger?: boolean;
}

export async function buildApp({ env, logger = true }: BuildAppOptions): Promise<App> {
  const app = Fastify({
    logger: logger ? { level: env.LOG_LEVEL } : false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("env", env);

  try {
    await app.register(sensible);
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(cors, { origin: [env.WEB_URL], credentials: true });
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
    await app.register(dbPlugin);
    await app.register(redisPlugin);
    await app.register(elasticsearchPlugin);
    await app.register(queuePlugin);
    await app.register(alertBusPlugin);
    await app.register(authPlugin);

    await app.register(swagger, {
      openapi: {
        info: { title: "FindRemind API", version: "0.0.0" },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });

    await app.register(healthRoutes);
    await app.register(meRoutes);
    await app.register(remindersRoutes);
    await app.register(alertsRoutes);

    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}
