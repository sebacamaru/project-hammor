/**
 * Dev-tooling routes for the editor server.
 *
 * GET  /api/dev/status  — returns the current game server process state
 * POST /api/dev/play    — restarts the game server and waits for it to be healthy
 * POST /api/dev/stop    — stops the game server if it is running
 */

import {
  getDevServerStatus,
  restartDevServer,
  stopDevServer,
} from "../lib/dev-server-manager.js";

/**
 * Registers dev routes on the Fastify instance.
 * @param {import("fastify").FastifyInstance} fastify
 */
export async function registerDevRoutes(fastify) {
  fastify.get("/api/dev/status", async () => {
    return { ok: true, ...getDevServerStatus() };
  });

  fastify.post("/api/dev/play", async (request, reply) => {
    try {
      const { status } = await restartDevServer();
      return { ok: true, status };
    } catch (err) {
      reply.code(500);
      return { ok: false, status: getDevServerStatus().status, error: err.message };
    }
  });

  fastify.post("/api/dev/stop", async (request, reply) => {
    try {
      await stopDevServer();
      return { ok: true, ...getDevServerStatus() };
    } catch (err) {
      reply.code(500);
      return { ok: false, error: err.message, ...getDevServerStatus() };
    }
  });
}
