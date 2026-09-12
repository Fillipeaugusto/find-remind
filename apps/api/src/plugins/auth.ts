import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createAuth, type Auth } from "../auth/auth.js";

export const AUTH_BASE_PATH = "/api/auth";

export type SessionData = Auth["$Infer"]["Session"];
export type SessionUser = SessionData["user"];
export type Session = SessionData["session"];

// Paths that never resolve a session: Better Auth handles its own routes and
// health probes must not touch the database.
const PUBLIC_PREFIXES = [`${AUTH_BASE_PATH}/`, "/health", "/docs"];

function isPublicPath(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, `${request.protocol}://${request.host}`);
  const headers = fromNodeHeaders(request.headers);
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined;
  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
  });
}

async function sendWebResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  return reply.send(response.body ? await response.text() : null);
}

const authPlugin: FastifyPluginAsync = async (app) => {
  const auth = createAuth({ db: app.db, env: app.env });
  app.decorate("auth", auth);
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);

  app.addHook("onRequest", async (request) => {
    if (isPublicPath(request.url) || request.headers.cookie === undefined) return;

    const data = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (data) {
      request.user = data.user;
      request.session = data.session;
    }
  });

  app.decorate("requireAuth", async (request: FastifyRequest) => {
    if (!request.user) throw app.httpErrors.unauthorized("Authentication required");
  });

  app.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    schema: { hide: true },
    handler: async (request, reply) => {
      const response = await auth.handler(toWebRequest(request));
      return sendWebResponse(reply, response);
    },
  });
};

export default fp(authPlugin, {
  name: "auth",
  fastify: "5.x",
  dependencies: ["db"],
});

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth;
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: SessionUser | null;
    session: Session | null;
  }
}
