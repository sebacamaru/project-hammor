import Fastify from "fastify";
import { registerMapRoutes } from "./routes/maps.js";
import { registerTilesetRoutes } from "./routes/tilesets.js";

const PORT = 3032;

// Only allow local dev origins to call this server directly from the editor.
function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

const fastify = Fastify({
  logger: true,
});

// Handles the tiny amount of CORS/preflight behavior needed for local editor requests.
fastify.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
  }

  reply.header("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

// Keeps backend errors in a consistent json shape for the editor UI/logs.
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.code(error.statusCode ?? 500).send({
    ok: false,
    error: error.message ?? "Internal server error",
  });
});

await registerMapRoutes(fastify);
await registerTilesetRoutes(fastify);

await fastify.listen({
  host: "127.0.0.1",
  port: PORT,
});

fastify.log.info(`editor-server listening on http://localhost:${PORT}`);
