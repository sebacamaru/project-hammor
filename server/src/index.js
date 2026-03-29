/**
 * Server entrypoint.
 * Creates config and GameServer, starts it, and handles graceful shutdown.
 */

import http from "node:http";
import { createServerConfig } from "./config/ServerConfig.js";
import { GameServer } from "./game/GameServer.js";

const config = createServerConfig();
const server = new GameServer(config);
server.start();

// Minimal HTTP health endpoint for editor-server healthcheck polling.
// Runs on a separate port from the WebSocket game server.
const healthServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(config.healthPort, "127.0.0.1", () => {
  console.log(`[Server] Health endpoint: http://127.0.0.1:${config.healthPort}/health`);
});

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
    healthServer.close();
    await server.stop();
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
