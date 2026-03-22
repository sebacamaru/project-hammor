/**
 * Server entrypoint.
 * Creates config and GameServer, starts it, and handles graceful shutdown.
 */

import { createServerConfig } from "./config/ServerConfig.js";
import { GameServer } from "./game/GameServer.js";

const config = createServerConfig();
const server = new GameServer(config);
server.start();

let isShuttingDown = false;

/**
 * Graceful shutdown handler. Guards against double invocation.
 * Async-ready for future cleanup (DB, sockets, etc.).
 * @param {string} signal - The signal that triggered shutdown (SIGINT, SIGTERM).
 */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Server] Received ${signal}, shutting down...`);

  try {
    await server.stop();
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
