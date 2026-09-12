import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createAuth, type Auth } from "../auth/auth.js";

export const AUTH_BASE_PATH = "/api/auth";

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
  }
}
