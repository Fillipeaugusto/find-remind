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
import { healthRoutes } from "./modules/health/health.routes.js";
import dbPlugin from "./plugins/db.js";

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

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: [env.WEB_URL], credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(dbPlugin);

  await app.register(swagger, {
    openapi: {
      info: { title: "FindRemind API", version: "0.0.0" },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(healthRoutes);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}
