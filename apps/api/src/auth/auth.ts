import * as schema from "@findremind/db/schema";
import type { Database } from "@findremind/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../config/env.js";

export interface CreateAuthOptions {
  db: Database;
  env: Pick<Env, "NODE_ENV" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "WEB_URL">;
}

export function createAuth({ db, env }: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL],
    emailAndPassword: { enabled: true },
    logger: { disabled: env.NODE_ENV === "test" },
    user: {
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "UTC", input: true },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
