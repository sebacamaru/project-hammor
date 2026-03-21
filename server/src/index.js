import { createServerConfig } from "./config/ServerConfig.js";
import { GameServer } from "./game/GameServer.js";

const config = createServerConfig();
const server = new GameServer(config);
server.start();

let isShuttingDown = false;

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
